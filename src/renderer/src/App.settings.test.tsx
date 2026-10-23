// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DIRECTORY_SAMPLE_PATHS } from '@shared/fixtures'
import type { PlatformPort, UserSettings } from '@shared/platform/types'
import { App } from './App'
import { renderWithI18n } from './i18n/testing'
import { createWebPlatformPort } from './platform/web-platform'
import { Workbench } from './workbench/Workbench'

const EMPTY_EN = 'Open real files or folders to start comparing'
const EMPTY_ZH = '打开真实文件或文件夹开始对比'
const LEFT_ENGINE = `${DIRECTORY_SAMPLE_PATHS.left}/src/core/engine.ts`

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
  vi.restoreAllMocks()
})

function installPlatform(port: PlatformPort): void {
  window.openComparePlatform = port
}

async function writeFiles(
  platform: PlatformPort,
  files: readonly (readonly [string, string])[]
): Promise<void> {
  for (const [path, text] of files) await platform.writeTextFile(path, text)
}

function answers(values: readonly string[]): () => Promise<string | null> {
  const queue = [...values]
  return async () => queue.shift() ?? null
}

function settingsDialog(language: 'zh' | 'en'): HTMLElement {
  return screen.getByRole('dialog', { name: language === 'zh' ? '设置' : 'Settings' })
}

function openSettings(language: 'zh' | 'en'): HTMLElement {
  fireEvent.click(
    screen.getByRole('button', { name: language === 'zh' ? '打开设置' : 'Open settings' })
  )
  return settingsDialog(language)
}

function languageOptions(panel: HTMLElement, language: 'zh' | 'en'): HTMLElement[] {
  const group = within(panel).getByRole('tablist', {
    name: language === 'zh' ? '语言' : 'Language'
  })
  return within(group).getAllByRole('tab')
}

function dropPaths(element: HTMLElement, paths: readonly string[]): void {
  const files = paths.map((path) => new File([''], path.slice(path.lastIndexOf('/') + 1)))
  fireEvent.drop(element, { dataTransfer: { files, types: ['Files'] } })
}

describe('settings entry', () => {
  it('stays reachable and reopens on the empty screen', () => {
    renderWithI18n(<Workbench platform={createWebPlatformPort()} />, 'en')

    const entry = screen.getByRole('button', { name: 'Open settings' })
    expect((entry as HTMLButtonElement).disabled).toBe(false)
    expect(entry.getAttribute('title')).toBe('Open settings')

    fireEvent.click(entry)
    expect(settingsDialog('en')).toBeDefined()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Open settings' })).toBeDefined()

    expect(openSettings('en')).toBeDefined()
  })

  it('stays reachable with sessions open', async () => {
    renderWithI18n(<Workbench platform={createWebPlatformPort()} />, 'en')
    fireEvent.click(screen.getByRole('button', { name: 'Load demo samples' }))
    await screen.findByRole('tablist', { name: 'Sessions' }, { timeout: 4000 })

    const entry = screen.getByRole('button', { name: 'Open settings' })
    expect((entry as HTMLButtonElement).disabled).toBe(false)
    expect(openSettings('en')).toBeDefined()
  })

  it('stays reachable while a directory scan is running', async () => {
    const base = createWebPlatformPort()
    await writeFiles(base, [
      ['/memory/scan/left/a.txt', 'x'],
      ['/memory/scan/right/a.txt', 'x']
    ])
    const directories = ['/memory/scan/left', '/memory/scan/right']
    const never = new Promise<void>(() => undefined)
    const port: PlatformPort = {
      ...base,
      selectDirectory: answers(directories),
      listDirectories: async (paths, options) => {
        await never
        return base.listDirectories(paths, options)
      }
    }
    renderWithI18n(<Workbench platform={port} />, 'en')

    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }))
    await screen.findByRole('status', { name: 'Directory comparison progress' })

    const entry = screen.getByRole('button', { name: 'Open settings' })
    expect((entry as HTMLButtonElement).disabled).toBe(false)
    expect(openSettings('en')).toBeDefined()
  })
})

