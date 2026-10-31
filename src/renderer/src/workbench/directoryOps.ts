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
  invalidateComparisonCache,
  joinRelativePath,
  SyncRefreshError,
  SyncTargetError
} from '@core/directory/sync'
import type { SyncDirection, SyncMode, SyncPlan } from '@core/directory/sync'
import { isOperationCancelled } from '@core/io'
import { extractTemplateMatches, matchTemplate, matchTemplateSlots } from '@core/directory/template'
import type { TemplateMatchResult } from '@core/directory/template'
import { digestFilesForComparison } from '../platform'
import { aliasSideRoots } from './rootAliases'

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
    deleteFile: (path: string) => platform.deleteFile(path),
    removeDirectory: (path: string) => platform.removeDirectory(path),
    statPath: (path: string) => platform.statPath(path),
    listDirectory: (path: string) => platform.listDirectory(path),
    checkWritable: (path: string) => platform.checkWritable(path)
  }
}

/** Electron wraps a handler rejection; the user only ever sees the reason. */
const IPC_FAILURE_PREFIX = /^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/

/**
 * Keeps a localized sync failure, a "writes landed, refresh failed" error and a
 * cancellation exactly as they are, and strips the `Error invoking remote method
 * …` wrapper from anything else so the workbench never shows the IPC plumbing
 * instead of the reason. Shared with the dry-run preview, whose preflight read
 * goes through the same IPC channel.
 */
export function readableSyncFailure(cause: unknown): unknown {
  if (
    cause instanceof SyncTargetError ||
    cause instanceof SyncRefreshError ||
    isOperationCancelled(cause)
  ) {
    return cause
  }
  if (!(cause instanceof Error)) return cause
  const stripped = cause.message.replace(IPC_FAILURE_PREFIX, '')
  return stripped === cause.message ? cause : new Error(stripped)
}

/**
 * Removes the sandbox tree a materialised target copy built. Only a root this
 * run created is removed; an existing sandbox is left alone (its bytes are not
 * ours to delete). Best effort: cleanup must never mask the original failure.
 */
async function discardSandbox(
  platform: PlatformPort,
  root: string,
  tree: ScannedTree,
  createdRoot: boolean
): Promise<void> {
  const relativePaths = [...tree.index.entries()]
    .filter(([, node]) => node.kind === 'file')
    .map(([relativePath]) => relativePath)
  for (const relativePath of relativePaths) {
    await platform.deleteFile(joinRelativePath(root, relativePath)).catch(() => undefined)
  }
  const directories = new Set<string>()
  for (const relativePath of relativePaths) {
    let parent = relativePath.includes('/')
      ? relativePath.slice(0, relativePath.lastIndexOf('/'))
      : ''
    while (parent !== '') {
      directories.add(parent)
      parent = parent.includes('/') ? parent.slice(0, parent.lastIndexOf('/')) : ''
    }
  }
  const deepestFirst = [...directories].sort(
    (left, right) =>
      right.split('/').length - left.split('/').length || right.localeCompare(left)
  )
  for (const relativePath of deepestFirst) {
    await platform.removeDirectory(joinRelativePath(root, relativePath)).catch(() => undefined)
  }
  if (createdRoot) {
    await platform.removeDirectory(root).catch(() => undefined)
    // The materialisation root's own parent (`<temp>/workbench`) is ours too when
    // it was empty; a non-empty one (another session) rejects harmlessly.
    const parent = root.slice(0, Math.max(root.lastIndexOf('/'), root.lastIndexOf('\\')))
    if (parent !== '') await platform.removeDirectory(parent).catch(() => undefined)
  }
}

async function scan(platform: PlatformPort, root: string): Promise<ScannedTree> {
  return scanDirectory(root, (path) => platform.listDirectory(path), {
    listDirectories: (paths) => platform.listDirectories(paths)
  })
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

async function compareRoots(
  platform: PlatformPort,
  leftRoot: string,
  rightRoot: string,
  cache: ComparisonCache
): Promise<DirectoryComparison> {
  await aliasSideRoots(platform, cache, [leftRoot, rightRoot])
  return compareDirectories(
    leftRoot,
    rightRoot,
    (path) => platform.listDirectory(path),
    (path) => platform.readTextFile(path),
    cache,
    undefined,
    {
      digestFiles: (paths) => digestFilesForComparison(platform, paths),
      listDirectories: (paths) => platform.listDirectories(paths)
    }
  )
}

export interface SyncApplyResult {
  readonly comparison: DirectoryComparison
  readonly copied: number
  readonly updated: number
  readonly deleted: number
}

/** Optional cancellation seam of one sync confirmation. */
export interface SyncApplyOptions {
  /** Cancels between single writes; a cancelled run rolls back and rejects. */
  readonly signal?: AbortSignal
}

/**
 * Applies a previewed plan and re-runs the comparison so the tree, badges and
 * status bar reflect the new state. Mirror deletions can be narrowed per item.
 *
 * A failure or cancellation rolls the target back inside `executeSyncPlan` and
 * rejects: no new `DirectoryComparison` is produced, so the caller keeps its
 * current session and the same preview stays retryable. A refresh that fails
 * *after* the writes landed rejects with {@link SyncRefreshError} instead — the
 * disk already holds the result, so that preview must not be applied again.
 */
export async function applySyncPreview(
  platform: PlatformPort,
  preview: SyncPreview,
  cache: ComparisonCache,
  deletePaths: readonly string[],
  options: SyncApplyOptions = {}
): Promise<SyncApplyResult> {
  const { plan } = preview
  const io = syncIo(platform)
  let materialized: ScannedTree | null = null
  let createdSandboxRoot = false

  if (preview.materializeTarget) {
    materialized = await scan(platform, preview.originalTargetRoot)
    createdSandboxRoot = (await platform.statPath(plan.targetRoot)) === 'missing'
    try {
      await copyScannedTree(materialized, plan.targetRoot, io)
    } catch (cause) {
      await discardSandbox(platform, plan.targetRoot, materialized, createdSandboxRoot)
      throw readableSyncFailure(cause)
    }
  }

  let execution
  try {
    execution = await executeSyncPlan(plan, io, {
      // Mirror deletions are opt-in: an incremental plan has none, and a mirror
      // plan only removes the paths the user explicitly checked.
      deletePaths: plan.mode === 'mirror' ? deletePaths : [],
      signal: options.signal
    })
  } catch (cause) {
    if (materialized !== null) {
      await discardSandbox(platform, plan.targetRoot, materialized, createdSandboxRoot)
    }
    throw readableSyncFailure(cause)
  }
  invalidateComparisonCache(cache, execution.affected)

  const leftToRight = plan.direction === 'left-to-right'
  const leftRoot = leftToRight ? preview.sourceRoot : plan.targetRoot
  const rightRoot = leftToRight ? plan.targetRoot : preview.sourceRoot

  let comparison: DirectoryComparison
  try {
    comparison = await compareRoots(platform, leftRoot, rightRoot, cache)
  } catch (cause) {
    // The writes are on disk, so rolling back would be the wrong answer. Report
    // the completed write and the failed re-read as one readable failure.
    const reason =
      cause instanceof Error ? cause.message.replace(IPC_FAILURE_PREFIX, '') : String(cause)
    throw new SyncRefreshError(reason, {
      copied: execution.copied,
      updated: execution.updated,
      deleted: execution.deleted
    })
  }

  return {
    comparison,
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
