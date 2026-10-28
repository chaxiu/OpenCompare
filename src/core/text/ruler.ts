import type { DiffStatus } from '@shared/fixtures/types'
import type { DiffBlock, DiffRow } from './diff'

/**
 * The three non-`same` statuses a ruler band can carry. `same` rows never
 * produce a band; `conflict` belongs to the merge view and is ignored here.
 */
export type RulerStatus = Exclude<DiffStatus, 'same' | 'conflict'>

/** Caller-supplied track geometry. No pixel constants live in this module. */
export interface RulerGeometry {
  /** Full height of the ruler track, in the caller's unit (usually px). */
  readonly trackHeight: number
  /** Preferred minimum band height; sets how many buckets the track has. */
  readonly bandHeight: number
}

/**
 * One bounded run of a single non-`same` status on the ruler track. Only
 * aligned row indices and track positions — never line text or segments.
 */
export interface RulerBand {
  readonly status: RulerStatus
  readonly startRow: number
  readonly endRow: number
  readonly top: number
  readonly height: number
}

export interface RulerViewportInput {
  readonly scrollTop: number
  readonly viewportHeight: number
  readonly rowHeight: number
  readonly rowCount: number
  readonly trackHeight: number
}

export interface RulerViewportWindow {
  readonly top: number
  readonly height: number
}

export interface RulerJumpTarget {
  readonly blockIndex: number
  readonly startRow: number
  readonly scrollTop: number
}

/** Fixed status order; also the tie-break when two slots share a start row. */
const RULER_STATUSES = ['added', 'removed', 'modified'] as const

const EMPTY_BANDS: readonly RulerBand[] = Object.freeze([])
const ZERO_WINDOW: RulerViewportWindow = Object.freeze({ top: 0, height: 0 })

/** Maps a row status to its ruler slot, or `-1` when it paints nothing. */
function rulerRank(status: DiffStatus): number {
  if (status === 'added') return 0
  if (status === 'removed') return 1
  if (status === 'modified') return 2
  return -1
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Projects aligned diff rows onto a bounded set of ruler bands.
 *
 * A single pass assigns every non-`same` row to one of `bucketCount` position
 * buckets (at most one slot per status per bucket). Buckets are then walked in
 * row order and adjacent same-status spans are merged, so a high-resolution
 * track (bucket count = row count) yields exactly the maximal homogeneous
 * runs, while a low-resolution track never paints more bands than there are
 * runs (`bands.length <= bucketCount * 3` and `<= homogeneous run count`).
 *
 * @param rows Aligned rows from `diffLineTexts`; only `status` is read.
 * @param geometry Caller-supplied track height and preferred band height.
 */
export function buildRulerBands(
  rows: readonly DiffRow[],
  geometry: RulerGeometry
): readonly RulerBand[] {
  const rowCount = rows.length
  if (rowCount === 0) return EMPTY_BANDS

  const trackHeight = Number.isFinite(geometry.trackHeight)
    ? Math.max(0, geometry.trackHeight)
    : 0
  const bandHeight =
    Number.isFinite(geometry.bandHeight) && geometry.bandHeight > 0 ? geometry.bandHeight : 1
  const bucketCount = clampNumber(Math.floor(trackHeight / bandHeight), 1, rowCount)

  const slotStride = RULER_STATUSES.length
  const slotStarts = new Int32Array(bucketCount * slotStride).fill(-1)
  const slotEnds = new Int32Array(bucketCount * slotStride).fill(-1)

  for (let row = 0; row < rowCount; row += 1) {
    const rowStatus = rows[row].status
    const rank = rulerRank(rowStatus)
    if (rank === -1) continue

    const bucket = Math.min(bucketCount - 1, Math.floor((row * bucketCount) / rowCount))
    const slot = bucket * slotStride + rank
    if (slotStarts[slot] === -1) slotStarts[slot] = row
    slotEnds[slot] = row
  }

  const spans: { status: RulerStatus; startRow: number; endRow: number }[] = []

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const base = bucket * slotStride
    const present: number[] = []
    for (let rank = 0; rank < slotStride; rank += 1) {
      if (slotStarts[base + rank] !== -1) present.push(rank)
    }
    // Ascending start row, then the fixed status order on ties.
    present.sort((left, right) => {
      const delta = slotStarts[base + left] - slotStarts[base + right]
      return delta === 0 ? left - right : delta
    })

    for (const rank of present) {
      const startRow = slotStarts[base + rank]
      const endRow = slotEnds[base + rank]
      const last = spans[spans.length - 1]
      if (last !== undefined && last.status === RULER_STATUSES[rank] && last.endRow + 1 === startRow) {
        last.endRow = endRow
      } else {
        spans.push({ status: RULER_STATUSES[rank], startRow, endRow })
      }
    }
  }

  const scale = trackHeight / rowCount
  const bands: RulerBand[] = []
  for (const span of spans) {
    const top = clampNumber(span.startRow * scale, 0, trackHeight)
    const bottom = clampNumber((span.endRow + 1) * scale, 0, trackHeight)
    bands.push({
      status: span.status,
      startRow: span.startRow,
      endRow: span.endRow,
      top,
      height: Math.max(0, bottom - top)
    })
  }
  return bands
}

