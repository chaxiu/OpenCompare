import {
  COMPARISON_HISTORY_LIMIT,
  COMPARISON_HISTORY_VERSION
} from './types'
import type {
  ComparisonHistoryEntry,
  ComparisonHistoryEnvelope,
  ComparisonHistoryErrorCode,
  ComparisonHistoryKind,
  ComparisonHistoryReopenResult,
  ComparisonHistorySwitches
} from './types'

/** Ordered path count every kind must carry. */
const PATH_COUNT: Readonly<Record<ComparisonHistoryKind, number>> = {
  directory: 2,
  file: 2,
  merge: 3
}

type MutableEntry = { -readonly [K in keyof ComparisonHistoryEntry]: ComparisonHistoryEntry[K] }

/** Narrows a persisted error string to the only three codes the app writes. */
export function isComparisonHistoryErrorCode(
  value: unknown
): value is ComparisonHistoryErrorCode {
  return value === 'missing' || value === 'unreadable' || value === 'type-changed'
}

/** Narrows an unknown value to a supported kind. */
export function isComparisonHistoryKind(value: unknown): value is ComparisonHistoryKind {
  return value === 'directory' || value === 'file' || value === 'merge'
}

/**
 * Reports whether a path is absolute without importing a runtime `path` module:
 * a POSIX root, a Windows drive (`C:\` / `C:/`) or a UNC share.
 */
export function isAbsoluteHistoryPath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false
  return (
    value.startsWith('/') ||
    value.startsWith('\\\\') ||
    /^[A-Za-z]:[\\/]/.test(value)
  )
}

function fnv1a(text: string, seed: number): number {
  let hash = seed >>> 0
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/**
 * Deterministic opaque identity for `kind` + ordered paths. Two salted FNV-1a
 * passes give a 16-hex id that never contains a path fragment and needs no
 * dependency, so it runs synchronously in Node and jsdom.
 */
export function comparisonHistoryId(
  kind: ComparisonHistoryKind,
  paths: readonly string[]
): string {
  const identity = [kind, ...paths].join('\u0000')
  const high = fnv1a(identity, 0x811c9dc5).toString(16).padStart(8, '0')
  const low = fnv1a(identity, 0x9e3779b9).toString(16).padStart(8, '0')
  return `${high}${low}`
}

function switchesOf(entry: ComparisonHistorySwitches): ComparisonHistorySwitches {
  return {
    ignoreWhitespace: entry.ignoreWhitespace,
    ignoreNewline: entry.ignoreNewline,
    ignoreEncoding: entry.ignoreEncoding
  }
}

function sameIdentity(left: ComparisonHistoryEntry, right: ComparisonHistoryEntry): boolean {
  if (left.kind !== right.kind) return false
  if (left.paths.length !== right.paths.length) return false
  return left.paths.every((path, index) => path === right.paths[index])
}

/** Validates one stored entry; any field mismatch rejects the whole entry. */
function parseEntry(value: unknown): ComparisonHistoryEntry | null {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const record = value as Record<string, unknown>
    if (typeof record.id !== 'string' || record.id.length === 0) return null
    if (!isComparisonHistoryKind(record.kind)) return null
    if (!Array.isArray(record.paths)) return null
    const paths = record.paths
    if (paths.length !== PATH_COUNT[record.kind]) return null
    if (!paths.every((path) => typeof path === 'string' && path.length > 0)) return null
    if (!paths.every(isAbsoluteHistoryPath)) return null
    if (typeof record.createdAt !== 'number' || !Number.isFinite(record.createdAt)) return null
    if (
      typeof record.ignoreWhitespace !== 'boolean' ||
      typeof record.ignoreNewline !== 'boolean' ||
      typeof record.ignoreEncoding !== 'boolean'
    ) {
      return null
    }
    if (record.error !== undefined && typeof record.error !== 'string') return null
    const entry: MutableEntry = {
      id: record.id,
      kind: record.kind,
      paths: [...paths],
      createdAt: record.createdAt,
      ignoreWhitespace: record.ignoreWhitespace,
      ignoreNewline: record.ignoreNewline,
      ignoreEncoding: record.ignoreEncoding
    }
    if (record.error !== undefined) entry.error = record.error
    return entry
  } catch {
    return null
  }
}

/** Validates a bare entries array (the IPC write payload); `null` when invalid. */
export function parseComparisonHistoryEntries(
  value: unknown
): ComparisonHistoryEntry[] | null {
  try {
    if (!Array.isArray(value)) return null
    const entries: ComparisonHistoryEntry[] = []
    for (const item of value) {
      const entry = parseEntry(item)
      if (entry === null) return null
      entries.push(entry)
    }
    return entries
  } catch {
    return null
  }
}

/**
 * Parses any decoded envelope. A missing / corrupt / version-mismatched document
 * returns `[]` as a whole; there is no partial repair and nothing throws.
 */
export function parseComparisonHistory(value: unknown): ComparisonHistoryEntry[] {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return []
    const record = value as Record<string, unknown>
    if (record.version !== COMPARISON_HISTORY_VERSION) return []
    return parseComparisonHistoryEntries(record.entries) ?? []
  } catch {
    return []
  }
}

