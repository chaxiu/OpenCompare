import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, JSX, ReactNode } from 'react'
import { UI_ICON_ACTIONS } from '@renderer/assets/icons'
import { ToolbarButton } from './Button'
import { Icon } from './Icon'
import type { ButtonSize, ButtonVariant } from './Button'
import { MENU_WIDTH_PX, placeDropdownMenu } from './menuPlacement'
import type { MenuPlacement } from './menuPlacement'
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
  const [placement, setPlacement] = useState<MenuPlacement | null>(null)
  const container = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open) return undefined

    function update(): void {
      const triggerRect = container.current?.getBoundingClientRect()
      const menuRect = menu.current?.getBoundingClientRect()
      if (!triggerRect) return
      setPlacement(
        placeDropdownMenu({
          trigger: triggerRect,
          menu: {
            width: menuRect?.width || MENU_WIDTH_PX,
            height: menuRect?.height || 0
          },
          viewport: { width: window.innerWidth, height: window.innerHeight }
        })
      )
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

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

  const menuStyle: CSSProperties = placement
    ? {
        position: 'fixed',
        top: placement.top,
        left: placement.left,
        width: placement.width,
        maxHeight: placement.maxHeight,
        overflowY: 'auto'
      }
    : { position: 'fixed', top: 0, left: 0, width: MENU_WIDTH_PX, visibility: 'hidden' }

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
          ref={menu}
          role="menu"
          aria-label={menuLabel ?? label}
          style={menuStyle}
          className="z-30 rounded-md border border-line-strong bg-surface-overlay p-1 shadow-overlay"
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
