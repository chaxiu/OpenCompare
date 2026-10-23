/**
 * Session-list commit semantics shared by the workbench and the memory harness.
 *
 * The two used to evolve separately: `Workbench` replaced the tab list through a
 * functional state updater and released the replaced comparison's digest cache
 * entries, while the harness built a throwaway session per round and explicitly
 * dropped it at the next round boundary. That divergence hid the renderer's real
 * holding path. Both now derive the list from these pure helpers, so a harness
 * round holds exactly what a UI re-compare holds.
 */
import type { ComparisonCache } from '@core/directory/compare'
import { releaseDirectoryComparison } from './directoryCompare'
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

/**
 * Upsert plus the cache release of the replaced session. Roots still used by an
 * open session (including the new one) keep their warm digest entries.
 */
export function commitUpsert(
  cache: ComparisonCache,
  current: readonly WorkbenchSession[],
  session: WorkbenchSession
): readonly WorkbenchSession[] {
  const next = upsertSessions(current, session)
  const released = current.find((item) => item.id === session.id)
  if (released?.directory !== undefined) {
    releaseDirectoryComparison(cache, released.directory, next)
  }
  return next
}
