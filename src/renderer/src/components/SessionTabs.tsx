import type { JSX, ReactNode } from 'react'
import { UI_ICON_ACTIONS } from '@renderer/assets/icons'
import { useI18n } from '@renderer/i18n/context'
import { TAB_TIER_BUDGETS, clipSubtitle, clipTitle } from '@renderer/workbench/sessionTabText'
import { useWidthTier } from '@renderer/workbench/useWidthTier'
import { IconButton } from './Button'
import { Icon } from './Icon'
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
  // The tier table owns every length: the component never invents a breakpoint.
  const budget = TAB_TIER_BUDGETS[useWidthTier()]

  return (
    <div
      role="tablist"
      aria-label={t('common.sessions')}
      className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId
        const title = clipTitle(tab.title, budget.titleCols)
        const subtitle =
          tab.subtitle !== undefined && budget.subtitleCols > 0
            ? clipSubtitle(tab.subtitle, budget.subtitleCols)
            : null
        // The clipped copy stays readable in full through the native tooltip
        // and the accessible name, even where the tier hides the subtitle.
        const fullLabel = tab.subtitle === undefined ? tab.title : `${tab.title} — ${tab.subtitle}`
        return (
          <div
            key={tab.id}
            data-session-tab={tab.id}
            style={{ maxWidth: `${budget.tabMaxWidthPx}px` }}
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
              aria-label={fullLabel}
              // The clipped copy keeps the dirty state audible through the
              // description instead of the (now overridden) inner sr-only text.
              aria-description={tab.dirty ? t('common.unsavedChanges') : undefined}
              title={fullLabel}
              onClick={() => onSelect(tab.id)}
              className="focus-ring flex h-full min-w-0 items-center gap-2 rounded-sm px-2.5 text-xs whitespace-nowrap"
            >
              {tab.icon}
              <span data-tab-part="title" className="min-w-0 truncate font-medium">
                {title.text}
              </span>
              {subtitle ? (
                <span data-tab-part="subtitle" className="min-w-0 truncate text-2xs text-content-muted">
                  {subtitle.text}
                </span>
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
                icon={<Icon name={UI_ICON_ACTIONS.close} />}
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
