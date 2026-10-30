import { DEFAULT_THEME, isTheme } from '@shared/platform/settings'
import type { PlatformPort, ResolvedTheme, Theme } from '@shared/platform/types'

/** The media query that reports the operating system's light preference. */
export const LIGHT_SCHEME_QUERY = '(prefers-color-scheme: light)'

/** Turns the selected mode into the concrete theme the document renders. */
export function resolveTheme(theme: Theme, prefersLight: boolean): ResolvedTheme {
  if (theme !== 'system') return theme
  return prefersLight ? 'light' : 'dark'
}

/**
 * Mirrors the resolved theme onto the root element: `data-theme` carries
 * `light` / `dark` and `color-scheme` follows in the same place, so native
 * scrollbars, form controls and the page backdrop switch together.
 */
export function applyTheme(theme: ResolvedTheme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme
}

/** The part of {@link PlatformPort} start-up theme resolution needs. */
export type InitialThemePlatform = Pick<PlatformPort, 'readUserSettings'>

/**
 * Reads the persisted theme at startup. A missing record, an unknown value or a
 * failed read all mean {@link DEFAULT_THEME}: startup never fails on settings.
 */
export async function loadInitialTheme(platform: InitialThemePlatform): Promise<Theme> {
  const settings = await platform.readUserSettings().catch(() => null)
  return isTheme(settings?.theme) ? settings.theme : DEFAULT_THEME
}
