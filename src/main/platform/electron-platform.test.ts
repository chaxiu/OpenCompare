import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath as fsRealpath,
  rm,
  stat,
  symlink,
  utimes,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  compareDirectories,
  createComparisonCache,
  scanDirectory
} from '@core/directory/compare'
import type { ListDirectory } from '@core/directory/compare'
import { sha256Bytes, sha256Hex } from '@core/directory/hash'
import { buildSyncPlan, SyncTargetError } from '@core/directory/sync'
import { DIRECTORY_SCENE, DIRECTORY_SAMPLE_PATHS, SAMPLE_FIXTURE_FILES } from '@shared/fixtures'
import { PLATFORM_CHANNELS } from '@shared/platform/channels'
import type {
  DigestFilesResult,
  DirectoryEntry,
  DirectoryListing,
  FileDigest,
  PathProbeKind,
  PlatformPort,
  UserSettings
} from '@shared/platform/types'
import { applySyncPreview, previewSync } from '@renderer/workbench/directoryOps'
import {
  DEFAULT_STAT_CONCURRENCY,
  activeDigestStreamCount,
  cancelOperation,
  digestFiles,
  digestOperationCount,
  listDirectories,
  registerPlatformIpc
} from './electron-platform'
import type { DigestReadStream, ListableStat } from './electron-platform'
import { OperationCancelledError } from '@core/io'

const { handlers, dialogs, appState } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  dialogs: {
    open: vi.fn(async () => ({ canceled: true, filePaths: [] as string[] })),
    save: vi.fn(async () => ({ canceled: true, filePath: undefined as string | undefined }))
  },
  // The settings file lives under `userData`; every test points that at its own
  // scratch directory instead of the real user profile.
  appState: { userData: '', locale: 'en-US' }
}))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? appState.userData : tmpdir()),
    getLocale: () => appState.locale
  },
  dialog: {
    showOpenDialog: (...args: unknown[]) => dialogs.open(...(args as [])),
    showSaveDialog: (...args: unknown[]) => dialogs.save(...(args as []))
  },
  ipcMain: {
    handle: (_channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(_channel, handler)
    }
  }
}))

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = handlers.get(channel)
  if (handler === undefined) throw new Error(`No handler registered for ${channel}`)
  return Promise.resolve(handler({}, ...args))
}

/**
 * What the renderer adapter does with a structured cancellation: turn it back
 * into the core's `OperationCancelledError` inside its own process.
 */
async function coreDigest(request: Promise<DigestFilesResult>): Promise<readonly FileDigest[]> {
  const result = await request
  if (Array.isArray(result)) return result
  throw new OperationCancelledError()
}

const platform: PlatformPort = {
  kind: 'electron',
  homeDirectory: () => invoke(PLATFORM_CHANNELS.homeDirectory) as Promise<string>,
  workingDirectory: () => invoke(PLATFORM_CHANNELS.workingDirectory) as Promise<string>,
  selectDirectory: async () => null,
  selectFile: (options) => invoke(PLATFORM_CHANNELS.selectFile, options) as Promise<string | null>,
  // Drag & drop paths are resolved in preload (`webUtils`), not over IPC.
  resolveDroppedPath: async () => '',
  saveFile: (options) => invoke(PLATFORM_CHANNELS.saveFile, options) as Promise<string | null>,
  listDirectory: (path) => invoke(PLATFORM_CHANNELS.listDirectory, path) as Promise<DirectoryEntry[]>,
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

const roots: string[] = []

async function scratchRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'opencompare-sync-'))
  roots.push(root)
  return root
}

