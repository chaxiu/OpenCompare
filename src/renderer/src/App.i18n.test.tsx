// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DIRECTORY_SAMPLE_PATHS } from '@shared/fixtures'
import type { PlatformPort, SelectFileOptions, UserSettings } from '@shared/platform/types'
import { App } from './App'
import { renderWithI18n } from './i18n/testing'
import { createWebPlatformPort } from './platform/web-platform'
import { Workbench } from './workbench/Workbench'

const EMPTY_EN = 'Open real files or folders to start comparing'
const EMPTY_ZH = '打开真实文件或文件夹开始对比'
const ENGINE_LEFT = `${DIRECTORY_SAMPLE_PATHS.left}/src/core/engine.ts`
const ENGINE_RIGHT = `${DIRECTORY_SAMPLE_PATHS.right}/src/core/engine.ts`

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

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  delete window.openComparePlatform
  window.history.replaceState(null, '', '/')
  vi.restoreAllMocks()
})

function setRecord(language: 'zh' | 'en'): void {
  localStorage.setItem('opencompare.userSettings', JSON.stringify({ language }))
}

function installPlatform(port: PlatformPort): void {
  window.openComparePlatform = port
}

function withLocale(locale: string): PlatformPort {
  return { ...createWebPlatformPort(), systemLocale: async () => locale }
}

function dropPaths(element: HTMLElement, paths: readonly string[]): void {
  const files = paths.map((path) => new File([''], path.slice(path.lastIndexOf('/') + 1)))
  fireEvent.drop(element, { dataTransfer: { files, types: ['Files'] } })
}

function droppedPort(paths: readonly string[]): PlatformPort {
  const base = createWebPlatformPort()
  const queue = [...paths]
  return { ...base, resolveDroppedPath: async () => queue.shift() ?? '' }
}

async function writeFiles(
  platform: PlatformPort,
  files: readonly (readonly [string, string])[]
): Promise<void> {
  for (const [path, text] of files) await platform.writeTextFile(path, text)
}

function dialog(): HTMLElement {
  return screen.getByRole('dialog', { name: 'New comparison' })
}

async function openDialog(): Promise<HTMLElement> {
  fireEvent.click(screen.getAllByRole('button', { name: 'New comparison' })[0])
  return dialog()
}

function fillPaths(left: string, right: string): void {
  const panel = dialog()
  fireEvent.change(within(panel).getByLabelText('Left path'), { target: { value: left } })
  fireEvent.change(within(panel).getByLabelText('Right path'), { target: { value: right } })
}

function submitDialog(): void {
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Compare' }))
}

