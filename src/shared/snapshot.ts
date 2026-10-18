/**
 * Wire model of the `.ocsnap.json` snapshot protocol.
 *
 * Shared by the core protocol engine, the built-in fixtures and (later) the
 * renderer, so every layer agrees on the version tag and the entry shape. Only
 * root-relative POSIX file paths are stored: directories are implied by the
 * paths of the entries below them.
 */

/** Fixed protocol identifier; a document with another tag is rejected. */
export const SNAPSHOT_SCHEMA = 'opencompare.snapshot/v1'

export type SnapshotSchema = typeof SNAPSHOT_SCHEMA

/** One file of a snapshot. `content` is present only when it was inlined. */
export interface SnapshotEntry {
  /** Root-relative POSIX path, e.g. `src/core/engine.ts`. */
  readonly path: string
  /** Byte size the file had when the snapshot was captured. */
  readonly size: number
  /** Modification time in epoch milliseconds. */
  readonly modifiedMs: number
  /** Lowercase hex SHA-256 of the UTF-8 text content. */
  readonly sha256: string
  /** Inline body, for offline drilldown; omitted for metadata-only exports. */
  readonly content?: string
}

/** A complete snapshot document, i.e. the payload of one `.ocsnap.json` file. */
export interface SnapshotDocument {
  readonly schema: SnapshotSchema
  /** Display name of the captured root; survives export and import. */
  readonly name: string
  /** ISO-8601 capture time. */
  readonly exportedAt: string
  readonly entries: readonly SnapshotEntry[]
}
