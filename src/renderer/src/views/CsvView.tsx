import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { AlertTriangle, Check } from 'lucide-react'
import type { CsvSample } from '@shared/fixtures'
import { alignCsvTables, commonCsvColumns } from '@core/csv/align'
import type { CsvAlignCounts, CsvAlignedCell, CsvAlignedRow, CsvColumnRef } from '@core/csv/align'
import { DiffDot } from '@renderer/components/DiffBadge'
import { Panel } from '@renderer/components/Panel'
import { SegmentedControl } from '@renderer/components/SegmentedControl'
import { cx } from '@renderer/components/utils'
import type { CsvTables } from '@renderer/workbench/session'

/** Row alignment counts reported up to the workbench status bar. */
export interface CsvAlignState {
  readonly sessionId: string
  readonly counts: CsvAlignCounts
}

type CsvRowFilter = 'all' | 'differences' | 'added' | 'removed' | 'modified' | 'same'

const FILTER_OPTIONS: readonly { readonly value: CsvRowFilter; readonly label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'differences', label: '仅差异' },
  { value: 'added', label: '新增' },
  { value: 'removed', label: '删除' },
  { value: 'modified', label: '修改' },
  { value: 'same', label: '相同' }
]

const ROW_TONE: Record<CsvAlignedRow['status'], string> = {
  same: '',
  added: 'bg-diff-added-soft',
  removed: 'bg-diff-removed-soft',
  modified: 'bg-diff-modified-soft'
}

/** Fixed row height keeps the virtualizer exact and scrolling cheap. */
const ROW_HEIGHT = 28

function matchesFilter(row: CsvAlignedRow, filter: CsvRowFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'differences':
      return row.status !== 'same'
    default:
      return row.status === filter
  }
}

/** Declared primary keys win; a drilldown session defaults to the first shared column. */
function initialKeys(declared: readonly string[], candidates: readonly string[]): readonly string[] {
  const usable = declared.filter((name) => candidates.includes(name))
  if (usable.length > 0) return usable
  return candidates.length > 0 ? [candidates[0]] : []
}

function basename(path: string): string {
  const segments = path.split('/')
  return segments[segments.length - 1] || path
}

function displayValue(value: string | null): string {
  return value !== null && value.length > 0 ? value : '∅'
}

/** One aligned cell: changed cells inline the left and right value. */
function CsvCell({ cell }: { readonly cell: CsvAlignedCell }): JSX.Element {
  if (cell.changed) {
    return (
      <span className="rounded-xs bg-diff-modified-soft px-1 text-diff-modified">
        {`${displayValue(cell.left)} → ${displayValue(cell.right)}`}
      </span>
    )
  }
  return <>{displayValue(cell.left ?? cell.right)}</>
}

