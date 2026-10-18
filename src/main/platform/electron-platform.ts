/**
 * Main-process handlers implementing {@link PlatformPort} on the local file
 * system. The built-in sample library is additionally mounted read-only at
 * `/samples`, mirroring the in-memory mount the web runtime uses, so loading the
 * sample directory works identically in `pnpm dev` and `pnpm dev:web`.
 */
import { access, mkdir, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, dialog, ipcMain } from 'electron'
import type { FileFilter } from 'electron'
import { SAMPLE_FIXTURE_FILES } from '@shared/fixtures'
import { PLATFORM_CHANNELS } from '@shared/platform/channels'
import type { DirectoryEntry } from '@shared/platform/types'

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

async function listDirectory(path: string): Promise<DirectoryEntry[]> {
  const entries = await readdir(path, { withFileTypes: true })
  // One directory's width is small; stat its entries in parallel so a real
  // recursive scan is not serialised on metadata reads.
  return Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(path, entry.name)
      const info = await stat(entryPath)
      return {
        name: entry.name,
        path: entryPath,
        isDirectory: info.isDirectory(),
        size: info.size,
        modifiedMs: info.mtimeMs
      }
    })
  )
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
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

/** Registers the native PlatformPort handlers backed by the local file system. */
export function registerPlatformIpc(): void {
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
    if (!isSamplePath(target)) return readFile(target, 'utf8')
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
