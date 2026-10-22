import { describe, expect, it } from 'vitest'
import type { DirectoryComparison, DirectoryDiffNode, FileDiffStatus } from './compare'
import { FILE_DIFF_STATUSES } from './compare'
import {
  DIRECTORY_FILTERS,
  countTreeFiles,
  filterDirectoryTree,
  projectDirectoryTree
} from './filter'
import type { DirectoryFilter } from './filter'
import {
  LARGE_FILES_PER_DIRECTORY,
  LARGE_ROW_COUNT,
  LARGE_SIDE_FILES_PER_DIRECTORY,
  createLargeDirectoryComparison
} from '../../test/largeDirectory'
import {
  DIRECTORY_MAX_TREE_HEIGHT,
  DIRECTORY_ROW_HEIGHT,
  buildDirectoryRowModel,
  createDirectoryScrollMap,
  visibleDirectoryCounts
} from './rows'

interface Spec {
  readonly name: string
  readonly status?: FileDiffStatus
  /** The file exists on the left side (default true). */
  readonly left?: boolean
  /** The file exists on the right side (default true). */
  readonly right?: boolean
  readonly children?: readonly Spec[]
}

function directoryStatus(counts: Readonly<Record<FileDiffStatus, number>>): FileDiffStatus {
  if (counts.added === 0 && counts.removed === 0 && counts.modified === 0) return 'same'
  if (counts.modified > 0) return 'modified'
  if (counts.added > 0 && counts.removed > 0) return 'modified'
  if (counts.added > 0) return 'added'
  return 'removed'
}

function build(spec: Spec, relativePath: string): DirectoryDiffNode {
  const left = spec.left ?? true
  const right = spec.right ?? true
  if (spec.children === undefined) {
    const status = spec.status ?? 'same'
    return {
      name: spec.name,
      relativePath,
      kind: 'file',
      status,
      children: [],
      counts: { same: 0, added: 0, removed: 0, modified: 0, [status]: 1 },
      leftPath: left ? `/left/${relativePath}` : undefined,
      rightPath: right ? `/right/${relativePath}` : undefined
    }
  }

  const counts: Record<FileDiffStatus, number> = { same: 0, added: 0, removed: 0, modified: 0 }
  const children = spec.children.map((child) =>
    build(child, relativePath === '' ? child.name : `${relativePath}/${child.name}`)
  )
  for (const child of children) {
    for (const status of FILE_DIFF_STATUSES) counts[status] += child.counts[status]
  }
  return {
    name: spec.name,
    relativePath,
    kind: 'directory',
    status: directoryStatus(counts),
    children,
    counts,
    leftPath: left ? `/left/${relativePath}` : undefined,
    rightPath: right ? `/right/${relativePath}` : undefined
  }
}

function comparison(rootSpec: Spec): DirectoryComparison {
  const root = build(rootSpec, '')
  return {
    leftRoot: '/left',
    rightRoot: '/right',
    leftName: 'left',
    rightName: 'right',
    root,
    counts: root.counts,
    fileCount: FILE_DIFF_STATUSES.reduce((total, status) => total + root.counts[status], 0),
    leftSkipped: 0,
    rightSkipped: 0,
    skipped: 0
  }
}

/** A tree that exercises every projection and filtering edge. */
const TREE = comparison({
  name: 'root',
  children: [
    {
      name: 'docs',
      children: [
        { name: 'a.txt', status: 'same' },
        { name: 'b.txt', status: 'modified' },
        { name: 'left.txt', status: 'removed', right: false },
        { name: 'right.txt', status: 'added', left: false },
        { name: 'empty-both', children: [] },
        { name: 'empty-left', left: true, right: false, children: [] }
      ]
    },
    {
      name: 'code',
      children: [
        {
          name: 'nested',
          children: [
            { name: 'x.ts', status: 'modified' },
            { name: 'y.ts', status: 'removed', right: false }
          ]
        }
      ]
    },
    {
      name: 'only-right',
      left: false,
      children: [{ name: 'added.txt', status: 'added', left: false }]
    },
    {
      name: 'only-left',
      right: false,
      children: [{ name: 'removed.txt', status: 'removed', right: false }]
    }
  ]
})

/** Same node by path, taken from the untouched comparison tree. */
function originalsByPath(root: DirectoryDiffNode): Map<string, DirectoryDiffNode> {
  const nodes = new Map<string, DirectoryDiffNode>()
  function walk(node: DirectoryDiffNode): void {
    nodes.set(node.relativePath, node)
    for (const child of node.children) walk(child)
  }
  walk(root)
  return nodes
}

