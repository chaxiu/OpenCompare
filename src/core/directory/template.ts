/**
 * Cross-level template placement matcher.
 *
 * Tree A is the structural template: its file *slots* are root-relative paths.
 * Tree B is a shuffled tree whose directory levels no longer line up. A file is
 * placed by *file name + SHA-256 content hash* only: the name narrows the
 * candidates, the hash confirms the identity. Matching is linear — a name index
 * over B plus a content-hash memo — so no pair-wise body comparison happens and
 * each file is read and hashed at most once.
 *
 * Outcomes per template slot:
 *  - `matched`  — exactly one same-name candidate whose hash equals the slot's,
 *  - `missing`  — no same-name candidate at all,
 *  - `conflict` — one same-name candidate with a different hash, or more than
 *                 one same-name candidate (cannot be placed uniquely).
 * Files of B consumed by no slot are reported as `unused`.
 */
import type { DirectoryEntry } from '@shared/platform/types'
import { OperationCancelledError, isOperationCancelled } from '../io'
import type { ScannedNode, ScannedTree } from './compare'
import { sha256Hex } from './hash'
import { joinRelativePath } from './sync'

export interface TemplateMatch {
  /** Template slot, i.e. the relative path the file is restored to. */
  readonly relativePath: string
  readonly templatePath: string
  readonly sourcePath: string
  readonly size: number
  readonly hash: string
  /** Source mtime carried onto the target so the restore keeps the source time. */
  readonly modifiedMs: number
  /** Body captured while hashing, reused by the extractor. */
  readonly text: string
}

export interface TemplateConflictCandidate {
  readonly path: string
  readonly size: number
  readonly hash: string
  /** Candidate mtime, so a resolved conflict keeps its source time too. */
  readonly modifiedMs: number
}

export interface TemplateConflict {
  readonly relativePath: string
  readonly templatePath: string
  readonly reason: 'content-mismatch' | 'ambiguous'
  readonly candidates: readonly TemplateConflictCandidate[]
}

export interface TemplateMissing {
  readonly relativePath: string
  readonly templatePath: string
  readonly size: number
}

export interface TemplateUnused {
  readonly relativePath: string
  readonly path: string
  readonly size: number
}

export interface TemplateMatchResult {
  readonly templateRoot: string
  readonly incomingRoot: string
  readonly matched: readonly TemplateMatch[]
  readonly conflicts: readonly TemplateConflict[]
  readonly missing: readonly TemplateMissing[]
  readonly unused: readonly TemplateUnused[]
  readonly templateFileCount: number
}

export interface TemplateMatchIo {
  readonly readTextFile: (path: string) => Promise<string>
  /** Digest implementation; defaults to the built-in synchronous SHA-256. */
  readonly hash?: (text: string) => string
}

interface Hashed {
  readonly hash: string
  readonly text: string
}

/**
 * Matches the template tree A against the shuffled tree B by name + content
 * hash. Both trees must already be scanned.
 */
