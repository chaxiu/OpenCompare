/**
 * Cancel gate: proves that a real directory / digest cancellation settles as a
 * structured result, produces **zero** main-process stderr noise and leaves no
 * live read stream or digest registry entry behind.
 *
 * Everything here is real: real temporary directories, real files and real
 * `fs.ReadStream` handles. Only the moment a read is in flight is controlled by
 * a gated stream factory, so the gate is deterministic instead of racing a
 * large file. The dispatch shim mimics Electron's `ipcMain.handle` semantics —
 * including the `Error occurred in handler for '<channel>': …` line it prints
 * when a handler rejects — and a self-proof case shows that this capture chain
 * actually notices a rejecting handler.
 */
import { createReadStream } from 'node:fs'
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  activeDigestStreamCount,
  cancelOperation,
  digestFiles,
  digestOperationCount,
  registerPlatformIpc
} from './main/platform/electron-platform'
import type { DigestReadStream } from './main/platform/electron-platform'
import { compareDirectories, createComparisonCache, scanDirectory } from '@core/directory/compare'
import { OperationCancelledError } from '@core/io'
import { unwrapDigestResult } from '@renderer/platform'
import { PLATFORM_CHANNELS } from '@shared/platform/channels'
import type { DirectoryListing } from '@shared/platform/types'

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>()
}))

vi.mock('electron', () => ({
  app: { getPath: () => tmpdir() },
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    showSaveDialog: async () => ({ canceled: true, filePath: undefined })
  },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }
  }
}))

const FORBIDDEN = ['Error occurred in handler', 'OperationCancelledError', 'ECANCELED'] as const

interface Deferred {
  readonly promise: Promise<void>
  resolve(): void
}

function deferred(): Deferred {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, resolve: () => release() }
}

/**
 * The "current" gate: a stream factory shared with the registered handler. Only
 * paths matching `match` wait on it; everything else streams from disk at once.
 */
interface StreamGate {
  readonly gate: Deferred
  readonly match: (path: string) => boolean
}

let streamGate: StreamGate | null = null

/** A real file stream whose first chunk waits for `gate`; destroy releases it. */
function gatedRealStream(path: string, gate: Deferred): DigestReadStream {
  const inner = createReadStream(path)
  let releaseDestroy!: () => void
  const destroyed = new Promise<void>((resolve) => {
    releaseDestroy = resolve
  })
  let destroyError: Error | undefined
  return {
    async *[Symbol.asyncIterator](): AsyncGenerator<Buffer, void, unknown> {
      await Promise.race([gate.promise, destroyed])
      if (destroyError !== undefined) throw destroyError
      for await (const chunk of inner) yield chunk as Buffer
    },
    destroy(error?: Error): void {
      destroyError = error
      releaseDestroy()
      inner.destroy()
    }
  }
}

function gateStreamFactory(path: string): DigestReadStream {
  if (streamGate !== null && streamGate.match(path)) {
    return gatedRealStream(path, streamGate.gate)
  }
  return createReadStream(path)
}

/**
 * Mimics `ipcMain.handle` dispatch: a rejected handler is logged to stderr in
 * Electron's shape before the invoke rejects. Resolved handlers log nothing.
 */
function dispatch(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = handlers.get(channel)
  if (handler === undefined) return Promise.reject(new Error(`No handler for ${channel}`))
  return Promise.resolve()
    .then(() => handler({}, ...args))
    .catch((error: unknown) => {
      process.stderr.write(`Error occurred in handler for '${channel}': ${String(error)}\n`)
      throw error
    })
}

interface StderrCapture {
  stop(): string
}

function captureStderr(): StderrCapture {
  const chunks: string[] = []
  const original = process.stderr.write.bind(process.stderr)
  process.stderr.write = ((chunk: unknown) => {
    chunks.push(String(chunk))
    return true
  }) as typeof process.stderr.write
  return {
    stop: () => {
      process.stderr.write = original
      return chunks.join('')
    }
  }
}

function forbiddenHits(stderr: string): string[] {
  return FORBIDDEN.filter((needle) => stderr.includes(needle))
}

