/**
 * `.ocsnap.json` protocol engine (pure, zero Electron / DOM).
 *
 * A snapshot captures the file metadata of one tree (relative POSIX path, byte
 * size, modification time and SHA-256 digest) plus, optionally, the inline text
 * body of each file. This module serializes and validates that wire format,
 * builds a snapshot from an already scanned tree, maps a snapshot back into a
 * {@link ScannedTree} so the regular comparison engine can consume it, and
 * resolves inline content for drilldown.
 *
 * Digests always come from {@link sha256Hex}, the same synchronous
 * implementation the directory comparison engine uses, so a snapshot built
 * from one side of a comparison classifies against the other side exactly like
 * two real trees would.
 */
import { SNAPSHOT_SCHEMA } from '@shared/snapshot'
import type { SnapshotDocument, SnapshotEntry } from '@shared/snapshot'
import { mapWithLimit, toReadableIoError } from '../io'
import type { ConcurrencyOptions } from '../io'
import type {
  ComparisonCache,
  DirectoryComparison,
  ListDirectory,
  ReadTextFile,
  ScannedNode,
  ScannedTree
} from './compare'
import { compareScannedTrees, planContentReads, scanDirectory } from './compare'
import { sha256Hex } from './hash'

/* ------------------------------------------------------------------ */
/* Validation / serialization                                          */
/* ------------------------------------------------------------------ */

export type SnapshotErrorCode =
  | 'invalid-json'
  | 'invalid-schema'
  | 'invalid-metadata'
  | 'invalid-entry'
  | 'invalid-path'
  | 'duplicate-path'
  | 'invalid-hash'

/** Rejected snapshot input; `code` lets callers branch on the failure kind. */
export class SnapshotFormatError extends Error {
  readonly code: SnapshotErrorCode
  /** Entry path the failure belongs to, when it is entry-scoped. */
  readonly path?: string

  constructor(code: SnapshotErrorCode, message: string, path?: string) {
    super(message)
    this.name = 'SnapshotFormatError'
    this.code = code
    this.path = path
  }
}

const HASH_PATTERN = /^[0-9a-f]{64}$/

function fail(code: SnapshotErrorCode, message: string, path?: string): never {
  throw new SnapshotFormatError(code, message, path)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/** Root-relative POSIX path with no empty, `.` or `..` segments. */
function validatePath(value: unknown): string {
  if (!isNonEmptyString(value)) {
    fail('invalid-path', 'Snapshot entry paths must be non-empty strings.')
  }
  if (value.startsWith('/') || value.includes('\\')) {
    fail('invalid-path', `Snapshot paths must be root-relative POSIX paths: "${value}".`, value)
  }
  const segments = value.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    fail('invalid-path', `Snapshot path has an empty, "." or ".." segment: "${value}".`, value)
  }
  return value
}

function validateSnapshot(value: unknown): SnapshotDocument {
  if (!isRecord(value)) {
    fail('invalid-entry', 'A snapshot must be a JSON object.')
  }
  if (value.schema !== SNAPSHOT_SCHEMA) {
    fail(
      'invalid-schema',
      `Unsupported snapshot schema "${String(value.schema)}"; expected "${SNAPSHOT_SCHEMA}".`
    )
  }

  const name = value.name
  if (!isNonEmptyString(name)) {
    fail('invalid-metadata', 'Snapshot metadata requires a non-empty "name".')
  }
  const exportedAt = value.exportedAt
  if (!isNonEmptyString(exportedAt) || Number.isNaN(Date.parse(exportedAt))) {
    fail('invalid-metadata', 'Snapshot metadata requires an ISO-8601 "exportedAt".')
  }
  if (!Array.isArray(value.entries)) {
    fail('invalid-entry', 'Snapshot "entries" must be an array.')
  }

  const seen = new Set<string>()
  const entries = value.entries.map((raw): SnapshotEntry => {
    if (!isRecord(raw)) {
      fail('invalid-entry', 'Every snapshot entry must be an object.')
    }
    const path = validatePath(raw.path)
    if (seen.has(path)) {
      fail('duplicate-path', `Duplicate snapshot path "${path}".`, path)
    }
    seen.add(path)

    const { size, modifiedMs, sha256, content } = raw
    if (typeof size !== 'number' || !Number.isInteger(size) || size < 0) {
      fail('invalid-entry', `Entry "${path}" has an invalid "size".`, path)
    }
    if (typeof modifiedMs !== 'number' || !Number.isFinite(modifiedMs) || modifiedMs < 0) {
      fail('invalid-entry', `Entry "${path}" has an invalid "modifiedMs".`, path)
    }
    if (typeof sha256 !== 'string') {
      fail('invalid-entry', `Entry "${path}" is missing a "sha256" digest.`, path)
    }
    if (!HASH_PATTERN.test(sha256)) {
      fail('invalid-hash', `Entry "${path}" has an invalid "sha256".`, path)
    }
    if (content !== undefined && typeof content !== 'string') {
      fail('invalid-entry', `Entry "${path}" has a non-string "content".`, path)
    }

    return content === undefined
      ? { path, size, modifiedMs, sha256 }
      : { path, size, modifiedMs, sha256, content }
  })

  // Directories are implied by file paths, so one entry may not sit below
  // another entry that is itself a file.
  for (const entry of entries) {
    const segments = entry.path.split('/')
    for (let depth = 1; depth < segments.length; depth += 1) {
      const ancestor = segments.slice(0, depth).join('/')
      if (seen.has(ancestor)) {
        fail(
          'invalid-path',
          `Snapshot path "${entry.path}" nests below the file "${ancestor}".`,
          entry.path
        )
      }
    }
  }

  return { schema: SNAPSHOT_SCHEMA, name, exportedAt, entries }
}

