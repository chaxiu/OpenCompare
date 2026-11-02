/**
 * Template placement real-disk gate: one real scattered tree B and one real
 * output root under a temporary directory, driven through the production
 * `PlatformPort` handlers (no sample mount, no in-memory VFS).
 *
 * It proves the whole apply slice end to end: the dry-run plan defaults, the
 * explicit check + conflict-candidate resolution, the byte / mtimeSec write, the
 * per-row verification, a read-only root refused before the first write, and a
 * retry on the same manifest once the permission is restored.
 */
import { chmod, mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { scanDirectory } from '@core/directory/compare'
import { sha256Hex } from '@core/directory/hash'
import { resolveTemplatePlan } from '@core/directory/template'
import { applyTemplatePlan, previewTemplate, TemplateApplyError } from '@renderer/workbench/directoryOps'
import { PLATFORM_CHANNELS } from '@shared/platform/channels'
import type {
  DigestFilesResult,
  DirectoryEntry,
  DirectoryListing,
  PathProbeKind,
  PlatformPort,
  TextFileProbe,
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
  readFileBytes: (path) => invoke(PLATFORM_CHANNELS.readFileBytes, path) as Promise<Uint8Array>,
  probeTextFile: (path) => invoke(PLATFORM_CHANNELS.probeTextFile, path) as Promise<TextFileProbe>,
  writeFileBytes: (path, content, modifiedMs) =>
    invoke(PLATFORM_CHANNELS.writeFileBytes, path, content, modifiedMs) as Promise<void>,
  setSymbolicLinkModifiedMs: (path, modifiedMs) =>
    invoke(PLATFORM_CHANNELS.setSymbolicLinkModifiedMs, path, modifiedMs) as Promise<void>,
  readSymbolicLink: (path) =>
    invoke(PLATFORM_CHANNELS.readSymbolicLink, path) as Promise<string>,
  createSymbolicLink: (target, path) =>
    invoke(PLATFORM_CHANNELS.createSymbolicLink, target, path) as Promise<void>,
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

/** Counts every real write / directory creation this run attempts. */
function recordIo(port: PlatformPort): {
  readonly port: PlatformPort
  readonly writes: string[]
  readonly directories: string[]
} {
  const writes: string[] = []
  const directories: string[] = []
  return {
    writes,
    directories,
    port: {
      ...port,
      writeTextFile: (path, content, modifiedMs) => {
        writes.push(path)
        return port.writeTextFile(path, content, modifiedMs)
      },
      ensureDirectory: (path) => {
        directories.push(path)
        return port.ensureDirectory(path)
      }
    }
  }
}

const roots: string[] = []

async function scratchRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'opencompare-template-real-'))
  roots.push(root)
  return root
}

function diskPath(root: string, relativePath: string): string {
  return join(root, ...relativePath.split('/'))
}

const SLOT_DEEP = '资料 夹/第一层/第二层/深层 目录/deep.txt'
const SLOT_CONFLICT = '资料 夹/第一层/第二层/深层 目录/conflict.txt'
const SLOT_OCCUPIED = 'src/占位/occupied.txt'
const SLOT_OVER = 'src/over.txt'

const SOURCE_STAMPS: Readonly<Record<string, number>> = {
  [SLOT_DEEP]: 1_700_100_000_000,
  [SLOT_CONFLICT]: 1_700_200_000_000,
  [SLOT_OVER]: 1_700_300_000_000,
  [SLOT_OCCUPIED]: 1_700_400_000_000
}
interface Fixture {
  readonly templateRoot: string
  readonly incomingRoot: string
  readonly outputRoot: string
  readonly candidateOne: string
  readonly candidateTwo: string
}

async function writeText(root: string, relativePath: string, text: string): Promise<void> {
  const target = diskPath(root, relativePath)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, text, 'utf8')
}

async function setMtime(path: string, ms: number): Promise<void> {
  const stamp = new Date(ms)
  await utimes(path, stamp, stamp)
}

