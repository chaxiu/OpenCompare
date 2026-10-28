import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { DiffBlock, DiffRow } from './diff'
import { diffLineTexts } from './diff'
import {
  buildRulerBands,
  computeViewportWindow,
  nearestBlockIndex,
  nearestBlockIndexAtRatio,
  ratioToRow,
  resolveJumpTarget,
  resolveJumpTargetAtRatio,
  rowToRatio,
  scrollOffsetForRow
} from './ruler'
import type { RulerBand, RulerViewportWindow } from './ruler'

type RowStatus = DiffRow['status']

/** Minimal row shape: only `status` is read by the ruler projection. */
function makeRow(status: RowStatus, index: number): DiffRow {
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

function rowsOf(statuses: readonly RowStatus[]): DiffRow[] {
  return statuses.map((status, index) => makeRow(status, index))
}

function makeBlock(index: number, startRow: number, endRow: number): DiffBlock {
  return {
    index,
    status: 'added',
    startRow,
    endRow,
    leftStart: startRow,
    leftCount: endRow - startRow + 1,
    rightStart: startRow,
    rightCount: endRow - startRow + 1
  }
}

/** Count of maximal homogeneous non-`same` runs — the band-count ceiling. */
function countRuns(rows: readonly DiffRow[]): number {
  let runs = 0
  let previous: RowStatus = 'same'
  for (const row of rows) {
    if (row.status !== 'same' && row.status !== previous) runs += 1
    previous = row.status
  }
  return runs
}

function bandIntervals(bands: readonly RulerBand[]): { status: string; startRow: number; endRow: number }[] {
  return bands.map((band) => ({ status: band.status, startRow: band.startRow, endRow: band.endRow }))
}

/** Deterministic LCG so property-style tests stay reproducible. */
function makeRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

const STATUSES: readonly RowStatus[] = ['same', 'added', 'removed', 'modified']

describe('buildRulerBands', () => {
  it('merges adjacent same-status rows into maximal runs when the track is high resolution', () => {
    const rows = rowsOf([
      'same',
      'added',
      'added',
      'same',
      'modified',
      'removed',
      'removed',
      'same'
    ])
    // 8 rows at 10 units per band → 8 buckets, one per row.
    const bands = buildRulerBands(rows, { trackHeight: 80, bandHeight: 10 })

    expect(bandIntervals(bands)).toEqual([
      { status: 'added', startRow: 1, endRow: 2 },
      { status: 'modified', startRow: 4, endRow: 4 },
      { status: 'removed', startRow: 5, endRow: 6 }
    ])
    expect(bands[0]).toMatchObject({ top: 10, height: 20 })
    expect(bands[1]).toMatchObject({ top: 40, height: 10 })
    expect(bands[2]).toMatchObject({ top: 50, height: 20 })
  })

  it('keeps added and removed apart inside one difference block', () => {
    const rows = rowsOf(['same', 'added', 'removed', 'added', 'same'])
    const bands = buildRulerBands(rows, { trackHeight: 50, bandHeight: 10 })

    expect(bandIntervals(bands)).toEqual([
      { status: 'added', startRow: 1, endRow: 1 },
      { status: 'removed', startRow: 2, endRow: 2 },
      { status: 'added', startRow: 3, endRow: 3 }
    ])
  })

  it('covers every non-same row on a low-resolution track without linear growth', () => {
    const statuses: RowStatus[] = [
      'same',
      'added',
      'removed',
      'modified',
      'added',
      'removed',
      'same',
      'modified',
      'added',
      'removed',
      'modified',
      'same',
      'added',
      'removed'
    ]
    const rows = rowsOf(statuses)

    for (const trackHeight of [1, 5, 10, 20, 30]) {
      const bucketCount = Math.min(rows.length, Math.max(1, Math.floor(trackHeight / 10)))
      const bands = buildRulerBands(rows, { trackHeight, bandHeight: 10 })

      expect(bands.length).toBeLessThanOrEqual(bucketCount * 3)
      expect(bands.length).toBeLessThanOrEqual(countRuns(rows))

      statuses.forEach((status, row) => {
        if (status === 'same') return
        const covering = bands.some(
          (band) => band.status === status && band.startRow <= row && row <= band.endRow
        )
        expect(covering, `row ${row} (${status}) must be covered`).toBe(true)
      })

      for (let index = 1; index < bands.length; index += 1) {
        const previous = bands[index - 1]
        const current = bands[index]
        expect(previous.startRow).toBeLessThanOrEqual(current.startRow)
        if (previous.startRow === current.startRow) {
          const order = { added: 0, removed: 1, modified: 2 }
          expect(order[previous.status]).toBeLessThanOrEqual(order[current.status])
        }
      }

      for (const band of bands) {
        expect(band.top).toBeGreaterThanOrEqual(0)
        expect(band.height).toBeGreaterThanOrEqual(0)
        expect(band.top + band.height).toBeLessThanOrEqual(trackHeight + 1e-6)
      }
    }
  })

  it('matches maximal runs for random patterns at high resolution', () => {
    const random = makeRandom(20261028)
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const length = 1 + Math.floor(random() * 40)
      const rows = rowsOf(Array.from({ length }, () => STATUSES[Math.floor(random() * STATUSES.length)]))

      const expected: { status: string; startRow: number; endRow: number }[] = []
      rows.forEach((row, rowIndex) => {
        if (row.status === 'same') return
        const last = expected[expected.length - 1]
        if (last && last.status === row.status && last.endRow + 1 === rowIndex) last.endRow = rowIndex
        else expected.push({ status: row.status, startRow: rowIndex, endRow: rowIndex })
      })

      const bands = buildRulerBands(rows, { trackHeight: length * 10, bandHeight: 10 })
      expect(bandIntervals(bands)).toEqual(expected)
    }
  })

  it('projects 358k rows in a single pass with bounded output', () => {
    const rowCount = 358_000
    const rows: DiffRow[] = new Array(rowCount)
    const cycle: readonly RowStatus[] = ['added', 'removed', 'modified', 'same']
    const sample: Record<string, DiffRow> = {
      added: makeRow('added', 0),
      removed: makeRow('removed', 0),
      modified: makeRow('modified', 0),
      same: makeRow('same', 0)
    }
    for (let index = 0; index < rowCount; index += 1) rows[index] = sample[cycle[index % 4]]

    const reads = new Uint8Array(rowCount)
    let totalReads = 0
    const countingRows = new Proxy(rows, {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) {
          const index = Number(property)
          if (index < rowCount) reads[index] += 1
          totalReads += 1
        }
        return Reflect.get(target, property, receiver)
      }
    })

    const trackHeight = 800
    const bandHeight = 3
    const bucketCount = Math.min(rowCount, Math.max(1, Math.floor(trackHeight / bandHeight)))
    const bands = buildRulerBands(countingRows, { trackHeight, bandHeight })

    // One pass: every row index read exactly once.
    expect(totalReads).toBe(rowCount)
    expect(reads.every((count) => count === 1)).toBe(true)

    expect(bands.length).toBeLessThanOrEqual(bucketCount * 3)
    expect(bands.length).toBeLessThanOrEqual(countRuns(rows))
    expect(bands.length).toBeLessThan(rowCount / 100)
    expect(bands.length).toBeGreaterThan(0)
  })

  it('never reads line text or inline segments and emits geometry-only bands', () => {
    const guardedRow = new Proxy(makeRow('modified', 3), {
      get(target, property, receiver) {
        if (
          property === 'leftText' ||
          property === 'rightText' ||
          property === 'leftSegments' ||
          property === 'rightSegments'
        ) {
          throw new Error(`ruler must not read ${String(property)}`)
        }
        return Reflect.get(target, property, receiver)
      }
    })
    const rows = [makeRow('same', 0), guardedRow, makeRow('same', 1)]

    const bands = buildRulerBands(rows, { trackHeight: 30, bandHeight: 10 })

    expect(bandIntervals(bands)).toEqual([{ status: 'modified', startRow: 1, endRow: 1 }])
    expect(Object.keys(bands[0]).sort()).toEqual(['endRow', 'height', 'startRow', 'status', 'top'])
    expect(JSON.stringify(bands)).not.toContain('left-')
    expect(JSON.stringify(bands)).not.toContain('right-')
  })

  it('does not mutate frozen input rows', () => {
    const rows = rowsOf(['same', 'added', 'removed', 'modified'])
    const blocks = [makeBlock(0, 1, 3)]
    const before = JSON.stringify({ rows, blocks })

    Object.freeze(rows)
    rows.forEach((row) => Object.freeze(row))
    Object.freeze(blocks)
    blocks.forEach((block) => Object.freeze(block))

    expect(() => {
      buildRulerBands(rows, { trackHeight: 40, bandHeight: 10 })
      nearestBlockIndex(blocks, 2)
      resolveJumpTarget(blocks, 2, 20)
    }).not.toThrow()
    expect(JSON.stringify({ rows, blocks })).toBe(before)
  })
})

