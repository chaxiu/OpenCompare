/**
 * Bounded I/O concurrency and readable file-handle failures.
 *
 * A directory comparison can request thousands of file bodies and directory
 * entries at once. Unbounded `Promise.all` fan-out exhausts the process file
 * descriptor table (`EMFILE`) on real trees, so every such fan-out goes through
 * {@link mapWithLimit}. The helper lives in `src/core` so the comparison
 * engines and the main-process platform handlers share one limit and one error
 * wording, while staying free of Electron / DOM dependencies.
 */

/** In-flight I/O calls one fan-out may use by default. */
export const DEFAULT_IO_CONCURRENCY = 8

export interface ConcurrencyOptions {
  /** Overrides {@link DEFAULT_IO_CONCURRENCY}; values below 1 fall back to the default. */
  readonly concurrency?: number
}

function resolveConcurrency(options: ConcurrencyOptions): number {
  const requested = options.concurrency
  if (requested === undefined || !Number.isFinite(requested)) return DEFAULT_IO_CONCURRENCY
  return Math.max(1, Math.floor(requested))
}

/**
 * Maps `items` with at most `concurrency` calls in flight, keeping the input
 * order in the result. The first failure stops new work, waits for the calls
 * already in flight and rejects with that error, so a partial result is never
 * returned.
 */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  options: ConcurrencyOptions,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  const limit = Math.min(resolveConcurrency(options), items.length)
  let next = 0
  let failure: { readonly error: unknown } | undefined

  async function runner(): Promise<void> {
    while (failure === undefined && next < items.length) {
      const index = next
      next += 1
      try {
        results[index] = await worker(items[index], index)
      } catch (error) {
        failure ??= { error }
        return
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runner()))
  if (failure !== undefined) throw failure.error
  return results
}

/**
 * Raised when a caller cancels a long-running operation. Cancellation is a
 * failure of its own (never a `skipped` entry): a cancelled scan or comparison
 * rejects instead of returning a partial tree or a half-filled cache.
 */
export class OperationCancelledError extends Error {
  readonly code = 'ECANCELED' as const

  constructor(message = '操作已取消：本次目录对比已停止，未提交任何部分结果。') {
    super(message)
    this.name = 'OperationCancelledError'
  }
}

/** True for a cancellation, whichever runtime raised it. */
export function isOperationCancelled(error: unknown): boolean {
  if (error instanceof OperationCancelledError) return true
  const candidate = error as { name?: unknown; code?: unknown } | null
  return candidate?.name === 'OperationCancelledError' && candidate.code === 'ECANCELED'
}

/** Throws {@link OperationCancelledError} once `signal` has fired. */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new OperationCancelledError()
}

/**
 * Races `operation` against `signal`, so a cancelled batch rejects at once even
 * when the platform call never settles. The abandoned call keeps its own
 * `catch`, so it can never surface as an unhandled rejection.
 */
export function abortable<T>(operation: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return operation
  if (signal.aborted) {
    operation.catch(() => undefined)
    return Promise.reject(new OperationCancelledError())
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      reject(new OperationCancelledError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
    operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      }
    )
  })
}

export type FileHandleErrorCode = 'EMFILE' | 'ENFILE'

/** Raised when the OS refuses an I/O call because the process ran out of descriptors. */
export class FileHandleExhaustedError extends Error {
  readonly code: FileHandleErrorCode

  constructor(code: FileHandleErrorCode, cause: unknown) {
    super(
      code === 'EMFILE'
        ? '读取文件时文件句柄耗尽（EMFILE）：同时打开的文件过多，本次目录对比已停止。请先关闭占用文件的程序，或缩小对比目录范围后重试。'
        : '系统文件句柄耗尽（ENFILE）：可用文件句柄总数不足，本次目录对比已停止。请先关闭占用文件的程序，或缩小对比目录范围后重试。',
      { cause }
    )
    this.name = 'FileHandleExhaustedError'
    this.code = code
  }
}

function fileHandleCode(error: unknown): FileHandleErrorCode | null {
  const code = (error as { code?: unknown } | null)?.code
  return code === 'EMFILE' || code === 'ENFILE' ? code : null
}

/**
 * Converts file-descriptor exhaustion into a readable Chinese error that keeps
 * the OS code; every other failure is returned untouched so callers keep their
 * existing semantics.
 */
export function toReadableIoError(error: unknown): unknown {
  const code = fileHandleCode(error)
  return code === null ? error : new FileHandleExhaustedError(code, error)
}
