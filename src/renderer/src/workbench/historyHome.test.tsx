// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComparisonSwitches } from '@core/text/normalize'
import type { ComparisonHistoryEntry, ComparisonHistoryKind, ComparisonHistorySwitches } from '@shared/history/types'
import { interpolate } from '@renderer/i18n/interpolate'
import { zh } from '@renderer/i18n/messages'
import { renderWithI18n } from '@renderer/i18n/testing'
import { HistoryHome } from './historyHome'
import { formatHistoryTime, historyCandidate, historyIdFor, historyPathsText, withHistorySwitches } from './historyHomeModel'

const A = '/Volumes/Work/alpha'
const B = '/Volumes/Work/beta'
const BASE_TIME = Date.UTC(2026, 10, 4, 9, 5)
const SWITCHES: ComparisonHistorySwitches = { ignoreWhitespace: true, ignoreNewline: false, ignoreEncoding: true }
const makeEntry = (kind: ComparisonHistoryKind, paths: readonly string[], createdAt: number, switches: ComparisonHistorySwitches = SWITCHES): ComparisonHistoryEntry => ({ id: historyIdFor(kind, paths), kind, paths: [...paths], createdAt, ...switches })
const DIRECTORY = makeEntry('directory', [A, B], BASE_TIME)
const FILE = makeEntry('file', ['/work/left.ts', '/work/right.ts'], BASE_TIME - 60_000)
const MERGE = makeEntry('merge', ['/repo/base.ts', '/repo/ours.ts', '/repo/theirs.ts'], BASE_TIME - 120_000)
const ENTRIES: readonly ComparisonHistoryEntry[] = [DIRECTORY, FILE, MERGE]
const MANY: readonly ComparisonHistoryEntry[] = Array.from({ length: 20 }, (_, index) =>
  makeEntry('file', [`/work/many-left-${index}.ts`, `/work/many-right-${index}.ts`], BASE_TIME - index * 1000)
)
const el = (selector: string): HTMLElement => document.querySelector<HTMLElement>(selector)!
const actionLabel = (key: 'shell.history.reopenTitle' | 'shell.history.removeTitle', entry: ComparisonHistoryEntry): string => interpolate(zh[key], { paths: historyPathsText(entry) })

function renderHome(entries: readonly ComparisonHistoryEntry[] = ENTRIES, busy = false) {
  const onReopen = vi.fn(), onRemove = vi.fn()
  renderWithI18n(<HistoryHome entries={entries} onReopen={onReopen} onRemove={onRemove} busy={busy} />, 'zh')
  return { onReopen, onRemove }
}

afterEach(cleanup)

describe('historyHomeModel', () => {
  it('joins two absolute paths with the arrow separator', () => {
    expect(historyPathsText({ paths: [A, B] })).toBe(`${A} ↔ ${B}`)
  })
  it('formats one timestamp differently per language, keeping year and clock', () => {
    const zhText = formatHistoryTime(BASE_TIME, 'zh')
    const enText = formatHistoryTime(BASE_TIME, 'en')
    expect(zhText).not.toBe(enText)
    for (const text of [zhText, enText]) { expect(text).toContain('2026'); expect(text).toMatch(/\d{1,2}:\d{2}/) }
  })
  it('copies candidate paths and passes switches and time through', () => {
    const paths = [A, B]
    const switches: ComparisonSwitches = { ignoreWhitespace: false, ignoreNewline: true, ignoreEncoding: false }
    const candidate = historyCandidate('file', paths, switches, BASE_TIME)
    expect(candidate.paths).toEqual([A, B])
    expect(candidate.paths).not.toBe(paths)
    expect(candidate).toMatchObject({ kind: 'file', createdAt: BASE_TIME, ...switches })
  })
  it('derives a stable id from kind and ordered paths', () => {
    expect(historyIdFor('directory', [A, B])).toBe(historyIdFor('directory', [A, B]))
    expect(historyIdFor('directory', [A, B])).not.toBe(historyIdFor('directory', [B, A]))
    expect(historyIdFor('directory', [A, B])).not.toBe(historyIdFor('file', [A, B]))
  })
  it('updates only the target switches and keeps the list when nothing changes', () => {
    const nextSwitches: ComparisonHistorySwitches = { ignoreWhitespace: false, ignoreNewline: true, ignoreEncoding: false }
    const next = withHistorySwitches(ENTRIES, DIRECTORY.id, nextSwitches)
    expect(next).not.toBe(ENTRIES)
    expect(next[0]).toEqual({ ...DIRECTORY, ...nextSwitches })
    expect(next[0]?.createdAt).toBe(DIRECTORY.createdAt)
    expect(next.slice(1)).toEqual([FILE, MERGE])
    expect(withHistorySwitches(ENTRIES, DIRECTORY.id, SWITCHES)).toBe(ENTRIES)
    expect(withHistorySwitches(ENTRIES, 'unknown-id', nextSwitches)).toBe(ENTRIES)
  })
})

