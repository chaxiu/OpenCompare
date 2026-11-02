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
import { lutimes, mkdir, mkdtemp, readFile, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { PlatformPort } from '@shared/platform/types'
import type { SyncPlan } from '@core/directory/sync'
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
