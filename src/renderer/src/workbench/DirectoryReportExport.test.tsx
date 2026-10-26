// @vitest-environment jsdom
import { readFile, stat } from 'node:fs/promises'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
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
import { DIFF_LABEL_KEYS, DIFF_STATUSES } from '@renderer/components/diffSemantics'
import { zh, en } from '@renderer/i18n/messages'
import { renderWithI18n } from '@renderer/i18n/testing'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import type { RealDirectoryFixture } from '../../test-support/directoryFixture'
import {
  createRealDirectoryFixture,
  listRealDirectory,
  removeRealDirectoryFixture
} from '../../test-support/directoryFixture'
import { Workbench } from './Workbench'

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

afterEach(cleanup)

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
  const button = await screen.findByRole(
    'button',
    { name: label },
    { timeout: 180_000 }
  )
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false), {
    timeout: 180_000
  })
}

/** The four visible numbers of the first `CompositionLegend` on screen. */
function legendNumbers(dictionary: typeof zh | typeof en): Record<FileDiffStatus, number> {
  const labels = DIFF_STATUSES.filter((status) => status !== 'conflict').map(
    (status) => dictionary[DIFF_LABEL_KEYS[status]]
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

    fireEvent.click(screen.getByRole('button', { name: zh['directory.report.toolbar.export'] }))
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
    fireEvent.click(screen.getByRole('button', { name: zh['directory.report.toolbar.export'] }))
    await waitFor(() => expect(saved).toHaveLength(2))
    expect(reportCounts(reportDocument(saved[1].content))).toEqual(viewCounts)
  }, 240_000)

  it('follows the en interface language and the hide-local-paths switch', async () => {
    const { port, saved } = createMappedPort(fixture, [SAVED_PATH, SAVED_PATH])
    renderWithI18n(<Workbench platform={port} />, 'en')

    await openDirectoryPair(EN_DIALOG, VIRTUAL_LEFT, VIRTUAL_RIGHT)
    await waitForDirectoryView(en['directory.report.toolbar.export'])

    fireEvent.click(screen.getByRole('button', { name: en['directory.report.toolbar.export'] }))
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

    fireEvent.click(screen.getByRole('checkbox', { name: en['directory.report.toolbar.hideLocalPaths'] }))
    fireEvent.click(screen.getByRole('button', { name: en['directory.report.toolbar.export'] }))
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
      return null
    }

    renderWithI18n(<Workbench platform={{ ...base, saveFile }} />, 'zh')
    await openDirectoryPair(ZH_DIALOG, '/memory/cancel-left', '/memory/cancel-right')
    await waitForDirectoryView(zh['directory.report.toolbar.export'])

    const button = screen.getByRole('button', {
      name: zh['directory.report.toolbar.export']
    }) as HTMLButtonElement
    fireEvent.click(button)

    await waitFor(() => expect(calls).toBe(1))
    await waitFor(() => expect(button.disabled).toBe(false))
    // Cancelling never retries and never reports a saved path.
    expect(calls).toBe(1)
    expect(screen.queryByRole('alert')).toBeNull()
    await expect(base.exists('/memory/cancel-left-vs-cancel-right.html')).resolves.toBe(false)

    fireEvent.click(button)
    await waitFor(() => expect(calls).toBe(2))
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

    const checkbox = screen.getByRole('checkbox', {
      name: zh['directory.report.toolbar.hideLocalPaths']
    }) as HTMLInputElement
    expect(checkbox.checked).toBe(true)
    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(false)

    await openDirectoryPair(ZH_DIALOG, '/memory/second-left', '/memory/second-right')
    await screen.findByRole('tab', { name: /second-left ↔ second-right/ })
    await waitForDirectoryView(zh['directory.report.toolbar.export'])
    expect(
      (screen.getByRole('checkbox', { name: zh['directory.report.toolbar.hideLocalPaths'] }) as HTMLInputElement)
        .checked
    ).toBe(false)

    fireEvent.click(screen.getByRole('tab', { name: /first-left ↔ first-right/ }))
    await waitForDirectoryView(zh['directory.report.toolbar.export'])
    expect(
      (screen.getByRole('checkbox', { name: zh['directory.report.toolbar.hideLocalPaths'] }) as HTMLInputElement)
        .checked
    ).toBe(false)
  })
})
