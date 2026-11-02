/**
 * Shared test harness for the two first-party suites that drive the real
 * workbench / real temporary disks: the jsdom `App.test.tsx` suite and the node
 * `sync-real-gate.test.ts` gate.
 *
 * It only holds setup, render/event helpers, column queries and assertion
 * wrappers. Nothing at module scope touches `document`, `window` or Electron,
 * so the same file imports safely in both environments.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect } from 'vitest'
import { lutimes, mkdir, mkdtemp, readFile, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { PLATFORM_CHANNELS } from '@shared/platform/channels'
import type {
  DigestFilesResult,
  DirectoryEntry,
  DirectoryListing,
  PathProbeKind,
  PlatformPort,
  TextFileProbe,
  UserSettings
} from '@shared/platform/types'
import type { SyncPlan } from '@core/directory/sync'
import type { EncodingLabel, NewlineKind } from '@core/text/probe'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { Workbench } from '@renderer/workbench/Workbench'

/* ------------------------------------------------------------------ */
/* Workbench rendering and platform fixtures                           */
/* ------------------------------------------------------------------ */

export interface PortScript {
  /** Answers of the successive `selectFile` calls; `undefined` cancels. */
  readonly files?: readonly string[]
  /** Answers of the successive `selectDirectory` calls; `undefined` cancels. */
  readonly directories?: readonly string[]
  /** Paths resolved for the successive dropped handles. */
  readonly dropped?: readonly string[]
}

/** Mounts the workbench on one scripted port. */
export function mountWorkbench(port: PlatformPort, showDebugSamples = false) {
  return render(<Workbench platform={port} showDebugSamples={showDebugSamples} />)
}

/** Memory PlatformPort with scripted picker answers and dropped paths. */
export function scriptedPort(script: PortScript, base: PlatformPort = createWebPlatformPort()): PlatformPort {
  const files = [...(script.files ?? [])]
  const directories = [...(script.directories ?? [])]
  const dropped = [...(script.dropped ?? [])]
  return {
    ...base,
    selectFile: async () => files.shift() ?? null,
    selectDirectory: async () => directories.shift() ?? null,
    resolveDroppedPath: async () => dropped.shift() ?? '',
  }
}

/** Files of the real external template trees the new entry tests drive. */
export const EXTERNAL_TEMPLATE_FILES: Readonly<Record<string, string>> = {
  '/ext/a/src/core/strings.ts': 'export const text = "same"\n',
  '/ext/a/src/core/engine.ts': 'export const engine = 1\n',
  '/ext/b/misc/deep/strings.ts': 'export const text = "same"\n',
  '/ext/b/other/engine.ts': 'export const engine = 1\n',
  '/ext/b/zbak/unused.ts': 'unused\n',
  '/ext/out/src/core/engine.ts': 'stale engine\n',
}

/** Memory PlatformPort seeded with real external template / output roots. */
export async function templatePort(script: PortScript): Promise<PlatformPort> {
  const base = createWebPlatformPort()
  for (const [path, text] of Object.entries(EXTERNAL_TEMPLATE_FILES)) {
    await base.writeTextFile(path, text)
  }
  return scriptedPort(script, base)
}

/** Writes in-memory files, creating their directories on the web port. */
export async function memoryPort(files: readonly (readonly [string, string])[]): Promise<PlatformPort> {
  const port = createWebPlatformPort()
  for (const [path, text] of files) await port.writeTextFile(path, text)
  return port
}

/** Writes one in-memory file per path so the manual entry can probe it. */
export async function writeFiles(platform: PlatformPort, files: readonly (readonly [string, string])[]): Promise<void> {
  for (const [path, text] of files) await platform.writeTextFile(path, text)
}

/* ------------------------------------------------------------------ */
/* Event dispatch and DOM queries                                      */
/* ------------------------------------------------------------------ */

/** Clicks the first button with this accessible name. */
export function clickControl(name: string | RegExp): void {
  fireEvent.click(screen.getByRole('button', { name }))
}

/** Waits for the tab with this name and returns it. */
export function waitForTab(name: string | RegExp): Promise<HTMLElement> {
  return screen.findByRole('tab', { name }, { timeout: 4000 })
}

