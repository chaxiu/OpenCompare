// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMergeModel, renderMerge, renderMergeText } from '@core/text/merge'
import type { MergeResolutions } from '@core/text/merge'
import { resolveComparisonSwitches } from '@core/text/normalize'
import { upsertComparisonHistory } from '@shared/history/model'
import type { PlatformPort, SaveFileOptions } from '@shared/platform/types'
import { zh } from '@renderer/i18n/messages'
import type { MessageKey } from '@renderer/i18n/messages'
import { renderWithI18n } from '@renderer/i18n/testing'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { Workbench } from './Workbench'

const BASE = '/memory/merge/base.txt'
const OURS = '/memory/merge/ours.txt'
const THEIRS = '/memory/merge/theirs.txt'
const BASE_TEXT = 'head\nvalue = 1\nmid\ntail\n'
const OURS_TEXT = 'head\nvalue = ours\nmid\ntail\n'
const THEIRS_TEXT = 'head\nvalue = theirs\nmid\ntail\n'
const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
const copy = (key: string): string => zh[key as MessageKey]
const tabs = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('[data-session-tab]'))
const rows = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('[data-history-entry]'))
const rowPaths = (row: HTMLElement): string => row.querySelector('[data-history-paths]')?.getAttribute('title') ?? ''
const panel = (path: string): HTMLElement => document.querySelector<HTMLElement>(`section header span[title="${path}"]`)!.closest('section')!
const conflicts = (): number => Number(/冲突块\s*(\d+)/.exec(screen.getByRole('contentinfo').textContent ?? '')?.[1])
const reopenName = (paths: string[]): string => copy('shell.history.reopenTitle').replace('{paths}', paths.join(' ↔ '))
const readHistory = (port: PlatformPort) => port.readComparisonHistory()
const closeTab = (tab: HTMLElement): void => {
  fireEvent.click(within(tab).getByRole('button', { name: /^关闭 / }))
}
const reopenButton = (paths: string[]): HTMLElement => within(rows().find((row) => rowPaths(row) === paths.join(' ↔ '))!).getByRole('button', { name: reopenName(paths) })
const mergeError = (code: string, path: string): string => copy(`shell.merge.error.${code}`).replace('{side}', copy('files.merge.side.base')).replace('{path}', path)
const switchEl = (id: string): HTMLElement => document.querySelector<HTMLElement>(`[data-code-switch="${id}"]`)!
const historyKeys = (): string[] => Object.keys(localStorage).sort()
const mount = (port: PlatformPort): void => {
  renderWithI18n(<Workbench platform={port} />, 'zh')
}
async function openPair(left: string, right: string): Promise<void> {
  fireEvent.click(screen.getAllByRole('button', { name: copy('shell.toolbar.newCompare') })[0]!)
  const dialog = await screen.findByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText(copy('shell.compare.leftPath')), { target: { value: left } })
  fireEvent.change(within(dialog).getByLabelText(copy('shell.compare.rightPath')), { target: { value: right } })
  fireEvent.click(within(dialog).getByRole('button', { name: copy('shell.compare.submit') }))
  await waitFor(() => expect(tabs()).toHaveLength(1), { timeout: 30_000 })
}
async function closeAllTabs(): Promise<void> {
  while (tabs().length > 0) {
    const count = tabs().length
    closeTab(tabs()[0]!)
    await waitFor(() => expect(tabs()).toHaveLength(count - 1))
  }
}
async function clickReopen(paths: string[]): Promise<void> {
  const title = paths.join(' ↔ ')
  await waitFor(() => expect(rows().some((row) => rowPaths(row) === title)).toBe(true))
  fireEvent.click(reopenButton(paths))
}

function captureConsole(): { calls: string[]; restore: () => void } {
  const calls: string[] = []
  const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation((...args) => {
      calls.push(args.map(String).join(' '))
    })
  )
  return { calls, restore: () => spies.forEach((spy) => spy.mockRestore()) }
}

