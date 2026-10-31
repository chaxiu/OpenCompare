/**
 * One-way incremental / mirror sync planning and execution.
 *
 * A {@link SyncPlan} is derived from an existing {@link DirectoryComparison} in
 * one direction (`left → right` or `right → left`):
 *  - `copy`   — a file that exists only on the source side (new on the target),
 *  - `update` — a file that exists on both sides and compares as `modified`,
 *  - `delete` — a target-only file, listed in *mirror* mode only.
 *
 * `same` files never enter the plan, so re-running the same direction after
 * applying the plan (including the mirror deletions the user checked) yields an
 * empty plan (idempotent). Actual writes go through injected IO callbacks, which
 * the renderer binds to `PlatformPort`; the module itself stays pure and
 * Node-testable.
 */
import type { DirectoryEntry, PathProbeKind } from '@shared/platform/types'
import { OperationCancelledError, isOperationCancelled } from '../io'
import type { ComparisonCache, DirectoryComparison, DirectoryDiffNode, ScannedTree } from './compare'

export type SyncDirection = 'left-to-right' | 'right-to-left'
export type SyncMode = 'incremental' | 'mirror'

export interface SyncPlanItem {
  /** Root-relative POSIX path shared by the source and target sides. */
  readonly relativePath: string
  /** Absolute source path; `null` for a mirror deletion. */
  readonly sourcePath: string | null
  /** Absolute path the item is written to (or deleted from) on the target. */
  readonly targetPath: string
  readonly size: number
  /**
   * Source modification time copied onto the target so the comparison's
   * size/mtime fast path does not re-flag a freshly synced file as modified.
   */
  readonly modifiedMs: number
}

export interface SyncPlanGroup {
  readonly items: readonly SyncPlanItem[]
  readonly count: number
  readonly bytes: number
}

export interface SyncPlan {
  readonly direction: SyncDirection
  readonly mode: SyncMode
  readonly sourceRoot: string
  readonly targetRoot: string
  readonly copy: SyncPlanGroup
  readonly update: SyncPlanGroup
  readonly delete: SyncPlanGroup
  readonly totalCount: number
  readonly totalBytes: number
}

/** Joins a root directory and a root-relative POSIX path with the root's separator. */
export function joinRelativePath(root: string, relativePath: string): string {
  const separator = root.includes('\\') ? '\\' : '/'
  const trimmed = root.replace(/[\\/]+$/, '')
  if (relativePath === '') return trimmed
  return `${trimmed}${separator}${relativePath.split('/').join(separator)}`
}

function parentPath(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return index > 0 ? path.slice(0, index) : ''
}

function collectFiles(node: DirectoryDiffNode, out: DirectoryDiffNode[]): void {
  if (node.kind === 'file') {
    out.push(node)
    return
  }
  for (const child of node.children) collectFiles(child, out)
}

function group(items: readonly SyncPlanItem[]): SyncPlanGroup {
  return {
    items,
    count: items.length,
    bytes: items.reduce((total, item) => total + item.size, 0)
  }
}

/**
 * Builds the change list that turns the target side of `comparison` into the
 * source side. `targetRoot` overrides where writes land (used to materialise a
 * read-only sample tree into a writable sandbox before applying).
 */
