import { useEffect, useRef } from 'react'
import type { JSX, ReactNode, RefObject } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '@renderer/i18n/context'
import { IconButton } from './Button'

export interface DialogProps {
  /** Accessible name; also rendered as the visible title. */
  readonly title: string
  readonly description?: ReactNode
  readonly onClose: () => void
  readonly footer?: ReactNode
  /** Element focused on mount instead of the dialog panel. */
  readonly initialFocusRef?: RefObject<HTMLElement | null>
  readonly children: ReactNode
}

/**
 * Modal dialog used for the dry-run sync preview and the template placement
 * preview. Escape and the close button dismiss it; the panel takes focus on
 * mount so keyboard users land inside.
 */
export function Dialog({
  title,
  description,
  onClose,
  footer,
  initialFocusRef,
  children
}: DialogProps): JSX.Element {
  const { t } = useI18n()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const target = initialFocusRef?.current ?? panel.current
    target?.focus()

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, initialFocusRef])

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-surface-base/70 p-4">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="shadow-overlay focus-ring flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-line-strong bg-surface-raised"
      >
        <header className="flex h-9 shrink-0 items-center gap-2 border-b border-line-subtle bg-surface-overlay px-3">
          <h2 className="truncate text-xs font-semibold text-content-primary">{title}</h2>
          <IconButton
            label={t('common.close')}
            icon={<X aria-hidden className="size-3.5" />}
            onClick={onClose}
            className="ml-auto"
          />
        </header>
        {description ? (
          <p className="shrink-0 border-b border-line-subtle px-3 py-2 text-2xs text-content-muted">
            {description}
          </p>
        ) : null}
        <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
        {footer ? (
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line-subtle bg-surface-overlay px-3 py-2">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  )
}