describe('settings language options', () => {
  it('lists the same two self-labelled options in both UI languages', () => {
    renderWithI18n(<Workbench platform={createWebPlatformPort()} />, 'zh')
    const zhPanel = openSettings('zh')
    const zhOptions = languageOptions(zhPanel, 'zh')
    expect(zhOptions.map((option) => option.textContent)).toEqual(['English', '简体中文'])
    expect(zhOptions[0].getAttribute('aria-selected')).toBe('false')
    expect(zhOptions[1].getAttribute('aria-selected')).toBe('true')
    expect(zhPanel.textContent).toContain('语言')
    expect(within(zhPanel).getByRole('button', { name: '关闭' })).toBeDefined()

    cleanup()
    renderWithI18n(<Workbench platform={createWebPlatformPort()} />, 'en')
    const enPanel = openSettings('en')
    const enOptions = languageOptions(enPanel, 'en')
    expect(enOptions.map((option) => option.textContent)).toEqual(['English', '简体中文'])
    expect(enOptions[0].getAttribute('aria-selected')).toBe('true')
    expect(enOptions[1].getAttribute('aria-selected')).toBe('false')
    expect(enPanel.textContent).toContain('Language')
    expect(within(enPanel).getByRole('button', { name: 'Close' })).toBeDefined()

    // The only Han text left in the English panel is the Chinese self-label.
    const visible = (enPanel.textContent ?? '').replaceAll('简体中文', '')
    expect(visible).not.toMatch(/\p{Script=Han}/u)
  })
})

