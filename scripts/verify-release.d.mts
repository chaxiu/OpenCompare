/** Types for `scripts/verify-release.mjs` so the vitest gate can import it. */

import type { ChildProcess } from 'node:child_process'

export type Layer = 'local' | 'ci'
export type CiPlatform = 'mac' | 'linux' | 'windows'
export type StepStatus = 'pass' | 'fail' | 'skip'

export interface ReleaseAsset {
  name: string
  size: number
  sha256: string | null
  url?: string
}

export interface ReleaseMetadata {
  tag: string
  assets: ReleaseAsset[]
}

export interface CheckOutcome {
  status: StepStatus
  expected: unknown
  actual: unknown
  extraEvidence?: string[]
}

export interface StepRecord {
  id: string
  name: string
  command: string
  expected: unknown
  actual: unknown
  status: StepStatus
  evidence: string[]
  startedAt: string
  finishedAt: string
}

export interface FourStateCounts {
  same: number
  added: number
  removed: number
  modified: number
}

export interface LocalRound {
  index: number
  counts: FourStateCounts | null
  totalRows: number
  closedTabs: number | null
  closedTrees: number | null
  uncollectedHeapBytes: number | null
  retainedHeapBytes: number | null
}

export interface SummaryCounts {
  pass: number
  fail: number
  skip: number
  total: number
  expected: number
}

export interface SummaryEnvironment {
  ImageOS: string
  ImageVersion: string
  RUNNER_OS: string
  GITHUB_RUN_ID: string
}

export interface SummaryCheckEntry {
  id: string
  name: string
  status: StepStatus
  command: string
  evidence: string[]
}

export interface Summary {
  tag: string
  layer: Layer
  status: 'pass' | 'fail'
  counts: SummaryCounts
  environment: SummaryEnvironment
  evidenceDir: string
  missing: string[]
  unexpected: string[]
  duplicates: string[]
  skipped: string[]
  failed: string[]
  checks: SummaryCheckEntry[]
  manual: Array<{ id: string; label: string; reason: string }>
  startedAt: string
  finishedAt: string
  problems?: string[]
}

export interface CommandResult {
  status: number
  signal: string | null
  stdout: string
  stderr: string
}

export interface CdpPort {
  url?: string
  send(method: string, params?: Record<string, unknown>): Promise<unknown>
  evaluate(expression: string): Promise<unknown>
  waitFor(
    expression: string,
    description: string,
    options?: { timeoutMs?: number; intervalMs?: number }
  ): Promise<boolean>
  close(): void
}

export interface LaunchHandle {
  cdp: CdpPort
  output: string[]
  diagnostics?(): SpikeDiagnostics
  collectGarbage(): Promise<void>
  readRetainedHeap(): Promise<number | null>
  stop(): Promise<void>
}

export type SpikeFailureReason = 'process-exited' | 'no-page-target' | 'app-shell-timeout'

export interface SpikePortProbe {
  at: string
  elapsedMs: number
  ok: boolean
  pageTargets: number
  url: string | null
  error: string | null
}

export interface SpikeDiagnostics {
  reason: SpikeFailureReason | null
  exitCode: number | null
  signal: string | null
  stdout: string
  stderr: string
  portProbe: SpikePortProbe[]
  startedAt?: string
  finishedAt?: string
}

/** One startup failure as it lands in a step `actual` and its plain-text log. */
export interface StepDiagnostics {
  reason: SpikeFailureReason | null
  exitCode: number | null
  signal: string | null
  stdout: string
  stderr: string
  portProbe: SpikePortProbe[]
  textLimit: number
  truncated: { stdout: boolean; stderr: boolean }
  originalChars: { stdout: number; stderr: number }
}

export interface SpikeLaunchDescriptor {
  command: string
  args: string[]
  cwd: string
}

export interface SpikeTargetWaitResult {
  target: { type?: string; url?: string; webSocketDebuggerUrl: string } | null
  reason: SpikeFailureReason | null
  portProbe: SpikePortProbe[]
  startedAt: string
  finishedAt: string
}

