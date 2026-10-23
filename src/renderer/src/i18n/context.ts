import { createContext, useContext } from 'react'
import type { Language } from '@shared/platform/types'
import { interpolate } from './interpolate'
import type { InterpolationParams } from './interpolate'
import { messages } from './messages'
import type { MessageKey } from './messages'

/** Resolves one dictionary key in the active language, as plain text. */
export type Translate = (key: MessageKey, params?: InterpolationParams) => string

export interface I18nContextValue {
  readonly language: Language
  readonly setLanguage: (language: Language) => void
  readonly t: Translate
}

export function translate(language: Language): Translate {
  return (key, params) => interpolate(messages[language][key], params)
}

/**
 * Reading i18n outside a provider keeps the current Chinese wording, so leaf
 * components stay testable without wrapping; the production entry always mounts
 * the provider.
 */
const FALLBACK: I18nContextValue = {
  language: 'zh',
  setLanguage: () => undefined,
  t: translate('zh')
}

export const I18nContext = createContext<I18nContextValue>(FALLBACK)

/** Active language, setter and translator of the enclosing provider. */
export function useI18n(): I18nContextValue {
  return useContext(I18nContext)
}
