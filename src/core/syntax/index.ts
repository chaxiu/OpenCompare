export {
  EXTENSION_LANGUAGES,
  SYNTAX_LANGUAGES,
  languageForPath
} from './language'
export type { SyntaxLanguage } from './language'
export { TOKENIZER_LANGUAGES, foldSyntaxText, tokenizeSyntax } from './tokenize'
export type { SyntaxToken, SyntaxTokenClass } from './tokenize'
export {
  SYNTAX_CACHE_LIMITS,
  SYNTAX_CACHE_MAX_CHARS,
  SYNTAX_CACHE_MAX_ENTRIES,
  SyntaxCache,
  cachedSyntaxTokens,
  clearSyntaxCache,
  syntaxCacheStats
} from './cache'
export type { SyntaxCacheOptions, SyntaxCacheStats, SyntaxParser } from './cache'
export { overlayLine } from './overlay'
export type { OverlaySegment } from './overlay'
export { SYNTAX_MAX_HIGHLIGHT_CHARS, resolveSyntaxView } from './view'
export type { SyntaxView } from './view'