export async function matchTemplate(
  template: ScannedTree,
  incoming: ScannedTree,
  io: TemplateMatchIo
): Promise<TemplateMatchResult> {
  const hashOf = io.hash ?? sha256Hex
  const memo = new Map<string, Promise<Hashed>>()

  function contentOf(node: ScannedNode): Promise<Hashed> {
    const cached = memo.get(node.path)
    if (cached !== undefined) return cached
    const pending = io.readTextFile(node.path).then((text) => ({ hash: hashOf(text), text }))
    memo.set(node.path, pending)
    return pending
  }

  const incomingByName = new Map<string, ScannedNode[]>()
  for (const node of incoming.index.values()) {
    if (node.kind !== 'file') continue
    const bucket = incomingByName.get(node.name)
    if (bucket === undefined) incomingByName.set(node.name, [node])
    else bucket.push(node)
  }

  const templateFiles = [...template.index.entries()]
    .filter(([, node]) => node.kind === 'file')
    .sort(([left], [right]) => left.localeCompare(right))

  const matched: TemplateMatch[] = []
  const conflicts: TemplateConflict[] = []
  const missing: TemplateMissing[] = []
  const consumed = new Set<string>()

  for (const [relativePath, slot] of templateFiles) {
    const candidates = incomingByName.get(slot.name) ?? []
    if (candidates.length === 0) {
      missing.push({ relativePath, templatePath: slot.path, size: slot.size })
      continue
    }

    const slotContent = await contentOf(slot)

    if (candidates.length > 1) {
      const details: TemplateConflictCandidate[] = []
      for (const candidate of candidates) {
        const hashed = await contentOf(candidate)
        details.push({
          path: candidate.path,
          size: candidate.size,
          hash: hashed.hash,
          modifiedMs: candidate.modifiedMs
        })
      }
      conflicts.push({
        relativePath,
        templatePath: slot.path,
        reason: 'ambiguous',
        candidates: details
      })
      continue
    }

    const candidate = candidates[0]
    const candidateContent = await contentOf(candidate)
    if (candidateContent.hash === slotContent.hash) {
      consumed.add(candidate.path)
      matched.push({
        relativePath,
        templatePath: slot.path,
        sourcePath: candidate.path,
        size: candidate.size,
        hash: candidateContent.hash,
        modifiedMs: candidate.modifiedMs,
        text: candidateContent.text
      })
    } else {
      conflicts.push({
        relativePath,
        templatePath: slot.path,
        reason: 'content-mismatch',
        candidates: [
          {
            path: candidate.path,
            size: candidate.size,
            hash: candidateContent.hash,
            modifiedMs: candidate.modifiedMs
          }
        ]
      })
    }
  }

  const unused = [...incoming.index.entries()]
    .filter(([, node]) => node.kind === 'file' && !consumed.has(node.path))
    .map(([relativePath, node]) => ({ relativePath, path: node.path, size: node.size }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath))

  return {
    templateRoot: template.root.path,
    incomingRoot: incoming.root.path,
    matched,
    conflicts,
    missing,
    unused,
    templateFileCount: templateFiles.length
  }
}

export interface TemplateExtractIo {
  readonly writeTextFile: (path: string, content: string) => Promise<void>
  readonly ensureDirectory: (path: string) => Promise<void>
}

export interface TemplateExtraction {
  readonly written: number
  readonly paths: readonly string[]
}

/**
 * Re-matches a subset of template A slots against a restored output tree.
 *
 * Verification after an extract must be scoped to the slots that were actually
 * written: template files that the incoming tree B never provided stay missing
 * by design, so comparing the full template against the output would always
 * report them again. Only `relativePaths` (the matched slots) take part.
 */
export function matchTemplateSlots(
  template: ScannedTree,
  output: ScannedTree,
  relativePaths: readonly string[],
  io: TemplateMatchIo
): Promise<TemplateMatchResult> {
  const wanted = new Set(relativePaths)
  const index = new Map(
    [...template.index].filter(
      ([relativePath, node]) => node.kind === 'file' && wanted.has(relativePath)
    )
  )
  return matchTemplate({ root: template.root, index, skipped: template.skipped }, output, io)
}

/**
 * Writes every matched file to `targetRoot`, recreating the template A relative
 * structure. Bodies come from the match result, so nothing is read twice.
 */
export async function extractTemplateMatches(
  result: TemplateMatchResult,
  targetRoot: string,
  io: TemplateExtractIo
): Promise<TemplateExtraction> {
  const paths: string[] = []

  for (const item of result.matched) {
    const target = joinRelativePath(targetRoot, item.relativePath)
    const parent = parentPathOf(target)
    if (parent !== '') await io.ensureDirectory(parent)
    await io.writeTextFile(target, item.text)
    paths.push(target)
  }

  return { written: paths.length, paths }
}

function parentPathOf(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return index > 0 ? path.slice(0, index) : ''
}

function nameOfPath(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return index === -1 ? path : path.slice(index + 1)
}

// ---------------------------------------------------------------------------
// Placement plan: one renderable / executable row per template slot.
//
// The matcher answers *what* maps to *what*; the plan turns that into the rows a
// dry-run lists and Apply reads. It is a pure function: overwrite detection comes
// from the caller's existing-path lists, never from a disk call, so the whole
// plan pipeline stays Node-testable.
// ---------------------------------------------------------------------------

