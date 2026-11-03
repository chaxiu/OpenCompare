/**
 * Pure types for the local comparison history. Zero Electron / DOM / Node
 * dependencies: both processes share this schema, so parse and validation have
 * exactly one implementation.
 */

/** The three session kinds a history entry can reopen. */
export type ComparisonHistoryKind = 'directory' | 'file' | 'merge'

/** The three compare switches captured at the moment a session is established. */
export interface ComparisonHistorySwitches {
  readonly ignoreWhitespace: boolean
  readonly ignoreNewline: boolean
  readonly ignoreEncoding: boolean
}

/**
 * One history record: identity (`id`, `kind`, ordered `paths`), the last
 * establish / reopen time, the switches and an optional stable error code. Paths
 * never appear in `id`; the identity is `kind` plus the ordered path list.
 */
export interface ComparisonHistoryEntry extends ComparisonHistorySwitches {
  readonly id: string
  readonly kind: ComparisonHistoryKind
  readonly paths: readonly string[]
  readonly createdAt: number
  /** Stable error code; absent means the last reopen succeeded (or never ran). */
  readonly error?: string
}

/** The single stored document, fixed field names `version` / `entries`. */
export interface ComparisonHistoryEnvelope {
  readonly version: typeof COMPARISON_HISTORY_VERSION
  readonly entries: readonly ComparisonHistoryEntry[]
}

/**
 * Stable codes a history row persists after a failed reopen. Paths and raw
 * platform messages are never stored, so these three codes are the whole set.
 */
export type ComparisonHistoryErrorCode = 'missing' | 'unreadable' | 'type-changed'

/** Stable reasons a stored entry cannot be turned back into reopen arguments. */
export type ComparisonHistoryReopenError =
  | 'invalid-entry'
  | 'unsupported-kind'
  | 'invalid-path-count'
  | 'empty-path'
  | 'relative-path'

/** What a caller needs to rebuild a session, or a stable error code. */
export type ComparisonHistoryReopenResult =
  | {
      readonly ok: true
      readonly kind: ComparisonHistoryKind
      readonly paths: readonly string[]
      readonly switches: ComparisonHistorySwitches
    }
  | { readonly ok: false; readonly error: ComparisonHistoryReopenError }

/** Most recent records kept; ordered by `createdAt` descending. */
export const COMPARISON_HISTORY_LIMIT = 20

/** Envelope schema version; any other value reads as an empty list. */
export const COMPARISON_HISTORY_VERSION = 1

/** The single localStorage key the web runtime keeps its history under. */
export const COMPARISON_HISTORY_STORAGE_KEY = 'opencompare.comparisonHistory'
