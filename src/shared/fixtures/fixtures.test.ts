import { diff3MergeRegions } from 'node-diff3'
import Papa from 'papaparse'
import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'
import {
  CODE_SCENE,
  CSV_SCENE,
  DIRECTORY_SCENE,
  SAMPLE_FIXTURE_FILES,
  STRUCTURED_SCENE,
  buildSampleSessions
} from './index'
import type { CsvSample, DiffStatus, DirectoryNode } from './types'

function treeDepth(node: DirectoryNode): number {
  if (node.kind === 'file') return 1
  return 1 + Math.max(...(node.children ?? []).map(treeDepth))
}

function collectStatuses(node: DirectoryNode, out: Set<DiffStatus>): Set<DiffStatus> {
  out.add(node.status)
  for (const child of node.children ?? []) collectStatuses(child, out)
  return out
}

interface ParsedCsv {
  readonly header: string[]
  readonly rows: string[][]
}

function parseCsv(sample: CsvSample): ParsedCsv {
  const result = Papa.parse<string[]>(sample.text.trimEnd(), { delimiter: sample.delimiter })
  const [header, ...rows] = result.data
  return { header, rows }
}

function column(parsed: ParsedCsv, name: string): string[] {
  const index = parsed.header.indexOf(name)
  if (index < 0) throw new Error(`Sample is missing the "${name}" column.`)
  return parsed.rows.map((row) => row[index] ?? '')
}

function dig(root: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((node, key) => {
    if (node === null || typeof node !== 'object') return undefined
    return (node as Record<string, unknown>)[key]
  }, root)
}

function keyOrder(root: unknown): string {
  if (root === null || typeof root !== 'object') return ''
  return Object.keys(root as Record<string, unknown>).join(',')
}

const splitLines = (text: string): string[] => text.trimEnd().split('\n')

describe('scene A — directory trees', () => {
  it('nests at least three levels and covers every diff semantics', () => {
    expect(treeDepth(DIRECTORY_SCENE.left)).toBeGreaterThanOrEqual(3)
    expect(treeDepth(DIRECTORY_SCENE.right)).toBeGreaterThanOrEqual(3)
    expect(treeDepth(DIRECTORY_SCENE.scattered)).toBeGreaterThanOrEqual(3)

    const statuses = collectStatuses(DIRECTORY_SCENE.left, new Set<DiffStatus>())
    collectStatuses(DIRECTORY_SCENE.right, statuses)

    expect([...statuses].sort()).toEqual(['added', 'modified', 'removed', 'same'])
    expect(DIRECTORY_SCENE.composition.modified).toBeGreaterThan(0)
    expect(DIRECTORY_SCENE.composition.added).toBeGreaterThan(0)
    expect(DIRECTORY_SCENE.composition.removed).toBeGreaterThan(0)
  })
})

describe('scene B — code samples', () => {
  it('ships a distinct two-column diff pair', () => {
    expect(CODE_SCENE.diff.left.text).not.toBe(CODE_SCENE.diff.right.text)
    expect(CODE_SCENE.diff.left.path).toBe('/samples/code/summary.left.ts')
    expect(CODE_SCENE.diff.right.path).toBe('/samples/code/summary.right.ts')
  })

  it('produces at least two conflict regions for base / ours / theirs', () => {
    const regions = diff3MergeRegions(
      splitLines(CODE_SCENE.merge.ours.text),
      splitLines(CODE_SCENE.merge.base.text),
      splitLines(CODE_SCENE.merge.theirs.text)
    )
    const conflicts = regions.filter((region) => !region.stable)

    expect(conflicts.length).toBeGreaterThanOrEqual(2)
    expect(conflicts.length).toBe(CODE_SCENE.composition.conflict)
  })
})

describe('scene C — CSV / TSV reconciliation', () => {
  it('carries 1,200+ rows, shuffled keys, a column offset and every row outcome', () => {
    const left = parseCsv(CSV_SCENE.left)
    const right = parseCsv(CSV_SCENE.right)

    expect(left.rows.length).toBeGreaterThanOrEqual(1200)
    expect(right.header.length).toBe(left.header.length + 1)
    expect(left.header).not.toContain('region')
    expect(right.header).toContain('region')

    const leftKeys = column(left, 'order_id')
    const rightKeys = column(right, 'order_id')
    expect(leftKeys.join('|')).not.toBe(rightKeys.join('|'))

    const leftKeySet = new Set(leftKeys)
    const rightKeySet = new Set(rightKeys)
    expect(leftKeys.filter((key) => !rightKeySet.has(key)).length).toBe(
      CSV_SCENE.composition.removed
    )
    expect(rightKeys.filter((key) => !leftKeySet.has(key)).length).toBe(
      CSV_SCENE.composition.added
    )

    const leftQty = column(left, 'qty')
    const leftStatus = column(left, 'status')
    const untouched = new Map(
      leftKeys.map((key, index) => [key, `${leftQty[index]}|${leftStatus[index]}`])
    )
    const rightQty = column(right, 'qty')
    const rightStatus = column(right, 'status')
    const modified = rightKeys.filter((key, index) => {
      const before = untouched.get(key)
      return before !== undefined && before !== `${rightQty[index]}|${rightStatus[index]}`
    })

    expect(modified.length).toBe(CSV_SCENE.composition.modified)
    expect(modified.length).toBeGreaterThan(0)
  })
})

describe('scene D — structured samples', () => {
  it('shuffles key order and changes deep nested values and types', () => {
    const left = JSON.parse(STRUCTURED_SCENE.json.left.text) as unknown
    const right = JSON.parse(STRUCTURED_SCENE.json.right.text) as unknown

    expect(keyOrder(left)).not.toBe(keyOrder(right))
    expect(dig(left, ['service', 'features', 'limits', 'maxBytes'])).toBeUndefined()
    expect(dig(right, ['service', 'features', 'limits', 'maxBytes'])).toBe(104857600)
    expect(typeof dig(left, ['service', 'version'])).toBe('number')
    expect(typeof dig(right, ['service', 'version'])).toBe('string')

    const yamlLeft = parseYaml(STRUCTURED_SCENE.yaml.left.text) as unknown
    const yamlRight = parseYaml(STRUCTURED_SCENE.yaml.right.text) as unknown

    expect(keyOrder(yamlLeft)).not.toBe(keyOrder(yamlRight))
    expect(dig(yamlLeft, ['service', 'resources', 'disk'])).toBeUndefined()
    expect(dig(yamlRight, ['service', 'resources', 'disk'])).toBe('64Gi')
    expect(dig(yamlRight, ['service', 'health', 'port'])).toBe(8080)
  })
})

describe('sample library', () => {
  it('builds exactly one session per scene', () => {
    const sessions = buildSampleSessions()

    expect(sessions.map((session) => session.scene).sort()).toEqual([
      'code',
      'csv',
      'directory',
      'structured'
    ])
    expect(new Set(sessions.map((session) => session.id)).size).toBe(4)
    expect(sessions.find((session) => session.scene === 'code')?.columns).toBe(3)
    expect(sessions.every((session) => session.stats.length > 0)).toBe(true)
  })

  it('exposes every sample as a library file under /samples', () => {
    const paths = SAMPLE_FIXTURE_FILES.map((file) => file.path)

    expect(paths.every((path) => path.startsWith('/samples/'))).toBe(true)
    expect(paths).toContain(CSV_SCENE.left.path)
    expect(paths).toContain(CODE_SCENE.merge.theirs.path)
    expect(paths).toContain('/samples/directory/baseline/src/core/engine.ts')
    expect(paths).toContain('/samples/directory/incoming/misc/core/engine.ts')
  })
})
