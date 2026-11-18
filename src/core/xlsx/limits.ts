/**
 * xlsx / xlsm size caps, budget table, zip-bomb rejection and runtime watermark.
 *
 * Every number here comes from `docs/plans/2026-11-18-xlsx-xlsm-comparison-assessment.md`
 * §5: §5.1 (budget reversed from the 1,300 MiB renderer guard, two-column
 * tightened values), §5.3 (container / single sheet / shared strings) and §5.4
 * (zip bomb). Nothing else may carry a second copy of these thresholds.
 *
 * Container checks read the zip central directory only, so a hostile file is
 * rejected before any sheet is inflated (§5.3 "未解压即拒绝"). A rejection
 * throws `XlsxLimitExceededError` with code `XLSX_LIMIT_EXCEEDED` and a
 * `{ limit, observed }` pair, and produces no rows at all.
 */

import { inflateRawSync, constants as zlibConstants } from 'node:zlib'

export const MIB = 1024 * 1024

/** §5.1: per-tab decompressed budget and ~10:1 container size (two-column values). */
export interface XlsxBudgetCase {
  readonly tabCount: 1 | 3
  readonly mode: XlsxBudgetMode
  /** Allowed decompressed bytes per tab (two-column tightened value). */
  readonly decompressedBytes: number
  /** Estimated container size at ~10:1. */
  readonly containerBytes: number
  /** §5.2: 3 tabs + normal mode is out of scope and gets no budget. */
  readonly supported: boolean
}

export type XlsxBudgetMode = 'dense' | 'normal'

export const XLSX_BUDGET_TABLE: readonly XlsxBudgetCase[] = [
  { tabCount: 1, mode: 'dense', decompressedBytes: 300 * MIB, containerBytes: 40 * MIB, supported: true },
  { tabCount: 1, mode: 'normal', decompressedBytes: 171 * MIB, containerBytes: 20 * MIB, supported: true },
  { tabCount: 3, mode: 'dense', decompressedBytes: 100 * MIB, containerBytes: 13 * MIB, supported: true },
  { tabCount: 3, mode: 'normal', decompressedBytes: 57 * MIB, containerBytes: 7 * MIB, supported: false }
]

/** §5.3 outer gates: container, entry count, one entry, sheet, shared strings. */
export const XLSX_TIER3_LIMITS = {
  containerBytes: 64 * MIB,
  entryCount: 10_000,
  entryDecompressedBytes: 256 * MIB,
  sheetRows: 1_048_576,
  sheetColumns: 16_384,
  sheetCells: 2_000_000,
  sheetXmlBytes: 256 * MIB,
  sharedStringsCount: 1_000_000,
  sharedStringsBytes: 256 * MIB
} as const

/** §5.4: ratio above this combined with more than `decompressedBytes` is a bomb. */
export const XLSX_ZIP_BOMB = {
  ratio: 100,
  decompressedBytes: 64 * MIB
} as const

/** §5.5: warning at 60% of the watermark, abort at 80%. */
export const XLSX_WATERMARK = {
  warnRatio: 0.6,
  abortRatio: 0.8
} as const

export type XlsxLimitTier =
  | 'container'
  | 'tier3'
  | 'budget'
  | 'zip-bomb'
  | 'sheet'
  | 'shared-strings'
  | 'watermark'

/** Which rule hit, and the threshold it hit. `observed` lives next to it. */
export interface XlsxLimit {
  readonly tier: XlsxLimitTier
  readonly rule: string
  readonly threshold: number
}

/** Unified rejection. Carries only the limit and the observed value (§5.4). */
export class XlsxLimitExceededError extends Error {
  readonly code = 'XLSX_LIMIT_EXCEEDED' as const
  readonly limit: XlsxLimit
  readonly observed: number

  constructor(limit: XlsxLimit, observed: number) {
    super(
      `xlsx limit exceeded: ${limit.rule} (threshold ${limit.threshold}, observed ${observed})`
    )
    this.name = 'XlsxLimitExceededError'
    this.limit = limit
    this.observed = observed
  }
}

