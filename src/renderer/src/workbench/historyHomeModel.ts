import { comparisonHistoryId, isComparisonHistoryErrorCode } from '@shared/history/model'
import type { ComparisonHistoryCandidate } from '@shared/history/model'
import type {
  ComparisonHistoryEntry,
  ComparisonHistoryErrorCode,
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

/** Short inline marker shown on a row whose last reopen failed. */
export const HISTORY_ERROR_BADGE_KEYS = {
  missing: 'shell.history.error.missing',
  unreadable: 'shell.history.error.unreadable',
  'type-changed': 'shell.history.error.typeChanged'
} satisfies Record<ComparisonHistoryErrorCode, MessageKey>

/** The in-place notice the shell shows when preflight rejects one row. */
export const HISTORY_ERROR_NOTICE_KEYS = {
  missing: 'shell.history.errorNotice.missing',
  unreadable: 'shell.history.errorNotice.unreadable',
  'type-changed': 'shell.history.errorNotice.typeChanged'
} satisfies Record<ComparisonHistoryErrorCode, MessageKey>

const MERGE_SIDE_KEYS: readonly MessageKey[] = [
  'shell.history.side.base',
  'shell.history.side.ours',
  'shell.history.side.theirs'
]

/** Localized side label of the failing path; never a path itself. */
export function historySideKey(kind: ComparisonHistoryKind, side: number): MessageKey {
  if (kind === 'merge') return MERGE_SIDE_KEYS[side] ?? MERGE_SIDE_KEYS[0] ?? 'shell.history.side.base'
  return side === 0 ? 'shell.history.side.left' : 'shell.history.side.right'
}

/** The known error code of one row, or `null` when it has none / an unknown one. */
export function historyErrorCode(
  entry: Pick<ComparisonHistoryEntry, 'error'>
): ComparisonHistoryErrorCode | null {
  return isComparisonHistoryErrorCode(entry.error) ? entry.error : null
}

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

type MutableHistoryEntry = {
  -readonly [K in keyof ComparisonHistoryEntry]: ComparisonHistoryEntry[K]
}

/**
 * Sets or clears (`null`) the persisted error of exactly one entry. Unknown
 * stored codes normalize to "no error"; an unchanged row keeps the same array so
 * the caller can skip a redundant write.
 */
export function withHistoryError(
  entries: readonly ComparisonHistoryEntry[],
  id: string,
  code: ComparisonHistoryErrorCode | null
): readonly ComparisonHistoryEntry[] {
  let changed = false
  const next = entries.map((entry) => {
    if (entry.id !== id) return entry
    const current = historyErrorCode(entry)
    if (current === code) return entry
    changed = true
    const copy: MutableHistoryEntry = { ...entry }
    if (code === null) delete copy.error
    else copy.error = code
    return copy
  })
  return changed ? next : entries
}
