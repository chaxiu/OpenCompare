import { createContext, useContext } from 'react'
import type { ResolvedTheme, Theme } from '@shared/platform/types'

export interface ThemeContextValue {
  /** The mode the user picked, `system` included. */
  readonly theme: Theme
  /** The concrete theme currently applied to the document. */
  readonly resolvedTheme: ResolvedTheme
  readonly setTheme: (theme: Theme) => void
}

/**
 * Reading the theme outside a provider keeps the dark default, so leaf
 * components stay testable without wrapping; the production entry always mounts
 * the provider.
 */
const FALLBACK: ThemeContextValue = {
  theme: 'dark',
  resolvedTheme: 'dark',
  setTheme: () => undefined
}

export const ThemeContext = createContext<ThemeContextValue>(FALLBACK)

/** Active theme mode, its resolved value and the setter of the enclosing provider. */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}
