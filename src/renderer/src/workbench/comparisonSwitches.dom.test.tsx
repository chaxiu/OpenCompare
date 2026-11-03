// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sha256Hex } from '@core/directory/hash'
import type { PlatformPort, TextFileFacts } from '@shared/platform/types'
import { zh } from '@renderer/i18n/messages'
import { renderWithI18n } from '@renderer/i18n/testing'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { Workbench } from './Workbench'

const LEFT = '/memory/switch/left.ts'
const RIGHT = '/memory/switch/right.ts'
const OTHER_LEFT = '/memory/switch/other-left.ts'
const OTHER_RIGHT = '/memory/switch/other-right.ts'
const TEXTS: Record<string, string> = {
  [LEFT]: 'alpha\r\nbeta\r\n',
  [RIGHT]: 'alpha\nbeta\n',
  [OTHER_LEFT]: 'gamma\n',
  [OTHER_RIGHT]: 'gamma\n'
}
const FACTS: Record<string, TextFileFacts> = {
  [LEFT]: { path: LEFT, encoding: 'UTF-8', newline: 'CRLF', bytes: 12, sha256: sha256Hex(TEXTS[LEFT]) },
  [RIGHT]: { path: RIGHT, encoding: 'UTF-8', newline: 'LF', bytes: 10, sha256: sha256Hex(TEXTS[RIGHT]) },
  [OTHER_LEFT]: { path: OTHER_LEFT, encoding: 'UTF-16LE', newline: 'LF', bytes: 12, sha256: sha256Hex('utf16') },
  [OTHER_RIGHT]: { path: OTHER_RIGHT, encoding: 'UTF-8', newline: 'LF', bytes: 6, sha256: sha256Hex(TEXTS[OTHER_RIGHT]) }
}
const STATUS_KEYS = [
  'shell.status.leftNewline',
  'shell.status.leftEncoding',
  'shell.status.rightNewline',
  'shell.status.rightEncoding'
] as const

