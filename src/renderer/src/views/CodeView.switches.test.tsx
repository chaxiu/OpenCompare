// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sha256Hex } from '@core/directory/hash'
import { diffLineTexts } from '@core/text/diff'
import type { ComparisonOptions } from '@core/text/normalize'
import type { TextFileFacts } from '@shared/platform/types'
import { renderWithI18n } from '@renderer/i18n/testing'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { CodeView } from './CodeView'
import { CODE_SWAP_SHORTCUT } from './codeViewShortcut'
import { moreItem as menuItem, moreTrigger, openMore } from '../../../test/shellMenu'
import type { PickedTextFile } from '@renderer/workbench/fileIO'
import type { FilePair, FilePairProbes } from '@renderer/workbench/session'

const platform = createWebPlatformPort()
const ALL_ON: ComparisonOptions = { ignoreNewline: true, ignoreEncoding: true }
const COMBOS: readonly ComparisonOptions[] = [
  ALL_ON,
  { ignoreNewline: false, ignoreEncoding: true },
  { ignoreNewline: true, ignoreEncoding: false },
  { ignoreNewline: false, ignoreEncoding: false }
]
/** Probe facts of one side, with an explicit sha so same text can differ in bytes. */
function facts(
  path: string,
  text: string,
  encoding: TextFileFacts['encoding'],
  sha = sha256Hex(text)
): TextFileFacts {
  return { path, encoding, newline: 'LF', bytes: text.length, sha256: sha }
}
function renderDiff(
  left: string,
  right: string,
  probes?: FilePairProbes,
  readSide?: (path: string) => Promise<PickedTextFile>,
  onPairChange?: (pair: FilePair, probes: FilePairProbes) => void
): ReturnType<typeof renderWithI18n> {
  const pair: FilePair = {
    left: { path: '/l.ts', text: left },
    right: { path: '/r.ts', text: right }
  }
  return renderWithI18n(
    <CodeView
      pair={pair}
      probes={probes}
      platform={platform}
      readSide={readSide}
      onPairChange={onPairChange}
    />
  )
}
const SWITCH_LABELS: Record<string, string> = {
  'ignore-newline': '忽略换行',
  'ignore-encoding': '忽略编码',
  'ignore-whitespace': '忽略空白差异'
}
const ACTION_LABELS: Record<'reload' | 'swap', string> = {
  reload: '重新加载',
  swap: '交换左右'
}

/** One comparison switch, now a menu item; the leading [x] is the checked state. */
function switchOf(id: string): HTMLElement {
  return menuItem(SWITCH_LABELS[id])
}
function checked(id: string): string {
  const state = (switchOf(id).textContent ?? '').trimStart().startsWith('[x]') ? 'true' : 'false'
  // Reading a value never leaves the menu hanging over the next interaction.
  if (moreTrigger().getAttribute('aria-expanded') === 'true') {
    fireEvent.keyDown(document, { key: 'Escape' })
  }
  return state
}
function countText(): string {
  return document.querySelector('[data-code-diff-count]')?.textContent ?? ''
}
function bytesSignal(): Element | null {
  return document.querySelector('[data-code-diff-bytes]')
}

/** Rendered rows carrying a diff tone (a `same` row has none). */
function nonSameRows(): number {
  return document.querySelectorAll('[data-diff-row] [class*="bg-diff-"]').length
}

/** The block-navigation readout, e.g. `1/2` or `0/0`. */
function blockCounter(): string {
  const spans = Array.from(
    document.querySelector('[data-shell-level="view-toolbar"]')?.querySelectorAll('span') ?? []
  )
  return spans.find((span) => /^\d+\/\d+$/.test(span.textContent ?? ''))?.textContent ?? ''
}

function expectedCounter(options: ComparisonOptions, left: string, right: string): string {
  const blocks = diffLineTexts(left, right, options).blocks.length
  return blocks === 0 ? '0/0' : `1/${blocks}`
}

/** Reaches one switch combination from the default-on state, one click each. */
function reach(options: ComparisonOptions): void {
  if (!options.ignoreNewline) fireEvent.click(switchOf('ignore-newline'))
  if (!options.ignoreEncoding) fireEvent.click(switchOf('ignore-encoding'))
}

