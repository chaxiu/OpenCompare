import type { Language, Theme, UserSettings } from './types'

/** The single localStorage key the web runtime keeps its settings under. */
export const USER_SETTINGS_STORAGE_KEY = 'opencompare.userSettings'

/** Every theme mode, in the order the settings dialog lists them. */
export const THEMES: readonly Theme[] = ['light', 'dark', 'system']

/**
 * Theme used when the record carries no usable value. Existing installs have no
 * `theme` field and render on the dark palette, so defaulting to `dark` keeps
 * their appearance unchanged; `system` stays an explicit opt-in.
 */
export const DEFAULT_THEME: Theme = 'dark'

/** Narrows an unknown value to a supported UI language. */
export function isLanguage(value: unknown): value is Language {
  return value === 'zh' || value === 'en'
}

/** Narrows an unknown value to a supported theme mode. */
export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system'
}

/**
 * Turns a decoded JSON value into {@link UserSettings}. Unknown fields are
 * dropped. A record without a supported `language` reads as "no record", while
 * a missing, unknown or non-string `theme` falls back to {@link DEFAULT_THEME},
 * so a corrupt field can never break startup.
 */
export function parseUserSettings(value: unknown): UserSettings | null {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const record = value as { language?: unknown; theme?: unknown }
    if (!isLanguage(record.language)) return null
    return {
      language: record.language,
      theme: isTheme(record.theme) ? record.theme : DEFAULT_THEME
    }
  } catch {
    // Even a hostile decoded value reads as "no record" instead of throwing.
    return null
  }
}

/** Same contract as {@link parseUserSettings}, from raw stored text. */
export function parseUserSettingsJson(text: string): UserSettings | null {
  try {
    return parseUserSettings(JSON.parse(text))
  } catch {
    return null
  }
}