describe('ratio and row conversion', () => {
  it('converts ratios with clamping, floor and the last-row rule', () => {
    expect(ratioToRow(0, 10)).toBe(0)
    expect(ratioToRow(0.05, 10)).toBe(0)
    expect(ratioToRow(0.1, 10)).toBe(1)
    expect(ratioToRow(0.999, 10)).toBe(9)
    expect(ratioToRow(1, 10)).toBe(9)
    expect(ratioToRow(4, 10)).toBe(9)
    expect(ratioToRow(-2, 10)).toBe(0)
    expect(ratioToRow(Number.NaN, 10)).toBe(0)
    expect(ratioToRow(0.5, 0)).toBe(-1)
    expect(ratioToRow(0.5, -3)).toBe(-1)
  })

  it('round-trips every row through ratio for small and large row counts', () => {
    for (const rowCount of [1, 2, 7, 100, 358_000]) {
      for (let row = 0; row < rowCount; row += rowCount > 100 ? 997 : 1) {
        expect(ratioToRow(rowToRatio(row, rowCount), rowCount)).toBe(row)
      }
      expect(ratioToRow(rowToRatio(rowCount - 1, rowCount), rowCount)).toBe(rowCount - 1)
    }
  })

  it('keeps row ratios inside [0, 1) and handles invalid input', () => {
    expect(rowToRatio(0, 10)).toBeGreaterThanOrEqual(0)
    expect(rowToRatio(9, 10)).toBeLessThan(1)
    expect(rowToRatio(-5, 10)).toBe(rowToRatio(0, 10))
    expect(rowToRatio(50, 10)).toBe(rowToRatio(9, 10))
    expect(rowToRatio(3, 0)).toBe(0)
    expect(rowToRatio(Number.NaN, 10)).toBe(0)
  })

  it('derives scroll offsets from rows', () => {
    expect(scrollOffsetForRow(0, 20)).toBe(0)
    expect(scrollOffsetForRow(5, 20)).toBe(100)
    expect(scrollOffsetForRow(-2, 20)).toBe(0)
    expect(scrollOffsetForRow(Number.NaN, 20)).toBe(0)
  })
})