/**
 * Track ratio to 0-based aligned row: `clamp(floor(ratio * rowCount), 0, rowCount - 1)`.
 * `ratio = 1` lands on the last row, `NaN` behaves like 0, and an empty diff
 * returns `-1`.
 */
export function ratioToRow(ratio: number, rowCount: number): number {
  if (!(rowCount > 0)) return -1
  if (ratio >= 1) return rowCount - 1
  if (!(ratio > 0)) return 0
  return Math.min(rowCount - 1, Math.floor(ratio * rowCount))
}

/** 0-based row to track ratio, centred in the row so `ratioToRow` round-trips. */
export function rowToRatio(row: number, rowCount: number): number {
  if (!(rowCount > 0)) return 0
  if (!Number.isFinite(row)) return 0
  const clamped = clampNumber(Math.trunc(row), 0, rowCount - 1)
  return (clamped + 0.5) / rowCount
}

/** Scroll offset implied by a 0-based row with the caller's row height. */
export function scrollOffsetForRow(row: number, rowHeight: number): number {
  if (!Number.isFinite(row) || !Number.isFinite(rowHeight)) return 0
  return Math.max(0, row) * Math.max(0, rowHeight)
}

/**
 * Index of the block containing `row`, or the block nearest to it by row
 * distance (ties pick the lower index). Returns `-1` when there are no blocks.
 */
export function nearestBlockIndex(blocks: readonly DiffBlock[], row: number): number {
  if (blocks.length === 0) return -1
  const target = Number.isFinite(row) ? Math.trunc(row) : 0

  let best = -1
  let bestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]
    const distance =
      target < block.startRow
        ? block.startRow - target
        : target > block.endRow
          ? target - block.endRow
          : 0
    if (distance === 0) return index
    if (distance < bestDistance) {
      bestDistance = distance
      best = index
    }
  }
  return best
}

/** {@link nearestBlockIndex} for a track ratio instead of a row. */
export function nearestBlockIndexAtRatio(
  blocks: readonly DiffBlock[],
  ratio: number,
  rowCount: number
): number {
  return nearestBlockIndex(blocks, ratioToRow(ratio, rowCount))
}

/** Resolves a row to the target block, its first row and the scroll offset. */
export function resolveJumpTarget(
  blocks: readonly DiffBlock[],
  row: number,
  rowHeight: number
): RulerJumpTarget {
  const blockIndex = nearestBlockIndex(blocks, row)
  if (blockIndex === -1) return { blockIndex: -1, startRow: -1, scrollTop: 0 }

  const startRow = blocks[blockIndex].startRow
  return { blockIndex, startRow, scrollTop: scrollOffsetForRow(startRow, rowHeight) }
}

/** {@link resolveJumpTarget} for a click ratio on the ruler track. */
export function resolveJumpTargetAtRatio(
  blocks: readonly DiffBlock[],
  ratio: number,
  rowCount: number,
  rowHeight: number
): RulerJumpTarget {
  return resolveJumpTarget(blocks, ratioToRow(ratio, rowCount), rowHeight)
}

/**
 * Viewport window on the track for the current scroll position. Both ends are
 * clamped, so `top >= 0`, `height >= 0` and `top + height <= trackHeight`.
 */
export function computeViewportWindow(input: RulerViewportInput): RulerViewportWindow {
  const { scrollTop, viewportHeight, rowHeight, rowCount, trackHeight } = input
  if (!(rowCount > 0) || !(rowHeight > 0) || !(viewportHeight > 0) || !(trackHeight > 0)) {
    return ZERO_WINDOW
  }

  const contentHeight = rowCount * rowHeight
  if (!Number.isFinite(contentHeight) || contentHeight <= 0) return ZERO_WINDOW

  const visibleHeight = Math.min(viewportHeight, contentHeight)
  const height = Math.min(trackHeight, (trackHeight * visibleHeight) / contentHeight)
  const maxScroll = Math.max(0, contentHeight - visibleHeight)
  const scroll = Number.isFinite(scrollTop) ? clampNumber(scrollTop, 0, maxScroll) : 0
  const top = clampNumber((trackHeight * scroll) / contentHeight, 0, trackHeight - height)

  return { top, height }
}
