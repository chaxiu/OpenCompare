import { comparisonHistoryId } from '@shared/history/model'
import type { ComparisonHistoryCandidate } from '@shared/history/model'
import type {
  ComparisonHistoryEntry,
  ComparisonHistoryKind,
  ComparisonHistorySwitches
} from '@shared/history/types'
import type { Language } from '@shared/platform/types'
import type { ComparisonSwitches } from '@core/text/normalize'
import type { MessageKey } from '@renderer/i18n/messages'

/** Localized type label of one history row; `merge` is reserved for later waves. */
export const HISTORY_KIND_KEYS = {
  directory: 'shell.history.kind.directory',
  file: 'shell.history.kind.file',
  merge: 'shell.history.kind.merge'
} satisfies Record<ComparisonHistoryKind, MessageKey>

/** The full path text one row shows (and keeps in its `title`). */
export function historyPathsText(entry: Pick<ComparisonHistoryEntry, 'paths'>): string {
  return entry.paths.join(' ↔ ')
}

/** One localized date + time string; UI and tests share this single source. */
export function formatHistoryTime(createdAt: number, language: Language): string {
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(createdAt))
}

/** Turns a successfully established real pair into the stored candidate. */
export function historyCandidate(
  kind: ComparisonHistoryKind,
  paths: readonly string[],
  switches: ComparisonSwitches,
  createdAt: number
): ComparisonHistoryCandidate {
  return {
    kind,
    paths: [...paths],
    createdAt,
    ignoreWhitespace: switches.ignoreWhitespace,
    ignoreNewline: switches.ignoreNewline,
    ignoreEncoding: switches.ignoreEncoding
  }
}

/** The opaque id a real pair established right now will own. */
export function historyIdFor(kind: ComparisonHistoryKind, paths: readonly string[]): string {
  return comparisonHistoryId(kind, paths)
}

/**
 * Refreshes the switches of exactly one entry without touching its id,
 * `createdAt`, level or the other entries; returns the same list when nothing
 * changed, so the caller can skip a redundant write.
 */
export function withHistorySwitches(
  entries: readonly ComparisonHistoryEntry[],
  id: string,
  switches: ComparisonHistorySwitches
): readonly ComparisonHistoryEntry[] {
  let changed = false
  const next = entries.map((entry) => {
    if (entry.id !== id) return entry
    if (
      entry.ignoreWhitespace === switches.ignoreWhitespace &&
      entry.ignoreNewline === switches.ignoreNewline &&
      entry.ignoreEncoding === switches.ignoreEncoding
    ) {
      return entry
    }
    changed = true
    return {
      ...entry,
      ignoreWhitespace: switches.ignoreWhitespace,
      ignoreNewline: switches.ignoreNewline,
      ignoreEncoding: switches.ignoreEncoding
    }
  })
  return changed ? next : entries
}
