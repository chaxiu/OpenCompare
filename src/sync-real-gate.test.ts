/**
 * Sync real-disk gate: one-way incremental / mirror sync against **real**
 * temporary directories, exercised through the production `PlatformPort`
 * handlers (no sample mount, no in-memory VFS, no `.ocsnap` snapshot).
 *
 * Each side holds ≥1,000 real files across ≥4 nested levels, with all four
 * comparison states present and Chinese + space path segments. The gate proves
 * the dry-run groups match the disk item by item, mirror deletions default to
 * unchecked (and an omitted `deletePaths` deletes nothing), the checked set is
 * the only thing removed, confirmed writes preserve content / relative paths /
 * source mtime, the refreshed comparison is the single source of counts, and a
 * second dry-run after an explicit select-all is empty.
 */
import {
  chmod,
  lstat,
  lutimes,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rm,
  stat,
  symlink,
  utimes,
  writeFile
} from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { compareDirectories, createComparisonCache, scanDirectory } from '@core/directory/compare'
import type { ComparisonCache, DirectoryComparison } from '@core/directory/compare'
import {
  buildSyncPlan,
  executeSyncPlan,
  SyncRefreshError,
  SyncTargetError,
  SyncVerificationError
} from '@core/directory/sync'
import type { SyncDirection, SyncIo, SyncPlanGroup } from '@core/directory/sync'
import { isOperationCancelled } from '@core/io'
import { digestFilesForComparison } from '@renderer/platform'
import { applySyncPreview, previewSync } from '@renderer/workbench/directoryOps'
import { PLATFORM_CHANNELS } from '@shared/platform/channels'
import type {
  DigestFilesResult,
  DirectoryEntry,
  DirectoryListing,
  PathProbeKind,
  PlatformPort,
  UserSettings
} from '@shared/platform/types'
import { registerPlatformIpc } from './main/platform/electron-platform'

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>()
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => tmpdir(),
    getLocale: () => 'en-US'
  },
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    showSaveDialog: async () => ({ canceled: true, filePath: undefined })
  },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }
  }
}))

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = handlers.get(channel)
  if (handler === undefined) throw new Error(`No handler registered for ${channel}`)
  return Promise.resolve(handler({}, ...args))
}

const platform: PlatformPort = {
  kind: 'electron',
  homeDirectory: () => invoke(PLATFORM_CHANNELS.homeDirectory) as Promise<string>,
  workingDirectory: () => invoke(PLATFORM_CHANNELS.workingDirectory) as Promise<string>,
  selectDirectory: async () => null,
  selectFile: async () => null,
  resolveDroppedPath: async () => '',
  saveFile: async () => null,
  listDirectory: (path) =>
    invoke(PLATFORM_CHANNELS.listDirectory, path) as Promise<DirectoryEntry[]>,
  listDirectories: (paths, options) =>
    invoke(PLATFORM_CHANNELS.listDirectories, paths, options) as Promise<
      readonly DirectoryListing[]
    >,
  readTextFile: (path) => invoke(PLATFORM_CHANNELS.readTextFile, path) as Promise<string>,
  readFileBytes: (path) =>
    invoke(PLATFORM_CHANNELS.readFileBytes, path) as Promise<Uint8Array>,
  writeFileBytes: (path, content, modifiedMs) =>
    invoke(PLATFORM_CHANNELS.writeFileBytes, path, content, modifiedMs) as Promise<void>,
  setSymbolicLinkModifiedMs: (path, modifiedMs) =>
    invoke(PLATFORM_CHANNELS.setSymbolicLinkModifiedMs, path, modifiedMs) as Promise<void>,
  digestFiles: (paths, options) =>
    invoke(PLATFORM_CHANNELS.digestFiles, paths, options) as Promise<DigestFilesResult>,
  cancelOperation: (operationId) =>
    invoke(PLATFORM_CHANNELS.cancelOperation, operationId) as Promise<void>,
  writeTextFile: (path, content, modifiedMs) =>
    invoke(PLATFORM_CHANNELS.writeTextFile, path, content, modifiedMs) as Promise<void>,
  exists: (path) => invoke(PLATFORM_CHANNELS.exists, path) as Promise<boolean>,
  statPath: (path) => invoke(PLATFORM_CHANNELS.statPath, path) as Promise<PathProbeKind>,
  checkWritable: (path) => invoke(PLATFORM_CHANNELS.checkWritable, path) as Promise<void>,
  ensureDirectory: (path) => invoke(PLATFORM_CHANNELS.ensureDirectory, path) as Promise<void>,
  deleteFile: (path) => invoke(PLATFORM_CHANNELS.deleteFile, path) as Promise<void>,
  removeDirectory: (path) => invoke(PLATFORM_CHANNELS.removeDirectory, path) as Promise<void>,
  temporaryDirectory: () => invoke(PLATFORM_CHANNELS.temporaryDirectory) as Promise<string>,
  realpath: (paths) => invoke(PLATFORM_CHANNELS.realpath, paths) as Promise<readonly string[]>,
  readUserSettings: () =>
    invoke(PLATFORM_CHANNELS.readUserSettings) as Promise<UserSettings | null>,
  writeUserSettings: (settings) =>
    invoke(PLATFORM_CHANNELS.writeUserSettings, settings) as Promise<void>,
  systemLocale: () => invoke(PLATFORM_CHANNELS.systemLocale) as Promise<string>
}

function syncIo(port: PlatformPort): SyncIo {
  return {
    readFileBytes: (path) => port.readFileBytes(path),
    writeFileBytes: (path, content, modifiedMs) => port.writeFileBytes(path, content, modifiedMs),
    ensureDirectory: (path) => port.ensureDirectory(path),
    deleteFile: (path) => port.deleteFile(path),
    removeDirectory: (path) => port.removeDirectory(path),
    statPath: (path) => port.statPath(path),
    listDirectory: (path) => port.listDirectory(path),
    checkWritable: (path) => port.checkWritable(path)
  }
}

/** Wraps a port so every real write is counted before it reaches the disk. */
function recordWrites(port: PlatformPort): {
  readonly port: PlatformPort
  readonly writes: string[]
} {
  const writes: string[] = []
  return {
    writes,
    port: {
      ...port,
      writeFileBytes: (path, content, modifiedMs) => {
        writes.push(path)
        return port.writeFileBytes(path, content, modifiedMs)
      }
    }
  }
}

const roots: string[] = []

async function scratchRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'opencompare-sync-real-'))
  roots.push(root)
  return root
}

async function inChunks<T>(
  items: readonly T[],
  size: number,
  action: (item: T) => Promise<void>
): Promise<void> {
  for (let start = 0; start < items.length; start += size) {
    await Promise.all(items.slice(start, start + size).map(action))
  }
}

function diskPath(root: string, relativePath: string): string {
  return join(root, ...relativePath.split('/'))
}

async function comparePair(
  leftRoot: string,
  rightRoot: string,
  cache: ComparisonCache = createComparisonCache()
): Promise<DirectoryComparison> {
  return compareDirectories(
    leftRoot,
    rightRoot,
    (path) => platform.listDirectory(path),
    (path) => platform.readTextFile(path),
    cache,
    undefined,
    {
      digestFiles: (paths) => digestFilesForComparison(platform, paths),
      listDirectories: (paths) => platform.listDirectories(paths)
    }
  )
}

async function listRelativeFiles(root: string): Promise<string[]> {
  const tree = await scanDirectory(root, (path) => platform.listDirectory(path))
  return [...tree.index.entries()]
    .filter(([, node]) => node.kind === 'file')
    .map(([relativePath]) => relativePath)
    .sort()
}

async function groupBytes(root: string, items: SyncPlanGroup['items']): Promise<number> {
  let total = 0
  for (const item of items) total += (await stat(diskPath(root, item.relativePath))).size
  return total
}