export function buildSyncPlan(
  comparison: DirectoryComparison,
  direction: SyncDirection,
  mode: SyncMode,
  targetRoot?: string
): SyncPlan {
  const leftToRight = direction === 'left-to-right'
  const sourceRoot = leftToRight ? comparison.leftRoot : comparison.rightRoot
  const target = targetRoot ?? (leftToRight ? comparison.rightRoot : comparison.leftRoot)

  const files: DirectoryDiffNode[] = []
  collectFiles(comparison.root, files)

  const copy: SyncPlanItem[] = []
  const update: SyncPlanItem[] = []
  const remove: SyncPlanItem[] = []

  for (const file of files) {
    const sourcePath = leftToRight ? file.leftPath : file.rightPath
    const targetPath = leftToRight ? file.rightPath : file.leftPath
    const sourceSize = (leftToRight ? file.leftSize : file.rightSize) ?? 0
    const targetSize = (leftToRight ? file.rightSize : file.leftSize) ?? 0
    const sourceModifiedMs = (leftToRight ? file.leftModifiedMs : file.rightModifiedMs) ?? 0

    if (sourcePath !== undefined && targetPath === undefined) {
      copy.push({
        relativePath: file.relativePath,
        sourcePath,
        targetPath: joinRelativePath(target, file.relativePath),
        size: sourceSize,
        modifiedMs: sourceModifiedMs
      })
      continue
    }

    if (sourcePath !== undefined && targetPath !== undefined) {
      if (file.status === 'modified') {
        update.push({
          relativePath: file.relativePath,
          sourcePath,
          targetPath: joinRelativePath(target, file.relativePath),
          size: sourceSize,
          modifiedMs: sourceModifiedMs
        })
      }
      continue
    }

    if (sourcePath === undefined && targetPath !== undefined && mode === 'mirror') {
      remove.push({
        relativePath: file.relativePath,
        sourcePath: null,
        targetPath: joinRelativePath(target, file.relativePath),
        size: targetSize,
        modifiedMs: 0
      })
    }
  }

  const copyGroup = group(copy)
  const updateGroup = group(update)
  const deleteGroup = group(remove)

  return {
    direction,
    mode,
    sourceRoot,
    targetRoot: target,
    copy: copyGroup,
    update: updateGroup,
    delete: deleteGroup,
    totalCount: copyGroup.count + updateGroup.count + deleteGroup.count,
    totalBytes: copyGroup.bytes + updateGroup.bytes + deleteGroup.bytes
  }
}

/** IO seam the executor writes through; the app binds it to `PlatformPort`. */
export interface SyncIo {
  readonly readTextFile: (path: string) => Promise<string>
  readonly writeTextFile: (path: string, content: string, modifiedMs?: number) => Promise<void>
  readonly ensureDirectory: (path: string) => Promise<void>
  readonly deleteFile: (path: string) => Promise<void>
  /** Removes one **empty** directory; rollback only deletes directories it created. */
  readonly removeDirectory: (path: string) => Promise<void>
  /** `file` / `directory` / `missing` probe used by the preflight. */
  readonly statPath: (path: string) => Promise<PathProbeKind>
  /** One directory's entries; carries each entry's `isDirectory` / `modifiedMs`. */
  readonly listDirectory: (path: string) => Promise<readonly DirectoryEntry[]>
}

export interface SyncExecutionOptions {
  /**
   * Root-relative paths of mirror deletions the user explicitly kept checked.
   * Deletions are opt-in: when this is omitted (or empty) nothing is deleted,
   * so a caller that forgets to pass the checked set can never wipe a target.
   */
  readonly deletePaths?: readonly string[]
  /**
   * Cancels between single writes. A cancelled run rolls back exactly like a
   * failed one and rejects with {@link OperationCancelledError}.
   */
  readonly signal?: AbortSignal
}

export interface SyncExecution {
  readonly copied: number
  readonly updated: number
  readonly deleted: number
  /** Absolute target paths that changed, so caches can drop them. */
  readonly affected: readonly string[]
}

/** Temporary probe file a preflight writes and removes to test writability. */
export const SYNC_WRITE_PROBE_PREFIX = '.opencompare-sync-probe-'

/** Chinese gloss of the OS codes a sync write path can surface. */
const SYSTEM_CODE_GLOSS: Readonly<Record<string, string>> = {
  EACCES: '没有访问权限',
  EPERM: '没有访问权限',
  EISDIR: '目标位置是目录',
  EROFS: '目标所在磁盘为只读',
  EBUSY: '目标文件被其他程序占用',
  ENOTDIR: '目标路径的上级不是目录',
  ENOENT: '目标路径不存在或已被移动',
  ENOTEMPTY: '目标目录非空',
  EEXIST: '目标已存在',
  ENOSPC: '磁盘空间不足'
}

