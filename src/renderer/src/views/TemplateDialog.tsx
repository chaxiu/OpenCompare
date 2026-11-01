import { useEffect, useMemo, useState } from 'react'
import type { DragEvent as ReactDragEvent, FormEvent, JSX, KeyboardEvent } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { UI_ICON_ACTIONS } from '@renderer/assets/icons'
import { ToolbarButton } from '@renderer/components/Button'
import { Dialog } from '@renderer/components/Dialog'
import { Icon } from '@renderer/components/Icon'
import { formatBytes } from '@renderer/components/utils'
import { normalizePathValue } from '@shared/compareRequest'
import type { PlatformPort } from '@shared/platform/types'
import { DIRECTORY_ROW_HEIGHT, createDirectoryScrollMap } from '@core/directory/rows'
import { resolveTemplatePlan } from '@core/directory/template'
import type {
  TemplatePlanEntry,
  TemplateRejectionReason,
  TemplateResolvedPlan,
  TemplateUnused,
  TemplateVerificationEntry,
  TemplateWriteFailure
} from '@core/directory/template'
import { useI18n } from '@renderer/i18n/context'
import type { Translate } from '@renderer/i18n/context'
import type { MessageKey } from '@renderer/i18n/messages'
import type {
  TemplateApplyOutcome,
  TemplatePreview,
  TemplatePreviewFailure,
  TemplateRoots
} from '@renderer/workbench/directoryOps'
import type { SyncFailureCopy } from '@renderer/workbench/syncFailureCopy'
import {
  templateApplyFailureCopy,
  templateVerifyReasonKey,
  templateWriteFailureCopy
} from '@renderer/workbench/templateFailureCopy'
import { countKey } from './directoryCopy'

/** Field-level refusals of the setup step; every one has a zh / en pair. */
type TemplateIssue = TemplatePreviewFailure | 'incoming-empty' | 'output-empty'

const ISSUE_KEYS: Record<TemplateIssue, MessageKey> = {
  'incoming-empty': 'directory.template.error.incomingEmpty',
  'output-empty': 'directory.template.error.outputEmpty',
  'preview-failed': 'directory.template.error.previewFailed',
  'incoming-missing': 'directory.template.error.incomingMissing',
  'incoming-not-directory': 'directory.template.error.incomingNotDirectory',
  'incoming-equals-template': 'directory.template.error.incomingEqualsTemplate',
  'output-equals-template': 'directory.template.error.outputEqualsTemplate',
  'output-equals-incoming': 'directory.template.error.outputEqualsIncoming',
  'output-not-directory': 'directory.template.error.outputNotDirectory'
}

/** Localized reason of one row the resolved plan refused. */
const REJECTION_KEYS: Record<TemplateRejectionReason, MessageKey> = {
  'not-executable': 'directory.template.reject.notExecutable',
  'conflict-unresolved': 'directory.template.reject.conflictUnresolved',
  'conflict-candidate-outside-set': 'directory.template.reject.conflictCandidateOutsideSet',
  'target-occupied-by-directory': 'directory.template.reject.targetOccupiedByDirectory',
  'duplicate-source': 'directory.template.reject.duplicateSource'
}

const INPUT_CLASSES =
  'focus-ring h-7 w-full rounded-sm border border-line-subtle bg-surface-base px-2 font-mono text-xs text-content-primary placeholder:text-content-muted'

const CANDIDATE_CLASSES =
  'focus-ring h-6 max-w-64 shrink rounded-sm border border-line-subtle bg-surface-base px-1 font-mono text-2xs text-content-primary'

/** Extra rows above and below the viewport so fast scrolling never shows gaps. */
const ROW_OVERSCAN = 8

type RowSection = 'matched' | 'missing' | 'conflicts' | 'unused'

const SECTION_TITLE_KEYS: Record<RowSection, MessageKey> = {
  matched: 'directory.template.section.matched',
  missing: 'directory.template.section.missing',
  conflicts: 'directory.template.section.conflicts',
  unused: 'directory.template.section.unused'
}

