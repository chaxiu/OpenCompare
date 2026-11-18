/**
 * xlsx / xlsm comparison surface.
 *
 * One parsed workbook pair arrives as per-sheet tables; each selected sheet is
 * aligned on its own (no cross-sheet row merge) and rendered with the same
 * four-state cell highlighting the CSV view uses. The parse summary reports
 * uncached formulas and hidden rows / columns, and the hidden switch re-runs the
 * alignment from the already parsed tables — the files are never read again.
 */
import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import { alignCsvTables, commonCsvColumns, type CsvAlignCounts, type CsvTableData } from '@core/csv/align'
import { applyXlsxHiddenPolicy, countHidden } from '@core/xlsx/hidden'
import { Icon } from '@renderer/components/Icon'
import { Panel } from '@renderer/components/Panel'
import { UI_ICON_ACTIONS } from '@renderer/assets/icons'
import { cx } from '@renderer/components/utils'
import { useI18n } from '@renderer/i18n/context'
import type { XlsxSessionView } from '@renderer/workbench/session'
import { TOOLBAR_BAND_SURFACE, levelBandClasses, levelRowClasses } from '@renderer/workbench/shellLayout'
import { CsvAlignedTable } from './CsvView'

/** Row alignment counts reported up to the workbench status bar. */
export interface XlsxAlignState {
  readonly sessionId: string
  readonly counts: CsvAlignCounts
}

const EMPTY_COUNTS: CsvAlignCounts = { same: 0, added: 0, removed: 0, modified: 0 }

function basename(path: string): string {
  const segments = path.split('/')
  return segments[segments.length - 1] || path
}

interface SheetResult {
  readonly name: string
  readonly align: ReturnType<typeof alignCsvTables>
}

/** One sheet is one independent result: its own keys, its own four states. */
function alignSheet(name: string, left: CsvTableData, right: CsvTableData): SheetResult {
  const candidates = commonCsvColumns(left, right)
  const align = alignCsvTables(left, right, candidates.length > 0 ? [candidates[0]] : [])
  return { name, align }
}

