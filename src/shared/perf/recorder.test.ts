import { describe, expect, it } from 'vitest'
import { PerfRecorder } from './recorder'
import type { PerfProcessMetric } from './rss'
import type { PerfRoundReport } from './types'

const MB = 1024 * 1024
const START = Date.parse('2026-10-22T00:00:00.000Z')

function report(index: number, startedAt: string, endedAt: string): PerfRoundReport {
  return {
    index,
    startedAt,
    endedAt,
    wallMs: Date.parse(endedAt) - Date.parse(startedAt),
    sessionId: `directory:/left ↔ /right#round-${index}`,
    counts: { files: 10, dirs: 3, hashedFiles: 20, bytesToHash: 4096 }
  }
}

function harness() {
  let nowMs = START
  let rendererBytes = 100 * MB
  const metrics: PerfProcessMetric[] = [
    { pid: 4242, type: 'Browser', workingSetSize: 100_000 },
    { pid: 5151, type: 'Tab', workingSetSize: rendererBytes / 1024 },
    { pid: 6161, type: 'Utility', workingSetSize: 50_000 }
  ]
  const recorder = new PerfRecorder({
    left: '/left',
    right: '/right',
    profile: 'real',
    thresholds: {
      rendererPeakBytes: 1536 * MB,
      appTotalPeakBytes: 2560 * MB,
      roundDeltaMaxBytes: 100 * MB,
      roundDeltaRatio: 0.3,
      roundDeltaFloorBytes: 25 * MB
    },
    intervalMs: 1000,
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
      const tab = metrics[1]
      metrics[1] = { ...tab, workingSetSize: bytes / 1024 }
    }
  }
}

describe('PerfRecorder', () => {
  it('records startup, round boundaries, periodic samples, rounds, peaks and verdict', () => {
    const { recorder, advance, setRenderer } = harness()
    recorder.startupBaseline()

    const rendererAfter = [140 * MB, 140 * MB, 145 * MB]
    for (let round = 1; round <= 3; round += 1) {
      const startedAt = new Date(START + round * 10_000).toISOString()
      advance(10)
      recorder.beginRound(round)
      advance(400)
      recorder.periodic()
      advance(400)
      recorder.periodic()
      setRenderer(rendererAfter[round - 1])
      advance(200)
      const endedAt = new Date(START + round * 10_000 + 1000).toISOString()
      recorder.endRound(report(round, startedAt, endedAt))
    }

    const evidence = recorder.finalize()

    expect(evidence.schema).toBe('opencompare.perf.directory/v1')
    expect(evidence.appPid).toBe(4242)
    expect(evidence.commit).toEqual({ sha: 'abc123', dirty: false })
    expect(evidence.roots).toEqual({ left: '/left', right: '/right' })
    expect(evidence.sampling.intervalMs).toBe(1000)
    expect(evidence.memoryDefinition).toContain('app.getAppMetrics')
    expect(evidence.rounds).toHaveLength(3)
    expect(evidence.rounds[0].sessionId).toBe('directory:/left ↔ /right#round-1')
    expect(evidence.env.cpuModel).toBe('Apple M3 Pro')
    expect(evidence.env.cpuCount).toBe(12)
    expect(evidence.samples.filter((sample) => sample.phase === 'pre-round')).toHaveLength(3)
    expect(evidence.samples.filter((sample) => sample.phase === 'post-round')).toHaveLength(3)
    expect(evidence.samples.filter((sample) => sample.phase === 'boundary')).toHaveLength(6)
    expect(evidence.samples.filter((sample) => sample.phase === 'periodic')).toHaveLength(6)
    expect(evidence.samples[0]).toMatchObject({ label: 'startup-baseline', phase: 'startup', round: 0 })
    expect(evidence.peaks.renderer).toBe(145 * MB)
    expect(evidence.peaks.main).toBe(100_000 * 1024)
    expect(evidence.roundDeltas.map((delta) => delta.rendererDelta)).toEqual([
      40 * MB,
      0,
      5 * MB
    ])
    expect(evidence.verdict.ok).toBe(true)
    expect(evidence.verdict.appliedThresholds.appliedRoundDeltaBytes).toBe(25 * MB)
    // Every round ran in the same app and the same renderer process.
    expect(new Set(evidence.rounds.map((round) => round.rendererPid))).toEqual(new Set([5151]))
    expect(evidence.totalWallMs).toBeGreaterThan(0)
  })

  it('turns a zero renderer reading into invalid evidence instead of a green run', () => {
    const { recorder, setRenderer } = harness()
    recorder.startupBaseline()
    setRenderer(0)
    recorder.beginRound(1)
    recorder.endRound(
      report(1, new Date(START + 1000).toISOString(), new Date(START + 2000).toISOString())
    )
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

  it('rejects out-of-order rounds', () => {
    const { recorder } = harness()
    recorder.startupBaseline()
    expect(() => recorder.beginRound(2)).toThrow(/轮次顺序/)
    recorder.beginRound(1)
    expect(() =>
      recorder.endRound(
        report(2, new Date(START + 1000).toISOString(), new Date(START + 2000).toISOString())
      )
    ).toThrow(/不一致/)
  })
})
