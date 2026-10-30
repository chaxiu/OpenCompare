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
  Settings,
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
import { directoryReportSource } from '@core/directory/report'
import type { DirectoryReportProgress } from '@core/directory/report'
import type { DirectoryFilter } from '@core/directory/filter'
import type { SyncDirection, SyncMode } from '@core/directory/sync'
import { isOperationCancelled } from '@core/io'
import { IconButton, ToolbarButton } from '@renderer/components/Button'
import { Dialog } from '@renderer/components/Dialog'
import { DropdownMenu } from '@renderer/components/DropdownMenu'
import type { DropdownItem } from '@renderer/components/DropdownMenu'
import { SegmentedControl } from '@renderer/components/SegmentedControl'
import { SessionTabs } from '@renderer/components/SessionTabs'
import { StateView } from '@renderer/components/StateView'
import { CompositionLegend, StatusBar, StatusEntry } from '@renderer/components/StatusBar'
import { cx, formatBytes } from '@renderer/components/utils'
import { useI18n } from '@renderer/i18n/context'
import type { Translate } from '@renderer/i18n/context'
import type { MessageKey } from '@renderer/i18n/messages'
import { CodeView } from '@renderer/views/CodeView'
import type { CodeMergeState } from '@renderer/views/CodeView'
import { CsvView } from '@renderer/views/CsvView'
import type { CsvAlignState } from '@renderer/views/CsvView'
import { DirectoryView } from '@renderer/views/DirectoryView'
import { StructuredView } from '@renderer/views/StructuredView'
import {
  createDirectorySession,
  createDrilldownSession,
  directoryViewKey,
  FilePairError,
  openFilePairSession,
  releaseSessionTree,
  replaceFilePairSide,
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
import {
  buildDirectoryReportForComparisonAsync,
  createReportProgressThrottle,
  directoryReportFileName,
  directoryReportFilter,
  directoryReportSaveCopy
} from './directoryReport'
import { loadSampleSessions, SampleLibraryError } from './loadSampleSessions'
import {
  describeSession,
  fileKindMessageKey,
  renderSessionText
} from './sessionDisplay'
import { NewCompareDialog } from './NewCompareDialog'
import { SettingsDialog } from './SettingsDialog'
import type { CompareOpenOutcome } from './NewCompareDialog'
import { commitSessionTree, closeSessions } from './sessionStore'
import {
  compareSides,
  directorySides,
  exportSideSnapshot,
  parseSnapshotText,
  readFileText,
  readSideFile,
  remoteSnapshotSides,
  snapshotFileFilter,
  snapshotFileName,
  snapshotSide,
  withSide
} from './snapshotOps'
import type { ComparisonSides, SidePosition } from './snapshotOps'
import { snapshotContentCopy, snapshotImportCopy } from './snapshotCopy'
import type { CodeFileBuffer, WorkbenchSession } from './session'
import { entryPresentation, levelBandClasses, levelRowClasses } from './shellLayout'
import type { ShellEntryId } from './shellLayout'
import { useWidthTier } from './useWidthTier'

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

/** A localized fragment inside a notice parameter, resolved when it renders. */
interface NoticeMessage {
  readonly message: MessageKey
}

type NoticeParams = Readonly<Record<string, string | number | NoticeMessage>>

/**
 * One workbench notice. A dictionary copy keeps only its key and params, so a
 * language switch re-translates the notice already on screen; a raw error detail
 * from a non-localized module stays plain text.
 */
type Notice =
  | { readonly kind: 'copy'; readonly key: MessageKey; readonly params?: NoticeParams }
  | { readonly kind: 'detail'; readonly text: string }

function copyNotice(key: MessageKey, params?: NoticeParams): Notice {
  return { kind: 'copy', key, params }
}

function detailNotice(text: string): Notice {
  return { kind: 'detail', text }
}

/** Diagnostic text of a failure whose code the shell does not localize. */
function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** Renders a notice in the active language, nested fragments included. */
function noticeText(notice: Notice, t: Translate): string {
  if (notice.kind === 'detail') return notice.text
  const params = notice.params
  if (params === undefined) return t(notice.key)
  const resolved: Record<string, string | number> = {}
  for (const [name, value] of Object.entries(params)) {
    resolved[name] = typeof value === 'object' ? t(value.message) : value
  }
  return t(notice.key, resolved)
}

const VIEW_OPTIONS: readonly {
  value: SceneId
  labelKey: MessageKey
  icon: JSX.Element
}[] = [
  {
    value: 'directory',
    labelKey: 'shell.view.directory',
    icon: <FolderTree aria-hidden className="size-3.5" />
  },
  {
    value: 'code',
    labelKey: 'shell.view.code',
    icon: <FileCode2 aria-hidden className="size-3.5" />
  },
  {
    value: 'csv',
    labelKey: 'shell.view.csv',
    icon: <Table2 aria-hidden className="size-3.5" />
  },
  {
    value: 'structured',
    labelKey: 'shell.view.structured',
    icon: <Braces aria-hidden className="size-3.5" />
  }
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
/** Smallest possible plural switch: one vs. everything else. */
function countKey(one: MessageKey, other: MessageKey, count: number): MessageKey {
  return count === 1 ? one : other
}

function sampleMenu(t: Translate): readonly DropdownItem[] {
  return [
    {
      id: 'load-all',
      label: t('shell.sampleMenu.all.label'),
      description: t('shell.sampleMenu.all.description'),
      icon: <Sparkles aria-hidden className="size-3.5" />
    },
    {
      id: 'load-directory',
      label: t('shell.sampleMenu.directory.label'),
      description: t('shell.sampleMenu.directory.description')
    },
    {
      id: 'load-code',
      label: t('shell.sampleMenu.code.label'),
      description: t('shell.sampleMenu.code.description')
    },
    {
      id: 'load-csv',
      label: t('shell.sampleMenu.csv.label'),
      description: t('shell.sampleMenu.csv.description')
    },
    {
      id: 'load-structured',
      label: t('shell.sampleMenu.structured.label'),
      description: t('shell.sampleMenu.structured.description')
    },
    {
      id: 'simulate-failure',
      label: t('shell.sampleMenu.failure.label'),
      description: t('shell.sampleMenu.failure.description'),
      danger: true
    }
  ]
}

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

/**
 * Localizes the two known file-pair failures; every other rejection keeps its
 * original message as the diagnostic detail.
 */
function filePairErrorMessage(cause: unknown, t: Translate): string {
  if (cause instanceof FilePairError) {
    if (cause.code === 'unsupported-type') {
      return t('shell.file.error.unsupported', { name: cause.params.name ?? '' })
    }
    return t('shell.file.error.mixed', {
      left: cause.params.left ?? '',
      right: cause.params.right ?? '',
      leftKind:
        cause.params.leftKind === undefined ? '' : t(fileKindMessageKey(cause.params.leftKind)),
      rightKind:
        cause.params.rightKind === undefined ? '' : t(fileKindMessageKey(cause.params.rightKind))
    })
  }
  return cause instanceof Error ? cause.message : String(cause)
}

/** Localizes the known snapshot import failures; unknown details pass through. */
function snapshotImportNotice(cause: unknown): Notice {
  const copy = snapshotImportCopy(cause)
  return copy === null ? detailNotice(errorText(cause)) : copyNotice(copy.key, copy.params)
}

/** Localizes a snapshot that cannot serve a drilldown body. */
function snapshotContentNotice(cause: unknown, displayPath: string): Notice {
  const copy = snapshotContentCopy(cause, displayPath)
  return copy === null ? detailNotice(errorText(cause)) : copyNotice(copy.key, copy.params)
}

/** Localizes the built-in sample library failure; unknown details pass through. */
function sampleErrorNotice(cause: unknown): Notice {
  return cause instanceof SampleLibraryError
    ? copyNotice('shell.error.sampleRead')
    : detailNotice(errorText(cause))
}

/** Multi-session workbench shell: toolbar, split work area and status bar. */
export function Workbench({ platform }: { readonly platform: PlatformPort }): JSX.Element {
  const { language, t } = useI18n()
  const tier = useWidthTier()
  /** Whether an entry shows its copy at this window width (never an entry drop). */
  const labelShown = (entry: ShellEntryId): boolean => entryPresentation(entry, tier) === 'label'
  const [status, setStatus] = useState<WorkbenchStatus>('empty')
  const [sessions, setSessions] = useState<readonly WorkbenchSession[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState<Notice | null>(null)
  const [codeMerge, setCodeMerge] = useState<Record<string, CodeMergeState>>({})
  const [csvAlign, setCsvAlign] = useState<CsvAlignState | null>(null)
  const [directoryBusy, setDirectoryBusy] = useState(false)
  /**
   * The report export is its own task: it never touches `directoryBusy`, so the
   * rest of the directory surface stays usable while a large report renders.
   */
  const [reportExporting, setReportExporting] = useState(false)
  const [reportProgress, setReportProgress] = useState<DirectoryReportProgress | null>(null)
  const [directoryProgress, setDirectoryProgress] = useState<DirectoryProgressState | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [noticeTone, setNoticeTone] = useState<'danger' | 'info'>('danger')
  const [directoryStates, setDirectoryStates] = useState<Record<string, DirectoryViewState>>({})
  const [directoryScroll, setDirectoryScroll] = useState<Record<string, DirectoryScroll>>({})
  /**
   * Privacy switch of the HTML report. It lives on the shell, not on a session,
   * so switching tabs or remounting the view keeps the user's choice.
   */
  const [hideLocalPaths, setHideLocalPaths] = useState(true)
  const [pendingLeft, setPendingLeft] = useState<PendingLeft | null>(null)
  const [syncPreview, setSyncPreview] = useState<SyncPreview | null>(null)
  const [templatePreview, setTemplatePreview] = useState<TemplatePreview | null>(null)
  /** The dirty session whose close is waiting for the unsaved-edits prompt. */
  const [closeTarget, setCloseTarget] = useState<WorkbenchSession | null>(null)
  const [compareDialogOpen, setCompareDialogOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const cache = useRef(createComparisonCache())
  const opSequence = useRef(0)
  /** The directory comparison that can still be cancelled, if one is running. */
  const activeDirectoryOperation = useRef<ActiveDirectoryOperation | null>(null)
  /** The running report export; the ref also guards against double starts. */
  const reportExportController = useRef<AbortController | null>(null)
  /** Latest launch-request handler; the subscription itself is installed once. */
  const launchRequest = useRef<(payload: CompareRequestPayload) => void>(() => undefined)

  useEffect(() => {
    launchRequest.current = (payload) => {
      if (payload.ok) {
        // The injected request follows the same route as the manual entry.
        void openCompareRequest(payload.request, (message) => report(detailNotice(message)))
        return
      }
      // A rejected launch source only reports; sessions and the active tab stay.
      report(detailNotice(payload.message))
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

  /**
   * Writes a file opened inside a file view (code / CSV / structured) back to
   * the session's own facts, so the tab and the panel read the same paths. The
   * update is functional: an in-flight read or comparison settling later never
   * rewrites the list from an older snapshot.
   */
  const handleSessionFileOpen = useCallback(
    (id: string, side: SidePosition, file: { readonly path: string; readonly text: string }) => {
      setSessions((current) =>
        current.map((session) =>
          session.id === id ? replaceFilePairSide(session, side, file) : session
        )
      )
    },
    []
  )

  /**
   * Switches the visible tab. Every open directory tab keeps its own comparison
   * tree, so this only moves `activeId`: no scan, no digest and no rebuild.
   */
  function selectSession(id: string | null): void {
    setActiveId(id)
  }

  /** Closes one session, landing on its neighbour and cleaning shell caches. */
  function closeSession(id: string): void {
    const index = sessions.findIndex((session) => session.id === id)
    if (index < 0) return

    const closing = sessions[index]
    const remaining = closeSessions(sessions, id)
    // The comparison (whole tree + row counts) is dropped with the session; the
    // cache entries under its roots go too, so a closed tab leaves nothing big.
    releaseSessionTree(cache.current, closing, remaining)
    if (activeId === id) {
      // Prefer the next tab; the previous one is the fallback at the right edge.
      setActiveId((remaining[index] ?? remaining[index - 1])?.id ?? null)
    }
    setSessions((current) => closeSessions(current, id))
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

  function report(next: Notice, tone: 'danger' | 'info' = 'danger'): void {
    setNotice(next)
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

  /** Back to the source directory view when it is still open. */
  function backToDirectory(sourceId: string): void {
    const destination = resolveDirectoryReturn(sessions, sourceId)
    if (!destination) {
      report(copyNotice('shell.notice.returnUnavailable'))
      return
    }
    if (destination.fallback) {
      const fallback = sessions.find((session) => session.id === destination.id)
      const title = fallback
        ? renderSessionText(describeSession(fallback).title, t)
        : destination.id
      report(copyNotice('shell.notice.returnFallback', { title }), 'info')
    }
    selectSession(destination.id)
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
      // id, so the real sessions, their trees, their order and the active one
      // survive.
      setSessions((current) => {
        if (current.length === 0) return loaded
        return [
          ...current.map(
            (session) => loaded.find((sample) => sample.id === session.id) ?? session
          ),
          ...loaded.filter((sample) => !current.some((s) => s.id === sample.id))
        ]
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
        report(sampleErrorNotice(cause))
        setStatus('ready')
        return
      }
      setSessions([])
      setActiveId(null)
      setError(sampleErrorNotice(cause))
      setStatus('error')
    }
  }

  function selectScene(scene: SceneId): void {
    const target = sessions.find((session) => session.scene === scene)
    if (target) selectSession(target.id)
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
    // A re-compare replaces the old comparison object; the new one (and any
    // other tab on the same roots) keeps the cache warm. The list semantics
    // live in `sessionStore`, shared verbatim with the memory harness. The
    // update is functional, so a slow read that settles after another commit
    // never rewrites the list from the snapshot its flow started with.
    setSessions((current) => commitSessionTree(cache.current, current, session))
    setActiveId(session.id)
  }

  /**
   * Refreshes one session in place with a newer model of itself. A sync rewrites
   * the compared roots, so the refreshed model gets a new id of its own; the tab
   * keeps the identity it was opened with instead of leaving a stale one behind.
   */
  function replaceSession(id: string, session: WorkbenchSession): void {
    setSessions((current) =>
      commitSessionTree(cache.current, current, session, { replaceId: id })
    )
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
    // Dismiss the new-comparison dialog before the scan starts: its modal overlay would
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
      if (comparison.leftSkipped + comparison.rightSkipped > 0) {
        report(
          copyNotice('shell.notice.skipped', {
            left: comparison.leftSkipped,
            right: comparison.rightSkipped
          }),
          'info'
        )
      }
      return true
    } catch (cause) {
      // Cancellation never commits a session; the shell keeps what it had.
      if (isOperationCancelled(cause)) {
        report(copyNotice('shell.notice.cancelled'), 'info')
        return false
      }
      const message = cause instanceof Error ? cause.message : String(cause)
      if (onError && !fromDialog) onError(message)
      else report(detailNotice(message))
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
      const message = filePairErrorMessage(cause, t)
      if (onError) onError(message)
      else report(detailNotice(message))
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

  /** Open file: left file then right file, no sample involved. */
  async function pickFilePair(onError?: (message: string) => void): Promise<boolean> {
    const reusable = pendingLeft?.kind === 'file' ? pendingLeft.path : null
    const leftPath = reusable ?? (await platform.selectFile({ title: t('shell.picker.leftFile') }))
    if (leftPath === null) return false

    const rightPath = await platform.selectFile({ title: t('shell.picker.rightFile') })
    if (rightPath === null) return false

    setPendingLeft(null)
    return openFilePair(leftPath, rightPath, onError)
  }

  /** Open folder: left directory then right directory, no sample involved. */
  async function pickDirectoryPair(onError?: (message: string) => void): Promise<boolean> {
    const reusable = pendingLeft?.kind === 'directory' ? pendingLeft.path : null
    const leftPath = reusable ?? (await platform.selectDirectory())
    if (leftPath === null) return false

    const rightPath = await platform.selectDirectory()
    if (rightPath === null) return false

    setPendingLeft(null)
    return runSidesCompare(directorySides(leftPath, rightPath), onError)
  }

  /** The dialog's open-file action feeds the same pair builder. */
  async function pickFilesFromDialog(): Promise<CompareOpenOutcome> {
    const feedback = { message: null as string | null }
    const opened = await pickFilePair((message) => {
      feedback.message = message
    })
    return opened ? { ok: true } : { ok: false, error: feedback.message }
  }

  /** The dialog's open-folder action uses the same picker flow as the toolbar. */
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
      report(copyNotice('shell.notice.dropUnresolved'))
      return
    }

    if (paths.length === 1) {
      const directory = await isDirectoryPath(platform, paths[0])
      setPendingLeft({ path: paths[0], kind: directory ? 'directory' : 'file' })
      report(
        copyNotice('shell.notice.dropSingle', {
          path: paths[0],
          kind: { message: directory ? 'common.kind.folder' : 'common.kind.file' }
        }),
        'info'
      )
      return
    }

    if (paths.length !== 2) {
      report(copyNotice('shell.notice.dropMany', { count: paths.length }))
      return
    }

    const [leftDirectory, rightDirectory] = await Promise.all([
      isDirectoryPath(platform, paths[0]),
      isDirectoryPath(platform, paths[1])
    ])
    if (leftDirectory !== rightDirectory) {
      report(copyNotice('shell.notice.dropMixed'))
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
    // A link to a directory is a leaf under the no-follow policy: never read a
    // "body" for it (which would fail) and never turn it into a file session.
    if (node.linkTargetKind === 'directory') {
      report(copyNotice('shell.notice.symlinkDirectory', { name: node.name }), 'info')
      return
    }

    const source = active
    const current = activeSides
    if (!source || source.scene !== 'directory' || current === null) return

    const target = classifyFile(node.name)
    if (target === null) {
      report(copyNotice('shell.notice.unsupportedDrilldown', { name: node.name }))
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
      report(snapshotContentNotice(cause, node.relativePath))
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
        title: t('shell.picker.exportSnapshot'),
        defaultPath: snapshotFileName(exported.snapshot.name),
        filters: [snapshotFileFilter(t('shell.filter.snapshot'))],
        content: exported.text
      })
      if (path === null) return
      report(
        exported.skipped > 0
          ? copyNotice(
              countKey(
                'shell.notice.exportedWithSkipped.one',
                'shell.notice.exportedWithSkipped.other',
                exported.entryCount
              ),
              { path, count: exported.entryCount, skipped: exported.skipped }
            )
          : copyNotice(
              countKey(
                'shell.notice.exported.one',
                'shell.notice.exported.other',
                exported.entryCount
              ),
              { path, count: exported.entryCount }
            ),
        'info'
      )
    } catch (cause) {
      report(detailNotice(cause instanceof Error ? cause.message : String(cause)))
    } finally {
      setDirectoryBusy(false)
    }
  }

  /**
   * Builds the self-contained HTML report of the visible directory comparison
   * and saves it through the existing `PlatformPort.saveFile` dialog.
   *
   * The export is an independent, cancellable task: counts and rows come from
   * the same comparison the view renders, progress is throttled to one paint per
   * window, and the save dialog only opens after the whole document exists. A
   * cancelled generation writes nothing; a cancelled save ends silently.
   */
  async function handleExportReport(): Promise<void> {
    const comparison = active?.scene === 'directory' ? active.directory : undefined
    if (!comparison || reportExportController.current !== null) return

    const controller = new AbortController()
    reportExportController.current = controller
    const totalRows = directoryReportSource(comparison).totalRows
    setReportExporting(true)
    setNotice(null)
    setReportProgress({ processedRows: 0, totalRows })
    const throttle = createReportProgressThrottle((progress) => setReportProgress(progress))
    let latest: DirectoryReportProgress = { processedRows: 0, totalRows }
    try {
      const built = await buildDirectoryReportForComparisonAsync(
        comparison,
        t,
        language,
        hideLocalPaths,
        {
          signal: controller.signal,
          onProgress: (progress) => {
            latest = progress
            throttle.push(progress)
          }
        }
      )
      throttle.finish(latest)
      // Generation is over; the native save dialog that follows cannot be
      // cancelled here, so the progress row leaves the toolbar first.
      setReportProgress(null)
      const path = await platform.saveFile({
        title: t('directory.report.saveTitle'),
        defaultPath: directoryReportFileName(comparison.leftName, comparison.rightName),
        filters: [directoryReportFilter(t('directory.report.filterName'))],
        content: built.html
      })
      if (path === null) return
      const saved = directoryReportSaveCopy(built, path)
      report(copyNotice(saved.key, saved.params), 'info')
    } catch (cause) {
      throttle.clear()
      if (isOperationCancelled(cause)) {
        report(copyNotice('directory.report.cancelled'), 'info')
      } else {
        report(detailNotice(errorText(cause)))
      }
    } finally {
      throttle.clear()
      reportExportController.current = null
      setReportProgress(null)
      setReportExporting(false)
    }
  }

  /** Stops the report generation before it reaches the save dialog. */
  function cancelReportExport(): void {
    reportExportController.current?.abort()
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
      report(
        copyNotice('shell.notice.snapshotMounted', {
          name: snapshot.name,
          side: { message: side === 'left' ? 'shell.side.left' : 'shell.side.right' }
        }),
        'info'
      )
    } catch (cause) {
      report(snapshotImportNotice(cause))
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
      setNotice(detailNotice(cause instanceof Error ? cause.message : String(cause)))
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
        copyNotice('shell.notice.syncComplete', {
          copied: result.copied,
          updated: result.updated,
          deleted: result.deleted
        })
      )
      setNoticeTone('info')
    } catch (cause) {
      setNotice(detailNotice(cause instanceof Error ? cause.message : String(cause)))
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
      setNotice(detailNotice(cause instanceof Error ? cause.message : String(cause)))
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
        copyNotice('shell.notice.templateComplete', {
          extracted: result.extracted,
          matched: result.verifiedMatched,
          missing: result.verifiedMissing,
          conflicts: result.verifiedConflicts
        })
      )
      setNoticeTone('info')
    } catch (cause) {
      setNotice(detailNotice(cause instanceof Error ? cause.message : String(cause)))
      setNoticeTone('danger')
    } finally {
      setDirectoryBusy(false)
    }
  }

  /**
   * A drilled-down file view carries an explicit way back to the directory
   * session it came from. The row is the first row of that view's
   * `view-toolbar` level (the view renders it), so the level stays single.
   */
  function drilldownLeading(sourceId: string): JSX.Element {
    const source = sessions.find((item) => item.id === sourceId)
    const label = t('shell.notice.returnAction')
    return (
      <>
        <ToolbarButton
          size="sm"
          data-shell-entry="drilldown-back"
          aria-label={label}
          icon={<ArrowLeft aria-hidden className="size-3.5" />}
          onClick={() => backToDirectory(sourceId)}
          title={t('shell.notice.returnTitle')}
        >
          {labelShown('drilldown-back') ? label : null}
        </ToolbarButton>
        <span
          className="min-w-0 truncate text-2xs text-content-muted"
          title={source ? renderSessionText(describeSession(source).subtitle, t) : undefined}
        >
          {t('shell.notice.sourceDirectory', {
            title: source ? renderSessionText(describeSession(source).title, t) : sourceId
          })}
        </span>
        <span aria-hidden className="h-3 w-px shrink-0 bg-line-subtle" />
      </>
    )
  }

  function renderScene(session: WorkbenchSession): JSX.Element | null {
    const sourceId = session.parentDirectoryId
    return renderSceneBody(session, sourceId ? drilldownLeading(sourceId) : null)
  }

  function renderSceneBody(
    session: WorkbenchSession,
    toolbarLeading: JSX.Element | null
  ): JSX.Element | null {
    switch (session.scene) {
      case 'directory': {
        const comparison = session.directory
        const sessionSides = session.sides
        if (!comparison || !sessionSides) return null
        const treeState = directoryStates[session.id] ?? EMPTY_DIRECTORY_STATE
        return (
          <DirectoryView
            key={directoryViewKey(session)}
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
            hideLocalPaths={hideLocalPaths}
            onHideLocalPathsChange={setHideLocalPaths}
            onExportReport={() => void handleExportReport()}
            reportExporting={reportExporting}
            reportProgress={reportProgress}
            onCancelReportExport={cancelReportExport}
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
            toolbarLeading={toolbarLeading}
            onDirtyChange={(dirty) => handleSessionDirty(session.id, dirty)}
            onBufferChange={(buffer) => handleSessionBuffer(session.id, buffer)}
            onOpenSide={(side, file) => handleSessionFileOpen(session.id, side, file)}
          />
        ) : (
          <CodeView
            key={session.id}
            fixture={CODE_SCENE}
            defaultMode={session.columns === 3 ? 'merge' : 'diff'}
            platform={platform}
            toolbarLeading={toolbarLeading}
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
              toolbarLeading={toolbarLeading}
              onAlignStateChange={handleCsvAlign}
              onOpenSide={(side, file) => handleSessionFileOpen(session.id, side, file)}
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
            toolbarLeading={toolbarLeading}
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
            toolbarLeading={toolbarLeading}
            onOpenSide={(side, file) => handleSessionFileOpen(session.id, side, file)}
          />
        ) : (
          <StructuredView
            key={session.id}
            fixture={STRUCTURED_SCENE}
            platform={platform}
            toolbarLeading={toolbarLeading}
          />
        )
    }
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-surface-base text-content-primary"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <header
        data-shell-level="app"
        className={cx(
          'flex shrink-0 items-center border-b border-line-subtle bg-surface-sunken',
          levelRowClasses('app'),
          levelBandClasses('app')
        )}
      >
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-sm bg-accent-soft text-accent">
            <GitCompare aria-hidden className="size-4" />
          </span>
          <div className="leading-tight">
            <h1 className="text-sm font-semibold tracking-tight">OpenCompare</h1>
            <p className="text-2xs text-content-muted">{t('shell.header.brandSubtitle')}</p>
          </div>
        </div>

        <SegmentedControl
          label={t('shell.viewSwitcher.label')}
          options={VIEW_OPTIONS.map((option) => ({
            ...option,
            label: t(option.labelKey),
            disabled: sessions.length === 0
          }))}
          value={active?.scene ?? 'directory'}
          onChange={selectScene}
        />

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* The manual entry is permanent: with or without sessions on screen. */}
          <ToolbarButton
            size="sm"
            data-shell-entry="new-compare"
            aria-label={t('shell.toolbar.newCompare')}
            icon={<GitCompare aria-hidden className="size-3.5" />}
            onClick={() => setCompareDialogOpen(true)}
            disabled={directoryBusy}
            title={t('shell.toolbar.newCompareTitle')}
          >
            {labelShown('new-compare') ? t('shell.toolbar.newCompare') : null}
          </ToolbarButton>
          {/* With a session on screen the empty-state CTAs are gone, so the
              toolbar keeps both real-open actions one click away. */}
          {status === 'empty' ? null : (
            <>
              <ToolbarButton
                size="sm"
                data-shell-entry="open-file"
                aria-label={t('shell.toolbar.openFile')}
                icon={<FileCode2 aria-hidden className="size-3.5" />}
                onClick={() => void pickFilePair()}
                disabled={directoryBusy}
                title={t('shell.toolbar.openFileTitle')}
              >
                {labelShown('open-file') ? t('shell.toolbar.openFile') : null}
              </ToolbarButton>
              <ToolbarButton
                size="sm"
                data-shell-entry="open-folder"
                aria-label={t('shell.toolbar.openFolder')}
                icon={<FolderOpen aria-hidden className="size-3.5" />}
                onClick={() => void pickDirectoryPair()}
                disabled={directoryBusy}
                title={t('shell.toolbar.openFolderTitle')}
              >
                {labelShown('open-folder') ? t('shell.toolbar.openFolder') : null}
              </ToolbarButton>
            </>
          )}
          <ToolbarButton
            size="sm"
            data-shell-entry="samples"
            aria-label={t('shell.toolbar.loadSamples')}
            icon={<Sparkles aria-hidden className="size-3.5" />}
            onClick={() => void load()}
            disabled={status === 'loading'}
            title={t('shell.toolbar.loadSamplesTitle')}
          >
            {labelShown('samples') ? t('shell.toolbar.loadSamples') : null}
          </ToolbarButton>
          <DropdownMenu
            size="sm"
            entryId="samples-menu"
            iconOnly={!labelShown('samples-menu')}
            label={t('shell.toolbar.samples')}
            menuLabel={t('shell.toolbar.samplesMenu')}
            icon={<Layers aria-hidden className="size-3.5" />}
            items={sampleMenu(t)}
            onSelect={handleMenuSelect}
          />
          {/* Settings stays reachable in every workbench state, so the language
              can be switched during an empty screen or a running scan. */}
          <IconButton
            data-shell-entry="settings"
            label={t('shell.settings.open')}
            icon={<Settings aria-hidden className="size-3.5" />}
            onClick={() => setSettingsOpen(true)}
          />
        </div>
      </header>

      {status === 'ready' && sessions.length > 0 ? (
        <div
          data-shell-level="sessions"
          className={cx(
            'flex shrink-0 border-b border-line-subtle bg-surface-base',
            levelRowClasses('sessions'),
            levelBandClasses('sessions')
          )}
        >
          <div data-shell-entry="tab-select" className="flex min-w-0 flex-1 items-center">
            <SessionTabs
              tabs={sessions.map((session) => {
                const display = describeSession(session)
                return {
                  id: session.id,
                  title: renderSessionText(display.title, t),
                  subtitle: renderSessionText(display.subtitle, t),
                  icon: VIEW_OPTIONS.find((option) => option.value === session.scene)?.icon,
                  dirty: session.dirty ?? false
                }
              })}
              activeId={activeId}
              onSelect={selectSession}
              onClose={requestCloseSession}
            />
          </div>
        </div>
      ) : null}

      {/* Notices and the live directory progress share one event band: it only
          exists while one of them has something to say. */}
      {notice || directoryProgress ? (
        <div
          data-shell-level="events"
          className={cx(
            'flex shrink-0 flex-col border-b border-line-subtle',
            levelBandClasses('events')
          )}
        >
          {notice ? (
            <p
              role="alert"
              className={cx(
                'flex items-center bg-surface-base text-2xs',
                levelRowClasses('events'),
                noticeTone === 'info' ? 'text-diff-added' : 'text-danger'
              )}
            >
              <span className="min-w-0 truncate" title={noticeText(notice, t)}>
                {noticeText(notice, t)}
              </span>
            </p>
          ) : null}

          {/* Directory-comparison progress lives on the shell so the empty state
              and an open session show the very same live bar. */}
          {directoryProgress ? (
            <div
              role="status"
              aria-label={t('shell.progress.label')}
              aria-live="polite"
              className={cx(
                'flex items-center bg-surface-sunken text-2xs',
                levelRowClasses('events')
              )}
            >
              <span className="shrink-0 font-medium text-content-primary">
                {t(
                  directoryProgress.phase === 'scan'
                    ? 'shell.progress.scanning'
                    : 'shell.progress.digesting'
                )}
              </span>
              <span aria-hidden className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-surface-hover">
                <span className="block h-full w-1/2 animate-pulse rounded-full bg-accent" />
              </span>
              <span className="shrink-0 text-content-secondary">
                {directoryProgress.phase === 'scan'
                  ? t(
                      countKey(
                        'shell.progress.scanned.one',
                        'shell.progress.scanned.other',
                        directoryProgress.files
                      ),
                      { count: directoryProgress.files }
                    )
                  : t(
                      countKey(
                        'shell.progress.verified.one',
                        'shell.progress.verified.other',
                        directoryProgress.phaseFiles
                      ),
                      { count: directoryProgress.phaseFiles }
                    )}
              </span>
              {directoryProgress.phase === 'digest' ? (
                <>
                  <span aria-hidden className="h-3 w-px shrink-0 bg-line-subtle" />
                  {/* The phase increment above is this run's progress; this is the
                      whole pipeline, so the number never drops at the hand-over. */}
                  <span className="shrink-0 text-content-secondary">
                    {t(
                      countKey(
                        'shell.progress.cumulative.one',
                        'shell.progress.cumulative.other',
                        directoryProgress.files
                      ),
                      { count: directoryProgress.files }
                    )}
                  </span>
                </>
              ) : null}
              <span aria-hidden className="h-3 w-px shrink-0 bg-line-subtle" />
              <span className="shrink-0 text-content-muted">
                {t('shell.progress.processed', { size: formatBytes(directoryProgress.bytes) })}
              </span>
              <ToolbarButton
                size="sm"
                className="ml-auto"
                onClick={cancelDirectoryCompare}
                disabled={directoryProgress.cancelling}
                title={t('shell.progress.cancelTitle')}
              >
                {t('shell.progress.cancel')}
              </ToolbarButton>
            </div>
          ) : null}
        </div>
      ) : null}

      <main className="flex min-h-0 flex-1 flex-col">
        {status === 'empty' ? (
          <StateView
            icon={<GitCompare aria-hidden className="size-5" />}
            title={t('shell.empty.title')}
            description={t('shell.empty.description')}
            action={
              <>
                <ToolbarButton
                  variant="primary"
                  icon={<GitCompare aria-hidden className="size-3.5" />}
                  onClick={() => setCompareDialogOpen(true)}
                  disabled={directoryBusy}
                >
                  {t('shell.toolbar.newCompare')}
                </ToolbarButton>
                <ToolbarButton
                  icon={<FileCode2 aria-hidden className="size-3.5" />}
                  onClick={() => void pickFilePair()}
                  disabled={directoryBusy}
                >
                  {t('shell.toolbar.openFile')}
                </ToolbarButton>
                <ToolbarButton
                  icon={<FolderOpen aria-hidden className="size-3.5" />}
                  onClick={() => void pickDirectoryPair()}
                  disabled={directoryBusy}
                >
                  {t('shell.toolbar.openFolder')}
                </ToolbarButton>
              </>
            }
            hint={t('shell.empty.hint')}
          />
        ) : null}

        {status === 'loading' ? (
          <StateView
            icon={<LoaderCircle aria-hidden className="size-5 animate-spin" />}
            title={t('shell.loading.title')}
            description={t('shell.loading.description')}
          />
        ) : null}

        {status === 'error' ? (
          <StateView
            tone="danger"
            icon={<AlertTriangle aria-hidden className="size-5" />}
            title={t('shell.error.title')}
            description={error === null ? t('shell.error.unknown') : noticeText(error, t)}
            action={
              <ToolbarButton
                variant="danger"
                icon={<RefreshCw aria-hidden className="size-3.5" />}
                onClick={() => void load()}
              >
                {t('common.retry')}
              </ToolbarButton>
            }
            hint={t('shell.error.hint')}
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

      {settingsOpen ? (
        <SettingsDialog platform={platform} onClose={() => setSettingsOpen(false)} />
      ) : null}

      {closeTarget ? (
        <Dialog
          title={t('shell.closeUnsaved.title')}
          description={t('shell.closeUnsaved.description', {
            title: renderSessionText(describeSession(closeTarget).title, t)
          })}
          onClose={() => setCloseTarget(null)}
          footer={
            <>
              <ToolbarButton onClick={() => setCloseTarget(null)}>
                {t('shell.closeUnsaved.continue')}
              </ToolbarButton>
              <ToolbarButton variant="danger" onClick={() => closeSession(closeTarget.id)}>
                {t('shell.closeUnsaved.discard')}
              </ToolbarButton>
            </>
          }
        >
          <p className="text-2xs text-content-secondary">{t('shell.closeUnsaved.body')}</p>
        </Dialog>
      ) : null}

      <StatusBar>
        <StatusEntry label={t('shell.status.session')} value={active ? active.id : '—'} />
        <span aria-hidden className="h-3 w-px shrink-0 bg-line-subtle" />
        <StatusEntry label={t('shell.status.platform')} value={platform.kind} />
        {legend ? (
          <>
            <span aria-hidden className="h-3 w-px shrink-0 bg-line-subtle" />
            <CompositionLegend composition={legend} />
          </>
        ) : null}
        {active ? (
          <span className="ml-auto flex shrink-0 items-center gap-3">
            {describeSession(active).stats.map((stat) => (
              <StatusEntry
                key={stat.key}
                label={t(stat.key)}
                value={
                  active.scene === 'code' && stat.key === 'shell.stat.conflicts' && activeMerge
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
