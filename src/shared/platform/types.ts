/**
 * Single seam between the renderer and its host platform.
 *
 * Renderer code depends on this interface only and must never import Electron
 * APIs directly. Two implementations exist:
 *  - Electron: main-process handlers + a `contextBridge` bridge exposed by preload.
 *  - Web: an in-memory virtual file system for browser / `--rendererOnly` runs.
 */
export type PlatformKind = 'electron' | 'web'

/** A directory entry as returned by {@link PlatformPort.listDirectory}. */
export interface DirectoryEntry {
  readonly name: string
  readonly path: string
  readonly isDirectory: boolean
  readonly size: number
  readonly modifiedMs: number
}

export interface PlatformPort {
  readonly kind: PlatformKind
  /** Ask the user for a directory; resolves to `null` when cancelled. */
  selectDirectory(): Promise<string | null>
  listDirectory(path: string): Promise<DirectoryEntry[]>
  readTextFile(path: string): Promise<string>
  writeTextFile(path: string, content: string): Promise<void>
  exists(path: string): Promise<boolean>
}
