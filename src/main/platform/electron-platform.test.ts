import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  utimes,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { compareDirectories, createComparisonCache } from '@core/directory/compare'
import { buildSyncPlan } from '@core/directory/sync'
import { PLATFORM_CHANNELS } from '@shared/platform/channels'
import type { DirectoryEntry, PathProbeKind, PlatformPort } from '@shared/platform/types'
import { applySyncPreview, previewSync } from '@renderer/workbench/directoryOps'
import { registerPlatformIpc } from './electron-platform'

const { handlers, dialogs } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  dialogs: {
    open: vi.fn(async () => ({ canceled: true, filePaths: [] as string[] })),
    save: vi.fn(async () => ({ canceled: true, filePath: undefined as string | undefined }))
  }
}))

vi.mock('electron', () => ({
  app: { getPath: () => tmpdir() },
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
  readTextFile: (path) => invoke(PLATFORM_CHANNELS.readTextFile, path) as Promise<string>,
  writeTextFile: (path, content, modifiedMs) =>
    invoke(PLATFORM_CHANNELS.writeTextFile, path, content, modifiedMs) as Promise<void>,
  exists: (path) => invoke(PLATFORM_CHANNELS.exists, path) as Promise<boolean>,
  statPath: (path) => invoke(PLATFORM_CHANNELS.statPath, path) as Promise<PathProbeKind>,
  ensureDirectory: (path) => invoke(PLATFORM_CHANNELS.ensureDirectory, path) as Promise<void>,
  deleteFile: (path) => invoke(PLATFORM_CHANNELS.deleteFile, path) as Promise<void>,
  temporaryDirectory: () => invoke(PLATFORM_CHANNELS.temporaryDirectory) as Promise<string>
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

beforeAll(() => registerPlatformIpc())

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

  it('keeps a dangling symbolic link in the listing and flags it broken', async () => {
    const root = await scratchRoot()
    const tree = join(root, 'tree')
    await mkdir(join(tree, 'nested'), { recursive: true })
    await writeFile(join(tree, 'kept.txt'), 'kept')
    await symlink('/nonexistent-opencompare-target', join(tree, 'dangling'))

    const listed = (await platform.listDirectory(tree)) as DirectoryEntry[]
    expect(listed).toHaveLength(3)

    const dangling = listed.find((entry) => entry.name === 'dangling')
    expect(dangling?.broken).toBe(true)
    expect(dangling?.skippedReason).toBeTruthy()
    expect(dangling?.isDirectory).toBe(false)

    // Every healthy entry keeps exactly the pre-fix `stat` shape.
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
    expect(listed.filter((entry) => !entry.broken)).toEqual(
      expect.arrayContaining(serial)
    )
    expect(listed.filter((entry) => !entry.broken)).toHaveLength(2)
  })

  it('does not fail the listing when broken entries and an unreadable target mix', async () => {
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
        const broken = listed.find((entry) => entry.name === name)
        expect(broken?.broken).toBe(true)
        expect(broken?.skippedReason).toBeTruthy()
      }
    } finally {
      await chmod(locked, 0o755)
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

/**
 * Real-project acceptance, env-gated so the suite never depends on a machine's
 * absolute paths. Set both variables to compare two real trees:
 *   OPENCOMPARE_REAL_LEFT=… OPENCOMPARE_REAL_RIGHT=… pnpm test
 */
const REAL_LEFT = process.env.OPENCOMPARE_REAL_LEFT
const REAL_RIGHT = process.env.OPENCOMPARE_REAL_RIGHT

describe.skipIf(REAL_LEFT === undefined || REAL_RIGHT === undefined)('real project trees', () => {
  it('compares two real trees, counts dangling links and never throws', async () => {
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
    expect(comparison.skipped).toBeGreaterThanOrEqual(1)
  }, 900_000)
})
