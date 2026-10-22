/**
 * Memory gate (`pnpm test:memory`): the bounded digest cache and session
 * release are asserted on a real on-disk dataset, over several full rounds in
 * one process.
 *
 * Everything here is real file IO and real SHA-256 work: the dataset lives in
 * the system temp directory, is never one of the built-in fixtures, and is
 * removed when the suite ends. The judgement itself is pure
 * (`src/memory-gate.ts`), and its red path is tested with injected counters.
 */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DirectoryEntry, FileDigest } from '@shared/platform/types'
import type { ComparisonCache, DirectoryComparison, FileDiffStatus } from '@core/directory/compare'
import { compareDirectories, createComparisonCache } from '@core/directory/compare'
import { evaluateMemoryGate, resolveMemoryGateExitCode } from './memory-gate'
import type { MemoryGateRound } from './memory-gate'
import {
  createDirectorySession,
  releaseDirectoryComparison
} from '@renderer/workbench/directoryCompare'
import type { ComparisonSides } from '@renderer/workbench/snapshotOps'

const FILES_PER_SIDE = 2000
const FILE_BYTES = 10 * 1024
const MIN_FILES = 2000
const MIN_BYTES = 20 * 1024 * 1024
const FIXED_MTIME = new Date('2024-01-01T00:00:00.000Z')
const ROUNDS = 3

let temp: string
let leftRoot: string
let rightRoot: string

function relativePath(index: number): string {
  const bucket = String(Math.floor(index / 50)).padStart(2, '0')
  return join('d0', 'd1', `bucket-${bucket}`, `file-${String(index).padStart(5, '0')}.bin`)
}

function contentFor(index: number): Buffer {
  const buffer = Buffer.alloc(FILE_BYTES, 97 + (index % 23))
  buffer.write(`opencompare memory gate file=${index}\n`, 0, 'utf8')
  return buffer
}

async function writeFileAt(path: string, bytes: Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, bytes)
  await utimes(path, FIXED_MTIME, FIXED_MTIME)
}

/** Bounded fan-out so a few thousand writes never spike descriptor usage. */
async function inBatches(count: number, size: number, run: (index: number) => Promise<void>) {
  const indexes = Array.from({ length: count }, (_unused, index) => index)
  for (let start = 0; start < indexes.length; start += size) {
    await Promise.all(indexes.slice(start, start + size).map((index) => run(index)))
  }
}

/** Lists one real directory through `fs`, in the shape the engine consumes. */
async function listDirectory(path: string): Promise<readonly DirectoryEntry[]> {
  const dirents = await readdir(path, { withFileTypes: true })
  return Promise.all(
    dirents.map(async (dirent) => {
      const full = join(path, dirent.name)
      const info = await lstat(full)
      return {
        name: dirent.name,
        path: full,
        isDirectory: dirent.isDirectory(),
        size: dirent.isDirectory() ? 0 : info.size,
        modifiedMs: info.mtimeMs
      }
    })
  )
}

/** Real streaming SHA-256 digest, mirroring the platform capability's answer. */
async function digestFiles(paths: readonly string[]): Promise<readonly FileDigest[]> {
  return Promise.all(
    paths.map(async (path): Promise<FileDigest> => {
      try {
        const hash = createHash('sha256')
        let bytes = 0
        for await (const chunk of createReadStream(path)) {
          bytes += chunk.length
          hash.update(chunk)
        }
        return { path, ok: true, sha256: hash.digest('hex'), bytes }
      } catch (cause) {
        return { path, ok: false, reason: cause instanceof Error ? cause.message : String(cause) }
      }
    })
  )
}

function readTextFile(path: string): Promise<string> {
  return readFile(path, 'utf8')
}

interface RoundResult {
  readonly round: MemoryGateRound
  readonly comparison: DirectoryComparison
}

async function runRounds(cache: ComparisonCache, rounds: number): Promise<RoundResult[]> {
  const results: RoundResult[] = []
  for (let index = 1; index <= rounds; index += 1) {
    const digest = { files: 0, bytes: 0 }
    const comparison = await compareDirectories(
      leftRoot,
      rightRoot,
      listDirectory,
      readTextFile,
      cache,
      undefined,
      {
        digestFiles,
        digestBatchSize: 64,
        onDigestStats: (stats) => {
          digest.files += stats.files
          digest.bytes += stats.bytes
        }
      }
    )
    results.push({
      round: {
        index,
        stats: cache.stats,
        hashedFiles: digest.files,
        counts: comparison.counts
      },
      comparison
    })
  }
  return results
}

