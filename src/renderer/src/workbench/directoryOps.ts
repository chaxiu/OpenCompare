/**
 * Renderer-side orchestration for the two high-level directory operations:
 * Dry-run incremental / mirror sync and cross-level template placement.
 *
 * Binds the pure planners/executors in `@core/directory` to `PlatformPort`,
 * materialises read-only sample trees into a writable scratch root before any
 * write, and keeps the comparison cache honest after bytes change.
 */
import { normalizePathValue } from '@shared/compareRequest'
import type { DirectoryEntry, PathProbeKind, PlatformPort } from '@shared/platform/types'
import { compareDirectories, scanDirectory } from '@core/directory/compare'
import type {
  ComparisonCache,
  DirectoryComparison,
  DirectoryDiffNode,
  ScannedTree
} from '@core/directory/compare'
import { sha256Hex } from '@core/directory/hash'
import {
  buildSyncPlan,
  copyScannedTree,
  executeSyncPlan,
  invalidateComparisonCache,
  joinRelativePath,
  SyncRefreshError,
  SyncTargetError,
  SyncVerificationError
} from '@core/directory/sync'
import type {
  SyncDirection,
  SyncExecution,
  SyncMode,
  SyncPlan,
  SyncVerificationMismatch
} from '@core/directory/sync'
import { isOperationCancelled } from '@core/io'
import {
  createTemplatePlan,
  executeTemplatePlan,
  foldCase,
  matchTemplate,
  verifyTemplateExtraction
} from '@core/directory/template'
import type {
  TemplateExecution,
  TemplatePlan,
  TemplateResolvedPlan,
  TemplateVerification,
  TemplateWrittenEntry
} from '@core/directory/template'
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
    // Raw bytes end to end: the sync write path never decodes a file as text.
    readFileBytes: (path: string) => platform.readFileBytes(path),
    writeFileBytes: (path: string, content: Uint8Array, modifiedMs?: number) =>
      platform.writeFileBytes(path, content, modifiedMs),
    // Link awareness: a synced link is read and created as a link, never through
    // the body it points at.
    readSymbolicLink: (path: string) => platform.readSymbolicLink(path),
    createSymbolicLink: (target: string, path: string) =>
      platform.createSymbolicLink(target, path),
    setSymbolicLinkModifiedMs: (path: string, modifiedMs: number) =>
      platform.setSymbolicLinkModifiedMs(path, modifiedMs),
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
    cause instanceof SyncVerificationError ||
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

/**
 * One link pair the comparison already reads as `same` (equal link target) whose
 * link's own whole-second mtime still differs; the run rewrites the target's link
 * time only.
 */
export interface SyncLinkAlignment {
  readonly relativePath: string
  /** Absolute target-side path whose link mtime is rewritten (`lutimes` level). */
  readonly targetPath: string
  /** Source-side link mtime, copied onto the target link. */
  readonly sourceMs: number
}

/** A previewed sync: the plan plus where its writes will actually land. */
export interface SyncPreview {
  readonly plan: SyncPlan
  /** True when the original target tree is read-only and gets materialised. */
  readonly materializeTarget: boolean
  readonly sourceRoot: string
  readonly originalTargetRoot: string
  /**
   * Link metadata the run will align on the target side. Empty when the target is
   * materialised (its copy already carries the scanned metadata) and always
   * disjoint from the plan's copy / update / delete groups.
   */
  readonly linkAlignments: readonly SyncLinkAlignment[]
}

/** Body copy a sync preview needs, derived from {@link SyncPreviewAction}. */
export type SyncPreviewGuidance = 'changes' | 'empty' | 'noExecutable'

/**
 * What one confirmation would actually execute, read **once** from the preview
 * and the current checked deletions. A preview is executable when it has bytes
 * to copy or overwrite, link metadata to align, or mirror deletions the user
 * kept checked: an only-aligning preview still has real work to do.
 *
 * `delete` counts only the checked paths the mirror plan would really remove,
 * so the summary never advertises a deletion the run would not perform;
 * `planned` is everything the preview lists (plan items + link alignments).
 * The dialog's counts, its Apply `disabled` state and its body copy all read
 * this one result, and the real-disk gate asserts the same object.
 */
export interface SyncPreviewAction {
  readonly copy: number
  readonly update: number
  /** Checked mirror deletions this run would remove (0 in incremental mode). */
  readonly delete: number
  readonly align: number
  /** Plan items + pending link alignments: what the preview lists in total. */
  readonly planned: number
  readonly executable: boolean
  readonly guidance: SyncPreviewGuidance
}

