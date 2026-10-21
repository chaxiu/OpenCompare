import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import {
  Cloud,
  Download,
  FolderSearch,
  LoaderCircle,
  Shuffle,
  Sparkles,
  SplitSquareHorizontal,
  Upload
} from 'lucide-react'
import type { SampleComposition } from '@shared/fixtures'
import type { DirectoryComparison, DirectoryDiffNode } from '@core/directory/compare'
import { DIRECTORY_FILTERS } from '@core/directory/filter'
import type { DirectoryFilter } from '@core/directory/filter'
import { buildDirectoryRowModel } from '@core/directory/rows'
import type { SyncDirection, SyncMode } from '@core/directory/sync'
import { ToolbarButton } from '@renderer/components/Button'
import { Panel } from '@renderer/components/Panel'
import { SegmentedControl } from '@renderer/components/SegmentedControl'
import { SplitPane } from '@renderer/components/SplitPane'
import { CompositionLegend } from '@renderer/components/StatusBar'
import { TreeView } from '@renderer/components/TreeView'
import type { SyncPreview, TemplatePreview } from '@renderer/workbench/directoryOps'
import type { SidePosition } from '@renderer/workbench/snapshotOps'
import { DirectorySyncDialog } from './DirectorySyncDialog'
import { TemplateDialog } from './TemplateDialog'

const FILTER_LABELS: Record<DirectoryFilter, string> = {
  all: '全部',
  differences: '仅差异',
  'left-only': '左独有',
  'right-only': '右独有',
  same: '相同'
}

const FILTER_OPTIONS = DIRECTORY_FILTERS.map((value) => ({
  value,
  label: FILTER_LABELS[value]
}))

const DIRECTION_OPTIONS: readonly { value: SyncDirection; label: string }[] = [
  { value: 'left-to-right', label: '左 → 右' },
  { value: 'right-to-left', label: '右 → 左' }
]

const MODE_OPTIONS: readonly { value: SyncMode; label: string }[] = [
  { value: 'incremental', label: '增量' },
  { value: 'mirror', label: '镜像' }
]

export interface DirectoryViewProps {
  /** Session this view renders; keys the controlled tree state of the shell. */
  readonly sessionId: string
  readonly comparison: DirectoryComparison
  /** Active status filter; owned by the shell so the status bar can follow it. */
  readonly filter: DirectoryFilter
  readonly onFilterChange: (filter: DirectoryFilter) => void
  /** Relative paths of collapsed directories; the rest render expanded. */
  readonly collapsedPaths: readonly string[]
  readonly onTogglePath: (path: string) => void
  /** Relative path of the selected row across both panes; `null` for none. */
  readonly selectedPath: string | null
  readonly onSelectPath: (path: string) => void
  /** Scroll offsets to restore, owned by the shell and keyed by session. */
  readonly scrollTops: { readonly left: number; readonly right: number }
  readonly onScrollTopChange: (side: SidePosition, scrollTop: number) => void
  /** Diff counts of the currently visible entries. */
  readonly visibleCounts: SampleComposition
  /** False on the web runtime, which has no native directory picker. */
  readonly pickerAvailable: boolean
  readonly busy: boolean
  readonly onPick: (side: 'left' | 'right') => void
  readonly onLoadSample: () => void
  readonly onOpenFile: (node: DirectoryDiffNode) => void
  /** True when that side is a mounted snapshot rather than a real directory. */
  readonly leftIsSnapshot: boolean
  readonly rightIsSnapshot: boolean
  readonly onExportSnapshot: (side: SidePosition) => void
  readonly onImportSnapshot: (side: SidePosition, file: File) => void
  readonly onLoadRemoteSnapshotSample: () => void
  readonly onPreviewSync: (direction: SyncDirection, mode: SyncMode) => void
  readonly onPreviewTemplate: () => void
  readonly syncPreview: SyncPreview | null
  readonly templatePreview: TemplatePreview | null
  readonly onCancelSync: () => void
  readonly onConfirmSync: (deletePaths: readonly string[]) => void
  readonly onCancelTemplate: () => void
  readonly onConfirmTemplate: () => void
}

/**
 * The runtime directory comparison: two trees projected from the engine result,
 * a one-click status filter, and double-click drilldown for files. The toolbar
 * also hosts the one-way sync and the template placement extracts.
 */