const SECTION_TONES: Record<RowSection, string> = {
  matched: 'text-diff-added',
  missing: 'text-diff-removed',
  conflicts: 'text-diff-conflict',
  unused: 'text-content-muted'
}

type TemplateRow =
  | { readonly kind: 'header'; readonly section: RowSection; readonly count: number }
  | { readonly kind: 'entry'; readonly entry: TemplatePlanEntry }
  | { readonly kind: 'unused'; readonly item: TemplateUnused }
  | { readonly kind: 'empty'; readonly section: RowSection }

type ResultRow =
  | { readonly kind: 'verify'; readonly entry: TemplateVerificationEntry }
  | { readonly kind: 'write-failure'; readonly failure: TemplateWriteFailure }

export interface TemplateDialogProps {
  readonly platform: PlatformPort
  /** Template A, always the left root of the active comparison. */
  readonly templateRoot: string
  /** `null` keeps the dialog on the setup step; a plan opens the dry-run. */
  readonly preview: TemplatePreview | null
  readonly busy: boolean
  readonly onPreview: (roots: TemplateRoots) => Promise<TemplatePreviewFailure | null>
  readonly onCancel: () => void
  /** Receives the one resolved manifest; the shell only binds the platform IO. */
  readonly onConfirm: (resolved: TemplateResolvedPlan) => Promise<TemplateApplyOutcome>
}

function sameFiles(files: FileList | undefined): readonly File[] {
  return files === undefined ? [] : Array.from(files)
}

function isFileDrag(event: ReactDragEvent<HTMLDivElement>): boolean {
  const transfer = event.dataTransfer
  return transfer !== null && Array.from(transfer.types).includes('Files')
}

/** Renders one dictionary copy with its nested reason fragment resolved first. */
function copyText(t: Translate, copy: SyncFailureCopy): string {
  const params: Record<string, string | number> = {}
  for (const [name, value] of Object.entries(copy.params ?? {})) {
    params[name] = typeof value === 'object' ? t(value.message, value.params) : value
  }
  return t(copy.key, params)
}

/**
 * Real template placement: first the two real roots (B and the output root),
 * then the dry-run of the plan built from them, then the per-row verification of
 * what the run wrote. Template A is always the current left root and stays
 * read-only. Nothing is written until the user confirms, and the confirm action
 * only sees the resolved manifest.
 */
