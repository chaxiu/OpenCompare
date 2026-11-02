import type { JSX } from 'react'
import type { DiffStatus } from '@shared/fixtures'
import { useI18n } from '@renderer/i18n/context'
import type { MessageKey } from '@renderer/i18n/messages'
import { DIFF_BADGE_CLASSES, DIFF_DOT_CLASSES, DIFF_LABEL_KEYS } from './diffSemantics'
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
  labelKeys = DIFF_LABEL_KEYS,
  className
}: {
  readonly status: DiffStatus
  /** Optional vocabulary override; defaults to the shared text-diff words. */
  readonly labelKeys?: Record<DiffStatus, MessageKey>
  readonly className?: string
}): JSX.Element {
  const { t } = useI18n()
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center rounded-xs border px-1 text-2xs leading-4',
        DIFF_BADGE_CLASSES[status],
        className
      )}
    >
      {t(labelKeys[status])}
    </span>
  )
}