export function isXlsxLimitExceeded(error: unknown): error is XlsxLimitExceededError {
  return error instanceof XlsxLimitExceededError
}

/** §5.1 resolution. 3 tabs + normal is rejected instead of given a budget. */
export type XlsxBudgetResolution =
  | (XlsxBudgetCase & { readonly supported: true })
  | {
      readonly supported: false
      readonly tabCount: 1 | 3
      readonly mode: XlsxBudgetMode
      readonly reason: 'unsupported-combination'
    }

export function resolveXlsxBudget(input: {
  readonly tabCount: 1 | 3
  readonly mode: XlsxBudgetMode
}): XlsxBudgetResolution {
  const entry = XLSX_BUDGET_TABLE.find(
    (candidate) => candidate.tabCount === input.tabCount && candidate.mode === input.mode
  )
  if (entry === undefined) {
    throw new RangeError(`Unsupported xlsx budget case: ${input.tabCount} tab(s) ${input.mode}`)
  }
  if (!entry.supported) {
    return {
      supported: false,
      tabCount: entry.tabCount,
      mode: entry.mode,
      reason: 'unsupported-combination'
    }
  }
  return entry as XlsxBudgetCase & { readonly supported: true }
}

/** Effective caps: §5.3 tiers, lowered wherever the §5.1 budget is tighter. */
export interface XlsxEffectiveCaps {
  readonly decompressedBytes: number
  readonly containerBytes: number
  readonly sheetXmlBytes: number
  readonly sharedStringsBytes: number
}

export function effectiveXlsxCaps(budget: XlsxBudgetCase): XlsxEffectiveCaps {
  return {
    decompressedBytes: budget.decompressedBytes,
    containerBytes: Math.min(XLSX_TIER3_LIMITS.containerBytes, budget.containerBytes),
    sheetXmlBytes: Math.min(XLSX_TIER3_LIMITS.sheetXmlBytes, budget.decompressedBytes),
    sharedStringsBytes: Math.min(XLSX_TIER3_LIMITS.sharedStringsBytes, budget.decompressedBytes)
  }
}

/** Throw the unified rejection unless `observed` stays inside `threshold`. */
export function assertXlsxLimit(
  limit: XlsxLimit,
  threshold: number,
  observed: number
): void {
  if (observed > threshold) {
    throw new XlsxLimitExceededError({ ...limit, threshold }, observed)
  }
}

export interface XlsxZipEntry {
  readonly name: string
  readonly method: number
  readonly compressedBytes: number
  readonly decompressedBytes: number
  /** Byte offset of the entry's file data in the container. */
  readonly dataOffset: number
}

export interface XlsxZipDirectory {
  readonly entryCount: number
  readonly entries: readonly XlsxZipEntry[]
}

export interface XlsxContainerReport {
  readonly containerBytes: number
  readonly entryCount: number
  readonly decompressedBytes: number
  readonly directory: XlsxZipDirectory
}

/**
 * Pre-inflate gates for the whole container: size, entry count, single entry,
 * zip-bomb ratio and the cumulative §5.1 decompressed budget. Reads the central
 * directory only, never a sheet.
 */
