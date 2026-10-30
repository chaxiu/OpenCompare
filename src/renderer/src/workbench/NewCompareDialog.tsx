import { useRef, useState } from 'react'
import type { FormEvent, JSX, KeyboardEvent } from 'react'
import { SHELL_ENTRY_ICONS } from '@renderer/assets/icons'
import { isSupportedComparisonFile } from '@shared/fileExtensions'
import { parseManualPaths, resolveCompareRequest } from '@shared/compareRequest'
import type { CompareErrorCode, ComparePaths, CompareRequest } from '@shared/compareRequest'
import type { PlatformPort } from '@shared/platform/types'
import { ToolbarButton } from '@renderer/components/Button'
import { Dialog } from '@renderer/components/Dialog'
import { Icon } from '@renderer/components/Icon'
import { useI18n } from '@renderer/i18n/context'
import type { Translate } from '@renderer/i18n/context'
import type { MessageKey } from '@renderer/i18n/messages'

/**
 * Result of one dialog action that builds a session itself. `ok` closes the
 * dialog; a failed action stays open, with the reason shown in place when the
 * platform handed one back (`null` means the user simply cancelled a picker).
 */
export type CompareOpenOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string | null }

const INPUT_CLASSES =
  'focus-ring h-7 w-full rounded-sm border border-line-subtle bg-surface-base px-2 font-mono text-xs text-content-primary placeholder:text-content-muted'

const COMPARE_ERROR_KEYS: Record<CompareErrorCode, MessageKey> = {
  MISSING_SIDE: 'shell.compare.error.MISSING_SIDE',
  DUPLICATE_SIDE: 'shell.compare.error.DUPLICATE_SIDE',
  EMPTY_PATH: 'shell.compare.error.EMPTY_PATH',
  UNKNOWN_SCHEME: 'shell.compare.error.UNKNOWN_SCHEME',
  UNKNOWN_ACTION: 'shell.compare.error.UNKNOWN_ACTION',
  NOT_FOUND: 'shell.compare.error.NOT_FOUND',
  TYPE_MISMATCH: 'shell.compare.error.TYPE_MISMATCH',
  UNSUPPORTED_FILE_TYPE: 'shell.compare.error.UNSUPPORTED_FILE_TYPE',
  ACCESS_DENIED: 'shell.compare.error.ACCESS_DENIED'
}

type Side = 'left' | 'right'

/** A validation failure kept as data so the alert always follows the language. */
type CompareIssue =
  | {
      readonly kind: 'compare'
      readonly code: CompareErrorCode
      readonly params: Record<string, string>
    }
  | { readonly kind: 'detail'; readonly message: string }

function sideKey(side: Side): MessageKey {
  return side === 'left' ? 'common.side.left' : 'common.side.right'
}

function kindKey(kind: 'file' | 'directory'): MessageKey {
  return kind === 'file' ? 'common.kind.file' : 'common.kind.directory'
}

function issueText(issue: CompareIssue, t: Translate): string {
  if (issue.kind === 'detail') return issue.message
  return t(COMPARE_ERROR_KEYS[issue.code], issue.params)
}

const QUOTE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['"', '"'],
  ["'", "'"],
  ['“', '”'],
  ['‘', '’']
]

function stripPairedQuotes(value: string): string {
  for (const [open, close] of QUOTE_PAIRS) {
    if (value.length >= 2 && value.startsWith(open) && value.endsWith(close)) {
      return value.slice(1, value.length - 1)
    }
  }
  return value
}

function isBlankInput(value: string): boolean {
  return stripPairedQuotes(value.trim()).trim() === ''
}

type ProbeOutcome =
  | { readonly kind: 'file' | 'directory' }
  | { readonly kind: 'missing' }
  | { readonly denied: true }

async function probeSide(platform: PlatformPort, path: string): Promise<ProbeOutcome> {
  try {
    const kind = await platform.statPath(path)
    return kind === 'missing' ? { kind: 'missing' } : { kind }
  } catch {
    return { denied: true }
  }
}

