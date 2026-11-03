import { diffArrays, diffChars } from 'diff'
import type { DiffStatus } from '@shared/fixtures/types'
import { splitLines } from './lines'
import {
  describeNormalization,
  foldNewlines,
  isComparisonWhitespace,
  resolveComparisonSwitches,
  stripComparisonWhitespace
} from './normalize'
import type {
  ComparisonOptions,
  ComparisonSwitches,
  DiffNormalization,
  NormalizationSide,
  TextFacts
} from './normalize'

/**
 * Above this many characters a line skips the secondary character-level pass
 * and is highlighted as a whole. Keeps pathological single-line files from
 * freezing the renderer.
 */
export const INLINE_CHAR_LIMIT = 2000

/** One highlighted run of an inline (character-level) diff. */
export interface InlineSegment {
  readonly text: string
  readonly changed: boolean
}

/**
 * A single aligned row of the two-column diff. Exactly one side may be `null`
 * for a filler row, so a difference block stays visually level across panes.
 */
export interface DiffRow {
  readonly status: DiffStatus
  /** 1-based real line number, or `null` for a filler row. */
  readonly leftLine: number | null
  readonly rightLine: number | null
  readonly leftText: string | null
  readonly rightText: string | null
  /** 0-based line offset consumed before this row, used for block overwrite. */
  readonly leftIndex: number
  readonly rightIndex: number
  /** Character-level runs of a `modified` row; `undefined` on other rows. */
  readonly leftSegments?: readonly InlineSegment[]
  readonly rightSegments?: readonly InlineSegment[]
}

/** A maximal run of consecutive non-`same` rows. */
export interface DiffBlock {
  readonly index: number
  readonly status: DiffStatus
  /** Inclusive row span inside {@link LineDiffResult.rows}. */
  readonly startRow: number
  readonly endRow: number
  /** 0-based left line range covered by the block. */
  readonly leftStart: number
  readonly leftCount: number
  readonly rightStart: number
  readonly rightCount: number
}

export interface LineDiffResult {
  readonly rows: readonly DiffRow[]
  readonly blocks: readonly DiffBlock[]
}

/**
 * One comparison's full output. `rows` / `blocks` keep their aligned shape,
 * while the normalization facts and the single `differenceCount` are produced
 * by the very same call, so the toolbar, the gates and any hint read one
 * source instead of keeping their own predicate.
 */
export interface LineDiffComparison extends LineDiffResult {
  readonly normalization: DiffNormalization
  /** `blocks.length + (byteDifference ? 1 : 0)` — the only difference total. */
  readonly differenceCount: number
  /** `differenceCount === 0`. */
  readonly identical: boolean
}

/** One logical source line: terminator-free display text plus the compared line. */
interface SourceLine {
  readonly display: string
  /** Display text plus its own terminator, so strict mode can see CRLF vs LF. */
  readonly compare: string
}

/** Splits text into lines, keeping each real terminator apart from the content. */
function sourceLines(text: string, ignoreWhitespace: boolean): SourceLine[] {
  const lines: SourceLine[] = []
  let start = 0
  let cursor = 0

  while (cursor < text.length) {
    const code = text.charCodeAt(cursor)
    if (code !== 0x0a && code !== 0x0d) {
      cursor += 1
      continue
    }
    let terminator: string
    if (code === 0x0d) terminator = text.charCodeAt(cursor + 1) === 0x0a ? '\r\n' : '\r'
    else terminator = '\n'
    const content = text.slice(start, cursor)
    // The compared form may drop space / tab; the displayed form never does.
    const compared = ignoreWhitespace ? stripComparisonWhitespace(content) : content
    lines.push({ display: content, compare: compared + terminator })
    cursor += terminator.length
    start = cursor
  }

  if (start < text.length) {
    const content = text.slice(start)
    const compared = ignoreWhitespace ? stripComparisonWhitespace(content) : content
    lines.push({ display: content, compare: compared })
  }
  return lines
}

