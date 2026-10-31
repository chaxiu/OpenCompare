/**
 * Consumer-side reading of a located range.
 *
 * `locate.ts` answers "where is this pointer, or where is the deepest ancestor
 * that exists"; the panes still need one more bit of information: is there
 * anything to show on this side at all? A side without a document root yields
 * a spanless placeholder range, so keeping that judgement here lets the view
 * consume one classified kind instead of inspecting coordinates.
 *
 * Pure by construction: no DOM / React / Electron imports, Node-testable.
 */
import type { SourceRange } from './locate'

/** What a source pane can do with a located range. */
export type SourceRangeKind =
  /** The node exists here: paint its own span and scroll to it. */
  | 'exact'
  /** The node is absent: paint the deepest existing ancestor weakly and scroll to it. */
  | 'ancestor'
  /** Nothing matched here (no document root): do not paint, do not scroll. */
  | 'none'

/** Three-way classification of one side's located range. */
export function classifySourceRange(range: SourceRange): SourceRangeKind {
  // A spanless range is the placeholder of a side without a document root; it
  // stays unusable even when it is reported at the root pointer.
  if (range.hasSpan === false) return 'none'
  return range.exact ? 'exact' : 'ancestor'
}
