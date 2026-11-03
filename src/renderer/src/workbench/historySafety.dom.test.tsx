// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { comparisonHistoryId, removeComparisonHistoryEntry } from '@shared/history/model'
import { COMPARISON_HISTORY_STORAGE_KEY } from '@shared/history/types'
import type { PlatformPort } from '@shared/platform/types'
import { en, zh } from '@renderer/i18n/messages'
import type { MessageKey } from '@renderer/i18n/messages'
import {
  captureConsole, clickReopen, copy, delayed, DIR_LEFT, DIR_RIGHT, expectNotice, FILE_LEFT, FILE_RIGHT,
  FIXED, GONE, memoryPort, MERGE_BASE, MERGE_OURS, MERGE_THEIRS, mount, noResidue, reopenName, removeName,
  restoreWorkbenchSizes, rowFor, rows, seed, stubWorkbenchSizes, tabs
} from './historySafetyFixture'

beforeAll(stubWorkbenchSizes)
afterAll(restoreWorkbenchSizes)
beforeEach(() => localStorage.clear())
afterEach(() => cleanup())

describe('preflight stops before any session builder', () => {
  it('blocks missing sides for directory, file and merge without tabs or residue', async () => {
    const port = await memoryPort()
    await seed(port, [
      { kind: 'directory', paths: [GONE, DIR_RIGHT] },
      { kind: 'file', paths: [GONE, FILE_RIGHT] },
      { kind: 'merge', paths: [MERGE_BASE, GONE, MERGE_THEIRS] }
    ])
    mount(port)
    await clickReopen([GONE, DIR_RIGHT])
    await expectNotice('missing', 'left')
    expect(screen.getByRole('alert').textContent).not.toContain(GONE)
    noResidue()
    await clickReopen([GONE, FILE_RIGHT])
    await expectNotice('missing', 'left')
    noResidue()
    await clickReopen([MERGE_BASE, GONE, MERGE_THEIRS])
    await expectNotice('missing', 'ours')
    noResidue()
    await waitFor(async () => expect((await port.readComparisonHistory()).map((entry) => entry.error)).toEqual(['missing', 'missing', 'missing']))
  }, 30_000)
  it('distinguishes a type change from a missing path in both directions', async () => {
    const port = await memoryPort()
    await seed(port, [
      { kind: 'directory', paths: [FILE_LEFT, DIR_RIGHT] },
      { kind: 'file', paths: [DIR_LEFT, FILE_RIGHT] }
    ])
    mount(port)
    await clickReopen([FILE_LEFT, DIR_RIGHT])
    await expectNotice('type-changed', 'left')
    noResidue()
    await clickReopen([DIR_LEFT, FILE_RIGHT])
    await expectNotice('type-changed', 'left')
    noResidue()
    await waitFor(async () => expect((await port.readComparisonHistory()).every((entry) => entry.error === 'type-changed')).toBe(true))
  }, 30_000)
  it('reports unreadable probes and names the leftmost failing merge side', async () => {
    const base = await memoryPort()
    const port: PlatformPort = {
      ...base,
      statPath: async (path) => { if (path === FILE_RIGHT) throw new Error('EACCES'); return base.statPath(path) },
      listDirectory: async (path) => { if (path === DIR_LEFT) throw new Error('EACCES'); return base.listDirectory(path) }
    }
    await seed(base, [
      { kind: 'file', paths: [FILE_LEFT, FILE_RIGHT] },
      { kind: 'directory', paths: [DIR_LEFT, DIR_RIGHT] },
      { kind: 'merge', paths: [GONE, `${GONE}-2`, MERGE_THEIRS] }
    ])
    mount(port)
    await clickReopen([FILE_LEFT, FILE_RIGHT])
    await expectNotice('unreadable', 'right')
    noResidue()
    await clickReopen([DIR_LEFT, DIR_RIGHT])
    await expectNotice('unreadable', 'left')
    noResidue()
    await clickReopen([GONE, `${GONE}-2`, MERGE_THEIRS])
    await expectNotice('missing', 'base')
    expect(screen.getByRole('alert').textContent).not.toContain(GONE)
    noResidue()
    await waitFor(async () =>
      expect((await base.readComparisonHistory()).map((entry) => [entry.kind, entry.error])).toEqual([
        ['merge', 'missing'],
        ['directory', 'unreadable'],
        ['file', 'unreadable']
      ])
    )
  }, 30_000)
})