async function buildFixture(): Promise<Fixture> {
  const root = await scratchRoot()
  const templateRoot = join(root, '模板 A')
  const incomingRoot = join(root, '散乱 树 B')
  const outputRoot = join(root, '输出 根')

  await writeText(templateRoot, SLOT_DEEP, 'deep body\n')
  await writeText(templateRoot, SLOT_CONFLICT, 'template conflict body\n')
  await writeText(templateRoot, SLOT_OCCUPIED, 'occupied body\n')
  await writeText(templateRoot, SLOT_OVER, 'new over body\n')

  const candidateOne = join(incomingRoot, '一层', 'conflict.txt')
  const candidateTwo = join(incomingRoot, '二层', 'conflict.txt')
  await writeText(incomingRoot, 'x/deep.txt', 'deep body\n')
  await writeText(incomingRoot, '一层/conflict.txt', 'candidate one body\n')
  await writeText(incomingRoot, '二层/conflict.txt', 'candidate two body\n')
  await writeText(incomingRoot, 'y/occupied.txt', 'occupied body\n')
  await writeText(incomingRoot, 'z/over.txt', 'new over body\n')
  await writeText(incomingRoot, 'extras/unused.txt', 'unused\n')

  // The output root already holds an overwrite target and a directory that
  // occupies one slot: neither may ever be written by the run.
  await writeText(outputRoot, SLOT_OVER, 'stale over body\n')
  await writeText(outputRoot, `${SLOT_OCCUPIED}/keep.txt`, 'kept\n')

  // Whole-second source stamps make the mtimeSec assertion meaningful.
  await setMtime(join(incomingRoot, 'x', 'deep.txt'), SOURCE_STAMPS[SLOT_DEEP] as number)
  await setMtime(candidateOne, SOURCE_STAMPS[SLOT_CONFLICT] as number)
  await setMtime(join(incomingRoot, 'y', 'occupied.txt'), SOURCE_STAMPS[SLOT_OCCUPIED] as number)
  await setMtime(join(incomingRoot, 'z', 'over.txt'), SOURCE_STAMPS[SLOT_OVER] as number)

  return { templateRoot, incomingRoot, outputRoot, candidateOne, candidateTwo }
}

/** Every file under the output root, relative and sorted. */
async function outputFiles(outputRoot: string): Promise<string[]> {
  const tree = await scanDirectory(outputRoot, (path) => platform.listDirectory(path))
  return [...tree.index.entries()]
    .filter(([, node]) => node.kind === 'file')
    .map(([relativePath]) => relativePath)
    .sort()
}

/** Every file and directory under the output root, relative and sorted. */
async function outputTree(outputRoot: string): Promise<string[]> {
  const tree = await scanDirectory(outputRoot, (path) => platform.listDirectory(path))
  return [...tree.index.keys()].sort()
}

function tempFiles(paths: readonly string[]): string[] {
  return paths.filter((path) => path.endsWith('.tmp'))
}

const asRoot = typeof process.getuid === 'function' && process.getuid() === 0

beforeAll(() => registerPlatformIpc())

