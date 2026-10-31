/**
 * Worker shell: the only worker-aware code in the structured comparison.
 *
 * Vite bundles this module as the worker entry (classic / IIFE in production),
 * so it must stay a thin transport around {@link runStructuredCompare} and
 * never import renderer / React modules.
 */
import { runStructuredCompare } from './compareJob'
import type {
  StructuredCompareRequest,
  StructuredCompareResponse
} from './compareJob'

interface WorkerScope {
  onmessage: ((event: MessageEvent<StructuredCompareRequest>) => void) | null
  postMessage(message: StructuredCompareResponse): void
}

const scope = globalThis as unknown as WorkerScope

scope.onmessage = (event: MessageEvent<StructuredCompareRequest>): void => {
  const request = event.data
  try {
    const outcome = runStructuredCompare(request.leftText, request.rightText, request.format)
    scope.postMessage({ id: request.id, ok: true, outcome })
  } catch (cause) {
    scope.postMessage({
      id: request.id,
      ok: false,
      error: {
        name: cause instanceof Error ? cause.name : 'Error',
        message: cause instanceof Error ? cause.message : String(cause)
      }
    })
  }
}
