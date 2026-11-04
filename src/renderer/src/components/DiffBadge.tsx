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
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-xs px-2 text-2xs leading-none',
        DIFF_BADGE_CLASSES[status],
        className
      )}
    >
      <DiffDot status={status} />
      <span className="whitespace-nowrap">{t(labelKeys[status])}</span>
    </span>
  )
}
