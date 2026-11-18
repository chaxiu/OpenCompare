import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import { alignCsvTables } from '@core/csv/align'
import { listSheets, matchXlsxSheets, parseXlsxSheet, parseXlsxTable } from '@core/xlsx/parse'

function writeWorkbook(
  sheets: readonly { readonly name: string; readonly sheet: XLSX.WorkSheet }[],
  options: { readonly date1904?: boolean; readonly bookType?: XLSX.BookType } = {}
): Uint8Array {
  const workbook = XLSX.utils.book_new()
  for (const { name, sheet } of sheets) XLSX.utils.book_append_sheet(workbook, sheet, name)
  if (options.date1904 === true) workbook.Workbook = { WBProps: { date1904: true } }
  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: options.bookType ?? 'xlsx'
  }) as Uint8Array
}

function sheetFromRows(rows: readonly unknown[][]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet(rows as unknown[][])
}

describe('parseXlsxTable contract', () => {
  it('returns the CSV table shape and feeds alignCsvTables without conversion', () => {
    const left = writeWorkbook([
      {
        name: 'Main',
        sheet: sheetFromRows([
          ['id', 'name', 'qty'],
          ['k1', 'alpha', 1],
          ['k2', 'beta', 2]
        ])
      }
    ])
    const right = writeWorkbook([
      {
        name: 'Main',
        sheet: sheetFromRows([
          ['id', 'name', 'qty'],
          ['k2', 'beta', 2],
          ['k1', 'alpha', 1],
          ['k3', 'gamma', 3]
        ])
      }
    ])

    const parsedLeft = parseXlsxTable(left)
    const parsedRight = parseXlsxTable(right)

    expect(parsedLeft.header).toEqual(['id', 'name', 'qty'])
    expect(parsedLeft.rows).toEqual([
      ['k1', 'alpha', '1'],
      ['k2', 'beta', '2']
    ])
    for (const row of parsedLeft.rows) {
      for (const cell of row) expect(typeof cell).toBe('string')
    }

    const aligned = alignCsvTables(parsedLeft, parsedRight, ['id'])
    expect(aligned.counts).toEqual({ same: 2, added: 1, removed: 0, modified: 0 })
    expect(aligned.rows.map((row) => row.status)).toEqual(['same', 'same', 'added'])
  })

  it('parses xlsm data without touching the VBA project', () => {
    const bytes = writeWorkbook([
      { name: 'Macro', sheet: sheetFromRows([['id', 'v'], ['a', 'b']]) }
    ], { bookType: 'xlsm' })

    const parsed = parseXlsxTable(bytes)
    expect(parsed.header).toEqual(['id', 'v'])
    expect(parsed.rows).toEqual([['a', 'b']])
  })
})

describe('parseXlsxTable formulas', () => {
  it('uses cached values only and counts uncached formulas as empty cells', () => {
    const sheet = sheetFromRows([
      ['id', 'calc', 'missing'],
      ['k1', { f: '1+1', v: 2, t: 'n' }, { f: '2+2', t: 'n' }],
      ['k2', { f: '"x"', v: 'x', t: 's' }, { f: '3+3', t: 'n' }]
    ])
    const parsed = parseXlsxTable(writeWorkbook([{ name: 'Main', sheet }]))

    expect(parsed.header).toEqual(['id', 'calc', 'missing'])
    expect(parsed.rows).toEqual([
      ['k1', '2', ''],
      ['k2', 'x', '']
    ])
    expect(parsed.meta.uncachedFormulaCells).toBe(2)
    const flat = parsed.rows.flat()
    expect(flat.some((cell) => cell.includes('+'))).toBe(false)
  })
})