async function stamp(path: string, ms: number): Promise<void> {
  await utimes(path, new Date(ms), new Date(ms))
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

beforeEach(async () => {
  appState.userData = await scratchRoot()
  appState.locale = 'en-US'
})

beforeAll(() => registerPlatformIpc())

describe('realpath capability', () => {
  it('resolves a symlinked root, keeps the sample mount and falls back per path', async () => {
    const root = await scratchRoot()
    const target = join(root, 'real-tree')
    await mkdir(target, { recursive: true })
    const link = join(root, 'alias-tree')
    await symlink(target, link)
    const missing = join(root, 'missing-tree')

    const resolved = await platform.realpath([link, missing, '/samples/csv'])

    expect(resolved[0]).toBe(await fsRealpath(target))
    expect(resolved[1]).toBe(missing)
    expect(resolved[2]).toBe('/samples/csv')
    expect(resolved).toHaveLength(3)
  })
})

describe('electron real-directory sync', () => {
  it('writes through the IPC handlers, clears the differences and is idempotent', async () => {
    const root = await scratchRoot()
    const left = join(root, 'left')
    const right = join(root, 'right')
    await mkdir(join(left, 'nested'), { recursive: true })
    await mkdir(right, { recursive: true })

    await writeFile(join(left, 'same.txt'), 'identical')
    await writeFile(join(right, 'same.txt'), 'identical')
    await writeFile(join(left, 'changed.txt'), 'before')
    await writeFile(join(right, 'changed.txt'), 'after!')
    await writeFile(join(left, 'left-only.txt'), 'source')
    await writeFile(join(left, 'nested', 'deep.txt'), 'deep-source')
    await writeFile(join(right, 'right-only.txt'), 'stale')

    // Real, distinct mtimes: the case the web runtime hides with modifiedMs = 0.
    await stamp(join(left, 'same.txt'), 1_000_000)
    await stamp(join(right, 'same.txt'), 1_000_000)
    await stamp(join(left, 'changed.txt'), 1_000_000)
    await stamp(join(right, 'changed.txt'), 2_000_000)
    await stamp(join(left, 'left-only.txt'), 1_500_000)
    await stamp(join(left, 'nested', 'deep.txt'), 1_500_000)
    await stamp(join(right, 'right-only.txt'), 2_500_000)

    const cache = createComparisonCache()
    const comparison = await compareDirectories(
      left,
      right,
      (path) => platform.listDirectory(path),
      (path) => platform.readTextFile(path),
      cache
    )
    expect(comparison.counts).toEqual({ same: 1, added: 1, removed: 2, modified: 1 })

    const preview = await previewSync(platform, comparison, 'left-to-right', 'incremental', 1)
    expect(preview.materializeTarget).toBe(false)
    expect(preview.plan.copy.count).toBe(2)
    expect(preview.plan.update.count).toBe(1)
    expect(preview.plan.totalCount).toBe(3)

    const result = await applySyncPreview(platform, preview, cache, [])
    expect(result.copied).toBe(2)
    expect(result.updated).toBe(1)
    expect(await readFile(join(right, 'nested', 'deep.txt'), 'utf8')).toBe('deep-source')

    // The refreshed comparison must see the just-synced files as in sync, not
    // as "modified" thanks to the fresh write mtime.
    expect(result.comparison.counts.modified).toBe(0)
    expect(result.comparison.counts.removed).toBe(0)
    expect(result.comparison.counts.same).toBe(4)

    const second = buildSyncPlan(result.comparison, 'left-to-right', 'incremental')
    expect(second.totalCount).toBe(0)
  })

  it(
    'cleans up the materialised sandbox when a read-only-sample run fails',
    async () => {
      const root = await scratchRoot()
      const left = join(root, 'left')
      await mkdir(left, { recursive: true })
      await writeFile(join(left, '左 仅此.txt'), 'left only body', 'utf8')

      const comparison = await compareDirectories(
        left,
        DIRECTORY_SAMPLE_PATHS.right,
        (path) => platform.listDirectory(path),
        (path) => platform.readTextFile(path),
        createComparisonCache()
      )
      const preview = await previewSync(
        platform,
        comparison,
        'left-to-right',
        'mirror',
        2_000_000_000_000 + Date.now()
      )
      // The sample mount is read-only, so writes go to a fresh materialised root.
      expect(preview.materializeTarget).toBe(true)
      expect(await platform.statPath(preview.plan.targetRoot)).toBe('missing')

      const failing: PlatformPort = {
        ...platform,
        writeTextFile: async (path, content, modifiedMs) => {
          if (path.endsWith('左 仅此.txt')) {
            throw Object.assign(new Error('permission denied'), { code: 'EACCES' })
          }
          return platform.writeTextFile(path, content, modifiedMs)
        }
      }

      const error = await applySyncPreview(failing, preview, createComparisonCache(), []).then(
        () => undefined,
        (reason: unknown) => reason
      )

      expect(error).toBeInstanceOf(SyncTargetError)
      expect((error as SyncTargetError).code).toBe('EACCES')
      // The sandbox the materialisation created (files, both directory levels and
      // the root) is removed again, so nothing half-copied survives.
      expect(await platform.statPath(preview.plan.targetRoot)).toBe('missing')
    },
    60_000
  )
})

describe('sync write and directory channels', () => {
  async function entriesOf(directory: string): Promise<string[]> {
    return (await readdir(directory)).sort()
  }

  it('writes the sync channel atomically and leaves no temporary file', async () => {
    const root = await scratchRoot()
    const target = join(root, 'note.txt')
    await writeFile(target, 'old body', 'utf8')

    await platform.writeTextFile(target, 'new body', 1_600_000_000_000)

    expect(await readFile(target, 'utf8')).toBe('new body')
    expect(Math.floor((await stat(target)).mtimeMs)).toBe(1_600_000_000_000)
    expect((await entriesOf(root)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('rejects an occupied target with a readable reason and no residue', async () => {
    const root = await scratchRoot()
    const target = join(root, 'occupied')
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'keep.txt'), 'original', 'utf8')

    const error = await platform.writeTextFile(target, 'new body').then(
      () => undefined,
      (reason: unknown) => reason
    )

    expect(error).toBeInstanceOf(Error)
    const message = (error as Error).message
    expect(message).toMatch(/[\u4e00-\u9fff]/)
    expect(message).toContain(target)
    expect(message).toMatch(/EISDIR|ENOTEMPTY|EEXIST|EPERM|EACCES/)
    expect(message).not.toContain('.tmp')
    expect(await entriesOf(target)).toEqual(['keep.txt'])
    expect(await readFile(join(target, 'keep.txt'), 'utf8')).toBe('original')
    expect((await entriesOf(root)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('removes one empty directory and rejects a non-empty one readably', async () => {
    const root = await scratchRoot()
    const empty = join(root, 'empty')
    await mkdir(empty, { recursive: true })
    await platform.removeDirectory(empty)
    expect(await platform.statPath(empty)).toBe('missing')

    const full = join(root, 'full')
    await mkdir(full, { recursive: true })
    await writeFile(join(full, 'keep.txt'), 'x', 'utf8')
    const error = await platform.removeDirectory(full).then(
      () => undefined,
      (reason: unknown) => reason
    )

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toMatch(/[\u4e00-\u9fff]/)
    expect((error as Error).message).toContain(full)
    expect(await entriesOf(full)).toEqual(['keep.txt'])
  })
})

describe('directory listing', () => {
  it('returns the same entries as a serial stat under the bounded window', async () => {
    const root = await scratchRoot()
    const wide = join(root, 'wide')
    await mkdir(join(wide, 'nested'), { recursive: true })

    const names = ['nested']
    for (let index = 0; index < 300; index += 1) {
      const name = `file-${String(index).padStart(3, '0')}.txt`
      await writeFile(join(wide, name), 'x'.repeat((index % 7) + 1))
      names.push(name)
    }

    // Serial reference: readdir order, one stat at a time.
    const serial: DirectoryEntry[] = []
    for (const name of await readdir(wide)) {
      const path = join(wide, name)
      const info = await stat(path)
      serial.push({
        name,
        path,
        isDirectory: info.isDirectory(),
        size: info.size,
        modifiedMs: info.mtimeMs
      })
    }

    const listed = (await platform.listDirectory(wide)) as DirectoryEntry[]

    expect(listed).toHaveLength(names.length)
    const byName = (entries: readonly DirectoryEntry[]): DirectoryEntry[] =>
      [...entries].sort((left, right) => left.name.localeCompare(right.name))
    expect(byName(listed)).toEqual(byName(serial))
  })

  it('keeps a dangling symbolic link as a comparable link entry, not broken', async () => {
    const root = await scratchRoot()
    const tree = join(root, 'tree')
    await mkdir(join(tree, 'nested'), { recursive: true })
    await writeFile(join(tree, 'kept.txt'), 'kept')
    await symlink('/nonexistent-opencompare-target', join(tree, 'dangling'))

    const listed = (await platform.listDirectory(tree)) as DirectoryEntry[]
    expect(listed).toHaveLength(3)

    const dangling = listed.find((entry) => entry.name === 'dangling')
    expect(dangling).toMatchObject({
      isDirectory: false,
      isSymbolicLink: true,
      linkTarget: '/nonexistent-opencompare-target',
      linkTargetKind: 'missing'
    })
    // A dangling link is still a readable entry: only its target is missing.
    expect(dangling?.broken).toBeUndefined()

    // The batch channel keeps the same link entry.
    const [batchSlot] = (await platform.listDirectories([tree])) as DirectoryListing[]
    if (!batchSlot.ok) throw new Error('expected the batch slot to resolve')
    expect(batchSlot.entries.find((entry) => entry.name === 'dangling')).toEqual(dangling)

    // Healthy entries keep the pre-fix `stat` shape (lstat of a plain entry matches).
    const serial: DirectoryEntry[] = []
    for (const name of ['kept.txt', 'nested']) {
      const info = await stat(join(tree, name))
      serial.push({
        name,
        path: join(tree, name),
        isDirectory: info.isDirectory(),
        size: info.size,
        modifiedMs: info.mtimeMs
      })
    }
    expect(listed.filter((entry) => !entry.isSymbolicLink)).toEqual(
      expect.arrayContaining(serial)
    )
    expect(listed.filter((entry) => !entry.isSymbolicLink)).toHaveLength(2)
  })

  it('keeps link entries comparable when the target is unreadable', async () => {
    const root = await scratchRoot()
    const tree = join(root, 'mixed')
    const locked = join(tree, 'locked')
    await mkdir(locked, { recursive: true })
    await writeFile(join(tree, 'readable.txt'), 'readable')
    await writeFile(join(locked, 'target.txt'), 'target')
    await symlink('/nonexistent-opencompare-target', join(tree, 'dangling'))
    // Resolution traverses the unsearchable directory, so `stat` fails while
    // `lstat` on the link itself still succeeds.
    await symlink(join(locked, 'target.txt'), join(tree, 'blocked'))

    try {
      await chmod(locked, 0o000)
      const listed = (await platform.listDirectory(tree)) as DirectoryEntry[]

      expect(listed.map((entry) => entry.name).sort()).toEqual([
        'blocked',
        'dangling',
        'locked',
        'readable.txt'
      ])
      const readable = listed.find((entry) => entry.name === 'readable.txt')
      expect(readable?.broken).toBeUndefined()
      for (const name of ['blocked', 'dangling']) {
        const link = listed.find((entry) => entry.name === name)
        expect(link?.isSymbolicLink).toBe(true)
        expect(link?.linkTargetKind).toBe('missing')
        // The unreadable target never turns the link itself into a skipped entry.
        expect(link?.broken).toBeUndefined()
      }
    } finally {
      await chmod(locked, 0o755)
    }
  })

  it('scans a directory link, a link loop and a dangling link as single leaf entries', async () => {
    const root = await scratchRoot()
    const left = join(root, 'left')
    const right = join(root, 'right')
    const target = join(root, 'shared', 'target')
    await mkdir(target, { recursive: true })
    await mkdir(left)
    await mkdir(right)
    for (let index = 0; index < 12; index += 1) {
      await writeFile(join(target, `file-${index}.txt`), `target-${index}`)
    }
    await writeFile(join(left, 'real.txt'), 'real')
    await symlink(target, join(left, 'dir-link'))
    // A loop back to the scanned root must never be re-entered.
    await symlink(left, join(left, 'loop'))
    await symlink('/nonexistent-opencompare-target', join(left, 'dangling'))

    const list: ListDirectory = (path) => platform.listDirectory(path)
    const batched = (paths: readonly string[]) => platform.listDirectories(paths)
    const startedAt = Date.now()
    const tree = await scanDirectory(left, list, { listDirectories: batched })
    expect(Date.now() - startedAt).toBeLessThan(5000)

    expect(tree.index.get('dir-link')).toMatchObject({ kind: 'file', linkTargetKind: 'directory' })
    expect(tree.index.get('loop')).toMatchObject({ kind: 'file', linkTargetKind: 'directory' })
    expect(tree.index.get('dangling')).toMatchObject({
      kind: 'file',
      linkTargetKind: 'missing'
    })
    // root + real.txt + three link entries; no target subtree was walked.
    expect([...tree.index.keys()]).toHaveLength(5)
    expect([...tree.index.keys()].some((key) => key.startsWith('dir-link/'))).toBe(false)
    expect([...tree.index.keys()].some((key) => key.startsWith('loop/'))).toBe(false)
    expect(tree.skipped).toBe(0)

    // Comparing against an empty right side counts root-level entries only:
    // real.txt plus the three link leaves, never the 12-file target subtree.
    const comparison = await compareDirectories(
      left,
      right,
      list,
      (path) => platform.readTextFile(path),
      createComparisonCache(),
      undefined,
      { listDirectories: batched }
    )
    expect(comparison.fileCount).toBe(4)
    expect(comparison.counts).toEqual({ same: 0, added: 0, removed: 4, modified: 0 })
  })

  it('classifies real link entries into all four states by target string', async () => {
    const root = await scratchRoot()
    const left = join(root, 'left')
    const right = join(root, 'right')
    const sharedA = join(root, 'shared-a')
    const sharedB = join(root, 'shared-b')
    await mkdir(left)
    await mkdir(right)
    await mkdir(sharedA)
    await mkdir(sharedB)

    await symlink(sharedA, join(left, 'same-link'))
    await symlink(sharedA, join(right, 'same-link'))
    await symlink(sharedA, join(left, 'diff-link'))
    await symlink(sharedB, join(right, 'diff-link'))
    await symlink(sharedA, join(left, 'removed-link'))
    await symlink(sharedB, join(right, 'added-link'))
    await symlink(sharedA, join(left, 'clash'))
    await writeFile(join(right, 'clash'), 'plain file')

    const comparison = await compareDirectories(
      left,
      right,
      (path) => platform.listDirectory(path),
      (path) => platform.readTextFile(path),
      createComparisonCache(),
      undefined,
      {
        digestFiles: (paths) => coreDigest(platform.digestFiles(paths)),
        listDirectories: (paths) => platform.listDirectories(paths)
      }
    )

    expect(comparison.counts).toEqual({ same: 1, added: 1, removed: 1, modified: 2 })
    expect(comparison.fileCount).toBe(5)
    expect(
      comparison.counts.same +
        comparison.counts.added +
        comparison.counts.removed +
        comparison.counts.modified
    ).toBe(comparison.fileCount)

    const byName = new Map(comparison.root.children.map((child) => [child.name, child]))
    expect(byName.get('same-link')?.status).toBe('same')
    expect(byName.get('diff-link')?.status).toBe('modified')
    expect(byName.get('removed-link')?.status).toBe('removed')
    expect(byName.get('added-link')?.status).toBe('added')
    // A link against a plain file is one type-clash entry.
    expect(byName.get('clash')).toMatchObject({ kind: 'file', status: 'modified' })
  })

  it('compares links by target string, never by target file content', async () => {
    const root = await scratchRoot()
    const left = join(root, 'left')
    const right = join(root, 'right')
    await mkdir(left)
    await mkdir(right)
    // The same relative target string resolves to different bodies per side.
    await writeFile(join(left, 'target.txt'), 'LEFT-BODY')
    await writeFile(join(right, 'target.txt'), 'RIGHT-BODY')
    await symlink('target.txt', join(left, 'same-target'))
    await symlink('target.txt', join(right, 'same-target'))
    // Different target strings point at identical bodies outside both roots.
    await writeFile(join(root, 'a.txt'), 'IDENTICAL')
    await writeFile(join(root, 'b.txt'), 'IDENTICAL')
    await symlink('../a.txt', join(left, 'diff-target'))
    await symlink('../b.txt', join(right, 'diff-target'))

    const comparison = await compareDirectories(
      left,
      right,
      (path) => platform.listDirectory(path),
      (path) => platform.readTextFile(path),
      createComparisonCache(),
      undefined,
      {
        digestFiles: (paths) => coreDigest(platform.digestFiles(paths)),
        listDirectories: (paths) => platform.listDirectories(paths)
      }
    )

    const byName = new Map(comparison.root.children.map((child) => [child.name, child]))
    expect(byName.get('same-target')).toMatchObject({
      kind: 'file',
      status: 'same',
      linkTargetKind: 'file'
    })
    expect(byName.get('diff-target')).toMatchObject({ kind: 'file', status: 'modified' })
  })

  it('compares dangling links without counting them as skipped', async () => {
    const root = await scratchRoot()
    const left = join(root, 'left')
    const right = join(root, 'right')
    await mkdir(left)
    await mkdir(right)
    await symlink('/nonexistent-opencompare-target', join(left, 'same-dangling'))
    await symlink('/nonexistent-opencompare-target', join(right, 'same-dangling'))
    await symlink('/nonexistent-opencompare-target', join(left, 'left-dangling'))

    const comparison = await compareDirectories(
      left,
      right,
      (path) => platform.listDirectory(path),
      (path) => platform.readTextFile(path),
      createComparisonCache(),
      undefined,
      { listDirectories: (paths) => platform.listDirectories(paths) }
    )

    expect(comparison.counts).toEqual({ same: 1, added: 0, removed: 1, modified: 0 })
    expect(comparison.leftSkipped).toBe(0)
    expect(comparison.rightSkipped).toBe(0)
  })

  it('reports skips per side instead of merging both sides', async () => {
    const root = await scratchRoot()
    const left = join(root, 'left')
    const right = join(root, 'right')
    await mkdir(join(left, 'locked'), { recursive: true })
    await writeFile(join(left, 'locked', 'hidden.txt'), 'hidden')
    await writeFile(join(left, 'seen.txt'), 'seen')
    await mkdir(right)
    await writeFile(join(right, 'seen.txt'), 'seen')

    const compare = () =>
      compareDirectories(
        left,
        right,
        (path) => platform.listDirectory(path),
        (path) => platform.readTextFile(path),
        createComparisonCache(),
        undefined,
        { listDirectories: (paths) => platform.listDirectories(paths) }
      )

    try {
      await chmod(join(left, 'locked'), 0o000)
      const leftRun = await compare()
      expect(leftRun.leftSkipped).toBe(1)
      expect(leftRun.rightSkipped).toBe(0)
      expect(leftRun.skipped).toBe(1)
    } finally {
      await chmod(join(left, 'locked'), 0o755)
    }

    await mkdir(join(right, 'locked'), { recursive: true })
    await writeFile(join(right, 'locked', 'hidden.txt'), 'hidden')
    try {
      await chmod(join(right, 'locked'), 0o000)
      const rightRun = await compare()
      expect(rightRun.leftSkipped).toBe(0)
      expect(rightRun.rightSkipped).toBe(1)
      expect(rightRun.skipped).toBe(1)
    } finally {
      await chmod(join(right, 'locked'), 0o755)
    }
  })

  it('rejects a missing or non-directory root with a readable message', async () => {
    const root = await scratchRoot()
    const missing = join(root, 'missing')
    const file = join(root, 'note.txt')
    await writeFile(file, 'hello')

    const missingOutcome = await platform.listDirectory(missing).then(
      () => new Error('expected the listing to reject'),
      (error: unknown) => error
    )
    expect(missingOutcome).toBeInstanceOf(Error)
    expect((missingOutcome as Error).message).toContain('无法读取目录')
    expect((missingOutcome as Error).message).toContain(missing)

    const fileOutcome = await platform.listDirectory(file).then(
      () => new Error('expected the listing to reject'),
      (error: unknown) => error
    )
    expect((fileOutcome as Error).message).toContain('无法读取目录')
    expect((fileOutcome as Error).message).toContain(file)
  })

  it('rejects reading a dangling symbolic link with a readable message over IPC', async () => {
    const root = await scratchRoot()
    const dangling = join(root, 'dangling.txt')
    await symlink('/nonexistent-opencompare-target', dangling)

    const outcome = await platform.readTextFile(dangling).then(
      () => new Error('expected the read to reject'),
      (error: unknown) => error
    )

    expect(outcome).toBeInstanceOf(Error)
    expect((outcome as Error).message).toContain('无法读取文件')
    expect((outcome as Error).message).toContain(dangling)
    expect((outcome as Error).message).not.toContain('Error invoking remote method')
  })
})

describe('batch directory listing', () => {
  function codedError(code: string): Error {
    return Object.assign(new Error(`${code}: too many open files`), { code })
  }

  it('returns one input-ordered slot per directory and keeps failures local', async () => {
    const root = await scratchRoot()
    const first = join(root, 'first')
    const second = join(root, 'second')
    const missing = join(root, 'missing')
    await mkdir(join(first, 'nested'), { recursive: true })
    await mkdir(second, { recursive: true })
    await writeFile(join(first, 'a.txt'), 'alpha')
    await writeFile(join(second, 'b.txt'), 'bravo')

    const listings = (await platform.listDirectories([
      first,
      missing,
      second
    ])) as DirectoryListing[]

    expect(listings.map((listing) => listing.path)).toEqual([first, missing, second])
    expect(listings.map((listing) => listing.ok)).toEqual([true, false, true])

    const byName = (entries: readonly DirectoryEntry[]): DirectoryEntry[] =>
      [...entries].sort((left, right) => left.name.localeCompare(right.name))
    const [firstSlot, missingSlot, secondSlot] = listings
    if (!firstSlot.ok || !secondSlot.ok) {
      throw new Error('expected the readable slots to resolve')
    }
    expect(byName(firstSlot.entries)).toEqual(byName(await platform.listDirectory(first)))
    expect(byName(secondSlot.entries)).toEqual(byName(await platform.listDirectory(second)))
    expect(missingSlot.ok).toBe(false)
    if (!missingSlot.ok) {
      expect(missingSlot.reason).toContain('无法读取目录')
      expect(missingSlot.reason).toContain(missing)
    }
  })

  it('shares one bounded stat budget across every directory in the batch', async () => {
    const root = await scratchRoot()
    const directories: string[] = []
    const directoryCount = 6
    const entriesPerDirectory = 10
    for (let directory = 0; directory < directoryCount; directory += 1) {
      const path = join(root, `dir-${directory}`)
      await mkdir(path, { recursive: true })
      for (let entry = 0; entry < entriesPerDirectory; entry += 1) {
        await writeFile(join(path, `file-${entry}.txt`), 'x')
      }
      directories.push(path)
    }

    let inFlight = 0
    let peak = 0
    const statFile = async (): Promise<ListableStat> => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 1))
      inFlight -= 1
      return { isDirectory: () => false, size: 1, mtimeMs: 1 }
    }

    const listings = await listDirectories(directories, { lstatFile: statFile })

    expect(listings).toHaveLength(directoryCount)
    expect(listings.every((listing) => listing.ok)).toBe(true)
    // One window for the whole batch, not one per directory.
    expect(DEFAULT_STAT_CONCURRENCY).toBeLessThan(directoryCount * entriesPerDirectory)
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThanOrEqual(DEFAULT_STAT_CONCURRENCY)

    // The budget is a per-call override, so a test can shrink it.
    let narrowInFlight = 0
    let narrowPeak = 0
    const narrowStat = async (): Promise<ListableStat> => {
      narrowInFlight += 1
      narrowPeak = Math.max(narrowPeak, narrowInFlight)
      await new Promise((resolve) => setTimeout(resolve, 1))
      narrowInFlight -= 1
      return { isDirectory: () => false, size: 1, mtimeMs: 1 }
    }
    const narrowed = await listDirectories(directories, {
      lstatFile: narrowStat,
      statConcurrency: 3
    })
    expect(narrowed.every((listing) => listing.ok)).toBe(true)
    expect(narrowPeak).toBeGreaterThan(1)
    expect(narrowPeak).toBeLessThanOrEqual(3)
  })

  it('rejects the whole batch when a stat runs out of descriptors', async () => {
    const root = await scratchRoot()
    const directory = join(root, 'dir')
    await mkdir(directory)
    await writeFile(join(directory, 'file.txt'), 'x')

    const outcome = await listDirectories([directory], {
      lstatFile: async () => {
        throw codedError('EMFILE')
      }
    }).then(
      () => new Error('expected the batch to reject'),
      (error: unknown) => error
    )

    expect(outcome).toBeInstanceOf(Error)
    expect((outcome as Error).message).toContain('文件句柄')
    expect((outcome as Error).message).toContain('EMFILE')
  })

  it('keeps the tree, index, skipped and four-state counts of the unbatched scan', async () => {
    const root = await scratchRoot()
    const left = join(root, 'left')
    const right = join(root, 'right')
    for (const base of [left, right]) {
      await mkdir(join(base, 'nested', 'deeper'), { recursive: true })
      await mkdir(join(base, 'empty'), { recursive: true })
      await mkdir(join(base, 'a'), { recursive: true })
      await mkdir(join(base, 'b'), { recursive: true })
      await mkdir(join(base, '.git'), { recursive: true })
      await mkdir(join(base, 'node_modules', 'pkg'), { recursive: true })
      await writeFile(join(base, 'same.txt'), 'same')
      await writeFile(join(base, 'nested', 'deeper', 'only-mtime.txt'), 'stable')
      await writeFile(join(base, 'nested', 'deeper', 'only-content.txt'), 'aaaa')
      await writeFile(join(base, 'a', 'shared.txt'), 'a')
      await writeFile(join(base, 'b', 'shared.txt'), 'b')
      await writeFile(join(base, '.git', 'config'), '[core]')
      await writeFile(join(base, 'node_modules', 'pkg', 'index.js'), 'module.exports = 1')
    }
    // Same size and mtime, different bytes: only the content confirms modified.
    await writeFile(join(right, 'nested', 'deeper', 'only-content.txt'), 'bbbb')
    await stamp(join(left, 'same.txt'), 1_000_000)
    await stamp(join(right, 'same.txt'), 1_000_000)
    await stamp(join(left, 'nested', 'deeper', 'only-mtime.txt'), 1_000_000)
    await stamp(join(right, 'nested', 'deeper', 'only-mtime.txt'), 2_000_000)
    await stamp(join(left, 'nested', 'deeper', 'only-content.txt'), 1_000_000)
    await stamp(join(right, 'nested', 'deeper', 'only-content.txt'), 1_000_000)

    await mkdir(join(left, 'locked'), { recursive: true })
    await writeFile(join(left, 'locked', 'target.txt'), 'target')
    await symlink('/nonexistent-opencompare-target', join(left, 'dangling'))
    await symlink(join(left, 'locked', 'target.txt'), join(left, 'blocked'))

    const list: ListDirectory = (path) => platform.listDirectory(path)
    const batched = (paths: readonly string[]) => platform.listDirectories(paths)
    const digestFiles = (paths: readonly string[]) => coreDigest(platform.digestFiles(paths))

    try {
      await chmod(join(left, 'locked'), 0o000)
      const baselineLeft = await scanDirectory(left, list)
      const batchedLeft = await scanDirectory(left, list, { listDirectories: batched })

      expect(batchedLeft.root).toEqual(baselineLeft.root)
      expect([...batchedLeft.index.keys()].sort()).toEqual([...baselineLeft.index.keys()].sort())
      expect(batchedLeft.skipped).toBe(baselineLeft.skipped)
      // Only the unlistable subtree is skipped; both links remain entries.
      expect(batchedLeft.skipped).toBe(1)
      expect(batchedLeft.index.get('dangling')?.linkTargetKind).toBe('missing')
      expect(batchedLeft.index.get('blocked')?.linkTargetKind).toBe('missing')
      expect(batchedLeft.index.has('locked')).toBe(false)
      // .git / node_modules are listed and compared, never silently ignored
      expect(batchedLeft.index.has('.git/config')).toBe(true)
      expect(batchedLeft.index.has('node_modules/pkg/index.js')).toBe(true)
      expect(batchedLeft.index.get('empty')?.children).toEqual([])
      expect(batchedLeft.index.has('a/shared.txt')).toBe(true)
      expect(batchedLeft.index.has('b/shared.txt')).toBe(true)

      const baseline = await compareDirectories(
        left,
        right,
        list,
        (path) => platform.readTextFile(path),
        createComparisonCache(),
        undefined,
        { digestFiles }
      )
      const comparison = await compareDirectories(
        left,
        right,
        list,
        (path) => platform.readTextFile(path),
        createComparisonCache(),
        undefined,
        { digestFiles, listDirectories: batched }
      )

      expect(comparison.counts).toEqual(baseline.counts)
      expect(comparison.root).toEqual(baseline.root)
      expect(comparison.skipped).toBe(baseline.skipped)
      // only-mtime differs by mtime, only-content by bytes: both are modified.
      expect(comparison.counts.modified).toBeGreaterThanOrEqual(2)
    } finally {
      await chmod(join(left, 'locked'), 0o755)
    }
  })

  it('serves the bundled sample directory through the batch channel', async () => {
    const list: ListDirectory = (path) => platform.listDirectory(path)
    const batched = (paths: readonly string[]) => platform.listDirectories(paths)

    const baseline = await scanDirectory(DIRECTORY_SAMPLE_PATHS.left, list)
    const scanned = await scanDirectory(DIRECTORY_SAMPLE_PATHS.left, list, {
      listDirectories: batched
    })

    expect(scanned.root).toEqual(baseline.root)
    expect([...scanned.index.keys()].sort()).toEqual([...baseline.index.keys()].sort())
    expect(scanned.skipped).toBe(baseline.skipped)

    const comparison = await compareDirectories(
      DIRECTORY_SAMPLE_PATHS.left,
      DIRECTORY_SAMPLE_PATHS.right,
      list,
      (path) => platform.readTextFile(path),
      createComparisonCache(),
      undefined,
      {
        digestFiles: (paths) => coreDigest(platform.digestFiles(paths)),
        listDirectories: batched
      }
    )

    expect(comparison.counts).toEqual({
      same: DIRECTORY_SCENE.composition.same,
      added: DIRECTORY_SCENE.composition.added,
      removed: DIRECTORY_SCENE.composition.removed,
      modified: DIRECTORY_SCENE.composition.modified
    })
  })

  it('rejects when the root cannot be listed in batch mode', async () => {
    const root = await scratchRoot()
    const missing = join(root, 'missing')

    await expect(
      scanDirectory(missing, (path) => platform.listDirectory(path), {
        listDirectories: (paths) => platform.listDirectories(paths)
      })
    ).rejects.toThrow(/无法读取目录/)
  })
})

describe('path probe', () => {
  it('exposes the home and working directories explicitly', async () => {
    await expect(platform.homeDirectory()).resolves.toBe(tmpdir())
    await expect(platform.workingDirectory()).resolves.toBe(process.cwd())
  })

  it('reports the same file/directory/missing semantics as the web port', async () => {
    expect(await platform.statPath('/samples')).toBe('directory')
    expect(await platform.statPath('/samples/csv/orders.left.csv')).toBe('file')
    expect(await platform.statPath('/samples/does-not-exist.txt')).toBe('missing')

    const root = await scratchRoot()
    const directory = join(root, 'folder')
    const file = join(root, 'note.txt')
    await mkdir(directory, { recursive: true })
    await writeFile(file, 'hello')

    expect(await platform.statPath(directory)).toBe('directory')
    expect(await platform.statPath(file)).toBe('file')
    expect(await platform.statPath(join(root, 'absent'))).toBe('missing')
  })
})

describe('byte digest', () => {
  /** Deterministic pseudo-random bytes, so the large case crosses chunk edges. */
  function pseudoRandomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length)
    let seed = 0x9e3779b9
    for (let index = 0; index < length; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0
      bytes[index] = seed & 0xff
    }
    return bytes
  }

  it('streams raw bytes with the same sha256 the pure JS core produces', async () => {
    const root = await scratchRoot()
    const encoder = new TextEncoder()
    const cases = [
      { name: 'ascii.txt', bytes: encoder.encode('abc') },
      { name: 'utf8.txt', bytes: encoder.encode('中文🙂') },
      { name: 'bom.txt', bytes: encoder.encode('\ufefftitle') },
      { name: 'invalid.bin', bytes: Uint8Array.from([0x61, 0xff, 0xfe, 0x00, 0x62]) },
      { name: 'empty.txt', bytes: new Uint8Array() },
      { name: 'large.bin', bytes: pseudoRandomBytes(1024 * 1024 + 7) }
    ]
    for (const item of cases) await writeFile(join(root, item.name), item.bytes)

    const paths = cases.map((item) => join(root, item.name))
    const missing = join(root, 'missing.bin')
    const digests = await coreDigest(platform.digestFiles([...paths, missing]))

    // One result per requested path, in input order.
    expect(digests).toHaveLength(paths.length + 1)
    cases.forEach((item, index) => {
      const digest = digests[index]
      expect(digest).toMatchObject({ path: paths[index], ok: true, bytes: item.bytes.length })
      if (!digest.ok) return
      expect(digest.sha256).toBe(createHash('sha256').update(item.bytes).digest('hex'))
      expect(digest.sha256).toBe(sha256Bytes(item.bytes))
    })

    expect(digests[0]).toMatchObject({
      sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    })
    expect(digests[4]).toMatchObject({
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    })

    // A missing file only fails its own item; the batch still resolves.
    const failed = digests[paths.length]
    expect(failed).toMatchObject({ path: missing, ok: false })
    if (!failed.ok) expect(failed.reason).toContain('无法读取文件')
  })

  it('keeps invalid UTF-8 bytes distinguishable from their decoded text', async () => {
    const root = await scratchRoot()
    const bytes = Uint8Array.from([0x61, 0xff, 0xfe, 0x00, 0x62])
    const target = join(root, 'invalid.bin')
    await writeFile(target, bytes)

    const [digest] = await coreDigest(platform.digestFiles([target]))
    expect(digest.ok).toBe(true)
    if (!digest.ok) return

    expect(digest.sha256).toBe(sha256Bytes(bytes))
    expect(digest.sha256).not.toBe(sha256Hex(new TextDecoder().decode(bytes)))
  })

  it('digests the /samples mount and compares it without reading any text', async () => {
    const sample = SAMPLE_FIXTURE_FILES.find((file) => file.path === '/samples/csv/orders.left.csv')
    if (sample === undefined) throw new Error('missing bundled sample fixture')

    const [digest] = await coreDigest(platform.digestFiles([sample.path]))
    expect(digest).toMatchObject({
      ok: true,
      sha256: sha256Hex(sample.text),
      bytes: new TextEncoder().encode(sample.text).length
    })

    let textReads = 0
    const comparison = await compareDirectories(
      DIRECTORY_SAMPLE_PATHS.left,
      DIRECTORY_SAMPLE_PATHS.right,
      (path) => platform.listDirectory(path),
      (path) => {
        textReads += 1
        return platform.readTextFile(path)
      },
      createComparisonCache(),
      undefined,
      { digestFiles: (paths) => coreDigest(platform.digestFiles(paths)) }
    )

    expect(comparison.counts).toEqual({
      same: DIRECTORY_SCENE.composition.same,
      added: DIRECTORY_SCENE.composition.added,
      removed: DIRECTORY_SCENE.composition.removed,
      modified: DIRECTORY_SCENE.composition.modified
    })
    expect(textReads).toBe(0)
  })

  it('classifies modified when only binary bytes differ under equal size and mtime', async () => {
    const root = await scratchRoot()
    const left = join(root, 'left')
    const right = join(root, 'right')
    await mkdir(left, { recursive: true })
    await mkdir(right, { recursive: true })

    // Both decode to the same text ('a' + one U+FFFD) and share size + mtime,
    // so the pre-digest text path judged them `same`; only raw bytes differ.
    await writeFile(join(left, 'blob.bin'), Uint8Array.from([0x61, 0xff]))
    await writeFile(join(right, 'blob.bin'), Uint8Array.from([0x61, 0xfe]))
    await stamp(join(left, 'blob.bin'), 1_000_000)
    await stamp(join(right, 'blob.bin'), 1_000_000)

    let textReads = 0
    const comparison = await compareDirectories(
      left,
      right,
      (path) => platform.listDirectory(path),
      (path) => {
        textReads += 1
        return platform.readTextFile(path)
      },
      createComparisonCache(),
      undefined,
      { digestFiles: (paths) => coreDigest(platform.digestFiles(paths)) }
    )

    expect(comparison.counts).toEqual({ same: 0, added: 0, removed: 0, modified: 1 })
    expect(textReads).toBe(0)
  })
})

describe('native file dialogs', () => {
  it('opens a file through the native dialog with normalised filters', async () => {
    dialogs.open.mockResolvedValueOnce({ canceled: false, filePaths: ['/tmp/picked.txt'] })

    const selected = await platform.selectFile({
      title: '打开本地文件',
      filters: [{ name: '文本', extensions: ['.txt', 'csv'] }]
    })

    expect(selected).toBe('/tmp/picked.txt')
    expect(dialogs.open).toHaveBeenCalledWith({
      title: '打开本地文件',
      filters: [{ name: '文本', extensions: ['txt', 'csv'] }],
      properties: ['openFile']
    })
  })

  it('reports a cancelled open dialog as null without throwing', async () => {
    dialogs.open.mockResolvedValueOnce({ canceled: true, filePaths: [] })

    await expect(platform.selectFile()).resolves.toBeNull()
  })

  it('writes the returned body through the native save dialog', async () => {
    const root = await scratchRoot()
    const target = join(root, 'merged.txt')
    dialogs.save.mockResolvedValueOnce({ canceled: false, filePath: target })

    await expect(
      platform.saveFile({
        title: '保存合并结果',
        defaultPath: 'merged.txt',
        filters: [{ name: '文本', extensions: ['txt'] }],
        content: 'merged\n'
      })
    ).resolves.toBe(target)

    expect(await readFile(target, 'utf8')).toBe('merged\n')
    expect(dialogs.save).toHaveBeenCalledWith(
      expect.objectContaining({ title: '保存合并结果', defaultPath: 'merged.txt' })
    )
  })

  it('reports a cancelled save dialog as null', async () => {
    dialogs.save.mockResolvedValueOnce({ canceled: true, filePath: undefined })

    await expect(platform.saveFile({ content: 'never written' })).resolves.toBeNull()
  })
})

describe('atomic save', () => {
  /** Directory entries in a stable order, so "before vs after" is exact. */
  async function entriesOf(directory: string): Promise<string[]> {
    return (await readdir(directory)).sort()
  }

  it('writes every content verbatim and adds no temporary file', async () => {
    const root = await scratchRoot()
    const directory = join(root, 'exports')
    await mkdir(directory, { recursive: true })
    const before = await entriesOf(directory)
    const created: string[] = []
    const contents = [
      '',
      '合并结果 · 报告 🚀\n第二行：多字节文本',
      `<!DOCTYPE html>\n${'x'.repeat(1_200_000)}`
    ]

    for (const [index, content] of contents.entries()) {
      const name = `report-${index}.html`
      const target = join(directory, name)
      dialogs.save.mockResolvedValueOnce({ canceled: false, filePath: target })

      await expect(platform.saveFile({ content })).resolves.toBe(target)

      expect(await readFile(target, 'utf8')).toBe(content)
      created.push(name)
      const entries = await entriesOf(directory)
      expect(entries).toEqual([...before, ...created].sort())
      expect(entries.filter((entry) => entry.endsWith('.tmp'))).toEqual([])
    }
  })

  it('replaces an existing file so the previous content is gone', async () => {
    const root = await scratchRoot()
    const target = join(root, 'existing.html')
    await writeFile(target, '<!DOCTYPE html>old body', 'utf8')
    dialogs.save.mockResolvedValueOnce({ canceled: false, filePath: target })

    await expect(platform.saveFile({ content: '<!DOCTYPE html>new body' })).resolves.toBe(target)

    expect(await readFile(target, 'utf8')).toBe('<!DOCTYPE html>new body')
    expect(await entriesOf(root)).toEqual(['existing.html'])
  })

  it('creates nothing when the dialog is cancelled or returns no path', async () => {
    const root = await scratchRoot()
    const directory = join(root, 'exports')
    await mkdir(directory, { recursive: true })
    const before = await entriesOf(directory)

    for (const cancelled of [
      { canceled: true, filePath: undefined },
      { canceled: false, filePath: '' }
    ]) {
      dialogs.save.mockResolvedValueOnce(cancelled)
      await expect(platform.saveFile({ content: 'never written' })).resolves.toBeNull()
    }

    expect(await entriesOf(directory)).toEqual(before)
    expect(await entriesOf(root)).toEqual(['exports'])
  })

  it('rejects the read-only sample mount before creating any file', async () => {
    const target = '/samples/merged.txt'
    dialogs.save.mockResolvedValueOnce({ canceled: false, filePath: target })

    const error = await platform.saveFile({ content: 'nope' }).then(
      () => undefined,
      (reason: unknown) => reason
    )

    expect(error).toBeInstanceOf(Error)
    const message = (error as Error).message
    expect(message).toContain('只读')
    expect(message).toContain(target)

    // The sample mount gained nothing: the target is still absent there.
    await expect(platform.statPath(target)).resolves.toBe('missing')
    await expect(platform.exists(target)).resolves.toBe(false)
  })

  it('rejects a rename onto a non-empty directory, leaving it intact and residue-free', async () => {
    const root = await scratchRoot()
    const target = join(root, 'occupied')
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'keep.txt'), 'original', 'utf8')
    const before = await entriesOf(root)
    dialogs.save.mockResolvedValueOnce({ canceled: false, filePath: target })

    const error = await platform.saveFile({ content: 'new body' }).then(
      () => undefined,
      (reason: unknown) => reason
    )

    expect(error).toBeInstanceOf(Error)
    const message = (error as Error).message
    expect(message).toContain(target)
    expect(message).toMatch(/[\u4e00-\u9fff]/)
    // The temporary file's name never leaks into the user-facing reason.
    expect(message).not.toContain('.tmp')
    expect(await entriesOf(target)).toEqual(['keep.txt'])
    expect(await readFile(join(target, 'keep.txt'), 'utf8')).toBe('original')
    const after = await entriesOf(root)
    expect(after).toEqual(before)
    expect(after.filter((entry) => entry.endsWith('.tmp'))).toEqual([])
  })

  it('rejects a write into a missing directory without residue', async () => {
    const root = await scratchRoot()
    const target = join(root, 'missing-dir', 'out.txt')
    dialogs.save.mockResolvedValueOnce({ canceled: false, filePath: target })

    const error = await platform.saveFile({ content: 'body' }).then(
      () => undefined,
      (reason: unknown) => reason
    )

    expect(error).toBeInstanceOf(Error)
    const message = (error as Error).message
    expect(message).toContain(target)
    expect(message).toMatch(/[\u4e00-\u9fff]/)
    expect(message).not.toContain('.tmp')
    expect(await entriesOf(root)).toEqual([])
  })
})