/**
 * Canonical `.ocsnap.json` text: validated document with entries sorted by
 * path, two-space indentation and a trailing newline.
 */
export function serializeSnapshot(snapshot: SnapshotDocument): string {
  const validated = validateSnapshot(snapshot)
  const entries = [...validated.entries].sort((left, right) => left.path.localeCompare(right.path))
  return `${JSON.stringify({ ...validated, entries }, null, 2)}\n`
}

/** Parses canonical snapshot text, throwing {@link SnapshotFormatError} on invalid input. */
export function parseSnapshot(text: string): SnapshotDocument {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    fail('invalid-json', 'Snapshot text is not valid JSON.')
  }
  return validateSnapshot(value)
}

/* ------------------------------------------------------------------ */
/* Building a snapshot from a scanned tree                             */
/* ------------------------------------------------------------------ */

export interface BuildSnapshotOptions {
  /** Display name of the captured root. */
  readonly name: string
  /** ISO-8601 capture time; supplied by the caller so builds stay testable. */
  readonly exportedAt: string
  readonly readTextFile: ReadTextFile
  /** Inline this file's text; defaults to inlining every file. */
  readonly inlineContent?: (relativePath: string, node: ScannedNode) => boolean
}

/**
 * Captures every file of `tree` as a snapshot entry. Directories are implied by
 * paths and never become entries themselves; bodies are read once to compute
 * the digest, and retained only where `inlineContent` accepts the file.
 */
export async function buildSnapshot(
  tree: ScannedTree,
  options: BuildSnapshotOptions
): Promise<SnapshotDocument> {
  const inlineContent = options.inlineContent ?? ((): boolean => true)
  const files = [...tree.index.entries()].filter(([, node]) => node.kind === 'file')

  const entries = await Promise.all(
    files.map(async ([relativePath, node]): Promise<SnapshotEntry> => {
      const text = await options.readTextFile(node.path)
      return {
        path: relativePath,
        size: node.size,
        modifiedMs: node.modifiedMs,
        sha256: sha256Hex(text),
        ...(inlineContent(relativePath, node) ? { content: text } : {})
      }
    })
  )

  entries.sort((left, right) => left.path.localeCompare(right.path))
  return validateSnapshot({
    schema: SNAPSHOT_SCHEMA,
    name: options.name,
    exportedAt: options.exportedAt,
    entries
  })
}

/* ------------------------------------------------------------------ */
/* Snapshot → comparison tree                                          */
/* ------------------------------------------------------------------ */

interface PendingNode {
  readonly name: string
  readonly path: string
  readonly kind: 'file' | 'directory'
  readonly size: number
  readonly modifiedMs: number
  readonly children: PendingNode[]
}

/**
 * Maps a snapshot to the tree shape the comparison engine consumes, mounted at
 * `mountPath`. Entries become files under an implied directory hierarchy, and
 * the returned index is keyed by root-relative path like {@link ScannedTree}.
 */
export function snapshotToScannedTree(
  snapshot: SnapshotDocument,
  mountPath: string
): ScannedTree {
  const root: PendingNode = {
    name: snapshot.name,
    path: mountPath,
    kind: 'directory',
    size: 0,
    modifiedMs: 0,
    children: []
  }
  const directories = new Map<string, PendingNode>([['', root]])

  for (const entry of snapshot.entries) {
    const segments = entry.path.split('/')
    let parent = root
    let relativePath = ''

    for (const segment of segments.slice(0, -1)) {
      relativePath = relativePath === '' ? segment : `${relativePath}/${segment}`
      let directory = directories.get(relativePath)
      if (directory === undefined) {
        directory = {
          name: segment,
          path: `${mountPath}/${relativePath}`,
          kind: 'directory',
          size: 0,
          modifiedMs: 0,
          children: []
        }
        directories.set(relativePath, directory)
        parent.children.push(directory)
      }
      parent = directory
    }

    parent.children.push({
      name: segments[segments.length - 1],
      path: `${mountPath}/${entry.path}`,
      kind: 'file',
      size: entry.size,
      modifiedMs: entry.modifiedMs,
      children: []
    })
  }

  const index = new Map<string, ScannedNode>()

  function finalize(node: PendingNode, relativePath: string): ScannedNode {
    const children = node.children
      .map((child) =>
        finalize(
          child,
          relativePath === '' ? child.name : `${relativePath}/${child.name}`
        )
      )
      .sort((left, right) => left.name.localeCompare(right.name))
    const finalized: ScannedNode = {
      name: node.name,
      path: node.path,
      kind: node.kind,
      size: node.size,
      modifiedMs: node.modifiedMs,
      children
    }
    index.set(relativePath, finalized)
    return finalized
  }

  return { root: finalize(root, ''), index }
}

