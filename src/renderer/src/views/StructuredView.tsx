import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { JSX, KeyboardEvent, ReactNode } from 'react'
import { SHELL_ENTRY_ICONS, UI_ICON_ACTIONS } from '@renderer/assets/icons'
import { isOperationCancelled } from '@core/io'
import { STRUCTURED_STATUSES, filterStructuredChanges } from '@core/structured/diff'
import type { StructuredChange, StructuredFilter } from '@core/structured/diff'
import { findChangeAtLine } from '@core/structured/locateLine'
import type { StructuredSide } from '@core/structured/locateLine'
import type { StructuredFormat } from '@core/structured/parse'
import type { StructuredSceneFixture } from '@shared/fixtures'
import type { PlatformPort } from '@shared/platform/types'
import { ToolbarButton } from '@renderer/components/Button'
import { DiffDot } from '@renderer/components/DiffBadge'
import { Icon } from '@renderer/components/Icon'
import { Panel } from '@renderer/components/Panel'
import { SegmentedControl } from '@renderer/components/SegmentedControl'
import { SplitPane } from '@renderer/components/SplitPane'
import { StateView } from '@renderer/components/StateView'
import { cx } from '@renderer/components/utils'
import { useI18n } from '@renderer/i18n/context'
import type { MessageKey } from '@renderer/i18n/messages'
import { createStructuredCompareClient } from '@renderer/structured/compareClient'
import type { StructuredCompareClient } from '@renderer/structured/compareClient'
import type { StructuredCompareOutcome } from '@renderer/structured/compareJob'
import { classifyFile } from '@renderer/workbench/fileKinds'
import { STRUCTURED_FILE_FILTER, pickTextFile } from '@renderer/workbench/fileIO'
import type { PickedTextFile } from '@renderer/workbench/fileIO'
import type { FilePair } from '@renderer/workbench/session'
import { levelBandClasses, levelRowClasses } from '@renderer/workbench/shellLayout'
import { StructuredChangeList, StructuredSourcePane } from './StructuredPanes'
import type { StructuredHighlight } from './StructuredPanes'
import {
  HIGHLIGHT_STATUSES,
  SOURCE_ROW_HEIGHT,
  STATUS_LABELS,
  STATUS_TONES
} from './structuredStatus'

const FORMAT_OPTIONS: readonly { readonly value: StructuredFormat; readonly key: MessageKey }[] = [
  { value: 'json', key: 'files.structured.format.json' },
  { value: 'yaml', key: 'files.structured.format.yaml' }
]

const FILTER_OPTIONS: readonly { readonly value: StructuredFilter; readonly key: MessageKey }[] = [
  { value: 'all', key: 'files.structured.filter.all' },
  { value: 'added', key: 'common.diff.added' },
  { value: 'removed', key: 'common.diff.removed' },
  { value: 'modified', key: 'common.diff.modified' },
  { value: 'typeChanged', key: 'files.structured.status.typeChanged' },
  { value: 'same', key: 'common.diff.same' }
]

/** Scroll offsets of the two original panes, owned by the shell per session. */
export interface StructuredScroll {
  readonly left: number
  readonly right: number
}

const EMPTY_SCROLL: StructuredScroll = { left: 0, right: 0 }

/** Runtime counts of the full comparison; filtering never changes them. */
function StatusCounts({
  counts
}: {
  readonly counts: Readonly<Record<(typeof STRUCTURED_STATUSES)[number], number>>
}): JSX.Element {
  const { t } = useI18n()
  return (
    <span
      role="group"
      aria-label={t('files.structured.countsLabel')}
      className="flex flex-wrap items-center gap-3"
    >
      {STRUCTURED_STATUSES.map((status) => (
        <span key={status} className="flex shrink-0 items-center gap-1 whitespace-nowrap text-2xs">
          <DiffDot status={STATUS_TONES[status]} />
          <span className="tabular font-mono text-content-secondary">{counts[status]}</span>
          <span className="text-content-muted">{t(STATUS_LABELS[status])}</span>
        </span>
      ))}
    </span>
  )
}

interface SettledComparison {
  /** Inputs the result belongs to; a newer source / format renders as loading. */
  readonly source: FilePair
  readonly format: StructuredFormat
  readonly outcome: StructuredCompareOutcome | null
  readonly error: string | null
}

function defaultCreateClient(): StructuredCompareClient {
  return createStructuredCompareClient()
}