/**
 * Real-project acceptance, env-gated so the suite never depends on a machine's
 * absolute paths. Set both variables to compare two real trees:
 *   OPENCOMPARE_REAL_LEFT=… OPENCOMPARE_REAL_RIGHT=… pnpm test
 */
const REAL_LEFT = process.env.OPENCOMPARE_REAL_LEFT
const REAL_RIGHT = process.env.OPENCOMPARE_REAL_RIGHT

describe.skipIf(REAL_LEFT === undefined || REAL_RIGHT === undefined)('real project trees', () => {
  it('compares two real trees without throwing and keeps per-side skip counts', async () => {
    const comparison = await compareDirectories(
      REAL_LEFT as string,
      REAL_RIGHT as string,
      (path) => platform.listDirectory(path),
      (path) => platform.readTextFile(path),
      createComparisonCache()
    )

    const { same, added, removed, modified } = comparison.counts
    console.log(
      `[real-trees] ${comparison.leftName} ↔ ${comparison.rightName}: fileCount=${comparison.fileCount} same=${same} added=${added} removed=${removed} modified=${modified} skipped=${comparison.skipped}`
    )

    expect(comparison.fileCount).toBe(same + added + removed + modified)
    expect(comparison.skipped).toBe(comparison.leftSkipped + comparison.rightSkipped)
  }, 900_000)
})

