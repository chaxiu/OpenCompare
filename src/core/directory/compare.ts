/**
 * Read-only directory comparison engine (pure, zero Electron / DOM).
 *
 * Two trees are scanned through a directory capability, paired by relative
 * path and classified into the product's four file semantics:
 * `same` / `added` (right only) / `removed` (left only) / `modified`.
 *
 * The fast path never reads file bodies: a size mismatch is immediately
 * `modified`, an mtime mismatch is immediately `modified`, and only pairs whose
 * size *and* mtime agree fall through to a SHA-256 content confirmation (which
 * is what catches "same size, different content"). Hashes are cached per
 * `(path, size, modifiedMs)`, so re-comparing an unchanged tree neither reads
 * bodies nor recomputes digests.
 */
import type { DiffStatus } from '@shared/fixtures'
import type { DirectoryEntry, DirectoryListing, FileDigest } from '@shared/platform/types'
import {
  OperationCancelledError,
  abortable,
  mapWithLimit,
  throwIfAborted,
  toReadableIoError
} from '../io'
import type { ConcurrencyOptions } from '../io'
import { sha256Hex } from './hash'

/** The four directory-comparison semantics, reusing the sample vocabulary. */
export type FileDiffStatus = Extract<DiffStatus, 'same' | 'added' | 'removed' | 'modified'>

export const FILE_DIFF_STATUSES: readonly FileDiffStatus[] = [
  'same',
  'added',
  'removed',
  'modified'
]

/** One scanned entry: directory or file, with the metadata the fast path needs. */
export interface ScannedNode {
  readonly name: string
  readonly path: string
  readonly kind: 'file' | 'directory'
  readonly size: number
  readonly modifiedMs: number
  readonly children: readonly ScannedNode[]
}

export interface ScannedTree {
  readonly root: ScannedNode
  /** Relative path (`''` for the root) to scanned node. */
  readonly index: ReadonlyMap<string, ScannedNode>
  /**
   * Entries left out of the tree because they could not be read: dangling
   * symbolic links, unreadable entries and subtrees whose listing failed.
   */
  readonly skipped: number
}

/** Lists one directory level. Backed by `PlatformPort.listDirectory` in the app. */
export type ListDirectory = (path: string) => Promise<readonly DirectoryEntry[]>

/**
 * Lists several directories in one round trip, in input order. Backed by
 * `PlatformPort.listDirectories`; a directory that cannot be read fails its own
 * slot instead of the batch.
 */
export type ListDirectories = (paths: readonly string[]) => Promise<readonly DirectoryListing[]>

/** In-flight batch listings a scan may use by default (one IPC round trip each). */
export const DEFAULT_TRAVERSAL_CONCURRENCY = 16

/** Directories one batch listing may carry by default. */
export const DEFAULT_DIRECTORY_BATCH_SIZE = 8

/** Files one digest batch may carry by default, i.e. one progress step. */
export const DEFAULT_DIGEST_BATCH_SIZE = 64

/**
 * One settled batch of work, never interpolated by a timer. `files` / `bytes`
 * are cumulative over the whole pipeline: the digest phase continues from the
 * scan phase's totals instead of restarting at zero. `phaseFiles` /
 * `phaseBytes` are the increments settled inside the current phase (the scan
 * phase therefore reports its pipeline total as its phase total).
 */
export interface DirectoryProgress {
  readonly phase: 'scan' | 'digest'
  /** Whole-pipeline cumulative files; monotonic across the phase switch. */
  readonly files: number
  /** Whole-pipeline cumulative bytes; monotonic across the phase switch. */
  readonly bytes: number
  /** Files settled inside the current phase. */
  readonly phaseFiles: number
  /** Bytes settled inside the current phase. */
  readonly phaseBytes: number
}

/** Cumulative totals one phase continues from (the scan phase's closing totals for digest). */
export interface ProgressBase {
  readonly files: number
  readonly bytes: number
}

export type ProgressReporter = (progress: DirectoryProgress) => void

