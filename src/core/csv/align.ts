/**
 * Key-aligned CSV/TSV comparison engine.
 *
 * Pure data in, pure data out: the parsed tables come from the renderer's
 * `parseCsvTable`, and this module never touches Electron, DOM or React. Rows
 * are paired across both sides by the key columns the user selected, so the
 * row order of either side is irrelevant. Columns are paired by *name*, which
 * absorbs a column-order shift and single-sided columns like the sample's
 * right-only `region`; such columns are shown but never counted as a change.
 */

export type CsvRowStatus = 'same' | 'added' | 'removed' | 'modified'

/** A parsed delimited table: header plus data rows. */
export interface CsvTableData {
  readonly header: readonly string[]
  readonly rows: readonly (readonly string[])[]
}

/** Where a unified column comes from. */
export type CsvColumnPresence = 'both' | 'left' | 'right'

export interface CsvColumnRef {
  readonly name: string
  readonly presence: CsvColumnPresence
  /** True for the selected key columns, which are placed first. */
  readonly key: boolean
}

export interface CsvAlignedCell {
  readonly column: string
  readonly left: string | null
  readonly right: string | null
  /** True only for shared columns whose values differ on a paired row. */
  readonly changed: boolean
}

export interface CsvAlignedRow {
  /** Key tuple values, in the selected key-column order. */
  readonly key: readonly string[]
  readonly status: CsvRowStatus
  readonly cells: readonly CsvAlignedCell[]
  /** Names of the changed columns, in unified column order. */
  readonly changedColumns: readonly string[]
}

export interface CsvAlignCounts {
  readonly same: number
  readonly added: number
  readonly removed: number
  readonly modified: number
}

/** A key that appears more than once on at least one side. */
export interface CsvDuplicateKey {
  readonly key: readonly string[]
  readonly left: number
  readonly right: number
}

export interface CsvAlignResult {
  readonly columns: readonly CsvColumnRef[]
  readonly rows: readonly CsvAlignedRow[]
  readonly counts: CsvAlignCounts
  /** Duplicate keys, in first-seen order. */
  readonly duplicateKeys: readonly CsvDuplicateKey[]
}

/** Returned when no key column can be resolved; the view renders an empty state. */
export const EMPTY_CSV_ALIGN: CsvAlignResult = {
  columns: [],
  rows: [],
  counts: { same: 0, added: 0, removed: 0, modified: 0 },
  duplicateKeys: []
}

/** Column names present on both sides, in left-table order (de-duplicated). */
export function commonCsvColumns(left: CsvTableData, right: CsvTableData): string[] {
  const rightNames = new Set(right.header)
  const seen = new Set<string>()
  const names: string[] = []
  for (const name of left.header) {
    if (rightNames.has(name) && !seen.has(name)) {
      seen.add(name)
      names.push(name)
    }
  }
  return names
}

/** Keeps the requested key order, dropping names absent from either side. */
function resolveKeys(left: CsvTableData, right: CsvTableData, keyColumns: readonly string[]): string[] {
  const leftNames = new Set(left.header)
  const rightNames = new Set(right.header)
  const seen = new Set<string>()
  const keys: string[] = []
  for (const name of keyColumns) {
    if (leftNames.has(name) && rightNames.has(name) && !seen.has(name)) {
      seen.add(name)
      keys.push(name)
    }
  }
  return keys
}

/** First index of every header name. */
function indexHeader(header: readonly string[]): Map<string, number> {
  const index = new Map<string, number>()
  header.forEach((name, position) => {
    if (!index.has(name)) index.set(name, position)
  })
  return index
}

function keyOf(
  row: readonly string[],
  keys: readonly string[],
  index: ReadonlyMap<string, number>
): string[] {
  return keys.map((name) => {
    const position = index.get(name)
    return position === undefined ? '' : (row[position] ?? '')
  })
}

function keyId(key: readonly string[]): string {
  return JSON.stringify(key)
}

/** Unified column set: keys first, then left columns, then right-only ones. */
function buildColumns(
  left: CsvTableData,
  right: CsvTableData,
  keys: readonly string[]
): CsvColumnRef[] {
  const keySet = new Set(keys)
  const rightNames = new Set(right.header)
  const seen = new Set<string>()
  const columns: CsvColumnRef[] = []

  for (const name of keys) columns.push({ name, presence: 'both', key: true })

  for (const name of left.header) {
    if (keySet.has(name) || seen.has(name)) continue
    seen.add(name)
    columns.push({ name, presence: rightNames.has(name) ? 'both' : 'left', key: false })
  }

  for (const name of right.header) {
    if (keySet.has(name) || seen.has(name)) continue
    seen.add(name)
    columns.push({ name, presence: 'right', key: false })
  }

  return columns
}

