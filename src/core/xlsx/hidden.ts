/**
 * Hidden row / column policy for xlsx tables.
 *
 * The parser keeps hidden rows and columns in the table and only annotates
 * them, because dropping data silently is worse than showing it. This module is
 * the single pure decision behind the "ignore hidden rows / columns" switch:
 * the same table plus the same parse meta gives the same filtered table, and
 * the files are never read again.
 */
import type { XlsxTableMeta } from './parse'

/** The table shape the filter needs; `CsvTableData` satisfies it. */
export interface XlsxHiddenTable {
  readonly header: readonly string[]
  readonly rows: readonly (readonly string[])[]
}

/**
 * Drops the annotated hidden rows and columns when `ignoreHidden` is on.
 * Without the switch (or with nothing hidden) the input table is returned
 * as-is, so callers can rely on identity for the default "compare everything".
 */
export function applyXlsxHiddenPolicy<T extends XlsxHiddenTable>(
  table: T,
  meta: XlsxTableMeta,
  ignoreHidden: boolean
): T {
  if (!ignoreHidden) return table
  if (meta.hiddenRows.length === 0 && meta.hiddenColumnIndexes.length === 0) return table

  const hiddenColumns = new Set(meta.hiddenColumnIndexes)
  const header = table.header.filter((_, index) => !hiddenColumns.has(index))
  const rows = table.rows
    .filter((_, index) => !meta.hiddenRows.includes(meta.headerRow + 1 + index))
    .map((row) => row.filter((_, index) => !hiddenColumns.has(index)))

  return { ...table, header, rows }
}

/** Hidden row / column totals of one or both sides, for the parse summary. */
export interface XlsxHiddenCounts {
  readonly rows: number
  readonly columns: number
}

export function countHidden(metas: readonly XlsxTableMeta[]): XlsxHiddenCounts {
  let rows = 0
  let columns = 0
  for (const meta of metas) {
    rows += meta.hiddenRows.length
    columns += meta.hiddenColumnIndexes.length
  }
  return { rows, columns }
}
