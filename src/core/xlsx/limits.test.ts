import { deflateRawSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import {
  assertSheetBounds,
  assertSheetXmlLimit,
  assertSharedStringsLimit,
  effectiveXlsxCaps,
  inspectXlsxContainer,
  isXlsxLimitExceeded,
  MIB,
  resolveXlsxBudget,
  XLSX_BUDGET_TABLE,
  XLSX_TIER3_LIMITS,
  XLSX_WATERMARK,
  XLSX_ZIP_BOMB,
  type XlsxBudgetMode,
  type XlsxLimitExceededError
} from '@core/xlsx/limits'
import { parseXlsxTable } from '@core/xlsx/parse'

function budget(tabCount: 1 | 3, mode: XlsxBudgetMode) {
  const resolved = resolveXlsxBudget({ tabCount, mode })
  if (!resolved.supported) throw new Error('budget case is unsupported')
  return resolved
}

function limitError(run: () => unknown): XlsxLimitExceededError {
  try {
    run()
  } catch (error) {
    if (isXlsxLimitExceeded(error)) return error
    throw error
  }
  throw new Error('expected XLSX_LIMIT_EXCEEDED, nothing was thrown')
}

function writeWorkbook(): Uint8Array {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['id', 'value'],
      ['k1', 'a'],
      ['k2', 'b']
    ]),
    'Main'
  )
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array
}

interface ZipFixtureEntry {
  readonly name: string
  readonly data: Uint8Array
  /** Stored (0) unless the entry carries already-deflated bytes. */
  readonly method?: 0 | 8
  /** Central-directory size to declare; lets a case target one gate alone. */
  readonly declaredUncompressed?: number
}

/**
 * Minimal zip writer for the pre-inflate gates. The central directory is what
 * `inspectXlsxContainer` reads, so `declaredUncompressed` is enough to place a
 * sample over one specific threshold without allocating a huge payload.
 */
function buildZip(entries: readonly ZipFixtureEntry[]): Uint8Array {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name)
    const method = entry.method ?? 0
    const payload = Buffer.from(entry.data)
    const uncompressed = entry.declaredUncompressed ?? payload.length

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(uncompressed, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(local, name, payload)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(payload.length, 20)
    central.writeUInt32LE(uncompressed, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)

    offset += local.length + name.length + payload.length
  }

  const centralBytes = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralBytes.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([Buffer.concat(locals), centralBytes, eocd]))
}

const DENSE_1 = budget(1, 'dense')
const DENSE_3 = budget(3, 'dense')

describe('xlsx budget table (§5.1 two-column values)', () => {
  it('pins all four cases to 300 / 171 / 100 / 57 MiB and 40 / 20 / 13 / 7 MiB', () => {
    expect(
      XLSX_BUDGET_TABLE.map((entry) => [
        entry.tabCount,
        entry.mode,
        entry.decompressedBytes / MIB,
        entry.containerBytes / MIB
      ])
    ).toEqual([
      [1, 'dense', 300, 40],
      [1, 'normal', 171, 20],
      [3, 'dense', 100, 13],
      [3, 'normal', 57, 7]
    ])
    expect(resolveXlsxBudget({ tabCount: 1, mode: 'dense' })).toMatchObject({
      supported: true,
      decompressedBytes: 300 * MIB,
      containerBytes: 40 * MIB
    })
    expect(resolveXlsxBudget({ tabCount: 1, mode: 'normal' })).toMatchObject({
      supported: true,
      decompressedBytes: 171 * MIB,
      containerBytes: 20 * MIB
    })
    expect(resolveXlsxBudget({ tabCount: 3, mode: 'dense' })).toMatchObject({
      supported: true,
      decompressedBytes: 100 * MIB,
      containerBytes: 13 * MIB
    })
  })

  it('refuses the 3 tab + normal combination instead of handing out a budget', () => {
    expect(resolveXlsxBudget({ tabCount: 3, mode: 'normal' })).toEqual({
      supported: false,
      tabCount: 3,
      mode: 'normal',
      reason: 'unsupported-combination'
    })
    const error = limitError(() => parseXlsxTable(writeWorkbook(), { tabCount: 3, mode: 'normal' }))
    expect(error.limit.rule).toBe('unsupported-combination')
  })
})

