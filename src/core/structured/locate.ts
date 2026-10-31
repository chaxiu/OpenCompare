/**
 * JSON Pointer → source range mapping for one side of a structured comparison.
 *
 * The diff engine only knows normalized values, so it can say *what* changed at
 * `/service/features/0/name` but not where that node lives in the original
 * text. This module keeps the parsed syntax tree of one side (comments,
 * indentation and quote style intact) and walks it segment by segment.
 *
 * A locator is built once per side and reused: the text is parsed once, line
 * starts are cached, and every `locate` call is a cheap pointer walk. A pointer
 * that the side does not have (single-side added / removed nodes, out-of-range
 * array indexes, type mismatches) falls back to the deepest existing ancestor
 * and reports `exact: false`.
 */
import { parseTree, printParseErrorCode } from 'jsonc-parser'
import type { Node as JsonNode, ParseError } from 'jsonc-parser'
import { isMap, isNode, isScalar, isSeq, parseDocument } from 'yaml'
import type { Node as YamlNode } from 'yaml'
import { StructuredParseError } from './parse'
import type { StructuredFormat } from './parse'

export interface SourceRange {
  readonly startLine: number // 1-based
  readonly startColumn: number // 1-based, counted in UTF-16 code units
  readonly endLine: number // 1-based, inclusive of the last character
  readonly endColumn: number
  readonly path: string // actually matched path; equals the request when exact
  readonly exact: boolean // false = node absent on this side, fell back to an ancestor
}

export interface StructuredLocator {
  locate(path: string): SourceRange
}

/** Half-open `[start, end)` character span in the source text. */
interface Span {
  readonly start: number
  readonly end: number
}

interface WalkResult {
  readonly span: Span | null
  readonly path: string
  readonly exact: boolean
}

/** Array segments are decimal indexes only; `02`, `-1` or `x` never match. */
const INDEX_SEGMENT = /^(0|[1-9][0-9]*)$/

const JSON_OPTIONS = { allowTrailingComma: true, disallowComments: false } as const

function createLineStarts(text: string): number[] {
  const starts = [0]
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) starts.push(index + 1)
  }
  return starts
}

/** Binary search of the line containing `offset`; both results are 1-based. */
function positionOf(lineStarts: readonly number[], offset: number): { line: number; column: number } {
  let low = 0
  let high = lineStarts.length - 1
  while (low < high) {
    const middle = (low + high + 1) >> 1
    if (lineStarts[middle] <= offset) low = middle
    else high = middle - 1
  }
  return { line: low + 1, column: offset - lineStarts[low] + 1 }
}

/** Trailing blank lines / indentation are not part of a value's range. */
function trimTrailingSpace(text: string, span: Span): Span {
  let end = span.end
  while (end > span.start) {
    const code = text.charCodeAt(end - 1)
    if (code !== 32 && code !== 9 && code !== 10 && code !== 13) break
    end -= 1
  }
  return end === span.end ? span : { start: span.start, end }
}

function toSourceRange(
  lineStarts: readonly number[],
  span: Span | null,
  path: string,
  exact: boolean
): SourceRange {
  const start = positionOf(lineStarts, span ? span.start : 0)
  const lastOffset = span && span.end > span.start ? span.end - 1 : span ? span.start : 0
  const end = positionOf(lineStarts, lastOffset)
  return {
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column,
    path,
    exact
  }
}

/** RFC 6901 segment unescape: `~1` first, then `~0`. */
function unescapeSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~')
}

/** Inverse of `unescapeSegment`, matching `diff.ts`'s pointer encoding. */
function escapeSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1')
}

/** Splits a pointer into raw segments; `null` means the pointer is malformed. */
function parsePointer(path: string): string[] | null {
  if (path === '') return []
  if (!path.startsWith('/')) return null
  return path.slice(1).split('/').map(unescapeSegment)
}

function jsonSpanOf(node: JsonNode): Span {
  return { start: node.offset, end: node.offset + node.length }
}

