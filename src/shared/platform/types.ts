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
  /**
   * Writes UTF-8 text. When `modifiedMs` is given the file's modification time
   * is set to it afterwards, which lets a copy keep the source's metadata so the
   * comparison's size/mtime fast path stays truthful.
   */
  writeTextFile(path: string, content: string, modifiedMs?: number): Promise<void>
  exists(path: string): Promise<boolean>
  /** Creates `path` and any missing ancestors; a no-op when it already exists. */
  ensureDirectory(path: string): Promise<void>
  /** Removes one file. Directories and read-only mounts are rejected. */
  deleteFile(path: string): Promise<void>
  /** Writable scratch root for materialising read-only trees (per runtime). */
  temporaryDirectory(): Promise<string>
}
