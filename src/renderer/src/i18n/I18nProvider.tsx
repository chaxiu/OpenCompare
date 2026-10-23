import { useLayoutEffect, useMemo, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import type { Language } from '@shared/platform/types'
import { I18nContext, translate } from './context'
import type { I18nContextValue } from './context'
import { applyHtmlLang } from './htmlLang'

export interface I18nProviderProps {
  readonly children: ReactNode
  /** Start-up language, resolved by the shell before the first render. */
  readonly initialLanguage?: Language
}

export function I18nProvider({ children, initialLanguage = 'zh' }: I18nProviderProps): JSX.Element {
  const [language, setLanguage] = useState<Language>(initialLanguage)
  useLayoutEffect(() => {
    applyHtmlLang(language)
  }, [language])
  const value = useMemo<I18nContextValue>(
    () => ({ language, setLanguage, t: translate(language) }),
    [language]
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
