/**
 * Main-process handlers implementing {@link PlatformPort} on the local file
 * system. The built-in sample library is additionally mounted read-only at
 * `/samples`, mirroring the in-memory mount the web runtime uses, so loading the
 * sample directory works identically in `pnpm dev` and `pnpm dev:web`.
 */
import { access, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { dialog, ipcMain } from 'electron'
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

/** Registers the native PlatformPort handlers backed by the local file system. */
export function registerPlatformIpc(): void {
  ipcMain.handle(PLATFORM_CHANNELS.selectDirectory, () => selectDirectory())
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
    (_event, path: unknown, content: unknown) =>
      writeFile(assertPath(path), typeof content === 'string' ? content : String(content), 'utf8')
  )
  ipcMain.handle(PLATFORM_CHANNELS.exists, (_event, path: unknown) => {
    const target = assertPath(path)
    return isSamplePath(target) ? samplePathExists(target) : exists(target)
  })
}
