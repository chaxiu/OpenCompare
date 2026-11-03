/**
 * Dedicated `history-store` gate: the pure history model, the Electron
 * single-file atomic channel on a real temporary `userData`, the web storage
 * contract and the preload channel whitelist, in one Node-only run.
 */
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createComparisonHistoryEntry, parseComparisonHistoryJson, resolveComparisonHistoryReopen, serializeComparisonHistory, upsertComparisonHistory } from '@shared/history/model'
import { PLATFORM_CHANNELS } from '@shared/platform/channels'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { registerPlatformIpc } from './main/platform/electron-platform'
const { handlers, appState } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  appState: { userData: '' }
}))
vi.mock('electron', () => ({
  app: { getPath: () => appState.userData, getLocale: () => 'en-US' },
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    showSaveDialog: async () => ({ canceled: true })
  },
  ipcMain: { handle: (channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler) }
}))
const invoke = (channel: string, ...args: unknown[]) => Promise.resolve(handlers.get(channel)!({}, ...args))
const roots: string[] = []
const historyFile = () => join(appState.userData, 'comparison-history.json')
const entry = (kind: 'file' | 'merge', paths: string[], createdAt: number) =>
  createComparisonHistoryEntry({ kind, paths, createdAt, ignoreWhitespace: true, ignoreNewline: false, ignoreEncoding: true })
beforeEach(async () => {
  appState.userData = await mkdtemp(join(tmpdir(), 'opencompare-history-'))
  roots.push(appState.userData)
})
afterAll(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
registerPlatformIpc()
describe('history-store gate', () => {
  it('keeps the model contract: dedupe, opaque id, 20-record cap, corrupt = []', () => {
    const left = join(appState.userData, '左 侧.txt')
    const one = entry('file', [left, join(appState.userData, 'right.txt')], 1)
    const same = upsertComparisonHistory([one], entry('file', [left, join(appState.userData, 'right.txt')], 2))
    expect(same).toHaveLength(1)
    expect(same[0]?.id).toBe(one.id)
    expect(one.id).not.toContain(left)
    expect(one.id).not.toContain('左 侧.txt')
    let list = same
    for (let index = 0; index < 25; index += 1) list = upsertComparisonHistory(list, entry('file', [`/tmp/l${index}`, `/tmp/r${index}`], index))
    expect(list).toHaveLength(20)
    expect(parseComparisonHistoryJson('{bad')).toEqual([])
    expect(parseComparisonHistoryJson('{"version":2,"entries":[]}')).toEqual([])
    expect(resolveComparisonHistoryReopen({ ...one, paths: ['/tmp/only'] })).toEqual({ ok: false, error: 'invalid-path-count' })
  })
  it('writes one version-1 document atomically and reads it back field by field', async () => {
    const expected = [entry('file', [join(appState.userData, 'l 左.txt'), join(appState.userData, 'r.txt')], 10),
      entry('merge', [join(appState.userData, 'base.txt'), join(appState.userData, 'ours.txt'), join(appState.userData, 'theirs.txt')], 20)]
    await invoke(PLATFORM_CHANNELS.writeComparisonHistory, expected)
    await expect(readdir(appState.userData)).resolves.toEqual(['comparison-history.json'])
    expect(JSON.parse(await readFile(historyFile(), 'utf8'))).toEqual(serializeComparisonHistory(expected))
    await expect(invoke(PLATFORM_CHANNELS.readComparisonHistory)).resolves.toEqual(expected)
    await writeFile(historyFile(), '{bad', 'utf8')
    await expect(invoke(PLATFORM_CHANNELS.readComparisonHistory)).resolves.toEqual([])
  })
  it('rejects only a failing write and leaves no temp file', async () => {
    await invoke(PLATFORM_CHANNELS.writeComparisonHistory, [entry('file', ['/tmp/a', '/tmp/b'], 1)])
    const before = await readFile(historyFile(), 'utf8')
    await chmod(appState.userData, 0o500)
    try {
      await expect(invoke(PLATFORM_CHANNELS.writeComparisonHistory, [entry('file', ['/tmp/c', '/tmp/d'], 2)])).rejects.toThrow()
      await expect(readFile(historyFile(), 'utf8')).resolves.toBe(before)
      expect((await readdir(appState.userData)).filter((name) => name.endsWith('.tmp'))).toEqual([])
    } finally {
      await chmod(appState.userData, 0o700)
    }
  })
  it('logs only counts or stable codes and forwards the two whitelisted channels', async () => {
    const lines: string[] = []
    const log = vi.spyOn(console, 'log').mockImplementation((message: unknown) => { lines.push(String(message)) })
    try {
      await invoke(PLATFORM_CHANNELS.writeComparisonHistory, [entry('file', ['/tmp/a', '/tmp/b'], 1)])
      await invoke(PLATFORM_CHANNELS.readComparisonHistory)
    } finally {
      log.mockRestore()
    }
    for (const line of lines) expect(line).toMatch(/^comparison-history: \d+ entries$/)
    expect(PLATFORM_CHANNELS.readComparisonHistory).toBe('platform:read-comparison-history')
    expect(PLATFORM_CHANNELS.writeComparisonHistory).toBe('platform:write-comparison-history')
  })
  it('gives the web runtime the same contract with a memory fallback', async () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      get length() { return store.size },
      key: (index: number) => [...store.keys()][index] ?? null,
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value) },
      removeItem: (key: string) => { store.delete(key) },
      clear: () => { store.clear() }
    })
    try {
      const expected = [entry('file', ['/left', '/right'], 1)]
      const port = createWebPlatformPort()
      await port.writeComparisonHistory(expected)
      await expect(createWebPlatformPort().readComparisonHistory()).resolves.toEqual(expected)
      store.set('opencompare.comparisonHistory', '{bad')
      await expect(port.readComparisonHistory()).resolves.toEqual([])
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