/**
 * A target-side write refused before or during execution. The message is a
 * readable Chinese sentence carrying the offending path and, when the OS gave
 * one, the system code (`EACCES`, `EISDIR`, …); the raw IPC wrapper never leaks.
 */
export class SyncTargetError extends Error {
  readonly path: string
  readonly code: string | undefined

  constructor(path: string, code: string | undefined, detail: string) {
    super(`无法同步到目标 ${path}：${detail}${code === undefined ? '' : `（${code}）`}。`)
    this.name = 'SyncTargetError'
    this.path = path
    this.code = code
  }
}

/** Cancellation vocabulary of a sync run: distinct from a failure, no OS code. */
function syncCancelledError(): OperationCancelledError {
  return new OperationCancelledError('操作已取消：本次同步已停止，目标侧已回滚到执行前状态。')
}

function checkCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw syncCancelledError()
}

function systemCodeOf(error: unknown): string | undefined {
  const direct = (error as { code?: unknown } | null)?.code
  if (typeof direct === 'string' && /^E[A-Z]+$/.test(direct)) return direct
  const text = error instanceof Error ? error.message : String(error)
  return /[（(](E[A-Z]+)[）)]/.exec(text)?.[1]
}

/** One failure shape for every IO refusal: readable sentence + path + code. */
function syncFailure(
  path: string,
  error: unknown,
  fallback: string
): SyncTargetError | OperationCancelledError {
  if (isOperationCancelled(error)) return syncCancelledError()
  if (error instanceof SyncTargetError) return error
  const code = systemCodeOf(error)
  return new SyncTargetError(path, code, code === undefined ? fallback : SYSTEM_CODE_GLOSS[code] ?? fallback)
}

async function targetCall<T>(path: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action()
  } catch (error) {
    throw syncFailure(path, error, '文件系统操作失败')
  }
}

function nameOf(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return index === -1 ? path : path.slice(index + 1)
}

/** Cached preflight view of the target: path shapes and directory listings. */
interface SyncTargetState {
  readonly io: SyncIo
  readonly targetRoot: string
  readonly shapes: Map<string, PathProbeKind>
  readonly listings: Map<string, Map<string, DirectoryEntry>>
}

async function shapeOf(state: SyncTargetState, path: string): Promise<PathProbeKind> {
  const cached = state.shapes.get(path)
  if (cached !== undefined) return cached
  const shape = await targetCall(path, () => state.io.statPath(path))
  state.shapes.set(path, shape)
  return shape
}

async function entriesOf(
  state: SyncTargetState,
  directory: string
): Promise<Map<string, DirectoryEntry>> {
  const cached = state.listings.get(directory)
  if (cached !== undefined) return cached
  const entries = await targetCall(directory, () => state.io.listDirectory(directory))
  const byName = new Map(entries.map((entry) => [entry.name, entry]))
  state.listings.set(directory, byName)
  return byName
}

/** The current target entry for one planned path, `undefined` when absent. */
async function entryAt(
  state: SyncTargetState,
  targetPath: string
): Promise<DirectoryEntry | undefined> {
  const parent = parentPath(targetPath)
  if (parent === '') return undefined
  if ((await shapeOf(state, parent)) !== 'directory') return undefined
  return (await entriesOf(state, parent)).get(nameOf(targetPath))
}

/** Every existing ancestor of `directory` must be a directory, not a file. */
async function assertDirectoryChain(state: SyncTargetState, directory: string): Promise<void> {
  let current = directory
  while (current !== '' && current !== state.targetRoot) {
    const shape = await shapeOf(state, current)
    if (shape === 'directory') return
    if (shape === 'file') {
      throw new SyncTargetError(current, 'ENOTDIR', SYSTEM_CODE_GLOSS.ENOTDIR)
    }
    current = parentPath(current)
  }
}

/**
 * Writes and removes a probe file in the target root, so a read-only target is
 * refused before any planned item is touched. The probe never survives.
 */
