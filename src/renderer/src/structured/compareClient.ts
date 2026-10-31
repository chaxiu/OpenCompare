/**
 * Renderer-side structured comparison client.
 *
 * One comparison runs at a time. Every `compare` takes a new monotonic id and
 * cancels whatever is still in flight, so late responses can never overwrite a
 * newer result. `cancel` drops the pending request but keeps the worker alive;
 * `dispose` terminates the worker and turns the client terminal.
 *
 * Environments without a `Worker` constructor (jsdom / Node vitest) fall back
 * to the same job function on a macrotask, which keeps `compare` asynchronous
 * and lets the view paint its loading state first.
 */
import { OperationCancelledError } from '@core/io'
import { StructuredParseError } from '@core/structured/parse'
import type { StructuredFormat } from '@core/structured/parse'
import CompareWorker from './compareWorker?worker'
import { runStructuredCompare } from './compareJob'
import type {
  StructuredCompareErrorPayload,
  StructuredCompareOutcome,
  StructuredCompareRequest,
  StructuredCompareResponse
} from './compareJob'

/** Minimal worker surface the client needs; tests inject a fake. */
export interface StructuredCompareWorkerLike {
  onmessage: ((event: { readonly data: unknown }) => void) | null
  onerror?: ((event: { readonly message?: string }) => void) | null
  postMessage(message: StructuredCompareRequest): void
  terminate(): void
}

export interface StructuredCompareClient {
  compare(request: {
    readonly leftText: string
    readonly rightText: string
    readonly format: StructuredFormat
  }): Promise<StructuredCompareOutcome>
  cancel(): void
  dispose(): void
}

export interface StructuredCompareClientOptions {
  createWorker?: () => StructuredCompareWorkerLike | null
}

interface PendingRequest {
  readonly id: number
  readonly resolve: (outcome: StructuredCompareOutcome) => void
  readonly reject: (error: unknown) => void
}

function createDefaultWorker(): StructuredCompareWorkerLike | null {
  if (typeof Worker === 'undefined') return null
  return new CompareWorker() as unknown as StructuredCompareWorkerLike
}

function isResponse(value: unknown): value is StructuredCompareResponse {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { id?: unknown; ok?: unknown }
  return typeof candidate.id === 'number' && typeof candidate.ok === 'boolean'
}

/** Rebuilds the error instance so `instanceof` still works after the boundary. */
function recreateError(payload: StructuredCompareErrorPayload): Error {
  if (payload.name === 'StructuredParseError') {
    return new StructuredParseError(payload.message)
  }
  const error = new Error(payload.message)
  error.name = payload.name
  return error
}

function cancelled(): Promise<StructuredCompareOutcome> {
  const promise = Promise.reject<StructuredCompareOutcome>(new OperationCancelledError())
  // Compare is cancellation, not a result: the caller is allowed to ignore it.
  promise.catch(() => undefined)
  return promise
}

export function createStructuredCompareClient(
  options: StructuredCompareClientOptions = {}
): StructuredCompareClient {
  const createWorker = options.createWorker ?? createDefaultWorker
  let worker: StructuredCompareWorkerLike | null = null
  let workerCreated = false
  let disposed = false
  let generation = 0
  let pending: PendingRequest | null = null
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null

  function dropPending(error: unknown): void {
    const current = pending
    if (current === null) return
    pending = null
    if (fallbackTimer !== null) {
      clearTimeout(fallbackTimer)
      fallbackTimer = null
    }
    current.reject(error)
  }

  function receive(data: unknown, source: StructuredCompareWorkerLike): void {
    if (disposed || worker !== source || !isResponse(data)) return
    const current = pending
    if (current === null || current.id !== data.id) return
    pending = null
    if (data.ok) current.resolve(data.outcome)
    else current.reject(recreateError(data.error))
  }

  function ensureWorker(): StructuredCompareWorkerLike | null {
    if (workerCreated) return worker
    workerCreated = true
    try {
      worker = createWorker()
    } catch {
      worker = null
    }
    const created = worker
    if (created !== null) {
      created.onmessage = (event) => receive(event.data, created)
      created.onerror = (event) => {
        if (disposed || worker !== created) return
        dropPending(new Error(event?.message ?? 'Structured comparison worker failed'))
      }
    }
    return worker
  }

  function compare(request: {
    readonly leftText: string
    readonly rightText: string
    readonly format: StructuredFormat
  }): Promise<StructuredCompareOutcome> {
    if (disposed) return cancelled()

    generation += 1
    const id = generation
    // A new request supersedes the pending one; its late response is ignored.
    dropPending(new OperationCancelledError())

    let resolveOutcome!: (outcome: StructuredCompareOutcome) => void
    let rejectOutcome!: (error: unknown) => void
    const promise = new Promise<StructuredCompareOutcome>((resolve, reject) => {
      resolveOutcome = resolve
      rejectOutcome = reject
    })
    promise.catch(() => undefined)
    const current: PendingRequest = { id, resolve: resolveOutcome, reject: rejectOutcome }
    pending = current

    const activeWorker = ensureWorker()
    if (activeWorker !== null) {
      try {
        activeWorker.postMessage({
          id,
          leftText: request.leftText,
          rightText: request.rightText,
          format: request.format
        })
      } catch (cause) {
        dropPending(cause)
      }
      return promise
    }

    // Async fallback: yield a macrotask so the caller can paint a loading state.
    fallbackTimer = setTimeout(() => {
      fallbackTimer = null
      if (disposed || pending !== current) return
      try {
        const outcome = runStructuredCompare(
          request.leftText,
          request.rightText,
          request.format
        )
        if (disposed || pending !== current) return
        pending = null
        current.resolve(outcome)
      } catch (cause) {
        if (disposed || pending !== current) return
        pending = null
        current.reject(cause)
      }
    }, 0)
    return promise
  }

  function cancel(): void {
    if (disposed) return
    dropPending(new OperationCancelledError())
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    dropPending(new OperationCancelledError())
    const active = worker
    worker = null
    active?.terminate()
  }

  return { compare, cancel, dispose }
}
