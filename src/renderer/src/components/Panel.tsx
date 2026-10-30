import type { JSX, ReactNode, Ref, UIEvent } from 'react'
import { levelHeaderClasses } from '@renderer/workbench/shellLayout'
import { cx } from './utils'

export interface PanelProps {
  /** Panel header title; rendered in the monospace stack (paths, ids, metrics). */
  readonly title: string
  /** Secondary header text. */
  readonly subtitle?: string
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
}

/** Bordered, scrollable panel container used across every workbench view. */
export function Panel({
  title,
  subtitle,
  meta,
  actions,
  children,
  className,
  bodyClassName,
  bodyRef,
  onBodyScroll
}: PanelProps): JSX.Element {
  return (
    <section
      className={cx(
        'shadow-panel flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-line-subtle bg-surface-raised',
        className
      )}
    >
      <header
        className={cx(
          'flex shrink-0 items-center border-b border-line-subtle bg-surface-overlay',
          levelHeaderClasses('panels')
        )}
      >
        <span
          className="truncate font-mono text-2xs font-medium text-content-secondary"
          title={title}
        >
          {title}
        </span>
        {subtitle ? (
          <span className="truncate text-2xs text-content-muted">{subtitle}</span>
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
