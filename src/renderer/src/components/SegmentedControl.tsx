import type { JSX, ReactNode } from 'react'
import { cx } from './utils'

export interface SegmentOption<T extends string> {
  readonly value: T
  readonly label: string
  readonly icon?: ReactNode
  readonly disabled?: boolean
}

export interface SegmentedControlProps<T extends string> {
  readonly options: readonly SegmentOption<T>[]
  readonly value: T
  readonly onChange: (value: T) => void
  /** Accessible name of the group, e.g. `视图切换`. */
  readonly label: string
}

/** Compact segmented control for switching views or modes. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label
}: SegmentedControlProps<T>): JSX.Element {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-md border border-line-subtle bg-surface-sunken p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cx(
              'focus-ring transition-fast inline-flex h-6 shrink-0 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium whitespace-nowrap disabled:pointer-events-none disabled:opacity-40',
              active
                ? 'bg-surface-hover text-content-primary shadow-panel'
                : 'text-content-secondary hover:bg-surface-overlay hover:text-content-primary'
            )}
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
