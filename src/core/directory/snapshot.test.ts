import { describe, expect, it } from 'vitest'
import { SNAPSHOT_SCHEMA } from '@shared/snapshot'
import type { SnapshotDocument, SnapshotEntry } from '@shared/snapshot'
import type { DirectoryDiffNode, ListDirectory } from './compare'
import { createComparisonCache, scanDirectory } from './compare'
import { countTreeFiles, filterDirectoryTree, projectDirectoryTree } from './filter'
import { sha256Hex } from './hash'
import { DEFAULT_IO_CONCURRENCY, FileHandleExhaustedError } from '../io'
import {
  SnapshotContentError,
  SnapshotFormatError,
  buildSnapshot,
  compareDirectorySides,
  parseSnapshot,
  readSnapshotContent,
  serializeSnapshot,
  snapshotToScannedTree
} from './snapshot'

const EXPORTED_AT = '2026-10-17T09:30:00.000Z'

function entry(path: string, text: string, modifiedMs = 0): SnapshotEntry {
  return { path, size: text.length, modifiedMs, sha256: sha256Hex(text), content: text }
}

const VALID_SNAPSHOT: SnapshotDocument = {
  schema: SNAPSHOT_SCHEMA,
  name: 'remote',
  exportedAt: EXPORTED_AT,
  entries: [entry('docs/readme.md', '# hi\n'), entry('src/app.ts', 'export {}\n')]
}

function rawEntry(path: string, text = 'x'): Record<string, unknown> {
  return { path, size: text.length, modifiedMs: 0, sha256: sha256Hex(text), content: text }
}

function docText(
  entries: readonly unknown[],
  overrides: Record<string, unknown> = {}
): string {
  return JSON.stringify({
    schema: SNAPSHOT_SCHEMA,
    name: 'remote',
    exportedAt: EXPORTED_AT,
    entries,
    ...overrides
  })
}

function formatError(run: () => unknown): SnapshotFormatError {
  try {
    run()
  } catch (error) {
    if (error instanceof SnapshotFormatError) return error
    throw error
  }
  throw new Error('Expected a SnapshotFormatError.')
}

function contentError(run: () => unknown): SnapshotContentError {
  try {
    run()
  } catch (error) {
    if (error instanceof SnapshotContentError) return error
    throw error
  }
  throw new Error('Expected a SnapshotContentError.')
}

/* ------------------------------------------------------------------ */
/* In-memory file system, mirroring the PlatformPort capability        */
/* ------------------------------------------------------------------ */

interface FakeFile {
  readonly text: string
  readonly modifiedMs?: number
}

type FakeTree = { readonly [name: string]: FakeFile | FakeTree }

function isFile(value: FakeFile | FakeTree): value is FakeFile {
  return typeof (value as FakeFile).text === 'string'
}