describe('persisted error rows', () => {
  it('renders the localized marker with data-history-error and keeps both actions enabled', async () => {
    const port = await memoryPort()
    await seed(port, [{ kind: 'file', paths: [FILE_LEFT, FILE_RIGHT], error: 'type-changed' }])
    mount(port)
    await waitFor(() => expect(rows()).toHaveLength(1))
    const row = rows()[0]!
    expect(row.getAttribute('data-history-error')).toBe('type-changed')
    expect(within(row).getByText(copy('shell.history.error.typeChanged'))).toBeDefined()
    const action = (name: string): boolean => (within(row).getByRole('button', { name }) as HTMLButtonElement).disabled
    expect(action(reopenName([FILE_LEFT, FILE_RIGHT]))).toBe(false)
    expect(action(removeName([FILE_LEFT, FILE_RIGHT]))).toBe(false)
  }, 30_000)
  it('removes exactly one error row and keeps the rest identical across a remount', async () => {
    const port = await memoryPort()
    await seed(port, [
      { kind: 'directory', paths: [DIR_LEFT, DIR_RIGHT], createdAt: FIXED + 2 },
      { kind: 'file', paths: [FILE_LEFT, FILE_RIGHT], createdAt: FIXED + 1, error: 'missing' },
      { kind: 'merge', paths: [MERGE_BASE, MERGE_OURS, MERGE_THEIRS], createdAt: FIXED }
    ])
    const before = await port.readComparisonHistory()
    const target = before[1]!
    mount(port)
    await waitFor(() => expect(rows()).toHaveLength(3))
    fireEvent.click(within(rowFor(target.id)).getByRole('button', { name: removeName([FILE_LEFT, FILE_RIGHT]) }))
    const expected = removeComparisonHistoryEntry(before, target.id)
    await waitFor(async () => expect(await port.readComparisonHistory()).toEqual(expected))
    expect(rows().map((row) => row.getAttribute('data-history-entry'))).toEqual(expected.map((entry) => entry.id))
    cleanup()
    mount(port)
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(document.querySelector(`[data-history-entry="${target.id}"]`)).toBeNull()
  }, 30_000)
  it('clears the stored error after a healthy reopen and moves the row to the front', async () => {
    const port = await memoryPort()
    await seed(port, [
      { kind: 'directory', paths: [DIR_LEFT, DIR_RIGHT], createdAt: FIXED + 5 },
      { kind: 'file', paths: [FILE_LEFT, FILE_RIGHT], createdAt: FIXED, error: 'missing' }
    ])
    mount(port)
    await clickReopen([FILE_LEFT, FILE_RIGHT])
    await waitFor(() => expect(tabs()).toHaveLength(1), { timeout: 30_000 })
    expect(document.body.textContent ?? '').toContain('alpha')
    await waitFor(async () => {
      const entries = await port.readComparisonHistory()
      expect([entries.length, entries[0]?.paths, 'error' in (entries[0] ?? {})]).toEqual([2, [FILE_LEFT, FILE_RIGHT], false])
    })
  }, 30_000)
  it('keeps the shell usable when the error-mark write rejects', async () => {
    const base = await memoryPort()
    const seeded = await seed(base, [{ kind: 'file', paths: [GONE, FILE_RIGHT] }])
    const port: PlatformPort = { ...base, writeComparisonHistory: async () => { throw new Error('storage unavailable') } }
    mount(port)
    await waitFor(() => expect(rows()).toHaveLength(1))
    fireEvent.click(await screen.findByRole('button', { name: reopenName([GONE, FILE_RIGHT]) }))
    await expectNotice('missing', 'left')
    expect(document.querySelector('dialog')).toBeNull()
    noResidue()
    expect((within(rows()[0]!).getByRole('button', { name: removeName([GONE, FILE_RIGHT]) }) as HTMLButtonElement).disabled).toBe(false)
    await expect(base.readComparisonHistory()).resolves.toEqual(seeded)
  }, 30_000)
  it('renders paired zh and en copy that never equals the message key', async () => {
    const codes = ['missing', 'unreadable', 'type-changed'] as const
    const keys = codes.map((code) => `shell.history.error.${code === 'type-changed' ? 'typeChanged' : code}` as MessageKey)
    expect(new Set(keys.map((key) => zh[key])).size).toBe(3)
    for (const key of keys) { expect(en[key]).not.toBe(zh[key]); expect(zh[key]).not.toBe(key) }
    const port = await memoryPort()
    await seed(port, [{ kind: 'file', paths: [GONE, FILE_RIGHT], error: 'missing' }])
    mount(port, 'en')
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(within(rows()[0]!).getByText(en['shell.history.error.missing'])).toBeDefined()
    fireEvent.click(await screen.findByRole('button', { name: en['shell.history.reopenTitle'].replace('{paths}', [GONE, FILE_RIGHT].join(' ↔ ')) }))
    expect(await screen.findByRole('alert')).toBeDefined()
    expect(screen.getByRole('alert').textContent).toContain(en['shell.history.errorNotice.missing'].replace('{side}', en['shell.history.side.left']))
    expect(screen.getByRole('alert').textContent).not.toContain('Could not reopen this comparison')
  }, 30_000)
})