const WS_ON: ComparisonOptions = { ignoreNewline: true, ignoreEncoding: true, ignoreWhitespace: true }

/** The two diff scroll panes, left then right (same query as the ruler tests). */
function paneElements(container: HTMLElement): [HTMLDivElement, HTMLDivElement] {
  const panes = Array.from(container.querySelectorAll<HTMLDivElement>('div.h-full.overflow-auto'))
  if (panes.length !== 2) throw new Error(`expected 2 diff panes, found ${panes.length}`)
  return [panes[0], panes[1]]
}
function paneText(container: HTMLElement, side: 0 | 1): string {
  return paneElements(container)[side].textContent ?? ''
}
function markerCount(container: HTMLElement): number {
  return container.querySelectorAll('[data-diff-ruler="true"] [data-diff-status]').length
}
/** Panel address-bar paths in DOM order (left, right). */
function panelTitles(): string[] {
  const addresses = document.querySelectorAll<HTMLElement>(
    '[data-shell-level="panels"] [data-panel-address]'
  )
  return Array.from(addresses).map((element) => element.getAttribute('title') ?? '')
}
function action(name: 'reload' | 'swap'): HTMLElement {
  return menuItem(ACTION_LABELS[name])
}
/** The directly visible swap entry in the code diff toolbar. */
function toolbarSwap(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    '[data-shell-level="view-toolbar"] [data-code-action="swap"]'
  )
}

type DiffStateName = 'same' | 'removed' | 'added' | 'modified'
interface RowSnapshot {
  /** Gutter line number, empty on a filler row. */
  readonly gutter: string
  readonly text: string
}

/** Per-row gutter + content of one pane, in rendered order. */
function rowSnapshots(container: HTMLElement, side: 0 | 1): RowSnapshot[] {
  return Array.from(paneElements(container)[side].querySelectorAll<HTMLElement>('[data-diff-row]')).map(
    (row) => ({
      gutter: row.children[0]?.textContent ?? '',
      text: row.children[1]?.textContent ?? ''
    })
  )
}

/**
 * Four-state counts normalised by state name: rows pair up by `data-diff-row`
 * index across the panes, and the state follows gutter presence + text equality
 * rather than DOM column order.
 */
