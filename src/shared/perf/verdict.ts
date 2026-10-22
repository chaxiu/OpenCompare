/**
 * Single-point threshold evaluation for both profiles. The real run and the
 * small gate dataset only differ in the numbers loaded from `perf/profiles.json`;
 * the rule itself is never duplicated.
 */
import type {
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

/** Rounds whose third increment is capped by the growth rule. */
export const ROUND_DELTA_RULE_START = 3

export interface PerfEvaluationInput {
  readonly profile: PerfProfileName
  readonly thresholds: PerfThresholds
  readonly peaks: PerfRss
  readonly roundDeltas: readonly PerfRoundDelta[]
  /** True when any sample carried a missing/zero RSS reading. */
  readonly invalidSamples?: boolean
  /** True when the harness itself failed before/while producing evidence. */
  readonly harnessError?: boolean
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

export function evaluatePerf(input: PerfEvaluationInput): PerfVerdict {
  const { thresholds, peaks, roundDeltas } = input
  const firstRoundDelta = roundDeltas[0]?.rendererDelta ?? 0
  const appliedDelta = appliedRoundDeltaBytes(thresholds, firstRoundDelta)
  const violations: string[] = []

  if (input.invalidSamples === true) violations.push(VIOLATION_INVALID_SAMPLE)
  if (input.harnessError === true) violations.push(VIOLATION_HARNESS_ERROR)
  if (peaks.renderer > thresholds.rendererPeakBytes) violations.push(VIOLATION_RENDERER_PEAK)
  if (peaks.appTotal > thresholds.appTotalPeakBytes) violations.push(VIOLATION_APP_TOTAL_PEAK)

  const thirdRound = roundDeltas[ROUND_DELTA_RULE_START - 1]
  if (thirdRound !== undefined && thirdRound.rendererDelta > appliedDelta) {
    violations.push(VIOLATION_ROUND_DELTA)
  }

  return {
    ok: violations.length === 0,
    violations,
    appliedThresholds: {
      profile: input.profile,
      rendererPeakBytes: thresholds.rendererPeakBytes,
      appTotalPeakBytes: thresholds.appTotalPeakBytes,
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
    roundDeltaMaxBytes: record.roundDeltaMaxBytes as number,
    roundDeltaRatio: record.roundDeltaRatio as number,
    roundDeltaFloorBytes: record.roundDeltaFloorBytes as number
  }
}