async function assertGroupMatchesDisk(
  group: SyncPlanGroup,
  root: string,
  expectedPaths: readonly string[]
): Promise<void> {
  expect(group.items.map((item) => item.relativePath).sort()).toEqual([...expectedPaths].sort())
  expect(group.count).toBe(group.items.length)
  expect(group.count).toBe(expectedPaths.length)
  expect(group.bytes).toBe(group.items.reduce((total, item) => total + item.size, 0))
  expect(group.bytes).toBe(await groupBytes(root, group.items))
  for (const item of group.items) {
    const info = await stat(diskPath(root, item.relativePath))
    expect(item.size).toBe(info.size)
  }
}

interface PlannedFile {
  readonly relativePath: string
  readonly text: string
  /** Whole-millisecond mtime both sides share; omitted to keep the real write time. */
  readonly stampMs?: number
}

interface RealFixture {
  readonly root: string
  readonly left: string
  readonly right: string
  readonly same: readonly PlannedFile[]
  readonly leftOnly: readonly PlannedFile[]
  readonly rightOnly: readonly PlannedFile[]
  readonly modified: readonly PlannedFile[]
  readonly leftFiles: readonly PlannedFile[]
  readonly rightFiles: readonly PlannedFile[]
}

const SAME_COUNT = 550
const LEFT_ONLY_COUNT = 200
const RIGHT_ONLY_COUNT = 200
const MODIFIED_COUNT = 250

/** Every directory level, five deep at the deepest, using Chinese + spaces. */
const DIRECTORIES = [
  '资料 夹',
  '资料 夹/第一层 子目录',
  '资料 夹/第一层 子目录/第二层',
  '资料 夹/第一层 子目录/第二层/深层 目录',
  '资料 夹/第一层 子目录/第二层/深层 目录/第五层',
  'docs',
  'docs/specs',
  'docs/specs/v1',
  'docs/specs/v1/notes',
  'src',
  'src/core',
  'src/core/directory'
] as const

function directoryFor(index: number): string {
  return DIRECTORIES[index % DIRECTORIES.length]
}

async function writeTree(root: string, files: readonly PlannedFile[]): Promise<void> {
  await inChunks(files, 48, async (file) => {
    const target = diskPath(root, file.relativePath)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, file.text, 'utf8')
  })
}

async function stampTree(root: string, files: readonly PlannedFile[]): Promise<void> {
  const stamped = files.filter((file) => file.stampMs !== undefined)
  await inChunks(stamped, 48, async (file) => {
    const stamp = new Date(file.stampMs as number)
    await utimes(diskPath(root, file.relativePath), stamp, stamp)
  })
}

async function buildRealFixture(): Promise<RealFixture> {
  const root = await scratchRoot()
  const left = join(root, 'left')
  const right = join(root, 'right')
  await mkdir(left, { recursive: true })
  await mkdir(right, { recursive: true })

  const same: PlannedFile[] = []
  for (let index = 0; index < SAME_COUNT; index += 1) {
    same.push({
      relativePath: `${directoryFor(index)}/相同 文件-${index}.txt`,
      text: `相同 内容 ${index}\n`,
      stampMs: 1_700_000_000_000 + index
    })
  }

  const leftOnly: PlannedFile[] = []
  for (let index = 0; index < LEFT_ONLY_COUNT; index += 1) {
    leftOnly.push({
      relativePath: `${directoryFor(index)}/仅左 文件-${index}.txt`,
      text: `仅左 内容 ${index}\n`
    })
  }

  const rightOnly: PlannedFile[] = []
  for (let index = 0; index < RIGHT_ONLY_COUNT; index += 1) {
    rightOnly.push({
      relativePath: `${directoryFor(index)}/仅右 文件-${index}.txt`,
      text: `仅右 内容 ${index}\n`
    })
  }

  // Same size and whole-millisecond mtime on both sides: only SHA-256 can tell
  // them apart, so the millisecond fast path must never fake them as `same`.
  const modified: PlannedFile[] = []
  const modifiedRight: PlannedFile[] = []
  for (let index = 0; index < MODIFIED_COUNT; index += 1) {
    const relativePath = `${directoryFor(index)}/修改 文件-${index}.txt`
    const stampMs = 1_800_000_000_000 + index
    modified.push({ relativePath, text: `修改 甲 ${index}\n`, stampMs })
    modifiedRight.push({ relativePath, text: `修改 乙 ${index}\n`, stampMs })
  }

  const leftFiles = [...same, ...leftOnly, ...modified]
  const rightFiles = [...same, ...rightOnly, ...modifiedRight]

  await writeTree(left, leftFiles)
  await writeTree(right, rightFiles)
  await stampTree(left, leftFiles)
  await stampTree(right, rightFiles)

  return { root, left, right, same, leftOnly, rightOnly, modified, leftFiles, rightFiles }
}

beforeAll(() => registerPlatformIpc())

