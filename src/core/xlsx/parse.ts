/**
 * xlsx / xlsm value-extraction layer.
 *
 * Reads a workbook into the same `{ header, rows }` shape as the CSV parser so
 * the existing `alignCsvTables` can consume it unchanged. This module is a
 * pure function layer: no Electron, DOM or React, and it never evaluates a
 * formula. Only `<c><v>` cached values are read (`cellFormula: false`).
 *
 * Semantics (see docs/plans/2026-11-18-xlsx-xlsm-comparison-assessment.md §1):
 * - formulas: cached value only, no evaluation, no formula text; cells without
 *   a cached value become `''` and are counted in `meta.uncachedFormulaCells`.
 * - merged cells: the top-left anchor keeps its value, every other cell in the
 *   range becomes `''`; the row count is unchanged.
 * - styles / comments / conditional formatting never reach the output, and the
 *   shared-strings table is only an intermediate layer.
 * - dates use the workbook `date1904` base plus the cell's `numFmt` and become
 *   `YYYY-MM-DD` / `YYYY-MM-DDTHH:mm:ss` (no timezone); other numbers use 15
 *   significant digits with trailing zeros stripped.
 * - `.xlsm` is read with `bookVBA: false`: macros are never parsed or run.
 */

import * as XLSX from 'xlsx'
import type { CellObject, DenseWorkSheet, WorkBook } from 'xlsx'

import {
  assertSheetBounds,
  assertSheetXmlLimit,
  assertSharedStringsLimit,
  checkXlsxWatermark,
  effectiveXlsxCaps,
  XlsxLimitExceededError,
  inspectXlsxContainer,
  resolveXlsxBudget,
  type XlsxBudgetMode
} from './limits'

/** Table shape that `alignCsvTables` accepts, plus the xlsx-only parse facts. */
export interface XlsxTableData {
  readonly header: readonly string[]
  readonly rows: readonly (readonly string[])[]
  readonly meta: XlsxTableMeta
}

/** Parse facts kept next to the table; never part of the diff itself. */
export interface XlsxTableMeta {
  /** Sheet actually parsed ('' when the workbook has no sheet). */
  readonly sheetName: string
  /** All sheet names in the workbook, in workbook order. */
  readonly sheetNames: readonly string[]
  /** 1-based row number of the header row (0 when the sheet is empty). */
  readonly headerRow: number
  /** Workbook 1904 date system flag. */
  readonly date1904: boolean
  /** Value-less cells read as empty because a formula has no cached value. */
  readonly uncachedFormulaCells: number
  /** 1-based row numbers flagged hidden; they still take part in the compare. */
  readonly hiddenRows: readonly number[]
  /** Column letters flagged hidden; they still take part in the compare. */
  readonly hiddenColumns: readonly string[]
  /** Indexes into `header` / each row of the hidden columns above. */
  readonly hiddenColumnIndexes: readonly number[]
  /** Merged ranges, e.g. `A4:B5`. */
  readonly mergedRanges: readonly string[]
  /** Runtime watermark warnings (§5.5); empty when the parse stayed under 60%. */
  readonly warnings: readonly string[]
}

/** One left/right sheet pair matched by name (case-insensitive). */
export interface XlsxSheetPair {
  readonly left: string
  readonly right: string
}

/** Sheet name diff between the two sides of a comparison. */
export interface XlsxSheetPairing {
  readonly pairs: readonly XlsxSheetPair[]
  readonly leftOnly: readonly string[]
  readonly rightOnly: readonly string[]
}

export interface XlsxParseOptions {
  /** Sheet to parse; case-insensitive. Defaults to the workbook's first sheet. */
  readonly sheetName?: string
  /** Concurrent tabs held by the comparison; picks the §5.1 budget. Default 1. */
  readonly tabCount?: 1 | 3
  /** Read mode driving the §5.1 amplification factor. Default `dense`. */
  readonly mode?: XlsxBudgetMode
  /** RSS probe (bytes); injected so the §5.5 watermark is testable. */
  readonly rssProbe?: () => number
  /** Startup RSS baseline; defaults to the first probe sample. */
  readonly baselineRss?: number
}

const READ_OPTIONS = {
  type: 'array' as const,
  dense: true,
  cellFormula: false,
  cellStyles: true,
  cellNF: true,
  cellHTML: false,
  cellText: false,
  bookVBA: false
}