interface PlainRow {
  readonly relativePath: string
  readonly name: string
  readonly kind: 'file' | 'directory'
  readonly depth: number
  readonly status: FileDiffStatus
}

/** The pre-windowisation behaviour: filter → project → pre-order walk. */
function oracleRows(
  root: DirectoryDiffNode,
  filter: DirectoryFilter,
  side: 'left' | 'right',
  collapsed: readonly string[]
): PlainRow[] {
  const filtered = filterDirectoryTree(root, filter)
  const projected = filtered ? projectDirectoryTree(filtered, side) : null
  const collapsedSet = new Set(collapsed)
  const rows: PlainRow[] = []
  if (!projected) return rows

  function walk(node: DirectoryDiffNode, depth: number): void {
    rows.push({
      relativePath: node.relativePath,
      name: node.name,
      kind: node.kind,
      depth,
      status: node.status
    })
    if (node.kind === 'directory' && !collapsedSet.has(node.relativePath)) {
      for (const child of node.children) walk(child, depth + 1)
    }
  }

  walk(projected, 0)
  return rows
}

function rowPlain(root: DirectoryDiffNode, filter: DirectoryFilter, side: 'left' | 'right'): PlainRow[] {
  const model = buildDirectoryRowModel(root, filter, side, [])
  const rows: PlainRow[] = []
  for (let index = 0; index < model.length; index += 1) {
    const row = model.at(index)
    if (!row) throw new Error(`missing row ${index}`)
    rows.push({
      relativePath: row.node.relativePath,
      name: row.node.name,
      kind: row.node.kind,
      depth: row.depth,
      status: row.node.status
    })
  }
  return rows
}

describe('buildDirectoryRowModel', () => {
  it('matches filter → project → pre-order for every filter and side', () => {
    for (const filter of DIRECTORY_FILTERS) {
      for (const side of ['left', 'right'] as const) {
        const rows = rowPlain(TREE.root, filter, side)
        expect(rows).toEqual(oracleRows(TREE.root, filter, side, []))
        expect(buildDirectoryRowModel(TREE.root, filter, side, []).length).toBe(rows.length)
      }
    }
  })

  it('keeps the root as row 0 and lets empty projected directories survive', () => {
    const rows = rowPlain(TREE.root, 'left-only', 'right')
    // `docs` keeps its row because the left side has a removed file below it,
    // even though nothing survives the projection on the right.
    expect(rows[0]).toMatchObject({ relativePath: '', depth: 0 })
    expect(rows.map((row) => row.relativePath)).toContain('docs')
    expect(rows.map((row) => row.relativePath)).not.toContain('docs/empty-both')
  })

  it('matches the pre-order walk for arbitrary collapsed sets', () => {
    const collapsedSets: readonly (readonly string[])[] = [
      ['docs'],
      ['docs', 'code'],
      ['docs', 'code/nested'],
      ['only-left'],
      ['', 'docs/nested']
    ]
    for (const filter of DIRECTORY_FILTERS) {
      for (const side of ['left', 'right'] as const) {
        for (const collapsed of collapsedSets) {
          const model = buildDirectoryRowModel(TREE.root, filter, side, collapsed)
          const rows: PlainRow[] = []
          for (let index = 0; index < model.length; index += 1) {
            const row = model.at(index)
            if (!row) throw new Error(`missing row ${index}`)
            rows.push({
              relativePath: row.node.relativePath,
              name: row.node.name,
              kind: row.node.kind,
              depth: row.depth,
              status: row.node.status
            })
          }
          expect(rows).toEqual(oracleRows(TREE.root, filter, side, collapsed))
        }
      }
    }
  })

  it('keeps the collapsed directory row in place and drops only its subtree', () => {
    const expanded = rowPlain(TREE.root, 'all', 'left')
    const collapsed = buildDirectoryRowModel(TREE.root, 'all', 'left', ['code'])

    const index = expanded.findIndex((row) => row.relativePath === 'code')
    const row = collapsed.at(index)
    expect(row?.node.relativePath).toBe('code')
    expect(row?.depth).toBe(1)
    expect(row?.open).toBe(false)

    const paths: string[] = []
    for (let cursor = 0; cursor < collapsed.length; cursor += 1) {
      const entry = collapsed.at(cursor)
      if (entry) paths.push(entry.node.relativePath)
    }
    expect(paths).not.toContain('code/nested')
    expect(paths.filter((path) => path.startsWith('code/'))).toEqual([])
    // The row still sits where it did when expanded.
    expect(paths.slice(0, index)).toEqual(expanded.slice(0, index).map((entry) => entry.relativePath))
  })

  it('references the comparison nodes instead of cloning them', () => {
    const originals = originalsByPath(TREE.root)
    for (const filter of DIRECTORY_FILTERS) {
      for (const side of ['left', 'right'] as const) {
        const model = buildDirectoryRowModel(TREE.root, filter, side, [])
        for (let index = 0; index < model.length; index += 1) {
          const row = model.at(index)
          expect(row?.node).toBe(originals.get(row?.node.relativePath ?? ''))
        }
      }
    }
  })

  it('returns undefined past the end', () => {
    const model = buildDirectoryRowModel(TREE.root, 'all', 'left', [])
    expect(model.at(-1)).toBeUndefined()
    expect(model.at(model.length)).toBeUndefined()
  })
})