/** A whitespace-stripped string plus the index of every kept character. */
interface MappedText {
  readonly text: string
  readonly indices: readonly number[]
}

function stripWithIndices(text: string): MappedText {
  let stripped = ''
  const indices: number[] = []
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (isComparisonWhitespace(char)) continue
    stripped += char
    indices.push(index)
  }
  return { text: stripped, indices }
}

/** Appends one run, folding it into the previous run of the same tone. */
function mergeSegment(segments: InlineSegment[], text: string, changed: boolean): void {
  if (text.length === 0) return
  const last = segments[segments.length - 1]
  if (last !== undefined && last.changed === changed) {
    segments[segments.length - 1] = { text: last.text + text, changed }
    return
  }
  segments.push({ text, changed })
}

/**
 * Inline runs of one paired `modified` row while whitespace is ignored.
 *
 * The character pass runs over the whitespace-stripped lines, so a space / tab
 * change can never produce a changed run; every run is then mapped back onto
 * the original text, keeping the raw whitespace visible on both panes.
 */
function whitespaceInlineSegments(
  left: string,
  right: string
): { readonly left: readonly InlineSegment[]; readonly right: readonly InlineSegment[] } {
  const leftMap = stripWithIndices(left)
  const rightMap = stripWithIndices(right)
  if (leftMap.text === rightMap.text) {
    return { left: [{ text: left, changed: false }], right: [{ text: right, changed: false }] }
  }
  if (left.length > INLINE_CHAR_LIMIT || right.length > INLINE_CHAR_LIMIT) {
    return {
      left: [{ text: left, changed: true }],
      right: [{ text: right, changed: true }]
    }
  }

  const leftSegments: InlineSegment[] = []
  const rightSegments: InlineSegment[] = []
  let leftCursor = 0
  let rightCursor = 0
  let leftIndex = 0
  let rightIndex = 0

  for (const part of diffChars(leftMap.text, rightMap.text)) {
    const count = part.value.length
    if (part.added) {
      const start = rightMap.indices[rightIndex]
      const end = rightMap.indices[rightIndex + count - 1] + 1
      mergeSegment(rightSegments, right.slice(rightCursor, start), false)
      mergeSegment(rightSegments, right.slice(start, end), true)
      rightCursor = end
      rightIndex += count
    } else if (part.removed) {
      const start = leftMap.indices[leftIndex]
      const end = leftMap.indices[leftIndex + count - 1] + 1
      mergeSegment(leftSegments, left.slice(leftCursor, start), false)
      mergeSegment(leftSegments, left.slice(start, end), true)
      leftCursor = end
      leftIndex += count
    } else {
      const leftEnd = leftMap.indices[leftIndex + count - 1] + 1
      const rightEnd = rightMap.indices[rightIndex + count - 1] + 1
      mergeSegment(leftSegments, left.slice(leftCursor, leftEnd), false)
      mergeSegment(rightSegments, right.slice(rightCursor, rightEnd), false)
      leftCursor = leftEnd
      rightCursor = rightEnd
      leftIndex += count
      rightIndex += count
    }
  }

  mergeSegment(leftSegments, left.slice(leftCursor), false)
  mergeSegment(rightSegments, right.slice(rightCursor), false)
  return { left: leftSegments, right: rightSegments }
}

/**
 * Character-level runs for a paired `modified` row. With `ignoreWhitespace` the
 * runs are computed on the whitespace-stripped lines and mapped back, so only
 * non-whitespace character changes are highlighted.
 */
