/**
 * Single-point threshold evaluation for every profile. The real run and the
 * small gate dataset only differ in the numbers loaded from `perf/profiles.json`;
 * the rule itself is never duplicated.
 *
 * Two independent columns are judged here: the ready/running peak (round windows
 * and periodic samples) and the post-settle readings. Structural assertions on
 * the post-GC liveness counts make "the UI held the previous trees" a failing
 * condition instead of a note in a report.
 *
 * Multi-tab scenes (`multisession` / `retained`) are judged on the user-visible
 * shape instead of a transient peak: the settle readings and the whole-app peak
 * stay hard lines, while an instantaneous ready peak is only a regression
 * guardrail. The old profile target is still reported as a notice so the
 * evidence keeps the comparison column.
 */
import type {
  PerfHoldSample,
  PerfMode,
  PerfProfileName,
  PerfReclaim,
  PerfRoundDelta,
  PerfRss,
  PerfSettleStage,
  PerfThresholds,
  PerfVerdict
} from './types'

export const VIOLATION_RENDERER_PEAK = 'renderer-peak'
export const VIOLATION_APP_TOTAL_PEAK = 'app-total-peak'
export const VIOLATION_ROUND_DELTA = 'round-delta'
export const VIOLATION_INVALID_SAMPLE = 'invalid-sample'
export const VIOLATION_HARNESS_ERROR = 'harness-error'
export const VIOLATION_RENDERER_ROUND_PEAK = 'renderer-round-peak'
export const VIOLATION_RENDERER_SETTLE = 'renderer-settle'
export const VIOLATION_SETTLE_MISSING = 'settle-missing'
export const VIOLATION_HOLD_COMPARISONS = 'hold-comparisons'
export const VIOLATION_HOLD_ROW_MODELS = 'hold-row-models'
export const VIOLATION_HOLD_TABS = 'hold-tabs'
export const VIOLATION_HOLD_UNMEASURED = 'hold-unmeasured'
export const VIOLATION_HOT_ROUND_HASHED = 'hot-round-hashed'
export const VIOLATION_HOT_ROUND_GROWTH = 'hot-round-growth'
export const VIOLATION_SETTLE_GROWTH = 'settle-growth'
export const VIOLATION_RECLAIM_MISSING = 'reclaim-missing'
export const VIOLATION_RECLAIM_RENDERER = 'reclaim-renderer'
export const VIOLATION_RENDERER_RESTART = 'renderer-restart'

/** Non-fatal: a transient peak above the profile target but under the guardrail. */
export const NOTICE_RENDERER_PEAK_OVER_TARGET = 'renderer-peak-over-target'
export const NOTICE_RENDERER_ROUND_PEAK_OVER_TARGET = 'renderer-round-peak-over-target'

/**
 * Instantaneous ready-peak guardrail for multi-tab scenes (2.25 GiB). A
 * multi-tab run may legitimately hold two trees for a commit window, so this is
 * a regression line, not the old per-ring target.
 */
export const TRANSIENT_PEAK_GUARDRAIL_BYTES = 2_415_919_104
/** Renderer RSS that must be reached after one tab is closed (1,100 MiB). */
export const RECLAIM_RENDERER_BYTES = 1_153_433_600

/** Rounds whose third increment is capped by the growth rule. */
export const ROUND_DELTA_RULE_START = 3

/** Row models one active directory tab legitimately holds (left + right). */
export const MAX_LIVE_ROW_MODELS = 2

/** Settle-stage labels of a `retained` run. */
export const SETTLE_STAGE_AFTER_TABS = 'after-3-tabs'
export const SETTLE_STAGE_AFTER_HOT = 'after-hot-upserts'
export const RECLAIM_LABEL = 'reclaim'

/** The tab plan of a `retained` run, needed to judge its structure. */
export interface RetainedPlan {
  readonly pairs: number
  readonly hotRounds: number
}

