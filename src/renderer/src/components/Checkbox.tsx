import type { ChangeEvent, JSX, KeyboardEvent } from 'react'
import { cx } from './utils'

export interface CheckboxProps {
  readonly checked: boolean
  readonly onChange: (checked: boolean) => void
  /** Accessible name; the native input / switch button carries it, the box is hidden. */
  readonly label: string
  /** `switch` keeps the legacy button role; `checkbox` uses a native input. */
  readonly role?: 'checkbox' | 'switch'
  /** Renders `label` next to the box; otherwise the box stands alone. */
  readonly showLabel?: boolean
  readonly disabled?: boolean
  readonly className?: string
  /** Native tooltip; defaults to nothing. */
  readonly title?: string
  readonly 'data-code-switch'?: string
}

const BOX_CLASS =
  'transition-fast inline-flex h-4 w-7 shrink-0 items-center justify-center rounded-xs border-2'

/**
 * One 28×16 square toggle for every boolean in the interface.
 *
 * Switch call sites keep a real `<button role="switch" aria-checked>` (the
 * legacy native control) so keyboard and accessibility contracts stay intact;
 * plain booleans keep a visually hidden native checkbox. Only the painted box
 * is ours.
 */
export function Checkbox({
  checked,
  onChange,
  label,
  role = 'checkbox',
  showLabel = false,
  disabled = false,
  className,
  title,
  'data-code-switch': dataCodeSwitch
}: CheckboxProps): JSX.Element {
  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange(event.target.checked)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (disabled || (event.key !== ' ' && event.key !== 'Enter')) return
    event.preventDefault()
    onChange(!checked)
  }

  const box = (
    <span
      aria-hidden
      className={cx(
        BOX_CLASS,
        checked
          ? 'border-transparent bg-accent text-content-inverse'
          : 'border-line-strong bg-surface-base text-transparent'
      )}
    >
      <span
        aria-hidden
        className={cx(
          'h-2 w-1 rotate-45 border-r-2 border-b-2 border-current',
          checked ? 'opacity-100' : 'opacity-0'
        )}
      />
    </span>
  )

  if (role === 'switch') {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        title={title}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        onKeyDown={handleKeyDown}
        data-code-switch={dataCodeSwitch}
        className={cx(
          'focus-ring inline-flex h-[var(--height-control-sm)] shrink-0 items-center gap-2 rounded-xs text-2xs text-content-secondary',
          disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
          className
        )}
      >
        {box}
        {showLabel ? <span>{label}</span> : null}
      </button>
    )
  }

  return (
    <label
      title={title}
      className={cx(
        'inline-flex shrink-0 items-center gap-2 text-2xs text-content-secondary',
        disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
        className
      )}
    >
      <input
        type="checkbox"
        role="checkbox"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={handleChange}
        data-code-switch={dataCodeSwitch}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={cx(
          BOX_CLASS,
          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
          checked
            ? 'border-transparent bg-accent text-content-inverse'
            : 'border-line-strong bg-surface-base text-transparent'
        )}
      >
        <span
          aria-hidden
          className={cx(
            'h-2 w-1 rotate-45 border-r-2 border-b-2 border-current',
            checked ? 'opacity-100' : 'opacity-0'
          )}
        />
      </span>
      {showLabel ? <span>{label}</span> : null}
    </label>
  )
}
