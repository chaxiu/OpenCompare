import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { STRUCTURED_SCENE } from '@shared/fixtures'
import { diffStructured } from '@core/structured/diff'
import type { StructuredStatus } from '@core/structured/diff'
import { createStructuredLocator } from '@core/structured/locate'
import type { StructuredFormat } from '@core/structured/parse'
import { runStructuredCompare } from './compareJob'

const LOCATE_FIXTURES = fileURLToPath(
  new URL('../../../core/structured/__fixtures__/locate/', import.meta.url)
)

interface CompareCase {
  readonly name: string
  readonly leftText: string
  readonly rightText: string
  readonly format: StructuredFormat
}

function fixture(name: string): string {
  return readFileSync(`${LOCATE_FIXTURES}${name}`, 'utf8')
}

const drilldownPair = {
  left: {
    path: 'config/deploy.left.yaml',
    text: 'service:\n  replicas: 2\nprofile: production\n'
  },
  right: {
    path: 'config/deploy.right.yaml',
    text: 'profile: staging\nservice:\n  replicas: 4\n  health:\n    path: /healthz\n'
  }
}

const CASES: readonly CompareCase[] = [
  {
    name: 'built-in JSON sample',
    leftText: STRUCTURED_SCENE.json.left.text,
    rightText: STRUCTURED_SCENE.json.right.text,
    format: 'json'
  },
  {
    name: 'built-in YAML sample',
    leftText: STRUCTURED_SCENE.yaml.left.text,
    rightText: STRUCTURED_SCENE.yaml.right.text,
    format: 'yaml'
  },
  {
    name: 'directory drilldown YAML pair',
    leftText: drilldownPair.left.text,
    rightText: drilldownPair.right.text,
    format: 'yaml'
  },
  {
    name: 'locate fixture JSON',
    leftText: fixture('json-left.json'),
    rightText: fixture('json-right.json'),
    format: 'json'
  },
  {
    name: 'locate fixture YAML',
    leftText: fixture('yaml-left.yaml'),
    rightText: fixture('yaml-right.yaml'),
    format: 'yaml'
  }
]

function expectParity(testCase: CompareCase): void {
  const sync = diffStructured(testCase.leftText, testCase.rightText, testCase.format)
  const outcome = runStructuredCompare(testCase.leftText, testCase.rightText, testCase.format)

  expect(outcome.diff).toEqual(sync)
  expect(outcome.diff.entries.map((entry) => entry.path)).toEqual(
    sync.entries.map((entry) => entry.path)
  )
  expect(outcome.diff.counts).toEqual(sync.counts)

  const leftLocator = createStructuredLocator(testCase.leftText, testCase.format)
  const rightLocator = createStructuredLocator(testCase.rightText, testCase.format)
  const changed = sync.entries.filter((entry) => entry.status !== 'same')

  expect(Object.keys(outcome.ranges).sort()).toEqual(changed.map((entry) => entry.path).sort())
  for (const entry of changed) {
    expect(outcome.ranges[entry.path]).toEqual({
      left: leftLocator.locate(entry.path),
      right: rightLocator.locate(entry.path)
    })
  }
  for (const entry of sync.entries) {
    if (entry.status === 'same') expect(outcome.ranges[entry.path]).toBeUndefined()
  }
}

