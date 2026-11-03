// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveComparisonSwitches } from '@core/text/normalize'
import { comparisonHistoryId, upsertComparisonHistory } from '@shared/history/model'
import type { ComparisonHistoryEntry, ComparisonHistoryKind } from '@shared/history/types'
import type { PlatformPort } from '@shared/platform/types'
import type { MessageKey } from '@renderer/i18n/messages'
import { zh } from '@renderer/i18n/messages'
import { renderWithI18n } from '@renderer/i18n/testing'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { Workbench } from './Workbench'

const [DIR_LEFT, DIR_RIGHT] = ['/memory/history-dir-left', '/memory/history-dir-right']
const [FILE_LEFT, FILE_RIGHT] = ['/memory/history/left.ts', '/memory/history/right.ts']
const [GONE_LEFT, GONE_RIGHT] = ['/memory/history-gone-left', '/memory/history-gone-right']
const FIXED_TIME = 1_700_000_000_000
const SWITCHES = resolveComparisonSwitches({})
const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1200 })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 640 })
})
afterAll(() => {
  for (const [name, original] of [['clientWidth', width], ['clientHeight', height]] as const) {
    if (original) Object.defineProperty(HTMLElement.prototype, name, original)
    else Reflect.deleteProperty(HTMLElement.prototype, name)
  }
})
beforeEach(() => localStorage.clear())
afterEach(() => cleanup())

const tabs = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('[data-session-tab]'))
const historyRows = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('[data-history-entry]'))
const legendCount = (status: string): number => Number(document.querySelector(`[data-legend-status="${status}"] .tabular`)?.textContent)
const rowPaths = (row: HTMLElement): string => row.querySelector('[data-history-paths]')?.getAttribute('title') ?? ''
const mount = (port: PlatformPort): void => {
  renderWithI18n(<Workbench platform={port} />, 'zh')
}
const titled = (key: MessageKey, ...paths: string[]): string => zh[key].replace('{paths}', paths.join(' ↔ '))
const reopenName = (l: string, r: string): string => titled('shell.history.reopenTitle', l, r)
const removeName = (l: string, r: string): string => titled('shell.history.removeTitle', l, r)
const switchEl = (name: string): HTMLElement => document.querySelector<HTMLElement>(`[data-code-switch="${name}"]`)!
const captureConsole = (calls: string[]): (() => void) => {
  const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation((...args) => { calls.push(args.map(String).join(' ')) })
  )
  return () => spies.forEach((spy) => spy.mockRestore())
}
async function memoryPort(): Promise<PlatformPort> {
  const port = createWebPlatformPort()
  const files = [[`${DIR_LEFT}/same.txt`, 'same\n'], [`${DIR_RIGHT}/same.txt`, 'same\n'], [FILE_LEFT, 'alpha\n'], [FILE_RIGHT, 'alpha\nbeta\n']]
  for (const [path, text] of files) await port.writeTextFile(path, text)
  return port
}
function delayed(port: PlatformPort): PlatformPort {
  const wait = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 25))
  return {
    ...port,
    listDirectory: async (path) => { await wait(); return port.listDirectory(path) },
    listDirectories: async (paths) => { await wait(); return port.listDirectories(paths) }
  }
}
async function openPair(left: string, right: string): Promise<void> {
  fireEvent.click(screen.getAllByRole('button', { name: zh['shell.toolbar.newCompare'] })[0])
  const dialog = await screen.findByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText(zh['shell.compare.leftPath']), { target: { value: left } })
  fireEvent.change(within(dialog).getByLabelText(zh['shell.compare.rightPath']), { target: { value: right } })
  fireEvent.click(within(dialog).getByRole('button', { name: zh['shell.compare.submit'] }))
  await waitFor(() => expect(tabs()).toHaveLength(1), { timeout: 30_000 })
}
async function closeOnlySession(): Promise<void> {
  const tab = document.querySelector<HTMLElement>('[data-session-tab]')
  if (tab === null) throw new Error('missing session tab')
  fireEvent.click(within(tab).getByRole('button', { name: /^关闭 / }))
  await waitFor(() => expect(tabs()).toHaveLength(0))
}
async function openSample(id: string): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: zh['shell.settings.open'] }))
  const dialog = await screen.findByRole('dialog', { name: zh['settings.title'] })
  const entry = dialog.querySelector<HTMLElement>(`[data-sample-entry="${id}"]`)
  if (entry === null) throw new Error(`missing sample entry: ${id}`)
  fireEvent.click(entry)
}
async function seedEntry(port: PlatformPort, kind: ComparisonHistoryKind, paths: readonly string[]): Promise<ComparisonHistoryEntry[]> {
  const entries = upsertComparisonHistory([], { kind, paths, createdAt: FIXED_TIME, ...SWITCHES })
  await port.writeComparisonHistory(entries)
  return entries
}
async function openFresh(port: PlatformPort, left: string, right: string): Promise<PlatformPort> {
  mount(port)
  await openPair(left, right)
  await waitFor(async () => expect(await port.readComparisonHistory()).toHaveLength(1))
  return port
}