describe('language switch', () => {
  it('switches every shell surface in the same click, before the write settles', async () => {
    const readUserSettings = vi.fn(async (): Promise<UserSettings | null> => ({ language: 'en' }))
    const writeUserSettings = vi.fn(
      (): Promise<void> => new Promise<void>(() => undefined)
    )
    installPlatform({
      ...createWebPlatformPort(),
      readUserSettings,
      writeUserSettings,
      systemLocale: async () => 'en-US'
    })
    render(<App />)
    await screen.findByRole('heading', { name: EMPTY_EN })
    const readsAtStartup = readUserSettings.mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: 'Load demo samples' }))
    await screen.findByRole('tablist', { name: 'Sessions' }, { timeout: 4000 })
    openSettings('en')

    fireEvent.click(languageOptions(settingsDialog('en'), 'en')[1])

    // Same render batch: header, views, tabs, status bar and the panel are Chinese.
    expect(screen.getByText('对比与三向合并工作台')).toBeDefined()
    const switcher = screen.getByRole('tablist', { name: '视图切换' })
    expect(
      within(switcher)
        .getAllByRole('tab')
        .map((tab) => tab.textContent)
    ).toEqual(['目录对比', '代码 Diff & 3-Way', 'CSV 主键对比', 'JSON / YAML'])
    expect(screen.getByRole('tablist', { name: '会话' })).toBeDefined()
    expect(screen.getByRole('contentinfo').textContent).toContain('会话')
    expect(settingsDialog('zh')).toBeDefined()
    expect(languageOptions(settingsDialog('zh'), 'zh').map((tab) => tab.textContent)).toEqual([
      'English',
      '简体中文'
    ])

    await act(async () => {
      await Promise.resolve()
    })
    expect(writeUserSettings).toHaveBeenCalledTimes(1)
    expect(writeUserSettings).toHaveBeenCalledWith({ language: 'zh' })
    expect(readUserSettings.mock.calls.length).toBe(readsAtStartup)

    fireEvent.click(languageOptions(settingsDialog('zh'), 'zh')[0])
    expect(screen.getByText('Comparison and three-way merge workbench')).toBeDefined()
    expect(screen.getByRole('tablist', { name: 'Switch view' })).toBeDefined()
    expect(screen.getByRole('tablist', { name: 'Sessions' })).toBeDefined()
    expect(screen.getByRole('contentinfo').textContent).toContain('Session')
    expect(settingsDialog('en')).toBeDefined()
  })

  it('writes serially so the last choice is the one read back', async () => {
    const web = createWebPlatformPort()
    const writes: UserSettings[] = []
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const port: PlatformPort = {
      ...web,
      writeUserSettings: async (settings) => {
        writes.push(settings)
        if (writes.length === 1) await firstGate
        await web.writeUserSettings(settings)
      }
    }
    renderWithI18n(<Workbench platform={port} />, 'en')

    const panel = openSettings('en')
    fireEvent.click(languageOptions(panel, 'en')[1])
    await waitFor(() => expect(writes).toHaveLength(1))

    // The second pick is queued, not issued while the first write is open.
    fireEvent.click(languageOptions(settingsDialog('zh'), 'zh')[0])
    await act(async () => {
      await Promise.resolve()
    })
    expect(writes).toHaveLength(1)
    expect(settingsDialog('en')).toBeDefined()

    await act(async () => {
      releaseFirst()
      await firstGate
    })
    await waitFor(() => expect(writes).toHaveLength(2))
    expect(writes).toEqual([{ language: 'zh' }, { language: 'en' }])
    await expect(port.readUserSettings()).resolves.toEqual({ language: 'en' })
  })

  it('keeps the chosen language and reports a failed write in place', async () => {
    const web = createWebPlatformPort()
    let failing = true
    const port: PlatformPort = {
      ...web,
      writeUserSettings: async (settings) => {
        if (failing) throw new Error('EACCES: permission denied')
        await web.writeUserSettings(settings)
      }
    }
    renderWithI18n(<Workbench platform={port} />, 'en')
    fireEvent.click(screen.getByRole('button', { name: 'Load demo samples' }))
    await screen.findByRole('tablist', { name: 'Sessions' }, { timeout: 4000 })
    const tabsBefore = within(screen.getByRole('tablist', { name: 'Sessions' })).getAllByRole('tab')
    const activeBefore = tabsBefore.findIndex(
      (tab) => tab.getAttribute('aria-selected') === 'true'
    )

    const panel = openSettings('en')
    fireEvent.click(languageOptions(panel, 'en')[1])

    const alert = await within(panel).findByRole('alert')
    expect(alert.textContent).toBe('设置保存失败：EACCES: permission denied')
    // No rollback: the interface and the panel stay on the chosen language.
    expect(settingsDialog('zh')).toBeDefined()
    const tabsAfter = within(screen.getByRole('tablist', { name: '会话' })).getAllByRole('tab')
    expect(tabsAfter).toHaveLength(tabsBefore.length)
    expect(tabsAfter.findIndex((tab) => tab.getAttribute('aria-selected') === 'true')).toBe(
      activeBefore
    )

    failing = false
    fireEvent.click(languageOptions(panel, 'zh')[0])
    await waitFor(() => expect(within(settingsDialog('en')).queryByRole('alert')).toBeNull())

    fireEvent.click(within(settingsDialog('en')).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(within(openSettings('en')).queryByRole('alert')).toBeNull()
  })

  it('re-translates the notice already on screen without extra platform work', async () => {
    const base = createWebPlatformPort()
    const resolveDroppedPath = vi.fn(async () => LEFT_ENGINE)
    const listDirectory = vi.fn(base.listDirectory)
    const port: PlatformPort = { ...base, resolveDroppedPath, listDirectory }
    renderWithI18n(<Workbench platform={port} />, 'en')

    dropPaths(screen.getByRole('main'), [LEFT_ENGINE])
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(`Using ${LEFT_ENGINE} as the left baseline`)

    openSettings('en')
    fireEvent.click(languageOptions(settingsDialog('en'), 'en')[1])

    expect(screen.getByRole('alert')).toBe(alert)
    expect(alert.textContent).toBe(
      `已把 ${LEFT_ENGINE} 作为左侧基准，请继续选择右侧对应的文件。`
    )
    expect(resolveDroppedPath).toHaveBeenCalledTimes(1)
    expect(listDirectory).toHaveBeenCalledTimes(1)
  })

  it('keeps sessions, directory view state and unsaved edits, and reworks nothing', async () => {
    const base = createWebPlatformPort()
    await writeFiles(base, [
      ['/memory/pair/left.ts', 'a\nb\n'],
      ['/memory/pair/right.ts', 'a\nc\n']
    ])
    const counting = { listDirectory: 0, listDirectories: 0, digestFiles: 0, readTextFile: 0 }
    const onCompareRequest = vi.fn(() => () => undefined)
    const compareRequestsReady = vi.fn(async () => undefined)
    const port: PlatformPort = {
      ...base,
      selectFile: answers(['/memory/pair/left.ts', '/memory/pair/right.ts']),
      selectDirectory: answers([DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right]),
      listDirectory: async (path) => {
        counting.listDirectory += 1
        return base.listDirectory(path)
      },
      listDirectories: async (paths, options) => {
        counting.listDirectories += 1
        return base.listDirectories(paths, options)
      },
      digestFiles: async (paths, options) => {
        counting.digestFiles += 1
        return base.digestFiles(paths, options)
      },
      readTextFile: async (path) => {
        counting.readTextFile += 1
        return base.readTextFile(path)
      },
      onCompareRequest,
      compareRequestsReady
    }
    renderWithI18n(<Workbench platform={port} />, 'zh')

    // A code session with unsaved edits, then a directory session on top of it.
    fireEvent.click(screen.getByRole('button', { name: '打开文件' }))
    await screen.findByRole('tab', { name: /left\.ts/ }, { timeout: 4000 })
    fireEvent.click(screen.getByRole('button', { name: '覆写到右' }))
    fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }))
    await screen.findByRole('tab', { name: /baseline ↔ candidate/ }, { timeout: 4000 })

    fireEvent.click(screen.getByRole('tab', { name: '仅差异' }))
    fireEvent.click(within(screen.getAllByRole('tree')[0]).getAllByText('engine.ts')[0])
    const pane = screen.getAllByRole('tree')[0].parentElement as HTMLElement
    pane.scrollTop = 96
    fireEvent.scroll(pane)

    const sessionTabs = screen.getByRole('tablist', { name: '会话' })
    const beforeTitles = within(sessionTabs)
      .getAllByRole('tab')
      .map((tab) => tab.textContent ?? '')
    const beforeActive = within(sessionTabs)
      .getAllByRole('tab')
      .findIndex((tab) => tab.getAttribute('aria-selected') === 'true')
    const beforeStatus = screen.getByRole('contentinfo').textContent
    const callsBefore = { ...counting }

    openSettings('zh')
    fireEvent.click(languageOptions(settingsDialog('zh'), 'zh')[0])

    expect(screen.getByRole('tablist', { name: 'Sessions' })).toBeDefined()
    const afterTabs = screen.getByRole('tablist', { name: 'Sessions' })
    expect(within(afterTabs).getAllByRole('tab')).toHaveLength(beforeTitles.length)
    expect(
      within(afterTabs)
        .getAllByRole('tab')
        .findIndex((tab) => tab.getAttribute('aria-selected') === 'true')
    ).toBe(beforeActive)
    expect(within(afterTabs).getAllByRole('tab')[0].textContent).toContain('left.ts')
    expect(within(afterTabs).getAllByRole('tab')[1].textContent).toContain(
      'baseline ↔ candidate'
    )
    expect(within(afterTabs).getByTitle('Unsaved changes')).toBeDefined()

    expect(screen.getByRole('tab', { name: 'Differences only' }).getAttribute('aria-selected')).toBe(
      'true'
    )
    expect(
      within(screen.getAllByRole('tree')[0])
        .getAllByText('engine.ts')[0]
        .closest('[role="treeitem"]')
        ?.getAttribute('aria-selected')
    ).toBe('true')
    expect((screen.getAllByRole('tree')[0].parentElement as HTMLElement).scrollTop).toBe(96)
    expect(screen.getByRole('contentinfo').textContent).toContain(
      `directory:${DIRECTORY_SAMPLE_PATHS.left} ↔ ${DIRECTORY_SAMPLE_PATHS.right}`
    )
    expect(beforeStatus).toContain('会话')
    expect(counting).toEqual(callsBefore)
    expect(onCompareRequest).toHaveBeenCalledTimes(1)
    expect(compareRequestsReady).toHaveBeenCalledTimes(1)
  })
})

