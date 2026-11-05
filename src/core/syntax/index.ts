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
  clearSyntaxCache
} from './cache'
export type { SyntaxCacheOptions, SyntaxParser } from './cache'
export { overlayLine } from './overlay'
export type { OverlaySegment } from './overlay'