/** Sheet names in workbook order. */
export function listSheets(bytes: Uint8Array): readonly string[] {
  const workbook = XLSX.read(bytes, { type: 'array', bookSheets: true, bookVBA: false })
  return [...workbook.SheetNames]
}

/** Parse one sheet (case-insensitive) into the shared table shape. */
export function parseXlsxSheet(bytes: Uint8Array, sheetName: string): XlsxTableData {
  return parseXlsxTable(bytes, { sheetName })
}

/**
 * RSS probe for the runtime watermark. `process` only exists outside the
 * sandboxed Electron renderer; without it the probe reports 0 and the watermark
 * falls back to the central-directory decompressed byte count alone. The
 * thresholds themselves are unchanged.
 */
function defaultRssProbe(): number {
  const host = globalThis as { process?: { memoryUsage?: () => { rss?: number } } }
  const rss = host.process?.memoryUsage?.()?.rss
  return typeof rss === 'number' ? rss : 0
}

/** Parse a workbook's first sheet, or the sheet named in `options`. */
export function parseXlsxTable(bytes: Uint8Array, options: XlsxParseOptions = {}): XlsxTableData {
  const budget = resolveXlsxBudget({
    tabCount: options.tabCount ?? 1,
    mode: options.mode ?? 'dense'
  })
  if (!budget.supported) {
    throw new XlsxLimitExceededError(
      { tier: 'budget', rule: 'unsupported-combination', threshold: 0 },
      0
    )
  }

  // Container gates first: central directory only, nothing inflated yet.
  const report = inspectXlsxContainer(bytes, budget)
  const caps = effectiveXlsxCaps(budget)
  const warnings: string[] = []
  const probe = options.rssProbe ?? defaultRssProbe
  const baselineRss = options.baselineRss ?? probe()
  const usedBytes = (): number => Math.max(report.decompressedBytes, probe() - baselineRss)
  checkXlsxWatermark(usedBytes(), budget.decompressedBytes, warnings)

  const requested = options.sheetName
  const sheetNames = listSheets(bytes)
  if (requested !== undefined && !sheetNames.some((name) => sameSheetName(name, requested))) {
    throw new Error(
      `Workbook has no sheet named "${requested}" (available: ${sheetNames.join(', ')})`
    )
  }

  const sheetName =
    requested === undefined
      ? sheetNames[0]
      : sheetNames.find((name) => sameSheetName(name, requested))

  if (sheetName === undefined) {
    return buildMetaTable(
      {
        sheetName: '',
        sheetNames,
        headerRow: 0,
        date1904: false,
        uncachedFormulaCells: 0,
        hiddenRows: [],
        hiddenColumns: [],
        hiddenColumnIndexes: [],
        mergedRanges: [],
        warnings
      },
      [],
      []
    )
  }

  assertSheetXmlLimit(report, bytes, sheetName, caps)
  assertSharedStringsLimit(report, bytes, caps)

  const workbook = XLSX.read(bytes, { ...READ_OPTIONS, sheets: sheetName })
  const sheet = workbook.Sheets[sheetName] as DenseWorkSheet | undefined
  const date1904 = Boolean(workbook.Workbook?.WBProps?.date1904)

  const range = sheetRef(sheet)
  if (range !== undefined) {
    assertSheetBounds({
      rows: range.e.r - range.s.r + 1,
      columns: range.e.c - range.s.c + 1,
      nonEmptyCells: countNonEmptyCells(sheet?.['!data'] ?? [], range)
    })
  }
  checkXlsxWatermark(usedBytes(), budget.decompressedBytes, warnings)

  return buildTable(workbook, sheetName, sheet, date1904, warnings)
}

/**
 * Pair two sheet lists by name (case-insensitive). Pairing is by name only:
 * it never merges sheets and never falls back to "first sheet on both sides".
 */
export function matchXlsxSheets(
  left: readonly string[],
  right: readonly string[]
): XlsxSheetPairing {
  const rightByName = new Map<string, string>()
  for (const name of right) {
    const key = name.toLowerCase()
    if (!rightByName.has(key)) rightByName.set(key, name)
  }

  const pairedRight = new Set<string>()
  const pairs: XlsxSheetPair[] = []
  const leftOnly: string[] = []
  for (const name of left) {
    const match = rightByName.get(name.toLowerCase())
    if (match === undefined) {
      leftOnly.push(name)
      continue
    }
    pairedRight.add(match)
    pairs.push({ left: name, right: match })
  }

  return {
    pairs,
    leftOnly,
    rightOnly: right.filter((name) => !pairedRight.has(name))
  }
}

