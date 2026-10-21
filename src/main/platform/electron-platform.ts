/**
 * Main-process handlers implementing {@link PlatformPort} on the local file
 * system. The built-in sample library is additionally mounted read-only at
 * `/samples`, mirroring the in-memory mount the web runtime uses, so loading the
 * sample directory works identically in `pnpm dev` and `pnpm dev:web`.
 */
import {
  access,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
  writeFile
} from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { join } from 'node:path'
import { app, dialog, ipcMain } from 'electron'
import type { FileFilter } from 'electron'
import { mapWithLimit, toReadableIoError } from '@core/io'
import { SAMPLE_FIXTURE_FILES } from '@shared/fixtures'
import { PLATFORM_CHANNELS } from '@shared/platform/channels'
import type { DirectoryEntry, PathProbeKind } from '@shared/platform/types'

const SAMPLE_ROOT = '/samples'

const SAMPLE_FILES = new Map(SAMPLE_FIXTURE_FILES.map((file) => [file.path, file.text]))

function isSamplePath(path: string): boolean {
  return path === SAMPLE_ROOT || path.startsWith(`${SAMPLE_ROOT}/`)
}

function listSampleDirectory(path: string): DirectoryEntry[] {
  const prefix = `${path}/`
  const entries = new Map<string, DirectoryEntry>()

  for (const file of SAMPLE_FIXTURE_FILES) {
    if (!file.path.startsWith(prefix)) continue
    const rest = file.path.slice(prefix.length)
    const separator = rest.indexOf('/')
    const name = separator === -1 ? rest : rest.slice(0, separator)
    const childPath = `${path}/${name}`
    if (entries.has(childPath)) continue
    entries.set(childPath, {
      name,
      path: childPath,
      isDirectory: separator !== -1,
      size: separator === -1 ? file.text.length : 0,
      modifiedMs: 0
    })
  }

  return [...entries.values()]
}

function samplePathExists(path: string): boolean {
  if (path === SAMPLE_ROOT) return true
  if (SAMPLE_FILES.has(path)) return true
  const prefix = `${path}/`
  return SAMPLE_FIXTURE_FILES.some((file) => file.path.startsWith(prefix))
}

function assertPath(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('Expected a non-empty path string.')
  }
  return value
}

async function selectDirectory(): Promise<string | null> {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}

/** Validated dialog request, ready for the Electron dialog API. */
interface DialogRequest {
  readonly title?: string
  readonly filters?: FileFilter[]
  readonly defaultPath?: string
}

/** Dialog options arrive over IPC, so every field is validated before use. */
function parseFilters(value: unknown): FileFilter[] | undefined {
  if (!Array.isArray(value)) return undefined
  const filters: FileFilter[] = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as { name?: unknown; extensions?: unknown }
    if (typeof record.name !== 'string' || !Array.isArray(record.extensions)) continue
    const extensions = record.extensions
      .filter((extension): extension is string => typeof extension === 'string')
      // Electron wants bare extensions; accept either `txt` or `.txt`.
      .map((extension) => extension.replace(/^\./, ''))
      .filter((extension) => extension.length > 0)
    if (extensions.length > 0) filters.push({ name: record.name, extensions })
  }
  return filters.length === 0 ? undefined : filters
}

function parseText(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function parseDialogRequest(value: unknown): DialogRequest {
  const record = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  return {
    title: parseText(record.title),
    filters: parseFilters(record.filters),
    defaultPath: parseText(record.defaultPath)
  }
}

async function selectFile(options: DialogRequest): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: options.title,
    filters: options.filters,
    properties: ['openFile']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}

async function saveFile(options: DialogRequest, content: string): Promise<string | null> {
  const result = await dialog.showSaveDialog({
    title: options.title,
    defaultPath: options.defaultPath,
    filters: options.filters
  })
  if (result.canceled || !result.filePath) return null
  const target = assertWritable(result.filePath)
  await writeFile(target, content, 'utf8')
  return target
}

