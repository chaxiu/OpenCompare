import type { Language, UserSettings } from './types'

/** The single localStorage key the web runtime keeps its settings under. */
export const USER_SETTINGS_STORAGE_KEY = 'opencompare.userSettings'

/** Narrows an unknown value to a supported UI language. */
export function isLanguage(value: unknown): value is Language {
  return value === 'zh' || value === 'en'
}

/**
 * Turns a decoded JSON value into {@link UserSettings}. Unknown fields are
 * dropped and anything that is not an object with a supported `language` reads
 * as "no record", so a corrupt file can never break startup.
 */
export function parseUserSettings(value: unknown): UserSettings | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const language = (value as { language?: unknown }).language
  return isLanguage(language) ? { language } : null
}

/** Same contract as {@link parseUserSettings}, from raw stored text. */
export function parseUserSettingsJson(text: string): UserSettings | null {
  try {
    return parseUserSettings(JSON.parse(text))
  } catch {
    return null
  }
}
