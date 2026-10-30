// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ICON_NAMES, ICON_SIZES, strokeWidthFor } from '@renderer/assets/icons'
import type { IconSize } from '@renderer/assets/icons'
import { translate } from '@renderer/i18n/context'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { Workbench } from './Workbench'
import {
  SHELL_ENTRIES,
  SHELL_ENTRY_IDS,
  SHELL_LEVELS,
  SHELL_LEVEL_ORDER,
  TIER_WIDTHS,
  entriesFor,
  entryPresentation,
  levelBandClasses,
  levelHeaderClasses,
  levelRowClasses
} from './shellLayout'
import type { ShellEntryId, ShellLevel, ToolbarView, WidthTier } from './shellLayout'

const zh = translate('zh')
const TIERS: readonly WidthTier[] = ['compact', 'regular', 'wide']

/**
 * jsdom reports zero-sized elements, which would leave the virtualised trees
 * without a viewport. Fixed boxes stand in for the real panels.
 */
const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
const originalInnerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth')

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 1200
  })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 640
  })
})

afterAll(() => {
  if (originalWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalWidth)
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
  if (originalHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalHeight)
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight')
  if (originalInnerWidth) Object.defineProperty(window, 'innerWidth', originalInnerWidth)
})

beforeEach(() => {
  localStorage.setItem('opencompare.userSettings', JSON.stringify({ language: 'zh' }))
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

/** Pins the window width before a render, exactly like a real resize would. */
function setWindowWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
}

function classList(element: Element): readonly string[] {
  return (element.getAttribute('class') ?? '').split(/\s+/).filter((token) => token.length > 0)
}

function hasClasses(element: Element, expected: string): void {
  const classes = classList(element)
  for (const token of expected.split(' ')) expect(classes).toContain(token)
}

function levelElement(container: HTMLElement, level: ShellLevel): HTMLElement {
  const nodes = container.querySelectorAll(`[data-shell-level="${level}"]`)
  expect(nodes.length).toBe(1)
  return nodes[0] as HTMLElement
}

function renderedLevels(container: HTMLElement): readonly string[] {
  return Array.from(container.querySelectorAll('[data-shell-level]')).map(
    (element) => element.getAttribute('data-shell-level') ?? ''
  )
}

function renderedEntries(container: HTMLElement): readonly ShellEntryId[] {
  return Array.from(container.querySelectorAll('[data-shell-entry]')).map(
    (element) => element.getAttribute('data-shell-entry') ?? ''
  ) as ShellEntryId[]
}

function entryElement(container: HTMLElement, id: ShellEntryId): HTMLElement {
  const nodes = container.querySelectorAll(`[data-shell-entry="${id}"]`)
  expect(nodes.length).toBe(1)
  return nodes[0] as HTMLElement
}

/** Element-level visibility stand-in: jsdom has no layout engine. */
function isRendered(element: Element): boolean {
  if (element.hasAttribute('hidden')) return false
  if (classList(element).includes('hidden')) return false
  return element.closest('.hidden') === null
}

/** Loads the built-in sample library and waits for the ready shell. */
async function loadSamples(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: zh('shell.toolbar.loadSamples') }))
  await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })
}

/** Switches the visible session through the tabs the shell renders. */
function showSession(name: RegExp): void {
  const tabs = screen.getByRole('tablist', { name: zh('common.sessions') })
  fireEvent.click(within(tabs).getByRole('tab', { name }))
}

/** What the level table declares for one ready view, minus absent extras. */
function declaredEntries(view: ToolbarView, drilled: boolean): readonly ShellEntryId[] {
  return [
    ...entriesFor('app'),
    ...entriesFor('sessions'),
    ...entriesFor('view-toolbar', view).filter((id) => drilled || id !== 'drilldown-back')
  ]
}

