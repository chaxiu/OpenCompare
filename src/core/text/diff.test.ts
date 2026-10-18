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
