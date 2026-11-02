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
 * Name matching is exact first, then a *unique* case-fold fallback: macOS APFS
 * is case-insensitive by default, so `logo.png` and `Logo.png` are one file.
 * A case-only hit with the same hash is `matched`; a different hash is
 * `content-mismatch`; several case variants are `ambiguous`.
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

/**
 * Case fold used **only for comparison**: the output root may hold `logo.png`
 * while a template slot says `Logo.png` (macOS APFS is case-insensitive). It is
 * never used to build a path that is written to disk.
 */
export function foldCase(value: string): string {
  return value.toLowerCase()
}

/** Stable reason of a relative slot path that is absolute or escapes its root. */
export type TemplatePathIssue = 'path-escape'

/**
 * What a row does with its source. Placement is non-destructive by default
 * (`copy`); `move` is the only other value and is always an explicit choice.
 */
export type TemplateAction = 'copy' | 'move'

/**
 * Pure relative-path safety check shared by the plan, the resolver, the
 * executor and the gates. Only string handling is used (`\` → `/`, segment
 * split, drive / UNC / absolute detection), so the renderer and vitest can
 * import it without `node:path`.
 *
 * A path is refused when it is empty, absolute (POSIX `/`, Windows `C:`, UNC
 * `\\server\share`), contains a `..` segment after normalization, or resolves
 * to the root itself instead of a file below it.
 */
export function templatePathIssue(relativePath: string): TemplatePathIssue | undefined {
  if (relativePath === '') return 'path-escape'
  const normalized = relativePath.replace(/\\/g, '/')
  if (normalized.startsWith('/')) return 'path-escape'
  if (/^[A-Za-z]:/.test(normalized)) return 'path-escape'

  let depth = 0
  for (const segment of normalized.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') return 'path-escape'
    depth += 1
  }
  return depth === 0 ? 'path-escape' : undefined
}

export interface TemplateMatch {
  /** Template slot, i.e. the relative path the file is restored to. */
  readonly relativePath: string
  readonly templatePath: string
  readonly sourcePath: string
  /** `sourcePath` relative to `incomingRoot`, `/`-normalized. */
  readonly sourceRelativePath: string
  readonly size: number
  readonly hash: string
  /** Source mtime carried onto the target so the restore keeps the source time. */
  readonly modifiedMs: number
  /** Body captured while hashing, reused by the extractor. */
  readonly text: string
}

export interface TemplateConflictCandidate {
  readonly path: string
  /** `path` relative to `incomingRoot`, `/`-normalized. */
  readonly sourceRelativePath: string
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
  /** Template A slot digest; lets a slot whose source already moved read as placed. */
  readonly hash: string
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
  const incomingByFoldedName = new Map<string, ScannedNode[]>()
  // The source's path relative to tree B's root, taken from the scan index so no
  // caller ever slices it back out of an absolute path.
  const sourceRelativePaths = new Map<string, string>()
  for (const [relativePath, node] of incoming.index.entries()) {
    if (node.kind !== 'file') continue
    sourceRelativePaths.set(node.path, relativePath)
    const exactBucket = incomingByName.get(node.name)
    if (exactBucket === undefined) incomingByName.set(node.name, [node])
    else exactBucket.push(node)
    const folded = foldCase(node.name)
    const foldedBucket = incomingByFoldedName.get(folded)
    if (foldedBucket === undefined) incomingByFoldedName.set(folded, [node])
    else foldedBucket.push(node)
  }

  const templateFiles = [...template.index.entries()]
    .filter(([, node]) => node.kind === 'file')
    .sort(([left], [right]) => left.localeCompare(right))

  const matched: TemplateMatch[] = []
  const conflicts: TemplateConflict[] = []
  const missing: TemplateMissing[] = []
  const consumed = new Set<string>()

