// @vitest-environment jsdom
import { readFile, stat } from 'node:fs/promises'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type {
  DirectoryEntry,
  DirectoryListing,
  FileDigest,
  PlatformPort,
  SaveFileOptions
} from '@shared/platform/types'
import { APP_VERSION } from '@shared/appVersion'
import { FILE_DIFF_STATUSES } from '@core/directory/compare'
import type { FileDiffStatus } from '@core/directory/compare'
import { sha256Bytes } from '@core/directory/hash'
import { directoryReportSource } from '@core/directory/report'
import type { DirectoryReport } from '@core/directory/report'
import { OperationCancelledError } from '@core/io'
import { DIFF_STATUSES } from '@renderer/components/diffSemantics'
import { interpolate } from '@renderer/i18n/interpolate'
import { zh, en } from '@renderer/i18n/messages'
import { renderWithI18n } from '@renderer/i18n/testing'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { DIRECTORY_STATUS_LABEL_KEYS } from '@renderer/views/directoryCopy'
import type { RealDirectoryFixture } from '../../test-support/directoryFixture'
import {
  createRealDirectoryFixture,
  listRealDirectory,
  removeRealDirectoryFixture
} from '../../test-support/directoryFixture'
import {
  buildDirectoryReportForComparison,
  buildDirectoryReportForComparisonAsync
} from './directoryReport'
import { Workbench } from './Workbench'

/**
 * The workbench wiring is the subject here: the async builder is stubbed per
 * test where the flow needs a controllable generation. Its real parity with the
 * synchronous path is covered in `directoryReport.test.ts`, and the default
 * implementation below keeps the 26k-row integration on the real generator.
 */
vi.mock('./directoryReport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./directoryReport')>()
  return {
    ...actual,
    buildDirectoryReportForComparisonAsync: vi.fn(actual.buildDirectoryReportForComparisonAsync)
  }
})

const buildAsync = vi.mocked(buildDirectoryReportForComparisonAsync)

const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 1200
  })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 640
  })
})

afterAll(() => {
  if (originalWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalWidth)
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
  if (originalHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalHeight)
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight')
})

afterEach(() => {
  cleanup()
  buildAsync.mockClear()
})

const VIRTUAL_LEFT = '/Users/alice/work/left'
const VIRTUAL_RIGHT = '/Users/alice/work/right'
const SAVED_PATH = '/memory/left-vs-right.html'

/** Maps the virtual `/Users/...` roots onto the real fixture trees. */
function createMappedPort(
  fixture: RealDirectoryFixture,
  saveAnswers: readonly (string | null)[]
): { readonly port: PlatformPort; readonly saved: SaveFileOptions[] } {
  const base = createWebPlatformPort()
  const saved: SaveFileOptions[] = []
  const answers = [...saveAnswers]

  function toReal(path: string): string {
    if (path === VIRTUAL_LEFT || path.startsWith(`${VIRTUAL_LEFT}/`)) {
      return fixture.left + path.slice(VIRTUAL_LEFT.length)
    }
    if (path === VIRTUAL_RIGHT || path.startsWith(`${VIRTUAL_RIGHT}/`)) {
      return fixture.right + path.slice(VIRTUAL_RIGHT.length)
    }
    return path
  }

  function toVirtual(path: string): string {
    if (path === fixture.left || path.startsWith(`${fixture.left}/`)) {
      return VIRTUAL_LEFT + path.slice(fixture.left.length)
    }
    if (path === fixture.right || path.startsWith(`${fixture.right}/`)) {
      return VIRTUAL_RIGHT + path.slice(fixture.right.length)
    }
    return path
  }

  async function entriesOf(path: string): Promise<DirectoryEntry[]> {
    const entries = await listRealDirectory(toReal(path))
    return entries.map((entry) => ({ ...entry, path: toVirtual(entry.path) }))
  }

  const port: PlatformPort = {
    ...base,
    homeDirectory: async () => '/Users/alice/work',
    workingDirectory: async () => '/Users/alice/work',
    selectDirectory: async () => null,
    selectFile: async () => null,
    resolveDroppedPath: async () => '',
    realpath: async (paths) => paths,
    statPath: async (path) => {
      try {
        const info = await stat(toReal(path))
        return info.isDirectory() ? 'directory' : 'file'
      } catch {
        return 'missing'
      }
    },
    listDirectory: (path) => entriesOf(path),
    listDirectories: async (paths) =>
      Promise.all(
        paths.map(async (path): Promise<DirectoryListing> => {
          try {
            return { path, ok: true, entries: await entriesOf(path) }
          } catch (cause) {
            return { path, ok: false, reason: String(cause) }
          }
        })
      ),
    readTextFile: (path) => readFile(toReal(path), 'utf8'),
    digestFiles: async (paths) =>
      Promise.all(
        paths.map(async (path): Promise<FileDigest> => {
          try {
            const bytes = new Uint8Array(await readFile(toReal(path)))
            return { path, ok: true, sha256: sha256Bytes(bytes), bytes: bytes.length }
          } catch {
            return { path, ok: false, reason: 'unreadable' }
          }
        })
      ),
    saveFile: async (options) => {
      saved.push(options)
      return answers.shift() ?? null
    }
  }
  return { port, saved }
}

