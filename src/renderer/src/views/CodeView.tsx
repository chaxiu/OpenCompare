import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { SHELL_ENTRY_ICONS, UI_ICON_ACTIONS } from '@renderer/assets/icons'
import { diffLineTexts, diffLineTextsWithFacts, overwriteBlock } from '@core/text/diff'
import type { OverwriteDirection } from '@core/text/diff'
import { resolveComparisonSwitches } from '@core/text/normalize'
import type { ComparisonSwitches, TextFacts } from '@core/text/normalize'
import { splitLines } from '@core/text/lines'
import {
  buildMergeModel,
  countUnresolved,
  renderMerge,
  renderMergeText
} from '@core/text/merge'
import type { MergeAccept, MergeModel, MergeRange, MergeResolutions } from '@core/text/merge'
import type { CodeSceneFixture, TextSample } from '@shared/fixtures'
import type { PlatformPort, TextFileFacts } from '@shared/platform/types'
import { IconButton, ToolbarButton } from '@renderer/components/Button'
import { DiffBadge, DiffDot } from '@renderer/components/DiffBadge'
import { DIFF_ROW_HEIGHT, DiffPane } from '@renderer/components/DiffPane'
import { DiffRuler } from '@renderer/components/DiffRuler'
import { Icon } from '@renderer/components/Icon'
import { MergePane } from '@renderer/components/MergePane'
import type { MergeLineView } from '@renderer/components/MergePane'
import { Panel } from '@renderer/components/Panel'
import { SegmentedControl } from '@renderer/components/SegmentedControl'
import { SplitPane } from '@renderer/components/SplitPane'
import { cx } from '@renderer/components/utils'
import { useI18n } from '@renderer/i18n/context'
import type { MessageKey } from '@renderer/i18n/messages'
import { pickProbedTextFile, pickTextFile, textFileFilter } from '@renderer/workbench/fileIO'
import type { PickedTextFile } from '@renderer/workbench/fileIO'
import {
  controlPresentation,
  levelBandClasses,
  levelRowClasses
} from '@renderer/workbench/shellLayout'
import { useWidthTier } from '@renderer/workbench/useWidthTier'
import type { CodeFileBuffer, FilePair, FilePairProbes } from '@renderer/workbench/session'

export type CodeMode = 'diff' | 'merge'

const MODE_OPTIONS: readonly { readonly value: CodeMode; readonly key: MessageKey }[] = [
  { value: 'diff', key: 'files.code.mode.diff' },
  { value: 'merge', key: 'files.code.mode.merge' }
]

const ACCEPT_OPTIONS: readonly { readonly value: MergeAccept; readonly key: MessageKey }[] = [
  { value: 'ours', key: 'files.merge.accept.ours' },
  { value: 'theirs', key: 'files.merge.accept.theirs' },
  { value: 'both', key: 'files.merge.accept.both' },
  { value: 'base', key: 'files.merge.accept.base' }
]

const ACCEPT_LABELS: Record<MergeAccept, MessageKey> = {
  ours: 'files.merge.choice.ours',
  theirs: 'files.merge.choice.theirs',
  both: 'files.merge.choice.both',
  base: 'files.merge.choice.base'
}

/** Merge progress reported up to the workbench status bar. */
export interface CodeMergeState {
  readonly unresolved: number
  readonly total: number
}

interface ScrollBox {
  current: HTMLDivElement | null
}

function offsetTop(range: MergeRange): number {
  return Math.max(0, range.start * DIFF_ROW_HEIGHT - 60)
}

/* ------------------------------------------------------------------ */
/* Two-column line + inline character diff                             */
/* ------------------------------------------------------------------ */

/** One native, keyboard-operable comparison switch of the diff toolbar. */
function CodeSwitch({
  id,
  checked,
  label,
  showLabel,
  onToggle
}: {
  readonly id: 'ignore-newline' | 'ignore-encoding' | 'ignore-whitespace'
  readonly checked: boolean
  readonly label: string
  /** The copy is dropped on the compact tier; the switch stays operable. */
  readonly showLabel: boolean
  readonly onToggle: () => void
}): JSX.Element {
  /**
   * Space / Enter both activate a native button; preventing the default action
   * keeps the synthetic click from toggling a second time.
   */
  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>): void {
    if (event.key !== ' ' && event.key !== 'Enter') return
    event.preventDefault()
    onToggle()
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      data-code-switch={id}
      onClick={onToggle}
      onKeyDown={handleKeyDown}
      className={cx(
        'focus-ring transition-ui inline-flex h-6 shrink-0 items-center rounded-sm border text-2xs',
        checked
          ? 'border-accent/60 bg-accent-soft text-accent'
          : 'border-line-subtle bg-surface-raised text-content-muted hover:border-line-strong',
        showLabel ? 'gap-1.5 px-2' : 'w-6 justify-center'
      )}
    >
      <span
        aria-hidden
        className={cx(
          'relative inline-flex h-3 w-5 shrink-0 items-center rounded-full',
          checked ? 'bg-accent' : 'bg-line-strong'
        )}
      >
        <span
          className={cx(
            'absolute size-2 rounded-full bg-surface-base',
            checked ? 'right-0.5' : 'left-0.5'
          )}
        />
      </span>
      {showLabel ? label : null}
    </button>
  )
}

