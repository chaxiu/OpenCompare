/** Types for `scripts/gate-spawn-outcome.mjs` so the vitest gate can import it. */

export interface SpawnOutcomeLike {
  status: number | null
  signal: string | null
  errorCode: string | null
  errorMessage: string | null
  output: string
}

export interface RetryOptions {
  env?: Record<string, string | undefined>
  label?: string
  onRetry?: (outcome: SpawnOutcomeLike, reason: string, attempt: number) => void
}

export interface RetryResult {
  outcome: SpawnOutcomeLike
  attempts: number
  retryReasons: string[]
  attemptDetails: string[]
}

export declare const ENV_FAILURE_CODES: Set<string>
export declare const KILL_SIGNALS: Set<string>
export declare const SIGNAL_EXIT_BASE: number
export declare const EXIT_SIGNALS: Map<number, string>
export declare function signalFromExitStatus(status: number | null): string | null
export declare function describeSpawnOutcome(outcome: SpawnOutcomeLike, label?: string): string
export declare function retryableEnvironmentReason(outcome: SpawnOutcomeLike): string | null
export declare function bodyGateAttempts(env?: Record<string, string | undefined>): number
export declare function runWithEnvironmentRetry(
  once: () => SpawnOutcomeLike,
  options?: RetryOptions
): RetryResult