export interface ScanDirectoryOptions {
  /** Batch capability; when omitted each directory goes through {@link ListDirectory}. */
  readonly listDirectories?: ListDirectories
  /** Overrides {@link DEFAULT_TRAVERSAL_CONCURRENCY}; values below 1 fall back to it. */
  readonly concurrency?: number
  /** Cancels the scan; a cancelled scan rejects instead of returning a partial tree. */
  readonly signal?: AbortSignal
  /** Called at most once per settled listing batch with the running totals. */
  readonly onProgress?: ProgressReporter
}

/**
 * Merges the two side scans' per-side counters into one monotonic total, so a
 * comparison reports both sides as a single progress stream. {@link totals}
 * exposes that closing total, which is the base the digest phase continues from.
 */
export interface ScanProgressMerger {
  /** One reporter per side scan; each side's deltas fold into the same total. */
  reporter(): ProgressReporter
  /** Files and bytes both sides have scanned so far. */
  totals(): ProgressBase
}

export function createScanProgressMerger(
  onProgress: ProgressReporter | undefined
): ScanProgressMerger {
  let files = 0
  let bytes = 0
  return {
    reporter() {
      let sideFiles = 0
      let sideBytes = 0
      return (event) => {
        files += event.files - sideFiles
        bytes += event.bytes - sideBytes
        sideFiles = event.files
        sideBytes = event.bytes
        onProgress?.({ phase: 'scan', files, bytes, phaseFiles: files, phaseBytes: bytes })
      }
    },
    totals: () => ({ files, bytes })
  }
}

/** Reads one UTF-8 text file. Backed by `PlatformPort.readTextFile` in the app. */
export type ReadTextFile = (path: string) => Promise<string>

/**
 * Digests a batch of files' raw bytes. Backed by `PlatformPort.digestFiles` in
 * the app; one request carries the whole batch and answers in input order.
 */
export type DigestFiles = (paths: readonly string[]) => Promise<readonly FileDigest[]>

/** I/O capabilities and limits one comparison runs with. */
export interface ComparisonIoOptions extends ScanDirectoryOptions {
  /**
   * Byte-level batch digest. When supplied, planned files are hashed from their
   * raw bytes instead of being read as UTF-8 text (the pre-digest fallback).
   */
  readonly digestFiles?: DigestFiles
  /**
   * Narrows which planned paths the digest capability can address; paths it
   * rejects (e.g. snapshot mounts, which have no file behind them) keep the
   * text-read path.
   */
  readonly digestible?: (path: string) => boolean
  /** Overrides {@link DEFAULT_DIGEST_BATCH_SIZE}; values below 1 fall back to it. */
  readonly digestBatchSize?: number
  /**
   * Pipeline totals the digest phase continues from. Both callers pass the
   * merged scan totals so digest progress never restarts at zero.
   */
  readonly progressBase?: ProgressBase
}

/** Content digest of one file, keyed by the metadata it was computed for. */
export interface ContentHashEntry {
  readonly size: number
  readonly modifiedMs: number
  readonly hash: string
}

/** Cross-comparison memo so an unchanged tree is never read or hashed twice. */
export interface ComparisonCache {
  readonly hashes: Map<string, ContentHashEntry>
}

export function createComparisonCache(): ComparisonCache {
  return { hashes: new Map() }
}

function basename(path: string): string {
  const normalized = path.replace(/[\\/]+$/, '')
  const separator = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  return separator === -1 ? normalized : normalized.slice(separator + 1)
}

/** Mutable node while a scan is still listing directories; finalised afterwards. */
interface PendingNode {
  readonly name: string
  readonly path: string
  readonly kind: 'file' | 'directory'
  readonly size: number
  readonly modifiedMs: number
  readonly children: PendingNode[]
}

interface PendingDirectory {
  readonly path: string
  /** Root-relative POSIX path; `''` for the root itself. */
  readonly relativePath: string
  readonly node: PendingNode
  /** Parent directory node, attached once this directory lists successfully. */
  readonly parent: PendingNode | null
}

