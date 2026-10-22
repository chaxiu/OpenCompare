/**
 * Memory-gate judgment: bound checks for the bounded digest cache across
 * repeated full directory comparisons.
 *
 * The judgment is pure so the red path (an over-budget or monotonic round
 * series) is unit tested without generating a dataset; `src/memory-gate.test.ts`
 * feeds it the counters of a real multi-round run over real files.
 */
import type { ComparisonCacheStats, FileDiffStatus } from '@core/directory/compare'

/** A three-round judgement needs at least three settled rounds. */
export const MEMORY_GATE_MIN_ROUNDS = 3

export const MEMORY_GATE_VIOLATION_ENTRIES = 'cache-entries-over-limit'
export const MEMORY_GATE_VIOLATION_BYTES = 'cache-bytes-over-limit'
export const MEMORY_GATE_VIOLATION_ENTRIES_GROWTH = 'round-entries-growth'
export const MEMORY_GATE_VIOLATION_BYTES_GROWTH = 'round-bytes-growth'
export const MEMORY_GATE_VIOLATION_RESULT_CHANGED = 'round-result-changed'
export const MEMORY_GATE_VIOLATION_RELEASE_LEAK = 'session-release-leak'
export const MEMORY_GATE_VIOLATION_ROUNDS = 'round-count'

/** One settled round: cache counters, real digest work and the four-state counts. */
export interface MemoryGateRound {
  readonly index: number
  readonly stats: ComparisonCacheStats
  /** Files actually hashed by the digest capability in this round. */
  readonly hashedFiles: number
  readonly counts: Readonly<Record<FileDiffStatus, number>>
}

export interface MemoryGateInput {
  readonly maxEntries: number
  readonly maxBytes: number
  readonly rounds: readonly MemoryGateRound[]
  /** Entries still cached under roots of a session that was just released. */
  readonly releasedEntries: number
}

export interface MemoryGateVerdict {
  readonly ok: boolean
  readonly violations: readonly string[]
}

function sameCounts(
  left: Readonly<Record<FileDiffStatus, number>>,
  right: Readonly<Record<FileDiffStatus, number>>
): boolean {
  return (
    left.same === right.same &&
    left.added === right.added &&
    left.removed === right.removed &&
    left.modified === right.modified
  )
}

/**
 * Judges one run: every round stays within both caps, the warm rounds do not
 * grow the cache, closing a session releases its entries and eviction never
 * changes the comparison result.
 */
export function evaluateMemoryGate(input: MemoryGateInput): MemoryGateVerdict {
  const violations: string[] = []
  const { rounds } = input

  if (rounds.length < MEMORY_GATE_MIN_ROUNDS) violations.push(MEMORY_GATE_VIOLATION_ROUNDS)

  for (const round of rounds) {
    if (round.stats.entries > input.maxEntries) violations.push(MEMORY_GATE_VIOLATION_ENTRIES)
    if (round.stats.estimatedBytes > input.maxBytes) violations.push(MEMORY_GATE_VIOLATION_BYTES)
  }

  const baseline = rounds[0]
  const second = rounds[1]
  const third = rounds[2]
  if (second !== undefined && third !== undefined) {
    if (third.stats.entries !== second.stats.entries) {
      violations.push(MEMORY_GATE_VIOLATION_ENTRIES_GROWTH)
    }
    if (third.stats.estimatedBytes > second.stats.estimatedBytes) {
      violations.push(MEMORY_GATE_VIOLATION_BYTES_GROWTH)
    }
  }

  if (baseline !== undefined) {
    for (const round of rounds.slice(1)) {
      if (!sameCounts(baseline.counts, round.counts)) {
        violations.push(MEMORY_GATE_VIOLATION_RESULT_CHANGED)
        break
      }
    }
  }

  if (input.releasedEntries !== 0) violations.push(MEMORY_GATE_VIOLATION_RELEASE_LEAK)

  return { ok: violations.length === 0, violations }
}

/** Gate exit code: 0 only when the judgement holds. */
export function resolveMemoryGateExitCode(verdict: MemoryGateVerdict): number {
  return verdict.ok ? 0 : 1
}
