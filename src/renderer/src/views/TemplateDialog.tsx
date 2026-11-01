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
  TemplateResolvedPlan,
  TemplateUnused
} from '@core/directory/template'
import { useI18n } from '@renderer/i18n/context'
import type { MessageKey } from '@renderer/i18n/messages'
import type {
  TemplatePreview,
  TemplatePreviewFailure,
  TemplateRoots
} from '@renderer/workbench/directoryOps'
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

const INPUT_CLASSES =
  'focus-ring h-7 w-full rounded-sm border border-line-subtle bg-surface-base px-2 font-mono text-xs text-content-primary placeholder:text-content-muted'

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

export interface TemplateDialogProps {
  readonly platform: PlatformPort
  /** Template A, always the left root of the active comparison. */
  readonly templateRoot: string
  /** `null` keeps the dialog on the setup step; a plan opens the dry-run. */
  readonly preview: TemplatePreview | null
  readonly busy: boolean
  readonly onPreview: (roots: TemplateRoots) => Promise<TemplatePreviewFailure | null>
  readonly onCancel: () => void
  /** Receives the one resolved manifest; the shell never re-derives it. */
  readonly onConfirm: (resolved: TemplateResolvedPlan) => void
}

function sameFiles(files: FileList | undefined): readonly File[] {
  return files === undefined ? [] : Array.from(files)
}

function isFileDrag(event: ReactDragEvent<HTMLDivElement>): boolean {
  const transfer = event.dataTransfer
  return transfer !== null && Array.from(transfer.types).includes('Files')
}

/**
 * Real template placement: first the two real roots (B and the output root),
 * then the dry-run of the plan built from them. Template A is always the
 * current left root and stays read-only. Nothing is written until the user
 * confirms, and the confirm action only sees the resolved manifest.
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
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set<string>())
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)

  const dryRun = preview !== null
  const blocked = busy || submitting

  // Default checks are the plan's own decision; conflict / missing / overwritten
  // rows never start checked.
  useEffect(() => {
    if (preview === null) {
      setChecked(new Set<string>())
      return
    }
    setChecked(
      new Set(preview.plan.matched.filter((entry) => entry.defaultChecked).map((entry) => entry.relativePath))
    )
  }, [preview])

  const resolved = useMemo(
    () => (preview === null ? null : resolveTemplatePlan(preview.plan, { checkedPaths: [...checked] })),
    [preview, checked]
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

  // The virtualiser observes the scroll container; the row window comes from the
  // pure scroll map, exactly like the directory tree.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => DIRECTORY_ROW_HEIGHT,
    overscan: ROW_OVERSCAN
  })
  const offset = virtualizer.scrollOffset ?? 0
  const viewportHeight = virtualizer.scrollRect?.height ?? 0
  const scrollMap = createDirectoryScrollMap(rows.length, viewportHeight)
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
    return (
      <div className="flex h-6 items-center gap-2 px-2" data-template-row title={entry.relativePath}>
        {entry.outcome === 'matched' ? (
          <input
            type="checkbox"
            className="size-4 shrink-0 accent-accent"
            aria-label={t('directory.template.checkSlot', { path: entry.relativePath })}
            checked={checked.has(entry.relativePath)}
            onChange={() => toggleChecked(entry.relativePath)}
            disabled={busy}
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
            <span
              className="truncate font-mono text-2xs text-content-muted"
              title={entry.candidates.map((candidate) => candidate.path).join(' · ')}
            >
              {entry.candidates.map((candidate) => candidate.path).join(' · ')}
            </span>
          </>
        ) : entry.sourcePath !== null ? (
          <>
            <span aria-hidden className="shrink-0 text-2xs text-content-muted">
              ←
            </span>
            <span className="truncate font-mono text-2xs text-content-muted" title={entry.sourcePath}>
              {entry.sourcePath}
            </span>
          </>
        ) : null}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {entry.overwrite ? (
            <span className="text-2xs text-diff-modified" title={t('directory.template.overwrite')}>
              {t('directory.template.overwrite')}
            </span>
          ) : null}
          {entry.occupiedByDirectory ? (
            <span className="text-2xs text-danger">{t('directory.template.occupied')}</span>
          ) : null}
          <span className="tabular font-mono text-2xs text-content-muted">
            {formatBytes(entry.size)}
          </span>
        </span>
      </div>
    )
  }

  const windowedRows: { readonly row: TemplateRow; readonly top: number }[] = []
  for (let index = range.start; index <= range.end; index += 1) {
    const row = rows[index]
    if (row === undefined) continue
    windowedRows.push({ row, top: scrollMap.rowTop(index, offset) })
  }

  return (
    <Dialog
      title={dryRun ? t('directory.template.title') : t('directory.template.setupTitle')}
      description={
        dryRun && preview !== null ? (
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
      }
      onClose={blocked ? () => undefined : onCancel}
      footer={
        dryRun && resolved !== null ? (
          <>
            <span className="tabular mr-auto text-2xs text-content-muted">
              {t('directory.template.executableCount', { count: resolved.executableCount })} ·{' '}
              {t('directory.template.rejectedCount', { count: resolved.rejectedCount })}
            </span>
            <ToolbarButton variant="ghost" onClick={onCancel} disabled={busy}>
              {t('common.cancel')}
            </ToolbarButton>
            <ToolbarButton
              variant="primary"
              onClick={() => onConfirm(resolved)}
              disabled={busy || resolved.executableCount === 0}
            >
              {busy ? <Icon name={UI_ICON_ACTIONS.loading} className="animate-spin" /> : null}
              {busy ? t('directory.template.placing') : t('directory.template.place')}
            </ToolbarButton>
          </>
        ) : (
          <>
            <ToolbarButton variant="ghost" onClick={onCancel} disabled={blocked}>
              {t('common.cancel')}
            </ToolbarButton>
            <ToolbarButton
              variant="primary"
              onClick={() => void submit()}
              disabled={blocked}
            >
              {blocked ? <Icon name={UI_ICON_ACTIONS.loading} className="animate-spin" /> : null}
              {blocked ? t('directory.template.previewing') : t('directory.template.preview')}
            </ToolbarButton>
          </>
        )
      }
    >
      {dryRun ? (
        <div
          ref={setScrollElement}
          data-testid="template-rows"
          role="list"
          aria-label={t('directory.template.rows')}
          className="relative h-72 overflow-auto rounded-sm border border-line-subtle"
        >
          <div className="relative" style={{ height: scrollMap.contentHeight }}>
            {windowedRows.map(({ row, top }) => {
              const key =
                row.kind === 'header'
                  ? `header-${row.section}`
                  : row.kind === 'empty'
                    ? `empty-${row.section}`
                    : row.kind === 'unused'
                      ? `unused-${row.item.relativePath}`
                      : `entry-${row.entry.relativePath}`
              return (
                <div
                  key={key}
                  role="none"
                  className="absolute top-0 left-0 w-full"
                  style={{ height: DIRECTORY_ROW_HEIGHT, transform: `translateY(${top}px)` }}
                >
                  {rowBody(row)}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
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
      )}
    </Dialog>
  )
}