afterAll(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('real-disk mirror sync gate', () => {
  it(
    'lists only copy / update / delete, with exact counts and bytes in both directions',
    async () => {
      const fixture = await buildRealFixture()
      const comparison = await comparePair(fixture.left, fixture.right)

      expect(comparison.counts).toEqual({
        same: SAME_COUNT,
        added: RIGHT_ONLY_COUNT,
        removed: LEFT_ONLY_COUNT,
        modified: MODIFIED_COUNT
      })
      // Two 1,000-file sides, all four states present, ≥4 levels deep.
      expect((await listRelativeFiles(fixture.left)).length).toBe(1_000)
      expect((await listRelativeFiles(fixture.right)).length).toBe(1_000)
      expect(Math.max(...fixture.leftFiles.map((file) => file.relativePath.split('/').length))).toBe(
        6
      )
      expect(
        fixture.leftFiles.some((file) => file.relativePath.includes('资料 夹/第一层 子目录'))
      ).toBe(true)

      // Every `same` pair really has identical content and the same whole ms.
      for (const file of fixture.same) {
        const leftPath = diskPath(fixture.left, file.relativePath)
        const rightPath = diskPath(fixture.right, file.relativePath)
        expect(await readFile(rightPath, 'utf8')).toBe(await readFile(leftPath, 'utf8'))
        expect(Math.floor((await stat(rightPath)).mtimeMs)).toBe(
          Math.floor((await stat(leftPath)).mtimeMs)
        )
      }

      const directions: readonly [SyncDirection, readonly PlannedFile[], readonly PlannedFile[]][] =
        [
          ['left-to-right', fixture.leftOnly, fixture.rightOnly],
          ['right-to-left', fixture.rightOnly, fixture.leftOnly]
        ]

      for (const [direction, expectedCopy, expectedDelete] of directions) {
        const plan = buildSyncPlan(comparison, direction, 'mirror')
        const target = direction === 'left-to-right' ? fixture.right : fixture.left
        const source = direction === 'left-to-right' ? fixture.left : fixture.right

        await assertGroupMatchesDisk(
          plan.copy,
          source,
          expectedCopy.map((file) => file.relativePath)
        )
        await assertGroupMatchesDisk(
          plan.update,
          source,
          fixture.modified.map((file) => file.relativePath)
        )
        await assertGroupMatchesDisk(
          plan.delete,
          target,
          expectedDelete.map((file) => file.relativePath)
        )

        // `same` never enters any group.
        const planned = new Set(
          [...plan.copy.items, ...plan.update.items, ...plan.delete.items].map(
            (item) => item.relativePath
          )
        )
        for (const file of fixture.same) expect(planned.has(file.relativePath)).toBe(false)
        expect(plan.totalCount).toBe(plan.copy.count + plan.update.count + plan.delete.count)
        expect(plan.totalBytes).toBe(plan.copy.bytes + plan.update.bytes + plan.delete.bytes)
      }

      // A second comparison from a cold cache sees the same four-state split.
      const cold = await comparePair(fixture.left, fixture.right)
      expect(cold.counts).toEqual(comparison.counts)
      expect(cold.fileCount).toBe(comparison.fileCount)
    },
    120_000
  )

  it(
    'keeps mirror deletions unchecked: no paths deletes nothing, checked paths delete only themselves',
    async () => {
      const root = await scratchRoot()
      const left = join(root, 'left')
      const right = join(root, 'right')
      await mkdir(join(left, '共享 目录'), { recursive: true })
      await mkdir(join(right, '共享 目录'), { recursive: true })
      await mkdir(join(right, '待删 目录', '更深'), { recursive: true })

      const shared = join(left, '共享 目录', '相同 文件.txt')
      await writeFile(shared, '相同 内容\n', 'utf8')
      await writeFile(join(right, '共享 目录', '相同 文件.txt'), '相同 内容\n', 'utf8')
      await utimes(shared, new Date(1_600_000_000_000), new Date(1_600_000_000_000))
      await utimes(
        join(right, '共享 目录', '相同 文件.txt'),
        new Date(1_600_000_000_000),
        new Date(1_600_000_000_000)
      )
      await writeFile(join(right, '待删 目录', '其一.txt'), '其一', 'utf8')
      await writeFile(join(right, '待删 目录', '更深', '其二.txt'), '其二', 'utf8')

      const comparison = await comparePair(left, right)
      expect(comparison.counts).toEqual({ same: 1, added: 2, removed: 0, modified: 0 })

      const preview = await previewSync(platform, comparison, 'left-to-right', 'mirror', 1)
      expect(preview.materializeTarget).toBe(false)
      expect(preview.plan.copy.count).toBe(0)
      expect(preview.plan.update.count).toBe(0)
      expect(preview.plan.delete.count).toBe(2)

      const io = syncIo(platform)
      const before = await listRelativeFiles(right)

      // Empty selection and an omitted option both mean "delete nothing".
      const emptyRun = await executeSyncPlan(preview.plan, io, { deletePaths: [] })
      expect(emptyRun.deleted).toBe(0)
      expect(await listRelativeFiles(right)).toEqual(before)

      const defaultRun = await executeSyncPlan(preview.plan, io)
      expect(defaultRun.deleted).toBe(0)
      expect(await listRelativeFiles(right)).toEqual(before)

      // Only the explicitly checked relative path disappears.
      const checked = preview.plan.delete.items[0].relativePath
      const unchecked = preview.plan.delete.items[1].relativePath
      const run = await executeSyncPlan(preview.plan, io, { deletePaths: [checked] })
      expect(run.deleted).toBe(1)
      expect(run.affected).toContain(diskPath(right, checked))
      expect(await platform.exists(diskPath(right, checked))).toBe(false)
      expect(await platform.exists(diskPath(right, unchecked))).toBe(true)
      expect(await listRelativeFiles(right)).toEqual(
        before.filter((relativePath) => relativePath !== checked)
      )
    },
    60_000
  )

  it(
    'applies left → right for real, preserves content / structure / mtime and refreshes once',
    async () => {
      const fixture = await buildRealFixture()
      const cache = createComparisonCache()
      const comparison = await comparePair(fixture.left, fixture.right, cache)
      const preview = await previewSync(platform, comparison, 'left-to-right', 'mirror', 1)
      const checked = preview.plan.delete.items.map((item) => item.relativePath)

      const result = await applySyncPreview(platform, preview, cache, checked)
      expect(result.copied).toBe(LEFT_ONLY_COUNT)
      expect(result.updated).toBe(MODIFIED_COUNT)
      expect(result.deleted).toBe(RIGHT_ONLY_COUNT)
      expect(result.copied).toBe(preview.plan.copy.count)
      expect(result.updated).toBe(preview.plan.update.count)
      expect(result.deleted).toBe(checked.length)

      // Every source file now exists at the same relative path with the same
      // UTF-8 body and a millisecond-equal mtime on the target.
      for (const file of fixture.leftFiles) {
        const sourcePath = diskPath(fixture.left, file.relativePath)
        const targetPath = diskPath(fixture.right, file.relativePath)
        expect(await readFile(targetPath, 'utf8')).toBe(await readFile(sourcePath, 'utf8'))
        expect(Math.floor((await stat(targetPath)).mtimeMs)).toBe(
          Math.floor((await stat(sourcePath)).mtimeMs)
        )
      }

      // The deepest Chinese + space path is found by the very same relative path.
      const deepFile = fixture.leftFiles.find((file) =>
        file.relativePath.startsWith('资料 夹/第一层 子目录/第二层/深层 目录/第五层')
      )
      if (deepFile === undefined) throw new Error('fixture has no level-5 file')
      expect(await platform.statPath(diskPath(fixture.right, deepFile.relativePath))).toBe('file')
      expect(await listRelativeFiles(fixture.right)).toEqual(
        fixture.leftFiles.map((file) => file.relativePath).sort()
      )
      // Atomic writes clean up after themselves on the success path too.
      expect(
        (await listRelativeFiles(fixture.right)).filter((relativePath) => relativePath.endsWith('.tmp'))
      ).toEqual([])

      // The returned comparison is the single source of the refreshed state.
      const fresh = await comparePair(fixture.left, fixture.right)
      expect(result.comparison.counts).toEqual(fresh.counts)
      expect(result.comparison.counts).toEqual({
        same: 1_000,
        added: 0,
        removed: 0,
        modified: 0
      })
      expect(result.comparison.skipped).toBe(fresh.skipped)
      expect(result.comparison.leftSkipped).toBe(fresh.leftSkipped)
      expect(result.comparison.rightSkipped).toBe(fresh.rightSkipped)

      // Immediately re-running the same direction is empty: no ghost entries
      // from mtime precision, separators or Chinese / space paths.
      const second = await previewSync(
        platform,
        result.comparison,
        'left-to-right',
        'mirror',
        2
      )
      expect(second.plan.copy.count).toBe(0)
      expect(second.plan.update.count).toBe(0)
      expect(second.plan.delete.count).toBe(0)
      expect(second.plan.totalCount).toBe(0)
      expect(second.plan.totalBytes).toBe(0)
    },
    120_000
  )

  it(
    'applies right → left with an explicit select-all and stays idempotent',
    async () => {
      const fixture = await buildRealFixture()
      const cache = createComparisonCache()
      const comparison = await comparePair(fixture.left, fixture.right, cache)
      const preview = await previewSync(platform, comparison, 'right-to-left', 'mirror', 1)
      const checked = preview.plan.delete.items.map((item) => item.relativePath)
      expect(checked.sort()).toEqual(
        fixture.leftOnly.map((file) => file.relativePath).sort()
      )

      const result = await applySyncPreview(platform, preview, cache, checked)
      expect(result.copied).toBe(RIGHT_ONLY_COUNT)
      expect(result.updated).toBe(MODIFIED_COUNT)
      expect(result.deleted).toBe(LEFT_ONLY_COUNT)

      for (const file of fixture.rightFiles) {
        const sourcePath = diskPath(fixture.right, file.relativePath)
        const targetPath = diskPath(fixture.left, file.relativePath)
        expect(await readFile(targetPath, 'utf8')).toBe(await readFile(sourcePath, 'utf8'))
        expect(Math.floor((await stat(targetPath)).mtimeMs)).toBe(
          Math.floor((await stat(sourcePath)).mtimeMs)
        )
      }
      expect(result.comparison.counts).toEqual({
        same: 1_000,
        added: 0,
        removed: 0,
        modified: 0
      })

      const second = buildSyncPlan(result.comparison, 'right-to-left', 'mirror')
      expect(second.copy.count).toBe(0)
      expect(second.update.count).toBe(0)
      expect(second.delete.count).toBe(0)
      expect(second.totalCount).toBe(0)
      expect(second.totalBytes).toBe(0)
    },
    120_000
  )
})

/* ------------------------------------------------------------------ */
/* Failure safety on the same real temp disks                          */
/* ------------------------------------------------------------------ */

interface DiskSnapshot {
  readonly files: ReadonlyMap<string, { readonly content: string; readonly modifiedMs: number }>
  readonly directories: readonly string[]
}

/** Every file's bytes + millisecond mtime and every directory, keyed by rel path. */
async function snapshotTree(root: string): Promise<DiskSnapshot> {
  const files = new Map<string, { content: string; modifiedMs: number }>()
  const directories: string[] = []

  async function walk(relativePath: string): Promise<void> {
    const absolute = relativePath === '' ? root : diskPath(root, relativePath)
    for (const entry of await readdir(absolute, { withFileTypes: true })) {
      const child = relativePath === '' ? entry.name : `${relativePath}/${entry.name}`
      if (entry.isDirectory()) {
        directories.push(child)
        await walk(child)
      } else if (entry.isFile()) {
        const info = await stat(diskPath(root, child))
        files.set(child, {
          content: await readFile(diskPath(root, child), 'utf8'),
          modifiedMs: Math.floor(info.mtimeMs)
        })
      }
    }
  }

  await walk('')
  return { files, directories: directories.sort() }
}

/** Item-by-item equality, plus "no residue" for temporary files. */
function expectSameSnapshot(before: DiskSnapshot, after: DiskSnapshot): void {
  expect(after.directories).toEqual(before.directories)
  expect([...after.files.keys()].sort()).toEqual([...before.files.keys()].sort())
  for (const [relativePath, file] of before.files) {
    expect(after.files.get(relativePath)?.content, relativePath).toBe(file.content)
    expect(after.files.get(relativePath)?.modifiedMs, relativePath).toBe(file.modifiedMs)
  }
  // No atomic-write temporary file and no writability probe may survive a run.
  expect(
    [...after.files.keys()].filter(
      (relativePath) =>
        relativePath.endsWith('.tmp') || relativePath.includes('.opencompare-sync-probe-')
    )
  ).toEqual([])
}

const SAFETY_STAMP = 1_700_000_500_000

async function writeStamped(path: string, text: string, stampMs: number): Promise<void> {
  await writeFile(path, text, 'utf8')
  await utimes(path, new Date(stampMs), new Date(stampMs))
}

interface SafetyFixture {
  readonly root: string
  readonly left: string
  readonly right: string
}

/**
 * Small real fixture (9 files): one same pair, one modified pair, three copies
 * into a two-level new directory, two target-only mirror deletions. Whole-ms
 * mtimes keep the rollback comparison exact without rounding surprises.
 */
async function buildSafetyFixture(): Promise<SafetyFixture> {
  const root = await scratchRoot()
  const left = join(root, 'left')
  const right = join(root, 'right')
  await mkdir(join(left, 'added', 'deep'), { recursive: true })
  await mkdir(right, { recursive: true })

  await writeStamped(join(left, 'same.txt'), 'same body\n', SAFETY_STAMP)
  await writeStamped(join(right, 'same.txt'), 'same body\n', SAFETY_STAMP)
  await writeStamped(join(left, 'update.txt'), 'new body!!\n', SAFETY_STAMP + 1_000)
  await writeStamped(join(right, 'update.txt'), 'old body\n', SAFETY_STAMP + 2_000)
  await writeStamped(diskPath(left, 'added/one.txt'), 'copy one\n', SAFETY_STAMP + 3_000)
  await writeStamped(diskPath(left, 'added/deep/two.txt'), 'copy two\n', SAFETY_STAMP + 4_000)
  await writeStamped(diskPath(left, 'added/deep/three.txt'), 'copy three\n', SAFETY_STAMP + 5_000)
  await writeStamped(join(right, 'stale-a.txt'), 'stale a\n', SAFETY_STAMP + 6_000)
  await writeStamped(join(right, 'stale-b.txt'), 'stale b\n', SAFETY_STAMP + 7_000)

  return { root, left, right }
}

function isRootUser(): boolean {
  return typeof process.getuid === 'function' && process.getuid() === 0
}

describe('real-disk sync failure safety', () => {
  it.skipIf(isRootUser())(
    'refuses a read-only target without writing any planned item or probe file',
    async () => {
      // Permission bits are meaningless for root; only this case is skipped.
      const fixture = await buildSafetyFixture()
      const comparison = await comparePair(fixture.left, fixture.right)
      const plan = buildSyncPlan(comparison, 'left-to-right', 'mirror')
      expect(plan.totalCount).toBe(6)
      const before = await snapshotTree(fixture.right)
      const recorded = recordWrites(platform)

      let error: unknown
      try {
        await chmod(fixture.right, 0o555)
        error = await executeSyncPlan(plan, syncIo(recorded.port), {
          deletePaths: ['stale-a.txt', 'stale-b.txt']
        }).then(
          () => undefined,
          (reason: unknown) => reason
        )
      } finally {
        await chmod(fixture.right, 0o755)
      }

      expect(error).toBeInstanceOf(SyncTargetError)
      expect((error as SyncTargetError).code).toMatch(/^(EACCES|EPERM|EROFS)$/)
      const message = (error as Error).message
      expect(message).toMatch(/[一-龥]/)
      expect(message).toContain(fixture.right)
      expect(message).toMatch(/EACCES|EPERM|EROFS/)
      expect(message).not.toContain('Error invoking remote method')

      // The preflight refuses through the non-writing probe: zero write calls,
      // so no probe file and no planned item ever reached the disk.
      expect(recorded.writes).toEqual([])
      expectSameSnapshot(before, await snapshotTree(fixture.right))
      expect((await readdir(fixture.right)).sort()).toEqual([
        'same.txt',
        'stale-a.txt',
        'stale-b.txt',
        'update.txt'
      ])
    },
    60_000
  )

  it(
    'refuses an occupied copy target before any partial write and keeps it intact',
    async () => {
      const fixture = await buildSafetyFixture()
      const comparison = await comparePair(fixture.left, fixture.right)
      const plan = buildSyncPlan(comparison, 'left-to-right', 'mirror')
      const copyItem = plan.copy.items.find((item) => item.relativePath === 'added/one.txt')
      if (copyItem === undefined) throw new Error('fixture has no added/one.txt copy item')

      // The plan is stale by the time it runs: a same-named directory now sits
      // at a path the plan still wants to copy a file to.
      await mkdir(copyItem.targetPath, { recursive: true })
      const before = await snapshotTree(fixture.right)
      const recorded = recordWrites(platform)

      const error = await executeSyncPlan(plan, syncIo(recorded.port), {
        deletePaths: ['stale-a.txt', 'stale-b.txt']
      }).then(
        () => undefined,
        (reason: unknown) => reason
      )

      expect(error).toBeInstanceOf(SyncTargetError)
      expect((error as SyncTargetError).code).toBe('EISDIR')
      const message = (error as Error).message
      expect(message).toMatch(/[一-龥]/)
      expect(message).toContain(copyItem.targetPath)
      expect(message).toContain('EISDIR')
      expect(message).not.toContain('Error invoking remote method')

      // Refused in the preflight: no write ran and the occupying directory is
      // untouched, so no earlier item landed and nothing was left behind.
      expect(recorded.writes).toEqual([])
      expectSameSnapshot(before, await snapshotTree(fixture.right))
      expect((await stat(copyItem.targetPath)).isDirectory()).toBe(true)
      expect(await readdir(copyItem.targetPath)).toEqual([])
    },
    60_000
  )

  it(
    'rolls a mid-plan failure back to the exact previous disk and stays retryable',
    async () => {
      const fixture = await buildSafetyFixture()
      const cache = createComparisonCache()
      const comparison = await comparePair(fixture.left, fixture.right, cache)
      expect(comparison.counts).toEqual({ same: 1, added: 2, removed: 3, modified: 1 })
      const preview = await previewSync(platform, comparison, 'left-to-right', 'mirror', 1)
      const checked = preview.plan.delete.items.map((item) => item.relativePath)
      const before = await snapshotTree(fixture.right)

      // Fail the run after every copy / update and one of the two deletions.
      const failing: PlatformPort = {
        ...platform,
        deleteFile: async (path) => {
          if (path.endsWith('stale-b.txt')) {
            throw Object.assign(new Error('file is busy'), { code: 'EBUSY' })
          }
          return platform.deleteFile(path)
        }
      }

      const error = await applySyncPreview(failing, preview, cache, checked).then(
        () => undefined,
        (reason: unknown) => reason
      )

      expect(error).toBeInstanceOf(SyncTargetError)
      expect((error as SyncTargetError).code).toBe('EBUSY')
      const message = (error as Error).message
      expect(message).toMatch(/[一-龥]/)
      expect(message).toContain('stale-b.txt')
      expect(message).toContain('EBUSY')
      expect(message).not.toContain('Error invoking remote method')

      // Overwritten bytes / mtimes restored, the deleted file re-created, the
      // files and both created directory levels removed again.
      expectSameSnapshot(before, await snapshotTree(fixture.right))
      // The failed apply produced no new comparison: the caller session is intact.
      expect(comparison.counts).toEqual({ same: 1, added: 2, removed: 3, modified: 1 })

      // The very same preview is retryable and now lands everything.
      const retry = await applySyncPreview(platform, preview, cache, checked)
      expect(retry.copied).toBe(3)
      expect(retry.updated).toBe(1)
      expect(retry.deleted).toBe(2)
      expect(retry.comparison.counts).toEqual({ same: 5, added: 0, removed: 0, modified: 0 })
    },
    60_000
  )

  it(
    'cancels mid-plan, rolls back and reports a cancellation distinct from failure',
    async () => {
      const fixture = await buildSafetyFixture()
      const cache = createComparisonCache()
      const comparison = await comparePair(fixture.left, fixture.right, cache)
      const preview = await previewSync(platform, comparison, 'left-to-right', 'mirror', 1)
      const before = await snapshotTree(fixture.right)

      const controller = new AbortController()
      const cancelling: PlatformPort = {
        ...platform,
        writeFileBytes: async (path, content, modifiedMs) => {
          await platform.writeFileBytes(path, content, modifiedMs)
          // Abort right after one planned write landed; later items never start.
          if (path.endsWith('added/deep/two.txt')) controller.abort()
        }
      }

      const error = await applySyncPreview(cancelling, preview, cache, [], {
        signal: controller.signal
      }).then(
        () => undefined,
        (reason: unknown) => reason
      )

      expect(isOperationCancelled(error)).toBe(true)
      const message = (error as Error).message
      expect(message).toContain('已取消')
      expect(message).not.toMatch(/[（(]E[A-Z]+[）)]/)
      expectSameSnapshot(before, await snapshotTree(fixture.right))

      // A cold dry-run immediately after the cancellation reflects the real disk.
      const rebuiltComparison = await comparePair(fixture.left, fixture.right)
      const rebuilt = buildSyncPlan(rebuiltComparison, 'left-to-right', 'mirror')
      expect(rebuilt.copy.count).toBe(3)
      expect(rebuilt.update.count).toBe(1)
      expect(rebuilt.delete.count).toBe(2)
      expect(rebuilt.totalCount).toBe(
        rebuiltComparison.counts.added +
          rebuiltComparison.counts.removed +
          rebuiltComparison.counts.modified
      )
    },
    60_000
  )

  it(
    'keeps unchecked mirror deletions untouched when the run fails',
    async () => {
      const fixture = await buildSafetyFixture()
      const cache = createComparisonCache()
      const comparison = await comparePair(fixture.left, fixture.right, cache)
      const preview = await previewSync(platform, comparison, 'left-to-right', 'mirror', 1)
      const before = await snapshotTree(fixture.right)

      const failing: PlatformPort = {
        ...platform,
        writeFileBytes: async (path, content, modifiedMs) => {
          if (path.endsWith('added/one.txt')) {
            throw Object.assign(new Error('permission denied'), { code: 'EACCES' })
          }
          return platform.writeFileBytes(path, content, modifiedMs)
        }
      }

      // Zero checked deletions; the run still fails after earlier copies landed.
      const error = await applySyncPreview(failing, preview, cache, []).then(
        () => undefined,
        (reason: unknown) => reason
      )

      expect(error).toBeInstanceOf(SyncTargetError)
      expect((error as SyncTargetError).code).toBe('EACCES')
      expectSameSnapshot(before, await snapshotTree(fixture.right))
      expect(await platform.exists(diskPath(fixture.right, 'stale-a.txt'))).toBe(true)
      expect(await platform.exists(diskPath(fixture.right, 'stale-b.txt'))).toBe(true)
    },
    60_000
  )

  it(
    'rolls a write that landed before it rejected back, for a copy and an update',
    async () => {
      const fixture = await buildSafetyFixture()
      const cache = createComparisonCache()
      const comparison = await comparePair(fixture.left, fixture.right, cache)
      const preview = await previewSync(platform, comparison, 'left-to-right', 'mirror', 1)
      const checked = preview.plan.delete.items.map((item) => item.relativePath)
      const before = await snapshotTree(fixture.right)

      /** Writes for real, then rejects exactly once on `relativePath`. */
      function postWriteFailure(relativePath: string): {
        readonly port: PlatformPort
        readonly landed: () => boolean
      } {
        const targetPath = diskPath(fixture.right, relativePath)
        let landed = false
        return {
          landed: () => landed,
          port: {
            ...platform,
            writeFileBytes: async (path, content, modifiedMs) => {
              await platform.writeFileBytes(path, content, modifiedMs)
              if (!landed && path === targetPath) {
                landed = true
                throw Object.assign(new Error('rename landed, mtime backfill failed'), {
                  code: 'EACCES'
                })
              }
            }
          }
        }
      }

      for (const relativePath of ['added/one.txt', 'update.txt']) {
        const failure = postWriteFailure(relativePath)
        const error = await applySyncPreview(
          failure.port,
          preview,
          cache,
          checked
        ).then(
          () => undefined,
          (reason: unknown) => reason
        )

        expect(failure.landed(), relativePath).toBe(true)
        expect(error).toBeInstanceOf(SyncTargetError)
        expect((error as SyncTargetError).code).toBe('EACCES')
        const message = (error as Error).message
        expect(message).toMatch(/[一-龥]/)
        expect(message).toContain(diskPath(fixture.right, relativePath))
        expect(message).toContain('EACCES')
        expect(message).not.toContain('Error invoking remote method')

        // Bytes, millisecond mtimes and directories are all exactly as before.
        expectSameSnapshot(before, await snapshotTree(fixture.right))
        // Everything this run created is gone again, multi-level directories too.
        expect(await platform.exists(diskPath(fixture.right, 'added/one.txt'))).toBe(false)
        expect(await platform.statPath(diskPath(fixture.right, 'added'))).toBe('missing')
      }
    },
    60_000
  )

  it(
    'reports a refresh failure after the writes landed as a readable completed-write error',
    async () => {
      const fixture = await buildSafetyFixture()
      const cache = createComparisonCache()
      const comparison = await comparePair(fixture.left, fixture.right, cache)
      const preview = await previewSync(platform, comparison, 'left-to-right', 'mirror', 1)
      const checked = preview.plan.delete.items.map((item) => item.relativePath)
      let refreshing = false
      const refreshFailure = (path: string): Error =>
        new Error(
          `Error invoking remote method 'platform:list-directory': Error: ` +
            `无法读取目录 ${path}：没有访问权限（EACCES）。`
        )

      // The last planned operation is the last checked deletion: everything after
      // it belongs to the refresh, which is where the injected read failure hits.
      const failingRefresh: PlatformPort = {
        ...platform,
        deleteFile: async (path) => {
          await platform.deleteFile(path)
          if (path.endsWith('stale-b.txt')) refreshing = true
        },
        listDirectory: async (path) => {
          if (refreshing) throw refreshFailure(path)
          return platform.listDirectory(path)
        },
        listDirectories: async (paths, options) => {
          if (refreshing) throw refreshFailure(paths[0] ?? '')
          return platform.listDirectories(paths, options)
        }
      }

      const error = await applySyncPreview(failingRefresh, preview, cache, checked).then(
        () => undefined,
        (reason: unknown) => reason
      )

      expect(error).toBeInstanceOf(SyncRefreshError)
      expect(error).not.toBeInstanceOf(SyncTargetError)
      const refresh = error as SyncRefreshError
      expect(refresh.copied).toBe(preview.plan.copy.count)
      expect(refresh.updated).toBe(preview.plan.update.count)
      expect(refresh.deleted).toBe(checked.length)

      const message = refresh.message
      expect(message).toMatch(/[一-龥]/)
      expect(message).toContain('写入已完成')
      expect(message).toContain(`新增拷贝 ${preview.plan.copy.count}`)
      expect(message).toContain(`覆盖 ${preview.plan.update.count}`)
      expect(message).toContain(`删除 ${checked.length}`)
      expect(message).toContain('EACCES')
      expect(message).not.toContain('Error invoking remote method')

      // Nothing was rolled back: the target holds the fully applied plan.
      const after = await snapshotTree(fixture.right)
      expect(after.files.get('update.txt')?.content).toBe('new body!!\n')
      expect(after.files.get('added/deep/three.txt')?.content).toBe('copy three\n')
      expect(after.files.has('stale-a.txt')).toBe(false)
      expect(after.files.has('stale-b.txt')).toBe(false)
      expect(
        [...after.files.keys()].filter(
          (relativePath) =>
            relativePath.endsWith('.tmp') || relativePath.includes('.opencompare-sync-probe-')
        )
      ).toEqual([])
    },
    60_000
  )
})

/* ------------------------------------------------------------------ */
/* Binary byte fidelity on the same real temp disks                    */
/* ------------------------------------------------------------------ */

function rawSha(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** Real PNG signature + IHDR/IDAT-shaped bytes plus invalid UTF-8 sequences. */
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0xff, 0x80, 0xc3, 0x00, 0xfe, 0x7f
])

