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
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  utimes,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { compareDirectories, createComparisonCache, scanDirectory } from '@core/directory/compare'
import type { ComparisonCache, DirectoryComparison } from '@core/directory/compare'
import { buildSyncPlan, executeSyncPlan, SyncTargetError } from '@core/directory/sync'
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
  digestFiles: (paths, options) =>
    invoke(PLATFORM_CHANNELS.digestFiles, paths, options) as Promise<DigestFilesResult>,
  cancelOperation: (operationId) =>
    invoke(PLATFORM_CHANNELS.cancelOperation, operationId) as Promise<void>,
  writeTextFile: (path, content, modifiedMs) =>
    invoke(PLATFORM_CHANNELS.writeTextFile, path, content, modifiedMs) as Promise<void>,
  exists: (path) => invoke(PLATFORM_CHANNELS.exists, path) as Promise<boolean>,
  statPath: (path) => invoke(PLATFORM_CHANNELS.statPath, path) as Promise<PathProbeKind>,
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
    readTextFile: (path) => port.readTextFile(path),
    writeTextFile: (path, content, modifiedMs) => port.writeTextFile(path, content, modifiedMs),
    ensureDirectory: (path) => port.ensureDirectory(path),
    deleteFile: (path) => port.deleteFile(path),
    removeDirectory: (path) => port.removeDirectory(path),
    statPath: (path) => port.statPath(path),
    listDirectory: (path) => port.listDirectory(path)
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
  expect([...after.files.keys()].filter((relativePath) => relativePath.endsWith('.tmp'))).toEqual([])
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
    'refuses a read-only target before writing any planned item',
    async () => {
      // Permission bits are meaningless for root; only this case is skipped.
      const fixture = await buildSafetyFixture()
      const comparison = await comparePair(fixture.left, fixture.right)
      const plan = buildSyncPlan(comparison, 'left-to-right', 'mirror')
      expect(plan.totalCount).toBe(6)
      const before = await snapshotTree(fixture.right)

      let error: unknown
      try {
        await chmod(fixture.right, 0o555)
        error = await executeSyncPlan(plan, syncIo(platform), {
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

      // Nothing was written, deleted or left behind: the target is identical.
      expectSameSnapshot(before, await snapshotTree(fixture.right))
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

      const error = await executeSyncPlan(plan, syncIo(platform), {
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

      // No earlier item landed, and the occupying directory is untouched.
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
        writeTextFile: async (path, content, modifiedMs) => {
          await platform.writeTextFile(path, content, modifiedMs)
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
        writeTextFile: async (path, content, modifiedMs) => {
          if (path.endsWith('added/one.txt')) {
            throw Object.assign(new Error('permission denied'), { code: 'EACCES' })
          }
          return platform.writeTextFile(path, content, modifiedMs)
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
})
