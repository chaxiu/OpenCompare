/** Types for `scripts/gate-spawn-outcome.mjs` so the vitest gate can import it. */

export interface SpawnOutcomeLike {
  status: number | null
  signal: string | null
  errorCode: string | null
  errorMessage: string | null
  output: string
}

export declare const ENV_FAILURE_CODES: Set<string>
export declare const KILL_SIGNALS: Set<string>
export declare function describeSpawnOutcome(outcome: SpawnOutcomeLike, label?: string): string
export declare function retryableEnvironmentReason(outcome: SpawnOutcomeLike): string | null
export declare function bodyGateAttempts(env?: Record<string, string | undefined>): number
