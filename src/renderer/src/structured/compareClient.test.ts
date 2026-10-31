import { describe, expect, it } from 'vitest'
import { OperationCancelledError } from '@core/io'
import { diffStructured } from '@core/structured/diff'
import { StructuredParseError } from '@core/structured/parse'
import { createStructuredCompareClient } from './compareClient'
import type { StructuredCompareWorkerLike } from './compareClient'
import { runStructuredCompare } from './compareJob'
import type { StructuredCompareRequest } from './compareJob'

const LEFT = '{"a":1,"b":2}'
const RIGHT = '{"a":1,"b":3}'

class FakeWorker implements StructuredCompareWorkerLike {
  onmessage: ((event: { readonly data: unknown }) => void) | null = null
  onerror: ((event: { readonly message?: string }) => void) | null = null
  readonly posted: StructuredCompareRequest[] = []
  terminateCount = 0

  postMessage(message: StructuredCompareRequest): void {
    this.posted.push(message)
  }

  terminate(): void {
    this.terminateCount += 1
  }

  respond(data: unknown): void {
    this.onmessage?.({ data })
  }
}

function request(leftText = LEFT, rightText = RIGHT): {
  leftText: string
  rightText: string
  format: 'json'
} {
  return { leftText, rightText, format: 'json' }
}

describe('worker protocol', () => {
  it('posts a monotonic id with the request body and resolves the matching response', async () => {
    const worker = new FakeWorker()
    const client = createStructuredCompareClient({ createWorker: () => worker })

    const first = client.compare(request())
    expect(worker.posted).toHaveLength(1)
    expect(worker.posted[0]).toEqual({ id: 1, leftText: LEFT, rightText: RIGHT, format: 'json' })

    const firstOutcome = runStructuredCompare(LEFT, RIGHT, 'json')
    worker.respond({ id: 1, ok: true, outcome: firstOutcome })
    await expect(first).resolves.toEqual(firstOutcome)

    const second = client.compare(request(RIGHT, LEFT))
    expect(worker.posted[1].id).toBe(2)
    const secondOutcome = runStructuredCompare(RIGHT, LEFT, 'json')
    worker.respond({ id: 2, ok: true, outcome: secondOutcome })
    await expect(second).resolves.toEqual(secondOutcome)

    client.dispose()
  })

  it('ignores unknown and out-of-order response ids', async () => {
    const worker = new FakeWorker()
    const client = createStructuredCompareClient({ createWorker: () => worker })

    const pending = client.compare(request())
    let resolved = false
    void pending.then(() => {
      resolved = true
    })

    worker.respond({ id: 999, ok: true, outcome: runStructuredCompare(LEFT, RIGHT, 'json') })
    await Promise.resolve()
    expect(resolved).toBe(false)

    const outcome = runStructuredCompare(LEFT, RIGHT, 'json')
    worker.respond({ id: 1, ok: true, outcome })
    await expect(pending).resolves.toEqual(outcome)

    client.dispose()
  })

  it('rebuilds StructuredParseError so instanceof and wording survive the boundary', async () => {
    const worker = new FakeWorker()
    const client = createStructuredCompareClient({ createWorker: () => worker })

    let syncError: Error = new Error('unreachable')
    try {
      diffStructured('{"a": 1', '{}', 'json')
    } catch (cause) {
      syncError = cause as Error
    }
    expect(syncError.name).toBe('StructuredParseError')

    const pending = client.compare(request('{"a": 1', '{}'))
    worker.respond({
      id: 1,
      ok: false,
      error: { name: syncError.name, message: syncError.message }
    })
    const error = await pending.catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(StructuredParseError)
    expect((error as Error).name).toBe('StructuredParseError')
    expect((error as Error).message).toBe(syncError.message)

    client.dispose()
  })

  it('keeps the name and message of a non-parse error', async () => {
    const worker = new FakeWorker()
    const client = createStructuredCompareClient({ createWorker: () => worker })

    const pending = client.compare(request())
    worker.respond({ id: 1, ok: false, error: { name: 'RangeError', message: 'boom' } })
    const error = await pending.catch((cause: unknown) => cause)

    expect(error).not.toBeInstanceOf(StructuredParseError)
    expect((error as Error).name).toBe('RangeError')
    expect((error as Error).message).toBe('boom')

    client.dispose()
  })
})

