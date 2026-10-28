import { describe, expect, it } from 'vitest'
import type { DiffBlock, DiffRow } from './diff'
import {
  buildRulerBands,
  nearestBlockIndexAtRatio,
  ratioToRow,
  resolveJumpTargetAtRatio
} from './ruler'

/**
 * The product-qa fail geometry: 350,000 rows on a 608px track, 4px bands. A
 * bucket is ~2,300 rows wide, so a band painted from a single 20-row run is
 * ~0.035px tall — the sub-pixel case a click has to resolve through the ratio.
 */
const ROW_COUNT = 350_000
const TRACK_HEIGHT = 608
const BAND_HEIGHT = 4
const ROW_HEIGHT = 20
const RUN_LENGTH = 20
const RUN_STRIDE = 2_400

function makeRow(status: DiffRow['status'], index: number): DiffRow {
  return {
    status,
    leftLine: status === 'added' ? null : index + 1,
    rightLine: status === 'removed' ? null : index + 1,
    leftText: status === 'added' ? null : `left-${index}`,
    rightText: status === 'removed' ? null : `right-${index}`,
    leftIndex: index,
    rightIndex: index
  }
}

function makeBlock(index: number, startRow: number, endRow: number): DiffBlock {
  return {
    index,
    status: 'modified',
    startRow,
    endRow,
    leftStart: startRow,
    leftCount: endRow - startRow + 1,
    rightStart: startRow,
    rightCount: endRow - startRow + 1
  }
}

/** 350k rows with one 20-row difference block every 2,400 rows (~146 blocks). */
function rowModel(): { rows: DiffRow[]; blocks: DiffBlock[] } {
  const rows = new Array<DiffRow>(ROW_COUNT)
  for (let index = 0; index < ROW_COUNT; index += 1) {
    rows[index] = makeRow(index % RUN_STRIDE < RUN_LENGTH ? 'modified' : 'same', index)
  }

  const blocks: DiffBlock[] = []
  for (let startRow = 0; startRow + RUN_LENGTH <= ROW_COUNT; startRow += RUN_STRIDE) {
    blocks.push(makeBlock(blocks.length, startRow, startRow + RUN_LENGTH - 1))
  }
  return { rows, blocks }
}

