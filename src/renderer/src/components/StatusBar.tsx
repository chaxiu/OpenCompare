import type { JSX, ReactNode } from 'react'
import type { DiffStatus, SampleComposition } from '@shared/fixtures'
import { useI18n } from '@renderer/i18n/context'
import type { MessageKey } from '@renderer/i18n/messages'
import {
  STATUS_BAR_CONTENT_PX,
  levelBandClasses,
  measureStatusBar,
  statusBarClasses
} from '@renderer/workbench/shellLayout'
import { useWindowWidth } from '@renderer/workbench/useWidthTier'
import { DiffDot } from './DiffBadge'
import { DIFF_BADGE_CLASSES, DIFF_LABEL_KEYS, DIFF_STATUSES } from './diffSemantics'
import { cx } from './utils'

export function StatusBar({ children }: { readonly children: ReactNode }): JSX.Element {
  const width = useWindowWidth()
  const { rows } = measureStatusBar(width, STATUS_BAR_CONTENT_PX)
  return (
    <footer
      data-shell-level="status"
      className={cx(
        'shrink-0 border-t border-line-subtle bg-surface-sunken text-2xs text-content-muted',
        statusBarClasses(rows),
        levelBandClasses('status')
      )}
    >
      {children}
    </footer>
  )
}

export function StatusEntry({
  label,
  value,
  tone
}: {
  readonly label: string
  readonly value: ReactNode
  readonly tone?: DiffStatus
}): JSX.Element {
  return (
    <span className="flex shrink-0 items-center gap-2 whitespace-nowrap">
      <span>{label}</span>
      {tone ? <DiffDot status={tone} /> : null}
      <span className="tabular font-mono text-content-secondary">{value}</span>
    </span>
  )
}

/** Diff-semantic answer-key counts of the active sample session. */
export function CompositionLegend({
  composition,
  labelKeys = DIFF_LABEL_KEYS,
  showLabels = true
}: {
  readonly composition: SampleComposition
  /** Optional vocabulary override; defaults to the shared text-diff words. */
  readonly labelKeys?: Record<DiffStatus, MessageKey>
  /** False keeps the dot and count but drops the status word (collapsed row). */
  readonly showLabels?: boolean
}): JSX.Element {
  const { t } = useI18n()
  return (
    <span data-shell-legend className="flex min-h-8 shrink-0 items-center gap-3">
      {DIFF_STATUSES.filter((status) => status !== 'conflict' || composition.conflict > 0).map(
        (status) => {
          const label = t(labelKeys[status])
          return (
            <span
              key={status}
              data-legend-status={status}
              title={showLabels ? undefined : label}
              aria-label={showLabels ? undefined : `${composition[status]} ${label}`}
              className={cx(
                'flex h-5 items-center gap-1 rounded-xs px-2 whitespace-nowrap',
                DIFF_BADGE_CLASSES[status]
              )}
            >
              <DiffDot status={status} />
              <span className="tabular font-mono">{composition[status]}</span>
              {showLabels ? <span>{label}</span> : null}
            </span>
          )
        }
      )}
    </span>
  )
}