describe('nearest block and jump targets', () => {
  const blocks = [makeBlock(0, 2, 4), makeBlock(1, 8, 9)]

  it('returns the containing block, else the nearest by row distance', () => {
    expect(nearestBlockIndex(blocks, 2)).toBe(0)
    expect(nearestBlockIndex(blocks, 3)).toBe(0)
    expect(nearestBlockIndex(blocks, 9)).toBe(1)
    expect(nearestBlockIndex(blocks, 0)).toBe(0)
    expect(nearestBlockIndex(blocks, 5)).toBe(0)
    expect(nearestBlockIndex(blocks, 7)).toBe(1)
    expect(nearestBlockIndex(blocks, 1000)).toBe(1)
    expect(nearestBlockIndex([], 3)).toBe(-1)
  })

  it('breaks row-distance ties towards the lower block index', () => {
    expect(nearestBlockIndex(blocks, 6)).toBe(0)
    expect(nearestBlockIndex([makeBlock(0, 0, 0), makeBlock(1, 2, 2)], 1)).toBe(0)
  })

  it('accepts a track ratio as the hit point', () => {
    expect(nearestBlockIndexAtRatio(blocks, 0.3, 10)).toBe(0)
    expect(nearestBlockIndexAtRatio(blocks, 0.75, 10)).toBe(1)
    expect(nearestBlockIndexAtRatio(blocks, 0, 10)).toBe(0)
    expect(nearestBlockIndexAtRatio([], 0.5, 10)).toBe(-1)
  })

  it('resolves the block start row and an exact scroll offset', () => {
    const rowHeight = 20
    expect(resolveJumpTarget(blocks, 7, rowHeight)).toEqual({
      blockIndex: 1,
      startRow: 8,
      scrollTop: 8 * rowHeight
    })
    expect(resolveJumpTarget(blocks, 3, rowHeight)).toEqual({
      blockIndex: 0,
      startRow: 2,
      scrollTop: 2 * rowHeight
    })
    expect(resolveJumpTargetAtRatio(blocks, 0.95, 100, rowHeight)).toEqual({
      blockIndex: 1,
      startRow: 8,
      scrollTop: 8 * rowHeight
    })
    expect(resolveJumpTarget([], 4, rowHeight)).toEqual({
      blockIndex: -1,
      startRow: -1,
      scrollTop: 0
    })
    expect(resolveJumpTargetAtRatio([], 0.5, 100, rowHeight)).toEqual({
      blockIndex: -1,
      startRow: -1,
      scrollTop: 0
    })
  })
})

