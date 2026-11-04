import { useEffect, useState } from 'react'
import type { JSX, ReactNode, Ref, UIEvent } from 'react'
import { useI18n } from '@renderer/i18n/context'
import { levelHeaderClasses } from '@renderer/workbench/shellLayout'
import { cx } from './utils'

export interface PanelProps {
  /** Panel header title; rendered in the monospace stack (paths, ids, metrics). */
  readonly title: string
  /** Secondary header text. */
  readonly subtitle?: string
  /** Full path shown in the single-line address bar; falls back to `title`. */
  readonly address?: string
  /** Right-aligned header content before {@link actions}. */
  readonly meta?: ReactNode
  readonly actions?: ReactNode
  readonly children: ReactNode
  readonly className?: string
  readonly bodyClassName?: string
  /** Exposes the scroll container so a view can restore its scroll offset. */
  readonly bodyRef?: Ref<HTMLDivElement>
  /** Reports the scroll container's offset as it moves. */
  readonly onBodyScroll?: (scrollTop: number) => void
  /** Copies the address through the injected platform seam. */
  readonly onCopy?: (text: string) => Promise<boolean> | boolean
  /** Marks the panel whose header owns the active background and brand bar. */
  readonly active?: boolean
  /** Reports a pointer interaction so the owner can move the active mark. */
  readonly onActivate?: () => void
}

/** Bordered, scrollable panel container used across every workbench view. */
export function Panel({
  title,
  subtitle,
  address,
  meta,
  actions,
  children,
  className,
  bodyClassName,
  bodyRef,
  onBodyScroll,
  onCopy,
  active = false,
  onActivate
}: PanelProps): JSX.Element {
  const { t } = useI18n()
  const path = address ?? title
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return undefined
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])

  async function copyAddress(): Promise<void> {
    try {
      await onCopy?.(path)
    } catch {
      // Capability unavailable: the same one-shot feedback still appears.
    }
    setCopied(true)
  }

  return (
    <section
      onPointerDown={onActivate}
      className={cx(
        'shadow-panel flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-line-subtle bg-surface-raised',
        className
      )}
    >
      <header
        data-panel-header
        data-panel-active={active ? 'true' : undefined}
        className={cx(
          'relative flex shrink-0 items-center border-b border-line-subtle',
          active ? 'bg-surface-raised' : 'bg-surface-overlay',
          levelHeaderClasses('panels')
        )}
      >
        {active ? (
          <span aria-hidden data-panel-active-bar className="absolute inset-y-0 left-0 w-0.5 bg-accent" />
        ) : null}
        <button
          type="button"
          data-panel-address
          onClick={() => void copyAddress()}
          title={path}
          aria-label={t('shell.panel.copyPath')}
          className="focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-xs text-left"
        >
          <span className="truncate font-mono text-2xs font-medium text-content-secondary">
            {path}
          </span>
          {subtitle ? (
            <span className="shrink-0 text-2xs text-content-muted">{subtitle}</span>
          ) : null}
        </button>
        {copied ? (
          <span
            role="status"
            aria-live="polite"
            className="shrink-0 text-2xs text-diff-added"
          >
            {t('shell.panel.copied')}
          </span>
        ) : null}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {meta}
          {actions}
        </span>
      </header>
      <div
        ref={bodyRef}
        onScroll={
          onBodyScroll
            ? (event: UIEvent<HTMLDivElement>) => onBodyScroll(event.currentTarget.scrollTop)
            : undefined
        }
        className={cx('min-h-0 flex-1 overflow-auto', bodyClassName)}
      >
        {children}
      </div>
    </section>
  )
}
