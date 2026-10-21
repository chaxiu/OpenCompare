import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { DigestFiles, DirectoryProgress, ListDirectories, ListDirectory } from './compare'
import type { DirectoryListing } from '@shared/platform/types'
import {
  DEFAULT_DIRECTORY_BATCH_SIZE,
  DEFAULT_DIGEST_BATCH_SIZE,
  DEFAULT_TRAVERSAL_CONCURRENCY,
  compareDirectories,
  compareScannedTrees,
  createComparisonCache,
  planContentReads,
  scanDirectory
} from './compare'
import { compareDirectorySides } from './snapshot'
import {
  DIRECTORY_FILTERS,
  countTreeFiles,
  filterDirectoryTree,
  matchesFilter,
  projectDirectoryTree
} from './filter'
import { sha256Bytes, sha256Hex } from './hash'
import { DEFAULT_IO_CONCURRENCY, FileHandleExhaustedError, OperationCancelledError } from '../io'

interface FakeFile {
  readonly text: string
  /** Raw bytes the digest capability hashes; defaults to the text's UTF-8 bytes. */
  readonly bytes?: Uint8Array
  /** Overrides the byte size the fast path sees. */
  readonly size?: number
  readonly modifiedMs?: number
}

type FakeTree = { readonly [name: string]: FakeFile | FakeTree }

function isFile(value: FakeFile | FakeTree): value is FakeFile {
  return typeof (value as FakeFile).text === 'string'
}

interface FakeFs {
  readonly list: ListDirectory
  readonly readTextFile: (path: string) => Promise<string>
  readonly digestFiles: DigestFiles
}

/** In-memory file system mirroring the PlatformPort capability for the engine. */
function createFakeFs(tree: FakeTree): FakeFs {
  function lookup(path: string): FakeFile | FakeTree | null {
    if (path === '/' || path === '') return tree
    let node: FakeFile | FakeTree = tree
    for (const part of path.replace(/^\/+/, '').split('/')) {
      if (isFile(node)) return null
      const child: FakeFile | FakeTree | undefined = node[part]
      if (child === undefined) return null
      node = child
    }
    return node
  }

  return {
    list: async (path) => {
      const node = lookup(path)
      if (node === null || isFile(node)) throw new Error(`not a directory: ${path}`)
      return Object.entries(node).map(([name, child]) => ({
        name,
        path: path === '/' ? `/${name}` : `${path}/${name}`,
        isDirectory: !isFile(child),
        size: isFile(child) ? (child.size ?? child.text.length) : 0,
        modifiedMs: isFile(child) ? (child.modifiedMs ?? 0) : 0
      }))
    },
    readTextFile: async (path) => {
      const node = lookup(path)
      if (node === null || !isFile(node)) throw new Error(`not a file: ${path}`)
      return node.text
    },
    // Mirrors `PlatformPort.digestFiles`: raw bytes, input order, per-file failure.
    digestFiles: async (paths) =>
      paths.map((path) => {
        const node = lookup(path)
        if (node === null || !isFile(node)) {
          return { path, ok: false, reason: `无法读取文件 ${path}：路径不存在` }
        }
        const bytes = node.bytes ?? new TextEncoder().encode(node.text)
        return { path, ok: true, sha256: sha256Bytes(bytes), bytes: bytes.length }
      })
  }
}

/** Both trees, addressed as `/left` and `/right`. */
function createTrees(left: FakeTree, right: FakeTree): FakeFs {
  return createFakeFs({ left, right })
}

/** One flat directory of `count` identical files; every pair needs a body read. */
function largeTree(count: number, text: string): FakeTree {
  const tree: Record<string, FakeFile> = {}
  for (let index = 0; index < count; index += 1) {
    tree[`file-${String(index).padStart(4, '0')}.txt`] = { text }
  }
  return tree
}

interface ReadProbe {
  readonly readTextFile: (path: string) => Promise<string>
  readonly reads: () => number
  readonly peak: () => number
}

/** Wraps a read capability so a test can observe the in-flight peak. */
function probeReads(fs: FakeFs): ReadProbe {
  let inFlight = 0
  let peak = 0
  let reads = 0
  return {
    readTextFile: async (path) => {
      reads += 1
      inFlight += 1
      peak = Math.max(peak, inFlight)
      // Yield so concurrent reads overlap instead of resolving synchronously.
      await Promise.resolve()
      try {
        return await fs.readTextFile(path)
      } finally {
        inFlight -= 1
      }
    },
    reads: () => reads,
    peak: () => peak
  }
}

function codedError(code: string): Error {
  return Object.assign(new Error(`${code}: too many open files`), { code })
}

function collectNames(
  node: { readonly name: string; readonly children: readonly unknown[] } | null
): string[] {
  if (node === null) return []
  const names = [node.name]
  for (const child of node.children) {
    names.push(
      ...collectNames(child as { readonly name: string; readonly children: readonly unknown[] })
    )
  }
  return names
}