function sameSheetName(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase()
}

function sheetRef(sheet: DenseWorkSheet | undefined): XLSX.Range | undefined {
  const ref = sheet?.['!ref']
  return ref === undefined ? undefined : XLSX.utils.decode_range(ref)
}

/** Cells carrying any value inside the range; merged blanks and stubs do not count. */
function countNonEmptyCells(
  data: readonly (readonly CellObject[])[],
  range: XLSX.Range
): number {
  let count = 0
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const row = data[r]
    if (row === undefined) continue
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      if (row[c]?.v != null) count += 1
    }
  }
  return count
}

function buildMetaTable(
  meta: XlsxTableMeta,
  header: readonly string[],
  rows: readonly (readonly string[])[]
): XlsxTableData {
  return { header, rows, meta }
}

function buildTable(
  workbook: WorkBook,
  sheetName: string,
  sheet: DenseWorkSheet | undefined,
  date1904: boolean,
  warnings: readonly string[]
): XlsxTableData {
  const sheetNames = [...workbook.SheetNames]
  const mergeRanges: XLSX.Range[] = sheet?.['!merges'] ?? []
  const mergedRanges: string[] = mergeRanges.map((range) => XLSX.utils.encode_range(range))
  const emptyMeta: XlsxTableMeta = {
    sheetName,
    sheetNames,
    headerRow: 0,
    date1904,
    uncachedFormulaCells: 0,
    hiddenRows: [],
    hiddenColumns: [],
    hiddenColumnIndexes: [],
    mergedRanges,
    warnings
  }

  const ref = sheet?.['!ref']
  if (!sheet || ref === undefined) return buildMetaTable(emptyMeta, [], [])

  const range = XLSX.utils.decode_range(ref)
  const data = sheet['!data'] ?? []
  const mergedBlanks = collectMergedBlanks(sheet)
  const uncachedFormulaCells = countUncachedFormulas(data, range)

  const rowTexts: string[][] = []
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    rowTexts.push(readRow(data, r, range, mergedBlanks, date1904))
  }

  const headerIndex = rowTexts.findIndex(hasValue)
  if (headerIndex === -1) {
    return buildMetaTable({ ...emptyMeta, uncachedFormulaCells }, [], [])
  }

  let lastDataIndex = rowTexts.length - 1
  while (lastDataIndex > headerIndex && !hasValue(rowTexts[lastDataIndex])) lastDataIndex -= 1

  const columns = resolveColumns(rowTexts[headerIndex], range.s.c)
  const header = columns.map((column) => column.name)
  const hiddenColumns = collectHiddenColumns(sheet, range)
  // The table drops duplicate header names, so the sheet letter has to be
  // mapped back onto the column's current position.
  const hiddenColumnIndexes = columns.flatMap((column, index) =>
    hiddenColumns.includes(XLSX.utils.encode_col(range.s.c + column.index)) ? [index] : []
  )
  const rows = rowTexts
    .slice(headerIndex + 1, lastDataIndex + 1)
    .map((row) => columns.map((column) => row[column.index]))

  return buildMetaTable(
    {
      ...emptyMeta,
      headerRow: range.s.r + headerIndex + 1,
      uncachedFormulaCells,
      hiddenRows: collectHiddenRows(sheet, range),
      hiddenColumns,
      hiddenColumnIndexes
    },
    header,
    rows
  )
}

interface ColumnRef {
  readonly name: string
  readonly index: number
}

/**
 * Name the header cells: empty names fall back to the column letter, and the
 * first occurrence of a duplicated name wins (the `align.ts` `indexHeader`
 * rule), so later duplicates are dropped from both header and rows.
 */
function resolveColumns(headerRow: readonly string[], firstColumn: number): ColumnRef[] {
  const seen = new Set<string>()
  const columns: ColumnRef[] = []
  headerRow.forEach((cell, index) => {
    const letter = XLSX.utils.encode_col(firstColumn + index)
    const trimmed = cell.trim()
    const name = trimmed === '' ? letter : trimmed
    if (seen.has(name)) return
    seen.add(name)
    columns.push({ name, index })
  })
  return columns
}