/** Plan partition sizes; every entry belongs to exactly one partition. */
export interface TemplatePlanCounts {
  readonly matched: number
  readonly missing: number
  readonly conflict: number
  /** Target already holds the same content as the slot's source; never writable. */
  readonly placed: number
  /** Incoming files no slot consumed; never writable. */
  readonly unused: number
}

/** One template slot the plan can render: matched, placed, missing or conflicting. */
export interface TemplatePlanEntry {
  /** Template slot, i.e. the relative path the file is restored to. */
  readonly relativePath: string
  readonly outcome: 'matched' | 'placed' | 'missing' | 'conflict'
  readonly templatePath: string
  /** Absolute source when the slot has one; `null` for missing / open conflicts. */
  readonly sourcePath: string | null
  /** Absolute destination under the output root. */
  readonly targetPath: string
  /** Template slot size; `0` for a conflict that still needs a candidate. */
  readonly size: number
  /** Source body SHA-256 bound while matching; `null` when there is no source. */
  readonly sourceHash: string | null
  /** Source mtime carried onto the target; `null` when there is no source. */
  readonly sourceModifiedMs: number | null
  /** The output root already holds a file at `targetPath` (overwriting is explicit). */
  readonly overwrite: boolean
  /** A directory occupies `targetPath`, so this row can never be written. */
  readonly occupiedByDirectory: boolean
  /** Only a `matched` row whose target is absent starts checked. */
  readonly defaultChecked: boolean
  readonly conflictReason?: TemplateConflict['reason']
  /** Candidate sources of a conflict row; empty for every other outcome. */
  readonly candidates: readonly TemplateConflictCandidate[]
}

export interface TemplatePlan {
  readonly templateRoot: string
  readonly incomingRoot: string
  readonly outputRoot: string
  /** Template A file slots; equals `matched + placed + missing + conflicts`. */
  readonly templateFileCount: number
  readonly matched: readonly TemplatePlanEntry[]
  /** Slots whose target already holds the same content as their source. */
  readonly placed: readonly TemplatePlanEntry[]
  readonly missing: readonly TemplatePlanEntry[]
  readonly conflicts: readonly TemplatePlanEntry[]
  /** Incoming files no slot consumes; listed for the dry-run, never written. */
  readonly unused: readonly TemplateUnused[]
  /** Partition sizes, identical to the arrays above. */
  readonly counts: TemplatePlanCounts
}

export interface TemplatePlanOptions {
  readonly outputRoot: string
  /** Root-relative paths already present under the output root. */
  readonly existingFiles?: readonly string[]
  /** Root-relative paths already occupied by a directory under the output root. */
  readonly existingDirectories?: readonly string[]
  /**
   * Root-relative path → SHA-256 of the existing output file. A slot whose
   * target digest equals its source digest is `placed` instead of an overwrite.
   */
  readonly existingFileHashes?: Readonly<Record<string, string>>
}

interface SlotInput {
  readonly relativePath: string
  readonly templatePath: string
  readonly size?: number
}

interface SourceInput {
  readonly sourcePath: string
  readonly sourceHash: string
  readonly modifiedMs: number
}

/**
 * Expands a match result into the five plan partitions. Every template slot
 * becomes exactly one row; `targetPath` is always derived from the slot, so the
 * renderer and the executor address the same destination.
 *
 * A slot whose target already holds the same body (equal SHA-256) as its
 * source is `placed`: it is neither an overwrite nor a conflict, it never
 * starts checked and it can never be executed. Only a digest equality counts;
 * mtime is ignored and a directory on the slot keeps `occupiedByDirectory`.
 */