describe('sha256Hex', () => {
  it('matches the reference digests in Node', () => {
    const samples = ['', 'abc', '中文 · 对比 😀', 'x'.repeat(1000), 'line\nline\r\nline']

    for (const sample of samples) {
      expect(sha256Hex(sample)).toBe(
        createHash('sha256').update(sample, 'utf8').digest('hex')
      )
    }
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('sha256Bytes', () => {
  /** Deterministic pseudo-random bytes, so the large case crosses block edges. */
  function pseudoRandomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length)
    let seed = 0x9e3779b9
    for (let index = 0; index < length; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0
      bytes[index] = seed & 0xff
    }
    return bytes
  }

  it('matches node:crypto for ASCII, multibyte UTF-8 and BOM bytes', () => {
    const encoder = new TextEncoder()
    for (const text of ['', 'abc', '中文🙂', '\ufeffbom.txt', 'line\r\nline']) {
      const bytes = encoder.encode(text)
      expect(sha256Bytes(bytes)).toBe(createHash('sha256').update(bytes).digest('hex'))
    }
    expect(sha256Bytes(encoder.encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
    expect(sha256Bytes(new Uint8Array())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    )
  })

  it('hashes invalid UTF-8 bytes as-is instead of decoding them first', () => {
    const bytes = Uint8Array.from([0x61, 0xff, 0xfe, 0x00, 0x62])
    const decoded = new TextDecoder().decode(bytes)

    expect(sha256Bytes(bytes)).toBe(createHash('sha256').update(bytes).digest('hex'))
    // A text round-trip replaces the invalid sequences with U+FFFD, so the
    // digests must differ — proof the hash never went through a string.
    expect(sha256Bytes(bytes)).not.toBe(sha256Hex(decoded))
  })

  it('digests a buffer larger than the streaming chunk with an offset boundary', () => {
    const bytes = pseudoRandomBytes(1024 * 1024 + 7)

    expect(sha256Bytes(bytes)).toBe(createHash('sha256').update(bytes).digest('hex'))
  })
})

describe('directory comparison engine', () => {
  async function compare(left: FakeTree, right: FakeTree, cache = createComparisonCache()) {
    const fs = createTrees(left, right)
    return {
      comparison: await compareDirectories('/left', '/right', fs.list, fs.readTextFile, cache),
      fs,
      cache
    }
  }

  it('classifies same / right-only / left-only / modified by relative path', async () => {
    const { comparison } = await compare(
      {
        'same.txt': { text: 'alpha' },
        'modified.txt': { text: 'alpha' },
        resized: { text: 'alpha' },
        'left-only.txt': { text: 'gone' },
        docs: { 'deep.txt': { text: 'deep' }, 'changelog.md': { text: 'old' } }
      },
      {
        'same.txt': { text: 'alpha' },
        'modified.txt': { text: 'bravo' },
        resized: { text: 'alpha!alpha' },
        'right-only.txt': { text: 'new' },
        docs: { 'deep.txt': { text: 'deep' }, 'migration.md': { text: 'new' } }
      }
    )

    expect(comparison.counts).toEqual({ same: 2, added: 2, removed: 2, modified: 2 })
    expect(comparison.fileCount).toBe(8)

    const docs = comparison.root.children.find((child) => child.name === 'docs')
    expect(docs?.status).toBe('modified')
    expect(docs?.counts).toEqual({ same: 1, added: 1, removed: 1, modified: 0 })

    const modified = comparison.root.children.find((child) => child.name === 'modified.txt')
    // equal size *and* mtime: only the SHA-256 body hash can tell them apart
    expect(modified?.status).toBe('modified')
    expect(modified?.leftPath).toBe('/left/modified.txt')
    expect(modified?.rightPath).toBe('/right/modified.txt')

    const removed = comparison.root.children.find((child) => child.name === 'left-only.txt')
    expect(removed?.status).toBe('removed')
    expect(removed?.rightPath).toBeUndefined()

    const added = comparison.root.children.find((child) => child.name === 'right-only.txt')
    expect(added?.status).toBe('added')
    expect(added?.leftPath).toBeUndefined()
  })

  it('settles size/mtime mismatches without reading bodies and reuses the hash cache', async () => {
    const fs = createTrees(
      {
        'same-size.txt': { text: 'aaaa' },
        'resized.txt': { text: 'aaaa' },
        'touched.txt': { text: 'aaaa', modifiedMs: 0 },
        'identical.txt': { text: 'zzzz' }
      },
      {
        'same-size.txt': { text: 'bbbb' },
        'resized.txt': { text: 'aaaaaa' },
        'touched.txt': { text: 'aaaa', modifiedMs: 5000 },
        'identical.txt': { text: 'zzzz' }
      }
    )

    const cache = createComparisonCache()
    const left = await scanDirectory('/left', fs.list)
    const right = await scanDirectory('/right', fs.list)

    // Only equal-size + equal-mtime pairs need a body; the rest is metadata-only.
    const requested = planContentReads(left, right, cache)
    expect([...requested].sort()).toEqual([
      '/left/identical.txt',
      '/left/same-size.txt',
      '/right/identical.txt',
      '/right/same-size.txt'
    ])

    const contents = new Map(
      await Promise.all(requested.map(async (path) => [path, await fs.readTextFile(path)] as const))
    )
    let hashCalls = 0
    const hash = (text: string): string => {
      hashCalls += 1
      return sha256Hex(text)
    }

    const first = compareScannedTrees(left, right, { contents, cache, hash })
    expect(first.counts).toEqual({ same: 1, added: 0, removed: 0, modified: 3 })
    expect(hashCalls).toBe(4)

    // Second pass over the unchanged trees: nothing to read, nothing to hash.
    expect(planContentReads(left, right, cache)).toEqual([])
    const second = compareScannedTrees(left, right, { contents: new Map(), cache, hash })
    expect(second.counts).toEqual(first.counts)
    expect(hashCalls).toBe(4)
  })

  it('reads bodies through the platform capability exactly once per candidate', async () => {
    const reads: string[] = []
    const fs = createTrees({ 'a.txt': { text: 'same' } }, { 'a.txt': { text: 'same' } })
    const cache = createComparisonCache()
    const readTextFile = async (path: string): Promise<string> => {
      reads.push(path)
      return fs.readTextFile(path)
    }

    const first = await compareDirectories('/left', '/right', fs.list, readTextFile, cache)
    expect(first.counts).toEqual({ same: 1, added: 0, removed: 0, modified: 0 })
    expect(reads).toEqual(['/left/a.txt', '/right/a.txt'])

    await compareDirectories('/left', '/right', fs.list, readTextFile, cache)
    expect(reads).toEqual(['/left/a.txt', '/right/a.txt'])
  })

  it('bounds content reads for 3000 files at the default window', async () => {
    const fs = createTrees(largeTree(3000, 'shared'), largeTree(3000, 'shared'))
    const probe = probeReads(fs)

    const comparison = await compareDirectories(
      '/left',
      '/right',
      fs.list,
      probe.readTextFile,
      createComparisonCache()
    )

    expect(comparison.counts).toEqual({ same: 3000, added: 0, removed: 0, modified: 0 })
    expect(probe.reads()).toBe(6000)
    expect(probe.peak()).toBeLessThanOrEqual(DEFAULT_IO_CONCURRENCY)
    expect(probe.peak()).toBeGreaterThan(1)
  })

  it('honours an explicit lower window without changing the classification', async () => {
    async function run(concurrency?: number) {
      const fs = createTrees(largeTree(400, 'alpha'), largeTree(400, 'bravo'))
      const probe = probeReads(fs)
      const comparison = await compareDirectories(
        '/left',
        '/right',
        fs.list,
        probe.readTextFile,
        createComparisonCache(),
        undefined,
        concurrency === undefined ? {} : { concurrency }
      )
      return { comparison, peak: probe.peak() }
    }

    const byDefault = await run()
    const limited = await run(2)

    expect(byDefault.peak).toBeLessThanOrEqual(DEFAULT_IO_CONCURRENCY)
    expect(limited.peak).toBeLessThanOrEqual(2)
    expect(limited.peak).toBeGreaterThan(1)
    expect(limited.comparison.counts).toEqual(byDefault.comparison.counts)
    expect(limited.comparison.counts).toEqual({
      same: 0,
      added: 0,
      removed: 0,
      modified: 400
    })
    expect(limited.comparison.root).toEqual(byDefault.comparison.root)
  })

  it('rejects file-handle exhaustion with a readable error instead of a partial result', async () => {
    const fs = createTrees(largeTree(4, 'same'), largeTree(4, 'same'))
    const readTextFile = async (): Promise<string> => {
      throw codedError('EMFILE')
    }

    const outcome = await compareDirectories(
      '/left',
      '/right',
      fs.list,
      readTextFile,
      createComparisonCache()
    ).then(
      () => new Error('expected the comparison to reject'),
      (error: unknown) => error
    )

    expect(outcome).toBeInstanceOf(FileHandleExhaustedError)
    expect((outcome as FileHandleExhaustedError).code).toBe('EMFILE')
    expect((outcome as Error).message).toContain('文件句柄')
    expect((outcome as Error).message).toContain('EMFILE')
  })

  it('keeps a dangling entry in the listing but out of the scan, counted as skipped', async () => {
    const fs = createTrees(
      { 'same.txt': { text: 'alpha' }, docs: { 'kept.txt': { text: 'deep' } } },
      { 'same.txt': { text: 'alpha' } }
    )
    const list: ListDirectory = async (path) =>
      path === '/left'
        ? [
            ...(await fs.list(path)),
            {
              name: 'dangling',
              path: '/left/dangling',
              isDirectory: false,
              size: 0,
              modifiedMs: 0,
              broken: true,
              skippedReason: '悬空符号链接：路径不存在或已被移动（ENOENT）'
            }
          ]
        : fs.list(path)

    const left = await scanDirectory('/left', list)

    expect(left.skipped).toBe(1)
    expect(left.index.has('dangling')).toBe(false)
    expect(left.index.has('same.txt')).toBe(true)
    expect(left.index.has('docs/kept.txt')).toBe(true)
  })

  it('skips an unlistable subtree and keeps the rest of the tree', async () => {
    const fs = createTrees(
      {
        'kept.txt': { text: 'kept' },
        readable: { 'deep.txt': { text: 'deep' } },
        locked: { 'hidden.txt': { text: 'hidden' } }
      },
      {}
    )
    const list: ListDirectory = async (path) => {
      if (path === '/left/locked') throw new Error('EACCES: permission denied')
      return fs.list(path)
    }

    const scanned = await scanDirectory('/left', list)

    expect(scanned.skipped).toBe(1)
    expect(scanned.index.has('locked')).toBe(false)
    expect(scanned.index.has('readable/deep.txt')).toBe(true)
    expect(scanned.index.has('kept.txt')).toBe(true)
  })

  it('still rejects when the root itself cannot be listed', async () => {
    const list: ListDirectory = async () => {
      throw new Error('无法读取目录 /left：没有访问权限（EACCES）。')
    }

    await expect(scanDirectory('/left', list)).rejects.toThrow(/无法读取目录 \/left/)
  })

  it('aggregates each side skipped count into the comparison', async () => {
    const fs = createTrees(
      { 'same.txt': { text: 'alpha' } },
      { 'same.txt': { text: 'alpha' }, 'right-only.txt': { text: 'new' } }
    )
    const brokenEntry = (root: string) => ({
      name: 'dangling',
      path: `${root}/dangling`,
      isDirectory: false,
      size: 0,
      modifiedMs: 0,
      broken: true,
      skippedReason: '悬空符号链接：路径不存在或已被移动（ENOENT）'
    })
    const list: ListDirectory = async (path) => {
      const entries = await fs.list(path)
      return path === '/left' || path === '/right'
        ? [...entries, brokenEntry(path)]
        : entries
    }

    const comparison = await compareDirectories(
      '/left',
      '/right',
      list,
      fs.readTextFile,
      createComparisonCache()
    )

    expect(comparison.skipped).toBe(2)
    expect(comparison.counts).toEqual({ same: 1, added: 1, removed: 0, modified: 0 })
    expect(comparison.fileCount).toBe(
      comparison.counts.same +
        comparison.counts.added +
        comparison.counts.removed +
        comparison.counts.modified
    )
  })

  it('hashes planned files through one digest batch instead of reading their text', async () => {
    const fs = createTrees({ 'a.txt': { text: 'same' } }, { 'a.txt': { text: 'same' } })
    const readTextFile = async (): Promise<string> => {
      throw new Error('the digest capability must replace text reads')
    }
    const requests: string[][] = []
    const digestFiles: DigestFiles = async (paths) => {
      requests.push([...paths])
      return fs.digestFiles(paths)
    }
    const cache = createComparisonCache()

    const comparison = await compareDirectories(
      '/left',
      '/right',
      fs.list,
      readTextFile,
      cache,
      undefined,
      { digestFiles }
    )

    expect(comparison.counts).toEqual({ same: 1, added: 0, removed: 0, modified: 0 })
    expect(requests).toEqual([['/left/a.txt', '/right/a.txt']])

    // Cache hit: unchanged (path, size, modifiedMs) pairs ask for no digest.
    const second = await compareDirectories(
      '/left',
      '/right',
      fs.list,
      readTextFile,
      cache,
      undefined,
      { digestFiles }
    )
    expect(requests).toHaveLength(1)
    expect(second.counts).toEqual(comparison.counts)
  })

  it('classifies a binary pair modified when only its raw bytes differ', async () => {
    const fs = createTrees(
      {
        'blob.bin': {
          text: 'aaaaa',
          size: 5,
          bytes: Uint8Array.from([0x61, 0xff, 0xfe, 0x00, 0x62])
        }
      },
      {
        'blob.bin': {
          text: 'aaaaa',
          size: 5,
          bytes: Uint8Array.from([0x61, 0xef, 0xbf, 0xbd, 0x62])
        }
      }
    )

    const comparison = await compareDirectories(
      '/left',
      '/right',
      fs.list,
      fs.readTextFile,
      createComparisonCache(),
      undefined,
      { digestFiles: fs.digestFiles }
    )

    // Identical size and mtime, text decodes to the same string: only the byte
    // digest can tell these apart.
    expect(comparison.counts).toEqual({ same: 0, added: 0, removed: 0, modified: 1 })
  })

  it('keeps a per-file digest failure as one skipped modified pair', async () => {
    const fs = createTrees(
      { 'bad.bin': { text: 'aa' }, 'ok.txt': { text: 'beta' } },
      { 'bad.bin': { text: 'aa' }, 'ok.txt': { text: 'beta' } }
    )
    const digestFiles: DigestFiles = async (paths) =>
      Promise.all(
        paths.map(async (path) => {
          if (path === '/right/bad.bin') {
            return {
              path,
              ok: false as const,
              reason: `无法读取文件 ${path}：没有访问权限（EACCES）。`
            }
          }
          const [digest] = await fs.digestFiles([path])
          return digest
        })
      )

    const comparison = await compareDirectories(
      '/left',
      '/right',
      fs.list,
      fs.readTextFile,
      createComparisonCache(),
      undefined,
      { digestFiles }
    )

    expect(comparison.skipped).toBe(1)
    expect(comparison.counts).toEqual({ same: 1, added: 0, removed: 0, modified: 1 })
  })

  it('treats descriptor exhaustion during the digest batch as fatal', async () => {
    const fs = createTrees(largeTree(3, 'same'), largeTree(3, 'same'))
    const digestFiles: DigestFiles = async () => {
      throw codedError('EMFILE')
    }

    const outcome = await compareDirectories(
      '/left',
      '/right',
      fs.list,
      fs.readTextFile,
      createComparisonCache(),
      undefined,
      { digestFiles }
    ).then(
      () => new Error('expected the comparison to reject'),
      (error: unknown) => error
    )

    expect(outcome).toBeInstanceOf(FileHandleExhaustedError)
    expect((outcome as FileHandleExhaustedError).code).toBe('EMFILE')
    expect((outcome as Error).message).toContain('EMFILE')
  })

  it('reports an unreadable body as modified and counts it instead of rejecting', async () => {
    const fs = createTrees(
      { 'unreadable.txt': { text: 'alpha' }, 'ok.txt': { text: 'beta' } },
      { 'unreadable.txt': { text: 'alpha' }, 'ok.txt': { text: 'beta' } }
    )
    const readTextFile = async (path: string): Promise<string> => {
      if (path === '/right/unreadable.txt') throw new Error('EACCES: permission denied')
      return fs.readTextFile(path)
    }

    const comparison = await compareDirectories(
      '/left',
      '/right',
      fs.list,
      readTextFile,
      createComparisonCache()
    )

    expect(comparison.skipped).toBe(1)
    expect(comparison.counts).toEqual({ same: 1, added: 0, removed: 0, modified: 1 })
    expect(
      comparison.root.children.find((child) => child.name === 'unreadable.txt')?.status
    ).toBe('modified')
  })
})

describe('directory filters', () => {
  it('maps every file status onto the five filters', () => {
    expect(DIRECTORY_FILTERS).toEqual(['all', 'differences', 'left-only', 'right-only', 'same'])
    expect(matchesFilter('modified', 'differences')).toBe(true)
    expect(matchesFilter('removed', 'left-only')).toBe(true)
    expect(matchesFilter('added', 'right-only')).toBe(true)
    expect(matchesFilter('same', 'same')).toBe(true)
    expect(matchesFilter('same', 'differences')).toBe(false)
    expect(matchesFilter('added', 'left-only')).toBe(false)
    expect(matchesFilter('removed', 'right-only')).toBe(false)
    expect(matchesFilter('modified', 'same')).toBe(false)
    expect(matchesFilter('modified', 'all')).toBe(true)
  })

  it('keeps matching files plus their ancestor directories', async () => {
    const fs = createTrees(
      {
        'same.txt': { text: 'alpha' },
        'shared.txt': { text: 'alpha' },
        src: { 'deep.ts': { text: 'alpha' }, 'gone.ts': { text: 'bye' } }
      },
      {
        'same.txt': { text: 'alpha' },
        'shared.txt': { text: 'bravo' },
        src: { 'deep.ts': { text: 'alpha' }, 'new.ts': { text: 'hi' } }
      }
    )
    const comparison = await compareDirectories(
      '/left',
      '/right',
      fs.list,
      fs.readTextFile,
      createComparisonCache()
    )

    const differences = filterDirectoryTree(comparison.root, 'differences')
    expect(collectNames(differences)).not.toContain('same.txt')
    // the ancestor directory survives, its unchanged child does not
    expect(collectNames(differences)).toContain('src')
    expect(collectNames(differences)).not.toContain('deep.ts')

    const leftOnly = filterDirectoryTree(comparison.root, 'left-only')
    expect(collectNames(leftOnly).sort()).toEqual(['gone.ts', 'left', 'src'])

    const sameOnly = filterDirectoryTree(comparison.root, 'same')
    expect(collectNames(sameOnly)).not.toContain('shared.txt')
    expect(collectNames(sameOnly)).toContain('deep.ts')

    expect(countTreeFiles(differences)).toEqual({ same: 0, added: 1, removed: 1, modified: 1 })
  })

  it('projects a side, dropping nodes that do not exist there', async () => {
    const fs = createTrees(
      { 'left-only.txt': { text: 'left' }, 'both.txt': { text: 'a' } },
      { 'right-only.txt': { text: 'right' }, 'both.txt': { text: 'a' } }
    )
    const comparison = await compareDirectories(
      '/left',
      '/right',
      fs.list,
      fs.readTextFile,
      createComparisonCache()
    )

    expect(collectNames(projectDirectoryTree(comparison.root, 'left'))).not.toContain(
      'right-only.txt'
    )
    expect(collectNames(projectDirectoryTree(comparison.root, 'right'))).not.toContain(
      'left-only.txt'
    )
    expect(countTreeFiles(projectDirectoryTree(comparison.root, 'left'))).toEqual({
      same: 1,
      added: 0,
      removed: 1,
      modified: 0
    })
  })
})


describe('batched directory scan', () => {
  interface BatchProbe {
    readonly listDirectories: ListDirectories
    readonly calls: string[][]
    readonly peak: () => number
  }

  /** Wraps a single-directory capability as a batch probe that records each call. */
  function probeBatch(fs: FakeFs): BatchProbe {
    const calls: string[][] = []
    let inFlight = 0
    let peak = 0
    return {
      listDirectories: async (paths) => {
        calls.push([...paths])
        inFlight += 1
        peak = Math.max(peak, inFlight)
        // Yield so concurrent batch requests actually overlap.
        await Promise.resolve()
        try {
          return await Promise.all(
            paths.map(async (path): Promise<DirectoryListing> => {
              try {
                return { path, ok: true, entries: await fs.list(path) }
              } catch (error) {
                return { path, ok: false, reason: (error as Error).message }
              }
            })
          )
        } finally {
          inFlight -= 1
        }
      },
      calls,
      peak: () => peak
    }
  }

  /** One flat directory of `count` child directories, each holding one file. */
  function wideTree(count: number): FakeTree {
    const tree: Record<string, FakeFile | FakeTree> = {}
    for (let index = 0; index < count; index += 1) {
      tree[`dir-${String(index).padStart(3, '0')}`] = { 'file.txt': { text: 'shared' } }
    }
    return tree
  }

  it('covers several directories per round trip and needs fewer calls than directories', async () => {
    const fs = createFakeFs(wideTree(8))
    const probe = probeBatch(fs)
    const tree = await scanDirectory('/', fs.list, { listDirectories: probe.listDirectories })

    const directoryCount = 1 + 8
    expect(tree.index.size).toBe(directoryCount + 8)
    expect(probe.calls.some((paths) => paths.length >= 2)).toBe(true)
    // The batch size is a single exported constant, not a number repeated here.
    expect(DEFAULT_DIRECTORY_BATCH_SIZE).toBeGreaterThanOrEqual(2)
    expect(probe.calls.every((paths) => paths.length <= DEFAULT_DIRECTORY_BATCH_SIZE)).toBe(true)
    expect(probe.calls.length).toBeLessThan(directoryCount)
  })

  it('reaches the default traversal window of at least 16 in-flight batches', async () => {
    // 32 listable child directories: batches of two fill the 16-way window.
    const fs = createFakeFs(wideTree(32))
    const probe = probeBatch(fs)
    const tree = await scanDirectory('/', fs.list, { listDirectories: probe.listDirectories })

    expect(DEFAULT_TRAVERSAL_CONCURRENCY).toBeGreaterThanOrEqual(16)
    expect(probe.peak()).toBeGreaterThanOrEqual(16)
    expect(probe.peak()).toBeLessThanOrEqual(DEFAULT_TRAVERSAL_CONCURRENCY)
    expect(tree.skipped).toBe(0)
  })

  it('honours an explicit traversal cap without changing the scanned tree', async () => {
    const fs = createTrees(wideTree(160), wideTree(160))
    const byDefault = probeBatch(fs)
    const defaultRun = await scanDirectory('/left', fs.list, {
      listDirectories: byDefault.listDirectories
    })
    const defaultComparison = await compareDirectories(
      '/left',
      '/right',
      fs.list,
      fs.readTextFile,
      createComparisonCache(),
      undefined,
      { listDirectories: byDefault.listDirectories }
    )

    const limited = probeBatch(fs)
    const limitedRun = await scanDirectory('/left', fs.list, {
      listDirectories: limited.listDirectories,
      concurrency: 4
    })
    // Captured before the comparison below, whose two side scans each get their
    // own window (they run concurrently).
    const limitedPeak = limited.peak()
    const limitedComparison = await compareDirectories(
      '/left',
      '/right',
      fs.list,
      fs.readTextFile,
      createComparisonCache(),
      undefined,
      { listDirectories: limited.listDirectories, concurrency: 4 }
    )

    expect(limitedPeak).toBeLessThanOrEqual(4)
    expect(limitedPeak).toBeGreaterThan(1)
    expect(limitedRun.root).toEqual(defaultRun.root)
    expect([...limitedRun.index.keys()].sort()).toEqual([...defaultRun.index.keys()].sort())
    expect(limitedRun.skipped).toBe(defaultRun.skipped)
    expect(limitedComparison.counts).toEqual(defaultComparison.counts)
    expect(limitedComparison.root).toEqual(defaultComparison.root)
    expect(limitedComparison.skipped).toBe(defaultComparison.skipped)
  })

  it('keeps the serial tree, index and skipped count when slots fail', async () => {
    const fs = createTrees(
      {
        'kept.txt': { text: 'kept' },
        docs: { 'deep.txt': { text: 'deep' }, 'notes.md': { text: 'note' } },
        locked: { 'hidden.txt': { text: 'hidden' } }
      },
      {}
    )
    const dangling = {
      name: 'dangling',
      path: '/left/dangling',
      isDirectory: false,
      size: 0,
      modifiedMs: 0,
      broken: true,
      skippedReason: '悬空符号链接：路径不存在或已被移动（ENOENT）'
    }
    const list: ListDirectory = async (path) => {
      if (path === '/left/locked') throw new Error('EACCES: permission denied')
      const entries = await fs.list(path)
      return path === '/left' ? [...entries, dangling] : entries
    }

    const probe = probeBatch({ ...fs, list })
    const baseline = await scanDirectory('/left', list)
    const batched = await scanDirectory('/left', list, {
      listDirectories: probe.listDirectories
    })

    expect(baseline.skipped).toBe(2)
    expect(batched.skipped).toBe(baseline.skipped)
    expect(batched.root).toEqual(baseline.root)
    expect([...batched.index.keys()].sort()).toEqual([...baseline.index.keys()].sort())
    expect(batched.index.has('locked')).toBe(false)
    expect(batched.index.has('dangling')).toBe(false)
    expect(batched.index.get('docs')?.children.map((child) => child.name)).toEqual([
      'deep.txt',
      'notes.md'
    ])
  })

  it('rejects instead of returning a partial tree when a requested slot is missing', async () => {
    const fs = createFakeFs(wideTree(4))
    const listDirectories: ListDirectories = async (paths) => {
      const listings = await Promise.all(
        paths.map(async (path): Promise<DirectoryListing> => ({
          path,
          ok: true,
          entries: await fs.list(path)
        }))
      )
      return listings.slice(1)
    }

    const outcome = await scanDirectory('/', fs.list, { listDirectories }).then(
      () => new Error('expected the scan to reject'),
      (error: unknown) => error
    )

    expect(outcome).toBeInstanceOf(Error)
    expect((outcome as Error).message).toContain('槽位')
  })

  it('rejects when the root slot reports a readable failure', async () => {
    const listDirectories: ListDirectories = async (paths) =>
      paths.map((path) => ({
        path,
        ok: false as const,
        reason: `无法读取目录 ${path}：没有访问权限（EACCES）。`
      }))

    await expect(scanDirectory('/left', async () => [], { listDirectories })).rejects.toThrow(
      /无法读取目录 \/left/
    )
  })

  it('treats descriptor exhaustion in a batch listing as fatal, not as skipped', async () => {
    const listDirectories: ListDirectories = async () => {
      throw codedError('EMFILE')
    }

    const outcome = await scanDirectory('/left', async () => [], { listDirectories }).then(
      () => new Error('expected the scan to reject'),
      (error: unknown) => error
    )

    expect(outcome).toBeInstanceOf(FileHandleExhaustedError)
    expect((outcome as Error).message).toContain('文件句柄')
    expect((outcome as Error).message).toContain('EMFILE')
  })

  it('classifies the same four states through the batch capability', async () => {
    const fs = createTrees(
      {
        'same.txt': { text: 'alpha' },
        'changed.txt': { text: 'aaaa' },
        'left-only.txt': { text: 'gone' },
        docs: { 'deep.txt': { text: 'deep' } }
      },
      {
        'same.txt': { text: 'alpha' },
        'changed.txt': { text: 'bbbb' },
        'right-only.txt': { text: 'new' },
        docs: { 'deep.txt': { text: 'deep' } }
      }
    )
    const probe = probeBatch(fs)

    const baseline = await compareDirectories(
      '/left',
      '/right',
      fs.list,
      fs.readTextFile,
      createComparisonCache()
    )
    const batched = await compareDirectories(
      '/left',
      '/right',
      fs.list,
      fs.readTextFile,
      createComparisonCache(),
      undefined,
      { listDirectories: probe.listDirectories }
    )

    expect(batched.counts).toEqual({ same: 2, added: 1, removed: 1, modified: 1 })
    expect(batched.counts).toEqual(baseline.counts)
    expect(batched.root).toEqual(baseline.root)
    expect(batched.skipped).toBe(baseline.skipped)
  })
})

describe('directory progress and cancellation', () => {
  const scratchRoots: string[] = []

  afterEach(async () => {
    await Promise.all(scratchRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  })

  async function waitUntil(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
    const started = Date.now()
    while (!predicate()) {
      if (Date.now() - started > timeoutMs) throw new Error('timed out waiting for a condition')
      await new Promise((resolve) => setTimeout(resolve, 2))
    }
  }

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /** Settles a promise into its value/error, or `'timeout'` after `ms`. */
  async function settleWithin<T>(promise: Promise<T>, ms: number): Promise<unknown> {
    return Promise.race([
      promise.then(
        () => 'resolved',
        (error: unknown) => error
      ),
      delay(ms).then(() => 'timeout')
    ])
  }

  /** A real directory listing capability over the local file system. */
  const listReal: ListDirectory = async (path) => {
    const entries = await readdir(path, { withFileTypes: true })
    return Promise.all(
      entries.map(async (entry) => {
        const entryPath = join(path, entry.name)
        const info = await stat(entryPath)
        return {
          name: entry.name,
          path: entryPath,
          isDirectory: info.isDirectory(),
          size: info.size,
          modifiedMs: info.mtimeMs
        }
      })
    )
  }

  const listRealBatch: ListDirectories = (paths) =>
    Promise.all(
      paths.map(async (path): Promise<DirectoryListing> => {
        try {
          return { path, ok: true, entries: await listReal(path) }
        } catch (error) {
          return { path, ok: false, reason: (error as Error).message }
        }
      })
    )

  interface RealTreeStats {
    readonly files: number
    readonly bytes: number
  }

  /** Multi-level real tree: root files, 10 child dirs, one nested level each. */
  async function writeRealTree(root: string, side: 'left' | 'right'): Promise<RealTreeStats> {
    await mkdir(root, { recursive: true })
    let files = 0
    let bytes = 0
    let index = 0
    async function put(path: string, size: number): Promise<void> {
      await writeFile(path, 'x'.repeat(size))
      // Distinct mtimes keep the fast path decisive: no digest is needed here.
      const stamp = new Date((side === 'left' ? 1_000_000 : 2_000_000) + index)
      await utimes(path, stamp, stamp)
      files += 1
      bytes += size
      index += 1
    }

    for (let position = 0; position < 4; position += 1) {
      await put(join(root, `root-${position}.txt`), 10 + position)
    }
    for (let directory = 0; directory < 10; directory += 1) {
      const child = join(root, `dir-${directory}`)
      await mkdir(child)
      await put(join(child, `file-${directory}.txt`), 20 + directory)
      const deep = join(child, 'deep')
      await mkdir(deep)
      await put(join(deep, `deep-${directory}.txt`), 30 + directory)
    }
    return { files, bytes }
  }

  async function createRealPair(): Promise<{
    readonly left: string
    readonly right: string
    readonly leftStats: RealTreeStats
    readonly rightStats: RealTreeStats
  }> {
    const root = await mkdtemp(join(tmpdir(), 'opencompare-progress-'))
    scratchRoots.push(root)
    const left = join(root, 'left')
    const right = join(root, 'right')
    const leftStats = await writeRealTree(left, 'left')
    const rightStats = await writeRealTree(right, 'right')
    return { left, right, leftStats, rightStats }
  }

  /** Same size and mtime on both sides, different bytes: every pair needs a digest. */
  function digestTree(count: number, size: number): FakeTree {
    const left: Record<string, FakeFile> = {}
    const right: Record<string, FakeFile> = {}
    for (let index = 0; index < count; index += 1) {
      const name = `f-${index}.txt`
      left[name] = {
        text: '',
        size,
        modifiedMs: 0,
        bytes: new Uint8Array(size).fill(65 + index)
      }
      right[name] = {
        text: '',
        size,
        modifiedMs: 0,
        bytes: new Uint8Array(size).fill(97 + index)
      }
    }
    return { left, right }
  }

  function digestEvents(events: readonly DirectoryProgress[]): readonly DirectoryProgress[] {
    return events.filter((event) => event.phase === 'digest')
  }

  function scanEvents(events: readonly DirectoryProgress[]): readonly DirectoryProgress[] {
    return events.filter((event) => event.phase === 'scan')
  }

  it('reports monotonic scan totals that end at both sides’ files and bytes', async () => {
    const pair = await createRealPair()
    const events: DirectoryProgress[] = []

    const comparison = await compareDirectories(
      pair.left,
      pair.right,
      listReal,
      async () => '',
      createComparisonCache(),
      undefined,
      {
        listDirectories: listRealBatch,
        onProgress: (event) => events.push(event)
      }
    )

    const scans = scanEvents(events)
    expect(scans.length).toBeGreaterThanOrEqual(2)
    for (let index = 1; index < scans.length; index += 1) {
      expect(scans[index].files).toBeGreaterThanOrEqual(scans[index - 1].files)
      expect(scans[index].bytes).toBeGreaterThanOrEqual(scans[index - 1].bytes)
    }
    const last = scans[scans.length - 1]
    expect(last.files).toBe(pair.leftStats.files + pair.rightStats.files)
    expect(last.bytes).toBe(pair.leftStats.bytes + pair.rightStats.bytes)
    // The real comparison is unaffected by observing it.
    expect(comparison.fileCount).toBe(pair.leftStats.files)
    expect(comparison.skipped).toBe(0)
  })

  it('reports one digest event per settled digest chunk', async () => {
    const fs = createFakeFs(digestTree(3, 7))
    const events: DirectoryProgress[] = []
    const eventsAtCall: number[] = []
    const digestFiles: DigestFiles = async (paths) => {
      eventsAtCall.push(digestEvents(events).length)
      return fs.digestFiles(paths)
    }

    await compareDirectories('/left', '/right', fs.list, fs.readTextFile, createComparisonCache(), undefined, {
      digestFiles,
      digestBatchSize: 2,
      onProgress: (event) => events.push(event)
    })

    // Six candidate paths in chunks of two: three real "settle" steps.
    expect(digestEvents(events).map((event) => event.files)).toEqual([2, 4, 6])
    expect(digestEvents(events).map((event) => event.bytes)).toEqual([14, 28, 42])
    // A chunk is only requested after the previous one settled and reported.
    expect(eventsAtCall).toEqual([0, 1, 2])
  })

  it('never fabricates digest progress while a chunk is still pending', async () => {
    const fs = createFakeFs(digestTree(2, 5))
    const events: DirectoryProgress[] = []
    const calls: string[][] = []
    const resolvers: Array<(digests: Awaited<ReturnType<DigestFiles>>) => void> = []
    const digestFiles: DigestFiles = (paths) => {
      calls.push([...paths])
      return new Promise((resolve) => {
        resolvers.push(resolve)
      })
    }
    const settle = async (index: number): Promise<void> => {
      resolvers[index](await fs.digestFiles(calls[index]))
    }

    const run = compareDirectories('/left', '/right', fs.list, fs.readTextFile, createComparisonCache(), undefined, {
      digestFiles,
      digestBatchSize: 2,
      onProgress: (event) => events.push(event)
    })

    await waitUntil(() => calls.length === 1)
    await delay(20)
    expect(digestEvents(events)).toHaveLength(0)

    await settle(0)
    await waitUntil(() => digestEvents(events).length === 1)
    expect(digestEvents(events)[0]).toEqual({ phase: 'digest', files: 2, bytes: 10 })

    await waitUntil(() => calls.length === 2)
    await settle(1)
    await run
    expect(digestEvents(events)).toHaveLength(2)

    // No timer keeps inventing progress after the comparison has finished.
    await delay(20)
    expect(digestEvents(events)).toHaveLength(2)
  })

  it('rejects a digest-phase cancellation with the dedicated error type', async () => {
    const fs = createFakeFs(digestTree(2, 5))
    let digestCalls = 0
    const hanging: DigestFiles = () => {
      digestCalls += 1
      return new Promise(() => undefined)
    }

    const assertCancelled = (error: unknown): void => {
      expect(error).toBeInstanceOf(OperationCancelledError)
      expect((error as OperationCancelledError).name).toBe('OperationCancelledError')
      expect((error as OperationCancelledError).code).toBe('ECANCELED')
      expect((error as Error).message).toContain('已取消')
    }

    const controller = new AbortController()
    const comparison = compareDirectories('/left', '/right', fs.list, fs.readTextFile, createComparisonCache(), undefined, {
      digestFiles: hanging,
      digestBatchSize: 2,
      signal: controller.signal
    })
    await waitUntil(() => digestCalls > 0)
    controller.abort()
    assertCancelled(await settleWithin(comparison, 1000))

    let sideCalls = 0
    const sideHanging: DigestFiles = () => {
      sideCalls += 1
      return new Promise(() => undefined)
    }
    const sideController = new AbortController()
    const sides = compareDirectorySides(
      { kind: 'directory', path: '/left' },
      { kind: 'directory', path: '/right' },
      fs.list,
      fs.readTextFile,
      createComparisonCache(),
      undefined,
      {
        digestFiles: sideHanging,
        digestBatchSize: 2,
        signal: sideController.signal
      }
    )
    await waitUntil(() => sideCalls > 0)
    sideController.abort()
    assertCancelled(await settleWithin(sides, 1000))
  })

  it('stops a hung scan batch at once and issues no further listings', async () => {
    const fs = createFakeFs(digestTree(1, 3))
    const controller = new AbortController()
    let calls = 0
    const hanging: ListDirectories = () => {
      calls += 1
      return new Promise(() => undefined)
    }

    const run = scanDirectory('/left', fs.list, { listDirectories: hanging, signal: controller.signal })
    await waitUntil(() => calls > 0)
    controller.abort()
    const error = await settleWithin(run, 1000)
    expect(error).toBeInstanceOf(OperationCancelledError)

    const callsAtAbort = calls
    await delay(20)
    expect(calls).toBe(callsAtAbort)
  })

  it('rejects a hung comparison scan without a partial tree', async () => {
    const fs = createFakeFs(digestTree(1, 3))
    const controller = new AbortController()
    let calls = 0
    const hanging: ListDirectories = () => {
      calls += 1
      return new Promise(() => undefined)
    }

    const run = compareDirectories('/left', '/right', fs.list, fs.readTextFile, createComparisonCache(), undefined, {
      listDirectories: hanging,
      signal: controller.signal
    })
    await waitUntil(() => calls > 0)
    controller.abort()
    const error = await settleWithin(run, 1000)
    expect(error).toBeInstanceOf(OperationCancelledError)

    const callsAtAbort = calls
    await delay(20)
    expect(calls).toBe(callsAtAbort)
  })

  it('stops a hung digest chunk and sends no later chunk', async () => {
    const fs = createFakeFs(digestTree(2, 5))
    const controller = new AbortController()
    let calls = 0
    const hanging: DigestFiles = () => {
      calls += 1
      return new Promise(() => undefined)
    }

    const run = compareDirectories('/left', '/right', fs.list, fs.readTextFile, createComparisonCache(), undefined, {
      digestFiles: hanging,
      digestBatchSize: 2,
      signal: controller.signal
    })
    await waitUntil(() => calls > 0)
    controller.abort()
    const error = await settleWithin(run, 1000)
    expect(error).toBeInstanceOf(OperationCancelledError)

    const callsAtAbort = calls
    await delay(20)
    expect(calls).toBe(callsAtAbort)
  })

  it('keeps only settled digest chunks in the cache and recomputes cleanly', async () => {
    const fs = createFakeFs(digestTree(2, 4))
    const calls: string[][] = []
    const resolvers: Array<(digests: Awaited<ReturnType<DigestFiles>>) => void> = []
    const digestFiles: DigestFiles = (paths) => {
      calls.push([...paths])
      return new Promise((resolve) => {
        resolvers.push(resolve)
      })
    }
    const settle = async (index: number): Promise<void> => {
      resolvers[index](await fs.digestFiles(calls[index]))
    }

    const cache = createComparisonCache()
    const controller = new AbortController()
    const run = compareDirectories('/left', '/right', fs.list, fs.readTextFile, cache, undefined, {
      digestFiles,
      digestBatchSize: 2,
      signal: controller.signal
    })

    await waitUntil(() => calls.length === 1)
    await settle(0)
    await waitUntil(() => calls.length === 2)
    controller.abort()
    expect(await settleWithin(run, 1000)).toBeInstanceOf(OperationCancelledError)

    // Only the settled chunk wrote cache entries; the interrupted one wrote none.
    const settledPaths = calls[0]
    expect([...cache.hashes.keys()].sort()).toEqual([...settledPaths].sort())

    const baseline = await compareDirectories(
      '/left',
      '/right',
      fs.list,
      fs.readTextFile,
      createComparisonCache(),
      undefined,
      { digestFiles: fs.digestFiles, digestBatchSize: 2 }
    )
    const retried = await compareDirectories(
      '/left',
      '/right',
      fs.list,
      fs.readTextFile,
      cache,
      undefined,
      { digestFiles: fs.digestFiles, digestBatchSize: 2 }
    )
    expect(retried.counts).toEqual(baseline.counts)
    expect(retried.skipped).toBe(baseline.skipped)
  })

  it('emits no digest progress on a fully cached second comparison', async () => {
    const fs = createFakeFs(digestTree(2, 5))
    const cache = createComparisonCache()
    await compareDirectories('/left', '/right', fs.list, fs.readTextFile, cache, undefined, {
      digestFiles: fs.digestFiles,
      digestBatchSize: 2
    })

    let digestCalls = 0
    const events: DirectoryProgress[] = []
    await compareDirectories('/left', '/right', fs.list, fs.readTextFile, cache, undefined, {
      digestFiles: (paths) => {
        digestCalls += 1
        return fs.digestFiles(paths)
      },
      digestBatchSize: 2,
      onProgress: (event) => events.push(event)
    })

    expect(digestCalls).toBe(0)
    expect(digestEvents(events).filter((event) => event.files > 0)).toHaveLength(0)
    expect(DEFAULT_DIGEST_BATCH_SIZE).toBeGreaterThanOrEqual(2)
  })
})