describe('computeViewportWindow', () => {
  it('returns a zero window for empty or degenerate inputs', () => {
    const base = { scrollTop: 0, viewportHeight: 100, rowHeight: 20, rowCount: 10, trackHeight: 200 }
    expect(computeViewportWindow({ ...base, rowCount: 0 })).toEqual({ top: 0, height: 0 })
    expect(computeViewportWindow({ ...base, viewportHeight: 0 })).toEqual({ top: 0, height: 0 })
    expect(computeViewportWindow({ ...base, rowHeight: 0 })).toEqual({ top: 0, height: 0 })
    expect(computeViewportWindow({ ...base, trackHeight: 0 })).toEqual({ top: 0, height: 0 })
  })

  it('scales and clamps the scroll window onto the track', () => {
    const base = { viewportHeight: 400, rowHeight: 20, rowCount: 100, trackHeight: 200 }
    // content 2000, visible 400 → window is a fifth of the track.
    expect(computeViewportWindow({ ...base, scrollTop: 0 })).toEqual({ top: 0, height: 40 })
    expect(computeViewportWindow({ ...base, scrollTop: 800 })).toEqual({ top: 80, height: 40 })
    expect(computeViewportWindow({ ...base, scrollTop: -50 })).toEqual({ top: 0, height: 40 })
    expect(computeViewportWindow({ ...base, scrollTop: 1e9 })).toEqual({ top: 160, height: 40 })
    expect(computeViewportWindow({ ...base, scrollTop: Number.NaN })).toEqual({ top: 0, height: 40 })
  })

  it('fills the whole track when the viewport covers the document', () => {
    expect(
      computeViewportWindow({
        scrollTop: 400,
        viewportHeight: 5000,
        rowHeight: 20,
        rowCount: 10,
        trackHeight: 200
      })
    ).toEqual({ top: 0, height: 200 })
  })

  it('always returns a window inside the track', () => {
    const random = makeRandom(7)
    for (let iteration = 0; iteration < 500; iteration += 1) {
      const window: RulerViewportWindow = computeViewportWindow({
        scrollTop: Math.floor(random() * 5000) - 500,
        viewportHeight: Math.floor(random() * 1200),
        rowHeight: 1 + Math.floor(random() * 40),
        rowCount: Math.floor(random() * 2000),
        trackHeight: Math.floor(random() * 600)
      })
      expect(window.top).toBeGreaterThanOrEqual(0)
      expect(window.height).toBeGreaterThanOrEqual(0)
      expect(window.top + window.height).toBeLessThanOrEqual(600 + 1e-6)
    }
  })
})