interface DialogLabels {
  readonly newCompare: string
  readonly leftPath: string
  readonly rightPath: string
  readonly submit: string
}

const ZH_DIALOG: DialogLabels = {
  newCompare: zh['shell.toolbar.newCompare'],
  leftPath: zh['shell.compare.leftPath'],
  rightPath: zh['shell.compare.rightPath'],
  submit: zh['shell.compare.submit']
}

const EN_DIALOG: DialogLabels = {
  newCompare: en['shell.toolbar.newCompare'],
  leftPath: en['shell.compare.leftPath'],
  rightPath: en['shell.compare.rightPath'],
  submit: en['shell.compare.submit']
}

/** Opens a directory pair through the typed-path dialog (no native picker). */
async function openDirectoryPair(
  dialog: DialogLabels,
  left: string,
  right: string
): Promise<void> {
  fireEvent.click(screen.getAllByRole('button', { name: dialog.newCompare })[0])
  const panel = await screen.findByRole('dialog')
  fireEvent.change(within(panel).getByLabelText(dialog.leftPath), { target: { value: left } })
  fireEvent.change(within(panel).getByLabelText(dialog.rightPath), { target: { value: right } })
  fireEvent.click(within(panel).getByRole('button', { name: dialog.submit }))
}

async function waitForDirectoryView(label: string): Promise<void> {
  await waitFor(
    () => {
      const sync = document.querySelector<HTMLButtonElement>('[data-shell-entry="sync"]')
      expect(sync).not.toBeNull()
      expect(sync?.disabled).toBe(false)
    },
    { timeout: 180_000 }
  )
  expect(menuItem(label)).toBeDefined()
  closeMore()
}

/** The four visible numbers of the first `CompositionLegend` on screen. */
function legendNumbers(dictionary: typeof zh | typeof en): Record<FileDiffStatus, number> {
  const labels = DIFF_STATUSES.filter((status) => status !== 'conflict').map(
    (status) => dictionary[DIRECTORY_STATUS_LABEL_KEYS[status]]
  )
  const legend = Array.from(document.querySelectorAll<HTMLElement>('span')).find((span) => {
    const cells = Array.from(span.children)
    return (
      cells.length === labels.length &&
      labels.every((label, index) => cells[index]?.textContent?.includes(label) === true)
    )
  })
  if (!legend) throw new Error('no composition legend found')
  const counts = {} as Record<FileDiffStatus, number>
  Array.from(legend.children).forEach((cell, index) => {
    const status = DIFF_STATUSES[index] as FileDiffStatus
    counts[status] = Number(cell.querySelector('.tabular')?.textContent)
  })
  return counts
}

