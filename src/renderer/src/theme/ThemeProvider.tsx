import { useCallback, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { JSX, ReactNode } from 'react'
import type { Theme } from '@shared/platform/types'
import { ThemeContext } from './context'
import type { ThemeContextValue } from './context'
import { applyTheme, LIGHT_SCHEME_QUERY, resolveTheme } from './theme'

export interface ThemeProviderProps {
  readonly children: ReactNode
  /** Start-up mode, resolved by the shell before the first render. */
  readonly initialTheme?: Theme
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
export function ThemeProvider({ children, initialTheme = 'dark' }: ThemeProviderProps): JSX.Element {
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const prefersLight = useSystemPrefersLight(theme === 'system')
  const resolvedTheme = resolveTheme(theme, prefersLight)

  useLayoutEffect(() => {
    applyTheme(resolvedTheme)
  }, [resolvedTheme])

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme]
  )
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