describe('start-up language', () => {
  it('shows the English first screen when there is no record and the system is not zh', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: EMPTY_EN })).toBeDefined()
    expect(screen.queryByRole('heading', { name: EMPTY_ZH })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'New comparison' }).length).toBeGreaterThan(0)
    expect(screen.getByText('Comparison and three-way merge workbench')).toBeDefined()
  })

  it('marks the default English first screen as en on <html>', async () => {
    installPlatform(withLocale('en-US'))
    render(<App />)

    await screen.findByRole('heading', { name: EMPTY_EN })
    expect(document.documentElement.lang).toBe('en')
  })

  it('marks the Chinese first screen as zh-CN on <html>', async () => {
    installPlatform(withLocale('zh-CN'))
    render(<App />)

    await screen.findByRole('heading', { name: EMPTY_ZH })
    expect(document.documentElement.lang).toBe('zh-CN')
  })

  it('shows the Chinese first screen for a zh system locale', async () => {
    installPlatform(withLocale('zh-Hant'))
    render(<App />)

    expect(await screen.findByRole('heading', { name: EMPTY_ZH })).toBeDefined()
    expect(screen.getAllByRole('button', { name: '新建对比' }).length).toBeGreaterThan(0)
  })

  it('lets a stored choice win over the system locale', async () => {
    installPlatform(withLocale('zh-CN'))
    setRecord('en')
    const first = render(<App />)
    expect(await screen.findByRole('heading', { name: EMPTY_EN })).toBeDefined()
    first.unmount()

    cleanup()
    installPlatform(withLocale('en-US'))
    setRecord('zh')
    render(<App />)
    expect(await screen.findByRole('heading', { name: EMPTY_ZH })).toBeDefined()
  })

  it('renders only a wordless brand frame until the settings read settles', async () => {
    let resolveSettings!: (settings: UserSettings | null) => void
    const settings = new Promise<UserSettings | null>((resolve) => {
      resolveSettings = resolve
    })
    const subscribe = vi.fn(() => () => undefined)
    const ready = vi.fn(async () => undefined)
    installPlatform({
      ...createWebPlatformPort(),
      readUserSettings: () => settings,
      systemLocale: async () => 'en-US',
      onCompareRequest: subscribe,
      compareRequestsReady: ready
    })

    const { container } = render(<App />)

    expect(container.textContent).toBe('')
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('tablist')).toBeNull()

    await act(async () => {
      resolveSettings({ language: 'en' })
      await settings
    })

    expect(await screen.findByRole('heading', { name: EMPTY_EN })).toBeDefined()
    expect(subscribe).toHaveBeenCalledTimes(1)
    expect(ready).toHaveBeenCalledTimes(1)
  })

  it('keeps the perf window branch direct and never reads settings', async () => {
    const readUserSettings = vi.fn(async () => null)
    installPlatform({
      ...createWebPlatformPort(),
      readUserSettings,
      systemLocale: async () => 'en-US'
    })
    window.history.replaceState(null, '', '?perf=1')

    render(<App />)

    expect(screen.queryByRole('heading', { name: EMPTY_EN })).toBeNull()
    expect(screen.queryByRole('heading', { name: EMPTY_ZH })).toBeNull()
    expect(screen.queryByRole('button', { name: 'New comparison' })).toBeNull()
    expect(readUserSettings).not.toHaveBeenCalled()
  })
})