describe('visibleDirectoryCounts', () => {
  it('matches counting the filtered tree for every filter', () => {
    for (const filter of DIRECTORY_FILTERS) {
      expect(visibleDirectoryCounts(TREE.root, filter)).toEqual(
        countTreeFiles(filterDirectoryTree(TREE.root, filter))
      )
    }
  })

  it('reports zeros when no file matches the filter', () => {
    const modifiedOnly = comparison({
      name: 'root',
      children: [{ name: 'a.txt', status: 'modified' }]
    })
    expect(visibleDirectoryCounts(modifiedOnly.root, 'same')).toEqual({
      same: 0,
      added: 0,
      removed: 0,
      modified: 0
    })
    expect(visibleDirectoryCounts(modifiedOnly.root, 'differences')).toEqual({
      same: 0,
      added: 0,
      removed: 0,
      modified: 1
    })
  })
})

/* ------------------------------------------------------------------ */
/* Scroll mapping (browser height cap)                                 */
/* ------------------------------------------------------------------ */

describe('createDirectoryScrollMap', () => {
  const VIEWPORT = 640
  /** Exactly the rows whose natural height still fits below 2^24. */
  const FITTING_ROWS = Math.floor(DIRECTORY_MAX_TREE_HEIGHT / DIRECTORY_ROW_HEIGHT)

  it('is the identity while the natural height fits the browser cap', () => {
    expect(FITTING_ROWS * DIRECTORY_ROW_HEIGHT).toBeLessThanOrEqual(DIRECTORY_MAX_TREE_HEIGHT)
    expect((FITTING_ROWS + 1) * DIRECTORY_ROW_HEIGHT).toBeGreaterThan(DIRECTORY_MAX_TREE_HEIGHT)

    for (const rowCount of [0, 1, 5_000, FITTING_ROWS]) {
      const map = createDirectoryScrollMap(rowCount, VIEWPORT)
      expect(map.scaled).toBe(false)
      expect(map.contentHeight).toBe(rowCount * DIRECTORY_ROW_HEIGHT)
      expect(map.maxScrollOffset).toBe(Math.max(0, rowCount * DIRECTORY_ROW_HEIGHT - VIEWPORT))
      for (const index of [0, Math.floor(rowCount / 2), rowCount - 1]) {
        if (index < 0) continue
        expect(map.offsetForIndex(index)).toBe(index * DIRECTORY_ROW_HEIGHT)
      }
    }

    const map = createDirectoryScrollMap(FITTING_ROWS, VIEWPORT)
    expect(map.rowPositionForOffset(4_800)).toBe(200)
    expect(map.indexForOffset(4_800)).toBe(200)
    expect(map.rowTop(206, 4_800)).toBe(206 * DIRECTORY_ROW_HEIGHT)
    const range = map.visibleRange(4_800, 10)
    expect(range.start).toBe(190)
    expect(range.end).toBe(237)
  })

  it('switches to the compressed map at the first row above the cap', () => {
    expect(createDirectoryScrollMap(FITTING_ROWS, VIEWPORT).scaled).toBe(false)
    const overflow = createDirectoryScrollMap(FITTING_ROWS + 1, VIEWPORT)
    expect(overflow.scaled).toBe(true)
    expect(overflow.contentHeight).toBe(DIRECTORY_MAX_TREE_HEIGHT)
  })

  it('caps 1,516,096 rows below 2^24 and keeps every index reachable', () => {
    const rowCount = 1_516_096
    const map = createDirectoryScrollMap(rowCount, VIEWPORT)

    expect(map.scaled).toBe(true)
    expect(map.contentHeight).toBe(DIRECTORY_MAX_TREE_HEIGHT)
    expect(map.contentHeight).toBeLessThan(2 ** 24)
    expect(map.maxScrollOffset).toBe(DIRECTORY_MAX_TREE_HEIGHT - VIEWPORT)
    // No dead zone: the last row lands on the last reachable pixel.
    expect(map.offsetForIndex(rowCount - 1)).toBeLessThanOrEqual(map.maxScrollOffset)
    expect(map.offsetForIndex(rowCount - 1)).toBeCloseTo(map.maxScrollOffset, 6)
    // At the bottom the viewport's top row is exactly one screen of rows back.
    expect(map.indexForOffset(map.maxScrollOffset)).toBe(
      rowCount - Math.ceil(VIEWPORT / DIRECTORY_ROW_HEIGHT)
    )

    let previous = -1
    for (let index = 0; index < rowCount; index += 997) {
      const offset = map.offsetForIndex(index)
      expect(offset).toBeGreaterThan(previous)
      previous = offset
      const range = map.visibleRange(offset, 10)
      expect(range.start).toBeLessThanOrEqual(index)
      expect(range.end).toBeGreaterThanOrEqual(index)
      // The mapped row is inside the viewport, not merely somewhere in content.
      const top = map.rowTop(index, offset)
      expect(top).toBeGreaterThanOrEqual(offset - 0.001)
      expect(top).toBeLessThanOrEqual(offset + VIEWPORT)
    }
    for (const base of [0, Math.floor(rowCount / 4), Math.floor(rowCount / 2), rowCount - 2]) {
      expect(map.offsetForIndex(base + 1)).toBeGreaterThan(map.offsetForIndex(base))
    }

    // At the maximum offset the final row is the one at the bottom of the view.
    const tail = map.visibleRange(map.maxScrollOffset, 10)
    expect(tail.end).toBe(rowCount - 1)
    expect(map.rowTop(rowCount - 1, map.maxScrollOffset)).toBeCloseTo(
      map.maxScrollOffset + VIEWPORT - DIRECTORY_ROW_HEIGHT,
      6
    )
    expect(tail.end - tail.start + 1).toBeLessThanOrEqual(80)
  })
})

