import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { SHELL_ENTRY_ICONS, UI_ICON_ACTIONS } from '@renderer/assets/icons'
import type { CsvSample } from '@shared/fixtures'
import type { PlatformPort } from '@shared/platform/types'
import { alignCsvTables, commonCsvColumns } from '@core/csv/align'
import type { CsvAlignCounts, CsvAlignedCell, CsvAlignedRow, CsvColumnRef } from '@core/csv/align'
import { ToolbarButton } from '@renderer/components/Button'
import { DiffDot } from '@renderer/components/DiffBadge'
import { Icon } from '@renderer/components/Icon'
import { Panel } from '@renderer/components/Panel'
import { SegmentedControl } from '@renderer/components/SegmentedControl'
import { cx } from '@renderer/components/utils'
import { useI18n } from '@renderer/i18n/context'
import type { MessageKey } from '@renderer/i18n/messages'
import { classifyFile } from '@renderer/workbench/fileKinds'
import { DELIMITED_FILE_FILTER, pickTextFile } from '@renderer/workbench/fileIO'
import type { PickedTextFile } from '@renderer/workbench/fileIO'
import { parseCsvTable } from '@renderer/workbench/session'
import type { CsvTables } from '@renderer/workbench/session'
import { levelBandClasses, levelRowClasses } from '@renderer/workbench/shellLayout'

/** Row alignment counts reported up to the workbench status bar. */
export interface CsvAlignState {
  readonly sessionId: string
  readonly counts: CsvAlignCounts
}

type CsvRowFilter = 'all' | 'differences' | 'added' | 'removed' | 'modified' | 'same'

