/**
 * Renderer-side orchestration for the two high-level directory operations:
 * Dry-run incremental / mirror sync and cross-level template placement.
 *
 * Binds the pure planners/executors in `@core/directory` to `PlatformPort`,
 * materialises read-only sample trees into a writable scratch root before any
 * write, and keeps the comparison cache honest after bytes change.
 */
import type { PlatformPort } from '@shared/platform/types'
import { compareDirectories, scanDirectory } from '@core/directory/compare'
import type { ComparisonCache, DirectoryComparison, ScannedTree } from '@core/directory/compare'
import {
  buildSyncPlan,
  copyScannedTree,
  executeSyncPlan,
  invalidateComparisonCache
} from '@core/directory/sync'
import type { SyncDirection, SyncMode, SyncPlan } from '@core/directory/sync'
import { extractTemplateMatches, matchTemplate, matchTemplateSlots } from '@core/directory/template'
import type { TemplateMatchResult } from '@core/directory/template'

const SAMPLE_ROOT = '/samples'

/** True for the read-only built-in sample mount of either runtime. */
export function isReadOnlyRoot(path: string): boolean {
  return path === SAMPLE_ROOT || path.startsWith(`${SAMPLE_ROOT}/`)
}

function basename(path: string): string {
  const normalized = path.replace(/[\\/]+$/, '')
  const separator = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  return separator === -1 ? normalized : normalized.slice(separator + 1)
}

function syncIo(platform: PlatformPort) {
  return {
    readTextFile: (path: string) => platform.readTextFile(path),
    writeTextFile: (path: string, content: string, modifiedMs?: number) =>
      platform.writeTextFile(path, content, modifiedMs),
    ensureDirectory: (path: string) => platform.ensureDirectory(path),
    deleteFile: (path: string) => platform.deleteFile(path)
  }
}

async function scan(platform: PlatformPort, root: string): Promise<ScannedTree> {
  return scanDirectory(root, (path) => platform.listDirectory(path))
}

/** A previewed sync: the plan plus where its writes will actually land. */
export interface SyncPreview {
  readonly plan: SyncPlan
  /** True when the original target tree is read-only and gets materialised. */
  readonly materializeTarget: boolean
  readonly sourceRoot: string
  readonly originalTargetRoot: string
}

/**
 * Builds the change list for one direction. When the target side is the
 * read-only sample mount, the plan targets a fresh writable scratch root; the
 * copy is only materialised on confirm, so cancelling writes nothing.
 */
export async function previewSync(
  platform: PlatformPort,
  comparison: DirectoryComparison,
  direction: SyncDirection,
  mode: SyncMode,
  sequence: number
): Promise<SyncPreview> {
  const leftToRight = direction === 'left-to-right'
  const sourceRoot = leftToRight ? comparison.leftRoot : comparison.rightRoot
  const originalTargetRoot = leftToRight ? comparison.rightRoot : comparison.leftRoot

  const materializeTarget = isReadOnlyRoot(originalTargetRoot)
  let targetRoot = originalTargetRoot
  if (materializeTarget) {
    const temp = await platform.temporaryDirectory()
    targetRoot = `${temp}/workbench/${sequence}-${basename(originalTargetRoot)}`
  }

  return {
    plan: buildSyncPlan(comparison, direction, mode, targetRoot),
    materializeTarget,
    sourceRoot,
    originalTargetRoot
  }
}

function compareRoots(
  platform: PlatformPort,
  leftRoot: string,
  rightRoot: string,
  cache: ComparisonCache
): Promise<DirectoryComparison> {
  return compareDirectories(
    leftRoot,
    rightRoot,
    (path) => platform.listDirectory(path),
    (path) => platform.readTextFile(path),
    cache
  )
}

export interface SyncApplyResult {
  readonly comparison: DirectoryComparison
  readonly copied: number
  readonly updated: number
  readonly deleted: number
}

/**
 * Applies a previewed plan and re-runs the comparison so the tree, badges and
 * status bar reflect the new state. Mirror deletions can be narrowed per item.
 */
export async function applySyncPreview(
  platform: PlatformPort,
  preview: SyncPreview,
  cache: ComparisonCache,
  deletePaths: readonly string[]
): Promise<SyncApplyResult> {
  const { plan } = preview

  if (preview.materializeTarget) {
    const original = await scan(platform, preview.originalTargetRoot)
    await copyScannedTree(original, plan.targetRoot, syncIo(platform))
  }

  const execution = await executeSyncPlan(plan, syncIo(platform), {
    deletePaths: plan.mode === 'mirror' ? deletePaths : undefined
  })
  invalidateComparisonCache(cache, execution.affected)

  const leftToRight = plan.direction === 'left-to-right'
  const leftRoot = leftToRight ? preview.sourceRoot : plan.targetRoot
  const rightRoot = leftToRight ? plan.targetRoot : preview.sourceRoot

  return {
    comparison: await compareRoots(platform, leftRoot, rightRoot, cache),
    copied: execution.copied,
    updated: execution.updated,
    deleted: execution.deleted
  }
}

/** A previewed template placement: the mapping plus its writable output root. */
export interface TemplatePreview {
  readonly result: TemplateMatchResult
  readonly templateRoot: string
  readonly incomingRoot: string
  readonly targetRoot: string
}

/**
 * Matches the shuffled incoming tree B against the template tree A and picks a
 * fresh writable output root. Nothing is written until the user confirms.
 */
export async function previewTemplate(
  platform: PlatformPort,
  templateRoot: string,
  incomingRoot: string,
  sequence: number
): Promise<TemplatePreview> {
  const [template, incoming] = await Promise.all([
    scan(platform, templateRoot),
    scan(platform, incomingRoot)
  ])
  const result = await matchTemplate(template, incoming, {
    readTextFile: (path) => platform.readTextFile(path)
  })

  const temp = await platform.temporaryDirectory()
  const targetRoot = `${temp}/restored/${sequence}-${basename(templateRoot)}`

  return { result, templateRoot, incomingRoot, targetRoot }
}

export interface TemplateExtractResult {
  readonly extracted: number
  /** Written slots that re-matched in the output; equals `extracted` on success. */
  readonly verifiedMatched: number
  /** Written slots absent from the output; `0` means every restore landed. */
  readonly verifiedMissing: number
  readonly verifiedConflicts: number
}

/**
 * Writes every matched file under the template A relative structure, then
 * re-matches the output through the same matcher to prove every restored slot
 * landed. Verification is scoped to the matched slots (template slots that had
 * no counterpart in B stay missing by design and must not count as a failure).
 */
export async function applyTemplateExtract(
  platform: PlatformPort,
  preview: TemplatePreview
): Promise<TemplateExtractResult> {
  const extraction = await extractTemplateMatches(preview.result, preview.targetRoot, {
    writeTextFile: (path, content) => platform.writeTextFile(path, content),
    ensureDirectory: (path) => platform.ensureDirectory(path)
  })

  const [template, output] = await Promise.all([
    scan(platform, preview.templateRoot),
    scan(platform, preview.targetRoot)
  ])

  // Scope verification to the slots this extract actually wrote: a template slot
  // that B never provided stays missing by design and is not a failed restore.
  const verification = await matchTemplateSlots(
    template,
    output,
    preview.result.matched.map((item) => item.relativePath),
    { readTextFile: (path) => platform.readTextFile(path) }
  )

  return {
    extracted: extraction.written,
    verifiedMatched: verification.matched.length,
    verifiedMissing: verification.missing.length,
    verifiedConflicts: verification.conflicts.length
  }
}
