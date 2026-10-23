import type { DiffStatus } from '@shared/fixtures'
import type { MessageKey } from '@renderer/i18n/messages'

/** The diff-semantic vocabulary in display order. */
export const DIFF_STATUSES: readonly DiffStatus[] = [
  'same',
  'added',
  'removed',
  'modified',
  'conflict'
]

/** Dictionary keys of the diff-semantic vocabulary, resolved at render time. */
export const DIFF_LABEL_KEYS: Record<DiffStatus, MessageKey> = {
  same: 'common.diff.same',
  added: 'common.diff.added',
  removed: 'common.diff.removed',
  modified: 'common.diff.modified',
  conflict: 'common.diff.conflict'
}

export const DIFF_DOT_CLASSES: Record<DiffStatus, string> = {
  same: 'bg-diff-same',
  added: 'bg-diff-added',
  removed: 'bg-diff-removed',
  modified: 'bg-diff-modified',
  conflict: 'bg-diff-conflict'
}

export const DIFF_BADGE_CLASSES: Record<DiffStatus, string> = {
  same: 'border-line-strong text-diff-same',
  added: 'border-diff-added/40 bg-diff-added-soft text-diff-added',
  removed: 'border-diff-removed/40 bg-diff-removed-soft text-diff-removed',
  modified: 'border-diff-modified/40 bg-diff-modified-soft text-diff-modified',
  conflict: 'border-diff-conflict/45 bg-diff-conflict-soft text-diff-conflict'
}
