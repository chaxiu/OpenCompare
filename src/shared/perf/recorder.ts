/**
 * Pure run recorder: owns the sample sequence, rounds, deltas and verdict of one
 * measurement run. The Electron main process only feeds it real
 * `app.getAppMetrics()` readings and a clock; the atomic file write lives in
 * `src/main/perf/evidenceFile.ts`.
 */
import { aggregateProcessRss } from './rss'
import type { PerfProcessMetric } from './rss'
import type {
  PerfEvidence,
  PerfEvidenceEnv,
  PerfHoldSample,
  PerfMode,
  PerfPair,
  PerfProfileName,
  PerfRoundDelta,
  PerfRoundReport,
  PerfRss,
  PerfSample,
  PerfSamplePhase,
  PerfThresholds
} from './types'
import { PERF_MEMORY_DEFINITION } from './types'
import { evaluatePerf } from './verdict'

export interface PerfRecorderInit {
  readonly mode: PerfMode
  readonly pairs: readonly PerfPair[]
  readonly left: string
  readonly right: string
  readonly profile: PerfProfileName
  readonly thresholds: PerfThresholds
  readonly intervalMs: number
  readonly settleMs: number
  readonly appPid: number
  readonly commit: PerfEvidence['commit']
  readonly env: PerfEvidenceEnv
  /** Returns one real process-metrics snapshot. */
  readonly metrics: () => readonly PerfProcessMetric[]
  /** Injectable clock; defaults to `new Date()`. */
  readonly now?: () => Date
}

interface RoundState {
  readonly report: PerfRoundReport
  readonly postRss: PerfRss
}

export class PerfRecorder {
  private readonly init: PerfRecorderInit
  private readonly samples: PerfSample[] = []
  private readonly rounds: RoundState[] = []
  private readonly holds: PerfHoldSample[] = []
  private settleRss: PerfRss | null = null
  private settleAt: string | null = null
  private currentRound = 0
  private startupTaken = false
  private finished = false

  constructor(init: PerfRecorderInit) {
    this.init = init
  }

  private now(): Date {
    return this.init.now?.() ?? new Date()
  }

  private sample(label: string, phase: PerfSamplePhase, round: number): PerfSample {
    const reading = aggregateProcessRss(this.init.metrics())
    const sample: PerfSample = {
      label,
      phase,
      round,
      at: this.now().toISOString(),
      rss: reading.rss,
      pids: reading.pids
    }
    this.samples.push(sample)
    return sample
  }

  /** The idle post-launch baseline; must be the first sample of a run. */
  startupBaseline(): void {
    if (this.startupTaken) throw new Error('perf: 启动基线只能采样一次。')
    this.startupTaken = true
    this.sample('startup-baseline', 'startup', 0)
  }

  /** Round boundary + pre-round samples, before the renderer starts comparing. */
  beginRound(round: number): void {
    if (!this.startupTaken) throw new Error('perf: 缺少启动基线采样。')
    if (round !== this.currentRound + 1) {
      throw new Error(`perf: 轮次顺序错误，期望第 ${this.currentRound + 1} 轮，收到第 ${round} 轮。`)
    }
    this.currentRound = round
    this.sample(`round-${round}-start`, 'boundary', round)
    this.sample(`round-${round}-pre`, 'pre-round', round)
  }

  /** Post-round + closing boundary samples, then records the round report. */
  endRound(report: PerfRoundReport): void {
    if (report.index !== this.currentRound) {
      throw new Error(`perf: 结束轮次与当前轮次不一致（当前 ${this.currentRound}，收到 ${report.index}）。`)
    }
    const post = this.sample(`round-${report.index}-post`, 'post-round', report.index)
    this.sample(`round-${report.index}-end`, 'boundary', report.index)
    // The ready peak of a round is the largest renderer reading seen inside
    // its own window, not just the post-round sample.
    let roundPeak = post.rss.renderer
    for (const sample of this.samples) {
      if (sample.round !== report.index || sample.phase === 'settle') continue
      roundPeak = Math.max(roundPeak, sample.rss.renderer)
    }
    this.rounds.push({
      report: {
        ...report,
        rendererRss: post.rss.renderer,
        appTotalRss: post.rss.appTotal,
        rendererPid: post.pids.renderer,
        roundPeak
      },
      postRss: post.rss
    })
  }

