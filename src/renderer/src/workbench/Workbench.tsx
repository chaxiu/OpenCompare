import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent, JSX } from 'react'
import {
  AlertTriangle,
  Braces,
  FileCode2,
  FolderOpen,
  FolderTree,
  GitCompare,
  Layers,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  Table2
} from 'lucide-react'
import { CODE_SCENE, CSV_SCENE, DIRECTORY_SAMPLE_PATHS, STRUCTURED_SCENE } from '@shared/fixtures'
import type { SampleComposition, SceneId } from '@shared/fixtures'
import type { PlatformPort } from '@shared/platform/types'
import { createComparisonCache } from '@core/directory/compare'
import type { DirectoryDiffNode } from '@core/directory/compare'
import { countTreeFiles, filterDirectoryTree } from '@core/directory/filter'
import type { DirectoryFilter } from '@core/directory/filter'
import type { SyncDirection, SyncMode } from '@core/directory/sync'
import { ToolbarButton } from '@renderer/components/Button'
import { DropdownMenu } from '@renderer/components/DropdownMenu'
import type { DropdownItem } from '@renderer/components/DropdownMenu'
import { SegmentedControl } from '@renderer/components/SegmentedControl'
import { SessionTabs } from '@renderer/components/SessionTabs'
import { StateView } from '@renderer/components/StateView'
import { CompositionLegend, StatusBar, StatusEntry } from '@renderer/components/StatusBar'
import { cx } from '@renderer/components/utils'
import { CodeView } from '@renderer/views/CodeView'
import type { CodeMergeState } from '@renderer/views/CodeView'
import { CsvView } from '@renderer/views/CsvView'
import type { CsvAlignState } from '@renderer/views/CsvView'
import { DirectoryView } from '@renderer/views/DirectoryView'
import { StructuredView } from '@renderer/views/StructuredView'
import {
  createDirectorySession,
  createDrilldownSession,
  openFilePairSession
} from './directoryCompare'
import {
  applySyncPreview,
  applyTemplateExtract,
  previewSync,
  previewTemplate
} from './directoryOps'
import type { SyncPreview, TemplatePreview } from './directoryOps'
import { classifyFile } from './fileKinds'
import { loadSampleSessions } from './loadSampleSessions'
import {
  compareSides,
  describeSnapshotContentError,
  describeSnapshotImportError,
  directorySides,
  exportSideSnapshot,
  parseSnapshotText,
  readFileText,
  readSideFile,
  remoteSnapshotSides,
  snapshotFileName,
  SNAPSHOT_FILE_FILTER,
  snapshotSide,
  withSide
} from './snapshotOps'
import type { ComparisonSides, SidePosition } from './snapshotOps'
import type { WorkbenchSession } from './session'

type WorkbenchStatus = 'empty' | 'loading' | 'ready' | 'error'

/** A single dropped path waiting for its counterpart. */
interface PendingLeft {
  readonly path: string
  readonly kind: 'file' | 'directory'
}

const VIEW_OPTIONS: readonly { value: SceneId; label: string; icon: JSX.Element }[] = [
  { value: 'directory', label: '目录对比', icon: <FolderTree aria-hidden className="size-3.5" /> },
  {
    value: 'code',
    label: '代码 Diff & 3-Way',
    icon: <FileCode2 aria-hidden className="size-3.5" />
  },
  { value: 'csv', label: 'CSV 主键对比', icon: <Table2 aria-hidden className="size-3.5" /> },
  { value: 'structured', label: 'JSON / YAML', icon: <Braces aria-hidden className="size-3.5" /> }
]

const MENU_SCENES: Record<string, SceneId> = {
  'load-directory': 'directory',
  'load-code': 'code',
  'load-csv': 'csv',
  'load-structured': 'structured'
}

/**
 * The auxiliary sample library, explicitly marked as a demo: the workbench's
 * primary entry is opening real files / folders or dropping real paths.
 */
