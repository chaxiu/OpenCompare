import { useMemo } from 'react'
import type { JSX } from 'react'
import { FolderSearch, LoaderCircle, Sparkles } from 'lucide-react'
import type { SampleComposition } from '@shared/fixtures'
import type { DirectoryComparison, DirectoryDiffNode } from '@core/directory/compare'
import {
  DIRECTORY_FILTERS,
  filterDirectoryTree,
  projectDirectoryTree
} from '@core/directory/filter'
import type { DirectoryFilter } from '@core/directory/filter'
import { ToolbarButton } from '@renderer/components/Button'
import { Panel } from '@renderer/components/Panel'
import { SegmentedControl } from '@renderer/components/SegmentedControl'
import { SplitPane } from '@renderer/components/SplitPane'
import { CompositionLegend } from '@renderer/components/StatusBar'
import { TreeView } from '@renderer/components/TreeView'

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

export interface DirectoryViewProps {
  readonly comparison: DirectoryComparison
  /** Active status filter; owned by the shell so the status bar can follow it. */
  readonly filter: DirectoryFilter
  readonly onFilterChange: (filter: DirectoryFilter) => void
  /** Diff counts of the currently visible entries. */
  readonly visibleCounts: SampleComposition
  /** False on the web runtime, which has no native directory picker. */
  readonly pickerAvailable: boolean
  readonly busy: boolean
  readonly notice?: string | null
  readonly onPick: (side: 'left' | 'right') => void
  readonly onLoadSample: () => void
  readonly onOpenFile: (node: DirectoryDiffNode) => void
}

/**
 * The runtime directory comparison: two trees projected from the engine result,
 * a one-click status filter, and double-click drilldown for files.
 */
export function DirectoryView({
  comparison,
  filter,
  onFilterChange,
  visibleCounts,
  pickerAvailable,
  busy,
  notice,
  onPick,
  onLoadSample,
  onOpenFile
}: DirectoryViewProps): JSX.Element {
  const filtered = useMemo(
    () => filterDirectoryTree(comparison.root, filter),
    [comparison, filter]
  )
  const leftTree = useMemo(
    () => (filtered ? projectDirectoryTree(filtered, 'left') : null),
    [filtered]
  )
  const rightTree = useMemo(
    () => (filtered ? projectDirectoryTree(filtered, 'right') : null),
    [filtered]
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
            title="把内置样本目录加载为左右两侧"
          >
            加载样本目录
          </ToolbarButton>
          {busy ? (
            <LoaderCircle aria-hidden className="size-3.5 animate-spin text-content-muted" />
          ) : null}
        </span>
      </div>

      {pickerAvailable ? null : (
        <p className="shrink-0 text-2xs text-content-muted">
          Web 预览模式没有原生目录选择，请使用「加载样本目录」体验真实对比；桌面端（pnpm dev）可直接选择本地目录。
        </p>
      )}
      {notice ? (
        <p role="alert" className="shrink-0 text-2xs text-danger">
          {notice}
        </p>
      ) : null}

      <SplitPane
        panes={[
          <Panel
            key="left"
            title={comparison.leftName}
            subtitle={comparison.leftRoot}
            meta={<span className="text-2xs text-content-muted">源目录</span>}
          >
            {leftTree ? (
              <TreeView root={leftTree} onOpenFile={onOpenFile} />
            ) : (
              <p className="p-3 text-2xs text-content-muted">当前过滤下左目录没有条目。</p>
            )}
          </Panel>,
          <Panel
            key="right"
            title={comparison.rightName}
            subtitle={comparison.rightRoot}
            meta={<span className="text-2xs text-content-muted">目标目录</span>}
          >
            {rightTree ? (
              <TreeView root={rightTree} onOpenFile={onOpenFile} />
            ) : (
              <p className="p-3 text-2xs text-content-muted">当前过滤下右目录没有条目。</p>
            )}
          </Panel>
        ]}
      />

      <p className="shrink-0 text-2xs text-content-muted">
        双击文件可下钻到对应文件对比视图（代码 / 文本 · CSV / TSV · JSON / YAML）；左独有文件右侧为空、右独有文件左侧为空。
      </p>
    </div>
  )
}
