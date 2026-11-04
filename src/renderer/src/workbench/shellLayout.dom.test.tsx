// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
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
  TOOLBAR_ROWS,
  entriesFor,
  entryPresentation,
  levelBandClasses,
  levelHeaderClasses,
  levelRowClasses,
  measureStatusBar,
  statusBarClasses
} from './shellLayout'
import type { ShellEntryId, ShellLevel, ToolbarView, WidthTier } from './shellLayout'
import { installJsdomViewport } from '../../../test/jsdomViewport'

const zh = translate('zh')
const TIERS: readonly WidthTier[] = ['compact', 'regular', 'wide']
const READY_LEVELS = ['app', 'sessions', 'view-toolbar', 'panels', 'status'] as const

installJsdomViewport()

const originalInnerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth')

afterAll(() => {
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

/** Mounts the shell with the default web platform. */
function renderShell(): ReturnType<typeof render> {
  return render(<Workbench platform={createWebPlatformPort()} />)
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

const ENTRY_IDS = new Set<string>(SHELL_ENTRY_IDS)

function renderedEntries(container: HTMLElement): readonly ShellEntryId[] {
  // `more` triggers are toolbar hooks, not manifest entries: the manifest
  // test reaches the overflow entries through the opened menu instead.
  return Array.from(container.querySelectorAll('[data-shell-entry]'))
    .map((element) => element.getAttribute('data-shell-entry') ?? '')
    .filter((id): id is ShellEntryId => ENTRY_IDS.has(id))
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

/** Opens one settings sample entry by its stable marker. */
function startSample(id: string): void {
  fireEvent.click(screen.getByRole('button', { name: zh('shell.settings.open') }))
  const panel = screen.getByRole('dialog', { name: zh('settings.title') })
  const entry = panel.querySelector(`[data-sample-entry="${id}"]`)
  if (!(entry instanceof HTMLElement)) throw new Error(`missing sample entry: ${id}`)
  fireEvent.click(entry)
}

/** Starts the built-in scenes through the settings and waits for the ready shell. */
async function loadSamples(): Promise<void> {
  for (const id of ['directory', 'code', 'csv', 'structured']) startSample(id)
  const list = await screen.findByRole('tablist', { name: zh('common.sessions') }, {
    timeout: 4000
  })
  await waitFor(() => expect(within(list).getAllByRole('tab')).toHaveLength(4), { timeout: 4000 })
  fireEvent.click(within(list).getByRole('tab', { name: /baseline ↔ candidate/ }))
}

/** Switches the visible session through the tabs the shell renders. */
function showSession(name: RegExp): void {
  const tabs = screen.getByRole('tablist', { name: zh('common.sessions') })
  fireEvent.click(within(tabs).getByRole('tab', { name }))
}

/** Inline entries the level table declares for one ready view. */
function inlineEntries(view: ToolbarView): readonly ShellEntryId[] {
  return TOOLBAR_ROWS.filter(
    (row) => row.level === 'view-toolbar' && row.views.includes(view)
  ).flatMap((row) => row.entries)
}

/** What the level table declares inline for one ready view, minus absent extras. */
function declaredEntries(view: ToolbarView, drilled: boolean): readonly ShellEntryId[] {
  return [
    ...entriesFor('app'),
    ...entriesFor('sessions'),
    ...inlineEntries(view).filter((id) => drilled || id !== 'drilldown-back')
  ]
}

describe.each(TIERS)('workbench shell at the %s tier', (tier) => {
  const width = TIER_WIDTHS[tier]

  beforeEach(() => {
    setWindowWidth(width)
  })

  it('renders the five shell levels in order, once each', async () => {
    const { container } = renderShell()
    await loadSamples()

    expect(renderedLevels(container)).toEqual(READY_LEVELS)
  })

  it('shows the event band only between the session head and the view toolbar', async () => {
    const { container } = render(
      <Workbench platform={createWebPlatformPort()} showDebugSamples />
    )
    await loadSamples()
    expect(container.querySelector('[data-shell-level="events"]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: zh('shell.settings.open') }))
    const failure = screen
      .getByRole('dialog', { name: zh('settings.title') })
      .querySelector('[data-sample-failure]')
    if (!(failure instanceof HTMLElement)) throw new Error('missing debugging sample entry')
    fireEvent.click(failure)
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
    const { container } = renderShell()
    await loadSamples()

    for (const level of ['app', 'sessions'] as const) {
      const element = levelElement(container, level)
      hasClasses(element, levelRowClasses(level))
      hasClasses(element, levelBandClasses(level))
    }

    // The status layer height comes from the row-count helper, not the table.
    const status = levelElement(container, 'status')
    hasClasses(status, statusBarClasses(measureStatusBar(window.innerWidth).rows))
    hasClasses(status, levelBandClasses('status'))

    const toolbar = levelElement(container, 'view-toolbar')
    hasClasses(toolbar, levelBandClasses('view-toolbar'))
    const rows = Array.from(toolbar.children)
    expect(rows.length).toBe(1)
    for (const row of rows) hasClasses(row, levelRowClasses('view-toolbar'))

    const panels = levelElement(container, 'panels')
    hasClasses(panels, levelBandClasses('panels'))
    const headers = Array.from(panels.querySelectorAll('header'))
    expect(headers.length).toBe(2)
    for (const header of headers) {
      hasClasses(header, levelHeaderClasses('panels'))
    }

    // Every toolbar control keeps the control height of its own level. Tabs are
    // out of scope: their 30px height is owned by the tab contract.
    for (const level of ['app', 'view-toolbar'] as const) {
      const buttons = Array.from(
        levelElement(container, level).querySelectorAll('button:not([role="tab"])')
      )
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
    const { container } = renderShell()
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

  it('keeps a narrow directory toolbar on one row with no scroll channel', async () => {
    setWindowWidth(960)
    const { container } = renderShell()
    await loadSamples()

    // Exactly one view-toolbar band owns the single row.
    const bands = container.querySelectorAll('[data-shell-level="view-toolbar"]')
    expect(bands.length).toBe(1)
    const toolbar = bands[0] as HTMLElement
    hasClasses(toolbar, levelBandClasses('view-toolbar'))
    expect(classList(toolbar)).not.toContain('overflow-x-auto')
    expect(classList(toolbar).filter((token) => token.includes(':'))).toEqual([])

    const rows = Array.from(toolbar.children)
    expect(rows.length).toBe(1)
    const [row] = rows
    hasClasses(row, levelRowClasses('view-toolbar'))
    // jsdom cannot measure scrollWidth, so the contract is asserted on tokens:
    // the row is a plain flex row, never a horizontal scroller or wrapper.
    expect(classList(row)).not.toContain('overflow-x-auto')
    expect(classList(row)).not.toContain('scrollbar-none')
    expect(classList(row).some((token) => token.startsWith('flex-wrap'))).toBe(false)
    expect(classList(row).filter((token) => token.includes(':'))).toEqual([])
    expect(Array.from(toolbar.querySelectorAll('[class*="flex-wrap"]'))).toEqual([])

    // Directory row shape: filter segmented → one solid primary action → more.
    const filterGroup = screen.getByRole('tablist', { name: zh('directory.filter.group') })
    expect(within(filterGroup).getAllByRole('tab').length).toBeGreaterThan(1)
    const firstRowText = row.textContent ?? ''
    expect(firstRowText).toContain(zh('directory.filter.same'))
    expect(firstRowText).toContain(zh('directory.filter.rightOnly'))

    const primary = Array.from(row.querySelectorAll('button')).filter((button) =>
      classList(button).includes('bg-accent')
    )
    expect(primary.length).toBe(1)
    expect(primary[0].getAttribute('data-shell-entry')).toBe('sync')

    // Secondary directory actions stay reachable through the "more" menu.
    fireEvent.click(screen.getByRole('button', { name: zh('shell.toolbar.more') }))
    const menu = screen.getByRole('menu', { name: zh('shell.toolbar.more') })
    const menuText = menu.textContent ?? ''
    for (const key of [
      'directory.toolbar.pickLeft',
      'directory.toolbar.pickRight',
      'directory.toolbar.template',
      'directory.toolbar.exportLeft',
      'directory.toolbar.importLeft',
      'directory.report.toolbar.export',
      'directory.report.toolbar.hideLocalPaths'
    ] as const) {
      expect(menuText).toContain(zh(key))
    }
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()

    // The entries the table keeps inline are the only ones hooked as entries.
    expect(container.querySelectorAll('[data-shell-entry="filter"]').length).toBe(1)
    expect(container.querySelectorAll('[data-shell-entry="sync"]').length).toBe(1)
    expect(container.querySelector('[data-shell-entry="template"]')).toBeNull()
    expect(container.querySelector('[data-shell-entry="snapshot-export"]')).toBeNull()
  })

  it('renders every entry once with the presentation the table declares', async () => {
    const { container } = renderShell()
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
          // An icon-only entry keeps its copy as the accessible name: either on
          // the entry button itself or on the grouped icon actions inside it.
          if (element.tagName === 'BUTTON') {
            expect(copies).toContain(element.getAttribute('aria-label') ?? '')
          } else {
            const names = Array.from(element.querySelectorAll('button')).map(
              (button) => button.getAttribute('aria-label') ?? ''
            )
            expect(names.length).toBeGreaterThan(0)
            for (const name of names) expect(name.trim().length).toBeGreaterThan(0)
            expect(names.some((name) => copies.includes(name))).toBe(true)
          }
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
    const { container } = renderShell()
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
    expect(renderedLevels(container)).toEqual(READY_LEVELS)
  })

  it('keeps the csv drilldown back entry on the first row as well', async () => {
    const { container } = renderShell()
    await loadSamples()

    fireEvent.doubleClick(screen.getAllByText('report.csv')[0])
    await waitFor(() =>
      expect(container.querySelector('[data-shell-entry="drilldown-back"]')).not.toBeNull()
    )

    const bands = container.querySelectorAll('[data-shell-level="view-toolbar"]')
    expect(bands.length).toBe(1)
    const toolbar = bands[0] as HTMLElement
    expect(toolbar.querySelectorAll('[data-shell-level="panels"]').length).toBe(0)
    const firstRow = toolbar.firstElementChild as HTMLElement
    hasClasses(firstRow, levelRowClasses('view-toolbar'))
    expect(
      within(firstRow).getByRole('button', { name: zh('shell.notice.returnAction') })
    ).toBeDefined()
    expect(renderedEntries(toolbar)[0]).toBe('drilldown-back')
    expect(renderedLevels(container)).toEqual(READY_LEVELS)
  })

  it('shows only the scene statistics, without session / platform / legend', async () => {
    const { container } = renderShell()
    await loadSamples()

    const status = levelElement(container, 'status')
    const { rows } = measureStatusBar(window.innerWidth)
    hasClasses(status, statusBarClasses(rows))
    hasClasses(status, levelBandClasses('status'))
    const text = status.textContent ?? ''
    // The removed i18n keys must never resurface in the status bar.
    expect(text).not.toContain('会话')
    expect(text).not.toContain('运行平台')
    expect(status.querySelector('[data-shell-legend]')).toBeNull()
    expect(status.querySelectorAll('[data-legend-status]')).toHaveLength(0)
    // The scene metrics stay visible after dropping the old copy.
    expect(text).toContain(zh('shell.stat.sourceFiles'))
    expect(text).toContain(zh('shell.stat.targetFiles'))
    expect(text).toContain(zh('shell.stat.differences'))
    // Every number in the status bar stays tabular.
    for (const value of Array.from(status.querySelectorAll('.tabular'))) {
      expect(isRendered(value)).toBe(true)
    }
  })
})

/** One labelled status-bar entry, located by its leading label. */
function statusEntry(container: HTMLElement, label: string): HTMLElement {
  const footer = levelElement(container, 'status')
  const entry = Array.from(footer.querySelectorAll<HTMLElement>('span')).find(
    (span) => span.firstElementChild?.textContent === label
  )
  if (entry === undefined) throw new Error(`missing status entry: ${label}`)
  return entry
}

describe.each([960, 1024, 1280, 1440, 1920])('status bar at %ipx', (width) => {
  beforeEach(() => {
    setWindowWidth(width)
  })

  it('keeps one row of scene metrics and statistics without a legend', async () => {
    const { container } = renderShell()
    await loadSamples()

    const status = levelElement(container, 'status')
    const { rows } = measureStatusBar(width)
    expect(rows).toBe(1)
    hasClasses(status, statusBarClasses(rows))
    hasClasses(status, levelBandClasses('status'))
    expect(classList(status)).toContain('h-6')
    expect(classList(status)).not.toContain('h-auto')
    expect(classList(status).some((token) => token.startsWith('overflow-x'))).toBe(false)
    // The removed four-state legend and the removed platform copy are gone.
    expect(status.querySelector('[data-shell-legend]')).toBeNull()
    expect(status.querySelectorAll('[data-legend-status]')).toHaveLength(0)
    expect(status.textContent ?? '').not.toContain('运行平台')

    // Source / Target statistics stay visible with their values.
    for (const key of ['shell.stat.sourceFiles', 'shell.stat.targetFiles'] as const) {
      const entry = statusEntry(container, zh(key))
      expect(status.contains(entry)).toBe(true)
      expect(isRendered(entry)).toBe(true)
      const value = entry.querySelector('.tabular')
      expect(value?.textContent).toMatch(/^\d+$/)
      expect(isRendered(value as Element)).toBe(true)
    }
  })
})

describe('status bar merge metrics', () => {
  beforeEach(() => {
    setWindowWidth(TIER_WIDTHS.compact)
  })

  it('reports the conflict count without a conflict legend', async () => {
    const { container } = renderShell()
    await loadSamples()

    expect(
      levelElement(container, 'status').querySelectorAll('[data-legend-status]')
    ).toHaveLength(0)
    showSession(/3-Way Merge/)
    await waitFor(() => expect(statusEntry(container, zh('shell.stat.conflicts'))).toBeDefined())
    const status = levelElement(container, 'status')
    expect(status.querySelector('[data-shell-legend]')).toBeNull()
    expect(status.querySelectorAll('[data-legend-status]')).toHaveLength(0)
    const conflicts = statusEntry(container, zh('shell.stat.conflicts'))
    expect(isRendered(conflicts)).toBe(true)
    expect(conflicts.querySelector('.tabular')?.textContent).toMatch(/^\d+$/)
  })
})

describe('status bar probe facts', () => {
  beforeEach(() => {
    setWindowWidth(TIER_WIDTHS.regular)
  })

  it('shows only the deduped newline / encoding facts of the active diff', async () => {
    const { container } = renderShell()
    await loadSamples()

    showSession(/3-Way Merge/)
    const modeTabs = screen.getByRole('tablist', { name: zh('files.code.modeLabel') })
    fireEvent.click(within(modeTabs).getByRole('tab', { name: zh('files.code.mode.diff') }))
    await waitFor(() => expect(renderedEntries(container)).toContain('override'))

    const status = levelElement(container, 'status')
    const text = status.textContent ?? ''
    const newlineLabels = [
      zh('shell.status.newline'),
      zh('shell.status.leftNewline'),
      zh('shell.status.rightNewline')
    ]
    const encodingLabels = [
      zh('shell.status.encoding'),
      zh('shell.status.leftEncoding'),
      zh('shell.status.rightEncoding')
    ]
    for (const labels of [newlineLabels, encodingLabels]) {
      const shown = labels.filter((label) => text.includes(label))
      expect(shown.length).toBeGreaterThan(0)
      // Equal sides collapse to the single fact; a real difference expands to
      // exactly the left / right pair, never both shapes at once.
      if (shown.includes(labels[0])) expect(shown).toEqual([labels[0]])
      else expect(new Set(shown).size).toBe(shown.length)
    }
    expect(text).not.toContain('会话')
    expect(text).not.toContain('运行平台')
  })
})

describe('workbench shell entry manifest', () => {
  it('covers all eighteen entries across the ready views, none of them twice', async () => {
    setWindowWidth(TIER_WIDTHS.compact)
    const { container } = renderShell()
    await loadSamples()

    const seen = new Set<ShellEntryId>()
    const collect = (): void => {
      // One entry can belong to several ready views (the app head), so this
      // only unions; the per-view uniqueness is asserted above.
      for (const id of renderedEntries(container)) seen.add(id)
    }

    // The overflow entries are not inline hooks: they live inside the "more"
    // menu, so the menu has to be opened before they can be accounted for.
    fireEvent.click(screen.getByRole('button', { name: zh('shell.toolbar.more') }))
    const menu = screen.getByRole('menu', { name: zh('shell.toolbar.more') })
    const menuItems = within(menu)
      .getAllByRole('menuitem')
      .map((item) => item.textContent ?? '')
    const overflowEntries = ['template', 'snapshot-export', 'snapshot-import', 'report-export'] as const
    for (const id of overflowEntries) {
      expect(menuItems.some((text) => text.includes(zh(SHELL_ENTRIES[id].labelKey)))).toBe(true)
      seen.add(id)
    }
    // Escape closes the menu without selecting anything.
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()

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
    expect(seen.size).toBe(18)
    expect(renderedEntries(container)).not.toContain('samples')
    expect(renderedEntries(container)).not.toContain('samples-menu')
  })
})

describe('workbench icon surface', () => {
  it('draws every icon at 16, 20 or 24 with the matching optical stroke', async () => {
    setWindowWidth(TIER_WIDTHS.compact)
    const { container } = renderShell()
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
    const { container } = renderShell()
    await loadSamples()

    const unnamed = Array.from(container.querySelectorAll('button'))
      .filter(isRendered)
      .filter((button) => button.querySelector('svg[data-icon]') !== null)
      .filter((button) => (button.textContent ?? '').trim().length === 0)
      .filter((button) => (button.getAttribute('aria-label') ?? '').trim().length === 0)
      .map((button) => button.outerHTML)

    expect(unnamed).toEqual([])

    const glyphOnly = Array.from(container.querySelectorAll('button'))
      .filter(isRendered)
      .filter((button) => {
        const text = (button.textContent ?? '').trim()
        return [...text].length === 1 && !/[\p{L}\p{N}]/u.test(text)
      })
      .filter((button) => button.querySelector('svg[data-icon]') === null)
      .filter((button) => (button.getAttribute('aria-label') ?? '').trim().length === 0)
      .map((button) => button.outerHTML)

    expect(glyphOnly).toEqual([])
  })
})