/** A memory port whose probe seam answers fixed facts and records every call. */
async function switchPort(): Promise<{
  port: PlatformPort
  calls: string[]
  writes: ReturnType<typeof vi.fn>
}> {
  const base = createWebPlatformPort()
  for (const [path, text] of Object.entries(TEXTS)) await base.writeTextFile(path, text)
  const calls: string[] = []
  // Wrapped after seeding so the spy only sees writes the UI performs.
  const writes = vi.fn((path: string, content: string) => base.writeTextFile(path, content))
  return {
    calls,
    writes,
    port: {
      ...base,
      writeTextFile: writes,
      probeTextFile: async (path) => {
        calls.push(path)
        const facts = FACTS[path]
        if (!facts) throw new Error(`unexpected probe: ${path}`)
        return { ...facts, text: TEXTS[path] }
      }
    }
  }
}
function switchOf(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-code-switch="${id}"]`)
}

function countText(): string {
  return document.querySelector('[data-code-diff-count]')?.textContent ?? ''
}

/**
 * Every persisted key except the recent-history store, which a real establish
 * writes by design (covered by `historyHome.dom.test.tsx`). A switch toggle must
 * not touch anything else.
 */
function storageSnapshot(): string {
  return JSON.stringify(
    Object.keys(localStorage)
      .filter((key) => key !== 'opencompare.comparisonHistory')
      .sort()
      .map((key) => [key, localStorage.getItem(key)])
  )
}

/** The four original probe values of the status layer, in DOM order. */
function statusValues(): string[] {
  const bar = document.querySelector<HTMLElement>('footer[data-shell-level="status"]')
  if (bar === null) throw new Error('missing status bar')
  const labels: readonly string[] = STATUS_KEYS.map((key) => zh[key])
  return Array.from(bar.children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement)
    .map((child) => ({
      label: child.firstElementChild?.textContent ?? '',
      value: child.querySelector('.tabular')?.textContent ?? ''
    }))
    .filter((entry) => labels.includes(entry.label))
    .map((entry) => entry.value)
}

/** Opens a typed file pair through the manual entry and waits for its tab. */
async function openPair(left: string, right: string, tab: RegExp): Promise<void> {
  fireEvent.click(screen.getAllByRole('button', { name: zh['shell.toolbar.newCompare'] })[0])
  const dialog = await screen.findByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText(zh['shell.compare.leftPath']), {
    target: { value: left }
  })
  fireEvent.change(within(dialog).getByLabelText(zh['shell.compare.rightPath']), {
    target: { value: right }
  })
  fireEvent.click(within(dialog).getByRole('button', { name: zh['shell.compare.submit'] }))
  await waitFor(() => expect(screen.getByRole('tab', { name: tab })).toBeTruthy())
}

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('workbench comparison switches', () => {
  it('keeps one runtime value across tabs and new pairs, without re-probing', async () => {
    const { port, calls } = await switchPort()
    renderWithI18n(<Workbench platform={port} />, 'zh')
    await openPair(LEFT, RIGHT, /left\.ts ↔ right\.ts/)

    expect(switchOf('ignore-newline')?.getAttribute('aria-checked')).toBe('true')
    expect(switchOf('ignore-encoding')?.getAttribute('aria-checked')).toBe('true')
    expect(countText()).toBe('0')
    expect(statusValues()).toEqual(['CRLF', 'UTF-8', 'LF', 'UTF-8'])
    expect(calls).toEqual([LEFT, RIGHT])
    const stored = storageSnapshot()

    fireEvent.click(switchOf('ignore-newline')!)
    fireEvent.click(switchOf('ignore-encoding')!)
    expect(switchOf('ignore-newline')?.getAttribute('aria-checked')).toBe('false')
    expect(Number(countText())).toBeGreaterThan(0)
    expect(calls).toEqual([LEFT, RIGHT])
    expect(statusValues()).toEqual(['CRLF', 'UTF-8', 'LF', 'UTF-8'])
    expect(storageSnapshot()).toBe(stored)
    const countBefore = countText()

    await openPair(OTHER_LEFT, OTHER_RIGHT, /other-left\.ts ↔ other-right\.ts/)
    // A new session opens at the current runtime value, not at the default.
    expect(switchOf('ignore-newline')?.getAttribute('aria-checked')).toBe('false')
    expect(switchOf('ignore-encoding')?.getAttribute('aria-checked')).toBe('false')
    expect(countText()).toBe('1')
    expect(document.querySelector('[data-code-diff-bytes]')).not.toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: /left\.ts ↔ right\.ts/ }))
    await waitFor(() => expect(countText()).toBe(countBefore))
    expect(switchOf('ignore-newline')?.getAttribute('aria-checked')).toBe('false')
    expect(statusValues()).toEqual(['CRLF', 'UTF-8', 'LF', 'UTF-8'])
    expect(calls).toEqual([LEFT, RIGHT, OTHER_LEFT, OTHER_RIGHT])
    expect(storageSnapshot()).toBe(stored)
  })

  it('returns to the default-on switches after a remount', async () => {
    const first = await switchPort()
    const view = renderWithI18n(<Workbench platform={first.port} />, 'zh')
    await openPair(LEFT, RIGHT, /left\.ts ↔ right\.ts/)
    fireEvent.click(switchOf('ignore-newline')!)
    expect(switchOf('ignore-newline')?.getAttribute('aria-checked')).toBe('false')
    view.unmount()

    const second = await switchPort()
    renderWithI18n(<Workbench platform={second.port} />, 'zh')
    await openPair(LEFT, RIGHT, /left\.ts ↔ right\.ts/)
    expect(switchOf('ignore-newline')?.getAttribute('aria-checked')).toBe('true')
    expect(switchOf('ignore-encoding')?.getAttribute('aria-checked')).toBe('true')
  })

  it('keeps raw status, switch state and the no-write invariant across reload and swap', async () => {
    const { port, calls, writes } = await switchPort()
    renderWithI18n(<Workbench platform={port} />, 'zh')
    await openPair(LEFT, RIGHT, /left\.ts ↔ right\.ts/)

    expect(switchOf('ignore-whitespace')?.getAttribute('aria-checked')).toBe('false')
    expect(statusValues()).toEqual(['CRLF', 'UTF-8', 'LF', 'UTF-8'])
    expect(calls).toEqual([LEFT, RIGHT])

    fireEvent.click(switchOf('ignore-whitespace')!)
    expect(switchOf('ignore-whitespace')?.getAttribute('aria-checked')).toBe('true')
    // The status layer keeps the disk facts: normalising never rewrites them.
    expect(statusValues()).toEqual(['CRLF', 'UTF-8', 'LF', 'UTF-8'])
    expect(calls).toEqual([LEFT, RIGHT])

    fireEvent.click(switchOf('ignore-newline')!)
    expect(switchOf('ignore-newline')?.getAttribute('aria-checked')).toBe('false')
    await openPair(OTHER_LEFT, OTHER_RIGHT, /other-left\.ts ↔ other-right\.ts/)
    fireEvent.click(screen.getByRole('tab', { name: /left\.ts ↔ right\.ts/ }))
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /left\.ts ↔ right\.ts/ }).getAttribute('aria-selected')).toBe('true')
    )
    expect(switchOf('ignore-whitespace')?.getAttribute('aria-checked')).toBe('true')
    expect(switchOf('ignore-newline')?.getAttribute('aria-checked')).toBe('false')

    const beforeReload = calls.length
    const writesBefore = writes.mock.calls.length
    fireEvent.click(document.querySelector('[data-code-action="reload"]')!)
    await waitFor(() => expect(calls.length).toBeGreaterThan(beforeReload))
    expect(calls.slice(beforeReload)).toEqual([LEFT, RIGHT])
    expect(writes.mock.calls.length).toBe(writesBefore)
    expect(screen.getAllByRole('tab')).toHaveLength(2)
    expect(statusValues()).toEqual(['CRLF', 'UTF-8', 'LF', 'UTF-8'])

    const beforeSwap = calls.length
    fireEvent.click(document.querySelector('[data-code-action="swap"]')!)
    await waitFor(() => expect(statusValues()).toEqual(['LF', 'UTF-8', 'CRLF', 'UTF-8']))
    expect(switchOf('ignore-whitespace')?.getAttribute('aria-checked')).toBe('true')
    expect(switchOf('ignore-newline')?.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(document.querySelector('[data-code-action="swap"]')!)
    await waitFor(() => expect(statusValues()).toEqual(['CRLF', 'UTF-8', 'LF', 'UTF-8']))
    expect(calls.length).toBe(beforeSwap)
    expect(writes.mock.calls.length).toBe(writesBefore)
  })
})
