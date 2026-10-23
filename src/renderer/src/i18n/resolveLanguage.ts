import { isLanguage } from '@shared/platform/settings'
import type { Language, PlatformPort } from '@shared/platform/types'

/** Input of the start-up language decision, both halves already read. */
export interface InitialLanguageInput {
  /** Persisted language; anything but `zh` / `en` counts as "no record". */
  readonly storedLanguage?: unknown
  /** OS UI locale, e.g. `zh-CN`; missing / empty means "unknown". */
  readonly systemLocale?: string | null
}

/**
 * A recorded choice always wins. Without one, a `zh*` system locale means
 * Chinese and every other locale — including an unknown one — means English.
 */
export function resolveInitialLanguage(input: InitialLanguageInput): Language {
  if (isLanguage(input.storedLanguage)) return input.storedLanguage
  const locale = typeof input.systemLocale === 'string' ? input.systemLocale : ''
  return locale.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

/** The part of {@link PlatformPort} start-up resolution needs. */
export type InitialLanguagePlatform = Pick<PlatformPort, 'readUserSettings' | 'systemLocale'>

/**
 * Resolves the start-up language from the platform. It only reads: writing the
 * inferred value would freeze the system-language default forever. A failed
 * read counts as "no record" instead of blocking startup.
 */
export async function loadInitialLanguage(platform: InitialLanguagePlatform): Promise<Language> {
  const [settings, systemLocale] = await Promise.all([
    platform.readUserSettings().catch(() => null),
    platform.systemLocale().catch(() => '')
  ])
  return resolveInitialLanguage({ storedLanguage: settings?.language, systemLocale })
}