function reportDocument(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

function reportCounts(document: Document): Record<FileDiffStatus, number> {
  const counts = {} as Record<FileDiffStatus, number>
  for (const status of FILE_DIFF_STATUSES) {
    counts[status] = Number(
      document.querySelector(`.count-${status} .count-value`)?.textContent ?? 'NaN'
    )
  }
  return counts
}

/** A memory-sandbox pair with one identical file on each side. */
async function createMemoryPair(prefix: string): Promise<PlatformPort> {
  const base = createWebPlatformPort()
  await base.writeTextFile(`/memory/${prefix}-left/a.txt`, 'same\n')
  await base.writeTextFile(`/memory/${prefix}-right/a.txt`, 'same\n')
  return base
}

/** A synthetic generation result for the wiring assertions. */
function stubReport(overrides: Partial<DirectoryReport> = {}): DirectoryReport {
  return {
    html: '<!DOCTYPE html><html lang="zh-CN"><body><p>stub</p></body></html>',
    bytes: 64,
    totalRows: 2,
    shownRows: 2,
    truncatedRows: 0,
    truncated: false,
    ...overrides
  }
}

/** Resolves the next generation with the real document of the small pair. */
function queueRealReport(): void {
  buildAsync.mockImplementationOnce(async (comparison, t, language, hide, _options, generatedAt) =>
    buildDirectoryReportForComparison(comparison, t, language, hide, generatedAt)
  )
}

/** Keeps the next generation pending until the workbench aborts it. */
function queuePendingReport(): void {
  buildAsync.mockImplementationOnce(
    (comparison, _t, _language, _hide, options) =>
      new Promise<DirectoryReport>((_resolve, reject) => {
        options?.onProgress?.({
          processedRows: 0,
          totalRows: directoryReportSource(comparison).totalRows
        })
        options?.signal?.addEventListener(
          'abort',
          () => reject(new OperationCancelledError()),
          { once: true }
        )
      })
  )
}

const DIRECTORY_MENU_BUSY_KEYS = [
  'directory.toolbar.template',
  'directory.toolbar.exportLeft',
  'directory.toolbar.importLeft'
] as const

/** The active view's single toolbar overflow trigger. */
function moreTrigger(): HTMLElement {
  const trigger = document.querySelector<HTMLElement>('[data-shell-entry="more"]')
  if (trigger === null) throw new Error('missing more trigger')
  return trigger
}

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

/** One overflow item, matched by its visible label inside the accessible name. */
function menuItem(label: string): HTMLElement {
  return within(openMore()).getByRole('menuitem', {
    name: (name: string) => name.includes(label)
  })
}

function clickMenu(label: string): void {
  fireEvent.click(menuItem(label))
}

/** A switch's checked state is the leading `[x] ` label prefix. */
function menuChecked(label: string): boolean {
  const on = (menuItem(label).textContent ?? '').trimStart().startsWith('[x]')
  closeMore()
  return on
}

function toggleMenu(label: string): void {
  fireEvent.click(menuItem(label))
}

function expectDirectoryBusyButtonsEnabled(): void {
  expect(
    (screen.getByRole('button', { name: zh['directory.toolbar.previewSync'] }) as HTMLButtonElement)
      .disabled
  ).toBe(false)
  for (const key of DIRECTORY_MENU_BUSY_KEYS) {
    expect(menuItem(zh[key])).toBeDefined()
  }
  closeMore()
}

describe('directory HTML report export', () => {
  let fixture: RealDirectoryFixture

  beforeAll(async () => {
    fixture = await createRealDirectoryFixture()
  }, 180_000)

  afterAll(async () => {
    if (fixture) await removeRealDirectoryFixture(fixture)
  })

  it('exports the same counts as the view in the zh report', async () => {
    const { port, saved } = createMappedPort(fixture, [SAVED_PATH, SAVED_PATH])
    renderWithI18n(<Workbench platform={port} />, 'zh')

    await openDirectoryPair(ZH_DIALOG, VIRTUAL_LEFT, VIRTUAL_RIGHT)
    await waitForDirectoryView(zh['directory.report.toolbar.export'])

    const viewCounts = legendNumbers(zh)
    for (const status of FILE_DIFF_STATUSES) {
      expect(viewCounts[status]).toBeGreaterThan(0)
    }
    expect(viewCounts.same).toBeGreaterThanOrEqual(10_000)
    expect(viewCounts.modified).toBeGreaterThanOrEqual(10_000)

    clickMenu(zh['directory.report.toolbar.export'])

    // The progress row is on screen before the save dialog is even considered.
    const expectedTotal = directoryReportSource(fixture.comparison).totalRows
    const status = screen.getByRole('status')
    expect(status.textContent).toMatch(new RegExp(`\\d+ / ${expectedTotal} 行`))
    const cancel = within(status).getByRole('button', { name: zh['directory.report.cancel'] })
    expect((cancel as HTMLButtonElement).disabled).toBe(false)
    // The action stays listed while generating; its handler ignores repeats.
    expect(menuItem(zh['directory.report.toolbar.export'])).toBeDefined()
    closeMore()
    expect(saved).toHaveLength(0)

    await waitFor(() => expect(saved).toHaveLength(1))

    const options = saved[0]
    const report = reportDocument(options.content)

    expect(options.content.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(options.content.trimEnd().endsWith('</html>')).toBe(true)
    expect(options.content).toContain('<meta charset="utf-8">')
    expect(options.defaultPath).toBe('left-vs-right.html')
    expect(options.filters?.[0]?.extensions).toContain('html')

    expect(report.documentElement.lang).toBe('zh-CN')
    expect(window.document.documentElement.lang).toBe('zh-CN')
    expect(report.title).toBe(zh['directory.report.title'])
    expect(report.querySelector('h1')?.textContent).toBe(zh['directory.report.title'])
    expect(
      Array.from(report.querySelectorAll('th')).map((cell) => cell.textContent)
    ).toEqual([
      zh['directory.report.columns.path'],
      zh['directory.report.columns.leftSize'],
      zh['directory.report.columns.rightSize'],
      zh['directory.report.columns.status']
    ])

    expect(reportCounts(report)).toEqual(viewCounts)
    expect(report.querySelector('.meta-app-version')?.textContent).toBe(APP_VERSION)

    // Default privacy: the `/Users` roots never reach the artifact.
    expect(options.content).not.toContain('/Users')
    expect(report.querySelector('.privacy-notice')?.textContent).toBe(
      zh['directory.report.privacyNotice']
    )

    const notice = screen.getByRole('alert')
    expect(notice.textContent).toContain(SAVED_PATH)
    expect(notice.textContent).not.toContain(zh['directory.report.truncatedHint'])

    // The report always counts every entry; the active filter only changes the view.
    fireEvent.click(
      screen.getByRole('tab', { name: zh['directory.filter.differences'] })
    )
    await waitFor(() => expect(legendNumbers(zh).same).toBe(0))
    clickMenu(zh['directory.report.toolbar.export'])
    await waitFor(() => expect(saved).toHaveLength(2))
    expect(reportCounts(reportDocument(saved[1].content))).toEqual(viewCounts)
  }, 240_000)

  it('follows the en interface language and the hide-local-paths switch', async () => {
    const { port, saved } = createMappedPort(fixture, [SAVED_PATH, SAVED_PATH])
    renderWithI18n(<Workbench platform={port} />, 'en')

    await openDirectoryPair(EN_DIALOG, VIRTUAL_LEFT, VIRTUAL_RIGHT)
    await waitForDirectoryView(en['directory.report.toolbar.export'])

    clickMenu(en['directory.report.toolbar.export'])
    await waitFor(() => expect(saved).toHaveLength(1))

    const hidden = reportDocument(saved[0].content)
    expect(hidden.documentElement.lang).toBe('en')
    expect(window.document.documentElement.lang).toBe('en')
    expect(hidden.title).toBe(en['directory.report.title'])
    expect(hidden.querySelector('.privacy-notice')?.textContent).toBe(
      en['directory.report.privacyNotice']
    )
    expect(saved[0].content).not.toContain('/Users')
    expect(saved[0].content).not.toContain(zh['directory.report.title'])

    toggleMenu(en['directory.report.toolbar.hideLocalPaths'])
    clickMenu(en['directory.report.toolbar.export'])
    await waitFor(() => expect(saved).toHaveLength(2))

    expect(saved[1].content).toContain(VIRTUAL_LEFT)
    expect(saved[1].content).toContain(VIRTUAL_RIGHT)
    const exposed = reportDocument(saved[1].content)
    expect(exposed.querySelector('.privacy-notice')?.textContent).toBe(
      en['directory.report.privacyNotice']
    )
    expect(reportCounts(exposed)).toEqual(legendNumbers(en))
  }, 240_000)

  it('ends silently when the save dialog is cancelled and stays reusable', async () => {
    const base = createWebPlatformPort()
    await base.writeTextFile('/memory/cancel-left/a.txt', 'same\n')
    await base.writeTextFile('/memory/cancel-right/a.txt', 'same\n')
    let calls = 0
    const saveFile = async (): Promise<string | null> => {
      calls += 1
      return calls === 1 ? null : SAVED_PATH
    }

    renderWithI18n(<Workbench platform={{ ...base, saveFile }} />, 'zh')
    await openDirectoryPair(ZH_DIALOG, '/memory/cancel-left', '/memory/cancel-right')
    await waitForDirectoryView(zh['directory.report.toolbar.export'])

    clickMenu(zh['directory.report.toolbar.export'])

    await waitFor(() => expect(calls).toBe(1))
    // Cancelling never retries and never reports a saved path.
    expect(calls).toBe(1)
    expect(screen.queryByRole('alert')).toBeNull()
    await expect(base.exists('/memory/cancel-left-vs-cancel-right.html')).resolves.toBe(false)

    clickMenu(zh['directory.report.toolbar.export'])
    await waitFor(() => expect(calls).toBe(2))
    // The very next attempt is a normal, successful save.
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(SAVED_PATH))
    expectDirectoryBusyButtonsEnabled()
  })

  it('keeps the hide-local-paths switch across a directory remount', async () => {
    const base = createWebPlatformPort()
    for (const [left, right] of [
      ['/memory/first-left', '/memory/first-right'],
      ['/memory/second-left', '/memory/second-right']
    ] as const) {
      await base.writeTextFile(`${left}/same.txt`, 'same\n')
      await base.writeTextFile(`${right}/same.txt`, 'same\n')
    }

    renderWithI18n(<Workbench platform={base} />, 'zh')
    await openDirectoryPair(ZH_DIALOG, '/memory/first-left', '/memory/first-right')
    await waitForDirectoryView(zh['directory.report.toolbar.export'])

    expect(menuChecked(zh['directory.report.toolbar.hideLocalPaths'])).toBe(true)
    toggleMenu(zh['directory.report.toolbar.hideLocalPaths'])
    expect(menuChecked(zh['directory.report.toolbar.hideLocalPaths'])).toBe(false)

    await openDirectoryPair(ZH_DIALOG, '/memory/second-left', '/memory/second-right')
    await screen.findByRole('tab', { name: /second-left ↔ second-right/ })
    await waitForDirectoryView(zh['directory.report.toolbar.export'])
    expect(menuChecked(zh['directory.report.toolbar.hideLocalPaths'])).toBe(false)

    fireEvent.click(screen.getByRole('tab', { name: /first-left ↔ first-right/ }))
    await waitForDirectoryView(zh['directory.report.toolbar.export'])
    expect(menuChecked(zh['directory.report.toolbar.hideLocalPaths'])).toBe(false)
  })

  it('keeps the surface usable while generating and cancels without saving', async () => {
    const base = await createMemoryPair('stop')
    const saved: SaveFileOptions[] = []
    const port: PlatformPort = {
      ...base,
      saveFile: async (options) => {
        saved.push(options)
        return SAVED_PATH
      }
    }
    queuePendingReport()

    renderWithI18n(<Workbench platform={port} />, 'zh')
    await openDirectoryPair(ZH_DIALOG, '/memory/stop-left', '/memory/stop-right')
    await waitForDirectoryView(zh['directory.report.toolbar.export'])

    const before = (await base.listDirectory('/memory')).map((entry) => entry.name).sort()
    clickMenu(zh['directory.report.toolbar.export'])

    // The row exists synchronously, before any save dialog could be opened.
    const status = screen.getByRole('status')
    expect(status.textContent).toContain(
      interpolate(zh['directory.report.progress'], { done: 0, total: 2 })
    )
    const cancelButton = within(status).getByRole('button', {
      name: zh['directory.report.cancel']
    }) as HTMLButtonElement
    expect(cancelButton.disabled).toBe(false)
    // The action stays listed while generating.
    expect(menuItem(zh['directory.report.toolbar.export'])).toBeDefined()

    // A second selection cannot start a second generation.
    clickMenu(zh['directory.report.toolbar.export'])
    expect(buildAsync).toHaveBeenCalledTimes(1)

    // The rest of the directory surface is not busy-gated by the export.
    toggleMenu(zh['directory.report.toolbar.hideLocalPaths'])
    expect(menuChecked(zh['directory.report.toolbar.hideLocalPaths'])).toBe(false)

    fireEvent.click(screen.getByRole('tab', { name: zh['directory.filter.differences'] }))
    await waitFor(() => expect(legendNumbers(zh).same).toBe(0))
    expectDirectoryBusyButtonsEnabled()

    fireEvent.click(cancelButton)
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    expect(saved).toHaveLength(0)
    expect(buildAsync).toHaveBeenCalledTimes(1)
    expect(menuItem(zh['directory.report.toolbar.export'])).toBeDefined()
    closeMore()
    expectDirectoryBusyButtonsEnabled()
    const notice = screen.getByRole('alert')
    expect(notice.textContent).toBe(zh['directory.report.cancelled'])
    expect(notice.className).toContain('text-diff-added')
    await expect(base.exists('/memory/stop-left-vs-stop-right.html')).resolves.toBe(false)
    const after = (await base.listDirectory('/memory')).map((entry) => entry.name).sort()
    expect(after).toEqual(before)
  })

  it('exports again right after a cancelled generation', async () => {
    const base = await createMemoryPair('retry')
    const saved: SaveFileOptions[] = []
    const port: PlatformPort = {
      ...base,
      saveFile: async (options) => {
        saved.push(options)
        return SAVED_PATH
      }
    }
    queuePendingReport()

    renderWithI18n(<Workbench platform={port} />, 'zh')
    await openDirectoryPair(ZH_DIALOG, '/memory/retry-left', '/memory/retry-right')
    await waitForDirectoryView(zh['directory.report.toolbar.export'])

    clickMenu(zh['directory.report.toolbar.export'])
    fireEvent.click(
      within(screen.getByRole('status')).getByRole('button', {
        name: zh['directory.report.cancel']
      })
    )
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    expect(saved).toHaveLength(0)

    clickMenu(zh['directory.report.toolbar.export'])
    await waitFor(() => expect(saved).toHaveLength(1))
    const content = saved[0].content
    expect(content.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(content.trimEnd().endsWith('</html>')).toBe(true)
    expect(reportCounts(reportDocument(content))).toEqual(legendNumbers(zh))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(SAVED_PATH))
  })

  it('keeps one task in flight and confirms the saved path', async () => {
    const base = await createMemoryPair('saved')
    const saved: SaveFileOptions[] = []
    let release: ((path: string | null) => void) | null = null
    const port: PlatformPort = {
      ...base,
      saveFile: (options) =>
        new Promise<string | null>((resolve) => {
          saved.push(options)
          release = resolve
        })
    }
    const releaseSave = (): void => release?.(SAVED_PATH)
    queueRealReport()

    renderWithI18n(<Workbench platform={port} />, 'zh')
    await openDirectoryPair(ZH_DIALOG, '/memory/saved-left', '/memory/saved-right')
    await waitForDirectoryView(zh['directory.report.toolbar.export'])

    clickMenu(zh['directory.report.toolbar.export'])
    await waitFor(() => expect(saved).toHaveLength(1))

    // While the save dialog is open the task is still single: selecting the
    // same action again must not start a second generation.
    expect(menuItem(zh['directory.report.toolbar.export'])).toBeDefined()
    clickMenu(zh['directory.report.toolbar.export'])
    expect(buildAsync).toHaveBeenCalledTimes(1)
    expect(saved).toHaveLength(1)

    releaseSave()
    const notice = await screen.findByRole('alert')
    expect(notice.className).toContain('text-diff-added')
    expect(notice.textContent).toContain(SAVED_PATH)
    expect(saved[0].defaultPath).toBe('saved-left-vs-saved-right.html')
    expect(saved[0].filters?.[0]?.extensions).toContain('html')
    expect(saved[0].content.startsWith('<!DOCTYPE html>')).toBe(true)
    expectDirectoryBusyButtonsEnabled()
  })

  it('names both row counts when the saved report was truncated', async () => {
    const base = await createMemoryPair('truncated')
    const saved: SaveFileOptions[] = []
    const answers = ['/memory/truncated.html', '/memory/complete.html']
    const port: PlatformPort = {
      ...base,
      saveFile: async (options) => {
        saved.push(options)
        return answers[saved.length - 1] ?? null
      }
    }
    buildAsync.mockImplementationOnce(async () =>
      stubReport({ totalRows: 358_156, shownRows: 120_000, truncatedRows: 238_156, truncated: true })
    )

    renderWithI18n(<Workbench platform={port} />, 'zh')
    await openDirectoryPair(ZH_DIALOG, '/memory/truncated-left', '/memory/truncated-right')
    await waitForDirectoryView(zh['directory.report.toolbar.export'])

    clickMenu(zh['directory.report.toolbar.export'])
    await waitFor(() => expect(saved).toHaveLength(1))
    await waitFor(() => {
      const text = screen.getByRole('alert').textContent ?? ''
      expect(text).toContain(String(120_000))
      expect(text).toContain(String(358_156))
      expect(text).toContain('/memory/truncated.html')
    })

    // An untruncated save never carries the truncation numbers.
    queueRealReport()
    clickMenu(zh['directory.report.toolbar.export'])
    await waitFor(() => expect(saved).toHaveLength(2))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('/memory/complete.html')
    )
    const text = screen.getByRole('alert').textContent ?? ''
    expect(text).not.toContain(String(120_000))
    expect(text).not.toContain(String(358_156))
  })

  it('reports an unwritable target and allows a retry', async () => {
    const base = await createMemoryPair('readonly')
    const message = '无法写入文件 /memory/readonly-left-vs-readonly-right.html：只读（EROFS）'
    const attempts: SaveFileOptions[] = []
    const port: PlatformPort = {
      ...base,
      saveFile: async (options) => {
        attempts.push(options)
        throw new Error(message)
      }
    }
    queueRealReport()

    renderWithI18n(<Workbench platform={port} />, 'zh')
    await openDirectoryPair(ZH_DIALOG, '/memory/readonly-left', '/memory/readonly-right')
    await waitForDirectoryView(zh['directory.report.toolbar.export'])

    clickMenu(zh['directory.report.toolbar.export'])
    await waitFor(() => expect(attempts).toHaveLength(1))

    const notice = await screen.findByRole('alert')
    expect(notice.className).toContain('text-danger')
    expect(notice.textContent).toBe(message)
    expect(notice.textContent).not.toContain(zh['directory.report.saved'].replace('{path}', ''))

    await expect(base.exists('/memory/readonly-left-vs-readonly-right.html')).resolves.toBe(false)

    clickMenu(zh['directory.report.toolbar.export'])
    await waitFor(() => expect(attempts).toHaveLength(2))
    expect(screen.getByRole('alert').textContent).toBe(message)
    expectDirectoryBusyButtonsEnabled()
  })
})
