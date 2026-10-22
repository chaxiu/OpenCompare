/**
 * Renderer-side snapshot orchestration.
 *
 * Binds the `.ocsnap.json` protocol engine in `@core/directory/snapshot` to the
 * workbench: exports either comparison side to canonical snapshot text, mounts
 * imported documents as one side (recomputing through the regular comparison
 * engine), and resolves a snapshot-owned file body for drilldown.
 *
 * Two deliberate details keep snapshot-vs-directory comparisons honest:
 * snapshot entries are copied into the shared `ComparisonCache` keyed by their
 * mounted path, so the engine trusts the captured digest instead of reading a
 * body the snapshot may not have inlined; and snapshot bodies are only ever
 * resolved through {@link readSnapshotContent}, never handed to `PlatformPort`
 * (its virtual `/snapshots/...` paths do not exist there).
 *
 * DOM access is confined to the import plumbing (`FileReader`), while export
 * text is handed to `PlatformPort.saveFile`, so the module behaves identically
 * in Electron and the web runtime and a jsdom component test can drive it.
 */
import { REMOTE_SNAPSHOT, DIRECTORY_SAMPLE_PATHS } from '@shared/fixtures'
import type { FileDialogFilter, PlatformPort } from '@shared/platform/types'
import type { SnapshotDocument } from '@shared/snapshot'
import { scanDirectory } from '@core/directory/compare'
import type {
  ComparisonCache,
  ComparisonIoOptions,
  DirectoryComparison,
  ProgressReporter
} from '@core/directory/compare'
import {
  SNAPSHOT_MOUNT_ROOT,
  SnapshotContentError,
  SnapshotFormatError,
  buildSnapshot,
  compareDirectorySides,
  parseSnapshot,
  readSnapshotContent,
  serializeSnapshot
} from '@core/directory/snapshot'
import type { ComparisonSide } from '@core/directory/snapshot'
import { classifyFile } from './fileKinds'
import { digestFilesForComparison } from '../platform'

export type SidePosition = 'left' | 'right'

/** The two comparison inputs the workbench is currently comparing. */
export interface ComparisonSides {
  readonly left: ComparisonSide
  readonly right: ComparisonSide
}

/** One side's snapshot document plus the virtual root it is mounted at. */
export interface SnapshotMount {
  readonly snapshot: SnapshotDocument
  readonly mountPath: string
}

/** A resolved snapshot-owned file, addressed by its root-relative path. */
export interface MountedSnapshotFile {
  readonly snapshot: SnapshotDocument
  readonly relativePath: string
}

/** A built/round-tripped snapshot ready to download. */
export interface SnapshotExport {
  readonly snapshot: SnapshotDocument
  readonly text: string
  readonly entryCount: number
  /** Files left out of the export because their body could not be read. */
  readonly skipped: number
}

function basename(path: string): string {
  const normalized = path.replace(/[\\/]+$/, '')
  const separator = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  return separator === -1 ? normalized : normalized.slice(separator + 1)
}

/* ------------------------------------------------------------------ */
/* Sides and mounts                                                    */
/* ------------------------------------------------------------------ */

/** Virtual mount root of one snapshot side, mirroring the engine's default. */
export function snapshotMountPath(position: SidePosition, name: string): string {
  const label = name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return `${SNAPSHOT_MOUNT_ROOT}/${position}/${label === '' ? 'snapshot' : label}`
}

/** Both sides are real directories rooted at the given paths. */
export function directorySides(leftRoot: string, rightRoot: string): ComparisonSides {
  return {
    left: { kind: 'directory', path: leftRoot },
    right: { kind: 'directory', path: rightRoot }
  }
}

/** The built-in "local sample directory vs remote-prod snapshot" comparison. */
export function remoteSnapshotSides(): ComparisonSides {
  return {
    left: { kind: 'directory', path: DIRECTORY_SAMPLE_PATHS.left },
    right: snapshotSide('right', REMOTE_SNAPSHOT.snapshot)
  }
}