export function createTemplatePlan(
  result: TemplateMatchResult,
  options: TemplatePlanOptions
): TemplatePlan {
  const existingFiles = new Set(options.existingFiles ?? [])
  const existingDirectories = new Set(options.existingDirectories ?? [])
  const existingFileHashes = options.existingFileHashes ?? {}

  function isPlaced(relativePath: string, sourceHashes: readonly string[]): boolean {
    if (!existingFiles.has(relativePath) || existingDirectories.has(relativePath)) return false
    const targetHash = existingFileHashes[relativePath]
    return targetHash !== undefined && sourceHashes.includes(targetHash)
  }

  function toEntry(
    outcome: TemplatePlanEntry['outcome'],
    slot: SlotInput,
    source: SourceInput | null,
    candidates: readonly TemplateConflictCandidate[] = [],
    conflictReason?: TemplateConflict['reason']
  ): TemplatePlanEntry {
    const occupiedByDirectory = existingDirectories.has(slot.relativePath)
    const overwrite = outcome !== 'placed' && existingFiles.has(slot.relativePath)
    return {
      relativePath: slot.relativePath,
      outcome,
      templatePath: slot.templatePath,
      sourcePath: source?.sourcePath ?? null,
      targetPath: joinRelativePath(options.outputRoot, slot.relativePath),
      size: slot.size ?? 0,
      sourceHash: source?.sourceHash ?? null,
      sourceModifiedMs: source?.modifiedMs ?? null,
      overwrite,
      occupiedByDirectory,
      defaultChecked: outcome === 'matched' && !overwrite && !occupiedByDirectory,
      conflictReason,
      candidates
    }
  }

  const matched: TemplatePlanEntry[] = []
  const placed: TemplatePlanEntry[] = []
  for (const item of result.matched) {
    const source: SourceInput = {
      sourcePath: item.sourcePath,
      sourceHash: item.hash,
      modifiedMs: item.modifiedMs
    }
    if (isPlaced(item.relativePath, [item.hash])) {
      placed.push(toEntry('placed', item, source))
      continue
    }
    matched.push(toEntry('matched', item, source))
  }
  const missing = result.missing.map((item) => toEntry('missing', item, null))
  const conflicts: TemplatePlanEntry[] = []
  for (const item of result.conflicts) {
    if (isPlaced(item.relativePath, item.candidates.map((candidate) => candidate.hash))) {
      placed.push(toEntry('placed', item, null, item.candidates, item.reason))
      continue
    }
    conflicts.push(toEntry('conflict', item, null, item.candidates, item.reason))
  }

  return {
    templateRoot: result.templateRoot,
    incomingRoot: result.incomingRoot,
    outputRoot: options.outputRoot,
    templateFileCount: result.templateFileCount,
    matched,
    placed,
    missing,
    conflicts,
    unused: result.unused,
    counts: {
      matched: matched.length,
      missing: missing.length,
      conflict: conflicts.length,
      placed: placed.length,
      unused: result.unused.length
    }
  }
}

/** The explicit user choice a resolved plan is built from. */
export interface TemplateSelection {
  /** Template slot relative paths the user checked. Duplicates collapse to one. */
  readonly checkedPaths?: readonly string[]
  /** Conflict slot relative path → chosen source absolute path. */
  readonly conflictChoices?: Readonly<Record<string, string>>
}

/** One row Apply may write: the slot, its source and the bound source digest. */
export interface TemplateExecutableEntry {
  readonly relativePath: string
  readonly sourcePath: string
  readonly targetPath: string
  readonly sourceHash: string
  readonly modifiedMs: number
  readonly size: number
}

export type TemplateRejectionReason =
  /** A checked row with no source at all (a `missing` slot). */
  | 'not-executable'
  /** A checked conflict row without a candidate choice. */
  | 'conflict-unresolved'
  /** The chosen source is not one of that conflict row's candidates. */
  | 'conflict-candidate-outside-set'
  /** A directory already occupies the destination. */
  | 'target-occupied-by-directory'
  /** Another slot with a lower `relativePath` already claims the same source. */
  | 'duplicate-source'

export interface TemplateRejection {
  readonly relativePath: string
  readonly reason: TemplateRejectionReason
}

/**
 * The single executable manifest: partition counts, executable rows and the
 * rejection list. The dry-run counters, the Apply write set and the post-write
 * check all read this object — no caller re-derives "can this row run?".
 */
export interface TemplateResolvedPlan {
  readonly plan: TemplatePlan
  /** Partition counts of the source plan, carried through unchanged. */
  readonly counts: TemplatePlanCounts
  /** Rows Apply writes, sorted by `relativePath`; no row repeats a source. */
  readonly executable: readonly TemplateExecutableEntry[]
  readonly executableCount: number
  /** Checked rows that were refused, with the reason each one was refused. */
  readonly rejected: readonly TemplateRejection[]
  readonly rejectedCount: number
}