const SAMPLE_MENU: readonly DropdownItem[] = [
  {
    id: 'load-all',
    label: '加载全部演示样本',
    description: '一次打开四个演示场景会话',
    icon: <Sparkles aria-hidden className="size-3.5" />
  },
  {
    id: 'load-directory',
    label: '目录对比',
    description: '演示：双目录差异 + 状态过滤'
  },
  { id: 'load-code', label: '代码 Diff & 3-Way Merge', description: '演示：双栏 Diff + 多冲突块' },
  { id: 'load-csv', label: 'CSV 主键对比', description: '演示：1,240 行乱序主键对账' },
  { id: 'load-structured', label: 'JSON / YAML 语义对比', description: '演示：键序打乱 + 深层变更' },
  {
    id: 'simulate-failure',
    label: '演示：样本读取失败',
    description: '基线自检用：查看错误态与重试',
    danger: true
  }
]

/** File handles of a drag, tolerating the synthetic transfer a test dispatches. */
function droppedFiles(transfer: DataTransfer | null): readonly File[] {
  return transfer === null ? [] : Array.from(transfer.files)
}

function isFileDrag(transfer: DataTransfer | null): boolean {
  return transfer !== null && Array.from(transfer.types).includes('Files')
}

/**
 * Tells a dropped directory from a dropped file. Listing is the one probe both
 * platform implementations answer truthfully, so nothing is guessed from the
 * path shape.
 */
async function isDirectoryPath(platform: PlatformPort, path: string): Promise<boolean> {
  try {
    await platform.listDirectory(path)
    return true
  } catch {
    return false
  }
}