export interface SpikeTargetWaitOptions {
  port: number
  timeoutMs?: number
  intervalMs?: number
  probe?: (port: number) => Promise<unknown>
  childAlive?: () => boolean
  now?: () => number
  sleepFn?: (ms: number) => Promise<void>
}

export interface World {
  exists(path: string): boolean
  readdir(path: string, options?: { withFileTypes?: boolean }): unknown[]
  isDirectory(path: string): boolean
  readText(path: string): string
  readBytes(path: string): Buffer
  size(path: string): number
  mkdir(path: string): void
  writeText(path: string, text: string): void
  chmod(path: string, mode: number): void
  sha256(path: string): string
  run(command: string, args?: string[], options?: Record<string, unknown>): CommandResult
  release(tag: string): Promise<ReleaseMetadata>
  launchApp(options: {
    command: string
    args?: string[]
    port: number
    cwd?: string
    env?: Record<string, string>
    timeoutMs?: number
    waitForTarget?: (options: SpikeTargetWaitOptions) => Promise<SpikeTargetWaitResult>
    processGroup?: boolean
  }): Promise<LaunchHandle>
}

export interface CheckDefinition {
  id: string
  name: string
  command: string
  run(ctx: unknown): Promise<CheckOutcome>
}

export interface CheckGroup {
  id: string
  platforms: CiPlatform[]
  checks: CheckDefinition[]
}

export const CI_PLATFORMS: CiPlatform[]
export const STEP_STATUSES: StepStatus[]
export const LOCAL_ROUND_COUNT: number
export const RETENTION_THRESHOLD_BYTES: number
export const CANCEL_NOISE_PATTERN: RegExp
export const SPIKE_TARGET_POLL_INTERVAL_MS: number
export const SPIKE_TARGET_TIMEOUT_MS: number
export const SPIKE_APP_SHELL_TIMEOUT_MS: number
export const SPIKE_PROCESS_EXIT_BUDGET_MS: number
export const SPIKE_PROCESS_KILL_WAIT_MS: number
export const SPIKE_PROCESS_POLL_INTERVAL_MS: number
export const SPIKE_EXIT_FLUSH_TIMEOUT_MS: number
export const STEP_DIAGNOSTIC_TEXT_LIMIT: number
export const AUTHENTICODE_PASS_STATUSES: string[]
export const AUTHENTICODE_UNSIGNED_NOTE: string
export const SPIKE_FAILURE_REASONS: SpikeFailureReason[]
export const LOCAL_FIXTURE_ROOTS: { left: string; right: string }
export const MANUAL_NOT_COVERED: Array<{ id: string; label: string; reason: string }>
export const SMOKE_TREE: FourStateCounts
export const CANCEL_TREE_FILES_PER_SIDE: number
export const CI_CHECK_GROUPS: CheckGroup[]
export const LOCAL_CHECKS: CheckDefinition[]

export function expectedCheckIds(options?: {
  layer: Layer
  platforms?: CiPlatform[]
}): string[]

export function checksFor(options?: { layer: Layer; platforms?: CiPlatform[] }): CheckDefinition[]

export function compareCheckSets(
  expected: string[],
  actual: string[]
): { missing: string[]; unexpected: string[]; ok: boolean }

export function normalizeVersion(value: unknown): string | null

export function versionEqualsTag(version: unknown, tag: unknown): boolean

export function judgeRetainedHeap(options?: {
  round2RetainedBytes?: number | null
  round3RetainedBytes?: number | null
}): {
  ok: boolean
  delta: number | null
  threshold: number
  problems: string[]
}

export function judgeLocalRounds(options?: { rounds?: LocalRound[] }): {
  ok: boolean
  problems: string[]
}

export function scanCancelNoise(
  sources?: Array<{ source?: string; text?: string }>
): { hits: Array<{ source: string; line: string }>; count: number }

export function readAsarJsonEntry(buffer: Buffer, entryPath: string): unknown

export interface ParsedArgs {
  error?: string
  options?: {
    tag: string
    layer: Layer
    out: string
    platform?: string
    aggregate?: string
    spike?: boolean
  }
}

