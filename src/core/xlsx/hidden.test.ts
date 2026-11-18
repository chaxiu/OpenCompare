import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import { applyXlsxHiddenPolicy, countHidden } from '@core/xlsx/hidden'
import { parseXlsxTable } from '@core/xlsx/parse'

function workbookWithHidden(): ReturnType<typeof parseXlsxTable> {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['id', 'name', 'note'],
    ['k1', 'alpha', 'one'],
    ['k2', 'beta', 'two']
  ])
  sheet['!rows'] = [{}, {}, { hidden: true }]
  sheet['!cols'] = [{}, {}, { hidden: true }]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Main')
  return parseXlsxTable(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array)
}

describe('applyXlsxHiddenPolicy', () => {
  it('compares hidden rows and columns by default and counts them', () => {
    const parsed = workbookWithHidden()

    expect(parsed.meta.hiddenRows).toEqual([3])
    expect(parsed.meta.hiddenColumns).toEqual(['C'])
    expect(parsed.meta.hiddenColumnIndexes).toEqual([2])
    expect(parsed.rows.map((row) => row[0])).toEqual(['k1', 'k2'])
    expect(countHidden([parsed.meta])).toEqual({ rows: 1, columns: 1 })

    const untouched = applyXlsxHiddenPolicy(parsed, parsed.meta, false)
    expect(untouched).toBe(parsed)
    expect(untouched.rows.map((row) => row[0])).toEqual(['k1', 'k2'])
  })

  it('drops exactly the annotated row and column once the switch is on', () => {
    const parsed = workbookWithHidden()
    const filtered = applyXlsxHiddenPolicy(parsed, parsed.meta, true)

    expect(filtered.header).toEqual(['id', 'name'])
    expect(filtered.rows).toEqual([['k1', 'alpha']])
    expect(applyXlsxHiddenPolicy(parsed, parsed.meta, true)).toEqual(filtered)
  })

  it('keeps the table when the switch is on but nothing is annotated', () => {
    const parsed = workbookWithHidden()
    const meta = { ...parsed.meta, hiddenRows: [], hiddenColumns: [], hiddenColumnIndexes: [] }

    expect(applyXlsxHiddenPolicy(parsed, meta, true)).toBe(parsed)
  })
})
