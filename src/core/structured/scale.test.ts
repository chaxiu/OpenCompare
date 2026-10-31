/**
 * Acceptance evidence for ≥5 MB real-file structured comparison.
 *
 * Every sample is generated deterministically, written through `node:fs` into
 * `os.tmpdir()` and read back, so the engine is exercised on the same bytes a
 * user opens — never on an in-memory shortcut. The comparison uses only the
 * shipped `parseStructured` / `diffStructured` / `createStructuredLocator`.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { diffStructured } from './diff'
import type { StructuredDiffResult, StructuredStatus, StructuredValueType } from './diff'
import { createStructuredLocator } from './locate'
import type { SourceRange, StructuredLocator } from './locate'
import { parseStructured } from './parse'

const TARGET_BYTES = 5 * 1024 * 1024
const DEPTH = 8
/** Explicit completion budget for read + diff + full locate; the vitest timeout is separate. */
const ELAPSED_BUDGET_MS = 20_000
const TEST_TIMEOUT_MS = 60_000

/** A leaf wrapped in `levels` named object layers, so the chain is ≥8 deep. */
function deepChain(levels: number, seed: number): unknown {
  let node: unknown = { value: seed, note: `leaf-${seed}` }
  for (let level = levels; level >= 1; level -= 1) {
    node = { [`level${level}`]: node, hint: `h${level}-${seed}` }
  }
  return node
}

function buildItems(count: number): unknown[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    name: `SCALE_ITEM_${index}`,
    deep: deepChain(DEPTH, index),
    tags: [`tag-${index}-a`, `tag-${index}-b`],
    flags: { active: index % 2 === 0, rank: index % 7 }
  }))
}

/**
 * Probe region: one node per real-difference case. Values double as unique
 * markers, so a located line can be tied back to exactly one path.
 */
function leftProbes(): Record<string, unknown> {
  return {
    removedOnly: 'SCALE_REMOVED_VALUE',
    modifiedValue: 111,
    typeChangedScalar: 42,
    typeChangedContainer: 'plain-container',
    arrayAdded: ['SCALE_ARRAY_ADDED_0', 'SCALE_ARRAY_ADDED_1'],
    arrayRemoved: [
      'SCALE_ARRAY_REMOVED_0',
      'SCALE_ARRAY_REMOVED_1',
      'SCALE_ARRAY_REMOVED_2'
    ],
    arrayModified: ['SCALE_ARRAY_MODIFIED_0', 'SCALE_ARRAY_MODIFIED_LEFT_TOKEN']
  }
}

function rightProbes(): Record<string, unknown> {
  return {
    addedOnly: 'SCALE_ADDED_VALUE',
    modifiedValue: 222,
    typeChangedScalar: '42',
    typeChangedContainer: { mode: 'container', size: 3 },
    arrayAdded: ['SCALE_ARRAY_ADDED_0', 'SCALE_ARRAY_ADDED_1', 'SCALE_ARRAY_ADDED_2'],
    arrayRemoved: ['SCALE_ARRAY_REMOVED_0', 'SCALE_ARRAY_REMOVED_1'],
    arrayModified: ['SCALE_ARRAY_MODIFIED_0', 'SCALE_ARRAY_MODIFIED_RIGHT_TOKEN']
  }
}

function document(side: 'left' | 'right', itemCount: number): Record<string, unknown> {
  return {
    meta: { title: 'SCALE_BASE_DOCUMENT', version: 3, deep: deepChain(DEPTH, -1) },
    probes: side === 'left' ? leftProbes() : rightProbes(),
    items: buildItems(itemCount)
  }
}

interface ExpectedChange {
  readonly path: string
  readonly status: StructuredStatus
  readonly left?: string
  readonly right?: string
  readonly leftType?: StructuredValueType
  readonly rightType?: StructuredValueType
  /** Unique token on the left side's source line; absent when left lacks the node. */
  readonly leftToken?: string
  /** Unique token on the right side's source line; absent when right lacks the node. */
  readonly rightToken?: string
}