export function inspectXlsxContainer(
  bytes: Uint8Array,
  budget: XlsxBudgetCase
): XlsxContainerReport {
  const caps = effectiveXlsxCaps(budget)
  assertXlsxLimit(
    { tier: 'container', rule: 'container-bytes', threshold: caps.containerBytes },
    caps.containerBytes,
    bytes.byteLength
  )

  const directory = readXlsxZipDirectory(bytes)
  if (directory === null) {
    return {
      containerBytes: bytes.byteLength,
      entryCount: 0,
      decompressedBytes: 0,
      directory: { entryCount: 0, entries: [] }
    }
  }

  assertXlsxLimit(
    { tier: 'tier3', rule: 'entry-count', threshold: XLSX_TIER3_LIMITS.entryCount },
    XLSX_TIER3_LIMITS.entryCount,
    directory.entryCount
  )

  let total = 0
  for (const entry of directory.entries) {
    assertXlsxLimit(
      {
        tier: 'tier3',
        rule: 'entry-decompressed-bytes',
        threshold: XLSX_TIER3_LIMITS.entryDecompressedBytes
      },
      XLSX_TIER3_LIMITS.entryDecompressedBytes,
      entry.decompressedBytes
    )
    const ratio =
      entry.compressedBytes === 0
        ? entry.decompressedBytes > 0
          ? Number.POSITIVE_INFINITY
          : 0
        : entry.decompressedBytes / entry.compressedBytes
    if (entry.decompressedBytes > XLSX_ZIP_BOMB.decompressedBytes && ratio > XLSX_ZIP_BOMB.ratio) {
      throw new XlsxLimitExceededError(
        { tier: 'zip-bomb', rule: 'zip-bomb-ratio', threshold: XLSX_ZIP_BOMB.ratio },
        ratio
      )
    }
    total += entry.decompressedBytes
  }

  assertXlsxLimit(
    { tier: 'budget', rule: 'decompressed-budget', threshold: caps.decompressedBytes },
    caps.decompressedBytes,
    total
  )

  return {
    containerBytes: bytes.byteLength,
    entryCount: directory.entryCount,
    decompressedBytes: total,
    directory
  }
}

/** Per-sheet XML cap (§5.3), lowered by the §5.1 budget when tighter. */
export function assertSheetXmlLimit(
  report: XlsxContainerReport,
  bytes: Uint8Array,
  sheetName: string,
  caps: XlsxEffectiveCaps
): number {
  const entry = findEntry(report.directory, sheetXmlPart(report, bytes, sheetName))
  if (entry === undefined) return 0
  assertXlsxLimit(
    { tier: 'sheet', rule: 'sheet-xml-bytes', threshold: caps.sheetXmlBytes },
    caps.sheetXmlBytes,
    entry.decompressedBytes
  )
  return entry.decompressedBytes
}

/** Shared strings table caps: count and bytes (§5.3, sample only what is referenced). */
export function assertSharedStringsLimit(
  report: XlsxContainerReport,
  bytes: Uint8Array,
  caps: XlsxEffectiveCaps
): void {
  const entry = findEntry(report.directory, 'xl/sharedStrings.xml')
  if (entry === undefined) return
  assertXlsxLimit(
    { tier: 'shared-strings', rule: 'shared-strings-bytes', threshold: caps.sharedStringsBytes },
    caps.sharedStringsBytes,
    entry.decompressedBytes
  )
  const count = sharedStringsCount(readEntryHead(bytes, entry))
  if (count === undefined) return
  assertXlsxLimit(
    {
      tier: 'shared-strings',
      rule: 'shared-strings-count',
      threshold: XLSX_TIER3_LIMITS.sharedStringsCount
    },
    XLSX_TIER3_LIMITS.sharedStringsCount,
    count
  )
}

/** Sheet bounds on the decoded range (§5.3). */
export function assertSheetBounds(sheet: {
  readonly rows: number
  readonly columns: number
  readonly nonEmptyCells: number
}): void {
  assertXlsxLimit(
    { tier: 'sheet', rule: 'sheet-rows', threshold: XLSX_TIER3_LIMITS.sheetRows },
    XLSX_TIER3_LIMITS.sheetRows,
    sheet.rows
  )
  assertXlsxLimit(
    { tier: 'sheet', rule: 'sheet-columns', threshold: XLSX_TIER3_LIMITS.sheetColumns },
    XLSX_TIER3_LIMITS.sheetColumns,
    sheet.columns
  )
  assertXlsxLimit(
    { tier: 'sheet', rule: 'sheet-cells', threshold: XLSX_TIER3_LIMITS.sheetCells },
    XLSX_TIER3_LIMITS.sheetCells,
    sheet.nonEmptyCells
  )
}

