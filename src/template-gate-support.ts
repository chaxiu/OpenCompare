/**
 * Shared harness for the template placement real-disk gates.
 *
 * One Electron mock + handler map + `PlatformPort` adapter, one counted write
 * seam and one small real fixture builder live here so the five gate files
 * (`template-gate-*` and `template-e2e-real-directory`) never copy a third
 * platform stub. Test-only: production code must never import this module.
 */
import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { PLATFORM_CHANNELS } from '@shared/platform/channels'
import type {
  DigestFilesResult,
  DirectoryEntry,
  DirectoryListing,
  PathProbeKind,
  PlatformPort,
  UserSettings
} from '@shared/platform/types'

/** Handlers `registerPlatformIpc` installs; the mock `ipcMain.handle` fills it. */
export const electronHandlers = new Map<string, (...args: unknown[]) => unknown>()

/**
 * What `vi.mock('electron')` returns. Kept free of any real Electron import so a
 * test file can hand it back from the mock factory without a module cycle.
 */
export const electronMock = {
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
      electronHandlers.set(channel, handler)
    }
  }
}

/** Calls one registered production handler in-process, like the IPC bridge would. */
export function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = electronHandlers.get(channel)
  if (handler === undefined) throw new Error(`No handler registered for ${channel}`)
  return Promise.resolve(handler({}, ...args))
}

/** The renderer-side port over the production Electron handlers. */
export const platform: PlatformPort = {
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

/**
 * Registers the production handlers on the mocked `ipcMain`. A dynamic import
 * keeps this module free of a static Electron import, so a gate file can use
 * `electronMock` in its hoisted `vi.mock` factory without a cycle.
 */
export async function installTemplatePlatform(): Promise<void> {
  const { registerPlatformIpc } = await import('./main/platform/electron-platform')
  registerPlatformIpc()
}

/** Counts every real write / directory creation / source deletion a run attempts. */
export function recordIo(port: PlatformPort): {
  readonly port: PlatformPort
  readonly writes: string[]
  readonly directories: string[]
  readonly deletes: string[]
} {
  const writes: string[] = []
  const directories: string[] = []
  const deletes: string[] = []
  return {
    writes,
    directories,
    deletes,
    port: {
      ...port,
      writeTextFile: (path, content, modifiedMs) => {
        writes.push(path)
        return port.writeTextFile(path, content, modifiedMs)
      },
      ensureDirectory: (path) => {
        directories.push(path)
        return port.ensureDirectory(path)
      },
      deleteFile: (path) => {
        deletes.push(path)
        return port.deleteFile(path)
      }
    }
  }
}

const scratchRoots: string[] = []

/** A real temporary directory, removed by {@link cleanupScratchRoots}. */
export async function scratchRoot(prefix = 'opencompare-template-gate-'): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix))
  scratchRoots.push(root)
  return root
}

export async function cleanupScratchRoots(): Promise<void> {
  await Promise.all(
    scratchRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
}

/** Absolute disk path of a root-relative (`/`-joined) path. */
export function diskPath(root: string, relativePath: string): string {
  return join(root, ...relativePath.split('/'))
}

/** Whole-second stamp helper: floors milliseconds so the mtimeSec check is exact. */
export function wholeSecondMs(sec: number): number {
  return Math.floor(sec) * 1000
}

export async function setMtimeSeconds(path: string, sec: number): Promise<void> {
  const stamp = new Date(wholeSecondMs(sec))
  await utimes(path, stamp, stamp)
}

export interface PlannedTextFile {
  readonly relativePath: string
  readonly text: string
  /** Whole-second source mtime; omitted to keep the write time. */
  readonly stampSec?: number
}

export async function writeText(
  root: string,
  relativePath: string,
  text: string,
  stampSec?: number
): Promise<void> {
  const target = diskPath(root, relativePath)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, text, 'utf8')
  if (stampSec !== undefined) await setMtimeSeconds(target, stampSec)
}

/** Writes a batch of files with bounded concurrency (48 in flight). */
export async function writeTextTree(
  root: string,
  files: readonly PlannedTextFile[],
  size = 48
): Promise<void> {
  for (let start = 0; start < files.length; start += size) {
    await Promise.all(
      files.slice(start, start + size).map((file) =>
        writeText(root, file.relativePath, file.text, file.stampSec)
      )
    )
  }
}