/** Wraps a document as a snapshot side, always with an explicit mount path. */
export function snapshotSide(position: SidePosition, snapshot: SnapshotDocument): ComparisonSide {
  return { kind: 'snapshot', snapshot, mountPath: snapshotMountPath(position, snapshot.name) }
}

/** Replaces one side, keeping the discriminated union intact. */
export function withSide(
  sides: ComparisonSides,
  position: SidePosition,
  side: ComparisonSide
): ComparisonSides {
  return position === 'left' ? { ...sides, left: side } : { ...sides, right: side }
}

/** Parses imported `.ocsnap.json` text; throws {@link SnapshotFormatError} when invalid. */
export function parseSnapshotText(text: string): SnapshotDocument {
  return parseSnapshot(text)
}

/** The mounted snapshot of each snapshot side, in left → right order. */
export function snapshotMounts(sides: ComparisonSides): readonly SnapshotMount[] {
  const mounts: SnapshotMount[] = []
  for (const position of ['left', 'right'] as const) {
    const side = sides[position]
    if (side.kind !== 'snapshot') continue
    mounts.push({
      snapshot: side.snapshot,
      mountPath: side.mountPath ?? snapshotMountPath(position, side.snapshot.name)
    })
  }
  return mounts
}

/** Resolves a mounted path back to the snapshot that owns it, when any. */
export function findSnapshotMount(
  sides: ComparisonSides,
  path: string
): MountedSnapshotFile | null {
  for (const mount of snapshotMounts(sides)) {
    if (path.startsWith(`${mount.mountPath}/`)) {
      return { snapshot: mount.snapshot, relativePath: path.slice(mount.mountPath.length + 1) }
    }
  }
  return null
}

/* ------------------------------------------------------------------ */
/* Comparison                                                          */
/* ------------------------------------------------------------------ */

/**
 * Seeds the comparison cache with each snapshot's captured digests, so the
 * engine can classify a pair whose size and mtime agree without reading a body
 * the document may not have inlined.
 */
export function seedSnapshotCache(cache: ComparisonCache, sides: ComparisonSides): void {
  for (const mount of snapshotMounts(sides)) {
    for (const entry of mount.snapshot.entries) {
      cache.hashes.set(`${mount.mountPath}/${entry.path}`, {
        size: entry.size,
        modifiedMs: entry.modifiedMs,
        hash: entry.sha256
      })
    }
  }
}

/** Workbench-supplied progress, cancellation and digest tuning of one comparison. */
export interface CompareSidesOptions {
  /** Aborts scanning and digesting; the comparison rejects without a result. */
  readonly signal?: AbortSignal
  /** Ties the platform digest calls to one cancellable operation. */
  readonly operationId?: string
  readonly onProgress?: ProgressReporter
  /** Test/support override of the digest chunk size. */
  readonly digestBatchSize?: number
}

/** Compares two sides (either real directory or mounted snapshot) and refreshes the cache. */
export function compareSides(
  platform: PlatformPort,
  sides: ComparisonSides,
  cache: ComparisonCache,
  options: CompareSidesOptions = {}
): Promise<DirectoryComparison> {
  seedSnapshotCache(cache, sides)
  const { operationId, digestBatchSize } = options
  const ioOptions: ComparisonIoOptions = {
    signal: options.signal,
    onProgress: options.onProgress,
    digestBatchSize,
    // One `operationId` covers every digest chunk of this comparison.
    digestFiles: (paths) =>
      digestFilesForComparison(
        platform,
        paths,
        operationId === undefined ? undefined : { operationId }
      ),
    listDirectories: (paths) => platform.listDirectories(paths)
  }
  return compareDirectorySides(
    sides.left,
    sides.right,
    (path) => platform.listDirectory(path),
    (path) => platform.readTextFile(path),
    cache,
    undefined,
    ioOptions
  )
}