function CodeDiffView({
  pair,
  buffer,
  probes,
  switches,
  onSwitchesChange,
  platform,
  toolbarLeading,
  readSide,
  onPairChange,
  onDirtyChange,
  onBufferChange,
  onOpenSide
}: {
  readonly pair: FilePair
  /** First row of this view's `view-toolbar` level (mode switch, drilldown back). */
  readonly toolbarLeading?: ReactNode
  /** Working copies kept on the session, used when the view remounts. */
  readonly buffer?: CodeFileBuffer
  /** Probe facts fixed when each side was loaded; never re-derived from edits. */
  readonly probes?: FilePairProbes
  /** The two comparison switches, owned once by the shell (or this view alone). */
  readonly switches: ComparisonSwitches
  readonly onSwitchesChange: (switches: ComparisonSwitches) => void
  readonly platform: PlatformPort
  /**
   * Reads one side of the pair for an explicit reload. The shell routes a
   * drilldown path through its snapshot mounts; without it the platform probe
   * reads the path directly.
   */
  readonly readSide?: (path: string) => Promise<PickedTextFile>
  /** Commits a reloaded / swapped pair back to the session that owns it. */
  readonly onPairChange?: (pair: FilePair, probes: FilePairProbes) => void
  /** Reports whether any side now differs from its loaded disk content. */
  readonly onDirtyChange?: (dirty: boolean) => void
  /** Reports the editable state up so a tab switch cannot drop unsaved work. */
  readonly onBufferChange?: (buffer: CodeFileBuffer) => void
  /** Writes a newly opened file back to the session's own pair facts. */
  readonly onOpenSide?: (side: 'left' | 'right', file: PickedTextFile) => void
}): JSX.Element {
  const { t } = useI18n()
  const tier = useWidthTier()
  const newlineLabelShown = controlPresentation('code-switch-newline', tier) === 'label'
  const encodingLabelShown = controlPresentation('code-switch-encoding', tier) === 'label'
  const whitespaceLabelShown = controlPresentation('code-switch-whitespace', tier) === 'label'
  const bytesLabelShown = controlPresentation('code-diff-bytes', tier) === 'label'
  const reloadLabelShown = controlPresentation('code-reload', tier) === 'label'
  const swapLabelShown = controlPresentation('code-swap', tier) === 'label'
  const openLeftLabelShown = controlPresentation('open-left', tier) === 'label'
  const openRightLabelShown = controlPresentation('open-right', tier) === 'label'
  const initial = {
    leftPath: buffer?.leftPath ?? pair.left.path,
    rightPath: buffer?.rightPath ?? pair.right.path,
    leftSource: buffer?.leftSource ?? pair.left.text,
    rightSource: buffer?.rightSource ?? pair.right.text,
    leftText: buffer?.leftText ?? pair.left.text,
    rightText: buffer?.rightText ?? pair.right.text
  }
  const [leftPath, setLeftPath] = useState(initial.leftPath)
  const [rightPath, setRightPath] = useState(initial.rightPath)
  // The loaded bodies (reset target) are kept apart from the working copies the
  // per-block overwrite mutates. A side is dirty once the two diverge again.
  const [leftSource, setLeftSource] = useState(initial.leftSource)
  const [rightSource, setRightSource] = useState(initial.rightSource)
  const [leftText, setLeftText] = useState(initial.leftText)
  const [rightText, setRightText] = useState(initial.rightText)
  // The probe facts belong to the loaded body of one path. They move with an
  // explicit reload or swap, so the byte signal always mirrors the panel.
  const [leftFacts, setLeftFacts] = useState<TextFileFacts | undefined>(probes?.left)
  const [rightFacts, setRightFacts] = useState<TextFileFacts | undefined>(probes?.right)
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null)
  const [active, setActive] = useState(0)
  // Bumped on every explicit jump so re-selecting the current block re-scrolls.
  const [jumpToken, setJumpToken] = useState(0)
  // Reload / swap keep the viewport where it was, so the next block-scroll
  // effect run (triggered by the new diff) is skipped once.
  const skipBlockScroll = useRef(false)

  const leftScroll = useRef<HTMLDivElement>(null)
  const rightScroll = useRef<HTMLDivElement>(null)

  const leftDirty = leftText !== leftSource
  const rightDirty = rightText !== rightSource
  const dirty = leftDirty || rightDirty

  const dirtyCallback = useRef(onDirtyChange)
  useEffect(() => {
    dirtyCallback.current = onDirtyChange
  })
  useEffect(() => {
    dirtyCallback.current?.(dirty)
  }, [dirty])

  const bufferCallback = useRef(onBufferChange)
  useEffect(() => {
    bufferCallback.current = onBufferChange
  })
  useEffect(() => {
    bufferCallback.current?.({
      leftPath,
      rightPath,
      leftSource,
      rightSource,
      leftText,
      rightText
    })
  }, [leftPath, rightPath, leftSource, rightSource, leftText, rightText])

  const diff = useMemo(() => {
    // A side's fixed probe facts may only speak for the loaded body: an edited
    // working copy (or a newly opened path) never borrows the stored sha256.
    const leftLoaded =
      leftText === leftSource && leftFacts !== undefined && leftFacts.path === leftPath
        ? leftFacts
        : null
    const rightLoaded =
      rightText === rightSource && rightFacts !== undefined && rightFacts.path === rightPath
        ? rightFacts
        : null
    if (leftLoaded && rightLoaded) {
      const left: TextFacts = {
        text: leftText,
        encoding: leftLoaded.encoding,
        sha256: leftLoaded.sha256
      }
      const right: TextFacts = {
        text: rightText,
        encoding: rightLoaded.encoding,
        sha256: rightLoaded.sha256
      }
      return diffLineTextsWithFacts(left, right, switches)
    }
    return diffLineTexts(leftText, rightText, switches)
  }, [
    leftText,
    rightText,
    leftSource,
    rightSource,
    leftPath,
    rightPath,
    leftFacts,
    rightFacts,
    switches
  ])

  /** One mutation for both clicks and keys; the effective value comes from `diff`. */
  function toggleSwitch(
    key: 'ignoreNewline' | 'ignoreEncoding' | 'ignoreWhitespace'
  ): void {
    onSwitchesChange({ ...switches, [key]: !switches[key] })
  }

  const blockCount = diff.blocks.length
  const activeIndex = blockCount === 0 ? -1 : Math.min(active, blockCount - 1)
  const activeBlock = activeIndex >= 0 ? diff.blocks[activeIndex] : null

  useEffect(() => {
    if (skipBlockScroll.current) {
      skipBlockScroll.current = false
      return
    }
    if (activeIndex < 0) return
    const top = diff.blocks[activeIndex].startRow * DIFF_ROW_HEIGHT
    for (const pane of [leftScroll.current, rightScroll.current]) {
      if (pane) pane.scrollTop = top
    }
  }, [activeIndex, diff, jumpToken])

  /** Mirrors the scrolled pane onto the other; identical row counts keep it exact. */
  function syncScroll(from: ScrollBox, to: ScrollBox): void {
    const source = from.current
    const target = to.current
    if (!source || !target) return
    if (target.scrollTop !== source.scrollTop) target.scrollTop = source.scrollTop
    if (target.scrollLeft !== source.scrollLeft) target.scrollLeft = source.scrollLeft
  }

  /**
   * Writes the block's first row straight onto both panes before React renders.
   * The windowed panes read the element's own `scrollTop` on that next render,
   * so a jump lands even though no scroll event follows a programmatic write.
   */
  function scrollToBlock(index: number): void {
    const block = diff.blocks[index]
    if (!block) return
    const top = block.startRow * DIFF_ROW_HEIGHT
    for (const pane of [leftScroll.current, rightScroll.current]) {
      if (pane) pane.scrollTop = top
    }
  }

  function step(delta: number): void {
    if (blockCount === 0) return
    const next = (Math.min(active, blockCount - 1) + delta + blockCount) % blockCount
    scrollToBlock(next)
    setActive(next)
    setJumpToken((token) => token + 1)
  }

  /** Selects a block from the ruler; the shared `active` state drives everything. */
  function selectBlock(index: number): void {
    if (blockCount === 0 || index < 0) return
    scrollToBlock(index)
    setActive(index)
    setJumpToken((token) => token + 1)
  }

  /** Re-targets the current block (ruler `Enter`), even if it is already active. */
  function jumpActive(): void {
    if (activeIndex < 0) return
    scrollToBlock(activeIndex)
    setJumpToken((token) => token + 1)
  }

  function overwrite(direction: OverwriteDirection): void {
    if (activeIndex < 0) return
    const next = overwriteBlock(leftText, rightText, diff, activeIndex, direction)
    setLeftText(next.left)
    setRightText(next.right)
  }

  function reset(): void {
    setLeftText(leftSource)
    setRightText(rightSource)
    setActive(0)
  }

  /**
   * Writes one side straight back to the path it was loaded from — no save
   * dialog, so the file on disk is exactly where the panel says it is. A failed
   * write (e.g. a read-only sample mount) keeps the buffers and the dirty flag.
   */
  async function save(side: 'left' | 'right'): Promise<void> {
    const path = side === 'left' ? leftPath : rightPath
    const content = side === 'left' ? leftText : rightText
    try {
      await platform.writeTextFile(path, content)
      if (side === 'left') setLeftSource(content)
      else setRightSource(content)
      setNotice({ text: t('files.notice.wroteBack', { path }), tone: 'ok' })
    } catch (cause) {
      setNotice({ text: cause instanceof Error ? cause.message : String(cause), tone: 'error' })
    }
  }

  /** Opens a local file on one side and re-runs the comparison over it. */
  async function open(side: 'left' | 'right'): Promise<void> {
    try {
      const picked = await pickProbedTextFile(
        platform,
        t(side === 'left' ? 'files.code.openLeftTitle' : 'files.code.openRightTitle'),
        [textFileFilter(t('common.fileKind.code'))]
      )
      if (picked === null) return
      // The session keeps the same tab: the new path/body lands on its pair
      // facts, so the tab title and the panel never disagree about the file.
      onOpenSide?.(side, picked)
      if (side === 'left') {
        setLeftPath(picked.path)
        setLeftSource(picked.text)
        setLeftText(picked.text)
        setLeftFacts(picked.facts)
      } else {
        setRightPath(picked.path)
        setRightSource(picked.text)
        setRightText(picked.text)
        setRightFacts(picked.facts)
      }
      setActive(0)
      setNotice({ text: t('files.notice.opened', { path: picked.path }), tone: 'ok' })
    } catch (cause) {
      setNotice({ text: cause instanceof Error ? cause.message : String(cause), tone: 'error' })
    }
  }

  /**
   * Re-reads the two recorded paths and commits them only when both reads
   * succeed. A deleted / unreadable side keeps the whole previous result, so a
   * new body can never be mixed with an old one.
   */
  async function reload(): Promise<void> {
    const read = readSide
    if (!read) return
    const [nextLeft, nextRight] = await Promise.all([
      read(leftPath).catch(() => null),
      read(rightPath).catch(() => null)
    ])
    if (nextLeft === null || nextRight === null) {
      const failed = [
        nextLeft === null ? leftPath : null,
        nextRight === null ? rightPath : null
      ].filter((path): path is string => path !== null)
      setNotice({ text: t('files.code.reloadFailed', { path: failed.join(' · ') }), tone: 'error' })
      return
    }

    skipBlockScroll.current = true
    setLeftSource(nextLeft.text)
    setLeftText(nextLeft.text)
    setLeftFacts(nextLeft.facts)
    setRightSource(nextRight.text)
    setRightText(nextRight.text)
    setRightFacts(nextRight.facts)
    onPairChange?.(
      {
        left: { path: nextLeft.path, text: nextLeft.text },
        right: { path: nextRight.path, text: nextRight.text }
      },
      { left: nextLeft.facts, right: nextRight.facts }
    )
    setNotice({ text: t('files.notice.reloaded'), tone: 'ok' })
  }

  /**
   * Mirrors the two panes and every derived value (paths, loaded bodies, probe
   * facts) in one commit. Only the view / session swaps: no file is copied or
   * written, and a parent directory comparison is never touched.
   */
  function swapSides(): void {
    skipBlockScroll.current = true
    setLeftPath(rightPath)
    setRightPath(leftPath)
    setLeftSource(rightSource)
    setRightSource(leftSource)
    setLeftText(rightText)
    setRightText(leftText)
    setLeftFacts(rightFacts)
    setRightFacts(leftFacts)
    onPairChange?.(
      {
        left: { path: rightPath, text: rightSource },
        right: { path: leftPath, text: leftSource }
      },
      { left: rightFacts, right: leftFacts }
    )
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        data-shell-level="view-toolbar"
        className={cx(
          'flex shrink-0 flex-col border-b border-line-subtle bg-surface-sunken',
          levelBandClasses('view-toolbar')
        )}
      >
        {toolbarLeading ? (
          <div className={cx('flex shrink-0 items-center', levelRowClasses('view-toolbar'))}>
            {toolbarLeading}
          </div>
        ) : null}
        <div className={cx('flex shrink-0 items-center', levelRowClasses('view-toolbar'))}>
        <IconButton
          data-shell-entry="prev-diff"
          label={t('files.code.prevDifference')}
          icon={<Icon name={SHELL_ENTRY_ICONS['prev-diff']} />}
          onClick={() => step(-1)}
          disabled={blockCount === 0}
        />
        <IconButton
          data-shell-entry="next-diff"
          label={t('files.code.nextDifference')}
          icon={<Icon name={SHELL_ENTRY_ICONS['next-diff']} />}
          onClick={() => step(1)}
          disabled={blockCount === 0}
        />
        <span className="flex items-center gap-1.5 text-2xs text-content-muted">
          {t('files.code.blocks')}
          <span className="tabular font-mono text-content-secondary">
            {activeIndex + 1}/{blockCount}
          </span>
          {activeBlock ? <DiffBadge status={activeBlock.status} /> : null}
        </span>
        <span aria-hidden className="h-3 w-px shrink-0 bg-line-subtle" />
        <CodeSwitch
          id="ignore-newline"
          checked={switches.ignoreNewline}
          label={t('files.code.ignoreNewline')}
          showLabel={newlineLabelShown}
          onToggle={() => toggleSwitch('ignoreNewline')}
        />
        <CodeSwitch
          id="ignore-encoding"
          checked={switches.ignoreEncoding}
          label={t('files.code.ignoreEncoding')}
          showLabel={encodingLabelShown}
          onToggle={() => toggleSwitch('ignoreEncoding')}
        />
        <CodeSwitch
          id="ignore-whitespace"
          checked={switches.ignoreWhitespace}
          label={t('files.code.ignoreWhitespace')}
          showLabel={whitespaceLabelShown}
          onToggle={() => toggleSwitch('ignoreWhitespace')}
        />
        <span className="flex shrink-0 items-center gap-1.5 text-2xs text-content-muted">
          {t('files.code.differenceCount')}
          <span data-code-diff-count className="tabular font-mono text-content-secondary">
            {diff.differenceCount}
          </span>
        </span>
        {diff.normalization.encoding.byteDifference ? (
          <span
            data-code-diff-bytes
            aria-label={t('files.code.byteDifference')}
            title={t('files.code.byteDifference')}
            className="flex shrink-0 items-center gap-1 text-2xs text-danger"
          >
            <Icon name={UI_ICON_ACTIONS.warning} />
            {bytesLabelShown ? t('files.code.byteDifference') : null}
          </span>
        ) : null}
        <span aria-hidden className="h-3 w-px shrink-0 bg-line-subtle" />
        <span data-shell-entry="override" className="flex shrink-0 items-center gap-1.5">
          <ToolbarButton
            size="sm"
            icon={<Icon name={UI_ICON_ACTIONS.overwriteRight} />}
            onClick={() => overwrite('to-right')}
            disabled={activeBlock === null}
          >
            {t('files.code.overwriteRight')}
          </ToolbarButton>
          <ToolbarButton
            size="sm"
            icon={<Icon name={UI_ICON_ACTIONS.overwriteLeft} />}
            onClick={() => overwrite('to-left')}
            disabled={activeBlock === null}
          >
            {t('files.code.overwriteLeft')}
          </ToolbarButton>
        </span>
        <ToolbarButton
          size="sm"
          variant="ghost"
          icon={<Icon name={UI_ICON_ACTIONS.reset} />}
          onClick={reset}
        >
          {t('files.code.reset')}
        </ToolbarButton>
        <span aria-hidden className="h-3 w-px shrink-0 bg-line-subtle" />
        <span data-code-pair-actions className="flex shrink-0 items-center gap-1.5">
          {readSide ? (
            <ToolbarButton
              size="sm"
              data-code-action="reload"
              aria-label={t('files.code.reload')}
              title={t('files.code.reload')}
              icon={<Icon name={UI_ICON_ACTIONS.refresh} />}
              onClick={() => void reload()}
            >
              {reloadLabelShown ? t('files.code.reload') : null}
            </ToolbarButton>
          ) : null}
          {onPairChange ? (
            <ToolbarButton
              size="sm"
              data-code-action="swap"
              aria-label={t('files.code.swap')}
              title={t('files.code.swap')}
              icon={<Icon name={UI_ICON_ACTIONS.swap} />}
              onClick={swapSides}
            >
              {swapLabelShown ? t('files.code.swap') : null}
            </ToolbarButton>
          ) : null}
        </span>
        <span aria-hidden className="h-3 w-px shrink-0 bg-line-subtle" />
        <span data-shell-entry="save" className="flex shrink-0 items-center gap-1.5">
          <ToolbarButton
            size="sm"
            icon={<Icon name={SHELL_ENTRY_ICONS.save} />}
            onClick={() => void save('left')}
            disabled={!leftDirty}
            title={t('files.code.saveLeftTitle')}
          >
            {t('files.code.saveLeft')}
          </ToolbarButton>
          <ToolbarButton
            size="sm"
            icon={<Icon name={SHELL_ENTRY_ICONS.save} />}
            onClick={() => void save('right')}
            disabled={!rightDirty}
            title={t('files.code.saveRightTitle')}
          >
            {t('files.code.saveRight')}
          </ToolbarButton>
        </span>
        {dirty ? (
          <span role="status" className="text-2xs text-diff-modified">
            {leftDirty && rightDirty
              ? t('files.code.unsavedBoth')
              : leftDirty
                ? t('files.code.unsavedLeft')
                : t('files.code.unsavedRight')}
          </span>
        ) : null}
        <span aria-hidden className="h-3 w-px shrink-0 bg-line-subtle" />
        <ToolbarButton
          size="sm"
          aria-label={t('files.action.openLeft')}
          title={t('files.action.openLeft')}
          icon={<Icon name={SHELL_ENTRY_ICONS['open-folder']} />}
          onClick={() => void open('left')}
        >
          {openLeftLabelShown ? t('files.action.openLeft') : null}
        </ToolbarButton>
        <ToolbarButton
          size="sm"
          aria-label={t('files.action.openRight')}
          title={t('files.action.openRight')}
          icon={<Icon name={SHELL_ENTRY_ICONS['open-folder']} />}
          onClick={() => void open('right')}
        >
          {openRightLabelShown ? t('files.action.openRight') : null}
        </ToolbarButton>
        {notice ? (
          <span
            role="status"
            className={cx(
              'text-2xs',
              notice.tone === 'error' ? 'text-danger' : 'text-diff-added'
            )}
          >
            {notice.text}
          </span>
        ) : null}
        </div>
      </div>

      <div
        data-shell-level="panels"
        className={cx('flex min-h-0 min-w-0 flex-1', levelBandClasses('panels'))}
      >
        <SplitPane
          panes={[
            <Panel
              key="left"
              title={leftPath}
              subtitle={t('files.code.sideLeft')}
              meta={
                leftDirty ? (
                  <span className="text-2xs text-diff-modified">{t('files.code.modified')}</span>
                ) : null
              }
            >
              <DiffPane
                rows={diff.rows}
                side="left"
                activeBlock={activeBlock}
                scrollRef={leftScroll}
                onScroll={() => syncScroll(leftScroll, rightScroll)}
              />
            </Panel>,
            <Panel
              key="right"
              title={rightPath}
              subtitle={t('files.code.sideRight')}
              meta={
                rightDirty ? (
                  <span className="text-2xs text-diff-modified">{t('files.code.modified')}</span>
                ) : null
              }
            >
              <DiffPane
                rows={diff.rows}
                side="right"
                activeBlock={activeBlock}
                scrollRef={rightScroll}
                onScroll={() => syncScroll(rightScroll, leftScroll)}
              />
            </Panel>
          ]}
        />
        <DiffRuler
          rows={diff.rows}
          blocks={diff.blocks}
          activeBlock={activeBlock}
          leftScroll={leftScroll}
          rightScroll={rightScroll}
          onSelectBlock={selectBlock}
          onStepBlock={step}
          onJumpActive={jumpActive}
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Three-way merge with per-block conflict resolution                  */
/* ------------------------------------------------------------------ */

/** The three merge inputs: each side is a path plus its current body. */
export interface MergeSides {
  readonly base: TextSample
  readonly ours: TextSample
  readonly theirs: TextSample
}

export type MergeSideKey = keyof MergeSides

const MERGE_SIDE_KEYS: Record<MergeSideKey, MessageKey> = {
  base: 'files.merge.side.base',
  ours: 'files.merge.side.ours',
  theirs: 'files.merge.side.theirs'
}

function CodeMergeView({
  sides,
  model,
  resolutions,
  onResolve,
  activeConflict,
  onSelectConflict,
  platform,
  toolbarLeading,
  onOpenSide
}: {
  readonly sides: MergeSides
  /** First row of this view's `view-toolbar` level (mode switch). */
  readonly toolbarLeading?: ReactNode
  readonly model: MergeModel
  readonly resolutions: MergeResolutions
  readonly onResolve: (id: string, accept: MergeAccept) => void
  readonly activeConflict: number
  readonly onSelectConflict: (index: number) => void
  readonly platform: PlatformPort
  readonly onOpenSide: (which: MergeSideKey, picked: PickedTextFile) => void
}): JSX.Element {
  const { t } = useI18n()
  // The layout table owns the collapse rule; the row only asks it.
  const tier = useWidthTier()
  const openSideCopyShown = controlPresentation('merge-open-sides', tier) === 'label'
  const copyCopyShown = controlPresentation('merge-copy', tier) === 'label'
  const baseScroll = useRef<HTMLDivElement>(null)
  const oursScroll = useRef<HTMLDivElement>(null)
  const theirsScroll = useRef<HTMLDivElement>(null)
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null)

  const conflictCount = model.conflictIds.length
  const activeIndex = conflictCount === 0 ? -1 : Math.min(activeConflict, conflictCount - 1)
  const activeId = activeIndex >= 0 ? model.conflictIds[activeIndex] : null
  const activeBlock = activeId
    ? (model.blocks.find((block) => block.id === activeId) ?? null)
    : null

  const render = useMemo(() => renderMerge(model, resolutions), [model, resolutions])
  const baseLines = useMemo(() => splitLines(sides.base.text), [sides])
  const oursLines = useMemo(() => splitLines(sides.ours.text), [sides])
  const theirsLines = useMemo(() => splitLines(sides.theirs.text), [sides])

  const previewLines = useMemo<readonly MergeLineView[]>(
    () =>
      render.lines.map((line) =>
        line.conflict ? { text: line.text, tone: 'conflict' } : { text: line.text }
      ),
    [render]
  )

  useEffect(() => {
    if (!activeBlock) return
    if (baseScroll.current) baseScroll.current.scrollTop = offsetTop(activeBlock.baseRange)
    if (oursScroll.current) oursScroll.current.scrollTop = offsetTop(activeBlock.oursRange)
    if (theirsScroll.current) theirsScroll.current.scrollTop = offsetTop(activeBlock.theirsRange)
  }, [activeBlock])

  function flash(text: string, tone: 'ok' | 'error' = 'ok'): void {
    setNotice({ text, tone })
    window.setTimeout(() => setNotice(null), 2400)
  }

  function step(delta: number): void {
    if (conflictCount === 0) return
    onSelectConflict((activeIndex + delta + conflictCount) % conflictCount)
  }

  /** Opens a local file into one of the three merge inputs. */
  async function openSide(which: MergeSideKey): Promise<void> {
    try {
      const picked = await pickTextFile(
        platform,
        t('files.merge.openSideTitle', { side: t(MERGE_SIDE_KEYS[which]) }),
        [textFileFilter(t('common.fileKind.code'))]
      )
      if (picked === null) return
      onOpenSide(which, picked)
      flash(t('files.notice.opened', { path: picked.path }))
    } catch (cause) {
      flash(cause instanceof Error ? cause.message : String(cause), 'error')
    }
  }

  /** Saves the fully resolved merge result through the platform. */
  async function saveText(): Promise<void> {
    try {
      const path = await platform.saveFile({
        title: t('files.merge.saveTitle'),
        defaultPath: 'merged.txt',
        filters: [textFileFilter(t('common.fileKind.code'))],
        content: renderMergeText(render)
      })
      if (path === null) return
      flash(t('files.notice.saved', { path }))
    } catch (cause) {
      flash(cause instanceof Error ? cause.message : String(cause), 'error')
    }
  }

  async function copyText(): Promise<void> {
    try {
      await navigator.clipboard.writeText(renderMergeText(render))
      flash(t('files.notice.copied'))
    } catch {
      flash(t('files.notice.copyFailed'), 'error')
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        data-shell-level="view-toolbar"
        className={cx(
          'flex shrink-0 flex-col border-b border-line-subtle bg-surface-sunken',
          levelBandClasses('view-toolbar')
        )}
      >
        {toolbarLeading ? (
          <div className={cx('flex shrink-0 items-center', levelRowClasses('view-toolbar'))}>
            {toolbarLeading}
          </div>
        ) : null}
        <div className={cx('flex shrink-0 items-center', levelRowClasses('view-toolbar'))}>
        <IconButton
          data-shell-entry="prev-diff"
          label={t('files.merge.prevConflict')}
          icon={<Icon name={SHELL_ENTRY_ICONS['prev-diff']} />}
          onClick={() => step(-1)}
          disabled={conflictCount === 0}
        />
        <IconButton
          data-shell-entry="next-diff"
          label={t('files.merge.nextConflict')}
          icon={<Icon name={SHELL_ENTRY_ICONS['next-diff']} />}
          onClick={() => step(1)}
          disabled={conflictCount === 0}
        />
        <span className="flex items-center gap-1.5 text-2xs text-content-muted">
          {t('files.merge.pending')}
          <span className="tabular font-mono text-content-secondary">
            {render.unresolved}/{conflictCount}
          </span>
        </span>
        <span aria-hidden className="h-3 w-px shrink-0 bg-line-subtle" />
        <span data-shell-entry="merge-accept" className="flex shrink-0 items-center gap-1.5">
          {ACCEPT_OPTIONS.map((option) => (
            <ToolbarButton
              key={option.value}
              size="sm"
              variant={activeId && resolutions[activeId] === option.value ? 'primary' : 'default'}
              onClick={() => {
                if (activeId) onResolve(activeId, option.value)
              }}
              disabled={activeId === null}
            >
              {t(option.key)}
            </ToolbarButton>
          ))}
        </span>
        <span aria-hidden className="h-3 w-px shrink-0 bg-line-subtle" />
        {(Object.keys(MERGE_SIDE_KEYS) as MergeSideKey[]).map((which) => (
          <ToolbarButton
            key={which}
            size="sm"
            aria-label={t('files.merge.openSide', { side: t(MERGE_SIDE_KEYS[which]) })}
            icon={<Icon name={SHELL_ENTRY_ICONS['open-folder']} />}
            onClick={() => void openSide(which)}
          >
            {openSideCopyShown
              ? t('files.merge.openSide', { side: t(MERGE_SIDE_KEYS[which]) })
              : null}
          </ToolbarButton>
        ))}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {notice ? (
            <span
              role="status"
              className={cx(
                'text-2xs',
                notice.tone === 'error' ? 'text-danger' : 'text-diff-added'
              )}
            >
              {notice.text}
            </span>
          ) : null}
          <ToolbarButton
            size="sm"
            aria-label={t('files.action.copy')}
            icon={<Icon name={UI_ICON_ACTIONS.copy} />}
            onClick={() => void copyText()}
            disabled={render.unresolved > 0}
          >
            {copyCopyShown ? t('files.action.copy') : null}
          </ToolbarButton>
          <ToolbarButton
            size="sm"
            data-shell-entry="export"
            variant="primary"
            icon={<Icon name={SHELL_ENTRY_ICONS.export} />}
            onClick={() => void saveText()}
            disabled={render.unresolved > 0}
          >
            {t('files.merge.export')}
          </ToolbarButton>
        </span>
        </div>
      </div>

      <div
        data-shell-level="panels"
        className={cx('flex min-h-0 min-w-0 flex-1 flex-col', levelBandClasses('panels'))}
      >
      <SplitPane
        panes={[
          <Panel key="base" title={sides.base.path} subtitle={t(MERGE_SIDE_KEYS.base)}>
            <MergePane lines={baseLines.map((text) => ({ text }))} scrollRef={baseScroll} />
          </Panel>,
          <Panel key="ours" title={sides.ours.path} subtitle={t(MERGE_SIDE_KEYS.ours)}>
            <MergePane
              lines={oursLines.map((text) => ({ text }))}
              activeRange={activeBlock?.oursRange}
              scrollRef={oursScroll}
            />
          </Panel>,
          <Panel key="theirs" title={sides.theirs.path} subtitle={t(MERGE_SIDE_KEYS.theirs)}>
            <MergePane
              lines={theirsLines.map((text) => ({ text }))}
              activeRange={activeBlock?.theirsRange}
              scrollRef={theirsScroll}
            />
          </Panel>
        ]}
      />

      <div className="flex h-60 shrink-0">
        <Panel
          title={t('files.merge.preview')}
          subtitle={
            render.unresolved === 0
              ? t('files.merge.previewResolved')
              : t('files.merge.previewUnresolved')
          }
          meta={render.unresolved > 0 ? <DiffDot status="conflict" /> : null}
        >
          <div className="flex h-full min-h-0 divide-x divide-line-subtle">
            <div className="flex w-64 shrink-0 flex-col overflow-auto">
              {conflictCount === 0 ? (
                <p className="p-3 text-2xs text-content-muted">{t('files.merge.noConflicts')}</p>
              ) : (
                model.conflictIds.map((id, index) => {
                  const accept = resolutions[id]
                  const selected = index === activeIndex
                  return (
                    <div
                      key={id}
                      className={cx(
                        'border-b border-line-subtle p-2',
                        selected ? 'bg-accent-soft/30' : ''
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectConflict(index)}
                        className="focus-ring flex w-full items-center gap-2 rounded-xs text-left"
                      >
                        <span className="text-xs font-medium text-content-primary">
                          {t('files.merge.conflict', { n: index + 1 })}
                        </span>
                        <span
                          className={cx(
                            'ml-auto text-2xs',
                            accept ? 'text-diff-added' : 'text-content-muted'
                          )}
                        >
                          {accept
                            ? t('files.merge.accepted', { choice: t(ACCEPT_LABELS[accept]) })
                            : t('files.merge.unresolved')}
                        </span>
                      </button>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {ACCEPT_OPTIONS.map((option) => (
                          <ToolbarButton
                            key={option.value}
                            size="sm"
                            variant={accept === option.value ? 'primary' : 'default'}
                            onClick={() => {
                              onSelectConflict(index)
                              onResolve(id, option.value)
                            }}
                          >
                            {t(option.key)}
                          </ToolbarButton>
                        ))}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            <div className="min-w-0 flex-1">
              <MergePane lines={previewLines} />
            </div>
          </div>
        </Panel>
      </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Mode switch                                                         */
/* ------------------------------------------------------------------ */

/**
 * Scene B — code diff pair and the three-way merge set.
 *
 * A drilldown `pair` (from the directory view) renders the two-column diff
 * only; the built-in code scene additionally exposes the three-way merge.
 */
export function CodeView({
  fixture,
  defaultMode = 'merge',
  mode: controlledMode,
  onModeChange,
  pair,
  buffer,
  probes,
  switches: controlledSwitches,
  onSwitchesChange,
  readSide,
  onPairChange,
  platform,
  toolbarLeading,
  onMergeStateChange,
  onDirtyChange,
  onBufferChange,
  onOpenSide
}: {
  readonly fixture?: CodeSceneFixture
  /** Three-column merge is the default for a session declared with three panes. */
  readonly defaultMode?: CodeMode
  /** Mode kept by the shell per session; omitted for a standalone view. */
  readonly mode?: CodeMode
  /** Reports the mode on screen, so the status bar only shows diff-only facts. */
  readonly onModeChange?: (mode: CodeMode) => void
  /** Ad-hoc left/right bodies coming from a directory-tree drilldown. */
  readonly pair?: FilePair
  /** Working copies kept on the session, used when the view remounts. */
  readonly buffer?: CodeFileBuffer
  /** Probe facts of both sides fixed when they were loaded. */
  readonly probes?: FilePairProbes
  /** Comparison switches kept by the shell; a standalone view keeps its own. */
  readonly switches?: ComparisonSwitches
  readonly onSwitchesChange?: (switches: ComparisonSwitches) => void
  /** Reads one side again for an explicit reload (shell routes snapshot mounts). */
  readonly readSide?: (path: string) => Promise<PickedTextFile>
  /** Commits a reloaded / swapped pair back to the session that owns it. */
  readonly onPairChange?: (pair: FilePair, probes: FilePairProbes) => void
  readonly platform: PlatformPort
  /** Drilldown back row handed down by the shell; first row of the level. */
  readonly toolbarLeading?: ReactNode
  readonly onMergeStateChange?: (state: CodeMergeState) => void
  /** Reports the diff pair's unsaved state up to the session model. */
  readonly onDirtyChange?: (dirty: boolean) => void
  /** Reports the diff pair's editable state up to the session model. */
  readonly onBufferChange?: (buffer: CodeFileBuffer) => void
  /** Writes a newly opened file back to the session's own pair facts. */
  readonly onOpenSide?: (side: 'left' | 'right', file: PickedTextFile) => void
}): JSX.Element {
  const { t } = useI18n()
  const [localMode, setLocalMode] = useState<CodeMode>(defaultMode)
  // Standalone rendering has no shell to own the preference, so it keeps the
  // same default-on switches here. The default rule still lives in core only.
  const [localSwitches, setLocalSwitches] = useState<ComparisonSwitches>(() =>
    resolveComparisonSwitches({})
  )
  const switches = controlledSwitches ?? localSwitches
  const adhoc = pair !== undefined
  const selectedMode = controlledMode ?? localMode
  const effectiveMode: CodeMode = adhoc ? 'diff' : selectedMode
  const diffPair = pair ?? fixture?.diff

  /** One mode mutation for both the local fallback and the shell's per-session record. */
  function switchMode(next: CodeMode): void {
    setLocalMode(next)
    onModeChange?.(next)
  }

  /** One switch mutation for the standalone fallback and the shell's preference. */
  function changeSwitches(next: ComparisonSwitches): void {
    setLocalSwitches(next)
    onSwitchesChange?.(next)
  }

  // The merge inputs are editable: opening a local file replaces one side and
  // the model (conflicts included) is rebuilt from the new bodies.
  const [mergeSides, setMergeSides] = useState<MergeSides | null>(() =>
    fixture
      ? { base: fixture.merge.base, ours: fixture.merge.ours, theirs: fixture.merge.theirs }
      : null
  )
  const model = useMemo(
    () =>
      mergeSides
        ? buildMergeModel(mergeSides.base.text, mergeSides.ours.text, mergeSides.theirs.text)
        : null,
    [mergeSides]
  )
  const [resolutions, setResolutions] = useState<MergeResolutions>({})
  const [activeConflict, setActiveConflict] = useState(0)

  const unresolved = model ? countUnresolved(model, resolutions) : 0
  const total = model ? model.conflictIds.length : 0

  useEffect(() => {
    onMergeStateChange?.({ unresolved, total })
  }, [unresolved, total, onMergeStateChange])

  /** Swaps one merge input; the rebuilt model invalidates old acceptances. */
  function replaceMergeSide(which: MergeSideKey, picked: PickedTextFile): void {
    setMergeSides((current) =>
      current ? { ...current, [which]: { path: picked.path, text: picked.text } } : current
    )
    setResolutions({})
    setActiveConflict(0)
  }

  // Mode switch and the drilldown back row share the level's first row, so the
  // view never grows a second toolbar band.
  const modeRow = (
    <>
      {toolbarLeading}
      {adhoc ? (
        <span className="text-2xs text-content-muted">{t('files.code.drilldown')}</span>
      ) : (
        <>
          <SegmentedControl
            label={t('files.code.modeLabel')}
            options={MODE_OPTIONS.map((option) => ({
              value: option.value,
              label: t(option.key)
            }))}
            value={selectedMode}
            onChange={switchMode}
          />
          <span className="shrink-0 text-2xs text-content-muted">
            {selectedMode === 'diff' ? t('files.code.modeHint.diff') : t('files.code.modeHint.merge')}
          </span>
          <span aria-hidden className="h-3 w-px shrink-0 bg-line-subtle" />
        </>
      )}
    </>
  )

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {effectiveMode === 'diff' && diffPair ? (
        <CodeDiffView
          pair={diffPair}
          buffer={buffer}
          probes={probes}
          switches={switches}
          onSwitchesChange={changeSwitches}
          readSide={readSide}
          onPairChange={onPairChange}
          platform={platform}
          toolbarLeading={modeRow}
          onDirtyChange={onDirtyChange}
          onBufferChange={onBufferChange}
          onOpenSide={onOpenSide}
        />
      ) : mergeSides && model ? (
        <CodeMergeView
          sides={mergeSides}
          model={model}
          resolutions={resolutions}
          onResolve={(id, accept) => setResolutions((current) => ({ ...current, [id]: accept }))}
          activeConflict={activeConflict}
          onSelectConflict={setActiveConflict}
          platform={platform}
          toolbarLeading={modeRow}
          onOpenSide={replaceMergeSide}
        />
      ) : null}
    </div>
  )
}
