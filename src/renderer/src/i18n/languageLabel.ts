import type { Language } from '@shared/platform/types'
import { messages } from './messages'

/** Language choices of the settings panel, in display order. */
export const SUPPORTED_LANGUAGES: readonly Language[] = ['en', 'zh']

/**
 * A language's own name, read from that language's dictionary: the option is a
 * self-label and never follows the active interface language.
 */
export function languageSelfLabel(language: Language): string {
  return messages[language]['settings.language.name']
}
