import { useRef, useState } from 'react'
import type { JSX } from 'react'
import type { Language, PlatformPort } from '@shared/platform/types'
import { Dialog } from '@renderer/components/Dialog'
import { SegmentedControl } from '@renderer/components/SegmentedControl'
import { useI18n } from '@renderer/i18n/context'
import { languageSelfLabel, SUPPORTED_LANGUAGES } from '@renderer/i18n/languageLabel'

export interface SettingsDialogProps {
  readonly platform: PlatformPort
  readonly onClose: () => void
}

/**
 * Minimal settings panel: its only section is the UI language. A pick updates
 * the renderer's language state in the same render batch, then persists through
 * the platform's settings channel; a failed write is reported in place and never
 * rolls the language back.
 */
export function SettingsDialog({ platform, onClose }: SettingsDialogProps): JSX.Element {
  const { t, language, setLanguage } = useI18n()
  /** Raw reason of the last failed write; cleared by the next successful one. */
  const [saveError, setSaveError] = useState<string | null>(null)
  /** Serial write queue, so the last choice is the last one persisted. */
  const writeQueue = useRef<Promise<void>>(Promise.resolve())

  function choose(next: Language): void {
    // The whole window switches first; the write neither blocks nor closes the panel.
    setLanguage(next)
    writeQueue.current = writeQueue.current
      .then(() => platform.writeUserSettings({ language: next }))
      .then(
        () => setSaveError(null),
        (cause: unknown) => setSaveError(cause instanceof Error ? cause.message : String(cause))
      )
  }

  return (
    <Dialog title={t('settings.title')} onClose={onClose}>
      <div className="flex flex-col gap-2">
        <span className="text-2xs font-medium text-content-secondary">{t('settings.language')}</span>
        <SegmentedControl
          label={t('settings.language')}
          options={SUPPORTED_LANGUAGES.map((item) => ({
            value: item,
            label: languageSelfLabel(item)
          }))}
          value={language}
          onChange={choose}
        />
        {saveError === null ? null : (
          <p role="alert" className="text-2xs text-danger">
            {t('settings.saveError', { reason: saveError })}
          </p>
        )}
      </div>
    </Dialog>
  )
}
