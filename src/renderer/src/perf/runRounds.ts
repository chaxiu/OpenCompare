/**
 * Renderer-side round orchestration for the directory memory harness.
 *
 * It deliberately reuses the workbench's own path — `compareSides` (scan →
 * `platform.digestFiles` → compare) plus `createDirectorySession` — and only
 * adds the measurement bookkeeping the UI never needs: one fresh session object
 * per round, real digest accounting and a per-round report. Sampling and
 * evidence writing stay in the main process.
 */
import type { DirectoryComparison, DirectoryDiffNode, ProgressReporter } from '@core/directory/compare'
import type { ComparisonCache } from '@core/directory/compare'
import { createComparisonCache } from '@core/directory/compare'
import type { PlatformPort } from '@shared/platform/types'
import type { PerfRoundCounts, PerfRoundReport } from '@shared/perf/types'
import type { WorkbenchSession } from '../workbench/session'
import { createDirectorySession, directorySessionId } from '../workbench/directoryCompare'
import { compareSides, directorySides } from '../workbench/snapshotOps'

export interface PerfRoundInput {
  readonly left: string
  readonly right: string
  readonly rounds: number
}

export interface PerfRoundHooks {
  /** Called before the round starts (after the boundary sample is taken). */
  readonly onRoundStart?: (round: number, startedAt: string) => void | Promise<void>
  /** Called after the fresh session is built and before the post-round sample. */
  readonly onSession?: (session: WorkbenchSession) => void
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

function roundSessionId(baseId: string, round: number): string {
  return `${baseId}#round-${round}`
}

/**
 * Runs `rounds` full comparisons in this renderer process. The comparison cache
 * is created once, exactly like `Workbench` keeps one cache across sessions, so
 * a hit round honestly reports zero hashed files. Every round builds a new
 * session object (never mutating the previous one) and reports its real digest
 * totals.
 */
export async function runPerfRounds(
  platform: PlatformPort,
  input: PerfRoundInput,
  hooks: PerfRoundHooks = {}
): Promise<readonly PerfRoundReport[]> {
  const sides = directorySides(input.left, input.right)
  const baseId = directorySessionId(input.left, input.right)
  const cache: ComparisonCache = createComparisonCache()
  const now = hooks.now ?? (() => Date.now())
  const reports: PerfRoundReport[] = []

  for (let round = 1; round <= input.rounds; round += 1) {
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
    // Same session builder as the UI, but scoped to the round: replacing a new
    // object each time is what the harness must prove, while the base id keeps
    // the usual `directory:<left> ↔ <right>` form.
    const session = createDirectorySession(comparison, sides)
    const roundSession: WorkbenchSession = {
      ...session,
      id: roundSessionId(baseId, round)
    }
    hooks.onSession?.(roundSession)

    const endedAt = new Date(now()).toISOString()
    const report: PerfRoundReport = {
      index: round,
      startedAt,
      endedAt,
      wallMs: Math.max(0, now() - startMs),
      sessionId: roundSession.id,
      counts
    }
    reports.push(report)
    await hooks.onRoundEnd?.(report)
  }

  return reports
}
