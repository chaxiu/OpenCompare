/**
 * Renderer-side comparison orchestration: turns comparison results and opened
 * real paths into workbench sessions (the directory session itself, plus the
 * file pair sessions a picker, a drag & drop or a drilldown produces). Running a
 * comparison lives in `snapshotOps` / `loadSampleSessions`.
 */
import type { TextSample } from '@shared/fixtures'
import type { PlatformPort } from '@shared/platform/types'
import { trackLive } from '@shared/perf/liveness'
import type {
  ComparisonCache,
  DirectoryComparison,
  DirectoryDiffNode
} from '@core/directory/compare'
import type { DrilldownTarget } from './fileKinds'
import { baseName, classifyFile } from './fileKinds'
import type { AdhocFilePair, DirectorySummary, WorkbenchSession } from './session'
import { countTextLines, parseCsvTable } from './session'
import type { ComparisonSides } from './snapshotOps'

/**
 * Stable id of one directory comparison, derived from the two roots so that
 * opening a different pair adds a tab while reopening the same pair reuses it.
 */
export function directorySessionId(leftRoot: string, rightRoot: string): string {
  return `directory:${leftRoot} ↔ ${rightRoot}`
}

/**
 * Monotonic revision per comparison object, used as part of the view key.
 *
 * The key is what makes a re-compare a *mount*, not an update: React drops the
 * old `DirectoryView` / `TreeView` subtree (and its virtualiser closures) at
 * commit time, so the previous comparison tree and row models stop being
 * reachable without waiting for a GC. The map is weak: it never extends the
 * lifetime of a comparison nobody holds any more.
 */
const comparisonRevisions = new WeakMap<DirectoryComparison, number>()
let nextComparisonRevision = 1

export function directoryComparisonKey(comparison: DirectoryComparison): string {
  let revision = comparisonRevisions.get(comparison)
  if (revision === undefined) {
    revision = nextComparisonRevision
    nextComparisonRevision += 1
    comparisonRevisions.set(comparison, revision)
  }
  return `c${revision}`
}

/**
 * Key of the directory view showing one session. A re-compare keeps the tab id
 * but changes the comparison, so the view (and its row models) remounts; a tab
 * switch changes both.
 */
export function directoryViewKey(session: WorkbenchSession): string {
  const comparison = session.directory
  return comparison === undefined
    ? session.id
    : `${session.id}#${directoryComparisonKey(comparison)}`
}

/** The counts and skip totals a directory tab keeps while it is inactive. */
export function summarizeComparison(comparison: DirectoryComparison): DirectorySummary {
  return {
    counts: { ...comparison.counts },
    fileCount: comparison.fileCount,
    leftSkipped: comparison.leftSkipped,
    rightSkipped: comparison.rightSkipped,
    skipped: comparison.skipped
  }
}

/** Stats derived from a comparison's four-state counts. */
function comparisonStats(
  counts: DirectoryComparison['counts']
): WorkbenchSession['stats'] {
  const { same, added, removed, modified } = counts
  return [
    { label: '文件（源）', value: same + removed + modified },
    { label: '文件（目标）', value: same + added + modified },
    { label: '差异', value: added + removed + modified }
  ]
}

/**
 * Attaches a freshly built comparison to one existing session, preserving its
 * identity (id, title, subtitle, sides). The first build and an activation
 * rebuild share this path, so liveness accounting can never be bypassed.
 */
export function attachDirectoryComparison(
  session: WorkbenchSession,
  comparison: DirectoryComparison
): WorkbenchSession {
  trackLive('comparison', comparison)
  directoryComparisonKey(comparison)
  return {
    ...session,
    composition: { ...comparison.counts, conflict: 0 },
    stats: comparisonStats(comparison.counts),
    directory: comparison,
    directorySummary: summarizeComparison(comparison)
  }
}

/** Drops one session's comparison tree while keeping its restorable summary. */
export function detachDirectoryComparison(session: WorkbenchSession): WorkbenchSession {
  const comparison = session.directory
  if (comparison === undefined) return session
  return {
    ...session,
    directory: undefined,
    directorySummary: session.directorySummary ?? summarizeComparison(comparison)
  }
}

/** Builds the directory session whose stats and inputs come from the runtime comparison. */
export function createDirectorySession(
  comparison: DirectoryComparison,
  sides: ComparisonSides
): WorkbenchSession {
  return attachDirectoryComparison(
    {
      id: directorySessionId(comparison.leftRoot, comparison.rightRoot),
      scene: 'directory',
      title: `${comparison.leftName} ↔ ${comparison.rightName}`,
      // The subtitle carries the two real roots, so a session opened from the file
      // system never reads as a sample path.
      subtitle: `${comparison.leftRoot} ↔ ${comparison.rightRoot}`,
      columns: 2,
      stats: [],
      sides
    },
    comparison
  )
}

/** Every root a session compares from, whether it holds the tree or only its summary. */
function sessionRoots(session: WorkbenchSession): string[] {
  const roots: string[] = []
  if (session.directory !== undefined) {
    roots.push(session.directory.leftRoot, session.directory.rightRoot)
  }
  const sides = session.sides
  if (sides !== undefined) {
    for (const side of [sides.left, sides.right]) {
      if (side.kind === 'directory') roots.push(side.path)
    }
  }
  return roots
}

/**
 * Releases one closed or replaced session's cache entries. A summary-only
 * session has no comparison, so its roots come from `sides`; both forms are
 * canonicalised before the in-use comparison, so closing an alias tab never
 * evicts the real path's warm entries.
 */
