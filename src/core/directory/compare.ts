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
import type { DirectoryEntry } from '@shared/platform/types'
import { mapWithLimit, toReadableIoError } from '../io'
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

/** Reads one UTF-8 text file. Backed by `PlatformPort.readTextFile` in the app. */
export type ReadTextFile = (path: string) => Promise<string>

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

/**
 * Recursively scans `rootPath`, returning the tree plus a relative-path index.
 * A broken entry or an unlistable subtree is counted in `skipped` and left out
 * instead of failing the scan; only the root itself being unreadable rejects.
 */
export async function scanDirectory(
  rootPath: string,
  list: ListDirectory
): Promise<ScannedTree> {
  const index = new Map<string, ScannedNode>()
  let skipped = 0

  async function walkEntries(
    path: string,
    relativePath: string,
    entries: readonly DirectoryEntry[]
  ): Promise<ScannedNode> {
    const children: ScannedNode[] = []

    for (const entry of entries) {
      // A dangling / unreadable entry is still listed by the platform so the
      // caller can count it, but it has no trustworthy metadata to compare.
      if (entry.broken) {
        skipped += 1
        continue
      }
      const childRelative = relativePath === '' ? entry.name : `${relativePath}/${entry.name}`
      const child: ScannedNode | null = entry.isDirectory
        ? await walk(entry.path, childRelative)
        : {
            name: entry.name,
            path: entry.path,
            kind: 'file' as const,
            size: entry.size,
            modifiedMs: entry.modifiedMs,
            children: [] as readonly ScannedNode[]
          }
      // A subtree that could not be listed is skipped, never fatal.
      if (child === null) continue
      index.set(childRelative, child)
      children.push(child)
    }

    children.sort((left, right) => left.name.localeCompare(right.name))
    return { name: basename(path), path, kind: 'directory', size: 0, modifiedMs: 0, children }
  }

  async function walk(path: string, relativePath: string): Promise<ScannedNode | null> {
    // One level at a time: the walk is serial, so no amount of nesting can
    // stack up in-flight listings behind the caller's back.
    let entries: readonly DirectoryEntry[]
    try {
      entries = await list(path)
    } catch {
      skipped += 1
      return null
    }
    return walkEntries(path, relativePath, entries)
  }

  let rootEntries: readonly DirectoryEntry[]
  try {
    rootEntries = await list(rootPath)
  } catch (error) {
    // The root is the comparison itself: a failure there is not skippable.
    throw toReadableIoError(error)
  }

  const root = await walkEntries(rootPath, '', rootEntries)
  index.set('', root)
  return { root, index, skipped }
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
 * projects would not fit). Returns the paths that could not be read; their pair
 * is classified `modified` and counted as skipped.
 */
export async function digestContentCandidates(
  left: ScannedTree,
  right: ScannedTree,
  cache: ComparisonCache,
  read: ReadTextFile,
  hash: (text: string) => string,
  options: ConcurrencyOptions,
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

  await mapWithLimit(requested, options, async (path) => {
    try {
      const node = nodes.get(path)
      if (node === undefined) {
        throw new Error(`No scanned file at ${path}; call planContentReads first.`)
      }
      cache.hashes.set(path, {
        size: node.size,
        modifiedMs: node.modifiedMs,
        hash: hash(await read(path))
      })
    } catch (error) {
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
  /** In-flight body-read window; defaults to {@link DEFAULT_IO_CONCURRENCY}. */
  options: ConcurrencyOptions = {}
): Promise<DirectoryComparison> {
  try {
    const [left, right] = await Promise.all([
      scanDirectory(leftRoot, list),
      scanDirectory(rightRoot, list)
    ])

    // Digests go straight into the cache: only one body per in-flight read is
    // held in memory, which is what lets two real project trees be compared.
    const unreadable = await digestContentCandidates(
      left,
      right,
      cache,
      readTextFile,
      hash ?? sha256Hex,
      options
    )

    return compareScannedTrees(left, right, { contents: new Map(), cache, hash, unreadable })
  } catch (error) {
    throw toReadableIoError(error)
  }
}