async function trioPort(): Promise<PlatformPort> {
  const port = createWebPlatformPort()
  await port.writeTextFile(BASE, BASE_TEXT)
  await port.writeTextFile(OURS, OURS_TEXT)
  await port.writeTextFile(THEIRS, THEIRS_TEXT)
  return port
}

async function openDialog(): Promise<HTMLElement> {
  fireEvent.click(screen.getAllByRole('button', { name: copy('shell.toolbar.newCompare') })[0]!)
  return screen.findByRole('dialog')
}

const field = (dialog: HTMLElement, key: string): HTMLInputElement => within(dialog).getByLabelText(copy(`files.merge.side.${key}`)) as HTMLInputElement

function fill(dialog: HTMLElement, base: string, ours: string, theirs: string): void {
  fireEvent.click(within(dialog).getByRole('tab', { name: copy('shell.compare.mode.merge') }))
  fireEvent.change(field(dialog, 'base'), { target: { value: base } })
  fireEvent.change(field(dialog, 'ours'), { target: { value: ours } })
  fireEvent.change(field(dialog, 'theirs'), { target: { value: theirs } })
  fireEvent.click(within(dialog).getByRole('button', { name: copy('shell.compare.submit') }))
}

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

describe('merge dialog entry', () => {
  it('keeps pair and merge modes apart and never adds a tab for an invalid side', async () => {
    const memory = await trioPort()
    await memory.writeTextFile('/memory/merge/dir/inner.txt', 'x\n')
    await memory.writeTextFile('/memory/merge/base.bin', 'x\n')
    const denied = '/memory/merge/denied.txt'
    const port: PlatformPort = { ...memory, statPath: async (path) => { if (path === denied) throw new Error('EACCES'); return memory.statPath(path) } }
    renderWithI18n(<Workbench platform={port} />, 'zh')
    const dialog = await openDialog()
    fireEvent.change(within(dialog).getByLabelText(copy('shell.compare.leftPath')), { target: { value: '/memory/pair/left.txt' } })
    fireEvent.change(within(dialog).getByLabelText(copy('shell.compare.rightPath')), { target: { value: '/memory/pair/right.txt' } })
    fireEvent.click(within(dialog).getByRole('tab', { name: copy('shell.compare.mode.merge') }))
    expect(within(dialog).queryByLabelText(copy('shell.compare.leftPath'))).toBeNull()
    for (const key of ['shell.compare.pickFiles', 'shell.compare.pickFolders']) expect(within(dialog).queryByRole('button', { name: copy(key) })).toBeNull()
    fireEvent.change(field(dialog, 'base'), { target: { value: BASE } })
    fireEvent.click(within(dialog).getByRole('tab', { name: copy('shell.compare.mode.pair') }))
    expect((within(dialog).getByLabelText(copy('shell.compare.leftPath')) as HTMLInputElement).value).toBe('/memory/pair/left.txt')
    fireEvent.click(within(dialog).getByRole('tab', { name: copy('shell.compare.mode.merge') }))
    expect(field(dialog, 'base').value).toBe(BASE)

    const cases: readonly (readonly [string, string, string])[] = [
      ['', 'EMPTY_PATH', ''],
      ['/memory/merge/missing.txt', 'NOT_FOUND', '/memory/merge/missing.txt'],
      ['/memory/merge/dir', 'NOT_A_FILE', '/memory/merge/dir'],
      ['/memory/merge/base.bin', 'UNSUPPORTED_FILE_TYPE', '/memory/merge/base.bin'],
      [denied, 'ACCESS_DENIED', denied]
    ]
    for (const [value, code, path] of cases) {
      fill(dialog, value, OURS, THEIRS)
      const alerts = await within(dialog).findAllByRole('alert')
      expect(alerts).toHaveLength(1)
      expect(alerts[0]!.textContent).toBe(mergeError(code, path))
      expect(tabs()).toHaveLength(0)
      expect(screen.getByRole('dialog')).toBe(dialog)
    }
  }, 60_000)
})

