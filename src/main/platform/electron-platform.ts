/**
 * Main-process handlers implementing {@link PlatformPort} on the local file
 * system. The built-in sample library is additionally mounted read-only at
 * `/samples`, mirroring the in-memory mount the web runtime uses, so loading the
 * sample directory works identically in `pnpm dev` and `pnpm dev:web`.
 */
import {
  access,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  stat,
  utimes,
  writeFile
} from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import type { Dirent } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { app, dialog, ipcMain } from 'electron'
import type { FileFilter } from 'electron'
import { OperationCancelledError, mapWithLimit, toReadableIoError } from '@core/io'
import { SAMPLE_FIXTURE_FILES } from '@shared/fixtures'
import { PLATFORM_CHANNELS } from '@shared/platform/channels'
import { parseUserSettings, parseUserSettingsJson } from '@shared/platform/settings'
import type {
  DigestFilesOptions,
  DigestFilesResult,
  DirectoryEntry,
  DirectoryListing,
  FileDigest,
  FileDigestSuccess,
  LinkTargetKind,
  ListDirectoriesOptions,
  PathProbeKind,
  UserSettings
} from '@shared/platform/types'

const SAMPLE_ROOT = '/samples'

/**
 * In-flight `stat` calls one batch listing may use, shared by every directory
 * in the batch. A per-directory window would multiply the fan-out by the
 * number of batched directories, which is exactly the descriptor blow-up this
 * budget prevents.
 */
export const DEFAULT_STAT_CONCURRENCY = 16

/** The subset of `fs.Stats` a listing reads; injectable so tests can observe it. */
export interface ListableStat {
  isDirectory(): boolean
  /** Present on real `lstat` results; absent in narrow test doubles. */
  isSymbolicLink?: () => boolean
  readonly size: number
  readonly mtimeMs: number
}

export interface LocalListDirectoriesOptions extends ListDirectoriesOptions {
  /** Overrides {@link DEFAULT_STAT_CONCURRENCY}. */
  readonly statConcurrency?: number
  /** Test seam replacing the `lstat` syscall; defaults to `node:fs/promises`. */
  readonly lstatFile?: (path: string) => Promise<ListableStat>
}

function resolveStatBudget(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return DEFAULT_STAT_CONCURRENCY
  return Math.max(1, Math.floor(requested))
}

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

function parsePathArray(value: unknown, subject: 'file' | 'directory' | 'path'): string[] {
  if (!Array.isArray(value)) throw new TypeError(`Expected an array of ${subject} paths.`)
  return value.map((path) => assertPath(path))
}

function parseConcurrencyOptions(value: unknown): DigestFilesOptions & ListDirectoriesOptions {
  const record = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >
  return typeof record.concurrency === 'number' ? { concurrency: record.concurrency } : {}
}

