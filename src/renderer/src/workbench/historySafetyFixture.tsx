import { fireEvent, screen, waitFor } from '@testing-library/react'
import { expect, vi } from 'vitest'
import { resolveComparisonSwitches } from '@core/text/normalize'
import { createComparisonHistoryEntry } from '@shared/history/model'
import type { ComparisonHistoryEntry, ComparisonHistoryErrorCode, ComparisonHistoryKind } from '@shared/history/types'
import type { PlatformPort } from '@shared/platform/types'
import { zh } from '@renderer/i18n/messages'
import type { MessageKey } from '@renderer/i18n/messages'
import { renderWithI18n } from '@renderer/i18n/testing'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { Workbench } from './Workbench'

/** Fixtures shared by the history safety DOM evidence; not a test file itself. */
export const [DIR_LEFT, DIR_RIGHT] = ['/memory/safety/dir-left', '/memory/safety/dir-right']
export const [FILE_LEFT, FILE_RIGHT] = ['/memory/safety/left.ts', '/memory/safety/right.ts']
export const [MERGE_BASE, MERGE_OURS, MERGE_THEIRS] = ['/memory/safety/m.ts', '/memory/safety/o.ts', '/memory/safety/t.ts']
export const GONE = '/memory/safety/gone'
export const FIXED = 1_700_000_000_000
export const SWITCHES = resolveComparisonSwitches({})
export const copy = (key: MessageKey): string => zh[key]
export const notice = (code: ComparisonHistoryErrorCode, side: string): string =>
  copy(`shell.history.errorNotice.${code === 'type-changed' ? 'typeChanged' : code}` as MessageKey).replace(
    '{side}',
    copy(`shell.history.side.${side}` as MessageKey)
  )
export const tabs = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('[data-session-tab]'))
export const rows = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('[data-history-entry]'))
export const rowFor = (id: string): HTMLElement => rows().find((row) => row.getAttribute('data-history-entry') === id)!
export const reopenName = (paths: readonly string[]): string =>
  copy('shell.history.reopenTitle').replace('{paths}', paths.join(' ↔ '))
export const removeName = (paths: readonly string[]): string =>
  copy('shell.history.removeTitle').replace('{paths}', paths.join(' ↔ '))
export const noResidue = (): void => {
  expect(tabs()).toHaveLength(0)
  expect(document.querySelectorAll('[data-legend-status]')).toHaveLength(0)
  expect(screen.queryByRole('status', { name: copy('shell.progress.label') })).toBeNull()
}
export const expectNotice = async (code: ComparisonHistoryErrorCode, side: string): Promise<void> => {
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(notice(code, side)))
}
export const clickReopen = async (paths: readonly string[]): Promise<void> => {
  fireEvent.click(await screen.findByRole('button', { name: reopenName(paths) }))
}
export const mount = (port: PlatformPort, language: 'zh' | 'en' = 'zh'): void => {
  renderWithI18n(<Workbench platform={port} />, language)
}
export const captureConsole = (calls: string[]): (() => void) => {
  const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation((...args) => {
      calls.push(args.map(String).join(' '))
    })
  )
  return () => spies.forEach((spy) => spy.mockRestore())
}

export interface Spec {
  readonly kind: ComparisonHistoryKind
  readonly paths: readonly string[]
  readonly createdAt?: number
  readonly error?: ComparisonHistoryErrorCode
}

export async function seed(port: PlatformPort, specs: readonly Spec[]): Promise<ComparisonHistoryEntry[]> {
  const entries = specs.map((spec, index) =>
    createComparisonHistoryEntry({
      kind: spec.kind,
      paths: spec.paths,
      createdAt: spec.createdAt ?? FIXED + index,
      ...SWITCHES,
      ...(spec.error === undefined ? {} : { error: spec.error })
    })
  )
  await port.writeComparisonHistory(entries)
  return entries
}

export async function memoryPort(): Promise<PlatformPort> {
  const port = createWebPlatformPort()
  for (const path of [DIR_LEFT, DIR_RIGHT]) await port.writeTextFile(`${path}/same.txt`, 'same\n')
  await port.writeTextFile(FILE_LEFT, 'alpha\n')
  await port.writeTextFile(FILE_RIGHT, 'alpha\nbeta\n')
  await port.writeTextFile(MERGE_BASE, 'head\nvalue = 1\ntail\n')
  await port.writeTextFile(MERGE_OURS, 'head\nvalue = ours\ntail\n')
  await port.writeTextFile(MERGE_THEIRS, 'head\nvalue = theirs\ntail\n')
  return port
}

export const delayed = (port: PlatformPort): PlatformPort => {
  const wait = async (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 15))
  return {
    ...port,
    listDirectory: async (path) => { await wait(); return port.listDirectory(path) },
    listDirectories: async (paths) => { await wait(); return port.listDirectories(paths) }
  }
}

const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')

export function stubWorkbenchSizes(): void {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1200 })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 640 })
}

export function restoreWorkbenchSizes(): void {
  for (const [name, original] of [['clientWidth', width], ['clientHeight', height]] as const) {
    if (original) Object.defineProperty(HTMLElement.prototype, name, original)
    else Reflect.deleteProperty(HTMLElement.prototype, name)
  }
}
