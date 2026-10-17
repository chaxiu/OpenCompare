import { contextBridge, ipcRenderer } from 'electron'
import { PLATFORM_CHANNELS } from '@shared/platform/channels'
import type { DirectoryEntry, PlatformPort } from '@shared/platform/types'

const platform: PlatformPort = {
  kind: 'electron',
  selectDirectory: () =>
    ipcRenderer.invoke(PLATFORM_CHANNELS.selectDirectory) as Promise<string | null>,
  listDirectory: (path) =>
    ipcRenderer.invoke(PLATFORM_CHANNELS.listDirectory, path) as Promise<DirectoryEntry[]>,
  readTextFile: (path) =>
    ipcRenderer.invoke(PLATFORM_CHANNELS.readTextFile, path) as Promise<string>,
  writeTextFile: (path, content) =>
    ipcRenderer.invoke(PLATFORM_CHANNELS.writeTextFile, path, content) as Promise<void>,
  exists: (path) => ipcRenderer.invoke(PLATFORM_CHANNELS.exists, path) as Promise<boolean>
}

contextBridge.exposeInMainWorld('openComparePlatform', platform)