export function DirectoryView({
  sessionId,
  comparison,
  filter,
  onFilterChange,
  collapsedPaths,
  onTogglePath,
  selectedPath,
  onSelectPath,
  scrollTops,
  onScrollTopChange,
  visibleCounts,
  pickerAvailable,
  busy,
  onPick,
  onLoadSample,
  onOpenFile,
  leftIsSnapshot,
  rightIsSnapshot,
  onExportSnapshot,
  onImportSnapshot,
  onLoadRemoteSnapshotSample,
  onPreviewSync,
  onPreviewTemplate,
  syncPreview,
  templatePreview,
  onCancelSync,
  onConfirmSync,
  onCancelTemplate,
  onConfirmTemplate
}: DirectoryViewProps): JSX.Element {
  const [direction, setDirection] = useState<SyncDirection>('left-to-right')
  const [mode, setMode] = useState<SyncMode>('incremental')
  const leftInputRef = useRef<HTMLInputElement>(null)
  const rightInputRef = useRef<HTMLInputElement>(null)
  const leftBodyRef = useRef<HTMLDivElement>(null)
  const rightBodyRef = useRef<HTMLDivElement>(null)
  /**
   * Panel bodies are handed to the virtualised trees as elements, not refs:
   * on the first commit a ref is attached only after this view's layout
   * effects, so the initial mount would otherwise see no scroll container.
   */
  const [leftBody, setLeftBody] = useState<HTMLDivElement | null>(null)
  const [rightBody, setRightBody] = useState<HTMLDivElement | null>(null)
  const attachLeftBody = useCallback((element: HTMLDivElement | null) => {
    leftBodyRef.current = element
    setLeftBody(element)
  }, [])
  const attachRightBody = useCallback((element: HTMLDivElement | null) => {
    rightBodyRef.current = element
    setRightBody(element)
  }, [])

  // The panel scroll containers are rebuilt whenever this view remounts (e.g.
  // returning from a drilldown), so the shell's saved offsets are re-applied.
  useLayoutEffect(() => {
    if (leftBodyRef.current) leftBodyRef.current.scrollTop = scrollTops.left
    if (rightBodyRef.current) rightBodyRef.current.scrollTop = scrollTops.right
  }, [leftBody, rightBody, sessionId, scrollTops])

  function selectedFile(side: SidePosition, files: FileList | null): void {
    const file = files?.[0]
    if (file) onImportSnapshot(side, file)
  }
  const leftRows = useMemo(
    () => buildDirectoryRowModel(comparison.root, filter, 'left', collapsedPaths),
    [comparison, filter, collapsedPaths]
  )
  const rightRows = useMemo(
    () => buildDirectoryRowModel(comparison.root, filter, 'right', collapsedPaths),
    [comparison, filter, collapsedPaths]
  )

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-2">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <SegmentedControl
          label="差异过滤"
          options={FILTER_OPTIONS}
          value={filter}
          onChange={onFilterChange}
        />
        <CompositionLegend composition={visibleCounts} />
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <ToolbarButton
            size="sm"
            icon={<FolderSearch aria-hidden className="size-3.5" />}
            onClick={() => onPick('left')}
            disabled={busy || !pickerAvailable}
            title={pickerAvailable ? '选择真实本地目录作为左（源）目录' : undefined}
          >
            选择左目录
          </ToolbarButton>
          <ToolbarButton
            size="sm"
            icon={<FolderSearch aria-hidden className="size-3.5" />}
            onClick={() => onPick('right')}
            disabled={busy || !pickerAvailable}
            title={pickerAvailable ? '选择真实本地目录作为右（目标）目录' : undefined}
          >
            选择右目录
          </ToolbarButton>
          <ToolbarButton
            size="sm"
            icon={<Sparkles aria-hidden className="size-3.5" />}
            onClick={onLoadSample}
            disabled={busy}
            title="演示用途：把内置样本目录加载为左右两侧"
          >
            加载演示目录
          </ToolbarButton>
          {busy ? (
            <LoaderCircle aria-hidden className="size-3.5 animate-spin text-content-muted" />
          ) : null}
        </span>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <SegmentedControl
          label="同步方向"
          options={DIRECTION_OPTIONS}
          value={direction}
          onChange={setDirection}
        />
        <SegmentedControl
          label="同步模式"
          options={MODE_OPTIONS}
          value={mode}
          onChange={setMode}
        />
        <ToolbarButton
          size="sm"
          icon={<SplitSquareHorizontal aria-hidden className="size-3.5" />}
          onClick={() => onPreviewSync(direction, mode)}
          disabled={busy}
          title="生成变更清单后弹出 Dry-run 预览，确认才写入"
        >
          预览并同步
        </ToolbarButton>
        <ToolbarButton
          size="sm"
          icon={<Shuffle aria-hidden className="size-3.5" />}
          onClick={onPreviewTemplate}
          disabled={busy}
          title="以左（源）目录为结构模板，从内置散乱目录树 /samples/directory/incoming 归位文件"
        >
          模板归位
        </ToolbarButton>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <ToolbarButton
          size="sm"
          icon={<Download aria-hidden className="size-3.5" />}
          onClick={() => onExportSnapshot('left')}
          disabled={busy}
          title="把左侧目录扫描为快照并经系统保存对话框导出为 <name>.ocsnap.json（已挂载快照则原样重导出）"
        >
          导出左侧快照
        </ToolbarButton>
        <ToolbarButton
          size="sm"
          icon={<Upload aria-hidden className="size-3.5" />}
          onClick={() => leftInputRef.current?.click()}
          disabled={busy}
          title="选择一个 .ocsnap.json 并挂载到左栏"
        >
          导入左侧快照
        </ToolbarButton>
        <ToolbarButton
          size="sm"
          icon={<Download aria-hidden className="size-3.5" />}
          onClick={() => onExportSnapshot('right')}
          disabled={busy}
          title="把右侧目录扫描为快照并经系统保存对话框导出为 <name>.ocsnap.json（已挂载快照则原样重导出）"
        >
          导出右侧快照
        </ToolbarButton>
        <ToolbarButton
          size="sm"
          icon={<Upload aria-hidden className="size-3.5" />}
          onClick={() => rightInputRef.current?.click()}
          disabled={busy}
          title="选择一个 .ocsnap.json 并挂载到右栏"
        >
          导入右侧快照
        </ToolbarButton>
        <ToolbarButton
          size="sm"
          icon={<Cloud aria-hidden className="size-3.5" />}
          onClick={onLoadRemoteSnapshotSample}
          disabled={busy}
          title="演示用途：内置本地样本目录（左）vs 内置远端快照 remote-prod（右）"
        >
          演示：远端快照
        </ToolbarButton>
        <input
          ref={leftInputRef}
          type="file"
          accept=".json,.ocsnap.json,application/json"
          aria-label="选择左侧快照文件"
          className="sr-only"
          onChange={(event) => {
            selectedFile('left', event.target.files)
            event.target.value = ''
          }}
        />
        <input
          ref={rightInputRef}
          type="file"
          accept=".json,.ocsnap.json,application/json"
          aria-label="选择右侧快照文件"
          className="sr-only"
          onChange={(event) => {
            selectedFile('right', event.target.files)
            event.target.value = ''
          }}
        />
      </div>

      {pickerAvailable ? null : (
        <p className="shrink-0 text-2xs text-content-muted">
          Web 预览模式没有原生目录选择，可用「加载演示目录」查看目录对比；桌面端（pnpm dev）可直接选择本地目录。
        </p>
      )}

      <SplitPane
        panes={[
          <Panel
            key="left"
            title={comparison.leftName}
            subtitle={comparison.leftRoot}
            meta={<span className="text-2xs text-content-muted">{leftIsSnapshot ? '快照' : '源目录'}</span>}
            bodyRef={attachLeftBody}
            onBodyScroll={(scrollTop) => onScrollTopChange('left', scrollTop)}
          >
            {leftRows.length > 0 ? (
              <TreeView
                label={comparison.leftName}
                rows={leftRows}
                scrollElement={leftBody}
                initialScrollTop={scrollTops.left}
                selectedPath={selectedPath}
                onTogglePath={onTogglePath}
                onSelectPath={onSelectPath}
                onOpenFile={onOpenFile}
              />
            ) : (
              <p className="p-3 text-2xs text-content-muted">当前过滤下左目录没有条目。</p>
            )}
          </Panel>,
          <Panel
            key="right"
            title={comparison.rightName}
            subtitle={comparison.rightRoot}
            meta={<span className="text-2xs text-content-muted">{rightIsSnapshot ? '快照' : '目标目录'}</span>}
            bodyRef={attachRightBody}
            onBodyScroll={(scrollTop) => onScrollTopChange('right', scrollTop)}
          >
            {rightRows.length > 0 ? (
              <TreeView
                label={comparison.rightName}
                rows={rightRows}
                scrollElement={rightBody}
                initialScrollTop={scrollTops.right}
                selectedPath={selectedPath}
                onTogglePath={onTogglePath}
                onSelectPath={onSelectPath}
                onOpenFile={onOpenFile}
              />
            ) : (
              <p className="p-3 text-2xs text-content-muted">当前过滤下右目录没有条目。</p>
            )}
          </Panel>
        ]}
      />

      {comparison.skipped > 0 ? (
        <p className="shrink-0 text-2xs text-diff-added">
          已跳过 {comparison.skipped} 个不可读项/悬空链接
        </p>
      ) : null}

      <p className="shrink-0 text-2xs text-content-muted">
        双击文件可下钻到对应文件对比视图（代码 / 文本 · CSV / TSV · JSON / YAML）；左独有文件右侧为空、右独有文件左侧为空。
      </p>

      {syncPreview ? (
        <DirectorySyncDialog
          preview={syncPreview}
          busy={busy}
          onCancel={onCancelSync}
          onConfirm={onConfirmSync}
        />
      ) : null}
      {templatePreview ? (
        <TemplateDialog
          preview={templatePreview}
          busy={busy}
          onCancel={onCancelTemplate}
          onConfirm={onConfirmTemplate}
        />
      ) : null}
    </div>
  )
}