function makeRow(
  status: CsvRowStatus,
  key: readonly string[],
  leftRow: readonly string[] | null,
  rightRow: readonly string[] | null,
  columns: readonly CsvColumnRef[],
  leftIndex: ReadonlyMap<string, number>,
  rightIndex: ReadonlyMap<string, number>
): CsvAlignedRow {
  const cells = columns.map((column): CsvAlignedCell => {
    const leftPosition = leftIndex.get(column.name)
    const rightPosition = rightIndex.get(column.name)
    const left =
      leftRow && leftPosition !== undefined ? (leftRow[leftPosition] ?? '') : null
    const right =
      rightRow && rightPosition !== undefined ? (rightRow[rightPosition] ?? '') : null
    const changed =
      column.presence === 'both' && left !== null && right !== null && left !== right
    return { column: column.name, left, right, changed }
  })

  return {
    key,
    status,
    cells,
    changedColumns: cells.filter((cell) => cell.changed).map((cell) => cell.column)
  }
}

/**
 * Aligns two tables by the selected key columns.
 *
 * Output order is deterministic: every left row in its original order (paired
 * or removed), then the right rows that had no counterpart in their own order.
 * Duplicate keys pair by occurrence order; surplus rows fall into the owning
 * side's added/removed count.
 */
export function alignCsvTables(
  left: CsvTableData,
  right: CsvTableData,
  keyColumns: readonly string[]
): CsvAlignResult {
  const keys = resolveKeys(left, right, keyColumns)
  if (keys.length === 0) return EMPTY_CSV_ALIGN

  const columns = buildColumns(left, right, keys)
  const leftIndex = indexHeader(left.header)
  const rightIndex = indexHeader(right.header)

  const leftKeys = left.rows.map((row) => keyOf(row, keys, leftIndex))
  const rightKeys = right.rows.map((row) => keyOf(row, keys, rightIndex))

  const rightGroups = new Map<string, number[]>()
  rightKeys.forEach((key, position) => {
    const id = keyId(key)
    const group = rightGroups.get(id)
    if (group) group.push(position)
    else rightGroups.set(id, [position])
  })

  const cursor = new Map<string, number>()
  const paired = new Set<number>()
  const rows: CsvAlignedRow[] = []
  const counts = { same: 0, added: 0, removed: 0, modified: 0 }

  leftKeys.forEach((key, position) => {
    const id = keyId(key)
    const group = rightGroups.get(id)
    const next = cursor.get(id) ?? 0
    const rightPosition = group && next < group.length ? group[next] : undefined

    if (rightPosition === undefined) {
      counts.removed += 1
      rows.push(
        makeRow('removed', key, left.rows[position], null, columns, leftIndex, rightIndex)
      )
      return
    }

    cursor.set(id, next + 1)
    paired.add(rightPosition)
    const row = makeRow(
      'modified',
      key,
      left.rows[position],
      right.rows[rightPosition],
      columns,
      leftIndex,
      rightIndex
    )
    const status: CsvRowStatus = row.changedColumns.length === 0 ? 'same' : 'modified'
    counts[status] += 1
    rows.push(status === row.status ? row : { ...row, status })
  })

  rightKeys.forEach((key, position) => {
    if (paired.has(position)) return
    counts.added += 1
    rows.push(makeRow('added', key, null, right.rows[position], columns, leftIndex, rightIndex))
  })

  return { columns, rows, counts, duplicateKeys: findDuplicates(leftKeys, rightKeys) }
}

function findDuplicates(
  leftKeys: readonly (readonly string[])[],
  rightKeys: readonly (readonly string[])[]
): CsvDuplicateKey[] {
  interface Tally {
    readonly key: readonly string[]
    left: number
    right: number
  }

  const tally = new Map<string, Tally>()
  const order: string[] = []

  const count = (keys: readonly (readonly string[])[], side: 'left' | 'right'): void => {
    for (const key of keys) {
      const id = keyId(key)
      const existing = tally.get(id)
      if (existing) existing[side] += 1
      else {
        tally.set(id, { key, left: side === 'left' ? 1 : 0, right: side === 'right' ? 1 : 0 })
        order.push(id)
      }
    }
  }

  count(leftKeys, 'left')
  count(rightKeys, 'right')

  return order
    .map((id) => tally.get(id)!)
    .filter((entry) => entry.left > 1 || entry.right > 1)
}
