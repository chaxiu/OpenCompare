/**
 * Classification helpers for `spawnSync` results used by the release body gate.
 *
 * A non-zero exit from bash is an assertion failure and must never be retried.
 * Only objective environment signals (spawn errors, resource exhaustion, network
 * failures, a killed process, or a run that produced no status/signal/output at
 * all) are retryable, and only once by default. The raw status/signal/error and
 * the captured stdout/stderr tail always travel with the result so a failure is
 * attributable instead of "flaky".
 */

export const ENV_FAILURE_CODES = new Set([
  'EAGAIN',
  'EMFILE',
  'ENFILE',
  'ENOMEM',
  'EINTR',
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EAI_AGAIN',
  'ENOSPC',
  'EPIPE'
])

export const KILL_SIGNALS = new Set(['SIGKILL', 'SIGTERM', 'SIGABRT'])

/** Human-readable one-line-plus-tail description; never hides the raw text. */
export function describeSpawnOutcome(outcome, label = 'spawn') {
  const tail = outcome.output.trim().split('\n').slice(-20).join('\n')
  return [
    `${label}: status=${outcome.status === null ? 'null' : outcome.status} signal=${outcome.signal ?? 'null'} error.code=${outcome.errorCode ?? 'null'} error.message=${outcome.errorMessage ?? 'null'}`,
    '--- stdout/stderr tail ---',
    tail === '' ? '<empty>' : tail
  ].join('\n')
}

/** Return the objective environment reason to retry, or null for assertion failures. */
export function retryableEnvironmentReason(outcome) {
  if (outcome.errorCode !== null && ENV_FAILURE_CODES.has(outcome.errorCode)) {
    return `spawn error.code=${outcome.errorCode}`
  }
  if (outcome.signal !== null && KILL_SIGNALS.has(outcome.signal)) {
    return `process killed by ${outcome.signal}`
  }
  if (outcome.errorCode === null && outcome.status === null && outcome.signal === null && outcome.output.trim() === '') {
    return 'spawnSync produced no status, signal or output'
  }
  return null
}

/** Total attempts: one retry by default, disabled with `OPENCOMPARE_GATE_SPAWN_RETRIES=0`. */
export function bodyGateAttempts(env = process.env) {
  return env.OPENCOMPARE_GATE_SPAWN_RETRIES === '0' ? 1 : 2
}
