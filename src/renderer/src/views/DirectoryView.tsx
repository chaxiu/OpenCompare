import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import {
  Cloud,
  Download,
  FileDown,
  FolderSearch,
  LoaderCircle,
  Shuffle,
  Sparkles,
  SplitSquareHorizontal,
  Upload
} from 'lucide-react'
import type { SampleComposition } from '@shared/fixtures'
import { trackLive } from '@shared/perf/liveness'
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
import { useI18n } from '@renderer/i18n/context'
import type { SyncPreview, TemplatePreview } from '@renderer/workbench/directoryOps'
import type { SidePosition } from '@renderer/workbench/snapshotOps'
import { DirectorySyncDialog } from './DirectorySyncDialog'
import { FILTER_LABEL_KEYS, SYNC_DIRECTION_KEYS, SYNC_MODE_KEYS } from './directoryCopy'
import { TemplateDialog } from './TemplateDialog'

const DIRECTION_VALUES: readonly SyncDirection[] = ['left-to-right', 'right-to-left']
const MODE_VALUES: readonly SyncMode[] = ['incremental', 'mirror']

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
  /** Privacy switch of the HTML report; the shell owns it, so it survives remounts. */
  readonly hideLocalPaths: boolean
  readonly onHideLocalPathsChange: (hideLocalPaths: boolean) => void
  /** Asks the shell to build and save the HTML report; this view never renders it. */
  readonly onExportReport: () => void
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
  hideLocalPaths,
  onHideLocalPathsChange,
  onExportReport,
  onPreviewSync,
  onPreviewTemplate,
  syncPreview,
  templatePreview,
  onCancelSync,
  onConfirmSync,
  onCancelTemplate,
  onConfirmTemplate
}: DirectoryViewProps): JSX.Element {
  const { t } = useI18n()
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

  const filterOptions = DIRECTORY_FILTERS.map((value) => ({
    value,
    label: t(FILTER_LABEL_KEYS[value])
  }))
  const directionOptions = DIRECTION_VALUES.map((value) => ({
    value,
    label: t(SYNC_DIRECTION_KEYS[value])
  }))
  const modeOptions = MODE_VALUES.map((value) => ({
    value,
    label: t(SYNC_MODE_KEYS[value])
  }))

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
  const leftRows = useMemo(() => {
    const model = buildDirectoryRowModel(comparison.root, filter, 'left', collapsedPaths)
    // Measurement-only registration; inert outside a harness run.
    trackLive('rowModel', model)
    return model
  }, [comparison, filter, collapsedPaths])
  const rightRows = useMemo(() => {
    const model = buildDirectoryRowModel(comparison.root, filter, 'right', collapsedPaths)
    trackLive('rowModel', model)
    return model
  }, [comparison, filter, collapsedPaths])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-2">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <SegmentedControl
          label={t('directory.filter.group')}
          options={filterOptions}
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
            title={pickerAvailable ? t('directory.toolbar.pickLeftTitle') : undefined}
          >
            {t('directory.toolbar.pickLeft')}
          </ToolbarButton>
          <ToolbarButton
            size="sm"
            icon={<FolderSearch aria-hidden className="size-3.5" />}
            onClick={() => onPick('right')}
            disabled={busy || !pickerAvailable}
            title={pickerAvailable ? t('directory.toolbar.pickRightTitle') : undefined}
          >
            {t('directory.toolbar.pickRight')}
          </ToolbarButton>
          <ToolbarButton
            size="sm"
            icon={<Sparkles aria-hidden className="size-3.5" />}
            onClick={onLoadSample}
            disabled={busy}
            title={t('directory.toolbar.loadSampleTitle')}
          >
            {t('directory.toolbar.loadSample')}
          </ToolbarButton>
          {busy ? (
            <LoaderCircle aria-hidden className="size-3.5 animate-spin text-content-muted" />
          ) : null}
        </span>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <SegmentedControl
          label={t('directory.sync.direction')}
          options={directionOptions}
          value={direction}
          onChange={setDirection}
        />
        <SegmentedControl
          label={t('directory.sync.mode')}
          options={modeOptions}
          value={mode}
          onChange={setMode}
        />
        <ToolbarButton
          size="sm"
          icon={<SplitSquareHorizontal aria-hidden className="size-3.5" />}
          onClick={() => onPreviewSync(direction, mode)}
          disabled={busy}
          title={t('directory.toolbar.previewSyncTitle')}
        >
          {t('directory.toolbar.previewSync')}
        </ToolbarButton>
        <ToolbarButton
          size="sm"
          icon={<Shuffle aria-hidden className="size-3.5" />}
          onClick={onPreviewTemplate}
          disabled={busy}
          title={t('directory.toolbar.templateTitle')}
        >
          {t('directory.toolbar.template')}
        </ToolbarButton>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <ToolbarButton
          size="sm"
          icon={<Download aria-hidden className="size-3.5" />}
          onClick={() => onExportSnapshot('left')}
          disabled={busy}
          title={t('directory.toolbar.exportLeftTitle')}
        >
          {t('directory.toolbar.exportLeft')}
        </ToolbarButton>
        <ToolbarButton
          size="sm"
          icon={<Upload aria-hidden className="size-3.5" />}
          onClick={() => leftInputRef.current?.click()}
          disabled={busy}
          title={t('directory.toolbar.importLeftTitle')}
        >
          {t('directory.toolbar.importLeft')}
        </ToolbarButton>
        <ToolbarButton
          size="sm"
          icon={<Download aria-hidden className="size-3.5" />}
          onClick={() => onExportSnapshot('right')}
          disabled={busy}
          title={t('directory.toolbar.exportRightTitle')}
        >
          {t('directory.toolbar.exportRight')}
        </ToolbarButton>
        <ToolbarButton
          size="sm"
          icon={<Upload aria-hidden className="size-3.5" />}
          onClick={() => rightInputRef.current?.click()}
          disabled={busy}
          title={t('directory.toolbar.importRightTitle')}
        >
          {t('directory.toolbar.importRight')}
        </ToolbarButton>
        <ToolbarButton
          size="sm"
          icon={<Cloud aria-hidden className="size-3.5" />}
          onClick={onLoadRemoteSnapshotSample}
          disabled={busy}
          title={t('directory.toolbar.demoRemoteTitle')}
        >
          {t('directory.toolbar.demoRemote')}
        </ToolbarButton>
        <ToolbarButton
          size="sm"
          icon={<FileDown aria-hidden className="size-3.5" />}
          onClick={onExportReport}
          disabled={busy}
          title={t('directory.report.toolbar.exportTitle')}
        >
          {t('directory.report.toolbar.export')}
        </ToolbarButton>
        <label
          className="flex shrink-0 items-center gap-1.5 text-2xs text-content-secondary"
          title={t('directory.report.toolbar.hideLocalPathsTitle')}
        >
          <input
            type="checkbox"
            checked={hideLocalPaths}
            onChange={(event) => onHideLocalPathsChange(event.target.checked)}
            className="size-3.5 shrink-0 accent-accent"
          />
          {t('directory.report.toolbar.hideLocalPaths')}
        </label>
        <input
          ref={leftInputRef}
          type="file"
          accept=".json,.ocsnap.json,application/json"
          aria-label={t('directory.snapshot.pickLeftFile')}
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
          aria-label={t('directory.snapshot.pickRightFile')}
          className="sr-only"
          onChange={(event) => {
            selectedFile('right', event.target.files)
            event.target.value = ''
          }}
        />
      </div>

      {pickerAvailable ? null : (
        <p className="shrink-0 text-2xs text-content-muted">{t('directory.picker.unavailable')}</p>
      )}

      <SplitPane
        panes={[
          <Panel
            key="left"
            title={comparison.leftName}
            subtitle={comparison.leftRoot}
            meta={
              <span className="text-2xs text-content-muted">
                {t(leftIsSnapshot ? 'directory.panel.snapshot' : 'directory.panel.source')}
              </span>
            }
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
              <p className="p-3 text-2xs text-content-muted">{t('directory.empty.left')}</p>
            )}
          </Panel>,
          <Panel
            key="right"
            title={comparison.rightName}
            subtitle={comparison.rightRoot}
            meta={
              <span className="text-2xs text-content-muted">
                {t(rightIsSnapshot ? 'directory.panel.snapshot' : 'directory.panel.target')}
              </span>
            }
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
              <p className="p-3 text-2xs text-content-muted">{t('directory.empty.right')}</p>
            )}
          </Panel>
        ]}
      />

      {comparison.leftSkipped + comparison.rightSkipped > 0 ? (
        <p className="shrink-0 text-2xs text-diff-added">
          {t('directory.skipped', {
            left: comparison.leftSkipped,
            right: comparison.rightSkipped
          })}
        </p>
      ) : null}

      <p className="shrink-0 text-2xs text-content-muted">{t('directory.drilldownHint')}</p>

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