export interface PerfEvaluationInput {
  readonly profile: PerfProfileName
  readonly thresholds: PerfThresholds
  readonly peaks: PerfRss
  readonly roundDeltas: readonly PerfRoundDelta[]
  /** True when any sample carried a missing/zero RSS reading. */
  readonly invalidSamples?: boolean
  /** True when the harness itself failed before/while producing evidence. */
  readonly harnessError?: boolean
  /** Holding mode; the tab/round-delta rules differ between the modes. */
  readonly mode?: PerfMode
  /** Post-settle reading; `null` means a run that never produced one. */
  readonly settle?: PerfRss | null
  /** Per-round renderer peaks (`rounds[].roundPeak`). */
  readonly roundPeaks?: readonly number[]
  /** Per-round files actually hashed (`rounds[].counts.hashedFiles`). */
  readonly roundHashedFiles?: readonly number[]
  /** Per-round renderer pid, to prove the process never restarted. */
  readonly rendererPids?: readonly (number | null)[]
  /** Named settle readings of a `retained` run. */
  readonly settleStages?: readonly PerfSettleStage[]
  /** Post-close reading of a `retained` run. */
  readonly reclaim?: PerfReclaim | null
  /** Tab/hot-round plan; required to judge a `retained` run completely. */
  readonly retained?: RetainedPlan
  /**
   * Post-GC liveness readings. `undefined` means "not measured by this caller"
   * (unit fixtures); an empty array from a real run is red.
   */
  readonly holds?: readonly PerfHoldSample[]
}

/**
 * Effective 3rd-round renderer allowance:
 * `min(absCap, max(30% × Δ1, floor))`, where `Δ1` is the first round's renderer
 * increment over the startup baseline. The floor keeps a tiny first increment
 * from turning into an unreachable 0-byte allowance.
 */
export function appliedRoundDeltaBytes(
  thresholds: PerfThresholds,
  firstRoundDelta: number
): number {
  const ratioTerm = Math.max(0, thresholds.roundDeltaRatio) * Math.max(0, firstRoundDelta)
  return Math.min(
    thresholds.roundDeltaMaxBytes,
    Math.max(ratioTerm, thresholds.roundDeltaFloorBytes)
  )
}

/** Tabs a hold reading must show, derived from the mode's own plan. */
function expectedHoldTabs(
  mode: PerfMode | undefined,
  hold: PerfHoldSample,
  retained: RetainedPlan | undefined
): number {
  if (mode === 'retained') {
    const pairs = retained?.pairs ?? hold.round
    if (hold.label === RECLAIM_LABEL) return Math.max(0, pairs - 1)
    if (hold.label === SETTLE_STAGE_AFTER_TABS || hold.label === SETTLE_STAGE_AFTER_HOT) {
      return pairs
    }
    if (hold.label.startsWith('round-')) {
      return hold.round <= pairs ? hold.round : pairs
    }
    return pairs
  }
  return mode === 'multisession' ? hold.round : 1
}

function holdViolations(
  mode: PerfMode | undefined,
  holds: readonly PerfHoldSample[] | undefined,
  retained: RetainedPlan | undefined
): string[] {
  if (holds === undefined) return []
  if (holds.length === 0) return [VIOLATION_HOLD_UNMEASURED]
  const violations: string[] = []
  for (const hold of holds) {
    if (!hold.gc) violations.push(VIOLATION_HOLD_UNMEASURED)
    if (hold.rowModels > MAX_LIVE_ROW_MODELS) violations.push(VIOLATION_HOLD_ROW_MODELS)
    // A summary-only inactive tab means only the active session holds a
    // comparison, in every mode — the old "= round" shape is exactly the bug.
    if (hold.comparisons !== 1) violations.push(VIOLATION_HOLD_COMPARISONS)
    if (hold.tabs !== expectedHoldTabs(mode, hold, retained)) {
      violations.push(VIOLATION_HOLD_TABS)
    }
  }
  return violations
}

