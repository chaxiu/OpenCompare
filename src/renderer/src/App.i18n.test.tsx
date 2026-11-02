// @vitest-environment jsdom
import type { JSX } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DIRECTORY_SAMPLE_PATHS } from '@shared/fixtures'
import type { PlatformPort } from '@shared/platform/types'
import { App } from './App'
import { I18nProvider } from './i18n/I18nProvider'
import { useI18n } from './i18n/context'
import { LOCALE_ROWS, localeText } from './i18n/localeTable'
import { en, messages, zh } from './i18n/messages'
import { createWebPlatformPort } from './platform/web-platform'
import { Workbench } from './workbench/Workbench'

const HAN = /\p{Script=Han}/u
const IO_DETAIL = 'EACCES: permission denied'
const LEFT_IO = '/memory/io-left.txt'
const RIGHT_IO = '/memory/io-right.txt'

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
  localStorage.clear()
  delete window.openComparePlatform
  window.history.replaceState(null, '', '/')
  vi.restoreAllMocks()
})

/** Two empty controls that switch the provider without touching the shell. */
function LanguageProbe(): JSX.Element {
  const { setLanguage } = useI18n()
  return (
    <div aria-hidden>
      <button type="button" data-testid="switch-en" onClick={() => setLanguage('en')} />
      <button type="button" data-testid="switch-zh" onClick={() => setLanguage('zh')} />
    </div>
  )
}

function Harness({ platform }: { readonly platform: PlatformPort }): JSX.Element {
  return (
    <I18nProvider initialLanguage="en">
      <LanguageProbe />
      <Workbench platform={platform} />
    </I18nProvider>
  )
}

function installPlatform(port: PlatformPort): void {
  window.openComparePlatform = port
}

function answers(values: readonly string[]): () => Promise<string | null> {
  const queue = [...values]
  return async () => queue.shift() ?? null
}

async function writeFiles(
  platform: PlatformPort,
  files: readonly (readonly [string, string])[]
): Promise<void> {
  for (const [path, text] of files) await platform.writeTextFile(path, text)
}