/** Every node's status by relative path, for a whole-tree comparison. */
function statusMap(comparison: DirectoryComparison): Record<string, FileDiffStatus> {
  const statuses: Record<string, FileDiffStatus> = {}
  const stack = [comparison.root]
  while (stack.length > 0) {
    const node = stack.pop() as DirectoryComparison['root']
    statuses[node.relativePath] = node.status
    for (const child of node.children) stack.push(child)
  }
  return statuses
}

async function datasetBytes(): Promise<number> {
  let total = 0
  async function walk(path: string): Promise<void> {
    const entries = await readdir(path, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(path, entry.name)
      if (entry.isDirectory()) await walk(full)
      else total += (await lstat(full)).size
    }
  }
  await walk(leftRoot)
  await walk(rightRoot)
  return total
}

beforeAll(async () => {
  temp = await mkdtemp(join(tmpdir(), 'opencompare-memory-gate-'))
  leftRoot = join(temp, 'left')
  rightRoot = join(temp, 'right')
  await mkdir(leftRoot, { recursive: true })
  await mkdir(rightRoot, { recursive: true })

  await inBatches(FILES_PER_SIDE, 64, async (index) => {
    const relative = relativePath(index)
    const base = contentFor(index)
    await writeFileAt(join(leftRoot, relative), base)
    // Every 25th pair keeps size and mtime identical but differs by one byte,
    // so the comparison must fall through to the real SHA-256 digest.
    const rightBytes = Buffer.from(base)
    if (index % 25 === 0) rightBytes[FILE_BYTES - 1] = rightBytes[FILE_BYTES - 1] ^ 0xff
    await writeFileAt(join(rightRoot, relative), rightBytes)
  })
  await writeFileAt(join(leftRoot, 'only-left.bin'), contentFor(FILES_PER_SIDE))
  await writeFileAt(join(rightRoot, 'only-right.bin'), contentFor(FILES_PER_SIDE + 1))
})

afterAll(async () => {
  if (temp !== undefined) await rm(temp, { recursive: true, force: true })
})

describe('memory gate judgement', () => {
  it('turns red on an over-budget or monotonically growing round series', () => {
    const stats = (entries: number, estimatedBytes: number) => ({
      entries,
      estimatedBytes,
      hits: 0,
      misses: 0,
      evictions: 0
    })
    const counts = { same: 1, added: 0, removed: 0, modified: 0 }
    const overBudget = evaluateMemoryGate({
      maxEntries: 2,
      maxBytes: 1_000,
      rounds: [
        { index: 1, stats: stats(3, 500), hashedFiles: 4, counts },
        { index: 2, stats: stats(3, 500), hashedFiles: 0, counts },
        { index: 3, stats: stats(3, 500), hashedFiles: 0, counts }
      ],
      releasedEntries: 0
    })
    expect(overBudget.ok).toBe(false)
    expect(overBudget.violations).toContain('cache-entries-over-limit')
    expect(resolveMemoryGateExitCode(overBudget)).toBe(1)

    const growing = evaluateMemoryGate({
      maxEntries: 10,
      maxBytes: 10_000,
      rounds: [
        { index: 1, stats: stats(2, 500), hashedFiles: 4, counts },
        { index: 2, stats: stats(2, 500), hashedFiles: 0, counts },
        { index: 3, stats: stats(3, 800), hashedFiles: 0, counts }
      ],
      releasedEntries: 0
    })
    expect(growing.ok).toBe(false)
    expect(growing.violations).toContain('round-entries-growth')
    expect(growing.violations).toContain('round-bytes-growth')
    expect(resolveMemoryGateExitCode(growing)).toBe(1)

    const leaking = evaluateMemoryGate({
      maxEntries: 10,
      maxBytes: 10_000,
      rounds: [
        { index: 1, stats: stats(2, 500), hashedFiles: 4, counts },
        { index: 2, stats: stats(2, 500), hashedFiles: 0, counts },
        { index: 3, stats: stats(2, 500), hashedFiles: 0, counts }
      ],
      releasedEntries: 2
    })
    expect(leaking.ok).toBe(false)
    expect(leaking.violations).toContain('session-release-leak')

    const tooFewRounds = evaluateMemoryGate({
      maxEntries: 10,
      maxBytes: 10_000,
      rounds: [{ index: 1, stats: stats(2, 500), hashedFiles: 4, counts }],
      releasedEntries: 0
    })
    expect(tooFewRounds.ok).toBe(false)
    expect(tooFewRounds.violations).toContain('round-count')
  })
})