/* ------------------------------------------------------------------ */
/* Inline content                                                      */
/* ------------------------------------------------------------------ */

export type SnapshotContentErrorCode = 'not-found' | 'content-not-inlined'

/** Raised when a snapshot cannot serve the requested body. */
export class SnapshotContentError extends Error {
  readonly code: SnapshotContentErrorCode
  readonly path: string

  constructor(code: SnapshotContentErrorCode, message: string, path: string) {
    super(message)
    this.name = 'SnapshotContentError'
    this.code = code
    this.path = path
  }
}

/** Reads one entry's inline body by its root-relative snapshot path. */
export function readSnapshotContent(snapshot: SnapshotDocument, relativePath: string): string {
  const entry = snapshot.entries.find((candidate) => candidate.path === relativePath)
  if (entry === undefined) {
    throw new SnapshotContentError(
      'not-found',
      `Snapshot "${snapshot.name}" has no file at "${relativePath}".`,
      relativePath
    )
  }
  if (entry.content === undefined) {
    throw new SnapshotContentError(
      'content-not-inlined',
      `Snapshot "${snapshot.name}" did not inline the content of "${relativePath}".`,
      relativePath
    )
  }
  return entry.content
}

/* ------------------------------------------------------------------ */
/* Comparing real directories with snapshots                           */
/* ------------------------------------------------------------------ */

/** Virtual mount root under which imported snapshots live. */
export const SNAPSHOT_MOUNT_ROOT = '/snapshots'

/** One comparison input: a real directory or an imported snapshot. */
export type ComparisonSide =
  | { readonly kind: 'directory'; readonly path: string }
  | {
      readonly kind: 'snapshot'
      readonly snapshot: SnapshotDocument
      /** Overrides the default `/snapshots/<side>/<name>` mount path. */
      readonly mountPath?: string
    }

interface SnapshotMount {
  readonly mountPath: string
  readonly snapshot: SnapshotDocument
}

interface ResolvedSide {
  readonly tree: ScannedTree
  readonly mount?: SnapshotMount
}

function defaultMountPath(side: 'left' | 'right', snapshot: SnapshotDocument): string {
  const label = snapshot.name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return `${SNAPSHOT_MOUNT_ROOT}/${side}/${label === '' ? 'snapshot' : label}`
}

async function resolveSide(
  side: ComparisonSide,
  position: 'left' | 'right',
  list: ListDirectory
): Promise<ResolvedSide> {
  if (side.kind === 'directory') {
    return { tree: await scanDirectory(side.path, list) }
  }
  const mountPath = side.mountPath ?? defaultMountPath(position, side.snapshot)
  return {
    tree: snapshotToScannedTree(side.snapshot, mountPath),
    mount: { mountPath, snapshot: side.snapshot }
  }
}

/**
 * Compares a real directory or a snapshot against either kind of counterpart,
 * reusing the regular comparison semantics, cache and content-read planning.
 * Only bodies that are actually needed are read; snapshot bodies come from the
 * document, directory bodies from `readTextFile` through a bounded window so a
 * multi-thousand-file tree cannot exhaust the process file descriptors.
 */
export async function compareDirectorySides(
  left: ComparisonSide,
  right: ComparisonSide,
  list: ListDirectory,
  readTextFile: ReadTextFile,
  cache: ComparisonCache,
  hash?: (text: string) => string,
  /** In-flight body-read window; defaults to {@link DEFAULT_IO_CONCURRENCY}. */
  options: ConcurrencyOptions = {}
): Promise<DirectoryComparison> {
  try {
    const [leftSide, rightSide] = await Promise.all([
      resolveSide(left, 'left', list),
      resolveSide(right, 'right', list)
    ])

    const mounts = [leftSide.mount, rightSide.mount].filter(
      (mount): mount is SnapshotMount => mount !== undefined
    )

    const read = async (path: string): Promise<string> => {
      const mount = mounts.find((candidate) => path.startsWith(`${candidate.mountPath}/`))
      if (mount !== undefined) {
        return readSnapshotContent(mount.snapshot, path.slice(mount.mountPath.length + 1))
      }
      return readTextFile(path)
    }

    const requested = planContentReads(leftSide.tree, rightSide.tree, cache)
    const contents = new Map(
      await mapWithLimit(requested, options, async (path) => [path, await read(path)] as const)
    )

    return compareScannedTrees(leftSide.tree, rightSide.tree, { contents, cache, hash })
  } catch (error) {
    throw toReadableIoError(error)
  }
}