async function probeWritableTarget(state: SyncTargetState): Promise<void> {
  const probe = joinRelativePath(
    state.targetRoot,
    `${SYNC_WRITE_PROBE_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  )
  try {
    await state.io.writeTextFile(probe, '')
  } catch (error) {
    throw syncFailure(state.targetRoot, error, '无法写入目标目录')
  }
  try {
    await state.io.deleteFile(probe)
  } catch (error) {
    throw syncFailure(probe, error, '无法清理临时探测文件')
  }
}

/**
 * Refuses the whole run before the first planned write when the target root is
 * not writable or a planned position is occupied by a directory. Only reads (and
 * the removed probe) happen here, so a refused run leaves the target untouched.
 */
async function preflight(
  plan: SyncPlan,
  state: SyncTargetState,
  selected: ReadonlySet<string>
): Promise<void> {
  const rootShape = await shapeOf(state, plan.targetRoot)
  if (rootShape === 'file') {
    throw new SyncTargetError(plan.targetRoot, 'ENOTDIR', SYSTEM_CODE_GLOSS.ENOTDIR)
  }
  if (rootShape === 'missing') {
    throw new SyncTargetError(plan.targetRoot, 'ENOENT', SYSTEM_CODE_GLOSS.ENOENT)
  }

  const writes = [...plan.copy.items, ...plan.update.items]
  const deletes = plan.delete.items.filter((item) => selected.has(item.relativePath))

  for (const item of [...writes, ...deletes]) {
    const parent = parentPath(item.targetPath)
    if (parent === '') continue
    await assertDirectoryChain(state, parent)
    if ((await shapeOf(state, parent)) === 'directory') await entriesOf(state, parent)
  }

  for (const item of [...writes, ...deletes]) {
    const entry = await entryAt(state, item.targetPath)
    if (entry?.isDirectory === true) {
      throw new SyncTargetError(item.targetPath, 'EISDIR', SYSTEM_CODE_GLOSS.EISDIR)
    }
  }

  await probeWritableTarget(state)
}

interface FileBackup {
  readonly content: string
  readonly modifiedMs: number
}

/** Bytes + mtime of a target file the run is about to overwrite or delete. */
async function backupTarget(
  state: SyncTargetState,
  targetPath: string
): Promise<FileBackup | null> {
  const entry = await entryAt(state, targetPath)
  if (entry === undefined) return null
  if (entry.isDirectory) {
    throw new SyncTargetError(targetPath, 'EISDIR', SYSTEM_CODE_GLOSS.EISDIR)
  }
  const content = await targetCall(targetPath, () => state.io.readTextFile(targetPath))
  return { content, modifiedMs: entry.modifiedMs }
}

/**
 * Creates `directory` and every missing ancestor, pushing one undo per created
 * directory so a rollback removes exactly what this run added (deepest first,
 * because the stack unwinds in reverse).
 */
async function ensureDirectoryTracked(
  state: SyncTargetState,
  directory: string,
  undo: (() => Promise<void>)[]
): Promise<void> {
  if (directory === '') return
  const shape = await shapeOf(state, directory)
  if (shape === 'directory') return
  if (shape === 'file') {
    throw new SyncTargetError(directory, 'ENOTDIR', SYSTEM_CODE_GLOSS.ENOTDIR)
  }
  await ensureDirectoryTracked(state, parentPath(directory), undo)
  await targetCall(directory, () => state.io.ensureDirectory(directory))
  state.shapes.set(directory, 'directory')
  undo.push(() => state.io.removeDirectory(directory))
}

async function writeItem(
  item: SyncPlanItem,
  state: SyncTargetState,
  signal: AbortSignal | undefined,
  undo: (() => Promise<void>)[]
): Promise<void> {
  const sourcePath = item.sourcePath
  if (sourcePath === null) {
    throw new SyncTargetError(item.targetPath, undefined, '源文件缺失，无法写入')
  }
  await ensureDirectoryTracked(state, parentPath(item.targetPath), undo)
  const backup = await backupTarget(state, item.targetPath)
  checkCancelled(signal)
  const content = await targetCall(sourcePath, () => state.io.readTextFile(sourcePath))
  checkCancelled(signal)
  await targetCall(item.targetPath, () =>
    state.io.writeTextFile(item.targetPath, content, item.modifiedMs)
  )
  undo.push(
    backup === null
      ? () => state.io.deleteFile(item.targetPath)
      : () => state.io.writeTextFile(item.targetPath, backup.content, backup.modifiedMs)
  )
}

/** Restores every undo in reverse order; a failed step never stops the rest. */
async function rollback(undo: readonly (() => Promise<void>)[]): Promise<void> {
  for (let index = undo.length - 1; index >= 0; index -= 1) {
    try {
      await undo[index]()
    } catch {
      // The original failure stays the actionable one; a partial rollback still
      // tries every remaining step instead of leaving the rest applied.
    }
  }
}

/**
 * Applies a plan through the IO seam: preflight first, then one atomic write per
 * item, then the explicitly checked mirror deletions. Any failure or cancellation
 * unwinds the run in reverse (restoring overwritten bytes and mtimes, re-creating
 * deleted files, removing files and directories this run created) before the
 * original error is re-thrown, so the target is left exactly as it was.
 */
export async function executeSyncPlan(
  plan: SyncPlan,
  io: SyncIo,
  options: SyncExecutionOptions = {}
): Promise<SyncExecution> {
  const state: SyncTargetState = {
    io,
    targetRoot: plan.targetRoot,
    shapes: new Map(),
    listings: new Map()
  }
  // Deletions are explicit: an omitted `deletePaths` means "keep everything".
  const selected = new Set(options.deletePaths ?? [])
  checkCancelled(options.signal)
  await preflight(plan, state, selected)
  checkCancelled(options.signal)

  const undo: (() => Promise<void>)[] = []
  const affected: string[] = []
  let copied = 0
  let updated = 0
  let deleted = 0

  try {
    for (const item of plan.copy.items) {
      checkCancelled(options.signal)
      await writeItem(item, state, options.signal, undo)
      affected.push(item.targetPath)
      copied += 1
    }
    for (const item of plan.update.items) {
      checkCancelled(options.signal)
      await writeItem(item, state, options.signal, undo)
      affected.push(item.targetPath)
      updated += 1
    }
    for (const item of plan.delete.items) {
      if (!selected.has(item.relativePath)) continue
      checkCancelled(options.signal)
      const backup = await backupTarget(state, item.targetPath)
      if (backup === null) continue
      await targetCall(item.targetPath, () => state.io.deleteFile(item.targetPath))
      undo.push(() =>
        state.io.writeTextFile(item.targetPath, backup.content, backup.modifiedMs)
      )
      affected.push(item.targetPath)
      deleted += 1
    }
  } catch (error) {
    await rollback(undo)
    throw error
  }

  return { copied, updated, deleted, affected }
}

/**
 * Copies every file of a scanned tree into `targetRoot`, preserving its
 * relative structure. Used to materialise a read-only tree (e.g. `/samples`)
 * into a writable sandbox before a sync or extract writes to it.
 */
export async function copyScannedTree(
  tree: ScannedTree,
  targetRoot: string,
  io: Pick<SyncIo, 'readTextFile' | 'writeTextFile' | 'ensureDirectory'>
): Promise<number> {
  const files = [...tree.index.entries()]
    .filter(([, node]) => node.kind === 'file')
    .sort(([left], [right]) => left.localeCompare(right))

  for (const [relativePath, file] of files) {
    const target = joinRelativePath(targetRoot, relativePath)
    const parent = parentPath(target)
    if (parent !== '') await io.ensureDirectory(parent)
    const content = await io.readTextFile(file.path)
    await io.writeTextFile(target, content, file.modifiedMs)
  }

  return files.length
}

/**
 * Drops cached content hashes for paths whose bytes changed, so the next
 * comparison recomputes them instead of trusting a stale size/mtime shortcut.
 */
export function invalidateComparisonCache(
  cache: ComparisonCache,
  paths: readonly string[]
): void {
  for (const path of paths) cache.delete(path)
}
