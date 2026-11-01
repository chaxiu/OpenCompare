/**
 * Dictionary identity of a sync write refusal.
 *
 * `@core/directory/sync` keeps its own Chinese message (gates depend on it), so
 * the renderer maps the stable fields — `SyncTargetError.path` / `.code` and the
 * system code inside `SyncRefreshError.reason` — onto `zh` / `en` dictionary
 * keys here. Render time resolves them, so a language switch also re-translates
 * a notice that is already on screen.
 */
import { SyncRefreshError, SyncTargetError } from '@core/directory/sync'
import type { MessageKey } from '@renderer/i18n/messages'

/** A dictionary fragment nested inside a notice parameter. */
export interface SyncCopyFragment {
  readonly message: MessageKey
  readonly params?: Readonly<Record<string, string>>
}

/** A dictionary key plus the parameters its copy interpolates. */
export interface SyncFailureCopy {
  readonly key: MessageKey
  readonly params?: Readonly<Record<string, string | SyncCopyFragment>>
}

/** OS codes the sync write path can surface, each with a paired reason entry. */
const REASON_KEYS: Readonly<Record<string, MessageKey>> = {
  EACCES: 'shell.sync.reason.EACCES',
  EPERM: 'shell.sync.reason.EPERM',
  EISDIR: 'shell.sync.reason.EISDIR',
  EROFS: 'shell.sync.reason.EROFS',
  EBUSY: 'shell.sync.reason.EBUSY',
  ENOTDIR: 'shell.sync.reason.ENOTDIR',
  ENOENT: 'shell.sync.reason.ENOENT',
  ENOTEMPTY: 'shell.sync.reason.ENOTEMPTY',
  EEXIST: 'shell.sync.reason.EEXIST',
  ENOSPC: 'shell.sync.reason.ENOSPC'
}

const SYSTEM_CODE = /\b(E[A-Z]{2,})\b/

/** Localized reason fragment of one stable code, or the neutral fallback. */
function reasonFor(code: string | undefined): SyncCopyFragment {
  const key = code === undefined ? undefined : REASON_KEYS[code]
  return key === undefined
    ? { message: 'shell.sync.reason.fallback' }
    : { message: key, params: { code: code ?? '' } }
}

/**
 * Copy of a target-side write refusal, carrying the offending path and (when
 * the system gave one) the raw OS code. `null` for any other failure.
 */
export function syncTargetFailureCopy(error: unknown): SyncFailureCopy | null {
  if (!(error instanceof SyncTargetError)) return null
  return {
    key: 'shell.sync.error.target',
    params: { path: error.path, reason: reasonFor(error.code) }
  }
}

/**
 * Localized reason of a "writes landed, refresh failed" error. The platform
 * detail is never rendered: only a stable system code is extracted from it, and
 * an unrecognized reason becomes the neutral fallback.
 */
export function syncRefreshReasonCopy(error: SyncRefreshError): SyncCopyFragment {
  return reasonFor(SYSTEM_CODE.exec(error.reason)?.[1])
}
