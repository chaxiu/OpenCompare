import type { JSX, ReactNode } from 'react'
import { cx } from './utils'

export interface StateViewProps {
  readonly icon: ReactNode
  readonly title: string
  readonly description: ReactNode
  readonly tone?: 'neutral' | 'danger'
  /** Primary recovery action, e.g. the empty-state load button or a retry. */
  readonly action?: ReactNode
  readonly hint?: ReactNode
}

/** Centred state surface used for the empty, loading and error states. */
export function StateView({
  icon,
  title,
  description,
  tone = 'neutral',
  action,
  hint
}: StateViewProps): JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-8">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <span
          className={cx(
            'flex size-11 items-center justify-center rounded-lg border',
            tone === 'danger'
              ? 'border-danger/40 bg-danger-soft text-danger'
              : 'border-line-subtle bg-surface-raised text-content-muted'
          )}
        >
          {icon}
        </span>
        <h2 className="text-base font-semibold tracking-tight text-content-primary">{title}</h2>
        <p className="text-xs leading-5 text-content-secondary">{description}</p>
        {action ? <div className="mt-1 flex items-center gap-2">{action}</div> : null}
        {hint ? <p className="text-2xs text-content-muted">{hint}</p> : null}
      </div>
    </div>
  )
}