/** Readable failure of a batch slot; keeps the existing `无法读取目录` wording. */
function directoryReadFailure(path: string, reason: string): Error {
  return new Error(
    reason.includes(`无法读取目录 ${path}`) ? reason : `无法读取目录 ${path}：${reason}`
  )
}

function slotReason(path: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes(`无法读取目录 ${path}`) ? message : `无法读取目录 ${path}：${message}`
}

/**
 * Turns a single-directory capability into the batch shape, so the scan's
 * queue/batching path works even when the host has no batch capability. A
 * directory failure stays local to its slot; descriptor exhaustion rejects the
 * whole listing, since every queued read would fail too.
 */
function perDirectoryBatches(list: ListDirectory): ListDirectories {
  return (paths) =>
    mapWithLimit(paths, {}, async (path): Promise<DirectoryListing> => {
      try {
        return { path, ok: true, entries: await list(path) }
      } catch (error) {
        const fatal = toReadableIoError(error)
        if (fatal !== error) throw fatal
        return { path, ok: false, reason: slotReason(path, error) }
      }
    })
}

/** Files one digest request carries; one settled request is one progress step. */
function resolveDigestBatchSize(options: ComparisonIoOptions): number {
  const requested = options.digestBatchSize
  if (requested === undefined || !Number.isFinite(requested)) return DEFAULT_DIGEST_BATCH_SIZE
  return Math.max(1, Math.floor(requested))
}

function resolveTraversalConcurrency(options: ScanDirectoryOptions): number {
  const requested = options.concurrency
  if (requested === undefined || !Number.isFinite(requested)) {
    return DEFAULT_TRAVERSAL_CONCURRENCY
  }
  return Math.max(1, Math.floor(requested))
}

/**
 * Directories one listing call carries. Large levels keep the full batch size;
 * a small level is split so the traversal still fills its in-flight window
 * (never going below two, so a call covers several directories whenever the
 * queue allows it).
 */
function resolveBatchSize(pendingCount: number, concurrency: number): number {
  if (pendingCount <= 1) return 1
  const target = Math.ceil(pendingCount / concurrency)
  return Math.max(2, Math.min(DEFAULT_DIRECTORY_BATCH_SIZE, target))
}

/**
 * Scans `rootPath` level by level through a queue of pending directories. Each
 * round trip lists up to {@link DEFAULT_DIRECTORY_BATCH_SIZE} directories (or
 * fewer, enough to fill the window), with at most
 * {@link DEFAULT_TRAVERSAL_CONCURRENCY} calls in flight. Batching and
 * concurrency only change how directories are fetched: the tree, its sorted
 * children, the relative-path index and the `skipped` count stay identical to
 * a serial walk.
 *
 * A broken entry or an unlistable subtree is counted in `skipped` and left out
 * instead of failing the scan; only the root itself being unreadable (or a
 * descriptor-exhaustion failure) rejects, and no partial tree is returned.
 */
