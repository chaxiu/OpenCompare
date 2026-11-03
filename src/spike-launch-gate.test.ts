/**
 * Spike launch gate: the Linux/macOS launch descriptor, the bounded CDP target
 * wait, the closed failure-reason set, the two diagnostic files and the
 * workflow parity are pinned here. Everything is deterministic: no Electron,
 * no xvfb, no network. The clock, the probe and the world are injected.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import {
  SPIKE_APP_SHELL_TIMEOUT_MS,
  SPIKE_FAILURE_REASONS,
  SPIKE_PROCESS_EXIT_BUDGET_MS,
  SPIKE_TARGET_POLL_INTERVAL_MS,
  SPIKE_TARGET_TIMEOUT_MS,
  buildSpikeLaunchDescriptor,
  runVerifyReleaseCli,
  waitForSpikePageTarget
} from '../scripts/verify-release.mjs'
import type {
  LaunchHandle,
  SpikeDiagnostics,
  SpikePortProbe,
  SpikeTargetWaitResult,
  World
} from '../scripts/verify-release.d.mts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const ELECTRON = '/opt/fake/electron'
const tmpDirs: string[] = []
const probeRecord = (overrides: Partial<SpikePortProbe> = {}): SpikePortProbe => ({
  at: '2026-11-03T00:00:00.000Z', elapsedMs: 0, ok: true, pageTargets: 0, url: null, error: null, ...overrides
})
const diagnostics = (overrides: Partial<SpikeDiagnostics> = {}): SpikeDiagnostics => ({
  reason: 'process-exited', exitCode: 42, signal: 'SIGSEGV',
  stdout: 'electron stdout line', stderr: 'xvfb-run: error: Xvfb failed to start',
  portProbe: [probeRecord({ ok: false, error: 'ECONNREFUSED' })], ...overrides
})
const failure = (detail: SpikeDiagnostics): Error => Object.assign(new Error('spike failed'), { diagnostics: detail })
const worldWith = (launchApp: World['launchApp']): World => ({ launchApp }) as unknown as World
const makeOutDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'spike-launch-gate-'))
  tmpDirs.push(dir)
  return dir
}
interface SpikeRecord {
  id: string
  conclusion: string
  reason: string | null
  url: string | null
  exitCode: number | null
  signal: string | null
  stdout: string
  stderr: string
  portProbe: SpikePortProbe[]
  startedAt: string
  finishedAt: string
}
const runSpikeCli = async (world: World, platform = 'linux') => {
  const outDir = makeOutDir()
  const lines: string[] = []
  const code = await runVerifyReleaseCli(
    ['--tag=v9.9.9', '--layer=ci', '--spike', `--out=${outDir}`],
    {
      world,
      env: { ELECTRON_BINARY: ELECTRON },
      platform,
      now: () => new Date('2026-11-03T00:00:00.000Z'),
      stdout: (line: string) => lines.push(line)
    }
  )
  const record = JSON.parse(readFileSync(join(outDir, 'spike.json'), 'utf8')) as SpikeRecord
  const log = readFileSync(join(outDir, 'spike-launch.log'), 'utf8')
  return { code, outDir, record, log, lines }
}
const okHandle = (
  capture: Array<Record<string, unknown>>,
  detail = diagnostics({ reason: null, exitCode: null, signal: null })
): World =>
  worldWith(async (options) => {
    capture.push(options as unknown as Record<string, unknown>)
    return {
      cdp: { url: 'devtools://opencompare/', send: async () => ({}), evaluate: async () => true, waitFor: async () => true, close: () => undefined },
      output: [detail.stdout], diagnostics: () => detail,
      collectGarbage: async () => undefined, readRetainedHeap: async () => null, stop: async () => undefined
    } satisfies LaunchHandle
  })

afterAll(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true })
})

describe('spike launch descriptor', () => {
  it('gives Linux xvfb ownership plus the sandbox and dev-shm flags', () => {
    const descriptor = buildSpikeLaunchDescriptor({
      platform: 'linux',
      port: 9702,
      root: '/repo',
      electronBinary: ELECTRON
    })
    expect(descriptor.command).toBe('xvfb-run')
    expect(descriptor.args[0]).toBe('-a')
    for (const flag of [
      ELECTRON,
      '.',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--remote-debugging-port=9702'
    ]) {
      expect(descriptor.args).toContain(flag)
    }
    expect(descriptor.cwd).toBe('/repo')
  })

  it('keeps the macOS shape unchanged and free of the Linux flags', () => {
    const descriptor = buildSpikeLaunchDescriptor({
      platform: 'darwin',
      port: 9702,
      root: '/repo',
      electronBinary: ELECTRON
    })
    expect(descriptor.command).toBe(ELECTRON)
    expect(descriptor.args).toEqual(['.', '--remote-debugging-port=9702'])
    expect(descriptor.cwd).toBe('/repo')
    for (const flag of ['--no-sandbox', '--disable-dev-shm-usage', 'xvfb-run']) {
      expect(JSON.stringify(descriptor)).not.toContain(flag)
    }
  })

  it('rejects a missing binary and an out-of-range port', () => {
    expect(() => buildSpikeLaunchDescriptor({ platform: 'linux', port: 9702 })).toThrow()
    expect(() =>
      buildSpikeLaunchDescriptor({ platform: 'linux', port: 70_000, electronBinary: ELECTRON })
    ).toThrow()
  })
})

describe('bounded target wait', () => {
  const fakeClock = (start = 0) => {
    let tick = start
    return { now: () => tick, sleepFn: async (ms: number) => void (tick += ms) }
  }

  it('fails with no-page-target inside the fixed budget and keeps a probe trail', async () => {
    const clock = fakeClock()
    const result = await waitForSpikePageTarget({
      port: 9702,
      timeoutMs: 2_000,
      intervalMs: 500,
      probe: async () => [],
      now: clock.now,
      sleepFn: clock.sleepFn
    })
    expect(result.target).toBeNull()
    expect(result.reason).toBe('no-page-target')
    expect(result.portProbe.length).toBeGreaterThanOrEqual(1)
    expect(result.portProbe.every((entry) => entry.ok)).toBe(true)
    expect(result.portProbe.at(-1)?.elapsedMs).toBe(2_000)
  })

  it('records a refused /json/list probe instead of spinning silently', async () => {
    const clock = fakeClock()
    const result = await waitForSpikePageTarget({
      port: 9702,
      timeoutMs: 500,
      intervalMs: 500,
      probe: async () => {
        throw new Error('ECONNREFUSED')
      },
      now: clock.now,
      sleepFn: clock.sleepFn
    })
    expect(result.reason).toBe('no-page-target')
    expect(result.portProbe[0]?.ok).toBe(false)
    expect(result.portProbe[0]?.error).toBe('ECONNREFUSED')
  })

  it('stops on the next liveness check when the child exits, well inside the budget', async () => {
    const clock = fakeClock()
    let alive = true
    const result = await waitForSpikePageTarget({
      port: 9702,
      timeoutMs: SPIKE_TARGET_TIMEOUT_MS,
      intervalMs: SPIKE_TARGET_POLL_INTERVAL_MS,
      probe: async () => {
        alive = false
        return []
      },
      childAlive: () => alive,
      now: clock.now,
      sleepFn: clock.sleepFn
    })
    expect(result.reason).toBe('process-exited')
    expect(result.portProbe).toHaveLength(1)
    expect(clock.now()).toBeLessThan(SPIKE_PROCESS_EXIT_BUDGET_MS)
  })

  it('returns the first page target without waiting for the budget', async () => {
    const clock = fakeClock()
    const target = { type: 'page', url: 'devtools://opencompare/', webSocketDebuggerUrl: 'ws://x' }
    const result: SpikeTargetWaitResult = await waitForSpikePageTarget({
      port: 9702,
      probe: async () => [target],
      now: clock.now,
      sleepFn: clock.sleepFn
    })
    expect(result.target).toEqual(target)
    expect(result.reason).toBeNull()
    expect(result.portProbe).toHaveLength(1)
  })

  it('pins the exact budgets and the closed reason set', () => {
    expect(SPIKE_TARGET_TIMEOUT_MS).toBeGreaterThan(0)
    expect(SPIKE_TARGET_TIMEOUT_MS).toBeLessThanOrEqual(60_000)
    expect(SPIKE_TARGET_POLL_INTERVAL_MS).toBeGreaterThan(0)
    expect(SPIKE_TARGET_POLL_INTERVAL_MS).toBeLessThanOrEqual(1_000)
    expect(SPIKE_APP_SHELL_TIMEOUT_MS).toBeGreaterThan(0)
    expect(SPIKE_PROCESS_EXIT_BUDGET_MS).toBeLessThanOrEqual(5_000)
    expect(SPIKE_PROCESS_EXIT_BUDGET_MS).toBeGreaterThanOrEqual(SPIKE_TARGET_POLL_INTERVAL_MS)
    expect(SPIKE_FAILURE_REASONS).toEqual(['process-exited', 'no-page-target', 'app-shell-timeout'])
  })
})

describe('spike diagnostics', () => {
  it('launches Linux through xvfb-run and lands spike.json plus spike-launch.log on failure', async () => {
    const capture: Array<Record<string, unknown>> = []
    const { code, outDir, record, log } = await runSpikeCli(
      worldWith(async (options) => {
        capture.push(options as unknown as Record<string, unknown>)
        throw failure(diagnostics())
      })
    )
    expect(code).toBe(1)
    expect(capture[0]?.command).toBe('xvfb-run')
    expect(capture[0]?.port).toBeGreaterThan(0)
    expect(record.id).toBe('spike-window-boot')
    expect(record.conclusion).toBe('failed')
    expect(record.reason).toBe('process-exited')
    expect(record.exitCode).toBe(42)
    expect(record.signal).toBe('SIGSEGV')
    expect(record.stdout).toBe('electron stdout line')
    expect(record.stderr).toContain('Xvfb failed to start')
    expect(record.portProbe).toHaveLength(1)
    expect(existsSync(join(outDir, 'spike.json'))).toBe(true)
    expect(existsSync(join(outDir, 'spike-launch.log'))).toBe(true)
    expect(log).toContain('electron stdout line')
    expect(log).toContain('Xvfb failed to start')
    expect(log).toContain('/json/list')
  })

  it('keeps no-page-target distinct from a dead child', async () => {
    const { code, record, log } = await runSpikeCli(
      worldWith(async () =>
        Promise.reject(
          failure(
            diagnostics({ reason: 'no-page-target', exitCode: null, signal: null, portProbe: [probeRecord()] })
          )
        )
      )
    )
    expect(code).toBe(1)
    expect(record.reason).toBe('no-page-target')
    expect(record.exitCode).toBeNull()
    expect(record.portProbe.length).toBeGreaterThanOrEqual(1)
    expect(log).toContain('pageTargets=0')
  })

  it('reports app-shell-timeout when the target exists but the shell never boots', async () => {
    const capture: Array<Record<string, unknown>> = []
    const detail = diagnostics({
      reason: null,
      exitCode: null,
      signal: null,
      stdout: 'target booted',
      stderr: '',
      portProbe: [probeRecord({ pageTargets: 1 })]
    })
    const world = worldWith(async (options) => {
      capture.push(options as unknown as Record<string, unknown>)
      return {
        cdp: {
          url: 'devtools://opencompare/', send: async () => ({}), evaluate: async () => false,
          waitFor: async () => { throw new Error('等待超时') }, close: () => undefined
        },
        output: [], diagnostics: () => detail,
        collectGarbage: async () => undefined, readRetainedHeap: async () => null, stop: async () => undefined
      } satisfies LaunchHandle
    })
    const { code, record, log } = await runSpikeCli(world)
    expect(code).toBe(1)
    expect(record.reason).toBe('app-shell-timeout')
    expect(record.stdout).toBe('target booted')
    expect(record.portProbe).toHaveLength(1)
    expect(log).toContain('app-shell-timeout')
  })

  it('keeps conclusion window-booted with a url and writes the same two files on success', async () => {
    const capture: Array<Record<string, unknown>> = []
    const { code, outDir, record, log } = await runSpikeCli(okHandle(capture))
    expect(code).toBe(0)
    expect(record.conclusion).toBe('window-booted')
    expect(record.url).toBe('devtools://opencompare/')
    expect(record.reason).toBeNull()
    expect(existsSync(join(outDir, 'spike-launch.log'))).toBe(true)
    expect(log).toContain('window-booted')
  })
})

describe('workflow parity', () => {
  interface Step {
    run?: string
    if?: string
  }
  interface Workflow {
    on?: Record<string, unknown>
    permissions?: Record<string, string>
    jobs?: Record<string, { needs?: string | string[]; steps?: Step[] }>
  }
  const workflow = parse(
    readFileSync(join(repoRoot, '.github/workflows/post-release-verify.yml'), 'utf8')
  ) as Workflow
  const steps = workflow.jobs?.spike?.steps ?? []
  const spikeRuns = steps.filter((step) => step.run?.includes('--spike'))
  const expected = 'node scripts/verify-release.mjs --tag="$TAG" --layer=ci --spike --out=verify-out'

  it('runs the one spike command shape on every OS with no outer xvfb-run', () => {
    expect(spikeRuns).toHaveLength(1)
    expect(spikeRuns[0]?.run).toBe(expected)
    expect(spikeRuns[0]?.if).toBeUndefined()
    for (const step of steps) expect(String(step.run ?? '')).not.toContain('xvfb-run -a node')
  })

  it('installs xvfb explicitly before the spike run', () => {
    const install = steps.findIndex((step) => String(step.run ?? '').includes('install -y xvfb'))
    const run = steps.indexOf(spikeRuns[0] as Step)
    expect(install).toBeGreaterThanOrEqual(0)
    expect(install).toBeLessThan(run)
    expect(steps[install]?.if).toBe("runner.os == 'Linux'")
  })

  it('keeps the dispatch-only read-only posture and the spike gate before verify', () => {
    expect(Object.keys(workflow.on ?? {})).toEqual(['workflow_dispatch'])
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect([workflow.jobs?.verify?.needs].flat()).toContain('spike')
  })
})

describe('gate registration and lessons', () => {
  it('registers spike-launch-gate between diff-normalize-real and the process-tree gate', () => {
    const manifest = JSON.parse(readFileSync(join(repoRoot, '.munk/code-gates.json'), 'utf8')) as {
      version: number
      gates: Array<{ id: string; cwd: string; command: string }>
    }
    const gate = manifest.gates.find((entry) => entry.id === 'spike-launch-gate')
    expect(gate).toEqual({
      id: 'spike-launch-gate',
      cwd: '.',
      command: 'pnpm test src/spike-launch-gate.test.ts'
    })
    expect(existsSync(join(repoRoot, 'src/spike-launch-gate.test.ts'))).toBe(true)
    const ids = manifest.gates.map((entry) => entry.id)
    expect(ids.indexOf('spike-launch-gate')).toBe(ids.indexOf('diff-normalize-real') + 1)
    expect(ids[ids.indexOf('spike-launch-gate') + 1]).toBe('spike-process-tree-gate')
    expect(ids[ids.indexOf('spike-process-tree-gate') + 1]).toBe('template-default-unchecked')
    expect(ids.slice(-2)).toEqual(['verify-release-gate', 'test-debt-gate'])
    expect(manifest.version).toBe(1)
    for (const forbidden of ['&&', '||', '|', ';']) expect(gate?.command).not.toContain(forbidden)
  })

  it('records the Linux evidence, the descriptor and the reason contract in lessons', () => {
    const lessons = readFileSync(join(repoRoot, 'docs/lessons.md'), 'utf8')
    for (const marker of [
      'spike-launch',
      '41557584455',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      'process-exited',
      'no-page-target',
      'app-shell-timeout',
      'spike-launch.log',
      'spike-launch-gate'
    ]) {
      expect(lessons).toContain(marker)
    }
  })
})
