import { describe, expect, it } from 'vitest'
import type { SourceRange } from './locate'
import { findChangeAtLine } from './locateLine'
import type { ChangeRangeMap } from './locateLine'

/** One side's range; columns are irrelevant to the line lookup. */
function range(
  startLine: number,
  endLine: number,
  path: string,
  exact = true
): SourceRange {
  return { startLine, startColumn: 1, endLine, endColumn: 1, path, exact }
}

/** Both sides of one change entry, then overridden where the test needs it. */
function pair(left: SourceRange, right: SourceRange = left): {
  readonly left: SourceRange
  readonly right: SourceRange
} {
  return { left, right }
}

const ENTRIES = [{ path: '/a' }, { path: '/a/b' }]

describe('findChangeAtLine', () => {
  it('returns the deepest exact range covering the line', () => {
    const ranges: ChangeRangeMap = {
      '/a': pair(range(3, 20, '/a')),
      '/a/b': pair(range(5, 7, '/a/b'))
    }

    expect(findChangeAtLine(ENTRIES, ranges, 'left', 6)).toBe('/a/b')
    expect(findChangeAtLine(ENTRIES, ranges, 'left', 9)).toBe('/a')
    expect(findChangeAtLine(ENTRIES, ranges, 'left', 21)).toBeNull()
  })

  it('treats the range start and end lines as inside and its neighbours as outside', () => {
    const ranges: ChangeRangeMap = { '/a': pair(range(3, 20, '/a')) }

    expect(findChangeAtLine(ENTRIES, ranges, 'left', 2)).toBeNull()
    expect(findChangeAtLine(ENTRIES, ranges, 'left', 3)).toBe('/a')
    expect(findChangeAtLine(ENTRIES, ranges, 'left', 20)).toBe('/a')
    expect(findChangeAtLine(ENTRIES, ranges, 'left', 21)).toBeNull()
  })

  it('ignores an ancestor fallback (`exact: false`) but accepts the side that owns it', () => {
    const ranges: ChangeRangeMap = {
      '/a/b/c': {
        left: range(3, 20, '/a', false),
        right: range(5, 9, '/a/b/c', true)
      }
    }
    const entries = [{ path: '/a/b/c' }]

    expect(findChangeAtLine(entries, ranges, 'left', 6)).toBeNull()
    expect(findChangeAtLine(entries, ranges, 'right', 6)).toBe('/a/b/c')
  })

  it('keeps the two sides independent', () => {
    const ranges: ChangeRangeMap = {
      '/only-left': { left: range(2, 4, '/only-left'), right: range(1, 9, '', false) },
      '/only-right': { left: range(1, 9, '', false), right: range(6, 8, '/only-right') }
    }
    const entries = [{ path: '/only-left' }, { path: '/only-right' }]

    expect(findChangeAtLine(entries, ranges, 'left', 3)).toBe('/only-left')
    expect(findChangeAtLine(entries, ranges, 'left', 7)).toBeNull()
    expect(findChangeAtLine(entries, ranges, 'right', 7)).toBe('/only-right')
    expect(findChangeAtLine(entries, ranges, 'right', 3)).toBeNull()
  })

  it('is independent of entry order when the depths differ', () => {
    const ranges: ChangeRangeMap = {
      '/a': pair(range(3, 20, '/a')),
      '/a/b': pair(range(5, 7, '/a/b'))
    }

    expect(findChangeAtLine([{ path: '/a/b' }, { path: '/a' }], ranges, 'left', 6)).toBe('/a/b')
  })

  it('returns null with no entries, no ranges or a line outside every range', () => {
    expect(findChangeAtLine([], {}, 'left', 1)).toBeNull()
    expect(findChangeAtLine(ENTRIES, {}, 'left', 1)).toBeNull()
    expect(findChangeAtLine(ENTRIES, { '/a': pair(range(10, 12, '/a')) }, 'right', 1)).toBeNull()
  })
})