async function waitUntil(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('timed out waiting for a condition')
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function stamp(path: string, ms: number): Promise<void> {
  await utimes(path, new Date(ms), new Date(ms))
}

const roots: string[] = []

async function scratchRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'opencompare-cancel-gate-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  streamGate = null
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

beforeAll(() => registerPlatformIpc({ digestStreamFactory: gateStreamFactory }))

describe('cancel gate', () => {
  it('self-proof: the shim surfaces a rejecting handler on stderr', async () => {
    handlers.set('gate:self-test', async () => {
      throw new Error('deliberate rejection')
    })

    const capture = captureStderr()
    const outcome = await dispatch('gate:self-test').then(
      () => undefined,
      (error: unknown) => error
    )
    const stderr = capture.stop()

    expect(outcome).toBeInstanceOf(Error)
    expect(stderr).toContain("Error occurred in handler for 'gate:self-test'")
    expect(stderr).toContain('deliberate rejection')
    handlers.delete('gate:self-test')
  })

  it('scan cancellation stops new listings with zero stderr noise', async () => {
    const root = await scratchRoot()
    const left = join(root, 'left')
    await mkdir(join(left, 'nested'), { recursive: true })
    await writeFile(join(left, 'a.txt'), 'a')
    await writeFile(join(left, 'nested', 'b.txt'), 'b')

    const gate = deferred()
    const controller = new AbortController()
    let scanCalls = 0
    const batched = async (paths: readonly string[]): Promise<readonly DirectoryListing[]> => {
      scanCalls += 1
      if (scanCalls === 1) await gate.promise
      return (await dispatch(PLATFORM_CHANNELS.listDirectories, paths)) as DirectoryListing[]
    }

    const capture = captureStderr()
    const scan = scanDirectory(left, async () => [], {
      listDirectories: batched,
      concurrency: 1,
      signal: controller.signal
    })

    await waitUntil(() => scanCalls === 1)
    controller.abort()
    gate.resolve()

    const error = await scan.then(
      () => undefined,
      (cause: unknown) => cause
    )
    const stderr = capture.stop()

    expect(error).toBeInstanceOf(OperationCancelledError)
    const callsAtCancel = scanCalls
    await delay(20)
    expect(scanCalls).toBe(callsAtCancel)
    expect(forbiddenHits(stderr)).toEqual([])
    expect(activeDigestStreamCount()).toBe(0)
    expect(digestOperationCount()).toBe(0)
  })

  it('digest cancellation fulfils the IPC handler with zero stderr noise', async () => {
    const root = await scratchRoot()
    const file = join(root, 'payload.bin')
    await writeFile(file, 'cancel me')

    const gate = deferred()
    streamGate = { gate, match: (path) => path === file }

    const capture = captureStderr()
    const pending = dispatch(PLATFORM_CHANNELS.digestFiles, [file], {
      operationId: 'gate-digest'
    })

    await waitUntil(() => activeDigestStreamCount() > 0)
    await cancelOperation('gate-digest')

    const result = await pending
    const stderr = capture.stop()

    expect(Array.isArray(result)).toBe(false)
    expect(result).toEqual({ cancelled: true })
    expect(forbiddenHits(stderr)).toEqual([])
    await delay(20)
    expect(activeDigestStreamCount()).toBe(0)
    expect(digestOperationCount()).toBe(0)
  })

  it('a cancelled second digest chunk never lands half a cache', async () => {
    const root = await scratchRoot()
    const left = join(root, 'left')
    const right = join(root, 'right')
    await mkdir(left, { recursive: true })
    await mkdir(right, { recursive: true })
    const pairs = [
      { name: 'a.txt', text: 'same-a' },
      { name: 'b.txt', text: 'same-b' }
    ]
    for (const pair of pairs) {
      await writeFile(join(left, pair.name), pair.text)
      await writeFile(join(right, pair.name), pair.text)
      await stamp(join(left, pair.name), 1_000_000)
      await stamp(join(right, pair.name), 1_000_000)
    }

    const list = () => Promise.resolve([]) // unused: every scan uses the batch seam below
    const listDirectories = async (paths: readonly string[]) =>
      (await dispatch(PLATFORM_CHANNELS.listDirectories, paths)) as readonly DirectoryListing[]
    const readTextFile = async (path: string) => {
      throw new Error(`unexpected text read of ${path}`)
    }

    const baseline = await compareDirectories(
      left,
      right,
      list,
      readTextFile,
      createComparisonCache(),
      undefined,
      {
        listDirectories,
        digestFiles: async (paths) =>
          unwrapDigestResult(await digestFiles(paths, { operationId: 'gate-baseline' }))
      }
    )

    const cache = createComparisonCache()
    const chunks: string[][] = []
    const gate = deferred()
    streamGate = { gate, match: (path) => path.endsWith('b.txt') }

    const cancelled = compareDirectories(
      left,
      right,
      list,
      readTextFile,
      cache,
      undefined,
      {
        listDirectories,
        digestBatchSize: 2,
        digestFiles: async (paths) => {
          chunks.push([...paths])
          return unwrapDigestResult(
            await digestFiles(paths, { operationId: 'gate-cache', streamFactory: gateStreamFactory })
          )
        }
      }
    )

    await waitUntil(() => chunks.length === 2 && activeDigestStreamCount() > 0)
    await cancelOperation('gate-cache')

    await expect(cancelled).rejects.toBeInstanceOf(OperationCancelledError)

    // Exactly the first chunk settled: every entry is complete and truthful.
    expect(chunks).toHaveLength(2)
    expect([...cache.hashes.keys()].sort()).toEqual([...chunks[0]].sort())
    for (const path of chunks[0]) {
      const entry = cache.hashes.get(path)
      expect(entry).toBeDefined()
      const text = pairs.find((pair) => path.endsWith(pair.name))?.text
      expect(entry?.hash).toBe(createHash('sha256').update(text ?? '').digest('hex'))
    }
    for (const path of chunks[1]) expect(cache.hashes.has(path)).toBe(false)

    await delay(20)
    expect(activeDigestStreamCount()).toBe(0)
    expect(digestOperationCount()).toBe(0)

    // A clean retry of the same real pair matches the pre-cancel baseline.
    const retried = await compareDirectories(
      left,
      right,
      list,
      readTextFile,
      createComparisonCache(),
      undefined,
      {
        listDirectories,
        digestFiles: async (paths) =>
          unwrapDigestResult(await digestFiles(paths, { operationId: 'gate-retry' }))
      }
    )
    expect(retried.counts).toEqual(baseline.counts)
    expect(retried.skipped).toBe(baseline.skipped)
    expect(digestOperationCount()).toBe(0)
  })
})
