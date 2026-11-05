import { describe, expect, it } from 'vitest'
import { SYNTAX_CACHE_LIMITS, SYNTAX_CACHE_MAX_CHARS, SYNTAX_CACHE_MAX_ENTRIES, SyntaxCache } from './cache'
import type { SyntaxToken } from './tokenize'

const parserFor = (calls: { count: number }) => (text: string): readonly SyntaxToken[] => {
  calls.count += 1
  return text.length === 0 ? [] : [{ start: 0, end: text.length, class: 'keyword' }]
}

describe('bounded syntax cache', () => {
  it('parses once for a repeated (language, text) pair', () => {
    const calls = { count: 0 }
    const cache = new SyntaxCache({ parse: parserFor(calls) })
    const first = cache.get('const a = 1', 'typescript')
    const second = cache.get('const a = 1', 'typescript')
    expect(calls.count).toBe(1)
    expect(cache.hits).toBe(1)
    expect(second).toEqual(first)
    expect(cache.size).toBe(1)
  })

  it('keeps language and text keyed entries apart', () => {
    const calls = { count: 0 }
    const cache = new SyntaxCache({ parse: parserFor(calls) })
    cache.get('same text', 'typescript')
    cache.get('same text', 'python')
    cache.get('other text', 'typescript')
    expect(calls.count).toBe(3)
    expect(cache.size).toBe(3)
    expect(cache.has('same text', 'typescript')).toBe(true)
    expect(cache.has('same text', 'python')).toBe(true)
  })

  it('evicts exactly the least recently used entry', () => {
    const calls = { count: 0 }
    const cache = new SyntaxCache({ maxEntries: 2, maxChars: 1_000, parse: parserFor(calls) })
    cache.get('a', 'typescript')
    cache.get('b', 'typescript')
    cache.get('a', 'typescript')
    cache.get('c', 'typescript')
    expect(cache.size).toBe(2)
    expect(cache.has('a', 'typescript')).toBe(true)
    expect(cache.has('c', 'typescript')).toBe(true)
    expect(cache.has('b', 'typescript')).toBe(false)
    const before = calls.count
    cache.get('a', 'typescript')
    expect(calls.count).toBe(before)
    cache.get('b', 'typescript')
    expect(calls.count).toBe(before + 1)
  })

  it('never exceeds the character budget and skips oversized documents', () => {
    const calls = { count: 0 }
    const cache = new SyntaxCache({ maxEntries: 10, maxChars: 10, parse: parserFor(calls) })
    cache.get('12345', 'typescript')
    cache.get('abcdef', 'typescript')
    expect(cache.charCount).toBeLessThanOrEqual(10)
    const oversized = 'x'.repeat(11)
    expect(cache.get(oversized, 'typescript')).toHaveLength(1)
    expect(cache.has(oversized, 'typescript')).toBe(false)
    expect(cache.charCount).toBeLessThanOrEqual(10)
    const before = calls.count
    cache.get(oversized, 'typescript')
    expect(calls.count).toBe(before + 1)
  })

  it('clears every entry and parses again afterwards', () => {
    const calls = { count: 0 }
    const cache = new SyntaxCache({ parse: parserFor(calls) })
    cache.get('const a = 1', 'typescript')
    cache.clear()
    expect(cache.size).toBe(0)
    expect(cache.charCount).toBe(0)
    cache.get('const a = 1', 'typescript')
    expect(calls.count).toBe(2)
  })

  it('exports frozen finite default limits', () => {
    expect(Number.isFinite(SYNTAX_CACHE_MAX_ENTRIES)).toBe(true)
    expect(Number.isFinite(SYNTAX_CACHE_MAX_CHARS)).toBe(true)
    expect(SYNTAX_CACHE_MAX_ENTRIES).toBeGreaterThan(0)
    expect(SYNTAX_CACHE_MAX_CHARS).toBeGreaterThan(0)
    expect(Object.isFrozen(SYNTAX_CACHE_LIMITS)).toBe(true)
    expect(SYNTAX_CACHE_LIMITS.maxEntries).toBe(SYNTAX_CACHE_MAX_ENTRIES)
    expect(SYNTAX_CACHE_LIMITS.maxChars).toBe(SYNTAX_CACHE_MAX_CHARS)
  })
})