describe('English shell copy', () => {
  beforeEach(() => setRecord('en'))

  it('localizes the toolbar, view switcher and empty state', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: EMPTY_EN })

    expect(screen.getByText('Comparison and three-way merge workbench')).toBeDefined()
    const switcher = screen.getByRole('tablist', { name: 'Switch view' })
    expect(within(switcher).getByRole('tab', { name: 'Directory' })).toBeDefined()
    expect(within(switcher).getByRole('tab', { name: 'Code diff & 3-way' })).toBeDefined()
    expect(within(switcher).getByRole('tab', { name: 'CSV key comparison' })).toBeDefined()
    expect(within(switcher).getByRole('tab', { name: 'JSON / YAML' })).toBeDefined()

    expect(screen.getAllByRole('button', { name: 'New comparison' }).length).toBe(2)
    expect(screen.getAllByRole('button', { name: 'Open file' }).length).toBe(1)
    expect(screen.getAllByRole('button', { name: 'Open folder' }).length).toBe(1)
    expect(screen.getByRole('button', { name: 'Load demo samples' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Demo samples' })).toBeDefined()

    const toolbarNew = screen.getAllByRole('button', { name: 'New comparison' })[0]
    expect(toolbarNew.getAttribute('title')).toContain('Enter or paste two real paths')
    expect(screen.getByText(/Drop two paths of the same kind/)).toBeDefined()
  })

  it('localizes session tabs, the dirty marker and the close name', async () => {
    renderWithI18n(
      <Workbench platform={{ ...createWebPlatformPort(), selectFile: answers([ENGINE_LEFT, ENGINE_RIGHT]) }} />,
      'en'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open file' }))
    await screen.findByRole('tab', { name: /engine\.ts/ }, { timeout: 4000 })

    fireEvent.click(screen.getByRole('button', { name: 'Overwrite to right' }))
    const tablist = screen.getByRole('tablist', { name: 'Sessions' })
    expect(within(tablist).getByTitle('Unsaved changes')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Close engine.ts' })).toBeDefined()
  })

  it('localizes the sample library failure without leaking Chinese detail', async () => {
    renderWithI18n(<Workbench platform={createWebPlatformPort()} />, 'en')
    fireEvent.click(screen.getByRole('button', { name: 'Demo samples' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Demo: sample read failure/ }))

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Could not read the sample library' },
        { timeout: 4000 }
      )
    ).toBeDefined()
    const main = screen.getByRole('main')
    expect(main.textContent).toContain(
      'Could not read the built-in sample library: /samples/csv/orders.left.csv is missing.'
    )
    expect(main.textContent ?? '').not.toMatch(/\p{Script=Han}/u)
  })

  it('renders sample sessions from dictionary keys instead of fixture Chinese', async () => {
    renderWithI18n(<Workbench platform={createWebPlatformPort()} />, 'en')
    fireEvent.click(screen.getByRole('button', { name: 'Load demo samples' }))
    const tablist = await screen.findByRole('tablist', { name: 'Sessions' }, { timeout: 4000 })

    const tabs = within(tablist).getAllByRole('tab').map((tab) => tab.textContent ?? '')
    expect(tabs[0]).toContain('baseline ↔ candidate')
    expect(tabs[1]).toContain('Code diff & 3-way merge')
    expect(tabs[2]).toContain('CSV key comparison')
    expect(tabs[3]).toContain('JSON / YAML semantic comparison')
    expect(tablist.textContent ?? '').not.toMatch(/\p{Script=Han}/u)
  })

  it('localizes runtime file-pair and directory subtitles while keeping user data', async () => {
    const base = createWebPlatformPort()
    await writeFiles(base, [
      ['/memory/left a.txt', 'a\n'],
      ['/memory/right b.txt', 'b\n']
    ])
    renderWithI18n(<Workbench platform={base} />, 'en')

    await openDialog()
    fillPaths('/memory/left a.txt', '/memory/right b.txt')
    submitDialog()

    const tablist = await screen.findByRole('tablist', { name: 'Sessions' }, { timeout: 4000 })
    expect(tablist.textContent).toContain('/memory/left a.txt ↔ /memory/right b.txt · Code / text')

    const directoryPort: PlatformPort = {
      ...createWebPlatformPort(),
      selectDirectory: answers([DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right])
    }
    cleanup()
    renderWithI18n(<Workbench platform={directoryPort} />, 'en')
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }))
    const directoryTabs = await screen.findByRole(
      'tablist',
      { name: 'Sessions' },
      { timeout: 4000 }
    )
    expect(directoryTabs.textContent).toContain('baseline ↔ candidate')
    expect(directoryTabs.textContent).toContain(
      `${DIRECTORY_SAMPLE_PATHS.left} ↔ ${DIRECTORY_SAMPLE_PATHS.right}`
    )
  })

  it('overrides the code conflict stat by stable key, not by label text', async () => {
    renderWithI18n(<Workbench platform={createWebPlatformPort()} />, 'en')
    fireEvent.click(screen.getByRole('button', { name: 'Load demo samples' }))
    const codeTab = await screen.findByRole(
      'tab',
      { name: /Code diff & 3-way merge/ },
      { timeout: 4000 }
    )
    fireEvent.click(codeTab)

    expect(screen.getByRole('contentinfo').textContent).toMatch(/Conflict blocks\s*3/)
    fireEvent.click(screen.getAllByRole('button', { name: 'Accept Ours' })[0])
    await waitFor(() =>
      expect(screen.getByRole('contentinfo').textContent).toMatch(/Conflict blocks\s*2/)
    )
  })

  it('localizes the unsaved-close dialog and keeps both actions working', async () => {
    renderWithI18n(
      <Workbench platform={{ ...createWebPlatformPort(), selectFile: answers([ENGINE_LEFT, ENGINE_RIGHT]) }} />,
      'en'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open file' }))
    await screen.findByRole('tab', { name: /engine\.ts/ }, { timeout: 4000 })
    fireEvent.click(screen.getByRole('button', { name: 'Overwrite to right' }))

    fireEvent.click(screen.getByRole('button', { name: 'Close engine.ts' }))
    const prompt = screen.getByRole('dialog', { name: 'Close a session with unsaved changes?' })
    expect(prompt.textContent).toContain('engine.ts')
    expect(prompt.textContent).toContain('Continue editing')
    expect(prompt.textContent).toContain('Discard and close')

    fireEvent.click(within(prompt).getByRole('button', { name: 'Continue editing' }))
    expect(screen.getByRole('tab', { name: /engine\.ts/ })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Close engine.ts' }))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard and close' })
    )
    expect(screen.queryByRole('tab', { name: /engine\.ts/ })).toBeNull()
    expect(screen.getByRole('heading', { name: EMPTY_EN })).toBeDefined()
  })
})

