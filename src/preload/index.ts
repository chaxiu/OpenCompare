import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { CompareRequestPayload } from '@shared/compareRequest'
import type { PerfHarnessConfig, PerfRendererEvent } from '@shared/perf/types'
import { PLATFORM_CHANNELS } from '@shared/platform/channels'
import type {
  DigestFilesResult,
  DirectoryEntry,
  DirectoryListing,
  PlatformPort,
  UserSettings
} from '@shared/platform/types'

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
  listDirectories: (paths, options) =>
    ipcRenderer.invoke(PLATFORM_CHANNELS.listDirectories, paths, options) as Promise<
      readonly DirectoryListing[]
    >,
  readTextFile: (path) =>
    ipcRenderer.invoke(PLATFORM_CHANNELS.readTextFile, path) as Promise<string>,
  digestFiles: (paths, options) =>
    ipcRenderer.invoke(PLATFORM_CHANNELS.digestFiles, paths, options) as Promise<DigestFilesResult>,
  cancelOperation: (operationId) =>
    ipcRenderer.invoke(PLATFORM_CHANNELS.cancelOperation, operationId) as Promise<void>,
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
  removeDirectory: (path) =>
    ipcRenderer.invoke(PLATFORM_CHANNELS.removeDirectory, path) as Promise<void>,
  temporaryDirectory: () =>
    ipcRenderer.invoke(PLATFORM_CHANNELS.temporaryDirectory) as Promise<string>,
  realpath: (paths) =>
    ipcRenderer.invoke(PLATFORM_CHANNELS.realpath, paths) as Promise<readonly string[]>,
  readUserSettings: () =>
    ipcRenderer.invoke(PLATFORM_CHANNELS.readUserSettings) as Promise<UserSettings | null>,
  writeUserSettings: (settings) =>
    ipcRenderer.invoke(PLATFORM_CHANNELS.writeUserSettings, settings) as Promise<void>,
  systemLocale: () =>
    ipcRenderer.invoke(PLATFORM_CHANNELS.systemLocale) as Promise<string>,
  onCompareRequest: (listener) => {
    const forward = (_event: IpcRendererEvent, payload: CompareRequestPayload): void => {
      listener(payload)
    }
    ipcRenderer.on(PLATFORM_CHANNELS.compareRequest, forward)
    return () => {
      ipcRenderer.removeListener(PLATFORM_CHANNELS.compareRequest, forward)
    }
  },
  compareRequestsReady: () =>
    ipcRenderer.invoke(PLATFORM_CHANNELS.compareRequestsReady) as Promise<void>,
  // Inert outside a harness run: the main process registers these handlers only
  // when the measurement mode is active, and the perf window is the only one
  // that asks for them.
  perf: {
    config: () =>
      ipcRenderer.invoke(PLATFORM_CHANNELS.perfConfig) as Promise<PerfHarnessConfig | null>,
    event: (event: PerfRendererEvent) =>
      ipcRenderer.invoke(PLATFORM_CHANNELS.perfEvent, event) as Promise<void>
  }
}

contextBridge.exposeInMainWorld('openComparePlatform', platform)
