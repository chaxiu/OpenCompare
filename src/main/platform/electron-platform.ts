import { access, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { dialog, ipcMain } from 'electron'
import { PLATFORM_CHANNELS } from '@shared/platform/channels'
import type { DirectoryEntry } from '@shared/platform/types'

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
  const result: DirectoryEntry[] = []
  for (const entry of entries) {
    const entryPath = join(path, entry.name)
    const info = await stat(entryPath)
    result.push({
      name: entry.name,
      path: entryPath,
      isDirectory: info.isDirectory(),
      size: info.size,
      modifiedMs: info.mtimeMs
    })
  }
  return result
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
  ipcMain.handle(PLATFORM_CHANNELS.listDirectory, (_event, path: unknown) =>
    listDirectory(assertPath(path))
  )
  ipcMain.handle(PLATFORM_CHANNELS.readTextFile, (_event, path: unknown) =>
    readFile(assertPath(path), 'utf8')
  )
  ipcMain.handle(
    PLATFORM_CHANNELS.writeTextFile,
    (_event, path: unknown, content: unknown) =>
      writeFile(assertPath(path), typeof content === 'string' ? content : String(content), 'utf8')
  )
  ipcMain.handle(PLATFORM_CHANNELS.exists, (_event, path: unknown) => exists(assertPath(path)))
}
