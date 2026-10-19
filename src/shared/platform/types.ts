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

/** One entry of an open / save dialog filter; extensions carry no leading dot. */
export interface FileDialogFilter {
  readonly name: string
  readonly extensions: readonly string[]
}

export interface SelectFileOptions {
  readonly title?: string
  readonly filters?: readonly FileDialogFilter[]
}

export interface SaveFileOptions extends SelectFileOptions {
  /** Pre-filled file name or path of the save dialog. */
  readonly defaultPath?: string
  /** UTF-8 text written to the chosen path before it is returned. */
  readonly content: string
}

/** What lives at a path, as reported by {@link PlatformPort.statPath}. */
export type PathProbeKind = 'file' | 'directory' | 'missing'

export interface PlatformPort {
  readonly kind: PlatformKind
  /** Ask the user for a directory; resolves to `null` when cancelled. */
  selectDirectory(): Promise<string | null>
  /** Ask the user for a file; resolves to the chosen path, or `null` when cancelled. */
  selectFile(options?: SelectFileOptions): Promise<string | null>
  /**
   * Resolves the absolute path behind a file dropped into the window. Electron 37
   * removed `File.path`, so the dropped handle is resolved through the platform
   * seam (`webUtils.getPathForFile` in preload) rather than guessed in the
   * renderer. Resolves to `''` when the handle carries no real path (a handle
   * constructed in JS, a drop in the browser runtime, …).
   */
  resolveDroppedPath(file: File): Promise<string>
  /**
   * Ask the user where to write `content` and write it. Resolves to the written
   * path, or `null` when cancelled; a read-only mount rejects the write.
   */
  saveFile(options: SaveFileOptions): Promise<string | null>
  listDirectory(path: string): Promise<DirectoryEntry[]>
  readTextFile(path: string): Promise<string>
  /**
   * Writes UTF-8 text. When `modifiedMs` is given the file's modification time
   * is set to it afterwards, which lets a copy keep the source's metadata so the
   * comparison's size/mtime fast path stays truthful.
   */
  writeTextFile(path: string, content: string, modifiedMs?: number): Promise<void>
  exists(path: string): Promise<boolean>
  /**
   * Reports whether `path` is a file, a directory, or absent. Permission and
   * other I/O failures reject instead of guessing.
   */
  statPath(path: string): Promise<PathProbeKind>
  /** Creates `path` and any missing ancestors; a no-op when it already exists. */
  ensureDirectory(path: string): Promise<void>
  /** Removes one file. Directories and read-only mounts are rejected. */
  deleteFile(path: string): Promise<void>
  /** Writable scratch root for materialising read-only trees (per runtime). */
  temporaryDirectory(): Promise<string>
}