/**
 * Localizes one failed compare-request by reading its stable code and
 * recovering the parameters the shared contract does not expose (side, path,
 * kinds) from the already-normalised paths.
 */
async function describeResolveIssue(
  code: CompareErrorCode,
  paths: ComparePaths,
  platform: PlatformPort,
  t: Translate
): Promise<CompareIssue> {
  if (code === 'TYPE_MISMATCH' || code === 'NOT_FOUND' || code === 'ACCESS_DENIED') {
    const [left, right] = await Promise.all([
      probeSide(platform, paths.left),
      probeSide(platform, paths.right)
    ])
    const outcomes = [left, right] as const
    const sides: readonly Side[] = ['left', 'right']

    for (const [index, outcome] of outcomes.entries()) {
      if ('denied' in outcome) {
        const side = sides[index]
        return {
          kind: 'compare',
          code: 'ACCESS_DENIED',
          params: { side: t(sideKey(side)), path: paths[side] }
        }
      }
    }
    for (const [index, outcome] of outcomes.entries()) {
      if ('kind' in outcome && outcome.kind === 'missing') {
        const side = sides[index]
        return {
          kind: 'compare',
          code: 'NOT_FOUND',
          params: { side: t(sideKey(side)), path: paths[side] }
        }
      }
    }
    if (code === 'TYPE_MISMATCH') {
      const leftKind = 'kind' in left ? left.kind : 'file'
      const rightKind = 'kind' in right ? right.kind : 'file'
      return {
        kind: 'compare',
        code: 'TYPE_MISMATCH',
        params: {
          left: paths.left,
          right: paths.right,
          leftKind: t(kindKey(leftKind === 'directory' ? 'directory' : 'file')),
          rightKind: t(kindKey(rightKind === 'directory' ? 'directory' : 'file'))
        }
      }
    }
  }

  if (code === 'UNSUPPORTED_FILE_TYPE') {
    const side: Side = isSupportedComparisonFile(paths.left) ? 'right' : 'left'
    return {
      kind: 'compare',
      code,
      params: { side: t(sideKey(side)), path: paths[side] }
    }
  }

  return { kind: 'compare', code, params: {} }
}

/**
 * The manual, dialog-free entry point. The two typed paths are normalised and
 * validated by the shared compare-request contract, then handed to the
 * workbench's existing session builders. Every failure stays inside this
 * dialog, so no empty tab is ever created.
 */
