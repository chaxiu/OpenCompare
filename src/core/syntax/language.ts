/**
 * Explicit file-extension to language map for the V1 syntax-highlighting
 * closed loop. Detection reads the file name only; content sniffing and
 * `highlightAuto` are intentionally absent, so an unknown extension always
 * falls back to the existing plain-text path.
 */

/** Languages the V1 tokenizer can highlight synchronously. */
export type SyntaxLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'json'
  | 'yaml'
  | 'markdown'
  | 'css'
  | 'xml'
  | 'bash'

/**
 * Extension (lowercase, no dot) to language id. Every value must have a
 * grammar registered in `./tokenize`, and the tokenizer registers nothing
 * beyond these ids — no `common` bundle.
 */
export const EXTENSION_LANGUAGES: Readonly<Record<string, SyntaxLanguage>> = Object.freeze({
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  json: 'json',
  jsonc: 'json',
  yml: 'yaml',
  yaml: 'yaml',
  md: 'markdown',
  css: 'css',
  html: 'xml',
  htm: 'xml',
  xml: 'xml',
  sh: 'bash',
  bash: 'bash'
})

/** The unique language ids used by the extension map, sorted for stable parity checks. */
export const SYNTAX_LANGUAGES: readonly SyntaxLanguage[] = Object.freeze(
  [...new Set(Object.values(EXTENSION_LANGUAGES))].sort()
)

const TRAILING_SEGMENT = /[^/\\]*$/
const EXTENSION = /\.([^./\\]+)$/

/**
 * Language for a complete path or bare file name, or `null` when there is no
 * usable extension. The comparison is case-insensitive and only looks at the
 * last path segment / last dot.
 */
export function languageForPath(path: string | null | undefined): SyntaxLanguage | null {
  if (typeof path !== 'string' || path.length === 0) return null
  const name = TRAILING_SEGMENT.exec(path)?.[0] ?? ''
  if (name.length === 0) return null
  const match = EXTENSION.exec(name)
  if (match === null) return null
  return EXTENSION_LANGUAGES[match[1].toLowerCase()] ?? null
}