/** Multi-session workbench shell: toolbar, split work area and status bar. */
export function Workbench({ platform }: { readonly platform: PlatformPort }): JSX.Element {
  const [status, setStatus] = useState<WorkbenchStatus>('empty')
  const [sessions, setSessions] = useState<readonly WorkbenchSession[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [codeMerge, setCodeMerge] = useState<CodeMergeState | null>(null)
  const [csvAlign, setCsvAlign] = useState<CsvAlignState | null>(null)
  const [directoryBusy, setDirectoryBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [noticeTone, setNoticeTone] = useState<'danger' | 'info'>('danger')
  const [directoryFilter, setDirectoryFilter] = useState<DirectoryFilter>('all')
  const [pendingLeft, setPendingLeft] = useState<PendingLeft | null>(null)
  const [syncPreview, setSyncPreview] = useState<SyncPreview | null>(null)
  const [templatePreview, setTemplatePreview] = useState<TemplatePreview | null>(null)
  const cache = useRef(createComparisonCache())
  const opSequence = useRef(0)

  // A dropped path must never replace the window with the dropped file: Electron
  // navigates on drop unless the default is prevented, on the window itself.
  // Only file drags are blocked, so dragging text into an input still works.
  useEffect(() => {
    function preventFileNavigation(event: DragEvent): void {
      if (isFileDrag(event.dataTransfer)) event.preventDefault()
    }
    window.addEventListener('dragover', preventFileNavigation)
    window.addEventListener('drop', preventFileNavigation)
    return () => {
      window.removeEventListener('dragover', preventFileNavigation)
      window.removeEventListener('drop', preventFileNavigation)
    }
  }, [])

  const handleMergeState = useCallback((state: CodeMergeState) => setCodeMerge(state), [])
  const handleCsvAlign = useCallback((state: CsvAlignState) => setCsvAlign(state), [])

  /**
   * Mirrors a file view's unsaved state onto its session model, so a later
   * close prompt can read it off the session rather than the view.
   */
  const handleSessionDirty = useCallback((id: string, dirty: boolean) => {
    setSessions((current) => {
      const target = current.find((session) => session.id === id)
      if (!target || (target.dirty ?? false) === dirty) return current
      return current.map((session) => (session.id === id ? { ...session, dirty } : session))
    })
  }, [])

  function report(message: string, tone: 'danger' | 'info' = 'danger'): void {
    setNotice(message)
    setNoticeTone(tone)
  }

  const active = sessions.find((session) => session.id === activeId) ?? null
  /** Inputs of the session on screen; every directory action is scoped to them. */
  const activeSides: ComparisonSides | null = active?.sides ?? null

  /** Diff counts of the directory entries currently visible, filter included. */
  const directoryCounts = useMemo<SampleComposition | null>(() => {
    const comparison = active?.scene === 'directory' ? active.directory : undefined
    if (!comparison) return null
    const filtered = filterDirectoryTree(comparison.root, directoryFilter)
    return { ...countTreeFiles(filtered), conflict: 0 }
  }, [active, directoryFilter])

  // The code session's conflict count and the CSV alignment counts are computed
  // at runtime, not read from the sample answer key.
  const legend = useMemo<SampleComposition | null>(() => {
    if (active?.scene === 'directory') return directoryCounts
    if (active?.scene === 'csv' && csvAlign?.sessionId === active.id) {
      return { ...csvAlign.counts, conflict: 0 }
    }
    const base = active?.composition ?? null
    if (base && active?.scene === 'code' && codeMerge) {
      return { ...base, conflict: codeMerge.unresolved }
    }
    return base
  }, [active, directoryCounts, codeMerge, csvAlign])

  async function load(options?: {
    readonly scene?: SceneId
    readonly simulateFailure?: boolean
  }): Promise<void> {
    setStatus('loading')
    setError(null)
    try {
      const loaded = await loadSampleSessions(platform, { ...options, cache: cache.current })
      setSessions(loaded)
      setActiveId((current) =>
        current !== null && loaded.some((session) => session.id === current)
          ? current
          : (loaded[0]?.id ?? null)
      )
      setStatus('ready')
    } catch (cause) {
      setSessions([])
      setActiveId(null)
      setError(cause instanceof Error ? cause.message : String(cause))
      setStatus('error')
    }
  }

  function selectScene(scene: SceneId): void {
    const target = sessions.find((session) => session.scene === scene)
    if (target) setActiveId(target.id)
  }

  function handleMenuSelect(id: string): void {
    if (id === 'simulate-failure') {
      void load({ simulateFailure: true })
      return
    }
    if (id === 'load-all') {
      void load()
      return
    }
    const scene = MENU_SCENES[id]
    if (scene) void load({ scene })
  }

  /** Upserts a session, preserving the tab order it already had. */
  function upsertSession(session: WorkbenchSession): void {
    setSessions((current) =>
      current.some((item) => item.id === session.id)
        ? current.map((item) => (item.id === session.id ? session : item))
        : [...current, session]
    )
    setActiveId(session.id)
  }

  /**
   * Refreshes one session in place with a newer model of itself. A sync rewrites
   * the compared roots, so the refreshed model gets a new id of its own; the tab
   * keeps the identity it was opened with instead of leaving a stale one behind.
   */
  function replaceSession(id: string, session: WorkbenchSession): void {
    setSessions((current) => current.map((item) => (item.id === id ? { ...session, id } : item)))
    setActiveId(id)
  }

  /**
   * Runs a comparison over the given sides (real directory and/or mounted
   * snapshot) and refreshes the directory session. Only a successful run
   * commits the new sides, so a failed import leaves the previous view intact.
   */
  async function runSidesCompare(next: ComparisonSides): Promise<void> {
    setDirectoryBusy(true)
    setNotice(null)
    try {
      const comparison = await compareSides(platform, next, cache.current)
      upsertSession(createDirectorySession(comparison, next))
      setStatus('ready')
    } catch (cause) {
      report(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setDirectoryBusy(false)
    }
  }

  /**
   * Builds the file-level session for two real absolute paths. The drop handler
   * and the file pickers both land here, so a pair is one session model.
   */
  async function openFilePair(leftPath: string, rightPath: string): Promise<void> {
    setDirectoryBusy(true)
    setNotice(null)
    try {
      upsertSession(await openFilePairSession(platform, leftPath, rightPath))
      setStatus('ready')
    } catch (cause) {
      report(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setDirectoryBusy(false)
    }
  }

  /** 「打开文件」: left file then right file, no sample involved. */
  async function pickFilePair(): Promise<void> {
    const reusable = pendingLeft?.kind === 'file' ? pendingLeft.path : null
    const leftPath = reusable ?? (await platform.selectFile({ title: '选择左侧文件' }))
    if (leftPath === null) return

    const rightPath = await platform.selectFile({ title: '选择右侧文件' })
    if (rightPath === null) return

    setPendingLeft(null)
    await openFilePair(leftPath, rightPath)
  }

  /** 「打开文件夹」: left directory then right directory, no sample involved. */
  async function pickDirectoryPair(): Promise<void> {
    const reusable = pendingLeft?.kind === 'directory' ? pendingLeft.path : null
    const leftPath = reusable ?? (await platform.selectDirectory())
    if (leftPath === null) return

    const rightPath = await platform.selectDirectory()
    if (rightPath === null) return

    setPendingLeft(null)
    await runSidesCompare(directorySides(leftPath, rightPath))
  }

  /**
   * Resolves dropped file handles to real paths and routes them: two same-kind
   * paths open a session, one path becomes the left baseline, anything else is
   * reported without touching the sessions on screen.
   */
  async function handleDroppedFiles(files: readonly File[]): Promise<void> {
    const resolved = await Promise.all(
      files.map(async (file) => {
        try {
          return await platform.resolveDroppedPath(file)
        } catch {
          // An unusable handle (not backed by a file on disk) carries no path.
          return ''
        }
      })
    )
    const paths = resolved.filter((path) => path.length > 0)

    if (paths.length === 0) {
      report('未能从拖入项解析出真实路径，请改用「打开文件 / 打开文件夹」。')
      return
    }

    if (paths.length === 1) {
      const directory = await isDirectoryPath(platform, paths[0])
      setPendingLeft({ path: paths[0], kind: directory ? 'directory' : 'file' })
      report(
        `已把 ${paths[0]} 作为左侧基准，请继续选择右侧对应的${directory ? '文件夹' : '文件'}。`,
        'info'
      )
      return
    }

    if (paths.length !== 2) {
      report(`当前只支持一次拖入两个同类路径（两个文件或两个文件夹），本次拖入了 ${paths.length} 个。`)
      return
    }

    const [leftDirectory, rightDirectory] = await Promise.all([
      isDirectoryPath(platform, paths[0]),
      isDirectoryPath(platform, paths[1])
    ])
    if (leftDirectory !== rightDirectory) {
      report('拖入的两项一个是文件、一个是文件夹，无法建立对比；请拖入两个同类路径。')
      return
    }

    setPendingLeft(null)
    if (leftDirectory) await runSidesCompare(directorySides(paths[0], paths[1]))
    else await openFilePair(paths[0], paths[1])
  }

  function handleDragOver(event: ReactDragEvent<HTMLDivElement>): void {
    if (!isFileDrag(event.dataTransfer)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  function handleDrop(event: ReactDragEvent<HTMLDivElement>): void {
    event.preventDefault()
    const files = droppedFiles(event.dataTransfer)
    if (files.length === 0) return
    void handleDroppedFiles(files)
  }

  async function pickDirectory(side: SidePosition): Promise<void> {
    const current = activeSides
    if (current === null) return

    const chosen = await platform.selectDirectory()
    if (chosen === null) return

    await runSidesCompare(withSide(current, side, { kind: 'directory', path: chosen }))
  }

  /** Opens a directory-tree file in the matching file-level view. */
  async function openFile(node: DirectoryDiffNode): Promise<void> {
    if (node.kind !== 'file') return

    const current = activeSides
    if (current === null) return

    const target = classifyFile(node.name)
    if (target === null) {
      report(`暂不支持把 ${node.name} 下钻到文件对比（仅代码 / 文本 · CSV / TSV · JSON / YAML）。`)
      return
    }

    setDirectoryBusy(true)
    setNotice(null)
    try {
      const [leftText, rightText] = await Promise.all([
        node.leftPath ? readSideFile(platform, current, node.leftPath) : Promise.resolve(''),
        node.rightPath ? readSideFile(platform, current, node.rightPath) : Promise.resolve('')
      ])
      upsertSession(createDrilldownSession(node, target, leftText, rightText))
    } catch (cause) {
      report(describeSnapshotContentError(cause, node.relativePath))
    } finally {
      setDirectoryBusy(false)
    }
  }

  /** Exports one side as a `.ocsnap.json` file through the platform save dialog. */
  async function handleExportSnapshot(side: SidePosition): Promise<void> {
    const current = activeSides
    if (current === null) return

    setDirectoryBusy(true)
    setNotice(null)
    try {
      const exported = await exportSideSnapshot(platform, current[side])
      const path = await platform.saveFile({
        title: '导出目录快照',
        defaultPath: snapshotFileName(exported.snapshot.name),
        filters: [SNAPSHOT_FILE_FILTER],
        content: exported.text
      })
      if (path === null) return
      report(`已导出到 ${path}（${exported.entryCount} 个文件）。`, 'info')
    } catch (cause) {
      report(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setDirectoryBusy(false)
    }
  }

  /** Mounts a picked `.ocsnap.json` on one side and recomputes the comparison. */
  async function handleImportSnapshot(side: SidePosition, file: File): Promise<void> {
    const current = activeSides
    if (current === null) return

    setDirectoryBusy(true)
    setNotice(null)
    try {
      const snapshot = parseSnapshotText(await readFileText(file))
      const next = withSide(current, side, snapshotSide(side, snapshot))
      const comparison = await compareSides(platform, next, cache.current)
      upsertSession(createDirectorySession(comparison, next))
      report(`已挂载快照 ${snapshot.name} 到${side === 'left' ? '左' : '右'}栏。`, 'info')
    } catch (cause) {
      report(describeSnapshotImportError(cause))
    } finally {
      setDirectoryBusy(false)
    }
  }

  /** Builds a dry-run sync plan and opens its preview dialog. */
  async function handlePreviewSync(direction: SyncDirection, mode: SyncMode): Promise<void> {
    const comparison = active?.directory
    if (!comparison) return

    setDirectoryBusy(true)
    setNotice(null)
    try {
      opSequence.current += 1
      const preview = await previewSync(platform, comparison, direction, mode, opSequence.current)
      setSyncPreview(preview)
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
      setNoticeTone('danger')
    } finally {
      setDirectoryBusy(false)
    }
  }

  /** Applies the confirmed plan, then refreshes the comparison tree. */
  async function handleConfirmSync(deletePaths: readonly string[]): Promise<void> {
    const preview = syncPreview
    const target = active
    if (!preview || !target) return

    setDirectoryBusy(true)
    setNotice(null)
    try {
      const result = await applySyncPreview(platform, preview, cache.current, deletePaths)
      const { leftRoot, rightRoot } = result.comparison
      replaceSession(
        target.id,
        createDirectorySession(result.comparison, directorySides(leftRoot, rightRoot))
      )
      setSyncPreview(null)
      setNotice(
        `同步完成：新增拷贝 ${result.copied} · 覆盖 ${result.updated} · 删除 ${result.deleted}。`
      )
      setNoticeTone('info')
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
      setNoticeTone('danger')
    } finally {
      setDirectoryBusy(false)
    }
  }

  /** Matches the shuffled incoming tree against the left (template) tree. */
  async function handlePreviewTemplate(): Promise<void> {
    const comparison = active?.directory
    if (!comparison) return

    setDirectoryBusy(true)
    setNotice(null)
    try {
      opSequence.current += 1
      const preview = await previewTemplate(
        platform,
        comparison.leftRoot,
        DIRECTORY_SAMPLE_PATHS.incoming,
        opSequence.current
      )
      setTemplatePreview(preview)
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
      setNoticeTone('danger')
    } finally {
      setDirectoryBusy(false)
    }
  }

  /** Extracts the matched files and re-verifies the rebuilt structure. */
  async function handleConfirmTemplate(): Promise<void> {
    const preview = templatePreview
    if (!preview) return

    setDirectoryBusy(true)
    setNotice(null)
    try {
      const result = await applyTemplateExtract(platform, preview)
      setTemplatePreview(null)
      setNotice(
        `模板归位完成：写入 ${result.extracted} 个文件；复核已写入槽位 已匹配 ${result.verifiedMatched} · 缺失 ${result.verifiedMissing} · 冲突 ${result.verifiedConflicts}。`
      )
      setNoticeTone('info')
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
      setNoticeTone('danger')
    } finally {
      setDirectoryBusy(false)
    }
  }

  function renderScene(session: WorkbenchSession): JSX.Element | null {
    switch (session.scene) {
      case 'directory': {
        const comparison = session.directory
        const sessionSides = session.sides
        if (!comparison || !sessionSides) return null
        return (
          <DirectoryView
            comparison={comparison}
            filter={directoryFilter}
            onFilterChange={setDirectoryFilter}
            visibleCounts={directoryCounts ?? { ...comparison.counts, conflict: 0 }}
            pickerAvailable={platform.kind === 'electron'}
            busy={directoryBusy}
            onPick={(side) => void pickDirectory(side)}
            onLoadSample={() =>
              void runSidesCompare(
                directorySides(DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right)
              )
            }
            onOpenFile={(node) => void openFile(node)}
            leftIsSnapshot={sessionSides.left.kind === 'snapshot'}
            rightIsSnapshot={sessionSides.right.kind === 'snapshot'}
            onExportSnapshot={(side) => void handleExportSnapshot(side)}
            onImportSnapshot={(side, file) => void handleImportSnapshot(side, file)}
            onLoadRemoteSnapshotSample={() => void runSidesCompare(remoteSnapshotSides())}
            onPreviewSync={(direction, mode) => void handlePreviewSync(direction, mode)}
            onPreviewTemplate={() => void handlePreviewTemplate()}
            syncPreview={syncPreview}
            templatePreview={templatePreview}
            onCancelSync={() => setSyncPreview(null)}
            onConfirmSync={(deletePaths) => void handleConfirmSync(deletePaths)}
            onCancelTemplate={() => setTemplatePreview(null)}
            onConfirmTemplate={() => void handleConfirmTemplate()}
          />
        )
      }
      case 'code':
        return session.adhoc ? (
          <CodeView
            key={session.id}
            pair={session.adhoc.pair}
            platform={platform}
            onDirtyChange={(dirty) => handleSessionDirty(session.id, dirty)}
          />
        ) : (
          <CodeView
            key={session.id}
            fixture={CODE_SCENE}
            defaultMode={session.columns === 3 ? 'merge' : 'diff'}
            platform={platform}
            onMergeStateChange={handleMergeState}
          />
        )
      case 'csv': {
        if (session.adhoc) {
          const { pair, delimiter, tables } = session.adhoc
          if (!tables) return null
          return (
            <CsvView
              key={session.id}
              sessionId={session.id}
              left={{ path: pair.left.path, text: pair.left.text, delimiter: delimiter ?? ',' }}
              right={{ path: pair.right.path, text: pair.right.text, delimiter: delimiter ?? ',' }}
              defaultKeyColumns={[]}
              tables={tables}
              platform={platform}
              onAlignStateChange={handleCsvAlign}
            />
          )
        }
        return session.tables ? (
          <CsvView
            key={session.id}
            sessionId={session.id}
            left={CSV_SCENE.left}
            right={CSV_SCENE.right}
            defaultKeyColumns={CSV_SCENE.keyColumns}
            tables={session.tables}
            platform={platform}
            onAlignStateChange={handleCsvAlign}
          />
        ) : null
      }
      case 'structured':
        return session.adhoc ? (
          <StructuredView
            key={session.id}
            pair={session.adhoc.pair}
            format={session.adhoc.format}
            platform={platform}
          />
        ) : (
          <StructuredView key={session.id} fixture={STRUCTURED_SCENE} platform={platform} />
        )
    }
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-surface-base text-content-primary"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line-subtle bg-surface-sunken px-3">
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-sm bg-accent-soft text-accent">
            <GitCompare aria-hidden className="size-4" />
          </span>
          <div className="leading-tight">
            <h1 className="text-sm font-semibold tracking-tight">OpenCompare</h1>
            <p className="text-2xs text-content-muted">对比与三向合并工作台</p>
          </div>
        </div>

        <SegmentedControl
          label="视图切换"
          options={VIEW_OPTIONS.map((option) => ({
            ...option,
            disabled: sessions.length === 0
          }))}
          value={active?.scene ?? 'directory'}
          onChange={selectScene}
        />

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* With a session on screen the empty-state CTAs are gone, so the
              toolbar keeps both real-open actions one click away. */}
          {status === 'empty' ? null : (
            <>
              <ToolbarButton
                icon={<FileCode2 aria-hidden className="size-3.5" />}
                onClick={() => void pickFilePair()}
                disabled={directoryBusy}
                title="依次选择左右两个真实文件开始对比"
              >
                打开文件
              </ToolbarButton>
              <ToolbarButton
                icon={<FolderOpen aria-hidden className="size-3.5" />}
                onClick={() => void pickDirectoryPair()}
                disabled={directoryBusy}
                title="依次选择左右两个真实文件夹开始对比"
              >
                打开文件夹
              </ToolbarButton>
            </>
          )}
          <ToolbarButton
            icon={<Sparkles aria-hidden className="size-3.5" />}
            onClick={() => void load()}
            disabled={status === 'loading'}
            title="内置演示样本（辅助入口，可跳过）：不影响打开真实文件 / 文件夹与拖入路径"
          >
            加载演示样本
          </ToolbarButton>
          <DropdownMenu
            label="演示样本"
            menuLabel="演示样本库"
            icon={<Layers aria-hidden className="size-3.5" />}
            items={SAMPLE_MENU}
            onSelect={handleMenuSelect}
          />
        </div>
      </header>

      {status === 'ready' && sessions.length > 0 ? (
        <div className="flex h-9 shrink-0 items-center border-b border-line-subtle bg-surface-base pr-2">
          <SessionTabs
            tabs={sessions.map((session) => ({
              id: session.id,
              title: session.title,
              subtitle: session.subtitle,
              icon: VIEW_OPTIONS.find((option) => option.value === session.scene)?.icon
            }))}
            activeId={activeId}
            onSelect={setActiveId}
          />
        </div>
      ) : null}

      {notice ? (
        <p
          role="alert"
          className={cx(
            'shrink-0 border-b border-line-subtle bg-surface-base px-3 py-1 text-2xs',
            noticeTone === 'info' ? 'text-diff-added' : 'text-danger'
          )}
        >
          {notice}
        </p>
      ) : null}

      <main className="flex min-h-0 flex-1 flex-col">
        {status === 'empty' ? (
          <StateView
            icon={<GitCompare aria-hidden className="size-5" />}
            title="打开真实文件或文件夹开始对比"
            description="经系统选择器依次选择左右两侧的两个文件或两个文件夹，或直接把两个真实路径拖入窗口。对比直接读取本机文件系统，无需加载任何样本。"
            action={
              <>
                <ToolbarButton
                  variant="primary"
                  icon={<FileCode2 aria-hidden className="size-3.5" />}
                  onClick={() => void pickFilePair()}
                  disabled={directoryBusy}
                >
                  打开文件
                </ToolbarButton>
                <ToolbarButton
                  icon={<FolderOpen aria-hidden className="size-3.5" />}
                  onClick={() => void pickDirectoryPair()}
                  disabled={directoryBusy}
                >
                  打开文件夹
                </ToolbarButton>
              </>
            }
            hint="拖入 2 个同类路径（两个文件或两个文件夹）可直接开始；内置演示样本仅供体验，可在顶栏随时加载或完全跳过。"
          />
        ) : null}

        {status === 'loading' ? (
          <StateView
            icon={<LoaderCircle aria-hidden className="size-5 animate-spin" />}
            title="正在载入样本…"
            description="读取内置样本库，扫描内置样本目录并按大小 / 修改时间 / 内容哈希完成对比，同时解析 CSV / TSV 表格。"
          />
        ) : null}

        {status === 'error' ? (
          <StateView
            tone="danger"
            icon={<AlertTriangle aria-hidden className="size-5" />}
            title="样本库读取失败"
            description={error ?? '读取内置样本时发生未知错误。'}
            action={
              <ToolbarButton
                variant="danger"
                icon={<RefreshCw aria-hidden className="size-3.5" />}
                onClick={() => void load()}
              >
                重试
              </ToolbarButton>
            }
            hint="样本库随应用内置，可直接重试。"
          />
        ) : null}

        {status === 'ready' && active ? renderScene(active) : null}
      </main>

      <StatusBar>
        <StatusEntry label="会话" value={active ? active.id : '—'} />
        <span aria-hidden className="h-3 w-px shrink-0 bg-line-subtle" />
        <StatusEntry label="运行平台" value={platform.kind} />
        {legend ? (
          <>
            <span aria-hidden className="h-3 w-px shrink-0 bg-line-subtle" />
            <CompositionLegend composition={legend} />
          </>
        ) : null}
        {active ? (
          <span className="ml-auto flex shrink-0 items-center gap-3">
            {active.stats.map((stat) => (
              <StatusEntry
                key={stat.label}
                label={stat.label}
                value={
                  active.scene === 'code' && stat.label === '冲突块' && codeMerge
                    ? codeMerge.unresolved
                    : stat.value
                }
                tone={stat.tone}
              />
            ))}
          </span>
        ) : null}
      </StatusBar>
    </div>
  )
}