/** `stat` failures that mean "one entry is broken", not "the directory is". */
const ENTRY_FALLBACK_CODES: ReadonlySet<string> = new Set([
  'ENOENT',
  'ELOOP',
  'EACCES',
  'ENOTDIR'
])

function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' ? code : undefined
}

/** Chinese gloss of the OS codes the platform layer can surface. */
function describeFileSystemCode(code: string | undefined): string {
  switch (code) {
    case 'ENOENT':
      return '路径不存在或已被移动'
    case 'ENOTDIR':
      return '路径不是目录'
    case 'EACCES':
    case 'EPERM':
      return '没有访问权限'
    case 'ELOOP':
      return '符号链接层级过深或形成循环'
    default:
      return '文件系统读取失败'
  }
}

function readableFailure(subject: '目录' | '文件', error: unknown, path: string): Error {
  // Descriptor exhaustion already has a dedicated readable error; keep it.
  const converted = toReadableIoError(error)
  if (converted instanceof Error && converted !== error) return converted
  const code = errorCode(error)
  return new Error(
    `无法读取${subject} ${path}：${describeFileSystemCode(code)}${code ? `（${code}）` : ''}。`
  )
}

/** Readable reason one entry is flagged `broken`; never empty. */
function brokenReason(error: unknown, entry: Dirent): string {
  const code = errorCode(error)
  const kind = entry.isSymbolicLink() ? '悬空符号链接' : '不可读条目'
  return `${kind}：${describeFileSystemCode(code)}${code ? `（${code}）` : ''}`
}

async function listDirectory(path: string): Promise<DirectoryEntry[]> {
  let entries: Dirent[]
  try {
    entries = await readdir(path, { withFileTypes: true })
  } catch (error) {
    // The root directory itself being unreadable is a real failure, not a
    // skippable entry, so it still rejects — with a readable message.
    throw readableFailure('目录', error, path)
  }

  // A wide directory still needs one `stat` per entry; the bounded window keeps
  // that fan-out from exhausting descriptors on very large directories.
  return mapWithLimit(entries, {}, async (entry) => {
    const entryPath = join(path, entry.name)
    let statFailure: unknown
    try {
      const info = await stat(entryPath)
      return {
        name: entry.name,
        path: entryPath,
        isDirectory: info.isDirectory(),
        size: info.size,
        modifiedMs: info.mtimeMs
      }
    } catch (error) {
      statFailure = error
      // Anything else (e.g. EMFILE) stays a failure of the whole listing.
      if (!ENTRY_FALLBACK_CODES.has(errorCode(error) ?? '')) throw error
    }

    // A dangling symbolic link or unreadable child is listed but cannot be
    // inspected; keep it in the result with its own link metadata so one bad
    // entry never fails the comparison. The scan counts these as skipped.
    try {
      const info = await lstat(entryPath)
      return {
        name: entry.name,
        path: entryPath,
        isDirectory: info.isDirectory(),
        size: info.size,
        modifiedMs: info.mtimeMs,
        broken: true,
        skippedReason: brokenReason(statFailure, entry)
      }
    } catch (error) {
      return {
        name: entry.name,
        path: entryPath,
        // `readdir` still knows the type; no size/mtime is available.
        isDirectory: entry.isDirectory(),
        size: 0,
        modifiedMs: 0,
        broken: true,
        skippedReason: brokenReason(error, entry)
      }
    }
  })
}

