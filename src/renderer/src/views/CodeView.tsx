import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  Download,
  FolderOpen,
  RotateCcw,
  Save
} from 'lucide-react'
import { diffLineTexts, overwriteBlock } from '@core/text/diff'
import type { OverwriteDirection } from '@core/text/diff'
import { splitLines } from '@core/text/lines'
import {
  buildMergeModel,
  countUnresolved,
  renderMerge,
  renderMergeText
} from '@core/text/merge'
import type { MergeAccept, MergeModel, MergeRange, MergeResolutions } from '@core/text/merge'
import type { CodeSceneFixture, TextSample } from '@shared/fixtures'
import type { PlatformPort } from '@shared/platform/types'
import { IconButton, ToolbarButton } from '@renderer/components/Button'
import { DiffBadge, DiffDot } from '@renderer/components/DiffBadge'
import { DIFF_ROW_HEIGHT, DiffPane } from '@renderer/components/DiffPane'
import { MergePane } from '@renderer/components/MergePane'
import type { MergeLineView } from '@renderer/components/MergePane'
import { Panel } from '@renderer/components/Panel'
import { SegmentedControl } from '@renderer/components/SegmentedControl'
import { SplitPane } from '@renderer/components/SplitPane'
import { cx } from '@renderer/components/utils'
import { TEXT_FILE_FILTER, pickTextFile } from '@renderer/workbench/fileIO'
import type { PickedTextFile } from '@renderer/workbench/fileIO'
import type { CodeFileBuffer, FilePair } from '@renderer/workbench/session'

export type CodeMode = 'diff' | 'merge'

const MODE_OPTIONS = [
  { value: 'diff', label: '双栏 Diff' },
  { value: 'merge', label: '三向合并 base · ours · theirs' }
] as const

const ACCEPT_OPTIONS: readonly { readonly value: MergeAccept; readonly label: string }[] = [
  { value: 'ours', label: 'Accept Ours' },
  { value: 'theirs', label: 'Accept Theirs' },
  { value: 'both', label: 'Accept Both' },
  { value: 'base', label: 'Accept Base' }
]