/**
 * The **one** predicate and count source of a sync preview, shared by the dialog
 * (summary / Apply / guidance) and the real-disk gate.
 */
export function syncPreviewAction(
  preview: SyncPreview,
  deletePaths: readonly string[] = []
): SyncPreviewAction {
  const { plan } = preview
  const copy = plan.copy.count
  const update = plan.update.count
  const align = preview.linkAlignments.length
  const checked = new Set(deletePaths)
  // Deletions are mirror-only opt-ins and only the plan's own delete items can
  // run, so an unknown or incremental-mode path never counts as a deletion.
  const deleted =
    plan.mode === 'mirror'
      ? plan.delete.items.filter((item) => checked.has(item.relativePath)).length
      : 0
  const planned = plan.totalCount + align
  const executable = copy > 0 || update > 0 || align > 0 || deleted > 0
  const guidance: SyncPreviewGuidance = executable
    ? 'changes'
    : planned > 0
      ? 'noExecutable'
      : 'empty'
  return { copy, update, delete: deleted, align, planned, executable, guidance }
}

/**
 * The executable bit of {@link syncPreviewAction}, kept as its own export because
 * the real-disk gate and the dialog have always asked this question by name.
 */
export function canApplySyncPreview(
  preview: SyncPreview,
  deletePaths: readonly string[] = []
): boolean {
  return syncPreviewAction(preview, deletePaths).executable
}

/**
 * Collects the link pairs whose metadata still differs, reusing the comparison's
 * own scan (`leftIsSymbolicLink` / `rightIsSymbolicLink` + both mtimes) so no extra
 * `lstat` walk runs. The classifier compares links by target string, so equal
 * targets stay `same`; only the link's whole-second mtime can still be unequal.
 */
function collectLinkAlignments(
  comparison: DirectoryComparison,
  direction: SyncDirection,
  targetRoot: string
): SyncLinkAlignment[] {
  const leftToRight = direction === 'left-to-right'
  const alignments: SyncLinkAlignment[] = []
  const stack: DirectoryDiffNode[] = [comparison.root]

  while (stack.length > 0) {
    const node = stack.pop() as DirectoryDiffNode
    for (const child of node.children) stack.push(child)
    if (node.kind !== 'file' || node.status !== 'same') continue
    if (node.leftIsSymbolicLink !== true || node.rightIsSymbolicLink !== true) continue
    const sourceMs = (leftToRight ? node.leftModifiedMs : node.rightModifiedMs) ?? 0
    const targetMs = (leftToRight ? node.rightModifiedMs : node.leftModifiedMs) ?? 0
    if (Math.floor(sourceMs / 1000) === Math.floor(targetMs / 1000)) continue
    alignments.push({
      relativePath: node.relativePath,
      targetPath: joinRelativePath(targetRoot, node.relativePath),
      sourceMs
    })
  }

  return alignments
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
    originalTargetRoot,
    // A materialised target is written by the copy itself, which already carries
    // the scanned metadata; only an in-place target needs the link alignment.
    linkAlignments: materializeTarget ? [] : collectLinkAlignments(comparison, direction, targetRoot)
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

/**
 * Post-write proof that every target this run wrote matches its source, and every
 * checked deletion is really gone. Only this run's paths are read, so a 358k-file
 * sync never re-hashes the whole tree. An ordinary file is proven by bytes; a
 * symbolic link is proven by **form** (`lstat` view + literal `readlink` + own
 * whole-second mtime), because a link may dangle and its body is not its payload.
 * Deletions are checked through a listing (an `lstat` view), so a removed
 * dangling link is not mistaken for "missing, therefore deleted".
 */
async function verifyWrittenTargets(
  platform: PlatformPort,
  execution: SyncExecution
): Promise<SyncVerificationMismatch[]> {
  const mismatches: SyncVerificationMismatch[] = []
  const written = execution.written
  const files = written.filter((item) => item.linkTarget === undefined)
  const links = written.filter((item) => item.linkTarget !== undefined)

  if (files.length > 0) {
    try {
      const digests = await digestFilesForComparison(platform, [
        ...files.map((item) => item.targetPath),
        ...files.map((item) => item.sourcePath)
      ])
      const offset = files.length
      files.forEach((item, index) => {
        const target = digests[index]
        const source = digests[offset + index]
        if (target?.ok !== true || source?.ok !== true) {
          mismatches.push({ path: item.targetPath, reason: 'cannot read the bytes used for verification' })
          return
        }
        if (target.sha256 !== source.sha256 || target.bytes !== source.bytes) {
          mismatches.push({ path: item.targetPath, reason: 'target bytes differ from source' })
        }
      })
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause)
      for (const item of files) mismatches.push({ path: item.targetPath, reason })
      return mismatches
    }
  }

  for (const item of links) {
    try {
      const entry = await entryNamed(platform, item.targetPath)
      if (entry === undefined) {
        mismatches.push({ path: item.targetPath, reason: 'written link is missing on the target' })
        continue
      }
      if (entry.isSymbolicLink !== true) {
        mismatches.push({ path: item.targetPath, reason: 'target is not a symbolic link' })
        continue
      }
      if (entry.linkTarget !== item.linkTarget) {
        mismatches.push({ path: item.targetPath, reason: 'target link target differs from source' })
        continue
      }
      if (Math.floor(entry.modifiedMs / 1000) !== Math.floor(item.modifiedMs / 1000)) {
        mismatches.push({ path: item.targetPath, reason: 'target link mtime differs from source' })
      }
    } catch (cause) {
      mismatches.push({
        path: item.targetPath,
        reason: cause instanceof Error ? cause.message : String(cause)
      })
    }
  }

  for (const path of execution.deletedPaths) {
    try {
      if (await entryStillExists(platform, path)) {
        mismatches.push({ path, reason: 'checked deletion still exists on the target' })
      }
    } catch (cause) {
      mismatches.push({
        path,
        reason: cause instanceof Error ? cause.message : String(cause)
      })
    }
  }

  return mismatches
}

