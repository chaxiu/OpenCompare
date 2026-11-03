import { describe, expect, it } from 'vitest'
import { preflightComparisonHistory } from './preflight'
import type { HistoryPreflightPort } from './preflight'
import type { PathProbeKind } from '../platform/types'

type Entry = readonly [path: string, kind: PathProbeKind | Error, listError?: boolean]

function portFor(entries: readonly Entry[], calls: string[] = []): HistoryPreflightPort {
  const byPath = new Map(entries.map(([path, kind, listError]) => [path, { kind, listError }]))
  return {
    statPath: async (path) => {
      calls.push(`stat:${path}`)
      const record = byPath.get(path)
      if (record === undefined || record.kind instanceof Error) throw new Error('probe failed')
      return record.kind
    },
    listDirectory: async (path) => {
      calls.push(`list:${path}`)
      if (byPath.get(path)?.listError === true) throw new Error('list failed')
      return []
    }
  }
}

describe('history reopen preflight', () => {
  it('accepts two listable directory roots and probes each side once, in order', async () => {
    const calls: string[] = []
    const result = await preflightComparisonHistory(
      'directory',
      ['/a', '/b'],
      portFor([['/a', 'directory'], ['/b', 'directory']], calls)
    )
    expect(result).toEqual({ ok: true })
    expect(calls).toEqual(['stat:/a', 'list:/a', 'stat:/b', 'list:/b'])
  })

  it('accepts existing files for a pair or a merge and never lists anything', async () => {
    const calls: string[] = []
    const files: readonly Entry[] = [['/a.txt', 'file'], ['/b.txt', 'file'], ['/c.txt', 'file']]
    await expect(preflightComparisonHistory('file', ['/a.txt', '/b.txt'], portFor(files, calls))).resolves.toEqual({ ok: true })
    await expect(preflightComparisonHistory('merge', ['/a.txt', '/b.txt', '/c.txt'], portFor(files))).resolves.toEqual({ ok: true })
    expect(calls.some((call) => call.startsWith('list:'))).toBe(false)
  })

  it('reports the leftmost missing side and stops probing there', async () => {
    const calls: string[] = []
    const result = await preflightComparisonHistory(
      'merge',
      ['/a.txt', '/b.txt', '/c.txt'],
      portFor([['/a.txt', 'file'], ['/b.txt', 'missing'], ['/c.txt', 'file']], calls)
    )
    expect(result).toEqual({ ok: false, reason: 'missing', side: 1 })
    expect(calls).toEqual(['stat:/a.txt', 'stat:/b.txt'])
  })

  it('separates a type change from a missing path in both directions', async () => {
    const dirAsFile = await preflightComparisonHistory(
      'directory',
      ['/a', '/b'],
      portFor([['/a', 'directory'], ['/b', 'file']])
    )
    expect(dirAsFile).toEqual({ ok: false, reason: 'type-changed', side: 1 })
    const fileAsDir = await preflightComparisonHistory(
      'file',
      ['/a', '/b'],
      portFor([['/a', 'directory'], ['/b', 'file']])
    )
    expect(fileAsDir).toEqual({ ok: false, reason: 'type-changed', side: 0 })
  })

  it('reports a throwing stat or an unlistable root as unreadable on that side', async () => {
    const statFailed = await preflightComparisonHistory(
      'file',
      ['/a', '/b'],
      portFor([['/a', 'file'], ['/b', new Error('EACCES')]])
    )
    expect(statFailed).toEqual({ ok: false, reason: 'unreadable', side: 1 })
    const listFailed = await preflightComparisonHistory(
      'directory',
      ['/a', '/b'],
      portFor([['/a', 'directory', true], ['/b', 'directory']])
    )
    expect(listFailed).toEqual({ ok: false, reason: 'unreadable', side: 0 })
  })

  it('reports base when base and ours are both missing', async () => {
    const result = await preflightComparisonHistory(
      'merge',
      ['/a.txt', '/b.txt', '/c.txt'],
      portFor([['/a.txt', 'missing'], ['/b.txt', 'missing'], ['/c.txt', 'file']])
    )
    expect(result).toEqual({ ok: false, reason: 'missing', side: 0 })
  })

  it('never returns a path in a failure, only the stable code and side index', async () => {
    const secret = '/private/very/secret/location.txt'
    const result = await preflightComparisonHistory('file', [secret, '/b.txt'], portFor([[secret, 'missing']]))
    expect(JSON.stringify(result)).not.toContain(secret)
  })
})
