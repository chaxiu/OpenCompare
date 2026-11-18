import { describe, expect, it } from 'vitest'
import {
  bodyGateAttempts,
  describeSpawnOutcome,
  retryableEnvironmentReason,
  runWithEnvironmentRetry,
  signalFromExitStatus
} from './gate-spawn-outcome.mjs'

const outcome = (patch = {}) => ({
  status: 1,
  signal: null,
  errorCode: null,
  errorMessage: null,
  output: 'fatal: missing fold\n',
  ...patch
})

// Shell `128 + N` exit statuses reported by `spawnSync` with `signal === null`.
const shellSignalRows = [
  ['SIGPIPE', 141],
  ['SIGKILL', 137],
  ['SIGTERM', 143],
  ['SIGABRT', 134],
  ['SIGSEGV', 139]
]

describe('describeSpawnOutcome', () => {
  it('always prints status, signal, error code/message and the raw tail', () => {
    const text = describeSpawnOutcome(
      outcome({ status: null, signal: 'SIGKILL', errorCode: 'EAGAIN', errorMessage: 'busy', output: 'line 1\nlast line\n' }),
      'case'
    )
    expect(text).toContain('case: status=null signal=SIGKILL error.code=EAGAIN error.message=busy')
    expect(text).toContain('stdout/stderr tail')
    expect(text).toContain('last line')
  })

  it('marks an empty capture as empty instead of inventing a reason', () => {
    expect(describeSpawnOutcome(outcome({ output: '' }))).toContain('<empty>')
  })

  it.each(shellSignalRows)('shows the shell exit mapping %s (status %i)', (name, status) => {
    const text = describeSpawnOutcome(outcome({ status, signal: null, output: '' }))
    expect(text).toContain(`status=${status}`)
    expect(text).toContain(`signal=null`)
    expect(text).toContain(`shell exit ${status} => ${name}`)
  })

  it('does not invent a mapping for a real assertion exit', () => {
    expect(describeSpawnOutcome(outcome({ status: 1 }))).not.toContain('shell exit')
  })
})

describe('signalFromExitStatus', () => {
  it.each(shellSignalRows)('maps %s exit status %i', (name, status) => {
    expect(signalFromExitStatus(status)).toBe(name)
  })

  it('has no mapping below 128', () => {
    expect(signalFromExitStatus(1)).toBeNull()
    expect(signalFromExitStatus(0)).toBeNull()
    expect(signalFromExitStatus(null)).toBeNull()
  })
})

describe('retryableEnvironmentReason', () => {
  it('retries only objective environment signals', () => {
    expect(retryableEnvironmentReason(outcome({ errorCode: 'EAGAIN' }))).toContain('EAGAIN')
    expect(retryableEnvironmentReason(outcome({ errorCode: 'ENOSPC' }))).toContain('ENOSPC')
    expect(retryableEnvironmentReason(outcome({ status: null, signal: 'SIGKILL' }))).toContain('SIGKILL')
    expect(retryableEnvironmentReason(outcome({ status: null, output: '' }))).toContain('no status, signal or output')
  })

  it('never retries an assertion failure or an unclassified spawn error', () => {
    expect(retryableEnvironmentReason(outcome())).toBeNull()
    expect(retryableEnvironmentReason(outcome({ status: 0 }))).toBeNull()
    expect(retryableEnvironmentReason(outcome({ status: null, errorCode: 'ENOENT', output: '' }))).toBeNull()
    expect(retryableEnvironmentReason(outcome({ status: null, output: 'partial output' }))).toBeNull()
  })

  it.each(shellSignalRows)('retries the shell exit %s (status %i) with its raw status', (name, status) => {
    const reason = retryableEnvironmentReason(outcome({ status, signal: null, output: '' }))
    expect(reason).not.toBeNull()
    expect(reason).toContain(name)
    expect(reason).toContain(String(status))
  })

  it.each([1, 2, 127])('does not retry the real assertion exit status %i', (status) => {
    expect(retryableEnvironmentReason(outcome({ status }))).toBeNull()
  })

  it('treats a direct SIGPIPE signal and an EPIPE spawn error as retryable', () => {
    expect(retryableEnvironmentReason(outcome({ status: null, signal: 'SIGPIPE', output: '' }))).toContain('SIGPIPE')
    expect(retryableEnvironmentReason(outcome({ status: null, errorCode: 'EPIPE', output: '' }))).toContain('EPIPE')
  })
})

