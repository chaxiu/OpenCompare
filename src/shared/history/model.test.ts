import { describe, expect, it } from 'vitest'
import { COMPARISON_HISTORY_LIMIT, COMPARISON_HISTORY_VERSION } from './types'
import {
  clearComparisonHistory, comparisonHistoryId, createComparisonHistoryEntry,
  markComparisonHistoryError, parseComparisonHistory, parseComparisonHistoryJson,
  removeComparisonHistoryEntry, resolveComparisonHistoryReopen, serializeComparisonHistory,
  trimComparisonHistory, upsertComparisonHistory
} from './model'
import type { ComparisonHistoryCandidate } from './model'
import type { ComparisonHistoryKind } from './types'

const entry = (kind: ComparisonHistoryKind, paths: readonly string[], createdAt: number,
  overrides: Partial<ComparisonHistoryCandidate> = {}) => createComparisonHistoryEntry({
    kind, paths, createdAt, ignoreWhitespace: false, ignoreNewline: true, ignoreEncoding: true,
    ...overrides
  })
const DIR = entry('directory', ['/tmp/对比 数据/左', '/tmp/对比 数据/右'], 1_000)
const FILE = entry('file', ['/tmp/对比 数据/a.txt', '/tmp/对比 数据/b.txt'], 2_000)
const MERGE = entry('merge', ['/tmp/对比 数据/base.txt', '/tmp/对比 数据/ours.txt', '/tmp/对比 数据/theirs.txt'], 3_000)

describe('comparison history entries', () => {
  it('builds directory / file / merge entries with every stored field', () => {
    expect([DIR.paths.length, FILE.paths.length, MERGE.paths.length]).toEqual([2, 2, 3])
    expect([DIR.kind, FILE.kind, MERGE.kind]).toEqual(['directory', 'file', 'merge'])
    for (const item of [DIR, FILE, MERGE]) {
      expect(item.id.length).toBeGreaterThan(0)
      expect(Number.isInteger(item.createdAt)).toBe(true)
      expect([item.ignoreWhitespace, item.ignoreNewline, item.ignoreEncoding]).toEqual([false, true, true])
      expect(item.error).toBeUndefined()
    }
    expect(COMPARISON_HISTORY_LIMIT).toBe(20)
    expect(COMPARISON_HISTORY_VERSION).toBe(1)
  })

  it('keeps the id opaque and deterministic for one kind + path order', () => {
    expect(entry('directory', DIR.paths, 9_999).id).toBe(DIR.id)
    expect(entry('directory', [...DIR.paths].reverse(), 1).id).not.toBe(DIR.id)
    expect(comparisonHistoryId('directory', DIR.paths)).toBe(DIR.id)
    for (const path of DIR.paths) {
      expect(DIR.id).not.toContain(path)
      expect(DIR.id).not.toContain(path.split('/').pop() ?? path)
    }
  })
})

describe('comparison history parsing', () => {
  it('round-trips the version-1 envelope', () => {
    const document = serializeComparisonHistory([DIR])
    expect(parseComparisonHistory(document)).toEqual([DIR])
    expect(parseComparisonHistoryJson(JSON.stringify(document))).toEqual([DIR])
  })

  it('reads any corrupt document as one empty list and never throws', () => {
    const corrupt: unknown[] = [null, '', '{not json', [], {}, { version: 2, entries: [DIR] },
      { version: 1, entries: 'nope' }, { version: 1, entries: [{ ...DIR, id: undefined }] },
      { version: 1, entries: [{ ...DIR, kind: 'other' }] },
      { version: 1, entries: [{ ...DIR, paths: ['/only-one'] }] },
      { version: 1, entries: [{ ...DIR, createdAt: 'now' }] },
      { version: 1, entries: [{ ...DIR, ignoreNewline: 1 }] },
      { version: 1, entries: [{ ...DIR, error: 42 }] },
      { version: 1, entries: [DIR, { ...DIR, id: '' }] }]
    for (const value of corrupt) {
      expect(() => parseComparisonHistory(value)).not.toThrow()
      expect(parseComparisonHistory(value)).toEqual([])
    }
    expect(parseComparisonHistoryJson('{not json')).toEqual([])
    expect(parseComparisonHistoryJson('null')).toEqual([])
  })
})

