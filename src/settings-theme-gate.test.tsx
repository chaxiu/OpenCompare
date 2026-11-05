// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlatformPort, UserSettings } from '@shared/platform/types'
import { App } from '@renderer/App'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { installJsdomViewport } from './test/jsdomViewport'

const EMPTY_EN = 'Open real files or folders to start comparing'
const SETTINGS_ENTRY = '[data-shell-entry="settings"]'

installJsdomViewport()

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

interface Mounted {
  readonly writes: UserSettings[]
  readonly native: ReturnType<typeof vi.fn>
}

async function mountApp(
  platform: PlatformPort = createWebPlatformPort(),
  overrides: Partial<PlatformPort> = {}
): Promise<Mounted> {
  const writes: UserSettings[] = []
  const native = vi.fn<(mode: string) => Promise<void>>(async () => undefined)
  window.openComparePlatform = {
    ...platform,
    systemLocale: async () => 'en-US',
    writeUserSettings: async (settings) => {
      writes.push(settings)
      await platform.writeUserSettings(settings)
    },
    setNativeTheme: native,
    ...overrides
  }
  render(<App />)
  await screen.findByRole('heading', { name: EMPTY_EN })
  return { writes, native }
}

function openSettings(): void {
  const entry = document.querySelector<HTMLElement>(SETTINGS_ENTRY)
  if (entry === null) throw new Error('settings shell entry is missing')
  fireEvent.click(entry)
}

function themeTabs(): HTMLElement[] {
  const dialog = screen.getByRole('dialog', { name: 'Settings' })
  const group = within(dialog).getByRole('tablist', { name: 'Theme' })
  return within(group).getAllByRole('tab')
}

function clickTheme(label: 'Light' | 'Dark' | 'Follow system'): void {
  const tab = themeTabs().find((candidate) => candidate.textContent === label)
  if (tab === undefined) throw new Error(`theme tab ${label} is missing`)
  fireEvent.click(tab)
}

function appliedTheme(): string | undefined {
  return document.documentElement.dataset.theme
}

function appliedColorScheme(): string {
  return document.documentElement.style.colorScheme
}

function pushedModes(native: ReturnType<typeof vi.fn>): string[] {
  return native.mock.calls.map((call) => call[0] as string)
}

describe('Settings theme click chain', () => {
  it('exposes the real Theme tablist and applies Light synchronously', async () => {
    await mountApp()
    openSettings()

    const tabs = themeTabs()
    expect(tabs).toHaveLength(3)
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Light', 'Dark', 'Follow system'])
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('false')

    clickTheme('Light')
    expect(appliedTheme()).toBe('light')
    expect(appliedColorScheme()).toBe('light')
    expect(themeTabs()[0]?.getAttribute('aria-selected')).toBe('true')
  })

  it('walks Light -> Dark -> Light through DOM, native mode push and persisted writes', async () => {
    const { writes, native } = await mountApp()
    openSettings()

    clickTheme('Light')
    expect(appliedTheme()).toBe('light')
    expect(appliedColorScheme()).toBe('light')

    clickTheme('Dark')
    expect(appliedTheme()).toBe('dark')
    expect(appliedColorScheme()).toBe('dark')

    clickTheme('Light')
    expect(appliedTheme()).toBe('light')
    expect(appliedColorScheme()).toBe('light')

    await waitFor(() => expect(writes).toHaveLength(3))
    expect(writes).toEqual([
      { language: 'en', theme: 'light' },
      { language: 'en', theme: 'dark' },
      { language: 'en', theme: 'light' }
    ])
    // The mount push is ignored; mode (never the resolved value) is what travels.
    expect(pushedModes(native).slice(-3)).toEqual(['light', 'dark', 'light'])
  })

  it('pushes the system mode itself instead of its resolved value', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        media: '(prefers-color-scheme: light)',
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => true
      }))
    )
    const { native } = await mountApp()
    openSettings()

    clickTheme('Follow system')
    expect(appliedTheme()).toBe('dark')
    expect(pushedModes(native).at(-1)).toBe('system')
  })

  it('keeps the DOM switch when the native channel rejects', async () => {
    await mountApp(createWebPlatformPort(), {
      setNativeTheme: async () => {
        throw new Error('ipc down')
      }
    })
    openSettings()

    clickTheme('Light')
    expect(appliedTheme()).toBe('light')
    expect(appliedColorScheme()).toBe('light')
  })

  it('rehydrates the persisted Light choice on the next launch', async () => {
    const { writes } = await mountApp()
    openSettings()
    clickTheme('Light')
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toEqual({ language: 'en', theme: 'light' })

    cleanup()
    window.openComparePlatform = {
      ...createWebPlatformPort(),
      systemLocale: async () => 'en-US'
    }
    render(<App />)
    await screen.findByRole('heading', { name: EMPTY_EN })
    expect(appliedTheme()).toBe('light')
    await expect(createWebPlatformPort().readUserSettings()).resolves.toEqual({
      language: 'en',
      theme: 'light'
    })
  })
})