/**
 * Scene D — JSON / YAML semantic comparison.
 *
 * Both sides are parsed and compared by node path, so shuffled keys, comments
 * and indentation produce no differences at all. A drilldown `pair` renders its
 * fixed format without the format switch; both sources share one engine.
 *
 * Navigation is bidirectional: a change row locates its JSON Pointer on both
 * originals, a source line selects the deepest exact change covering it, and
 * the two panes scroll together by relative position. Filter, selection and
 * scroll offsets are controlled by the shell so a tab switch restores them.
 */
export function StructuredView({
  fixture,
  pair,
  format,
  platform,
  toolbarLeading,
  onOpenSide,
  createClient,
  filter: filterProp,
  onFilterChange,
  selectedPath: selectedPathProp,
  onSelectPath,
  scrollTops: scrollTopsProp,
  onScrollTopChange
}: {
  readonly fixture?: StructuredSceneFixture
  /** Drilldown back row handed down by the shell; first row of the level. */
  readonly toolbarLeading?: ReactNode
  /** Ad-hoc left/right bodies coming from a directory-tree drilldown. */
  readonly pair?: FilePair
  readonly format?: StructuredFormat
  readonly platform: PlatformPort
  /** Writes a newly opened file back to the session's own pair facts. */
  readonly onOpenSide?: (side: 'left' | 'right', file: PickedTextFile) => void
  /** Test seam: replaces the background comparison client for this view. */
  readonly createClient?: () => StructuredCompareClient
  /** Status filter; owned by the shell and keyed by session. */
  readonly filter?: StructuredFilter
  readonly onFilterChange?: (filter: StructuredFilter) => void
  /** Selected JSON Pointer; owned by the shell and keyed by session. */
  readonly selectedPath?: string | null
  readonly onSelectPath?: (path: string | null) => void
  /** Scroll offsets to restore, owned by the shell and keyed by session. */
  readonly scrollTops?: StructuredScroll
  readonly onScrollTopChange?: (side: StructuredSide, scrollTop: number) => void
}): JSX.Element {
  const { t } = useI18n()
  const [selected, setSelected] = useState<StructuredFormat>('json')
  const [localFilter, setLocalFilter] = useState<StructuredFilter>('all')
  const [localSelectedPath, setLocalSelectedPath] = useState<string | null>(null)
  const [localScroll, setLocalScroll] = useState<StructuredScroll>(EMPTY_SCROLL)
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null)
  // A locally opened pair overrides the sample / drilldown source until the
  // format switch (or a new session) resets it.
  const [opened, setOpened] = useState<{ pair: FilePair; format: StructuredFormat } | null>(null)
  const [clientFactory] = useState(() => createClient ?? defaultCreateClient)
  const clientRef = useRef<StructuredCompareClient | null>(null)
  const [comparison, setComparison] = useState<SettledComparison | null>(null)
  // Bumped whenever the compared source changes, so both lists remount at the
  // reset scroll offset instead of carrying the previous file's position.
  const [resetToken, setResetToken] = useState(0)
  const adhoc = pair !== undefined
  const effective: StructuredFormat = opened
    ? opened.format
    : adhoc
      ? (format ?? 'json')
      : selected
  const source: FilePair | null =
    opened?.pair ??
    pair ??
    (fixture ? (effective === 'json' ? fixture.json : fixture.yaml) : null)

  const activeFilter = filterProp ?? localFilter
  const activeSelectedPath = selectedPathProp ?? localSelectedPath
  const activeScroll = scrollTopsProp ?? localScroll

  const leftRef = useRef<HTMLDivElement | null>(null)
  const rightRef = useRef<HTMLDivElement | null>(null)
  const attachLeft = useCallback((element: HTMLDivElement | null) => {
    leftRef.current = element
  }, [])
  const attachRight = useCallback((element: HTMLDivElement | null) => {
    rightRef.current = element
  }, [])
  /** Offset this view wrote programmatically; its own echo must be ignored. */
  const programmatic = useRef<{ left: number | null; right: number | null }>({
    left: null,
    right: null
  })
  /** Value last mirrored into a pane; its echo must not map back. */
  const synced = useRef<{ left: number | null; right: number | null }>({
    left: null,
    right: null
  })

  const updateFilter = useCallback(
    (next: StructuredFilter) => {
      if (onFilterChange) onFilterChange(next)
      else setLocalFilter(next)
    },
    [onFilterChange]
  )

  const selectPath = useCallback(
    (path: string | null) => {
      if (onSelectPath) onSelectPath(path)
      else setLocalSelectedPath(path)
    },
    [onSelectPath]
  )

  const rememberScroll = useCallback(
    (side: StructuredSide, scrollTop: number) => {
      if (onScrollTopChange) onScrollTopChange(side, scrollTop)
      else
        setLocalScroll((current) =>
          current[side] === scrollTop ? current : { ...current, [side]: scrollTop }
        )
    },
    [onScrollTopChange]
  )

  // The comparison client lives as long as the view; unmounting (tab close or
  // session switch) terminates an in-flight background job.
  useEffect(
    () => () => {
      clientRef.current?.dispose()
      clientRef.current = null
    },
    []
  )

  useEffect(() => {
    if (!source) return
    const client = clientRef.current ?? (clientRef.current = clientFactory())
    let active = true
    void client
      .compare({ leftText: source.left.text, rightText: source.right.text, format: effective })
      .then((outcome) => {
        if (active) setComparison({ source, format: effective, outcome, error: null })
      })
      .catch((cause: unknown) => {
        // A superseded request is expected; it must never paint an error state.
        if (!active || isOperationCancelled(cause)) return
        setComparison({
          source,
          format: effective,
          outcome: null,
          error: cause instanceof Error ? cause.message : String(cause)
        })
      })
    return () => {
      active = false
    }
  }, [clientFactory, effective, source])

  const settled =
    comparison !== null && comparison.source === source && comparison.format === effective
      ? comparison
      : null
  const loading = source !== null && settled === null

  const entries = settled?.outcome?.diff.entries
  const ranges = settled?.outcome?.ranges

  const visible = useMemo(
    () => (entries ? filterStructuredChanges(entries, activeFilter) : []),
    [entries, activeFilter]
  )

  const selectedChange = useMemo(() => {
    if (activeSelectedPath === null || !entries) return null
    return entries.find((entry) => entry.path === activeSelectedPath) ?? null
  }, [entries, activeSelectedPath])

  /** Writes each side's own target offset; never a ratio copy of the other. */
  const jumpTo = useCallback(
    (change: StructuredChange) => {
      const range = ranges?.[change.path]
      for (const side of ['left', 'right'] as const) {
        const target = range?.[side]
        if (!target) continue
        const element = side === 'left' ? leftRef.current : rightRef.current
        if (!element) continue
        const max = Math.max(0, element.scrollHeight - element.clientHeight)
        const offset = Math.min(Math.max(0, (target.startLine - 1) * SOURCE_ROW_HEIGHT), max)
        programmatic.current[side] = offset
        element.scrollTop = offset
        rememberScroll(side, offset)
      }
    },
    [ranges, rememberScroll]
  )

  // Jump only when the user moves the selection inside this mount. A restored
  // selection (tab switch) must keep the scroll offsets the shell handed back.
  const previousSelection = useRef<string | null>(activeSelectedPath)
  useLayoutEffect(() => {
    if (previousSelection.current === activeSelectedPath) return
    previousSelection.current = activeSelectedPath
    if (selectedChange) jumpTo(selectedChange)
  }, [activeSelectedPath, selectedChange, jumpTo])

  // A new source or format is a new navigation context: selection and both
  // offsets start over, exactly like opening the file for the first time.
  const previousSource = useRef<{ source: FilePair | null; format: StructuredFormat } | null>(null)
  useEffect(() => {
    const previous = previousSource.current
    previousSource.current = { source, format: effective }
    if (previous === null) return
    if (previous.source === source && previous.format === effective) return
    selectPath(null)
    rememberScroll('left', 0)
    rememberScroll('right', 0)
    programmatic.current = { left: null, right: null }
    synced.current = { left: null, right: null }
    setResetToken((token) => token + 1)
  }, [source, effective, selectPath, rememberScroll])

  const syncFrom = useCallback(
    (side: StructuredSide, element: HTMLDivElement) => {
      const otherSide: StructuredSide = side === 'left' ? 'right' : 'left'
      const other = otherSide === 'left' ? leftRef.current : rightRef.current
      if (!other) return
      const selfMax = Math.max(0, element.scrollHeight - element.clientHeight)
      const otherMax = Math.max(0, other.scrollHeight - other.clientHeight)
      const ratio = selfMax > 0 ? Math.min(1, Math.max(0, element.scrollTop / selfMax)) : 0
      const target = ratio * otherMax
      synced.current[otherSide] = target
      other.scrollTop = target
      rememberScroll(otherSide, target)
    },
    [rememberScroll]
  )

  const handleScroll = useCallback(
    (side: StructuredSide, element: HTMLDivElement) => {
      const guarded = programmatic.current[side]
      if (guarded !== null) {
        programmatic.current[side] = null
        if (Math.abs(element.scrollTop - guarded) <= 1) {
          rememberScroll(side, element.scrollTop)
          return
        }
      }
      const echoed = synced.current[side]
      if (echoed !== null) {
        synced.current[side] = null
        if (Math.abs(element.scrollTop - echoed) <= 1) {
          rememberScroll(side, element.scrollTop)
          return
        }
      }
      rememberScroll(side, element.scrollTop)
      syncFrom(side, element)
    },
    [rememberScroll, syncFrom]
  )

  const handleKeyDown = useCallback(
    (
      side: StructuredSide,
      event: KeyboardEvent<HTMLDivElement>,
      element: HTMLDivElement
    ) => {
      const max = Math.max(0, element.scrollHeight - element.clientHeight)
      let next: number
      switch (event.key) {
        case 'ArrowDown':
          next = element.scrollTop + SOURCE_ROW_HEIGHT
          break
        case 'ArrowUp':
          next = element.scrollTop - SOURCE_ROW_HEIGHT
          break
        case 'PageDown':
          next = element.scrollTop + element.clientHeight
          break
        case 'PageUp':
          next = element.scrollTop - element.clientHeight
          break
        case 'Home':
          next = 0
          break
        case 'End':
          next = max
          break
        default:
          return
      }
      event.preventDefault()
      const target = Math.min(Math.max(next, 0), max)
      programmatic.current[side] = null
      synced.current[side] = null
      element.scrollTop = target
      rememberScroll(side, target)
      syncFrom(side, element)
    },
    [rememberScroll, syncFrom]
  )

  const handleLineClick = useCallback(
    (side: StructuredSide, line: number) => {
      if (!entries || !ranges) return
      const hit = findChangeAtLine(entries, ranges, side, line)
      if (hit !== null) selectPath(hit)
    },
    [entries, ranges, selectPath]
  )

  const highlightFor = (side: StructuredSide): StructuredHighlight | null => {
    if (!selectedChange || !ranges) return null
    const range = ranges[selectedChange.path]?.[side]
    const status = HIGHLIGHT_STATUSES[selectedChange.status]
    if (!range || !range.exact || status === null) return null
    return { status, startLine: range.startLine, endLine: range.endLine }
  }

  const missingOn = (side: StructuredSide): boolean => {
    if (!selectedChange || !ranges) return false
    const range = ranges[selectedChange.path]?.[side]
    return range !== undefined && !range.exact
  }

  /** Opens a local JSON / YAML file on one side and re-runs the comparison. */
  async function open(side: 'left' | 'right'): Promise<void> {
    try {
      const picked = await pickTextFile(
        platform,
        t(side === 'left' ? 'files.structured.openLeftTitle' : 'files.structured.openRightTitle'),
        [STRUCTURED_FILE_FILTER]
      )
      if (picked === null) return
      const next: FilePair = {
        left: side === 'left' ? { path: picked.path, text: picked.text } : (source?.left ?? { path: picked.path, text: '' }),
        right: side === 'right' ? { path: picked.path, text: picked.text } : (source?.right ?? { path: picked.path, text: '' })
      }
      const nextFormat = classifyFile(picked.path)?.format ?? effective
      // The session keeps the same tab: path, body and family land on its pair
      // facts together, so the tab subtitle follows the panel.
      onOpenSide?.(side, picked)
      setOpened({ pair: next, format: nextFormat })
      if (!adhoc) setSelected(nextFormat)
      setNotice({ text: t('files.notice.opened', { path: picked.path }), tone: 'ok' })
    } catch (cause) {
      setNotice({ text: cause instanceof Error ? cause.message : String(cause), tone: 'error' })
    }
  }

  if (!source) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col p-2">
        <StateView
          icon={<Icon name={UI_ICON_ACTIONS.viewStructured} size={20} />}
          title={t('files.structured.emptyTitle')}
          description={t('files.structured.emptyDescription')}
        />
      </div>
    )
  }

  const missingMarker = (side: StructuredSide): ReactNode =>
    selectedChange && missingOn(side) ? (
      <button
        type="button"
        data-missing-marker={side}
        onClick={() => selectPath(selectedChange.path)}
        className="focus-ring rounded-xs border border-line-subtle bg-surface-sunken px-1 text-2xs text-content-muted hover:text-content-secondary"
      >
        {t('files.structured.missingSide')}
      </button>
    ) : undefined

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
        <div className={cx('flex shrink-0 items-center', levelRowClasses('view-toolbar'))}>
        {adhoc ? (
          <span className="text-2xs text-content-muted">
            {t('files.structured.drilldown', { format: effective.toUpperCase() })}
          </span>
        ) : (
          <>
            <SegmentedControl
              label={t('files.structured.formatLabel')}
              options={FORMAT_OPTIONS.map((option) => ({
                value: option.value,
                label: t(option.key)
              }))}
              value={selected}
              onChange={(value) => {
                setSelected(value)
                setOpened(null)
              }}
            />
            <span className="hidden text-2xs text-content-muted md:inline">
              {t('files.structured.sampleHint')}
            </span>
          </>
        )}
        <span aria-hidden className="h-3 w-px shrink-0 bg-line-subtle" />
        <SegmentedControl
          label={t('files.structured.filterLabel')}
          options={FILTER_OPTIONS.map((option) => ({
            value: option.value,
            label: t(option.key)
          }))}
          value={activeFilter}
          onChange={updateFilter}
        />
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
        {notice ? (
          <span
            role="status"
            className={cx('text-2xs', notice.tone === 'error' ? 'text-danger' : 'text-diff-added')}
          >
            {notice.text}
          </span>
        ) : null}
        </div>
      </div>

      <div
        data-shell-level="panels"
        className={cx('flex min-h-0 min-w-0 flex-1 flex-col', levelBandClasses('panels'))}
      >
      {settled?.outcome ? (
        <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-md border border-line-subtle bg-surface-sunken px-2 py-1">
          <StatusCounts counts={settled.outcome.diff.counts} />
          <span className="ml-auto text-2xs text-content-muted">
            {t('files.structured.nodeCount', { count: settled.outcome.diff.entries.length })}
          </span>
        </div>
      ) : null}

      <SplitPane
        panes={[
          <Panel
            key="changes"
            title={t('files.structured.changes')}
            subtitle={
              loading
                ? undefined
                : settled?.error
                  ? t('files.structured.parseFailed')
                  : t('files.structured.showing', {
                      visible: visible.length,
                      total: settled?.outcome?.diff.entries.length ?? 0
                    })
            }
          >
            {loading ? (
              <div className="flex h-full min-h-0 flex-col">
                <p role="status" className="p-3 text-2xs text-content-muted">
                  {t('files.structured.comparing')}
                </p>
              </div>
            ) : settled?.error ? (
              <div className="flex h-full min-h-0 flex-col">
                <StateView
                  tone="danger"
                  icon={<Icon name={UI_ICON_ACTIONS.warning} size={20} />}
                  title={t('files.structured.errorTitle')}
                  description={settled.error}
                  hint={t('files.structured.errorHint')}
                />
              </div>
            ) : visible.length === 0 ? (
              <p className="p-3 text-2xs text-content-muted">
                {t('files.structured.emptyFiltered')}
              </p>
            ) : (
              <StructuredChangeList
                key={`changes:${resetToken}`}
                changes={visible}
                selectedPath={activeSelectedPath}
                onSelect={selectPath}
              />
            )}
          </Panel>,
          <Panel
            key="left"
            title={source.left.path}
            subtitle={t('files.structured.sourceLeft')}
            actions={missingMarker('left')}
          >
            <StructuredSourcePane
              key={`left:${resetToken}`}
              side="left"
              text={source.left.text}
              highlight={highlightFor('left')}
              initialScrollTop={activeScroll.left}
              scrollRef={attachLeft}
              onScroll={(element) => handleScroll('left', element)}
              onKeyDown={(event, element) => handleKeyDown('left', event, element)}
              onLineClick={handleLineClick}
            />
          </Panel>,
          <Panel
            key="right"
            title={source.right.path}
            subtitle={t('files.structured.sourceRight')}
            actions={missingMarker('right')}
          >
            <StructuredSourcePane
              key={`right:${resetToken}`}
              side="right"
              text={source.right.text}
              highlight={highlightFor('right')}
              initialScrollTop={activeScroll.right}
              scrollRef={attachRight}
              onScroll={(element) => handleScroll('right', element)}
              onKeyDown={(event, element) => handleKeyDown('right', event, element)}
              onLineClick={handleLineClick}
            />
          </Panel>
        ]}
      />
      </div>
    </div>
  )
}
