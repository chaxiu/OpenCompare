/**
 * Single seam between the renderer and its host platform.
 *
 * Renderer code depends on this interface only and must never import Electron
 * APIs directly. Two implementations exist:
 *  - Electron: main-process handlers + a `contextBridge` bridge exposed by preload.
 *  - Web: an in-memory virtual file system for browser / `--rendererOnly` runs.
 */
import type { CompareRequestPayload } from '../compareRequest'
import type { PerfBridge } from '../perf/types'

export type PlatformKind = 'electron' | 'web'

/** A directory entry as returned by {@link PlatformPort.listDirectory}. */
export interface DirectoryEntry {
  readonly name: string
  readonly path: string
  readonly isDirectory: boolean
  readonly size: number
  readonly modifiedMs: number
  /**
   * True when the entry could not be fully inspected (a dangling symbolic link,
   * an unreadable entry, …). Such an entry is still returned so a caller can
   * count it instead of failing the whole listing; absent on healthy entries.
   */
  readonly broken?: boolean
  /** Readable reason an entry is marked {@link broken}. */
  readonly skippedReason?: string
}

/** One entry of an open / save dialog filter; extensions carry no leading dot. */
/** One directory of a batch listing that was read successfully. */
export interface DirectoryListingSuccess {
  readonly path: string
  readonly ok: true
  readonly entries: readonly DirectoryEntry[]
}

/** One directory of a batch listing that could not be read; the batch still resolves. */
export interface DirectoryListingFailure {
  readonly path: string
  readonly ok: false
  /** Readable reason this directory could not be listed. */
  readonly reason: string
}

export type DirectoryListing = DirectoryListingSuccess | DirectoryListingFailure

export interface ListDirectoriesOptions {
  /** In-flight `readdir` calls; the `stat` budget is fixed per batch. */
  readonly concurrency?: number
}

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

/** One successfully digested file: the raw bytes' SHA-256, never a text decode. */
export interface FileDigestSuccess {
  readonly path: string
  readonly ok: true
  /** 64-character lowercase hex SHA-256 of the file's raw bytes. */
  readonly sha256: string
  /** Number of bytes the digest actually consumed. */
  readonly bytes: number
}

/** One file the digest capability could not read; the rest of the batch still resolves. */
export interface FileDigestFailure {
  readonly path: string
  readonly ok: false
  /** Readable reason this single file could not be digested. */
  readonly reason: string
}

export type FileDigest = FileDigestSuccess | FileDigestFailure

export interface DigestFilesOptions {
  /** In-flight streaming reads; defaults to the platform's bounded window. */
  readonly concurrency?: number
  /**
   * Identifies the comparison this digest belongs to, so
   * {@link PlatformPort.cancelOperation} can stop its in-flight streams.
   */
  readonly operationId?: string
}

export interface PlatformPort {
  readonly kind: PlatformKind
  /**
   * Absolute home directory used to expand a leading `~` in manually entered
   * paths. Supplied explicitly instead of being read from the environment.
   */
  homeDirectory(): Promise<string>
  /** Base directory relative paths are resolved against (the process cwd). */
  workingDirectory(): Promise<string>
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
  /**
   * Lists several directories in one round trip, in input order. A directory
   * that cannot be read only fails its own slot; the batch still resolves.
   * Descriptor exhaustion rejects the whole batch, since every read would fail.
   */
  listDirectories(
    paths: readonly string[],
    options?: ListDirectoriesOptions
  ): Promise<readonly DirectoryListing[]>
  readTextFile(path: string): Promise<string>
  /**
   * Digests each file's **raw bytes** with SHA-256, in input order. Nothing is
   * decoded as text, so binary content (including invalid UTF-8) is compared
   * byte for byte. A file that cannot be read only marks that item failed; the
   * batch still resolves. Descriptor exhaustion rejects the whole call.
   */
  digestFiles(
    paths: readonly string[],
    options?: DigestFilesOptions
  ): Promise<readonly FileDigest[]>
  /**
   * Cancels the in-flight work registered under `operationId`: the affected
   * `digestFiles` call rejects with the cancellation error instead of returning
   * partial slots. Unknown and repeated ids resolve harmlessly.
   */
  cancelOperation(operationId: string): Promise<void>
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
  /**
   * Subscribes to compare requests collected from the launch source (launch
   * arguments or an `opencompare://` link). Optional: a runtime without a launch
   * source omits it and the workbench treats it as "no injection". The returned
   * function releases the subscription.
   */
  onCompareRequest?(listener: (payload: CompareRequestPayload) => void): () => void
  /**
   * Announces that the listener above is attached, so the host may deliver the
   * requests it queued while the renderer was starting up.
   */
  compareRequestsReady?(): Promise<void>
  /**
   * Measurement-only seam. Present on the Electron bridge so a harness window
   * can fetch its config and report round boundaries; absent in the web runtime
   * and inert during a normal launch (the main process only answers it in
   * harness mode).
   */
  readonly perf?: PerfBridge
}
