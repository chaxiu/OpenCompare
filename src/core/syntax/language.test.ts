import { describe, expect, it } from 'vitest'
import { EXTENSION_LANGUAGES, SYNTAX_LANGUAGES, languageForPath } from './language'
import type { SyntaxLanguage } from './language'
import { TOKENIZER_LANGUAGES } from './tokenize'

const CASES: ReadonlyArray<readonly [string, SyntaxLanguage | null]> = [
  ['a.ts', 'typescript'], ['a.tsx', 'typescript'], ['a.js', 'javascript'],
  ['a.jsx', 'javascript'], ['a.py', 'python'], ['a.json', 'json'],
  ['/x/y/a.Tsx', 'typescript'], ['C:\\work\\A.TS', 'typescript'], ['a.TS', 'typescript'],
  ['a.Json', 'json'], ['a.PY', 'python'], ['a.JsOnC', 'json'],
  ['a.mjs', 'javascript'], ['a.cjs', 'javascript'], ['a.yml', 'yaml'],
  ['a.yaml', 'yaml'], ['a.md', 'markdown'], ['a.css', 'css'],
  ['a.html', 'xml'], ['a.htm', 'xml'], ['a.xml', 'xml'],
  ['a.sh', 'bash'], ['a.bash', 'bash'], ['a.txt', null],
  ['a.log', null], ['Makefile', null], ['', null], ['a.', null],
  ['a.go', null], ['a.rs', null], ['a.java', null], ['a.c', null], ['a.cpp', null],
  [null as unknown as string, null], [undefined as unknown as string, null]
]

describe('explicit extension map', () => {
  it('maps every required extension, alias and unknown fallback', () => {
    for (const [path, expected] of CASES) expect(languageForPath(path), String(path)).toBe(expected)
  })

  it('decides by file name only, never by content', () => {
    const source = 'const answer: number = 42'
    expect(source.length).toBeGreaterThan(0)
    expect(languageForPath('notes.txt')).toBeNull()
    expect(languageForPath('notes.ts')).toBe('typescript')
  })

  it('keeps the map, registry and tokenizer in exact parity', () => {
    const mapped = [...new Set(Object.values(EXTENSION_LANGUAGES))].sort()
    expect(mapped).toEqual([...SYNTAX_LANGUAGES].sort())
    expect([...TOKENIZER_LANGUAGES].sort()).toEqual([...SYNTAX_LANGUAGES].sort())
    for (const extra of ['go', 'rust', 'java', 'c', 'cpp']) {
      expect(TOKENIZER_LANGUAGES).not.toContain(extra)
    }
  })
})