/** RSS probe, injected so the two watermark states are deterministic in Node. */
export interface XlsxWatermarkOptions {
  readonly probe?: () => number
  /** Startup baseline; defaults to the first probe sample. */
  readonly baselineRss?: number
}

/** Watermark usage: §5.1 budget of the resolved case, minus what was used. */
export function checkXlsxWatermark(
  used: number,
  capacity: number,
  warnings: string[]
): void {
  const abortAt = capacity * XLSX_WATERMARK.abortRatio
  if (used >= abortAt) {
    throw new XlsxLimitExceededError(
      { tier: 'watermark', rule: 'watermark-abort', threshold: Math.floor(abortAt) },
      used
    )
  }
  const warnAt = capacity * XLSX_WATERMARK.warnRatio
  if (used >= warnAt && !warnings.some((warning) => warning.startsWith('watermark-warning'))) {
    warnings.push(
      `watermark-warning: ${used} of ${capacity} bytes used (>= 60% of the sheet budget)`
    )
  }
}

function findEntry(
  directory: XlsxZipDirectory,
  name: string | undefined
): XlsxZipEntry | undefined {
  if (name === undefined) return undefined
  return directory.entries.find((entry) => entry.name === name)
}

/** Map a sheet name to its `xl/worksheets/*.xml` part via workbook rels. */
function sheetXmlPart(
  report: XlsxContainerReport,
  bytes: Uint8Array,
  sheetName: string
): string | undefined {
  const workbook = findEntry(report.directory, 'xl/workbook.xml')
  const rels = findEntry(report.directory, 'xl/_rels/workbook.xml.rels')
  if (workbook === undefined || rels === undefined) return undefined

  const sheetTags = readEntryHead(bytes, workbook).match(/<sheet\b[^>]*>/g) ?? []
  const target = sheetTags
    .map((tag) => ({
      name: attribute(tag, 'name'),
      relId: attribute(tag, 'r:id')
    }))
    .find((sheet) => sheet.name !== undefined && sheet.name.toLowerCase() === sheetName.toLowerCase())
  if (target?.relId === undefined) return undefined

  const relTags = readEntryHead(bytes, rels).match(/<Relationship\b[^>]*>/g) ?? []
  const relationship = relTags
    .map((tag) => ({ id: attribute(tag, 'Id'), target: attribute(tag, 'Target') }))
    .find((candidate) => candidate.id === target.relId)
  if (relationship?.target === undefined) return undefined

  const target_ = relationship.target.replace(/^\.?\//, '')
  return target_.startsWith('xl/') ? target_ : `xl/${target_}`
}

function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(tag)
  return match?.[1]
}

/** `count` / `uniqueCount` on the `<sst>` root tag; undefined when unreadable. */
function sharedStringsCount(head: string): number | undefined {
  const root = /<sst\b[^>]*>/.exec(head)?.[0]
  if (root === undefined) return undefined
  const unique = attribute(root, 'uniqueCount')
  const total = attribute(root, 'count')
  const value = Number(unique ?? total)
  return Number.isFinite(value) ? value : undefined
}

const HEAD_COMPRESSED_BYTES = 8 * 1024
const HEAD_OUTPUT_BYTES = 64 * 1024

/** Inflate just enough of one entry to read XML attributes. */
function readEntryHead(bytes: Uint8Array, entry: XlsxZipEntry): string {
  const raw = bytes.subarray(entry.dataOffset, entry.dataOffset + entry.compressedBytes)
  if (entry.method === 0) {
    return Buffer.from(raw.subarray(0, HEAD_OUTPUT_BYTES)).toString('utf8')
  }
  try {
    const head = inflateRawSync(raw.subarray(0, HEAD_COMPRESSED_BYTES), {
      finishFlush: zlibConstants.Z_SYNC_FLUSH,
      maxOutputLength: HEAD_OUTPUT_BYTES
    })
    return Buffer.from(head).toString('utf8')
  } catch {
    return ''
  }
}

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const ZIP64_ENTRY_COUNT = 0xffff
const ZIP64_SIZE = 0xffffffff

