import { describe, expect, it } from 'vitest'
import { splitLines } from './lines'
import {
  INLINE_CHAR_LIMIT,
  diffLineTexts,
  inlineSegments,
  overwriteBlock
} from './diff'

const LEFT = ['alpha', '  color: red', 'beta', ''].join('\n')
const RIGHT = ['alpha', '  color: blue', 'beta', 'gamma', ''].join('\n')

describe('diffLineTexts', () => {
  const result = diffLineTexts(LEFT, RIGHT)

  it('keeps one aligned row per line and numbers both sides', () => {
    const same = result.rows.filter((row) => row.status === 'same')
    expect(same[0]).toMatchObject({ leftLine: 1, rightLine: 1, leftText: 'alpha' })

    // Filler rows never invent a line number.
    for (const row of result.rows) {
      if (row.leftLine !== null) expect(row.leftText).not.toBeNull()
      if (row.rightLine !== null) expect(row.rightText).not.toBeNull()
      if (row.leftLine === null) expect(row.leftText).toBeNull()
      if (row.rightLine === null) expect(row.rightText).toBeNull()
    }
  })

  it('pairs a changed line into a modified row with character-level runs', () => {
    const modified = result.rows.find((row) => row.status === 'modified')
    expect(modified).toBeDefined()
    expect(modified).toMatchObject({ leftLine: 2, rightLine: 2, leftText: '  color: red' })

    // Runs concatenate back to the original line on both sides.
    expect(modified?.leftSegments?.map((segment) => segment.text).join('')).toBe('  color: red')
    expect(modified?.rightSegments?.map((segment) => segment.text).join('')).toBe('  color: blue')

    const changedLeft = modified?.leftSegments?.filter((segment) => segment.changed) ?? []
    const changedRight = modified?.rightSegments?.filter((segment) => segment.changed) ?? []
    expect(changedLeft.length).toBeGreaterThan(0)
    expect(changedRight.length).toBeGreaterThan(0)
    expect(changedLeft.map((segment) => segment.text).join('')).not.toBe(
      changedRight.map((segment) => segment.text).join('')
    )
  })

  it('aligns a one-sided added line with a filler on the other side', () => {
    const added = result.rows.find((row) => row.status === 'added')
    expect(added).toMatchObject({ leftLine: null, leftText: null, rightText: 'gamma' })
    expect(added?.rightLine).toBe(4)
  })

  it('groups consecutive non-same rows into blocks with both side ranges', () => {
    expect(result.blocks.map((block) => block.status)).toEqual(['modified', 'added'])
    expect(result.blocks[0]).toMatchObject({ leftStart: 1, leftCount: 1, rightStart: 1, rightCount: 1 })
    expect(result.blocks[1]).toMatchObject({ leftCount: 0, rightStart: 3, rightCount: 1 })
  })
})

describe('inlineSegments', () => {
  it('degrades to a whole-line highlight for over-long lines', () => {
    const long = 'x'.repeat(INLINE_CHAR_LIMIT + 1)
    const segments = inlineSegments(long, `${long}y`)
    expect(segments.left).toEqual([{ text: long, changed: true }])
    expect(segments.right).toEqual([{ text: `${long}y`, changed: true }])
  })
})

describe('overwriteBlock', () => {
  const before = diffLineTexts(LEFT, RIGHT)

  it('copies a modified block to either side', () => {
    const index = before.blocks.find((block) => block.status === 'modified')?.index ?? -1

    const toRight = overwriteBlock(LEFT, RIGHT, before, index, 'to-right')
    expect(splitLines(toRight.right)[1]).toBe('  color: red')
    expect(toRight.left).toBe(LEFT)

    const toLeft = overwriteBlock(LEFT, RIGHT, before, index, 'to-left')
    expect(splitLines(toLeft.left)[1]).toBe('  color: blue')
    expect(toLeft.right).toBe(RIGHT)
  })

  it('inserts a one-sided block into the text that is missing it', () => {
    const index = before.blocks.find((block) => block.status === 'added')?.index ?? -1
    const inserted = overwriteBlock(LEFT, RIGHT, before, index, 'to-left')
    expect(splitLines(inserted.left)).toEqual(['alpha', '  color: red', 'beta', 'gamma', ''])
  })
})

