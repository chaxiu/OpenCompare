import type { Language } from '@shared/platform/types'
import { interpolate } from './interpolate'
import type { InterpolationParams } from './interpolate'
import { en, messages, zh } from './messages'
import type { MessageKey } from './messages'

/** One dictionary key and its copy in both languages. */
export interface LocaleRow {
  readonly key: MessageKey
  readonly zh: string
  readonly en: string
}

/**
 * Test-only table derived from the single dictionary source of truth: one row
 * per `zh` key, never a hand-copied value. Product runtime code must not import
 * this module; it exists so tests can name keys and read both languages.
 */
export const LOCALE_ROWS: readonly LocaleRow[] = (Object.keys(zh) as MessageKey[]).map((key) => ({
  key,
  zh: zh[key],
  en: en[key]
}))

/** Dictionary copy of `key` in `language`, with `{name}` placeholders filled. */
export function localeText(
  language: Language,
  key: MessageKey,
  params?: InterpolationParams
): string {
  return interpolate(messages[language][key], params)
}