  /** One post-GC liveness reading, attributed to the round in progress. */
  hold(sample: {
    readonly label: string
    readonly tabs: number
    readonly comparisons: number
    readonly rowModels: number
    readonly gc: boolean
  }): void {
    this.holds.push({ ...sample, round: this.currentRound })
  }

  /** The single post-settle reading; kept out of the round/periodic peak series. */
  settle(): void {
    const sample = this.sample('settle', 'settle', this.currentRound)
    this.settleRss = sample.rss
    this.settleAt = sample.at
  }

  /** One fixed-interval background sample, attributed to the round in progress. */
  periodic(): void {
    if (!this.startupTaken || this.finished) return
    this.sample(`periodic-r${this.currentRound}-${this.samples.length}`, 'periodic', this.currentRound)
  }

  private peaks(): PerfRss {
    let renderer = 0
    let main = 0
    let appTotal = 0
    for (const sample of this.samples) {
      // The settle reading has its own column and never inflates the peaks.
      if (sample.phase === 'settle') continue
      renderer = Math.max(renderer, sample.rss.renderer)
      main = Math.max(main, sample.rss.main)
      appTotal = Math.max(appTotal, sample.rss.appTotal)
    }
    return { renderer, main, appTotal }
  }

  private deltas(): PerfRoundDelta[] {
    const baseline = this.samples.find((sample) => sample.phase === 'startup')?.rss
    const deltas: PerfRoundDelta[] = []
    let previous = baseline
    for (const round of this.rounds) {
      const current = round.postRss
      deltas.push({
        round: round.report.index,
        rendererDelta: (current?.renderer ?? 0) - (previous?.renderer ?? 0),
        appTotalDelta: (current?.appTotal ?? 0) - (previous?.appTotal ?? 0)
      })
      previous = current
    }
    return deltas
  }

  private totals(): { files: number; dirs: number; hashedFiles: number; bytesToHash: number } {
    const last = this.rounds[this.rounds.length - 1]?.report.counts
    let hashedFiles = 0
    let bytesToHash = 0
    for (const round of this.rounds) {
      hashedFiles += round.report.counts.hashedFiles
      bytesToHash += round.report.counts.bytesToHash
    }
    return {
      files: last?.files ?? 0,
      dirs: last?.dirs ?? 0,
      hashedFiles,
      bytesToHash
    }
  }

  /**
   * Closes the run and builds the evidence object. `error` marks a harness
   * failure: evidence is still complete but `verdict.ok` is forced false.
   */
  finalize(input: { readonly error?: string } = {}): PerfEvidence {
    this.finished = true
    const peaks = this.peaks()
    const roundDeltas = this.deltas()
    const invalidSamples = this.samples.some(
      (sample) =>
        sample.rss.main <= 0 ||
        sample.rss.renderer <= 0 ||
        sample.rss.appTotal <= 0 ||
        sample.pids.main === null ||
        sample.pids.renderer === null
    )
    const verdict = evaluatePerf({
      profile: this.init.profile,
      thresholds: this.init.thresholds,
      peaks,
      roundDeltas,
      invalidSamples,
      harnessError: input.error !== undefined,
      mode: this.init.mode,
      settle: this.settleRss,
      roundPeaks: this.rounds.map(
        (round) => round.report.roundPeak ?? round.report.rendererRss ?? 0
      ),
      holds: this.holds
    })

    const first = this.rounds[0]?.report
    const last = this.rounds[this.rounds.length - 1]?.report
    const totalWallMs =
      first !== undefined && last !== undefined
        ? Math.max(0, Date.parse(last.endedAt) - Date.parse(first.startedAt))
        : 0

    const evidence: PerfEvidence = {
      schema: 'opencompare.perf.directory/v1',
      generatedAt: this.now().toISOString(),
      appPid: this.init.appPid,
      commit: this.init.commit,
      mode: this.init.mode,
      pairs: [...this.init.pairs],
      roots: { left: this.init.left, right: this.init.right },
      profile: this.init.profile,
      sampling: { intervalMs: this.init.intervalMs, settleMs: this.init.settleMs },
      memoryDefinition: PERF_MEMORY_DEFINITION,
      counts: this.totals(),
      rounds: this.rounds.map((round) => round.report),
      totalWallMs,
      env: this.init.env,
      samples: [...this.samples],
      peaks,
      settle: this.settleRss,
      settleAt: this.settleAt,
      holds: [...this.holds],
      roundDeltas,
      verdict,
      ...(input.error === undefined ? {} : { error: input.error })
    }
    return evidence
  }
}
