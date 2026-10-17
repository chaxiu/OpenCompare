import type { PlatformPort } from '@shared/platform/types'
import { createWebPlatformPort } from './web-platform'

/**
 * Resolves the PlatformPort for the current runtime: the Electron bridge when
 * preload injected it, otherwise the in-memory web implementation.
 */
export function createPlatformPort(): PlatformPort {
  return window.openComparePlatform ?? createWebPlatformPort()
}
