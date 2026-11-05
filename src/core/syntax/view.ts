import { cachedSyntaxTokens } from './cache'
import { languageForPath } from './language'
import type { SyntaxLanguage } from './language'
import { foldSyntaxText } from './tokenize'
import type { SyntaxToken } from './tokenize'

/**
 * Everything the two-column renderer needs to tint one side of a comparison.
 * `tokens` use whole-document offsets into `foldedText`; `lineStarts[index]` is
 * the offset of 0-based line `index` in that same folded document.
 */
export interface SyntaxView {
  readonly language: SyntaxLanguage
  readonly tokens: readonly SyntaxToken[]
  readonly lineStarts: readonly number[]
}

/**
 * Large-file threshold in folded (CRLF → LF) document characters.
 *
 * Chosen from the ladder measured by `pnpm measure:syntax` (see
 * `docs/evidence/syntax-perf.md`): the largest tier whose cold median stayed
 * under 150 ms, clamped to `SYNTAX_CACHE_MAX_CHARS` so a highlighted document
 * can always be retained by the bounded cache. `length <= threshold` colours,
 * `length > threshold` falls back to plain text before the cache/tokenizer.
 */
export const SYNTAX_MAX_HIGHLIGHT_CHARS = 262_144

/** A `\r` that is not part of a CRLF pair cannot share the folded line map. */
const LONE_CR = /\r(?!\n)/

function lineStartsOf(folded: string): number[] {
  const starts = [0]
  for (let index = 0; index < folded.length; index += 1) {
    if (folded.charCodeAt(index) === 0x0a) starts.push(index + 1)
  }
  return starts
}

/**
 * The one predicate that decides whether a side is syntax-highlighted.
 *
 * It maps the explicit path extension to a language (no content sniffing),
 * folds CRLF once, and asks the bounded cache for the whole document, so the
 * caller never parses per line. `null` means "render exactly like plain text"
 * and covers an unknown extension, empty text, a lone `\r` (whose line map does
 * not match `splitLines`), an empty token result and a parser failure. Any
 * future large-file threshold belongs here, so both panes keep one entry point.
 */
export function resolveSyntaxView(
  path: string | null | undefined,
  text: string
): SyntaxView | null {
  const language = languageForPath(path)
  if (language === null) return null
  if (typeof text !== 'string' || text.length === 0) return null
  if (LONE_CR.test(text)) return null

  const folded = foldSyntaxText(text)
  if (folded.length > SYNTAX_MAX_HIGHLIGHT_CHARS) return null
  let tokens: readonly SyntaxToken[]
  try {
    tokens = cachedSyntaxTokens(folded, language)
  } catch {
    return null
  }
  if (tokens.length === 0) return null

  return { language, tokens, lineStarts: lineStartsOf(folded) }
}