function stateCounts(container: HTMLElement): Record<DiffStateName, number> {
  const left = rowSnapshots(container, 0)
  const right = rowSnapshots(container, 1)
  expect(left.length).toBe(right.length)
  const counts: Record<DiffStateName, number> = { same: 0, removed: 0, added: 0, modified: 0 }
  for (let index = 0; index < left.length; index += 1) {
    const hasLeft = left[index].gutter !== ''
    const hasRight = right[index].gutter !== ''
    if (hasLeft && hasRight) {
      counts[left[index].text === right[index].text ? 'same' : 'modified'] += 1
    } else if (hasLeft) {
      counts.removed += 1
    } else if (hasRight) {
      counts.added += 1
    }
  }
  return counts
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('code diff comparison switches', () => {
  it('starts both switches on inside the single view-toolbar band', () => {
    renderDiff('alpha\nbeta\n', 'alpha\nbeta\ngamma\n')

    for (const id of ['ignore-newline', 'ignore-encoding']) {
      const element = switchOf(id)
      expect(element.tagName).toBe('BUTTON')
      expect(element.getAttribute('role')).toBe('menuitem')
      expect(element.textContent?.trimStart().startsWith('[x]')).toBe(true)
      expect(element.hasAttribute('data-shell-entry')).toBe(false)
    }
    expect(document.querySelectorAll('[data-shell-level="view-toolbar"]')).toHaveLength(1)
    const toolbar = document.querySelector('[data-shell-level="view-toolbar"]')
    expect(toolbar?.contains(switchOf('ignore-newline'))).toBe(true)
    expect(toolbar?.contains(switchOf('ignore-encoding'))).toBe(true)

    // Same input as an explicit both-on comparison: one source of the numbers.
    const expected = diffLineTexts('alpha\nbeta\n', 'alpha\nbeta\ngamma\n', ALL_ON)
    expect(countText()).toBe(String(expected.differenceCount))
    expect(blockCounter()).toBe(expectedCounter(ALL_ON, 'alpha\nbeta\n', 'alpha\nbeta\ngamma\n'))

    // No probe facts: strict encoding stays text-only and never invents a signal.
    fireEvent.click(switchOf('ignore-encoding'))
    expect(bytesSignal()).toBeNull()
  })

  it('turns newline-only differences on and off without touching real content', () => {
    renderDiff('alpha\r\nbeta\r\n', 'alpha\nbeta\n')
    expect(countText()).toBe('0')
    expect(nonSameRows()).toBe(0)

    fireEvent.click(switchOf('ignore-newline'))
    expect(checked('ignore-newline')).toBe('false')
    expect(Number(countText())).toBeGreaterThan(0)
    expect(nonSameRows()).toBeGreaterThan(0)

    fireEvent.click(switchOf('ignore-newline'))
    expect(checked('ignore-newline')).toBe('true')
    expect(countText()).toBe('0')
  })

  it('shows the byte-difference signal only while encoding differences are strict', () => {
    const text = 'alpha\n'
    const probes: FilePairProbes = {
      left: facts('/l.ts', text, 'UTF-8', sha256Hex('utf8-bytes')),
      right: facts('/r.ts', text, 'UTF-16LE', sha256Hex('utf16-bytes'))
    }
    renderDiff(text, text, probes)
    expect(countText()).toBe('0')
    expect(bytesSignal()).toBeNull()

    fireEvent.click(switchOf('ignore-encoding'))
    expect(bytesSignal()).not.toBeNull()
    expect(countText()).toBe('1')
    expect(nonSameRows()).toBe(0)

    fireEvent.click(switchOf('ignore-encoding'))
    expect(bytesSignal()).toBeNull()
    expect(countText()).toBe('0')
  })

  it('reads the count and block denominator from one result in all four combinations', () => {
    const left = 'alpha\n  tail \nbeta\n'
    const right = 'alpha\n  tail\nbeta\nGamma\n'

    for (const combo of COMBOS) {
      renderDiff(left, right)
      reach(combo)
      expect(checked('ignore-newline')).toBe(String(combo.ignoreNewline))
      expect(checked('ignore-encoding')).toBe(String(combo.ignoreEncoding))
      expect(countText()).toBe(String(diffLineTexts(left, right, combo).differenceCount))
      expect(blockCounter()).toBe(expectedCounter(combo, left, right))
      cleanup()
    }
  })

  it('keeps character, whitespace, case and line-order differences visible in every combination', () => {
    const cases: readonly (readonly [string, string])[] = [
      ['alpha\n', 'alphx\n'],
      ['alpha\n', 'alpha \n'],
      ['alpha\n', 'ALPHA\n'],
      ['alpha\nbeta\n', 'beta\nalpha\n']
    ]

    for (const [left, right] of cases) {
      for (const combo of COMBOS) {
        const view = renderDiff(left, right)
        reach(combo)
        const expected = diffLineTexts(left, right, combo)
        expect(expected.differenceCount).toBeGreaterThan(0)
        expect(countText()).toBe(String(expected.differenceCount))
        expect(nonSameRows()).toBeGreaterThan(0)
        if (left !== 'alpha\nbeta\n') {
          // Word-level marks are a soft wash plus a 1px underline, never a solid block.
          const inline = document.querySelector('[class*="bg-diff-modified/12"]')
          expect(inline).not.toBeNull()
          expect(inline?.className).toContain('underline')
        }
        view.unmount()
      }
    }
  })

  it('toggles once per menu click and closes the menu on Escape', () => {
    renderDiff('alpha\n', 'beta\n')
    expect(checked('ignore-newline')).toBe('true')

    // Escape closes the menu without changing any switch.
    fireEvent.click(moreTrigger())
    expect(screen.queryByRole('menu')).not.toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(checked('ignore-newline')).toBe('true')

    fireEvent.click(switchOf('ignore-newline'))
    expect(checked('ignore-newline')).toBe('false')
    fireEvent.click(switchOf('ignore-newline'))
    expect(checked('ignore-newline')).toBe('true')
  })

  it('drops the fixed byte facts once a working copy is edited', () => {
    const left = 'alpha\nbeta\n'
    const right = 'gamma\n'
    const probes: FilePairProbes = {
      left: facts('/l.ts', left, 'UTF-8', sha256Hex('left-bytes')),
      right: facts('/r.ts', right, 'UTF-16LE', sha256Hex('right-bytes'))
    }
    renderDiff(left, right, probes)
    fireEvent.click(switchOf('ignore-encoding'))
    expect(countText()).toBe('1')
    expect(bytesSignal()).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '覆写到右' }))
    expect(countText()).toBe('0')
    expect(bytesSignal()).toBeNull()
    expect(nonSameRows()).toBe(0)
  })
})

