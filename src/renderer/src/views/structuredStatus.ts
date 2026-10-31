/**
 * Shared copy / tone vocabulary of the structured view.
 *
 * Kept out of the pane components so the view and the row shells agree on the
 * diff-semantic tokens without duplicating the mapping.
 */
import type { StructuredStatus } from '@core/structured/diff'
import type { DiffStatus } from '@shared/fixtures'
import type { MessageKey } from '@renderer/i18n/messages'
import { DIFF_ROW_HEIGHT } from '@renderer/components/DiffPane'

/** Source rows share the diff row height, so line offsets map 1:1. */
export const SOURCE_ROW_HEIGHT = DIFF_ROW_HEIGHT

/** Change list rows carry a badge and values, so they get a taller fixed row. */
export const CHANGE_ROW_HEIGHT = 24

/** Only these four tones ever colour an original pane. */
export type HighlightStatus = Exclude<DiffStatus, 'same'>

export const STATUS_LABELS: Record<StructuredStatus, MessageKey> = {
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
export const STATUS_TONES: Record<StructuredStatus, DiffStatus> = {
  added: 'added',
  removed: 'removed',
  modified: 'modified',
  typeChanged: 'conflict',
  same: 'same'
}

export const HIGHLIGHT_STATUSES: Record<StructuredStatus, HighlightStatus | null> = {
  added: 'added',
  removed: 'removed',
  modified: 'modified',
  typeChanged: 'conflict',
  same: null
}

export const HIGHLIGHT_CLASSES: Record<HighlightStatus, string> = {
  added: 'bg-diff-added-soft',
  removed: 'bg-diff-removed-soft',
  modified: 'bg-diff-modified-soft',
  conflict: 'bg-diff-conflict-soft'
}

export const VALUE_CLASSES: Record<StructuredStatus, string> = {
  added: 'text-diff-added',
  removed: 'text-diff-removed',
  modified: 'text-diff-modified',
  typeChanged: 'text-diff-conflict',
  same: 'text-content-secondary'
}
