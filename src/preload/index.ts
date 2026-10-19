import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { PLATFORM_CHANNELS } from '@shared/platform/channels'
import type { DirectoryEntry, PlatformPort } from '@shared/platform/types'

const platform: PlatformPort = {
  kind: 'electron',
  homeDirectory: () =>
    ipcRenderer.invoke(PLATFORM_CHANNELS.homeDirectory) as Promise<string>,
  workingDirectory: () =>
    ipcRenderer.invoke(PLATFORM_CHANNELS.workingDirectory) as Promise<string>,
  selectDirectory: () =>
    ipcRenderer.invoke(PLATFORM_CHANNELS.selectDirectory) as Promise<string | null>,
  selectFile: (options) =>
    ipcRenderer.invoke(PLATFORM_CHANNELS.selectFile, options) as Promise<string | null>,
  // `File.path` no longer exists in Electron 32+, so a dropped handle is turned
  // into its real path here, where `webUtils` is available.
  resolveDroppedPath: async (file) => webUtils.getPathForFile(file),
  saveFile: (options) =>
    ipcRenderer.invoke(PLATFORM_CHANNELS.saveFile, options) as Promise<string | null>,
  listDirectory: (path) =>
    ipcRenderer.invoke(PLATFORM_CHANNELS.listDirectory, path) as Promise<DirectoryEntry[]>,
  readTextFile: (path) =>
    ipcRenderer.invoke(PLATFORM_CHANNELS.readTextFile, path) as Promise<string>,
  writeTextFile: (path, content, modifiedMs) =>
    ipcRenderer.invoke(PLATFORM_CHANNELS.writeTextFile, path, content, modifiedMs) as Promise<void>,
  exists: (path) => ipcRenderer.invoke(PLATFORM_CHANNELS.exists, path) as Promise<boolean>,
  statPath: (path) =>
    ipcRenderer.invoke(PLATFORM_CHANNELS.statPath, path) as Promise<
      'file' | 'directory' | 'missing'
    >,
  ensureDirectory: (path) =>
    ipcRenderer.invoke(PLATFORM_CHANNELS.ensureDirectory, path) as Promise<void>,
  deleteFile: (path) => ipcRenderer.invoke(PLATFORM_CHANNELS.deleteFile, path) as Promise<void>,
  temporaryDirectory: () =>
    ipcRenderer.invoke(PLATFORM_CHANNELS.temporaryDirectory) as Promise<string>
}

contextBridge.exposeInMainWorld('openComparePlatform', platform)
