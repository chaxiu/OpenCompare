import { describe, expect, it, vi } from 'vitest'
import type { UserSettings } from '@shared/platform/types'
import { loadInitialLanguage, resolveInitialLanguage } from './resolveLanguage'

describe('resolveInitialLanguage', () => {
  it('picks zh for a zh system locale without a record', () => {
    for (const systemLocale of ['zh', 'zh-CN', 'zh-Hant', 'ZH-cn']) {
      expect(resolveInitialLanguage({ storedLanguage: null, systemLocale })).toBe('zh')
    }
  })

  it('defaults to en for any other or unknown system locale', () => {
    for (const systemLocale of ['en-US', 'fr-FR', '', undefined]) {
      expect(resolveInitialLanguage({ storedLanguage: null, systemLocale })).toBe('en')
    }
  })

  it('lets a recorded choice win over the system locale', () => {
    expect(resolveInitialLanguage({ storedLanguage: 'zh', systemLocale: 'en-US' })).toBe('zh')
    expect(resolveInitialLanguage({ storedLanguage: 'en', systemLocale: 'zh-CN' })).toBe('en')
  })

  it('treats an unsupported stored value as no record', () => {
    for (const storedLanguage of ['de', '', 42, null, undefined]) {
      expect(resolveInitialLanguage({ storedLanguage, systemLocale: 'zh-CN' })).toBe('zh')
      expect(resolveInitialLanguage({ storedLanguage, systemLocale: 'fr-FR' })).toBe('en')
    }
  })
})

function fakePlatform(settings: UserSettings | null, locale: string) {
  return {
    readUserSettings: vi.fn(async (): Promise<UserSettings | null> => settings),
    systemLocale: vi.fn(async (): Promise<string> => locale),
    writeUserSettings: vi.fn(async (): Promise<void> => undefined)
  }
}

describe('loadInitialLanguage', () => {
  it('reads both halves and never writes a record', async () => {
    const platform = fakePlatform(null, 'zh-CN')

    await expect(loadInitialLanguage(platform)).resolves.toBe('zh')
    expect(platform.readUserSettings).toHaveBeenCalledTimes(1)
    expect(platform.systemLocale).toHaveBeenCalledTimes(1)
    expect(platform.writeUserSettings).not.toHaveBeenCalled()
  })

  it('honours the stored language', async () => {
    const platform = fakePlatform({ language: 'en' }, 'zh-CN')

    await expect(loadInitialLanguage(platform)).resolves.toBe('en')
    expect(platform.writeUserSettings).not.toHaveBeenCalled()
  })

  it('treats a rejected read as no record instead of throwing', async () => {
    const platform = {
      readUserSettings: vi.fn(async (): Promise<UserSettings | null> => {
        throw new Error('unreadable settings')
      }),
      systemLocale: vi.fn(async () => 'en-US'),
      writeUserSettings: vi.fn(async () => undefined)
    }

    await expect(loadInitialLanguage(platform)).resolves.toBe('en')
    expect(platform.writeUserSettings).not.toHaveBeenCalled()
  })

  it('falls back to en when the locale read fails too', async () => {
    const platform = {
      readUserSettings: vi.fn(async () => null),
      systemLocale: vi.fn(async (): Promise<string> => {
        throw new Error('no locale')
      })
    }

    await expect(loadInitialLanguage(platform)).resolves.toBe('en')
  })
})