describe('workbench history home', () => {
  it('records one directory entry and renders its kind and full paths', async () => {
    const port = await openFresh(await memoryPort(), DIR_LEFT, DIR_RIGHT)
    const entry = (await port.readComparisonHistory())[0]
    expect(entry).toMatchObject({ kind: 'directory', paths: [DIR_LEFT, DIR_RIGHT], ...SWITCHES })
    expect(entry?.id).toBe(comparisonHistoryId('directory', [DIR_LEFT, DIR_RIGHT]))
    await closeOnlySession()
    await waitFor(() => expect(historyRows()).toHaveLength(1))
    expect(within(historyRows()[0]).getByText(zh['shell.history.kind.directory'])).toBeDefined()
    expect(rowPaths(historyRows()[0])).toBe(`${DIR_LEFT} ↔ ${DIR_RIGHT}`)
  }, 60_000)
  it('records one file entry with the ordered paths and switches', async () => {
    const port = await openFresh(await memoryPort(), FILE_LEFT, FILE_RIGHT)
    const entry = (await port.readComparisonHistory())[0]
    expect(entry).toMatchObject({ kind: 'file', paths: [FILE_LEFT, FILE_RIGHT], ...SWITCHES })
    await closeOnlySession()
    await waitFor(() => expect(historyRows()).toHaveLength(1))
    expect(within(historyRows()[0]).getByText(zh['shell.history.kind.file'])).toBeDefined()
  }, 60_000)
  it('never records a built-in sample opened next to a real pair', async () => {
    const port = await openFresh(await memoryPort(), DIR_LEFT, DIR_RIGHT)
    const before = await port.readComparisonHistory()
    await openSample('directory')
    await waitFor(() => expect(tabs()).toHaveLength(2), { timeout: 30_000 })
    await expect(port.readComparisonHistory()).resolves.toEqual(before)
  }, 60_000)
  it('keeps the session when the history write rejects', async () => {
    const base = await memoryPort()
    const port: PlatformPort = { ...base, writeComparisonHistory: async () => { throw new Error('storage unavailable') } }
    mount(port)
    await openPair(DIR_LEFT, DIR_RIGHT)
    expect(tabs()).toHaveLength(1); expect(screen.queryByRole('alert')).toBeNull()
    await closeOnlySession()
    await waitFor(() => expect(historyRows()).toHaveLength(0))
    expect(screen.queryByText(zh['shell.history.title'])).toBeNull(); await expect(port.readComparisonHistory()).resolves.toEqual([])
  }, 60_000)
  it('reopens a persisted directory entry with the same tab identity', async () => {
    const port = await openFresh(delayed(await memoryPort()), DIR_LEFT, DIR_RIGHT)
    const tabId = tabs()[0]?.getAttribute('data-session-tab')
    expect(tabId).toBeTruthy()
    cleanup()
    mount(port)
    fireEvent.click(await screen.findByRole('button', { name: reopenName(DIR_LEFT, DIR_RIGHT) }, { timeout: 30_000 }))
    await screen.findByRole('status', { name: zh['shell.progress.label'] })
    await waitFor(() => expect(tabs()).toHaveLength(1), { timeout: 30_000 })
    expect(tabs()[0]?.getAttribute('data-session-tab')).toBe(tabId)
    await waitFor(() => expect(screen.queryByRole('status', { name: zh['shell.progress.label'] })).toBeNull())
  }, 60_000)
  it('dedupes the same pair established twice', async () => {
    const port = await openFresh(await memoryPort(), FILE_LEFT, FILE_RIGHT)
    const first = (await port.readComparisonHistory())[0]
    await openPair(FILE_LEFT, FILE_RIGHT)
    await waitFor(() => expect(tabs()).toHaveLength(1))
    await waitFor(async () => expect((await port.readComparisonHistory()).map((e) => [e.id, e.paths])).toEqual([[first?.id, [FILE_LEFT, FILE_RIGHT]]]))
  }, 60_000)
  it('reports a reopen failure without leaking paths or touching the list', async () => {
    const port = await memoryPort()
    const seeded = await seedEntry(port, 'directory', [GONE_LEFT, GONE_RIGHT])
    mount(port)
    fireEvent.click(await screen.findByRole('button', { name: reopenName(GONE_LEFT, GONE_RIGHT) }))
    const alert = await screen.findByRole('alert', {}, { timeout: 30_000 })
    expect(alert.textContent).toContain(zh['shell.history.reopenFailed'])
    for (const path of [GONE_LEFT, GONE_RIGHT]) expect(alert.textContent).not.toContain(path)
    expect(tabs()).toHaveLength(0)
    await expect(port.readComparisonHistory()).resolves.toEqual(seeded)
  }, 60_000)
  it('removes one entry and hides the section after the last one, across a remount', async () => {
    const port = await memoryPort()
    await seedEntry(port, 'file', [FILE_LEFT, FILE_RIGHT])
    mount(port)
    await waitFor(() => expect(historyRows()).toHaveLength(1))
    fireEvent.click(within(historyRows()[0]).getByRole('button', { name: removeName(FILE_LEFT, FILE_RIGHT) }))
    await waitFor(() => expect(historyRows()).toHaveLength(0))
    expect(screen.queryByText(zh['shell.history.title'])).toBeNull()
    await waitFor(async () => expect(await port.readComparisonHistory()).toEqual([]))
    cleanup()
    mount(port)
    await waitFor(async () => expect(await port.readComparisonHistory()).toEqual([]))
    expect(historyRows()).toHaveLength(0); expect(screen.queryByText(zh['shell.history.title'])).toBeNull()
  }, 60_000)
  it('syncs a switch toggle into the active file entry without changing its identity', async () => {
    const port = await openFresh(await memoryPort(), FILE_LEFT, FILE_RIGHT)
    const before = (await port.readComparisonHistory())[0]
    expect(before?.ignoreWhitespace).toBe(false)
    await waitFor(() => expect(document.querySelector('[data-code-switch="ignore-whitespace"]')).not.toBeNull())
    const sw = switchEl('ignore-whitespace')
    fireEvent.click(sw)
    expect(sw.getAttribute('aria-checked')).toBe('true')
    await waitFor(async () => {
      const entries = await port.readComparisonHistory()
      expect(entries).toMatchObject([{ id: before?.id, createdAt: before?.createdAt, ignoreWhitespace: true, ignoreNewline: SWITCHES.ignoreNewline, ignoreEncoding: SWITCHES.ignoreEncoding }])
    })
  }, 60_000)
  it('never writes history when a switch toggles on a sample drilldown', async () => {
    const base = await memoryPort()
    const seeded = await seedEntry(base, 'file', [FILE_LEFT, FILE_RIGHT])
    let writes = 0
    const port: PlatformPort = { ...base, writeComparisonHistory: async (entries) => { writes += 1; await base.writeComparisonHistory(entries) } }
    mount(port)
    await openSample('directory')
    await waitFor(() => expect(tabs()).toHaveLength(1), { timeout: 30_000 })
    fireEvent.doubleClick(screen.getAllByText('engine.ts')[0])
    await waitFor(() => expect(document.querySelector('[data-code-switch="ignore-newline"]')).not.toBeNull(), { timeout: 30_000 })
    const sw = switchEl('ignore-newline')
    fireEvent.click(sw)
    expect(sw.getAttribute('aria-checked')).toBe('false')
    await expect(port.readComparisonHistory()).resolves.toEqual(seeded); expect(writes).toBe(0)
  }, 60_000)
  it('keeps absolute paths out of console output across establish, remove and failed reopen', async () => {
    const port = await memoryPort()
    const seeded = await seedEntry(port, 'directory', [GONE_LEFT, GONE_RIGHT])
    const calls: string[] = []
    const restore = captureConsole(calls)
    try {
      mount(port)
      await openPair(FILE_LEFT, FILE_RIGHT)
      await waitFor(async () => expect(await port.readComparisonHistory()).toHaveLength(2))
      await closeOnlySession()
      const fileRow = historyRows().find((row) => rowPaths(row).includes(FILE_LEFT))
      if (!fileRow) throw new Error('missing file history row')
      fireEvent.click(within(fileRow).getByRole('button', { name: removeName(FILE_LEFT, FILE_RIGHT) }))
      await waitFor(async () => expect(await port.readComparisonHistory()).toHaveLength(1))
      fireEvent.click(screen.getByRole('button', { name: reopenName(GONE_LEFT, GONE_RIGHT) }))
      await screen.findByRole('alert', {}, { timeout: 30_000 })
      const output = calls.join('\n')
      for (const path of [DIR_LEFT, DIR_RIGHT, FILE_LEFT, FILE_RIGHT, GONE_LEFT, GONE_RIGHT]) expect(output).not.toContain(path)
      await expect(port.readComparisonHistory()).resolves.toEqual(seeded)
    } finally {
      restore()
    }
  }, 60_000)
  it('reopens a file pair by re-reading the disk and restoring the stored switches', async () => {
    const port = await memoryPort()
    mount(port)
    await openPair(FILE_LEFT, FILE_RIGHT)
    await waitFor(async () => expect(await port.readComparisonHistory()).toHaveLength(1))
    await waitFor(() => expect(document.querySelector('[data-code-switch="ignore-whitespace"]')).not.toBeNull())
    // A non-default switch combination is stored on the entry (whitespace defaults off).
    fireEvent.click(switchEl('ignore-whitespace'))
    expect(switchEl('ignore-whitespace').getAttribute('aria-checked')).toBe('true')
    await waitFor(async () => expect((await port.readComparisonHistory())[0]?.ignoreWhitespace).toBe(true))
    await closeOnlySession()
    cleanup()
    // The right side changes on disk after the entry was stored.
    await port.writeTextFile(FILE_RIGHT, 'alpha\nomega\n')
    mount(port)
    // A fresh render owns no session, so the shell switches start at their defaults.
    expect(document.querySelector('[data-code-switch="ignore-whitespace"]')).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: reopenName(FILE_LEFT, FILE_RIGHT) }, { timeout: 30_000 }))
    await waitFor(() => expect(tabs()).toHaveLength(1), { timeout: 30_000 })
    await waitFor(() => expect(switchEl('ignore-whitespace').getAttribute('aria-checked')).toBe('true'))
    // The reopened panes show the new disk content, not the old line.
    const text = document.body.textContent ?? ''
    expect(text).toContain('omega')
    expect(text).not.toContain('beta')
    expect(switchEl('ignore-newline').getAttribute('aria-checked')).toBe('true')
  }, 60_000)
  it('reopens a directory pair by rescanning the disk and keeping both real roots', async () => {
    const port = delayed(await memoryPort())
    mount(port)
    await openPair(DIR_LEFT, DIR_RIGHT)
    await waitFor(() => expect(legendCount('same')).toBe(1))
    await closeOnlySession()
    // Same length, different bytes: only a fresh read can tell them apart.
    await port.writeTextFile(`${DIR_RIGHT}/same.txt`, 'diff\n')
    cleanup()
    mount(port)
    fireEvent.click(await screen.findByRole('button', { name: reopenName(DIR_LEFT, DIR_RIGHT) }, { timeout: 30_000 }))
    await screen.findByRole('status', { name: zh['shell.progress.label'] })
    await waitFor(() => expect(tabs()).toHaveLength(1), { timeout: 30_000 })
    await waitFor(() => expect(screen.queryByRole('status', { name: zh['shell.progress.label'] })).toBeNull())
    // A reused comparison cache would still say same; the fresh scan says modified.
    await waitFor(() => expect(legendCount('modified')).toBe(1))
    expect(legendCount('same')).toBe(0)
    const label = tabs()[0]?.querySelector('[role="tab"]')?.getAttribute('aria-label') ?? ''
    expect(label).toContain(DIR_LEFT)
    expect(label).toContain(DIR_RIGHT)
    expect(label).not.toContain('/snapshots/')
  }, 60_000)
})