function retainedViolations(
  input: PerfEvaluationInput,
  plan: RetainedPlan,
  add: (id: string) => void
): void {
  const roundPeaks = input.roundPeaks ?? []
  const hashed = input.roundHashedFiles ?? []
  const hotRoundIndexes: number[] = []
  for (let round = plan.pairs + 1; round <= plan.pairs + plan.hotRounds; round += 1) {
    hotRoundIndexes.push(round)
  }
  for (const round of hotRoundIndexes) {
    const hashedFiles = hashed[round - 1]
    if (hashedFiles !== undefined && hashedFiles !== 0) add(VIOLATION_HOT_ROUND_HASHED)
    const peak = roundPeaks[round - 1]
    const previous = roundPeaks[round - 2]
    if (
      peak !== undefined &&
      previous !== undefined &&
      peak - previous > input.thresholds.roundDeltaMaxBytes
    ) {
      add(VIOLATION_HOT_ROUND_GROWTH)
    }
  }

  for (const stage of input.settleStages ?? []) {
    if (stage.rss.renderer > input.thresholds.settleRendererBytes) add(VIOLATION_RENDERER_SETTLE)
  }
  const afterTabs = input.settleStages?.find((stage) => stage.label === SETTLE_STAGE_AFTER_TABS)
  const afterHot = input.settleStages?.find((stage) => stage.label === SETTLE_STAGE_AFTER_HOT)
  if (afterTabs !== undefined && afterHot !== undefined) {
    const rendererGrowth = afterHot.rss.renderer - afterTabs.rss.renderer
    const appGrowth = afterHot.rss.appTotal - afterTabs.rss.appTotal
    if (
      rendererGrowth > input.thresholds.roundDeltaMaxBytes ||
      appGrowth > input.thresholds.roundDeltaMaxBytes
    ) {
      add(VIOLATION_SETTLE_GROWTH)
    }
  }

  if (input.reclaim === undefined || input.reclaim === null) {
    add(VIOLATION_RECLAIM_MISSING)
  } else if (input.reclaim.rss.renderer > RECLAIM_RENDERER_BYTES) {
    add(VIOLATION_RECLAIM_RENDERER)
  }
}

