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
  /** Accessible name of the group, e.g. `Switch view`. */
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
      className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-md border border-line-subtle bg-surface-sunken px-1 py-0"
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
              'focus-ring transition-fast relative inline-flex h-[30px] shrink-0 items-center gap-2 rounded-sm px-3 text-xs font-medium whitespace-nowrap disabled:pointer-events-none disabled:opacity-40',
              active
                ? 'text-content-primary'
                : 'text-content-secondary hover:bg-surface-overlay hover:text-content-primary'
            )}
          >
            {option.icon}
            {option.label}
            {active ? (
              <span aria-hidden className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent" />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