describe('memory gate on a real dataset', () => {
  it('keeps the digest cache bounded and warm rounds flat over three rounds', async () => {
    const entries = await listDirectory(leftRoot)
    expect(entries.length).toBeGreaterThan(0)
    const bytes = await datasetBytes()
    expect(FILES_PER_SIDE * 2 + 2).toBeGreaterThanOrEqual(MIN_FILES)
    expect(bytes).toBeGreaterThanOrEqual(MIN_BYTES)
    expect(leftRoot).not.toContain('fixtures')
    expect(rightRoot).not.toContain('/samples')

    const cache = createComparisonCache()
    expect(cache.maxEntries).toBeGreaterThan(0)
    expect(cache.maxBytes).toBeGreaterThan(0)

    const results = await runRounds(cache, ROUNDS)
    const rounds = results.map((result) => result.round)
    expect(rounds).toHaveLength(ROUNDS)

    for (const round of rounds) {
      expect(round.stats.entries).toBe(cache.hashes.size)
      expect(round.stats.entries).toBeLessThanOrEqual(cache.maxEntries)
      expect(round.stats.estimatedBytes).toBeLessThanOrEqual(cache.maxBytes)
    }

    // Real hashing happened, and the dataset really needed the digest path.
    const treeFiles = Object.values(rounds[0].counts).reduce((total, count) => total + count, 0)
    expect(treeFiles).toBeGreaterThanOrEqual(MIN_FILES)
    expect(rounds[0].hashedFiles).toBeGreaterThan(0)
    expect(rounds[0].counts.modified).toBeGreaterThan(0)
    expect(rounds[0].counts.added).toBe(1)
    expect(rounds[0].counts.removed).toBe(1)

    // Warm rounds are all cache hits: no digest work, no cache growth.
    expect(rounds[1].hashedFiles).toBe(0)
    expect(rounds[2].hashedFiles).toBe(0)
    expect(rounds[2].stats.entries).toBe(rounds[1].stats.entries)
    expect(rounds[2].stats.estimatedBytes).toBeLessThanOrEqual(rounds[1].stats.estimatedBytes)
    expect(rounds[0].stats.hits).toBeGreaterThan(0)

    // Closing the session releases its roots' entries from the shared cache.
    const sides: ComparisonSides = {
      left: { kind: 'directory', path: leftRoot },
      right: { kind: 'directory', path: rightRoot }
    }
    const session = createDirectorySession(results[ROUNDS - 1].comparison, sides)
    expect(session.directory).toBe(results[ROUNDS - 1].comparison)
    releaseDirectoryComparison(cache, results[ROUNDS - 1].comparison, [])
    expect(cache.stats.entries).toBe(0)
    expect(cache.hashes.size).toBe(0)

    const verdict = evaluateMemoryGate({
      maxEntries: cache.maxEntries,
      maxBytes: cache.maxBytes,
      rounds,
      releasedEntries: cache.stats.entries
    })
    expect(verdict.violations).toEqual([])
    expect(verdict.ok).toBe(true)
    expect(resolveMemoryGateExitCode(verdict)).toBe(0)
  })

  it('re-hashes evicted entries without changing the comparison result', async () => {
    const cold = await runRounds(createComparisonCache(), 1)
    const coldStatuses = statusMap(cold[0].comparison)

    // A one-entry cache forces every chunk to evict the previous entries, so
    // the next round must fall back to real reads and real digests.
    const tiny = createComparisonCache({ maxEntries: 1 })
    const evicted = await runRounds(tiny, 2)

    expect(evicted[0].round.hashedFiles).toBeGreaterThan(0)
    expect(evicted[0].round.stats.evictions).toBeGreaterThan(0)
    expect(evicted[0].round.stats.entries).toBeLessThanOrEqual(1)
    for (const result of evicted) {
      expect(result.comparison.counts).toEqual(cold[0].comparison.counts)
      expect(statusMap(result.comparison)).toEqual(coldStatuses)
    }
  })
})
