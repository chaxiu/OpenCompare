import type { Language } from '@shared/platform/types'

/** BCP 47 tag of every interface language; the single source for `<html lang>`. */
const HTML_LANG: Readonly<Record<Language, string>> = {
  en: 'en',
  zh: 'zh-CN'
}

export function htmlLang(language: Language): string {
  return HTML_LANG[language]
}

/**
 * Mirrors the active language onto `<html lang>`. Runs in a DOM-less runtime
 * (Node, SSR) as a no-op so shared providers stay importable outside a browser.
 */
export function applyHtmlLang(language: Language): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = htmlLang(language)
}