describe('English directory progress and notices', () => {
  it('localizes progress, growing counts and cancellation without touching the shell', async () => {
    const base = createWebPlatformPort()
    await writeFiles(base, [
      ['/memory/progress/left/a.txt', 'x'],
      ['/memory/progress/right/a.txt', 'x']
    ])
    const answersList = ['/memory/progress/left', '/memory/progress/right']
    let releaseScan!: () => void
    const scanGate = new Promise<void>((resolve) => {
      releaseScan = resolve
    })
    const digestGate = new Promise<void>(() => undefined)
    const cancelled: string[] = []
    const port: PlatformPort = {
      ...base,
      selectDirectory: async () => answersList.shift() ?? null,
      listDirectories: async (paths) => {
        await scanGate
        return base.listDirectories(paths)
      },
      digestFiles: async (paths, options) => {
        await digestGate
        return base.digestFiles(paths, options)
      },
      cancelOperation: async (operationId) => {
        cancelled.push(operationId)
      }
    }

    renderWithI18n(<Workbench platform={port} />, 'en')
    const statusBefore = screen.getByRole('contentinfo').textContent
    const viewBefore = screen.getByRole('main').innerHTML

    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }))
    const bar = await screen.findByRole('status', { name: 'Directory comparison progress' })
    expect(bar.textContent).toContain('Scanning directories')
    expect(bar.textContent).toMatch(/0 files scanned/)

    releaseScan()
    await waitFor(() => expect(bar.textContent).toMatch(/2 files scanned/))
    expect(bar.textContent).toMatch(/\d+(?:\.\d+)? (B|KiB|MiB|GiB) processed/)

    fireEvent.click(within(bar).getByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(screen.queryByRole('status', { name: 'Directory comparison progress' })).toBeNull()
    )
    const notice = await screen.findByRole('alert')
    expect(notice.textContent).toBe(
      'This directory comparison was cancelled; the workbench keeps its pre-cancel state.'
    )
    expect(cancelled).toHaveLength(1)
    expect(screen.getByRole('contentinfo').textContent).toBe(statusBefore)
    expect(screen.getByRole('main').innerHTML).toBe(viewBefore)
  })

  it('localizes the digest phase counts and keeps the pipeline total', async () => {
    const base = createWebPlatformPort()
    const files: [string, string][] = []
    for (let index = 0; index < 130; index += 1) {
      files.push([`/memory/digest/left/f-${index}.txt`, 'x'])
      files.push([`/memory/digest/right/f-${index}.txt`, 'x'])
    }
    await writeFiles(base, files)

    const answersList = ['/memory/digest/left', '/memory/digest/right']
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const secondGate = new Promise<void>(() => undefined)
    let digestCalls = 0
    const port: PlatformPort = {
      ...base,
      selectDirectory: async () => answersList.shift() ?? null,
      digestFiles: async (paths, options) => {
        digestCalls += 1
        if (digestCalls === 1) await firstGate
        if (digestCalls === 2) await secondGate
        return base.digestFiles(paths, options)
      }
    }

    renderWithI18n(<Workbench platform={port} />, 'en')
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }))
    const bar = await screen.findByRole('status', { name: 'Directory comparison progress' })
    await waitFor(() => expect(bar.textContent).toMatch(/260 files scanned/))
    expect(bar.textContent).toContain('Scanning directories')

    releaseFirst()
    await waitFor(() => expect(bar.textContent).toContain('Verifying content'))
    expect(bar.textContent).toMatch(/64 files verified/)
    expect(bar.textContent).toMatch(/324 files so far/)
  })

  it('localizes the single, over-full and mixed drop notices without opening sessions', async () => {
    renderWithI18n(
      <Workbench platform={droppedPort([ENGINE_LEFT])} />,
      'en'
    )
    dropPaths(screen.getByRole('main'), [ENGINE_LEFT])
    expect((await screen.findByRole('alert')).textContent).toContain(
      `Using ${ENGINE_LEFT} as the left baseline`
    )
    expect(screen.queryByRole('tablist', { name: 'Sessions' })).toBeNull()

    cleanup()
    renderWithI18n(
      <Workbench
        platform={droppedPort([ENGINE_LEFT, ENGINE_RIGHT, `${DIRECTORY_SAMPLE_PATHS.left}/README`])}
      />,
      'en'
    )
    dropPaths(screen.getByRole('main'), [
      ENGINE_LEFT,
      ENGINE_RIGHT,
      `${DIRECTORY_SAMPLE_PATHS.left}/README`
    ])
    expect((await screen.findByRole('alert')).textContent).toContain('3 were dropped')
    expect(screen.queryByRole('tablist', { name: 'Sessions' })).toBeNull()

    cleanup()
    renderWithI18n(
      <Workbench platform={droppedPort([DIRECTORY_SAMPLE_PATHS.left, ENGINE_RIGHT])} />,
      'en'
    )
    dropPaths(screen.getByRole('main'), [DIRECTORY_SAMPLE_PATHS.left, ENGINE_RIGHT])
    expect((await screen.findByRole('alert')).textContent).toContain(
      'One dropped item is a file and the other is a folder'
    )
    expect(screen.queryByRole('tablist', { name: 'Sessions' })).toBeNull()
  })

  it('localizes the skipped notice and the snapshot export / import results', async () => {
    const base = createWebPlatformPort()
    const unreadable = {
      name: 'unreadable',
      path: `${DIRECTORY_SAMPLE_PATHS.left}/unreadable`,
      isDirectory: false,
      size: 0,
      modifiedMs: 0,
      broken: true,
      skippedReason: 'unreadable'
    }
    const skippedPort: PlatformPort = {
      ...base,
      resolveDroppedPath: async (file) =>
        file.name === 'baseline' ? DIRECTORY_SAMPLE_PATHS.left : DIRECTORY_SAMPLE_PATHS.right,
      listDirectory: async (path) => [
        ...(await base.listDirectory(path)),
        ...(path === DIRECTORY_SAMPLE_PATHS.left ? [unreadable] : [])
      ],
      listDirectories: async (paths) =>
        Promise.all(
          paths.map(async (path) => {
            const entries = await base.listDirectory(path)
            return {
              path,
              ok: true as const,
              entries: path === DIRECTORY_SAMPLE_PATHS.left ? [...entries, unreadable] : entries
            }
          })
        )
    }

    renderWithI18n(<Workbench platform={skippedPort} />, 'en')
    dropPaths(screen.getByRole('main'), [
      `${DIRECTORY_SAMPLE_PATHS.left}/baseline`,
      `${DIRECTORY_SAMPLE_PATHS.right}/candidate`
    ])
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Skipped: 1 on the left / 0 on the right'
    )

    cleanup()
    const exported = { text: '' }
    const snapshotPort: PlatformPort = {
      ...createWebPlatformPort(),
      saveFile: async (options) => {
        exported.text = options.content
        return '/memory/baseline.ocsnap.json'
      }
    }
    renderWithI18n(<Workbench platform={snapshotPort} />, 'en')
    fireEvent.click(screen.getByRole('button', { name: 'Load demo samples' }))
    await screen.findByRole('tab', { name: /Code diff & 3-way merge/ }, { timeout: 4000 })
    fireEvent.click(screen.getByRole('button', { name: 'Export left snapshot' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Exported to /memory/baseline.ocsnap.json (15 files).'
    )

    fireEvent.change(screen.getByLabelText('Choose right snapshot file'), {
      target: { files: [new File([exported.text], 'baseline.ocsnap.json')] }
    })
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'Mounted snapshot baseline on the right side.'
      )
    )
  })
})

