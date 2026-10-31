import { useRef, useState } from 'react'
import type { JSX } from 'react'
import { UI_ICON_ACTIONS } from '@renderer/assets/icons'
import type { IconName } from '@renderer/assets/icons'
import type { SceneId } from '@shared/fixtures'
import { THEMES } from '@shared/platform/settings'
import type { Language, PlatformPort, Theme, UserSettings } from '@shared/platform/types'
import { Dialog } from '@renderer/components/Dialog'
import { Icon } from '@renderer/components/Icon'
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

/** The four sample scenes plus the remote-snapshot pair the settings offers. */
interface SampleEntry {
  readonly id: string
  readonly labelKey: MessageKey
  readonly descriptionKey: MessageKey
  readonly icon: IconName
  /** `scene` loads through the built-in library; `remote-snapshot` compares sides. */
  readonly scene?: SceneId
}

const SAMPLE_ENTRIES: readonly SampleEntry[] = [
  {
    id: 'directory',
    labelKey: 'shell.view.directory',
    descriptionKey: 'settings.samples.directory.description',
    icon: UI_ICON_ACTIONS.viewDirectory,
    scene: 'directory'
  },
  {
    id: 'code',
    labelKey: 'shell.view.code',
    descriptionKey: 'settings.samples.code.description',
    icon: UI_ICON_ACTIONS.viewCode,
    scene: 'code'
  },
  {
    id: 'csv',
    labelKey: 'shell.view.csv',
    descriptionKey: 'settings.samples.csv.description',
    icon: UI_ICON_ACTIONS.viewCsv,
    scene: 'csv'
  },
  {
    id: 'structured',
    labelKey: 'shell.view.structured',
    descriptionKey: 'settings.samples.structured.description',
    icon: UI_ICON_ACTIONS.viewStructured,
    scene: 'structured'
  },
  {
    id: 'remote-snapshot',
    labelKey: 'settings.samples.remoteSnapshot',
    descriptionKey: 'settings.samples.remoteSnapshot.description',
    icon: UI_ICON_ACTIONS.remoteSample
  }
]

export interface SettingsDialogProps {
  readonly platform: PlatformPort
  readonly onClose: () => void
  /** Opens one built-in scene through the workbench's existing loader. */
  readonly onLoadSample: (scene: SceneId) => void
  /** Mounts the built-in remote snapshot through the existing sides comparison. */
  readonly onLoadRemoteSnapshot: () => void
  /** Debug-only failure scene, kept out of the five user-facing entries. */
  readonly onSimulateSampleFailure: () => void
  /** Build-time / explicit switch: production never renders the failure entry. */
  readonly showDebugSamples?: boolean
}

/**
 * Settings panel: UI language, theme and the sample / debug section. A pick
 * updates the renderer's state in the same render batch, then persists the whole
 * record (both fields) through the platform's single settings slot; a failed
 * write is reported in place and never rolls the choice back. Sample entries
 * reuse the workbench's existing loaders instead of carrying their own data.
 */
export function SettingsDialog({
  platform,
  onClose,
  onLoadSample,
  onLoadRemoteSnapshot,
  onSimulateSampleFailure,
  showDebugSamples = false
}: SettingsDialogProps): JSX.Element {
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
        <div className="flex flex-col gap-2 border-t border-line-subtle pt-3">
          <span className="text-2xs font-medium text-content-secondary">
            {t('settings.samples.title')}
          </span>
          <p className="text-2xs text-content-muted">{t('settings.samples.description')}</p>
          <div className="flex flex-col gap-1.5">
            {SAMPLE_ENTRIES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                data-sample-entry={entry.id}
                className="focus-ring transition-fast flex w-full items-start gap-2 rounded-sm border border-line-subtle bg-surface-base px-2 py-1.5 text-left hover:border-line-strong hover:bg-surface-hover"
                onClick={() =>
                  entry.scene === undefined ? onLoadRemoteSnapshot() : onLoadSample(entry.scene)
                }
              >
                <Icon name={entry.icon} className="mt-0.5 text-content-muted" />
                <span className="flex min-w-0 flex-col">
                  <span className="text-2xs font-medium text-content-primary">
                    {t(entry.labelKey)}
                  </span>
                  <span className="text-2xs text-content-muted">{t(entry.descriptionKey)}</span>
                </span>
              </button>
            ))}
          </div>
          {showDebugSamples ? (
            <button
              type="button"
              data-sample-failure="true"
              className="focus-ring transition-fast flex w-full items-start gap-2 rounded-sm border border-danger/40 bg-danger-soft px-2 py-1.5 text-left hover:border-danger"
              onClick={onSimulateSampleFailure}
            >
              <Icon name={UI_ICON_ACTIONS.warning} className="mt-0.5 text-danger" />
              <span className="flex min-w-0 flex-col">
                <span className="text-2xs font-medium text-danger">
                  {t('settings.samples.failure.label')}
                </span>
                <span className="text-2xs text-content-muted">
                  {t('settings.samples.failure.description')}
                </span>
              </span>
            </button>
          ) : null}
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
