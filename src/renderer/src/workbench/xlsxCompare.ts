/**
 * Opens an xlsx / xlsm workbook pair as one CSV-shaped comparison session.
 *
 * The two sides are parsed strictly one after the other: the left workbook is
 * read, every sheet is parsed into normalized `{ header, rows }` and its bytes
 * are dropped, only then is the right workbook read. The budget comes from the
 * exported §5.1 resolution (the only place the numbers live) and every limit
 * failure surfaces as the shared `XLSX_LIMIT_EXCEEDED` rejection, before any
 * session state is written.
 */
import type { PlatformPort } from '@shared/platform/types'
import {
  resolveXlsxBudget,
  XlsxLimitExceededError,
  type XlsxBudgetMode,
  type XlsxLimit
} from '@core/xlsx/limits'
import { matchXlsxSheets, parseXlsxTable, type XlsxTableData } from '@core/xlsx/parse'
import type { CsvTable, WorkbenchSession, XlsxSessionView, XlsxSheetCompare } from './session'

export interface XlsxOpenOptions {
  /** Concurrent tabs held by the comparison; picks the §5.1 budget. */
  readonly tabCount?: 1 | 3
  /** Read mode driving the §5.1 amplification factor. */
  readonly mode?: XlsxBudgetMode
  /** Probe hook: proves the two sides never parse at the same time. */
  readonly onParse?: (side: 'left' | 'right', sheetName: string) => void
}

interface ResolvedBudget {
  readonly tabCount: 1 | 3
  readonly mode: XlsxBudgetMode
}

/**
 * Rejects the §5.2 unsupported combination before a byte is read, so a refused
 * pair can never leave a half-built tab behind.
 */
function supportedBudget(budget: ResolvedBudget): ResolvedBudget {
  if (!resolveXlsxBudget(budget).supported) {
    throw new XlsxLimitExceededError(
      { tier: 'budget', rule: 'unsupported-combination', threshold: 0 },
      0
    )
  }
  return budget
}

/** One side's normalized tables, in workbook order. Bytes never escape. */
async function parseWorkbookSide(
  platform: PlatformPort,
  path: string,
  side: 'left' | 'right',
  budget: ResolvedBudget,
  onParse: XlsxOpenOptions['onParse']
): Promise<readonly XlsxTableData[]> {
  const bytes = await platform.readFileBytes(path)
  const parsed: XlsxTableData[] = []
  const first = parseXlsxTable(bytes, budget)
  onParse?.(side, first.meta.sheetName)
  parsed.push(first)
  for (const sheetName of first.meta.sheetNames.slice(1)) {
    onParse?.(side, sheetName)
    parsed.push(parseXlsxTable(bytes, { ...budget, sheetName }))
  }
  return parsed
}

/** Case-insensitive lookup that keeps the workbook's own spelling. */
function sheetTable(
  tables: readonly XlsxTableData[],
  name: string
): XlsxTableData {
  const match = tables.find((table) => table.meta.sheetName.toLowerCase() === name.toLowerCase())
  if (match === undefined) throw new Error(`Workbook has no sheet named "${name}"`)
  return match
}

const EMPTY_TABLE: CsvTable = { header: [], rows: [] }

function side(tables: readonly XlsxTableData[], name: string): XlsxSheetCompare['left'] {
  const table = sheetTable(tables, name)
  return { table: { header: table.header, rows: table.rows }, meta: table.meta }
}

/**
 * Opens two real workbook paths. The result uses the CSV scene so the existing
 * four-state alignment, filtering and cell highlighting apply unchanged.
 */
export async function openXlsxPairSession(
  platform: PlatformPort,
  leftPath: string,
  rightPath: string,
  leftName: string,
  rightName: string,
  options: XlsxOpenOptions = {}
): Promise<WorkbenchSession> {
  const budget = supportedBudget({
    tabCount: options.tabCount ?? 1,
    mode: options.mode ?? 'dense'
  })

  const leftTables = await parseWorkbookSide(platform, leftPath, 'left', budget, options.onParse)
  const rightTables = await parseWorkbookSide(platform, rightPath, 'right', budget, options.onParse)

  const pairing = matchXlsxSheets(
    leftTables.map((table) => table.meta.sheetName),
    rightTables.map((table) => table.meta.sheetName)
  )
  const sheets: readonly XlsxSheetCompare[] = pairing.pairs.map((pair) => ({
    name: pair.left,
    left: side(leftTables, pair.left),
    right: side(rightTables, pair.right)
  }))
  const first = sheets[0]
  const xlsx: XlsxSessionView = {
    sheets,
    leftOnly: pairing.leftOnly,
    rightOnly: pairing.rightOnly,
    budget
  }

  return {
    id: `file:${leftPath} ↔ ${rightPath}`,
    scene: 'csv',
    title: leftName === rightName ? leftName : `${leftName} ↔ ${rightName}`,
    subtitle: `${leftPath} ↔ ${rightPath} · xlsx`,
    columns: 2,
    stats: [],
    adhoc: {
      scene: 'csv',
      // Values live in `xlsx`; the pair keeps only the paths for the panel title.
      pair: { left: { path: leftPath, text: '' }, right: { path: rightPath, text: '' } },
      tables: first
        ? { left: first.left.table, right: first.right.table }
        : { left: EMPTY_TABLE, right: EMPTY_TABLE }
    },
    xlsx
  }
}

/** Readable label of one rejection, straight from the error's own limit. */
export function xlsxLimitLabel(limit: XlsxLimit, observed: number): string {
  const head = `${limit.tier} · ${limit.rule}`
  if (limit.threshold <= 0) return head
  return `${head} (${formatBytes(limit.threshold)} / ${formatBytes(observed)})`
}

const MIB = 1024 * 1024

function formatBytes(bytes: number): string {
  if (bytes >= MIB) return `${Math.round((bytes / MIB) * 10) / 10} MiB`
  if (bytes >= 1024) return `${Math.round((bytes / 1024) * 10) / 10} KiB`
  return `${bytes} B`
}