/** Bytes no UTF-8 decoder can round-trip: NULs, lone continuations, 0xC3 without a tail. */
const RANDOM_BYTES = Buffer.from([
  0x00, 0x01, 0x7f, 0x80, 0xff, 0xc3, 0x28, 0x00, 0x9f, 0x92, 0xe2, 0x28, 0xa1, 0x00, 0xc3, 0xed,
  0xa0, 0x80, 0x00, 0x0a
])

interface BinaryFixture {
  readonly root: string
  readonly left: string
  readonly right: string
  /** Source-relative paths whose bytes the run must copy verbatim. */
  readonly fidelity: readonly string[]
}

const BINARY_STAMP = 1_700_000_700_000

async function writeStampedBytes(path: string, bytes: Uint8Array, stampMs: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, bytes)
  await utimes(path, new Date(stampMs), new Date(stampMs))
}

/**
 * One same text pair, three binary copies (PNG / invalid UTF-8 / empty) and one
 * binary overwrite whose target body differs.
 */
async function buildBinaryFixture(): Promise<BinaryFixture> {
  const root = await scratchRoot()
  const left = join(root, 'left')
  const right = join(root, 'right')
  await mkdir(join(left, 'assets'), { recursive: true })
  await mkdir(join(right, 'assets'), { recursive: true })

  await writeStamped(join(left, 'shared.txt'), 'shared body\n', BINARY_STAMP)
  await writeStamped(join(right, 'shared.txt'), 'shared body\n', BINARY_STAMP)

  await writeStampedBytes(diskPath(left, 'assets/logo.png'), PNG_BYTES, BINARY_STAMP + 1)
  await writeStampedBytes(diskPath(left, 'assets/random.bin'), RANDOM_BYTES, BINARY_STAMP + 2)
  await writeStampedBytes(diskPath(left, 'assets/empty.bin'), Buffer.alloc(0), BINARY_STAMP + 3)
  await writeStampedBytes(diskPath(left, 'assets/updated.png'), PNG_BYTES, BINARY_STAMP + 4)
  await writeStampedBytes(
    diskPath(right, 'assets/updated.png'),
    Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]),
    BINARY_STAMP + 5
  )

  return {
    root,
    left,
    right,
    fidelity: ['assets/logo.png', 'assets/random.bin', 'assets/empty.bin', 'assets/updated.png']
  }
}

