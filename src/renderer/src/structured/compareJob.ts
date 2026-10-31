/**
 * One background structured-comparison job.
 *
 * The job is the whole computation moved off the renderer thread: parse both
 * sides, diff them by node path, then locate every *changed* entry in the
 * original text. It only composes the existing core functions, so the result
 * is guaranteed to match the synchronous `diffStructured` result by
 * construction — no semantic rule is copied here.
 *
 * The module stays free of DOM / Electron / React so it can run unchanged in a
 * worker, in the async fallback (jsdom / Node tests) and in plain vitest.
 */
import { diffStructured } from '@core/structured/diff'
import type { StructuredDiffResult } from '@core/structured/diff'
import { createStructuredLocator } from '@core/structured/locate'
import type { SourceRange } from '@core/structured/locate'
import type { StructuredFormat } from '@core/structured/parse'

export interface StructuredCompareOutcome {
  readonly diff: StructuredDiffResult
  readonly ranges: Readonly<Record<string, { readonly left: SourceRange; readonly right: SourceRange }>>
}

/** Request envelope sent to the worker (or handed to the async fallback). */
export interface StructuredCompareRequest {
  /** Monotonic per client; a response is only accepted for the pending id. */
  readonly id: number
  readonly leftText: string
  readonly rightText: string
  readonly format: StructuredFormat
}

/** Errors keep `name` + `message` across the worker boundary. */
export interface StructuredCompareErrorPayload {
  readonly name: string
  readonly message: string
}

export type StructuredCompareResponse =
  | { readonly id: number; readonly ok: true; readonly outcome: StructuredCompareOutcome }
  | { readonly id: number; readonly ok: false; readonly error: StructuredCompareErrorPayload }

/**
 * Parses, diffs and locates in one pass.
 *
 * Diff runs before any locator so parse failures keep the `left side:` /
 * `right side:` prefix produced by `diffStructured`. Only non-`same` entries
 * get a range, so the payload does not grow with the rest of the tree.
 */
export function runStructuredCompare(
  leftText: string,
  rightText: string,
  format: StructuredFormat
): StructuredCompareOutcome {
  const diff = diffStructured(leftText, rightText, format)
  const changed = diff.entries.filter((entry) => entry.status !== 'same')
  const ranges: Record<string, { readonly left: SourceRange; readonly right: SourceRange }> = {}

  if (changed.length > 0) {
    const leftLocator = createStructuredLocator(leftText, format)
    const rightLocator = createStructuredLocator(rightText, format)
    for (const entry of changed) {
      ranges[entry.path] = {
        left: leftLocator.locate(entry.path),
        right: rightLocator.locate(entry.path)
      }
    }
  }

  return { diff, ranges }
}