describe('HistoryHome', () => {
  it('renders nothing when there are no entries', () => {
    renderHome([])
    expect(document.body.textContent).not.toContain(zh['shell.history.title'])
    expect(document.querySelectorAll('[data-history-entry]')).toHaveLength(0)
  })
  it('renders every entry in the given order without re-sorting', () => {
    renderHome()
    const rows = [...document.querySelectorAll('[data-history-entry]')]
    expect(rows).toHaveLength(3)
    expect(rows.map((row) => row.getAttribute('data-history-entry'))).toEqual([DIRECTORY.id, FILE.id, MERGE.id])
  })
  it('shows the full path text in title and body of a monospaced truncated span', () => {
    renderHome()
    const paths = el(`[data-history-entry="${DIRECTORY.id}"] [data-history-paths]`)
    expect(paths.getAttribute('title')).toBe(`${A} ↔ ${B}`)
    expect(paths.textContent).toBe(`${A} ↔ ${B}`)
    expect([paths.className.includes('truncate'), paths.className.includes('font-mono')]).toEqual([true, true])
  })
  it('shows the localized time from the shared formatter', () => {
    renderHome()
    expect(el(`[data-history-entry="${DIRECTORY.id}"] [data-history-time]`).textContent).toBe(formatHistoryTime(DIRECTORY.createdAt, 'zh'))
  })
  it('reopens and removes exactly the clicked entry', () => {
    const { onReopen, onRemove } = renderHome()
    fireEvent.click(screen.getByLabelText(actionLabel('shell.history.reopenTitle', FILE)))
    expect(onReopen).toHaveBeenCalledWith(FILE)
    fireEvent.click(screen.getByLabelText(actionLabel('shell.history.removeTitle', FILE)))
    expect(onRemove).toHaveBeenCalledWith(FILE.id)
    expect([onReopen.mock.calls.length, onRemove.mock.calls.length]).toEqual([1, 1])
  })
  it('disables both actions while busy', () => {
    renderHome(ENTRIES, true)
    const reopen = screen.getByLabelText(actionLabel('shell.history.reopenTitle', DIRECTORY))
    const remove = screen.getByLabelText(actionLabel('shell.history.removeTitle', DIRECTORY))
    expect([(reopen as HTMLButtonElement).disabled, (remove as HTMLButtonElement).disabled]).toEqual([true, true])
  })
  it('caps the home list at five rows in a token-height scroll container', () => {
    renderHome(MANY)
    const rows = [...document.querySelectorAll('[data-history-entry]')]
    expect(rows).toHaveLength(5)
    expect(rows.map((row) => row.getAttribute('data-history-entry'))).toEqual(MANY.slice(0, 5).map((entry) => entry.id))
    const list = document.querySelector('section ul')
    expect(list?.className).toContain('max-h-[var(--height-history-list)]')
    expect(list?.className).toContain('overflow-y-auto')
  })
  it('opens all entries in a scrollable dialog and returns focus to the trigger on Escape', async () => {
    renderHome(MANY)
    const trigger = screen.getByRole('button', { name: interpolate(zh['shell.history.showAllTitle'], { count: 20 }) })
    expect(trigger.textContent).toBe(interpolate(zh['shell.history.showAll'], { count: 20 }))
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: interpolate(zh['shell.history.showAllTitle'], { count: 20 }) })
    const all = [...dialog.querySelectorAll('[data-history-entry]')]
    expect(all).toHaveLength(20)
    expect(all.map((row) => row.getAttribute('data-history-entry'))).toEqual(MANY.map((entry) => entry.id))
    expect(dialog.querySelector('.overflow-auto')).not.toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
  it('keeps the dialog row actions wired to the same callbacks', () => {
    const { onReopen, onRemove } = renderHome(MANY)
    fireEvent.click(screen.getByRole('button', { name: interpolate(zh['shell.history.showAllTitle'], { count: 20 }) }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByLabelText(actionLabel('shell.history.reopenTitle', MANY[6]!)))
    fireEvent.click(within(dialog).getByLabelText(actionLabel('shell.history.removeTitle', MANY[6]!)))
    expect(onReopen).toHaveBeenCalledWith(MANY[6])
    expect(onRemove).toHaveBeenCalledWith(MANY[6]!.id)
  })
})