/** Reads one file body, routing snapshot paths through the mounted document. */
export async function readSideFile(
  platform: PlatformPort,
  sides: ComparisonSides,
  path: string
): Promise<string> {
  const mounted = findSnapshotMount(sides, path)
  if (mounted === null) return platform.readTextFile(path)
  return readSnapshotContent(mounted.snapshot, mounted.relativePath)
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

const inlinesDrilldownText = (relativePath: string): boolean => classifyFile(relativePath) !== null

/**
 * Exports one side as canonical snapshot text. A real directory is scanned and
 * captured (metadata + SHA-256, with drilldown-able text inlined); a mounted
 * snapshot is re-serialized unchanged, so the round-trip is exact.
 */
export async function exportSideSnapshot(
  platform: PlatformPort,
  side: ComparisonSide
): Promise<SnapshotExport> {
  if (side.kind === 'snapshot') {
    return {
      snapshot: side.snapshot,
      text: serializeSnapshot(side.snapshot),
      entryCount: side.snapshot.entries.length,
      skipped: 0
    }
  }

  const tree = await scanDirectory(side.path, (path) => platform.listDirectory(path), {
    listDirectories: (paths) => platform.listDirectories(paths)
  })
  const { snapshot, skipped } = await buildSnapshot(tree, {
    name: basename(side.path),
    exportedAt: new Date().toISOString(),
    readTextFile: (path) => platform.readTextFile(path),
    inlineContent: (relativePath) => inlinesDrilldownText(relativePath)
  })
  return {
    snapshot,
    text: serializeSnapshot(snapshot),
    entryCount: snapshot.entries.length,
    skipped
  }
}

/* ------------------------------------------------------------------ */
/* DOM plumbing (import picker)                                        */
/* ------------------------------------------------------------------ */

/** Save-dialog filter of the `.ocsnap.json` protocol. */
export const SNAPSHOT_FILE_FILTER: FileDialogFilter = {
  name: 'OpenCompare 快照',
  extensions: ['ocsnap.json', 'json']
}

/** Canonical file name of a snapshot export: `<name>.ocsnap.json`. */
export function snapshotFileName(name: string): string {
  return `${name}.ocsnap.json`
}

/** Reads a picked file (or any blob) as UTF-8 text. */
export function readFileText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('读取所选文件失败。'))
    reader.readAsText(file)
  })
}

/* ------------------------------------------------------------------ */
/* Readable error hints                                                */
/* ------------------------------------------------------------------ */

/** Readable Chinese hint for a rejected snapshot import. */
export function describeSnapshotImportError(error: unknown): string {
  if (error instanceof SnapshotFormatError) {
    switch (error.code) {
      case 'invalid-json':
        return '快照导入失败：所选文件不是合法 JSON。'
      case 'invalid-schema':
        return '快照导入失败：schema 不是 opencompare.snapshot/v1。'
      case 'invalid-metadata':
        return '快照导入失败：缺少有效的 name / exportedAt 元数据。'
      case 'invalid-path':
        return `快照导入失败：路径非法${error.path ? `（${error.path}）` : ''}。`
      case 'duplicate-path':
        return `快照导入失败：存在重复路径${error.path ? `（${error.path}）` : ''}。`
      case 'invalid-hash':
        return `快照导入失败：sha256 格式非法${error.path ? `（${error.path}）` : ''}。`
      case 'invalid-entry':
        return '快照导入失败：条目缺少必需字段或类型不正确。'
    }
  }
  return error instanceof Error ? error.message : String(error)
}

/** Readable Chinese hint when a snapshot cannot serve a drilldown body. */
export function describeSnapshotContentError(error: unknown, displayPath: string): string {
  if (error instanceof SnapshotContentError) {
    if (error.code === 'content-not-inlined') {
      return `该快照未内联 ${displayPath} 的内容，无法离线下钻对比；导出时未内联该文件。`
    }
    return `快照中不存在 ${displayPath}。`
  }
  return error instanceof Error ? error.message : String(error)
}