/**
 * Resolves the user's explicit checks into the one manifest everything else
 * reads. Only a checked `matched` row and a checked conflict row whose chosen
 * source is one of its candidates become executable; a missing slot, an
 * unchecked row, an unresolved conflict and a directory-occupied target never do.
 * A `placed` row is already on disk: it is neither executable nor rejected, even
 * when it appears in `checkedPaths`.
 */
export function resolveTemplatePlan(
  plan: TemplatePlan,
  selection: TemplateSelection = {}
): TemplateResolvedPlan {
  const checked = new Set(selection.checkedPaths ?? [])
  const conflictChoices = selection.conflictChoices ?? {}
  const rejected: TemplateRejection[] = []

  function reject(relativePath: string, reason: TemplateRejectionReason): void {
    rejected.push({ relativePath, reason })
  }

  const slots = [...plan.missing, ...plan.matched, ...plan.conflicts].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  )

  const candidates: TemplateExecutableEntry[] = []
  for (const entry of slots) {
    if (entry.outcome === 'placed') continue
    if (!checked.has(entry.relativePath)) continue
    if (entry.occupiedByDirectory) {
      reject(entry.relativePath, 'target-occupied-by-directory')
      continue
    }
    if (entry.outcome === 'missing') {
      reject(entry.relativePath, 'not-executable')
      continue
    }
    if (entry.outcome === 'matched') {
      if (
        entry.sourcePath === null ||
        entry.sourceHash === null ||
        entry.sourceModifiedMs === null
      ) {
        reject(entry.relativePath, 'not-executable')
        continue
      }
      candidates.push({
        relativePath: entry.relativePath,
        sourcePath: entry.sourcePath,
        targetPath: entry.targetPath,
        sourceHash: entry.sourceHash,
        modifiedMs: entry.sourceModifiedMs,
        size: entry.size
      })
      continue
    }

    const choice = conflictChoices[entry.relativePath]
    if (choice === undefined) {
      reject(entry.relativePath, 'conflict-unresolved')
      continue
    }
    const candidate = entry.candidates.find((item) => item.path === choice)
    if (candidate === undefined) {
      reject(entry.relativePath, 'conflict-candidate-outside-set')
      continue
    }
    candidates.push({
      relativePath: entry.relativePath,
      sourcePath: candidate.path,
      targetPath: entry.targetPath,
      sourceHash: candidate.hash,
      modifiedMs: candidate.modifiedMs,
      size: candidate.size
    })
  }

  // One source file can only satisfy one slot: the first by relative path wins.
  const sources = new Set<string>()
  const executable: TemplateExecutableEntry[] = []
  for (const entry of candidates) {
    if (sources.has(entry.sourcePath)) {
      reject(entry.relativePath, 'duplicate-source')
      continue
    }
    sources.add(entry.sourcePath)
    executable.push(entry)
  }

  rejected.sort((left, right) => left.relativePath.localeCompare(right.relativePath))

  return {
    plan,
    counts: plan.counts,
    executable,
    executableCount: executable.length,
    rejected,
    rejectedCount: rejected.length
  }
}

/** IO seam of plan execution; the renderer binds it to `PlatformPort`. */
export interface TemplateExecuteIo {
  readonly readTextFile: (path: string) => Promise<string>
  readonly writeTextFile: (path: string, content: string, modifiedMs?: number) => Promise<void>
  readonly ensureDirectory: (path: string) => Promise<void>
  /** Digest implementation; defaults to the built-in synchronous SHA-256. */
  readonly hash?: (text: string) => string
}

export interface TemplateExecuteOptions {
  /**
   * Cancels between selected rows. A pre-aborted signal rejects with
   * {@link OperationCancelledError} before the first directory is created; a
   * mid-run abort stops the remaining rows and returns `cancelled: true`.
   */
  readonly signal?: AbortSignal
}

/** One row this run wrote: its slot, the source it came from and its digest. */
export interface TemplateWrittenEntry {
  readonly relativePath: string
  readonly sourcePath: string
  readonly targetPath: string
  /** Source body SHA-256 bound at plan time; the verification expectation. */
  readonly sourceHash: string
  /** Source mtime this run handed to the write call. */
  readonly modifiedMs: number
}