export function XlsxCompareView({
  sessionId,
  xlsx,
  leftPath,
  rightPath,
  onAlignStateChange
}: {
  readonly sessionId: string
  readonly xlsx: XlsxSessionView
  readonly leftPath: string
  readonly rightPath: string
  readonly onAlignStateChange?: (state: XlsxAlignState) => void
}): JSX.Element {
  const { t } = useI18n()
  const [ignoreHidden, setIgnoreHidden] = useState(false)
  const [selected, setSelected] = useState<readonly string[]>(() =>
    xlsx.sheets.length > 0 ? [xlsx.sheets[0].name] : []
  )

  const results = useMemo<readonly SheetResult[]>(
    () =>
      xlsx.sheets
        .filter((sheet) => selected.includes(sheet.name))
        .map((sheet) =>
          alignSheet(
            sheet.name,
            applyXlsxHiddenPolicy(sheet.left.table, sheet.left.meta, ignoreHidden),
            applyXlsxHiddenPolicy(sheet.right.table, sheet.right.meta, ignoreHidden)
          )
        ),
    [xlsx, selected, ignoreHidden]
  )

  const totals = useMemo<CsvAlignCounts>(
    () =>
      results.reduce<CsvAlignCounts>(
        (sum, result) => ({
          same: sum.same + result.align.counts.same,
          added: sum.added + result.align.counts.added,
          removed: sum.removed + result.align.counts.removed,
          modified: sum.modified + result.align.counts.modified
        }),
        EMPTY_COUNTS
      ),
    [results]
  )

  useEffect(() => {
    onAlignStateChange?.({ sessionId, counts: totals })
  }, [sessionId, totals, onAlignStateChange])

  const sides = useMemo(
    () => xlsx.sheets.flatMap((sheet) => [sheet.left.meta, sheet.right.meta]),
    [xlsx]
  )
  const uncached = sides.reduce((sum, meta) => sum + meta.uncachedFormulaCells, 0)
  const hidden = countHidden(sides)

  function toggleSheet(name: string): void {
    setSelected((current) =>
      current.includes(name) ? current.filter((entry) => entry !== name) : [...current, name]
    )
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        data-shell-level="view-toolbar"
        className={cx(
          'flex shrink-0 flex-wrap items-center gap-2',
          TOOLBAR_BAND_SURFACE['view-toolbar'],
          levelBandClasses('view-toolbar'),
          levelRowClasses('view-toolbar')
        )}
      >
        <span className="text-2xs text-content-muted">{t('files.xlsx.summary')}</span>
        {uncached > 0 ? (
          <span role="status" className="text-2xs text-diff-modified">
            {t('files.xlsx.uncachedFormulas', { count: uncached })}
          </span>
        ) : null}
        <span className="text-2xs text-content-secondary">
          {t('files.xlsx.hiddenCounts', { rows: hidden.rows, columns: hidden.columns })}
        </span>
        <button
          type="button"
          aria-pressed={ignoreHidden}
          onClick={() => setIgnoreHidden((value) => !value)}
          className={cx(
            'focus-ring transition-fast inline-flex h-6 items-center gap-1 rounded-xs border px-2 text-2xs',
            ignoreHidden
              ? 'border-accent bg-accent-soft text-accent'
              : 'border-line-subtle bg-surface-raised text-content-secondary hover:border-line-strong hover:text-content-primary'
          )}
        >
          {ignoreHidden ? <Icon name={UI_ICON_ACTIONS.check} /> : null}
          {t('files.xlsx.ignoreHidden')}
        </button>

        <span aria-hidden className="h-3 w-px shrink-0 bg-line-subtle" />
        <div role="group" aria-label={t('files.xlsx.sheets')} className="flex min-w-0 items-center gap-1 overflow-x-auto">
          {xlsx.sheets.map((sheet) => {
            const active = selected.includes(sheet.name)
            return (
              <button
                key={sheet.name}
                type="button"
                aria-pressed={active}
                onClick={() => toggleSheet(sheet.name)}
                className={cx(
                  'focus-ring transition-fast inline-flex h-6 items-center gap-1 rounded-xs border px-2 font-mono text-2xs',
                  active
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line-subtle bg-surface-raised text-content-secondary hover:border-line-strong hover:text-content-primary'
                )}
              >
                {active ? <Icon name={UI_ICON_ACTIONS.check} /> : null}
                {sheet.name}
              </button>
            )
          })}
        </div>

        {xlsx.leftOnly.length > 0 ? (
          <span className="text-2xs text-diff-removed">
            {t('files.xlsx.leftOnly', { names: xlsx.leftOnly.join(', ') })}
          </span>
        ) : null}
        {xlsx.rightOnly.length > 0 ? (
          <span className="text-2xs text-diff-added">
            {t('files.xlsx.rightOnly', { names: xlsx.rightOnly.join(', ') })}
          </span>
        ) : null}
      </div>

      <div
        data-shell-level="panels"
        className={cx('flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-auto', levelBandClasses('panels'))}
      >
        {results.length === 0 ? (
          <p className="p-3 text-2xs text-content-muted">{t('files.xlsx.emptySheets')}</p>
        ) : (
          results.map((result) => (
            <div key={result.name} className="h-80 min-h-0 shrink-0">
              <Panel
                title={`${result.name} · ${basename(leftPath)} ↔ ${basename(rightPath)}`}
                subtitle={t('files.xlsx.sheetCounts', {
                  same: result.align.counts.same,
                  added: result.align.counts.added,
                  removed: result.align.counts.removed,
                  modified: result.align.counts.modified
                })}
              >
                {result.align.columns.length === 0 ? (
                  <p className="p-3 text-2xs text-content-muted">{t('files.csv.emptyNoKeys')}</p>
                ) : (
                  <CsvAlignedTable columns={result.align.columns} rows={result.align.rows} />
                )}
              </Panel>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