async function readLocalTextFile(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    throw readableFailure('文件', error, path)
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function isMissingError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

/**
 * `file` / `directory` / `missing` probe. Absence is a normal answer; any other
 * failure (permissions, I/O) rejects so the caller can report it as unreadable.
 * Exported because the launch intake probes with the very same implementation.
 */
export async function statPath(path: string): Promise<PathProbeKind> {
  if (isSamplePath(path)) {
    if (SAMPLE_FILES.has(path)) return 'file'
    if (path === SAMPLE_ROOT) return 'directory'
    const prefix = `${path}/`
    return SAMPLE_FIXTURE_FILES.some((file) => file.path.startsWith(prefix))
      ? 'directory'
      : 'missing'
  }
  try {
    const info = await stat(path)
    return info.isDirectory() ? 'directory' : 'file'
  } catch (error) {
    if (isMissingError(error)) return 'missing'
    throw error
  }
}

function assertWritable(path: string): string {
  if (isSamplePath(path)) {
    throw new Error(`内置样本库挂在只读的 ${SAMPLE_ROOT} 上，不能写入：${path}`)
  }
  return path
}

async function temporaryDirectory(): Promise<string> {
  const root = join(app.getPath('temp'), 'opencompare')
  await mkdir(root, { recursive: true })
  return root
}

/** Hooks the launch bootstrap needs from the IPC layer. */
export interface PlatformIpcOptions {
  /** Called when the renderer announces its launch-request subscription. */
  readonly onCompareRequestsReady?: () => void
}

/** Registers the native PlatformPort handlers backed by the local file system. */
export function registerPlatformIpc(options: PlatformIpcOptions = {}): void {
  ipcMain.handle(PLATFORM_CHANNELS.compareRequestsReady, () => {
    options.onCompareRequestsReady?.()
  })
  ipcMain.handle(PLATFORM_CHANNELS.homeDirectory, () => app.getPath('home'))
  ipcMain.handle(PLATFORM_CHANNELS.workingDirectory, () => process.cwd())
  ipcMain.handle(PLATFORM_CHANNELS.selectDirectory, () => selectDirectory())
  ipcMain.handle(PLATFORM_CHANNELS.selectFile, (_event, options: unknown) =>
    selectFile(parseDialogRequest(options))
  )
  ipcMain.handle(PLATFORM_CHANNELS.saveFile, (_event, options: unknown) => {
    const record = (typeof options === 'object' && options !== null ? options : {}) as Record<
      string,
      unknown
    >
    return saveFile(
      parseDialogRequest(options),
      typeof record.content === 'string' ? record.content : ''
    )
  })
  ipcMain.handle(PLATFORM_CHANNELS.listDirectory, (_event, path: unknown) => {
    const target = assertPath(path)
    return isSamplePath(target) ? listSampleDirectory(target) : listDirectory(target)
  })
  ipcMain.handle(PLATFORM_CHANNELS.readTextFile, (_event, path: unknown) => {
    const target = assertPath(path)
    if (!isSamplePath(target)) return readLocalTextFile(target)
    const text = SAMPLE_FILES.get(target)
    if (text === undefined) throw new Error(`No such sample file: ${target}`)
    return text
  })
  ipcMain.handle(
    PLATFORM_CHANNELS.writeTextFile,
    async (_event, path: unknown, content: unknown, modifiedMs: unknown) => {
      const target = assertWritable(assertPath(path))
      await writeFile(target, typeof content === 'string' ? content : String(content), 'utf8')
      if (typeof modifiedMs === 'number' && Number.isFinite(modifiedMs)) {
        const stamp = new Date(modifiedMs)
        await utimes(target, stamp, stamp)
      }
    }
  )
  ipcMain.handle(PLATFORM_CHANNELS.exists, (_event, path: unknown) => {
    const target = assertPath(path)
    return isSamplePath(target) ? samplePathExists(target) : exists(target)
  })
  ipcMain.handle(PLATFORM_CHANNELS.statPath, (_event, path: unknown) =>
    statPath(assertPath(path))
  )
  ipcMain.handle(PLATFORM_CHANNELS.ensureDirectory, (_event, path: unknown) => {
    const target = assertPath(path)
    if (isSamplePath(target)) return undefined
    return mkdir(target, { recursive: true })
  })
  ipcMain.handle(PLATFORM_CHANNELS.deleteFile, (_event, path: unknown) =>
    rm(assertWritable(assertPath(path)))
  )
  ipcMain.handle(PLATFORM_CHANNELS.temporaryDirectory, () => temporaryDirectory())
}
