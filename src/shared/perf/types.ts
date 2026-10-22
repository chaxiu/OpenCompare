/**
 * Directory memory-harness contract, shared by the main process (sampling and
 * evidence), the renderer (round orchestration), preload and the unit tests.
 *
 * The harness is the only place that speaks these types; the normal workbench
 * never imports them at runtime beyond the activation check.
 */
export type PerfProfileName = 'real' | 'gate'

/** One profile's hard limits, loaded from `perf/profiles.json`. */
export interface PerfThresholds {
  /** Renderer RSS peak ceiling in bytes. */
  readonly rendererPeakBytes: number
  /** Whole-app RSS peak ceiling in bytes (all processes). */
  readonly appTotalPeakBytes: number
  /** Absolute ceiling of the 3rd-round renderer increment in bytes. */
  readonly roundDeltaMaxBytes: number
  /** Fraction of the first-round increment the 3rd-round increment may use. */
  readonly roundDeltaRatio: number
  /** Floor protecting the ratio term when the first-round increment is tiny. */
  readonly roundDeltaFloorBytes: number
}

export type PerfProfiles = Readonly<Record<PerfProfileName, PerfThresholds>>

/** Fully validated harness configuration, derived from argv + environment. */
export interface PerfHarnessConfig {
  readonly left: string
  readonly right: string
  readonly rounds: number
  readonly intervalMs: number
  readonly out: string
  readonly profile: PerfProfileName
  readonly failOnViolation: boolean
}

/** One sample's RSS readings, already converted to bytes. */
export interface PerfRss {
  readonly renderer: number
  readonly main: number
  readonly appTotal: number
}

export interface PerfProcessIds {
  /** PID of the largest-RSS Tab (renderer) process; `null` when none reported. */
  readonly renderer: number | null
  readonly main: number | null
}

/**
 * Where in the run a sample was taken. `startup` is the post-launch baseline,
 * `boundary` marks the round boundary bookkeeping samples, `periodic` is the
 * fixed-interval background series.
 */
export type PerfSamplePhase = 'startup' | 'boundary' | 'pre-round' | 'post-round' | 'periodic'

export interface PerfSample {
  /** Distinguishable label, e.g. `round-2-pre` or `startup-baseline`. */
  readonly label: string
  readonly phase: PerfSamplePhase
  /** 0 before the first round; 1-based during and after a round. */
  readonly round: number
  /** ISO-8601 timestamp taken in the main process. */
  readonly at: string
  readonly rss: PerfRss
  readonly pids: PerfProcessIds
}

/** Files/directories of one round's comparison tree plus the real digest totals. */
export interface PerfRoundCounts {
  /** File nodes in the compared (union) tree. */
  readonly files: number
  /** Directory nodes in the compared tree, including its root. */
  readonly dirs: number
  /** Files actually hashed by `platform.digestFiles` in this round. */
  readonly hashedFiles: number
  /** Bytes those successful digests consumed in this round. */
  readonly bytesToHash: number
}

export interface PerfRoundReport {
  /** 1-based round index. */
  readonly index: number
  readonly startedAt: string
  readonly endedAt: string
  readonly wallMs: number
  /** Session id of the round; each round builds a fresh directory session. */
  readonly sessionId: string
  readonly counts: PerfRoundCounts
  /** Renderer RSS measured right after the round. */
  readonly rendererRss?: number
  readonly appTotalRss?: number
  /** Renderer PID observed for this round. */
  readonly rendererPid?: number | null
}

export interface PerfRoundDelta {
  readonly round: number
  /** Post-round renderer RSS minus the previous post-round (round 1: baseline). */
  readonly rendererDelta: number
  readonly appTotalDelta: number
}

export interface PerfAppliedThresholds {
  readonly profile: PerfProfileName
  readonly rendererPeakBytes: number
  readonly appTotalPeakBytes: number
  readonly roundDeltaMaxBytes: number
  readonly roundDeltaRatio: number
  readonly roundDeltaFloorBytes: number
  /** Effective first-round-ratio + floor + absolute cap combination. */
  readonly appliedRoundDeltaBytes: number
}

export interface PerfVerdict {
  readonly ok: boolean
  /** Stable violation ids, e.g. `renderer-peak` / `app-total-peak` / `round-delta`. */
  readonly violations: readonly string[]
  readonly appliedThresholds: PerfAppliedThresholds
}

export interface PerfEvidenceEnv {
  /** `os.release()` of the machine the run happened on. */
  readonly os: string
  /** `os.arch()`. */
  readonly arch: string
  readonly cpuModel: string
  readonly cpuCount: number
  readonly totalMemBytes: number
  readonly node: string
  readonly electron: string
}

export interface PerfEvidence {
  readonly schema: 'opencompare.perf.directory/v1'
  readonly generatedAt: string
  /** PID of the single app instance every round ran in. */
  readonly appPid: number
  readonly commit: { readonly sha: string; readonly dirty: boolean }
  readonly roots: { readonly left: string; readonly right: string }
  readonly profile: PerfProfileName
  readonly sampling: { readonly intervalMs: number }
  /** Human-readable RSS definition written into every evidence file. */
  readonly memoryDefinition: string
  readonly counts: PerfRoundCounts
  readonly rounds: readonly PerfRoundReport[]
  readonly totalWallMs: number
  readonly env: PerfEvidenceEnv
  readonly samples: readonly PerfSample[]
  readonly peaks: PerfRss
  readonly roundDeltas: readonly PerfRoundDelta[]
  readonly verdict: PerfVerdict
  /** Present only when the harness itself failed; `verdict.ok` is then false. */
  readonly error?: string
}

/** Total-app RSS definition, identical for every profile. */
export const PERF_MEMORY_DEFINITION =
  'renderer = workingSetSize of the Tab (renderer) process with the largest RSS; ' +
  'main = workingSetSize of the Browser (main) process; ' +
  'appTotal = sum of workingSetSize over every process reported by app.getAppMetrics(); ' +
  'all values converted from KB to bytes.'

/** Renderer → main messages; only the perf harness uses this channel. */
export type PerfRendererEvent =
  | { readonly type: 'ready' }
  | { readonly type: 'round-start'; readonly round: number }
  | { readonly type: 'round-end'; readonly report: PerfRoundReport }
  | { readonly type: 'complete' }
  | { readonly type: 'failed'; readonly message: string }

/** Preload-exposed perf seam; absent outside a harness-enabled Electron run. */
export interface PerfBridge {
  config(): Promise<PerfHarnessConfig | null>
  event(event: PerfRendererEvent): Promise<void>
}