const FILTER_OPTIONS: readonly { readonly value: CsvRowFilter; readonly key: MessageKey }[] = [
  { value: 'all', key: 'files.csv.filter.all' },
  { value: 'differences', key: 'files.csv.filter.differences' },
  { value: 'added', key: 'common.diff.added' },
  { value: 'removed', key: 'common.diff.removed' },
  { value: 'modified', key: 'common.diff.modified' },
  { value: 'same', key: 'common.diff.same' }
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
  const { t } = useI18n()
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
                    {column.presence === 'left'
                      ? t('files.csv.presenceLeft')
                      : t('files.csv.presenceRight')}
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
  platform,
  toolbarLeading,
  onAlignStateChange,
  onOpenSide
}: {
  readonly sessionId: string
  /** Drilldown back row handed down by the shell; first row of the level. */
  readonly toolbarLeading?: ReactNode
  readonly left: CsvSample
  readonly right: CsvSample
  /** Declared primary keys; empty for a drilldown session. */
  readonly defaultKeyColumns: readonly string[]
  readonly tables: CsvTables
  readonly platform: PlatformPort
  readonly onAlignStateChange?: (state: CsvAlignState) => void
  /** Writes a newly opened file back to the session's own pair facts. */
  readonly onOpenSide?: (side: 'left' | 'right', file: PickedTextFile) => void
}): JSX.Element {
  const { t } = useI18n()
  // Opening a local file swaps one side; the parsed tables follow it, so the
  // alignment is always recomputed from the current bodies.
  const [leftSide, setLeftSide] = useState<CsvSample>(left)
  const [rightSide, setRightSide] = useState<CsvSample>(right)
  const [currentTables, setCurrentTables] = useState<CsvTables>(tables)
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null)

  const candidates = useMemo(
    () => commonCsvColumns(currentTables.left, currentTables.right),
    [currentTables]
  )
  const [keyColumns, setKeyColumns] = useState<readonly string[]>(() =>
    initialKeys(defaultKeyColumns, candidates)
  )
  const [filter, setFilter] = useState<CsvRowFilter>('all')

  const align = useMemo(
    () => alignCsvTables(currentTables.left, currentTables.right, keyColumns),
    [currentTables, keyColumns]
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

  /** Opens a local CSV / TSV file on one side and re-aligns by the key columns. */
  async function open(side: 'left' | 'right'): Promise<void> {
    try {
      const picked = await pickTextFile(
        platform,
        t(side === 'left' ? 'files.csv.openLeftTitle' : 'files.csv.openRightTitle'),
        [DELIMITED_FILE_FILTER]
      )
      if (picked === null) return
      const delimiter = classifyFile(picked.path)?.delimiter ?? ','
      const sample: CsvSample = { path: picked.path, text: picked.text, delimiter }
      const next: CsvTables = {
        left: side === 'left' ? parseCsvTable(sample) : currentTables.left,
        right: side === 'right' ? parseCsvTable(sample) : currentTables.right
      }
      // The session keeps the same tab: its pair facts carry the new path and
      // body, so the tab subtitle follows the panel instead of the old file.
      onOpenSide?.(side, picked)
      if (side === 'left') setLeftSide(sample)
      else setRightSide(sample)
      setCurrentTables(next)
      // A new pair may not share the previous keys; re-pick from the new columns.
      setKeyColumns(initialKeys(defaultKeyColumns, commonCsvColumns(next.left, next.right)))
      setNotice({ text: t('files.notice.opened', { path: picked.path }), tone: 'ok' })
    } catch (cause) {
      setNotice({ text: cause instanceof Error ? cause.message : String(cause), tone: 'error' })
    }
  }

  const duplicateHint = align.duplicateKeys
    .map((entry) =>
      t('files.csv.duplicateHint', {
        key: entry.key.join(' + '),
        left: entry.left,
        right: entry.right
      })
    )
    .join('\n')

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        data-shell-level="view-toolbar"
        className={cx(
          'flex shrink-0 flex-col border-b border-line-subtle bg-surface-sunken',
          levelBandClasses('view-toolbar')
        )}
      >
        {toolbarLeading ? (
          <div className={cx('flex shrink-0 items-center', levelRowClasses('view-toolbar'))}>
            {toolbarLeading}
          </div>
        ) : null}
        <div
          role="toolbar"
          aria-label={t('files.csv.tools')}
          className={cx('flex shrink-0 items-center', levelRowClasses('view-toolbar'))}
        >
        <span className="text-2xs text-content-muted">{t('files.csv.keyColumns')}</span>
        <div
          role="group"
          aria-label={t('files.csv.keyColumnsGroup')}
          className="flex min-w-0 items-center gap-1 overflow-x-auto"
        >
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
                {active ? <Icon name={UI_ICON_ACTIONS.check} /> : null}
                {name}
              </button>
            )
          })}
        </div>

        <span aria-hidden className="h-3 w-px shrink-0 bg-line-subtle" />
        <SegmentedControl
          label={t('files.csv.filterLabel')}
          options={FILTER_OPTIONS.map((option) => ({
            value: option.value,
            label: t(option.key)
          }))}
          value={filter}
          onChange={setFilter}
        />

        <span className="ml-auto flex shrink-0 items-center gap-3 text-2xs text-content-muted">
          {notice ? (
            <span
              role="status"
              className={cx('truncate', notice.tone === 'error' ? 'text-danger' : 'text-diff-added')}
            >
              {notice.text}
            </span>
          ) : null}
          {align.duplicateKeys.length > 0 ? (
            <span
              className="flex items-center gap-1 text-diff-modified"
              aria-label={t('files.csv.duplicates')}
              title={duplicateHint}
            >
              <Icon name={UI_ICON_ACTIONS.warning} />
              {t('files.csv.duplicateCount', { count: align.duplicateKeys.length })}
            </span>
          ) : null}
          <span className="tabular font-mono text-content-secondary">
            {t('files.csv.rows', {
              visible: visible.length.toLocaleString('en-US'),
              total: align.rows.length.toLocaleString('en-US')
            })}
          </span>
          <span aria-hidden className="h-3 w-px shrink-0 bg-line-subtle" />
          <ToolbarButton
            size="sm"
            icon={<Icon name={SHELL_ENTRY_ICONS['open-folder']} />}
            onClick={() => void open('left')}
          >
            {t('files.action.openLeft')}
          </ToolbarButton>
          <ToolbarButton
            size="sm"
            icon={<Icon name={SHELL_ENTRY_ICONS['open-folder']} />}
            onClick={() => void open('right')}
          >
            {t('files.action.openRight')}
          </ToolbarButton>
        </span>
        </div>
      </div>

      <div
        data-shell-level="panels"
        className={cx('flex min-h-0 min-w-0 flex-1 flex-col', levelBandClasses('panels'))}
      >
      <Panel
        title={`${basename(leftSide.path)} ↔ ${basename(rightSide.path)}`}
        subtitle={t('files.csv.aligned', {
          rows: align.rows.length.toLocaleString('en-US'),
          keys: keyColumns.join(' + ') || t('files.csv.keysNone')
        })}
      >
        {align.columns.length === 0 ? (
          <p className="p-3 text-2xs text-content-muted">{t('files.csv.emptyNoKeys')}</p>
        ) : visible.length === 0 ? (
          <p className="p-3 text-2xs text-content-muted">
            {align.rows.length === 0
              ? t('files.csv.emptyNoRows')
              : t('files.csv.emptyFiltered')}
          </p>
        ) : (
          <CsvAlignedTable columns={align.columns} rows={visible} />
        )}
      </Panel>
      </div>
    </div>
  )
}
