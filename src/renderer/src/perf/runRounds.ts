/**
 * Renderer-side round orchestration for the directory memory harness.
 *
 * It deliberately reuses the workbench's own path — `compareSides` (scan →
 * `platform.digestFiles` → compare), `createDirectorySession` and the
 * `sessionStore` commit semantics — and only adds the measurement bookkeeping
 * the UI never needs: per-round digest accounting and a scalar report. The
 * caller owns the rendered shell, so the session list is committed exactly the
 * way `Workbench` commits it: only the active tab keeps its tree and no round
 * boundary ever drops a tab.
 */
import type { DirectoryComparison, DirectoryDiffNode, ProgressReporter } from '@core/directory/compare'
import type { ComparisonCache } from '@core/directory/compare'
import { createComparisonCache } from '@core/directory/compare'
import type { PlatformPort } from '@shared/platform/types'
import {
  SETTLE_STAGE_AFTER_HOT,
  SETTLE_STAGE_AFTER_TABS
} from '@shared/perf/verdict'
import type { PerfMode, PerfPair, PerfRoundCounts, PerfRoundReport } from '@shared/perf/types'
import type { WorkbenchSession } from '../workbench/session'
import {
  attachDirectoryComparison,
  createDirectorySession,
  releaseSessionTree
} from '../workbench/directoryCompare'
import {
  closeSessions,
  commitSessionTree,
  retainActiveTree
} from '../workbench/sessionStore'
import { compareSides, directorySides } from '../workbench/snapshotOps'

export interface PerfRoundInput {
  readonly mode: PerfMode
  readonly pairs: readonly PerfPair[]
  readonly rounds: number
  /** In-place hot upserts after the tab build (`retained` only). */
  readonly hotRounds?: number
  /** Wait after each settle stage before it is sampled (`retained` only). */
  readonly settleMs?: number
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
    activeId: string | null
  ) => void | Promise<void>
  readonly onRoundEnd?: (report: PerfRoundReport) => void | Promise<void>
  /** One named settle stage of a `retained` run, after the configured wait. */
  readonly onSettleStage?: (label: string, tabs: number) => void | Promise<void>
  /** Post-close reading of a `retained` run, after the configured wait. */
  readonly onReclaim?: (tabs: number) => void | Promise<void>
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Runs the configured measurement scene in this renderer process. The
 * comparison cache is created once, exactly like `Workbench` keeps one cache
 * across sessions, so a same-pair re-compare honestly reports zero hashed files.
 *
 *  - `upsert`: one tab re-compared in place.
 *  - `multisession`: one new tab per pair (tabs 1 → 2 → 3).
 *  - `retained`: one tab per pair, then `hotRounds` in-place upserts on the
 *    active pair, then the active tab is closed and its neighbour rebuilt.
 */
export async function runPerfRounds(
  platform: PlatformPort,
  input: PerfRoundInput,
  hooks: PerfRoundHooks = {}
): Promise<readonly PerfRoundReport[]> {
  const cache: ComparisonCache = createComparisonCache()
  const now = hooks.now ?? (() => Date.now())
  const settleMs = input.settleMs ?? 0
  const hotRounds = input.mode === 'retained' ? (input.hotRounds ?? 0) : 0
  const reports: PerfRoundReport[] = []
  let sessions: readonly WorkbenchSession[] = []
  let activeId: string | null = null

  const pause = async (): Promise<void> => {
    if (settleMs > 0) await delay(settleMs)
  }

  async function runComparison(round: number, pair: PerfPair): Promise<{
    readonly session: WorkbenchSession
    readonly startedAt: string
    readonly startMs: number
    readonly counts: PerfRoundCounts
  }> {
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
    return { session: createDirectorySession(comparison, sides), startedAt, startMs, counts }
  }

  async function commitRound(
    round: number,
    measured: Awaited<ReturnType<typeof runComparison>>
  ): Promise<void> {
    sessions = commitSessionTree(cache, sessions, measured.session)
    activeId = measured.session.id
    await hooks.onCommit?.(sessions, activeId)
    const report: PerfRoundReport = {
      index: round,
      startedAt: measured.startedAt,
      endedAt: new Date(now()).toISOString(),
      wallMs: Math.max(0, now() - measured.startMs),
      sessionId: measured.session.id,
      tabs: sessions.length,
      counts: measured.counts
    }
    reports.push(report)
    await hooks.onRoundEnd?.(report)
  }

  if (input.mode === 'retained') {
    for (let index = 0; index < input.pairs.length; index += 1) {
      const round = index + 1
      await commitRound(round, await runComparison(round, input.pairs[index]))
    }
    await pause()
    await hooks.onSettleStage?.(SETTLE_STAGE_AFTER_TABS, sessions.length)

    const hotPair = input.pairs[input.pairs.length - 1]
    for (let index = 1; index <= hotRounds; index += 1) {
      const round = input.pairs.length + index
      await commitRound(round, await runComparison(round, hotPair))
    }
    await pause()
    await hooks.onSettleStage?.(SETTLE_STAGE_AFTER_HOT, sessions.length)

    /**
     * Closes the active tab and reactivates its neighbour. Kept as its own
     * function so the closed session (and its tree) is off the async frame
     * before the settle wait; the post-GC reclaim reading must only see the
     * landing tab.
     */
    async function closeActiveTab(): Promise<void> {
      const closing = sessions.find((session) => session.id === activeId) ?? null
      if (closing === null) return
      const remaining = closeSessions(sessions, closing.id)
      releaseSessionTree(cache, closing, remaining)
      const landingId = remaining[remaining.length - 1]?.id ?? null
      sessions = retainActiveTree(remaining, landingId)
      activeId = landingId
      await hooks.onCommit?.(sessions, activeId)

      // The landing tab was summary-only; a real UI reactivates it, so the
      // harness rebuilds through the same warm cache before sampling reclaim.
      const landing = sessions.find((session) => session.id === landingId)
      if (landing?.sides !== undefined) {
        const comparison = await compareSides(platform, landing.sides, cache)
        sessions = sessions.map((session) =>
          session.id === landing.id ? attachDirectoryComparison(session, comparison) : session
        )
        await hooks.onCommit?.(sessions, activeId)
      }
    }

    await closeActiveTab()
    await pause()
    await hooks.onReclaim?.(sessions.length)
    return reports
  }

  for (let round = 1; round <= input.rounds; round += 1) {
    const pair = input.mode === 'upsert' ? input.pairs[0] : input.pairs[round - 1]
    await commitRound(round, await runComparison(round, pair))
  }

  return reports
}
