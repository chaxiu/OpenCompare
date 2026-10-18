/**
 * Pure tree shaping for the directory comparison view: per-status filtering and
 * per-side projection.
 *
 * Filters keep matching files *and their ancestor directories*, so the pruned
 * tree still reads as a path hierarchy. Projection keeps only the nodes that
 * exist on one side, which is how a missing file is expressed (it is simply
 * absent from that pane).
 */
import type { DirectoryDiffNode, FileDiffStatus } from './compare'
import { FILE_DIFF_STATUSES } from './compare'

export type DirectoryFilter = 'all' | 'differences' | 'left-only' | 'right-only' | 'same'

export const DIRECTORY_FILTERS: readonly DirectoryFilter[] = [
  'all',
  'differences',
  'left-only',
  'right-only',
  'same'
]

/** Whether a file of the given status should be visible under `filter`. */
export function matchesFilter(status: FileDiffStatus, filter: DirectoryFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'differences':
      return status !== 'same'
    case 'left-only':
      return status === 'removed'
    case 'right-only':
      return status === 'added'
    case 'same':
      return status === 'same'
  }
}

/** Keeps matching files and every ancestor directory needed to reach them. */
export function filterDirectoryTree(
  node: DirectoryDiffNode,
  filter: DirectoryFilter
): DirectoryDiffNode | null {
  if (filter === 'all') return node
  if (node.kind === 'file') return matchesFilter(node.status, filter) ? node : null

  const children = node.children
    .map((child) => filterDirectoryTree(child, filter))
    .filter((child): child is DirectoryDiffNode => child !== null)

  if (children.length === 0) return null
  return { ...node, children }
}

/** Keeps nodes that exist on `side`; a node absent from a side prunes its subtree. */
export function projectDirectoryTree(
  node: DirectoryDiffNode,
  side: 'left' | 'right'
): DirectoryDiffNode | null {
  const path = side === 'left' ? node.leftPath : node.rightPath
  if (path === undefined) return null
  if (node.kind === 'file') return node

  const children = node.children
    .map((child) => projectDirectoryTree(child, side))
    .filter((child): child is DirectoryDiffNode => child !== null)

  return { ...node, children }
}

/** File counts of a (possibly filtered or projected) subtree. */
export function countTreeFiles(
  node: DirectoryDiffNode | null
): Readonly<Record<FileDiffStatus, number>> {
  const counts: Record<FileDiffStatus, number> = { same: 0, added: 0, removed: 0, modified: 0 }
  if (node === null) return counts

  if (node.kind === 'file') {
    counts[node.status] += 1
    return counts
  }
  for (const child of node.children) {
    const childCounts = countTreeFiles(child)
    for (const status of FILE_DIFF_STATUSES) counts[status] += childCounts[status]
  }
  return counts
}