describe('runtime language switch', () => {
  it('keeps the shell, empty state and directory view on the active dictionary', async () => {
    const base = createWebPlatformPort()
    await writeFiles(base, [
      ['/memory/same.txt', 's\n'],
      [LEFT_IO, 'a\n'],
      [RIGHT_IO, 'b\n']
    ])
    await base.ensureDirectory('/memory/folder')
    const port: PlatformPort = {
      ...base,
      selectDirectory: answers([DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right]),
      probeTextFile: async () => {
        throw new Error(IO_DETAIL)
      }
    }
    render(<Harness platform={port} />)

    const heading = await screen.findByRole('heading', {
      name: localeText('en', 'shell.empty.title')
    })
    expect(
      screen.getAllByRole('button', { name: localeText('en', 'shell.toolbar.newCompare') }).length
    ).toBeGreaterThan(0)
    expect(
      screen.getByRole('button', { name: localeText('en', 'shell.toolbar.openFile') })
    ).toBeDefined()
    expect(
      screen.getByRole('button', { name: localeText('en', 'shell.toolbar.openFolder') })
    ).toBeDefined()
    expect(document.body.textContent ?? '').not.toMatch(HAN)

    fireEvent.click(screen.getByTestId('switch-zh'))
    expect(heading.textContent).toBe(localeText('zh', 'shell.empty.title'))
    expect(
      screen.getByRole('button', { name: localeText('zh', 'shell.toolbar.openFolder') })
    ).toBeDefined()
    fireEvent.click(screen.getByTestId('switch-en'))
    expect(heading.textContent).toBe(localeText('en', 'shell.empty.title'))
    expect(document.body.textContent ?? '').not.toMatch(HAN)

    fireEvent.click(
      screen.getAllByRole('button', { name: localeText('en', 'shell.toolbar.newCompare') })[0]
    )
    const panel = screen.getByRole('dialog', { name: localeText('en', 'shell.compare.title') })
    const left = within(panel).getByLabelText(localeText('en', 'shell.compare.leftPath'))
    const right = within(panel).getByLabelText(localeText('en', 'shell.compare.rightPath'))
    const submit = (): void => {
      fireEvent.click(
        within(panel).getByRole('button', { name: localeText('en', 'shell.compare.submit') })
      )
    }

    fireEvent.change(left, { target: { value: '/memory/same.txt' } })
    fireEvent.change(right, { target: { value: '/memory/same.txt' } })
    submit()
    await waitFor(() =>
      expect(within(panel).getByRole('alert').textContent).toBe(
        localeText('en', 'shell.compare.error.DUPLICATE_SIDE', { path: '/memory/same.txt' })
      )
    )

    fireEvent.change(right, { target: { value: '/memory/folder' } })
    submit()
    await waitFor(() =>
      expect(within(panel).getByRole('alert').textContent).toBe(
        localeText('en', 'shell.compare.error.TYPE_MISMATCH', {
          left: '/memory/same.txt',
          right: '/memory/folder',
          leftKind: localeText('en', 'common.kind.file'),
          rightKind: localeText('en', 'common.kind.directory')
        })
      )
    )

    fireEvent.change(left, { target: { value: LEFT_IO } })
    fireEvent.change(right, { target: { value: RIGHT_IO } })
    submit()
    await waitFor(() => expect(within(panel).getByRole('alert').textContent).toBe(IO_DETAIL))
    fireEvent.click(within(panel).getByRole('button', { name: localeText('en', 'common.cancel') }))

    fireEvent.click(
      screen.getByRole('button', { name: localeText('en', 'shell.toolbar.openFolder') })
    )
    await screen.findByRole(
      'tablist',
      { name: localeText('en', 'directory.filter.group') },
      { timeout: 4000 }
    )
    const sourceMeta = await screen.findByText(localeText('en', 'directory.panel.source'))
    expect(screen.getByText(localeText('en', 'directory.panel.target'))).toBeDefined()
    const exportButton = (): HTMLElement =>
      screen.getByRole('button', { name: localeText('en', 'directory.report.toolbar.export') })
    expect(exportButton().getAttribute('title')).toBe(
      localeText('en', 'directory.report.toolbar.exportTitle')
    )
    expect(document.body.textContent ?? '').not.toMatch(HAN)

    fireEvent.click(screen.getByTestId('switch-zh'))
    expect(sourceMeta.textContent).toBe(localeText('zh', 'directory.panel.source'))
    expect(
      screen
        .getByRole('button', { name: localeText('zh', 'directory.report.toolbar.export') })
        .getAttribute('title')
    ).toBe(localeText('zh', 'directory.report.toolbar.exportTitle'))
    fireEvent.click(screen.getByTestId('switch-en'))
    expect(sourceMeta.textContent).toBe(localeText('en', 'directory.panel.source'))
    expect(exportButton().getAttribute('title')).toBe(
      localeText('en', 'directory.report.toolbar.exportTitle')
    )
    expect(document.body.textContent ?? '').not.toMatch(HAN)
  }, 30_000)
})

describe('perf window branch', () => {
  it('renders the measurement harness directly and never reads settings', () => {
    const readUserSettings = vi.fn(async () => null)
    installPlatform({
      ...createWebPlatformPort(),
      readUserSettings,
      systemLocale: async () => 'en-US'
    })
    window.history.replaceState(null, '', '?perf=1')

    render(<App />)

    expect(
      screen.queryByRole('heading', { name: localeText('en', 'shell.empty.title') })
    ).toBeNull()
    expect(
      screen.queryByRole('button', { name: localeText('en', 'shell.toolbar.newCompare') })
    ).toBeNull()
    expect(readUserSettings).not.toHaveBeenCalled()
  })
})

describe('locale table single source', () => {
  it('keeps one row per zh key, mirrors both dictionaries and fails closed', () => {
    expect(LOCALE_ROWS).toHaveLength(Object.keys(zh).length)
    for (const row of LOCALE_ROWS) {
      // A dictionary gap makes this check fail instead of passing silently.
      expect(typeof row.en, row.key).toBe('string')
      expect(row.zh, row.key).toBe(messages.zh[row.key])
      expect(row.en, row.key).toBe(messages.en[row.key])
    }
    expect(localeText('en', 'common.confirm')).toBe(en['common.confirm'])
    // A missing value keeps its placeholder visible instead of rendering undefined.
    expect(localeText('en', 'common.itemCount')).toBe(en['common.itemCount'])
  })
})