export function NewCompareDialog({
  platform,
  onClose,
  openRequest,
  onPickFiles,
  onPickDirectories
}: {
  readonly platform: PlatformPort
  readonly onClose: () => void
  /** Builds the session; resolves `false` when the build failed. */
  readonly openRequest: (
    request: CompareRequest,
    onError: (message: string) => void
  ) => Promise<boolean>
  readonly onPickFiles: () => Promise<CompareOpenOutcome>
  readonly onPickDirectories: () => Promise<CompareOpenOutcome>
}): JSX.Element {
  const { t } = useI18n()
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')
  const [issue, setIssue] = useState<CompareIssue | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const leftInput = useRef<HTMLInputElement>(null)

  function detailOf(cause: unknown): string {
    return cause instanceof Error ? cause.message : String(cause)
  }

  async function submit(): Promise<void> {
    if (submitting) return
    setSubmitting(true)
    setIssue(null)
    try {
      const context = {
        homeDir: await platform.homeDirectory(),
        baseDir: await platform.workingDirectory()
      }
      const parsed = parseManualPaths(left, right, context)
      if (!parsed.ok) {
        setIssue({
          kind: 'compare',
          code: parsed.error.code,
          params: {
            side: t(sideKey(isBlankInput(left) ? 'left' : 'right')),
            path: isBlankInput(left) ? left : right
          }
        })
        return
      }

      if (parsed.paths.left === parsed.paths.right) {
        setIssue({
          kind: 'compare',
          code: 'DUPLICATE_SIDE',
          params: { path: parsed.paths.left }
        })
        return
      }

      const resolved = await resolveCompareRequest(parsed.paths, {
        ...context,
        probe: { statPath: (path) => platform.statPath(path) }
      })
      if (!resolved.ok) {
        setIssue(await describeResolveIssue(resolved.error.code, parsed.paths, platform, t))
        return
      }

      const feedback = { message: null as string | null }
      const built = await openRequest(resolved.request, (message) => {
        feedback.message = message
      })
      if (built) {
        onClose()
        return
      }
      if (feedback.message !== null) setIssue({ kind: 'detail', message: feedback.message })
    } catch (cause) {
      setIssue({ kind: 'detail', message: detailOf(cause) })
    } finally {
      setSubmitting(false)
    }
  }

  async function pick(action: () => Promise<CompareOpenOutcome>): Promise<void> {
    if (submitting) return
    setSubmitting(true)
    setIssue(null)
    try {
      const outcome = await action()
      if (outcome.ok) {
        onClose()
        return
      }
      if (outcome.error !== null) setIssue({ kind: 'detail', message: outcome.error })
    } catch (cause) {
      setIssue({ kind: 'detail', message: detailOf(cause) })
    } finally {
      setSubmitting(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    void submit()
  }

  function submitOnEnter(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== 'Enter') return
    event.preventDefault()
    void submit()
  }

  return (
    <Dialog
      title={t('shell.compare.title')}
      description={t('shell.compare.description')}
      onClose={onClose}
      initialFocusRef={leftInput}
      footer={
        <>
          <ToolbarButton onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </ToolbarButton>
          <ToolbarButton
            variant="primary"
            icon={<Icon name={SHELL_ENTRY_ICONS['new-compare']} />}
            onClick={() => void submit()}
            disabled={submitting}
          >
            {t('shell.compare.submit')}
          </ToolbarButton>
        </>
      }
    >
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-1">
          <label htmlFor="new-compare-left" className="text-2xs text-content-secondary">
            {t('shell.compare.leftPath')}
          </label>
          <input
            id="new-compare-left"
            ref={leftInput}
            type="text"
            className={INPUT_CLASSES}
            value={left}
            spellCheck={false}
            autoComplete="off"
            placeholder={t('shell.compare.leftPlaceholder')}
            onChange={(event) => setLeft(event.target.value)}
            onKeyDown={submitOnEnter}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="new-compare-right" className="text-2xs text-content-secondary">
            {t('shell.compare.rightPath')}
          </label>
          <input
            id="new-compare-right"
            type="text"
            className={INPUT_CLASSES}
            value={right}
            spellCheck={false}
            autoComplete="off"
            placeholder={t('shell.compare.rightPlaceholder')}
            onChange={(event) => setRight(event.target.value)}
            onKeyDown={submitOnEnter}
          />
        </div>

        {issue ? (
          <p role="alert" className="text-2xs text-danger">
            {issueText(issue, t)}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <ToolbarButton
            icon={<Icon name={SHELL_ENTRY_ICONS['open-file']} />}
            onClick={() => void pick(onPickFiles)}
            disabled={submitting}
            title={t('shell.compare.pickFilesTitle')}
          >
            {t('shell.compare.pickFiles')}
          </ToolbarButton>
          <ToolbarButton
            icon={<Icon name={SHELL_ENTRY_ICONS['open-folder']} />}
            onClick={() => void pick(onPickDirectories)}
            disabled={submitting}
            title={t('shell.compare.pickFoldersTitle')}
          >
            {t('shell.compare.pickFolders')}
          </ToolbarButton>
          <span className="ml-auto text-2xs text-content-muted">{t('shell.compare.hint')}</span>
        </div>
      </form>
    </Dialog>
  )
}
