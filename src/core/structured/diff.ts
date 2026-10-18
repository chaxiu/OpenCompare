/**
 * JSON / YAML semantic normalization diff.
 *
 * Both sides are parsed into plain values, so object key order, comments,
 * indentation, trailing commas and quote style cannot survive into the
 * comparison. Nodes are keyed by JSON Pointer path, objects are compared by
 * key set, arrays by index. The result is a flat, deterministic change list
 * plus runtime counts over the very same list.
 *
 * Rules:
 * - an added / removed container is one entry (its descendants are not expanded);
 * - `modified` and `typeChanged` only ever appear on a leaf node;
 * - type changes (number ↔ string, object ↔ array, container ↔ scalar) are a
 *   status of their own, never folded into `modified`.
 */
import { StructuredParseError, parseStructured } from './parse'
import type { StructuredFormat } from './parse'

export type StructuredStatus = 'added' | 'removed' | 'modified' | 'typeChanged' | 'same'

/** Status vocabulary in display order; `same` is the resting state. */
export const STRUCTURED_STATUSES: readonly StructuredStatus[] = [
  'added',
  'removed',
  'modified',
  'typeChanged',
  'same'
]

export type StructuredValueType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'

/** One node of the comparison, addressed by its JSON Pointer path. */
export interface StructuredChange {
  /** JSON Pointer (`/a/b/0`); the empty string is the document root. */
  readonly path: string
  readonly status: StructuredStatus
  /** Display form of the left value; absent when the node is right-only. */
  readonly left?: string
  /** Display form of the right value; absent when the node is left-only. */
  readonly right?: string
  readonly leftType?: StructuredValueType
  readonly rightType?: StructuredValueType
}

export interface StructuredDiffResult {
  readonly entries: readonly StructuredChange[]
  readonly counts: Readonly<Record<StructuredStatus, number>>
}

export type StructuredFilter = 'all' | StructuredStatus

/**
 * Normalized value kind used to tell a type change from a value edit.
 * `undefined` (an absent JSONC value) reads as `null`.
 */
function valueTypeOf(value: unknown): StructuredValueType {
  if (value === null || value === undefined) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'object'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  return 'string'
}

/** Renders a normalized value for the change list (`"text"`, `12`, `[2 项]`). */
function renderValue(value: unknown): string {
  switch (valueTypeOf(value)) {
    case 'null':
      return 'null'
    case 'string':
      return JSON.stringify(value)
    case 'number':
    case 'boolean':
      return String(value)
    case 'array':
      return `[${(value as readonly unknown[]).length} 项]`
    case 'object':
      return `{${Object.keys(value as Record<string, unknown>).length} 个键}`
  }
}

/** Escapes one JSON Pointer segment (`~` → `~0`, `/` → `~1`). */
function escapeSegment(key: string): string {
  return key.replace(/~/g, '~0').replace(/\//g, '~1')
}

function hasKey(object: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key)
}

/**
 * Recursively compares both trees, appending one entry per compared node.
 * Objects walk the sorted union of their keys, which makes the output
 * independent of the input key order.
 */
function walk(left: unknown, right: unknown, pointer: string, entries: StructuredChange[]): void {
  const leftType = valueTypeOf(left)
  const rightType = valueTypeOf(right)

  if (leftType === 'object' && rightType === 'object') {
    const leftObject = left as Record<string, unknown>
    const rightObject = right as Record<string, unknown>
    const keys = new Set([...Object.keys(leftObject), ...Object.keys(rightObject)])
    for (const key of [...keys].sort()) {
      const childPointer = `${pointer}/${escapeSegment(key)}`
      const inLeft = hasKey(leftObject, key)
      const inRight = hasKey(rightObject, key)
      if (inLeft && inRight) {
        walk(leftObject[key], rightObject[key], childPointer, entries)
      } else if (inLeft) {
        entries.push({
          path: childPointer,
          status: 'removed',
          left: renderValue(leftObject[key]),
          leftType: valueTypeOf(leftObject[key])
        })
      } else {
        entries.push({
          path: childPointer,
          status: 'added',
          right: renderValue(rightObject[key]),
          rightType: valueTypeOf(rightObject[key])
        })
      }
    }
    return
  }

  if (leftType === 'array' && rightType === 'array') {
    const leftItems = left as readonly unknown[]
    const rightItems = right as readonly unknown[]
    const length = Math.max(leftItems.length, rightItems.length)
    for (let index = 0; index < length; index += 1) {
      const childPointer = `${pointer}/${index}`
      if (index < leftItems.length && index < rightItems.length) {
        walk(leftItems[index], rightItems[index], childPointer, entries)
      } else if (index < leftItems.length) {
        entries.push({
          path: childPointer,
          status: 'removed',
          left: renderValue(leftItems[index]),
          leftType: valueTypeOf(leftItems[index])
        })
      } else {
        entries.push({
          path: childPointer,
          status: 'added',
          right: renderValue(rightItems[index]),
          rightType: valueTypeOf(rightItems[index])
        })
      }
    }
    return
  }

  if (leftType !== rightType) {
    entries.push({
      path: pointer,
      status: 'typeChanged',
      left: renderValue(left),
      right: renderValue(right),
      leftType,
      rightType
    })
    return
  }

  const status: StructuredStatus = left === right ? 'same' : 'modified'
  entries.push({
    path: pointer,
    status,
    left: renderValue(left),
    right: renderValue(right),
    leftType,
    rightType
  })
}

function countStatuses(entries: readonly StructuredChange[]): Record<StructuredStatus, number> {
  const counts: Record<StructuredStatus, number> = {
    added: 0,
    removed: 0,
    modified: 0,
    typeChanged: 0,
    same: 0
  }
  for (const entry of entries) counts[entry.status] += 1
  return counts
}

function parseSide(text: string, format: StructuredFormat, side: 'left' | 'right'): unknown {
  try {
    return parseStructured(text, format)
  } catch (cause) {
    if (cause instanceof StructuredParseError) {
      throw new StructuredParseError(`${side} side: ${cause.message}`)
    }
    throw cause
  }
}

/** Parses both sides and compares them node by node. */
export function diffStructured(
  leftText: string,
  rightText: string,
  format: StructuredFormat
): StructuredDiffResult {
  const left = parseSide(leftText, format, 'left')
  const right = parseSide(rightText, format, 'right')
  const entries: StructuredChange[] = []
  walk(left, right, '', entries)
  return { entries, counts: countStatuses(entries) }
}

/** Narrows the change list to one status; counts stay those of the full result. */
export function filterStructuredChanges(
  entries: readonly StructuredChange[],
  filter: StructuredFilter
): readonly StructuredChange[] {
  if (filter === 'all') return entries
  return entries.filter((entry) => entry.status === filter)
}