export function TemplateDialog({
  platform,
  templateRoot,
  preview,
  busy,
  onPreview,
  onCancel,
  onConfirm
}: TemplateDialogProps): JSX.Element {
  const { t } = useI18n()
  const [incomingInput, setIncomingInput] = useState('')
  const [outputInput, setOutputInput] = useState('')
  const [issue, setIssue] = useState<TemplateIssue | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [applying, setApplying] = useState(false)
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set<string>())
  const [conflictChoices, setConflictChoices] = useState<Readonly<Record<string, string>>>({})
  const [outcome, setOutcome] = useState<TemplateApplyOutcome | null>(null)
  const [applyFailure, setApplyFailure] = useState<unknown>(null)
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)

  const step: 'setup' | 'dry-run' | 'result' =
    preview === null ? 'setup' : outcome !== null ? 'result' : 'dry-run'
  const blocked = busy || submitting || applying

  // Default checks are the plan's own decision; conflict / missing / overwritten
  // rows never start checked. A new preview (a rescan) starts a fresh selection.
  useEffect(() => {
    setOutcome(null)
    setApplyFailure(null)
    setIssue(null)
    setConflictChoices({})
    if (preview === null) {
      setChecked(new Set<string>())
      return
    }
    setChecked(
      new Set(preview.plan.matched.filter((entry) => entry.defaultChecked).map((entry) => entry.relativePath))
    )
  }, [preview])

  const resolved = useMemo(
    () =>
      preview === null
        ? null
        : resolveTemplatePlan(preview.plan, { checkedPaths: [...checked], conflictChoices }),
    [preview, checked, conflictChoices]
  )

  const rejectionByPath = useMemo(
    () => new Map((resolved?.rejected ?? []).map((rejection) => [rejection.relativePath, rejection.reason])),
    [resolved]
  )

  const rows = useMemo<readonly TemplateRow[]>(() => {
    if (preview === null) return []
    const plan = preview.plan
    const sections: readonly [RowSection, readonly TemplateRow[]][] = [
      ['matched', plan.matched.map((entry) => ({ kind: 'entry', entry }))],
      ['missing', plan.missing.map((entry) => ({ kind: 'entry', entry }))],
      ['conflicts', plan.conflicts.map((entry) => ({ kind: 'entry', entry }))],
      ['unused', plan.unused.map((item) => ({ kind: 'unused', item }))]
    ]
    const countOf: Record<RowSection, number> = {
      matched: plan.counts.matched,
      missing: plan.counts.missing,
      conflicts: plan.counts.conflict,
      unused: plan.counts.unused
    }
    const next: TemplateRow[] = []
    for (const [section, entries] of sections) {
      next.push({ kind: 'header', section, count: countOf[section] })
      if (entries.length === 0) next.push({ kind: 'empty', section })
      else next.push(...entries)
    }
    return next
  }, [preview])

  const resultRows = useMemo<readonly ResultRow[]>(() => {
    if (outcome === null) return []
    return [
      ...outcome.verification.entries.map<ResultRow>((entry) => ({ kind: 'verify', entry })),
      ...outcome.execution.failed.map<ResultRow>((failure) => ({ kind: 'write-failure', failure }))
    ]
  }, [outcome])

  const listRows: readonly (TemplateRow | ResultRow)[] = step === 'result' ? resultRows : rows

  // The virtualiser observes the scroll container; the row window comes from the
  // pure scroll map, exactly like the directory tree.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: listRows.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => DIRECTORY_ROW_HEIGHT,
    overscan: ROW_OVERSCAN
  })
  const offset = virtualizer.scrollOffset ?? 0
  const viewportHeight = virtualizer.scrollRect?.height ?? 0
  const scrollMap = createDirectoryScrollMap(listRows.length, viewportHeight)
  const range = scrollMap.visibleRange(offset, ROW_OVERSCAN)

  function issueText(next: TemplateIssue): string {
    const params =
      next === 'incoming-missing' || next === 'incoming-not-directory'
        ? { path: incomingInput }
        : next === 'output-not-directory'
          ? { path: outputInput }
          : undefined
    return t(ISSUE_KEYS[next], params)
  }

  function toggleChecked(relativePath: string): void {
    setChecked((current) => {
      const next = new Set(current)
      if (next.has(relativePath)) next.delete(relativePath)
      else next.add(relativePath)
      return next
    })
  }

  /**
   * Choosing a candidate never checks the row: the user still has to tick it.
   * Clearing the choice leaves the row in the selection so the resolved plan
   * reports `conflict-unresolved`, while the checkbox reads as unchecked (an
   * unresolved conflict can never be executed). A fresh choice therefore drops
   * any stale internal selection first, so selecting again never auto-checks.
   */
  function chooseCandidate(relativePath: string, path: string): void {
    const hadChoice = conflictChoices[relativePath] !== undefined
    setConflictChoices((current) => {
      const next = { ...current }
      if (path === '') delete next[relativePath]
      else next[relativePath] = path
      return next
    })
    if (path === '' || hadChoice) return
    setChecked((current) => {
      if (!current.has(relativePath)) return current
      const next = new Set(current)
      next.delete(relativePath)
      return next
    })
  }

  async function pickRoot(target: 'incoming' | 'output'): Promise<void> {
    if (blocked) return
    const chosen = await platform.selectDirectory()
    if (chosen === null) return
    if (target === 'incoming') setIncomingInput(chosen)
    else setOutputInput(chosen)
  }

  async function droppedRoot(
    target: 'incoming' | 'output',
    event: ReactDragEvent<HTMLDivElement>
  ): Promise<void> {
    event.preventDefault()
    event.stopPropagation()
    const file = sameFiles(event.dataTransfer?.files)[0]
    if (file === undefined) return
    const path = await platform.resolveDroppedPath(file)
    if (path === '') return
    if (target === 'incoming') setIncomingInput(path)
    else setOutputInput(path)
  }

  function acceptedDrag(event: ReactDragEvent<HTMLDivElement>): void {
    if (!isFileDrag(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  async function submit(): Promise<void> {
    if (blocked) return
    setIssue(null)
    if (incomingInput.trim() === '') {
      setIssue('incoming-empty')
      return
    }
    if (outputInput.trim() === '') {
      setIssue('output-empty')
      return
    }

    const homeDir = await platform.homeDirectory()
    const incomingRoot = normalizePathValue(incomingInput, { homeDir })
    if (incomingRoot === null) {
      setIssue('incoming-empty')
      return
    }
    const outputRoot = normalizePathValue(outputInput, { homeDir })
    if (outputRoot === null) {
      setIssue('output-empty')
      return
    }

    setIncomingInput(incomingRoot)
    setOutputInput(outputRoot)
    setSubmitting(true)
    try {
      const failure = await onPreview({ templateRoot, incomingRoot, outputRoot })
      if (failure !== null) setIssue(failure)
    } catch {
      setIssue('preview-failed')
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

  /** Runs (or retries) the same resolved manifest; the dialog stays open either way. */
  async function confirm(): Promise<void> {
    if (blocked || resolved === null) return
    setApplyFailure(null)
    setApplying(true)
    try {
      setOutcome(await onConfirm(resolved))
    } catch (cause) {
      setApplyFailure(cause)
    } finally {
      setApplying(false)
    }
  }

  /** Rebuilds the plan from the same three roots; nothing is written. */
  async function rescan(): Promise<void> {
    if (blocked || preview === null) return
    setIssue(null)
    setSubmitting(true)
    try {
      const failure = await onPreview({
        templateRoot: preview.templateRoot,
        incomingRoot: preview.incomingRoot,
        outputRoot: preview.outputRoot
      })
      if (failure !== null) setIssue(failure)
    } catch {
      setIssue('preview-failed')
    } finally {
      setSubmitting(false)
    }
  }

  function applyFailureText(cause: unknown): string {
    const copy = templateApplyFailureCopy(cause)
    return copy === null
      ? t('directory.template.error.applyFailed')
      : copyText(t, copy)
  }

  function renderField(
    target: 'incoming' | 'output',
    label: string,
    value: string,
    onChange: (value: string) => void,
    pickLabel: string,
    pickTitle: string
  ): JSX.Element {
    const id = `template-${target}-root`
    return (
      <div
        data-template-drop={target}
        className="flex flex-col gap-1 rounded-sm border border-transparent p-1 focus-within:border-line-subtle"
        onDragOver={acceptedDrag}
        onDrop={(event) => void droppedRoot(target, event)}
      >
        <label htmlFor={id} className="text-2xs text-content-secondary">
          {label}
        </label>
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="text"
            className={INPUT_CLASSES}
            value={value}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={submitOnEnter}
          />
          <ToolbarButton
            size="sm"
            icon={<Icon name={UI_ICON_ACTIONS.pickFolder} />}
            onClick={() => void pickRoot(target)}
            disabled={blocked}
            title={pickTitle}
          >
            {pickLabel}
          </ToolbarButton>
        </div>
        <span className="text-2xs text-content-muted">{t('directory.template.dropHint')}</span>
      </div>
    )
  }

  function rowBody(row: TemplateRow): JSX.Element {
    if (row.kind === 'header') {
      return (
        <div className="flex h-6 items-center gap-2 bg-surface-sunken/60 px-2">
          <span className={SECTION_TONES[row.section]}>{t(SECTION_TITLE_KEYS[row.section])}</span>
          <span className="tabular font-mono text-2xs text-content-muted">
            {t(countKey('directory.template.count.one', 'directory.template.count.other', row.count), {
              count: row.count
            })}
          </span>
        </div>
      )
    }
    if (row.kind === 'empty') {
      return (
        <p className="flex h-6 items-center px-2 text-2xs text-content-muted">{t('directory.none')}</p>
      )
    }
    if (row.kind === 'unused') {
      return (
        <div
          className="flex h-6 items-center px-2"
          data-template-row
          title={row.item.relativePath}
        >
          <span className="truncate font-mono text-xs text-content-muted">
            {row.item.relativePath}
          </span>
        </div>
      )
    }

    const entry = row.entry
    const choice = conflictChoices[entry.relativePath]
    const selectable = entry.outcome === 'matched' || entry.outcome === 'conflict'
    const rejection = rejectionByPath.get(entry.relativePath)
    const shownSource = entry.outcome === 'conflict' ? choice : entry.sourcePath
    return (
      <div className="flex h-6 items-center gap-2 px-2" data-template-row title={entry.relativePath}>
        {selectable ? (
          <input
            type="checkbox"
            className="size-4 shrink-0 accent-accent"
            aria-label={t('directory.template.checkSlot', { path: entry.relativePath })}
            checked={checked.has(entry.relativePath) && (entry.outcome !== 'conflict' || choice !== undefined)}
            onChange={() => toggleChecked(entry.relativePath)}
            disabled={blocked || (entry.outcome === 'conflict' && choice === undefined)}
          />
        ) : (
          <span aria-hidden className="size-4 shrink-0" />
        )}
        <span className="truncate font-mono text-xs text-content-secondary">
          {entry.relativePath}
        </span>
        {entry.outcome === 'conflict' ? (
          <>
            <span className="shrink-0 text-2xs text-diff-conflict">
              {t(
                entry.conflictReason === 'ambiguous'
                  ? 'directory.template.reason.ambiguous'
                  : 'directory.template.reason.contentMismatch'
              )}
            </span>
            <select
              className={CANDIDATE_CLASSES}
              aria-label={t('directory.template.conflict.candidate', { path: entry.relativePath })}
              value={choice ?? ''}
              onChange={(event) => chooseCandidate(entry.relativePath, event.target.value)}
              disabled={blocked}
            >
              <option value="">{t('directory.template.conflict.choose')}</option>
              {entry.candidates.map((candidate) => (
                <option key={candidate.path} value={candidate.path}>
                  {candidate.path}
                </option>
              ))}
            </select>
          </>
        ) : null}
        {shownSource !== null && shownSource !== undefined ? (
          <>
            <span aria-hidden className="shrink-0 text-2xs text-content-muted">
              ←
            </span>
            <span className="truncate font-mono text-2xs text-content-muted" title={shownSource}>
              {shownSource}
            </span>
          </>
        ) : null}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {rejection !== undefined ? (
            <span className="text-2xs text-danger">{t(REJECTION_KEYS[rejection])}</span>
          ) : entry.overwrite ? (
            <span className="text-2xs text-diff-modified" title={t('directory.template.overwrite')}>
              {t('directory.template.overwrite')}
            </span>
          ) : null}
          {entry.occupiedByDirectory && rejection === undefined ? (
            <span className="text-2xs text-danger">{t('directory.template.occupied')}</span>
          ) : null}
          <span className="tabular font-mono text-2xs text-content-muted">
            {formatBytes(entry.size)}
          </span>
        </span>
      </div>
    )
  }

  function resultRowBody(row: ResultRow): JSX.Element {
    if (row.kind === 'verify') {
      const { entry } = row
      const reasonKey = entry.ok || entry.reason === undefined
        ? undefined
        : templateVerifyReasonKey(entry.reason)
      return (
        <div
          className="flex h-6 items-center gap-2 px-2"
          data-template-result-row
          title={entry.targetPath}
        >
          <span className="truncate font-mono text-xs text-content-secondary">
            {entry.relativePath}
          </span>
          <span className="truncate font-mono text-2xs text-content-muted">{entry.targetPath}</span>
          <span
            className={`ml-auto shrink-0 text-2xs ${entry.ok ? 'text-diff-added' : 'text-danger'}`}
          >
            {entry.ok ? t('directory.template.result.ok') : t(reasonKey ?? 'directory.template.verify.unreadable')}
          </span>
        </div>
      )
    }

    const { failure } = row
    return (
      <div
        className="flex h-6 items-center gap-2 px-2"
        data-template-failure-row
        title={failure.targetPath}
      >
        <span className="truncate font-mono text-xs text-content-secondary">
          {failure.relativePath}
        </span>
        <span className="truncate font-mono text-2xs text-content-muted">{failure.targetPath}</span>
        <span className="ml-auto shrink-0 text-2xs text-danger">
          {copyText(t, templateWriteFailureCopy(failure))}
        </span>
      </div>
    )
  }

  function rowKey(row: TemplateRow | ResultRow): string {
    switch (row.kind) {
      case 'header':
        return `header-${row.section}`
      case 'empty':
        return `empty-${row.section}`
      case 'unused':
        return `unused-${row.item.relativePath}`
      case 'entry':
        return `entry-${row.entry.relativePath}`
      case 'verify':
        return `verify-${row.entry.relativePath}`
      case 'write-failure':
        return `failure-${row.failure.relativePath}`
    }
  }

  function renderListRow(row: TemplateRow | ResultRow): JSX.Element {
    if (row.kind === 'verify' || row.kind === 'write-failure') return resultRowBody(row)
    return rowBody(row)
  }

  const windowedRows: { readonly row: TemplateRow | ResultRow; readonly top: number }[] = []
  for (let index = range.start; index <= range.end; index += 1) {
    const row = listRows[index]
    if (row === undefined) continue
    windowedRows.push({ row, top: scrollMap.rowTop(index, offset) })
  }

  const description =
    step !== 'setup' && preview !== null ? (
      <>
        {t('directory.template.label.template')}
        <span className="font-mono">{preview.templateRoot}</span> ·{' '}
        {t('directory.template.label.incoming')}
        <span className="font-mono">{preview.incomingRoot}</span> ·{' '}
        {t('directory.template.label.output')}
        <span className="font-mono">{preview.outputRoot}</span> ·{' '}
        {t(
          preview.outputRootExists
            ? 'directory.template.output.exists'
            : 'directory.template.output.willCreate'
        )}
      </>
    ) : (
      t('directory.template.setupHint')
    )

  function footer(): JSX.Element {
    if (step === 'setup') {
      return (
        <>
          <ToolbarButton variant="ghost" onClick={onCancel} disabled={blocked}>
            {t('common.cancel')}
          </ToolbarButton>
          <ToolbarButton variant="primary" onClick={() => void submit()} disabled={blocked}>
            {blocked ? <Icon name={UI_ICON_ACTIONS.loading} className="animate-spin" /> : null}
            {blocked ? t('directory.template.previewing') : t('directory.template.preview')}
          </ToolbarButton>
        </>
      )
    }

    if (step === 'result' && outcome !== null) {
      return (
        <>
          <span className="tabular mr-auto flex items-center gap-2 text-2xs text-content-muted">
            <span>{t('directory.template.result.written', { count: outcome.execution.writtenCount })}</span>
            <span>
              {t('directory.template.result.writeFailed', { count: outcome.execution.failedCount })}
            </span>
            <span>{t('directory.template.result.verified', { count: outcome.verification.verified })}</span>
            <span>
              {t('directory.template.result.verifyFailed', { count: outcome.verification.failed })}
            </span>
          </span>
          <ToolbarButton variant="ghost" onClick={() => void rescan()} disabled={blocked}>
            {t('directory.template.result.rescan')}
          </ToolbarButton>
          <ToolbarButton variant="primary" onClick={onCancel} disabled={blocked}>
            {t('directory.template.result.done')}
          </ToolbarButton>
        </>
      )
    }

    if (resolved === null) {
      return (
        <ToolbarButton variant="ghost" onClick={onCancel} disabled={blocked}>
          {t('common.cancel')}
        </ToolbarButton>
      )
    }

    if (applyFailure !== null) {
      return (
        <>
          <span role="alert" className="mr-auto text-2xs text-danger">
            {applyFailureText(applyFailure)}
          </span>
          <ToolbarButton variant="ghost" onClick={onCancel} disabled={blocked}>
            {t('common.cancel')}
          </ToolbarButton>
          <ToolbarButton variant="primary" onClick={() => void confirm()} disabled={blocked}>
            {applying ? <Icon name={UI_ICON_ACTIONS.loading} className="animate-spin" /> : null}
            {t('directory.template.result.retry')}
          </ToolbarButton>
        </>
      )
    }

    return (
      <>
        <span className="tabular mr-auto text-2xs text-content-muted">
          {t('directory.template.executableCount', { count: resolved.executableCount })} ·{' '}
          {t('directory.template.rejectedCount', { count: resolved.rejectedCount })}
        </span>
        <ToolbarButton variant="ghost" onClick={onCancel} disabled={blocked}>
          {t('common.cancel')}
        </ToolbarButton>
        <ToolbarButton
          variant="primary"
          onClick={() => void confirm()}
          disabled={blocked || resolved.executableCount === 0}
        >
          {applying || busy ? (
            <Icon name={UI_ICON_ACTIONS.loading} className="animate-spin" />
          ) : null}
          {applying || busy ? t('directory.template.placing') : t('directory.template.place')}
        </ToolbarButton>
      </>
    )
  }

  return (
    <Dialog
      title={
        step === 'setup'
          ? t('directory.template.setupTitle')
          : step === 'result'
            ? t('directory.template.result.title')
            : t('directory.template.title')
      }
      description={description}
      onClose={blocked ? () => undefined : onCancel}
      footer={footer()}
    >
      {step === 'setup' ? (
        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <div className="flex items-center gap-2">
            <span className="text-2xs text-content-secondary">
              {t('directory.template.label.template')}
            </span>
            <span className="truncate font-mono text-xs text-content-primary" title={templateRoot}>
              {templateRoot}
            </span>
            <span className="ml-auto shrink-0 text-2xs text-content-muted">
              {t('directory.template.readonly')}
            </span>
          </div>
          {renderField(
            'incoming',
            t('directory.template.incoming.input'),
            incomingInput,
            setIncomingInput,
            t('directory.template.pickIncoming'),
            t('directory.template.pickIncomingTitle')
          )}
          {renderField(
            'output',
            t('directory.template.output.input'),
            outputInput,
            setOutputInput,
            t('directory.template.pickOutput'),
            t('directory.template.pickOutputTitle')
          )}
          {issue !== null ? (
            <p role="alert" className="text-2xs text-danger">
              {issueText(issue)}
            </p>
          ) : null}
        </form>
      ) : (
        <>
          {issue !== null ? (
            <p role="alert" className="mb-2 text-2xs text-danger">
              {issueText(issue)}
            </p>
          ) : null}
          <div
            ref={setScrollElement}
            data-testid={step === 'result' ? 'template-result-rows' : 'template-rows'}
            role="list"
            aria-label={
              step === 'result'
                ? t('directory.template.result.rows')
                : t('directory.template.rows')
            }
            className="relative h-72 overflow-auto rounded-sm border border-line-subtle"
          >
            <div className="relative" style={{ height: scrollMap.contentHeight }}>
              {windowedRows.map(({ row, top }) => (
                <div
                  key={rowKey(row)}
                  role="none"
                  className="absolute top-0 left-0 w-full"
                  style={{ height: DIRECTORY_ROW_HEIGHT, transform: `translateY(${top}px)` }}
                >
                  {renderListRow(row)}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Dialog>
  )
}
