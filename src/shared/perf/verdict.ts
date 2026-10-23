/**
 * Single-point threshold evaluation for both profiles. The real run and the
 * small gate dataset only differ in the numbers loaded from `perf/profiles.json`;
 * the rule itself is never duplicated.
 *
 * Two independent columns are judged here: the ready/running peak (round windows
 * and periodic samples) and the post-settle reading. Structural assertions on
 * the post-GC liveness counts make "the UI held the previous trees" a failing
 * condition instead of a note in a report.
 */
import type {
  PerfHoldSample,
  PerfMode,
  PerfProfileName,
  PerfRoundDelta,
  PerfRss,
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

/** Rounds whose third increment is capped by the growth rule. */
export const ROUND_DELTA_RULE_START = 3

/** Row models one active directory tab legitimately holds (left + right). */
export const MAX_LIVE_ROW_MODELS = 2

export interface PerfEvaluationInput {
  readonly profile: PerfProfileName
  readonly thresholds: PerfThresholds
  readonly peaks: PerfRss
  readonly roundDeltas: readonly PerfRoundDelta[]
  /** True when any sample carried a missing/zero RSS reading. */
  readonly invalidSamples?: boolean
  /** True when the harness itself failed before/while producing evidence. */
  readonly harnessError?: boolean
  /** Holding mode; the tab/round-delta rules differ between the two. */
  readonly mode?: PerfMode
  /** Post-settle reading; `null` means a run that never produced one. */
  readonly settle?: PerfRss | null
  /** Per-round renderer peaks (`rounds[].roundPeak`). */
  readonly roundPeaks?: readonly number[]
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

function holdViolations(
  mode: PerfMode | undefined,
  holds: readonly PerfHoldSample[] | undefined
): string[] {
  if (holds === undefined) return []
  if (holds.length === 0) return [VIOLATION_HOLD_UNMEASURED]
  const violations: string[] = []
  for (const hold of holds) {
    if (!hold.gc) violations.push(VIOLATION_HOLD_UNMEASURED)
    if (hold.rowModels > MAX_LIVE_ROW_MODELS) violations.push(VIOLATION_HOLD_ROW_MODELS)
    if (mode === 'multisession') {
      // Round i legitimately holds i tabs / i comparisons; the settle reading
      // is reported under the last round, so the same identity applies.
      if (hold.comparisons !== hold.round) violations.push(VIOLATION_HOLD_COMPARISONS)
      if (hold.tabs !== hold.round) violations.push(VIOLATION_HOLD_TABS)
    } else {
      if (hold.comparisons !== 1) violations.push(VIOLATION_HOLD_COMPARISONS)
      if (hold.tabs !== 1) violations.push(VIOLATION_HOLD_TABS)
    }
  }
  return violations
}

export function evaluatePerf(input: PerfEvaluationInput): PerfVerdict {
  const { thresholds, peaks, roundDeltas } = input
  const firstRoundDelta = roundDeltas[0]?.rendererDelta ?? 0
  const appliedDelta = appliedRoundDeltaBytes(thresholds, firstRoundDelta)
  const violations = new Set<string>()

  if (input.invalidSamples === true) violations.add(VIOLATION_INVALID_SAMPLE)
  if (input.harnessError === true) violations.add(VIOLATION_HARNESS_ERROR)
  if (peaks.renderer > thresholds.rendererPeakBytes) violations.add(VIOLATION_RENDERER_PEAK)
  if (peaks.appTotal > thresholds.appTotalPeakBytes) violations.add(VIOLATION_APP_TOTAL_PEAK)

  for (const peak of input.roundPeaks ?? []) {
    if (peak > thresholds.rendererPeakBytes) violations.add(VIOLATION_RENDERER_ROUND_PEAK)
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
  if (input.mode !== 'multisession') {
    const thirdRound = roundDeltas[ROUND_DELTA_RULE_START - 1]
    if (thirdRound !== undefined && thirdRound.rendererDelta > appliedDelta) {
      violations.add(VIOLATION_ROUND_DELTA)
    }
  }

  for (const violation of holdViolations(input.mode, input.holds)) {
    violations.add(violation)
  }

  return {
    ok: violations.size === 0,
    violations: [...violations],
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