describe('parseXlsxTable merged cells', () => {
  it('keeps only the top-left anchor and leaves the row count unchanged', () => {
    const merged = sheetFromRows([
      ['id', 'group', 'value'],
      ['k1', 'g1', 1],
      ['k2', null, 2],
      ['k3', 'g3', 3]
    ])
    merged['!merges'] = [{ s: { r: 1, c: 1 }, e: { r: 2, c: 1 } }]

    const plain = sheetFromRows([
      ['id', 'group', 'value'],
      ['k1', 'g1', 1],
      ['k2', null, 2],
      ['k3', 'g3', 3]
    ])

    const mergedTable = parseXlsxTable(writeWorkbook([{ name: 'Main', sheet: merged }]))
    const plainTable = parseXlsxTable(writeWorkbook([{ name: 'Main', sheet: plain }]))

    expect(mergedTable.rows.length).toBe(plainTable.rows.length)
    expect(mergedTable.meta.mergedRanges).toEqual(['B2:B3'])
    expect(mergedTable.rows).toEqual([
      ['k1', 'g1', '1'],
      ['k2', '', '2'],
      ['k3', 'g3', '3']
    ])

    const other = parseXlsxTable(
      writeWorkbook([
        {
          name: 'Main',
          sheet: sheetFromRows([
            ['id', 'group', 'value'],
            ['k1', 'g1', 9],
            ['k2', '', 2],
            ['k3', 'g3', 3]
          ])
        }
      ])
    )
    const aligned = alignCsvTables(mergedTable, other, ['id'])
    expect(aligned.counts).toEqual({ same: 2, added: 0, removed: 0, modified: 1 })
    expect(aligned.rows.find((row) => row.key[0] === 'k1')?.changedColumns).toEqual(['value'])
  })
})

describe('parseXlsxTable dates and floats', () => {
  function datedSheet(): XLSX.WorkSheet {
    const sheet = sheetFromRows([
      ['id', 'day', 'stamp', 'float', 'third', 'big', 'whole'],
      ['k1', 45000, 45000.75, 0.1, 1 / 3, 1e21, 42],
      ['k2', 45000.5, 0.5, 1.2345678901234567, 0.30000000000000004, -2.5, 0]
    ])
    const formats: readonly [string, string][] = [
      ['B2', 'yyyy-mm-dd'],
      ['C2', 'yyyy-mm-dd hh:mm:ss'],
      ['B3', 'yyyy-mm-dd hh:mm:ss'],
      ['C3', 'h:mm:ss']
    ]
    for (const [address, format] of formats) sheet[address].z = format
    return sheet
  }

  it('normalizes 1900-system dates, times and floats', () => {
    const parsed = parseXlsxTable(writeWorkbook([{ name: 'Main', sheet: datedSheet() }]))

    expect(parsed.rows[0]).toEqual([
      'k1',
      '2023-03-15',
      '2023-03-15T18:00:00',
      '0.1',
      '0.333333333333333',
      '1e+21',
      '42'
    ])
    expect(parsed.rows[1]).toEqual([
      'k2',
      '2023-03-15T12:00:00',
      '1899-12-31T12:00:00',
      '1.23456789012346',
      '0.3',
      '-2.5',
      '0'
    ])
    expect(parsed.meta.date1904).toBe(false)
  })

  it('uses the 1904 base when the workbook says so', () => {
    const sheet = sheetFromRows([
      ['id', 'day', 'stamp'],
      ['k1', 0, 1.5]
    ])
    sheet['B2'].z = 'yyyy-mm-dd'
    sheet['C2'].z = 'yyyy-mm-dd hh:mm:ss'

    const parsed = parseXlsxTable(
      writeWorkbook([{ name: 'Main', sheet }], { date1904: true })
    )

    expect(parsed.meta.date1904).toBe(true)
    expect(parsed.rows[0]).toEqual(['k1', '1904-01-01', '1904-01-02T12:00:00'])
  })
})

