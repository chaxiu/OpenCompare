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
  /** Body captured while hashing, reused by the extractor. */
  readonly text: string
}

export interface TemplateConflictCandidate {
  readonly path: string
  readonly size: number
  readonly hash: string
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
        details.push({ path: candidate.path, size: candidate.size, hash: hashed.hash })
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
        text: candidateContent.text
      })
    } else {
      conflicts.push({
        relativePath,
        templatePath: slot.path,
        reason: 'content-mismatch',
        candidates: [{ path: candidate.path, size: candidate.size, hash: candidateContent.hash }]
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
    const index = Math.max(target.lastIndexOf('/'), target.lastIndexOf('\\'))
    if (index > 0) await io.ensureDirectory(target.slice(0, index))
    await io.writeTextFile(target, item.text)
    paths.push(target)
  }

  return { written: paths.length, paths }
}
