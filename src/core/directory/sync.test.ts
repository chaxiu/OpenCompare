import { describe, expect, it } from 'vitest'
import type { ListDirectory } from './compare'
import { compareDirectories, createComparisonCache, planContentReads, scanDirectory } from './compare'
import type { SyncIo } from './sync'
import {
  buildSyncPlan,
  copyScannedTree,
  executeSyncPlan,
  invalidateComparisonCache
} from './sync'

interface FakeFile {
  readonly text: string
  readonly size?: number
  readonly modifiedMs?: number
}

type FakeTree = { readonly [name: string]: FakeFile | FakeTree }

function isFile(value: FakeFile | FakeTree): value is FakeFile {
  return typeof (value as FakeFile).text === 'string'
}

interface WritableFs {
  readonly list: ListDirectory
  readonly readTextFile: (path: string) => Promise<string>
  readonly io: SyncIo
  readonly snapshot: () => FakeTree
  readonly writes: string[]
  readonly deletes: string[]
}

/** Mutable in-memory file system used as the sync IO seam. */
function createWritableFs(initial: FakeTree): WritableFs {
  const tree: { [name: string]: FakeFile | FakeTree } = JSON.parse(
    JSON.stringify(initial)
  ) as FakeTree
  const writes: string[] = []
  const deletes: string[] = []

  function lookup(path: string): FakeFile | { [name: string]: FakeFile | FakeTree } | null {
    if (path === '/' || path === '') return tree
    let node: FakeFile | { [name: string]: FakeFile | FakeTree } = tree as {
      [name: string]: FakeFile | FakeTree
    }
    for (const part of path.replace(/^\/+/, '').split('/')) {
      if (isFile(node)) return null
      const child = node[part] as FakeFile | { [name: string]: FakeFile | FakeTree } | undefined
      if (child === undefined) return null
      node = child
    }
    return node
  }

  function parentOf(path: string): { [name: string]: FakeFile | FakeTree } {
    const separator = path.lastIndexOf('/')
    const dirPath = separator <= 0 ? '/' : path.slice(0, separator)
    const node = lookup(dirPath)
    if (node === null || isFile(node)) throw new Error(`not a directory: ${dirPath}`)
    return node
  }

  function nameOf(path: string): string {
    return path.slice(path.lastIndexOf('/') + 1)
  }

  function ensureDir(path: string): void {
    if (path === '' || path === '/') return
    const separator = path.lastIndexOf('/')
    const parent = separator <= 0 ? '/' : path.slice(0, separator)
    ensureDir(parent)
    const container = lookup(parent)
    if (container === null || isFile(container)) throw new Error(`not a directory: ${parent}`)
    if (container[nameOf(path)] === undefined) container[nameOf(path)] = {}
  }

  return {
    writes,
    deletes,
    snapshot: () => tree as FakeTree,
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
    io: {
      readTextFile: async (path) => {
        const node = lookup(path)
        if (node === null || !isFile(node)) throw new Error(`not a file: ${path}`)
        return node.text
      },
      writeTextFile: async (path, content, modifiedMs) => {
        writes.push(path)
        parentOf(path)[nameOf(path)] = { text: content, modifiedMs: modifiedMs ?? 0 }
      },
      ensureDirectory: async (path) => {
        ensureDir(path)
      },
      deleteFile: async (path) => {
        deletes.push(path)
        delete parentOf(path)[nameOf(path)]
      }
    }
  }
}

const LEFT: FakeTree = {
  'same.txt': { text: 'identical', modifiedMs: 1000 },
  'changed.txt': { text: 'before', modifiedMs: 1000 },
  'left-only.txt': { text: 'source', modifiedMs: 1500 },
  nested: { 'deep.txt': { text: 'deep-source', modifiedMs: 1500 } }
}

const RIGHT: FakeTree = {
  'same.txt': { text: 'identical', modifiedMs: 1000 },
  'changed.txt': { text: 'after!', modifiedMs: 1000 },
  'right-only.txt': { text: 'stale', modifiedMs: 2500 }
}

async function compareTrees(fs: WritableFs, cache = createComparisonCache()) {
  return {
    comparison: await compareDirectories('/left', '/right', fs.list, fs.readTextFile, cache),
    cache
  }
}