describe('background comparison job', () => {
  for (const testCase of CASES) {
    it(`matches diffStructured and the locator for ${testCase.name}`, () => {
      expectParity(testCase)
    })
  }

  it('only produces ranges for non-same entries', () => {
    const outcome = runStructuredCompare(
      '{"a":1,"b":2,"c":{"d":3}}',
      '{"a":1,"b":9,"c":{"d":3}}',
      'json'
    )

    expect(outcome.diff.entries.filter((entry) => entry.status === 'same').length).toBeGreaterThan(0)
    expect(Object.keys(outcome.ranges)).toEqual(['/b'])
    expect(outcome.ranges['/b'].left.exact).toBe(true)
    expect(outcome.ranges['/b'].right.exact).toBe(true)
  })

  it('keeps the synchronous parse failure wording', () => {
    let syncMessage = ''
    try {
      diffStructured('{"a": 1', '{}', 'json')
    } catch (cause) {
      syncMessage = cause instanceof Error ? cause.message : String(cause)
    }

    expect(() => runStructuredCompare('{"a": 1', '{}', 'json')).toThrowError(
      new RegExp(`^${syncMessage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
    )
  })
})

const REQUIRED_BYTES = 5 * 1024 * 1024
const PAYLOAD = 'p'.repeat(360)
type Side = 'left' | 'right'

function nested(index: number, side: Side): Record<string, unknown> {
  const text = `leaf-${index}-${'z'.repeat(140)}`
  const leaf = side === 'left' ? { value: index, text } : { text, value: index }
  let node: Record<string, unknown> = { level8: leaf }
  for (let level = 7; level >= 1; level -= 1) {
    node = { [`level${level}`]: node }
  }
  return node
}

/** Deterministic records with shuffled key order and every change status. */
function record(index: number, side: Side): Record<string, unknown> {
  const label = index === 2 ? (side === 'left' ? 'label-2' : 'label-2-changed') : `label-${index}`
  const score = index === 4 ? (side === 'left' ? 4 : '4') : index

  if (side === 'left') {
    return {
      id: `item-${index}`,
      label,
      score,
      payload: PAYLOAD,
      nested: nested(index, side),
      ...(index === 3 ? { leftOnly: { note: 'removed' } } : {})
    }
  }

  return {
    payload: PAYLOAD,
    nested: nested(index, side),
    ...(index === 5 ? { rightOnly: { note: 'added' } } : {}),
    score,
    label,
    id: `item-${index}`
  }
}

function buildDocument(count: number, side: Side): string {
  const items: unknown[] = []
  for (let index = 0; index < count; index += 1) items.push(record(index, side))
  return JSON.stringify(
    side === 'left' ? { generatedBy: 'left', items } : { items, generatedBy: 'right' },
    null,
    2
  )
}

function chooseRecordCount(): number {
  const probeCount = 1000
  const probeBytes = Buffer.byteLength(buildDocument(probeCount, 'left'), 'utf8')
  // Comfortable margin above the threshold so both sides stay ≥ 5 MB.
  return Math.ceil((REQUIRED_BYTES * 1.2) / (probeBytes / probeCount))
}

describe('large file comparison', () => {
  it(
    'finishes a ≥5 MB, ≥8-level background comparison equal to the synchronous engine',
    () => {
      const count = chooseRecordCount()
      const leftText = buildDocument(count, 'left')
      const rightText = buildDocument(count, 'right')
      expect(Buffer.byteLength(leftText, 'utf8')).toBeGreaterThanOrEqual(REQUIRED_BYTES)
      expect(Buffer.byteLength(rightText, 'utf8')).toBeGreaterThanOrEqual(REQUIRED_BYTES)

      const dir = mkdtempSync(join(tmpdir(), 'opencompare-structured-'))
      try {
        const leftPath = join(dir, 'scale.left.json')
        const rightPath = join(dir, 'scale.right.json')
        writeFileSync(leftPath, leftText)
        writeFileSync(rightPath, rightText)
        const left = readFileSync(leftPath, 'utf8')
        const right = readFileSync(rightPath, 'utf8')

        const outcome = runStructuredCompare(left, right, 'json')
        const sync = diffStructured(left, right, 'json')
        expect(outcome.diff).toEqual(sync)
        expect(outcome.diff.entries.map((entry) => entry.path)).toEqual(
          sync.entries.map((entry) => entry.path)
        )
        expect(outcome.diff.counts).toEqual(sync.counts)

        const statuses = new Set<StructuredStatus>(
          outcome.diff.entries.map((entry) => entry.status)
        )
        for (const status of ['added', 'removed', 'modified', 'typeChanged'] as const) {
          expect(statuses.has(status)).toBe(true)
        }

        const leftLocator = createStructuredLocator(left, 'json')
        const rightLocator = createStructuredLocator(right, 'json')
        const changed = sync.entries.filter((entry) => entry.status !== 'same')
        expect(Object.keys(outcome.ranges).sort()).toEqual(changed.map((entry) => entry.path).sort())
        for (const entry of changed) {
          expect(outcome.ranges[entry.path]).toEqual({
            left: leftLocator.locate(entry.path),
            right: rightLocator.locate(entry.path)
          })
        }
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
    60_000
  )
})
