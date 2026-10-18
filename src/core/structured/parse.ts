/**
 * Parsing layer of the JSON / YAML semantic comparison.
 *
 * Parsing *is* the normalization step here: a parsed value tree has already
 * dropped object key order, comments, indentation, blank lines, trailing
 * commas and quote style. The diff engine therefore only ever sees plain
 * values and never needs to know about formatting.
 */
import { parse as parseJsonc, printParseErrorCode } from 'jsonc-parser'
import type { ParseError } from 'jsonc-parser'
import { parse as parseYaml } from 'yaml'

export type StructuredFormat = 'json' | 'yaml'

/** Raised when one side cannot be parsed; the view renders it as an error state. */
export class StructuredParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StructuredParseError'
  }
}

/** Human-readable offset of a parse error inside the source text. */
function locate(text: string, offset: number): string {
  const before = text.slice(0, offset)
  const line = before.split('\n').length
  const column = offset - (before.lastIndexOf('\n') + 1) + 1
  return `line ${line}, column ${column}`
}

/**
 * Parses one side into a plain value tree.
 *
 * JSON accepts comments and trailing commas (JSONC tolerance); YAML uses the
 * `yaml` library defaults — no anchor/alias/merge-key post-processing.
 */
export function parseStructured(text: string, format: StructuredFormat): unknown {
  const label = format === 'json' ? 'JSON' : 'YAML'
  if (text.trim().length === 0) {
    throw new StructuredParseError(`${label}: cannot compare an empty document`)
  }

  if (format === 'json') {
    const errors: ParseError[] = []
    const value: unknown = parseJsonc(text, errors, {
      allowTrailingComma: true,
      disallowComments: false
    })
    const first = errors[0]
    if (first) {
      throw new StructuredParseError(
        `JSON parse error at ${locate(text, first.offset)}: ${printParseErrorCode(first.error)}`
      )
    }
    return value
  }

  try {
    return parseYaml(text)
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    throw new StructuredParseError(`YAML parse error: ${detail}`)
  }
}