/** The target's current entry (an `lstat` view), or `undefined` when absent. */
async function entryNamed(
  platform: PlatformPort,
  path: string
): Promise<DirectoryEntry | undefined> {
  const separator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (separator <= 0) return undefined
  const parent = path.slice(0, separator)
  if ((await platform.statPath(parent)) !== 'directory') return undefined
  const name = path.slice(separator + 1)
  return (await platform.listDirectory(parent)).find((entry) => entry.name === name)
}

/** True when `path` still has a directory entry, links included (never followed). */
async function entryStillExists(platform: PlatformPort, path: string): Promise<boolean> {
  const separator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (separator <= 0) return (await platform.statPath(path)) !== 'missing'
  return (await entryNamed(platform, path)) !== undefined
}

/**
 * Rewrites the target-side link metadata of the pairs `previewSync` collected.
 * Nothing here enters the plan: `copy` / `update` / `delete` counts stay
 * untouched, and no ordinary file is written.
 */
async function alignSymbolicLinkTimes(
  platform: PlatformPort,
  alignments: readonly SyncLinkAlignment[],
  signal: AbortSignal | undefined
): Promise<{ readonly aligned: number; readonly failures: SyncVerificationMismatch[] }> {
  const failures: SyncVerificationMismatch[] = []
  let aligned = 0

  for (const alignment of alignments) {
    if (signal?.aborted === true) break
    try {
      await platform.setSymbolicLinkModifiedMs(alignment.targetPath, alignment.sourceMs)
      aligned += 1
    } catch (cause) {
      failures.push({
        path: alignment.targetPath,
        reason: cause instanceof Error ? cause.message : String(cause)
      })
    }
  }

  return { aligned, failures }
}

export interface SyncApplyResult {
  readonly comparison: DirectoryComparison
  readonly copied: number
  readonly updated: number
  readonly deleted: number
  /** Link mtimes this run realigned; never counted in copied / updated / deleted. */
  readonly alignedLinks: number
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

  // The completion notice is only truthful when the bytes just written really
  // equal their sources. Verification reads exactly this run's targets (+ their
  // sources) and the checked deletions' presence — never the whole tree.
  const mismatches = await verifyWrittenTargets(platform, execution)
  let alignedLinks = 0
  if (!preview.materializeTarget) {
    const alignment = await alignSymbolicLinkTimes(platform, preview.linkAlignments, options.signal)
    alignedLinks = alignment.aligned
    mismatches.push(...alignment.failures)
  }

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

  if (mismatches.length > 0) {
    // The writes already landed, so nothing is rolled back; the refreshed
    // comparison travels with the failure so the caller can show the real disk
    // state and the danger notice instead of "sync complete".
    throw new SyncVerificationError(
      mismatches,
      {
        copied: execution.copied,
        updated: execution.updated,
        deleted: execution.deleted
      },
      comparison
    )
  }

  return {
    comparison,
    copied: execution.copied,
    updated: execution.updated,
    deleted: execution.deleted,
    alignedLinks
  }
}