afterAll(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('template placement on a real external tree', () => {
  it('plans, applies and verifies bytes and mtimeSec row by row', async () => {
    const fixture = await buildFixture()
    const preview = await previewTemplate(platform, {
      templateRoot: fixture.templateRoot,
      incomingRoot: fixture.incomingRoot,
      outputRoot: fixture.outputRoot
    })

    expect(preview.plan.counts).toMatchObject({ matched: 3, missing: 0, conflict: 1 })
    const bySlot = new Map(
      [...preview.plan.matched, ...preview.plan.conflicts].map((entry) => [
        entry.relativePath,
        entry
      ])
    )
    // Conflict, overwrite and directory-occupied rows start unchecked.
    for (const slot of [SLOT_CONFLICT, SLOT_OVER, SLOT_OCCUPIED]) {
      expect(bySlot.get(slot)?.defaultChecked, slot).toBe(false)
    }
    expect(bySlot.get(SLOT_DEEP)?.defaultChecked).toBe(true)
    expect(bySlot.get(SLOT_OCCUPIED)?.occupiedByDirectory).toBe(true)
    expect(bySlot.get(SLOT_OVER)?.overwrite).toBe(true)
    expect(bySlot.get(SLOT_CONFLICT)?.candidates.map((candidate) => candidate.path)).toEqual([
      fixture.candidateOne,
      fixture.candidateTwo
    ])

    const resolved = resolveTemplatePlan(preview.plan, {
      checkedPaths: [SLOT_DEEP, SLOT_OVER, SLOT_OCCUPIED, SLOT_CONFLICT],
      conflictChoices: { [SLOT_CONFLICT]: fixture.candidateOne }
    })
    expect(resolved.executableCount).toBe(3)
    expect(resolved.rejected).toEqual([
      { relativePath: SLOT_OCCUPIED, reason: 'target-occupied-by-directory' }
    ])
    const targets = resolved.executable.map((entry) => entry.targetPath).sort()
    expect(targets).toEqual(
      [
        diskPath(fixture.outputRoot, SLOT_DEEP),
        diskPath(fixture.outputRoot, SLOT_CONFLICT),
        diskPath(fixture.outputRoot, SLOT_OVER)
      ].sort()
    )

    const io = recordIo(platform)
    const outcome = await applyTemplatePlan(io.port, resolved)

    // The manifest is the write set: no unchecked row, no occupied target.
    expect(outcome.execution.writtenCount).toBe(3)
    expect(outcome.execution.failedCount).toBe(0)
    expect([...io.writes].sort()).toEqual(targets)
    expect(io.writes).not.toContain(diskPath(fixture.outputRoot, SLOT_OCCUPIED))
    expect(io.directories).not.toContain(join(fixture.outputRoot, 'src', '占位'))
    expect(outcome.verification.verified).toBe(3)
    expect(outcome.verification.failed).toBe(0)
    expect(outcome.verification.entries).toHaveLength(3)

    for (const entry of outcome.execution.written) {
      const text = await readFile(entry.targetPath, 'utf8')
      expect(sha256Hex(text)).toBe(entry.sourceHash)
      const info = await stat(entry.targetPath)
      expect(Math.floor(info.mtimeMs / 1000)).toBe(Math.floor(entry.modifiedMs / 1000))
    }
    // The occupied directory is untouched and nothing half-written survives.
    await expect(readFile(diskPath(fixture.outputRoot, `${SLOT_OCCUPIED}/keep.txt`), 'utf8'))
      .resolves.toBe('kept\n')
    expect(tempFiles(await outputFiles(fixture.outputRoot))).toEqual([])
  })

  it('rescans the output root into placed slots that stay unchecked', async () => {
    const fixture = await buildFixture()
    const preview = await previewTemplate(platform, {
      templateRoot: fixture.templateRoot,
      incomingRoot: fixture.incomingRoot,
      outputRoot: fixture.outputRoot
    })
    const resolved = resolveTemplatePlan(preview.plan, {
      checkedPaths: [SLOT_DEEP],
      conflictChoices: {}
    })
    await applyTemplatePlan(platform, resolved)

    const rescanned = await previewTemplate(platform, {
      templateRoot: fixture.templateRoot,
      incomingRoot: fixture.incomingRoot,
      outputRoot: fixture.outputRoot
    })
    const deep = rescanned.plan.placed.find((entry) => entry.relativePath === SLOT_DEEP)
    expect(deep?.outcome).toBe('placed')
    expect(deep?.overwrite).toBe(false)
    expect(deep?.defaultChecked).toBe(false)
    expect(rescanned.plan.matched.map((entry) => entry.relativePath)).not.toContain(SLOT_DEEP)
  })

  it('never writes a checked conflict that has no chosen candidate', async () => {
    const fixture = await buildFixture()
    const preview = await previewTemplate(platform, {
      templateRoot: fixture.templateRoot,
      incomingRoot: fixture.incomingRoot,
      outputRoot: fixture.outputRoot
    })
    const resolved = resolveTemplatePlan(preview.plan, {
      checkedPaths: [SLOT_CONFLICT],
      conflictChoices: {}
    })
    expect(resolved.executableCount).toBe(0)
    expect(resolved.rejected).toEqual([
      { relativePath: SLOT_CONFLICT, reason: 'conflict-unresolved' }
    ])

    const io = recordIo(platform)
    const outcome = await applyTemplatePlan(io.port, resolved)
    expect(io.writes).toEqual([])
    expect(io.directories).toEqual([])
    expect(outcome.execution.writtenCount).toBe(0)
    expect(outcome.verification.entries).toEqual([])
  })

  it('keeps a per-row write failure local and leaves no partial artifact', async () => {
    const root = await scratchRoot()
    const templateRoot = join(root, '模板 A')
    const incomingRoot = join(root, '散乱 树 B')
    const outputRoot = join(root, '输出 根')

    await writeText(templateRoot, '阻塞/child.txt', 'child body\n')
    await writeText(templateRoot, 'ok.txt', 'ok body\n')
    await writeText(incomingRoot, 'x/child.txt', 'child body\n')
    await writeText(incomingRoot, 'y/ok.txt', 'ok body\n')
    // A file occupies the parent directory the first row needs.
    await writeText(outputRoot, '阻塞', 'not a directory\n')

    const preview = await previewTemplate(platform, { templateRoot, incomingRoot, outputRoot })
    const resolved = resolveTemplatePlan(preview.plan, {
      checkedPaths: ['阻塞/child.txt', 'ok.txt']
    })
    const io = recordIo(platform)
    const outcome = await applyTemplatePlan(io.port, resolved)

    expect(outcome.execution.writtenCount).toBe(1)
    expect(outcome.execution.failedCount).toBe(1)
    expect(outcome.execution.failed[0]).toMatchObject({
      relativePath: '阻塞/child.txt',
      reason: 'write-failed'
    })
    expect(outcome.verification.verified).toBe(1)
    expect(outcome.verification.failed).toBe(0)
    // The blocking file is untouched, the failed row left no target behind and
    // no temporary file survived the atomic write attempt.
    await expect(readFile(join(outputRoot, '阻塞'), 'utf8')).resolves.toBe('not a directory\n')
    await expect(readFile(join(outputRoot, '阻塞', 'child.txt'), 'utf8')).rejects.toThrow()
    expect(tempFiles(await outputFiles(outputRoot))).toEqual([])
  })

  it.skipIf(asRoot)('refuses a read-only root before writing and retries after chmod', async () => {
    const fixture = await buildFixture()
    const preview = await previewTemplate(platform, {
      templateRoot: fixture.templateRoot,
      incomingRoot: fixture.incomingRoot,
      outputRoot: fixture.outputRoot
    })
    const resolved = resolveTemplatePlan(preview.plan, {
      checkedPaths: [SLOT_DEEP, SLOT_OVER, SLOT_CONFLICT],
      conflictChoices: { [SLOT_CONFLICT]: fixture.candidateTwo }
    })
    const targets = resolved.executable.map((entry) => entry.targetPath).sort()
    const before = await outputTree(fixture.outputRoot)

    const io = recordIo(platform)
    await chmod(fixture.outputRoot, 0o555)
    try {
      await expect(applyTemplatePlan(io.port, resolved)).rejects.toBeInstanceOf(TemplateApplyError)
      await expect(applyTemplatePlan(io.port, resolved)).rejects.toMatchObject({
        code: expect.stringMatching(/EACCES|EPERM|EROFS/)
      })
      // The refusal happens before the first directory or byte is touched.
      expect(io.writes).toEqual([])
      expect(io.directories).toEqual([])
      expect(await outputTree(fixture.outputRoot)).toEqual(before)
    } finally {
      await chmod(fixture.outputRoot, 0o755)
    }

    io.writes.length = 0
    io.directories.length = 0
    const retry = await applyTemplatePlan(io.port, resolved)
    expect(retry.execution.writtenCount).toBe(3)
    expect(retry.execution.failedCount).toBe(0)
    expect(retry.verification.verified).toBe(3)
    expect(retry.verification.failed).toBe(0)
    expect([...io.writes].sort()).toEqual(targets)
    expect(tempFiles(await outputFiles(fixture.outputRoot))).toEqual([])

    for (const entry of retry.execution.written) {
      const text = await readFile(entry.targetPath, 'utf8')
      expect(sha256Hex(text)).toBe(entry.sourceHash)
      const info = await stat(entry.targetPath)
      expect(Math.floor(info.mtimeMs / 1000)).toBe(Math.floor(entry.modifiedMs / 1000))
    }
  })
})
