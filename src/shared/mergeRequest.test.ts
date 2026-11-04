import { describe, expect, it } from 'vitest'
import type { PathProbe } from './compareRequest'
import { parseMergeManualPaths, resolveMergeRequest } from './mergeRequest'
import type { PathProbeKind } from './platform/types'

const B = '/tmp/opencompare/base.ts'
const O = '/tmp/opencompare/ours.ts'
const T = '/tmp/opencompare/theirs.ts'
const FILES = { base: B, ours: O, theirs: T }

/** Records every probed path; `denied` paths reject like an unreadable side. */
function probeOf(kinds: Readonly<Record<string, PathProbeKind>> = {}, denied: readonly string[] = []) {
  const calls: string[] = []
  const probe: PathProbe = {
    statPath: async (path) => {
      calls.push(path)
      if (denied.includes(path)) throw new Error('EACCES')
      return kinds[path] ?? 'missing'
    }
  }
  return { probe, calls }
}

async function failureOf(paths: typeof FILES, probe: PathProbe) {
  const result = await resolveMergeRequest(paths, { probe })
  if (result.ok) throw new Error('expected a failure')
  return result.error
}

describe('parseMergeManualPaths', () => {
  it('normalises quotes, ~ and relative paths into absolute /-separated paths', () => {
    expect(parseMergeManualPaths('"~/base.ts"', 'ours.ts', "'/tmp/theirs.ts'", { homeDir: '/home/you', baseDir: '/work' })).toEqual({ ok: true, paths: { base: '/home/you/base.ts', ours: '/work/ours.ts', theirs: '/tmp/theirs.ts' } })
  })

  it('reports the first empty side in base → ours → theirs order', () => {
    const inputs = [ [['  ', O, T], 'base'], [[B, '', T], 'ours'], [[B, O, '""'], 'theirs'] ] as const
    for (const [paths, side] of inputs) expect(parseMergeManualPaths(paths[0], paths[1], paths[2])).toEqual({ ok: false, error: { code: 'EMPTY_PATH', side, path: '' } })
  })
})

describe('resolveMergeRequest', () => {
  it('accepts three files, probes each side once and echoes the normalised paths', async () => {
    const { probe, calls } = probeOf({ [B]: 'file', [O]: 'file', [T]: 'file' })
    expect(await resolveMergeRequest({ base: ` "${B}" `, ours: O, theirs: T }, { homeDir: '/home/you', baseDir: '/work', probe })).toEqual({ ok: true, paths: FILES })
    expect(calls).toEqual([B, O, T])
  })

  it('allows two identical sides: duplicates are legal merge inputs', async () => {
    const { probe } = probeOf({ [B]: 'file', [T]: 'file' })
    expect(await resolveMergeRequest({ base: B, ours: B, theirs: T }, { probe })).toEqual({ ok: true, paths: { base: B, ours: B, theirs: T } })
  })

  it('applies ACCESS_DENIED → NOT_FOUND → NOT_A_FILE inside one side', async () => {
    const cases: readonly (readonly [Readonly<Record<string, PathProbeKind>>, readonly string[], string, string])[] = [
      [{ [B]: 'file' }, [B], 'ACCESS_DENIED', B],
      [{}, [], 'NOT_FOUND', B],
      [{ [B]: 'directory' }, [], 'NOT_A_FILE', B]
    ]
    for (const [kinds, denied, code, path] of cases) expect(await failureOf({ base: path, ours: O, theirs: T }, probeOf(kinds, denied).probe)).toEqual({ code, side: 'base', path })
  })

  it('lets three unknown extensions through to the merge open path', async () => {
    const vue = { base: '/tmp/opencompare/base.vue', ours: '/tmp/opencompare/ours.vue', theirs: '/tmp/opencompare/theirs.vue' }
    const { probe } = probeOf({ [vue.base]: 'file', [vue.ours]: 'file', [vue.theirs]: 'file' })
    expect(await resolveMergeRequest(vue, { probe })).toEqual({ ok: true, paths: vue })
  })

  it('resolves failures side by side: base, then ours, then theirs', async () => {
    const { probe, calls } = probeOf({ [B]: 'file', [O]: 'directory', [T]: 'missing' })
    expect(await failureOf(FILES, probe)).toEqual({ code: 'NOT_A_FILE', side: 'ours', path: O })
    expect(calls).toEqual([B, O, T])
    expect(await failureOf(FILES, probeOf({ [B]: 'file', [O]: 'file', [T]: 'file' }, [T]).probe)).toEqual({ code: 'ACCESS_DENIED', side: 'theirs', path: T })
  })

  it('reports an empty normalised side before probing anything', async () => {
    const { probe, calls } = probeOf()
    expect(await failureOf({ base: '   ', ours: O, theirs: T }, probe)).toEqual({ code: 'EMPTY_PATH', side: 'base', path: '' })
    expect(calls).toEqual([])
  })

  it('folds relative paths through the caller context before probing', async () => {
    const { probe } = probeOf({ '/work/base.ts': 'file', '/work/ours.ts': 'file', '/work/theirs.ts': 'file' })
    expect(await resolveMergeRequest({ base: 'base.ts', ours: './ours.ts', theirs: '../work/theirs.ts' }, { baseDir: '/work', probe })).toEqual({ ok: true, paths: { base: '/work/base.ts', ours: '/work/ours.ts', theirs: '/work/theirs.ts' } })
  })
})
