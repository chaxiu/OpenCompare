import { describe, expect, it } from 'vitest'
import { STRUCTURED_SCENE } from '@shared/fixtures'
import { STRUCTURED_STATUSES, diffStructured, filterStructuredChanges } from './diff'
import { StructuredParseError } from './parse'

const NOISE_COUNTS = { added: 0, removed: 0, modified: 0, typeChanged: 0, same: 0 }

function byPath(result: ReturnType<typeof diffStructured>): Map<string, (typeof result.entries)[number]> {
  return new Map(result.entries.map((entry) => [entry.path, entry]))
}

describe('key order normalization', () => {
  it('treats shuffled object keys as identical (JSON)', () => {
    const left = '{\n  "service": { "name": "opencompare", "limits": [1, 2] },\n  "enabled": true\n}'
    const right = '{\n  "enabled": true,\n  "service": { "limits": [1, 2], "name": "opencompare" }\n}\n'

    const result = diffStructured(left, right, 'json')

    expect(result.counts).toEqual({ ...NOISE_COUNTS, same: 4 })
    expect(result.entries.every((entry) => entry.status === 'same')).toBe(true)
  })

  it('treats shuffled object keys as identical (YAML)', () => {
    const left = 'service:\n  name: opencompare\n  replicas: 3\n'
    const right = 'service:\n  replicas: 3\n  name: opencompare\n'

    const result = diffStructured(left, right, 'yaml')

    expect(result.counts).toEqual({ ...NOISE_COUNTS, same: 2 })
  })

  it('emits paths in a deterministic, key-order independent order', () => {
    const left = '{"b": 1, "a": 2, "c": 3}'
    const right = '{"c": 3, "a": 2, "b": 1}'

    expect(diffStructured(left, right, 'json').entries.map((entry) => entry.path)).toEqual([
      '/a',
      '/b',
      '/c'
    ])
  })
})

describe('format noise', () => {
  it('ignores comments, indentation, blank lines and trailing commas in JSON', () => {
    const left = [
      '{',
      '  // deployment config',
      '  "service": {',
      '    "name": "opencompare",',
      '    "sinks": ["stdout", "file",],',
      '  },',
      '}'
    ].join('\n')
    const right = '{"service":{"name":"opencompare","sinks":["stdout","file"]}}'

    const result = diffStructured(left, right, 'json')

    expect(result.counts).toEqual({ ...NOISE_COUNTS, same: 3 })
  })

  it('ignores comments, blank lines and key quote style in YAML', () => {
    const left =
      '# deployment\nprofile: production\n\nservice:\n  "replicas": 3\n  name: opencompare\n'
    const right = 'service:\n  name: opencompare\n  replicas: 3\nprofile: production\n'

    const result = diffStructured(left, right, 'yaml')

    expect(result.counts).toEqual({ ...NOISE_COUNTS, same: 3 })
  })
})

describe('path-level changes', () => {
  const result = diffStructured(
    STRUCTURED_SCENE.json.left.text,
    STRUCTURED_SCENE.json.right.text,
    'json'
  )

  it('lists deep additions, edits and the type change at their JSON Pointer path', () => {
    const entries = byPath(result)

    expect(entries.get('/service/features/limits/maxBytes')).toMatchObject({
      status: 'added',
      right: '104857600'
    })
    expect(entries.get('/telemetry/enabled')).toMatchObject({
      status: 'modified',
      left: 'false',
      right: 'true'
    })
    expect(entries.get('/service/version')).toMatchObject({
      status: 'typeChanged',
      left: '2',
      right: '"2.0.0"',
      leftType: 'number',
      rightType: 'string'
    })
    expect(entries.get('/service/features/merge/mode')?.status).toBe('same')
  })

  it('keeps type changes apart from value edits in the counts', () => {
    expect(result.counts.typeChanged).toBe(1)
    expect(result.counts.modified).toBeGreaterThan(0)
  })

  it('counts every compared node exactly once', () => {
    const total = STRUCTURED_STATUSES.reduce((sum, status) => sum + result.counts[status], 0)
    expect(total).toBe(result.entries.length)
  })

  it('pairs identical values on both sides of a same node', () => {
    for (const entry of result.entries) {
      if (entry.status === 'same') expect(entry.left).toBe(entry.right)
    }
  })
})

describe('type changes', () => {
  it('separates scalar, object and array type changes from value edits', () => {
    const result = diffStructured(
      '{"a": 1, "b": {"x": 1}, "c": [1, 2]}',
      '{"a": "1", "b": [1], "c": {"x": 1}}',
      'json'
    )

    expect(result.counts).toEqual({ ...NOISE_COUNTS, typeChanged: 3 })
    const entries = byPath(result)
    expect(entries.get('/a')).toMatchObject({ leftType: 'number', rightType: 'string' })
    expect(entries.get('/b')).toMatchObject({ leftType: 'object', rightType: 'array' })
    expect(entries.get('/c')).toMatchObject({ leftType: 'array', rightType: 'object' })
  })
})

describe('containers', () => {
  it('records an added container as a single path without expanding descendants', () => {
    const result = diffStructured('{"a": 1}', '{"a": 1, "b": {"c": {"d": 2}}, "e": [1, 2]}', 'json')

    expect(result.counts).toEqual({ ...NOISE_COUNTS, added: 2, same: 1 })
    expect(result.entries.map((entry) => entry.path).sort()).toEqual(['/a', '/b', '/e'])
  })

  it('records a removed container as a single path', () => {
    const result = diffStructured('{"a": 1, "b": {"c": 2}}', '{"a": 1}', 'json')

    expect(result.counts).toEqual({ ...NOISE_COUNTS, removed: 1, same: 1 })
    expect(result.entries[1]).toMatchObject({ path: '/b', status: 'removed', left: '{1 个键}' })
  })

  it('compares arrays by index', () => {
    const result = diffStructured('["a", "b"]', '["a", "c", "d"]', 'json')

    expect(result.counts).toEqual({ ...NOISE_COUNTS, same: 1, modified: 1, added: 1 })
    expect(result.entries.map((entry) => entry.path)).toEqual(['/0', '/1', '/2'])
  })
})

describe('filtering', () => {
  const result = diffStructured(
    STRUCTURED_SCENE.json.left.text,
    STRUCTURED_SCENE.json.right.text,
    'json'
  )

  it('narrows to one status without touching the runtime counts', () => {
    const typeChanges = filterStructuredChanges(result.entries, 'typeChanged')

    expect(typeChanges.map((entry) => entry.path)).toEqual(['/service/version'])
    expect(filterStructuredChanges(result.entries, 'all')).toHaveLength(result.entries.length)
    expect(result.counts.typeChanged).toBe(1)
  })
})

describe('parse errors', () => {
  it('reports invalid JSON with the offending position and side', () => {
    expect(() => diffStructured('{', '{}', 'json')).toThrow(StructuredParseError)
    expect(() => diffStructured('{\n  "a" 1\n}', '{}', 'json')).toThrow(
      /left side: JSON parse error at line 2/
    )
  })

  it('reports invalid YAML and empty documents', () => {
    expect(() => diffStructured('a: 1\n', '{', 'yaml')).toThrow(/right side: YAML parse error/)
    expect(() => diffStructured('   \n', '{}', 'json')).toThrow(/empty document/)
  })
})