describe('English new-comparison dialog', () => {
  it('localizes the dialog shell', async () => {
    renderWithI18n(<Workbench platform={createWebPlatformPort()} />, 'en')
    const panel = await openDialog()

    expect(panel.textContent).toContain('New comparison')
    expect(within(panel).getByLabelText('Left path')).toBeDefined()
    expect(within(panel).getByLabelText('Right path')).toBeDefined()
    expect(within(panel).getByRole('button', { name: 'Cancel' })).toBeDefined()
    expect(within(panel).getByRole('button', { name: 'Compare' })).toBeDefined()
    expect(within(panel).getByRole('button', { name: 'Open file' }).getAttribute('title')).toBe(
      'Choose the left and right files in order'
    )
    expect(within(panel).getByRole('button', { name: 'Open folder' }).getAttribute('title')).toBe(
      'Choose the left and right folders in order'
    )
    expect(panel.textContent).toContain('Enter to compare · Esc to close')
    expect(panel.textContent ?? '').not.toMatch(/\p{Script=Han}/u)
    expect(
      (within(panel).getByLabelText('Left path') as HTMLInputElement).placeholder
    ).toBe('/Users/you/left a.txt or ~/project/a.txt')
  })

  it('localizes each stable validation code and keeps the dialog open', async () => {
    const base = createWebPlatformPort()
    await writeFiles(base, [
      ['/memory/a.txt', 'a\n'],
      ['/memory/b.bin', 'b'],
      ['/memory/c.bin', 'c'],
      ['/memory/same.txt', 's\n']
    ])
    await base.ensureDirectory('/memory/folder')
    const statPath = vi.fn(base.statPath)
    const listDirectories = vi.fn(base.listDirectories)
    renderWithI18n(<Workbench platform={{ ...base, statPath, listDirectories }} />, 'en')

    await openDialog()
    fillPaths('/memory/a.txt', '')
    submitDialog()
    expect((await within(dialog()).findByRole('alert')).textContent).toBe(
      'The right path is empty. Enter a valid path.'
    )
    expect(statPath).not.toHaveBeenCalled()

    fillPaths('/memory/same.txt', '/memory/same.txt')
    submitDialog()
    expect((await within(dialog()).findByRole('alert')).textContent).toContain(
      'Both sides point to the same path: /memory/same.txt'
    )

    fillPaths('/memory/a.txt', '/memory/folder')
    submitDialog()
    const mismatch = await within(dialog()).findByRole('alert')
    expect(mismatch.textContent).toContain('The two sides differ in type')
    expect(mismatch.textContent).toContain('/memory/a.txt')
    expect(mismatch.textContent).toContain('/memory/folder')

    fillPaths('/memory/b.bin', '/memory/c.bin')
    submitDialog()
    expect((await within(dialog()).findByRole('alert')).textContent).toContain(
      'Unsupported file type'
    )

    expect(screen.queryByRole('tablist', { name: 'Sessions' })).toBeNull()
    expect(dialog()).toBeDefined()
    expect(listDirectories).not.toHaveBeenCalled()
  })

  it('keeps raw I/O detail as the error detail and the shell in English', async () => {
    const base = createWebPlatformPort()
    await writeFiles(base, [
      ['/memory/io-left.txt', 'a\n'],
      ['/memory/io-right.txt', 'b\n']
    ])
    renderWithI18n(
      <Workbench
        platform={{
          ...base,
          readTextFile: async () => {
            throw new Error('EACCES: permission denied')
          }
        }}
      />,
      'en'
    )

    await openDialog()
    fillPaths('/memory/io-left.txt', '/memory/io-right.txt')
    submitDialog()

    const alert = await within(dialog()).findByRole('alert')
    expect(alert.textContent).toContain('EACCES: permission denied')
    expect(dialog().textContent).toContain('New comparison')
    expect(within(dialog()).getByLabelText('Left path')).toBeDefined()
    expect(within(dialog()).getByRole('button', { name: 'Compare' })).toBeDefined()
  })
})