export function inlineSegments(
  left: string,
  right: string,
  ignoreWhitespace = false
): { readonly left: readonly InlineSegment[]; readonly right: readonly InlineSegment[] } {
  if (ignoreWhitespace) return whitespaceInlineSegments(left, right)
  if (left.length > INLINE_CHAR_LIMIT || right.length > INLINE_CHAR_LIMIT) {
    return {
      left: [{ text: left, changed: true }],
      right: [{ text: right, changed: true }]
    }
  }

  const leftSegments: InlineSegment[] = []
  const rightSegments: InlineSegment[] = []
  for (const part of diffChars(left, right)) {
    if (part.added) rightSegments.push({ text: part.value, changed: true })
    else if (part.removed) leftSegments.push({ text: part.value, changed: true })
    else {
      leftSegments.push({ text: part.value, changed: false })
      rightSegments.push({ text: part.value, changed: false })
    }
  }
  return { left: leftSegments, right: rightSegments }
}

function buildBlocks(rows: readonly DiffRow[]): DiffBlock[] {
  const blocks: DiffBlock[] = []
  let cursor = 0

  while (cursor < rows.length) {
    if (rows[cursor].status === 'same') {
      cursor += 1
      continue
    }

    const start = cursor
    let leftCount = 0
    let rightCount = 0
    let hasModified = false
    let hasAdded = false
    while (cursor < rows.length && rows[cursor].status !== 'same') {
      const row = rows[cursor]
      if (row.leftText !== null) leftCount += 1
      if (row.rightText !== null) rightCount += 1
      if (row.status === 'modified') hasModified = true
      if (row.status === 'added') hasAdded = true
      cursor += 1
    }

    blocks.push({
      index: blocks.length,
      status: hasModified ? 'modified' : hasAdded ? 'added' : 'removed',
      startRow: start,
      endRow: cursor - 1,
      leftStart: rows[start].leftIndex,
      leftCount,
      rightStart: rows[start].rightIndex,
      rightCount
    })
  }
  return blocks
}

/**
 * Line-level diff of two texts with aligned rows and character-level runs for
 * paired modifications. Rows alternate between `same`, `modified`, `added` and
 * `removed`; filler rows carry `null` on the missing side so both panes have
 * the same row count and scroll in lockstep.
 *
 * Switches default to on for newline / encoding and off for whitespace, so the
 * two-arg call keeps folding CRLF, lone CR and LF into one terminator and still
 * compares every space and tab. Turning `ignoreNewline` off compares the raw
 * terminators while still showing rows without them; turning `ignoreWhitespace`
 * on drops space / tab differences from the line and inline passes while both
 * panes keep the original characters.
 */
export function diffLineTexts(
  leftText: string,
  rightText: string,
  options: ComparisonOptions = {}
): LineDiffComparison {
  const switches = resolveComparisonSwitches(options)
  return compareLineTexts(leftText, rightText, switches, { text: leftText }, { text: rightText })
}

/**
 * Same comparison, fed with the probe facts of both files so strict
 * `ignoreEncoding` can tell "same text, different bytes" apart. Without facts
 * the strict encoding switch simply cannot compare and only the text decides.
 */
export function diffLineTextsWithFacts(
  leftFacts: TextFacts,
  rightFacts: TextFacts,
  options: ComparisonOptions = {}
): LineDiffComparison {
  const switches = resolveComparisonSwitches(options)
  return compareLineTexts(leftFacts.text, rightFacts.text, switches, leftFacts, rightFacts)
}

function compareLineTexts(
  leftText: string,
  rightText: string,
  switches: ComparisonSwitches,
  leftSide: NormalizationSide,
  rightSide: NormalizationSide
): LineDiffComparison {
  const rows = buildRows(leftText, rightText, switches)
  const blocks = buildBlocks(rows)
  const normalization = describeNormalization(leftSide, rightSide, switches)
  const differenceCount = blocks.length + (normalization.encoding.byteDifference ? 1 : 0)
  return { rows, blocks, normalization, differenceCount, identical: differenceCount === 0 }
}

