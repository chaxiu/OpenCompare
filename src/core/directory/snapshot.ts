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
import type { LinkTargetKind } from '@shared/platform/types'
import type { SnapshotDocument, SnapshotEntry } from '@shared/snapshot'
import { toReadableIoError } from '../io'
import type {
  ComparisonCache,
  ComparisonIoOptions,
  DirectoryComparison,
  ListDirectory,
  ReadTextFile,
  ScannedNode,
  ScannedTree
} from './compare'
import {
  compareScannedTrees,
  createScanProgressMerger,
  digestContentCandidates,
  readContentCandidates,
  scanDirectory
} from './compare'
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

/**
 * Symbolic links keep the wire format untouched: their entry stores the target
 * (and resolved shape) in the existing `content` field behind this marker, so
 * an imported snapshot can reconstruct link semantics without a new field.
 */
const SYMLINK_CONTENT_PREFIX = '\u0000opencompare-symlink:v1:'

function encodeLinkContent(node: ScannedNode): string {
  return `${SYMLINK_CONTENT_PREFIX}${node.linkTargetKind ?? 'missing'}:${node.linkTarget ?? ''}`
}

interface DecodedLink {
  readonly target: string
  readonly kind: LinkTargetKind
}

function decodeLinkContent(content: string | undefined): DecodedLink | null {
  if (content === undefined || !content.startsWith(SYMLINK_CONTENT_PREFIX)) return null
  const rest = content.slice(SYMLINK_CONTENT_PREFIX.length)
  const separator = rest.indexOf(':')
  if (separator === -1) return null
  const kind = rest.slice(0, separator)
  if (kind !== 'file' && kind !== 'directory' && kind !== 'missing') return null
  return { target: rest.slice(separator + 1), kind }
}

export interface BuildSnapshotOptions {
  /** Display name of the captured root. */
  readonly name: string
  /** ISO-8601 capture time; supplied by the caller so builds stay testable. */
  readonly exportedAt: string
  readonly readTextFile: ReadTextFile
  /** Inline this file's text; defaults to inlining every file. */
  readonly inlineContent?: (relativePath: string, node: ScannedNode) => boolean
}

export interface SnapshotBuildResult {
  readonly snapshot: SnapshotDocument
  /** Files left out because their body could not be read. */
  readonly skipped: number
}

/**
 * Captures every file of `tree` as a snapshot entry. Directories are implied by
 * paths and never become entries themselves; bodies are read once to compute
 * the digest, and retained only where `inlineContent` accepts the file.
 * A file whose body cannot be read is skipped and counted, so one unreadable
 * file does not cost the whole export.
 */
export async function buildSnapshot(
  tree: ScannedTree,
  options: BuildSnapshotOptions
): Promise<SnapshotBuildResult> {
  const inlineContent = options.inlineContent ?? ((): boolean => true)
  const scannedFiles = [...tree.index.entries()].filter(([, node]) => node.kind === 'file')
  const links = scannedFiles.filter(([, node]) => node.linkTarget !== undefined)
  const files = scannedFiles.filter(([, node]) => node.linkTarget === undefined)

  const { contents, unreadable } = await readContentCandidates(
    files.map(([, node]) => node.path),
    options.readTextFile,
    {}
  )

  const entries = [
    // Link entries always carry their marker, even in metadata-only exports:
    // dropping it would silently turn a link into an ordinary file on import.
    ...links.map(([relativePath, node]): SnapshotEntry => {
      const encoded = encodeLinkContent(node)
      return {
        path: relativePath,
        size: node.size,
        modifiedMs: node.modifiedMs,
        sha256: sha256Hex(encoded),
        content: encoded
      }
    }),
    ...files
      .filter(([, node]) => !unreadable.has(node.path))
      .map(([relativePath, node]): SnapshotEntry => {
        const text = contents.get(node.path)
        if (text === undefined) {
          throw new Error(`Missing body for ${node.path}; the read should have failed instead.`)
        }
        return {
          path: relativePath,
          size: node.size,
          modifiedMs: node.modifiedMs,
          sha256: sha256Hex(text),
          ...(inlineContent(relativePath, node) ? { content: text } : {})
        }
      })
  ]

  entries.sort((left, right) => left.path.localeCompare(right.path))
  return {
    snapshot: validateSnapshot({
      schema: SNAPSHOT_SCHEMA,
      name: options.name,
      exportedAt: options.exportedAt,
      entries
    }),
    skipped: unreadable.size
  }
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
  readonly linkTarget?: string
  readonly linkTargetKind?: LinkTargetKind
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

    const link = decodeLinkContent(entry.content)
    parent.children.push({
      name: segments[segments.length - 1],
      path: `${mountPath}/${entry.path}`,
      kind: 'file',
      size: entry.size,
      modifiedMs: entry.modifiedMs,
      children: [],
      linkTarget: link?.target,
      linkTargetKind: link?.kind
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
      children,
      linkTarget: node.linkTarget,
      linkTargetKind: node.linkTargetKind
    }
    index.set(relativePath, finalized)
    return finalized
  }

  return { root: finalize(root, ''), index, skipped: 0 }
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
  list: ListDirectory,
  options: ComparisonIoOptions
): Promise<ResolvedSide> {
  if (side.kind === 'directory') {
    return { tree: await scanDirectory(side.path, list, options) }
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
  /** In-flight body-read window and optional raw-byte digest capability. */
  options: ComparisonIoOptions = {}
): Promise<DirectoryComparison> {
  try {
    // Directory sides of a mixed pair still report one monotonic scan stream.
    const sideProgress = createScanProgressMerger(options.onProgress)
    const [leftSide, rightSide] = await Promise.all([
      resolveSide(left, 'left', list, { ...options, onProgress: sideProgress.reporter() }),
      resolveSide(right, 'right', list, { ...options, onProgress: sideProgress.reporter() })
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

    // Snapshot-mounted paths have no file behind them, so only real directory
    // files may go through the byte digest; the snapshot side keeps hashing its
    // inline text with {@link sha256Hex}, exactly as the wire format captured it.
    // Digest progress continues from the directory sides' scan totals.
    const digestBase = sideProgress.totals()
    const digestOptions: ComparisonIoOptions =
      options.digestFiles === undefined || options.digestible !== undefined
        ? { ...options, progressBase: digestBase }
        : {
            ...options,
            progressBase: digestBase,
            digestible: (path) =>
              !mounts.some((mount) => path.startsWith(`${mount.mountPath}/`))
          }

    // A real directory file that cannot be read is skipped; a snapshot body the
    // document never inlined stays a fatal format error, as before.
    const unreadable = await digestContentCandidates(
      leftSide.tree,
      rightSide.tree,
      cache,
      read,
      hash ?? sha256Hex,
      digestOptions,
      (error) => !(error instanceof SnapshotContentError)
    )

    return compareScannedTrees(leftSide.tree, rightSide.tree, {
      contents: new Map(),
      cache,
      hash,
      unreadable
    })
  } catch (error) {
    throw toReadableIoError(error)
  }
}