/** The three roots one template placement preview is scoped to. */
export interface TemplateRoots {
  readonly templateRoot: string
  readonly incomingRoot: string
  readonly outputRoot: string
}

/** A previewed template placement: the plan plus the roots it was built from. */
export interface TemplatePreview extends TemplateRoots {
  readonly plan: TemplatePlan
  /** False when the output root does not exist yet; Apply creates it. */
  readonly outputRootExists: boolean
}

/** Stable refusals of the template entry; every one has a zh / en dictionary pair. */
export type TemplateRootErrorCode =
  | 'incoming-missing'
  | 'incoming-not-directory'
  | 'incoming-equals-template'
  | 'output-equals-template'
  | 'output-equals-incoming'
  | 'output-not-directory'

/** Why one preview attempt did not open: a root refusal or an unexpected read failure. */
export type TemplatePreviewFailure = TemplateRootErrorCode | 'preview-failed'

/** A template entry refused before anything was scanned or written. */
export class TemplateRootError extends Error {
  readonly code: TemplateRootErrorCode

  constructor(code: TemplateRootErrorCode) {
    super(`template root refused: ${code}`)
    this.name = 'TemplateRootError'
    this.code = code
  }
}

/** Canonical form shared by the equality checks, so `a/` and `a` are one root. */
function canonicalRoot(path: string): string {
  return normalizePathValue(path, {}) ?? path
}

/**
 * Scans the real scattered tree B and the output root, matches them against the
 * template A tree and expands the result into one plan. The output root's
 * existing files and directories are passed in, so overwrite / directory
 * occupancy come from the real disk instead of defaulting to writable. Nothing
 * is written: no directory is created and no file is touched.
 */
export async function previewTemplate(
  platform: PlatformPort,
  roots: TemplateRoots
): Promise<TemplatePreview> {
  const templateRoot = roots.templateRoot
  const incomingRoot = canonicalRoot(roots.incomingRoot)
  const outputRoot = canonicalRoot(roots.outputRoot)

  if (incomingRoot === canonicalRoot(templateRoot)) {
    throw new TemplateRootError('incoming-equals-template')
  }
  if (outputRoot === canonicalRoot(templateRoot)) {
    throw new TemplateRootError('output-equals-template')
  }
  if (outputRoot === incomingRoot) {
    throw new TemplateRootError('output-equals-incoming')
  }

  const incomingKind = await platform.statPath(incomingRoot)
  if (incomingKind === 'missing') throw new TemplateRootError('incoming-missing')
  if (incomingKind !== 'directory') throw new TemplateRootError('incoming-not-directory')

  const [template, incoming] = await Promise.all([
    scan(platform, templateRoot),
    scan(platform, incomingRoot)
  ])
  const result = await matchTemplate(template, incoming, {
    readTextFile: (path) => platform.readTextFile(path)
  })

  const outputKind = await platform.statPath(outputRoot)
  if (outputKind === 'file') throw new TemplateRootError('output-not-directory')

  let existingFiles: readonly string[] = []
  let existingDirectories: readonly string[] = []
  let existingFileHashes: Readonly<Record<string, string>> = {}
  if (outputKind === 'directory') {
    const output = await scan(platform, outputRoot)
    existingFiles = [...output.index.entries()]
      .filter(([, node]) => node.kind === 'file')
      .map(([relativePath]) => relativePath)
    existingDirectories = [...output.index.entries()]
      .filter(([relativePath, node]) => relativePath !== '' && node.kind === 'directory')
      .map(([relativePath]) => relativePath)

    // Only an existing file that sits on a matched / conflict slot — exactly or
    // as the only case-only variant (APFS is case-insensitive) — can be
    // "already placed": its digest is compared with the slot's source. Every
    // other output file stays untouched, and an unreadable target simply keeps
    // its overwrite / conflict protection. Nothing is written here.
    const slotPaths = new Set<string>()
    for (const item of result.matched) slotPaths.add(foldCase(item.relativePath))
    for (const item of result.conflicts) slotPaths.add(foldCase(item.relativePath))
    // A moved slot has no source left in B; its output copy is what proves the
    // slot placed on the next scan, so its digest must be read too.
    for (const item of result.missing) slotPaths.add(foldCase(item.relativePath))
    const hashes: Record<string, string> = {}
    for (const relativePath of existingFiles) {
      if (!slotPaths.has(foldCase(relativePath))) continue
      try {
        hashes[relativePath] = sha256Hex(
          await platform.readTextFile(joinRelativePath(outputRoot, relativePath))
        )
      } catch {
        // Unreadable target: leave the digest out so the row stays protected.
      }
    }
    existingFileHashes = hashes
  }

  return {
    templateRoot,
    incomingRoot,
    outputRoot,
    outputRootExists: outputKind === 'directory',
    plan: createTemplatePlan(result, {
      outputRoot,
      existingFiles,
      existingDirectories,
      existingFileHashes
    })
  }
}

