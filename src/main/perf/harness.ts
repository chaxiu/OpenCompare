/**
 * Electron main-process side of the directory memory harness.
 *
 * Responsibilities are deliberately narrow: validate the CLI (via the shared
 * parser), load one threshold profile, sample real `app.getAppMetrics()` rows on
 * a fixed interval and at renderer-reported round boundaries, then atomically
 * write the evidence file and exit with the verdict. The renderer owns the round
 * comparisons; this file never drives the comparison itself.
 */
import { execFileSync } from 'node:child_process'
import { constants } from 'node:fs'
import { access, readFile, stat } from 'node:fs/promises'
import { cpus, release, arch, totalmem } from 'node:os'
import { join } from 'node:path'
import { app, ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { parsePerfArgs } from '@shared/perf/args'
import { PerfRecorder } from '@shared/perf/recorder'
import {
  formatPerfViolations,
  parseThresholds,
  resolvePerfExitCode
} from '@shared/perf/verdict'
import type {
  PerfEvidenceEnv,
  PerfHarnessConfig,
  PerfRendererEvent,
  PerfThresholds
} from '@shared/perf/types'
import { PLATFORM_CHANNELS } from '@shared/platform/channels'
import { registerPlatformIpc } from '../platform/electron-platform'
import { writeEvidenceAtomic } from './evidenceFile'

export interface PerfHarnessDeps {
  readonly argv: readonly string[]
  readonly cwd: string
  /** Builds the real app window; `perf` adds the measurement query flag. */
  readonly createWindow: (perf: boolean) => BrowserWindow
}

const HARNESS_TIMEOUT_MS = 10 * 60 * 1000
const EXIT_FLUSH_MS = 80

async function isReadableDirectory(path: string): Promise<boolean> {
  try {
    const info = await stat(path)
    if (!info.isDirectory()) return false
    await access(path, constants.R_OK)
    return true
  } catch {
    return false
  }
}

function collectCommit(cwd: string): { sha: string; dirty: boolean } {
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
    const status = execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' }).trim()
    return { sha, dirty: status.length > 0 }
  } catch {
    return { sha: 'unknown', dirty: false }
  }
}

function collectEnv(): PerfEvidenceEnv {
  const cpuList = cpus()
  return {
    os: release(),
    arch: arch(),
    cpuModel: cpuList[0]?.model ?? 'unknown',
    cpuCount: cpuList.length,
    totalMemBytes: totalmem(),
    node: process.versions.node,
    electron: process.versions.electron ?? 'unknown'
  }
}

async function loadThresholds(cwd: string, profile: string): Promise<PerfThresholds> {
  const raw = await readFile(join(cwd, 'perf', 'profiles.json'), 'utf8')
  const parsed = JSON.parse(raw) as Partial<Record<string, unknown>>
  const selected = parseThresholds(parsed[profile])
  if (typeof selected === 'string') throw new Error(`perf/profiles.json ${profile}: ${selected}`)
  return selected
}

function isPerfRendererEvent(value: unknown): value is PerfRendererEvent {
  if (typeof value !== 'object' || value === null) return false
  const type = (value as { type?: unknown }).type
  return (
    type === 'ready' ||
    type === 'round-start' ||
    type === 'round-end' ||
    type === 'hold' ||
    type === 'settle' ||
    type === 'settle-stage' ||
    type === 'reclaim' ||
    type === 'complete' ||
    type === 'failed'
  )
}

/**
 * Runs one measurement session. Returns after `app.exit`, so the caller should
 * not await it (the promise never resolves before the process ends).
 */
export async function runPerfHarness(deps: PerfHarnessDeps): Promise<void> {
  const parsed = await parsePerfArgs(deps.argv, { isReadableDirectory })
  if (!parsed.ok) {
    console.error(`perf: ${parsed.error}`)
    app.exit(1)
    return
  }
  const config: PerfHarnessConfig = parsed.config

  let thresholds: PerfThresholds
  try {
    thresholds = await loadThresholds(deps.cwd, config.profile)
  } catch (cause) {
    console.error(`perf: ${cause instanceof Error ? cause.message : String(cause)}`)
    app.exit(1)
    return
  }

  const recorder = new PerfRecorder({
    mode: config.mode,
    pairs: config.pairs,
    hotRounds: config.hotRounds,
    left: config.left,
    right: config.right,
    profile: config.profile,
    thresholds,
    intervalMs: config.intervalMs,
    settleMs: config.settleMs,
    appPid: process.pid,
    commit: collectCommit(deps.cwd),
    env: collectEnv(),
    metrics: () =>
      app.getAppMetrics().map((metric) => ({
        pid: metric.pid,
        type: metric.type,
        workingSetSize: metric.memory.workingSetSize
      }))
  })

  let timer: NodeJS.Timeout | null = null
  let timeout: NodeJS.Timeout | null = null
  let finalizing = false

  function stopTimers(): void {
    if (timer !== null) clearInterval(timer)
    if (timeout !== null) clearTimeout(timeout)
    timer = null
    timeout = null
  }

  /** Writes the evidence (even on failure) and exits with the gate verdict. */
  async function finalize(error?: string): Promise<void> {
    if (finalizing) return
    finalizing = true
    stopTimers()
    const evidence = recorder.finalize(error === undefined ? {} : { error })
    let exitCode = 0
    try {
      await writeEvidenceAtomic(config.out, evidence)
      console.log(`perf: evidence -> ${config.out}`)
      if (evidence.verdict.violations.length > 0) {
        console.error(formatPerfViolations(evidence.verdict))
      }
      exitCode = resolvePerfExitCode(evidence.verdict, config.failOnViolation)
    } catch (cause) {
      console.error(`perf: 无法写出证据文件 ${config.out}: ${String(cause)}`)
      exitCode = 1
    }
    // Give the last invoke a chance to settle before the window goes away.
    setTimeout(() => app.exit(exitCode), EXIT_FLUSH_MS)
  }

  function handleEvent(event: PerfRendererEvent): void {
    switch (event.type) {
      case 'ready':
        recorder.startupBaseline()
        timer = setInterval(() => recorder.periodic(), config.intervalMs)
        break
      case 'round-start':
        recorder.beginRound(event.round)
        break
      case 'round-end':
        recorder.endRound(event.report)
        break
      case 'hold':
        recorder.hold(event)
        break
      case 'settle':
        recorder.settle()
        break
      case 'settle-stage':
        recorder.settleStage(event.label, event.tabs)
        break
      case 'reclaim':
        recorder.reclaim(event.tabs)
        break
      case 'complete':
        void finalize()
        break
      case 'failed':
        void finalize(event.message)
        break
    }
  }

  ipcMain.handle(PLATFORM_CHANNELS.perfConfig, () => config)
  ipcMain.handle(PLATFORM_CHANNELS.perfEvent, (_event, payload: unknown) => {
    if (!isPerfRendererEvent(payload)) {
      throw new Error('perf: 无效的测量事件。')
    }
    handleEvent(payload)
  })
  registerPlatformIpc()

  const mainWindow: BrowserWindow = deps.createWindow(true)
  mainWindow.on('closed', () => {
    if (!finalizing) void finalize('窗口在测量完成前被关闭。')
  })

  // A renderer that never says "ready" still has to produce an honest red
  // evidence file instead of hanging forever.
  timeout = setTimeout(() => {
    void finalize('渲染进程未在 10 分钟内报告就绪。')
  }, HARNESS_TIMEOUT_MS)
}