describe('real-disk sync binary fidelity', () => {
  it(
    'copies and overwrites binary bodies byte for byte, empty files included',
    async () => {
      const fixture = await buildBinaryFixture()
      const comparison = await comparePair(fixture.left, fixture.right)
      expect(comparison.counts).toEqual({ same: 1, added: 0, removed: 3, modified: 1 })

      const preview = await previewSync(platform, comparison, 'left-to-right', 'incremental', 1)
      expect(preview.plan.copy.count).toBe(3)
      expect(preview.plan.update.count).toBe(1)

      const result = await applySyncPreview(platform, preview, createComparisonCache(), [])
      expect(result.copied).toBe(3)
      expect(result.updated).toBe(1)

      for (const relativePath of fixture.fidelity) {
        const sourcePath = diskPath(fixture.left, relativePath)
        const targetPath = diskPath(fixture.right, relativePath)
        const sourceBytes = await readFile(sourcePath)
        const targetBytes = await readFile(targetPath)
        expect(
          targetBytes.equals(sourceBytes),
          `binary fidelity: ${relativePath} bytes changed on copy`
        ).toBe(true)
        expect(targetBytes.length, `binary fidelity: ${relativePath} size`).toBe(sourceBytes.length)
        expect(rawSha(targetBytes), `binary fidelity: ${relativePath} sha256`).toBe(
          rawSha(sourceBytes)
        )
        expect(
          Math.floor((await stat(targetPath)).mtimeMs),
          `binary fidelity: ${relativePath} mtime`
        ).toBe(Math.floor((await stat(sourcePath)).mtimeMs))
      }

      // A 0-byte source stays 0 bytes with the empty-content hash.
      const emptyTarget = diskPath(fixture.right, 'assets/empty.bin')
      expect((await stat(emptyTarget)).size, 'binary fidelity: empty file stays empty').toBe(0)
      expect(rawSha(await readFile(emptyTarget)), 'binary fidelity: empty sha256').toBe(
        createHash('sha256').update(Buffer.alloc(0)).digest('hex')
      )

      // UTF-8 text still round-trips exactly, and the four-state counting is unchanged.
      expect(await readFile(diskPath(fixture.right, 'shared.txt'), 'utf8')).toBe('shared body\n')
      expect(result.comparison.counts).toEqual({ same: 5, added: 0, removed: 0, modified: 0 })

      // An immediately rebuilt plan is empty: the bytes and mtimes really match.
      const second = buildSyncPlan(result.comparison, 'left-to-right', 'incremental')
      expect(second.copy.count, 'binary fidelity: second copy count').toBe(0)
      expect(second.update.count, 'binary fidelity: second update count').toBe(0)
      expect(second.delete.count, 'binary fidelity: second delete count').toBe(0)
    },
    120_000
  )

  it(
    'rolls a binary overwrite back to the exact previous bytes and mtime on failure',
    async () => {
      const root = await scratchRoot()
      const left = join(root, 'left')
      const right = join(root, 'right')
      const original = Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0xff, 0x80])
      await writeStampedBytes(diskPath(left, 'a-update.png'), PNG_BYTES, BINARY_STAMP)
      await writeStampedBytes(diskPath(left, 'z-copy.txt'), Buffer.from('copy me'), BINARY_STAMP + 1)
      await writeStampedBytes(diskPath(right, 'a-update.png'), original, BINARY_STAMP + 2)

      const comparison = await comparePair(left, right)
      const preview = await previewSync(platform, comparison, 'left-to-right', 'incremental', 1)
      expect(preview.plan.update.count).toBe(1)
      expect(preview.plan.copy.count).toBe(1)

      const failing: PlatformPort = {
        ...platform,
        writeFileBytes: async (path, content, modifiedMs) => {
          if (path.endsWith('z-copy.txt')) {
            throw Object.assign(new Error('permission denied'), { code: 'EACCES' })
          }
          return platform.writeFileBytes(path, content, modifiedMs)
        }
      }

      const error = await applySyncPreview(failing, preview, createComparisonCache(), []).then(
        () => undefined,
        (reason: unknown) => reason
      )
      expect(error).toBeInstanceOf(SyncTargetError)
      expect((error as SyncTargetError).code).toBe('EACCES')

      const restored = await readFile(diskPath(right, 'a-update.png'))
      expect(restored.equals(original), 'binary fidelity: rollback restored different bytes').toBe(
        true
      )
      expect(rawSha(restored), 'binary fidelity: rollback sha256').toBe(rawSha(original))
      expect(
        Math.floor((await stat(diskPath(right, 'a-update.png'))).mtimeMs),
        'binary fidelity: rollback mtime'
      ).toBe(BINARY_STAMP + 2)
    },
    60_000
  )

  it(
    'rolls a checked binary deletion back to the exact previous bytes and mtime',
    async () => {
      const root = await scratchRoot()
      const left = join(root, 'left')
      const right = join(root, 'right')
      const stale = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0x80])
      await mkdir(left, { recursive: true })
      await writeStampedBytes(diskPath(right, 'stale.bin'), stale, BINARY_STAMP + 9)

      const comparison = await comparePair(left, right)
      const preview = await previewSync(platform, comparison, 'left-to-right', 'mirror', 1)
      expect(preview.plan.delete.count).toBe(1)
      const checked = preview.plan.delete.items.map((item) => item.relativePath)

      const failing: PlatformPort = {
        ...platform,
        deleteFile: async (path) => {
          await platform.deleteFile(path)
          throw Object.assign(new Error('file is busy'), { code: 'EBUSY' })
        }
      }

      const error = await applySyncPreview(failing, preview, createComparisonCache(), checked).then(
        () => undefined,
        (reason: unknown) => reason
      )
      expect(error).toBeInstanceOf(SyncTargetError)
      expect((error as SyncTargetError).code).toBe('EBUSY')

      const restored = await readFile(diskPath(right, 'stale.bin'))
      expect(
        restored.equals(stale),
        'binary fidelity: delete rollback restored different bytes'
      ).toBe(true)
      expect(rawSha(restored), 'binary fidelity: delete rollback sha256').toBe(rawSha(stale))
      expect(
        Math.floor((await stat(diskPath(right, 'stale.bin'))).mtimeMs),
        'binary fidelity: delete rollback mtime'
      ).toBe(BINARY_STAMP + 9)
    },
    60_000
  )
})