interface BigPlainRow {
  readonly relativePath: string
  readonly name: string
  readonly kind: 'file' | 'directory'
  readonly depth: number
  readonly status: FileDiffStatus
}

/** Lazy pre-order over filter → project, so 700k rows never sit in an array. */
function* bigOracleRows(
  root: DirectoryDiffNode,
  filter: DirectoryFilter,
  side: 'left' | 'right',
  collapsed: readonly string[]
): Generator<BigPlainRow> {
  const filtered = filterDirectoryTree(root, filter)
  const projected = filtered ? projectDirectoryTree(filtered, side) : null
  if (!projected) return
  const collapsedSet = new Set(collapsed)
  const stack: { node: DirectoryDiffNode; depth: number }[] = [{ node: projected, depth: 0 }]
  while (stack.length > 0) {
    const { node, depth } = stack.pop() as { node: DirectoryDiffNode; depth: number }
    yield { relativePath: node.relativePath, name: node.name, kind: node.kind, depth, status: node.status }
    if (node.kind === 'directory' && !collapsedSet.has(node.relativePath)) {
      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        stack.push({ node: node.children[index], depth: depth + 1 })
      }
    }
  }
}

function sampledIndices(length: number): number[] {
  const indices = new Set<number>([
    0,
    1,
    Math.floor(length / 4),
    Math.floor(length / 2),
    Math.floor((length * 3) / 4),
    length - 2,
    length - 1
  ])
  for (let step = 1; step <= 20; step += 1) indices.add(Math.floor((length * step) / 21))
  return [...indices].filter((index) => index >= 0 && index < length).sort((a, b) => a - b)
}

