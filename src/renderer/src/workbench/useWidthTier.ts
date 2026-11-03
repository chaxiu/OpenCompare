import { useEffect, useState } from 'react'
import { resolveWidthTier } from './shellLayout'
import type { WidthTier } from './shellLayout'

/**
 * Current window width, refreshed on every `resize`. The single width source
 * every width-driven helper (tier, status-bar rows) reads from.
 */
export function useWindowWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    function handleResize(): void {
      setWidth(window.innerWidth)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  return width
}

/**
 * Size tier of the current window, read from the single breakpoint table.
 * Components never invent their own breakpoints: they ask the table which
 * entry keeps its copy and which one is rendered icon-only.
 */
export function useWidthTier(): WidthTier {
  return resolveWidthTier(useWindowWidth())
}