describe('ignore whitespace switch', () => {
  /** Trailing spaces, tab ↔ space and repeated inline blanks. */
  const WHITESPACE_ONLY: readonly (readonly [string, string])[] = [
    ['alpha \n', 'alpha\n'],
    ['alpha\t\n', 'alpha   \n'],
    ['alpha   beta\n', 'alpha beta\n'],
    ['\t\tvalue = 1  \n', ' value = 1\n']
  ]

  it('defaults to strict per-character comparison', () => {
    const strict = diffLineTexts('alpha \n', 'alpha\n')
    expect(strict.normalization.ignoreWhitespace).toBe(false)
    expect(strict.differenceCount).toBeGreaterThan(0)
    expect(strict.blocks).toHaveLength(1)
    expect(strict.rows.every((row) => row.status === 'same')).toBe(false)
  })

  it('counts a whitespace-only pair as identical while keeping raw display text', () => {
    for (const [left, right] of WHITESPACE_ONLY) {
      const result = diffLineTexts(left, right, { ignoreWhitespace: true })
      expect(result.normalization.ignoreWhitespace).toBe(true)
      expect(result.differenceCount).toBe(0)
      expect(result.identical).toBe(true)
      expect(result.blocks).toEqual([])
      for (const row of result.rows) {
        expect(row.status).toBe('same')
        expect(row.leftSegments).toBeUndefined()
        expect(row.rightSegments).toBeUndefined()
      }
      const first = result.rows[0]
      expect(first.leftText).toBe(left.slice(0, left.indexOf('\n')))
      expect(first.rightText).toBe(right.slice(0, right.indexOf('\n')))
    }
  })

  it('keeps every real character difference and counts it once', () => {
    const left = 'value  =  1 \n'
    const right = 'value = 2\n'
    const ignored = diffLineTexts(left, right, { ignoreWhitespace: true })
    const strict = diffLineTexts(left, right)
    expect(ignored.differenceCount).toBeGreaterThan(0)
    expect(ignored.differenceCount).toBe(strict.differenceCount)
    const modified = ignored.rows.filter((row) => row.status === 'modified')
    expect(modified).toHaveLength(1)
    expect(modified[0].leftSegments?.map((segment) => segment.text).join('')).toBe('value  =  1 ')
    expect(modified[0].rightSegments?.map((segment) => segment.text).join('')).toBe('value = 2')
  })

  it('highlights only non-whitespace changes on a modified row', () => {
    const result = diffLineTexts('const  name = "a"\n', 'const name  = "b"\n', {
      ignoreWhitespace: true
    })
    const row = result.rows.find((candidate) => candidate.status === 'modified')
    expect(row).toBeDefined()
    const changedLeft = (row?.leftSegments ?? []).filter((segment) => segment.changed)
    const changedRight = (row?.rightSegments ?? []).filter((segment) => segment.changed)
    expect(changedLeft.map((segment) => segment.text).join('')).toBe('a')
    expect(changedRight.map((segment) => segment.text).join('')).toBe('b')
    for (const segment of [...changedLeft, ...changedRight]) {
      expect(segment.text.replace(/[ \t]/g, '').length).toBeGreaterThan(0)
    }
  })

  it('never hides a newline difference behind the whitespace switch', () => {
    const strictNewline = diffLineTexts('alpha\r\nbeta\r\n', 'alpha\nbeta\n', {
      ignoreWhitespace: true,
      ignoreNewline: false
    })
    expect(strictNewline.differenceCount).toBeGreaterThan(0)
    const foldedNewline = diffLineTexts('alpha\r\nbeta\r\n', 'alpha\nbeta\n', {
      ignoreWhitespace: true
    })
    expect(foldedNewline.differenceCount).toBe(0)
  })

  it('leaves inline segments untouched when the switch is off', () => {
    const strict = inlineSegments('a b', 'a  b')
    expect(strict.left.map((segment) => segment.text).join('')).toBe('a b')
    expect(strict.left.some((segment) => segment.changed)).toBe(false)
    expect(strict.right.some((segment) => segment.changed)).toBe(true)

    const ignored = inlineSegments('a b', 'a  b', true)
    expect(ignored.left).toEqual([{ text: 'a b', changed: false }])
    expect(ignored.right).toEqual([{ text: 'a  b', changed: false }])
  })
})