describe('English drilldown navigation', () => {
  it('localizes the source line and both return results', async () => {
    renderWithI18n(<Workbench platform={createWebPlatformPort()} />, 'en')
    fireEvent.click(screen.getByRole('button', { name: 'Load demo samples' }))
    await screen.findByRole('tab', { name: /Code diff & 3-way merge/ }, { timeout: 4000 })

    fireEvent.doubleClick(screen.getAllByText('engine.ts')[0])
    expect(
      await screen.findByRole('button', { name: 'Back to directory view' }, { timeout: 4000 })
    ).toBeDefined()
    expect(screen.getByText(/From directory comparison: baseline ↔ candidate/)).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Close baseline ↔ candidate' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to directory view' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The source directory session is no longer available, and there is no other directory comparison to return to.'
    )
  })

  it('falls back to another directory comparison and names it', async () => {
    const port: PlatformPort = {
      ...createWebPlatformPort(),
      selectDirectory: answers([
        DIRECTORY_SAMPLE_PATHS.left,
        DIRECTORY_SAMPLE_PATHS.right,
        DIRECTORY_SAMPLE_PATHS.right,
        DIRECTORY_SAMPLE_PATHS.left
      ])
    }
    renderWithI18n(<Workbench platform={port} />, 'en')
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }))
    await screen.findByRole('tab', { name: /baseline ↔ candidate/ }, { timeout: 4000 })
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }))
    await screen.findByRole('tab', { name: /candidate ↔ baseline/ }, { timeout: 4000 })

    fireEvent.doubleClick(within(screen.getAllByRole('tree')[0]).getAllByText('engine.ts')[0])
    await screen.findByRole('button', { name: 'Back to directory view' }, { timeout: 4000 })
    fireEvent.click(screen.getByRole('button', { name: 'Close candidate ↔ baseline' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to directory view' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'The source directory session is no longer available; returned to baseline ↔ candidate instead.'
    )
  })
})

