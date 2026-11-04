/**
 * Shared contract for starting a real three-way merge from three typed paths.
 *
 * Pure module: no Electron, DOM or Node file-system imports. It reuses the
 * comparison entry point's path normalisation and probe seam, so a merge path
 * is folded exactly like a comparison path and the file system is only reached
 * through {@link PathProbe}.
 */
import { normalizePathValue } from './compareRequest'
import type { PathContext, PathProbe } from './compareRequest'
import type { PathProbeKind } from './platform/types'

/** The three ordered sides of a merge; the order is part of the identity. */
export const MERGE_SIDES = ['base', 'ours', 'theirs'] as const

export type MergeSide = (typeof MERGE_SIDES)[number]

/** Fully normalised, validated merge inputs. */
export interface MergePaths {
  readonly base: string
  readonly ours: string
  readonly theirs: string
}

/** Stable failure codes the dialog and the shell localize themselves. */
export type MergeErrorCode =
  | 'EMPTY_PATH'
  | 'NOT_FOUND'
  | 'ACCESS_DENIED'
  | 'NOT_A_FILE'
  | 'UNSUPPORTED_FILE_TYPE'

export interface MergeError {
  readonly code: MergeErrorCode
  readonly side: MergeSide
  /** Normalised path of the failing side; empty for an empty input. */
  readonly path: string
}

export type MergeResult =
  | { readonly ok: true; readonly paths: MergePaths }
  | { readonly ok: false; readonly error: MergeError }

function failure(code: MergeErrorCode, side: MergeSide, path: string): MergeResult {
  return { ok: false, error: { code, side, path } }
}

/** Normalises one side, preserving the frozen base → ours → theirs order. */
function normalizeSides(
  raw: Partial<Record<MergeSide, string>>,
  context: PathContext
): { readonly ok: true; readonly paths: MergePaths } | { readonly ok: false; readonly error: MergeError } {
  const normalized: Record<MergeSide, string> = { base: '', ours: '', theirs: '' }
  for (const side of MERGE_SIDES) {
    const value = raw[side]
    const path = normalizePathValue(typeof value === 'string' ? value : '', context)
    if (path === null) return failure('EMPTY_PATH', side, '')
    normalized[side] = path
  }
  return { ok: true, paths: normalized }
}

/** Parses the three strings typed / pasted into the manual merge entry. */
export function parseMergeManualPaths(
  base: string,
  ours: string,
  theirs: string,
  context: PathContext = {}
): MergeResult {
  return normalizeSides({ base, ours, theirs }, context)
}

type ProbeOutcome =
  | { readonly ok: true; readonly kind: PathProbeKind }
  | { readonly ok: false }

async function probeSide(path: string, probe: PathProbe): Promise<ProbeOutcome> {
  try {
    return { ok: true, kind: await probe.statPath(path) }
  } catch {
    // Permission and transport errors both surface as "unreadable"; the
    // underlying exception is never leaked to the caller.
    return { ok: false }
  }
}

/**
 * Resolves three raw paths into validated {@link MergePaths}: normalises each
 * side, probes each exactly once, then applies the frozen precedence
 * base → ours → theirs and, inside one side, ACCESS_DENIED → NOT_FOUND →
 * NOT_A_FILE. File families are decided by `buildMergeSession` from extension
 * + content, so validation never reads file bytes. Duplicate paths are legal
 * merge inputs.
 */
export async function resolveMergeRequest(
  paths: Partial<Record<MergeSide, string>>,
  context: PathContext & { readonly probe: PathProbe }
): Promise<MergeResult> {
  const normalized = normalizeSides(paths, context)
  if (!normalized.ok) return normalized

  const probes = new Map<MergeSide, ProbeOutcome>()
  for (const side of MERGE_SIDES) {
    probes.set(side, await probeSide(normalized.paths[side], context.probe))
  }

  for (const side of MERGE_SIDES) {
    const outcome = probes.get(side)
    const path = normalized.paths[side]
    if (outcome === undefined || !outcome.ok) return failure('ACCESS_DENIED', side, path)
    if (outcome.kind === 'missing') return failure('NOT_FOUND', side, path)
    if (outcome.kind === 'directory') return failure('NOT_A_FILE', side, path)
  }

  return { ok: true, paths: normalized.paths }
}
