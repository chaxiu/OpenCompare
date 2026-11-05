import { describe, expect, it, vi } from 'vitest'
import {
  SYNTAX_CACHE_MAX_CHARS,
  SYNTAX_CACHE_MAX_ENTRIES,
  clearSyntaxCache,
  syntaxCacheStats
} from './cache'
import { SYNTAX_MAX_HIGHLIGHT_CHARS, resolveSyntaxView } from './view'

/**
 * Wrap the real cache so one sentinel text simulates a parser failure; every
 * other call still exercises the delivered implementation.
 */
vi.mock('./cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./cache')>()
  return {
    ...actual,
    cachedSyntaxTokens: (text: string, language: Parameters<typeof actual.cachedSyntaxTokens>[1]) => {
      if (text.includes('PARSE_FAIL')) throw new Error('synthetic parser failure')
      return actual.cachedSyntaxTokens(text, language)
    }
  }
})

const TS = ['// note', 'const total = 42', 'const label = "open"'].join('\n')
const PY = ['# note', 'def total():', '    label = "open"', '    return 42'].join('\n')

/**
 * Deterministic valid TypeScript of exactly `target` characters: repeated
 * `const` statements plus a whitespace tail, so it always yields real tokens.
 */
function tsTextOfLength(target: number): string {
  let text = ''
  let index = 0
  while (true) {
    const line = `${index === 0 ? '' : '\n'}const value${index} = ${index} // note`
    if (text.length + line.length > target) break
    text += line
    index += 1
  }
  return text + ' '.repeat(target - text.length)
}

describe('resolveSyntaxView', () => {
  it('maps each side from its own explicit extension, never from content', () => {
    expect(resolveSyntaxView('/pairs/left.ts', TS)?.language).toBe('typescript')
    expect(resolveSyntaxView('/pairs/right.py', PY)?.language).toBe('python')
    expect(resolveSyntaxView('/pairs/left.ts', TS)?.tokens.length).toBeGreaterThan(0)
    expect(resolveSyntaxView('/pairs/right.py', PY)?.tokens.length).toBeGreaterThan(0)
    expect(resolveSyntaxView('/pairs/left.txt', TS)).toBeNull()
    expect(resolveSyntaxView('/pairs/README', TS)).toBeNull()
  })

  it('returns null for empty text and empty paths', () => {
    expect(resolveSyntaxView('', TS)).toBeNull()
    expect(resolveSyntaxView('/pairs/left.ts', '')).toBeNull()
    expect(resolveSyntaxView('/pairs/left.ts', '   ')).toBeNull()
  })

  it('folds CRLF so LF and CRLF produce identical tokens and line starts', () => {
    const lf = resolveSyntaxView('/pairs/left.ts', TS)
    const crlf = resolveSyntaxView('/pairs/left.ts', TS.replace(/\n/g, '\r\n'))
    expect(crlf?.tokens).toEqual(lf?.tokens)
    expect(crlf?.lineStarts).toEqual(lf?.lineStarts)
    const expected = [0]
    for (let index = 0; index < TS.length; index += 1) {
      if (TS[index] === '\n') expected.push(index + 1)
    }
    expect(lf?.lineStarts).toEqual(expected)
  })

  it('falls back to plain text when a lone \\r breaks the line map', () => {
    expect(resolveSyntaxView('/pairs/left.ts', 'const a = 1\rconst b = 2')).toBeNull()
    expect(resolveSyntaxView('/pairs/left.ts', 'const a = 1\r\nconst b = 2')).not.toBeNull()
  })

  it('falls back without throwing when the parser fails or yields no tokens', () => {
    expect(resolveSyntaxView('/pairs/left.ts', 'PARSE_FAIL')).toBeNull()
    expect(resolveSyntaxView('/pairs/left.ts', '   ')).toBeNull()
  })

  it('reuses the cached whole-document tokens instead of re-parsing per call', () => {
    clearSyntaxCache()
    const first = resolveSyntaxView('/pairs/left.ts', TS)
    expect(resolveSyntaxView('/pairs/left.ts', TS)?.tokens).toBe(first?.tokens)
  })
})

describe('large-file threshold inside the single entry', () => {
  const threshold = SYNTAX_MAX_HIGHLIGHT_CHARS

  it('highlights exactly at the threshold', () => {
    clearSyntaxCache()
    const inside = tsTextOfLength(threshold)
    expect(inside).toHaveLength(threshold)
    const view = resolveSyntaxView('/pairs/inside.ts', inside)
    expect(view).not.toBeNull()
    expect(view?.tokens.length).toBeGreaterThan(0)
  })

  it('falls back to plain text one character past the threshold', () => {
    clearSyntaxCache()
    const outside = tsTextOfLength(threshold + 1)
    expect(outside).toHaveLength(threshold + 1)
    expect(resolveSyntaxView('/pairs/outside.ts', outside)).toBeNull()
  })

  it('flips on folded length, so LF and CRLF versions agree', () => {
    clearSyntaxCache()
    const lfInside = tsTextOfLength(threshold)
    const crlfInside = lfInside.replace(/\n/g, '\r\n')
    expect(crlfInside.length).toBeGreaterThan(threshold)
    expect(resolveSyntaxView('/pairs/a.ts', lfInside)).not.toBeNull()
    expect(resolveSyntaxView('/pairs/b.ts', crlfInside)).not.toBeNull()

    const lfOutside = tsTextOfLength(threshold + 1)
    const crlfOutside = lfOutside.replace(/\n/g, '\r\n')
    expect(resolveSyntaxView('/pairs/c.ts', lfOutside)).toBeNull()
    expect(resolveSyntaxView('/pairs/d.ts', crlfOutside)).toBeNull()
  })

  it('rejects before the cache and tokenizer: misses and charCount stay put', () => {
    clearSyntaxCache()
    const before = syntaxCacheStats()
    expect(before).toEqual({ size: 0, charCount: 0, hits: 0, misses: 0 })
    expect(resolveSyntaxView('/pairs/outside.ts', tsTextOfLength(threshold + 1))).toBeNull()
    expect(syntaxCacheStats()).toEqual(before)
  })

  it('keeps the two cache bounds and evicts across forty distinct large documents', () => {
    clearSyntaxCache()
    expect(SYNTAX_CACHE_MAX_ENTRIES).toBe(32)
    expect(SYNTAX_CACHE_MAX_CHARS).toBe(262_144)
    expect(threshold).toBeLessThanOrEqual(SYNTAX_CACHE_MAX_CHARS)
    for (let index = 0; index < 40; index += 1) {
      const size = Math.min(20_000 + index * 7, threshold)
      const text = tsTextOfLength(size).replace(/const value0/, `const value${index}`)
      expect(resolveSyntaxView(`/pairs/doc-${index}.ts`, text)).not.toBeNull()
    }
    const stats = syntaxCacheStats()
    expect(stats.size).toBeLessThanOrEqual(SYNTAX_CACHE_MAX_ENTRIES)
    expect(stats.charCount).toBeLessThanOrEqual(SYNTAX_CACHE_MAX_CHARS)
  })

  it('retains threshold-sized text so a repeat render is a hit', () => {
    clearSyntaxCache()
    const text = tsTextOfLength(threshold)
    const first = resolveSyntaxView('/pairs/hit.ts', text)
    const missesAfterFirst = syntaxCacheStats().misses
    const second = resolveSyntaxView('/pairs/hit.ts', text)
    const stats = syntaxCacheStats()
    expect(missesAfterFirst).toBe(1)
    expect(stats.hits).toBe(1)
    expect(stats.misses).toBe(1)
    expect(second?.tokens).toBe(first?.tokens)
  })
})
