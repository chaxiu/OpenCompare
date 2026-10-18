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

/** Recursively scans `rootPath`, returning the tree plus a relative-path index. */
export async function scanDirectory(
  rootPath: string,
  list: ListDirectory
): Promise<ScannedTree> {
  const index = new Map<string, ScannedNode>()

  async function walk(path: string, relativePath: string): Promise<ScannedNode> {
    const entries = await list(path)
    const children: ScannedNode[] = []

    for (const entry of entries) {
      const childRelative = relativePath === '' ? entry.name : `${relativePath}/${entry.name}`
      const child = entry.isDirectory
        ? await walk(entry.path, childRelative)
        : {
            name: entry.name,
            path: entry.path,
            kind: 'file' as const,
            size: entry.size,
            modifiedMs: entry.modifiedMs,
            children: [] as readonly ScannedNode[]
          }
      index.set(childRelative, child)
      children.push(child)
    }

    children.sort((left, right) => left.name.localeCompare(right.name))
    return { name: basename(path), path, kind: 'directory', size: 0, modifiedMs: 0, children }
  }

  const root = await walk(rootPath, '')
  index.set('', root)
  return { root, index }
}

interface CompareContext {
  readonly contents: ReadonlyMap<string, string>
  readonly cache: ComparisonCache
  readonly hash: (text: string) => string
}

export interface ComparisonInputs {
  /** Absolute path to body, for exactly the files {@link planContentReads} asked for. */
  readonly contents: ReadonlyMap<string, string>
  readonly cache: ComparisonCache
  /** Digest implementation; defaults to the built-in synchronous SHA-256. */
  readonly hash?: (text: string) => string
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
    hash: inputs.hash ?? sha256Hex
  }
  const root = buildNode('', left.root, right.root, context)
  return {
    leftRoot: left.root.path,
    rightRoot: right.root.path,
    leftName: left.root.name,
    rightName: right.root.name,
    root,
    counts: root.counts,
    fileCount: FILE_DIFF_STATUSES.reduce((total, status) => total + root.counts[status], 0)
  }
}

/**
 * Scans both roots and compares them, reading file bodies only where the size /
 * mtime fast path is inconclusive.
 */
export async function compareDirectories(
  leftRoot: string,
  rightRoot: string,
  list: ListDirectory,
  readTextFile: ReadTextFile,
  cache: ComparisonCache,
  /** Digest implementation; defaults to the built-in synchronous SHA-256. */
  hash?: (text: string) => string
): Promise<DirectoryComparison> {
  const [left, right] = await Promise.all([
    scanDirectory(leftRoot, list),
    scanDirectory(rightRoot, list)
  ])

  const requested = planContentReads(left, right, cache)
  const entries = await Promise.all(
    requested.map(async (path) => [path, await readTextFile(path)] as const)
  )

  return compareScannedTrees(left, right, { contents: new Map(entries), cache, hash })
}