describe('diff boundaries', () => {
  const geometry = { trackHeight: 30, bandHeight: 10 }

  it('handles an empty diff', () => {
    const result = diffLineTexts('', '')
    expect(result.rows).toHaveLength(0)
    expect(buildRulerBands(result.rows, geometry)).toEqual([])
    expect(nearestBlockIndex(result.blocks, 0)).toBe(-1)
    expect(resolveJumpTarget(result.blocks, 0, 20)).toEqual({
      blockIndex: -1,
      startRow: -1,
      scrollTop: 0
    })
    expect(
      computeViewportWindow({
        scrollTop: 0,
        viewportHeight: 100,
        rowHeight: 20,
        rowCount: 0,
        trackHeight: 200
      })
    ).toEqual({ top: 0, height: 0 })
  })

  it('keeps an all-same diff band-free while the viewport still scales', () => {
    const result = diffLineTexts('alpha\nbeta\ngamma', 'alpha\nbeta\ngamma')
    expect(result.rows).toHaveLength(3)
    expect(result.blocks).toHaveLength(0)
    expect(buildRulerBands(result.rows, geometry)).toEqual([])
    expect(
      computeViewportWindow({
        scrollTop: 0,
        viewportHeight: 40,
        rowHeight: 20,
        rowCount: 3,
        trackHeight: 60
      })
    ).toEqual({ top: 0, height: 40 })
  })

  it('paints only removed bands for a left-only deletion', () => {
    const result = diffLineTexts('alpha\nbeta\ngamma', 'alpha\ngamma')
    const bands = buildRulerBands(result.rows, geometry)

    expect(bandIntervals(bands)).toEqual([{ status: 'removed', startRow: 1, endRow: 1 }])
    expect(bands[0]).toMatchObject({ top: 10, height: 10 })
  })

  it('paints only added bands for a right-only insertion', () => {
    const result = diffLineTexts('alpha\ngamma', 'alpha\nbeta\ngamma')
    const bands = buildRulerBands(result.rows, geometry)

    expect(bandIntervals(bands)).toEqual([{ status: 'added', startRow: 1, endRow: 1 }])
    expect(bands[0]).toMatchObject({ top: 10, height: 10 })
  })

  it('handles a single-row diff without going out of bounds', () => {
    const modified = diffLineTexts('left', 'right')
    expect(bandIntervals(buildRulerBands(modified.rows, { trackHeight: 10, bandHeight: 10 }))).toEqual([
      { status: 'modified', startRow: 0, endRow: 0 }
    ])
    expect(scrollOffsetForRow(0, 20)).toBe(0)
  })

  it('agrees on row counts and band intervals with and without a trailing newline', () => {
    const plain = diffLineTexts('alpha\nbeta', 'alpha\ngamma')
    const trailing = diffLineTexts('alpha\nbeta\n', 'alpha\ngamma\n')

    expect(trailing.rows).toHaveLength(plain.rows.length)
    expect(bandIntervals(buildRulerBands(trailing.rows, { trackHeight: 20, bandHeight: 10 }))).toEqual(
      bandIntervals(buildRulerBands(plain.rows, { trackHeight: 20, bandHeight: 10 }))
    )
  })

  it('agrees on row counts and band intervals between CRLF and LF input', () => {
    const lf = diffLineTexts('alpha\nbeta', 'alpha\ngamma')
    const crlf = diffLineTexts('alpha\r\nbeta', 'alpha\r\ngamma')

    expect(crlf.rows).toHaveLength(lf.rows.length)
    expect(bandIntervals(buildRulerBands(crlf.rows, { trackHeight: 20, bandHeight: 10 }))).toEqual(
      bandIntervals(buildRulerBands(lf.rows, { trackHeight: 20, bandHeight: 10 }))
    )
  })
})

describe('purity', () => {
  it('imports only local types and pure helpers', () => {
    const source = readFileSync(fileURLToPath(new URL('./ruler.ts', import.meta.url)), 'utf8')
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1])

    expect(imports.length).toBeGreaterThan(0)
    for (const sourcePath of imports) {
      expect(sourcePath === './diff' || sourcePath.startsWith('@shared/')).toBe(true)
    }
    for (const forbidden of [
      "'electron'",
      "'react'",
      "'react-dom'",
      "from 'diff'",
      "'node-diff3'",
      'document.',
      'window.',
      'ipcRenderer',
      '@renderer',
      'PlatformPort'
    ]) {
      expect(source).not.toContain(forbidden)
    }
  })
})