describe('comparison history list operations', () => {
  it('keeps only the 20 newest records across all three kinds', () => {
    let list: ReturnType<typeof entry>[] = []
    for (let index = 0; index < 25; index += 1) {
      const kind: ComparisonHistoryKind = (['directory', 'file', 'merge'] as const)[index % 3]
      const paths = kind === 'merge'
        ? [`/tmp/b${index}`, `/tmp/o${index}`, `/tmp/t${index}`]
        : [`/tmp/l${index}`, `/tmp/r${index}`]
      list = upsertComparisonHistory(list, { kind, paths, createdAt: index,
        ignoreWhitespace: false, ignoreNewline: true, ignoreEncoding: true })
    }
    expect(list).toHaveLength(20)
    expect(list[0]?.createdAt).toBe(24)
    expect(list.at(-1)?.createdAt).toBe(5)
    expect(new Set(list.map((item) => item.createdAt)).size).toBe(20)
  })

  it('upserts by kind + ordered paths and refreshes time and switches', () => {
    const one = upsertComparisonHistory([], { kind: 'file', paths: ['/tmp/a', '/tmp/b'],
      createdAt: 1_000, ignoreWhitespace: false, ignoreNewline: true, ignoreEncoding: true })
    const other = upsertComparisonHistory(one, { kind: 'file', paths: ['/tmp/c', '/tmp/d'],
      createdAt: 2_000, ignoreWhitespace: false, ignoreNewline: true, ignoreEncoding: true })
    const updated = upsertComparisonHistory(other,
      entry('file', ['/tmp/a', '/tmp/b'], 3_000, { ignoreWhitespace: true, ignoreNewline: false, ignoreEncoding: false }))
    expect(updated).toHaveLength(2)
    expect(updated[0]).toMatchObject({ id: one[0]?.id, paths: ['/tmp/a', '/tmp/b'], createdAt: 3_000,
      ignoreWhitespace: true, ignoreNewline: false, ignoreEncoding: false })
    expect(upsertComparisonHistory(updated, entry('file', ['/tmp/b', '/tmp/a'], 4_000))).toHaveLength(3)
    expect(upsertComparisonHistory(updated, entry('merge', ['/tmp/a', '/tmp/b', '/tmp/c'], 5_000))).toHaveLength(3)
  })

  it('removes one record, clears completely and marks errors', () => {
    expect(removeComparisonHistoryEntry([FILE, DIR], FILE.id)).toEqual([DIR])
    const cleared = clearComparisonHistory()
    expect(cleared).toEqual([])
    expect(serializeComparisonHistory(cleared)).toEqual({ version: 1, entries: [] })
    expect(parseComparisonHistoryJson(JSON.stringify(serializeComparisonHistory(cleared)))).toEqual([])
    const marked = markComparisonHistoryError([FILE, DIR], FILE.id, 'missing')
    expect(marked[0]?.error).toBe('missing')
    expect(marked[1]).toEqual(DIR)
    expect(markComparisonHistoryError(marked, FILE.id, null)[0]?.error).toBeUndefined()
  })

  it('sorts newest first with an id tie-break and trims without mutating input', () => {
    const list = [entry('file', ['/tmp/a', '/tmp/b'], 10), entry('file', ['/tmp/c', '/tmp/d'], 10),
      entry('file', ['/tmp/e', '/tmp/f'], 20)]
    const sorted = trimComparisonHistory(list)
    expect(sorted[0]?.createdAt).toBe(20)
    expect(sorted.map((item) => item.id)).toEqual([...sorted]
      .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1)).map((item) => item.id))
    expect(list[0]?.createdAt).toBe(10)
  })

  it('round-trips all eight switch combinations through serialize and parse', () => {
    const combos = [false, true].flatMap((a) => [false, true].flatMap((b) => [false, true].map((c) => [a, b, c] as const)))
    const list = combos.map(([ignoreWhitespace, ignoreNewline, ignoreEncoding], index) =>
      entry('file', [`/tmp/l${index}`, `/tmp/r${index}`], index, { ignoreWhitespace, ignoreNewline, ignoreEncoding }))
    const parsed = parseComparisonHistoryJson(JSON.stringify(serializeComparisonHistory(list)))
    expect(parsed).toHaveLength(8)
    for (const item of list) {
      expect(parsed.find((candidate) => candidate.id === item.id)).toMatchObject({ ignoreWhitespace: item.ignoreWhitespace,
        ignoreNewline: item.ignoreNewline, ignoreEncoding: item.ignoreEncoding })
    }
  })
})

describe('comparison history reopen arguments', () => {
  it.each([['directory', ['/tmp/left', '/tmp/right']], ['file', ['/tmp/a.txt', '/tmp/b.txt']],
    ['merge', ['/tmp/base', '/tmp/ours', '/tmp/theirs']]] as const)(
    'returns kind, ordered paths and switches for %s', (kind, paths) => {
      const result = resolveComparisonHistoryReopen(entry(kind, paths, 1, { ignoreWhitespace: true }))
      expect(result).toEqual({ ok: true, kind, paths,
        switches: { ignoreWhitespace: true, ignoreNewline: true, ignoreEncoding: true } })
    })

  it('answers a stable code for invalid counts, paths and kinds without throwing', () => {
    const base = entry('file', ['/tmp/a', '/tmp/b'], 1)
    expect(resolveComparisonHistoryReopen({ ...base, paths: ['/tmp/a'] })).toEqual({ ok: false, error: 'invalid-path-count' })
    expect(resolveComparisonHistoryReopen({ ...base, paths: ['/tmp/a', '/tmp/b', '/tmp/c', '/tmp/d'] }))
      .toEqual({ ok: false, error: 'invalid-path-count' })
    expect(resolveComparisonHistoryReopen({ ...base, paths: ['/tmp/a', ''] })).toEqual({ ok: false, error: 'empty-path' })
    expect(resolveComparisonHistoryReopen({ ...base, paths: ['/tmp/a', 'relative/b'] })).toEqual({ ok: false, error: 'relative-path' })
    expect(resolveComparisonHistoryReopen({ ...base, kind: 'unknown' })).toEqual({ ok: false, error: 'unsupported-kind' })
    expect(() => resolveComparisonHistoryReopen(null)).not.toThrow()
    expect(resolveComparisonHistoryReopen(null)).toEqual({ ok: false, error: 'invalid-entry' })
  })
})