function jsonChildOf(node: JsonNode, segment: string): JsonNode | undefined {
  if (node.type === 'object') {
    let found: JsonNode | undefined
    for (const property of node.children ?? []) {
      const key = property.children?.[0]
      const value = property.children?.[1]
      // Duplicate keys resolve to the last occurrence, mirroring JSON.parse.
      if (key && value && key.value === segment) found = value
    }
    return found
  }
  if (node.type === 'array') {
    if (!INDEX_SEGMENT.test(segment)) return undefined
    return node.children?.[Number(segment)]
  }
  return undefined
}

function yamlSpanOf(text: string, node: YamlNode): Span | null {
  const range = node.range
  if (!range) return null
  return trimTrailingSpace(text, { start: range[0], end: range[1] })
}

function yamlChildOf(node: YamlNode, segment: string): YamlNode | undefined {
  if (isMap(node)) {
    let found: YamlNode | undefined
    for (const pair of node.items) {
      const key = pair.key
      if (isScalar(key) && String(key.value) === segment && isNode(pair.value)) found = pair.value
    }
    return found
  }
  if (isSeq(node)) {
    if (!INDEX_SEGMENT.test(segment)) return undefined
    const item = node.items[Number(segment)]
    return isNode(item) ? item : undefined
  }
  return undefined
}

/**
 * Walks the tree as far as the pointer goes. `depth` is the number of segments
 * that matched, so the last matched node is always the fallback ancestor.
 */
function descend<T>(
  root: T | undefined,
  segments: readonly string[],
  childOf: (node: T, segment: string) => T | undefined,
  spanOf: (node: T) => Span | null
): WalkResult {
  let current = root
  let depth = 0
  if (current !== undefined) {
    while (depth < segments.length) {
      const child = childOf(current, segments[depth])
      if (child === undefined) break
      current = child
      depth += 1
    }
  }
  const path = depth === 0 ? '' : `/${segments.slice(0, depth).map(escapeSegment).join('/')}`
  return {
    span: current === undefined ? null : spanOf(current),
    path,
    exact: depth === segments.length
  }
}

/** Mirrors `parse.ts`'s error position wording without re-parsing the text. */
function describeOffset(text: string, offset: number): string {
  const before = text.slice(0, offset)
  const line = before.split('\n').length
  const column = offset - (before.lastIndexOf('\n') + 1) + 1
  return `line ${line}, column ${column}`
}

/**
 * Parses one side once and returns a reusable locator over that exact text.
 * Parse tolerance matches `parseStructured`: JSONC comments / trailing commas,
 * YAML single document with library defaults.
 */
export function createStructuredLocator(text: string, format: StructuredFormat): StructuredLocator {
  const label = format === 'json' ? 'JSON' : 'YAML'
  if (text.trim().length === 0) {
    throw new StructuredParseError(`${label}: cannot compare an empty document`)
  }
  const lineStarts = createLineStarts(text)

  if (format === 'json') {
    const errors: ParseError[] = []
    const root = parseTree(text, errors, JSON_OPTIONS)
    const first = errors[0]
    if (first) {
      throw new StructuredParseError(
        `JSON parse error at ${describeOffset(text, first.offset)}: ${printParseErrorCode(first.error)}`
      )
    }
    return {
      locate(path: string): SourceRange {
        const segments = parsePointer(path)
        if (segments === null) {
          return toSourceRange(lineStarts, root ? jsonSpanOf(root) : null, '', false)
        }
        const hit = descend(root, segments, jsonChildOf, jsonSpanOf)
        return toSourceRange(lineStarts, hit.span, hit.path, hit.exact)
      }
    }
  }

  const document = parseDocument(text)
  const firstError = document.errors[0]
  if (firstError) {
    throw new StructuredParseError(`YAML parse error: ${firstError.message}`)
  }
  const root = document.contents ?? undefined
  const spanOf = (node: YamlNode): Span | null => yamlSpanOf(text, node)
  return {
    locate(path: string): SourceRange {
      const segments = parsePointer(path)
      if (segments === null) {
        return toSourceRange(lineStarts, root ? spanOf(root) : null, '', false)
      }
      const hit = descend(root, segments, yamlChildOf, spanOf)
      return toSourceRange(lineStarts, hit.span, hit.path, hit.exact)
    }
  }
}

/** One-shot convenience wrapper; build a locator when locating many paths. */
export function locateStructuredPath(
  text: string,
  format: StructuredFormat,
  path: string
): SourceRange {
  return createStructuredLocator(text, format).locate(path)
}