describe('code pair actions and whitespace switch', () => {
  const WS = ['alpha \na\tb\na  b\n', 'alpha\na b\na b\n'] as const
  const MIXED = ['alphx\nbeta \n', 'alpha\nbeta\n'] as const
  const refetch = async (path: string): Promise<PickedTextFile> => {
    const text = path === '/l.ts' ? 'zeta\ndelta\n' : 'zeta\nomega\n'
    return { path, text, facts: facts(path, text, 'UTF-8') }
  }

  it('defaults ignore-whitespace off and erases whitespace-only differences on', () => {
    const view = renderDiff(...WS)
    expect([switchOf('ignore-whitespace').getAttribute('role'), checked('ignore-whitespace')]).toEqual(['menuitem', 'false'])
    expect(Number(countText())).toBeGreaterThan(0)
    expect(nonSameRows()).toBeGreaterThan(0)
    fireEvent.click(switchOf('ignore-whitespace'))
    expect([checked('ignore-whitespace'), countText(), nonSameRows(), markerCount(view.container)]).toEqual(['true', '0', 0, 0])
    // Comparison ignores the whitespace; the panes still show every raw character.
    expect(paneText(view.container, 0)).toContain('alpha ')
    expect(paneText(view.container, 0)).toContain('\t')
    fireEvent.click(switchOf('ignore-whitespace'))
    expect([checked('ignore-whitespace'), Number(countText()) > 0]).toEqual(['false', true])
  })

  it('keeps real differences and derives count, tones and markers from one comparison', () => {
    const pairs: readonly (readonly [string, string])[] = [WS, MIXED]
    for (const pair of pairs) {
      const view = renderDiff(...pair)
      fireEvent.click(switchOf('ignore-whitespace'))
      const { differenceCount } = diffLineTexts(pair[0], pair[1], WS_ON)
      if (pair === MIXED) expect(differenceCount).toBeGreaterThan(0)
      expect(countText()).toBe(String(differenceCount))
      expect(nonSameRows() > 0).toBe(differenceCount > 0)
      expect(markerCount(view.container) > 0).toBe(differenceCount > 0)
      view.unmount()
    }
  })

  it('reloads in place and keeps session, scroll, switches; reads only', async () => {
    const write = vi.spyOn(platform, 'writeTextFile')
    const onPairChange = vi.fn()
    const view = renderDiff('alpha\nbeta\n', 'alpha\ngamma\n', undefined, refetch, onPairChange)
    fireEvent.click(switchOf('ignore-whitespace'))
    const panes = paneElements(view.container)
    panes[0].scrollTop = 100
    panes[1].scrollTop = 100
    fireEvent.click(action('reload'))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('已重新加载当前文件对'))
    expect(panelTitles()).toEqual(['/l.ts', '/r.ts'])
    expect([paneText(view.container, 0), paneText(view.container, 1)]).toEqual([expect.stringContaining('zeta'), expect.stringContaining('omega')])
    const next = ['zeta\ndelta\n', 'zeta\nomega\n'] as const
    expect(countText()).toBe(String(diffLineTexts(next[0], next[1], WS_ON).differenceCount))
    expect(onPairChange).toHaveBeenCalledTimes(1)
    expect(onPairChange.mock.calls[0][0]).toEqual({ left: { path: '/l.ts', text: next[0] }, right: { path: '/r.ts', text: next[1] } })
    expect(onPairChange.mock.calls[0][1]).toEqual({ left: facts('/l.ts', next[0], 'UTF-8'), right: facts('/r.ts', next[1], 'UTF-8') })
    expect(checked('ignore-whitespace')).toBe('true')
    expect(paneElements(view.container).map((pane) => pane.scrollTop)).toEqual([100, 100])
    expect(write).not.toHaveBeenCalled()
  })

  it('keeps the whole previous result when one side cannot be read', async () => {
    const readSide = async (path: string): Promise<PickedTextFile> => {
      if (path === '/r.ts') throw new Error('ENOENT')
      return { path, text: 'REPLACED\n', facts: facts(path, 'REPLACED\n', 'UTF-8') }
    }
    const view = renderDiff('alpha\nbeta\n', 'alpha\ngamma\n', undefined, readSide)
    const snapshot = (): unknown[] => [countText(), nonSameRows(), markerCount(view.container), paneText(view.container, 0), paneText(view.container, 1)]
    const before = snapshot()
    fireEvent.click(action('reload'))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('/r.ts'))
    const notice = screen.getByRole('status').textContent ?? ''
    expect([notice.includes('重新加载失败'), notice.includes('/r.ts')]).toEqual([true, true])
    expect(snapshot()).toEqual(before)
    // The successful left read is discarded: no half-updated pair.
    expect(paneText(view.container, 0)).not.toContain('REPLACED')
  })

  it('swaps sides and swapping twice restores the original pair', () => {
    const [left, right] = ['alpha\nbeta\n', 'alpha\n']
    const write = vi.spyOn(platform, 'writeTextFile')
    const onPairChange = vi.fn()
    const view = renderDiff(left, right, undefined, undefined, onPairChange)
    const before = [countText(), nonSameRows(), markerCount(view.container)]
    expect(panelTitles()).toEqual(['/l.ts', '/r.ts'])
    fireEvent.click(action('swap'))
    expect(panelTitles()).toEqual(['/r.ts', '/l.ts'])
    expect(countText()).toBe(String(diffLineTexts(right, left, ALL_ON).differenceCount))
    expect(onPairChange.mock.calls[0][0]).toEqual({ left: { path: '/r.ts', text: right }, right: { path: '/l.ts', text: left } })
    fireEvent.click(action('swap'))
    expect(panelTitles()).toEqual(['/l.ts', '/r.ts'])
    expect([countText(), nonSameRows(), markerCount(view.container)]).toEqual(before)
    expect(onPairChange).toHaveBeenCalledTimes(2)
    expect(onPairChange.mock.calls[1][0]).toEqual({ left: { path: '/l.ts', text: left }, right: { path: '/r.ts', text: right } })
    expect(write).not.toHaveBeenCalled()
  })

  it('names the pair actions and whitespace switch in en', () => {
    const readSide = async (path: string): Promise<PickedTextFile> => ({ path, text: 'x\n' })
    renderWithI18n(<CodeView pair={{ left: { path: '/l.ts', text: 'a\n' }, right: { path: '/r.ts', text: 'b\n' } }} platform={platform} readSide={readSide} onPairChange={vi.fn()} />, 'en')
    const menu = openMore()
    for (const name of ['Reload', 'Swap sides', 'Ignore whitespace']) {
      expect(
        within(menu).getByRole('menuitem', { name: (label: string) => label.includes(name) }),
        name
      ).toBeDefined()
    }
    const button = toolbarSwap()
    expect(button?.getAttribute('aria-label')).toBe('Swap sides')
    expect(button?.getAttribute('title')).toContain(CODE_SWAP_SHORTCUT)
  })
})

