import { useMemo, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { SHELL_ENTRY_ICONS, UI_ICON_ACTIONS } from '@renderer/assets/icons'
import { STRUCTURED_STATUSES, diffStructured, filterStructuredChanges } from '@core/structured/diff'
import type {
  StructuredChange,
  StructuredDiffResult,
  StructuredFilter,
  StructuredStatus
} from '@core/structured/diff'
import type { StructuredFormat } from '@core/structured/parse'
import type { DiffStatus, StructuredSceneFixture } from '@shared/fixtures'
import type { PlatformPort } from '@shared/platform/types'
import { ToolbarButton } from '@renderer/components/Button'
import { CodeBlock } from '@renderer/components/CodeBlock'
import { DiffDot } from '@renderer/components/DiffBadge'
import { DIFF_BADGE_CLASSES } from '@renderer/components/diffSemantics'
import { Icon } from '@renderer/components/Icon'
import { Panel } from '@renderer/components/Panel'
import { SegmentedControl } from '@renderer/components/SegmentedControl'
import { SplitPane } from '@renderer/components/SplitPane'
import { StateView } from '@renderer/components/StateView'
import { cx } from '@renderer/components/utils'
import { useI18n } from '@renderer/i18n/context'
import type { MessageKey } from '@renderer/i18n/messages'
import { classifyFile } from '@renderer/workbench/fileKinds'
import { STRUCTURED_FILE_FILTER, pickTextFile } from '@renderer/workbench/fileIO'
import type { PickedTextFile } from '@renderer/workbench/fileIO'
import type { FilePair } from '@renderer/workbench/session'
import { levelBandClasses, levelRowClasses } from '@renderer/workbench/shellLayout'

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

const STATUS_LABELS: Record<StructuredStatus, MessageKey> = {
  added: 'common.diff.added',
  removed: 'common.diff.removed',
  modified: 'common.diff.modified',
  typeChanged: 'files.structured.status.typeChanged',
  same: 'common.diff.same'
}

/**
 * Structured statuses borrow the diff-semantic vocabulary; a type change is
 * rendered with the conflict tone so it never reads as a plain value edit.
 */
const STATUS_TONES: Record<StructuredStatus, DiffStatus> = {
  added: 'added',
  removed: 'removed',
  modified: 'modified',
  typeChanged: 'conflict',
  same: 'same'
}

const VALUE_CLASSES: Record<StructuredStatus, string> = {
  added: 'text-diff-added',
  removed: 'text-diff-removed',
  modified: 'text-diff-modified',
  typeChanged: 'text-diff-conflict',
  same: 'text-content-secondary'
}

function StatusBadge({ status }: { readonly status: StructuredStatus }): JSX.Element {
  const { t } = useI18n()
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center rounded-xs border px-1 text-2xs leading-4',
        DIFF_BADGE_CLASSES[STATUS_TONES[status]]
      )}
    >
      {t(STATUS_LABELS[status])}
    </span>
  )
}