/**
 * Read the zip central directory. Returns null when the bytes are not a zip
 * container at all (the workbook reader reports that case itself).
 */
export function readXlsxZipDirectory(bytes: Uint8Array): XlsxZipDirectory | null {
  const view = new DataView(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength)
  const eocd = findEndOfCentralDirectory(view)
  if (eocd === -1) return null

  const declaredCount = view.getUint16(eocd + 10, true)
  if (declaredCount === ZIP64_ENTRY_COUNT) {
    // Zip64 only appears past 65,535 entries, already over the entry-count gate.
    return { entryCount: declaredCount, entries: [] }
  }
  const centralOffset = view.getUint32(eocd + 16, true)

  const entries: XlsxZipEntry[] = []
  let position = centralOffset
  for (let index = 0; index < declaredCount; index += 1) {
    if (position + 46 > view.byteLength || view.getUint32(position, true) !== CENTRAL_SIGNATURE) {
      break
    }
    const method = view.getUint16(position + 10, true)
    let compressedBytes = view.getUint32(position + 20, true)
    let decompressedBytes = view.getUint32(position + 24, true)
    const nameLength = view.getUint16(position + 28, true)
    const extraLength = view.getUint16(position + 30, true)
    const commentLength = view.getUint16(position + 32, true)
    const localOffset = view.getUint32(position + 42, true)
    const name = Buffer.from(
      bytes.subarray(position + 46, position + 46 + nameLength)
    ).toString('utf8')

    if (decompressedBytes === ZIP64_SIZE || compressedBytes === ZIP64_SIZE) {
      const extraStart = position + 46 + nameLength
      const zip64 = readZip64Sizes(view, extraStart, extraLength, {
        compressedBytes,
        decompressedBytes
      })
      compressedBytes = zip64.compressedBytes
      decompressedBytes = zip64.decompressedBytes
    }

    entries.push({
      name,
      method,
      compressedBytes,
      decompressedBytes,
      dataOffset: localDataOffset(view, localOffset)
    })
    position += 46 + nameLength + extraLength + commentLength
  }

  return { entryCount: declaredCount, entries }
}

function findEndOfCentralDirectory(view: DataView): number {
  const earliest = Math.max(0, view.byteLength - 22 - 0xffff)
  for (let position = view.byteLength - 22; position >= earliest; position -= 1) {
    if (view.getUint32(position, true) === EOCD_SIGNATURE) return position
  }
  return -1
}

function readZip64Sizes(
  view: DataView,
  extraStart: number,
  extraLength: number,
  sizes: { compressedBytes: number; decompressedBytes: number }
): { compressedBytes: number; decompressedBytes: number } {
  const extraEnd = extraStart + extraLength
  let compressedBytes = sizes.compressedBytes
  let decompressedBytes = sizes.decompressedBytes
  let position = extraStart
  while (position + 4 <= extraEnd) {
    const id = view.getUint16(position, true)
    const size = view.getUint16(position + 2, true)
    const dataStart = position + 4
    if (id === 0x0001) {
      let cursor = dataStart
      if (decompressedBytes === ZIP64_SIZE && cursor + 8 <= dataStart + size) {
        decompressedBytes = readUint64(view, cursor)
        cursor += 8
      }
      if (compressedBytes === ZIP64_SIZE && cursor + 8 <= dataStart + size) {
        compressedBytes = readUint64(view, cursor)
      }
      break
    }
    position += 4 + size
  }
  return { compressedBytes, decompressedBytes }
}

function readUint64(view: DataView, position: number): number {
  const value = view.getBigUint64(position, true)
  return value > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(value)
}

function localDataOffset(view: DataView, localOffset: number): number {
  if (localOffset + 30 > view.byteLength) return 0
  const nameLength = view.getUint16(localOffset + 26, true)
  const extraLength = view.getUint16(localOffset + 28, true)
  return localOffset + 30 + nameLength + extraLength
}