describe('pickers and no extra work', () => {
  it('passes the current language into the platform dialog titles', async () => {
    const base = createWebPlatformPort()
    const fileTitles: (SelectFileOptions | undefined)[] = []
    const saveTitles: string[] = []
    const saveFilters: (SelectFileOptions['filters'] | undefined)[] = []
    let pickerCalls = 0
    const port: PlatformPort = {
      ...base,
      selectFile: async (options) => {
        fileTitles.push(options)
        pickerCalls += 1
        return pickerCalls === 1 ? '/memory/left a.txt' : null
      },
      saveFile: async (options) => {
        saveTitles.push(options.title ?? '')
        saveFilters.push(options.filters)
        return null
      }
    }
    renderWithI18n(<Workbench platform={port} />, 'en')

    fireEvent.click(screen.getByRole('button', { name: 'Open file' }))
    await waitFor(() => expect(fileTitles).toHaveLength(2))
    expect(fileTitles[0]?.title).toBe('Choose the left file')
    expect(fileTitles[1]?.title).toBe('Choose the right file')

    fireEvent.click(screen.getByRole('button', { name: 'Load demo samples' }))
    await screen.findByRole('tab', { name: /Code diff & 3-way merge/ }, { timeout: 4000 })
    fireEvent.click(screen.getByRole('button', { name: 'Export left snapshot' }))
    await waitFor(() => expect(saveTitles).toHaveLength(1))
    expect(saveTitles[0]).toBe('Export directory snapshot')
    expect(saveFilters[0]).toEqual([
      { name: 'OpenCompare snapshot', extensions: ['ocsnap.json', 'json'] }
    ])
  })

  it('builds the snapshot filter name in the active language', async () => {
    const saveFilters: (SelectFileOptions['filters'] | undefined)[] = []
    const port: PlatformPort = {
      ...createWebPlatformPort(),
      saveFile: async (options) => {
        saveFilters.push(options.filters)
        return null
      }
    }
    renderWithI18n(<Workbench platform={port} />, 'zh')

    fireEvent.click(screen.getByRole('button', { name: '加载演示样本' }))
    await screen.findByRole('tab', { name: /代码 Diff & 3-Way Merge/ }, { timeout: 4000 })
    fireEvent.click(screen.getByRole('button', { name: '导出左侧快照' }))
    await waitFor(() => expect(saveFilters).toHaveLength(1))
    expect(saveFilters[0]).toEqual([
      { name: 'OpenCompare 快照', extensions: ['ocsnap.json', 'json'] }
    ])
  })

  it('renders the same sessions with the same platform calls in both languages', async () => {
    const first = countingPort()
    renderWithI18n(<Workbench platform={first.port} />, 'zh')
    fireEvent.click(screen.getByRole('button', { name: '加载演示样本' }))
    const zhTabs = await screen.findByRole('tablist', { name: '会话' }, { timeout: 4000 })
    const zhOrder = within(zhTabs).getAllByRole('tab').map((tab) => tab.textContent ?? '')
    const zhActive = within(zhTabs)
      .getAllByRole('tab')
      .findIndex((tab) => tab.getAttribute('aria-selected') === 'true')
    const zhStatus = screen.getByRole('contentinfo').textContent

    cleanup()
    const second = countingPort()
    renderWithI18n(<Workbench platform={second.port} />, 'en')
    fireEvent.click(screen.getByRole('button', { name: 'Load demo samples' }))
    const enTabs = await screen.findByRole('tablist', { name: 'Sessions' }, { timeout: 4000 })
    const enOrder = within(enTabs).getAllByRole('tab').map((tab) => tab.textContent ?? '')
    const enActive = within(enTabs)
      .getAllByRole('tab')
      .findIndex((tab) => tab.getAttribute('aria-selected') === 'true')
    const enStatus = screen.getByRole('contentinfo').textContent

    const activeId = `directory:${DIRECTORY_SAMPLE_PATHS.left} ↔ ${DIRECTORY_SAMPLE_PATHS.right}`
    expect(enOrder).toHaveLength(zhOrder.length)
    expect(enActive).toBe(zhActive)
    expect(zhStatus).toContain(activeId)
    expect(enStatus).toContain(activeId)
    expect(zhOrder[0]).toContain('baseline ↔ candidate')
    expect(enOrder[0]).toContain('baseline ↔ candidate')
    expect(second.counts).toEqual(first.counts)
  })
})

