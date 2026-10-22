import { describe, expect, it } from 'vitest'
import {
  VIOLATION_APP_TOTAL_PEAK,
  VIOLATION_RENDERER_PEAK,
  VIOLATION_ROUND_DELTA,
  appliedRoundDeltaBytes,
  evaluatePerf,
  formatPerfViolations,
  parseThresholds,
  resolvePerfExitCode
} from './verdict'
import type { PerfRoundDelta, PerfThresholds } from './types'

const MB = 1024 * 1024

const real: PerfThresholds = {
  rendererPeakBytes: 1536 * MB,
  appTotalPeakBytes: 2560 * MB,
  roundDeltaMaxBytes: 100 * MB,
  roundDeltaRatio: 0.3,
  roundDeltaFloorBytes: 25 * MB
}

function deltas(...rendererDeltas: number[]): PerfRoundDelta[] {
  return rendererDeltas.map((rendererDelta, index) => ({
    round: index + 1,
    rendererDelta,
    appTotalDelta: rendererDelta
  }))
}

describe('evaluatePerf', () => {
  it('passes when peaks and the third-round increment are within the real profile', () => {
    const verdict = evaluatePerf({
      profile: 'real',
      thresholds: real,
      peaks: { renderer: 900 * MB, main: 300 * MB, appTotal: 1500 * MB },
      roundDeltas: deltas(40 * MB, 0, 10 * MB)
    })
    expect(verdict.ok).toBe(true)
    expect(verdict.violations).toEqual([])
    expect(verdict.appliedThresholds.appliedRoundDeltaBytes).toBe(25 * MB)
  })

  it('flags a renderer peak above the limit', () => {
    const verdict = evaluatePerf({
      profile: 'real',
      thresholds: real,
      peaks: { renderer: 1600 * MB, main: 300 * MB, appTotal: 1900 * MB },
      roundDeltas: deltas(10 * MB, 0, 0)
    })
    expect(verdict.ok).toBe(false)
    expect(verdict.violations).toContain(VIOLATION_RENDERER_PEAK)
  })

  it('flags the whole-app peak above the limit', () => {
    const verdict = evaluatePerf({
      profile: 'real',
      thresholds: real,
      peaks: { renderer: 900 * MB, main: 300 * MB, appTotal: 2600 * MB },
      roundDeltas: deltas(10 * MB, 0, 0)
    })
    expect(verdict.ok).toBe(false)
    expect(verdict.violations).toContain(VIOLATION_APP_TOTAL_PEAK)
  })

  it('keeps the 30% ratio capped by 100 MB when the first increment is large', () => {
    // 30% of 500 MB is 150 MB, capped at 100 MB.
    expect(appliedRoundDeltaBytes(real, 500 * MB)).toBe(100 * MB)
    const verdict = evaluatePerf({
      profile: 'real',
      thresholds: real,
      peaks: { renderer: 900 * MB, main: 300 * MB, appTotal: 1500 * MB },
      roundDeltas: deltas(500 * MB, 0, 120 * MB)
    })
    expect(verdict.ok).toBe(false)
    expect(verdict.violations).toContain(VIOLATION_ROUND_DELTA)
  })

  it('protects the ratio term with the 25 MB floor', () => {
    // 30% of 30 MB is 9 MB, raised to the 25 MB floor.
    expect(appliedRoundDeltaBytes(real, 30 * MB)).toBe(25 * MB)
    const over = evaluatePerf({
      profile: 'real',
      thresholds: real,
      peaks: { renderer: 900 * MB, main: 300 * MB, appTotal: 1500 * MB },
      roundDeltas: deltas(30 * MB, 0, 26 * MB)
    })
    expect(over.ok).toBe(false)
    expect(over.violations).toContain(VIOLATION_ROUND_DELTA)

    const under = evaluatePerf({
      profile: 'real',
      thresholds: real,
      peaks: { renderer: 900 * MB, main: 300 * MB, appTotal: 1500 * MB },
      roundDeltas: deltas(30 * MB, 0, 24 * MB)
    })
    expect(under.ok).toBe(true)
  })

  it('only applies the growth rule from the third round on', () => {
    const verdict = evaluatePerf({
      profile: 'gate',
      thresholds: { ...real, rendererPeakBytes: 1024 * MB, appTotalPeakBytes: 2048 * MB },
      peaks: { renderer: 500 * MB, main: 200 * MB, appTotal: 900 * MB },
      roundDeltas: deltas(40 * MB, 90 * MB)
    })
    expect(verdict.ok).toBe(true)
  })

  it('turns invalid samples and harness errors into red verdicts', () => {
    const invalid = evaluatePerf({
      profile: 'real',
      thresholds: real,
      peaks: { renderer: 1, main: 1, appTotal: 2 },
      roundDeltas: [],
      invalidSamples: true
    })
    expect(invalid.ok).toBe(false)
    expect(invalid.violations).toContain('invalid-sample')

    const failed = evaluatePerf({
      profile: 'real',
      thresholds: real,
      peaks: { renderer: 1, main: 1, appTotal: 2 },
      roundDeltas: [],
      harnessError: true
    })
    expect(failed.ok).toBe(false)
    expect(failed.violations).toContain('harness-error')
  })
})

describe('parseThresholds', () => {
  it('accepts the committed profiles', () => {
    expect(parseThresholds(real)).toEqual(real)
  })

  it('rejects a missing or negative field', () => {
    expect(typeof parseThresholds({ ...real, rendererPeakBytes: -1 })).toBe('string')
    expect(typeof parseThresholds({ ...real, appTotalPeakBytes: 'big' })).toBe('string')
    expect(typeof parseThresholds(null)).toBe('string')
  })
})


describe('resolvePerfExitCode', () => {
  const green = evaluatePerf({
    profile: 'gate',
    thresholds: real,
    peaks: { renderer: 100 * MB, main: 100 * MB, appTotal: 200 * MB },
    roundDeltas: deltas(10 * MB, 0, 0)
  })
  const red = evaluatePerf({
    profile: 'gate',
    thresholds: real,
    peaks: { renderer: 2000 * MB, main: 100 * MB, appTotal: 2100 * MB },
    roundDeltas: deltas(10 * MB, 0, 0)
  })

  it('returns zero for a green run and for a red run without --fail-on-violation', () => {
    expect(resolvePerfExitCode(green, true)).toBe(0)
    expect(resolvePerfExitCode(red, false)).toBe(0)
  })

  it('returns non-zero for a red run under --fail-on-violation and names the ids', () => {
    expect(red.ok).toBe(false)
    expect(red.violations.length).toBeGreaterThan(0)
    expect(resolvePerfExitCode(red, true)).toBe(1)
    for (const id of red.violations) {
      expect(formatPerfViolations(red)).toContain(id)
    }
  })

  it('always fails invalid samples and harness errors', () => {
    expect(
      resolvePerfExitCode(
        { ...green, ok: false, violations: ['invalid-sample'] },
        false
      )
    ).toBe(1)
    expect(
      resolvePerfExitCode({ ...green, ok: false, violations: ['harness-error'] }, false)
    ).toBe(1)
  })
})
