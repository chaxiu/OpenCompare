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
/** Every probe label the status layer may render, deduped forms included. */
const STATUS_KEYS = [
  'shell.status.newline',
  'shell.status.leftNewline',
  'shell.status.rightNewline',
  'shell.status.encoding',
  'shell.status.leftEncoding',
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

type SwitchId = 'ignore-newline' | 'ignore-encoding' | 'ignore-whitespace'

const SWITCH_LABELS: Record<SwitchId, string> = {
  'ignore-newline': zh['files.code.ignoreNewline'],
  'ignore-encoding': zh['files.code.ignoreEncoding'],
  'ignore-whitespace': zh['files.code.ignoreWhitespace']
}

/** The single toolbar overflow trigger; every comparison switch lives inside. */
function moreTrigger(): HTMLElement {
  const trigger = document.querySelector<HTMLElement>('[data-shell-entry="more"]')
  if (trigger === null) throw new Error('missing more trigger')
  return trigger
}

/** Opens the overflow menu and returns it, idempotently. */
function openMore(): HTMLElement {
  const trigger = moreTrigger()
  if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger)
  const menu = screen.queryByRole('menu')
  if (menu === null) throw new Error('more menu did not open')
  return menu
}

function closeMore(): void {
  if (moreTrigger().getAttribute('aria-expanded') === 'true') {
    fireEvent.keyDown(document, { key: 'Escape' })
  }
}

function menuItem(label: string): HTMLElement {
  return within(openMore()).getByRole('menuitem', {
    name: (name: string) => name.includes(label)
  })
}

function switchOf(id: SwitchId): HTMLElement {
  return menuItem(SWITCH_LABELS[id])
}

/** A menu item's checked state is the leading `[x] ` label prefix. */
function checked(id: SwitchId): string {
  const state = (switchOf(id).textContent ?? '').trimStart().startsWith('[x]') ? 'true' : 'false'
  // Reading never leaves the menu hanging over the next interaction.
  closeMore()
  return state
}

/** Opens the menu, activates one switch and lets the menu close on select. */
function toggle(id: SwitchId): void {
  fireEvent.click(switchOf(id))
}

function menuAction(label: string): void {
  fireEvent.click(menuItem(label))
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

/** The probe values of the status layer, in DOM order (deduped forms included). */
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

    expect(checked('ignore-newline')).toBe('true')
    expect(checked('ignore-encoding')).toBe('true')
    expect(countText()).toBe('0')
    // Newlines differ (left / right), encodings agree and collapse to one entry.
    expect(statusValues()).toEqual(['CRLF', 'LF', 'UTF-8'])
    expect(calls).toEqual([LEFT, RIGHT])
    const stored = storageSnapshot()

    toggle('ignore-newline')
    toggle('ignore-encoding')
    expect(checked('ignore-newline')).toBe('false')
    expect(Number(countText())).toBeGreaterThan(0)
    expect(calls).toEqual([LEFT, RIGHT])
    expect(statusValues()).toEqual(['CRLF', 'LF', 'UTF-8'])
    expect(storageSnapshot()).toBe(stored)
    const countBefore = countText()

    await openPair(OTHER_LEFT, OTHER_RIGHT, /other-left\.ts ↔ other-right\.ts/)
    // A new session opens at the current runtime value, not at the default.
    expect(checked('ignore-newline')).toBe('false')
    expect(checked('ignore-encoding')).toBe('false')
    expect(countText()).toBe('1')
    expect(document.querySelector('[data-code-diff-bytes]')).not.toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: /left\.ts ↔ right\.ts/ }))
    await waitFor(() => expect(countText()).toBe(countBefore))
    expect(checked('ignore-newline')).toBe('false')
    expect(statusValues()).toEqual(['CRLF', 'LF', 'UTF-8'])
    expect(calls).toEqual([LEFT, RIGHT, OTHER_LEFT, OTHER_RIGHT])
    expect(storageSnapshot()).toBe(stored)
  })

  it('returns to the default-on switches after a remount', async () => {
    const first = await switchPort()
    const view = renderWithI18n(<Workbench platform={first.port} />, 'zh')
    await openPair(LEFT, RIGHT, /left\.ts ↔ right\.ts/)
    toggle('ignore-newline')
    expect(checked('ignore-newline')).toBe('false')
    view.unmount()

    const second = await switchPort()
    renderWithI18n(<Workbench platform={second.port} />, 'zh')
    await openPair(LEFT, RIGHT, /left\.ts ↔ right\.ts/)
    expect(checked('ignore-newline')).toBe('true')
    expect(checked('ignore-encoding')).toBe('true')
  })

  it('keeps raw status, switch state and the no-write invariant across reload and swap', async () => {
    const { port, calls, writes } = await switchPort()
    renderWithI18n(<Workbench platform={port} />, 'zh')
    await openPair(LEFT, RIGHT, /left\.ts ↔ right\.ts/)

    expect(checked('ignore-whitespace')).toBe('false')
    expect(statusValues()).toEqual(['CRLF', 'LF', 'UTF-8'])
    expect(calls).toEqual([LEFT, RIGHT])

    toggle('ignore-whitespace')
    expect(checked('ignore-whitespace')).toBe('true')
    // The status layer keeps the disk facts: normalising never rewrites them.
    expect(statusValues()).toEqual(['CRLF', 'LF', 'UTF-8'])
    expect(calls).toEqual([LEFT, RIGHT])

    toggle('ignore-newline')
    expect(checked('ignore-newline')).toBe('false')
    await openPair(OTHER_LEFT, OTHER_RIGHT, /other-left\.ts ↔ other-right\.ts/)
    fireEvent.click(screen.getByRole('tab', { name: /left\.ts ↔ right\.ts/ }))
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /left\.ts ↔ right\.ts/ }).getAttribute('aria-selected')).toBe('true')
    )
    expect(checked('ignore-whitespace')).toBe('true')
    expect(checked('ignore-newline')).toBe('false')

    const beforeReload = calls.length
    const writesBefore = writes.mock.calls.length
    menuAction(zh['files.code.reload'])
    await waitFor(() => expect(calls.length).toBeGreaterThan(beforeReload))
    expect(calls.slice(beforeReload)).toEqual([LEFT, RIGHT])
    expect(writes.mock.calls.length).toBe(writesBefore)
    expect(screen.getAllByRole('tab')).toHaveLength(2)
    expect(statusValues()).toEqual(['CRLF', 'LF', 'UTF-8'])

    const beforeSwap = calls.length
    menuAction(zh['files.code.swap'])
    await waitFor(() => expect(statusValues()).toEqual(['LF', 'CRLF', 'UTF-8']))
    expect(checked('ignore-whitespace')).toBe('true')
    expect(checked('ignore-newline')).toBe('false')
    menuAction(zh['files.code.swap'])
    await waitFor(() => expect(statusValues()).toEqual(['CRLF', 'LF', 'UTF-8']))
    expect(calls.length).toBe(beforeSwap)
    expect(writes.mock.calls.length).toBe(writesBefore)
  })
})