const ACCEPT_LABELS: Record<MergeAccept, string> = {
  ours: 'ours',
  theirs: 'theirs',
  both: 'ours + theirs',
  base: 'base'
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

function CodeDiffView({
  pair,
  buffer,
  platform,
  onDirtyChange,
  onBufferChange
}: {
  readonly pair: FilePair
  /** Working copies kept on the session, used when the view remounts. */
  readonly buffer?: CodeFileBuffer
  readonly platform: PlatformPort
  /** Reports whether any side now differs from its loaded disk content. */
  readonly onDirtyChange?: (dirty: boolean) => void
  /** Reports the editable state up so a tab switch cannot drop unsaved work. */
  readonly onBufferChange?: (buffer: CodeFileBuffer) => void
}): JSX.Element {
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
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null)
  const [active, setActive] = useState(0)

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

  const diff = useMemo(() => diffLineTexts(leftText, rightText), [leftText, rightText])

  const blockCount = diff.blocks.length
  const activeIndex = blockCount === 0 ? -1 : Math.min(active, blockCount - 1)
  const activeBlock = activeIndex >= 0 ? diff.blocks[activeIndex] : null

  useEffect(() => {
    if (activeIndex < 0) return
    const top = diff.blocks[activeIndex].startRow * DIFF_ROW_HEIGHT
    for (const pane of [leftScroll.current, rightScroll.current]) {
      if (pane) pane.scrollTop = top
    }
  }, [activeIndex, diff])

  /** Mirrors the scrolled pane onto the other; identical row counts keep it exact. */
  function syncScroll(from: ScrollBox, to: ScrollBox): void {
    const source = from.current
    const target = to.current
    if (!source || !target) return
    if (target.scrollTop !== source.scrollTop) target.scrollTop = source.scrollTop
    if (target.scrollLeft !== source.scrollLeft) target.scrollLeft = source.scrollLeft
  }

  function step(delta: number): void {
    if (blockCount === 0) return
    setActive((current) => (Math.min(current, blockCount - 1) + delta + blockCount) % blockCount)
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
      setNotice({ text: `已写回 ${path}`, tone: 'ok' })
    } catch (cause) {
      setNotice({ text: cause instanceof Error ? cause.message : String(cause), tone: 'error' })
    }
  }

  /** Opens a local file on one side and re-runs the comparison over it. */
  async function open(side: 'left' | 'right'): Promise<void> {
    try {
      const picked = await pickTextFile(
        platform,
        side === 'left' ? '打开左侧本地文件' : '打开右侧本地文件',
        [TEXT_FILE_FILTER]
      )
      if (picked === null) return
      if (side === 'left') {
        setLeftPath(picked.path)
        setLeftSource(picked.text)
        setLeftText(picked.text)
      } else {
        setRightPath(picked.path)
        setRightSource(picked.text)
        setRightText(picked.text)
      }
      setActive(0)
      setNotice({ text: `已打开 ${picked.path}`, tone: 'ok' })
    } catch (cause) {
      setNotice({ text: cause instanceof Error ? cause.message : String(cause), tone: 'error' })
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <IconButton
          label="上一个差异块"
          icon={<ChevronUp aria-hidden className="size-3.5" />}
          onClick={() => step(-1)}
          disabled={blockCount === 0}
        />
        <IconButton
          label="下一个差异块"
          icon={<ChevronDown aria-hidden className="size-3.5" />}
          onClick={() => step(1)}
          disabled={blockCount === 0}
        />
        <span className="flex items-center gap-1.5 text-2xs text-content-muted">
          差异块
          <span className="tabular font-mono text-content-secondary">
            {activeIndex + 1}/{blockCount}
          </span>
          {activeBlock ? <DiffBadge status={activeBlock.status} /> : null}
        </span>
        <span aria-hidden className="h-3 w-px shrink-0 bg-line-subtle" />
        <ToolbarButton
          size="sm"
          icon={<ArrowRight aria-hidden className="size-3.5" />}
          onClick={() => overwrite('to-right')}
          disabled={activeBlock === null}
        >
          覆写到右
        </ToolbarButton>
        <ToolbarButton
          size="sm"
          icon={<ArrowLeft aria-hidden className="size-3.5" />}
          onClick={() => overwrite('to-left')}
          disabled={activeBlock === null}
        >
          覆写到左
        </ToolbarButton>
        <ToolbarButton
          size="sm"
          variant="ghost"
          icon={<RotateCcw aria-hidden className="size-3.5" />}
          onClick={reset}
        >
          重置
        </ToolbarButton>
        <span aria-hidden className="h-3 w-px shrink-0 bg-line-subtle" />
        <ToolbarButton
          size="sm"
          icon={<Save aria-hidden className="size-3.5" />}
          onClick={() => void save('left')}
          disabled={!leftDirty}
          title="直接把左侧修改原位写回其磁盘路径（不弹保存对话框）"
        >
          保存左文件
        </ToolbarButton>
        <ToolbarButton
          size="sm"
          icon={<Save aria-hidden className="size-3.5" />}
          onClick={() => void save('right')}
          disabled={!rightDirty}
          title="直接把右侧修改原位写回其磁盘路径（不弹保存对话框）"
        >
          保存右文件
        </ToolbarButton>
        {dirty ? (
          <span role="status" className="text-2xs text-diff-modified">
            未保存：{[leftDirty ? '左' : null, rightDirty ? '右' : null].filter(Boolean).join('、')}
          </span>
        ) : null}
        <span aria-hidden className="h-3 w-px shrink-0 bg-line-subtle" />
        <ToolbarButton
          size="sm"
          icon={<FolderOpen aria-hidden className="size-3.5" />}
          onClick={() => void open('left')}
        >
          打开左文件
        </ToolbarButton>
        <ToolbarButton
          size="sm"
          icon={<FolderOpen aria-hidden className="size-3.5" />}
          onClick={() => void open('right')}
        >
          打开右文件
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

      <SplitPane
        panes={[
          <Panel
            key="left"
            title={leftPath}
            subtitle="左"
            meta={
              leftDirty ? (
                <span className="text-2xs text-diff-modified">已修改（未保存）</span>
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
            subtitle="右"
            meta={
              rightDirty ? (
                <span className="text-2xs text-diff-modified">已修改（未保存）</span>
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

const MERGE_SIDE_LABELS: Record<MergeSideKey, string> = {
  base: 'base',
  ours: 'ours',
  theirs: 'theirs'
}

function CodeMergeView({
  sides,
  model,
  resolutions,
  onResolve,
  activeConflict,
  onSelectConflict,
  platform,
  onOpenSide
}: {
  readonly sides: MergeSides
  readonly model: MergeModel
  readonly resolutions: MergeResolutions
  readonly onResolve: (id: string, accept: MergeAccept) => void
  readonly activeConflict: number
  readonly onSelectConflict: (index: number) => void
  readonly platform: PlatformPort
  readonly onOpenSide: (which: MergeSideKey, picked: PickedTextFile) => void
}): JSX.Element {
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
        `打开 ${MERGE_SIDE_LABELS[which]} 本地文件`,
        [TEXT_FILE_FILTER]
      )
      if (picked === null) return
      onOpenSide(which, picked)
      flash(`已打开 ${picked.path}`)
    } catch (cause) {
      flash(cause instanceof Error ? cause.message : String(cause), 'error')
    }
  }

  /** Saves the fully resolved merge result through the platform. */
  async function saveText(): Promise<void> {
    try {
      const path = await platform.saveFile({
        title: '保存合并结果',
        defaultPath: 'merged.txt',
        filters: [TEXT_FILE_FILTER],
        content: renderMergeText(render)
      })
      if (path === null) return
      flash(`已保存到 ${path}`)
    } catch (cause) {
      flash(cause instanceof Error ? cause.message : String(cause), 'error')
    }
  }

  async function copyText(): Promise<void> {
    try {
      await navigator.clipboard.writeText(renderMergeText(render))
      flash('已复制到剪贴板')
    } catch {
      flash('复制失败，请手动选择预览文本', 'error')
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <IconButton
          label="上一个冲突块"
          icon={<ChevronUp aria-hidden className="size-3.5" />}
          onClick={() => step(-1)}
          disabled={conflictCount === 0}
        />
        <IconButton
          label="下一个冲突块"
          icon={<ChevronDown aria-hidden className="size-3.5" />}
          onClick={() => step(1)}
          disabled={conflictCount === 0}
        />
        <span className="flex items-center gap-1.5 text-2xs text-content-muted">
          待决冲突
          <span className="tabular font-mono text-content-secondary">
            {render.unresolved}/{conflictCount}
          </span>
        </span>
        <span aria-hidden className="h-3 w-px shrink-0 bg-line-subtle" />
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
            {option.label}
          </ToolbarButton>
        ))}
        <span aria-hidden className="h-3 w-px shrink-0 bg-line-subtle" />
        {(Object.keys(MERGE_SIDE_LABELS) as MergeSideKey[]).map((which) => (
          <ToolbarButton
            key={which}
            size="sm"
            icon={<FolderOpen aria-hidden className="size-3.5" />}
            onClick={() => void openSide(which)}
          >
            打开 {MERGE_SIDE_LABELS[which]}
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
            icon={<ClipboardCopy aria-hidden className="size-3.5" />}
            onClick={() => void copyText()}
            disabled={render.unresolved > 0}
          >
            复制
          </ToolbarButton>
          <ToolbarButton
            size="sm"
            variant="primary"
            icon={<Download aria-hidden className="size-3.5" />}
            onClick={() => void saveText()}
            disabled={render.unresolved > 0}
          >
            导出合并文本
          </ToolbarButton>
        </span>
      </div>

      <SplitPane
        panes={[
          <Panel key="base" title={sides.base.path} subtitle="base">
            <MergePane lines={baseLines.map((text) => ({ text }))} scrollRef={baseScroll} />
          </Panel>,
          <Panel key="ours" title={sides.ours.path} subtitle="ours">
            <MergePane
              lines={oursLines.map((text) => ({ text }))}
              activeRange={activeBlock?.oursRange}
              scrollRef={oursScroll}
            />
          </Panel>,
          <Panel key="theirs" title={sides.theirs.path} subtitle="theirs">
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
          title="合并结果预览"
          subtitle={render.unresolved === 0 ? '全部冲突已解决' : '未解决块以冲突标记保留'}
          meta={render.unresolved > 0 ? <DiffDot status="conflict" /> : null}
        >
          <div className="flex h-full min-h-0 divide-x divide-line-subtle">
            <div className="flex w-64 shrink-0 flex-col overflow-auto">
              {conflictCount === 0 ? (
                <p className="p-3 text-2xs text-content-muted">无冲突块。</p>
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
                          冲突 {index + 1}
                        </span>
                        <span
                          className={cx(
                            'ml-auto text-2xs',
                            accept ? 'text-diff-added' : 'text-content-muted'
                          )}
                        >
                          {accept ? `已采纳 ${ACCEPT_LABELS[accept]}` : '未解决'}
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
                            {option.label}
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
  pair,
  buffer,
  platform,
  onMergeStateChange,
  onDirtyChange,
  onBufferChange
}: {
  readonly fixture?: CodeSceneFixture
  /** Three-column merge is the default for a session declared with three panes. */
  readonly defaultMode?: CodeMode
  /** Ad-hoc left/right bodies coming from a directory-tree drilldown. */
  readonly pair?: FilePair
  /** Working copies kept on the session, used when the view remounts. */
  readonly buffer?: CodeFileBuffer
  readonly platform: PlatformPort
  readonly onMergeStateChange?: (state: CodeMergeState) => void
  /** Reports the diff pair's unsaved state up to the session model. */
  readonly onDirtyChange?: (dirty: boolean) => void
  /** Reports the diff pair's editable state up to the session model. */
  readonly onBufferChange?: (buffer: CodeFileBuffer) => void
}): JSX.Element {
  const [mode, setMode] = useState<CodeMode>(defaultMode)
  const adhoc = pair !== undefined
  const effectiveMode: CodeMode = adhoc ? 'diff' : mode
  const diffPair = pair ?? fixture?.diff

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

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-2">
      <div className="flex shrink-0 items-center gap-2">
        {adhoc ? (
          <span className="text-2xs text-content-muted">
            本地文件 · 双栏字符级 Diff
          </span>
        ) : (
          <>
            <SegmentedControl
              label="代码视图"
              options={MODE_OPTIONS}
              value={mode}
              onChange={setMode}
            />
            <span className="hidden text-2xs text-content-muted md:inline">
              {mode === 'diff'
                ? '行级 + 行内字符级 Diff · 同步滚动与逐块覆写'
                : '按行切分 diff3 · 逐块点选采纳并保存结果'}
            </span>
          </>
        )}
      </div>

      {effectiveMode === 'diff' && diffPair ? (
        <CodeDiffView
          pair={diffPair}
          buffer={buffer}
          platform={platform}
          onDirtyChange={onDirtyChange}
          onBufferChange={onBufferChange}
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
          onOpenSide={replaceMergeSide}
        />
      ) : null}
    </div>
  )
}