export type TemplateWriteFailureReason =
  /** The source body changed after planning, so the row was written zero bytes. */
  | 'source-drift'
  /** The source could not be read back at all. */
  | 'source-unreadable'
  /** The filesystem refused the directory or the write itself. */
  | 'write-failed'

export interface TemplateWriteFailure {
  readonly relativePath: string
  readonly sourcePath: string
  readonly targetPath: string
  readonly reason: TemplateWriteFailureReason
  /**
   * Stable OS code (`EACCES`, `EROFS`, …) the write or read refused with, when
   * the platform surfaced one. The renderer localizes on this instead of the
   * platform's own sentence.
   */
  readonly code?: string
}

export interface TemplateExecution {
  /** Exactly the rows written, in write order. */
  readonly written: readonly TemplateWrittenEntry[]
  readonly writtenCount: number
  /** Selected rows this run refused; the rest of the manifest still ran. */
  readonly failed: readonly TemplateWriteFailure[]
  readonly failedCount: number
  /** True when a mid-run abort stopped the rows that had not started yet. */
  readonly cancelled: boolean
}

/**
 * Applies a resolved manifest: only executable rows are written, parent
 * directories follow the template A structure, and every write carries its
 * source mtime. A row whose source digest drifted since planning is skipped
 * without a write (`source-drift`) while the remaining rows continue.
 */
export async function executeTemplatePlan(
  resolved: TemplateResolvedPlan,
  io: TemplateExecuteIo,
  options: TemplateExecuteOptions = {}
): Promise<TemplateExecution> {
  const signal = options.signal
  // A pre-cancelled run must not touch the disk at all — not even a directory.
  if (isAborted(signal)) throw new OperationCancelledError()
  const hashOf = io.hash ?? sha256Hex
  const written: TemplateWrittenEntry[] = []
  const failed: TemplateWriteFailure[] = []
  let cancelled = false

  function fail(
    entry: TemplateExecutableEntry,
    reason: TemplateWriteFailureReason,
    cause?: unknown
  ): void {
    const code = errorCodeOf(cause)
    failed.push({
      relativePath: entry.relativePath,
      sourcePath: entry.sourcePath,
      targetPath: entry.targetPath,
      reason,
      ...(code === undefined ? {} : { code })
    })
  }

  for (const entry of resolved.executable) {
    if (isAborted(signal)) {
      cancelled = true
      break
    }

    let text: string
    try {
      text = await io.readTextFile(entry.sourcePath)
    } catch (error) {
      if (isOperationCancelled(error)) throw error
      fail(entry, 'source-unreadable', error)
      continue
    }

    // A cancelled read stops the run *before* the row is written: the current
    // row is simply not started, so nothing half-written can survive.
    if (isAborted(signal)) {
      cancelled = true
      break
    }
    if (hashOf(text) !== entry.sourceHash) {
      fail(entry, 'source-drift')
      continue
    }

    try {
      const parent = parentPathOf(entry.targetPath)
      if (parent !== '') await io.ensureDirectory(parent)
      // The write itself is never raced against the signal: the platform write
      // is atomic, so an abort during it still lands whole or not at all.
      await io.writeTextFile(entry.targetPath, text, entry.modifiedMs)
    } catch (error) {
      if (isOperationCancelled(error)) throw error
      fail(entry, 'write-failed', error)
      continue
    }

    written.push({
      relativePath: entry.relativePath,
      sourcePath: entry.sourcePath,
      targetPath: entry.targetPath,
      sourceHash: entry.sourceHash,
      modifiedMs: entry.modifiedMs
    })
  }

  return {
    written,
    writtenCount: written.length,
    failed,
    failedCount: failed.length,
    cancelled
  }
}

export type TemplateVerifyReason =
  /** Nothing exists at the target path any more. */
  | 'missing'
  /** A directory occupies the target path. */
  | 'directory'
  /** The target body no longer digests to the planned source SHA-256. */
  | 'hash'
  /** The target mtime second differs from the source mtime second. */
  | 'mtime'
  /** The target or its parent directory could not be read. */
  | 'unreadable'

