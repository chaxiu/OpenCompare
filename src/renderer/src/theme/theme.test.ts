// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PlatformPort, UserSettings } from '@shared/platform/types'
import { applyTheme, loadInitialTheme, resolveTheme } from './theme'

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.style.removeProperty('color-scheme')
  vi.unstubAllGlobals()
})

function fakePlatform(settings: () => Promise<UserSettings | null>) {
  return { readUserSettings: vi.fn(settings) }
}

describe('resolveTheme', () => {
  it('passes an explicit mode through unchanged', () => {
    expect(resolveTheme('light', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', true)).toBe('dark')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('follows the OS preference only in system mode', () => {
    expect(resolveTheme('system', true)).toBe('light')
    expect(resolveTheme('system', false)).toBe('dark')
  })
})

describe('applyTheme', () => {
  it('mirrors the resolved theme onto the root data attribute and color-scheme', () => {
    applyTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.documentElement.style.colorScheme).toBe('light')

    applyTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })
})

describe('loadInitialTheme', () => {
  it('reads the stored mode', async () => {
    const platform = fakePlatform(async () => ({ language: 'en', theme: 'system' }))
    await expect(loadInitialTheme(platform)).resolves.toBe('system')
    expect(platform.readUserSettings).toHaveBeenCalledTimes(1)
  })

  it('falls back to dark without a record', async () => {
    await expect(loadInitialTheme(fakePlatform(async () => null))).resolves.toBe('dark')
  })

  it('falls back to dark when the read fails', async () => {
    const platform = fakePlatform(async () => {
      throw new Error('EACCES: permission denied')
    })
    await expect(loadInitialTheme(platform)).resolves.toBe('dark')
  })

  it('only needs the settings channel of the platform', async () => {
    const surface: Pick<PlatformPort, 'readUserSettings'> = {
      readUserSettings: async () => ({ language: 'zh', theme: 'light' })
    }
    await expect(loadInitialTheme(surface)).resolves.toBe('light')
  })
})