/** Virtualised aligned table: only the rows in the viewport reach the DOM. */
function CsvAlignedTable({
  columns,
  rows
}: {
  readonly columns: readonly CsvColumnRef[]
  readonly rows: readonly CsvAlignedRow[]
}): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  // TanStack Virtual's returned functions are intentionally not memoizable.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12
  })

  const items = virtualizer.getVirtualItems()
  const paddingTop = items.length > 0 ? items[0].start : 0
  const paddingBottom =
    items.length > 0 ? virtualizer.getTotalSize() - items[items.length - 1].end : 0
  const columnCount = columns.length + 1

  return (
    <div ref={scrollRef} className="h-full min-h-0 overflow-auto">
      <table className="min-w-full border-collapse font-mono text-xs">
        <thead className="sticky top-0 z-10 bg-surface-overlay">
          <tr>
            <th className="w-12 border-r border-b border-line-subtle px-2 py-1 text-right text-2xs font-normal text-content-muted">
              #
            </th>
            {columns.map((column, index) => (
              <th
                key={`${column.name}-${index}`}
                className={cx(
                  'border-r border-b border-line-subtle px-2 py-1 text-left text-2xs font-medium whitespace-nowrap',
                  column.key ? 'text-accent' : 'text-content-secondary'
                )}
              >
                {column.name}
                {column.presence !== 'both' ? (
                  <span className="ml-1 font-normal text-content-muted">
                    {column.presence === 'left' ? '仅左' : '仅右'}
                  </span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 ? (
            <tr aria-hidden>
              <td colSpan={columnCount} style={{ height: paddingTop, padding: 0, border: 0 }} />
            </tr>
          ) : null}
          {items.map((item) => {
            const row = rows[item.index]
            return (
              <tr
                key={item.key}
                style={{ height: ROW_HEIGHT }}
                className={cx('transition-fast hover:bg-surface-hover', ROW_TONE[row.status])}
              >
                <td className="border-r border-b border-line-subtle px-2 text-right text-2xs text-content-muted">
                  <span className="flex items-center justify-end gap-1">
                    <span className="tabular">{item.index + 1}</span>
                    <DiffDot status={row.status} />
                  </span>
                </td>
                {row.cells.map((cell, index) => (
                  <td
                    key={`${cell.column}-${index}`}
                    className={cx(
                      'border-r border-b border-line-subtle px-2 whitespace-nowrap',
                      columns[index]?.key ? 'text-content-primary' : 'text-content-secondary'
                    )}
                  >
                    <CsvCell cell={cell} />
                  </td>
                ))}
              </tr>
            )
          })}
          {paddingBottom > 0 ? (
            <tr aria-hidden>
              <td
                colSpan={columnCount}
                style={{ height: paddingBottom, padding: 0, border: 0 }}
              />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Scene C — key-aligned reconciliation. Rows are paired by the user-selected
 * key columns, so either side may be shuffled and carry extra or reordered
 * columns; the parsed row counts are reported back to the status bar.
 */
export function CsvView({
  sessionId,
  left,
  right,
  defaultKeyColumns,
  tables,
  onAlignStateChange
}: {
  readonly sessionId: string
  readonly left: CsvSample
  readonly right: CsvSample
  /** Declared primary keys; empty for a drilldown session. */
  readonly defaultKeyColumns: readonly string[]
  readonly tables: CsvTables
  readonly onAlignStateChange?: (state: CsvAlignState) => void
}): JSX.Element {
  const candidates = useMemo(() => commonCsvColumns(tables.left, tables.right), [tables])
  const [keyColumns, setKeyColumns] = useState<readonly string[]>(() =>
    initialKeys(defaultKeyColumns, candidates)
  )
  const [filter, setFilter] = useState<CsvRowFilter>('all')

  const align = useMemo(
    () => alignCsvTables(tables.left, tables.right, keyColumns),
    [tables, keyColumns]
  )
  const visible = useMemo(() => align.rows.filter((row) => matchesFilter(row, filter)), [align, filter])

  const counts = align.counts
  useEffect(() => {
    onAlignStateChange?.({ sessionId, counts })
  }, [sessionId, counts, onAlignStateChange])

  function toggleKey(name: string): void {
    setKeyColumns((current) =>
      current.includes(name) ? current.filter((key) => key !== name) : [...current, name]
    )
  }

  const duplicateHint = align.duplicateKeys
    .map((entry) => `${entry.key.join(' + ')}（左 ${entry.left} · 右 ${entry.right}）`)
    .join('\n')

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-2">
      <div
        role="toolbar"
        aria-label="CSV 对齐工具"
        className="flex shrink-0 flex-wrap items-center gap-2"
      >
        <span className="text-2xs text-content-muted">主键列</span>
        <div role="group" aria-label="主键列选择" className="flex flex-wrap items-center gap-1">
          {candidates.map((name) => {
            const active = keyColumns.includes(name)
            return (
              <button
                key={name}
                type="button"
                aria-pressed={active}
                onClick={() => toggleKey(name)}
                className={cx(
                  'focus-ring transition-fast inline-flex h-6 items-center gap-1 rounded-xs border px-2 font-mono text-2xs',
                  active
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line-subtle bg-surface-raised text-content-secondary hover:border-line-strong hover:text-content-primary'
                )}
              >
                {active ? <Check aria-hidden className="size-3" /> : null}
                {name}
              </button>
            )
          })}
        </div>

        <span aria-hidden className="h-3 w-px shrink-0 bg-line-subtle" />
        <SegmentedControl
          label="状态过滤"
          options={FILTER_OPTIONS}
          value={filter}
          onChange={setFilter}
        />

        <span className="ml-auto flex shrink-0 items-center gap-3 text-2xs text-content-muted">
          {align.duplicateKeys.length > 0 ? (
            <span
              className="flex items-center gap-1 text-diff-modified"
              aria-label="重复主键"
              title={duplicateHint}
            >
              <AlertTriangle aria-hidden className="size-3" />
              重复主键 {align.duplicateKeys.length}
            </span>
          ) : null}
          <span className="tabular font-mono text-content-secondary">
            {`${visible.length.toLocaleString('en-US')} / ${align.rows.length.toLocaleString('en-US')} 行`}
          </span>
        </span>
      </div>

      <Panel
        title={`${basename(left.path)} ↔ ${basename(right.path)}`}
        subtitle={`对齐 ${align.rows.length.toLocaleString('en-US')} 行 · 主键 ${keyColumns.join(' + ') || '未选择'}`}
      >
        {align.columns.length === 0 ? (
          <p className="p-3 text-2xs text-content-muted">
            未选择主键列，无法按主键对齐行。请在工具栏勾选至少一列共有列。
          </p>
        ) : visible.length === 0 ? (
          <p className="p-3 text-2xs text-content-muted">
            {align.rows.length === 0 ? '当前主键下没有可对齐的行。' : '当前过滤条件下没有行。'}
          </p>
        ) : (
          <CsvAlignedTable columns={align.columns} rows={visible} />
        )}
      </Panel>
    </div>
  )
}