describe('digest cancellation', () => {
  /** A stream that stays open until it is destroyed, like a real file read. */
  class HangingStream implements DigestReadStream {
    destroyed = false
    destroyError: Error | undefined
    private release: (() => void) | undefined

    destroy(error?: Error): void {
      this.destroyed = true
      this.destroyError = error
      this.release?.()
    }

    [Symbol.asyncIterator](): AsyncIterator<Buffer> {
      return {
        next: async (): Promise<IteratorResult<Buffer>> => {
          if (!this.destroyed) {
            await new Promise<void>((resolve) => {
              this.release = resolve
            })
          }
          if (this.destroyError !== undefined) throw this.destroyError
          return { done: true, value: undefined }
        }
      }
    }
  }

  /** A stream that yields fixed bytes once its shared gate opens. */
  class GatedStream implements DigestReadStream {
    private destroyedWith: Error | undefined

    constructor(
      private readonly gate: Promise<void>,
      private readonly payload: Buffer
    ) {}

    destroy(error?: Error): void {
      this.destroyedWith = error
    }

    async *[Symbol.asyncIterator](): AsyncGenerator<Buffer, void, unknown> {
      await this.gate
      if (this.destroyedWith !== undefined) throw this.destroyedWith
      yield this.payload
    }
  }

  /** A real file read whose first chunk waits for `gate`; destroy also releases it. */
  function gatedRealStream(path: string, gate: Promise<void>): DigestReadStream {
    const inner = createReadStream(path)
    let releaseDestroy!: () => void
    const destroyed = new Promise<void>((resolve) => {
      releaseDestroy = resolve
    })
    let destroyError: Error | undefined
    return {
      async *[Symbol.asyncIterator](): AsyncGenerator<Buffer, void, unknown> {
        await Promise.race([gate, destroyed])
        if (destroyError !== undefined) throw destroyError
        for await (const chunk of inner) yield chunk as Buffer
      },
      destroy(error?: Error): void {
        destroyError = error
        releaseDestroy()
        inner.destroy()
      }
    }
  }

  async function waitUntil(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
    const started = Date.now()
    while (!predicate()) {
      if (Date.now() - started > timeoutMs) throw new Error('timed out waiting for a condition')
      await new Promise((resolve) => setTimeout(resolve, 2))
    }
  }

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  it('destroys every in-flight stream and settles as a structured cancellation', async () => {
    const streams: HangingStream[] = []
    const run = digestFiles(['/virtual/a.bin', '/virtual/b.bin', '/virtual/c.bin'], {
      operationId: 'streams-op',
      concurrency: 2,
      streamFactory: () => {
        const stream = new HangingStream()
        streams.push(stream)
        return stream
      }
    })

    await waitUntil(() => streams.length === 2 && activeDigestStreamCount() === 2)

    await cancelOperation('streams-op')

    const result = await run
    expect(Array.isArray(result)).toBe(false)
    expect(result).toEqual({ cancelled: true })
    expect(streams.every((stream) => stream.destroyed)).toBe(true)
    await delay(20)
    expect(activeDigestStreamCount()).toBe(0)
    expect(digestOperationCount()).toBe(0)
  })

  it('treats unknown and repeated ids as harmless and reclaims finished operations', async () => {
    const root = await scratchRoot()
    const file = join(root, 'done.txt')
    await writeFile(file, 'done')

    const normal = await digestFiles([file], { operationId: 'normal-op' })
    expect(Array.isArray(normal)).toBe(true)
    if (!Array.isArray(normal)) throw new Error('expected a digest array')
    expect(normal[0]).toMatchObject({ ok: true })
    expect(activeDigestStreamCount()).toBe(0)
    expect(digestOperationCount()).toBe(0)

    await expect(cancelOperation('never-registered')).resolves.toBeUndefined()
    await expect(cancelOperation('normal-op')).resolves.toBeUndefined()
    await expect(cancelOperation('normal-op')).resolves.toBeUndefined()

    // A stale id must not reach any other live operation.
    const streams: HangingStream[] = []
    const other = digestFiles(['/other/only.bin'], {
      operationId: 'other-op',
      streamFactory: () => {
        const stream = new HangingStream()
        streams.push(stream)
        return stream
      }
    })
    await waitUntil(() => streams.length === 1)
    await cancelOperation('normal-op')
    expect(streams[0].destroyed).toBe(false)

    await cancelOperation('other-op')
    expect(await other).toEqual({ cancelled: true })
    expect(digestOperationCount()).toBe(0)
  })

  it('scopes cancellation to one operation and lets the other finish correctly', async () => {
    let releaseGate!: () => void
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve
    })
    const aStreams: HangingStream[] = []
    const bStreams: GatedStream[] = []
    const payload = Buffer.from('hello')

    const a = digestFiles(['/a/one.txt', '/a/two.txt'], {
      operationId: 'op-a',
      concurrency: 2,
      streamFactory: () => {
        const stream = new HangingStream()
        aStreams.push(stream)
        return stream
      }
    })
    const b = digestFiles(['/b/one.txt', '/b/two.txt'], {
      operationId: 'op-b',
      concurrency: 2,
      streamFactory: () => {
        const stream = new GatedStream(gate, payload)
        bStreams.push(stream)
        return stream
      }
    })

    await waitUntil(() => aStreams.length === 2 && bStreams.length === 2)
    await cancelOperation('op-a')
    expect(await a).toEqual({ cancelled: true })
    // B still holds both of its streams after A was cancelled.
    expect(activeDigestStreamCount()).toBe(2)

    releaseGate()
    const results = await b
    expect(Array.isArray(results)).toBe(true)
    if (!Array.isArray(results)) throw new Error('expected a digest array')
    const expected = createHash('sha256').update(payload).digest('hex')
    expect(results).toEqual([
      { path: '/b/one.txt', ok: true, sha256: expected, bytes: payload.length },
      { path: '/b/two.txt', ok: true, sha256: expected, bytes: payload.length }
    ])
    expect(activeDigestStreamCount()).toBe(0)
  })

  it('leaves no stream behind and re-compares the same real pair after a cancel', async () => {
    const root = await scratchRoot()
    const left = join(root, 'left')
    const right = join(root, 'right')
    await mkdir(join(left, 'nested'), { recursive: true })
    await mkdir(join(right, 'nested'), { recursive: true })
    await writeFile(join(left, 'same.txt'), 'identical')
    await writeFile(join(right, 'same.txt'), 'identical')
    await writeFile(join(left, 'nested', 'deep.txt'), 'deep')
    await writeFile(join(right, 'nested', 'deep.txt'), 'deep')
    await stamp(join(left, 'same.txt'), 1_000_000)
    await stamp(join(right, 'same.txt'), 1_000_000)
    await stamp(join(left, 'nested', 'deep.txt'), 1_000_000)
    await stamp(join(right, 'nested', 'deep.txt'), 1_000_000)

    const list = (path: string) => platform.listDirectory(path)
    const baseline = await compareDirectories(
      left,
      right,
      list,
      (path) => platform.readTextFile(path),
      createComparisonCache(),
      undefined,
      {
        digestFiles: (paths) => coreDigest(platform.digestFiles(paths)),
        listDirectories: (paths) => platform.listDirectories(paths)
      }
    )

    // The gate never opens: only cancelling can settle these reads.
    const gate = new Promise<void>(() => undefined)
    const cancelled = compareDirectories(
      left,
      right,
      list,
      (path) => platform.readTextFile(path),
      createComparisonCache(),
      undefined,
      {
        digestFiles: (paths) =>
          coreDigest(
            digestFiles(paths, {
              operationId: 'real-cancel',
              streamFactory: (path) => gatedRealStream(path, gate)
            })
          ),
        listDirectories: (paths) => platform.listDirectories(paths)
      }
    )

    await waitUntil(() => activeDigestStreamCount() > 0)
    await cancelOperation('real-cancel')
    await expect(cancelled).rejects.toBeInstanceOf(OperationCancelledError)
    expect(activeDigestStreamCount()).toBe(0)
    expect(digestOperationCount()).toBe(0)

    const retried = await compareDirectories(
      left,
      right,
      list,
      (path) => platform.readTextFile(path),
      createComparisonCache(),
      undefined,
      {
        digestFiles: (paths) =>
          coreDigest(platform.digestFiles(paths, { operationId: 'real-retry' })),
        listDirectories: (paths) => platform.listDirectories(paths)
      }
    )
    expect(retried.counts).toEqual(baseline.counts)
    expect(retried.skipped).toBe(baseline.skipped)
    expect(activeDigestStreamCount()).toBe(0)
  })
})