/** Mounts the workbench, opens a file pair and returns its session tab. */
export async function openFilePair(port: PlatformPort, name: string | RegExp): Promise<HTMLElement> {
  mountWorkbench(port)
  clickControl('打开文件')
  return waitForTab(name)
}

/** Mounts the workbench, opens a directory pair and returns its session tab. */
export async function openDirectoryPair(port: PlatformPort, name: string | RegExp): Promise<HTMLElement> {
  mountWorkbench(port)
  clickControl('打开文件夹')
  return waitForTab(name)
}

/** Opens another file pair on the already mounted workbench. */
export async function openAnotherFile(name: string | RegExp): Promise<HTMLElement> {
  clickControl('打开文件')
  return waitForTab(name)
}

/** Opens another directory pair on the already mounted workbench. */
export async function openAnotherDirectory(name: string | RegExp): Promise<HTMLElement> {
  clickControl('打开文件夹')
  return waitForTab(name)
}

/** The session tablist. */
export function sessionTabs(): HTMLElement {
  return screen.getByRole('tablist', { name: '会话' })
}

/** One session tab by accessible name. */
export function sessionTab(name: string | RegExp): HTMLElement {
  return within(sessionTabs()).getByRole('tab', { name })
}

/** Every session tab, in order. */
export function sessionTabRows(): HTMLElement[] {
  return within(sessionTabs()).getAllByRole('tab')
}

/** Number of open sessions, zero when the workbench is empty. */
export function sessionTabCount(): number {
  const list = screen.queryByRole('tablist', { name: '会话' })
  return list ? within(list).getAllByRole('tab').length : 0
}

/** Status-bar text of the active surface. */
export function statusText(): string {
  return screen.getByRole('contentinfo').textContent ?? ''
}

/** Dispatches a file drop whose handles resolve to `paths`. */
export function dropPaths(element: HTMLElement, paths: readonly string[]): boolean {
  const files = paths.map((path) => new File([''], path.slice(path.lastIndexOf('/') + 1)))
  return fireEvent.drop(element, { dataTransfer: { files, types: ['Files'] } })
}

/** Both pane trees share the merged root's accessible name; index them. */
export function paneTree(side: 0 | 1): HTMLElement {
  return screen.getAllByRole('tree')[side]
}

/** Row titles of the left tree pane, in render order. */
export function treeRowTitles(): string[] {
  return within(paneTree(0))
    .getAllByRole('treeitem')
    .map((row) => row.getAttribute('title') ?? '')
}

/** Clicks「打开文件」inside the「新建对比」dialog and returns the dialog. */
export function openCompareDialog(): HTMLElement {
  fireEvent.click(screen.getAllByRole('button', { name: '新建对比' })[0])
  return screen.getByRole('dialog', { name: '新建对比' })
}

/** Fills both path inputs of the「新建对比」dialog. */
export function fillComparePaths(left: string, right: string): void {
  const panel = screen.getByRole('dialog', { name: '新建对比' })
  fireEvent.change(within(panel).getByLabelText('左侧路径'), { target: { value: left } })
  fireEvent.change(within(panel).getByLabelText('右侧路径'), { target: { value: right } })
}

/** Submits the「新建对比」dialog. */
export function submitCompare(): void {
  fireEvent.click(
    within(screen.getByRole('dialog', { name: '新建对比' })).getByRole('button', {
      name: '建立对比',
    })
  )
}

/** Submits one pair through the「新建对比」dialog, as a user would. */
export function submitComparePair(left: string, right: string): void {
  openCompareDialog()
  fillComparePaths(left, right)
  submitCompare()
}

/* ------------------------------------------------------------------ */
/* Real temporary-disk scaffolding (node environment)                  */
/* ------------------------------------------------------------------ */

const scratchRoots: string[] = []

/** A fresh real temp directory, cleaned up by `releaseScratchRoots`. */
export async function scratchRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'opencompare-sync-real-'))
  scratchRoots.push(root)
  return root
}

/** A real temp pair with both sides created, plus the shared root. */
export async function scratchSides(): Promise<{
  readonly root: string
  readonly left: string
  readonly right: string
}> {
  const root = await scratchRoot()
  const left = join(root, 'left')
  const right = join(root, 'right')
  await mkdir(left, { recursive: true })
  await mkdir(right, { recursive: true })
  return { root, left, right }
}