const EXPECTED: readonly ExpectedChange[] = [
  {
    path: '/probes/addedOnly',
    status: 'added',
    right: '"SCALE_ADDED_VALUE"',
    rightType: 'string',
    rightToken: 'SCALE_ADDED_VALUE'
  },
  {
    path: '/probes/removedOnly',
    status: 'removed',
    left: '"SCALE_REMOVED_VALUE"',
    leftType: 'string',
    leftToken: 'SCALE_REMOVED_VALUE'
  },
  {
    path: '/probes/modifiedValue',
    status: 'modified',
    left: '111',
    right: '222',
    leftType: 'number',
    rightType: 'number',
    leftToken: 'modifiedValue',
    rightToken: 'modifiedValue'
  },
  {
    path: '/probes/typeChangedScalar',
    status: 'typeChanged',
    left: '42',
    right: '"42"',
    leftType: 'number',
    rightType: 'string',
    leftToken: 'typeChangedScalar',
    rightToken: 'typeChangedScalar'
  },
  {
    path: '/probes/typeChangedContainer',
    status: 'typeChanged',
    left: '"plain-container"',
    right: '{2 个键}',
    leftType: 'string',
    rightType: 'object',
    leftToken: 'plain-container',
    rightToken: 'typeChangedContainer'
  },
  {
    path: '/probes/arrayAdded/2',
    status: 'added',
    right: '"SCALE_ARRAY_ADDED_2"',
    rightType: 'string',
    rightToken: 'SCALE_ARRAY_ADDED_2'
  },
  {
    path: '/probes/arrayRemoved/2',
    status: 'removed',
    left: '"SCALE_ARRAY_REMOVED_2"',
    leftType: 'string',
    leftToken: 'SCALE_ARRAY_REMOVED_2'
  },
  {
    path: '/probes/arrayModified/1',
    status: 'modified',
    left: '"SCALE_ARRAY_MODIFIED_LEFT_TOKEN"',
    right: '"SCALE_ARRAY_MODIFIED_RIGHT_TOKEN"',
    leftType: 'string',
    rightType: 'string',
    leftToken: 'SCALE_ARRAY_MODIFIED_LEFT_TOKEN',
    rightToken: 'SCALE_ARRAY_MODIFIED_RIGHT_TOKEN'
  }
]

/**
 * Semantically identical JSONC rendering of `value`: reversed key order,
 * four-space indentation, block / line comments, blank lines and trailing
 * commas. Everything the diff engine must normalize away.
 */
function noisyJson(value: unknown, width = 4): string {
  const unit = ' '.repeat(width)
  function render(node: unknown, depth: number): string {
    const pad = unit.repeat(depth + 1)
    if (Array.isArray(node)) {
      if (node.length === 0) return '[]'
      const body = node
        .map((item, index) => `${pad}/* item ${index} */ ${render(item, depth + 1)},`)
        .join('\n\n')
      return `[\n${body}\n${unit.repeat(depth)}]`
    }
    if (node !== null && typeof node === 'object') {
      const members = Object.entries(node as Record<string, unknown>).reverse()
      if (members.length === 0) return '{}'
      const body = members
        .map(
          ([key, child]) =>
            `${pad}${JSON.stringify(key)}: ${render(child, depth + 1)}, // ${key}`
        )
        .join('\n\n')
      return `{\n${body}\n${unit.repeat(depth)}}`
    }
    return JSON.stringify(node) ?? 'null'
  }
  return render(value, 0)
}

const YAML_LEFT = `# scale evidence: left side
service:
  name: opencompare
  version: 2
  enabled: true
  features:
    limits:
      levels:
        tier:
          profile:
            weights:
              - 1
              - 2
              - 3
            banner: plain text
            labels:
              alpha: one
              beta: two
telemetry:
  enabled: false
`

const YAML_RIGHT = `# scale evidence: right side
# same semantics, four-space indentation, quoted scalars, blank lines
service:
    features:
        limits:
            levels:
                tier:
                    profile:
                        labels:
                            "beta": 'two'
                            alpha: one

                        banner: "plain text"
                        weights:
                            - 1
                            - 2
                            - 3
    version: 2
    enabled: true
    name: "opencompare"

telemetry:
    enabled: false
`

/** Deepest container nesting of a parsed value (root container counts as 1). */
function maxContainerDepth(value: unknown): number {
  if (Array.isArray(value)) {
    return 1 + value.reduce<number>((max, item) => Math.max(max, maxContainerDepth(item)), 0)
  }
  if (value !== null && typeof value === 'object') {
    return (
      1 +
      Object.values(value as Record<string, unknown>).reduce<number>(
        (max, child) => Math.max(max, maxContainerDepth(child)),
        0
      )
    )
  }
  return 0
}

