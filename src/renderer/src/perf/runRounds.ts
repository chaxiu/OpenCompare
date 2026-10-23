/**
 * Renderer-side round orchestration for the directory memory harness.
 *
 * It deliberately reuses the workbench's own path — `compareSides` (scan →
 * `platform.digestFiles` → compare), `createDirectorySession` and the
 * `sessionStore` commit semantics — and only adds the measurement bookkeeping
 * the UI never needs: per-round digest accounting and a scalar report. The
 * caller owns the rendered shell, so the session list is committed exactly the
 * way `Workbench.upsertSession` commits it; nothing releases a session before a
 * round boundary any more.
 */
import type { DirectoryComparison, DirectoryDiffNode, ProgressReporter } from '@core/directory/compare'
import type { ComparisonCache } from '@core/directory/compare'
import { createComparisonCache } from '@core/directory/compare'
import type { PlatformPort } from '@shared/platform/types'
import type { PerfMode, PerfPair, PerfRoundCounts, PerfRoundReport } from '@shared/perf/types'
import type { WorkbenchSession } from '../workbench/session'
import { createDirectorySession } from '../workbench/directoryCompare'
import { commitUpsert } from '../workbench/sessionStore'
import { compareSides, directorySides } from '../workbench/snapshotOps'

export interface PerfRoundInput {
  readonly mode: PerfMode
  readonly pairs: readonly PerfPair[]
  readonly rounds: number
}

export interface PerfRoundHooks {
  /** Called before the round starts (after the boundary sample is taken). */
  readonly onRoundStart?: (round: number, startedAt: string) => void | Promise<void>
  /**
   * Commits this round's session list to the shell and resolves once the new
   * tree is on screen, so the post-round sample never sees the previous tree.
   */
  readonly onCommit?: (
    next: readonly WorkbenchSession[],
    activeId: string
  ) => void | Promise<void>
  readonly onRoundEnd?: (report: PerfRoundReport) => void | Promise<void>
  readonly onProgress?: ProgressReporter
  /** Injectable clock in milliseconds; defaults to `Date.now`. */
  readonly now?: () => number
}

interface TreeCounts {
  readonly files: number
  readonly dirs: number
}

function countTree(node: DirectoryDiffNode): TreeCounts {
  let files = 0
  let dirs = 0
  if (node.kind === 'directory') {
    dirs += 1
    for (const child of node.children) {
      const counted = countTree(child)
      files += counted.files
      dirs += counted.dirs
    }
  } else {
    files += 1
  }
  return { files, dirs }
}

/**
 * Runs `rounds` full comparisons in this renderer process. The comparison cache
 * is created once, exactly like `Workbench` keeps one cache across sessions, so
 * a same-pair re-compare honestly reports zero hashed files. The session list is
 * carried across rounds: `upsert` replaces the single tab in place, while
 * `multisession` appends one tab per pair (1 → 2 → 3).
 */
export async function runPerfRounds(
  platform: PlatformPort,
  input: PerfRoundInput,
  hooks: PerfRoundHooks = {}
): Promise<readonly PerfRoundReport[]> {
  const cache: ComparisonCache = createComparisonCache()
  const now = hooks.now ?? (() => Date.now())
  const reports: PerfRoundReport[] = []
  let sessions: readonly WorkbenchSession[] = []

  for (let round = 1; round <= input.rounds; round += 1) {
    const pair = input.mode === 'upsert' ? input.pairs[0] : input.pairs[round - 1]
    const sides = directorySides(pair.left, pair.right)
    const startedAt = new Date(now()).toISOString()
    await hooks.onRoundStart?.(round, startedAt)
    const startMs = now()

    const digestStats = { files: 0, bytes: 0 }
    const comparison: DirectoryComparison = await compareSides(platform, sides, cache, {
      onProgress: hooks.onProgress,
      onDigestStats: (stats) => {
        digestStats.files += stats.files
        digestStats.bytes += stats.bytes
      }
    })

    const counts: PerfRoundCounts = {
      ...countTree(comparison.root),
      hashedFiles: digestStats.files,
      bytesToHash: digestStats.bytes
    }
    // Same session builder and commit semantics as the UI; the previous tab
    // object is replaced, never explicitly released before the boundary.
    const session = createDirectorySession(comparison, sides)
    sessions = commitUpsert(cache, sessions, session)
    await hooks.onCommit?.(sessions, session.id)

    const endedAt = new Date(now()).toISOString()
    const report: PerfRoundReport = {
      index: round,
      startedAt,
      endedAt,
      wallMs: Math.max(0, now() - startMs),
      sessionId: session.id,
      tabs: sessions.length,
      counts
    }
    reports.push(report)
    await hooks.onRoundEnd?.(report)
  }

  return reports
}
