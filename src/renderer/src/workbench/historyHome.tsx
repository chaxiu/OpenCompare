import { useRef, useState } from 'react'
import type { JSX } from 'react'
import type { ComparisonHistoryEntry } from '@shared/history/types'
import { ToolbarButton } from '@renderer/components/Button'
import { Dialog } from '@renderer/components/Dialog'
import { useI18n } from '@renderer/i18n/context'
import {
  formatHistoryTime,
  HISTORY_ERROR_BADGE_KEYS,
  HISTORY_HOME_VISIBLE_LIMIT,
  HISTORY_KIND_KEYS,
  historyErrorCode,
  historyPathsText
} from './historyHomeModel'

export interface HistoryHomeProps {
  readonly entries: readonly ComparisonHistoryEntry[]
  readonly onReopen: (entry: ComparisonHistoryEntry) => void
  readonly onRemove: (id: string) => void
  /** Explicit clear: an inline second click confirms it, never a system dialog. */
  readonly onClear?: () => void
  /** True while a comparison / open is in flight; both actions wait for it. */
  readonly busy?: boolean
}

interface HistoryRowProps {
  readonly entry: ComparisonHistoryEntry
  readonly busy: boolean
  readonly onReopen: (entry: ComparisonHistoryEntry) => void
  readonly onRemove: (id: string) => void
}

/** One history record; shared by the home list and the "show all" dialog. */
function HistoryRow({ entry, busy, onReopen, onRemove }: HistoryRowProps): JSX.Element {
  const { language, t } = useI18n()
  const paths = historyPathsText(entry)
  const time = formatHistoryTime(entry.createdAt, language)
  const error = historyErrorCode(entry)
  return (
    <li
      data-history-entry={entry.id}
      data-history-error={error ?? undefined}
      className="flex min-w-0 items-center gap-2 rounded-sm border border-line-subtle bg-surface-raised px-2 py-1"
    >
      <span className="shrink-0 rounded-sm bg-surface-overlay px-1.5 py-0.5 text-2xs font-medium text-content-secondary">
        {t(HISTORY_KIND_KEYS[entry.kind])}
      </span>
      {error === null ? null : (
        <span
          data-history-error-badge
          className="shrink-0 rounded-sm bg-surface-overlay px-1.5 py-0.5 text-2xs font-medium text-danger"
        >
          {t(HISTORY_ERROR_BADGE_KEYS[error])}
        </span>
      )}
      <span
        data-history-paths
        title={paths}
        className="min-w-0 flex-1 truncate font-mono text-2xs text-content-primary"
      >
        {paths}
      </span>
      <time
        data-history-time
        dateTime={new Date(entry.createdAt).toISOString()}
        className="tabular shrink-0 text-2xs text-content-muted"
      >
        {time}
      </time>
      <ToolbarButton
        size="sm"
        variant="ghost"
        disabled={busy}
        aria-label={t('shell.history.reopenTitle', { paths })}
        onClick={() => onReopen(entry)}
      >
        {t('shell.history.reopen')}
      </ToolbarButton>
      <ToolbarButton
        size="sm"
        variant="ghost"
        disabled={busy}
        aria-label={t('shell.history.removeTitle', { paths })}
        onClick={() => onRemove(entry.id)}
      >
        {t('shell.history.remove')}
      </ToolbarButton>
    </li>
  )
}

/** Recent comparisons under the empty-state CTAs; nothing when there are none. */
export function HistoryHome({
  entries,
  onReopen,
  onRemove,
  onClear,
  busy = false
}: HistoryHomeProps): JSX.Element | null {
  const { t } = useI18n()
  // A changed list (another row removed / a reopen) drops the pending confirm.
  const [confirmFor, setConfirmFor] = useState<readonly ComparisonHistoryEntry[] | null>(null)
  const [showAll, setShowAll] = useState(false)
  const showAllButton = useRef<HTMLSpanElement>(null)
  const confirming = confirmFor === entries
  if (entries.length === 0) return null

  const clear = (): void => {
    if (onClear === undefined) return
    if (!confirming) {
      setConfirmFor(entries)
      return
    }
    setConfirmFor(null)
    onClear()
  }

  const closeAll = (): void => {
    setShowAll(false)
    showAllButton.current?.querySelector('button')?.focus()
  }

  const visible = entries.slice(0, HISTORY_HOME_VISIBLE_LIMIT)
  const hasMore = entries.length > HISTORY_HOME_VISIBLE_LIMIT

  return (
    <>
      <section
        aria-label={t('shell.history.title')}
        className="mt-1 flex w-full min-w-0 flex-col gap-1.5 text-left"
      >
        <div className="flex min-w-0 items-center justify-between gap-2">
          <h3 className="text-2xs font-semibold tracking-wide text-content-muted uppercase">
            {t('shell.history.title')}
          </h3>
          <div className="flex min-w-0 items-center gap-1">
            {hasMore ? (
              <span ref={showAllButton} className="contents">
                <ToolbarButton
                  size="sm"
                  variant="ghost"
                  data-history-show-all={entries.length}
                  aria-label={t('shell.history.showAllTitle', { count: entries.length })}
                  onClick={() => setShowAll(true)}
                >
                  {t('shell.history.showAll', { count: entries.length })}
                </ToolbarButton>
              </span>
            ) : null}
            {onClear === undefined ? null : (
              <ToolbarButton
                size="sm"
                variant="ghost"
                disabled={busy}
                aria-label={t(confirming ? 'shell.history.clearConfirm' : 'shell.history.clearTitle')}
                data-history-clear={confirming ? 'confirm' : 'idle'}
                onClick={clear}
              >
                {t(confirming ? 'shell.history.clearConfirm' : 'shell.history.clear')}
              </ToolbarButton>
            )}
          </div>
        </div>
        <ul className="flex max-h-[var(--height-history-list)] w-full min-w-0 flex-col gap-1 overflow-y-auto">
          {visible.map((entry) => (
            <HistoryRow
              key={entry.id}
              entry={entry}
              busy={busy}
              onReopen={onReopen}
              onRemove={onRemove}
            />
          ))}
        </ul>
      </section>
      {showAll ? (
        <Dialog
          title={t('shell.history.showAllTitle', { count: entries.length })}
          onClose={closeAll}
        >
          <ul className="flex w-full min-w-0 flex-col gap-1">
            {entries.map((entry) => (
              <HistoryRow
                key={entry.id}
                entry={entry}
                busy={busy}
                onReopen={onReopen}
                onRemove={onRemove}
              />
            ))}
          </ul>
        </Dialog>
      ) : null}
    </>
  )
}