describe('explicit clear', () => {
  it('needs a second click, writes the empty envelope and stays empty after a remount', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    const alert = vi.spyOn(window, 'alert')
    const port = await memoryPort()
    await seed(port, [{ kind: 'file', paths: [FILE_LEFT, FILE_RIGHT] }, { kind: 'directory', paths: [DIR_LEFT, DIR_RIGHT] }])
    mount(port)
    await waitFor(() => expect(rows()).toHaveLength(2))
    fireEvent.click(screen.getByRole('button', { name: copy('shell.history.clearTitle') }))
    expect(rows()).toHaveLength(2)
    await expect(port.readComparisonHistory()).resolves.toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: copy('shell.history.clearConfirm') }))
    await waitFor(() => expect(rows()).toHaveLength(0))
    expect(screen.queryByText(copy('shell.history.title'))).toBeNull()
    await expect(port.readComparisonHistory()).resolves.toEqual([])
    expect(JSON.parse(localStorage.getItem(COMPARISON_HISTORY_STORAGE_KEY) ?? '')).toEqual({ version: 1, entries: [] })
    expect([confirm.mock.calls.length, alert.mock.calls.length]).toEqual([0, 0])
    confirm.mockRestore()
    alert.mockRestore()
    cleanup()
    mount(port)
    await waitFor(async () => expect(await port.readComparisonHistory()).toEqual([]))
    expect(rows()).toHaveLength(0)
    expect(screen.queryByText(copy('shell.history.title'))).toBeNull()
    expect(screen.queryByRole('button', { name: copy('shell.history.clearTitle') })).toBeNull()
  }, 30_000)
})

describe('20-record cap across mixed kinds', () => {
  const kinds = ['directory', 'file', 'merge'] as const
  const pathsFor = (index: number): readonly string[] => kinds[index % 3] === 'merge'
    ? [`/memory/cap/base-${index}.ts`, `/memory/cap/ours-${index}.ts`, `/memory/cap/theirs-${index}.ts`]
    : [`/memory/cap/left-${index}`, `/memory/cap/right-${index}`]
  it('renders exactly the newest 20 of 25 mixed rows and drops the oldest 5', async () => {
    const port = await memoryPort()
    const seeded = await seed(port, Array.from({ length: 25 }, (_, index) => ({ kind: kinds[index % 3]!, paths: pathsFor(index), createdAt: FIXED - index * 1000 })))
    mount(port)
    await waitFor(() => expect(rows()).toHaveLength(20))
    const kept = seeded.slice(0, 20)
    const dropped = seeded.slice(20)
    expect(rows().map((row) => row.getAttribute('data-history-entry'))).toEqual(kept.map((entry) => entry.id))
    for (const entry of dropped) expect(document.querySelector(`[data-history-entry="${entry.id}"]`)).toBeNull()
    for (const kind of kinds) expect(kept.some((entry) => entry.kind === kind)).toBe(true)
    expect(new Set(dropped.map((entry) => entry.kind))).toEqual(new Set(kinds))
  }, 30_000)
  it('trims a full list back to 20 with the new identity first', async () => {
    const port = await memoryPort()
    const seeded = await seed(port, Array.from({ length: 20 }, (_, index) => ({
      kind: 'file' as const, paths: [`/memory/cap/left-${index + 3}`, `/memory/cap/right-${index + 3}`], createdAt: FIXED - index * 1000
    })))
    mount(port)
    fireEvent.click(screen.getAllByRole('button', { name: copy('shell.toolbar.newCompare') })[0]!)
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(copy('shell.compare.leftPath')), { target: { value: FILE_LEFT } })
    fireEvent.change(within(dialog).getByLabelText(copy('shell.compare.rightPath')), { target: { value: FILE_RIGHT } })
    fireEvent.click(within(dialog).getByRole('button', { name: copy('shell.compare.submit') }))
    await waitFor(() => expect(tabs()).toHaveLength(1), { timeout: 30_000 })
    await waitFor(async () => {
      const entries = await port.readComparisonHistory()
      expect([entries.length, entries[0]?.id]).toEqual([20, comparisonHistoryId('file', [FILE_LEFT, FILE_RIGHT])])
      expect([entries.some((entry) => entry.id === seeded[19]!.id), entries.some((entry) => entry.id === seeded[0]!.id)]).toEqual([false, true])
    })
  }, 30_000)
})

