import type {
  DigestFilesOptions,
  DigestFilesResult,
  FileDigest,
  PlatformPort
} from '@shared/platform/types'
import { OperationCancelledError } from '@core/io'
import { createWebPlatformPort } from './web-platform'

/**
 * Resolves the PlatformPort for the current runtime: the Electron bridge when
 * preload injected it, otherwise the in-memory web implementation.
 */
export function createPlatformPort(): PlatformPort {
  return window.openComparePlatform ?? createWebPlatformPort()
}

/**
 * Turns the platform's structured cancellation back into the core's cancellation
 * control flow **inside the renderer process**. `src/core/**` keeps rejecting
 * with `OperationCancelledError`; the error never crosses the IPC boundary.
 */
export function unwrapDigestResult(result: DigestFilesResult): readonly FileDigest[] {
  if (Array.isArray(result)) return result
  throw new OperationCancelledError()
}

/** One digest batch for the comparison engine, structured cancellation included. */
export async function digestFilesForComparison(
  platform: PlatformPort,
  paths: readonly string[],
  options?: DigestFilesOptions
): Promise<readonly FileDigest[]> {
  return unwrapDigestResult(await platform.digestFiles(paths, options))
}