describe('English smoke', () => {
  it('renders the empty state, dialog, tab strip and status bar without Han text', async () => {
    const base = createWebPlatformPort()
    setRecord('en')
    installPlatform(base)
    render(<App />)
    await screen.findByRole('heading', { name: EMPTY_EN })

    expect(screen.getByRole('main').textContent ?? '').not.toMatch(/\p{Script=Han}/u)

    fireEvent.click(screen.getAllByRole('button', { name: 'New comparison' })[0])
    expect(screen.getByRole('dialog', { name: 'New comparison' }).textContent ?? '').not.toMatch(
      /\p{Script=Han}/u
    )
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }))

    fireEvent.click(screen.getByRole('button', { name: 'Load demo samples' }))
    const tablist = await screen.findByRole('tablist', { name: 'Sessions' }, { timeout: 4000 })
    expect(tablist.textContent ?? '').not.toMatch(/\p{Script=Han}/u)
    expect(screen.getByRole('contentinfo').textContent ?? '').not.toMatch(/\p{Script=Han}/u)
  })
})

function answers(values: readonly string[]): () => Promise<string | null> {
  const queue = [...values]
  return async () => queue.shift() ?? null
}

function countingPort(): {
  readonly port: PlatformPort
  readonly counts: Record<'listDirectory' | 'listDirectories' | 'digestFiles' | 'readTextFile', number>
} {
  const base = createWebPlatformPort()
  const counts = { listDirectory: 0, listDirectories: 0, digestFiles: 0, readTextFile: 0 }
  return {
    counts,
    port: {
      ...base,
      listDirectory: async (path) => {
        counts.listDirectory += 1
        return base.listDirectory(path)
      },
      listDirectories: async (paths, options) => {
        counts.listDirectories += 1
        return base.listDirectories(paths, options)
      },
      digestFiles: async (paths, options) => {
        counts.digestFiles += 1
        return base.digestFiles(paths, options)
      },
      readTextFile: async (path) => {
        counts.readTextFile += 1
        return base.readTextFile(path)
      }
    }
  }
}
