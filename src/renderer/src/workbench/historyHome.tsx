import type { JSX } from 'react'
import type { ComparisonHistoryEntry } from '@shared/history/types'
import { ToolbarButton } from '@renderer/components/Button'
import { useI18n } from '@renderer/i18n/context'
import { formatHistoryTime, HISTORY_KIND_KEYS, historyPathsText } from './historyHomeModel'

export interface HistoryHomeProps {
  readonly entries: readonly ComparisonHistoryEntry[]
  readonly onReopen: (entry: ComparisonHistoryEntry) => void
  readonly onRemove: (id: string) => void
  /** True while a comparison / open is in flight; both actions wait for it. */
  readonly busy?: boolean
}

/** Recent comparisons under the empty-state CTAs; nothing when there are none. */
export function HistoryHome({
  entries,
  onReopen,
  onRemove,
  busy = false
}: HistoryHomeProps): JSX.Element | null {
  const { language, t } = useI18n()
  if (entries.length === 0) return null

  return (
    <section
      aria-label={t('shell.history.title')}
      className="mt-1 flex w-full min-w-0 flex-col gap-1.5 text-left"
    >
      <h3 className="text-2xs font-semibold tracking-wide text-content-muted uppercase">
        {t('shell.history.title')}
      </h3>
      <ul className="flex w-full min-w-0 flex-col gap-1">
        {entries.map((entry) => {
          const paths = historyPathsText(entry)
          const time = formatHistoryTime(entry.createdAt, language)
          return (
            <li
              key={entry.id}
              data-history-entry={entry.id}
              className="flex min-w-0 items-center gap-2 rounded-sm border border-line-subtle bg-surface-raised px-2 py-1"
            >
              <span className="shrink-0 rounded-sm bg-surface-overlay px-1.5 py-0.5 text-2xs font-medium text-content-secondary">
                {t(HISTORY_KIND_KEYS[entry.kind])}
              </span>
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
        })}
      </ul>
    </section>
  )
}