  for (const [relativePath, slot] of templateFiles) {
    // Exact spelling always wins; the case-fold bucket is only a fallback when
    // no candidate carries the slot's own spelling.
    const exact = incomingByName.get(slot.name) ?? []
    const caseFold = exact.length === 0
    const candidates = caseFold
      ? (incomingByFoldedName.get(foldCase(slot.name)) ?? [])
      : exact
    if (candidates.length === 0) {
      // The slot digest is kept even without a source: after a move the file is
      // gone from B, and the output root's copy is what proves the slot placed.
      const slotContent = await contentOf(slot)
      missing.push({
        relativePath,
        templatePath: slot.path,
        size: slot.size,
        hash: slotContent.hash
      })
      continue
    }

    const slotContent = await contentOf(slot)

    if (candidates.length > 1) {
      const details: TemplateConflictCandidate[] = []
      for (const candidate of candidates) {
        const hashed = await contentOf(candidate)
        details.push({
          path: candidate.path,
          sourceRelativePath: sourceRelativePaths.get(candidate.path) ?? '',
          size: candidate.size,
          hash: hashed.hash,
          modifiedMs: candidate.modifiedMs
        })
      }
      // A case-only variant is a conflict candidate, never an "unused" file:
      // leaving it listed there would repeat the original missing + unused bug.
      if (caseFold) for (const candidate of candidates) consumed.add(candidate.path)
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
        sourceRelativePath: sourceRelativePaths.get(candidate.path) ?? '',
        size: candidate.size,
        hash: candidateContent.hash,
        modifiedMs: candidate.modifiedMs,
        text: candidateContent.text
      })
    } else {
      if (caseFold) consumed.add(candidate.path)
      conflicts.push({
        relativePath,
        templatePath: slot.path,
        reason: 'content-mismatch',
        candidates: [
          {
            path: candidate.path,
            sourceRelativePath: sourceRelativePaths.get(candidate.path) ?? '',
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

/**
 * Exact spelling first; otherwise the only case-only variant. Several case
 * variants are never guessed, so an ambiguous listing reads as not found.
 */
function entryForName(
  entries: readonly DirectoryEntry[],
  name: string
): DirectoryEntry | undefined {
  const exact = entries.find((entry) => entry.name === name)
  if (exact !== undefined) return exact
  const folded = foldCase(name)
  const variants = entries.filter((entry) => foldCase(entry.name) === folded)
  return variants.length === 1 ? variants[0] : undefined
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
  /** Source relative to `incomingRoot`, `/`-normalized; `null` without a source. */
  readonly sourceRelativePath: string | null
  /** Slot relative to the output root, `/`-normalized. */
  readonly targetRelativePath: string
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
  /**
   * Action this row takes when executed without an explicit move choice:
   * always `copy`, and absent on rows without a source or already placed.
   */
  readonly defaultAction?: TemplateAction
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
  readonly sourceRelativePath: string
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
 *
 * The target lookup is exact first, then a unique case-fold hit (APFS is
 * case-insensitive): a case-only file with different content is an explicit
 * overwrite, one with the same content is `placed`, and several case variants
 * are never guessed — they stay unchecked and are never `placed`.
 */
export function createTemplatePlan(
  result: TemplateMatchResult,
  options: TemplatePlanOptions
): TemplatePlan {
  const existingFiles = new Set(options.existingFiles ?? [])
  const existingDirectories = new Set(options.existingDirectories ?? [])
  const existingFileHashes = options.existingFileHashes ?? {}

  function byFoldedPath(paths: readonly string[]): Map<string, string[]> {
    const index = new Map<string, string[]>()
    for (const path of paths) {
      const folded = foldCase(path)
      const bucket = index.get(folded)
      if (bucket === undefined) index.set(folded, [path])
      else bucket.push(path)
    }
    return index
  }

  const filesByFoldedPath = byFoldedPath([...existingFiles])
  const directoriesByFoldedPath = byFoldedPath([...existingDirectories])

  interface TargetState {
    /** A directory holds the target (exact or the only case-only variant). */
    readonly occupiedByDirectory: boolean
    /** The actual output path, when exactly one file holds the target. */
    readonly existingPath: string | null
    /** Several case-only file variants: never `placed`, always an overwrite. */
    readonly ambiguousCase: boolean
  }

  function targetStateOf(relativePath: string): TargetState {
    if (existingDirectories.has(relativePath)) {
      return { occupiedByDirectory: true, existingPath: null, ambiguousCase: false }
    }
    if (existingFiles.has(relativePath)) {
      return { occupiedByDirectory: false, existingPath: relativePath, ambiguousCase: false }
    }

    const folded = foldCase(relativePath)
    if ((directoriesByFoldedPath.get(folded) ?? []).length > 0) {
      return { occupiedByDirectory: true, existingPath: null, ambiguousCase: false }
    }
    const files = filesByFoldedPath.get(folded) ?? []
    if (files.length > 1) {
      return { occupiedByDirectory: false, existingPath: null, ambiguousCase: true }
    }
    return { occupiedByDirectory: false, existingPath: files[0] ?? null, ambiguousCase: false }
  }

  function isPlaced(state: TargetState, sourceHashes: readonly string[]): boolean {
    if (state.occupiedByDirectory || state.ambiguousCase || state.existingPath === null) {
      return false
    }
    const targetHash = existingFileHashes[state.existingPath]
    return targetHash !== undefined && sourceHashes.includes(targetHash)
  }

  function toEntry(
    outcome: TemplatePlanEntry['outcome'],
    slot: SlotInput,
    source: SourceInput | null,
    candidates: readonly TemplateConflictCandidate[] = [],
    conflictReason?: TemplateConflict['reason']
  ): TemplatePlanEntry {
    const state = targetStateOf(slot.relativePath)
    const unsafe = templatePathIssue(slot.relativePath) !== undefined
    const overwrite =
      outcome !== 'placed' &&
      !state.occupiedByDirectory &&
      (state.existingPath !== null || state.ambiguousCase)
    return {
      relativePath: slot.relativePath,
      outcome,
      templatePath: slot.templatePath,
      sourcePath: source?.sourcePath ?? null,
      sourceRelativePath: source?.sourceRelativePath ?? null,
      targetRelativePath: slot.relativePath,
      targetPath: joinRelativePath(options.outputRoot, slot.relativePath),
      size: slot.size ?? 0,
      sourceHash: source?.sourceHash ?? null,
      sourceModifiedMs: source?.modifiedMs ?? null,
      overwrite,
      occupiedByDirectory: state.occupiedByDirectory,
      defaultChecked:
        outcome === 'matched' && !unsafe && !overwrite && !state.occupiedByDirectory,
      defaultAction:
        outcome === 'placed' || source === null ? undefined : 'copy',
      conflictReason,
      candidates
    }
  }

  const matched: TemplatePlanEntry[] = []
  const placed: TemplatePlanEntry[] = []
  for (const item of result.matched) {
    const source: SourceInput = {
      sourcePath: item.sourcePath,
      sourceRelativePath: item.sourceRelativePath,
      sourceHash: item.hash,
      modifiedMs: item.modifiedMs
    }
    if (isPlaced(targetStateOf(item.relativePath), [item.hash])) {
      placed.push(toEntry('placed', item, source))
      continue
    }
    matched.push(toEntry('matched', item, source))
  }
  const missing: TemplatePlanEntry[] = []
  for (const item of result.missing) {
    // A source can already be gone from B because an earlier move removed it.
    // The output root's copy is then the only proof: same template digest means
    // the slot is placed, not missing.
    if (isPlaced(targetStateOf(item.relativePath), [item.hash])) {
      placed.push(toEntry('placed', item, null))
      continue
    }
    missing.push(toEntry('missing', item, null))
  }
  const conflicts: TemplatePlanEntry[] = []
  for (const item of result.conflicts) {
    if (
      isPlaced(
        targetStateOf(item.relativePath),
        item.candidates.map((candidate) => candidate.hash)
      )
    ) {
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
  /**
   * Template slot relative paths the user explicitly set to move. Only a row
   * that is both checked and executable honours it; every other row copies.
   */
  readonly movePaths?: readonly string[]
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
  /** What the row does with its source; `move` implies an explicit choice. */
  readonly action: TemplateAction
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
  /** The slot path is absolute, empty or escapes the output root. */
  | 'path-escape'
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
  /**
   * Action of every source-bearing plan row (checked or not). An unchecked row
   * reads `copy`; a row without a source has no entry at all.
   */
  readonly actions: Readonly<Record<string, TemplateAction>>
  readonly copyCount: number
  readonly moveCount: number
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
  const movePaths = new Set(selection.movePaths ?? [])
  const conflictChoices = selection.conflictChoices ?? {}
  const rejected: TemplateRejection[] = []

  function reject(relativePath: string, reason: TemplateRejectionReason): void {
    rejected.push({ relativePath, reason })
  }

  const slots = [...plan.missing, ...plan.matched, ...plan.conflicts].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  )

  /** Every row that resolved to a source, checked or not: the action map's key set. */
  const sourceRows: TemplatePlanEntry[] = []
  const executableRows: Omit<TemplateExecutableEntry, 'action'>[] = []

  for (const entry of slots) {
    if (entry.outcome === 'placed') continue
    const choice = conflictChoices[entry.relativePath]
    const chosen =
      entry.outcome === 'conflict'
        ? entry.candidates.find((item) => item.path === choice)
        : undefined
    const hasSource =
      entry.outcome === 'conflict'
        ? chosen !== undefined
        : entry.outcome === 'matched' &&
          entry.sourcePath !== null &&
          entry.sourceHash !== null &&
          entry.sourceModifiedMs !== null
    if (hasSource) sourceRows.push(entry)

    if (!checked.has(entry.relativePath)) continue
    // Defense in depth: the plan never default-checks such a row, but an
    // explicit check must still be refused before it reaches the executor.
    if (templatePathIssue(entry.relativePath) !== undefined) {
      reject(entry.relativePath, 'path-escape')
      continue
    }
    if (entry.occupiedByDirectory) {
      reject(entry.relativePath, 'target-occupied-by-directory')
      continue
    }
    if (entry.outcome === 'missing') {
      reject(entry.relativePath, 'not-executable')
      continue
    }
    if (entry.outcome === 'matched') {
      if (!hasSource) {
        reject(entry.relativePath, 'not-executable')
        continue
      }
      executableRows.push({
        relativePath: entry.relativePath,
        sourcePath: entry.sourcePath as string,
        targetPath: entry.targetPath,
        sourceHash: entry.sourceHash as string,
        modifiedMs: entry.sourceModifiedMs as number,
        size: entry.size
      })
      continue
    }

    if (choice === undefined) {
      reject(entry.relativePath, 'conflict-unresolved')
      continue
    }
    if (chosen === undefined) {
      reject(entry.relativePath, 'conflict-candidate-outside-set')
      continue
    }
    executableRows.push({
      relativePath: entry.relativePath,
      sourcePath: chosen.path,
      targetPath: entry.targetPath,
      sourceHash: chosen.hash,
      modifiedMs: chosen.modifiedMs,
      size: chosen.size
    })
  }

  // One source file can only satisfy one slot: the first by relative path wins.
  // `movePaths` is honoured last, so only a checked, executable row can move.
  const sources = new Set<string>()
  const executable: TemplateExecutableEntry[] = []
  for (const entry of executableRows) {
    if (sources.has(entry.sourcePath)) {
      reject(entry.relativePath, 'duplicate-source')
      continue
    }
    sources.add(entry.sourcePath)
    executable.push({
      ...entry,
      action: movePaths.has(entry.relativePath) ? 'move' : 'copy'
    })
  }

  // The action map covers every source-bearing row; an unchecked or refused row
  // keeps the non-destructive default, and a source-less row gets no entry.
  const actions: Record<string, TemplateAction> = {}
  for (const entry of sourceRows) actions[entry.relativePath] = 'copy'
  for (const entry of executable) actions[entry.relativePath] = entry.action

  rejected.sort((left, right) => left.relativePath.localeCompare(right.relativePath))

  return {
    plan,
    counts: plan.counts,
    executable,
    executableCount: executable.length,
    actions,
    copyCount: executable.filter((entry) => entry.action === 'copy').length,
    moveCount: executable.filter((entry) => entry.action === 'move').length,
    rejected,
    rejectedCount: rejected.length
  }
}

/** IO seam of plan execution; the renderer binds it to `PlatformPort`. */
export interface TemplateExecuteIo {
  readonly readTextFile: (path: string) => Promise<string>
  readonly writeTextFile: (path: string, content: string, modifiedMs?: number) => Promise<void>
  readonly ensureDirectory: (path: string) => Promise<void>
  /** One directory level, used to re-read the written target and the source mtime. */
  readonly listDirectory: (path: string) => Promise<readonly DirectoryEntry[]>
  /** Removes exactly one planned source after its target checked out. */
  readonly deleteFile: (path: string) => Promise<void>
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
  /** What this row did with its source. */
  readonly action: TemplateAction
}

export type TemplateWriteFailureReason =
  /** The source body changed after planning, so the row was written zero bytes. */
  | 'source-drift'
  /** The source could not be read back at all. */
  | 'source-unreadable'
  /** The slot path is absolute, empty or escapes the output root; nothing was written. */
  | 'path-escape'
  /** The filesystem refused the directory or the write itself. */
  | 'write-failed'
  /** A move's written target is gone before its source could be removed. */
  | 'move-target-missing'
  /** A move's target body no longer digests to the current source body. */
  | 'move-target-hash'
  /** A move's target whole-second mtime differs from the current source mtime. */
  | 'move-target-mtime'
  /** A move's target or source could not be read back for the post-write check. */
  | 'move-target-unreadable'
  /** The post-write check passed but the OS refused to remove the source. */
  | 'move-delete-failed'

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
  /** Rows whose source was removed after a passing post-write check. */
  readonly movedCount: number
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
    // A crafted manifest may still carry an escaping slot: refuse it before the
    // source is read, so the row writes zero bytes while the rest continues.
    if (templatePathIssue(entry.relativePath) !== undefined) {
      fail(entry, 'path-escape')
      continue
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

    // A move is only complete once the target proves equal to the *current*
    // source. The source is removed last, by its recorded path and nothing else.
    if (entry.action === 'move') {
      const facts = await readFileFacts(io, entry.sourcePath, hashOf)
      if (facts === null) {
        fail(entry, 'move-target-unreadable')
        continue
      }
      const check = await checkTargetAt(io, entry.targetPath, facts.hash, facts.mtimeSec)
      if (!check.ok) {
        fail(entry, moveFailureReason(check.reason))
        continue
      }
      try {
        await io.deleteFile(entry.sourcePath)
      } catch (error) {
        if (isOperationCancelled(error)) throw error
        fail(entry, 'move-delete-failed', error)
        continue
      }
    }

    written.push({
      relativePath: entry.relativePath,
      sourcePath: entry.sourcePath,
      targetPath: entry.targetPath,
      sourceHash: entry.sourceHash,
      modifiedMs: entry.modifiedMs,
      action: entry.action
    })
  }

  return {
    written,
    writtenCount: written.length,
    movedCount: written.filter((entry) => entry.action === 'move').length,
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
  /** A move row's source still exists after the run. */
  | 'source-retained'
  /** A copy row's source is gone after the run. */
  | 'source-missing'

/** One written row compared against the disk after the run. */
export interface TemplateVerificationEntry {
  readonly relativePath: string
  readonly targetPath: string
  readonly sourcePath: string
  readonly action: TemplateAction
  readonly expectedHash: string
  readonly actualHash: string | null
  /** Whole-second mtime expectation (`Math.floor(ms / 1000)`). */
  readonly expectedMtimeSec: number
  readonly actualMtimeSec: number | null
  /** True when the source file no longer exists on disk after the run. */
  readonly sourceDeleted: boolean
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

interface LocatedEntry {
  /** `undefined` when the parent listing itself failed. */
  readonly listing: readonly DirectoryEntry[] | undefined
  readonly entry: DirectoryEntry | undefined
}

/** The entry at `path` through its parent listing, exact spelling first. */
async function entryAt(
  io: Pick<TemplateVerifyIo, 'listDirectory'>,
  path: string
): Promise<LocatedEntry> {
  const parent = parentPathOf(path)
  const name = nameOfPath(path)
  try {
    const listing = await io.listDirectory(parent)
    return { listing, entry: entryForName(listing, name) }
  } catch {
    return { listing: undefined, entry: undefined }
  }
}

interface TargetCheck {
  readonly ok: boolean
  readonly actualHash: string | null
  readonly actualMtimeSec: number | null
  readonly reason?: TemplateVerifyReason
}

/**
 * The one post-write judgement shared by the executor's move check and the
 * result step: existence, body SHA-256 and whole-second mtime.
 */
async function checkTargetAt(
  io: TemplateVerifyIo,
  targetPath: string,
  expectedHash: string,
  expectedMtimeSec: number
): Promise<TargetCheck> {
  const hashOf = io.hash ?? sha256Hex
  const { listing, entry } = await entryAt(io, targetPath)
  if (entry === undefined) {
    return {
      ok: false,
      actualHash: null,
      actualMtimeSec: null,
      reason: listing === undefined ? 'unreadable' : 'missing'
    }
  }
  if (entry.isDirectory) {
    return {
      ok: false,
      actualHash: null,
      actualMtimeSec: Math.floor(entry.modifiedMs / 1000),
      reason: 'directory'
    }
  }

  const actualMtimeSec = Math.floor(entry.modifiedMs / 1000)
  let actualHash: string | null
  try {
    // The listing carries the entry's real spelling, so a case-only target is
    // read by its actual path instead of the planned spelling.
    actualHash = hashOf(await io.readTextFile(entry.path))
  } catch {
    actualHash = null
  }

  const reason = verifyReason(actualHash, expectedHash, expectedMtimeSec, actualMtimeSec)
  return { ok: reason === undefined, actualHash, actualMtimeSec, reason }
}

/** Current body digest and whole-second mtime of a file, or `null` when unreadable. */
async function readFileFacts(
  io: TemplateExecuteIo,
  path: string,
  hashOf: (text: string) => string
): Promise<{ readonly hash: string; readonly mtimeSec: number } | null> {
  const { listing, entry } = await entryAt(io, path)
  if (listing === undefined || entry === undefined || entry.isDirectory) return null
  try {
    return {
      hash: hashOf(await io.readTextFile(entry.path)),
      mtimeSec: Math.floor(entry.modifiedMs / 1000)
    }
  } catch {
    return null
  }
}

/** Maps a failed target check onto the move row's own stable failure reason. */
function moveFailureReason(reason: TemplateVerifyReason | undefined): TemplateWriteFailureReason {
  switch (reason) {
    case 'missing':
      return 'move-target-missing'
    case 'hash':
      return 'move-target-hash'
    case 'mtime':
      return 'move-target-mtime'
    default:
      return 'move-target-unreadable'
  }
}

/**
 * Re-checks every row this run wrote: existence, the source SHA-256 recomputed
 * from the target body, the mtime at **second** granularity, and the source's
 * own fate (a move must have removed it, a copy must have kept it). Sub-second
 * write precision never fails a row; a real second of drift does.
 */
export async function verifyTemplateExtraction(
  written: readonly TemplateWrittenEntry[],
  io: TemplateVerifyIo
): Promise<TemplateVerification> {
  const listings = new Map<string, Promise<readonly DirectoryEntry[]>>()

  function listingOf(directory: string): Promise<readonly DirectoryEntry[]> {
    const cached = listings.get(directory)
    if (cached !== undefined) return cached
    const pending = io.listDirectory(directory)
    listings.set(directory, pending)
    return pending
  }

  const cachedIo: TemplateVerifyIo = { ...io, listDirectory: listingOf }
  const entries: TemplateVerificationEntry[] = []
  for (const item of written) {
    const expectedMtimeSec = Math.floor(item.modifiedMs / 1000)
    const check = await checkTargetAt(cachedIo, item.targetPath, item.sourceHash, expectedMtimeSec)
    const source = await entryAt(cachedIo, item.sourcePath)
    const sourceDeleted = source.entry === undefined

    let reason = check.reason
    if (reason === undefined) {
      if (source.listing === undefined) reason = 'unreadable'
      else if (item.action === 'move' && !sourceDeleted) reason = 'source-retained'
      else if (item.action === 'copy' && sourceDeleted) reason = 'source-missing'
    }

    entries.push({
      relativePath: item.relativePath,
      targetPath: item.targetPath,
      sourcePath: item.sourcePath,
      action: item.action,
      expectedHash: item.sourceHash,
      actualHash: check.actualHash,
      expectedMtimeSec,
      actualMtimeSec: check.actualMtimeSec,
      sourceDeleted,
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