export function releaseSessionTree(
  cache: ComparisonCache,
  session: WorkbenchSession,
  openSessions: readonly WorkbenchSession[]
): number {
  const roots = sessionRoots(session)
  if (roots.length === 0) return 0
  const inUse = new Set<string>()
  for (const open of openSessions) {
    for (const root of sessionRoots(open)) inUse.add(cache.canonicalPath(root))
  }
  const release = [
    ...new Set(roots.map((root) => cache.canonicalPath(root)).filter((root) => !inUse.has(root)))
  ]
  return cache.evictUnderRoots(release)
}

/**
 * Releases one directory comparison whose session was closed or replaced:
 * evicts the digest-cache entries under its two roots, unless another open
 * session still compares from that root. Callers pass the sessions that remain
 * open (for a replacement, including the new session for the same pair), so a
 * shared root keeps its warm cache. The old `DirectoryComparison` object is
 * dropped by the caller's session update; nothing here waits for GC.
 */
export function releaseDirectoryComparison(
  cache: ComparisonCache,
  comparison: DirectoryComparison,
  openSessions: readonly WorkbenchSession[]
): number {
  return releaseSessionTree(
    cache,
    {
      id: directorySessionId(comparison.leftRoot, comparison.rightRoot),
      scene: 'directory',
      title: '',
      subtitle: '',
      columns: 2,
      stats: [],
      directory: comparison
    },
    openSessions
  )
}

/**
 * Assembles a two-column file session from two resolved sides. Both the
 * directory-tree drilldown and a real file pair opened from disk land here, so
 * there is exactly one file-session model.
 */
export function createFilePairSession(
  id: string,
  title: string,
  target: DrilldownTarget,
  left: TextSample,
  right: TextSample
): WorkbenchSession {
  const delimiter = target.delimiter ?? ','
  const adhoc: AdhocFilePair = {
    scene: target.kind,
    pair: { left, right },
    delimiter: target.delimiter,
    format: target.format,
    tables:
      target.kind === 'csv'
        ? {
            left: parseCsvTable({ ...left, delimiter }),
            right: parseCsvTable({ ...right, delimiter })
          }
        : undefined
  }

  return {
    id,
    scene: target.kind,
    title,
    // The subtitle names the two resolved side paths, so a drilldown out of a
    // mounted snapshot points back at its `/snapshots/...` mount.
    subtitle: `${left.path} ↔ ${right.path} · ${target.label}`,
    columns: 2,
    stats: [
      { label: '行数（左）', value: countTextLines(left.text) },
      { label: '行数（右）', value: countTextLines(right.text) }
    ],
    adhoc
  }
}

/** Builds the file-level session a directory-tree double-click opens. */
export function createDrilldownSession(
  parentId: string,
  node: DirectoryDiffNode,
  target: DrilldownTarget,
  leftText: string,
  rightText: string
): WorkbenchSession {
  return {
    // The parent scope keeps two directory sessions' same-path drilldowns apart,
    // so returning each one lands back on the tree it came from.
    ...createFilePairSession(
      `file:${parentId}::${node.relativePath}`,
      node.name,
      target,
      { path: node.leftPath ?? `${node.relativePath}（左不存在）`, text: leftText },
      { path: node.rightPath ?? `${node.relativePath}（右不存在）`, text: rightText }
    ),
    parentDirectoryId: parentId
  }
}

/**
 * Where「返回上级目录视图」lands. The source directory session when it is still
 * open, otherwise any remaining directory session (reported as a fallback), or
 * `null` when the workbench has no directory view left to return to.
 */
export function resolveDirectoryReturn(
  sessions: readonly WorkbenchSession[],
  sourceId: string
): { readonly id: string; readonly fallback: boolean } | null {
  const source = sessions.find(
    (session) => session.id === sourceId && session.scene === 'directory'
  )
  if (source) return { id: source.id, fallback: false }

  const fallback = sessions.find((session) => session.scene === 'directory')
  return fallback ? { id: fallback.id, fallback: true } : null
}

/**
 * Classifies one side of an opened pair, rejecting an unsupported extension with
 * the workbench's usual readable notice.
 */
function requireComparableFile(path: string): { readonly target: DrilldownTarget } {
  const name = baseName(path)
  const target = classifyFile(name)
  if (target === null) {
    throw new Error(`暂不支持对比 ${name}（仅支持代码 / 文本 · CSV / TSV · JSON / YAML）。`)
  }
  return { target }
}

/**
 * Opens two real absolute paths as one file-level session: the same model a
 * drilldown produces (code text / delimited table / structured document).
 * Rejects with a readable message when a side is unsupported or the two sides
 * are not the same kind, so the caller neither builds nor replaces a session.
 */
export async function openFilePairSession(
  platform: PlatformPort,
  leftPath: string,
  rightPath: string
): Promise<WorkbenchSession> {
  const left = requireComparableFile(leftPath)
  const right = requireComparableFile(rightPath)
  // One session renders one file family, so a mixed pair (e.g. JSON ↔ YAML) is
  // rejected instead of silently picking a side's format.
  if (left.target.label !== right.target.label) {
    throw new Error(
      `两侧文件类型不一致（${baseName(leftPath)} 是 ${left.target.label}，${baseName(rightPath)} 是 ${right.target.label}），请选择同类文件。`
    )
  }

  const [leftText, rightText] = await Promise.all([
    platform.readTextFile(leftPath),
    platform.readTextFile(rightPath)
  ])
  const leftName = baseName(leftPath)
  const rightName = baseName(rightPath)

  return createFilePairSession(
    `file:${leftPath} ↔ ${rightPath}`,
    leftName === rightName ? leftName : `${leftName} ↔ ${rightName}`,
    left.target,
    { path: leftPath, text: leftText },
    { path: rightPath, text: rightText }
  )
}