/** Same contract as {@link parseComparisonHistory}, from raw stored text. */
export function parseComparisonHistoryJson(text: string): ComparisonHistoryEntry[] {
  try {
    return parseComparisonHistory(JSON.parse(text))
  } catch {
    return []
  }
}

/** Builds the stored document; field names are fixed for later UI readers. */
export function serializeComparisonHistory(
  entries: readonly ComparisonHistoryEntry[]
): ComparisonHistoryEnvelope {
  return {
    version: COMPARISON_HISTORY_VERSION,
    entries: entries.map((entry) => {
      const base: MutableEntry = {
        id: entry.id,
        kind: entry.kind,
        paths: [...entry.paths],
        createdAt: entry.createdAt,
        ...switchesOf(entry)
      }
      if (entry.error !== undefined) base.error = entry.error
      return base
    })
  }
}

/** Stable order: newest first, same millisecond broken by ascending id. */
export function sortComparisonHistory(
  entries: readonly ComparisonHistoryEntry[]
): ComparisonHistoryEntry[] {
  return [...entries].sort((left, right) => {
    if (right.createdAt !== left.createdAt) return right.createdAt - left.createdAt
    if (left.id === right.id) return 0
    return left.id < right.id ? -1 : 1
  })
}

/** Newest-first order trimmed to {@link COMPARISON_HISTORY_LIMIT}. */
export function trimComparisonHistory(
  entries: readonly ComparisonHistoryEntry[]
): ComparisonHistoryEntry[] {
  return sortComparisonHistory(entries).slice(0, COMPARISON_HISTORY_LIMIT)
}

/** Candidate fields an establish / reopen write provides; `id` is derived. */
export interface ComparisonHistoryCandidate extends ComparisonHistorySwitches {
  readonly kind: ComparisonHistoryKind
  readonly paths: readonly string[]
  readonly createdAt: number
  readonly error?: string
}

/** Builds a full entry (including the opaque id) from a candidate. */
export function createComparisonHistoryEntry(
  candidate: ComparisonHistoryCandidate
): ComparisonHistoryEntry {
  const entry: MutableEntry = {
    id: comparisonHistoryId(candidate.kind, candidate.paths),
    kind: candidate.kind,
    paths: [...candidate.paths],
    createdAt: candidate.createdAt,
    ...switchesOf(candidate)
  }
  if (candidate.error !== undefined) entry.error = candidate.error
  return entry
}

/**
 * Dedupe + upsert: same `kind` + ordered paths keeps the existing id, refreshes
 * `createdAt` and the switches, moves the record to the front and trims to 20.
 */
export function upsertComparisonHistory(
  entries: readonly ComparisonHistoryEntry[],
  candidate: ComparisonHistoryCandidate
): ComparisonHistoryEntry[] {
  const next = createComparisonHistoryEntry(candidate)
  const rest = entries.filter((entry) => !sameIdentity(entry, next))
  return trimComparisonHistory([next, ...rest])
}

/** Removes exactly one record; every other record keeps its content and order. */
export function removeComparisonHistoryEntry(
  entries: readonly ComparisonHistoryEntry[],
  id: string
): ComparisonHistoryEntry[] {
  return entries.filter((entry) => entry.id !== id)
}

/** Explicit clear: an empty list that serializes to `{ version: 1, entries: [] }`. */
export function clearComparisonHistory(): ComparisonHistoryEntry[] {
  return []
}

/** Sets or clears (`null`) the stable error code of one record. */
export function markComparisonHistoryError(
  entries: readonly ComparisonHistoryEntry[],
  id: string,
  code: string | null
): ComparisonHistoryEntry[] {
  return entries.map((entry) => {
    if (entry.id !== id) return entry
    const next: MutableEntry = { ...entry }
    if (code === null) delete next.error
    else next.error = code
    return next
  })
}

/**
 * Turns a stored entry into reopen arguments. Invalid path counts, empty paths,
 * relative paths and unknown kinds answer a stable code instead of throwing.
 */
export function resolveComparisonHistoryReopen(entry: unknown): ComparisonHistoryReopenResult {
  try {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return { ok: false, error: 'invalid-entry' }
    }
    const record = entry as Record<string, unknown>
    if (!isComparisonHistoryKind(record.kind)) {
      return { ok: false, error: 'unsupported-kind' }
    }
    if (!Array.isArray(record.paths) || record.paths.length !== PATH_COUNT[record.kind]) {
      return { ok: false, error: 'invalid-path-count' }
    }
    if (!record.paths.every((path) => typeof path === 'string' && path.length > 0)) {
      return { ok: false, error: 'empty-path' }
    }
    if (!record.paths.every(isAbsoluteHistoryPath)) {
      return { ok: false, error: 'relative-path' }
    }
    if (
      typeof record.ignoreWhitespace !== 'boolean' ||
      typeof record.ignoreNewline !== 'boolean' ||
      typeof record.ignoreEncoding !== 'boolean'
    ) {
      return { ok: false, error: 'invalid-entry' }
    }
    return {
      ok: true,
      kind: record.kind,
      paths: [...record.paths],
      switches: {
        ignoreWhitespace: record.ignoreWhitespace,
        ignoreNewline: record.ignoreNewline,
        ignoreEncoding: record.ignoreEncoding
      }
    }
  } catch {
    return { ok: false, error: 'invalid-entry' }
  }
}
