/**
 * Dictionary identity of the known snapshot failures.
 *
 * `snapshotOps` exposes stable failure codes and their parameters without ever
 * resolving language; the shell maps those identities to dictionary keys here
 * and renders them with `t(...)` at render time, so a language switch also
 * re-translates a notice that is already on screen.
 */
import type { MessageKey } from '@renderer/i18n/messages'
import { snapshotContentFailure, snapshotImportFailure } from './snapshotOps'

/** A dictionary key plus the parameters its copy interpolates. */
export interface SnapshotCopy {
  readonly key: MessageKey
  readonly params?: Readonly<Record<string, string>>
}

/** Copy of a rejected snapshot import, or `null` for an unknown failure. */
export function snapshotImportCopy(error: unknown): SnapshotCopy | null {
  const failure = snapshotImportFailure(error)
  if (failure === null) return null
  switch (failure.code) {
    case 'invalid-json':
      return { key: 'shell.snapshot.error.invalid-json' }
    case 'invalid-schema':
      return { key: 'shell.snapshot.error.invalid-schema' }
    case 'invalid-metadata':
      return { key: 'shell.snapshot.error.invalid-metadata' }
    case 'invalid-entry':
      return { key: 'shell.snapshot.error.invalid-entry' }
    case 'invalid-path':
      return failure.path === undefined
        ? { key: 'shell.snapshot.error.invalid-path' }
        : { key: 'shell.snapshot.error.invalid-pathWithPath', params: { path: failure.path } }
    case 'duplicate-path':
      return {
        key: 'shell.snapshot.error.duplicate-path',
        params: { path: failure.path ?? '' }
      }
    case 'invalid-hash':
      return { key: 'shell.snapshot.error.invalid-hash', params: { path: failure.path ?? '' } }
  }
}

/** Copy of a snapshot that cannot serve a drilldown body, or `null` when unknown. */
export function snapshotContentCopy(error: unknown, displayPath: string): SnapshotCopy | null {
  const failure = snapshotContentFailure(error)
  if (failure === null) return null
  const path = failure.path || displayPath
  return failure.code === 'content-not-inlined'
    ? { key: 'shell.snapshot.error.content-not-inlined', params: { path } }
    : { key: 'shell.snapshot.error.content-missing', params: { path } }
}