describe.each(TIERS)('workbench shell at the %s tier', (tier) => {
  const width = TIER_WIDTHS[tier]

  beforeEach(() => {
    setWindowWidth(width)
  })

  it('renders the five shell levels in order, once each', async () => {
    const { container } = render(<Workbench platform={createWebPlatformPort()} />)
    await loadSamples()

    expect(renderedLevels(container)).toEqual([
      'app',
      'sessions',
      'view-toolbar',
      'panels',
      'status'
    ])
  })

  it('shows the event band only between the session head and the view toolbar', async () => {
    const { container } = render(<Workbench platform={createWebPlatformPort()} />)
    await loadSamples()
    expect(container.querySelector('[data-shell-level="events"]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: zh('shell.toolbar.samples') }))
    fireEvent.click(screen.getByRole('menuitem', { name: /样本读取失败/ }))
    await screen.findByRole('alert')

    expect(renderedLevels(container)).toEqual([
      'app',
      'sessions',
      'events',
      'view-toolbar',
      'panels',
      'status'
    ])
    const events = levelElement(container, 'events')
    expect(events.children.length).toBeGreaterThan(0)
    expect(Array.from(events.querySelectorAll('[class*="flex-wrap"]'))).toEqual([])
    for (const row of Array.from(events.children)) {
      hasClasses(row, levelRowClasses('events'))
      expect(classList(row).some((token) => token.startsWith('flex-wrap'))).toBe(false)
    }
    hasClasses(events, levelBandClasses('events'))
  })

  it('matches every level metric to the single layout table', async () => {
    const { container } = render(<Workbench platform={createWebPlatformPort()} />)
    await loadSamples()

    for (const level of ['app', 'sessions', 'status'] as const) {
      const element = levelElement(container, level)
      hasClasses(element, levelRowClasses(level))
      hasClasses(element, levelBandClasses(level))
    }

    const toolbar = levelElement(container, 'view-toolbar')
    hasClasses(toolbar, levelBandClasses('view-toolbar'))
    const rows = Array.from(toolbar.children)
    expect(rows.length).toBe(3)
    for (const row of rows) hasClasses(row, levelRowClasses('view-toolbar'))

    const panels = levelElement(container, 'panels')
    hasClasses(panels, levelBandClasses('panels'))
    const headers = Array.from(panels.querySelectorAll('header'))
    expect(headers.length).toBe(2)
    for (const header of headers) {
      hasClasses(header, levelHeaderClasses('panels'))
    }

    // Every toolbar control keeps the control height of its own level. (The
    // session tabs' height belongs to the frozen SessionTabs internals.)
    for (const level of ['app', 'view-toolbar'] as const) {
      const buttons = Array.from(levelElement(container, level).querySelectorAll('button'))
      expect(buttons.length).toBeGreaterThan(0)
      for (const button of buttons) hasClasses(button, SHELL_LEVELS[level].controlHeight)
    }

    // No responsive utility may sneak into a level: the height is tier-free.
    for (const level of SHELL_LEVEL_ORDER) {
      const nodes = container.querySelectorAll(`[data-shell-level="${level}"]`)
      for (const node of Array.from(nodes)) {
        expect(classList(node).filter((token) => token.includes(':'))).toEqual([])
      }
    }
  })

  it('keeps every toolbar row on one line', async () => {
    const { container } = render(<Workbench platform={createWebPlatformPort()} />)
    await loadSamples()

    for (const level of ['app', 'view-toolbar'] as const) {
      const element = levelElement(container, level)
      const wrapping = Array.from(element.querySelectorAll('[class*="flex-wrap"]'))
      expect(wrapping).toEqual([])
      expect(classList(element).some((token) => token.startsWith('flex-wrap'))).toBe(false)
    }

    for (const level of ['sessions', 'panels'] as const) {
      const element = levelElement(container, level)
      expect(classList(element).some((token) => token.startsWith('flex-wrap'))).toBe(false)
      for (const child of Array.from(element.children)) {
        expect(classList(child).some((token) => token.startsWith('flex-wrap'))).toBe(false)
      }
    }
  })

  it('keeps a narrow toolbar row scrollable instead of clipped or wrapped', async () => {
    setWindowWidth(960)
    const { container } = render(<Workbench platform={createWebPlatformPort()} />)
    await loadSamples()

    const toolbar = levelElement(container, 'view-toolbar')
    // The band keeps its table tokens: the scroll guard lives on the rows only.
    hasClasses(toolbar, levelBandClasses('view-toolbar'))
    expect(classList(toolbar)).not.toContain('overflow-x-auto')
    expect(classList(toolbar)).not.toContain('min-w-0')
    expect(classList(toolbar).filter((token) => token.includes(':'))).toEqual([])

    const rows = Array.from(toolbar.children)
    expect(rows.length).toBe(3)
    for (const row of rows) {
      hasClasses(row, levelRowClasses('view-toolbar'))
      hasClasses(row, 'shrink-0 min-w-0 overflow-x-auto scrollbar-none')
      expect(classList(row).some((token) => token.startsWith('flex-wrap'))).toBe(false)
      expect(classList(row).filter((token) => token.includes(':'))).toEqual([])
    }
    expect(Array.from(toolbar.querySelectorAll('[class*="flex-wrap"]'))).toEqual([])

    // `scrollbar-none` hides the global 10px scrollbar inside the 28px rows
    // only, so no other element loses its scrollbar affordance.
    const scrollers = Array.from(container.querySelectorAll('.scrollbar-none'))
    expect(scrollers.length).toBe(3)
    for (const scroller of scrollers) expect(toolbar.contains(scroller)).toBe(true)
    const css = readFileSync('src/renderer/src/assets/main.css', 'utf8')
    const start = css.indexOf('@utility scrollbar-none')
    expect(start).toBeGreaterThan(-1)
    const nextUtility = css.indexOf('@utility', start + 1)
    const utility = css.slice(start, nextUtility === -1 ? css.length : nextUtility)
    expect(utility).toContain('scrollbar-width: none')
    expect(utility).toContain('&::-webkit-scrollbar')
    expect(utility).toContain('display: none')

    // At 960 the first row's filter, legend and actions stay reachable by name.
    expect(container.querySelectorAll('[data-shell-entry="filter"]').length).toBe(1)
    const filterGroup = screen.getByRole('tablist', { name: zh('directory.filter.group') })
    expect(within(filterGroup).getAllByRole('tab').length).toBeGreaterThan(1)
    const firstRowText = rows[0].textContent ?? ''
    expect(firstRowText).toContain(zh('common.diff.same'))
    expect(firstRowText).toContain(zh('common.diff.added'))
    for (const key of [
      'directory.toolbar.pickLeft',
      'directory.toolbar.pickRight',
      'directory.toolbar.loadSample'
    ] as const) {
      const buttons = screen.getAllByRole('button', { name: zh(key) })
      expect(buttons.length).toBe(1)
      expect(isRendered(buttons[0])).toBe(true)
    }

    // The third row is not folded into a menu either: its snapshot export and
    // the local-path switch are both still rendered.
    const exportEntry = entryElement(container, 'snapshot-export')
    expect(isRendered(exportEntry)).toBe(true)
    expect(rows[2].textContent ?? '').toContain(zh('directory.report.toolbar.hideLocalPaths'))
  })

  it('renders every entry once with the presentation the table declares', async () => {
    const { container } = render(<Workbench platform={createWebPlatformPort()} />)
    await loadSamples()

    const states: readonly { readonly view: ToolbarView; readonly show: () => void }[] = [
      { view: 'directory', show: () => undefined },
      {
        view: 'code-merge',
        show: () => {
          showSession(/3-Way Merge/)
        }
      },
      {
        view: 'code-diff',
        show: () => {
          const modeTabs = screen.getByRole('tablist', { name: zh('files.code.modeLabel') })
          fireEvent.click(within(modeTabs).getByRole('tab', { name: zh('files.code.mode.diff') }))
        }
      },
      {
        view: 'csv',
        show: () => {
          showSession(/CSV 主键对比/)
        }
      },
      {
        view: 'structured',
        show: () => {
          showSession(/JSON \/ YAML/)
        }
      }
    ]

    for (const state of states) {
      state.show()
      await waitFor(() =>
        expect(container.querySelectorAll('[data-shell-level="view-toolbar"]').length).toBe(1)
      )

      const ids = renderedEntries(container)
      expect(ids).toEqual(declaredEntries(state.view, false))

      const counts = new Map<string, number>()
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
      for (const count of counts.values()) expect(count).toBe(1)

      for (const id of ids) {
        const element = entryElement(container, id)
        expect(isRendered(element)).toBe(true)
        const mode = entryPresentation(id, tier)
        const copies = SHELL_ENTRIES[id].labelKeys.map((key) => zh(key))
        if (mode === 'icon-only') {
          // An icon-only entry keeps its copy as the accessible name.
          expect(element.tagName).toBe('BUTTON')
          expect(copies).toContain(element.getAttribute('aria-label') ?? '')
        } else {
          // A labelled entry always shows some copy and keeps every control named.
          expect((element.textContent ?? '').trim().length).toBeGreaterThan(0)
          for (const button of Array.from(element.querySelectorAll('button'))) {
            const name = (button.getAttribute('aria-label') ?? button.textContent ?? '').trim()
            expect(name.length).toBeGreaterThan(0)
          }
        }
      }
    }
  })

  it('keeps the drilldown back entry first on the view-toolbar level', async () => {
    const { container } = render(<Workbench platform={createWebPlatformPort()} />)
    await loadSamples()

    fireEvent.doubleClick(screen.getAllByText('engine.ts')[0])
    await waitFor(() => expect(screen.getByRole('button', { name: zh('shell.notice.returnAction') })).toBeDefined())

    const toolbar = levelElement(container, 'view-toolbar')
    const firstRow = toolbar.firstElementChild as HTMLElement
    hasClasses(firstRow, levelRowClasses('view-toolbar'))
    const back = within(firstRow).getByRole('button', {
      name: zh('shell.notice.returnAction')
    })
    expect(back.getAttribute('data-shell-entry')).toBe('drilldown-back')
    expect(back.getAttribute('title')).toBe(zh('shell.notice.returnTitle'))
    // The entry is the first one rendered inside the level.
    expect(renderedEntries(toolbar)[0]).toBe('drilldown-back')

    fireEvent.click(back)
    await waitFor(() => expect(container.querySelector('[data-shell-entry="drilldown-back"]')).toBeNull())
    expect(renderedLevels(container)).toEqual([
      'app',
      'sessions',
      'view-toolbar',
      'panels',
      'status'
    ])
  })

  it('keeps the csv drilldown back entry on the first row as well', async () => {
    const { container } = render(<Workbench platform={createWebPlatformPort()} />)
    await loadSamples()

    fireEvent.doubleClick(screen.getAllByText('report.csv')[0])
    await waitFor(() =>
      expect(container.querySelector('[data-shell-entry="drilldown-back"]')).not.toBeNull()
    )

    const toolbar = levelElement(container, 'view-toolbar')
    expect(toolbar.querySelectorAll('[data-shell-level="panels"]').length).toBe(0)
    expect(Array.from(toolbar.children).length).toBe(2)
    const firstRow = toolbar.firstElementChild as HTMLElement
    hasClasses(firstRow, levelRowClasses('view-toolbar'))
    expect(renderedEntries(toolbar)[0]).toBe('drilldown-back')
    expect(renderedLevels(container)).toEqual([
      'app',
      'sessions',
      'view-toolbar',
      'panels',
      'status'
    ])
  })

  it('keeps the status bar entries and their order', async () => {
    const { container } = render(<Workbench platform={createWebPlatformPort()} />)
    await loadSamples()

    const status = levelElement(container, 'status')
    const text = status.textContent ?? ''
    expect(text).toContain(zh('shell.status.session'))
    expect(text).toContain('web')
    expect(text).toContain(zh('common.diff.same'))
    expect(text.indexOf(zh('shell.status.session'))).toBeLessThan(
      text.indexOf(zh('shell.status.platform'))
    )
    expect(text.indexOf(zh('shell.status.platform'))).toBeLessThan(
      text.indexOf(zh('common.diff.same'))
    )
    // Every number in the status bar stays tabular.
    for (const value of Array.from(status.querySelectorAll('.tabular'))) {
      expect(isRendered(value)).toBe(true)
    }
  })
})

describe('workbench shell entry manifest', () => {
  it('covers all twenty entries across the ready views, none of them twice', async () => {
    setWindowWidth(TIER_WIDTHS.compact)
    const { container } = render(<Workbench platform={createWebPlatformPort()} />)
    await loadSamples()

    const seen = new Set<ShellEntryId>()
    const collect = (): void => {
      // One entry can belong to several ready views (the app head), so this
      // only unions; the per-view uniqueness is asserted above.
      for (const id of renderedEntries(container)) seen.add(id)
    }

    collect()
    showSession(/3-Way Merge/)
    await waitFor(() => expect(renderedEntries(container)).toContain('merge-accept'))
    collect()
    const modeTabs = screen.getByRole('tablist', { name: zh('files.code.modeLabel') })
    fireEvent.click(within(modeTabs).getByRole('tab', { name: zh('files.code.mode.diff') }))
    await waitFor(() => expect(renderedEntries(container)).toContain('override'))
    collect()
    showSession(/CSV 主键对比/)
    await waitFor(() => expect(screen.getByRole('toolbar', { name: zh('files.csv.tools') })).toBeDefined())
    collect()
    showSession(/JSON \/ YAML/)
    await waitFor(() =>
      expect(screen.getByRole('tablist', { name: zh('files.structured.filterLabel') })).toBeDefined()
    )
    collect()
    showSession(/baseline ↔ candidate/)
    fireEvent.doubleClick(screen.getAllByText('engine.ts')[0])
    await waitFor(() => expect(renderedEntries(container)).toContain('drilldown-back'))
    collect()

    expect([...seen].sort()).toEqual([...SHELL_ENTRY_IDS].sort())
  })
})

describe('workbench icon surface', () => {
  it('draws every icon at 16, 20 or 24 with the matching optical stroke', async () => {
    setWindowWidth(TIER_WIDTHS.compact)
    const { container } = render(<Workbench platform={createWebPlatformPort()} />)
    await loadSamples()

    const check = (): void => {
      const icons = Array.from(container.querySelectorAll('svg[data-icon]'))
      expect(icons.length).toBeGreaterThan(0)
      for (const icon of icons) {
        const size = Number(icon.getAttribute('width'))
        expect(ICON_SIZES).toContain(size)
        expect(icon.getAttribute('height')).toBe(String(size))
        expect(Number(icon.getAttribute('stroke-width'))).toBe(strokeWidthFor(size as IconSize))
        expect(ICON_NAMES).toContain(icon.getAttribute('data-icon'))
        // The size is an attribute of the component, never a utility class.
        expect(classList(icon).filter((token) => token.startsWith('size-'))).toEqual([])
      }
    }

    check()
    showSession(/3-Way Merge/)
    await waitFor(() => expect(renderedEntries(container)).toContain('merge-accept'))
    check()
    const modeTabs = screen.getByRole('tablist', { name: zh('files.code.modeLabel') })
    fireEvent.click(within(modeTabs).getByRole('tab', { name: zh('files.code.mode.diff') }))
    await waitFor(() => expect(renderedEntries(container)).toContain('override'))
    check()
    showSession(/CSV 主键对比/)
    await waitFor(() =>
      expect(screen.getByRole('toolbar', { name: zh('files.csv.tools') })).toBeDefined()
    )
    check()
    showSession(/JSON \/ YAML/)
    await waitFor(() =>
      expect(screen.getByRole('tablist', { name: zh('files.structured.filterLabel') })).toBeDefined()
    )
    check()
  })

  it('leaves no icon-only button without an accessible name', async () => {
    setWindowWidth(TIER_WIDTHS.compact)
    const { container } = render(<Workbench platform={createWebPlatformPort()} />)
    await loadSamples()

    const unnamed = Array.from(container.querySelectorAll('button'))
      .filter(isRendered)
      .filter((button) => button.querySelector('svg[data-icon]') !== null)
      .filter((button) => (button.textContent ?? '').trim().length === 0)
      .filter((button) => (button.getAttribute('aria-label') ?? '').trim().length === 0)
      .map((button) => button.outerHTML)

    expect(unnamed).toEqual([])
  })
})