function occurrences(text: string, token: string): number {
  let count = 0
  let index = text.indexOf(token)
  while (index >= 0) {
    count += 1
    index = text.indexOf(token, index + token.length)
  }
  return count
}

function lineOf(lines: readonly string[], token: string): number {
  const index = lines.findIndex((line) => line.includes(token))
  if (index < 0) throw new Error(`source line not found: ${token}`)
  return index + 1
}

function parentPath(path: string): string {
  return path.slice(0, path.lastIndexOf('/'))
}

function spanOf(range: SourceRange): Omit<SourceRange, 'exact'> {
  return {
    startLine: range.startLine,
    startColumn: range.startColumn,
    endLine: range.endLine,
    endColumn: range.endColumn,
    path: range.path
  }
}

/** Deterministically sizes the document so the serialized bytes reach the target. */
function sizedDocument(): { value: Record<string, unknown>; itemCount: number } {
  const probe = document('left', 128)
  const perItem = Buffer.byteLength(JSON.stringify(probe, null, 2), 'utf8') / 128
  let itemCount = Math.ceil((TARGET_BYTES * 1.05) / perItem)
  let value = document('left', itemCount)
  while (Buffer.byteLength(JSON.stringify(value, null, 2), 'utf8') < TARGET_BYTES) {
    itemCount += 100
    value = document('left', itemCount)
  }
  return { value, itemCount }
}

let directory = ''
let leftPath = ''
let rightPath = ''
let noisePath = ''
let yamlLeftPath = ''
let yamlRightPath = ''
let leftText = ''
let rightText = ''
let noiseText = ''
let yamlLeftText = ''
let yamlRightText = ''
let realDiff: StructuredDiffResult
let leftLocator: StructuredLocator
let rightLocator: StructuredLocator

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'opencompare-scale-'))
  leftPath = join(directory, 'scale.left.json')
  rightPath = join(directory, 'scale.right.json')
  noisePath = join(directory, 'scale.noise.json')
  yamlLeftPath = join(directory, 'scale.left.yaml')
  yamlRightPath = join(directory, 'scale.right.yaml')

  const sized = sizedDocument()
  writeFileSync(leftPath, JSON.stringify(sized.value, null, 2))
  writeFileSync(rightPath, JSON.stringify(document('right', sized.itemCount), null, 2))
  writeFileSync(noisePath, noisyJson(sized.value))
  writeFileSync(yamlLeftPath, YAML_LEFT)
  writeFileSync(yamlRightPath, YAML_RIGHT)

  leftText = readFileSync(leftPath, 'utf8')
  rightText = readFileSync(rightPath, 'utf8')
  noiseText = readFileSync(noisePath, 'utf8')
  yamlLeftText = readFileSync(yamlLeftPath, 'utf8')
  yamlRightText = readFileSync(yamlRightPath, 'utf8')

  realDiff = diffStructured(leftText, rightText, 'json')
  leftLocator = createStructuredLocator(leftText, 'json')
  rightLocator = createStructuredLocator(rightText, 'json')
}, TEST_TIMEOUT_MS)

afterAll(() => {
  if (directory) rmSync(directory, { recursive: true, force: true })
})

describe('5 MB JSON pair on disk', () => {
  it('reads back both sides at >=5 MB, >1000 lines and depth >=8', () => {
    for (const text of [leftText, rightText]) {
      expect(Buffer.byteLength(text, 'utf8')).toBeGreaterThanOrEqual(TARGET_BYTES)
      expect(text.split('\n').length).toBeGreaterThan(1000)
      expect(maxContainerDepth(parseStructured(text, 'json'))).toBeGreaterThanOrEqual(DEPTH)
    }
  })

  it('reports zero non-same entries when only JSON surface formatting differs', () => {
    expect(Buffer.byteLength(noiseText, 'utf8')).toBeGreaterThanOrEqual(TARGET_BYTES)

    const diff = diffStructured(leftText, noiseText, 'json')

    expect(diff.entries.length).toBeGreaterThan(0)
    expect(diff.entries.every((entry) => entry.status === 'same')).toBe(true)
    expect(
      diff.counts.modified + diff.counts.added + diff.counts.removed + diff.counts.typeChanged
    ).toBe(0)
    expect(diff.entries.filter((entry) => entry.status !== 'same')).toEqual([])
  })
})