/** Digest options arrive over IPC, so `operationId` is validated the same way. */
function parseDigestOptions(value: unknown): LocalDigestFilesOptions {
  const record = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >
  const options: { concurrency?: number; operationId?: string } = {}
  if (typeof record.concurrency === 'number') options.concurrency = record.concurrency
  if (typeof record.operationId === 'string' && record.operationId.length > 0) {
    options.operationId = record.operationId
  }
  return options
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

/**
 * Writes `content` atomically: a uniquely named temporary file **in the target
 * directory** (same device, so the rename is a real atomic replace) is renamed
 * over `target`. A failed write or rename removes that temporary file, so the
 * target is never left zero-byte or half-written.
 *
 * Cross-platform rename semantics: POSIX `rename` atomically replaces an
 * existing file; on Windows libuv maps it to `MoveFileExW` with
 * `MOVEFILE_REPLACE_EXISTING`, which also replaces the target. A target that is
 * a non-empty directory, locked or read-only makes the rename fail and takes the
 * same temporary-file cleanup path. No `fsync` guarantee and no `EXDEV`
 * fallback: the temporary file always sits beside the target.
 */
async function writeFileAtomically(target: string, content: string): Promise<void> {
  const temporary = `${target}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, content, 'utf8')
    await rename(temporary, target)
  } catch (error) {
    // Cleanup must never mask the original reason the write failed.
    await rm(temporary, { force: true }).catch(() => undefined)
    throw error
  }
}

async function saveFile(options: DialogRequest, content: string): Promise<string | null> {
  const result = await dialog.showSaveDialog({
    title: options.title,
    defaultPath: options.defaultPath,
    filters: options.filters
  })
  if (result.canceled || !result.filePath) return null
  // The read-only sample mount is rejected before any file is created.
  const target = assertWritable(result.filePath)
  try {
    await writeFileAtomically(target, content)
  } catch (error) {
    throw readableWriteFailure(error, target)
  }
  return target
}

/** `stat` failures that mean "one entry is broken", not "the directory is". */
const ENTRY_FALLBACK_CODES: ReadonlySet<string> = new Set([
  'ENOENT',
  'ELOOP',
  'EACCES',
  'ENOTDIR'
])

function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' ? code : undefined
}

/** Chinese gloss of the OS codes the platform layer can surface. */
function describeFileSystemCode(code: string | undefined, fallback = '文件系统读取失败'): string {
  switch (code) {
    case 'ENOENT':
      return '路径不存在或已被移动'
    case 'ENOTDIR':
      return '路径不是目录'
    case 'EACCES':
    case 'EPERM':
      return '没有访问权限'
    case 'ELOOP':
      return '符号链接层级过深或形成循环'
    case 'EISDIR':
    case 'ENOTEMPTY':
    case 'EEXIST':
      return '目标是目录或目录非空'
    case 'ENOSPC':
      return '磁盘空间不足'
    case 'EROFS':
      return '目标所在磁盘为只读'
    default:
      return fallback
  }
}

/**
 * Readable reason a save failed. The message carries the target path only —
 * never the temporary file's name — and keeps the OS code when there is one.
 */
function readableWriteFailure(error: unknown, path: string): Error {
  const code = errorCode(error)
  return new Error(
    `无法写入文件 ${path}：${describeFileSystemCode(code, '文件系统写入失败')}${code ? `（${code}）` : ''}。`
  )
}

function readableFailure(subject: '目录' | '文件', error: unknown, path: string): Error {
  // Descriptor exhaustion already has a dedicated readable error; keep it.
  const converted = toReadableIoError(error)
  if (converted instanceof Error && converted !== error) return converted
  const code = errorCode(error)
  return new Error(
    `无法读取${subject} ${path}：${describeFileSystemCode(code)}${code ? `（${code}）` : ''}。`
  )
}

/** Readable reason one entry is flagged `broken`; never empty. */
function brokenReason(error: unknown, entry: Dirent): string {
  const code = errorCode(error)
  const kind = entry.isSymbolicLink() ? '符号链接' : '不可读条目'
  return `${kind}无法检查：${describeFileSystemCode(code)}${code ? `（${code}）` : ''}`
}

/** Resolves a link target's shape without the scan ever entering it. */
async function inspectLinkTarget(entryPath: string): Promise<LinkTargetKind> {
  try {
    return (await stat(entryPath)).isDirectory() ? 'directory' : 'file'
  } catch {
    // A dangling link (ENOENT) or a link loop (ELOOP) still has a comparable
    // target string; it is not an unreadable entry, so it is never skipped.
    return 'missing'
  }
}

/**
 * Inspects one directory entry from `lstat` only, so a symbolic link is listed
 * as its own leaf entry and its target subtree is never walked.
 */
async function inspectEntry(
  entryPath: string,
  entry: Dirent,
  lstatFile: (path: string) => Promise<ListableStat>
): Promise<DirectoryEntry> {
  let info: ListableStat
  try {
    info = await lstatFile(entryPath)
  } catch (error) {
    // Descriptor exhaustion would fail every remaining entry: stay fatal.
    const fatal = toReadableIoError(error)
    if (fatal !== error) throw fatal
    if (!ENTRY_FALLBACK_CODES.has(errorCode(error) ?? '')) throw error
    return {
      name: entry.name,
      path: entryPath,
      // `readdir` still knows the type; no size/mtime is available.
      isDirectory: entry.isDirectory(),
      size: 0,
      modifiedMs: 0,
      broken: true,
      skippedReason: brokenReason(error, entry)
    }
  }

  const isSymbolicLink = info.isSymbolicLink?.() ?? entry.isSymbolicLink()
  if (isSymbolicLink) {
    try {
      const linkTarget = await readlink(entryPath)
      return {
        name: entry.name,
        path: entryPath,
        // A link is always a leaf: never a directory the scan may recurse into.
        isDirectory: false,
        size: info.size,
        modifiedMs: info.mtimeMs,
        isSymbolicLink: true,
        linkTarget,
        linkTargetKind: await inspectLinkTarget(entryPath)
      }
    } catch (error) {
      const fatal = toReadableIoError(error)
      if (fatal !== error) throw fatal
      if (!ENTRY_FALLBACK_CODES.has(errorCode(error) ?? '')) throw error
      return {
        name: entry.name,
        path: entryPath,
        isDirectory: false,
        size: info.size,
        modifiedMs: info.mtimeMs,
        isSymbolicLink: true,
        broken: true,
        skippedReason: brokenReason(error, entry)
      }
    }
  }

  return {
    name: entry.name,
    path: entryPath,
    isDirectory: info.isDirectory(),
    size: info.size,
    modifiedMs: info.mtimeMs
  }
}

type ReadSlot =
  | { readonly path: string; readonly kind: 'sample'; readonly entries: DirectoryEntry[] }
  | { readonly path: string; readonly kind: 'dirents'; readonly entries: Dirent[] }
  | { readonly path: string; readonly kind: 'failure'; readonly reason: string }

/**
 * Lists several directories in one call. Every successful directory is read
 * with `readdir`, then **all** their entries share one bounded `stat` window —
 * batch size never multiplies the descriptor window.
 *
 * A directory that cannot be read only fails its own slot (the scan counts it
 * as skipped); descriptor exhaustion rejects the whole batch with the readable
 * file-handle error, because every queued read would fail too.
 */
export async function listDirectories(
  paths: readonly string[],
  options: LocalListDirectoriesOptions = {}
): Promise<readonly DirectoryListing[]> {
  const lstatFile = options.lstatFile ?? ((path: string) => lstat(path))
  const statConcurrency = resolveStatBudget(options.statConcurrency)

  const readSlots = await mapWithLimit(
    paths,
    { concurrency: options.concurrency },
    async (path): Promise<ReadSlot> => {
      if (isSamplePath(path)) {
        return { path, kind: 'sample', entries: listSampleDirectory(path) }
      }
      try {
        return { path, kind: 'dirents', entries: await readdir(path, { withFileTypes: true }) }
      } catch (error) {
        const fatal = toReadableIoError(error)
        if (fatal !== error) throw fatal
        return { path, kind: 'failure', reason: readableFailure('目录', error, path).message }
      }
    }
  )

  interface StatTask {
    readonly slot: number
    readonly entry: Dirent
  }
  const tasks: StatTask[] = []
  readSlots.forEach((slot, index) => {
    if (slot.kind !== 'dirents') return
    for (const entry of slot.entries) tasks.push({ slot: index, entry })
  })

  const inspected = await mapWithLimit(tasks, { concurrency: statConcurrency }, async (task) => {
    const slot = readSlots[task.slot]
    if (slot.kind !== 'dirents') throw new Error('Unreachable: stat task without a listing.')
    return inspectEntry(join(slot.path, task.entry.name), task.entry, lstatFile)
  })

  const entriesBySlot = readSlots.map(() => [] as DirectoryEntry[])
  tasks.forEach((task, index) => {
    entriesBySlot[task.slot].push(inspected[index])
  })

  return readSlots.map((slot, index): DirectoryListing => {
    if (slot.kind === 'failure') return { path: slot.path, ok: false, reason: slot.reason }
    const entries = slot.kind === 'sample' ? slot.entries : entriesBySlot[index]
    return { path: slot.path, ok: true, entries }
  })
}

async function listDirectory(path: string): Promise<DirectoryEntry[]> {
  const [listing] = await listDirectories([path])
  if (!listing.ok) throw new Error(listing.reason)
  return [...listing.entries]
}

async function readLocalTextFile(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    throw readableFailure('文件', error, path)
  }
}

/** The minimal read-stream surface the digest owns and can destroy. */
export interface DigestReadStream extends AsyncIterable<Buffer> {
  destroy(error?: Error): void
}

/** Test seam replacing `createReadStream`; defaults to `node:fs`. */
export type DigestStreamFactory = (path: string) => DigestReadStream

/** In-flight read streams of one digest operation. */
interface DigestOperation {
  cancelled: boolean
  readonly streams: Set<DigestReadStream>
}

const digestOperations = new Map<string, DigestOperation>()
let activeDigestStreams = 0

/**
 * Live raw-byte read streams across every digest operation. Cancelling must
 * drive this back to zero: a leaked handle would hit `EMFILE` on the next run.
 */
export function activeDigestStreamCount(): number {
  return activeDigestStreams
}

/**
 * Live entries of the digest operation registry. A settled call — completed,
 * failed or cancelled — releases its entry, so a leaked cancellation is visible
 * here rather than only as a later `EMFILE`.
 */
export function digestOperationCount(): number {
  return digestOperations.size
}

/** Reads the live cancellation flag; never narrowed away by the compiler. */
function isOperationCancelled(operation: DigestOperation | undefined): boolean {
  return operation !== undefined && operation.cancelled
}

function registerDigestOperation(operationId: string): DigestOperation {
  const existing = digestOperations.get(operationId)
  if (existing !== undefined) return existing
  const operation: DigestOperation = { cancelled: false, streams: new Set() }
  digestOperations.set(operationId, operation)
  return operation
}

/**
 * Cancels every in-flight stream registered under `operationId`. Unknown and
 * repeated ids resolve harmlessly; the owning `digestFiles` call settles as a
 * structured cancellation instead of returning partial slots.
 */
export async function cancelOperation(operationId: string): Promise<void> {
  const operation = digestOperations.get(operationId)
  if (operation === undefined) return
  operation.cancelled = true
  for (const stream of [...operation.streams]) {
    stream.destroy(new OperationCancelledError())
  }
}

/**
 * Streams one file's raw bytes through SHA-256. The bytes are never decoded as
 * text, so invalid UTF-8 stays distinguishable; one handle is held per file and
 * the caller bounds how many files stream at once. With an operation attached
 * the stream is registered so `cancelOperation` can destroy it mid-read.
 */
async function digestLocalFile(
  path: string,
  operation: DigestOperation | undefined,
  streamFactory: DigestStreamFactory
): Promise<FileDigestSuccess> {
  if (isOperationCancelled(operation)) throw new OperationCancelledError()
  const hash = createHash('sha256')
  const stream = streamFactory(path)
  let bytes = 0

  if (operation !== undefined) {
    operation.streams.add(stream)
    activeDigestStreams += 1
    // Cancellation may have raced the registration: kill this handle at once.
    if (isOperationCancelled(operation)) stream.destroy(new OperationCancelledError())
  }

  try {
    for await (const chunk of stream) {
      const buffer = chunk
      bytes += buffer.length
      hash.update(buffer)
    }
  } catch (error) {
    if (isOperationCancelled(operation)) throw new OperationCancelledError()
    throw error
  } finally {
    if (operation !== undefined) {
      operation.streams.delete(stream)
      activeDigestStreams -= 1
    }
    stream.destroy()
  }

  if (isOperationCancelled(operation)) throw new OperationCancelledError()
  return { path, ok: true, sha256: hash.digest('hex'), bytes }
}

/** Digests the UTF-8 bytes of a built-in sample, which is text by definition. */
function digestSampleFile(path: string): FileDigestSuccess {
  const text = SAMPLE_FILES.get(path)
  if (text === undefined) throw new Error(`No such sample file: ${path}`)
  const bytes = Buffer.from(text, 'utf8')
  return {
    path,
    ok: true,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length
  }
}

/** Local digest options: the shared contract plus the injectable stream seam. */
export interface LocalDigestFilesOptions extends DigestFilesOptions {
  /** Test seam replacing `createReadStream`; defaults to `node:fs`. */
  readonly streamFactory?: DigestStreamFactory
}

/**
 * Digests a batch of files' raw bytes in input order. A readable failure only
 * fails that one item — one unreadable file must not cost the whole comparison —
 * while descriptor exhaustion still rejects, since it would fail every read.
 *
 * With an `operationId` the call registers its in-flight streams, so
 * `cancelOperation` can destroy them and make the whole batch settle as
 * `{ cancelled: true }` instead of returning partial slots; the registry entry
 * is always released afterwards.
 */
export async function digestFiles(
  paths: readonly string[],
  options: LocalDigestFilesOptions = {}
): Promise<DigestFilesResult> {
  const operationId = options.operationId
  const operation = operationId === undefined ? undefined : registerDigestOperation(operationId)
  if (isOperationCancelled(operation)) return { cancelled: true }

  const streamFactory = options.streamFactory ?? ((path: string) => createReadStream(path))
  try {
    return await mapWithLimit(paths, options, async (path): Promise<FileDigest> => {
      if (isOperationCancelled(operation)) throw new OperationCancelledError()
      try {
        return isSamplePath(path)
          ? digestSampleFile(path)
          : await digestLocalFile(path, operation, streamFactory)
      } catch (error) {
        if (error instanceof OperationCancelledError || isOperationCancelled(operation)) {
          throw new OperationCancelledError()
        }
        const code = errorCode(error)
        if (code === 'EMFILE' || code === 'ENFILE') throw toReadableIoError(error)
        return { path, ok: false, reason: readableFailure('文件', error, path).message }
      }
    })
  } catch (error) {
    // Cancellation never rejects across the platform / IPC boundary.
    if (error instanceof OperationCancelledError) return { cancelled: true }
    throw error
  } finally {
    if (operationId !== undefined) digestOperations.delete(operationId)
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function isMissingError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

/**
 * `file` / `directory` / `missing` probe. Absence is a normal answer; any other
 * failure (permissions, I/O) rejects so the caller can report it as unreadable.
 * Exported because the launch intake probes with the very same implementation.
 */
export async function statPath(path: string): Promise<PathProbeKind> {
  if (isSamplePath(path)) {
    if (SAMPLE_FILES.has(path)) return 'file'
    if (path === SAMPLE_ROOT) return 'directory'
    const prefix = `${path}/`
    return SAMPLE_FIXTURE_FILES.some((file) => file.path.startsWith(prefix))
      ? 'directory'
      : 'missing'
  }
  try {
    const info = await stat(path)
    return info.isDirectory() ? 'directory' : 'file'
  } catch (error) {
    if (isMissingError(error)) return 'missing'
    throw error
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

/**
 * Real form of each path, in input order. The sample mount has no on-disk
 * counterpart and every unreadable path falls back to its input, so the answer
 * is always the same length as the request.
 */
async function resolveRealpaths(paths: readonly string[]): Promise<readonly string[]> {
  return Promise.all(
    paths.map(async (path) => {
      if (isSamplePath(path)) return path
      try {
        return await realpath(path)
      } catch {
        return path
      }
    })
  )
}

/** Single settings file under `userData`; there is no second storage slot. */
const USER_SETTINGS_FILE = 'settings.json'

function userSettingsPath(): string {
  return join(app.getPath('userData'), USER_SETTINGS_FILE)
}

/**
 * Reads the persisted settings. Missing file, unreadable file, corrupt JSON and
 * an unsupported language all read as "no record": a broken settings file must
 * never make the app fail to start.
 */
async function readUserSettings(): Promise<UserSettings | null> {
  try {
    return parseUserSettingsJson(await readFile(userSettingsPath(), 'utf8'))
  } catch {
    return null
  }
}

/**
 * Writes the settings atomically: a temporary file in the same directory is
 * renamed over the target, so a crash mid-write leaves the previous record
 * intact. Only a failed write rejects; nothing else is written.
 */
async function writeUserSettings(settings: UserSettings): Promise<void> {
  const target = userSettingsPath()
  await mkdir(dirname(target), { recursive: true })
  await writeFileAtomically(target, JSON.stringify(settings))
}

/** The OS locale exactly as Electron reports it; never truncated or remapped. */
function systemLocale(): string {
  return app.getLocale()
}

/** Hooks the launch bootstrap needs from the IPC layer. */
export interface PlatformIpcOptions {
  /** Called when the renderer announces its launch-request subscription. */
  readonly onCompareRequestsReady?: () => void
  /**
   * Test seam: replaces the digest read streams, so a gate can hold a real read
   * in flight and cancel it deterministically.
   */
  readonly digestStreamFactory?: DigestStreamFactory
}

/** Registers the native PlatformPort handlers backed by the local file system. */
export function registerPlatformIpc(options: PlatformIpcOptions = {}): void {
  const digestStreamFactory = options.digestStreamFactory
  ipcMain.handle(PLATFORM_CHANNELS.compareRequestsReady, () => {
    options.onCompareRequestsReady?.()
  })
  ipcMain.handle(PLATFORM_CHANNELS.homeDirectory, () => app.getPath('home'))
  ipcMain.handle(PLATFORM_CHANNELS.workingDirectory, () => process.cwd())
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
  ipcMain.handle(
    PLATFORM_CHANNELS.listDirectories,
    (_event, paths: unknown, options: unknown) =>
      listDirectories(parsePathArray(paths, 'directory'), parseConcurrencyOptions(options))
  )
  ipcMain.handle(
    PLATFORM_CHANNELS.digestFiles,
    async (_event, paths: unknown, rawOptions: unknown) => {
      const request = parseDigestOptions(rawOptions)
      const local: LocalDigestFilesOptions =
        digestStreamFactory === undefined
          ? request
          : { ...request, streamFactory: digestStreamFactory }
      try {
        return await digestFiles(parsePathArray(paths, 'file'), local)
      } catch (error) {
        // Defensive second layer: a cancellation leaked from the core still must
        // not reject across `ipcMain.handle` and land in the main-process stderr.
        if (error instanceof OperationCancelledError) return { cancelled: true }
        throw error
      }
    }
  )
  ipcMain.handle(PLATFORM_CHANNELS.cancelOperation, (_event, operationId: unknown) => {
    if (typeof operationId !== 'string' || operationId.length === 0) return
    return cancelOperation(operationId)
  })
  ipcMain.handle(PLATFORM_CHANNELS.readTextFile, (_event, path: unknown) => {
    const target = assertPath(path)
    if (!isSamplePath(target)) return readLocalTextFile(target)
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
  ipcMain.handle(PLATFORM_CHANNELS.statPath, (_event, path: unknown) =>
    statPath(assertPath(path))
  )
  ipcMain.handle(PLATFORM_CHANNELS.ensureDirectory, (_event, path: unknown) => {
    const target = assertPath(path)
    if (isSamplePath(target)) return undefined
    return mkdir(target, { recursive: true })
  })
  ipcMain.handle(PLATFORM_CHANNELS.deleteFile, (_event, path: unknown) =>
    rm(assertWritable(assertPath(path)))
  )
  ipcMain.handle(PLATFORM_CHANNELS.temporaryDirectory, () => temporaryDirectory())
  ipcMain.handle(PLATFORM_CHANNELS.realpath, (_event, paths: unknown) =>
    resolveRealpaths(parsePathArray(paths, 'path'))
  )
  // Settings arrive over IPC, so the payload is validated before it is written;
  // only this one write rejects, and a bad record never reaches the disk.
  ipcMain.handle(PLATFORM_CHANNELS.readUserSettings, () => readUserSettings())
  ipcMain.handle(PLATFORM_CHANNELS.writeUserSettings, (_event, settings: unknown) => {
    const parsed = parseUserSettings(settings)
    if (parsed === null) throw new TypeError('Expected user settings with a supported language.')
    return writeUserSettings(parsed)
  })
  ipcMain.handle(PLATFORM_CHANNELS.systemLocale, () => systemLocale())
}
