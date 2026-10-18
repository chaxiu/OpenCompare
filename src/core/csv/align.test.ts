import Papa from 'papaparse'
import { describe, expect, it } from 'vitest'
import { CSV_SCENE } from '@shared/fixtures'
import type { CsvSample } from '@shared/fixtures'
import { EMPTY_CSV_ALIGN, alignCsvTables, commonCsvColumns } from './align'
import type { CsvTableData } from './align'

/** Mirrors the renderer's `parseCsvTable` so the engine is fed the real sample. */
function parse(sample: CsvSample): CsvTableData {
  const result = Papa.parse<string[]>(sample.text.trimEnd(), { delimiter: sample.delimiter })
  const [header, ...rows] = result.data
  return { header, rows }
}

const LEFT = parse(CSV_SCENE.left)
const RIGHT = parse(CSV_SCENE.right)

/** Deterministic shuffle, so "shuffled input" is reproducible. */
function shuffle<T>(items: readonly T[], seed: number): T[] {
  const out = items.slice()
  let state = seed
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (state * 1664525 + 1013904223) % 4294967296
    const j = state % (i + 1)
    const swap = out[i]
    out[i] = out[j]
    out[j] = swap
  }
  return out
}

describe('alignCsvTables', () => {
  it('reproduces the sample answer key for order_id', () => {
    const result = alignCsvTables(LEFT, RIGHT, CSV_SCENE.keyColumns)

    expect(result.counts).toEqual({
      same: CSV_SCENE.composition.same,
      added: CSV_SCENE.composition.added,
      removed: CSV_SCENE.composition.removed,
      modified: CSV_SCENE.composition.modified
    })
    // 1,124 left rows + 24 transfers = 1,240 aligned rows.
    expect(result.rows.length).toBe(
      CSV_SCENE.composition.same +
        CSV_SCENE.composition.modified +
        CSV_SCENE.composition.removed +
        CSV_SCENE.composition.added
    )
  })

  it('pairs shuffled row orders identically', () => {
    const baseline = alignCsvTables(LEFT, RIGHT, ['order_id'])
    const shuffled = alignCsvTables(
      { header: LEFT.header, rows: shuffle(LEFT.rows, 11) },
      { header: RIGHT.header, rows: shuffle(RIGHT.rows, 22) },
      ['order_id']
    )

    expect(shuffled.counts).toEqual(baseline.counts)
    expect(shuffled.counts).toEqual({
      same: CSV_SCENE.composition.same,
      added: CSV_SCENE.composition.added,
      removed: CSV_SCENE.composition.removed,
      modified: CSV_SCENE.composition.modified
    })

    const matched = shuffled.rows.find((row) => row.key[0] === 'ORD-100122')
    expect(matched?.status).toBe('same')
  })

  it('absorbs the column offset and keeps the right-only column out of the diff', () => {
    const result = alignCsvTables(LEFT, RIGHT, ['order_id'])

    expect(LEFT.header).toHaveLength(7)
    expect(RIGHT.header).toHaveLength(8)
    expect(result.columns.map((column) => column.name)).toEqual([
      'order_id',
      'account',
      'sku',
      'qty',
      'unit_price',
      'status',
      'updated_at',
      'region'
    ])
    expect(result.columns.at(-1)).toEqual({ name: 'region', presence: 'right', key: false })
    expect(result.columns.some((column) => column.key && column.name === 'order_id')).toBe(true)

    // `region` exists on one side only: were it part of the comparison every
    // row would be modified.
    expect(result.counts.modified).toBe(CSV_SCENE.composition.modified)
    expect(result.rows.some((row) => row.changedColumns.includes('region'))).toBe(false)
  })

  it('supports single and multi-column keys', () => {
    const single = alignCsvTables(LEFT, RIGHT, ['order_id'])
    const multi = alignCsvTables(LEFT, RIGHT, ['order_id', 'sku'])
    const reversed = alignCsvTables(LEFT, RIGHT, ['sku', 'order_id'])

    expect(multi.counts).toEqual(single.counts)
    expect(reversed.counts).toEqual(single.counts)
    expect(multi.rows[0].key).toHaveLength(2)
  })

  it('reports the changed cells of a modified row', () => {
    const result = alignCsvTables(LEFT, RIGHT, ['order_id'])
    const row = result.rows.find((entry) => entry.key[0] === 'ORD-100014')

    expect(row?.status).toBe('modified')
    const changes = new Map(
      (row?.cells ?? [])
        .filter((cell) => cell.changed)
        .map((cell) => [cell.column, [cell.left, cell.right]] as const)
    )
    expect(changes.get('qty')).toEqual(['9', '14'])
    expect(changes.get('status')).toEqual(['shipped', 'refunded'])
  })

  it('keeps removed and added rows on their own side', () => {
    const result = alignCsvTables(LEFT, RIGHT, ['order_id'])

    const removed = result.rows.find((row) => row.status === 'removed')
    expect(removed?.cells.every((cell) => cell.right === null)).toBe(true)

    const added = result.rows.find((row) => row.status === 'added')
    expect(added?.cells.every((cell) => cell.left === null)).toBe(true)
    expect(added?.changedColumns).toEqual([])
  })

  it('pairs duplicate keys deterministically and flags them', () => {
    const left: CsvTableData = {
      header: ['id', 'v'],
      rows: [
        ['A', '1'],
        ['A', '2'],
        ['B', '3']
      ]
    }
    const right: CsvTableData = {
      header: ['id', 'v'],
      rows: [
        ['A', '1'],
        ['C', '4'],
        ['C', '5']
      ]
    }

    const result = alignCsvTables(left, right, ['id'])

    expect(result.counts).toEqual({ same: 1, added: 2, removed: 2, modified: 0 })
    expect(result.rows.map((row) => row.status)).toEqual([
      'same',
      'removed',
      'removed',
      'added',
      'added'
    ])
    expect(result.duplicateKeys).toEqual([
      { key: ['A'], left: 2, right: 1 },
      { key: ['C'], left: 0, right: 2 }
    ])
  })

  it('returns an empty result instead of throwing without a usable key', () => {
    expect(alignCsvTables(LEFT, RIGHT, [])).toBe(EMPTY_CSV_ALIGN)
    expect(alignCsvTables(LEFT, RIGHT, ['not_a_column'])).toBe(EMPTY_CSV_ALIGN)
    expect(alignCsvTables({ header: [], rows: [] }, { header: [], rows: [] }, ['id'])).toBe(
      EMPTY_CSV_ALIGN
    )
  })
})

describe('commonCsvColumns', () => {
  it('returns the shared columns in left-table order', () => {
    expect(commonCsvColumns(LEFT, RIGHT)).toEqual([
      'order_id',
      'account',
      'sku',
      'qty',
      'unit_price',
      'status',
      'updated_at'
    ])
  })

  it('returns nothing when the tables share no column names', () => {
    expect(commonCsvColumns(LEFT, { header: ['region'], rows: [] })).toEqual([])
  })
})