export async function scanDirectory(
  rootPath: string,
  list: ListDirectory,
  options: ScanDirectoryOptions = {}
): Promise<ScannedTree> {
  const listDirectories = options.listDirectories ?? perDirectoryBatches(list)
  const concurrency = resolveTraversalConcurrency(options)
  const { signal, onProgress } = options
  let skipped = 0
  // Files (and their bytes) discovered so far, advanced once per settled batch.
  let discoveredFiles = 0
  let discoveredBytes = 0

  const root: PendingNode = {
    name: basename(rootPath),
    path: rootPath,
    kind: 'directory',
    size: 0,
    modifiedMs: 0,
    children: []
  }

  let level: PendingDirectory[] = [
    { path: rootPath, relativePath: '', node: root, parent: null }
  ]

  while (level.length > 0) {
    throwIfAborted(signal)
    const batchSize = resolveBatchSize(level.length, concurrency)
    const batches: PendingDirectory[][] = []
    for (let index = 0; index < level.length; index += batchSize) {
      batches.push(level.slice(index, index + batchSize))
    }
    const nextLevel: PendingDirectory[] = []

    // `mapWithLimit` keeps the call window bounded, stops issuing new batches
    // after the first failure and rejects once the in-flight calls settle.
    await mapWithLimit(batches, { concurrency }, async (batch) => {
      throwIfAborted(signal)
      const paths = batch.map((directory) => directory.path)
      let listings: readonly DirectoryListing[]
      try {
        listings = await abortable(listDirectories(paths), signal)
      } catch (error) {
        throw toReadableIoError(error)
      }

      if (listings.length !== paths.length) {
        throw new Error(
          `批量列目录返回了 ${listings.length} 个槽位，与请求的 ${paths.length} 个目录不一致，本次扫描已停止。`
        )
      }

      let batchFiles = 0
      let batchBytes = 0
      for (const [index, directory] of batch.entries()) {
        const listing = listings[index]
        if (listing.path !== directory.path) {
          throw new Error(
            `批量列目录返回的槽位顺序与请求不一致：期望 ${directory.path}，实际 ${listing.path}。`
          )
        }
        if (!listing.ok) {
          if (directory.parent === null) {
            // The root is the comparison itself: a failure there is not skippable.
            throw directoryReadFailure(directory.path, listing.reason)
          }
          skipped += 1
          continue
        }

        // A subtree is attached only once it lists, so a failed directory never
        // leaves an empty placeholder behind in the tree.
        directory.parent?.children.push(directory.node)

        for (const entry of listing.entries) {
          // A dangling / unreadable entry is still listed by the platform so the
          // caller can count it, but it has no trustworthy metadata to compare.
          if (entry.broken) {
            skipped += 1
            continue
          }
          if (entry.isDirectory) {
            const relativePath =
              directory.relativePath === '' ? entry.name : `${directory.relativePath}/${entry.name}`
            nextLevel.push({
              path: entry.path,
              relativePath,
              node: {
                name: entry.name,
                path: entry.path,
                kind: 'directory',
                size: 0,
                modifiedMs: 0,
                children: []
              },
              parent: directory.node
            })
          } else {
            batchFiles += 1
            batchBytes += entry.size
            directory.node.children.push({
              name: entry.name,
              path: entry.path,
              kind: 'file',
              size: entry.size,
              modifiedMs: entry.modifiedMs,
              children: []
            })
          }
        }
      }

      // One report per settled batch: real numbers only, no timer interpolation.
      discoveredFiles += batchFiles
      discoveredBytes += batchBytes
      onProgress?.({
        phase: 'scan',
        files: discoveredFiles,
        bytes: discoveredBytes,
        phaseFiles: discoveredFiles,
        phaseBytes: discoveredBytes
      })
    })

    level = nextLevel
  }

  function finalize(node: PendingNode): ScannedNode {
    const children = node.children
      .map((child) => finalize(child))
      .sort((left, right) => left.name.localeCompare(right.name))
    return {
      name: node.name,
      path: node.path,
      kind: node.kind,
      size: node.size,
      modifiedMs: node.modifiedMs,
      children
    }
  }

  const scannedRoot = finalize(root)
  const index = new Map<string, ScannedNode>()
  const stack: Array<{ readonly relativePath: string; readonly node: ScannedNode }> = [
    { relativePath: '', node: scannedRoot }
  ]
  while (stack.length > 0) {
    const current = stack.pop() as { readonly relativePath: string; readonly node: ScannedNode }
    index.set(current.relativePath, current.node)
    for (let position = current.node.children.length - 1; position >= 0; position -= 1) {
      const child = current.node.children[position]
      stack.push({
        relativePath:
          current.relativePath === '' ? child.name : `${current.relativePath}/${child.name}`,
        node: child
      })
    }
  }

  return { root: scannedRoot, index, skipped }
}

interface CompareContext {
  readonly contents: ReadonlyMap<string, string>
  readonly cache: ComparisonCache
  readonly hash: (text: string) => string
  /** Paths whose body could not be read; their pair is reported as `modified`. */
  readonly unreadable: ReadonlySet<string>
  /** Pairs settled as `modified` because a body could not be read. */
  readonly unreadablePairs: { count: number }
}