/** Removes every temp root created through `scratchRoot`. */
export async function releaseScratchRoots(): Promise<void> {
  await Promise.all(scratchRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
}

/** Writes one file with a whole-millisecond mtime. */
export async function writeStamped(path: string, text: string, stampMs: number): Promise<void> {
  await writeFile(path, text, 'utf8')
  await utimes(path, new Date(stampMs), new Date(stampMs))
}

/** Writes raw bytes with a whole-millisecond mtime, creating parents. */
export async function writeStampedBytes(path: string, bytes: Uint8Array, stampMs: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, bytes)
  await utimes(path, new Date(stampMs), new Date(stampMs))
}

/** Creates a symbolic link and stamps its own (lstat) mtime. */
export async function linkWithStamp(target: string, path: string, stampMs: number): Promise<void> {
  await symlink(target, path)
  const seconds = Math.floor(stampMs) / 1000 + 1e-6
  await lutimes(path, seconds, seconds)
}

/** Hex SHA-256 of raw bytes. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export interface FileFingerprint {
  readonly sha256: string
  readonly size: number
  readonly modifiedMs: number
}

/** Bytes + size + whole-ms mtime of one real file, to prove it was not touched. */
export async function fingerprint(path: string): Promise<FileFingerprint> {
  const info = await stat(path)
  return {
    sha256: sha256Hex(await readFile(path)),
    size: info.size,
    modifiedMs: Math.floor(info.mtimeMs),
  }
}

/**
 * Settles a promise the way the gate reads a rejected run: the error value, or
 * `undefined` when the run unexpectedly resolved.
 */
export function settle(promise: Promise<unknown>): Promise<unknown> {
  return promise.catch((reason: unknown) => reason)
}

/** The relative paths of a plan's mirror deletions. */
export function deletePathsOf(plan: Pick<SyncPlan, 'delete'>): string[] {
  return plan.delete.items.map((item) => item.relativePath)
}

/** In-process IPC port and the raw-byte text-probe fixtures both legs share. */

/** Renderer-side PlatformPort over an in-process IPC dispatcher. */
export function ipcPort(
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
): PlatformPort {
  return {
    kind: 'electron',
    homeDirectory: () => invoke(PLATFORM_CHANNELS.homeDirectory) as Promise<string>,
    workingDirectory: () => invoke(PLATFORM_CHANNELS.workingDirectory) as Promise<string>,
    selectDirectory: () => invoke(PLATFORM_CHANNELS.selectDirectory) as Promise<string | null>,
    selectFile: (options) => invoke(PLATFORM_CHANNELS.selectFile, options) as Promise<string | null>,
    resolveDroppedPath: async () => '',
    saveFile: (options) => invoke(PLATFORM_CHANNELS.saveFile, options) as Promise<string | null>,
    listDirectory: (path) => invoke(PLATFORM_CHANNELS.listDirectory, path) as Promise<DirectoryEntry[]>,
    listDirectories: (paths, options) => invoke(PLATFORM_CHANNELS.listDirectories, paths, options) as Promise<readonly DirectoryListing[]>,
    readTextFile: (path) => invoke(PLATFORM_CHANNELS.readTextFile, path) as Promise<string>,
    readFileBytes: (path) => invoke(PLATFORM_CHANNELS.readFileBytes, path) as Promise<Uint8Array>,
    probeTextFile: (path) => invoke(PLATFORM_CHANNELS.probeTextFile, path) as Promise<TextFileProbe>,
    writeFileBytes: (path, content, modifiedMs) => invoke(PLATFORM_CHANNELS.writeFileBytes, path, content, modifiedMs) as Promise<void>,
    setSymbolicLinkModifiedMs: (path, modifiedMs) => invoke(PLATFORM_CHANNELS.setSymbolicLinkModifiedMs, path, modifiedMs) as Promise<void>,
    readSymbolicLink: (path) => invoke(PLATFORM_CHANNELS.readSymbolicLink, path) as Promise<string>,
    createSymbolicLink: (target, path) => invoke(PLATFORM_CHANNELS.createSymbolicLink, target, path) as Promise<void>,
    digestFiles: (paths, options) => invoke(PLATFORM_CHANNELS.digestFiles, paths, options) as Promise<DigestFilesResult>,
    cancelOperation: (operationId) => invoke(PLATFORM_CHANNELS.cancelOperation, operationId) as Promise<void>,
    writeTextFile: (path, content, modifiedMs) => invoke(PLATFORM_CHANNELS.writeTextFile, path, content, modifiedMs) as Promise<void>,
    exists: (path) => invoke(PLATFORM_CHANNELS.exists, path) as Promise<boolean>,
    statPath: (path) => invoke(PLATFORM_CHANNELS.statPath, path) as Promise<PathProbeKind>,
    checkWritable: (path) => invoke(PLATFORM_CHANNELS.checkWritable, path) as Promise<void>,
    ensureDirectory: (path) => invoke(PLATFORM_CHANNELS.ensureDirectory, path) as Promise<void>,
    deleteFile: (path) => invoke(PLATFORM_CHANNELS.deleteFile, path) as Promise<void>,
    removeDirectory: (path) => invoke(PLATFORM_CHANNELS.removeDirectory, path) as Promise<void>,
    temporaryDirectory: () => invoke(PLATFORM_CHANNELS.temporaryDirectory) as Promise<string>,
    realpath: (paths) => invoke(PLATFORM_CHANNELS.realpath, paths) as Promise<readonly string[]>,
    readUserSettings: () => invoke(PLATFORM_CHANNELS.readUserSettings) as Promise<UserSettings | null>,
    writeUserSettings: (settings) => invoke(PLATFORM_CHANNELS.writeUserSettings, settings) as Promise<void>,
    systemLocale: () => invoke(PLATFORM_CHANNELS.systemLocale) as Promise<string>
  }
}