describe('xlsx tier-3 caps and §5.1 precedence', () => {
  it('pins container, entry, sheet and shared strings caps', () => {
    expect(XLSX_TIER3_LIMITS.containerBytes).toBe(64 * MIB)
    expect(XLSX_TIER3_LIMITS.entryCount).toBe(10_000)
    expect(XLSX_TIER3_LIMITS.entryDecompressedBytes).toBe(256 * MIB)
    expect(XLSX_TIER3_LIMITS.sheetRows).toBe(1_048_576)
    expect(XLSX_TIER3_LIMITS.sheetColumns).toBe(16_384)
    expect(XLSX_TIER3_LIMITS.sheetCells).toBe(2_000_000)
    expect(XLSX_TIER3_LIMITS.sheetXmlBytes).toBe(256 * MIB)
    expect(XLSX_TIER3_LIMITS.sharedStringsCount).toBe(1_000_000)
    expect(XLSX_TIER3_LIMITS.sharedStringsBytes).toBe(256 * MIB)
    expect(XLSX_ZIP_BOMB).toEqual({ ratio: 100, decompressedBytes: 64 * MIB })
    expect(XLSX_WATERMARK).toEqual({ warnRatio: 0.6, abortRatio: 0.8 })
  })

  it('lowers the tier caps wherever the §5.1 budget is tighter', () => {
    const caps = effectiveXlsxCaps(DENSE_3)
    expect(caps.containerBytes).toBe(13 * MIB)
    expect(caps.sheetXmlBytes).toBe(100 * MIB)
    expect(caps.sharedStringsBytes).toBe(100 * MIB)
    expect(effectiveXlsxCaps(DENSE_1).containerBytes).toBe(40 * MIB)
  })
})

describe('xlsx container gates', () => {
  it('rejects a container above the effective cap and reports the §5.1 threshold', () => {
    const bytes = new Uint8Array(14 * MIB)
    const error = limitError(() => inspectXlsxContainer(bytes, DENSE_3))
    expect(error.code).toBe('XLSX_LIMIT_EXCEEDED')
    expect(error.limit).toEqual({
      tier: 'container',
      rule: 'container-bytes',
      threshold: 13 * MIB
    })
    expect(error.observed).toBe(14 * MIB)
  })

  it('rejects more than 10,000 zip entries', () => {
    const entries = Array.from({ length: 10_001 }, (_, index) => ({
      name: `e${index}`,
      data: new Uint8Array(1)
    }))
    const error = limitError(() => inspectXlsxContainer(buildZip(entries), DENSE_1))
    expect(error.limit).toEqual({ tier: 'tier3', rule: 'entry-count', threshold: 10_000 })
    expect(error.observed).toBe(10_001)
  })

  it('rejects a single entry above 256 MiB before inflating it', () => {
    const bytes = buildZip([
      {
        name: 'xl/worksheets/sheet1.xml',
        data: new Uint8Array(4 * MIB),
        declaredUncompressed: 257 * MIB
      }
    ])
    const error = limitError(() => inspectXlsxContainer(bytes, DENSE_1))
    expect(error.limit).toEqual({
      tier: 'tier3',
      rule: 'entry-decompressed-bytes',
      threshold: 256 * MIB
    })
    expect(error.observed).toBe(257 * MIB)
  })

  it('rejects a cumulative decompressed total above the §5.1 budget', () => {
    const bytes = buildZip([
      { name: 'a.xml', data: new Uint8Array(1024), declaredUncompressed: 60 * MIB },
      { name: 'b.xml', data: new Uint8Array(1024), declaredUncompressed: 55 * MIB }
    ])
    const error = limitError(() => inspectXlsxContainer(bytes, DENSE_3))
    expect(error.limit).toEqual({
      tier: 'budget',
      rule: 'decompressed-budget',
      threshold: 100 * MIB
    })
    expect(error.observed).toBe(115 * MIB)
  })

  it('rejects a zip bomb whose real ratio is above 100:1 past 64 MiB', () => {
    const zeros = Buffer.alloc(65 * MIB)
    const compressed = deflateRawSync(zeros)
    const bytes = buildZip([
      {
        name: 'xl/worksheets/sheet1.xml',
        data: compressed,
        method: 8,
        declaredUncompressed: 65 * MIB
      }
    ])
    expect(compressed.length).toBeLessThan(65 * MIB)
    const error = limitError(() => inspectXlsxContainer(bytes, DENSE_1))
    expect(error.limit.tier).toBe('zip-bomb')
    expect(error.limit.rule).toBe('zip-bomb-ratio')
    expect(error.limit.threshold).toBe(100)
    expect(error.observed).toBeGreaterThan(100)
  })
})

