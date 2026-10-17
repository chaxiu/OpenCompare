import type { JSX } from 'react'
import type { DiffStatus } from '@shared/fixtures'
import { DIFF_BADGE_CLASSES, DIFF_DOT_CLASSES, DIFF_LABELS } from './diffSemantics'
import { cx } from './utils'

export function DiffDot({
  status,
  className
}: {
  readonly status: DiffStatus
  readonly className?: string
}): JSX.Element {
  return (
    <span
      aria-hidden
      className={cx('size-2 shrink-0 rounded-full', DIFF_DOT_CLASSES[status], className)}
    />
  )
}

export function DiffBadge({
  status,
  className
}: {
  readonly status: DiffStatus
  readonly className?: string
}): JSX.Element {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center rounded-xs border px-1 text-2xs leading-4',
        DIFF_BADGE_CLASSES[status],
        className
      )}
    >
      {DIFF_LABELS[status]}
    </span>
  )
}