/** SHA-256 of a file's bytes, computed by the test independently of the app. */
export async function fileSha256(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

export interface TreeSnapshotEntry {
  readonly relativePath: string
  readonly kind: 'file' | 'directory'
  readonly size: number
  readonly sha256?: string
  readonly mtimeSec: number
}

/**
 * Whole output tree, sorted: relative path, kind, size, content SHA-256 and
 * whole-second mtime. Comparing two snapshots proves "unchanged" over the full
 * tree instead of a hand-picked subset.
 */
export async function snapshotTree(root: string): Promise<TreeSnapshotEntry[]> {
  const entries: TreeSnapshotEntry[] = []

  async function walk(directory: string, prefix: string): Promise<void> {
    const children = await readdir(directory, { withFileTypes: true })
    for (const child of children) {
      const relativePath = prefix === '' ? child.name : `${prefix}/${child.name}`
      const absolute = join(directory, child.name)
      const info = await stat(absolute)
      if (child.isDirectory()) {
        entries.push({
          relativePath,
          kind: 'directory',
          size: 0,
          mtimeSec: Math.floor(info.mtimeMs / 1000)
        })
        await walk(absolute, relativePath)
        continue
      }
      entries.push({
        relativePath,
        kind: 'file',
        size: info.size,
        sha256: await fileSha256(absolute),
        mtimeSec: Math.floor(info.mtimeMs / 1000)
      })
    }
  }

  await walk(root, '')
  return entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
}

/** Temporary files an atomic write would leak into the tree. */
export function tempFiles(entries: readonly TreeSnapshotEntry[]): string[] {
  return entries
    .filter((entry) => entry.kind === 'file' && entry.relativePath.endsWith('.tmp'))
    .map((entry) => entry.relativePath)
}

/** Every file under `root`, root-relative and sorted; no hashing, cheap for counts. */
export async function listTreeFiles(root: string): Promise<string[]> {
  const files: string[] = []

  async function walk(directory: string, prefix: string): Promise<void> {
    const children = await readdir(directory, { withFileTypes: true })
    for (const child of children) {
      const relativePath = prefix === '' ? child.name : `${prefix}/${child.name}`
      if (child.isDirectory()) {
        await walk(join(directory, child.name), relativePath)
      } else {
        files.push(relativePath)
      }
    }
  }

  await walk(root, '')
  return files.sort()
}

/** The template slots every small gate fixture provides, five outcome classes. */
export const GATE_SLOTS = {
  clean: 'docs/规范 文档/clean.txt',
  deep: '资料 夹/第一层/第二层/深层 目录/deep.txt',
  plain: 'docs/plain.txt',
  overwrite: 'src/over.txt',
  occupied: 'src/占位/occupied.txt',
  mismatch: '老目录/mismatch.txt',
  ambiguous: '双/x.txt',
  missing: '缺/missing.txt'
} as const

export interface TemplateGateFixture {
  readonly root: string
  readonly templateRoot: string
  readonly incomingRoot: string
  readonly outputRoot: string
  /** Absolute B source of every matched slot. */
  readonly sources: Readonly<Record<string, string>>
  readonly mismatchChoice: string
  readonly ambiguousChoices: readonly string[]
}

const FIXTURE_SOURCES: readonly PlannedTextFile[] = [
  { relativePath: 'a/clean.txt', text: 'clean body\n', stampSec: 1_700_200_000 },
  { relativePath: 'b/deep.txt', text: 'deep body\n', stampSec: 1_700_200_001 },
  { relativePath: 'c/plain.txt', text: 'plain body\n', stampSec: 1_700_200_002 },
  { relativePath: 'd/over.txt', text: 'overwrite source body\n', stampSec: 1_700_200_003 },
  { relativePath: 'e/occupied.txt', text: 'occupied body\n', stampSec: 1_700_200_004 },
  { relativePath: 'f/mismatch.txt', text: 'incoming mismatch body\n', stampSec: 1_700_200_005 },
  { relativePath: 'p/x.txt', text: 'ambiguous candidate one\n', stampSec: 1_700_200_006 },
  { relativePath: 'q/x.txt', text: 'ambiguous candidate two\n', stampSec: 1_700_200_007 },
  { relativePath: 'extras/unused-1.txt', text: 'unused one\n', stampSec: 1_700_200_008 },
  { relativePath: 'extras/unused-2.txt', text: 'unused two\n', stampSec: 1_700_200_009 },
  { relativePath: 'extras/unused-3.txt', text: 'unused three\n', stampSec: 1_700_200_010 }
]

/**
 * Builds one real fixture under `mkdtemp`: template A slots covering matched
 * (clean / deep / overwritten), missing, both conflict reasons and a
 * directory-occupied target; scattered tree B with unused files; output root
 * holding one existing file and one directory. Every A / B root is real.
 */
export async function buildTemplateGateFixture(): Promise<TemplateGateFixture> {
  const root = await scratchRoot()
  const templateRoot = join(root, '模板 A')
  const incomingRoot = join(root, '散乱 树 B')
  const outputRoot = join(root, '输出 根')

  await writeTextTree(templateRoot, [
    { relativePath: GATE_SLOTS.clean, text: 'clean body\n' },
    { relativePath: GATE_SLOTS.deep, text: 'deep body\n' },
    { relativePath: GATE_SLOTS.plain, text: 'plain body\n' },
    { relativePath: GATE_SLOTS.overwrite, text: 'overwrite source body\n' },
    { relativePath: GATE_SLOTS.occupied, text: 'occupied body\n' },
    { relativePath: GATE_SLOTS.mismatch, text: 'template mismatch body\n' },
    { relativePath: GATE_SLOTS.ambiguous, text: 'ambiguous template body\n' },
    { relativePath: GATE_SLOTS.missing, text: 'never provided\n' }
  ])

  await writeTextTree(incomingRoot, FIXTURE_SOURCES)

  // The output root already holds the overwrite target and a directory sitting
  // exactly on the occupied slot: neither may ever be written by a run.
  await writeText(outputRoot, GATE_SLOTS.overwrite, 'stale overwrite body\n')
  await writeText(outputRoot, `${GATE_SLOTS.occupied}/keep.txt`, 'kept\n')

  return {
    root,
    templateRoot,
    incomingRoot,
    outputRoot,
    sources: {
      [GATE_SLOTS.clean]: join(incomingRoot, 'a', 'clean.txt'),
      [GATE_SLOTS.deep]: join(incomingRoot, 'b', 'deep.txt'),
      [GATE_SLOTS.plain]: join(incomingRoot, 'c', 'plain.txt'),
      [GATE_SLOTS.overwrite]: join(incomingRoot, 'd', 'over.txt'),
      [GATE_SLOTS.occupied]: join(incomingRoot, 'e', 'occupied.txt')
    },
    mismatchChoice: join(incomingRoot, 'f', 'mismatch.txt'),
    ambiguousChoices: [join(incomingRoot, 'p', 'x.txt'), join(incomingRoot, 'q', 'x.txt')]
  }
}
