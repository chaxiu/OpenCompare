// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DIRECTORY_SAMPLE_PATHS } from '@shared/fixtures'
import type { Language, PlatformPort, Theme, UserSettings } from '@shared/platform/types'
import { App } from './App'
import { I18nProvider } from './i18n/I18nProvider'
import { createWebPlatformPort } from './platform/web-platform'
import { LIGHT_SCHEME_QUERY } from './theme/theme'
import { ThemeProvider } from './theme/ThemeProvider'
import { Workbench } from './workbench/Workbench'

const EMPTY_EN = 'Open real files or folders to start comparing'
const EMPTY_ZH = '打开真实文件或文件夹开始对比'

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
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.style.removeProperty('color-scheme')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function installPlatform(port: PlatformPort): void {
  window.openComparePlatform = port
}

function portWithSettings(
  settings: UserSettings,
  overrides: Partial<PlatformPort> = {}
): PlatformPort {
  return {
    ...createWebPlatformPort(),
    readUserSettings: async () => settings,
    systemLocale: async () => 'en-US',
    ...overrides
  }
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

function openSettings(language: Language): HTMLElement {
  fireEvent.click(
    screen.getByRole('button', { name: language === 'zh' ? '打开设置' : 'Open settings' })
  )
  return screen.getByRole('dialog', { name: language === 'zh' ? '设置' : 'Settings' })
}

function themeTabs(language: Language): HTMLElement[] {
  const panel = screen.getByRole('dialog', { name: language === 'zh' ? '设置' : 'Settings' })
  const group = within(panel).getByRole('tablist', {
    name: language === 'zh' ? '主题' : 'Theme'
  })
  return within(group).getAllByRole('tab')
}

function appliedTheme(): string | undefined {
  return document.documentElement.dataset.theme
}

function appliedColorScheme(): string {
  return document.documentElement.style.colorScheme
}

/** A fake `matchMedia` that records listener registrations and can flip the OS. */
interface FakeScheme {
  readonly matchMedia: ReturnType<typeof vi.fn>
  listenerCount(): number
  setLight(light: boolean): void
}

function installScheme(initialLight: boolean): FakeScheme {
  const listeners = new Set<() => void>()
  let light = initialLight
  const query = {
    get matches(): boolean {
      return light
    },
    media: LIGHT_SCHEME_QUERY,
    onchange: null,
    addEventListener: (type: string, listener: () => void): void => {
      if (type === 'change') listeners.add(listener)
    },
    removeEventListener: (type: string, listener: () => void): void => {
      if (type === 'change') listeners.delete(listener)
    },
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => true
  }
  const matchMedia = vi.fn((media: string) => {
    expect(media).toBe(LIGHT_SCHEME_QUERY)
    return query
  })
  vi.stubGlobal('matchMedia', matchMedia as unknown as typeof window.matchMedia)
  return {
    matchMedia,
    listenerCount: () => listeners.size,
    setLight(next) {
      light = next
      for (const listener of [...listeners]) listener()
    }
  }
}

/** Reports a mount of the workbench subtree, never a plain re-render. */
function MountProbe({ onMount }: { readonly onMount: () => void }): null {
  useEffect(() => {
    onMount()
  }, [onMount])
  return null
}

function renderWorkbench(
  port: PlatformPort,
  language: Language,
  theme: Theme = 'dark',
  onMount: () => void = () => undefined
): ReturnType<typeof render> {
  return render(
    <I18nProvider initialLanguage={language}>
      <ThemeProvider initialTheme={theme}>
        <MountProbe onMount={onMount} />
        <Workbench platform={port} />
      </ThemeProvider>
    </I18nProvider>
  )
}

describe('settings theme section', () => {
  it('lists the three modes under an i18n-labelled group and marks the active one', async () => {
    installPlatform(portWithSettings({ language: 'en', theme: 'light' }))
    render(<App />)
    await screen.findByRole('heading', { name: EMPTY_EN })

    openSettings('en')
    expect(themeTabs('en').map((tab) => tab.textContent)).toEqual([
      'Light',
      'Dark',
      'Follow system'
    ])
    expect(themeTabs('en').map((tab) => tab.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false'
    ])
    expect(appliedTheme()).toBe('light')
  })

  it('translates the section in both dictionaries', async () => {
    installPlatform(portWithSettings({ language: 'zh', theme: 'dark' }))
    render(<App />)
    await screen.findByRole('heading', { name: EMPTY_ZH })

    openSettings('zh')
    expect(themeTabs('zh').map((tab) => tab.textContent)).toEqual(['亮色', '暗色', '跟随系统'])
    expect(themeTabs('zh').map((tab) => tab.getAttribute('aria-selected'))).toEqual([
      'false',
      'true',
      'false'
    ])
    expect(appliedTheme()).toBe('dark')
  })
})

describe('theme switching', () => {
  it('applies every mode in the same click, color-scheme included', async () => {
    installScheme(false)
    const writes: UserSettings[] = []
    installPlatform(
      portWithSettings(
        { language: 'en', theme: 'dark' },
        {
          writeUserSettings: async (settings) => {
            writes.push(settings)
          }
        }
      )
    )
    render(<App />)
    await screen.findByRole('heading', { name: EMPTY_EN })
    expect(appliedTheme()).toBe('dark')
    expect(appliedColorScheme()).toBe('dark')

    openSettings('en')
    fireEvent.click(themeTabs('en')[0])
    expect(appliedTheme()).toBe('light')
    expect(appliedColorScheme()).toBe('light')

    fireEvent.click(themeTabs('en')[1])
    expect(appliedTheme()).toBe('dark')
    expect(appliedColorScheme()).toBe('dark')

    // The system default here is dark, so system resolves to dark right away.
    fireEvent.click(themeTabs('en')[2])
    expect(appliedTheme()).toBe('dark')

    await waitFor(() => expect(writes).toHaveLength(3))
    expect(writes).toEqual([
      { language: 'en', theme: 'light' },
      { language: 'en', theme: 'dark' },
      { language: 'en', theme: 'system' }
    ])
  })

  it('follows the OS preference only in system mode and unhooks on leaving it', async () => {
    const scheme = installScheme(false)
    installPlatform(portWithSettings({ language: 'en', theme: 'dark' }))
    render(<App />)
    await screen.findByRole('heading', { name: EMPTY_EN })
    expect(scheme.listenerCount()).toBe(0)

    openSettings('en')
    fireEvent.click(themeTabs('en')[2])
    expect(scheme.listenerCount()).toBe(1)
    expect(appliedTheme()).toBe('dark')

    act(() => scheme.setLight(true))
    expect(appliedTheme()).toBe('light')

    act(() => scheme.setLight(false))
    expect(appliedTheme()).toBe('dark')

    // An explicit mode stops reacting and releases the registration.
    fireEvent.click(themeTabs('en')[0])
    expect(scheme.listenerCount()).toBe(0)
    act(() => scheme.setLight(false))
    expect(appliedTheme()).toBe('light')
    act(() => scheme.setLight(true))
    expect(appliedTheme()).toBe('light')

    // Unmounting in system mode releases the registration too.
    fireEvent.click(themeTabs('en')[2])
    expect(scheme.listenerCount()).toBe(1)
    cleanup()
    expect(scheme.listenerCount()).toBe(0)
  })

  it('persists the whole record and rehydrates it on the next launch', async () => {
    const web = createWebPlatformPort()
    const written: UserSettings[] = []
    installPlatform({
      ...web,
      systemLocale: async () => 'en-US',
      writeUserSettings: async (settings) => {
        written.push(settings)
        await web.writeUserSettings(settings)
      }
    })
    render(<App />)
    await screen.findByRole('heading', { name: EMPTY_EN })

    openSettings('en')
    fireEvent.click(themeTabs('en')[0])
    await waitFor(() => expect(written).toHaveLength(1))
    expect(written[0]).toEqual({ language: 'en', theme: 'light' })

    cleanup()
    // A fresh application root over the same storage slot keeps the choice.
    installPlatform({ ...createWebPlatformPort(), systemLocale: async () => 'en-US' })
    render(<App />)
    await screen.findByRole('heading', { name: EMPTY_EN })
    expect(appliedTheme()).toBe('light')
    await expect(createWebPlatformPort().readUserSettings()).resolves.toEqual({
      language: 'en',
      theme: 'light'
    })
  })

  it('never drops the other field in a language + theme sequence', async () => {
    const writes: UserSettings[] = []
    installPlatform(
      portWithSettings(
        { language: 'en', theme: 'dark' },
        {
          writeUserSettings: async (settings) => {
            writes.push(settings)
          }
        }
      )
    )
    render(<App />)
    await screen.findByRole('heading', { name: EMPTY_EN })

    const panel = openSettings('en')
    const languageGroup = within(panel).getByRole('tablist', { name: 'Language' })
    fireEvent.click(within(languageGroup).getAllByRole('tab')[1])
    expect(screen.getByRole('dialog', { name: '设置' })).toBeDefined()
    fireEvent.click(themeTabs('zh')[0])
    fireEvent.click(themeTabs('zh')[2])

    await waitFor(() => expect(writes).toHaveLength(3))
    expect(writes).toEqual([
      { language: 'zh', theme: 'dark' },
      { language: 'zh', theme: 'light' },
      { language: 'zh', theme: 'system' }
    ])
    expect(appliedTheme()).toBe('dark')
  })

  it('keeps both fields when the theme is picked before the language', async () => {
    const writes: UserSettings[] = []
    installPlatform(
      portWithSettings(
        { language: 'en', theme: 'dark' },
        {
          writeUserSettings: async (settings) => {
            writes.push(settings)
          }
        }
      )
    )
    render(<App />)
    await screen.findByRole('heading', { name: EMPTY_EN })

    openSettings('en')
    fireEvent.click(themeTabs('en')[0])
    const languageGroup = within(screen.getByRole('dialog', { name: 'Settings' })).getByRole(
      'tablist',
      { name: 'Language' }
    )
    fireEvent.click(within(languageGroup).getAllByRole('tab')[1])

    await waitFor(() => expect(writes).toHaveLength(2))
    expect(writes).toEqual([
      { language: 'en', theme: 'light' },
      { language: 'zh', theme: 'light' }
    ])
  })

  it('reports a failed theme write without rolling the choice back', async () => {
    installPlatform(
      portWithSettings(
        { language: 'en', theme: 'dark' },
        {
          writeUserSettings: async () => {
            throw new Error('EACCES: permission denied')
          }
        }
      )
    )
    render(<App />)
    await screen.findByRole('heading', { name: EMPTY_EN })

    const panel = openSettings('en')
    fireEvent.click(themeTabs('en')[0])

    const alert = await within(panel).findByRole('alert')
    expect(alert.textContent).toBe('Could not save settings: EACCES: permission denied')
    expect(appliedTheme()).toBe('light')
    expect(themeTabs('en')[0].getAttribute('aria-selected')).toBe('true')
  })
})

describe('theme switching keeps the workbench alive', () => {
  it('does no platform IO and preserves sessions, filter, scroll and collapse state', async () => {
    const base = createWebPlatformPort()
    await writeFiles(base, [
      ['/memory/pair/left.ts', 'a\nb\n'],
      ['/memory/pair/right.ts', 'a\nc\n']
    ])
    const counting = {
      listDirectory: 0,
      listDirectories: 0,
      statPath: 0,
      readTextFile: 0,
      digestFiles: 0
    }
    const port: PlatformPort = {
      ...base,
      systemLocale: async () => 'zh-CN',
      selectFile: answers(['/memory/pair/left.ts', '/memory/pair/right.ts']),
      selectDirectory: answers([DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right]),
      writeUserSettings: async () => undefined,
      listDirectory: async (path) => {
        counting.listDirectory += 1
        return base.listDirectory(path)
      },
      listDirectories: async (paths, options) => {
        counting.listDirectories += 1
        return base.listDirectories(paths, options)
      },
      statPath: async (path) => {
        counting.statPath += 1
        return base.statPath(path)
      },
      readTextFile: async (path) => {
        counting.readTextFile += 1
        return base.readTextFile(path)
      },
      digestFiles: async (paths, options) => {
        counting.digestFiles += 1
        return base.digestFiles(paths, options)
      }
    }
    let mounts = 0
    const { container } = renderWorkbench(port, 'zh', 'dark', () => {
      mounts += 1
    })
    const appRoot = container.firstElementChild

    // A code session with an unsaved edit, then a directory session on top.
    fireEvent.click(screen.getByRole('button', { name: '打开文件' }))
    await screen.findByRole('tab', { name: /left\.ts/ }, { timeout: 4000 })
    fireEvent.click(screen.getByRole('button', { name: '覆写到右' }))
    fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }))
    await screen.findByRole('tab', { name: /baseline ↔ candidate/ }, { timeout: 4000 })

    fireEvent.click(screen.getByRole('tab', { name: '仅差异' }))
    const tree = screen.getAllByRole('tree')[0]
    fireEvent.click(within(tree).getAllByText('engine.ts')[0])
    // Collapse the first open directory of the left tree.
    const openDirectory = within(tree)
      .getAllByRole('treeitem')
      .find((item) => item.getAttribute('aria-expanded') === 'true') as HTMLElement
    const collapseButton = within(openDirectory).getByRole('button')
    fireEvent.click(collapseButton)
    expect(openDirectory.getAttribute('aria-expanded')).toBe('false')
    const visibleRows = within(tree).getAllByRole('treeitem').length

    const pane = tree.parentElement as HTMLElement
    pane.scrollTop = 96
    fireEvent.scroll(pane)

    const sessionTabs = screen.getByRole('tablist', { name: '会话' })
    const beforeTitles = within(sessionTabs)
      .getAllByRole('tab')
      .map((tab) => tab.textContent ?? '')
    const beforeActive = within(sessionTabs)
      .getAllByRole('tab')
      .findIndex((tab) => tab.getAttribute('aria-selected') === 'true')
    const mainRoot = screen.getByRole('main')
    const callsBefore = { ...counting }

    openSettings('zh')
    fireEvent.click(themeTabs('zh')[0])
    fireEvent.click(themeTabs('zh')[1])
    fireEvent.click(themeTabs('zh')[2])
    fireEvent.click(themeTabs('zh')[1])

    // Zero directory scans, digests or file reads for any theme switch.
    expect(counting).toEqual(callsBefore)
    // The app root was mounted exactly once and its DOM nodes were never replaced.
    expect(mounts).toBe(1)
    expect(container.firstElementChild).toBe(appRoot)
    expect(screen.getByRole('tablist', { name: '会话' })).toBe(sessionTabs)
    expect(screen.getByRole('main')).toBe(mainRoot)
    expect(appliedTheme()).toBe('dark')

    expect(within(sessionTabs).getAllByRole('tab')).toHaveLength(beforeTitles.length)
    expect(
      within(sessionTabs)
        .getAllByRole('tab')
        .findIndex((tab) => tab.getAttribute('aria-selected') === 'true')
    ).toBe(beforeActive)
    expect(within(sessionTabs).getAllByRole('tab')[0].textContent).toContain('left.ts')
    expect(within(sessionTabs).getAllByRole('tab')[1].textContent).toContain(
      'baseline ↔ candidate'
    )

    expect(screen.getByRole('tab', { name: '仅差异' }).getAttribute('aria-selected')).toBe('true')
    const treeAfter = screen.getAllByRole('tree')[0]
    expect(treeAfter).toBe(tree)
    expect(within(treeAfter).getAllByRole('treeitem')).toHaveLength(visibleRows)
    expect(
      within(treeAfter).getAllByRole('treeitem')[0].getAttribute('aria-expanded')
    ).toBe('false')
    expect((treeAfter.parentElement as HTMLElement).scrollTop).toBe(96)
  })
})
