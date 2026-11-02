/**
 * Comparison switches and normalization facts for the text diff.
 *
 * Both switches default to on: only an explicit `false` turns a comparison
 * strict. Normalization never rewrites text — it only decides what counts as a
 * difference — so characters, whitespace, case and line order still report.
 *
 * Every label and threshold comes from `probe.ts`; this module only decides
 * whether a difference is ignored or surfaced.
 */
import { detectNewline } from './probe'
import type { EncodingLabel, NewlineKind } from './probe'

/** The two normalization switches of one comparison. */
export interface ComparisonOptions {
  readonly ignoreNewline?: boolean
  readonly ignoreEncoding?: boolean
}

/** The switch values actually applied by one comparison. */
export interface ComparisonSwitches {
  readonly ignoreNewline: boolean
  readonly ignoreEncoding: boolean
}

/** One side's probe facts: decoded text, encoding label and byte fingerprint. */
export interface TextFacts {
  readonly text: string
  readonly encoding: EncodingLabel
  readonly sha256: string
}

/** What one side contributes to the normalization facts; facts may be absent. */
export interface NormalizationSide {
  readonly text: string
  readonly encoding?: EncodingLabel | null
  readonly sha256?: string | null
}

/** How the raw newline styles of both sides compare. */
export interface NewlineNormalization {
  readonly left: NewlineKind
  readonly right: NewlineKind
  /** The raw labels differ (CRLF vs LF is different even when folded equal). */
  readonly different: boolean
  /** A real difference is hidden by `ignoreNewline`. */
  readonly ignored: boolean
}

/** How the raw encoded bytes of both sides compare. */
export interface EncodingNormalization {
  /** Probe label per side; `null` when that side has no probe facts. */
  readonly left: EncodingLabel | null
  readonly right: EncodingLabel | null
  /** Both labels are known and differ. */
  readonly different: boolean
  /** A real label difference is hidden by `ignoreEncoding`. */
  readonly ignored: boolean
  /** Both sides carry facts (encoding label and sha256). */
  readonly comparable: boolean
  /**
   * Strict mode only: the decoded texts are identical while the byte
   * fingerprints differ — the one visible byte-difference signal.
   */
  readonly byteDifference: boolean
}

/** The normalization facts of one comparison. */
export interface DiffNormalization {
  readonly ignoreNewline: boolean
  readonly ignoreEncoding: boolean
  readonly newline: NewlineNormalization
  readonly encoding: EncodingNormalization
}

/** Defaults both switches to `true`; only an explicit `false` is strict. */
export function resolveComparisonSwitches(
  options: ComparisonOptions = {}
): ComparisonSwitches {
  return {
    ignoreNewline: options.ignoreNewline !== false,
    ignoreEncoding: options.ignoreEncoding !== false
  }
}

/** Folds `\r\n` and lone `\r` to `\n`, leaving content and a missing final newline as-is. */
export function foldNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/**
 * Derives the normalization facts of one comparison.
 *
 * `byteDifference` is gated on decoded-text equality so an ignored newline
 * difference is never re-reported as a byte difference, and characters never
 * hide behind an encoding signal. It is decided by `sha256` alone; the labels
 * are only shown.
 */
export function describeNormalization(
  left: NormalizationSide,
  right: NormalizationSide,
  switches: ComparisonSwitches
): DiffNormalization {
  const leftNewline = detectNewline(left.text)
  const rightNewline = detectNewline(right.text)
  const newlineDifferent = leftNewline !== rightNewline

  const leftEncoding = left.encoding ?? null
  const rightEncoding = right.encoding ?? null
  const comparable =
    leftEncoding !== null &&
    rightEncoding !== null &&
    typeof left.sha256 === 'string' &&
    typeof right.sha256 === 'string'
  const encodingDifferent =
    leftEncoding !== null && rightEncoding !== null && leftEncoding !== rightEncoding
  const byteDifference =
    !switches.ignoreEncoding &&
    comparable &&
    left.text === right.text &&
    left.sha256 !== right.sha256

  return {
    ignoreNewline: switches.ignoreNewline,
    ignoreEncoding: switches.ignoreEncoding,
    newline: {
      left: leftNewline,
      right: rightNewline,
      different: newlineDifferent,
      ignored: switches.ignoreNewline && newlineDifferent
    },
    encoding: {
      left: leftEncoding,
      right: rightEncoding,
      different: encodingDifferent,
      ignored: switches.ignoreEncoding && encodingDifferent,
      comparable,
      byteDifference
    }
  }
}