export interface ComparisonInputs {
  /** Absolute path to body, for exactly the files {@link planContentReads} asked for. */
  readonly contents: ReadonlyMap<string, string>
  readonly cache: ComparisonCache
  /** Digest implementation; defaults to the built-in synchronous SHA-256. */
  readonly hash?: (text: string) => string
  /** Bodies that could not be read; such a pair is `modified` and counted as skipped. */
  readonly unreadable?: ReadonlySet<string>
}

export interface DirectoryDiffNode {
  readonly name: string
  /** Root-relative POSIX path; `''` for the root node. */
  readonly relativePath: string
  readonly kind: 'file' | 'directory'
  readonly status: FileDiffStatus
  readonly children: readonly DirectoryDiffNode[]
  /** File counts of this subtree (a file node counts itself). */
  readonly counts: Readonly<Record<FileDiffStatus, number>>
  readonly leftPath?: string
  readonly rightPath?: string
  /** Byte size of the file on the left side; only set for file nodes. */
  readonly leftSize?: number
  /** Byte size of the file on the right side; only set for file nodes. */
  readonly rightSize?: number
  /** Modification time on the left side; lets a copy preserve source metadata. */
  readonly leftModifiedMs?: number
  readonly rightModifiedMs?: number
}

export interface DirectoryComparison {
  readonly leftRoot: string
  readonly rightRoot: string
  readonly leftName: string
  readonly rightName: string
  readonly root: DirectoryDiffNode
  readonly counts: Readonly<Record<FileDiffStatus, number>>
  readonly fileCount: number
  /** Entries and file bodies left out of both sides because they were unreadable. */
  readonly skipped: number
}

function countEntry(status: FileDiffStatus): Record<FileDiffStatus, number> {
  return { same: 0, added: 0, removed: 0, modified: 0, [status]: 1 }
}

function zeroCounts(): Record<FileDiffStatus, number> {
  return { same: 0, added: 0, removed: 0, modified: 0 }
}

function aggregate(children: readonly DirectoryDiffNode[]): Record<FileDiffStatus, number> {
  const counts = zeroCounts()
  for (const child of children) {
    for (const status of FILE_DIFF_STATUSES) counts[status] += child.counts[status]
  }
  return counts
}

function directoryStatus(counts: Readonly<Record<FileDiffStatus, number>>): FileDiffStatus {
  if (counts.added === 0 && counts.removed === 0 && counts.modified === 0) return 'same'
  if (counts.modified > 0) return 'modified'
  if (counts.added > 0 && counts.removed > 0) return 'modified'
  if (counts.added > 0) return 'added'
  return 'removed'
}

/** True when size and mtime are both equal, i.e. only content can tell them apart. */
function needsContent(left: ScannedNode, right: ScannedNode): boolean {
  return left.size === right.size && left.modifiedMs === right.modifiedMs
}

function needsHash(node: ScannedNode, cache: ComparisonCache): boolean {
  const cached = cache.hashes.get(node.path)
  return cached === undefined || cached.size !== node.size || cached.modifiedMs !== node.modifiedMs
}

/**
 * Absolute paths whose bodies must be read before comparing: equal size, equal
 * mtime, and no usable cache entry. Everything else is decided from metadata.
 */
export function planContentReads(
  left: ScannedTree,
  right: ScannedTree,
  cache: ComparisonCache
): readonly string[] {
  const wanted = new Set<string>()

  for (const [relativePath, leftNode] of left.index) {
    if (leftNode.kind !== 'file') continue
    const rightNode = right.index.get(relativePath)
    if (rightNode === undefined || rightNode.kind !== 'file') continue
    if (!needsContent(leftNode, rightNode)) continue
    if (needsHash(leftNode, cache)) wanted.add(leftNode.path)
    if (needsHash(rightNode, cache)) wanted.add(rightNode.path)
  }

  return [...wanted]
}

