/**
 * Source line → change entry lookup for the structured view.
 *
 * Clicking a line of either original must select the change list row whose
 * node covers that line. Only a side's *exact* range counts: a node that is
 * absent on that side falls back to an ancestor for display, but clicking the
 * ancestor must never select the missing descendant.
 *
 * Nested changes are legal (a modified leaf inside an added or removed
 * container), so the winning entry is the one with the deepest JSON Pointer.
 *
 * Pure by construction: no DOM / React / Electron imports, Node-testable.
 */
import type { SourceRange } from './locate'

export type StructuredSide = 'left' | 'right'

export interface ChangeRangePair {
  readonly left: SourceRange
  readonly right: SourceRange
}

export type ChangeRangeMap = Readonly<Record<string, ChangeRangePair>>

/** Number of JSON Pointer segments; `/a/b` is 2, the document root is 0. */
function pointerDepth(path: string): number {
  if (path === '') return 0
  let depth = 0
  for (let index = 0; index < path.length; index += 1) {
    if (path.charCodeAt(index) === 47) depth += 1
  }
  return depth
}

/**
 * Returns the path of the deepest change whose exact range on `side` contains
 * `line` (1-based, inclusive), or `null` when no exact range covers it.
 */
export function findChangeAtLine(
  entries: readonly { readonly path: string }[],
  ranges: ChangeRangeMap,
  side: StructuredSide,
  line: number
): string | null {
  let best: string | null = null
  let bestDepth = -1
  for (const entry of entries) {
    const range = ranges[entry.path]?.[side]
    if (range === undefined || !range.exact) continue
    if (line < range.startLine || line > range.endLine) continue
    const depth = pointerDepth(entry.path)
    if (depth > bestDepth) {
      best = entry.path
      bestDepth = depth
    }
  }
  return best
}