/* ------------------------------------------------------------------ */
/* Completion consistency: the notice may only claim a matching target  */
/* ------------------------------------------------------------------ */

describe('real-disk sync completion consistency', () => {
  it(
    'rejects with a verification failure when a written target keeps bad bytes',
    async () => {
      const fixture = await buildBinaryFixture()
      const comparison = await comparePair(fixture.left, fixture.right)
      const preview = await previewSync(platform, comparison, 'left-to-right', 'incremental', 1)

      // The write seam "succeeds" but lands corrupted bytes for one file: only
      // the post-write digest can catch this.
      const corrupting: PlatformPort = {
        ...platform,
        writeFileBytes: async (path, content, modifiedMs) => {
          if (path.endsWith('logo.png')) {
            const corrupted = Buffer.from(content)
            corrupted[0] = corrupted[0] ^ 0xff
            return platform.writeFileBytes(path, corrupted, modifiedMs)
          }
          return platform.writeFileBytes(path, content, modifiedMs)
        }
      }

      const error = await applySyncPreview(corrupting, preview, createComparisonCache(), []).then(
        () => undefined,
        (reason: unknown) => reason
      )

      expect(error, 'completion consistency: a mismatched target must not resolve').toBeInstanceOf(
        SyncVerificationError
      )
      expect(error).not.toBeInstanceOf(SyncRefreshError)
      const verification = error as SyncVerificationError
      expect(verification.mismatched, 'completion consistency: mismatch count').toBe(1)
      expect(verification.paths[0]).toContain('logo.png')
      expect(verification.message).toContain('1 个目标')
      expect(verification.copied).toBe(3)
      expect(verification.updated).toBe(1)
      // Writes landed, so nothing is rolled back: only the notice is blocked.
      const targetBytes = await readFile(diskPath(fixture.right, 'assets/logo.png'))
      expect(targetBytes.equals(PNG_BYTES), 'completion consistency: no rollback').toBe(false)
      // The refreshed comparison reports the real disk state.
      expect(verification.comparison?.counts.modified, 'completion consistency: refresh truth').toBe(
        1
      )
    },
    120_000
  )

  it(
    'resolves only when every written target matches its source, and verifies just those paths',
    async () => {
      const fixture = await buildBinaryFixture()
      const comparison = await comparePair(fixture.left, fixture.right)
      const preview = await previewSync(platform, comparison, 'left-to-right', 'incremental', 1)

      // Record every digest request the apply makes. The first one is the
      // post-write check, which must read exactly this run's targets + sources.
      const digestRequests: string[][] = []
      const recording: PlatformPort = {
        ...platform,
        digestFiles: (paths, options) => {
          digestRequests.push([...paths])
          return platform.digestFiles(paths, options)
        }
      }

      const result = await applySyncPreview(recording, preview, createComparisonCache(), [])
      expect(result.copied).toBe(3)
      expect(result.updated).toBe(1)

      const writtenPaths = [...preview.plan.copy.items, ...preview.plan.update.items]
      const expected = new Set([
        ...writtenPaths.map((item) => item.targetPath),
        ...writtenPaths.map((item) => item.sourcePath as string)
      ])
      expect(digestRequests.length, 'completion consistency: a check must run').toBeGreaterThan(0)
      expect(
        new Set(digestRequests[0]),
        'completion consistency: the check must read exactly the written targets and their sources'
      ).toEqual(expected)
      // The untouched `same` file is never part of the post-write check.
      expect(digestRequests[0]).not.toContain(diskPath(fixture.left, 'shared.txt'))

      // Every written target is byte-equal to its source and the rebuild is empty.
      for (const item of writtenPaths) {
        expect(
          rawSha(await readFile(item.targetPath)),
          `completion consistency: ${item.relativePath} sha256`
        ).toBe(rawSha(await readFile(item.sourcePath as string)))
      }
      const second = buildSyncPlan(result.comparison, 'left-to-right', 'incremental')
      expect(second.copy.count).toBe(0)
      expect(second.update.count).toBe(0)
    },
    120_000
  )

  it(
    'does not treat unchecked mirror deletions as a failed check',
    async () => {
      const root = await scratchRoot()
      const left = join(root, 'left')
      const right = join(root, 'right')
      await mkdir(left, { recursive: true })
      await writeStampedBytes(diskPath(left, 'new.txt'), Buffer.from('new'), BINARY_STAMP)
      await writeStampedBytes(diskPath(right, 'stale.txt'), Buffer.from('stale'), BINARY_STAMP + 1)

      const comparison = await comparePair(left, right)
      const preview = await previewSync(platform, comparison, 'left-to-right', 'mirror', 1)
      expect(preview.plan.copy.count).toBe(1)
      expect(preview.plan.delete.count).toBe(1)

      // Deletions default to unchecked: the copied file lands, the stale one stays.
      const result = await applySyncPreview(platform, preview, createComparisonCache(), [])
      expect(result.copied).toBe(1)
      expect(result.deleted).toBe(0)
      expect(await platform.exists(diskPath(right, 'stale.txt'))).toBe(true)
      // The remaining difference is only the unchecked deletion, not a failure.
      expect(result.comparison.counts).toEqual({ same: 1, added: 1, removed: 0, modified: 0 })
    },
    60_000
  )
})

