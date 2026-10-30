import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { UI_ICON_ACTIONS } from '@renderer/assets/icons'
import type { Language, PlatformPort, Theme } from '@shared/platform/types'
import { Icon } from './components/Icon'
import { I18nProvider } from './i18n/I18nProvider'
import { loadInitialLanguage } from './i18n/resolveLanguage'
import { PerfRunner } from './perf/PerfRunner'
import { createPlatformPort } from './platform'
import { ThemeProvider } from './theme/ThemeProvider'
import { loadInitialTheme } from './theme/theme'
import { Workbench } from './workbench/Workbench'

/** Only the harness window is loaded with `?perf=1`; every normal launch lacks it. */
function isPerfMeasurementWindow(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has('perf')
}

/**
 * Wordless brand frame shown while the start-up language is still being read.
 * It carries no text, heading, button or tab, so no wrong-language copy can
 * ever flash before the provider picks the resolved language.
 */
function StartupFrame(): JSX.Element {
  return (
    <div
      aria-hidden
      className="flex h-full items-center justify-center bg-surface-base text-accent"
    >
      <span className="flex size-11 items-center justify-center rounded-lg border border-line-subtle bg-surface-raised">
        <Icon name={UI_ICON_ACTIONS.brand} size={20} />
      </span>
    </div>
  )
}

/** Start-up preferences read once before the workbench is mounted. */
interface StartupPreferences {
  readonly language: Language
  readonly theme: Theme
}

/** Reads the start-up preferences, then mounts the workbench exactly once. */
function LocalizedWorkbench({ platform }: { readonly platform: PlatformPort }): JSX.Element {
  const [preferences, setPreferences] = useState<StartupPreferences | null>(null)

  useEffect(() => {
    let active = true
    void Promise.all([loadInitialLanguage(platform), loadInitialTheme(platform)]).then(
      ([language, theme]) => {
        if (active) setPreferences({ language, theme })
      }
    )
    return () => {
      active = false
    }
  }, [platform])

  if (preferences === null) return <StartupFrame />
  return (
    <I18nProvider initialLanguage={preferences.language}>
      <ThemeProvider initialTheme={preferences.theme}>
        <Workbench platform={platform} />
      </ThemeProvider>
    </I18nProvider>
  )
}

export function App(): JSX.Element {
  const [platform] = useState(createPlatformPort)

  return isPerfMeasurementWindow() ? (
    <PerfRunner platform={platform} />
  ) : (
    <LocalizedWorkbench platform={platform} />
  )
}