function hashFile(node: ScannedNode, context: CompareContext): string {
  const cached = context.cache.hashes.get(node.path)
  if (cached !== undefined && cached.size === node.size && cached.modifiedMs === node.modifiedMs) {
    return cached.hash
  }

  const content = context.contents.get(node.path)
  if (content === undefined) {
    throw new Error(`No content supplied for ${node.path}; call planContentReads first.`)
  }

  const digest = context.hash(content)
  context.cache.hashes.set(node.path, {
    size: node.size,
    modifiedMs: node.modifiedMs,
    hash: digest
  })
  return digest
}

function classifyPair(left: ScannedNode, right: ScannedNode, context: CompareContext): FileDiffStatus {
  // A body the platform could not read is unknowable, so the pair is reported
  // as modified (it needs attention) and counted as skipped instead of aborting.
  if (context.unreadable.has(left.path) || context.unreadable.has(right.path)) {
    context.unreadablePairs.count += 1
    return 'modified'
  }
  if (left.size !== right.size) return 'modified'
  if (left.modifiedMs !== right.modifiedMs) return 'modified'
  return hashFile(left, context) === hashFile(right, context) ? 'same' : 'modified'
}

function childRelativePath(parent: string, name: string): string {
  return parent === '' ? name : `${parent}/${name}`
}

function markSubtree(
  relativePath: string,
  node: ScannedNode,
  status: FileDiffStatus,
  side: 'left' | 'right'
): DirectoryDiffNode {
  const leftPath = side === 'left' ? node.path : undefined
  const rightPath = side === 'right' ? node.path : undefined

  if (node.kind === 'file') {
    return {
      name: node.name,
      relativePath,
      kind: 'file',
      status,
      children: [],
      counts: countEntry(status),
      leftPath,
      rightPath,
      leftSize: side === 'left' ? node.size : undefined,
      rightSize: side === 'right' ? node.size : undefined,
      leftModifiedMs: side === 'left' ? node.modifiedMs : undefined,
      rightModifiedMs: side === 'right' ? node.modifiedMs : undefined
    }
  }

  const children = node.children.map((child) =>
    markSubtree(childRelativePath(relativePath, child.name), child, status, side)
  )
  return {
    name: node.name,
    relativePath,
    kind: 'directory',
    status,
    children,
    counts: aggregate(children),
    leftPath,
    rightPath
  }
}

function mergeChildren(
  relativePath: string,
  left: ScannedNode,
  right: ScannedNode,
  context: CompareContext
): DirectoryDiffNode[] {
  const names = new Set<string>()
  for (const child of left.children) names.add(child.name)
  for (const child of right.children) names.add(child.name)

  const leftByName = new Map(left.children.map((child) => [child.name, child]))
  const rightByName = new Map(right.children.map((child) => [child.name, child]))

  return [...names]
    .sort((first, second) => first.localeCompare(second))
    .map((name) =>
      buildNode(
        childRelativePath(relativePath, name),
        leftByName.get(name),
        rightByName.get(name),
        context
      )
    )
}

function buildNode(
  relativePath: string,
  left: ScannedNode | undefined,
  right: ScannedNode | undefined,
  context: CompareContext
): DirectoryDiffNode {
  const name = left?.name ?? right?.name ?? relativePath
  const bothFiles = left?.kind === 'file' && right?.kind === 'file'

  if (bothFiles) {
    const status = classifyPair(left, right, context)
    return {
      name,
      relativePath,
      kind: 'file',
      status,
      children: [],
      counts: countEntry(status),
      leftPath: left.path,
      rightPath: right.path,
      leftSize: left.size,
      rightSize: right.size,
      leftModifiedMs: left.modifiedMs,
      rightModifiedMs: right.modifiedMs
    }
  }

  if (left && right) {
    const children = mergeChildren(relativePath, left, right, context)
    const counts = aggregate(children)
    // A file/directory type clash is reported as a single modified directory.
    const sameKind = left.kind === 'directory' && right.kind === 'directory'
    return {
      name,
      relativePath,
      kind: 'directory',
      status: sameKind ? directoryStatus(counts) : 'modified',
      children,
      counts,
      leftPath: left.path,
      rightPath: right.path
    }
  }

  const only = (left ?? right) as ScannedNode
  return markSubtree(relativePath, only, left ? 'removed' : 'added', left ? 'left' : 'right')
}

