import { useEffect, useRef, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { UI_ICON_ACTIONS } from '@renderer/assets/icons'
import { ToolbarButton } from './Button'
import { Icon } from './Icon'
import type { ButtonSize, ButtonVariant } from './Button'
import { cx } from './utils'

export interface DropdownItem {
  readonly id: string
  readonly label: string
  readonly description?: string
  readonly icon?: ReactNode
  readonly danger?: boolean
}

export interface DropdownMenuProps {
  readonly label: string
  readonly items: readonly DropdownItem[]
  readonly onSelect: (id: string) => void
  readonly variant?: ButtonVariant
  readonly size?: ButtonSize
  readonly icon?: ReactNode
  /** Accessible name of the menu; defaults to `label`. */
  readonly menuLabel?: string
  /** Hides the copy while keeping the entry, its accessible name and the menu. */
  readonly iconOnly?: boolean
  /** Stable shell-layout hook for the trigger. */
  readonly entryId?: string
}

/** Toolbar button that opens a small action menu. Closes on select, Escape or outside click. */
export function DropdownMenu({
  label,
  items,
  onSelect,
  variant = 'default',
  size = 'md',
  icon,
  menuLabel,
  iconOnly = false,
  entryId
}: DropdownMenuProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return undefined

    function handlePointerDown(event: PointerEvent): void {
      if (container.current && !container.current.contains(event.target as Node)) setOpen(false)
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div ref={container} className="relative shrink-0">
      <ToolbarButton
        variant={variant}
        size={size}
        data-shell-entry={entryId}
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {icon}
        {iconOnly ? null : label}
        {iconOnly ? null : (
          <Icon
            name={UI_ICON_ACTIONS.menu}
            className={cx('transition-fast', open ? 'rotate-180' : undefined)}
          />
        )}
      </ToolbarButton>

      {open ? (
        <div
          role="menu"
          aria-label={menuLabel ?? label}
          className="absolute right-0 z-30 mt-1 w-72 rounded-md border border-line-strong bg-surface-overlay p-1 shadow-overlay"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onSelect(item.id)
              }}
              className={cx(
                'focus-ring transition-fast flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left',
                item.danger
                  ? 'text-diff-removed hover:bg-diff-removed-soft'
                  : 'text-content-secondary hover:bg-surface-hover hover:text-content-primary'
              )}
            >
              {item.icon ? <span className="mt-0.5 shrink-0">{item.icon}</span> : null}
              <span className="min-w-0">
                <span className="block text-xs font-medium">{item.label}</span>
                {item.description ? (
                  <span className="block text-2xs text-content-muted">{item.description}</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