describe('real merge session', () => {
  it('renders the three real files, counts real conflicts and saves the resolved preview', async () => {
    const { calls, restore } = captureConsole()
    let saved: SaveFileOptions | null = null
    const port: PlatformPort = { ...(await trioPort()), saveFile: async (options) => { saved = options; return '/memory/merged.txt' } }
    renderWithI18n(<Workbench platform={port} />, 'zh')
    fill(await openDialog(), BASE, OURS, THEIRS)
    await waitFor(() => expect(tabs()).toHaveLength(1))

    expect(tabs()[0]!.getAttribute('data-session-tab')).toBe(`merge:${BASE} ↔ ${OURS} ↔ ${THEIRS}`)
    expect(tabs()[0]!.getAttribute('data-session-tab')).not.toContain('/samples/')
    expect(screen.queryByRole('tablist', { name: copy('files.code.modeLabel') })).toBeNull()
    const tab = screen.getByRole('tab', { name: /base\.txt/ })
    for (const path of [BASE, OURS, THEIRS]) expect(tab.getAttribute('title')).toContain(path)
    expect(within(panel(BASE)).getByText('value = 1')).toBeDefined()
    expect(within(panel(OURS)).getByText('value = ours')).toBeDefined()
    expect(within(panel(THEIRS)).getByText('value = theirs')).toBeDefined()

    const model = buildMergeModel(BASE_TEXT, OURS_TEXT, THEIRS_TEXT)
    const total = model.conflictIds.length
    expect(total).toBeGreaterThan(0)
    await waitFor(() => expect(conflicts()).toBe(total))
    expect((screen.getByRole('button', { name: copy('files.merge.export') }) as HTMLButtonElement).disabled).toBe(true)

    for (let index = 0; index < total; index += 1) {
      const label = screen.getByText(copy('files.merge.conflict').replace('{n}', String(index + 1)))
      fireEvent.click(within(label.closest('div') as HTMLElement).getByRole('button', { name: copy('files.merge.accept.ours') }))
      await waitFor(() => expect(conflicts()).toBe(total - index - 1))
    }
    const resolutions = Object.fromEntries(model.conflictIds.map((id) => [id, 'ours'])) as MergeResolutions
    fireEvent.click(screen.getByRole('button', { name: copy('files.merge.export') }))
    await waitFor(() => expect(saved).not.toBeNull())
    expect(saved!.content).toBe(renderMergeText(renderMerge(model, resolutions)))
    expect(saved!.content).not.toContain('<<<<<<<')
    restore()
    for (const path of [BASE, OURS, THEIRS]) expect(calls.join('\n')).not.toContain(path)
  }, 60_000)

  it('records and reopens one merge row, and a missing side changes nothing', async () => {
    const { calls, restore } = captureConsole()
    let gone = false
    const memory = await trioPort()
    const port: PlatformPort = { ...memory, readTextFile: async (path) => { if (gone && path === THEIRS) throw new Error('ENOENT'); return memory.readTextFile(path) } }
    renderWithI18n(<Workbench platform={port} />, 'zh')
    fill(await openDialog(), BASE, OURS, THEIRS)
    await waitFor(() => expect(tabs()).toHaveLength(1))
    const id = tabs()[0]!.getAttribute('data-session-tab')
    const ordered = [BASE, OURS, THEIRS]
    let history = await readHistory(port)
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ kind: 'merge', paths: ordered, ...resolveComparisonSwitches({}) })
    const historyId = history[0]!.id
    const createdAt = history[0]!.createdAt

    await memory.writeTextFile(OURS, 'head\nvalue = ours2\nmid\ntail\n')
    fill(await openDialog(), BASE, OURS, THEIRS)
    await waitFor(() => expect(tabs()).toHaveLength(1))
    expect(tabs()[0]!.getAttribute('data-session-tab')).toBe(id)
    await waitFor(() => expect(within(panel(OURS)).queryByText('value = ours2')).not.toBeNull())
    history = await readHistory(port)
    expect(history).toHaveLength(1)
    expect(history[0]!.id).toBe(historyId)
    expect(history[0]!.createdAt).toBeGreaterThan(createdAt)

    fill(await openDialog(), BASE, THEIRS, OURS)
    await waitFor(() => expect(tabs()).toHaveLength(2))
    expect(await readHistory(port)).toHaveLength(2)
    for (const tab of tabs()) closeTab(tab)
    await waitFor(() => expect(tabs()).toHaveLength(0))

    await memory.writeTextFile(OURS, 'head\nvalue = ours3\nmid\ntail\n')
    fireEvent.click(reopenButton(ordered))
    await waitFor(() => expect(tabs()).toHaveLength(1))
    expect(tabs()[0]!.getAttribute('data-session-tab')).toBe(id)
    await waitFor(() => expect(within(panel(OURS)).queryByText('value = ours3')).not.toBeNull())
    history = await readHistory(port)
    expect(history.find((entry) => entry.id === historyId)!.createdAt).toBeGreaterThan(createdAt)
    expect(history).toHaveLength(2)

    gone = true
    const before = JSON.stringify(await readHistory(port))
    closeTab(tabs()[0]!)
    await waitFor(() => expect(tabs()).toHaveLength(0))
    fireEvent.click(reopenButton(ordered))
    expect(await screen.findByText(copy('shell.history.reopenFailed'))).toBeDefined()
    expect(tabs()).toHaveLength(0)
    expect(JSON.stringify(await readHistory(port))).toBe(before)
    restore()
    for (const path of ordered) expect(calls.join('\n')).not.toContain(path)
  }, 60_000)
})