function collectMergedBlanks(sheet: DenseWorkSheet): Set<string> {
  const blanks = new Set<string>()
  for (const range of sheet['!merges'] ?? []) {
    for (let r = range.s.r; r <= range.e.r; r += 1) {
      for (let c = range.s.c; c <= range.e.c; c += 1) {
        if (r === range.s.r && c === range.s.c) continue
        blanks.add(`${r}:${c}`)
      }
    }
  }
  return blanks
}

function countUncachedFormulas(
  data: readonly (readonly CellObject[])[],
  range: XLSX.Range
): number {
  let count = 0
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const row = data[r]
    if (row === undefined) continue
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      if (isValueLessCell(row[c])) count += 1
    }
  }
  return count
}

/**
 * With `cellFormula: false` a formula cell that has no cached `<v>` has no
 * value left to report: numeric and shared-formula cells surface as `z` stubs,
 * error formulas as `e` cells without a value.
 */
function isValueLessCell(cell: CellObject | undefined): boolean {
  return cell !== undefined && cell.v == null && (cell.t === 'z' || cell.t === 'e')
}

function readRow(
  data: readonly (readonly CellObject[])[],
  rowIndex: number,
  range: XLSX.Range,
  mergedBlanks: ReadonlySet<string>,
  date1904: boolean
): string[] {
  const cells = data[rowIndex] ?? []
  const row: string[] = []
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    if (mergedBlanks.has(`${rowIndex}:${c}`)) {
      row.push('')
      continue
    }
    row.push(cellText(cells[c], date1904))
  }
  return row
}

function hasValue(row: readonly string[] | undefined): boolean {
  return row !== undefined && row.some((cell) => cell !== '')
}

function cellText(cell: CellObject | undefined, date1904: boolean): string {
  if (cell === undefined || cell.v == null || cell.t === 'z') return ''
  switch (cell.t) {
    case 's':
      return typeof cell.v === 'string' ? cell.v : String(cell.v)
    case 'b':
      return cell.v ? 'TRUE' : 'FALSE'
    case 'e':
      return typeof cell.v === 'string' ? cell.v : ''
    case 'n':
      return typeof cell.v === 'number' ? numericText(cell, cell.v, date1904) : String(cell.v)
    case 'd':
      return cell.v instanceof Date ? dateText(cell.v) : String(cell.v)
    default:
      return String(cell.v)
  }
}

function numericText(cell: CellObject, value: number, date1904: boolean): string {
  if (cell.z !== undefined && XLSX.SSF.is_date(cell.z)) {
    const parts = XLSX.SSF.parse_date_code(value, { date1904 }) as DateParts | undefined
    if (parts !== undefined) return formatDateParts(parts)
  }
  return formatNumber(value)
}

interface DateParts {
  readonly y: number
  readonly m: number
  readonly d: number
  readonly H: number
  readonly M: number
  readonly S: number
}

/** `YYYY-MM-DD` for a date, `YYYY-MM-DDTHH:mm:ss` as soon as a time remains. */
function formatDateParts(parts: DateParts): string {
  return dateText(new Date(Date.UTC(parts.y, parts.m - 1, parts.d, parts.H, parts.M, parts.S)))
}

function dateText(date: Date): string {
  const iso = date.toISOString()
  const day = iso.slice(0, 10)
  const time = iso.slice(11, 19)
  return time === '00:00:00' ? day : `${day}T${time}`
}

/** 15 significant digits (Excel's own precision), trailing zeros stripped. */
function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  const precise = value.toPrecision(15)
  const [mantissa, exponent] = precise.split('e')
  const trimmed = mantissa.includes('.') ? mantissa.replace(/\.?0+$/, '') : mantissa
  return exponent === undefined ? trimmed : `${trimmed}e${exponent}`
}

function collectHiddenRows(sheet: DenseWorkSheet, range: XLSX.Range): number[] {
  const hidden: number[] = []
  const rows = sheet['!rows'] ?? []
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    if (rows[r]?.hidden === true) hidden.push(r + 1)
  }
  return hidden
}

function collectHiddenColumns(sheet: DenseWorkSheet, range: XLSX.Range): string[] {
  const hidden: string[] = []
  const cols = sheet['!cols'] ?? []
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    if (cols[c]?.hidden === true) hidden.push(XLSX.utils.encode_col(c))
  }
  return hidden
}
