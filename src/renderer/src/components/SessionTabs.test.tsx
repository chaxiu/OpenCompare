// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { translate } from '@renderer/i18n/context'
import { createFilePairSession } from '@renderer/workbench/directoryCompare'
import type { WorkbenchSession } from '@renderer/workbench/session'
import { describeSession, renderSessionText } from '@renderer/workbench/sessionDisplay'
import { TAB_TIER_BUDGETS, clipSubtitle, clipTitle } from '@renderer/workbench/sessionTabText'
import { TIER_WIDTHS } from '@renderer/workbench/shellLayout'
import type { WidthTier } from '@renderer/workbench/shellLayout'
import { SessionTabs } from './SessionTabs'
import type { SessionTab } from './SessionTabs'

const zh = translate('zh')
const TIERS: readonly WidthTier[] = ['compact', 'regular', 'wide']

const LEFT_ROOT = '/Users/someone/workspace/client-project/packages/desktop/src/renderer'
const RIGHT_ROOT = '/Users/someone/archive/old-client-project/packages/desktop/src/renderer'
const LEFT_FILE = 'session-tabs-left-panel.ts'
const RIGHT_FILE = 'session-tabs-right-panel.ts'

/** Builds a runtime file-pair session whose title/subtitle come from real paths. */
function pairSession(
  leftRoot: string,
  rightRoot: string,
  id = 'pair',
  leftFile = LEFT_FILE,
  rightFile = RIGHT_FILE
): WorkbenchSession {
  return createFilePairSession(
    id,
    'pair',
    { kind: 'code', label: 'code' },
    { path: `${leftRoot}/${leftFile}`, text: 'left line\n' },
    { path: `${rightRoot}/${rightFile}`, text: 'right line\n' }
  )
}

/** The tab props the workbench derives for one session. */
function tabOf(session: WorkbenchSession): SessionTab {
  const display = describeSession(session)
  return {
    id: session.id,
    title: renderSessionText(display.title, zh),
    subtitle: renderSessionText(display.subtitle, zh)
  }
}

function setWindowWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
}

function classList(element: Element): readonly string[] {
  return (element.getAttribute('class') ?? '').split(/\s+/).filter((token) => token.length > 0)
}

function tabContainer(scope: HTMLElement, id: string): HTMLElement {
  const node = scope.querySelector<HTMLElement>(`[data-session-tab="${id}"]`)
  expect(node).not.toBeNull()
  return node as HTMLElement
}

function part(scope: HTMLElement, name: 'title' | 'subtitle'): HTMLElement | null {
  return scope.querySelector<HTMLElement>(`[data-tab-part="${name}"]`)
}

/** The close button of one tab container (the only non-tab button it holds). */
function closeButton(node: HTMLElement): HTMLButtonElement {
  const button = node.querySelector<HTMLButtonElement>('button:not([role="tab"])')
  expect(button).not.toBeNull()
  return button as HTMLButtonElement
}

function renderTabs(
  tabs: readonly SessionTab[],
  activeId: string,
  onSelect: () => void = () => undefined,
  onClose?: (id: string) => void
): HTMLElement {
  const { container } = render(
    <SessionTabs tabs={tabs} activeId={activeId} onSelect={onSelect} onClose={onClose} />
  )
  return container
}

afterEach(cleanup)

describe('session tab text by width tier', () => {
  const session = pairSession(LEFT_ROOT, RIGHT_ROOT)
  const tab = tabOf(session)

  it.each(TIERS)('renders the pure clipping output at the %s tier', (tier) => {
    setWindowWidth(TIER_WIDTHS[tier])
    const budget = TAB_TIER_BUDGETS[tier]
    const container = renderTabs([tab], 'pair')

    const node = tabContainer(container, 'pair')
    expect(part(node, 'title')?.textContent).toBe(clipTitle(tab.title, budget.titleCols).text)

    const subtitleNode = part(node, 'subtitle')
    if (budget.subtitleCols === 0) {
      expect(subtitleNode).toBeNull()
    } else {
      expect(subtitleNode?.textContent).toBe(
        clipSubtitle(tab.subtitle as string, budget.subtitleCols).text
      )
    }

    // The container width bound comes from the same table.
    expect(node.style.maxWidth).toBe(`${budget.tabMaxWidthPx}px`)
  })

  it('hides the subtitle on the compact tier and shows it above', () => {
    setWindowWidth(TIER_WIDTHS.compact)
    expect(part(tabContainer(renderTabs([tab], 'pair'), 'pair'), 'subtitle')).toBeNull()
    cleanup()

    for (const tier of ['regular', 'wide'] as const) {
      setWindowWidth(TIER_WIDTHS[tier])
      expect(part(tabContainer(renderTabs([tab], 'pair'), 'pair'), 'subtitle')).not.toBeNull()
      cleanup()
    }
  })
})

