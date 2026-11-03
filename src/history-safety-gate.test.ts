/**
 * Dedicated `history-safety` gate: the pure history model (dedupe, remove,
 * clear, newest-first 20-record cap, switch roundtrip, reopen parsing) plus the
 * reopen preflight side ordering. Node-only, zero real IO: the preflight uses an
 * injected fake port, so no temp directory or platform implementation is read.
 *
 * The jsdom half of this gate lives in the two existing suites named by the
 * manifest command: `historySafety.dom.test.tsx` and `historyHome.dom.test.tsx`.
 */
import { describe, expect, it } from 'vitest'
import {
  clearComparisonHistory,
  createComparisonHistoryEntry,
  parseComparisonHistoryJson,
  removeComparisonHistoryEntry,
  resolveComparisonHistoryReopen,
  serializeComparisonHistory,
  trimComparisonHistory,
  upsertComparisonHistory
} from '@shared/history/model'
import { preflightComparisonHistory, type HistoryPreflightPort } from '@shared/history/preflight'
import { COMPARISON_HISTORY_LIMIT } from '@shared/history/types'
import type { ComparisonHistoryKind, ComparisonHistorySwitches } from '@shared/history/types'
import type { PathProbeKind } from '@shared/platform/types'

const SWITCHES: ComparisonHistorySwitches = {
  ignoreWhitespace: false,
  ignoreNewline: true,
  ignoreEncoding: false
}

function entry(
  kind: ComparisonHistoryKind,
  paths: readonly string[],
  createdAt: number,
  switches: ComparisonHistorySwitches = SWITCHES
) {
  return createComparisonHistoryEntry({ kind, paths, createdAt, ...switches })
}

function portOf(
  stat: (path: string) => Promise<PathProbeKind>,
  list: (path: string) => Promise<readonly unknown[]> = async () => []
): HistoryPreflightPort {
  return { statPath: stat, listDirectory: list }
}

function constantPort(probe: PathProbeKind, list?: HistoryPreflightPort['listDirectory']) {
  return portOf(async () => probe, list)
}

describe('history-safety gate: list maintenance', () => {
  it('dedupes the same kind and ordered paths, refreshing time and switches in place', () => {
    const first = entry('file', ['/left.txt', '/right.txt'], 10)
    const other = entry('directory', ['/dir-a', '/dir-b'], 20)
    const before = [other, first]
    const refreshed = upsertComparisonHistory(before, {
      kind: 'file',
      paths: ['/left.txt', '/right.txt'],
      createdAt: 30,
      ignoreWhitespace: true,
      ignoreNewline: true,
      ignoreEncoding: true
    })
    expect(refreshed).toHaveLength(2)
    expect(refreshed[0]?.id).toBe(first.id)
    expect(refreshed[0]?.createdAt).toBe(30)
    expect(refreshed[0]).toMatchObject({
      ignoreWhitespace: true,
      ignoreNewline: true,
      ignoreEncoding: true
    })
    expect(refreshed[1]).toEqual(other)
    // The identity is kind + ordered paths, so the same paths in another kind differ.
    expect(entry('merge', ['/left.txt', '/right.txt', '/third.txt'], 1).id).not.toBe(first.id)
  })

  it('removes exactly one record and keeps every other record verbatim in order', () => {
    const list = [
      entry('directory', ['/d1', '/d2'], 3),
      entry('file', ['/f1', '/f2'], 2),
      entry('merge', ['/m1', '/m2', '/m3'], 1)
    ]
    const removed = removeComparisonHistoryEntry(list, list[1]!.id)
    expect(removed).toEqual([list[0], list[2]])
    expect(removed.map((item) => item.id)).toEqual([list[0]!.id, list[2]!.id])
    expect(removeComparisonHistoryEntry(list, 'no-such-id')).toEqual(list)
  })

  it('clears to an empty list, and that empty envelope reads back as empty', () => {
    expect(clearComparisonHistory()).toEqual([])
    const text = JSON.stringify(serializeComparisonHistory(clearComparisonHistory()))
    expect(parseComparisonHistoryJson(text)).toEqual([])
  })

  it('keeps the newest 20 of 25 mixed records and never truncates per kind', () => {
    const kinds: ComparisonHistoryKind[] = ['directory', 'file', 'merge']
    let list = [] as ReturnType<typeof entry>[]
    const input: ReturnType<typeof entry>[] = []
    for (let index = 1; index <= 25; index += 1) {
      const kind = kinds[index % kinds.length]!
      const paths = [`/a${index}`, `/b${index}`, `/c${index}`].slice(0, kind === 'merge' ? 3 : 2)
      input.push(entry(kind, paths, index))
    }
    const snapshot = [...input]
    for (const item of input) list = upsertComparisonHistory(list, item)
    expect(COMPARISON_HISTORY_LIMIT).toBe(20)
    expect(list).toHaveLength(20)
    expect(list.map((item) => item.createdAt)).toEqual(
      Array.from({ length: 20 }, (_, index) => 25 - index)
    )
    expect(new Set(list.map((item) => item.kind))).toEqual(
      new Set(['directory', 'file', 'merge'])
    )
    // The pure trim shares the same newest-first rule and mutates nothing.
    expect(trimComparisonHistory(input)).toEqual(list)
    expect(input).toEqual(snapshot)
  })
})