function buildRows(
  leftText: string,
  rightText: string,
  switches: ComparisonSwitches
): DiffRow[] {
  const left = sourceLines(
    switches.ignoreNewline ? foldNewlines(leftText) : leftText,
    switches.ignoreWhitespace
  )
  const right = sourceLines(
    switches.ignoreNewline ? foldNewlines(rightText) : rightText,
    switches.ignoreWhitespace
  )

  const rows: DiffRow[] = []
  let leftIndex = 0
  let rightIndex = 0
  let pendingRemoved: SourceLine[] = []
  let pendingAdded: SourceLine[] = []

  function flush(): void {
    if (pendingRemoved.length === 0 && pendingAdded.length === 0) return
    const paired = Math.min(pendingRemoved.length, pendingAdded.length)

    for (let i = 0; i < paired; i += 1) {
      const leftLine = pendingRemoved[i]
      const rightLine = pendingAdded[i]
      const segments = inlineSegments(
        leftLine.display,
        rightLine.display,
        switches.ignoreWhitespace
      )
      rows.push({
        status: 'modified',
        leftLine: leftIndex + 1,
        rightLine: rightIndex + 1,
        leftText: leftLine.display,
        rightText: rightLine.display,
        leftIndex,
        rightIndex,
        leftSegments: segments.left,
        rightSegments: segments.right
      })
      leftIndex += 1
      rightIndex += 1
    }

    for (let i = paired; i < pendingRemoved.length; i += 1) {
      rows.push({
        status: 'removed',
        leftLine: leftIndex + 1,
        rightLine: null,
        leftText: pendingRemoved[i].display,
        rightText: null,
        leftIndex,
        rightIndex
      })
      leftIndex += 1
    }

    for (let i = paired; i < pendingAdded.length; i += 1) {
      rows.push({
        status: 'added',
        leftLine: null,
        rightLine: rightIndex + 1,
        leftText: null,
        rightText: pendingAdded[i].display,
        leftIndex,
        rightIndex
      })
      rightIndex += 1
    }

    pendingRemoved = []
    pendingAdded = []
  }

  const changes = diffArrays(left, right, {
    comparator: (a, b) => a.compare === b.compare
  })

  for (const part of changes) {
    if (part.removed) pendingRemoved.push(...part.value)
    else if (part.added) pendingAdded.push(...part.value)
    else {
      flush()
      for (const line of part.value) {
        // A `same` row compares equal under the active switch, so the raw
        // display text can still differ (whitespace mode). Each pane keeps its
        // own characters; jsdiff's common value is the right-hand array.
        const leftLine = left[leftIndex]
        const rightLine = right[rightIndex]
        rows.push({
          status: 'same',
          leftLine: leftIndex + 1,
          rightLine: rightIndex + 1,
          leftText: leftLine === undefined ? line.display : leftLine.display,
          rightText: rightLine === undefined ? line.display : rightLine.display,
          leftIndex,
          rightIndex
        })
        leftIndex += 1
        rightIndex += 1
      }
    }
  }
  flush()

  return rows
}

/** Replaces `count` lines starting at `start` with `replacement`. */
export function replaceLines(
  text: string,
  start: number,
  count: number,
  replacement: readonly string[]
): string {
  const lines = splitLines(text)
  const next = [...lines.slice(0, start), ...replacement, ...lines.slice(start + count)]
  return next.join('\n')
}

export type OverwriteDirection = 'to-right' | 'to-left'

/** Overwrites one side of a diff block with the other side's text. */
export function overwriteBlock(
  leftText: string,
  rightText: string,
  result: LineDiffResult,
  blockIndex: number,
  direction: OverwriteDirection
): { readonly left: string; readonly right: string } {
  const block = result.blocks[blockIndex]
  if (!block) return { left: leftText, right: rightText }

  if (direction === 'to-right') {
    const source = splitLines(leftText).slice(block.leftStart, block.leftStart + block.leftCount)
    return {
      left: leftText,
      right: replaceLines(rightText, block.rightStart, block.rightCount, source)
    }
  }

  const source = splitLines(rightText).slice(block.rightStart, block.rightStart + block.rightCount)
  return {
    left: replaceLines(leftText, block.leftStart, block.leftCount, source),
    right: rightText
  }
}
