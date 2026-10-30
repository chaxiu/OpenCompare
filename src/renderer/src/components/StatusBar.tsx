import type { JSX, ReactNode } from 'react'
import type { DiffStatus, SampleComposition } from '@shared/fixtures'
import { useI18n } from '@renderer/i18n/context'
import { levelBandClasses, levelRowClasses } from '@renderer/workbench/shellLayout'
import { DiffDot } from './DiffBadge'
import { DIFF_LABEL_KEYS, DIFF_STATUSES } from './diffSemantics'
import { cx } from './utils'

export function StatusBar({ children }: { readonly children: ReactNode }): JSX.Element {
  return (
    <footer
      data-shell-level="status"
      className={cx(
        'flex shrink-0 items-center overflow-x-auto border-t border-line-subtle bg-surface-sunken text-2xs text-content-muted',
        levelRowClasses('status'),
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
    <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
      <span>{label}</span>
      {tone ? <DiffDot status={tone} /> : null}
      <span className="tabular font-mono text-content-secondary">{value}</span>
    </span>
  )
}

/** Diff-semantic answer-key counts of the active sample session. */
export function CompositionLegend({
  composition
}: {
  readonly composition: SampleComposition
}): JSX.Element {
  const { t } = useI18n()
  return (
    <span className="flex shrink-0 items-center gap-2.5">
      {DIFF_STATUSES.filter((status) => status !== 'conflict' || composition.conflict > 0).map(
        (status) => (
          <span key={status} className="flex items-center gap-1 whitespace-nowrap">
            <DiffDot status={status} />
            <span className="tabular font-mono text-content-secondary">{composition[status]}</span>
            <span>{t(DIFF_LABEL_KEYS[status])}</span>
          </span>
        )
      )}
    </span>
  )
}
