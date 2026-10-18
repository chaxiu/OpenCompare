/**
 * One-way incremental / mirror sync planning and execution.
 *
 * A {@link SyncPlan} is derived from an existing {@link DirectoryComparison} in
 * one direction (`left → right` or `right → left`):
 *  - `copy`   — a file that exists only on the source side (new on the target),
 *  - `update` — a file that exists on both sides and compares as `modified`,
 *  - `delete` — a target-only file, listed in *mirror* mode only.
 *
 * `same` files never enter the plan, so re-running the same direction after an
 * apply yields an empty plan (idempotent). Actual writes go through injected IO
 * callbacks, which the renderer binds to `PlatformPort`; the module itself stays
 * pure and Node-testable.
 */
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
}

export interface SyncExecutionOptions {
  /**
   * Root-relative paths of mirror deletions the user kept checked. When
   * omitted every planned deletion is applied.
   */
  readonly deletePaths?: readonly string[]
}

export interface SyncExecution {
  readonly copied: number
  readonly updated: number
  readonly deleted: number
  /** Absolute target paths that changed, so caches can drop them. */
  readonly affected: readonly string[]
}

async function writeItem(item: SyncPlanItem, io: SyncIo): Promise<void> {
  if (item.sourcePath === null) {
    throw new Error(`Sync item ${item.relativePath} has no source file.`)
  }
  const parent = parentPath(item.targetPath)
  if (parent !== '') await io.ensureDirectory(parent)
  const content = await io.readTextFile(item.sourcePath)
  await io.writeTextFile(item.targetPath, content, item.modifiedMs)
}

/** Applies a plan through the IO seam, creating missing target directories. */
export async function executeSyncPlan(
  plan: SyncPlan,
  io: SyncIo,
  options: SyncExecutionOptions = {}
): Promise<SyncExecution> {
  const affected: string[] = []
  let copied = 0
  let updated = 0
  let deleted = 0

  for (const item of plan.copy.items) {
    await writeItem(item, io)
    affected.push(item.targetPath)
    copied += 1
  }
  for (const item of plan.update.items) {
    await writeItem(item, io)
    affected.push(item.targetPath)
    updated += 1
  }

  const selected = options.deletePaths === undefined ? null : new Set(options.deletePaths)
  for (const item of plan.delete.items) {
    if (selected !== null && !selected.has(item.relativePath)) continue
    await io.deleteFile(item.targetPath)
    affected.push(item.targetPath)
    deleted += 1
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
  for (const path of paths) cache.hashes.delete(path)
}