describe('history-safety gate: reopen preflight', () => {
  it('classifies a missing side before a worse one and keeps failing sides leftmost', async () => {
    const paths = ['/secret/base.txt', '/secret/ours.txt', '/secret/theirs.txt']
    const seen: string[] = []
    const port = portOf(async (path) => {
      seen.push(path)
      if (path.endsWith('ours.txt')) throw new Error('EACCES raw platform error')
      return 'missing'
    })
    const result = await preflightComparisonHistory('merge', paths, port)
    expect(result).toEqual({ ok: false, reason: 'missing', side: 0 })
    expect(seen).toEqual(['/secret/base.txt'])
    const text = JSON.stringify(result)
    for (const leaked of [...paths, 'EACCES', 'raw platform error']) {
      expect(text).not.toContain(leaked)
    }
  })

  it('reports the leftmost failing merge side when the earlier sides are healthy', async () => {
    const port = portOf(async (path) => {
      if (path === '/base.txt') return 'file'
      if (path === '/ours.txt') return 'missing'
      throw new Error('theirs down')
    })
    const result = await preflightComparisonHistory(
      'merge',
      ['/base.txt', '/ours.txt', '/theirs.txt'],
      port
    )
    expect(result).toEqual({ ok: false, reason: 'missing', side: 1 })
    await expect(
      preflightComparisonHistory('merge', ['/base.txt', '/ours.txt', '/theirs.txt'], portOf(async () => 'file'))
    ).resolves.toEqual({ ok: true })
  })

  it('separates type changes from missing in both directions', async () => {
    await expect(
      preflightComparisonHistory('directory', ['/was-a-dir', '/other'], constantPort('file'))
    ).resolves.toEqual({ ok: false, reason: 'type-changed', side: 0 })
    await expect(
      preflightComparisonHistory('file', ['/was-a-file', '/other'], constantPort('directory'))
    ).resolves.toEqual({ ok: false, reason: 'type-changed', side: 0 })
    await expect(
      preflightComparisonHistory('file', ['/gone', '/other'], constantPort('missing'))
    ).resolves.toEqual({ ok: false, reason: 'missing', side: 0 })
  })

  it('maps a throwing stat or directory listing to unreadable without leaking the error', async () => {
    const statFailure = await preflightComparisonHistory(
      'file',
      ['/secret/file.txt', '/other.txt'],
      portOf(async () => {
        throw new Error('EACCES /secret/file.txt')
      })
    )
    expect(statFailure).toEqual({ ok: false, reason: 'unreadable', side: 0 })
    expect(JSON.stringify(statFailure)).not.toContain('/secret/file.txt')

    const listFailure = await preflightComparisonHistory(
      'directory',
      ['/secret/dir', '/other-dir'],
      portOf(async () => 'directory', async () => {
        throw new Error('EPERM /secret/dir')
      })
    )
    expect(listFailure).toEqual({ ok: false, reason: 'unreadable', side: 0 })
    expect(JSON.stringify(listFailure)).not.toContain('/secret/dir')

    // Files and merge sides are never listed; only directory roots are.
    await expect(
      preflightComparisonHistory(
        'merge',
        ['/a.txt', '/b.txt', '/c.txt'],
        portOf(async () => 'file', async () => {
          throw new Error('must not be listed')
        })
      )
    ).resolves.toEqual({ ok: true })
  })
})

describe('history-safety gate: switch roundtrip and reopen parsing', () => {
  it('restores all eight switch combinations field by field through the stored envelope', () => {
    let index = 0
    for (const ignoreWhitespace of [false, true]) {
      for (const ignoreNewline of [false, true]) {
        for (const ignoreEncoding of [false, true]) {
          index += 1
          const item = entry('file', [`/w${index}.txt`, `/r${index}.txt`], index, {
            ignoreWhitespace,
            ignoreNewline,
            ignoreEncoding
          })
          const stored = JSON.stringify(serializeComparisonHistory([item]))
          expect(parseComparisonHistoryJson(stored)).toEqual([
            {
              ...item,
              ignoreWhitespace,
              ignoreNewline,
              ignoreEncoding
            }
          ])
        }
      }
    }
    expect(index).toBe(8)
  })

  it('reads a corrupt or non-version-1 document as an empty list', () => {
    expect(parseComparisonHistoryJson('{not json')).toEqual([])
    expect(parseComparisonHistoryJson('{"version":2,"entries":[]}')).toEqual([])
    expect(parseComparisonHistoryJson('{"entries":[]}')).toEqual([])
  })

  it('answers stable reopen error codes for malformed stored entries', () => {
    const valid = entry('file', ['/left.txt', '/right.txt'], 1)
    expect(resolveComparisonHistoryReopen({ ...valid, paths: ['/only.txt'] })).toEqual({
      ok: false,
      error: 'invalid-path-count'
    })
    expect(resolveComparisonHistoryReopen({ ...valid, paths: ['/left.txt', ''] })).toEqual({
      ok: false,
      error: 'empty-path'
    })
    expect(resolveComparisonHistoryReopen({ ...valid, paths: ['left.txt', '/right.txt'] })).toEqual({
      ok: false,
      error: 'relative-path'
    })
    expect(resolveComparisonHistoryReopen({ ...valid, kind: 'sample' })).toEqual({
      ok: false,
      error: 'unsupported-kind'
    })
  })

  it('returns kind, ordered paths and all three switches for a legal merge entry', () => {
    const item = entry('merge', ['/base.txt', '/ours.txt', '/theirs.txt'], 5, {
      ignoreWhitespace: true,
      ignoreNewline: false,
      ignoreEncoding: true
    })
    expect(resolveComparisonHistoryReopen(item)).toEqual({
      ok: true,
      kind: 'merge',
      paths: ['/base.txt', '/ours.txt', '/theirs.txt'],
      switches: { ignoreWhitespace: true, ignoreNewline: false, ignoreEncoding: true }
    })
  })
})
