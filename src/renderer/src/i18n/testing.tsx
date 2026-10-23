import { render } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
import type { ReactElement } from 'react'
import type { Language } from '@shared/platform/types'
import { I18nProvider } from './I18nProvider'

/**
 * Renders `ui` under a provider with a forced language, so component tests can
 * assert either dictionary without touching the application entry.
 */
export function renderWithI18n(ui: ReactElement, language: Language = 'zh'): RenderResult {
  return render(<I18nProvider initialLanguage={language}>{ui}</I18nProvider>)
}