/**
 * Writes exactly the resolved manifest's executable rows. The renderer never
 * re-derives the selection: the dialog hands over {@link resolveTemplatePlan}'s
 * result, and this binding only supplies the platform IO.
 *
 * The output root is preflighted with the non-writing {@link PlatformPort.checkWritable}
 * before the first directory or byte is touched, so a read-only root refuses the
 * whole run instead of failing per row. When the root does not exist yet the
 * nearest existing ancestor answers the question. The raw OS code travels with
 * {@link TemplateApplyError} so the dialog localizes it.
 */
export async function applyTemplatePlan(
  platform: PlatformPort,
  resolved: TemplateResolvedPlan
): Promise<TemplateApplyOutcome> {
  await preflightTemplateOutput(platform, resolved.plan.outputRoot)
  const execution = await executeTemplatePlan(resolved, {
    readTextFile: (path) => platform.readTextFile(path),
    writeTextFile: (path, content, modifiedMs) => platform.writeTextFile(path, content, modifiedMs),
    ensureDirectory: (path) => platform.ensureDirectory(path),
    listDirectory: (path) => platform.listDirectory(path),
    // A move removes exactly the source path the plan recorded, never a path
    // rebuilt from the slot or anything under template A / the output root.
    deleteFile: (path) => platform.deleteFile(path)
  })
  const verification = await verifyTemplatePlan(platform, execution.written)
  return { execution, verification }
}

/** One confirmation's result: what was written and the per-row disk re-check. */
export interface TemplateApplyOutcome {
  readonly execution: TemplateExecution
  readonly verification: TemplateVerification
}

/** A template run refused before its first write; `code` is the raw OS code. */
export class TemplateApplyError extends Error {
  readonly path: string
  readonly code?: string

  constructor(path: string, code: string | undefined, detail: string) {
    super(detail)
    this.name = 'TemplateApplyError'
    this.path = path
    this.code = code
  }
}

const SYSTEM_CODE = /\b(E[A-Z]{2,})\b/

/** The raw OS code of a platform refusal, whether it survived as `.code` or only in text. */
function osCodeOf(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code
  if (typeof code === 'string' && code !== '') return code
  const message = error instanceof Error ? error.message : ''
  return SYSTEM_CODE.exec(message)?.[1]
}

/**
 * Asks the OS whether the output root (or, when it does not exist yet, the
 * nearest existing ancestor) accepts a write. `checkWritable` never creates,
 * truncates or deletes anything, so a refusal leaves the tree untouched.
 */
async function preflightTemplateOutput(
  platform: PlatformPort,
  outputRoot: string
): Promise<void> {
  let probe = outputRoot
  for (;;) {
    let kind: PathProbeKind
    try {
      kind = await platform.statPath(probe)
    } catch (error) {
      throw new TemplateApplyError(
        probe,
        osCodeOf(error),
        error instanceof Error ? error.message : String(error)
      )
    }
    if (kind === 'file') {
      throw new TemplateApplyError(
        probe,
        'ENOTDIR',
        `template output refused: not a directory (${probe})`
      )
    }
    if (kind === 'directory') {
      try {
        await platform.checkWritable(probe)
        return
      } catch (error) {
        throw new TemplateApplyError(
          probe,
          osCodeOf(error),
          error instanceof Error ? error.message : String(error)
        )
      }
    }
    const separator = Math.max(probe.lastIndexOf('/'), probe.lastIndexOf('\\'))
    if (separator <= 0) return
    probe = probe.slice(0, separator)
  }
}

/**
 * Re-checks exactly the rows this run wrote: existence, the source SHA-256
 * recomputed from the target body, and the whole-second mtime. The dialog only
 * renders this answer; it never compares on its own.
 */
export async function verifyTemplatePlan(
  platform: PlatformPort,
  written: readonly TemplateWrittenEntry[]
): Promise<TemplateVerification> {
  return verifyTemplateExtraction(written, {
    readTextFile: (path) => platform.readTextFile(path),
    listDirectory: (path) => platform.listDirectory(path)
  })
}
