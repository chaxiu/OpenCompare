import { describe, expect, it } from 'vitest'
import { PerfRecorder } from './recorder'
import type { PerfProcessMetric } from './rss'
import type { PerfThresholds } from './types'

const MB = 1024 * 1024
const START = Date.parse('2026-10-22T00:00:00.000Z')

const thresholds: PerfThresholds = {
  rendererPeakBytes: 1536 * MB,
  appTotalPeakBytes: 2560 * MB,
  settleRendererBytes: 1300 * MB,
  roundDeltaMaxBytes: 100 * MB,
  roundDeltaRatio: 0.3,
  roundDeltaFloorBytes: 25 * MB
}

function startedAt(round: number): string {
  return new Date(START + round * 10_000).toISOString()
}

function endedAt(round: number): string {
  return new Date(START + round * 10_000 + 1000).toISOString()
}

function report(round: number, tabs = 1, hashedFiles = 20) {
  return {
    index: round,
    startedAt: startedAt(round),
    endedAt: endedAt(round),
    wallMs: 1000,
    sessionId: 'directory:/left ↔ /right',
    tabs,
    counts: { files: 10, dirs: 3, hashedFiles, bytesToHash: 4096 }
  }
}

function harness(
  options: {
    mode?: 'upsert' | 'multisession' | 'retained'
    hotRounds?: number
    pairs?: { left: string; right: string }[]
  } = {}
) {
  const mode = options.mode ?? 'upsert'
  const pairs = options.pairs ?? [{ left: '/left', right: '/right' }]
  let nowMs = START
  let rendererBytes = 100 * MB
  const metrics: PerfProcessMetric[] = [
    { pid: 4242, type: 'Browser', workingSetSize: 100_000 },
    { pid: 5151, type: 'Tab', workingSetSize: rendererBytes / 1024 },
    { pid: 6161, type: 'Utility', workingSetSize: 50_000 }
  ]
  const recorder = new PerfRecorder({
    mode,
    pairs,
    hotRounds: options.hotRounds ?? 0,
    left: pairs[0].left,
    right: pairs[0].right,
    profile: 'real',
    thresholds,
    intervalMs: 1000,
    settleMs: 20_000,
    appPid: 4242,
    commit: { sha: 'abc123', dirty: false },
    env: {
      os: '24.0.0',
      arch: 'arm64',
      cpuModel: 'Apple M3 Pro',
      cpuCount: 12,
      totalMemBytes: 36 * 1024 * MB,
      node: '24.4.1',
      electron: '37.10.3'
    },
    metrics: () => metrics,
    now: () => new Date(nowMs)
  })

  return {
    recorder,
    advance(ms: number) {
      nowMs += ms
    },
    setRenderer(bytes: number) {
      rendererBytes = bytes
      metrics[1] = { ...metrics[1], workingSetSize: bytes / 1024 }
    }
  }
}

