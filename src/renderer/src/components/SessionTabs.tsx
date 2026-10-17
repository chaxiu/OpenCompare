import type { JSX, ReactNode } from 'react'
import { cx } from './utils'

export interface SessionTab {
  readonly id: string
  readonly title: string
  readonly subtitle?: string
  readonly icon?: ReactNode
}

export interface SessionTabsProps {
  readonly tabs: readonly SessionTab[]
  readonly activeId: string | null
  readonly onSelect: (id: string) => void
}

/** Horizontal session switcher — one tab per loaded sample session. */
export function SessionTabs({ tabs, activeId, onSelect }: SessionTabsProps): JSX.Element {
  return (
    <div
      role="tablist"
      aria-label="会话"
      className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(tab.id)}
            className={cx(
              'focus-ring transition-fast relative flex h-7 shrink-0 items-center gap-2 rounded-sm border px-2.5 text-xs whitespace-nowrap',
              active
                ? 'border-line-strong bg-surface-overlay text-content-primary'
                : 'border-transparent text-content-muted hover:bg-surface-raised hover:text-content-secondary'
            )}
          >
            {tab.icon}
            <span className="font-medium">{tab.title}</span>
            {tab.subtitle ? (
              <span className="hidden text-2xs text-content-muted lg:inline">{tab.subtitle}</span>
            ) : null}
            {active ? (
              <span aria-hidden className="absolute inset-x-2 -bottom-px h-px bg-accent" />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