function createFakeFs(tree: FakeTree): {
  readonly list: ListDirectory
  readonly readTextFile: (path: string) => Promise<string>
} {
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
        size: isFile(child) ? child.text.length : 0,
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

const LEFT_TREE: FakeTree = {
  'same.txt': { text: 'same\n' },
  'changed.txt': { text: 'alpha\n' },
  'left-only.txt': { text: 'left\n' },
  nested: { 'deep.txt': { text: 'deep\n' } }
}

const RIGHT_TREE: FakeTree = {
  'same.txt': { text: 'same\n' },
  'changed.txt': { text: 'bravo\n' },
  'right-only.txt': { text: 'right\n' },
  nested: { 'deep.txt': { text: 'deep\n' } }
}

function findNode(node: DirectoryDiffNode, relativePath: string): DirectoryDiffNode | undefined {
  if (node.relativePath === relativePath) return node
  for (const child of node.children) {
    const hit = findNode(child, relativePath)
    if (hit !== undefined) return hit
  }
  return undefined
}

/** One flat directory of `count` identical files. */
function largeTree(count: number, text: string): FakeTree {
  const tree: Record<string, FakeFile> = {}
  for (let index = 0; index < count; index += 1) {
    tree[`file-${String(index).padStart(4, '0')}.txt`] = { text }
  }
  return tree
}

/** The same file set captured as a snapshot with inline bodies. */
function largeSnapshot(count: number, text: string): SnapshotDocument {
  return {
    schema: SNAPSHOT_SCHEMA,
    name: 'remote',
    exportedAt: EXPORTED_AT,
    entries: Array.from({ length: count }, (_, index) =>
      entry(`file-${String(index).padStart(4, '0')}.txt`, text)
    )
  }
}

function codedError(code: string): Error {
  return Object.assign(new Error(`${code}: too many open files`), { code })
}

/* ------------------------------------------------------------------ */
/* Serialization                                                       */
/* ------------------------------------------------------------------ */

describe('snapshot serialization', () => {
  it('round-trips the schema, metadata and every entry', () => {
    const text = serializeSnapshot(VALID_SNAPSHOT)
    const parsed = parseSnapshot(text)

    expect(parsed).toEqual(VALID_SNAPSHOT)
    expect(JSON.parse(text)).toBeTypeOf('object')
    expect(text.endsWith('\n')).toBe(true)
    expect(text).toContain('"schema": "opencompare.snapshot/v1"')
  })

  it('writes entries in canonical path order', () => {
    const unsorted: SnapshotDocument = {
      ...VALID_SNAPSHOT,
      entries: [...VALID_SNAPSHOT.entries].reverse()
    }
    const parsed = parseSnapshot(serializeSnapshot(unsorted))

    expect(parsed.entries.map((item) => item.path)).toEqual([
      'docs/readme.md',
      'src/app.ts'
    ])
  })

  it('omits content that was never inlined', () => {
    const metadataOnly: SnapshotDocument = {
      ...VALID_SNAPSHOT,
      entries: [{ path: 'src/app.ts', size: 10, modifiedMs: 0, sha256: sha256Hex('export {}\n') }]
    }
    const text = serializeSnapshot(metadataOnly)

    expect(text).not.toContain('"content"')
    expect(parseSnapshot(text).entries[0]).not.toHaveProperty('content')
  })
})

/* ------------------------------------------------------------------ */
/* Invalid input                                                       */
/* ------------------------------------------------------------------ */

describe('snapshot validation', () => {
  it('rejects malformed JSON', () => {
    expect(formatError(() => parseSnapshot('{"schema":')).code).toBe('invalid-json')
  })

  it('rejects an unsupported schema tag', () => {
    const text = docText([rawEntry('a.txt')], { schema: 'opencompare.snapshot/v2' })
    expect(formatError(() => parseSnapshot(text)).code).toBe('invalid-schema')
  })

  it('rejects missing or malformed root metadata', () => {
    expect(formatError(() => parseSnapshot(docText([rawEntry('a.txt')], { name: '' }))).code).toBe(
      'invalid-metadata'
    )
    expect(
      formatError(() => parseSnapshot(docText([rawEntry('a.txt')], { exportedAt: 'yesterday' })))
        .code
    ).toBe('invalid-metadata')
    expect(formatError(() => parseSnapshot(docText([], { entries: 'nope' }))).code).toBe(
      'invalid-entry'
    )
  })

  it('rejects entries with missing or mistyped required fields', () => {
    const missingHash = { path: 'a.txt', size: 1, modifiedMs: 0, content: 'x' }
    const badSize = { ...rawEntry('a.txt'), size: -1 }
    const badModified = { ...rawEntry('a.txt'), modifiedMs: 'now' }
    const badContent = { ...rawEntry('a.txt'), content: 42 }

    for (const raw of [missingHash, badSize, badModified, badContent]) {
      expect(formatError(() => parseSnapshot(docText([raw]))).code).toBe('invalid-entry')
    }
  })

  it('rejects absolute, escaping, empty-segment and empty paths', () => {
    for (const path of ['/etc/passwd', '../escape.txt', 'src/../../x', 'a//b', 'a/./b', 'a/', '']) {
      expect(formatError(() => parseSnapshot(docText([rawEntry(path)]))).code).toBe('invalid-path')
    }
  })

  it('rejects duplicate paths and files used as directories', () => {
    expect(
      formatError(() => parseSnapshot(docText([rawEntry('a.txt'), rawEntry('a.txt')]))).code
    ).toBe('duplicate-path')

    expect(
      formatError(() => parseSnapshot(docText([rawEntry('src'), rawEntry('src/app.ts')]))).code
    ).toBe('invalid-path')
  })

  it('rejects hash values that are not 64 lowercase hex characters', () => {
    for (const sha256 of ['abc', sha256Hex('x').toUpperCase(), 'z'.repeat(64)]) {
      const text = docText([{ ...rawEntry('a.txt'), sha256 }])
      expect(formatError(() => parseSnapshot(text)).code).toBe('invalid-hash')
    }
  })
})

/* ------------------------------------------------------------------ */
/* Building                                                            */
/* ------------------------------------------------------------------ */

describe('snapshot building', () => {
  const fs = createFakeFs({
    tree: {
      'README.md': { text: '# readme\n', modifiedMs: 1000 },
      src: {
        'app.ts': { text: 'export const app = 1\n', modifiedMs: 2000 },
        deep: { 'notes.md': { text: '# notes\n', modifiedMs: 3000 } }
      }
    }
  })

  it('hashes every file, skips directories and keeps scan metadata', async () => {
    const tree = await scanDirectory('/tree', fs.list)
    const snapshot = await buildSnapshot(tree, {
      name: 'tree',
      exportedAt: EXPORTED_AT,
      readTextFile: fs.readTextFile
    })

    expect(snapshot.schema).toBe(SNAPSHOT_SCHEMA)
    expect(snapshot.name).toBe('tree')
    expect(snapshot.exportedAt).toBe(EXPORTED_AT)
    expect(snapshot.entries.map((item) => item.path)).toEqual([
      'README.md',
      'src/app.ts',
      'src/deep/notes.md'
    ])

    const byPath = new Map(snapshot.entries.map((item) => [item.path, item]))
    expect(byPath.get('src/app.ts')).toMatchObject({
      size: 'export const app = 1\n'.length,
      modifiedMs: 2000,
      sha256: sha256Hex('export const app = 1\n'),
      content: 'export const app = 1\n'
    })
    expect(byPath.has('src')).toBe(false)
    expect(byPath.has('src/deep')).toBe(false)
  })

  it('omits bodies the caller does not inline', async () => {
    const tree = await scanDirectory('/tree', fs.list)
    const snapshot = await buildSnapshot(tree, {
      name: 'tree',
      exportedAt: EXPORTED_AT,
      readTextFile: fs.readTextFile,
      inlineContent: (relativePath) => relativePath.endsWith('.md')
    })

    const byPath = new Map(snapshot.entries.map((item) => [item.path, item]))
    expect(byPath.get('src/deep/notes.md')?.content).toBe('# notes\n')
    expect(byPath.get('src/app.ts')).not.toHaveProperty('content')
    expect(byPath.get('src/app.ts')?.sha256).toBe(sha256Hex('export const app = 1\n'))
  })

  it('produces text that parses back to the same document', async () => {
    const tree = await scanDirectory('/tree', fs.list)
    const snapshot = await buildSnapshot(tree, {
      name: 'tree',
      exportedAt: EXPORTED_AT,
      readTextFile: fs.readTextFile
    })

    expect(parseSnapshot(serializeSnapshot(snapshot))).toEqual(snapshot)
  })
})

/* ------------------------------------------------------------------ */
/* Snapshot as a comparison side                                       */
/* ------------------------------------------------------------------ */

describe('snapshot comparison', () => {
  const fs = createFakeFs({ left: LEFT_TREE, right: RIGHT_TREE })

  async function buildSide(path: string, name: string): Promise<SnapshotDocument> {
    const tree = await scanDirectory(path, fs.list)
    return buildSnapshot(tree, {
      name,
      exportedAt: EXPORTED_AT,
      readTextFile: fs.readTextFile
    })
  }

  it('maps a snapshot onto a scanned tree at its mount path', async () => {
    const snapshot = await buildSide('/right', 'remote')
    const tree = snapshotToScannedTree(snapshot, '/snapshots/right/remote')

    expect(tree.root.name).toBe('remote')
    expect(tree.root.path).toBe('/snapshots/right/remote')
    expect(tree.index.get('nested/deep.txt')).toMatchObject({
      kind: 'file',
      path: '/snapshots/right/remote/nested/deep.txt'
    })
    expect(tree.index.get('nested')).toMatchObject({ kind: 'directory' })
  })

  it('classifies a real directory against a snapshot', async () => {
    const snapshot = await buildSide('/right', 'remote')
    const comparison = await compareDirectorySides(
      { kind: 'directory', path: '/left' },
      { kind: 'snapshot', snapshot },
      fs.list,
      fs.readTextFile,
      createComparisonCache()
    )

    expect(comparison.counts).toEqual({ same: 2, added: 1, removed: 1, modified: 1 })
    expect(comparison.fileCount).toBe(5)
    expect(comparison.leftRoot).toBe('/left')
    expect(comparison.rightRoot).toBe('/snapshots/right/remote')
    expect(comparison.leftName).toBe('left')
    expect(comparison.rightName).toBe('remote')

    const changed = findNode(comparison.root, 'changed.txt')
    expect(changed?.status).toBe('modified')
    expect(findNode(comparison.root, 'same.txt')?.status).toBe('same')
    expect(findNode(comparison.root, 'right-only.txt')?.status).toBe('added')
    expect(findNode(comparison.root, 'left-only.txt')?.status).toBe('removed')

    const differenceCounts = countTreeFiles(filterDirectoryTree(comparison.root, 'differences'))
    expect(differenceCounts).toEqual({ same: 0, added: 1, removed: 1, modified: 1 })

    const projected = projectDirectoryTree(comparison.root, 'right')
    expect(projected?.children.map((child) => child.name)).toContain('right-only.txt')
    expect(projected?.children.map((child) => child.name)).not.toContain('left-only.txt')
  })

  it('classifies a snapshot against a real directory in the other direction', async () => {
    const snapshot = await buildSide('/left', 'left-remote')
    const comparison = await compareDirectorySides(
      { kind: 'snapshot', snapshot },
      { kind: 'directory', path: '/right' },
      fs.list,
      fs.readTextFile,
      createComparisonCache()
    )

    expect(comparison.counts).toEqual({ same: 2, added: 1, removed: 1, modified: 1 })
    expect(comparison.leftRoot).toBe('/snapshots/left/left-remote')
    expect(comparison.rightRoot).toBe('/right')
    expect(findNode(comparison.root, 'left-only.txt')?.status).toBe('removed')
    expect(findNode(comparison.root, 'right-only.txt')?.status).toBe('added')
  })

  it('classifies two snapshots and stays filterable', async () => {
    const leftSnapshot = await buildSide('/left', 'left-remote')
    const rightSnapshot = await buildSide('/right', 'right-remote')
    const comparison = await compareDirectorySides(
      { kind: 'snapshot', snapshot: leftSnapshot },
      { kind: 'snapshot', snapshot: rightSnapshot },
      fs.list,
      fs.readTextFile,
      createComparisonCache()
    )

    expect(comparison.counts).toEqual({ same: 2, added: 1, removed: 1, modified: 1 })
    expect(comparison.leftName).toBe('left-remote')
    expect(comparison.rightName).toBe('right-remote')
    expect(countTreeFiles(filterDirectoryTree(comparison.root, 'same'))).toEqual({
      same: 2,
      added: 0,
      removed: 0,
      modified: 0
    })
  })

  it('throws a distinguishable error when a needed body was not inlined', async () => {
    const tree = await scanDirectory('/right', fs.list)
    const metadataOnly = await buildSnapshot(tree, {
      name: 'remote',
      exportedAt: EXPORTED_AT,
      readTextFile: fs.readTextFile,
      inlineContent: () => false
    })

    await expect(
      compareDirectorySides(
        { kind: 'directory', path: '/left' },
        { kind: 'snapshot', snapshot: metadataOnly },
        fs.list,
        fs.readTextFile,
        createComparisonCache()
      )
    ).rejects.toMatchObject({ name: 'SnapshotContentError', code: 'content-not-inlined' })
  })

  it('bounds content reads for 3000 files against a mounted snapshot', async () => {
    const fs = createFakeFs({ left: largeTree(3000, 'shared\n') })
    const snapshot = largeSnapshot(3000, 'shared\n')
    let inFlight = 0
    let peak = 0
    let reads = 0
    const readTextFile = async (path: string): Promise<string> => {
      reads += 1
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await Promise.resolve()
      try {
        return await fs.readTextFile(path)
      } finally {
        inFlight -= 1
      }
    }

    const comparison = await compareDirectorySides(
      { kind: 'directory', path: '/left' },
      { kind: 'snapshot', snapshot },
      fs.list,
      readTextFile,
      createComparisonCache()
    )

    // Snapshot bodies come from the document, so only the directory side hits IO.
    expect(reads).toBe(3000)
    expect(peak).toBeLessThanOrEqual(DEFAULT_IO_CONCURRENCY)
    expect(peak).toBeGreaterThan(1)
    expect(comparison.counts).toEqual({ same: 3000, added: 0, removed: 0, modified: 0 })
    expect(comparison.fileCount).toBe(3000)
  })

  it('rejects file-handle exhaustion with a readable error for directory sides', async () => {
    const fs = createFakeFs({ left: { 'a.txt': { text: 'same' } } })
    const snapshot: SnapshotDocument = {
      schema: SNAPSHOT_SCHEMA,
      name: 'remote',
      exportedAt: EXPORTED_AT,
      entries: [entry('a.txt', 'same')]
    }
    const readTextFile = async (): Promise<string> => {
      throw codedError('EMFILE')
    }

    const outcome = await compareDirectorySides(
      { kind: 'directory', path: '/left' },
      { kind: 'snapshot', snapshot },
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

/* ------------------------------------------------------------------ */
/* Inline content                                                      */
/* ------------------------------------------------------------------ */

describe('snapshot content', () => {
  const document: SnapshotDocument = {
    schema: SNAPSHOT_SCHEMA,
    name: 'mixed',
    exportedAt: EXPORTED_AT,
    entries: [
      entry('inline.txt', 'hello\n'),
      { path: 'meta.txt', size: 6, modifiedMs: 0, sha256: sha256Hex('world\n') }
    ]
  }

  it('returns inline text by snapshot path', () => {
    expect(readSnapshotContent(document, 'inline.txt')).toBe('hello\n')
  })

  it('distinguishes missing files from files without inline content', () => {
    expect(contentError(() => readSnapshotContent(document, 'meta.txt')).code).toBe(
      'content-not-inlined'
    )
    expect(contentError(() => readSnapshotContent(document, 'absent.txt')).code).toBe(
      'not-found'
    )
  })
})
