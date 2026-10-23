import type { DirectoryFilter } from '@core/directory/filter'
import type { SyncDirection, SyncMode } from '@core/directory/sync'
import type { MessageKey } from '@renderer/i18n/messages'

/** Dictionary keys of the five status filters, resolved at render time. */
export const FILTER_LABEL_KEYS: Record<DirectoryFilter, MessageKey> = {
  all: 'directory.filter.all',
  differences: 'directory.filter.differences',
  'left-only': 'directory.filter.leftOnly',
  'right-only': 'directory.filter.rightOnly',
  same: 'directory.filter.same'
}

/** Dictionary keys of the sync directions and modes. */
export const SYNC_DIRECTION_KEYS: Record<SyncDirection, MessageKey> = {
  'left-to-right': 'directory.sync.direction.leftToRight',
  'right-to-left': 'directory.sync.direction.rightToLeft'
}

export const SYNC_MODE_KEYS: Record<SyncMode, MessageKey> = {
  incremental: 'directory.sync.mode.incremental',
  mirror: 'directory.sync.mode.mirror'
}

/** Picks the singular key only for exactly one item; every other count is plural. */
export function countKey(one: MessageKey, other: MessageKey, count: number): MessageKey {
  return count === 1 ? one : other
}