/* ------------------------------------------------------------------ */
/* Symbolic link metadata: lstat mtime alignment only                   */
/* ------------------------------------------------------------------ */

const LINK_SOURCE_STAMP = 1_700_001_000_000
const LINK_TARGET_STAMP = 1_800_001_000_000

async function linkWithStamp(target: string, path: string, stampMs: number): Promise<void> {
  await symlink(target, path)
  const seconds = Math.floor(stampMs) / 1000 + 1e-6
  await lutimes(path, seconds, seconds)
}

describe('real-disk sync symlink metadata', () => {
  it(
    'aligns the target link lstat mtime to the source without changing target or counts',
    async () => {
      const root = await scratchRoot()
      const left = join(root, 'left')
      const right = join(root, 'right')
      await mkdir(left, { recursive: true })
      await mkdir(right, { recursive: true })
      await writeStamped(join(left, 'shared.txt'), 'shared\n', BINARY_STAMP)
      await writeStamped(join(right, 'shared.txt'), 'shared\n', BINARY_STAMP)

      for (const side of [left, right]) {
        await linkWithStamp(
          'shared.txt',
          diskPath(side, 'same-target-link'),
          side === left ? LINK_SOURCE_STAMP : LINK_TARGET_STAMP
        )
        await linkWithStamp(
          'missing-target.txt',
          diskPath(side, 'dangling-link'),
          side === left ? LINK_SOURCE_STAMP + 1_000 : LINK_TARGET_STAMP + 1_000
        )
        await linkWithStamp(
          'shared.txt',
          diskPath(side, 'stable-link'),
          LINK_SOURCE_STAMP - 1_000
        )
      }

      const comparison = await comparePair(left, right)
      // Links still judge by target string only: all four pairs are `same`.
      expect(comparison.counts, 'symlink metadata: four-state counts').toEqual({
        same: 4,
        added: 0,
        removed: 0,
        modified: 0
      })

      const preview = await previewSync(platform, comparison, 'left-to-right', 'mirror', 1)
      // Metadata alignment never becomes a plan item or a counted group.
      expect(preview.plan.copy.count, 'symlink metadata: alignment is not a copy').toBe(0)
      expect(preview.plan.update.count, 'symlink metadata: alignment is not an update').toBe(0)
      expect(preview.plan.delete.count, 'symlink metadata: alignment is not a delete').toBe(0)
      const plannedLinks = [
        ...preview.plan.copy.items,
        ...preview.plan.update.items,
        ...preview.plan.delete.items
      ].map((item) => item.relativePath)
      expect(plannedLinks, 'symlink metadata: no link enters the plan').toEqual([])

      const stableBefore = Math.floor((await lstat(diskPath(right, 'stable-link'))).mtimeMs)
      const recorded = recordWrites(platform)
      const result = await applySyncPreview(recorded.port, preview, createComparisonCache(), [])
      expect(result.copied).toBe(0)
      expect(result.updated).toBe(0)
      expect(result.deleted).toBe(0)
      // Aligning a link mtime writes no ordinary file content at all.
      expect(recorded.writes, 'symlink metadata: alignment writes no file content').toEqual([])

      for (const relativePath of ['same-target-link', 'dangling-link']) {
        const source = diskPath(left, relativePath)
        const target = diskPath(right, relativePath)
        const targetInfo = await lstat(target)
        expect(
          targetInfo.isSymbolicLink(),
          `symlink metadata: ${relativePath} must stay a symlink`
        ).toBe(true)
        expect(
          await readlink(target),
          `symlink metadata: ${relativePath} link target`
        ).toBe(await readlink(source))
        expect(target, `symlink metadata: ${relativePath} relative path`).toBe(
          diskPath(right, relativePath)
        )
        expect(
          Math.floor(targetInfo.mtimeMs / 1000),
          `symlink metadata: ${relativePath} lstat mtime seconds`
        ).toBe(Math.floor((await lstat(source)).mtimeMs / 1000))
      }

      // A link whose mtime already matched is not touched at all.
      expect(
        Math.floor((await lstat(diskPath(right, 'stable-link'))).mtimeMs),
        'symlink metadata: already-aligned link stays untouched'
      ).toBe(stableBefore)

      // Alignment still leaves the dry-run empty: neither byte nor count changed.
      const second = await previewSync(platform, result.comparison, 'left-to-right', 'mirror', 2)
      expect(second.plan.copy.count, 'symlink metadata: second dry-run copy').toBe(0)
      expect(second.plan.update.count, 'symlink metadata: second dry-run update').toBe(0)
      expect(second.plan.delete.count, 'symlink metadata: second dry-run delete').toBe(0)
    },
    60_000
  )
})

