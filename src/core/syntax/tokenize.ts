import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import type { LanguageFn } from 'highlight.js'
import { createLowlight } from 'lowlight'
import { SYNTAX_LANGUAGES } from './language'
import type { SyntaxLanguage } from './language'

/** The four foreground semantics V1 can paint. Everything else stays plain. */
export type SyntaxTokenClass = 'keyword' | 'string' | 'number' | 'comment'

/**
 * One highlighted run, using whole-document character offsets. Ranges are
 * ascending, non-overlapping and `0 <= start < end <= foldedText.length`.
 */
export interface SyntaxToken {
  readonly start: number
  readonly end: number
  readonly class: SyntaxTokenClass
}

/**
 * Explicit per-language registration. Ordering is alphabetical and matches
 * `SYNTAX_LANGUAGES`; no `common` bundle and no auto detection is involved.
 */
const GRAMMARS = {
  bash,
  css,
  javascript,
  json,
  markdown,
  python,
  typescript,
  xml,
  yaml
} satisfies Record<SyntaxLanguage, LanguageFn>

/** Grammar ids actually registered by the tokenizer (parity-checked against the map). */
export const TOKENIZER_LANGUAGES: readonly SyntaxLanguage[] = Object.freeze(
  SYNTAX_LANGUAGES.filter((language) => language in GRAMMARS)
)

const lowlight = createLowlight(GRAMMARS)

/** highlight.js scopes that map onto the four V1 foreground classes. */
const HLJS_CLASS: Readonly<Record<string, SyntaxTokenClass>> = Object.freeze({
  keyword: 'keyword',
  literal: 'keyword',
  built_in: 'keyword',
  type: 'keyword',
  string: 'string',
  attr: 'string',
  regexp: 'string',
  number: 'number',
  comment: 'comment'
})

interface HighlightNode {
  readonly type: string
  readonly value?: string
  readonly properties?: { readonly className?: readonly unknown[] }
  readonly children?: readonly HighlightNode[]
}

function classOf(node: HighlightNode): SyntaxTokenClass | null {
  const names = node.properties?.className
  if (!Array.isArray(names)) return null
  for (const name of names) {
    if (typeof name !== 'string') continue
    const semantic = HLJS_CLASS[name.replace(/^hljs-/, '')]
    if (semantic !== undefined) return semantic
  }
  return null
}

/**
 * Fold CRLF to LF before parsing so the same file in either line-ending style
 * produces identical token ranges. Callers map lines with `splitLines`, which
 * applies the same folding, so a line start offset is directly usable here.
 */
export function foldSyntaxText(text: string): string {
  return text.replace(/\r\n/g, '\n')
}

/**
 * Parse the whole document once and return four-class foreground ranges over
 * the folded text. Block comments and multi-line strings therefore keep their
 * state across lines; an empty text or a `null` language yields no tokens.
 */
export function tokenizeSyntax(
  text: string,
  language: SyntaxLanguage | null
): readonly SyntaxToken[] {
  if (typeof text !== 'string' || text.length === 0 || language === null) return []

  const folded = foldSyntaxText(text)
  const tree = lowlight.highlight(language, folded) as unknown as HighlightNode
  const tokens: SyntaxToken[] = []
  let offset = 0

  const visit = (node: HighlightNode, inherited: SyntaxTokenClass | null): void => {
    if (node.type === 'text') {
      const value = node.value ?? ''
      const start = offset
      offset += value.length
      if (inherited !== null && value.length > 0) {
        const last = tokens[tokens.length - 1]
        if (last !== undefined && last.end === start && last.class === inherited) {
          tokens[tokens.length - 1] = { start: last.start, end: offset, class: inherited }
        } else {
          tokens.push({ start, end: offset, class: inherited })
        }
      }
      return
    }

    const semantic = classOf(node)
    const scope = semantic ?? inherited
    for (const child of node.children ?? []) visit(child, scope)
  }

  visit(tree, null)
  return tokens
}
