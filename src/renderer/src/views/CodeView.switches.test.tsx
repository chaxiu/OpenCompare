// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { sha256Hex } from '@core/directory/hash'
import { diffLineTexts } from '@core/text/diff'
import type { ComparisonOptions } from '@core/text/normalize'
import type { TextFileFacts } from '@shared/platform/types'
import { renderWithI18n } from '@renderer/i18n/testing'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { CodeView } from './CodeView'
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
function renderDiff(left: string, right: string, probes?: FilePairProbes): ReturnType<typeof renderWithI18n> {
  const pair: FilePair = {
    left: { path: '/l.ts', text: left },
    right: { path: '/r.ts', text: right }
  }
  return renderWithI18n(<CodeView pair={pair} probes={probes} platform={platform} />)
}
function switchOf(id: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-code-switch="${id}"]`)
  if (element === null) throw new Error(`missing switch: ${id}`)
  return element
}
function checked(id: string): string | null {
  return switchOf(id).getAttribute('aria-checked')
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

afterEach(cleanup)

describe('code diff comparison switches', () => {
  it('starts both switches on inside the single view-toolbar band', () => {
    renderDiff('alpha\nbeta\n', 'alpha\nbeta\ngamma\n')

    for (const id of ['ignore-newline', 'ignore-encoding']) {
      const element = switchOf(id)
      expect(element.tagName).toBe('BUTTON')
      expect(element.getAttribute('role')).toBe('switch')
      expect(element.getAttribute('aria-checked')).toBe('true')
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
          expect(document.querySelector('[class*="bg-diff-modified/40"]')).not.toBeNull()
        }
        view.unmount()
      }
    }
  })

  it('toggles once per click, Space and Enter through the same handler', () => {
    renderDiff('alpha\n', 'beta\n')
    const element = switchOf('ignore-newline')
    element.focus()
    expect(document.activeElement).toBe(element)

    fireEvent.keyDown(element, { key: ' ' })
    expect(checked('ignore-newline')).toBe('false')
    fireEvent.keyDown(element, { key: 'Enter' })
    expect(checked('ignore-newline')).toBe('true')
    fireEvent.click(element)
    expect(checked('ignore-newline')).toBe('false')
    fireEvent.click(element)
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