describe('healthy reopen still builds the session', () => {
  it('reopens a directory with real progress and clears its stored error', async () => {
    const port = delayed(await memoryPort())
    await seed(port, [{ kind: 'directory', paths: [DIR_LEFT, DIR_RIGHT], error: 'missing' }])
    mount(port)
    await waitFor(() => expect(rows()).toHaveLength(1))
    fireEvent.click(await screen.findByRole('button', { name: reopenName([DIR_LEFT, DIR_RIGHT]) }))
    await screen.findByRole('status', { name: copy('shell.progress.label') })
    await waitFor(() => expect(tabs()).toHaveLength(1), { timeout: 30_000 })
    await waitFor(() => expect(screen.queryByRole('status', { name: copy('shell.progress.label') })).toBeNull())
    expect(document.querySelectorAll('[data-legend-status]').length).toBeGreaterThan(0)
    await waitFor(async () => expect((await port.readComparisonHistory())[0]?.error).toBeUndefined())
  }, 30_000)
  it('reopens a merge and a file pair with no leftover error', async () => {
    const port = await memoryPort()
    await seed(port, [
      { kind: 'merge', paths: [MERGE_BASE, MERGE_OURS, MERGE_THEIRS], error: 'unreadable' },
      { kind: 'file', paths: [FILE_LEFT, FILE_RIGHT], error: 'type-changed' }
    ])
    mount(port)
    await clickReopen([MERGE_BASE, MERGE_OURS, MERGE_THEIRS])
    await waitFor(() => expect(tabs()).toHaveLength(1), { timeout: 30_000 })
    cleanup()
    mount(port)
    await clickReopen([FILE_LEFT, FILE_RIGHT])
    await waitFor(() => expect(tabs()).toHaveLength(1), { timeout: 30_000 })
    await waitFor(async () => {
      const entries = await port.readComparisonHistory()
      expect([entries.length, entries.every((entry) => entry.error === undefined)]).toEqual([2, true])
    })
  }, 30_000)
})

describe('path privacy across the whole safety flow', () => {
  it('keeps every real path out of console output for failure, remove and clear', async () => {
    const port = await memoryPort()
    const seeded = await seed(port, [
      { kind: 'file', paths: [GONE, FILE_RIGHT], error: 'missing' },
      ...Array.from({ length: 21 }, (_, index) => ({ kind: 'file' as const, paths: [`/memory/cap/private-left-${index}`, `/memory/cap/private-right-${index}`], createdAt: FIXED - index }))
    ])
    const calls: string[] = []
    const restore = captureConsole(calls)
    try {
      mount(port)
      await waitFor(() => expect(rows()).toHaveLength(20))
      await clickReopen([GONE, FILE_RIGHT])
      await expectNotice('missing', 'left')
      fireEvent.click(within(rows().find((row) => row.getAttribute('data-history-error') === 'missing')!).getByRole('button', { name: removeName([GONE, FILE_RIGHT]) }))
      await waitFor(() => expect(rows()).toHaveLength(19))
      fireEvent.click(screen.getByRole('button', { name: copy('shell.history.clearTitle') }))
      fireEvent.click(screen.getByRole('button', { name: copy('shell.history.clearConfirm') }))
      await waitFor(() => expect(rows()).toHaveLength(0))
      const output = calls.join('\n')
      for (const path of [GONE, FILE_RIGHT, ...seeded.flatMap((entry) => entry.paths)]) expect(output).not.toContain(path)
    } finally {
      restore()
    }
  }, 30_000)
})
