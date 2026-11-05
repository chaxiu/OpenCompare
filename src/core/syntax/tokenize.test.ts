import { describe, expect, it } from 'vitest'
import { splitLines } from '../text/lines'
import { foldSyntaxText, tokenizeSyntax } from './tokenize'
import type { SyntaxToken, SyntaxTokenClass } from './tokenize'

const FOUR: readonly SyntaxTokenClass[] = ['keyword', 'string', 'number', 'comment']

function rebuild(text: string, tokens: readonly SyntaxToken[]): string {
  let cursor = 0
  const pieces: string[] = []
  for (const token of tokens) {
    expect(token.start).toBeGreaterThanOrEqual(cursor)
    expect(token.start).toBeLessThan(token.end)
    expect(token.end).toBeLessThanOrEqual(text.length)
    pieces.push(text.slice(cursor, token.start), text.slice(token.start, token.end))
    cursor = token.end
  }
  pieces.push(text.slice(cursor))
  return pieces.join('')
}

const at = (tokens: readonly SyntaxToken[], offset: number): SyntaxToken | undefined =>
  tokens.find((token) => token.start <= offset && offset < token.end)

const doc = [
  'const start = 1',
  '/* first line',
  '   middle line without an opener',
  '   last line */',
  'const template = `first',
  'second',
  'third`',
  'const end = 2'
].join('\n')

describe('whole-document tokenizing', () => {
  it('keeps block-comment and template-string state across every line', () => {
    const tokens = tokenizeSyntax(doc, 'typescript')
    let start = 0
    for (const [index, line] of splitLines(doc).entries()) {
      const covered = tokens.filter((token) => token.start < start + line.length && token.end > start)
      if (index === 2) expect(covered.map((token) => token.class)).toContain('comment')
      if (index === 5) expect(covered.map((token) => token.class)).toContain('string')
      start += line.length + 1
    }
    expect(at(tokens, doc.indexOf('middle line'))?.class).toBe('comment')
    expect(at(tokens, doc.indexOf('second'))?.class).toBe('string')
  })

  it('keeps offsets ascending, in bounds and free of lost characters', () => {
    const samples: ReadonlyArray<readonly [string, 'typescript' | 'python' | 'json']> = [
      [doc, 'typescript'],
      ['# note\ndef f(x):\n  return "s" + 1\n', 'python'],
      ['{\n  "a": 1,\n  "b": true // note\n}', 'json'],
      ['// note\nconst a = 1\nconst b = "s"', 'typescript'],
      ['// note\n{"a": 1, "b": true}', 'json']
    ]
    for (const [text, language] of samples) {
      const tokens = tokenizeSyntax(text, language)
      expect(tokens.length).toBeGreaterThan(0)
      expect(rebuild(text, tokens)).toBe(text)
      expect(new Set(tokens.map((token) => token.class))).toEqual(new Set(FOUR))
    }
  })

  it('classifies JSON attributes, numbers, literals and jsonc comments', () => {
    const text = '// line\n{"a": 1, "b": true}\n/* block */'
    const tokens = tokenizeSyntax(text, 'json')
    expect(at(tokens, text.indexOf('"a"'))?.class).toBe('string')
    expect(at(tokens, text.indexOf('1'))?.class).toBe('number')
    expect(at(tokens, text.indexOf('true'))?.class).toBe('keyword')
    expect(at(tokens, text.indexOf('// line'))?.class).toBe('comment')
    expect(at(tokens, text.indexOf('/* block */'))?.class).toBe('comment')
  })

  it('returns nothing for empty input or an unknown language', () => {
    expect(tokenizeSyntax('', 'typescript')).toEqual([])
    expect(tokenizeSyntax('', null)).toEqual([])
    expect(tokenizeSyntax('const a = 1', null)).toEqual([])
    expect(tokenizeSyntax('', 'python')).toEqual([])
  })

  it('produces identical ranges for CRLF and LF versions', () => {
    const lf = 'const a = 1\n/* one\ntwo\nthree */\nconst b = `x\ny\nz`'
    const crlf = lf.replace(/\n/g, '\r\n')
    expect(foldSyntaxText(crlf)).toBe(lf)
    expect(tokenizeSyntax(crlf, 'typescript')).toEqual(tokenizeSyntax(lf, 'typescript'))
  })
})
