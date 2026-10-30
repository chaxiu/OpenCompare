import { useEffect, useState } from 'react'
import { resolveWidthTier } from './shellLayout'
import type { WidthTier } from './shellLayout'

/**
 * Size tier of the current window, read from the single breakpoint table.
 * Components never invent their own breakpoints: they ask the table which
 * entry keeps its copy and which one is rendered icon-only.
 */
export function useWidthTier(): WidthTier {
  const [tier, setTier] = useState(() => resolveWidthTier(window.innerWidth))
  useEffect(() => {
    function handleResize(): void {
      setTier(resolveWidthTier(window.innerWidth))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  return tier
}
