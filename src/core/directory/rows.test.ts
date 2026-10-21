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
import { buildDirectoryRowModel, visibleDirectoryCounts } from './rows'

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
