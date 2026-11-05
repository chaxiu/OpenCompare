import { describe, expect, it } from 'vitest'
import { splitLines } from '../text/lines'
import type { InlineSegment } from '../text/diff'
import { overlayLine } from './overlay'
import { tokenizeSyntax } from './tokenize'
import type { SyntaxToken } from './tokenize'

const joined = (segments: ReturnType<typeof overlayLine>): string =>
  segments.map((segment) => segment.text).join('')

describe('token x diff overlay', () => {
  it('preserves every line character for character with three-field runs', () => {
    for (const line of ['const value = 42', '', '  trailing spaces   ', 'x'.repeat(300)]) {
      const tokens: readonly SyntaxToken[] = [{ start: 0, end: Math.min(5, line.length), class: 'keyword' }]
      const segments = overlayLine(line, 0, tokens, [
        { text: line.slice(0, 2), changed: false },
        { text: line.slice(2), changed: true }
      ])
      expect(joined(segments)).toBe(line)
      for (const segment of segments) {
        expect(Object.keys(segment).sort()).toEqual(['changed', 'text', 'token'])
      }
    }
  })

  it('splits a token changed in its own middle into three equal-class runs', () => {
    const segments = overlayLine('count', 0, [{ start: 0, end: 5, class: 'keyword' }], [
      { text: 'c', changed: false },
      { text: 'ou', changed: true },
      { text: 'nt', changed: false }
    ])
    expect(segments.map((segment) => segment.text)).toEqual(['c', 'ou', 'nt'])
    expect(segments.map((segment) => segment.changed)).toEqual([false, true, false])
    expect(segments.map((segment) => segment.token)).toEqual(['keyword', 'keyword', 'keyword'])
  })

  it('splits a token that crosses a changed boundary and keeps its class', () => {
    const segments = overlayLine('const value = 1', 0, [{ start: 0, end: 11, class: 'string' }], [
      { text: 'const ', changed: false },
      { text: 'value', changed: true },
      { text: ' = 1', changed: false }
    ])
    expect(segments.map((segment) => segment.text)).toEqual(['const ', 'value', ' = 1'])
    expect(segments.map((segment) => segment.changed)).toEqual([false, true, false])
    expect(segments.map((segment) => segment.token)).toEqual(['string', 'string', null])
  })

  it('handles blank lines, including the middle of a block comment', () => {
    const document = '/* one\n\nthree */'
    const tokens = tokenizeSyntax(document, 'typescript')
    const start = splitLines(document)[0].length + 1
    expect(tokens.length).toBeGreaterThan(0)
    expect(joined(overlayLine('', start, tokens, []))).toBe('')
  })

  it('marks trailing-space changes at the line end and keeps tail pieces', () => {
    const line = 'const a = 1  '
    const changed = overlayLine(line, 0, [], [
      { text: 'const a = 1', changed: false },
      { text: '  ', changed: true }
    ])
    expect(changed[changed.length - 1]).toMatchObject({ text: '  ', changed: true })
    const unchanged = overlayLine(line, 0, [], [{ text: line, changed: false }])
    expect(unchanged[unchanged.length - 1].changed).toBe(false)
    expect(joined(unchanged)).toBe(line)
  })

  it('keeps whitespace-only changed runs visible', () => {
    const line = '\t  '
    expect(overlayLine(line, 0, [], [{ text: line, changed: true }])).toEqual([
      { text: line, token: null, changed: true }
    ])
  })

  it('keeps tokens but no changes when a row has no inline segments', () => {
    const tokens: readonly SyntaxToken[] = [
      { start: 0, end: 6, class: 'keyword' },
      { start: 7, end: 8, class: 'number' }
    ]
    const segments = overlayLine('return 1', 0, tokens)
    expect(segments.every((segment) => segment.changed === false)).toBe(true)
    expect(segments.map((segment) => segment.token)).toEqual(['keyword', null, 'number'])
    expect(overlayLine('abc', 0, [], [] as readonly InlineSegment[])).toEqual([
      { text: 'abc', token: null, changed: false }
    ])
  })

  it('honours a non-zero line start offset', () => {
    const document = '/* one\ntwo */'
    const tokens = tokenizeSyntax(document, 'typescript')
    const lineStart = document.indexOf('two')
    const segments = overlayLine('two */', lineStart, tokens, [
      { text: 'two', changed: false },
      { text: ' */', changed: true }
    ])
    expect(segments.map((segment) => segment.token)).toEqual(['comment', 'comment'])
    expect(joined(segments)).toBe('two */')
  })
})