describe('explicit swap entry and centred jump', () => {
  it('shows the swap action directly in the toolbar only when the shell can commit', () => {
    const view = renderDiff('alpha\nbeta\n', 'alpha\n', undefined, undefined, vi.fn())
    const button = toolbarSwap()
    expect(button).not.toBeNull()
    expect(button?.getAttribute('aria-label')).toBe('交换左右')
    expect(button?.getAttribute('title')).toContain(CODE_SWAP_SHORTCUT)
    expect(button?.hasAttribute('data-shell-entry')).toBe(false)
    // The same action stays available from the overflow menu with the same binding.
    expect(action('swap').textContent).toContain(CODE_SWAP_SHORTCUT)
    view.unmount()

    renderDiff('alpha\nbeta\n', 'alpha\n')
    expect(toolbarSwap()).toBeNull()
  })

  it('runs toolbar, menu and shortcut through the same swap action without writing', () => {
    const [left, right] = ['alpha\nbeta\n', 'alpha\n']
    const write = vi.spyOn(platform, 'writeTextFile')
    const onPairChange = vi.fn()
    renderDiff(left, right, undefined, undefined, onPairChange)

    fireEvent.click(toolbarSwap()!)
    fireEvent.click(action('swap'))
    fireEvent.keyDown(document, { key: 's', metaKey: true, shiftKey: true })

    expect(onPairChange).toHaveBeenCalledTimes(3)
    expect(onPairChange.mock.calls.map((call) => call[0])).toEqual([
      { left: { path: '/r.ts', text: right }, right: { path: '/l.ts', text: left } },
      { left: { path: '/l.ts', text: left }, right: { path: '/r.ts', text: right } },
      { left: { path: '/r.ts', text: right }, right: { path: '/l.ts', text: left } }
    ])
    expect(panelTitles()).toEqual(['/r.ts', '/l.ts'])
    expect(write).not.toHaveBeenCalled()
  })

  it('guards the shortcut and only prevents default on a real swap', () => {
    const onPairChange = vi.fn()
    renderDiff('alpha\nbeta\n', 'alpha\n', undefined, undefined, onPairChange)

    expect(fireEvent.keyDown(document, { key: 'n', metaKey: true })).toBe(true)
    expect(fireEvent.keyDown(document, { key: 's', metaKey: true })).toBe(true)
    expect(fireEvent.keyDown(document, { key: 's', ctrlKey: true, shiftKey: true, altKey: true })).toBe(true)
    expect(fireEvent.keyDown(document, { key: 's', metaKey: true, shiftKey: true, repeat: true })).toBe(true)
    expect(onPairChange).not.toHaveBeenCalled()

    const input = document.createElement('input')
    document.body.appendChild(input)
    expect(fireEvent.keyDown(input, { key: 's', metaKey: true, shiftKey: true })).toBe(true)
    input.remove()
    expect(onPairChange).not.toHaveBeenCalled()

    expect(fireEvent.keyDown(document, { key: 's', ctrlKey: true, shiftKey: true })).toBe(false)
    expect(onPairChange).toHaveBeenCalledTimes(1)
  })

  it('keeps the same/removed/added/modified counts and restores rows across two swaps', () => {
    const left = 'same-1\nleft-only\nsame-2\nmodified-old\nsame-3\n'
    const right = 'same-1\nsame-2\nmodified-new\nsame-3\nright-only\n'
    const view = renderDiff(left, right, undefined, undefined, vi.fn())

    // Visibility + label here; the three-entry same-handler flow is covered above.
    const expectSwapVisible = (): void => {
      const button = toolbarSwap()
      expect(button).not.toBeNull()
      expect(button!.hidden).toBe(false)
      expect(window.getComputedStyle(button!).display).not.toBe('none')
      expect(button!.getAttribute('aria-label')).toBe('交换左右')
    }
    expectSwapVisible()

    const leftBefore = rowSnapshots(view.container, 0)
    const rightBefore = rowSnapshots(view.container, 1)
    const counts: Record<DiffStateName, number> = { same: 3, removed: 1, added: 1, modified: 1 }
    expect(stateCounts(view.container)).toEqual(counts)
    expect(counts.same + counts.removed + counts.added + counts.modified).toBe(6)

    fireEvent.click(toolbarSwap()!)
    expectSwapVisible()
    expect(paneText(view.container, 0)).toContain('modified-new')
    expect(paneText(view.container, 0)).toContain('right-only')
    expect(paneText(view.container, 1)).toContain('left-only')
    expect(paneText(view.container, 1)).toContain('modified-old')
    expect(panelTitles()).toEqual(['/r.ts', '/l.ts'])
    expect(stateCounts(view.container)).toEqual(counts)

    fireEvent.click(toolbarSwap()!)
    expectSwapVisible()
    expect(rowSnapshots(view.container, 0)).toEqual(leftBefore)
    expect(rowSnapshots(view.container, 1)).toEqual(rightBefore)
    expect(panelTitles()).toEqual(['/l.ts', '/r.ts'])
    expect(stateCounts(view.container)).toEqual(counts)
  })
})
