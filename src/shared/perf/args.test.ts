import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PERF_INTERVAL_MS,
  DEFAULT_PERF_ROUNDS,
  MAX_PERF_INTERVAL_MS,
  PERF_HARNESS_FLAG,
  isPerfHarnessActive,
  parsePerfArgs
} from './args'

const readable = {
  isReadableDirectory: async (path: string) => path.startsWith('/real/')
}

function argv(...extra: string[]): string[] {
  return ['/Applications/OpenCompare.app/Contents/MacOS/OpenCompare', '.', PERF_HARNESS_FLAG, ...extra]
}

describe('isPerfHarnessActive', () => {
  it('requires both the explicit flag and the environment variable', () => {
    expect(isPerfHarnessActive(argv(), { OPENCOMPARE_PERF: '1' })).toBe(true)
    expect(isPerfHarnessActive(argv(), {})).toBe(false)
    expect(isPerfHarnessActive(['.', '--left', 'a'], { OPENCOMPARE_PERF: '1' })).toBe(false)
    expect(isPerfHarnessActive(argv(), { OPENCOMPARE_PERF: 'true' })).toBe(false)
  })
})

describe('parsePerfArgs', () => {
  it('parses a valid run with the documented defaults', async () => {
    const result = await parsePerfArgs(
      argv('--left', '/real/left', '--right', '/real/right', '--out', 'evidence.json'),
      readable
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config).toEqual({
      left: '/real/left',
      right: '/real/right',
      rounds: DEFAULT_PERF_ROUNDS,
      intervalMs: DEFAULT_PERF_INTERVAL_MS,
      out: 'evidence.json',
      profile: 'real',
      failOnViolation: false
    })
  })

  it('accepts inline values, a profile and --fail-on-violation', async () => {
    const result = await parsePerfArgs(
      argv(
        '--left=/real/left',
        '--right=/real/right',
        '--out=/tmp/e.json',
        '--rounds',
        '2',
        '--interval',
        '500',
        '--profile',
        'gate',
        '--fail-on-violation'
      ),
      readable
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.rounds).toBe(2)
    expect(result.config.intervalMs).toBe(500)
    expect(result.config.profile).toBe('gate')
    expect(result.config.failOnViolation).toBe(true)
  })

  it('rejects each missing required flag', async () => {
    const cases: Array<{ flag: string; args: string[] }> = [
      { flag: '--left', args: ['--right', '/real/right', '--out', '/tmp/e.json'] },
      { flag: '--right', args: ['--left', '/real/left', '--out', '/tmp/e.json'] },
      { flag: '--out', args: ['--left', '/real/left', '--right', '/real/right'] }
    ]
    for (const testCase of cases) {
      const result = await parsePerfArgs(argv(...testCase.args), readable)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain(testCase.flag)
    }
  })

  it.each(['0', '-1', 'abc', '1.5'])('rejects --rounds %s', async (rounds) => {
    const result = await parsePerfArgs(
      argv('--left', '/real/left', '--right', '/real/right', '--out', 'e.json', '--rounds', rounds),
      readable
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('--rounds')
  })

  it('rejects an interval above the two-second sampling ceiling', async () => {
    const result = await parsePerfArgs(
      argv(
        '--left',
        '/real/left',
        '--right',
        '/real/right',
        '--out',
        'e.json',
        '--interval',
        String(MAX_PERF_INTERVAL_MS + 1)
      ),
      readable
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('--interval')
  })

  it('rejects unknown flags by name', async () => {
    const result = await parsePerfArgs(
      argv('--left', '/real/left', '--right', '/real/right', '--out', 'e.json', '--bogus'),
      readable
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('--bogus')
  })

  it.each(['/real/left', '/real/right'])(
    'rejects an unreadable root and names the path (%s)',
    async (badRoot) => {
      const left = badRoot === '/real/left' ? '/missing/left' : '/real/left'
      const right = badRoot === '/real/right' ? '/missing/right' : '/real/right'
      const result = await parsePerfArgs(
        argv('--left', left, '--right', right, '--out', 'e.json'),
        readable
      )
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toContain(badRoot === '/real/left' ? '--left' : '--right')
      expect(result.error).toContain(badRoot === '/real/left' ? left : right)
    }
  )
})
