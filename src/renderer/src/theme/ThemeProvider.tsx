import { useCallback, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { JSX, ReactNode } from 'react'
import type { PlatformPort, Theme } from '@shared/platform/types'
import { ThemeContext } from './context'
import type { ThemeContextValue } from './context'
import { applyTheme, LIGHT_SCHEME_QUERY, resolveTheme } from './theme'

export interface ThemeProviderProps {
  readonly children: ReactNode
  /** Start-up mode, resolved by the shell before the first render. */
  readonly initialTheme?: Theme
  /**
   * Optional native-chrome channel. The provider pushes the **mode** (never the
   * resolved value), so `system` keeps following the OS; a runtime without the
   * method simply skips the push.
   */
  readonly platform?: Pick<PlatformPort, 'setNativeTheme'>
}

/**
 * Follows the OS light preference. The listener exists only while `enabled`
 * (mode `system`), so explicit modes never re-render on an OS scheme change and
 * leaving `system` removes it again.
 */
function useSystemPrefersLight(enabled: boolean): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void): (() => void) => {
      if (!enabled || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => undefined
      }
      const query = window.matchMedia(LIGHT_SCHEME_QUERY)
      query.addEventListener('change', onStoreChange)
      return () => query.removeEventListener('change', onStoreChange)
    },
    [enabled]
  )
  const getSnapshot = useCallback((): boolean => {
    if (!enabled || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false
    }
    return window.matchMedia(LIGHT_SCHEME_QUERY).matches
  }, [enabled])
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

/**
 * Owns the theme mode for the whole window. A change re-renders the provider
 * only: the workbench below it is never remounted, so sessions, tabs and scroll
 * positions survive a theme switch.
 */
export function ThemeProvider({
  children,
  initialTheme = 'dark',
  platform
}: ThemeProviderProps): JSX.Element {
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const prefersLight = useSystemPrefersLight(theme === 'system')
  const resolvedTheme = resolveTheme(theme, prefersLight)

  useLayoutEffect(() => {
    applyTheme(resolvedTheme)
  }, [resolvedTheme])

  // Mount and every mode change push once. The native channel is optional and
  // failures are swallowed: a broken chrome update must never fail the switch.
  useLayoutEffect(() => {
    const push = platform?.setNativeTheme
    if (push === undefined) return
    try {
      void Promise.resolve(push(theme)).catch(() => undefined)
    } catch {
      // A synchronous rejection is equally inert.
    }
  }, [theme, platform])

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme]
  )
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
