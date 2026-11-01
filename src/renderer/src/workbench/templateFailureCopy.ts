/**
 * Dictionary identity of a template placement failure.
 *
 * The core executor and the platform layer keep their own diagnostic strings, so
 * the renderer maps only the stable fields — the preflight's `code` / `path` and
 * a write failure's `reason` / `code` — onto `zh` / `en` dictionary keys. A raw
 * platform sentence (Chinese included) is never rendered.
 */
import type { TemplateWriteFailure } from '@core/directory/template'
import type { MessageKey } from '@renderer/i18n/messages'
import { TemplateApplyError } from './directoryOps'
import { syncReasonFragment } from './syncFailureCopy'
import type { SyncCopyFragment, SyncFailureCopy } from './syncFailureCopy'

/** Copy of a run refused before its first write; `null` for any other failure. */
export function templateApplyFailureCopy(error: unknown): SyncFailureCopy | null {
  if (!(error instanceof TemplateApplyError)) return null
  return {
    key: 'directory.template.error.applyRefused',
    params: { path: error.path, reason: syncReasonFragment(error.code) }
  }
}

const WRITE_REASON_KEYS: Readonly<Record<TemplateWriteFailure['reason'], MessageKey>> = {
  'source-drift': 'directory.template.failure.sourceDrift',
  'source-unreadable': 'directory.template.failure.sourceUnreadable',
  'write-failed': 'directory.template.failure.writeFailed'
}

/** Localized reason of one per-row write failure, OS code included when known. */
export function templateWriteFailureCopy(failure: TemplateWriteFailure): SyncFailureCopy {
  const reason: SyncCopyFragment = { message: WRITE_REASON_KEYS[failure.reason] }
  return failure.code === undefined
    ? { key: WRITE_REASON_KEYS[failure.reason] }
    : {
        key: 'directory.template.failure.withCode',
        params: { reason, code: failure.code }
      }
}

const VERIFY_REASON_KEYS = {
  missing: 'directory.template.verify.missing',
  directory: 'directory.template.verify.directory',
  hash: 'directory.template.verify.hash',
  mtime: 'directory.template.verify.mtime',
  unreadable: 'directory.template.verify.unreadable'
} as const

export type TemplateVerifyReason = keyof typeof VERIFY_REASON_KEYS

/** Localized reason of one verification row; `undefined` when the row passed. */
export function templateVerifyReasonKey(reason: string): MessageKey | undefined {
  return Object.hasOwn(VERIFY_REASON_KEYS, reason)
    ? VERIFY_REASON_KEYS[reason as TemplateVerifyReason]
    : undefined
}