describe('electron user settings', () => {
  const settingsFile = (): string => join(appState.userData, 'settings.json')

  it('round-trips a write and read through the real IPC handlers', async () => {
    await platform.writeUserSettings({ language: 'en', theme: 'light' })

    // A fresh registration reads the persisted record, exactly like a restart.
    registerPlatformIpc()
    await expect(platform.readUserSettings()).resolves.toEqual({ language: 'en', theme: 'light' })

    // One document under userData, no leftover temporary file.
    await expect(readdir(appState.userData)).resolves.toEqual(['settings.json'])
    expect(JSON.parse(await readFile(settingsFile(), 'utf8'))).toEqual({
      language: 'en',
      theme: 'light'
    })
  })

  it('upgrades a record without a theme and falls back for an unknown one', async () => {
    await writeFile(settingsFile(), '{"language":"zh"}', 'utf8')
    await expect(platform.readUserSettings()).resolves.toEqual({ language: 'zh', theme: 'dark' })

    await writeFile(settingsFile(), '{"language":"zh","theme":"system"}', 'utf8')
    await expect(platform.readUserSettings()).resolves.toEqual({
      language: 'zh',
      theme: 'system'
    })

    await writeFile(settingsFile(), '{"language":"zh","theme":"sepia"}', 'utf8')
    await expect(platform.readUserSettings()).resolves.toEqual({ language: 'zh', theme: 'dark' })
  })

  it('reads a missing, corrupt or unsupported record as no record', async () => {
    await expect(platform.readUserSettings()).resolves.toBeNull()

    for (const text of ['{not json', 'null', '"text"', '{"language":"de"}', '{"language":3}']) {
      await writeFile(settingsFile(), text, 'utf8')
      await expect(platform.readUserSettings()).resolves.toBeNull()
    }
  })

  it('returns app.getLocale() untouched', async () => {
    appState.locale = 'zh-Hant-TW'

    await expect(platform.systemLocale()).resolves.toBe('zh-Hant-TW')
  })
})