describe('session tab layout bounds', () => {
  const tab = tabOf(pairSession(LEFT_ROOT, RIGHT_ROOT))

  it.each(TIERS)('never wraps and keeps every text node single-line at the %s tier', (tier) => {
    setWindowWidth(TIER_WIDTHS[tier])
    const container = renderTabs([tab], 'pair')

    const tablist = screen.getByRole('tablist', { name: zh('common.sessions') })
    expect(classList(tablist)).toContain('overflow-x-auto')
    expect(classList(tablist).some((token) => token.startsWith('flex-wrap'))).toBe(false)

    const node = tabContainer(container, 'pair')
    expect(classList(node).some((token) => token.startsWith('flex-wrap'))).toBe(false)

    for (const name of ['title', 'subtitle'] as const) {
      const textNode = part(node, name)
      if (!textNode) continue
      const classes = classList(textNode)
      expect(classes).toContain('min-w-0')
      expect(classes).toContain('truncate')
      expect(classes).not.toContain('whitespace-normal')
      // No responsive utility may decide the tier; the table does.
      expect(classes.some((token) => token.includes(':'))).toBe(false)
    }
  })

  it('keeps the close button outside the clipped text and identical for short and long titles', () => {
    setWindowWidth(TIER_WIDTHS.compact)
    const onClose = vi.fn()
    const shortTab: SessionTab = { id: 'short', title: 'a.ts' }
    const container = renderTabs([shortTab, tab], 'short', () => undefined, onClose)

    const shortNode = tabContainer(container, 'short')
    const longNode = tabContainer(container, tab.id)
    const shortClose = closeButton(shortNode)
    const longClose = closeButton(longNode)

    expect(classList(shortClose)).toEqual(classList(longClose))
    expect(shortClose.parentElement).toBe(shortNode)
    expect(longClose.parentElement).toBe(longNode)
    expect(shortNode.querySelector('[role="tab"]')?.contains(shortClose)).toBe(false)
    expect(longNode.querySelector('[role="tab"]')?.contains(longClose)).toBe(false)

    fireEvent.click(longClose)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledWith(tab.id)
  })
})

describe('session tab semantics', () => {
  it('keeps the full derived text reachable after clipping', () => {
    setWindowWidth(TIER_WIDTHS.compact)
    const tab = tabOf(pairSession(LEFT_ROOT, RIGHT_ROOT))
    renderTabs([tab], tab.id)

    // The compact tier shows no subtitle node, but the full label still carries
    // both derived parts.
    const compactLabel = screen.getByRole('tab').getAttribute('title') ?? ''
    expect(compactLabel).toBe(`${tab.title} — ${tab.subtitle}`)
    cleanup()

    setWindowWidth(TIER_WIDTHS.wide)
    renderTabs([tab], tab.id)
    const fullLabel = screen.getByRole('tab').getAttribute('title') ?? ''
    expect(fullLabel).toContain(tab.title)
    expect(fullLabel).toContain(tab.subtitle as string)
  })

  it('selects, closes and orders tabs exactly as passed', () => {
    setWindowWidth(TIER_WIDTHS.regular)
    const onSelect = vi.fn()
    const onClose = vi.fn()
    const tabs: readonly SessionTab[] = [
      { id: 'a', title: 'alpha.ts' },
      { id: 'b', title: 'beta.ts' },
      { id: 'c', title: 'gamma.ts' }
    ]
    const container = renderTabs(tabs, 'b', onSelect, onClose)

    const rendered = Array.from(container.querySelectorAll('[data-session-tab]')).map((node) =>
      node.getAttribute('data-session-tab')
    )
    expect(rendered).toEqual(['a', 'b', 'c'])

    const selected = screen
      .getAllByRole('tab')
      .filter((node) => node.getAttribute('aria-selected') === 'true')
    expect(
      selected.map((node) => node.closest('[data-session-tab]')?.getAttribute('data-session-tab'))
    ).toEqual(['b'])

    fireEvent.click(screen.getByRole('tab', { name: 'alpha.ts' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('a')

    fireEvent.click(closeButton(tabContainer(container, 'c')))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledWith('c')
  })
})

describe('session tab text follows the session paths', () => {
  it('derives the tab copy from the target session instead of the previous one', () => {
    setWindowWidth(TIER_WIDTHS.wide)
    const first = pairSession('/roots/one', '/roots/two', 'a', 'alpha-panel.ts', 'alpha-right.ts')
    const second = pairSession('/roots/three', '/roots/four', 'b', 'beta-panel.ts', 'beta-right.ts')
    const container = renderTabs([tabOf(first)], 'a')
    expect(tabContainer(container, 'a').textContent).toContain('alpha-panel.ts')
    cleanup()

    const after = renderTabs([tabOf(second)], 'b')
    const text = tabContainer(after, 'b').textContent ?? ''
    expect(text).toContain('beta-panel.ts')
    expect(text).not.toContain('alpha-panel.ts')
  })

  it('follows a renamed root instead of a frozen title', () => {
    setWindowWidth(TIER_WIDTHS.wide)
    const original = pairSession('/roots/old-left', '/roots/old-right', 'pair', 'old-panel.ts', 'old-right.ts')
    const renamed = pairSession('/roots/new-left', '/roots/new-right', 'pair', 'new-panel.ts', 'new-right.ts')
    const container = renderTabs([tabOf(original)], 'pair')
    expect(tabContainer(container, 'pair').textContent).toContain('old-panel.ts')
    cleanup()

    const after = renderTabs([tabOf(renamed)], 'pair')
    const text = tabContainer(after, 'pair').textContent ?? ''
    expect(text).toContain('new-panel.ts')
    expect(text).not.toContain('old-panel.ts')
  })
})
