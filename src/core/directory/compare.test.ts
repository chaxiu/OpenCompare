import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { ListDirectory } from './compare'
import {
  compareDirectories,
  compareScannedTrees,
  createComparisonCache,
  planContentReads,
  scanDirectory
} from './compare'
import {
  DIRECTORY_FILTERS,
  countTreeFiles,
  filterDirectoryTree,
  matchesFilter,
  projectDirectoryTree
} from './filter'
import { sha256Hex } from './hash'
import { DEFAULT_IO_CONCURRENCY, FileHandleExhaustedError } from '../io'

interface FakeFile {
  readonly text: string
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
    }
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
