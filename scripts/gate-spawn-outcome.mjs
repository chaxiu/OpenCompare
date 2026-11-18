/**
 * Classification helpers for `spawnSync` results used by the release body gate.
 *
 * A non-zero exit from bash is an assertion failure and must never be retried.
 * Only objective environment signals (spawn errors, resource exhaustion, network
 * failures, a killed process, or a run that produced no status/signal/output at
 * all) are retryable, and only once by default. The raw status/signal/error and
 * the captured stdout/stderr tail always travel with the result so a failure is
 * attributable instead of "flaky".
 *
 * Shells report a process killed by signal N as exit status `128 + N` with
 * `signal === null` (e.g. a broken stdout pipe gives `status=141`,
 * `signal=null`). That is an objective environment failure, not an assertion.
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

export const KILL_SIGNALS = new Set(['SIGKILL', 'SIGTERM', 'SIGABRT', 'SIGPIPE', 'SIGSEGV'])

/** `spawnSync` through a shell reports signal N as exit status `128 + N`. */
export const SIGNAL_EXIT_BASE = 128

/**
 * Signal names for the common `128 + N` shell exit statuses. Kept explicit (and
 * platform-independent) so the classification and its table test never drift.
 */
export const EXIT_SIGNALS = new Map([
  [129, 'SIGHUP'],
  [130, 'SIGINT'],
  [131, 'SIGQUIT'],
  [132, 'SIGILL'],
  [133, 'SIGTRAP'],
  [134, 'SIGABRT'],
  [135, 'SIGBUS'],
  [136, 'SIGFPE'],
  [137, 'SIGKILL'],
  [138, 'SIGUSR1'],
  [139, 'SIGSEGV'],
  [140, 'SIGUSR2'],
  [141, 'SIGPIPE'],
  [142, 'SIGALRM'],
  [143, 'SIGTERM']
])

/** Map a shell `128 + N` exit status back to its signal name, or null. */
export function signalFromExitStatus(status) {
  if (typeof status !== 'number' || status < SIGNAL_EXIT_BASE) return null
  return EXIT_SIGNALS.get(status) ?? `SIG${status - SIGNAL_EXIT_BASE}`
}

/** Human-readable one-line-plus-tail description; never hides the raw text. */
export function describeSpawnOutcome(outcome, label = 'spawn') {
  const tail = outcome.output.trim().split('\n').slice(-20).join('\n')
  const mapped = outcome.signal === null ? signalFromExitStatus(outcome.status) : null
  const reason = mapped === null ? '' : `, shell exit ${outcome.status} => ${mapped}`
  return [
    `${label}: status=${outcome.status === null ? 'null' : outcome.status} signal=${outcome.signal ?? 'null'} error.code=${outcome.errorCode ?? 'null'} error.message=${outcome.errorMessage ?? 'null'}${reason}`,
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
  if (outcome.signal === null) {
    const mapped = signalFromExitStatus(outcome.status)
    if (mapped !== null) {
      return `process killed by ${mapped} (shell exit status=${outcome.status})`
    }
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

/**
 * Run `once` up to `bodyGateAttempts` times, retrying only an objective
 * environment reason. Every raw outcome is described into `attemptDetails` so a
 * still-red run keeps both attempts attributable instead of only the last one.
 */
export function runWithEnvironmentRetry(once, options = {}) {
  const env = options.env ?? process.env
  const label = options.label ?? 'attempt'
  const onRetry = options.onRetry ?? (() => {})
  const maxAttempts = bodyGateAttempts(env)
  const retryReasons = []
  const attemptDetails = []
  let outcome = once()
  let attempts = 1
  attemptDetails.push(describeSpawnOutcome(outcome, `${label} ${attempts}`))
  while (attempts < maxAttempts) {
    const reason = retryableEnvironmentReason(outcome)
    if (reason === null) break
    retryReasons.push(`attempt ${attempts}: ${reason}`)
    onRetry(outcome, reason, attempts)
    outcome = once()
    attempts += 1
    attemptDetails.push(describeSpawnOutcome(outcome, `${label} ${attempts}`))
  }
  return { outcome, attempts, retryReasons, attemptDetails }
}
