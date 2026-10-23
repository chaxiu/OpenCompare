/**
 * Session-list commit semantics shared by the workbench and the memory harness.
 *
 * The two used to evolve separately: `Workbench` replaced the tab list through a
 * functional state updater and released the replaced comparison's digest cache
 * entries, while the harness built a throwaway session per round and explicitly
 * dropped it at the next round boundary. That divergence hid the renderer's real
 * holding path. Both now derive the list from these pure helpers, so a harness
 * round holds exactly what a UI re-compare holds. Every open directory tab
 * keeps its own tree, so a commit never detaches another tab.
 */
import type { ComparisonCache } from '@core/directory/compare'
import { releaseSessionTree } from './directoryCompare'
import type { WorkbenchSession } from './session'

/** Same id replaces in place (order preserved); a new id appends. */
export function upsertSessions(
  current: readonly WorkbenchSession[],
  session: WorkbenchSession
): readonly WorkbenchSession[] {
  if (!current.some((item) => item.id === session.id)) return [...current, session]
  return current.map((item) => (item.id === session.id ? session : item))
}

/** Replaces one tab in place, always keeping the id the tab was opened with. */
export function replaceSessions(
  current: readonly WorkbenchSession[],
  id: string,
  session: WorkbenchSession
): readonly WorkbenchSession[] {
  return current.map((item) => (item.id === id ? { ...session, id } : item))
}

/** Removes one tab; the order of the rest is unchanged. */
export function closeSessions(
  current: readonly WorkbenchSession[],
  id: string
): readonly WorkbenchSession[] {
  return current.filter((item) => item.id !== id)
}

export interface CommitSessionOptions {
  /** Replace this tab id in place instead of upserting by the new session's id. */
  readonly replaceId?: string
}

/**
 * Upsert (or replace in place) plus the cache release of the replaced session.
 * Every other open tab keeps its own tree and object identity. This is the one
 * commit path shared by the workbench's new compare / sync refresh and every
 * harness round, so "no round boundary drops a tab" holds for both.
 */
export function commitSessionTree(
  cache: ComparisonCache,
  current: readonly WorkbenchSession[],
  session: WorkbenchSession,
  options: CommitSessionOptions = {}
): readonly WorkbenchSession[] {
  const replaceId = options.replaceId
  const next =
    replaceId === undefined
      ? upsertSessions(current, session)
      : replaceSessions(current, replaceId, session)
  const previous =
    replaceId === undefined
      ? current.find((item) => item.id === session.id)
      : current.find((item) => item.id === replaceId)
  if (previous !== undefined) releaseSessionTree(cache, previous, next)
  return next
}

/** Upsert plus the cache release of the replaced session (thin wrapper). */
export function commitUpsert(
  cache: ComparisonCache,
  current: readonly WorkbenchSession[],
  session: WorkbenchSession
): readonly WorkbenchSession[] {
  return commitSessionTree(cache, current, session)
}
