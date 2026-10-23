import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PERF_INTERVAL_MS,
  DEFAULT_PERF_ROUNDS,
  DEFAULT_PERF_SETTLE_MS,
  MAX_PERF_INTERVAL_MS,
  MAX_PERF_SETTLE_MS,
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

const onePair = ['--left', '/real/left', '--right', '/real/right', '--out', 'evidence.json']

describe('isPerfHarnessActive', () => {
  it('requires both the explicit flag and the environment variable', () => {
    expect(isPerfHarnessActive(argv(), { OPENCOMPARE_PERF: '1' })).toBe(true)
    expect(isPerfHarnessActive(argv(), {})).toBe(false)
    expect(isPerfHarnessActive(['.', '--left', 'a'], { OPENCOMPARE_PERF: '1' })).toBe(false)
    expect(isPerfHarnessActive(argv(), { OPENCOMPARE_PERF: 'true' })).toBe(false)
  })
})

describe('parsePerfArgs', () => {
  it('keeps the legacy command line as a three-round upsert run with a 20s settle', async () => {
    const result = await parsePerfArgs(argv(...onePair), readable)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config).toEqual({
      mode: 'upsert',
      pairs: [{ left: '/real/left', right: '/real/right' }],
      left: '/real/left',
      right: '/real/right',
      rounds: DEFAULT_PERF_ROUNDS,
      settleMs: DEFAULT_PERF_SETTLE_MS,
      intervalMs: DEFAULT_PERF_INTERVAL_MS,
      out: 'evidence.json',
      profile: 'real',
      failOnViolation: false
    })
  })

  it('accepts inline values, an explicit upsert mode, a profile and --fail-on-violation', async () => {
    const result = await parsePerfArgs(
      argv(
        '--mode=upsert',
        '--left=/real/left',
        '--right=/real/right',
        '--out=/tmp/e.json',
        '--rounds',
        '2',
        '--settle',
        '5000',
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
    expect(result.config.settleMs).toBe(5000)
    expect(result.config.intervalMs).toBe(500)
    expect(result.config.profile).toBe('gate')
    expect(result.config.failOnViolation).toBe(true)
  })

  it('pairs repeated --left / --right in order for multisession', async () => {
    const result = await parsePerfArgs(
      argv(
        '--mode',
        'multisession',
        '--left',
        '/real/a',
        '--left',
        '/real/b',
        '--left',
        '/real/c',
        '--right',
        '/real/x',
        '--right',
        '/real/y',
        '--right',
        '/real/z',
        '--out',
        'e.json'
      ),
      readable
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.mode).toBe('multisession')
    expect(result.config.pairs).toEqual([
      { left: '/real/a', right: '/real/x' },
      { left: '/real/b', right: '/real/y' },
      { left: '/real/c', right: '/real/z' }
    ])
    // One round per pair unless explicitly repeated identically.
    expect(result.config.rounds).toBe(3)
    expect(result.config.left).toBe('/real/a')
    expect(result.config.right).toBe('/real/x')
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
      argv(...onePair, '--rounds', rounds),
      readable
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('--rounds')
  })

  it('rejects an unknown mode by name', async () => {
    const result = await parsePerfArgs(argv(...onePair, '--mode', 'soak'), readable)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('--mode')
    expect(result.error).toContain('upsert')
    expect(result.error).toContain('multisession')
  })

  it('rejects a settlement wait above the ceiling and accepts the zero latency form', async () => {
    const over = await parsePerfArgs(
      argv(...onePair, '--settle', String(MAX_PERF_SETTLE_MS + 1)),
      readable
    )
    expect(over.ok).toBe(false)
    if (!over.ok) expect(over.error).toContain('--settle')

    const zero = await parsePerfArgs(argv(...onePair, '--settle', '0'), readable)
    expect(zero.ok).toBe(true)
    if (zero.ok) expect(zero.config.settleMs).toBe(0)

    const negative = await parsePerfArgs(argv(...onePair, '--settle', '-5'), readable)
    expect(negative.ok).toBe(false)
  })

  it('rejects an interval above the two-second sampling ceiling', async () => {
    const result = await parsePerfArgs(
      argv(...onePair, '--interval', String(MAX_PERF_INTERVAL_MS + 1)),
      readable
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('--interval')
  })

  it('rejects mismatched pair counts and mode-specific pair counts', async () => {
    const mismatched = await parsePerfArgs(
      argv(
        '--left',
        '/real/a',
        '--left',
        '/real/b',
        '--right',
        '/real/x',
        '--out',
        'e.json'
      ),
      readable
    )
    expect(mismatched.ok).toBe(false)
    if (!mismatched.ok) expect(mismatched.error).toContain('数量不一致')

    const upsertTwo = await parsePerfArgs(
      argv(
        '--left',
        '/real/a',
        '--left',
        '/real/b',
        '--right',
        '/real/x',
        '--right',
        '/real/y',
        '--out',
        'e.json'
      ),
      readable
    )
    expect(upsertTwo.ok).toBe(false)
    if (!upsertTwo.ok) expect(upsertTwo.error).toContain('upsert')

    const multiOne = await parsePerfArgs(
      argv('--mode', 'multisession', ...onePair),
      readable
    )
    expect(multiOne.ok).toBe(false)
    if (!multiOne.ok) expect(multiOne.error).toContain('multisession')
  })

  it('rejects a multisession --rounds below the pair count', async () => {
    const result = await parsePerfArgs(
      argv(
        '--mode',
        'multisession',
        '--left',
        '/real/a',
        '--left',
        '/real/b',
        '--right',
        '/real/x',
        '--right',
        '/real/y',
        '--rounds',
        '5',
        '--out',
        'e.json'
      ),
      readable
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('--rounds')
  })

  it('rejects unknown flags by name', async () => {
    const result = await parsePerfArgs(argv(...onePair, '--bogus'), readable)
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
