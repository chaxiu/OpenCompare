import type { DiffStatus } from '@shared/fixtures'

/** The diff-semantic vocabulary in display order. */
export const DIFF_STATUSES: readonly DiffStatus[] = [
  'same',
  'added',
  'removed',
  'modified',
  'conflict'
]

/** Chinese labels for the diff-semantic vocabulary. */
export const DIFF_LABELS: Record<DiffStatus, string> = {
  same: '相同',
  added: '新增',
  removed: '删除',
  modified: '修改',
  conflict: '冲突'
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
