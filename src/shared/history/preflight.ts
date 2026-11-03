/**
 * Side-by-side preflight for a history reopen. Pure module: it only asks the
 * existing `PlatformPort` probe seam what lives at each stored path, so a bad
 * row is rejected before any session builder, tab or directory scan starts.
 */
import type { PathProbeKind } from '../platform/types'
import type { ComparisonHistoryErrorCode, ComparisonHistoryKind } from './types'

/** Which probe a healthy side must answer, by session kind. */
const EXPECTED_KIND: Readonly<
  Record<ComparisonHistoryKind, Exclude<PathProbeKind, 'missing'>>
> = {
  directory: 'directory',
  file: 'file',
  merge: 'file'
}

/** The slice of `PlatformPort` a preflight needs; nothing else is reached. */
export interface HistoryPreflightPort {
  statPath(path: string): Promise<PathProbeKind>
  listDirectory(path: string): Promise<readonly unknown[]>
}

export type HistoryPreflightResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: ComparisonHistoryErrorCode; readonly side: number }

/**
 * Probes each side in stored order (`base → ours → theirs` for a merge) and
 * stops at the first failure, so a row with several broken sides reports the
 * leftmost one. A directory side additionally proves its root is listable once
 * the type check passed; the listing itself is discarded.
 */
export async function preflightComparisonHistory(
  kind: ComparisonHistoryKind,
  paths: readonly string[],
  port: HistoryPreflightPort
): Promise<HistoryPreflightResult> {
  const expected = EXPECTED_KIND[kind]
  for (let side = 0; side < paths.length; side += 1) {
    const path = paths[side] ?? ''
    let probe: PathProbeKind
    try {
      probe = await port.statPath(path)
    } catch {
      // Permission and transport failures are both "unreadable"; the platform
      // exception never reaches the caller.
      return { ok: false, reason: 'unreadable', side }
    }
    if (probe === 'missing') return { ok: false, reason: 'missing', side }
    if (probe !== expected) return { ok: false, reason: 'type-changed', side }
    if (expected === 'directory') {
      try {
        await port.listDirectory(path)
      } catch {
        return { ok: false, reason: 'unreadable', side }
      }
    }
  }
  return { ok: true }
}