describe('parseXlsxTable headers, hidden rows and sheets', () => {
  it('fills empty headers with column letters and keeps the first duplicate', () => {
    const parsed = parseXlsxTable(
      writeWorkbook([
        {
          name: 'Main',
          sheet: sheetFromRows([
            ['id', '', 'name', 'name'],
            ['k1', 'x', 'a', 'shadow'],
            ['k2', 'y', 'b', 'shadow2']
          ])
        }
      ])
    )

    expect(parsed.header).toEqual(['id', 'B', 'name'])
    expect(parsed.rows).toEqual([
      ['k1', 'x', 'a'],
      ['k2', 'y', 'b']
    ])
  })

  it('annotates hidden rows and columns while still comparing them', () => {
    const sheet = sheetFromRows([
      ['id', 'name', 'note'],
      ['k1', 'alpha', 'one'],
      ['k2', 'beta', 'two'],
      ['k3', 'gamma', 'three']
    ])
    sheet['!rows'] = [{}, { hidden: true }, {}, {}]
    sheet['!cols'] = [{}, {}, { hidden: true }]

    const parsed = parseXlsxTable(writeWorkbook([{ name: 'Main', sheet }]))

    expect(parsed.meta.hiddenRows).toEqual([2])
    expect(parsed.meta.hiddenColumns).toEqual(['C'])
    expect(parsed.rows.map((row) => row[0])).toEqual(['k1', 'k2', 'k3'])
    expect(parsed.rows[2][2]).toBe('three')
  })

  it('lists sheets, resolves names case-insensitively and diffs the two sides', () => {
    const bytes = writeWorkbook([
      { name: 'Main', sheet: sheetFromRows([['id'], ['a']]) },
      { name: 'Data', sheet: sheetFromRows([['id'], ['b']]) }
    ])

    expect(listSheets(bytes)).toEqual(['Main', 'Data'])
    expect(parseXlsxSheet(bytes, 'MAIN').header).toEqual(['id'])
    expect(parseXlsxSheet(bytes, 'data').rows).toEqual([['b']])
    expect(() => parseXlsxSheet(bytes, 'missing')).toThrowError(/missing/)

    expect(matchXlsxSheets(['Main', 'Data'], ['main', 'Other'])).toEqual({
      pairs: [{ left: 'Main', right: 'main' }],
      leftOnly: ['Data'],
      rightOnly: ['Other']
    })

    expect(matchXlsxSheets(['Main'], ['MAIN', 'main'])).toEqual({
      pairs: [{ left: 'Main', right: 'MAIN' }],
      leftOnly: [],
      rightOnly: ['main']
    })
  })

  it('returns an empty table when the sheet carries no cell range', () => {
    const parsed = parseXlsxTable(writeWorkbook([{ name: 'Main', sheet: {} }]))

    expect(parsed.header).toEqual([])
    expect(parsed.rows).toEqual([])
    expect(parsed.meta.sheetName).toBe('Main')
  })

  it('walks a declared range that is wider than the dense data', () => {
    const sheet = sheetFromRows([['id', 'val']])
    sheet['!ref'] = 'A1:B3'

    const parsed = parseXlsxTable(writeWorkbook([{ name: 'Main', sheet }]))

    expect(parsed.header).toEqual(['id', 'val'])
    expect(parsed.rows).toEqual([])
  })

  it('renders boolean and error cells as header text', () => {
    const cells = [
      [{ t: 's', v: 'id' }, { t: 'b', v: true }, { t: 'e', v: '#DIV/0!' }, { t: 'n', v: 1.5 }],
      [{ t: 's', v: 'k' }, { t: 'b', v: false }, { t: 'e', v: 7 }, { t: 'n', v: 2.5 }]
    ]
    const sheet: XLSX.WorkSheet = {
      '!ref': 'A1:D2',
      '!data': cells
    } as unknown as XLSX.WorkSheet

    const parsed = parseXlsxTable(writeWorkbook([{ name: 'Main', sheet }]))

    expect(parsed.header).toEqual(['id', 'TRUE', 'C', '1.5'])
    expect(parsed.rows).toEqual([['k', 'FALSE', '', '2.5']])
  })
})