describe('xlsx sheet and shared strings gates', () => {
  it('rejects sheet rows, columns and non-empty cells above the tier caps', () => {
    expect(limitError(() => assertSheetBounds({ rows: 1_048_577, columns: 1, nonEmptyCells: 1 })).limit)
      .toEqual({ tier: 'sheet', rule: 'sheet-rows', threshold: 1_048_576 })
    expect(limitError(() => assertSheetBounds({ rows: 1, columns: 16_385, nonEmptyCells: 1 })).limit)
      .toEqual({ tier: 'sheet', rule: 'sheet-columns', threshold: 16_384 })
    expect(
      limitError(() => assertSheetBounds({ rows: 1, columns: 1, nonEmptyCells: 2_000_001 })).limit
    ).toEqual({ tier: 'sheet', rule: 'sheet-cells', threshold: 2_000_000 })
  })

  it('resolves the sheet XML part from workbook rels and enforces its cap', () => {
    const bytes = writeWorkbook()
    const report = inspectXlsxContainer(bytes, DENSE_1)
    const caps = effectiveXlsxCaps(DENSE_1)
    const size = assertSheetXmlLimit(report, bytes, 'Main', caps)
    const sheetEntry = report.directory.entries.find((entry) =>
      entry.name.startsWith('xl/worksheets/')
    )
    expect(size).toBe(sheetEntry?.decompressedBytes)
    expect(size).toBeGreaterThan(0)

    const error = limitError(() =>
      assertSheetXmlLimit(report, bytes, 'Main', { ...caps, sheetXmlBytes: size - 1 })
    )
    expect(error.limit).toEqual({ tier: 'sheet', rule: 'sheet-xml-bytes', threshold: size - 1 })
    expect(error.observed).toBe(size)
  })

  it('rejects a shared strings table above 1,000,000 entries', () => {
    const bytes = buildZip([
      {
        name: 'xl/sharedStrings.xml',
        data: Buffer.from('<sst count="1000001" uniqueCount="1000001"></sst>')
      }
    ])
    const report = inspectXlsxContainer(bytes, DENSE_1)
    const error = limitError(() =>
      assertSharedStringsLimit(report, bytes, effectiveXlsxCaps(DENSE_1))
    )
    expect(error.limit).toEqual({
      tier: 'shared-strings',
      rule: 'shared-strings-count',
      threshold: 1_000_000
    })
    expect(error.observed).toBe(1_000_001)
  })

  it('rejects a shared strings part above the effective byte cap', () => {
    const bytes = buildZip([
      {
        name: 'xl/sharedStrings.xml',
        data: Buffer.from('<sst count="1" uniqueCount="1"></sst>')
      }
    ])
    const report = inspectXlsxContainer(bytes, DENSE_1)
    const error = limitError(() => assertSharedStringsLimit(report, bytes, { ...effectiveXlsxCaps(DENSE_1), sharedStringsBytes: 10 }))
    expect(error.limit).toEqual({
      tier: 'shared-strings',
      rule: 'shared-strings-bytes',
      threshold: 10
    })
  })
})

describe('xlsx runtime watermark (§5.5)', () => {
  const baselineRss = 100 * MIB
  const capacity = DENSE_1.decompressedBytes

  it('records a warning at 60% and still returns the table', () => {
    const parsed = parseXlsxTable(writeWorkbook(), {
      baselineRss,
      rssProbe: () => baselineRss + capacity * XLSX_WATERMARK.warnRatio
    })
    expect(parsed.meta.warnings).toHaveLength(1)
    expect(parsed.meta.warnings[0]).toContain('watermark-warning')
    expect(parsed.rows).toEqual([
      ['k1', 'a'],
      ['k2', 'b']
    ])
  })

  it('aborts at 80% with XLSX_LIMIT_EXCEEDED and no rows', () => {
    const error = limitError(() =>
      parseXlsxTable(writeWorkbook(), {
        baselineRss,
        rssProbe: () => baselineRss + capacity * XLSX_WATERMARK.abortRatio
      })
    )
    expect(error.code).toBe('XLSX_LIMIT_EXCEEDED')
    expect(error.limit.tier).toBe('watermark')
    expect(error.limit.rule).toBe('watermark-abort')
    expect(error.limit.threshold).toBe(Math.floor(capacity * XLSX_WATERMARK.abortRatio))
    expect(error.observed).toBe(capacity * XLSX_WATERMARK.abortRatio)
  })

  it('exposes { limit, observed } on every rejection', () => {
    const error = limitError(() => inspectXlsxContainer(new Uint8Array(41 * MIB), DENSE_1))
    expect(Object.keys(error.limit).sort()).toEqual(['rule', 'threshold', 'tier'])
    expect(typeof error.observed).toBe('number')
    expect(error.message).not.toContain('/')
  })
})