describe('bodyGateAttempts', () => {
  it('defaults to one retry and can be disabled by env', () => {
    expect(bodyGateAttempts({})).toBe(2)
    expect(bodyGateAttempts({ OPENCOMPARE_GATE_SPAWN_RETRIES: '0' })).toBe(1)
  })
})

describe('runWithEnvironmentRetry', () => {
  const sequence = (...results) => {
    const calls = []
    return {
      calls,
      run: () => {
        const next = results[Math.min(calls.length, results.length - 1)]
        calls.push(next)
        return next
      }
    }
  }

  it('retries one 141/SIGPIPE shell exit once and reports both attempts', () => {
    const seq = sequence(outcome({ status: 141, signal: null, output: '' }), outcome({ status: 0, output: 'ok\n' }))
    const result = runWithEnvironmentRetry(seq.run, { env: {} })
    expect(seq.calls).toHaveLength(2)
    expect(result.attempts).toBe(2)
    expect(result.outcome.status).toBe(0)
    expect(result.retryReasons).toHaveLength(1)
    expect(result.retryReasons[0]).toContain('SIGPIPE')
    expect(result.retryReasons[0]).toContain('141')
    expect(result.attemptDetails).toHaveLength(2)
    expect(result.attemptDetails[0]).toContain('status=141')
    expect(result.attemptDetails[1]).toContain('status=0')
  })

  it('honours OPENCOMPARE_GATE_SPAWN_RETRIES=0 without retrying', () => {
    const seq = sequence(outcome({ status: 141, signal: null, output: '' }))
    const result = runWithEnvironmentRetry(seq.run, { env: { OPENCOMPARE_GATE_SPAWN_RETRIES: '0' } })
    expect(seq.calls).toHaveLength(1)
    expect(result.attempts).toBe(1)
    expect(result.retryReasons).toHaveLength(0)
    expect(result.outcome.status).toBe(141)
  })

  it('keeps both raw outcomes when the retry is also red', () => {
    const seq = sequence(
      outcome({ status: 141, signal: null, output: '' }),
      outcome({ status: 141, signal: null, output: '' })
    )
    const result = runWithEnvironmentRetry(seq.run, { env: {} })
    expect(seq.calls).toHaveLength(2)
    expect(result.attempts).toBe(2)
    expect(result.outcome.status).toBe(141)
    expect(result.attemptDetails).toHaveLength(2)
    expect(result.attemptDetails.every((detail) => detail.includes('status=141'))).toBe(true)
  })

  it('never retries a real assertion failure', () => {
    const seq = sequence(outcome({ status: 1, output: 'fatal: missing fold\n' }))
    const result = runWithEnvironmentRetry(seq.run, { env: {} })
    expect(seq.calls).toHaveLength(1)
    expect(result.attempts).toBe(1)
    expect(result.retryReasons).toHaveLength(0)
  })

  it('recovers before the second attempt and calls onRetry with the reason', () => {
    const retries = []
    const seq = sequence(
      outcome({ status: null, errorCode: 'EPIPE', output: '' }),
      outcome({ status: 0, output: 'ok\n' })
    )
    const result = runWithEnvironmentRetry(seq.run, {
      env: {},
      onRetry: (failed, reason, attempt) => retries.push({ failed, reason, attempt })
    })
    expect(result.attempts).toBe(2)
    expect(retries).toHaveLength(1)
    expect(retries[0].reason).toContain('EPIPE')
    expect(retries[0].attempt).toBe(1)
  })
})
