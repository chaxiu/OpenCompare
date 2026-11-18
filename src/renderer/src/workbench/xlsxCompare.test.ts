import { deflateRawSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import { alignCsvTables } from '@core/csv/align'
import { probeTextBytes } from '@core/text/probe'
import { isXlsxLimitExceeded, MIB, XLSX_TIER3_LIMITS } from '@core/xlsx/limits'
import { FilePairError, openFilePairSession } from './directoryCompare'
import type { PlatformPort } from '@shared/platform/types'
import { openXlsxPairSession } from './xlsxCompare'

function writeWorkbook(
  sheets: readonly (readonly [string, readonly (readonly unknown[])[]])[],
  bookType: XLSX.BookType = 'xlsx'
): Uint8Array {
  const workbook = XLSX.utils.book_new()
  for (const [name, rows] of sheets) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows as unknown[][]), name)
  }
  return XLSX.write(workbook, { type: 'buffer', bookType }) as Uint8Array
}

/** Only `readFileBytes` is reachable from the workbook path; reads are logged. */
function workbookPort(files: Readonly<Record<string, Uint8Array>>, reads: string[]): PlatformPort {
  return {
    readFileBytes: async (path: string) => {
      reads.push(path)
      const bytes = files[path]
      if (bytes === undefined) throw new Error(`missing fixture ${path}`)
      return bytes
    }
  } as unknown as PlatformPort
}

const CSV_ROWS: readonly (readonly unknown[])[] = [['id', 'value'], ['k1', 'a'], ['k2', 'b'], ['k3', 'c']]
const CSV_NEXT: readonly (readonly unknown[])[] = [['id', 'value'], ['k1', 'a'], ['k2', 'B'], ['k4', 'd']]

describe('openXlsxPairSession four states', () => {
  it('aligns a real xlsx / xlsm pair into the CSV four states and highlights cells', async () => {
    const reads: string[] = []
    const port = workbookPort(
      { '/left.xlsx': writeWorkbook([['Main', CSV_ROWS]]), '/right.xlsm': writeWorkbook([['Main', CSV_NEXT]], 'xlsm') },
      reads
    )

    // The drop / dialog path resolves xlsx by extension and lands here.
    const session = await openFilePairSession(port, '/left.xlsx', '/right.xlsm')

    expect(session.scene).toBe('csv')
    expect(session.xlsx?.sheets.map((sheet) => sheet.name)).toEqual(['Main'])
    const tables = session.adhoc?.tables
    if (tables === undefined) throw new Error('xlsx session carries no tables')
    const aligned = alignCsvTables(tables.left, tables.right, ['id'])
    expect(aligned.counts).toEqual({ same: 1, added: 1, removed: 1, modified: 1 })
    const modified = aligned.rows.find((row) => row.status === 'modified')
    expect(modified?.cells.some((cell) => cell.changed)).toBe(true)
    expect(reads).toEqual(['/left.xlsx', '/right.xlsm'])
  })

  it('pairs sheets by name (case-insensitive), lists the diff and keeps sheets separate', async () => {
    const port = workbookPort(
      {
        '/l.xlsx': writeWorkbook([
          ['Main', [['id', 'v'], ['k1', 'a']]],
          ['Data', [['id', 'v'], ['k1', 'a'], ['k2', 'b']]]
        ]),
        '/r.xlsx': writeWorkbook([
          ['main', [['id', 'v'], ['k1', 'a'], ['k9', 'z']]],
          ['data', [['id', 'v'], ['k1', 'A']]],
          ['Extra', [['id', 'v'], ['k1', 'a']]]
        ])
      },
      []
    )

    const session = await openXlsxPairSession(port, '/l.xlsx', '/r.xlsx', 'l.xlsx', 'r.xlsx')

    const view = session.xlsx
    if (view === undefined) throw new Error('xlsx session carries no sheet view')
    expect(view.sheets.map((sheet) => sheet.name)).toEqual(['Main', 'Data'])
    expect(view.leftOnly).toEqual([])
    expect(view.rightOnly).toEqual(['Extra'])
    const counts = view.sheets.map((sheet) => ({
      name: sheet.name,
      counts: alignCsvTables(sheet.left.table, sheet.right.table, ['id']).counts
    }))
    expect(counts).toEqual([
      { name: 'Main', counts: { same: 1, added: 1, removed: 0, modified: 0 } },
      { name: 'Data', counts: { same: 0, added: 0, removed: 1, modified: 1 } }
    ])
  })
})