describe('700k-row comparison', () => {
  let cached: DirectoryComparison | undefined
  function big(): DirectoryComparison {
    cached ??= createLargeDirectoryComparison()
    return cached
  }

  it('matches filter → project → pre-order for every filter and side', () => {
    const fixture = big()
    expect(buildDirectoryRowModel(fixture.root, 'all', 'left', []).length).toBe(LARGE_ROW_COUNT)
    expect(buildDirectoryRowModel(fixture.root, 'all', 'right', []).length).toBe(LARGE_ROW_COUNT)

    for (const filter of DIRECTORY_FILTERS) {
      for (const side of ['left', 'right'] as const) {
        const model = buildDirectoryRowModel(fixture.root, filter, side, [])
        const samples = new Set(sampledIndices(model.length))
        let index = 0
        for (const expected of bigOracleRows(fixture.root, filter, side, [])) {
          if (samples.has(index)) {
            const row = model.at(index)
            expect(row?.node.relativePath).toBe(expected.relativePath)
            expect(row?.node.name).toBe(expected.name)
            expect(row?.node.kind).toBe(expected.kind)
            expect(row?.node.status).toBe(expected.status)
            expect(row?.depth).toBe(expected.depth)
          }
          index += 1
        }
        expect(index).toBe(model.length)
      }
    }
  }, 180_000)

  it('keeps the four-state counts identical to counting the filtered tree', () => {
    const fixture = big()
    for (const filter of DIRECTORY_FILTERS) {
      expect(visibleDirectoryCounts(fixture.root, filter)).toEqual(
        countTreeFiles(filterDirectoryTree(fixture.root, filter))
      )
    }
  }, 180_000)

  it('collapses and re-expands a 100k-entry directory without moving the other rows', () => {
    const fixture = big()
    const collapsedPath = 'dir-3'
    // Pre-order: root, then each directory row followed by its visible files.
    const directoryIndex = 1 + 3 * (1 + LARGE_SIDE_FILES_PER_DIRECTORY)
    const expanded = buildDirectoryRowModel(fixture.root, 'all', 'left', [])
    const collapsed = buildDirectoryRowModel(fixture.root, 'all', 'left', [collapsedPath])

    expect(expanded.length).toBe(LARGE_ROW_COUNT)
    expect(collapsed.length).toBe(LARGE_ROW_COUNT - LARGE_SIDE_FILES_PER_DIRECTORY)
    expect(expanded.at(directoryIndex)?.open).toBe(true)
    expect(collapsed.at(directoryIndex)?.open).toBe(false)
    // The collapsed directory keeps its own row; its subtree is what disappears.
    expect(collapsed.at(directoryIndex)?.node.relativePath).toBe(collapsedPath)
    expect(collapsed.at(directoryIndex + 1)?.node.relativePath).toBe('dir-4')
    expect(
      expanded.at(directoryIndex + LARGE_SIDE_FILES_PER_DIRECTORY)?.node.relativePath
    ).toBe(`${collapsedPath}/file-${LARGE_FILES_PER_DIRECTORY - 1}.ts`)
    for (const index of [0, 1, directoryIndex - 1]) {
      expect(collapsed.at(index)?.node).toBe(expanded.at(index)?.node)
    }
    // Everything after the hidden subtree keeps its order, one subtree earlier.
    expect(collapsed.at(directoryIndex + 1)?.node).toBe(
      expanded.at(directoryIndex + 1 + LARGE_SIDE_FILES_PER_DIRECTORY)?.node
    )

    const reopened = buildDirectoryRowModel(fixture.root, 'all', 'left', [])
    for (const index of sampledIndices(expanded.length)) {
      const before = expanded.at(index)
      const after = reopened.at(index)
      expect(after?.node).toBe(before?.node)
      expect(after?.depth).toBe(before?.depth)
      expect(after?.open).toBe(before?.open)
    }

    // The 100,000th child of the re-expanded directory is addressable again and
    // falls inside the render window at its mapped scroll offset.
    const lastChild = directoryIndex + LARGE_SIDE_FILES_PER_DIRECTORY
    const map = createDirectoryScrollMap(expanded.length, 640)
    expect(map.offsetForIndex(lastChild)).toBeLessThanOrEqual(map.maxScrollOffset)
    const range = map.visibleRange(map.offsetForIndex(lastChild), 10)
    expect(range.start).toBeLessThanOrEqual(lastChild)
    expect(range.end).toBeGreaterThanOrEqual(lastChild)
    expect(range.end - range.start + 1).toBeLessThanOrEqual(80)
  }, 180_000)
})