describe('generation, cancel and dispose', () => {
  it('cancels a superseded request and drops its late response', async () => {
    const worker = new FakeWorker()
    const client = createStructuredCompareClient({ createWorker: () => worker })

    const first = client.compare(request('{"a":1}', '{"a":2}'))
    const second = client.compare(request('{"b":1}', '{"b":2}'))

    await expect(first).rejects.toBeInstanceOf(OperationCancelledError)
    expect(worker.posted.map((message) => message.id)).toEqual([1, 2])

    // The late answer for the superseded id must not resolve the new request.
    worker.respond({ id: 1, ok: true, outcome: runStructuredCompare('{"a":1}', '{"a":2}', 'json') })
    const expected = runStructuredCompare('{"b":1}', '{"b":2}', 'json')
    worker.respond({ id: 2, ok: true, outcome: expected })
    await expect(second).resolves.toEqual(expected)

    client.dispose()
  })

  it('cancels the in-flight request without touching the worker and stays usable', async () => {
    const worker = new FakeWorker()
    const client = createStructuredCompareClient({ createWorker: () => worker })

    const first = client.compare(request())
    client.cancel()
    await expect(first).rejects.toBeInstanceOf(OperationCancelledError)

    worker.respond({ id: 1, ok: true, outcome: runStructuredCompare(LEFT, RIGHT, 'json') })
    await Promise.resolve()
    expect(worker.terminateCount).toBe(0)

    const next = client.compare(request('{"x":1}', '{"x":2}'))
    expect(worker.posted[1].id).toBe(2)
    const expected = runStructuredCompare('{"x":1}', '{"x":2}', 'json')
    worker.respond({ id: 2, ok: true, outcome: expected })
    await expect(next).resolves.toEqual(expected)

    client.dispose()
  })

  it('terminates exactly once, cancels the pending request and turns terminal', async () => {
    const worker = new FakeWorker()
    const client = createStructuredCompareClient({ createWorker: () => worker })

    const pending = client.compare(request())
    client.dispose()
    await expect(pending).rejects.toBeInstanceOf(OperationCancelledError)
    expect(worker.terminateCount).toBe(1)

    client.dispose()
    expect(worker.terminateCount).toBe(1)

    // Late messages are ignored and nothing is posted after dispose.
    worker.respond({ id: 1, ok: true, outcome: runStructuredCompare(LEFT, RIGHT, 'json') })
    const after = client.compare(request())
    await expect(after).rejects.toBeInstanceOf(OperationCancelledError)
    expect(worker.posted).toHaveLength(1)
  })
})

describe('async fallback without a Worker constructor', () => {
  it('returns a pending promise and resolves the same outcome as the sync path', async () => {
    expect(typeof Worker).toBe('undefined')
    const client = createStructuredCompareClient({ createWorker: () => null })

    const pending = client.compare(request())
    let settled = false
    void pending.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    await expect(pending).resolves.toEqual(runStructuredCompare(LEFT, RIGHT, 'json'))
    client.dispose()
  })

  it('cancels and disposes without landing a late result', async () => {
    const client = createStructuredCompareClient({ createWorker: () => null })

    const cancelledRequest = client.compare(request())
    client.cancel()
    await expect(cancelledRequest).rejects.toBeInstanceOf(OperationCancelledError)

    const next = client.compare(request('{"a":9}', '{"a":1}'))
    client.dispose()
    await expect(next).rejects.toBeInstanceOf(OperationCancelledError)

    // Give the abandoned macrotask time to run; it must not resolve anything.
    await new Promise((resolve) => setTimeout(resolve, 10))
    const after = client.compare(request())
    await expect(after).rejects.toBeInstanceOf(OperationCancelledError)
  })

  it('keeps the synchronous parse error wording', async () => {
    const client = createStructuredCompareClient({ createWorker: () => null })

    let syncMessage = ''
    try {
      diffStructured('{"a": 1', '{}', 'json')
    } catch (cause) {
      syncMessage = cause instanceof Error ? cause.message : String(cause)
    }

    const pending = client.compare(request('{"a": 1', '{}'))
    const error = await pending.catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(StructuredParseError)
    expect((error as Error).message).toBe(syncMessage)

    client.dispose()
  })
})