describe('openXlsxPairSession sequencing and budget', () => {
  it('parses the left workbook completely before reading the right one', async () => {
    const reads: string[] = []
    const events: string[] = []
    const port = workbookPort(
      {
        '/l.xlsx': writeWorkbook([['A', [['id'], ['1']]], ['B', [['id'], ['2']]]]),
        '/r.xlsx': writeWorkbook([['A', [['id'], ['1']]], ['B', [['id'], ['2']]]])
      },
      reads
    )

    await openXlsxPairSession(port, '/l.xlsx', '/r.xlsx', 'l', 'r', {
      onParse: (side, sheet) => events.push(`${side}:${sheet}:${reads.length}`)
    })

    expect(reads).toEqual(['/l.xlsx', '/r.xlsx'])
    // Every left parse happened while only the left bytes had been read.
    expect(events).toEqual(['left:A:1', 'left:B:1', 'right:A:2', 'right:B:2'])
  })

  it('pins the single-tab dense budget and refuses 3 tab + normal before reading', async () => {
    const reads: string[] = []
    const one = writeWorkbook([['A', [['id'], ['1']]]])
    const port = workbookPort({ '/l.xlsx': one, '/r.xlsx': one }, reads)

    const dense = await openXlsxPairSession(port, '/l.xlsx', '/r.xlsx', 'l', 'r', { tabCount: 3 })
    expect(dense.xlsx?.budget).toEqual({ tabCount: 3, mode: 'dense' })

    reads.length = 0
    let rejected: unknown
    try {
      await openXlsxPairSession(port, '/l.xlsx', '/r.xlsx', 'l', 'r', {
        tabCount: 3,
        mode: 'normal'
      })
    } catch (error) {
      rejected = error
    }
    expect(isXlsxLimitExceeded(rejected)).toBe(true)
    if (isXlsxLimitExceeded(rejected)) expect(rejected.limit.rule).toBe('unsupported-combination')
    expect(reads).toEqual([])
  })

  it('rejects a workbook over a size gate without parsing the right side', async () => {
    const reads: string[] = []
    const oversize = zipEntry(new Uint8Array(1024), 257 * MIB)
    const port = workbookPort({ '/big.xlsx': oversize, '/r.xlsx': oversize }, reads)

    let rejected: unknown
    try {
      await openXlsxPairSession(port, '/big.xlsx', '/r.xlsx', 'l', 'r')
    } catch (error) {
      rejected = error
    }
    expect(isXlsxLimitExceeded(rejected)).toBe(true)
    if (isXlsxLimitExceeded(rejected)) {
      expect(rejected.limit).toEqual({
        tier: 'tier3',
        rule: 'entry-decompressed-bytes',
        threshold: XLSX_TIER3_LIMITS.entryDecompressedBytes
      })
      expect(rejected.observed).toBe(257 * MIB)
    }
    expect(reads).toEqual(['/big.xlsx'])
  })
})

describe('zip bomb reaches the same rejection', () => {
  it('rejects a high-ratio entry past 64 MiB', async () => {
    const compressed = deflateRawSync(Buffer.alloc(65 * MIB))
    const port = workbookPort({ '/bomb.xlsx': zipEntry(compressed, 65 * MIB, 8) }, [])
    let rejected: unknown
    try {
      await openXlsxPairSession(port, '/bomb.xlsx', '/bomb.xlsx', 'l', 'r')
    } catch (error) {
      rejected = error
    }
    expect(isXlsxLimitExceeded(rejected)).toBe(true)
    if (isXlsxLimitExceeded(rejected)) expect(rejected.limit.tier).toBe('zip-bomb')
  })
})

/** Minimal zip whose central directory declares the given uncompressed size. */
function zipEntry(payload: Uint8Array, declared: number, method: 0 | 8 = 0): Uint8Array {
  const name = Buffer.from('xl/worksheets/sheet1.xml')
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(method, 8)
  local.writeUInt32LE(payload.length, 18)
  local.writeUInt32LE(declared, 22)
  local.writeUInt16LE(name.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(method, 10)
  central.writeUInt32LE(payload.length, 20)
  central.writeUInt32LE(declared, 24)
  central.writeUInt16LE(name.length, 28)
  const centralBytes = Buffer.concat([central, name])
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(1, 8)
  eocd.writeUInt16LE(1, 10)
  eocd.writeUInt32LE(centralBytes.length, 12)
  eocd.writeUInt32LE(local.length + name.length + payload.length, 16)
  return new Uint8Array(Buffer.concat([local, name, Buffer.from(payload), centralBytes, eocd]))
}

describe('legacy .xls stays rejected', () => {
  it('never reaches the workbook path and reports an unsupported file type', async () => {
    const binary = probeTextBytes(new Uint8Array([0, 1, 2, 3, 0xff]))
    const port = { probeTextFile: async (path: string) => ({ path, ...binary }) } as unknown as PlatformPort
    const rejection = openFilePairSession(port, '/legacy.xls', '/other.xls')
    await expect(rejection).rejects.toBeInstanceOf(FilePairError)
    await expect(rejection).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' })
  })
})