export function parseArgs(argv?: string[]): ParsedArgs

export function selectedPlatforms(option?: string): CiPlatform[]

export function summarizeCounts(steps?: Array<{ status: StepStatus }>): SummaryCounts

export function buildSummary(options?: {
  tag: string
  layer: Layer
  steps?: StepRecord[]
  environment?: SummaryEnvironment
  evidenceDir?: string
  expectedIds?: string[]
  manual?: Array<{ id: string; label: string; reason: string }>
  duplicates?: string[]
  startedAt?: string
  finishedAt?: string
}): Summary

export function validateStep(
  step: unknown,
  options?: { exists?: (path: string) => boolean; keys?: string[] }
): { ok: boolean; problems: string[] }

export function validateSummary(
  summary: unknown,
  options?: { expectedIds?: string[]; exists?: (path: string) => boolean }
): { ok: boolean; problems: string[] }

export interface ReleaseGateVerdict {
  ok: boolean
  status: 'pass' | 'fail'
  problems: string[]
}

export function judgeReleaseGate(
  summary: unknown,
  options?: { expectedIds?: string[]; exists?: (path: string) => boolean }
): ReleaseGateVerdict

export function writeJsonAtomic(path: string, value: unknown): void

export function sha256File(path: string): string

export function buildSpikeLaunchDescriptor(options?: {
  platform?: string
  port: number
  root?: string
  electronBinary?: string
}): SpikeLaunchDescriptor

/** The one Linux xvfb command shape shared by the spike and every verify leg. */
export function buildXvfbAppLaunch(options?: {
  executable: string
  args?: string[]
  port: number
}): { command: string; args: string[] }

export function stepDiagnostics(
  error: unknown,
  options?: { limit?: number }
): StepDiagnostics

export function formatStepDiagnostics(diagnostics: StepDiagnostics): string

export function waitForSpikePageTarget(
  options?: SpikeTargetWaitOptions
): Promise<SpikeTargetWaitResult>

export function formatSpikeLaunchLog(record: {
  id: string
  tag: string
  conclusion: string
  reason: SpikeFailureReason | null
  url: string | null
  error: string | null
  exitCode: number | null
  signal: string | null
  stdout: string
  stderr: string
  portProbe: SpikePortProbe[]
  startedAt: string
  finishedAt: string
}): string

export function spikeUsesProcessGroup(platform?: string): boolean

export interface CapturedChild {
  child: ChildProcess
  output: string[]
  alive(): boolean
  exitCode(): number | null
  signal(): string | null
  stdout(): string
  stderr(): string
  stop(): Promise<void>
}

export function spawnCapturedChild(options?: {
  command: string
  args?: string[]
  cwd?: string
  env?: Record<string, string | undefined>
  processGroup?: boolean
}): CapturedChild

export function stopChild(
  child: unknown,
  options?: { processGroup?: boolean; graceMs?: number; killWaitMs?: number }
): Promise<void>

export interface FlushExitProcess {
  exitCode?: number | null
  exit(code: number): void
  stdout?: { write(chunk: string, done?: () => void): unknown } | null
  stderr?: { write(chunk: string, done?: () => void): unknown } | null
}

export function exitAfterFlush(
  code: number,
  options?: { proc?: FlushExitProcess; timeoutMs?: number }
): void

export function writeTextAtomic(path: string, text: string): void

export function runCommand(
  command: string,
  args?: string[],
  options?: Record<string, unknown>
): CommandResult

export function createWorld(options?: { env?: Record<string, string | undefined> }): World

export function buildEnvironment(options?: {
  env?: Record<string, string | undefined>
  isCi?: boolean
  now?: () => Date
}): SummaryEnvironment

export function runVerifyReleaseCli(
  argv?: string[],
  io?: {
    env?: Record<string, string | undefined>
    stdout?: (line: string) => void
    stderr?: (line: string) => void
    now?: () => Date
    world?: World
    platform?: string
  }
): Promise<number>