/** One written row compared against the disk after the run. */
export interface TemplateVerificationEntry {
  readonly relativePath: string
  readonly targetPath: string
  readonly expectedHash: string
  readonly actualHash: string | null
  /** Whole-second mtime expectation (`Math.floor(ms / 1000)`). */
  readonly expectedMtimeSec: number
  readonly actualMtimeSec: number | null
  readonly ok: boolean
  /** Why this row failed; absent when `ok`. */
  readonly reason?: TemplateVerifyReason
}

export interface TemplateVerification {
  readonly entries: readonly TemplateVerificationEntry[]
  readonly verified: number
  readonly failed: number
}

export interface TemplateVerifyIo {
  readonly readTextFile: (path: string) => Promise<string>
  /** One directory level; its entries carry the target's `modifiedMs`. */
  readonly listDirectory: (path: string) => Promise<readonly DirectoryEntry[]>
  /** Digest implementation; defaults to the built-in synchronous SHA-256. */
  readonly hash?: (text: string) => string
}

/**
 * Re-checks every row this run wrote: existence, the source SHA-256 recomputed
 * from the target body, and the mtime at **second** granularity. Sub-second
 * write precision never fails a row; a real second of drift does.
 */
export async function verifyTemplateExtraction(
  written: readonly TemplateWrittenEntry[],
  io: TemplateVerifyIo
): Promise<TemplateVerification> {
  const hashOf = io.hash ?? sha256Hex
  const listings = new Map<string, Promise<readonly DirectoryEntry[]>>()

  function listingOf(directory: string): Promise<readonly DirectoryEntry[]> {
    const cached = listings.get(directory)
    if (cached !== undefined) return cached
    const pending = io.listDirectory(directory)
    listings.set(directory, pending)
    return pending
  }

  const entries: TemplateVerificationEntry[] = []
  for (const item of written) {
    const expectedMtimeSec = Math.floor(item.modifiedMs / 1000)
    const parent = parentPathOf(item.targetPath)
    const name = nameOfPath(item.targetPath)

    let listing: readonly DirectoryEntry[] | undefined
    try {
      listing = await listingOf(parent)
    } catch {
      listing = undefined
    }
    const entry = listing?.find((candidate) => candidate.name === name)

    if (entry === undefined) {
      entries.push({
        relativePath: item.relativePath,
        targetPath: item.targetPath,
        expectedHash: item.sourceHash,
        actualHash: null,
        expectedMtimeSec,
        actualMtimeSec: null,
        ok: false,
        reason: listing === undefined ? 'unreadable' : 'missing'
      })
      continue
    }
    if (entry.isDirectory) {
      entries.push({
        relativePath: item.relativePath,
        targetPath: item.targetPath,
        expectedHash: item.sourceHash,
        actualHash: null,
        expectedMtimeSec,
        actualMtimeSec: Math.floor(entry.modifiedMs / 1000),
        ok: false,
        reason: 'directory'
      })
      continue
    }

    const actualMtimeSec = Math.floor(entry.modifiedMs / 1000)
    let actualHash: string | null
    try {
      actualHash = hashOf(await io.readTextFile(item.targetPath))
    } catch {
      actualHash = null
    }

    const reason = verifyReason(actualHash, item.sourceHash, expectedMtimeSec, actualMtimeSec)
    entries.push({
      relativePath: item.relativePath,
      targetPath: item.targetPath,
      expectedHash: item.sourceHash,
      actualHash,
      expectedMtimeSec,
      actualMtimeSec,
      ok: reason === undefined,
      reason
    })
  }

  const verified = entries.filter((entry) => entry.ok).length
  return { entries, verified, failed: entries.length - verified }
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true
}

/** Stable OS code of a thrown error: its own `code` first, then the message. */
function errorCodeOf(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code
  if (typeof code === 'string' && code !== '') return code
  const message = error instanceof Error ? error.message : ''
  return /\b(E[A-Z]{2,})\b/.exec(message)?.[1]
}

/** Content first, then whole-second mtime: each failure has one reason. */
function verifyReason(
  actualHash: string | null,
  expectedHash: string,
  expectedMtimeSec: number,
  actualMtimeSec: number
): TemplateVerifyReason | undefined {
  if (actualHash === null) return 'unreadable'
  if (actualHash !== expectedHash) return 'hash'
  if (actualMtimeSec !== expectedMtimeSec) return 'mtime'
  return undefined
}
