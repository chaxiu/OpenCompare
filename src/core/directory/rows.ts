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

/**
 * Tallest content box the browser will lay out. Blink caps scrollable content
 * at 2^24 px (16,777,216) and silently clips whatever exceeds it, which is why
 * a 1.5M-row tree (`rows * 24` ≈ 3.6e7 px) could never be scrolled past row
 * ~699k. The tree therefore caps its container at one pixel below that limit
 * and maps rows onto the available offset instead of multiplying by row height.
 */
export const DIRECTORY_MAX_TREE_HEIGHT = 16_777_215

/** Scroll geometry of one tree pane: content height plus the row ↔ offset map. */
export interface DirectoryScrollMap {
  /** Container height the tree must render, never above {@link DIRECTORY_MAX_TREE_HEIGHT}. */
  readonly contentHeight: number
  /** Largest scroll offset reachable for this viewport height. */
  readonly maxScrollOffset: number
  /** True when the natural height overflowed and rows share a compressed map. */
  readonly scaled: boolean
  /** Content offset of a row's top: identity below the cap, strictly increasing above. */
  offsetForIndex(index: number): number
  /** Continuous (fractional) row index at the top of the viewport for `offset`. */
  rowPositionForOffset(offset: number): number
  /** Integer row index at the top of the viewport for `offset`. */
  indexForOffset(offset: number): number
  /** Inclusive, ordered rows to render inside the viewport at `offset`. */
  visibleRange(offset: number, overscan: number): { readonly start: number; readonly end: number }
  /** Content offset of a row's top while the viewport sits at `offset`. */
  rowTop(index: number, offset: number): number
}

/**
 * Builds the row ↔ scroll-offset map for one pane.
 *
 * Below the browser cap this is the identity (`row * 24`), so every existing
 * pixel offset keeps its exact meaning. Above the cap the container height is
 * pinned to {@link DIRECTORY_MAX_TREE_HEIGHT} and each row occupies a slice of
 * the reachable offset instead: `offsetForIndex` stays strictly increasing,
 * the last row lands exactly on the maximum scroll offset, and
 * `rowPositionForOffset` gives the renderer a continuous anchor so the window
 * scrolls smoothly instead of clustering the tail into a dead zone.
 */
export function createDirectoryScrollMap(
  rowCount: number,
  viewportHeight: number
): DirectoryScrollMap {
  const rows = Math.max(0, Math.floor(rowCount))
  const viewport = Math.max(0, viewportHeight)
  const scaled = rows * DIRECTORY_ROW_HEIGHT > DIRECTORY_MAX_TREE_HEIGHT
  const contentHeight = scaled ? DIRECTORY_MAX_TREE_HEIGHT : rows * DIRECTORY_ROW_HEIGHT
  const maxScrollOffset = Math.max(0, contentHeight - viewport)
  // Pixels each row may claim once compressed; 0 only when nothing can scroll.
  const rowStep = scaled && rows > 1 && maxScrollOffset > 0 ? maxScrollOffset / (rows - 1) : 0
  const visibleRows = viewport / DIRECTORY_ROW_HEIGHT

  function clampOffset(offset: number): number {
    if (!Number.isFinite(offset)) return 0
    return Math.min(Math.max(offset, 0), maxScrollOffset)
  }

  function offsetForIndex(index: number): number {
    const clamped = Math.min(Math.max(index, 0), Math.max(0, rows - 1))
    return scaled ? clamped * rowStep : clamped * DIRECTORY_ROW_HEIGHT
  }

  function rowPositionForOffset(offset: number): number {
    const clamped = clampOffset(offset)
    if (!scaled) return clamped / DIRECTORY_ROW_HEIGHT
    if (maxScrollOffset === 0) return 0
    // At the maximum offset the last row sits at the bottom of the viewport,
    // so the tail is rendered instead of leaving the final viewport blank.
    return (clamped / maxScrollOffset) * Math.max(0, rows - visibleRows)
  }

  function indexForOffset(offset: number): number {
    return Math.min(Math.max(Math.floor(rowPositionForOffset(offset)), 0), Math.max(0, rows - 1))
  }

  function visibleRange(
    offset: number,
    overscan: number
  ): { readonly start: number; readonly end: number } {
    const position = rowPositionForOffset(offset)
    const padding = Math.max(0, Math.floor(overscan))
    return {
      start: Math.max(0, Math.floor(position) - padding),
      end: Math.min(rows - 1, Math.floor(position) + Math.ceil(visibleRows) + padding)
    }
  }

  function rowTop(index: number, offset: number): number {
    if (!scaled) return index * DIRECTORY_ROW_HEIGHT
    return clampOffset(offset) + (index - rowPositionForOffset(offset)) * DIRECTORY_ROW_HEIGHT
  }

  return {
    contentHeight,
    maxScrollOffset,
    scaled,
    offsetForIndex,
    rowPositionForOffset,
    indexForOffset,
    visibleRange,
    rowTop
  }
}

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