describe('language persistence', () => {
  it('reads the stored choice on restart and never writes the system language back', async () => {
    const web = createWebPlatformPort()
    const first = { read: 0, write: 0 }
    const firstPort: PlatformPort = {
      ...web,
      readUserSettings: async () => {
        first.read += 1
        return web.readUserSettings()
      },
      writeUserSettings: async (settings) => {
        first.write += 1
        await web.writeUserSettings(settings)
      },
      systemLocale: async () => 'en-US'
    }
    installPlatform(firstPort)
    render(<App />)
    await screen.findByRole('heading', { name: EMPTY_EN })

    openSettings('en')
    fireEvent.click(languageOptions(settingsDialog('en'), 'en')[1])
    await waitFor(() => expect(first.write).toBe(1))
    cleanup()

    // Same record, a system locale that would otherwise resolve to English.
    const second = { read: 0, write: 0 }
    installPlatform({
      ...createWebPlatformPort(),
      readUserSettings: async () => {
        second.read += 1
        return createWebPlatformPort().readUserSettings()
      },
      writeUserSettings: async (settings) => {
        second.write += 1
        await createWebPlatformPort().writeUserSettings(settings)
      },
      systemLocale: async () => 'en-US'
    })
    render(<App />)

    expect(await screen.findByRole('heading', { name: EMPTY_ZH })).toBeDefined()
    expect(second.write).toBe(0)
    expect(second.read).toBe(1)
    await expect(createWebPlatformPort().readUserSettings()).resolves.toEqual({ language: 'zh' })
  })
})