/**
 * Compares two scanned trees. Content must already be available for every path
 * returned by {@link planContentReads}.
 */
export function compareScannedTrees(
  left: ScannedTree,
  right: ScannedTree,
  inputs: ComparisonInputs
): DirectoryComparison {
  const context: CompareContext = {
    contents: inputs.contents,
    cache: inputs.cache,
    hash: inputs.hash ?? sha256Hex,
    unreadable: inputs.unreadable ?? new Set(),
    unreadablePairs: { count: 0 }
  }
  const root = buildNode('', left.root, right.root, context)
  return {
    leftRoot: left.root.path,
    rightRoot: right.root.path,
    leftName: left.root.name,
    rightName: right.root.name,
    root,
    counts: root.counts,
    fileCount: FILE_DIFF_STATUSES.reduce((total, status) => total + root.counts[status], 0),
    skipped: left.skipped + right.skipped + context.unreadablePairs.count
  }
}

/** Bodies read for a comparison, plus the ones that could not be read. */
export interface ContentCandidates {
  readonly contents: ReadonlyMap<string, string>
  readonly unreadable: ReadonlySet<string>
}

/**
 * Reads every planned body, recording an unreadable file instead of rejecting
 * the comparison. Descriptor exhaustion still aborts: it would fail every
 * remaining read too, and the run needs the readable EMFILE error. `tolerate`
 * lets a caller keep its own fatal errors (e.g. snapshot format failures).
 */
export async function readContentCandidates(
  requested: readonly string[],
  read: ReadTextFile,
  options: ConcurrencyOptions,
  tolerate: (error: unknown) => boolean = () => true
): Promise<ContentCandidates> {
  const contents = new Map<string, string>()
  const unreadable = new Set<string>()

  await mapWithLimit(requested, options, async (path) => {
    try {
      contents.set(path, await read(path))
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code
      if (code === 'EMFILE' || code === 'ENFILE') throw toReadableIoError(error)
      if (!tolerate(error)) throw error
      unreadable.add(path)
    }
  })

  return { contents, unreadable }
}

/**
 * Digests every body a comparison needs straight into the cache, so large real
 * trees never have to keep every file's text in memory at once (two 40 GB
 * projects would not fit). Files go through the batch byte digest when the
 * caller supplies one, so the engine never pulls a body over IPC for hashing;
 * the rest keep the text-read fallback. Returns the paths that could not be
 * read; their pair is classified `modified` and counted as skipped.
 */