/* ------------------------------------------------------------------ */
/* Idempotent dry-run after a select-all deletion                       */
/* ------------------------------------------------------------------ */

describe('real-disk sync idempotent dry-run', () => {
  it(
    'lists only the pending deletion after applying, and nothing once it is deleted',
    async () => {
      const root = await scratchRoot()
      const left = join(root, 'left')
      const right = join(root, 'right')
      await mkdir(left, { recursive: true })
      await mkdir(right, { recursive: true })
      await writeStamped(join(left, 'same.txt'), 'same\n', BINARY_STAMP)
      await writeStamped(join(right, 'same.txt'), 'same\n', BINARY_STAMP)

      const cache = createComparisonCache()

      /** One cycle: dry-run → apply copy/update → dry-run → delete all → dry-run. */
      async function cycle(round: number): Promise<void> {
        await writeStampedBytes(diskPath(left, `round-${round}/new.txt`), Buffer.from('new'), BINARY_STAMP + round)
        await writeStampedBytes(diskPath(right, `round-${round}/stale.txt`), Buffer.from('stale'), BINARY_STAMP + round)

        const before = await comparePair(left, right, cache)
        const first = await previewSync(platform, before, 'left-to-right', 'mirror', round * 10 + 1)
        expect(first.plan.copy.count, `idempotent dry-run: round ${round} first copy`).toBe(1)
        expect(first.plan.update.count, `idempotent dry-run: round ${round} first update`).toBe(0)
        expect(first.plan.delete.count, `idempotent dry-run: round ${round} first delete`).toBe(1)
        // Deletions stay opt-in: the preview lists them but nothing is checked.
        expect(first.plan.delete.items.map((item) => item.relativePath)).toEqual([
          `round-${round}/stale.txt`
        ])

        const applied = await applySyncPreview(platform, first, cache, [])
        expect(applied.copied, `idempotent dry-run: round ${round} applied copy`).toBe(1)
        expect(applied.deleted, `idempotent dry-run: round ${round} default delete`).toBe(0)

        // Dry-run after the copy: the pending deletion is still listed, no writes.
        const pending = await previewSync(platform, applied.comparison, 'left-to-right', 'mirror', round * 10 + 2)
        expect(pending.plan.copy.count, `idempotent dry-run: round ${round} pending copy`).toBe(0)
        expect(pending.plan.update.count, `idempotent dry-run: round ${round} pending update`).toBe(0)
        expect(pending.plan.delete.count, `idempotent dry-run: round ${round} pending delete`).toBe(1)

        const checked = pending.plan.delete.items.map((item) => item.relativePath)
        const removed = await applySyncPreview(platform, pending, cache, checked)
        expect(removed.deleted, `idempotent dry-run: round ${round} checked delete`).toBe(1)

        // Dry-run after the select-all deletion: all three groups are empty.
        const last = await previewSync(platform, removed.comparison, 'left-to-right', 'mirror', round * 10 + 3)
        expect(last.plan.copy.count, `idempotent dry-run: round ${round} final copy`).toBe(0)
        expect(last.plan.update.count, `idempotent dry-run: round ${round} final update`).toBe(0)
        expect(last.plan.delete.count, `idempotent dry-run: round ${round} final delete`).toBe(0)
        expect(last.plan.totalCount, `idempotent dry-run: round ${round} final total`).toBe(0)
      }

      await cycle(1)
      // Repeating the same 1)–3) on the very same pair stays idempotent.
      await cycle(2)
    },
    120_000
  )
})
