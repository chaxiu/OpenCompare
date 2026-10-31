/**
 * Real-file structured semantics gate.
 *
 * Reads real JSON / YAML files from `src/core/structured/__fixtures__/real/`
 * with `readFileSync` and pins exactly three properties of the AST diff:
 * object key order is irrelevant, cosmetic format noise is irrelevant, and a
 * real difference is never dropped. No fixtures module, no mocks, no rewriting
 * of the input text.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { diffStructured } from '@core/structured/diff'
import type { StructuredStatus } from '@core/structured/diff'
import type { StructuredFormat } from '@core/structured/parse'

const FIXTURES = fileURLToPath(new URL('./core/structured/__fixtures__/real/', import.meta.url))

function fixture(name: string): string {
  return readFileSync(`${FIXTURES}${name}`, 'utf8')
}

interface NoisePair {
  readonly format: StructuredFormat
  readonly left: string
  readonly right: string
  /** Two object keys whose left / right source order must be opposite. */
  readonly keys: readonly [string, string]
}

const NOISE_PAIRS: readonly NoisePair[] = [
  {
    format: 'json',
    left: 'json-noise-left.json',
    right: 'json-noise-right.json',
    keys: ['service', 'pipeline']
  },
  {
    format: 'yaml',
    left: 'yaml-noise-left.yaml',
    right: 'yaml-noise-right.yaml',
    keys: ['service', 'pipeline']
  }
]

interface ExpectedChange {
  readonly path: string
  readonly status: Exclude<StructuredStatus, 'same'>
}

interface DiffCase {
  readonly format: StructuredFormat
  readonly left: string
  readonly right: string
  readonly expected: readonly ExpectedChange[]
}

const DIFF_CASES: readonly DiffCase[] = [
  {
    format: 'json',
    left: 'json-diff-left.json',
    right: 'json-diff-right.json',
    expected: [
      { path: '/pipeline/stage/build/matrix/targets/linux/runners/labels/0', status: 'modified' },
      { path: '/service/addedFlag', status: 'added' },
      { path: '/service/quota', status: 'modified' },
      { path: '/service/removedFlag', status: 'removed' },
      { path: '/service/tiers/web/replicas', status: 'typeChanged' }
    ]
  },
  {
    format: 'yaml',
    left: 'yaml-diff-left.yaml',
    right: 'yaml-diff-right.yaml',
    expected: [
      { path: '/cluster/regions/primary/zones/a/nodes/0/labels/role', status: 'modified' },
      { path: '/deploy/enabled', status: 'typeChanged' },
      { path: '/deploy/extras/telemetry', status: 'added' },
      { path: '/deploy/legacyTimeout', status: 'removed' },
      { path: '/deploy/retries', status: 'modified' }
    ]
  }
]

function sortChanges(changes: readonly ExpectedChange[]): ExpectedChange[] {
  return [...changes].sort(
    (a, b) => a.path.localeCompare(b.path) || a.status.localeCompare(b.status)
  )
}

function changedOnly(result: ReturnType<typeof diffStructured>): ExpectedChange[] {
  return sortChanges(
    result.entries
      .filter((entry) => entry.status !== 'same')
      .map((entry) => ({ path: entry.path, status: entry.status as ExpectedChange['status'] }))
  )
}

describe('real-file structured semantics', () => {
  it('treats object key order as irrelevant on real JSON and YAML pairs', () => {
    for (const pair of NOISE_PAIRS) {
      const left = fixture(pair.left)
      const right = fixture(pair.right)
      const [first, second] = pair.keys

      const leftFirst = left.indexOf(first)
      const leftSecond = left.indexOf(second)
      const rightFirst = right.indexOf(first)
      const rightSecond = right.indexOf(second)
      expect(Math.min(leftFirst, leftSecond, rightFirst, rightSecond)).toBeGreaterThanOrEqual(0)
      expect(leftFirst < leftSecond).toBe(true)
      expect(rightFirst < rightSecond).toBe(false)

      const result = diffStructured(left, right, pair.format)
      expect(result.entries.length).toBeGreaterThan(0)
      expect(result.entries.every((entry) => entry.status === 'same')).toBe(true)
      expect(result.counts).toEqual({
        added: 0,
        removed: 0,
        modified: 0,
        typeChanged: 0,
        same: result.entries.length
      })
    }
  })

  it('treats comments, trailing commas, quoting and indentation as irrelevant format noise', () => {
    const jsonLeft = fixture('json-noise-left.json')
    const jsonRight = fixture('json-noise-right.json')
    const yamlLeft = fixture('yaml-noise-left.yaml')
    const yamlRight = fixture('yaml-noise-right.yaml')

    // JSON left is JSONC: line comments, trailing commas and tab indentation.
    expect(jsonLeft).toContain('//')
    expect(jsonLeft).toMatch(/,\s*[}\]]/)
    expect(jsonLeft).toContain('\n\t')
    expect(jsonRight).not.toContain('//')
    expect(jsonRight).not.toMatch(/,\s*[}\]]/)
    expect(jsonRight).not.toContain('\t')

    // YAML left has comments, a blank line and quoted keys.
    expect(yamlLeft).toContain('#')
    expect(yamlLeft).toMatch(/\n\s*\n/)
    expect(yamlLeft).toMatch(/"[^"\n]+":/)
    expect(yamlRight).not.toContain('#')
    expect(yamlRight).not.toMatch(/"[^"\n]+":/)

    for (const pair of NOISE_PAIRS) {
      const result = diffStructured(fixture(pair.left), fixture(pair.right), pair.format)
      expect(result.entries.length).toBeGreaterThan(0)
      expect(result.entries.every((entry) => entry.status === 'same')).toBe(true)
      expect(result.counts).toEqual({
        added: 0,
        removed: 0,
        modified: 0,
        typeChanged: 0,
        same: result.entries.length
      })
    }
  })

  it('never misses the declared real differences in the JSON and YAML diff pairs', () => {
    for (const testCase of DIFF_CASES) {
      const result = diffStructured(
        fixture(testCase.left),
        fixture(testCase.right),
        testCase.format
      )
      const changed = changedOnly(result)

      expect(changed.length).toBeGreaterThan(0)
      expect(changed).toEqual(sortChanges(testCase.expected))

      const statuses = new Set(changed.map((entry) => entry.status))
      for (const status of ['added', 'removed', 'modified', 'typeChanged'] as const) {
        expect(statuses.has(status)).toBe(true)
      }

      const deep = changed.filter((entry) => entry.path.replace(/[^/]/g, '').length >= 8)
      expect(deep.length).toBeGreaterThan(0)
    }
  })
})