describe('merge history switch fidelity', () => {
  it('keeps the entry switches across a restart and restores them into the shell', async () => {
    const { calls, restore } = captureConsole()
    const pairLeft = '/memory/merge/pair-left.txt'
    const pairRight = '/memory/merge/pair-right.txt'
    const second = ['/memory/merge/second-base.txt', '/memory/merge/second-ours.txt', '/memory/merge/second-theirs.txt']
    const NON_DEFAULT = { ignoreNewline: false, ignoreEncoding: true, ignoreWhitespace: true }
    const ordered = [BASE, OURS, THEIRS]
    try {
      const port = await trioPort()
      await port.writeTextFile(pairLeft, 'alpha\nbeta\n')
      await port.writeTextFile(pairRight, 'alpha\ngamma\n')
      for (const path of second) await port.writeTextFile(path, 'one\ntwo\nthree\n')
      mount(port)
      await openPair(pairLeft, pairRight)
      await waitFor(() => expect(switchEl('ignore-whitespace')).not.toBeNull())
      fireEvent.click(switchEl('ignore-whitespace'))
      fireEvent.click(switchEl('ignore-newline'))
      expect(switchEl('ignore-whitespace').getAttribute('aria-checked')).toBe('true')
      expect(switchEl('ignore-newline').getAttribute('aria-checked')).toBe('false')
      await closeAllTabs()

      const before = await readHistory(port)
      fill(await openDialog(), BASE, OURS, THEIRS)
      await waitFor(() => expect(tabs()).toHaveLength(1))
      const afterCreate = await readHistory(port)
      const mergeRows = afterCreate.filter((entry) => entry.kind === 'merge')
      expect(afterCreate).toHaveLength(before.length + 1)
      expect(mergeRows).toHaveLength(1)
      expect(mergeRows[0]).toMatchObject({ kind: 'merge', paths: ordered, ...NON_DEFAULT })
      const entryId = mergeRows[0]!.id
      const createdAt = mergeRows[0]!.createdAt
      const sessionTab = tabs()[0]!.getAttribute('data-session-tab')
      expect(historyKeys()).toEqual(['opencompare.comparisonHistory'])

      cleanup()
      mount(port)
      const nextBase = 'alpha\nbase-one\nalpha\nbase-two\nalpha\n'
      const nextOurs = 'alpha\nours-one\nalpha\nours-two\nalpha\n'
      const nextTheirs = 'alpha\ntheirs-one\nalpha\ntheirs-two\nalpha\n'
      await port.writeTextFile(BASE, nextBase)
      await port.writeTextFile(OURS, nextOurs)
      await port.writeTextFile(THEIRS, nextTheirs)
      const nextTotal = buildMergeModel(nextBase, nextOurs, nextTheirs).conflictIds.length
      expect(nextTotal).not.toBe(buildMergeModel(BASE_TEXT, OURS_TEXT, THEIRS_TEXT).conflictIds.length)

      await clickReopen(ordered)
      await waitFor(() => expect(tabs()).toHaveLength(1))
      expect(tabs()[0]!.getAttribute('data-session-tab')).toBe(sessionTab)
      await waitFor(() => expect(within(panel(OURS)).queryByText('ours-two')).not.toBeNull())
      expect(within(panel(BASE)).getByText('base-one')).toBeDefined()
      expect(within(panel(THEIRS)).getByText('theirs-two')).toBeDefined()
      await waitFor(() => expect(conflicts()).toBe(nextTotal))

      let history = await readHistory(port)
      const reopened = history.find((entry) => entry.id === entryId)!
      expect(reopened).toMatchObject({ kind: 'merge', paths: ordered, ...NON_DEFAULT })
      expect(reopened.createdAt).toBeGreaterThan(createdAt)

      // The same trio reopens twice more without a new row or a second tab.
      await closeAllTabs()
      await clickReopen(ordered)
      await waitFor(() => expect(tabs()).toHaveLength(1))
      await closeAllTabs()
      await clickReopen(ordered)
      await waitFor(() => expect(tabs()).toHaveLength(1))
      history = await readHistory(port)
      const trioRows = history.filter((entry) => entry.kind === 'merge' && entry.paths.join('\u0000') === ordered.join('\u0000'))
      expect(trioRows).toHaveLength(1)
      expect(trioRows[0]!.id).toBe(entryId)
      expect(tabs()[0]!.getAttribute('data-session-tab')).toBe(sessionTab)

      // A fresh trio records the shell switches restored by the reopen.
      fill(await openDialog(), second[0]!, second[1]!, second[2]!)
      await waitFor(() => expect(tabs()).toHaveLength(2))
      history = await readHistory(port)
      expect(history.find((entry) => entry.paths.join('\u0000') === second.join('\u0000'))).toMatchObject({
        kind: 'merge',
        ...NON_DEFAULT
      })
      expect(historyKeys()).toEqual(['opencompare.comparisonHistory'])
      const output = calls.join('\n')
      for (const path of [...ordered, pairLeft, pairRight, ...second]) expect(output).not.toContain(path)
    } finally {
      restore()
    }
  }, 60_000)

  it('leaves tabs, history and shell switches untouched when a reopened side is gone', async () => {
    const { calls, restore } = captureConsole()
    const pairLeft = '/memory/merge/failure-pair-left.txt'
    const pairRight = '/memory/merge/failure-pair-right.txt'
    const ordered = [BASE, OURS, THEIRS]
    try {
      const port = await trioPort()
      await port.writeTextFile(pairLeft, 'alpha\nbeta\n')
      await port.writeTextFile(pairRight, 'alpha\ngamma\n')
      const seeded = upsertComparisonHistory([], {
        kind: 'merge',
        paths: ordered,
        createdAt: 1_700_000_000_000,
        ignoreNewline: false,
        ignoreEncoding: false,
        ignoreWhitespace: true
      })
      await port.writeComparisonHistory(seeded)
      mount(port)
      await waitFor(() => expect(rows()).toHaveLength(1))
      const before = JSON.stringify(await readHistory(port))
      await port.deleteFile(THEIRS)

      await clickReopen(ordered)
      const alert = await screen.findByText(copy('shell.history.reopenFailed'))
      expect(alert.textContent).not.toContain(THEIRS)
      expect(tabs()).toHaveLength(0)
      expect(JSON.stringify(await readHistory(port))).toBe(before)
      expect(historyKeys()).toEqual(['opencompare.comparisonHistory'])

      // The stored combination (whitespace on, newline / encoding off) must not
      // leak into the shell after the failure.
      await openPair(pairLeft, pairRight)
      await waitFor(() => expect(switchEl('ignore-whitespace')).not.toBeNull())
      expect(switchEl('ignore-whitespace').getAttribute('aria-checked')).toBe('false')
      expect(switchEl('ignore-newline').getAttribute('aria-checked')).toBe('true')
      expect(switchEl('ignore-encoding').getAttribute('aria-checked')).toBe('true')
      const output = calls.join('\n')
      for (const path of [...ordered, pairLeft, pairRight]) expect(output).not.toContain(path)
    } finally {
      restore()
    }
  }, 60_000)

  it('reopens a merge next to directory and file rows without disturbing them', async () => {
    const dirLeft = '/memory/merge-coexist/dir-left'
    const dirRight = '/memory/merge-coexist/dir-right'
    const fileLeft = '/memory/merge-coexist/file-left.txt'
    const fileRight = '/memory/merge-coexist/file-right.txt'
    const ordered = [BASE, OURS, THEIRS]
    const DEFAULTS = resolveComparisonSwitches({})
    const NON_DEFAULT = { ignoreNewline: false, ignoreEncoding: false, ignoreWhitespace: true }
    const port = await trioPort()
    await port.writeTextFile(`${dirLeft}/same.txt`, 'same\n')
    await port.writeTextFile(`${dirRight}/same.txt`, 'same\n')
    await port.writeTextFile(fileLeft, 'alpha\n')
    await port.writeTextFile(fileRight, 'alpha\nbeta\n')
    let seeded = upsertComparisonHistory([], { kind: 'directory', paths: [dirLeft, dirRight], createdAt: 3_000, ...DEFAULTS })
    seeded = upsertComparisonHistory(seeded, { kind: 'file', paths: [fileLeft, fileRight], createdAt: 2_000, ...DEFAULTS })
    seeded = upsertComparisonHistory(seeded, { kind: 'merge', paths: ordered, createdAt: 1_000, ...NON_DEFAULT })
    await port.writeComparisonHistory(seeded)

    mount(port)
    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(rows().map(rowPaths)).toEqual([
      `${dirLeft} ↔ ${dirRight}`,
      `${fileLeft} ↔ ${fileRight}`,
      ordered.join(' ↔ ')
    ])

    await clickReopen(ordered)
    await waitFor(() => expect(tabs()).toHaveLength(1))
    const afterMerge = await readHistory(port)
    expect(afterMerge.filter((entry) => entry.kind !== 'merge')).toEqual(seeded.filter((entry) => entry.kind !== 'merge'))
    const mergeRow = afterMerge.find((entry) => entry.kind === 'merge')!
    expect(mergeRow).toMatchObject({ id: seeded[2]!.id, paths: ordered, ...NON_DEFAULT })

    await closeAllTabs()
    await clickReopen([dirLeft, dirRight])
    await waitFor(() => expect(tabs()).toHaveLength(1), { timeout: 30_000 })
    const afterDirectory = await readHistory(port)
    expect(afterDirectory.find((entry) => entry.kind === 'merge')).toEqual(mergeRow)

    await closeAllTabs()
    await clickReopen([fileLeft, fileRight])
    await waitFor(() => expect(tabs()).toHaveLength(1), { timeout: 30_000 })
    const afterFile = await readHistory(port)
    expect(afterFile.find((entry) => entry.kind === 'merge')).toEqual(mergeRow)

    await closeAllTabs()
    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(rows().map(rowPaths)).toEqual(expect.arrayContaining([
      `${dirLeft} ↔ ${dirRight}`,
      `${fileLeft} ↔ ${fileRight}`,
      ordered.join(' ↔ ')
    ]))
    expect(historyKeys()).toEqual(['opencompare.comparisonHistory'])
  }, 60_000)
})