/** Runtime counts of the full comparison; filtering never changes them. */
function StatusCounts({
  counts
}: {
  readonly counts: Readonly<Record<StructuredStatus, number>>
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

/** One node of the change list: status, JSON Pointer path and old → new value. */
function ChangeRow({ change }: { readonly change: StructuredChange }): JSX.Element {
  const valueClass = VALUE_CLASSES[change.status]

  return (
    <div className="flex items-center gap-2 border-b border-line-subtle px-2 py-1">
      <StatusBadge status={change.status} />
      <span
        className="min-w-0 flex-1 truncate font-mono text-xs text-content-secondary"
        title={change.path}
      >
        {change.path === '' ? '/' : change.path}
      </span>
      <span className="flex shrink-0 items-center gap-1 font-mono text-xs">
        <span
          className={cx(
            'max-w-40 truncate',
            change.left === undefined ? 'text-content-muted' : valueClass
          )}
          title={change.left}
        >
          {change.left ?? '—'}
        </span>
        <Icon name={UI_ICON_ACTIONS.changeArrow} className="text-content-muted" />
        <span
          className={cx(
            'max-w-40 truncate',
            change.right === undefined ? 'text-content-muted' : valueClass
          )}
          title={change.right}
        >
          {change.right ?? '—'}
        </span>
      </span>
    </div>
  )
}

interface ComparisonState {
  readonly diff: StructuredDiffResult | null
  readonly error: string | null
}

/**
 * Scene D — JSON / YAML semantic comparison.
 *
 * Both sides are parsed and compared by node path, so shuffled keys, comments
 * and indentation produce no differences at all. A drilldown `pair` renders its
 * fixed format without the format switch; both sources share one engine.
 */
export function StructuredView({
  fixture,
  pair,
  format,
  platform,
  toolbarLeading,
  onOpenSide
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
}): JSX.Element {
  const { t } = useI18n()
  const [selected, setSelected] = useState<StructuredFormat>('json')
  const [filter, setFilter] = useState<StructuredFilter>('all')
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null)
  // A locally opened pair overrides the sample / drilldown source until the
  // format switch (or a new session) resets it.
  const [opened, setOpened] = useState<{ pair: FilePair; format: StructuredFormat } | null>(null)
  const adhoc = pair !== undefined
  const effective: StructuredFormat = opened
    ? opened.format
    : adhoc
      ? (format ?? 'json')
      : selected
  const source =
    opened?.pair ??
    pair ??
    (fixture ? (effective === 'json' ? fixture.json : fixture.yaml) : null)

  const comparison = useMemo<ComparisonState>(() => {
    if (!source) return { diff: null, error: null }
    try {
      return { diff: diffStructured(source.left.text, source.right.text, effective), error: null }
    } catch (cause) {
      return { diff: null, error: cause instanceof Error ? cause.message : String(cause) }
    }
  }, [source, effective])

  const visible = useMemo(
    () => (comparison.diff ? filterStructuredChanges(comparison.diff.entries, filter) : []),
    [comparison, filter]
  )

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
          value={filter}
          onChange={setFilter}
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
      {comparison.diff ? (
        <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-md border border-line-subtle bg-surface-sunken px-2 py-1">
          <StatusCounts counts={comparison.diff.counts} />
          <span className="ml-auto text-2xs text-content-muted">
            {t('files.structured.nodeCount', { count: comparison.diff.entries.length })}
          </span>
        </div>
      ) : null}

      <SplitPane
        panes={[
          <Panel
            key="changes"
            title={t('files.structured.changes')}
            subtitle={
              comparison.error
                ? t('files.structured.parseFailed')
                : t('files.structured.showing', {
                    visible: visible.length,
                    total: comparison.diff?.entries.length ?? 0
                  })
            }
          >
            {comparison.error ? (
              <div className="flex h-full min-h-0 flex-col">
                <StateView
                  tone="danger"
                  icon={<Icon name={UI_ICON_ACTIONS.warning} size={20} />}
                  title={t('files.structured.errorTitle')}
                  description={comparison.error}
                  hint={t('files.structured.errorHint')}
                />
              </div>
            ) : visible.length === 0 ? (
              <p className="p-3 text-2xs text-content-muted">
                {t('files.structured.emptyFiltered')}
              </p>
            ) : (
              <div className="min-w-max">
                {visible.map((change) => (
                  <ChangeRow key={change.path} change={change} />
                ))}
              </div>
            )}
          </Panel>,
          <Panel
            key="left"
            title={source.left.path}
            subtitle={t('files.structured.sourceLeft')}
          >
            <CodeBlock text={source.left.text} />
          </Panel>,
          <Panel
            key="right"
            title={source.right.path}
            subtitle={t('files.structured.sourceRight')}
          >
            <CodeBlock text={source.right.text} />
          </Panel>
        ]}
      />
      </div>
    </div>
  )
}
