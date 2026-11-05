import type { InlineSegment } from '../text/diff'
import type { SyntaxToken, SyntaxTokenClass } from './tokenize'

/**
 * One display run after overlaying syntax foreground and character-level diff.
 * `token` is foreground only; `changed` is difference only. They are orthogonal,
 * and the function never produces colours or reads a theme.
 */
export interface OverlaySegment {
  readonly text: string
  readonly token: SyntaxTokenClass | null
  readonly changed: boolean
}

interface Range {
  readonly start: number
  readonly end: number
}

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(value, max))
}

/**
 * Flattens whole-document syntax tokens and one line's inline segments into
 * per-character runs. Every boundary of either input splits a run, so a change
 * inside a token keeps the token class on all three pieces, and a token that
 * spans a changed boundary keeps the same class on both sides.
 *
 * `lineStartOffset` is the line's start in the folded document that produced
 * `tokens`; callers get it from `splitLines`. Concatenating the returned texts
 * always reproduces `lineText` character for character.
 */
export function overlayLine(
  lineText: string,
  lineStartOffset: number,
  tokens: readonly SyntaxToken[],
  inlineSegments: readonly InlineSegment[] = []
): OverlaySegment[] {
  const length = lineText.length
  if (length === 0) return []

  const lineStart = lineStartOffset
  const lineEnd = lineStart + length
  const boundaries = new Set<number>([0, length])

  for (const token of tokens) {
    if (token.end <= lineStart || token.start >= lineEnd) continue
    boundaries.add(clamp(token.start - lineStart, length))
    boundaries.add(clamp(token.end - lineStart, length))
  }

  const changedRanges: Range[] = []
  let segmentCursor = 0
  for (const segment of inlineSegments) {
    const next = segmentCursor + segment.text.length
    const boundary = clamp(next, length)
    boundaries.add(clamp(segmentCursor, length))
    boundaries.add(boundary)
    if (segment.changed && next > segmentCursor && segmentCursor < length) {
      changedRanges.push({ start: clamp(segmentCursor, length), end: boundary })
    }
    segmentCursor = clamp(next, length)
  }

  const points = [...boundaries].sort((a, b) => a - b)
  const segments: OverlaySegment[] = []
  let tokenCursor = 0
  let changedCursor = 0

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]
    const end = points[index + 1]
    if (end <= start) continue

    const absolute = lineStart + start
    while (tokenCursor < tokens.length && tokens[tokenCursor].end <= absolute) tokenCursor += 1
    const token = tokens[tokenCursor]
    const tokenClass = token !== undefined && token.start <= absolute && absolute < token.end
      ? token.class
      : null

    while (
      changedCursor < changedRanges.length &&
      changedRanges[changedCursor].end <= start
    ) {
      changedCursor += 1
    }
    const changedRange = changedRanges[changedCursor]
    const changed =
      changedRange !== undefined && changedRange.start <= start && start < changedRange.end

    const text = lineText.slice(start, end)
    const last = segments[segments.length - 1]
    if (last !== undefined && last.token === tokenClass && last.changed === changed) {
      segments[segments.length - 1] = { text: last.text + text, token: tokenClass, changed }
    } else {
      segments.push({ text, token: tokenClass, changed })
    }
  }

  return segments
}