export function evaluatePerf(input: PerfEvaluationInput): PerfVerdict {
  const { thresholds, peaks, roundDeltas } = input
  const firstRoundDelta = roundDeltas[0]?.rendererDelta ?? 0
  const appliedDelta = appliedRoundDeltaBytes(thresholds, firstRoundDelta)
  const violations = new Set<string>()
  const notices = new Set<string>()
  const transient = input.mode === 'multisession' || input.mode === 'retained'

  if (input.invalidSamples === true) violations.add(VIOLATION_INVALID_SAMPLE)
  if (input.harnessError === true) violations.add(VIOLATION_HARNESS_ERROR)
  if (transient) {
    if (peaks.renderer > TRANSIENT_PEAK_GUARDRAIL_BYTES) {
      violations.add(VIOLATION_RENDERER_PEAK)
    } else if (peaks.renderer > thresholds.rendererPeakBytes) {
      notices.add(NOTICE_RENDERER_PEAK_OVER_TARGET)
    }
  } else if (peaks.renderer > thresholds.rendererPeakBytes) {
    violations.add(VIOLATION_RENDERER_PEAK)
  }
  if (peaks.appTotal > thresholds.appTotalPeakBytes) violations.add(VIOLATION_APP_TOTAL_PEAK)

  for (const peak of input.roundPeaks ?? []) {
    if (transient) {
      if (peak > TRANSIENT_PEAK_GUARDRAIL_BYTES) violations.add(VIOLATION_RENDERER_ROUND_PEAK)
      else if (peak > thresholds.rendererPeakBytes) {
        notices.add(NOTICE_RENDERER_ROUND_PEAK_OVER_TARGET)
      }
    } else if (peak > thresholds.rendererPeakBytes) {
      violations.add(VIOLATION_RENDERER_ROUND_PEAK)
    }
  }

  if (input.settle === null) {
    violations.add(VIOLATION_SETTLE_MISSING)
  } else if (input.settle !== undefined) {
    if (input.settle.renderer > thresholds.settleRendererBytes) {
      violations.add(VIOLATION_RENDERER_SETTLE)
    }
  }

  // A multisession run legitimately grows one real tab per round, so the
  // per-round growth cap only applies to the in-place upsert mode.
  if (input.mode !== 'multisession' && input.mode !== 'retained') {
    const thirdRound = roundDeltas[ROUND_DELTA_RULE_START - 1]
    if (thirdRound !== undefined && thirdRound.rendererDelta > appliedDelta) {
      violations.add(VIOLATION_ROUND_DELTA)
    }
  }

  if (input.mode === 'retained' && input.retained !== undefined) {
    retainedViolations(input, input.retained, (id) => violations.add(id))
  }

  const pids = (input.rendererPids ?? []).filter((pid): pid is number => pid !== null)
  if (pids.length > 1 && new Set(pids).size > 1) violations.add(VIOLATION_RENDERER_RESTART)

  for (const violation of holdViolations(input.mode, input.holds, input.retained)) {
    violations.add(violation)
  }

  return {
    ok: violations.size === 0,
    violations: [...violations],
    notices: [...notices],
    appliedThresholds: {
      profile: input.profile,
      rendererPeakBytes: thresholds.rendererPeakBytes,
      appTotalPeakBytes: thresholds.appTotalPeakBytes,
      settleRendererBytes: thresholds.settleRendererBytes,
      roundDeltaMaxBytes: thresholds.roundDeltaMaxBytes,
      roundDeltaRatio: thresholds.roundDeltaRatio,
      roundDeltaFloorBytes: thresholds.roundDeltaFloorBytes,
      appliedRoundDeltaBytes: appliedDelta
    }
  }
}

/**
 * Process exit code of a completed run. Invalid samples and harness errors are
 * always fatal; threshold violations are fatal only with `--fail-on-violation`,
 * which is what the gate passes.
 */
export function resolvePerfExitCode(verdict: PerfVerdict, failOnViolation: boolean): number {
  const alwaysFatal =
    verdict.violations.includes(VIOLATION_INVALID_SAMPLE) ||
    verdict.violations.includes(VIOLATION_HARNESS_ERROR)
  if (alwaysFatal) return 1
  return failOnViolation && !verdict.ok ? 1 : 0
}

/** Stable stderr line listing violation ids, shared by the harness and its tests. */
export function formatPerfViolations(verdict: PerfVerdict): string {
  return `perf: violations -> ${verdict.violations.join(', ')}`
}

/** Validates one profile loaded from JSON; returns a readable error when malformed. */
export function parseThresholds(value: unknown): PerfThresholds | string {
  if (typeof value !== 'object' || value === null) return '档位阈值必须是对象。'
  const record = value as Record<string, unknown>
  const keys = [
    'rendererPeakBytes',
    'appTotalPeakBytes',
    'settleRendererBytes',
    'roundDeltaMaxBytes',
    'roundDeltaRatio',
    'roundDeltaFloorBytes'
  ] as const
  for (const key of keys) {
    const field = record[key]
    if (typeof field !== 'number' || !Number.isFinite(field) || field < 0) {
      return `档位阈值 ${key} 必须是非负数。`
    }
  }
  return {
    rendererPeakBytes: record.rendererPeakBytes as number,
    appTotalPeakBytes: record.appTotalPeakBytes as number,
    settleRendererBytes: record.settleRendererBytes as number,
    roundDeltaMaxBytes: record.roundDeltaMaxBytes as number,
    roundDeltaRatio: record.roundDeltaRatio as number,
    roundDeltaFloorBytes: record.roundDeltaFloorBytes as number
  }
}