export async function digestContentCandidates(
  left: ScannedTree,
  right: ScannedTree,
  cache: ComparisonCache,
  read: ReadTextFile,
  hash: (text: string) => string,
  options: ComparisonIoOptions,
  tolerate: (error: unknown) => boolean = () => true
): Promise<ReadonlySet<string>> {
  const requested = planContentReads(left, right, cache)
  const nodes = new Map<string, ScannedNode>()
  for (const tree of [left, right]) {
    for (const node of tree.index.values()) {
      if (node.kind === 'file') nodes.set(node.path, node)
    }
  }

  const unreadable = new Set<string>()
  const { digestFiles } = options
  const digestible = options.digestible ?? ((): boolean => true)
  const batch = digestFiles === undefined ? [] : requested.filter((path) => digestible(path))
  const textReads =
    digestFiles === undefined ? requested : requested.filter((path) => !digestible(path))

  const { signal, onProgress } = options
  const batchSize = resolveDigestBatchSize(options)
  // Digest progress continues the pipeline totals; `phaseFiles` / `phaseBytes`
  // stay the increments settled inside this phase (starting at zero).
  const base = options.progressBase ?? { files: 0, bytes: 0 }
  let settledFiles = 0
  let settledBytes = 0

  // Raw-byte digests go out in sequential chunks: the digest capability owns its
  // own bounded streaming reads, and one settled chunk becomes one progress
  // step (and one cache write, so a cancelled chunk never lands in the cache).
  if (batch.length > 0 && digestFiles !== undefined) {
    for (let start = 0; start < batch.length; start += batchSize) {
      throwIfAborted(signal)
      const chunk = batch.slice(start, start + batchSize)
      let digests: readonly FileDigest[]
      try {
        digests = await abortable(digestFiles(chunk), signal)
      } catch (error) {
        const code = (error as { code?: unknown } | null)?.code
        if (code === 'EMFILE' || code === 'ENFILE') throw toReadableIoError(error)
        throw error
      }

      // The contract is one result per request, in input order; a missing slot
      // or a failed item is just an unreadable body, never a batch-wide failure.
      let chunkBytes = 0
      chunk.forEach((path, index) => {
        const digest = digests[index]
        if (digest === undefined || !digest.ok) {
          unreadable.add(path)
          return
        }
        const node = nodes.get(path)
        if (node === undefined) {
          throw new Error(`No scanned file at ${path}; call planContentReads first.`)
        }
        chunkBytes += digest.bytes
        cache.hashes.set(path, {
          size: node.size,
          modifiedMs: node.modifiedMs,
          hash: digest.sha256
        })
      })

      settledFiles += chunk.length
      settledBytes += chunkBytes
      onProgress?.({
        phase: 'digest',
        files: base.files + settledFiles,
        bytes: base.bytes + settledBytes,
        phaseFiles: settledFiles,
        phaseBytes: settledBytes
      })
    }
  }

  await mapWithLimit(textReads, options, async (path) => {
    throwIfAborted(signal)
    try {
      const node = nodes.get(path)
      if (node === undefined) {
        throw new Error(`No scanned file at ${path}; call planContentReads first.`)
      }
      cache.hashes.set(path, {
        size: node.size,
        modifiedMs: node.modifiedMs,
        hash: hash(await abortable(read(path), signal))
      })
    } catch (error) {
      // Cancellation is its own failure path, never a skipped entry.
      if (error instanceof OperationCancelledError) throw error
      const code = (error as { code?: unknown } | null)?.code
      if (code === 'EMFILE' || code === 'ENFILE') throw toReadableIoError(error)
      if (!tolerate(error)) throw error
      unreadable.add(path)
    }
  })

  return unreadable
}

/**
 * Scans both roots and compares them, reading file bodies only where the size /
 * mtime fast path is inconclusive. Bodies are read through a bounded window so a
 * multi-thousand-file tree cannot exhaust the process file descriptors.
 */
export async function compareDirectories(
  leftRoot: string,
  rightRoot: string,
  list: ListDirectory,
  readTextFile: ReadTextFile,
  cache: ComparisonCache,
  /** Digest implementation; defaults to the built-in synchronous SHA-256. */
  hash?: (text: string) => string,
  /** In-flight body-read window and optional digest capability. */
  options: ComparisonIoOptions = {}
): Promise<DirectoryComparison> {
  try {
    // Both side scans feed one monotonic progress stream.
    const sideProgress = createScanProgressMerger(options.onProgress)
    const [left, right] = await Promise.all([
      scanDirectory(leftRoot, list, { ...options, onProgress: sideProgress.reporter() }),
      scanDirectory(rightRoot, list, { ...options, onProgress: sideProgress.reporter() })
    ])

    // Digests go straight into the cache: only one body per in-flight read is
    // held in memory, which is what lets two real project trees be compared.
    // Their progress continues from the closing scan totals.
    const unreadable = await digestContentCandidates(
      left,
      right,
      cache,
      readTextFile,
      hash ?? sha256Hex,
      { ...options, progressBase: sideProgress.totals() }
    )

    return compareScannedTrees(left, right, { contents: new Map(), cache, hash, unreadable })
  } catch (error) {
    throw toReadableIoError(error)
  }
}
