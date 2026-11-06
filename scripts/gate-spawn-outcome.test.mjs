import { describe, expect, it } from 'vitest'
import {
  bodyGateAttempts,
  describeSpawnOutcome,
  retryableEnvironmentReason
} from './gate-spawn-outcome.mjs'

const outcome = (patch = {}) => ({
  status: 1,
  signal: null,
  errorCode: null,
  errorMessage: null,
  output: 'fatal: missing fold\n',
  ...patch
})

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
})

describe('bodyGateAttempts', () => {
  it('defaults to one retry and can be disabled by env', () => {
    expect(bodyGateAttempts({})).toBe(2)
    expect(bodyGateAttempts({ OPENCOMPARE_GATE_SPAWN_RETRIES: '0' })).toBe(1)
  })
})
