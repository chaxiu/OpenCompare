/**
 * Flat, reference-only row index of a directory comparison tree.
 *
 * The view used to clone the whole tree twice (filter + per-side projection)
 * before rendering it, which cannot survive a million-file comparison. This
 * model instead walks the *original* semantic tree once per
 * `(filter, side, collapsed set)` and records just the row nodes plus their
 * depth, so a virtualiser can address any row by index without materialising
 * anything per node.
 *
 * The semantics are exactly those of `filterDirectoryTree` →
 * `projectDirectoryTree` → pre-order walk (the root is row 0): files are kept
 * by status, a directory is kept when it holds at least one matching file
 * (except under `all`, where empty directories stay), and the projection only
 * drops a node when the side has no path for it. Every kept directory keeps
 * its own row, even when the projection leaves it without children.
 */
import type { DirectoryDiffNode, FileDiffStatus } from './compare'
import { FILE_DIFF_STATUSES } from './compare'
import type { DirectoryFilter } from './filter'
import { matchesFilter } from './filter'

/** Single row height (Tailwind `h-6`) shared by the tree and its virtualiser. */
export const DIRECTORY_ROW_HEIGHT = 24

/** One visible row: the semantic node plus its indentation, never a copy. */
export interface DirectoryRow {
  readonly node: DirectoryDiffNode
  readonly depth: number
  /** False only for a collapsed directory row; files are always leaves. */
  readonly open: boolean
}

/** Random access over the rows currently visible for one filter and side. */
export interface DirectoryRowModel {
  readonly length: number
  at(index: number): DirectoryRow | undefined
}

/** File counts of the files a filter lets through, taken from the root aggregate. */
export function visibleDirectoryCounts(
  root: DirectoryDiffNode,
  filter: DirectoryFilter
): Record<FileDiffStatus, number> {
  const counts: Record<FileDiffStatus, number> = { same: 0, added: 0, removed: 0, modified: 0 }
  for (const status of FILE_DIFF_STATUSES) {
    if (filter === 'all' || matchesFilter(status, filter)) counts[status] = root.counts[status]
  }
  return counts
}

/** Whether any file that `filter` accepts lives in this subtree. */
function hasMatchingFile(
  counts: Readonly<Record<FileDiffStatus, number>>,
  filter: DirectoryFilter
): boolean {
  return FILE_DIFF_STATUSES.some(
    (status) => matchesFilter(status, filter) && counts[status] > 0
  )
}

function survivesFilter(node: DirectoryDiffNode, filter: DirectoryFilter): boolean {
  // `all` keeps every node, including directories without files.
  if (filter === 'all') return true
  if (node.kind === 'file') return matchesFilter(node.status, filter)
  return hasMatchingFile(node.counts, filter)
}

function existsOnSide(node: DirectoryDiffNode, side: 'left' | 'right'): boolean {
  return (side === 'left' ? node.leftPath : node.rightPath) !== undefined
}

/**
 * Builds the visible row index for one side. The returned rows reference the
 * comparison's own nodes, so a view can sample any row without a clone step.
 */
export function buildDirectoryRowModel(
  root: DirectoryDiffNode,
  filter: DirectoryFilter,
  side: 'left' | 'right',
  collapsedPaths: readonly string[]
): DirectoryRowModel {
  const collapsed = new Set(collapsedPaths)
  const nodes: DirectoryDiffNode[] = []
  const depths: number[] = []
  const opens: boolean[] = []

  function visit(node: DirectoryDiffNode, depth: number): void {
    if (!existsOnSide(node, side) || !survivesFilter(node, filter)) return
    const open = node.kind === 'directory' && !collapsed.has(node.relativePath)
    nodes.push(node)
    depths.push(depth)
    opens.push(open)
    if (node.kind !== 'directory' || !open) return
    for (const child of node.children) visit(child, depth + 1)
  }

  visit(root, 0)

  return {
    length: nodes.length,
    at(index: number): DirectoryRow | undefined {
      const node = nodes[index]
      if (node === undefined) return undefined
      return { node, depth: depths[index], open: opens[index] }
    }
  }
}