describe('5 MB real differences', () => {
  it('hits every constructed change by path with status and display values', () => {
    expect(realDiff.counts).toMatchObject({
      added: 2,
      removed: 2,
      modified: 2,
      typeChanged: 2
    })
    expect(realDiff.entries.filter((entry) => entry.status !== 'same')).toHaveLength(
      EXPECTED.length
    )

    for (const expected of EXPECTED) {
      const matches = realDiff.entries.filter((entry) => entry.path === expected.path)
      expect(matches, expected.path).toHaveLength(1)
      const [entry] = matches
      expect(entry.status, expected.path).toBe(expected.status)
      expect(entry.left, expected.path).toBe(expected.left)
      expect(entry.right, expected.path).toBe(expected.right)
      expect(entry.leftType, expected.path).toBe(expected.leftType)
      expect(entry.rightType, expected.path).toBe(expected.rightType)
    }
  })

  it('locates each changed path on its owning side and falls back to the parent when missing', () => {
    const leftLines = leftText.split('\n')
    const rightLines = rightText.split('\n')

    for (const expected of EXPECTED) {
      if (expected.leftToken === undefined) {
        expect(occurrences(leftText, expected.rightToken ?? ''), expected.path).toBe(0)
        const missing = leftLocator.locate(expected.path)
        expect(missing.exact, expected.path).toBe(false)
        expect(spanOf(missing), expected.path).toEqual(
          spanOf(leftLocator.locate(parentPath(expected.path)))
        )
      } else {
        expect(occurrences(leftText, expected.leftToken), expected.path).toBe(1)
        const hit = leftLocator.locate(expected.path)
        expect(hit.exact, expected.path).toBe(true)
        expect(hit.path, expected.path).toBe(expected.path)
        expect(hit.startLine, expected.path).toBe(lineOf(leftLines, expected.leftToken))
      }

      if (expected.rightToken === undefined) {
        expect(occurrences(rightText, expected.leftToken ?? ''), expected.path).toBe(0)
        const missing = rightLocator.locate(expected.path)
        expect(missing.exact, expected.path).toBe(false)
        expect(spanOf(missing), expected.path).toEqual(
          spanOf(rightLocator.locate(parentPath(expected.path)))
        )
      } else {
        expect(occurrences(rightText, expected.rightToken), expected.path).toBe(1)
        const hit = rightLocator.locate(expected.path)
        expect(hit.exact, expected.path).toBe(true)
        expect(hit.path, expected.path).toBe(expected.path)
        expect(hit.startLine, expected.path).toBe(lineOf(rightLines, expected.rightToken))
      }
    }
  })

  it(
    'diffs, locates every entry and reads both sides inside the explicit budget',
    () => {
      const started = performance.now()
      const left = readFileSync(leftPath, 'utf8')
      const right = readFileSync(rightPath, 'utf8')
      const diff = diffStructured(left, right, 'json')
      const leftSide = createStructuredLocator(left, 'json')
      const rightSide = createStructuredLocator(right, 'json')
      for (const entry of diff.entries) {
        leftSide.locate(entry.path)
        rightSide.locate(entry.path)
      }
      const elapsed = performance.now() - started

      expect(diff.entries.length).toBeGreaterThan(1000)
      expect(elapsed).toBeLessThan(ELAPSED_BUDGET_MS)
    },
    TEST_TIMEOUT_MS
  )
})

describe('deep YAML pair on disk', () => {
  it('reports zero non-same entries when only YAML surface formatting differs', () => {
    expect(Buffer.byteLength(yamlLeftText, 'utf8')).toBeGreaterThan(0)

    const diff = diffStructured(yamlLeftText, yamlRightText, 'yaml')

    expect(diff.entries.length).toBeGreaterThan(0)
    expect(diff.entries.every((entry) => entry.status === 'same')).toBe(true)
    expect(
      diff.counts.modified + diff.counts.added + diff.counts.removed + diff.counts.typeChanged
    ).toBe(0)
    expect(diff.entries.filter((entry) => entry.status !== 'same')).toEqual([])
    for (const text of [yamlLeftText, yamlRightText]) {
      expect(maxContainerDepth(parseStructured(text, 'yaml'))).toBeGreaterThanOrEqual(DEPTH)
    }
  })
})
