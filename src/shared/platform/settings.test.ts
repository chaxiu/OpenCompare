import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THEME,
  isLanguage,
  isTheme,
  parseUserSettings,
  parseUserSettingsJson,
  THEMES
} from './settings'

describe('parseUserSettings', () => {
  it('reads a complete record', () => {
    expect(parseUserSettings({ language: 'zh', theme: 'light' })).toEqual({
      language: 'zh',
      theme: 'light'
    })
    expect(parseUserSettings({ language: 'en', theme: 'system' })).toEqual({
      language: 'en',
      theme: 'system'
    })
  })

  it('upgrades an old record without a theme to the dark default', () => {
    expect(parseUserSettings({ language: 'zh' })).toEqual({ language: 'zh', theme: 'dark' })
    expect(parseUserSettingsJson('{"language":"en"}')).toEqual({ language: 'en', theme: 'dark' })
    expect(DEFAULT_THEME).toBe('dark')
  })

  it('falls back to dark for every unknown or corrupt theme value', () => {
    for (const theme of ['sepia', '', 'DARK', 0, 1, null, undefined, {}, []]) {
      expect(parseUserSettings({ language: 'zh', theme }), String(theme)).toEqual({
        language: 'zh',
        theme: 'dark'
      })
    }
  })

  it('drops unknown extra fields instead of copying them through', () => {
    expect(parseUserSettings({ language: 'zh', theme: 'light', density: 'compact' })).toEqual({
      language: 'zh',
      theme: 'light'
    })
  })

  it('reads no record for a missing or unsupported language', () => {
    for (const value of [null, undefined, 'zh', 42, [], {}, { language: 'de' }, { language: 3 }]) {
      expect(parseUserSettings(value), JSON.stringify(value)).toBeNull()
    }
  })

  it('reads no record from corrupt stored text', () => {
    for (const text of ['', '{not json', 'null', '"text"', '[1,2]']) {
      expect(parseUserSettingsJson(text), text).toBeNull()
    }
  })

  it('never throws, whatever the stored value', () => {
    const hostile = {
      get language(): never {
        throw new Error('boom')
      }
    }
    expect(() => parseUserSettings(hostile)).not.toThrow()
  })
})

describe('theme guards', () => {
  it('accepts exactly the three documented modes', () => {
    expect(THEMES).toEqual(['light', 'dark', 'system'])
    for (const value of THEMES) expect(isTheme(value)).toBe(true)
    for (const value of ['sepia', 'System', '', null, 0]) expect(isTheme(value)).toBe(false)
  })

  it('keeps the language guard unchanged', () => {
    expect(isLanguage('zh')).toBe(true)
    expect(isLanguage('en')).toBe(true)
    expect(isLanguage('de')).toBe(false)
  })
})