/** One raw-byte text probe case, shared by the Electron and web legs. */
export interface TextProbeCase {
  readonly name: string
  /** Plain text the web memory runtime stores; `null` when it cannot hold the bytes. */
  readonly text: string | null
  /** Raw bytes the Electron probe reads from disk. */
  readonly bytes: Uint8Array
  readonly encoding: EncodingLabel
  readonly newline: NewlineKind
  readonly decoded: string
}

const textEncoder = new TextEncoder()

function hexBytes(hex: string): Uint8Array {
  return Uint8Array.from(hex.trim().split(/\s+/).map((byte) => Number.parseInt(byte, 16)))
}

function utf16Bytes(text: string, endianness: 'le' | 'be'): Uint8Array {
  const bytes: number[] = []
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (endianness === 'le') bytes.push(code & 0xff, (code >> 8) & 0xff)
    else bytes.push((code >> 8) & 0xff, code & 0xff)
  }
  return Uint8Array.from(bytes)
}

function joinBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.length
  }
  return bytes
}

/** The encodings / newline styles the probe pins on both runtime legs. */
export const TEXT_PROBE_CASES: readonly TextProbeCase[] = [
  { name: 'utf8-crlf.txt', text: 'alpha\r\nbeta\r\n', bytes: textEncoder.encode('alpha\r\nbeta\r\n'), encoding: 'UTF-8', newline: 'CRLF', decoded: 'alpha\r\nbeta\r\n' },
  { name: 'utf8-bom-lf.txt', text: '\ufeffalpha\nbeta\n', bytes: joinBytes(hexBytes('EF BB BF'), textEncoder.encode('alpha\nbeta\n')), encoding: 'UTF-8 BOM', newline: 'LF', decoded: 'alpha\nbeta\n' },
  { name: 'utf16le-crlf.txt', text: null, bytes: joinBytes(hexBytes('FF FE'), utf16Bytes('alpha\r\nbeta\r\n', 'le')), encoding: 'UTF-16LE', newline: 'CRLF', decoded: 'alpha\r\nbeta\r\n' },
  { name: 'gbk-lf.txt', text: null, bytes: hexBytes('D6 D0 CE C4 0A'), encoding: 'GBK', newline: 'LF', decoded: '中文\n' }
]

/** Asserts every probe fact of one shared case against its own raw bytes. */
export function expectTextProbeFacts(
  probe: TextFileProbe,
  expected: TextProbeCase,
  path: string
): void {
  expect(probe.path).toBe(path)
  expect(probe.encoding).toBe(expected.encoding)
  expect(probe.newline).toBe(expected.newline)
  expect(probe.text).toBe(expected.decoded)
  expect(probe.bytes).toBe(expected.bytes.length)
  expect(probe.sha256).toBe(sha256Hex(expected.bytes))
}