describe('ruler hit boundaries at 350k rows', () => {
  const { rows, blocks } = rowModel()
  const bands = buildRulerBands(rows, { trackHeight: TRACK_HEIGHT, bandHeight: BAND_HEIGHT })

  it('resolves a sub-pixel band midpoint to the block that owns its first row', () => {
    expect(bands.length).toBeGreaterThan(2)
    // Every band here paints one 20-row run: 20 × (608 / 350,000) ≈ 0.035px.
    const subPixel = bands.filter((band) => band.height < 1)
    expect(subPixel.length).toBeGreaterThan(0)

    const samples = [bands[0], bands[Math.floor(bands.length / 2)], bands[bands.length - 1]]
    for (const band of samples) {
      expect(band.height).toBeLessThan(1)
      const ratio = (band.top + band.height / 2) / TRACK_HEIGHT
      const blockIndex = nearestBlockIndexAtRatio(blocks, ratio, ROW_COUNT)

      expect(blockIndex).toBeGreaterThanOrEqual(0)
      const block = blocks[blockIndex]
      expect(block.startRow).toBeLessThanOrEqual(band.startRow)
      expect(block.endRow).toBeGreaterThanOrEqual(band.startRow)
    }
  })

  it('merges adjacent same-status rows so a whole run resolves to one block', () => {
    const statuses: DiffRow['status'][] = [
      'same',
      'same',
      'modified',
      'modified',
      'modified',
      'modified',
      'modified',
      'same',
      'same',
      'same'
    ]
    const runRows = statuses.map((status, index) => makeRow(status, index))
    const runBlocks = [makeBlock(0, 2, 6)]

    // One bucket per row at this resolution: the run is a single band.
    const merged = buildRulerBands(runRows, { trackHeight: statuses.length, bandHeight: 1 })
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      status: 'modified',
      startRow: 2,
      endRow: 6,
      top: 2,
      height: 5
    })

    // Any ratio inside the band span resolves to the one block of the run.
    for (let step = 0; step <= 10; step += 1) {
      const ratio = 0.2 + step * 0.049
      expect(ratioToRow(ratio, statuses.length)).toBeGreaterThanOrEqual(2)
      expect(ratioToRow(ratio, statuses.length)).toBeLessThanOrEqual(6)
      expect(nearestBlockIndexAtRatio(runBlocks, ratio, statuses.length)).toBe(0)
    }
  })

  it('pins the first and last bucket as well as degenerate ratios', () => {
    expect(ratioToRow(0, ROW_COUNT)).toBe(0)
    expect(ratioToRow(1, ROW_COUNT)).toBe(ROW_COUNT - 1)
    // The lower clamp and the NaN branch both land on the first row.
    expect(ratioToRow(-1, ROW_COUNT)).toBe(0)
    expect(ratioToRow(Number.NaN, ROW_COUNT)).toBe(0)
    expect(ratioToRow(0.5, 0)).toBe(-1)

    const first = nearestBlockIndexAtRatio(blocks, 0, ROW_COUNT)
    expect(first).toBe(0)
    expect(blocks[first].startRow).toBe(0)

    // Row 349,999 is past the last 20-row run, so the ratio lands on the
    // nearest block rather than outside the list.
    const last = nearestBlockIndexAtRatio(blocks, 1, ROW_COUNT)
    expect(last).toBe(blocks.length - 1)
    expect(blocks[last].endRow).toBeLessThan(ROW_COUNT)

    const target = resolveJumpTargetAtRatio(blocks, 1, ROW_COUNT, ROW_HEIGHT)
    expect(target).toEqual({
      blockIndex: last,
      startRow: blocks[last].startRow,
      scrollTop: blocks[last].startRow * ROW_HEIGHT
    })
  })

  it('keeps every ratio inside the block list and monotonic across the track', () => {
    let previous = -1
    for (let step = 0; step <= 200; step += 1) {
      const ratio = step / 200
      const blockIndex = nearestBlockIndexAtRatio(blocks, ratio, ROW_COUNT)

      expect(blockIndex).toBeGreaterThanOrEqual(0)
      expect(blockIndex).toBeLessThan(blocks.length)
      expect(blockIndex).toBeGreaterThanOrEqual(previous)
      previous = blockIndex

      const target = resolveJumpTargetAtRatio(blocks, ratio, ROW_COUNT, ROW_HEIGHT)
      expect(target.blockIndex).toBe(blockIndex)
      expect(target.startRow).toBe(blocks[blockIndex].startRow)
      expect(target.scrollTop).toBe(blocks[blockIndex].startRow * ROW_HEIGHT)
    }
  })

  it('reports no hit for an empty block list instead of jumping to row 0', () => {
    const sameRows = Array.from({ length: 40 }, (_, index) => makeRow('same', index))

    expect(nearestBlockIndexAtRatio([], 0.5, sameRows.length)).toBe(-1)
    expect(nearestBlockIndexAtRatio([], 0, 0)).toBe(-1)
    expect(resolveJumpTargetAtRatio([], 0.5, sameRows.length, ROW_HEIGHT)).toEqual({
      blockIndex: -1,
      startRow: -1,
      scrollTop: 0
    })
    expect(resolveJumpTargetAtRatio([], 0, 0, ROW_HEIGHT)).toEqual({
      blockIndex: -1,
      startRow: -1,
      scrollTop: 0
    })
    expect(buildRulerBands([], { trackHeight: TRACK_HEIGHT, bandHeight: BAND_HEIGHT })).toEqual([])
    expect(buildRulerBands(sameRows, { trackHeight: TRACK_HEIGHT, bandHeight: BAND_HEIGHT })).toEqual(
      []
    )
  })
})
