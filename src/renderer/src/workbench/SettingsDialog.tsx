import { useRef, useState } from 'react'
import type { JSX } from 'react'
import { THEMES } from '@shared/platform/settings'
import type { Language, PlatformPort, Theme, UserSettings } from '@shared/platform/types'
import { Dialog } from '@renderer/components/Dialog'
import { SegmentedControl } from '@renderer/components/SegmentedControl'
import { useI18n } from '@renderer/i18n/context'
import { languageSelfLabel, SUPPORTED_LANGUAGES } from '@renderer/i18n/languageLabel'
import type { MessageKey } from '@renderer/i18n/messages'
import { useTheme } from '@renderer/theme/context'

/** Display label of every theme mode, translated by the active dictionary. */
const THEME_LABEL_KEYS: Readonly<Record<Theme, MessageKey>> = {
  light: 'settings.theme.light',
  dark: 'settings.theme.dark',
  system: 'settings.theme.system'
}

export interface SettingsDialogProps {
  readonly platform: PlatformPort
  readonly onClose: () => void
}

/**
 * Minimal settings panel: UI language, then theme. A pick updates the renderer's
 * state in the same render batch, then persists the whole record (both fields)
 * through the platform's single settings slot; a failed write is reported in
 * place and never rolls the choice back.
 */
export function SettingsDialog({ platform, onClose }: SettingsDialogProps): JSX.Element {
  const { t, language, setLanguage } = useI18n()
  const { theme, setTheme } = useTheme()
  /** Raw reason of the last failed write; cleared by the next successful one. */
  const [saveError, setSaveError] = useState<string | null>(null)
  /** Serial write queue, so the last choice is the last one persisted. */
  const writeQueue = useRef<Promise<void>>(Promise.resolve())

  function persist(record: UserSettings): void {
    writeQueue.current = writeQueue.current
      .then(() => platform.writeUserSettings(record))
      .then(
        () => setSaveError(null),
        (cause: unknown) => setSaveError(cause instanceof Error ? cause.message : String(cause))
      )
  }

  function chooseLanguage(next: Language): void {
    // The whole window switches first; the write neither blocks nor closes the panel.
    setLanguage(next)
    // Both fields are always written, so a language pick cannot drop the theme.
    persist({ language: next, theme })
  }

  function chooseTheme(next: Theme): void {
    setTheme(next)
    persist({ language, theme: next })
  }

  return (
    <Dialog title={t('settings.title')} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <span className="text-2xs font-medium text-content-secondary">
            {t('settings.language')}
          </span>
          <SegmentedControl
            label={t('settings.language')}
            options={SUPPORTED_LANGUAGES.map((item) => ({
              value: item,
              label: languageSelfLabel(item)
            }))}
            value={language}
            onChange={chooseLanguage}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-2xs font-medium text-content-secondary">{t('settings.theme')}</span>
          <SegmentedControl
            label={t('settings.theme')}
            options={THEMES.map((item) => ({ value: item, label: t(THEME_LABEL_KEYS[item]) }))}
            value={theme}
            onChange={chooseTheme}
          />
        </div>
        {saveError === null ? null : (
          <p role="alert" className="text-2xs text-danger">
            {t('settings.saveError', { reason: saveError })}
          </p>
        )}
      </div>
    </Dialog>
  )
}
