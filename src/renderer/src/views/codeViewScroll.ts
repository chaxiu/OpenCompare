import { DIFF_ROW_HEIGHT } from '@renderer/components/DiffPane'

export interface CenteredScrollInput {
  readonly startRow: number
  readonly endRow: number
  readonly rowCount: number
  readonly viewportHeight: number
}

/** Largest legal `scrollTop`; a viewport that is missing or non-positive still bounds content. */
export function maxScrollTop(rowCount: number, viewportHeight: number): number {
  const contentHeight = Math.max(0, rowCount) * DIFF_ROW_HEIGHT
  const viewport = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight) : 0
  return Math.max(0, contentHeight - viewport)
}

/** Deterministic clamp into `[0, maxScroll]`; a non-finite value degrades to 0. */
export function clampScrollTop(value: number, maxScroll: number): number {
  const max = Number.isFinite(maxScroll) ? Math.max(0, maxScroll) : 0
  if (!Number.isFinite(value)) return 0
  return Math.min(max, Math.max(0, value))
}

/**
 * Vertical centre of one diff block, clamped to the pane's scroll range.
 * A short document, an unknown / zero viewport and a block taller than the
 * viewport fall back to the clamped block top so the first row stays visible.
 */
export function centeredScrollTop({
  startRow,
  endRow,
  rowCount,
  viewportHeight
}: CenteredScrollInput): number {
  const maxScroll = maxScrollTop(rowCount, viewportHeight)
  const start = Number.isFinite(startRow) ? startRow : 0
  const end = Number.isFinite(endRow) ? endRow : start
  const blockTop = Math.max(0, start) * DIFF_ROW_HEIGHT
  const blockHeight = Math.max(0, end - start + 1) * DIFF_ROW_HEIGHT
  const viewport = Number.isFinite(viewportHeight) ? viewportHeight : 0
  if (viewport <= 0 || blockHeight >= viewport) {
    return clampScrollTop(blockTop, maxScroll)
  }
  const target = Math.round(blockTop + blockHeight / 2 - viewport / 2)
  return clampScrollTop(target, maxScroll)
}
