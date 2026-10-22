/**
 * Pure aggregation of Electron's `app.getAppMetrics()` rows into the evidence
 * RSS triple. Kept outside Electron so vitest can pin the byte conversion and
 * the "largest Tab" rule without a running app.
 */
import type { PerfProcessIds, PerfRss } from './types'

/** The subset of one `ProcessMetric` the aggregation reads. */
export interface PerfProcessMetric {
  readonly pid: number
  /** Electron's process type: `Browser` / `Tab` / `Utility` / `GPU` / … */
  readonly type: string
  /** `ProcessMemoryInfo.workingSetSize`, in kilobytes. */
  readonly workingSetSize: number
}

export interface PerfRssReading {
  readonly rss: PerfRss
  readonly pids: PerfProcessIds
}

function kilobytesToBytes(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value * 1024) : 0
}

/**
 * Aggregates one metrics snapshot:
 *  - `main` is the Browser process,
 *  - `renderer` is the Tab process with the largest working set,
 *  - `appTotal` is the sum of every reported process.
 */
export function aggregateProcessRss(
  metrics: readonly PerfProcessMetric[]
): PerfRssReading {
  let appTotal = 0
  let main = 0
  let mainPid: number | null = null
  let renderer = 0
  let rendererPid: number | null = null

  for (const metric of metrics) {
    const bytes = kilobytesToBytes(metric.workingSetSize)
    appTotal += bytes
    if (metric.type === 'Browser') {
      main += bytes
      if (mainPid === null) mainPid = metric.pid
    } else if (metric.type === 'Tab' && bytes > renderer) {
      renderer = bytes
      rendererPid = metric.pid
    }
  }

  return {
    rss: { renderer, main, appTotal },
    pids: { renderer: rendererPid, main: mainPid }
  }
}