describe('PerfRecorder', () => {
  it('records startup, round boundaries, periodic samples, rounds, peaks and verdict', () => {
    const { recorder, advance, setRenderer } = harness()
    recorder.startupBaseline()

    const rendererAfter = [140 * MB, 140 * MB, 145 * MB]
    for (let round = 1; round <= 3; round += 1) {
      advance(10)
      recorder.beginRound(round)
      advance(400)
      recorder.periodic()
      advance(400)
      recorder.periodic()
      setRenderer(rendererAfter[round - 1])
      advance(200)
      recorder.endRound(report(round))
      recorder.hold({ label: `round-${round}`, tabs: 1, comparisons: 1, rowModels: 2, gc: true })
    }
    recorder.settle()
    recorder.hold({ label: 'settle', tabs: 1, comparisons: 1, rowModels: 2, gc: true })

    const evidence = recorder.finalize()

    expect(evidence.schema).toBe('opencompare.perf.directory/v1')
    expect(evidence.mode).toBe('upsert')
    expect(evidence.pairs).toEqual([{ left: '/left', right: '/right' }])
    expect(evidence.appPid).toBe(4242)
    expect(evidence.commit).toEqual({ sha: 'abc123', dirty: false })
    expect(evidence.roots).toEqual({ left: '/left', right: '/right' })
    expect(evidence.sampling).toEqual({ intervalMs: 1000, settleMs: 20_000 })
    expect(evidence.memoryDefinition).toContain('app.getAppMetrics')
    expect(evidence.rounds).toHaveLength(3)
    expect(evidence.rounds[0].sessionId).toBe('directory:/left ↔ /right')
    expect(evidence.rounds[0].tabs).toBe(1)
    expect(evidence.env.cpuModel).toBe('Apple M3 Pro')
    expect(evidence.env.cpuCount).toBe(12)
    expect(evidence.samples.filter((sample) => sample.phase === 'pre-round')).toHaveLength(3)
    expect(evidence.samples.filter((sample) => sample.phase === 'post-round')).toHaveLength(3)
    expect(evidence.samples.filter((sample) => sample.phase === 'boundary')).toHaveLength(6)
    expect(evidence.samples.filter((sample) => sample.phase === 'periodic')).toHaveLength(6)
    expect(evidence.samples[0]).toMatchObject({ label: 'startup-baseline', phase: 'startup', round: 0 })
    expect(evidence.peaks.renderer).toBe(145 * MB)
    expect(evidence.roundDeltas.map((delta) => delta.rendererDelta)).toEqual([40 * MB, 0, 5 * MB])
    expect(evidence.verdict.ok).toBe(true)
    expect(evidence.verdict.appliedThresholds.appliedRoundDeltaBytes).toBe(25 * MB)
    // Every round ran in the same app and the same renderer process.
    expect(new Set(evidence.rounds.map((round) => round.rendererPid))).toEqual(new Set([5151]))
    expect(evidence.totalWallMs).toBeGreaterThan(0)
  })

  it('reports per-round renderer peaks from the window samples', () => {
    const { recorder, setRenderer } = harness()
    recorder.startupBaseline()
    recorder.beginRound(1)
    // A ready spike above the post-round reading must be the round's peak.
    setRenderer(300 * MB)
    recorder.periodic()
    setRenderer(150 * MB)
    recorder.endRound(report(1))
    recorder.hold({ label: 'round-1', tabs: 1, comparisons: 1, rowModels: 2, gc: true })
    recorder.beginRound(2)
    setRenderer(160 * MB)
    recorder.endRound(report(2))
    recorder.hold({ label: 'round-2', tabs: 1, comparisons: 1, rowModels: 2, gc: true })
    recorder.settle()
    recorder.hold({ label: 'settle', tabs: 1, comparisons: 1, rowModels: 2, gc: true })
    const evidence = recorder.finalize()
    expect(evidence.rounds[0].roundPeak).toBe(300 * MB)
    expect(evidence.rounds[1].roundPeak).toBe(160 * MB)
    expect(evidence.verdict.violations).not.toContain('renderer-round-peak')
  })

  it('keeps the settle reading out of the peak series and reports it separately', () => {
    const { recorder, setRenderer } = harness()
    recorder.startupBaseline()
    recorder.beginRound(1)
    setRenderer(200 * MB)
    recorder.endRound(report(1))
    recorder.hold({ label: 'round-1', tabs: 1, comparisons: 1, rowModels: 2, gc: true })
    // Settle is sampled after the last round; it must not inflate `peaks`.
    setRenderer(400 * MB)
    recorder.settle()
    recorder.hold({ label: 'settle', tabs: 1, comparisons: 1, rowModels: 2, gc: true })
    const evidence = recorder.finalize()
    expect(evidence.settle).toEqual({
      renderer: 400 * MB,
      main: 100_000 * 1024,
      appTotal: 400 * MB + 150_000 * 1024
    })
    expect(evidence.settleAt).not.toBeNull()
    expect(evidence.peaks.renderer).toBe(200 * MB)
    expect(evidence.verdict.violations).not.toContain('renderer-settle')
  })

  it('records post-GC hold samples and fails an unmeasured hold series', () => {
    const { recorder } = harness()
    recorder.startupBaseline()
    recorder.beginRound(1)
    recorder.endRound(report(1))
    recorder.hold({ label: 'round-1', tabs: 1, comparisons: 1, rowModels: 2, gc: true })
    recorder.settle()
    const green = recorder.finalize()
    expect(green.holds).toEqual([
      { label: 'round-1', round: 1, tabs: 1, comparisons: 1, rowModels: 2, gc: true }
    ])
    expect(green.verdict.violations).not.toContain('hold-unmeasured')

    const second = harness()
    second.recorder.startupBaseline()
    second.recorder.beginRound(1)
    second.recorder.endRound(report(1))
    second.recorder.hold({ label: 'round-1', tabs: 1, comparisons: 1, rowModels: 2, gc: false })
    second.recorder.settle()
    expect(second.recorder.finalize().verdict.violations).toContain('hold-unmeasured')
  })

  it('turns a zero renderer reading into invalid evidence instead of a green run', () => {
    const { recorder, setRenderer } = harness()
    recorder.startupBaseline()
    setRenderer(0)
    recorder.beginRound(1)
    recorder.endRound(report(1))
    recorder.settle()
    const evidence = recorder.finalize()
    expect(evidence.verdict.ok).toBe(false)
    expect(evidence.verdict.violations).toContain('invalid-sample')
  })

  it('writes a red verdict for a harness error while keeping the evidence complete', () => {
    const { recorder } = harness()
    recorder.startupBaseline()
    const evidence = recorder.finalize({ error: 'renderer crashed' })
    expect(evidence.error).toBe('renderer crashed')
    expect(evidence.verdict.ok).toBe(false)
    expect(evidence.verdict.violations).toContain('harness-error')
  })

  it('records retained settle stages and the reclaim reading', () => {
    const { recorder, setRenderer } = harness({
      mode: 'retained',
      hotRounds: 2,
      pairs: [
        { left: '/a', right: '/b' },
        { left: '/b', right: '/a' },
        { left: '/c', right: '/d' }
      ]
    })
    recorder.startupBaseline()
    for (let round = 1; round <= 2; round += 1) {
      recorder.beginRound(round)
      recorder.endRound(report(round, 3))
      recorder.hold({
        label: `round-${round}`,
        tabs: round,
        comparisons: round,
        rowModels: 2,
        gc: true
      })
    }
    setRenderer(500 * MB)
    recorder.settleStage('after-3-tabs', 3)
    recorder.hold({ label: 'after-3-tabs', tabs: 3, comparisons: 3, rowModels: 2, gc: true })
    setRenderer(510 * MB)
    recorder.settleStage('after-hot-upserts', 3)
    recorder.hold({ label: 'after-hot-upserts', tabs: 3, comparisons: 3, rowModels: 2, gc: true })
    setRenderer(400 * MB)
    recorder.reclaim(2)
    recorder.hold({ label: 'reclaim', tabs: 2, comparisons: 2, rowModels: 2, gc: true })

    const evidence = recorder.finalize()
    expect(evidence.mode).toBe('retained')
    expect(evidence.settleStages?.map((stage) => stage.label)).toEqual([
      'after-3-tabs',
      'after-hot-upserts'
    ])
    expect(evidence.settleStages?.map((stage) => stage.tabs)).toEqual([3, 3])
    expect(evidence.reclaim).toMatchObject({ tabs: 2, rss: { renderer: 400 * MB } })
    // The last settle stage is still the single `settle` column.
    expect(evidence.settle?.renderer).toBe(510 * MB)
    // Reclaim is kept out of the instantaneous peak series.
    expect(evidence.peaks.renderer).toBe(100 * MB)
    expect(evidence.verdict.ok).toBe(true)
  })

  it('rejects out-of-order rounds', () => {
    const { recorder } = harness()
    recorder.startupBaseline()
    expect(() => recorder.beginRound(2)).toThrow(/轮次顺序/)
    recorder.beginRound(1)
    expect(() => recorder.endRound(report(2))).toThrow(/不一致/)
  })
})
