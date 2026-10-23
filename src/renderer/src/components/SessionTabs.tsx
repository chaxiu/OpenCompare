import type { JSX, ReactNode } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '@renderer/i18n/context'
import { IconButton } from './Button'
import { cx } from './utils'

export interface SessionTab {
  readonly id: string
  readonly title: string
  readonly subtitle?: string
  readonly icon?: ReactNode
  /** True while the session holds edits that are not on disk yet. */
  readonly dirty?: boolean
}

export interface SessionTabsProps {
  readonly tabs: readonly SessionTab[]
  readonly activeId: string | null
  readonly onSelect: (id: string) => void
  /** Closes one session; the workbench owns the unsaved-edits prompt. */
  readonly onClose?: (id: string) => void
}

/** Horizontal session switcher — one tab per open session. */
export function SessionTabs({ tabs, activeId, onSelect, onClose }: SessionTabsProps): JSX.Element {
  const { t } = useI18n()
  return (
    <div
      role="tablist"
      aria-label={t('common.sessions')}
      className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId
        return (
          <div
            key={tab.id}
            className={cx(
              'transition-fast relative flex h-7 shrink-0 items-center rounded-sm border',
              active
                ? 'border-line-strong bg-surface-overlay text-content-primary'
                : 'border-transparent text-content-muted hover:bg-surface-raised hover:text-content-secondary'
            )}
          >
            <button
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(tab.id)}
              className="focus-ring flex h-full min-w-0 items-center gap-2 rounded-sm px-2.5 text-xs whitespace-nowrap"
            >
              {tab.icon}
              <span className="font-medium">{tab.title}</span>
              {tab.subtitle ? (
                <span className="hidden text-2xs text-content-muted lg:inline">{tab.subtitle}</span>
              ) : null}
              {tab.dirty ? (
                <>
                  <span
                    aria-hidden
                    title={t('common.unsavedChanges')}
                    className="size-1.5 shrink-0 rounded-full bg-diff-modified"
                  />
                  <span className="sr-only">{t('common.unsavedChanges')}</span>
                </>
              ) : null}
              {active ? (
                <span aria-hidden className="absolute inset-x-2 -bottom-px h-px bg-accent" />
              ) : null}
            </button>
            {onClose ? (
              <IconButton
                label={t('common.closeTitle', { title: tab.title })}
                icon={<X aria-hidden className="size-3.5" />}
                onClick={() => onClose(tab.id)}
                className="mr-0.5"
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
