import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent, JSX } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
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
import type { CompareRequest, CompareRequestPayload } from '@shared/compareRequest'
import type { PlatformPort } from '@shared/platform/types'
import { createComparisonCache } from '@core/directory/compare'
import type { DirectoryDiffNode } from '@core/directory/compare'
import { visibleDirectoryCounts } from '@core/directory/rows'
import type { DirectoryFilter } from '@core/directory/filter'
import type { SyncDirection, SyncMode } from '@core/directory/sync'
import { isOperationCancelled } from '@core/io'
import { ToolbarButton } from '@renderer/components/Button'
import { Dialog } from '@renderer/components/Dialog'
import { DropdownMenu } from '@renderer/components/DropdownMenu'
import type { DropdownItem } from '@renderer/components/DropdownMenu'
import { SegmentedControl } from '@renderer/components/SegmentedControl'
import { SessionTabs } from '@renderer/components/SessionTabs'
import { StateView } from '@renderer/components/StateView'
import { CompositionLegend, StatusBar, StatusEntry } from '@renderer/components/StatusBar'
import { cx, formatBytes } from '@renderer/components/utils'
import { CodeView } from '@renderer/views/CodeView'
import type { CodeMergeState } from '@renderer/views/CodeView'
import { CsvView } from '@renderer/views/CsvView'
import type { CsvAlignState } from '@renderer/views/CsvView'
import { DirectoryView } from '@renderer/views/DirectoryView'
import { StructuredView } from '@renderer/views/StructuredView'
import {
  createDirectorySession,
  createDrilldownSession,
  openFilePairSession,
  resolveDirectoryReturn
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
import { NewCompareDialog } from './NewCompareDialog'
import type { CompareOpenOutcome } from './NewCompareDialog'
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
import type { CodeFileBuffer, WorkbenchSession } from './session'

type WorkbenchStatus = 'empty' | 'loading' | 'ready' | 'error'

/** A single dropped path waiting for its counterpart. */
interface PendingLeft {
  readonly path: string
  readonly kind: 'file' | 'directory'
}

/**
 * The directory view state the shell keeps per directory session: filter,
 * collapsed folders and the selected row survive a drilldown roundtrip (the
 * view remounts on return) and never cross over between directory sessions.
 */
interface DirectoryViewState {
  readonly filter: DirectoryFilter
  readonly collapsed: readonly string[]
  readonly selectedPath: string | null
}

const EMPTY_DIRECTORY_STATE: DirectoryViewState = {
  filter: 'all',
  collapsed: [],
  selectedPath: null
}

/** Scroll offsets of a directory session's two panels. */
interface DirectoryScroll {
  readonly left: number
  readonly right: number
}

const EMPTY_SCROLL: DirectoryScroll = { left: 0, right: 0 }

/** Live progress of the directory comparison currently running, if any. */
interface DirectoryProgressState {
  readonly phase: 'scan' | 'digest'
  /** Whole-pipeline cumulative files; never decreases across the phase switch. */
  readonly files: number
  /** Whole-pipeline cumulative bytes; never decreases across the phase switch. */
  readonly bytes: number
  /** Files settled inside the current phase (what the digest copy shows). */
  readonly phaseFiles: number
  /** The cancel action was clicked and the comparison has not settled yet. */
  readonly cancelling: boolean
}

/** One directory comparison's cancellable identity, shared with the platform. */
interface ActiveDirectoryOperation {
  readonly id: string
  readonly controller: AbortController
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

/** Drops one session's shell cache entry without mutating the record. */
function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record
  const next = { ...record }
  delete next[key]
  return next
}

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
  const [codeMerge, setCodeMerge] = useState<Record<string, CodeMergeState>>({})
  const [csvAlign, setCsvAlign] = useState<CsvAlignState | null>(null)
  const [directoryBusy, setDirectoryBusy] = useState(false)
  const [directoryProgress, setDirectoryProgress] = useState<DirectoryProgressState | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [noticeTone, setNoticeTone] = useState<'danger' | 'info'>('danger')
  const [directoryStates, setDirectoryStates] = useState<Record<string, DirectoryViewState>>({})
  const [directoryScroll, setDirectoryScroll] = useState<Record<string, DirectoryScroll>>({})
  const [pendingLeft, setPendingLeft] = useState<PendingLeft | null>(null)
  const [syncPreview, setSyncPreview] = useState<SyncPreview | null>(null)
  const [templatePreview, setTemplatePreview] = useState<TemplatePreview | null>(null)
  /** The dirty session whose close is waiting for the unsaved-edits prompt. */
  const [closeTarget, setCloseTarget] = useState<WorkbenchSession | null>(null)
  const [compareDialogOpen, setCompareDialogOpen] = useState(false)
  const cache = useRef(createComparisonCache())
  const opSequence = useRef(0)
  /** The directory comparison that can still be cancelled, if one is running. */
  const activeDirectoryOperation = useRef<ActiveDirectoryOperation | null>(null)
  /** Latest launch-request handler; the subscription itself is installed once. */
  const launchRequest = useRef<(payload: CompareRequestPayload) => void>(() => undefined)

  useEffect(() => {
    launchRequest.current = (payload) => {
      if (payload.ok) {
        // The injected request follows the same route as the manual entry.
        void openCompareRequest(payload.request, (message) => report(message))
        return
      }
      // A rejected launch source only reports; sessions and the active tab stay.
      report(payload.message)
    }
  })

  /**
   * Subscribes once per mount to the requests collected by the launch source
   * (launch arguments / `opencompare://`). The ready signal goes out only after
   * the listener is attached, so the host delivers its queue exactly once.
   */
  useEffect(() => {
    const subscribe = platform.onCompareRequest
    if (!subscribe) return
    const unsubscribe = subscribe((payload) => launchRequest.current(payload))
    void platform.compareRequestsReady?.()
    return unsubscribe
  }, [platform])

  // Cmd/Ctrl+N opens the manual entry from anywhere; while it is already open
  // the shortcut is a no-op instead of stacking a second dialog.
  useEffect(() => {
    function handleNewCompareShortcut(event: KeyboardEvent): void {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return
      if (event.key.toLowerCase() !== 'n') return
      event.preventDefault()
      setCompareDialogOpen(true)
    }
    document.addEventListener('keydown', handleNewCompareShortcut)
    return () => document.removeEventListener('keydown', handleNewCompareShortcut)
  }, [])

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

  const handleMergeState = useCallback((id: string, state: CodeMergeState) => {
    setCodeMerge((current) => {
      const known = current[id]
      if (known && known.unresolved === state.unresolved && known.total === state.total) {
        return current
      }
      return { ...current, [id]: state }
    })
  }, [])
  const handleCsvAlign = useCallback((state: CsvAlignState) => setCsvAlign(state), [])
  const closeCompareDialog = useCallback(() => setCompareDialogOpen(false), [])

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

  /**
   * Keeps the file view's working copies on the session, so switching tabs
   * (which unmounts the view) never drops unsaved work.
   */
  const handleSessionBuffer = useCallback((id: string, buffer: CodeFileBuffer) => {
    setSessions((current) =>
      current.map((session) => (session.id === id ? { ...session, codeBuffer: buffer } : session))
    )
  }, [])

  /** Closes one session, landing on its neighbour and cleaning shell caches. */
  function closeSession(id: string): void {
    const index = sessions.findIndex((session) => session.id === id)
    if (index < 0) return

    const remaining = sessions.filter((session) => session.id !== id)
    if (activeId === id) {
      // Prefer the next tab; the previous one is the fallback at the right edge.
      setActiveId((remaining[index] ?? remaining[index - 1])?.id ?? null)
    }
    setSessions(remaining)
    setDirectoryStates((current) => withoutKey(current, id))
    setDirectoryScroll((current) => withoutKey(current, id))
    setCodeMerge((current) => withoutKey(current, id))
    setCsvAlign((current) => (current?.sessionId === id ? null : current))
    setCloseTarget(null)
    if (remaining.length === 0) setStatus('empty')
  }

  /** A clean session closes at once; a dirty one asks first. */
  function requestCloseSession(id: string): void {
    const target = sessions.find((session) => session.id === id)
    if (!target) return
    if (target.dirty) {
      setCloseTarget(target)
      return
    }
    closeSession(id)
  }

  function report(message: string, tone: 'danger' | 'info' = 'danger'): void {
    setNotice(message)
    setNoticeTone(tone)
  }

  const active = sessions.find((session) => session.id === activeId) ?? null
  /** Inputs of the session on screen; every directory action is scoped to them. */
  const activeSides: ComparisonSides | null = active?.sides ?? null
  /** Tree state of the directory session on screen, keyed by its id. */
  const directoryState =
    active?.scene === 'directory'
      ? (directoryStates[active.id] ?? EMPTY_DIRECTORY_STATE)
      : EMPTY_DIRECTORY_STATE

  /** Diff counts of the directory entries currently visible, filter included. */
  const directoryCounts = useMemo<SampleComposition | null>(() => {
    const comparison = active?.scene === 'directory' ? active.directory : undefined
    if (!comparison) return null
    // The status aggregate already carries every file's status, so the visible
    // counts are a per-filter projection of it rather than a filtered tree walk.
    return { ...visibleDirectoryCounts(comparison.root, directoryState.filter), conflict: 0 }
  }, [active, directoryState.filter])

  // The code session's conflict count and the CSV alignment counts are computed
  // at runtime, not read from the sample answer key. Merge state is keyed by
  // session, so a tab switch never shows another session's count.
  const activeMerge = active ? (codeMerge[active.id] ?? null) : null
  const legend = useMemo<SampleComposition | null>(() => {
    if (active?.scene === 'directory') return directoryCounts
    if (active?.scene === 'csv' && csvAlign?.sessionId === active.id) {
      return { ...csvAlign.counts, conflict: 0 }
    }
    const base = active?.composition ?? null
    if (base && active?.scene === 'code' && activeMerge) {
      return { ...base, conflict: activeMerge.unresolved }
    }
    return base
  }, [active, directoryCounts, activeMerge, csvAlign])

  /** Applies one patch on top of a directory session's kept view state. */
  function patchDirectoryState(id: string, patch: Partial<DirectoryViewState>): void {
    setDirectoryStates((current) => ({
      ...current,
      [id]: { ...(current[id] ?? EMPTY_DIRECTORY_STATE), ...patch }
    }))
  }

  function toggleDirectoryPath(id: string, path: string): void {
    setDirectoryStates((current) => {
      const state = current[id] ?? EMPTY_DIRECTORY_STATE
      const collapsed = state.collapsed.includes(path)
        ? state.collapsed.filter((item) => item !== path)
        : [...state.collapsed, path]
      return { ...current, [id]: { ...state, collapsed } }
    })
  }

  /** Remembers one panel's scroll offset so a remount re-applies it on return. */
  function rememberDirectoryScroll(id: string, side: SidePosition, scrollTop: number): void {
    setDirectoryScroll((current) => {
      const scroll = current[id] ?? { left: 0, right: 0 }
      if (scroll[side] === scrollTop) return current
      return { ...current, [id]: { ...scroll, [side]: scrollTop } }
    })
  }

  /** 「返回上级目录视图」: prefer the source session, fall back with a notice. */
  function backToDirectory(sourceId: string): void {
    const destination = resolveDirectoryReturn(sessions, sourceId)
    if (!destination) {
      report('来源目录会话已不可用，当前也没有其他目录对比会话可返回。')
      return
    }
    if (destination.fallback) {
      const fallback = sessions.find((session) => session.id === destination.id)
      report(
        `来源目录会话已不可用，已返回可用的目录对比：${fallback?.title ?? destination.id}。`,
        'info'
      )
    }
    setActiveId(destination.id)
  }

  async function load(options?: {
    readonly scene?: SceneId
    readonly simulateFailure?: boolean
  }): Promise<void> {
    setStatus('loading')
    setError(null)
    try {
      const loaded = await loadSampleSessions(platform, { ...options, cache: cache.current })
      // Samples are auxiliary: with sessions already open they are merged in by
      // id, so the real sessions, their order and the active one survive.
      setSessions((current) => {
        if (current.length === 0) return loaded
        const merged = current.map(
          (session) => loaded.find((sample) => sample.id === session.id) ?? session
        )
        return [...merged, ...loaded.filter((sample) => !current.some((s) => s.id === sample.id))]
      })
      setActiveId((current) =>
        current !== null && sessions.some((session) => session.id === current)
          ? current
          : (loaded[0]?.id ?? null)
      )
      setStatus('ready')
    } catch (cause) {
      if (sessions.length > 0) {
        // Keep what the user already has open and report the auxiliary failure.
        report(cause instanceof Error ? cause.message : String(cause))
        setStatus('ready')
        return
      }
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
   * A caller-provided `onError` keeps the message local (the new-compare
   * dialog); otherwise it lands in the workbench notice. A comparison started
   * from that dialog dismisses it first, so its build failures use the notice.
   */
  async function runSidesCompare(
    next: ComparisonSides,
    onError?: (message: string) => void
  ): Promise<boolean> {
    // Dismiss 「新建对比」 before the scan starts: its modal overlay would
    // otherwise sit on top of the shell progress bar and its cancel button for
    // the whole run. Path validation already happened, so only a build failure
    // can still surface, and that one goes to the workbench notice.
    const fromDialog = compareDialogOpen
    setCompareDialogOpen(false)
    opSequence.current += 1
    const operation: ActiveDirectoryOperation = {
      id: `directory-${opSequence.current}-${Math.random().toString(36).slice(2, 8)}`,
      controller: new AbortController()
    }
    activeDirectoryOperation.current = operation
    setDirectoryBusy(true)
    setNotice(null)
    setDirectoryProgress({ phase: 'scan', files: 0, bytes: 0, phaseFiles: 0, cancelling: false })
    try {
      const comparison = await compareSides(platform, next, cache.current, {
        signal: operation.controller.signal,
        operationId: operation.id,
        onProgress: (progress) => {
          setDirectoryProgress((current) =>
            current === null
              ? current
              : {
                  ...current,
                  phase: progress.phase,
                  files: progress.files,
                  bytes: progress.bytes,
                  phaseFiles: progress.phaseFiles
                }
          )
        }
      })
      upsertSession(createDirectorySession(comparison, next))
      setStatus('ready')
      // A comparison that succeeded with unreadable entries is still a success:
      // report what was left out instead of turning it into an error.
      if (comparison.skipped > 0) {
        report(`已跳过 ${comparison.skipped} 个不可读项/悬空链接`, 'info')
      }
      return true
    } catch (cause) {
      // Cancellation never commits a session; the shell keeps what it had.
      if (isOperationCancelled(cause)) {
        report('已取消本次目录对比，工作台保持取消前的状态。', 'info')
        return false
      }
      const message = cause instanceof Error ? cause.message : String(cause)
      if (onError && !fromDialog) onError(message)
      else report(message)
      return false
    } finally {
      activeDirectoryOperation.current = null
      setDirectoryProgress(null)
      setDirectoryBusy(false)
    }
  }

  /**
   * Stops the running directory comparison: abort the core first (so no new
   * batch starts), then ask the platform to destroy its in-flight streams. A
   * platform failure here never changes the UI outcome.
   */
  function cancelDirectoryCompare(): void {
    const operation = activeDirectoryOperation.current
    if (operation === null) return
    setDirectoryProgress((current) =>
      current === null ? current : { ...current, cancelling: true }
    )
    operation.controller.abort()
    void platform.cancelOperation(operation.id).catch(() => undefined)
  }

  /**
   * Builds the file-level session for two real absolute paths. The drop handler,
   * the file pickers and the path dialog all land here, so a pair is one session
   * model. Failures are reported without touching the sessions on screen.
   */
  async function openFilePair(
    leftPath: string,
    rightPath: string,
    onError?: (message: string) => void
  ): Promise<boolean> {
    setDirectoryBusy(true)
    setNotice(null)
    try {
      upsertSession(await openFilePairSession(platform, leftPath, rightPath))
      setStatus('ready')
      return true
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      if (onError) onError(message)
      else report(message)
      return false
    } finally {
      setDirectoryBusy(false)
    }
  }

  /**
   * Routes a validated request onto the existing session builders: the only
   * decision here is file pair vs. directory pair.
   */
  async function openCompareRequest(
    request: CompareRequest,
    onError: (message: string) => void
  ): Promise<boolean> {
    if (request.kind === 'directory') {
      return runSidesCompare(directorySides(request.left, request.right), onError)
    }
    return openFilePair(request.left, request.right, onError)
  }

  /** 「打开文件」: left file then right file, no sample involved. */
  async function pickFilePair(onError?: (message: string) => void): Promise<boolean> {
    const reusable = pendingLeft?.kind === 'file' ? pendingLeft.path : null
    const leftPath = reusable ?? (await platform.selectFile({ title: '选择左侧文件' }))
    if (leftPath === null) return false

    const rightPath = await platform.selectFile({ title: '选择右侧文件' })
    if (rightPath === null) return false

    setPendingLeft(null)
    return openFilePair(leftPath, rightPath, onError)
  }

  /** 「打开文件夹」: left directory then right directory, no sample involved. */
  async function pickDirectoryPair(onError?: (message: string) => void): Promise<boolean> {
    const reusable = pendingLeft?.kind === 'directory' ? pendingLeft.path : null
    const leftPath = reusable ?? (await platform.selectDirectory())
    if (leftPath === null) return false

    const rightPath = await platform.selectDirectory()
    if (rightPath === null) return false

    setPendingLeft(null)
    return runSidesCompare(directorySides(leftPath, rightPath), onError)
  }

  /** Dialog「打开文件」: pickers feed the same pair builder, errors stay inline. */
  async function pickFilesFromDialog(): Promise<CompareOpenOutcome> {
    const feedback = { message: null as string | null }
    const opened = await pickFilePair((message) => {
      feedback.message = message
    })
    return opened ? { ok: true } : { ok: false, error: feedback.message }
  }

  /** Dialog「打开文件夹」: same picker flow as the toolbar action. */
  async function pickDirectoriesFromDialog(): Promise<CompareOpenOutcome> {
    const feedback = { message: null as string | null }
    const opened = await pickDirectoryPair((message) => {
      feedback.message = message
    })
    return opened ? { ok: true } : { ok: false, error: feedback.message }
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

    const source = active
    const current = activeSides
    if (!source || source.scene !== 'directory' || current === null) return

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
      upsertSession(createDrilldownSession(source.id, node, target, leftText, rightText))
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
      report(
        `已导出到 ${path}（${exported.entryCount} 个文件${exported.skipped > 0 ? `，跳过 ${exported.skipped} 个不可读项` : ''}）。`,
        'info'
      )
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
    const body = renderSceneBody(session)
    const sourceId = session.parentDirectoryId
    if (!sourceId) return body

    // A drilled-down file view carries an explicit way back to the directory
    // session it came from; the tree's own state is kept by the shell.
    const source = sessions.find((item) => item.id === sourceId)
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line-subtle bg-surface-sunken px-2">
          <ToolbarButton
            size="sm"
            icon={<ArrowLeft aria-hidden className="size-3.5" />}
            onClick={() => backToDirectory(sourceId)}
            title="返回发起本次下钻的目录对比会话"
          >
            返回上级目录视图
          </ToolbarButton>
          <span className="truncate text-2xs text-content-muted" title={source?.subtitle}>
            来源目录对比：{source ? source.title : sourceId}
          </span>
        </div>
        {body}
      </div>
    )
  }

  function renderSceneBody(session: WorkbenchSession): JSX.Element | null {
    switch (session.scene) {
      case 'directory': {
        const comparison = session.directory
        const sessionSides = session.sides
        if (!comparison || !sessionSides) return null
        const treeState = directoryStates[session.id] ?? EMPTY_DIRECTORY_STATE
        return (
          <DirectoryView
            sessionId={session.id}
            comparison={comparison}
            filter={treeState.filter}
            onFilterChange={(next) => patchDirectoryState(session.id, { filter: next })}
            collapsedPaths={treeState.collapsed}
            onTogglePath={(path) => toggleDirectoryPath(session.id, path)}
            selectedPath={treeState.selectedPath}
            onSelectPath={(path) => patchDirectoryState(session.id, { selectedPath: path })}
            scrollTops={directoryScroll[session.id] ?? EMPTY_SCROLL}
            onScrollTopChange={(side, scrollTop) =>
              rememberDirectoryScroll(session.id, side, scrollTop)
            }
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
            buffer={session.codeBuffer}
            platform={platform}
            onDirtyChange={(dirty) => handleSessionDirty(session.id, dirty)}
            onBufferChange={(buffer) => handleSessionBuffer(session.id, buffer)}
          />
        ) : (
          <CodeView
            key={session.id}
            fixture={CODE_SCENE}
            defaultMode={session.columns === 3 ? 'merge' : 'diff'}
            platform={platform}
            onMergeStateChange={(state) => handleMergeState(session.id, state)}
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
          {/* The manual entry is permanent: with or without sessions on screen. */}
          <ToolbarButton
            icon={<GitCompare aria-hidden className="size-3.5" />}
            onClick={() => setCompareDialogOpen(true)}
            disabled={directoryBusy}
            title="输入或粘贴左右两个真实路径，免系统弹窗建立对比（Cmd/Ctrl+N）"
          >
            新建对比
          </ToolbarButton>
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
              icon: VIEW_OPTIONS.find((option) => option.value === session.scene)?.icon,
              dirty: session.dirty ?? false
            }))}
            activeId={activeId}
            onSelect={setActiveId}
            onClose={requestCloseSession}
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

      {/* Directory-comparison progress lives on the shell so the empty state and
          an open session show the very same live bar. */}
      {directoryProgress ? (
        <div
          role="status"
          aria-label="目录对比进度"
          aria-live="polite"
          className="flex shrink-0 items-center gap-3 border-b border-line-subtle bg-surface-sunken px-3 py-1 text-2xs"
        >
          <span className="shrink-0 font-medium text-content-primary">
            {directoryProgress.phase === 'scan' ? '正在扫描目录' : '正在校验内容'}
          </span>
          <span aria-hidden className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-surface-hover">
            <span className="block h-full w-1/2 animate-pulse rounded-full bg-accent" />
          </span>
          <span className="shrink-0 text-content-secondary">
            {directoryProgress.phase === 'scan'
              ? `已扫描 ${directoryProgress.files} 个文件`
              : `已校验 ${directoryProgress.phaseFiles} 个文件`}
          </span>
          {directoryProgress.phase === 'digest' ? (
            <>
              <span aria-hidden className="h-3 w-px shrink-0 bg-line-subtle" />
              {/* The phase increment above is this run's progress; this is the
                  whole pipeline, so the number never drops at the hand-over. */}
              <span className="shrink-0 text-content-secondary">
                累计 {directoryProgress.files} 个文件
              </span>
            </>
          ) : null}
          <span aria-hidden className="h-3 w-px shrink-0 bg-line-subtle" />
          <span className="shrink-0 text-content-muted">
            已处理 {formatBytes(directoryProgress.bytes)}
          </span>
          <ToolbarButton
            size="sm"
            className="ml-auto"
            onClick={cancelDirectoryCompare}
            disabled={directoryProgress.cancelling}
            title="停止本次目录对比并保持当前工作台状态"
          >
            取消
          </ToolbarButton>
        </div>
      ) : null}

      <main className="flex min-h-0 flex-1 flex-col">
        {status === 'empty' ? (
          <StateView
            icon={<GitCompare aria-hidden className="size-5" />}
            title="打开真实文件或文件夹开始对比"
            description="在「新建对比」中直接输入或粘贴左右两个真实路径，全程不弹系统对话框；也可以经系统选择器依次选择两侧，或直接把两个真实路径拖入窗口。对比直接读取本机文件系统，无需加载任何样本。"
            action={
              <>
                <ToolbarButton
                  variant="primary"
                  icon={<GitCompare aria-hidden className="size-3.5" />}
                  onClick={() => setCompareDialogOpen(true)}
                  disabled={directoryBusy}
                >
                  新建对比
                </ToolbarButton>
                <ToolbarButton
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

      {compareDialogOpen ? (
        <NewCompareDialog
          platform={platform}
          onClose={closeCompareDialog}
          openRequest={openCompareRequest}
          onPickFiles={pickFilesFromDialog}
          onPickDirectories={pickDirectoriesFromDialog}
        />
      ) : null}

      {closeTarget ? (
        <Dialog
          title="关闭含未保存修改的会话？"
          description={`会话「${closeTarget.title}」还有未保存修改，关闭后这些修改会丢失。`}
          onClose={() => setCloseTarget(null)}
          footer={
            <>
              <ToolbarButton onClick={() => setCloseTarget(null)}>继续编辑</ToolbarButton>
              <ToolbarButton variant="danger" onClick={() => closeSession(closeTarget.id)}>
                放弃修改并关闭
              </ToolbarButton>
            </>
          }
        >
          <p className="text-2xs text-content-secondary">
            需要保留修改时，请先「继续编辑」，在该会话内用「保存左文件 / 保存右文件」写回磁盘后再关闭。
          </p>
        </Dialog>
      ) : null}

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
                  active.scene === 'code' && stat.label === '冲突块' && activeMerge
                    ? activeMerge.unresolved
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