describe('sync plan', () => {
  it('classifies copy / update and leaves same files out, both directions mirrored', async () => {
    const fs = createWritableFs({ left: LEFT, right: RIGHT })
    const { comparison } = await compareTrees(fs)

    const forward = buildSyncPlan(comparison, 'left-to-right', 'incremental')
    expect(forward.copy.items.map((item) => item.relativePath).sort()).toEqual([
      'left-only.txt',
      'nested/deep.txt'
    ])
    expect(forward.update.items.map((item) => item.relativePath)).toEqual(['changed.txt'])
    expect(forward.delete.items).toEqual([])
    expect(forward.copy.items.find((item) => item.relativePath === 'left-only.txt')?.sourcePath).toBe(
      '/left/left-only.txt'
    )
    expect(
      forward.update.items.find((item) => item.relativePath === 'changed.txt')?.targetPath
    ).toBe('/right/changed.txt')
    // The plan carries the source mtime so the write can preserve it.
    expect(
      forward.update.items.find((item) => item.relativePath === 'changed.txt')?.modifiedMs
    ).toBe(1000)

    const copyBytes = 'source'.length + 'deep-source'.length
    expect(forward.copy.bytes).toBe(copyBytes)
    expect(forward.update.bytes).toBe('before'.length)
    expect(forward.totalCount).toBe(3)

    const backward = buildSyncPlan(comparison, 'right-to-left', 'incremental')
    expect(backward.copy.items.map((item) => item.relativePath)).toEqual(['right-only.txt'])
    expect(backward.update.items.map((item) => item.relativePath)).toEqual(['changed.txt'])
    expect(backward.sourceRoot).toBe('/right')
    expect(backward.targetRoot).toBe('/left')
    expect(
      backward.update.items.find((item) => item.relativePath === 'changed.txt')?.sourcePath
    ).toBe('/right/changed.txt')
  })

  it('lists target-only files as deletions only in mirror mode', async () => {
    const fs = createWritableFs({ left: LEFT, right: RIGHT })
    const { comparison } = await compareTrees(fs)

    const incremental = buildSyncPlan(comparison, 'left-to-right', 'incremental')
    expect(incremental.delete.items).toEqual([])

    const mirror = buildSyncPlan(comparison, 'left-to-right', 'mirror')
    expect(mirror.delete.items.map((item) => item.relativePath)).toEqual(['right-only.txt'])
    expect(mirror.delete.items[0].sourcePath).toBeNull()
    expect(mirror.delete.items[0].targetPath).toBe('/right/right-only.txt')
  })

  it('honours a writable target override', async () => {
    const fs = createWritableFs({ left: LEFT, right: RIGHT })
    const { comparison } = await compareTrees(fs)

    const plan = buildSyncPlan(comparison, 'left-to-right', 'mirror', '/tmp/sandbox/right')
    expect(plan.targetRoot).toBe('/tmp/sandbox/right')
    expect(plan.copy.items.every((item) => item.targetPath.startsWith('/tmp/sandbox/right/'))).toBe(
      true
    )
    expect(plan.delete.items[0].targetPath).toBe('/tmp/sandbox/right/right-only.txt')
  })
})

describe('sync execution', () => {
  it('writes through IO, creates parents, drops stale cache and is idempotent', async () => {
    const fs = createWritableFs({ left: LEFT, right: RIGHT })
    const cache = createComparisonCache()
    const first = await compareTrees(fs, cache)
    expect(first.comparison.counts).toEqual({ same: 1, added: 1, removed: 2, modified: 1 })

    // Equal-size pairs are decided by a content read when nothing is cached.
    const pendingReads = planContentReads(
      await scanDirectory('/left', fs.list),
      await scanDirectory('/right', fs.list),
      createComparisonCache()
    )
    expect(pendingReads.length).toBe(4)

    // Apply the plan through the mutable IO seam.
    const plan = buildSyncPlan(first.comparison, 'left-to-right', 'incremental')
    const execution = await executeSyncPlan(plan, fs.io)

    expect(execution.copied).toBe(2)
    expect(execution.updated).toBe(1)
    expect(execution.deleted).toBe(0)
    expect(fs.snapshot().right).toMatchObject({
      'left-only.txt': { text: 'source' },
      nested: { 'deep.txt': { text: 'deep-source' } }
    })
    expect(fs.writes).toContain('/right/nested/deep.txt')

    invalidateComparisonCache(cache, execution.affected)
    const refreshed = await compareTrees(fs, cache)
    // incremental mode leaves the target-only file in place, everything else is in sync
    expect(refreshed.comparison.counts).toEqual({ same: 4, added: 1, removed: 0, modified: 0 })

    const second = buildSyncPlan(refreshed.comparison, 'left-to-right', 'incremental')
    expect(second.totalCount).toBe(0)
    expect(second.totalBytes).toBe(0)
  })

  it('deletes only the mirror items the user kept checked', async () => {
    const fs = createWritableFs({
      left: { 'keep.txt': { text: 'keep' } },
      right: { 'drop-me.txt': { text: 'drop' }, 'keep-me.txt': { text: 'stay' } }
    })
    const { comparison } = await compareTrees(fs)
    const plan = buildSyncPlan(comparison, 'left-to-right', 'mirror')
    expect(plan.delete.items.map((item) => item.relativePath).sort()).toEqual([
      'drop-me.txt',
      'keep-me.txt'
    ])

    const execution = await executeSyncPlan(plan, fs.io, { deletePaths: ['drop-me.txt'] })
    expect(execution.deleted).toBe(1)
    expect(fs.deletes).toEqual(['/right/drop-me.txt'])
    expect(fs.snapshot().right).toHaveProperty('keep-me.txt')
  })

  it('deletes nothing when no delete path is selected or the option is omitted', async () => {
    for (const options of [{}, { deletePaths: [] as string[] }]) {
      const fs = createWritableFs({
        left: { 'keep.txt': { text: 'keep' } },
        right: { 'drop-me.txt': { text: 'drop' }, 'keep-me.txt': { text: 'stay' } }
      })
      const { comparison } = await compareTrees(fs)
      const plan = buildSyncPlan(comparison, 'left-to-right', 'mirror')
      expect(plan.delete.items).toHaveLength(2)

      const execution = await executeSyncPlan(plan, fs.io, options)
      expect(execution.deleted).toBe(0)
      expect(fs.deletes).toEqual([])
      expect(fs.snapshot().right).toHaveProperty('drop-me.txt')
      expect(fs.snapshot().right).toHaveProperty('keep-me.txt')
    }
  })
})

describe('tree materialisation', () => {
  it('copies a scanned tree into a writable root preserving relative paths', async () => {
    const fs = createWritableFs({ source: { a: { 'one.txt': { text: '1' } }, 'root.txt': { text: 'r' } } })
    const tree = await scanDirectory('/source', fs.list)

    const copied = await copyScannedTree(tree, '/scratch/copy', fs.io)
    expect(copied).toBe(2)
    expect(fs.snapshot().scratch).toMatchObject({
      copy: { a: { 'one.txt': { text: '1' } }, 'root.txt': { text: 'r' } }
    })
  })
})
