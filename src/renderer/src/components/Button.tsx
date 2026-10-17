import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react'
import { cx } from './utils'

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  default:
    'border border-line-subtle bg-surface-raised text-content-primary hover:border-line-strong hover:bg-surface-hover',
  primary:
    'border border-accent bg-accent text-content-inverse hover:border-accent-strong hover:bg-accent-strong',
  ghost:
    'border border-transparent bg-transparent text-content-secondary hover:bg-surface-hover hover:text-content-primary',
  danger:
    'border border-danger/40 bg-danger-soft text-danger hover:border-danger hover:bg-danger hover:text-content-inverse'
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-6 gap-1 px-2 text-2xs',
  md: 'h-7 gap-1.5 px-2.5 text-xs'
}

export interface ToolbarButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant
  readonly size?: ButtonSize
  readonly icon?: ReactNode
}

/** Toolbar / panel action button. Disabled state uses `disabled`. */
export function ToolbarButton({
  variant = 'default',
  size = 'md',
  icon,
  className,
  children,
  type = 'button',
  ...rest
}: ToolbarButtonProps): JSX.Element {
  return (
    <button
      type={type}
      className={cx(
        'focus-ring transition-ui inline-flex shrink-0 items-center justify-center rounded-sm font-medium whitespace-nowrap select-none active:translate-y-px disabled:pointer-events-none disabled:opacity-40',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}

const ICON_VARIANT_CLASSES = {
  ghost: 'text-content-muted hover:bg-surface-hover hover:text-content-primary',
  danger: 'text-content-muted hover:bg-danger-soft hover:text-danger'
} as const

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name; also used as the native tooltip. */
  readonly label: string
  readonly icon: ReactNode
  readonly variant?: keyof typeof ICON_VARIANT_CLASSES
}

/** Square icon-only button used inside panel headers. */
export function IconButton({
  label,
  icon,
  variant = 'ghost',
  className,
  type = 'button',
  ...rest
}: IconButtonProps): JSX.Element {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'focus-ring transition-ui inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm disabled:pointer-events-none disabled:opacity-40',
        ICON_VARIANT_CLASSES[variant],
        className
      )}
      {...rest}
    >
      {icon}
    </button>
  )
}
