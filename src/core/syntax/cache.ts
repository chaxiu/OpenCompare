import { tokenizeSyntax } from './tokenize'
import type { SyntaxToken } from './tokenize'
import type { SyntaxLanguage } from './language'

/**
 * Frozen default bounds for the module-level cache. `maxEntries` keeps the
 * bookkeeping small for tab switching, while `maxChars` caps the retained
 * source text so a few large files cannot grow the process without bound.
 * Both are concrete finite numbers; the defaults are measured in the delivery
 * summary and can be overridden per instance for boundary tests.
 */
export const SYNTAX_CACHE_MAX_ENTRIES = 32
export const SYNTAX_CACHE_MAX_CHARS = 262_144

export const SYNTAX_CACHE_LIMITS = Object.freeze({
  maxEntries: SYNTAX_CACHE_MAX_ENTRIES,
  maxChars: SYNTAX_CACHE_MAX_CHARS
})

export type SyntaxParser = (text: string, language: SyntaxLanguage) => readonly SyntaxToken[]

export interface SyntaxCacheOptions {
  /** Maximum resident entries. Defaults to {@link SYNTAX_CACHE_MAX_ENTRIES}. */
  readonly maxEntries?: number
  /** Maximum resident source characters. Defaults to {@link SYNTAX_CACHE_MAX_CHARS}. */
  readonly maxChars?: number
  /** Injectable parser, used by tests to count real parses. */
  readonly parse?: SyntaxParser
}

interface CacheEntry {
  readonly tokens: readonly SyntaxToken[]
  readonly chars: number
}

function bound(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.floor(value))
}

/**
 * Deterministic LRU keyed by `(language, text)`. A hit moves the entry to the
 * freshest position; insertion evicts from the oldest until both the entry and
 * character budgets hold. Text larger than the character budget is still
 * parsed correctly but never retained.
 */
export class SyntaxCache {
  private readonly entries = new Map<string, CacheEntry>()
  private readonly maxEntries: number
  private readonly maxChars: number
  private readonly parse: SyntaxParser
  private chars = 0
  private hitCount = 0
  private missCount = 0

  constructor(options: SyntaxCacheOptions = {}) {
    this.maxEntries = bound(options.maxEntries ?? SYNTAX_CACHE_MAX_ENTRIES, SYNTAX_CACHE_MAX_ENTRIES)
    this.maxChars = bound(options.maxChars ?? SYNTAX_CACHE_MAX_CHARS, SYNTAX_CACHE_MAX_CHARS)
    this.parse = options.parse ?? tokenizeSyntax
  }

  /** Resident entry count. */
  get size(): number {
    return this.entries.size
  }

  /** Resident source characters across all entries. */
  get charCount(): number {
    return this.chars
  }

  get hits(): number {
    return this.hitCount
  }

  get misses(): number {
    return this.missCount
  }

  clear(): void {
    this.entries.clear()
    this.chars = 0
    this.hitCount = 0
    this.missCount = 0
  }

  /** Whether the pair is currently resident, without refreshing its recency. */
  has(text: string, language: SyntaxLanguage): boolean {
    return this.entries.has(`${language}\u0000${text}`)
  }

  get(text: string, language: SyntaxLanguage): readonly SyntaxToken[] {
    const key = `${language}\u0000${text}`
    const hit = this.entries.get(key)
    if (hit !== undefined) {
      // Refresh recency: Map iteration order is the eviction order.
      this.entries.delete(key)
      this.entries.set(key, hit)
      this.hitCount += 1
      return hit.tokens
    }

    this.missCount += 1
    const tokens = this.parse(text, language)
    if (text.length > 0 && text.length <= this.maxChars && this.maxEntries > 0) {
      this.entries.set(key, { tokens, chars: text.length })
      this.chars += text.length
      this.evict()
    }
    return tokens
  }

  private evict(): void {
    while (this.entries.size > this.maxEntries || this.chars > this.maxChars) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) return
      const entry = this.entries.get(oldest)
      this.entries.delete(oldest)
      if (entry !== undefined) this.chars -= entry.chars
    }
  }
}

const defaultCache = new SyntaxCache()

/** Tokens for one document through the bounded module-level cache. */
export function cachedSyntaxTokens(
  text: string,
  language: SyntaxLanguage
): readonly SyntaxToken[] {
  return defaultCache.get(text, language)
}

/** Read-only counters of the module-level cache, used by the perf probe/gate. */
export interface SyntaxCacheStats {
  readonly size: number
  readonly charCount: number
  readonly hits: number
  readonly misses: number
}

/** Current module-level cache readings; never mutates recency or counters. */
export function syntaxCacheStats(): SyntaxCacheStats {
  return {
    size: defaultCache.size,
    charCount: defaultCache.charCount,
    hits: defaultCache.hits,
    misses: defaultCache.misses
  }
}

/** Drops every cached document; the next read parses again. */
export function clearSyntaxCache(): void {
  defaultCache.clear()
}
