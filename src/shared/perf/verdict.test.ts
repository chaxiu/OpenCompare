import { describe, expect, it } from 'vitest'
import {
  VIOLATION_APP_TOTAL_PEAK,
  VIOLATION_HOLD_COMPARISONS,
  VIOLATION_HOLD_ROW_MODELS,
  VIOLATION_HOLD_TABS,
  VIOLATION_HOLD_UNMEASURED,
  VIOLATION_RENDERER_PEAK,
  VIOLATION_RENDERER_ROUND_PEAK,
  VIOLATION_RENDERER_SETTLE,
  VIOLATION_ROUND_DELTA,
  appliedRoundDeltaBytes,
  evaluatePerf,
  formatPerfViolations,
  parseThresholds,
  resolvePerfExitCode
} from './verdict'
import type { PerfHoldSample, PerfRoundDelta, PerfThresholds } from './types'

const MB = 1024 * 1024

const real: PerfThresholds = {
  rendererPeakBytes: 1536 * MB,
  appTotalPeakBytes: 2560 * MB,
  settleRendererBytes: 1300 * MB,
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

function hold(round: number, comparisons: number, rowModels = 2, tabs = round): PerfHoldSample {
  return { label: round === 0 ? 'settle' : `round-${round}`, round, tabs, comparisons, rowModels, gc: true }
}

const calmPeaks = { renderer: 900 * MB, main: 300 * MB, appTotal: 1500 * MB }

describe('evaluatePerf', () => {
  it('passes when peaks and the third-round increment are within the real profile', () => {
    const verdict = evaluatePerf({
      profile: 'real',
      thresholds: real,
      peaks: calmPeaks,
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

  it('flags any round window peak above the renderer ceiling', () => {
    const verdict = evaluatePerf({
      profile: 'real',
      thresholds: real,
      peaks: calmPeaks,
      roundDeltas: deltas(10 * MB, 0, 0),
      roundPeaks: [700 * MB, 1400 * MB, 1600 * MB],
      mode: 'upsert'
    })
    expect(verdict.ok).toBe(false)
    expect(verdict.violations).toContain(VIOLATION_RENDERER_ROUND_PEAK)
  })

  it('keeps the settle reading in its own column', () => {
    const green = evaluatePerf({
      profile: 'real',
      thresholds: real,
      peaks: calmPeaks,
      roundDeltas: deltas(10 * MB, 0, 0),
      settle: { renderer: 1200 * MB, main: 300 * MB, appTotal: 1800 * MB }
    })
    expect(green.ok).toBe(true)

    const red = evaluatePerf({
      profile: 'real',
      thresholds: real,
      peaks: calmPeaks,
      roundDeltas: deltas(10 * MB, 0, 0),
      settle: { renderer: 1400 * MB, main: 300 * MB, appTotal: 1800 * MB }
    })
    expect(red.ok).toBe(false)
    expect(red.violations).toContain(VIOLATION_RENDERER_SETTLE)

    const missing = evaluatePerf({
      profile: 'real',
      thresholds: real,
      peaks: calmPeaks,
      roundDeltas: deltas(10 * MB, 0, 0),
      settle: null
    })
    expect(missing.violations).toContain('settle-missing')
  })

  it('fails an upsert run that still holds previous comparisons or row models', () => {
    const verdict = evaluatePerf({
      profile: 'real',
      thresholds: real,
      peaks: calmPeaks,
      roundDeltas: deltas(10 * MB, 0, 0),
      mode: 'upsert',
      settle: { renderer: 900 * MB, main: 300 * MB, appTotal: 1200 * MB },
      holds: [hold(1, 1), hold(2, 2), { ...hold(0, 3, 4), round: 2 }]
    })
    expect(verdict.ok).toBe(false)
    expect(verdict.violations).toContain(VIOLATION_HOLD_COMPARISONS)
    expect(verdict.violations).toContain(VIOLATION_HOLD_ROW_MODELS)
    expect(verdict.violations).toContain(VIOLATION_HOLD_TABS)
  })

  it('accepts the multisession structural shape i/i/i and rejects a lower count', () => {
    const green = evaluatePerf({
      profile: 'real',
      thresholds: real,
      peaks: calmPeaks,
      roundDeltas: deltas(400 * MB, 300 * MB, 200 * MB),
      mode: 'multisession',
      settle: { renderer: 1200 * MB, main: 300 * MB, appTotal: 1800 * MB },
      holds: [hold(1, 1), hold(2, 2), hold(3, 3), { ...hold(3, 3), label: 'settle' }]
    })
    // A multisession run appends a real tab per round; the growth cap does not apply.
    expect(green.ok).toBe(true)

    const red = evaluatePerf({
      profile: 'real',
      thresholds: real,
      peaks: calmPeaks,
      roundDeltas: deltas(400 * MB, 300 * MB, 200 * MB),
      mode: 'multisession',
      settle: { renderer: 1200 * MB, main: 300 * MB, appTotal: 1800 * MB },
      holds: [hold(1, 1), hold(2, 1), hold(3, 3)]
    })
    expect(red.violations).toContain(VIOLATION_HOLD_COMPARISONS)
  })

  it('turns an unmeasured or empty hold series into a red verdict', () => {
    const unmeasured = evaluatePerf({
      profile: 'real',
      thresholds: real,
      peaks: calmPeaks,
      roundDeltas: deltas(10 * MB, 0, 0),
      mode: 'upsert',
      holds: [{ ...hold(1, 1), gc: false }]
    })
    expect(unmeasured.violations).toContain(VIOLATION_HOLD_UNMEASURED)

    const empty = evaluatePerf({
      profile: 'real',
      thresholds: real,
      peaks: calmPeaks,
      roundDeltas: deltas(10 * MB, 0, 0),
      mode: 'upsert',
      holds: []
    })
    expect(empty.violations).toContain(VIOLATION_HOLD_UNMEASURED)
  })

  it('keeps the 30% ratio capped by 100 MB when the first increment is large', () => {
    // 30% of 500 MB is 150 MB, capped at 100 MB.
    expect(appliedRoundDeltaBytes(real, 500 * MB)).toBe(100 * MB)
    const verdict = evaluatePerf({
      profile: 'real',
      thresholds: real,
      peaks: calmPeaks,
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
      peaks: calmPeaks,
      roundDeltas: deltas(30 * MB, 0, 26 * MB)
    })
    expect(over.ok).toBe(false)
    expect(over.violations).toContain(VIOLATION_ROUND_DELTA)

    const under = evaluatePerf({
      profile: 'real',
      thresholds: real,
      peaks: calmPeaks,
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
    expect(typeof parseThresholds({ ...real, settleRendererBytes: undefined })).toBe('string')
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
    expect(resolvePerfExitCode({ ...green, ok: false, violations: ['invalid-sample'] }, false)).toBe(
      1
    )
    expect(
      resolvePerfExitCode({ ...green, ok: false, violations: ['harness-error'] }, false)
    ).toBe(1)
  })
})
