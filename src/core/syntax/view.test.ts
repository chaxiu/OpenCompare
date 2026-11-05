import { describe, expect, it, vi } from 'vitest'
import { clearSyntaxCache } from './cache'
import { resolveSyntaxView } from './view'

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
