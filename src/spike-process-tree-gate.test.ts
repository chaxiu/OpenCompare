/**
 * Spike teardown gate: the Linux process group, the released stdout/stderr
 * pipes and the deterministic CLI exit are pinned here with real (fake) process
 * trees. The tree scripts are plain Node: no Electron, no xvfb, no network.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import {
  SPIKE_APP_SHELL_TIMEOUT_MS,
  SPIKE_PROCESS_EXIT_BUDGET_MS,
  SPIKE_TARGET_TIMEOUT_MS,
  createWorld,
  exitAfterFlush,
  runVerifyReleaseCli,
  spawnCapturedChild,
  spikeUsesProcessGroup,
  stopChild
} from '../scripts/verify-release.mjs'
import type { CapturedChild, CdpPort, LaunchHandle, SpikeDiagnostics, SpikeFailureReason, SpikePortProbe, World } from '../scripts/verify-release.d.mts'

type TreeMode = 'normal' | 'stubborn' | 'leader-exits'
type LaunchOptions = Parameters<World['launchApp']>[0]
interface StreamLike { write(chunk: string, done: () => void): void }
interface FakeProc { exitCode?: number; exited: number[]; exit(code: number): void; stdout: StreamLike; stderr: StreamLike; flush(): void }
interface DriverResult { code: number | null; signal: string | null; elapsedMs: number; output: string }

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const moduleUrl = pathToFileURL(join(repoRoot, 'scripts/verify-release.mjs')).href
const NOW = '2026-11-03T01:37:18.687Z'
const tmpDirs: string[] = []
const spawned: CapturedChild[] = []

const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'spike-process-tree-'))
  tmpDirs.push(dir)
  return dir
}
const pidFileOf = (dir: string, mode: TreeMode): string => join(dir, `pids-${mode}.txt`)
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))
const waitFor = async (predicate: () => boolean, timeoutMs = 4_000): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await sleep(20)
  }
  return predicate()
}
const pidAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
const readRecordedPid = (dir: string, mode: TreeMode): number =>
  Number(readFileSync(pidFileOf(dir, mode), 'utf8').trim())

/**
 * A fake launch tree: the leader spawns a grandchild that inherits both pipes
 * and keeps writing, so only a group kill (or an explicit pipe teardown) can
 * release the parent. `leader-exits` reproduces the real incident: the direct
 * child is gone while the grandchild still holds the pipe write end.
 */
const treeScript = (dir: string, mode: TreeMode): string => {
  const path = join(dir, `fake-tree-${mode}.mjs`)
  if (existsSync(path)) return path
  const ignore = mode === 'stubborn' ? "\"process.on('SIGTERM', () => {})\"" : "''"
  writeFileSync(
    path,
    [
      "import { spawn } from 'node:child_process'",
      "import { writeFileSync } from 'node:fs'",
      `const PID_FILE = ${JSON.stringify(pidFileOf(dir, mode))}`,
      `const ignore = ${ignore}`,
      "const grandchild = spawn(process.execPath, ['-e', ignore + \"; process.stdout.write('gc\\\\n'); setInterval(() => {}, 1000)\"], { stdio: ['ignore', 'inherit', 'inherit'] })",
      'writeFileSync(PID_FILE, String(grandchild.pid))',
      `process.stdout.write('grandchild=' + grandchild.pid + '\\n')`,
      `${mode === 'stubborn' ? "process.on('SIGTERM', () => {})" : ''}`,
      `${mode === 'leader-exits' ? 'process.exit(0)' : ''}`,
      'setInterval(() => {}, 1000)'
    ].join('\n')
  )
  return path
}
const startTree = async (dir: string, mode: TreeMode): Promise<{ proc: CapturedChild; grandchild: number }> => {
  const proc = spawnCapturedChild({ command: process.execPath, args: [treeScript(dir, mode)], cwd: dir, env: { ...process.env }, processGroup: true })
  spawned.push(proc)
  expect(typeof proc.child.pid).toBe('number')
  await waitFor(() => existsSync(pidFileOf(dir, mode)))
  return { proc, grandchild: readRecordedPid(dir, mode) }
}

const probe = (overrides: Partial<SpikePortProbe> = {}): SpikePortProbe => ({ at: NOW, elapsedMs: 21, ok: true, pageTargets: 1, url: 'out/renderer/index.html', error: null, ...overrides })
const fakeCdp = (): CdpPort => ({ url: 'out/renderer/index.html', send: async () => ({}), evaluate: async () => true, waitFor: async () => true, close: () => undefined })

const runSpikeCli = async (world: World): Promise<{ code: number; outDir: string; record: Record<string, unknown>; log: string }> => {
  const outDir = tempDir()
  const code = await runVerifyReleaseCli(['--tag=v9.9.9', '--layer=ci', '--spike', `--out=${outDir}`], {
    world,
    env: { ELECTRON_BINARY: process.execPath },
    platform: 'linux',
    stdout: () => undefined,
    now: () => new Date(NOW)
  })
  const record = JSON.parse(readFileSync(join(outDir, 'spike.json'), 'utf8')) as Record<string, unknown>
  return { code, outDir, record, log: readFileSync(join(outDir, 'spike-launch.log'), 'utf8') }
}

/** Success path: the real spawn/reap runs; only CDP is a stand-in. */
const successWorld = (dir: string): { world: World; launched: CapturedChild[] } => {
  const launched: CapturedChild[] = []
  const world = {
    launchApp: async (options: LaunchOptions) => {
      const proc = spawnCapturedChild({ command: process.execPath, args: [treeScript(dir, 'normal')], cwd: dir, env: { ...process.env }, processGroup: options.processGroup === true })
      launched.push(proc)
      spawned.push(proc)
      await waitFor(() => existsSync(pidFileOf(dir, 'normal')))
      return {
        cdp: fakeCdp(),
        output: proc.output,
        diagnostics: (): SpikeDiagnostics => ({
          reason: null,
          exitCode: proc.exitCode(),
          signal: proc.signal(),
          stdout: proc.stdout(),
          stderr: proc.stderr(),
          portProbe: [probe()],
          startedAt: NOW,
          finishedAt: NOW
        }),
        collectGarbage: async () => undefined,
        readRetainedHeap: async () => null,
        stop: proc.stop
      } satisfies LaunchHandle
    }
  } as unknown as World
  return { world, launched }
}

/**
 * Failure path: the real launchApp runs end to end (spawn + capture + the
 * catch-branch reap); the target wait is the only injected part.
 */
const failingWorld = (dir: string): World =>
  ({
    launchApp: (options: LaunchOptions) =>
      createWorld({ env: process.env }).launchApp({
        ...options,
        command: process.execPath,
        args: [treeScript(dir, 'leader-exits')],
        cwd: dir,
        waitForTarget: async () => {
          await waitFor(() => existsSync(pidFileOf(dir, 'leader-exits')))
          return {
            target: null,
            reason: 'process-exited' as SpikeFailureReason,
            portProbe: [probe({ ok: false, pageTargets: 0, url: null, error: 'ECONNREFUSED' })],
            startedAt: NOW,
            finishedAt: NOW
          }
        }
      })
  }) as unknown as World

const runNode = (script: string, args: string[], timeoutMs: number): Promise<DriverResult> =>
  new Promise((done) => {
    const started = Date.now()
    const child = spawn(process.execPath, [script, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout?.on('data', (chunk) => {
      output += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      output += String(chunk)
    })
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      done({ code, signal, elapsedMs: Date.now() - started, output })
    })
  })

/** A separate Node driver process: no injected kill, the CLI must exit itself. */
const driverScript = (dir: string): string => {
  const path = join(dir, 'spike-driver.mjs')
  writeFileSync(
    path,
    `import { existsSync } from 'node:fs'
import { runVerifyReleaseCli, spawnCapturedChild } from ${JSON.stringify(moduleUrl)}

const [outDir, tree, cwd, pidFile] = process.argv.slice(2)
const NOW = ${JSON.stringify(NOW)}
const proc = spawnCapturedChild({ command: process.execPath, args: [tree], cwd, env: { ...process.env }, processGroup: true })
const deadline = Date.now() + 4000
while (!existsSync(pidFile) && Date.now() < deadline) await new Promise((done) => setTimeout(done, 20))
const world = {
  launchApp: async () => ({
    cdp: { url: 'out/renderer/index.html', send: async () => ({}), evaluate: async () => true, waitFor: async () => true, close: () => undefined },
    output: proc.output,
    diagnostics: () => ({
      reason: null,
      exitCode: proc.exitCode(),
      signal: proc.signal(),
      stdout: proc.stdout(),
      stderr: proc.stderr(),
      portProbe: [${JSON.stringify(probe())}],
      startedAt: NOW,
      finishedAt: NOW
    }),
    collectGarbage: async () => undefined,
    readRetainedHeap: async () => null,
    stop: proc.stop
  })
}
const code = await runVerifyReleaseCli(['--tag=v9.9.9', '--layer=ci', '--spike', \`--out=\${outDir}\`], {
  world,
  env: { ELECTRON_BINARY: process.execPath },
  platform: 'linux'
})
process.exitCode = code
`
  )
  return path
}

afterAll(async () => {
  for (const proc of spawned) {
    if (proc.child.exitCode === null) await stopChild(proc.child, { processGroup: true, graceMs: 200, killWaitMs: 200 })
  }
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true })
})

describe('linux process-group teardown', () => {
  it('kills the whole tree and releases both pipes', async () => {
    const dir = tempDir()
    const { proc, grandchild } = await startTree(dir, 'normal')
    await proc.stop()
    expect(pidAlive(proc.child.pid as number)).toBe(false)
    expect(pidAlive(grandchild)).toBe(false)
    expect(proc.child.stdout?.destroyed).toBe(true)
    expect(proc.child.stderr?.destroyed).toBe(true)
    expect(proc.child.listenerCount('exit')).toBe(0)
    expect(proc.child.stdout?.listenerCount('data')).toBe(0)
    expect(proc.child.stderr?.listenerCount('data')).toBe(0)
  }, 15_000)

  it('escalates to SIGKILL when the tree ignores SIGTERM', async () => {
    const dir = tempDir()
    const { proc, grandchild } = await startTree(dir, 'stubborn')
    expect(pidAlive(grandchild)).toBe(true)
    await stopChild(proc.child, { processGroup: true, graceMs: 200, killWaitMs: 1_000 })
    expect(pidAlive(proc.child.pid as number)).toBe(false)
    expect(pidAlive(grandchild)).toBe(false)
    expect(proc.child.stdout?.destroyed).toBe(true)
  }, 15_000)

  it('reaps a grandchild that outlived the group leader', async () => {
    const dir = tempDir()
    const { proc, grandchild } = await startTree(dir, 'leader-exits')
    await waitFor(() => proc.exitCode() !== null)
    expect(pidAlive(grandchild)).toBe(true)
    await stopChild(proc.child, { processGroup: true, graceMs: 500, killWaitMs: 500 })
    expect(pidAlive(grandchild)).toBe(false)
  }, 15_000)

  it('keeps the group flag Linux-only and the budgets untouched', () => {
    expect(spikeUsesProcessGroup('linux')).toBe(true)
    expect(spikeUsesProcessGroup('darwin')).toBe(false)
    expect(spikeUsesProcessGroup('win32')).toBe(false)
    expect(SPIKE_PROCESS_EXIT_BUDGET_MS).toBe(5_000)
    expect(SPIKE_TARGET_TIMEOUT_MS).toBe(60_000)
    expect(SPIKE_APP_SHELL_TIMEOUT_MS).toBe(60_000)
  })
})

describe('spike CLI teardown', () => {
  it('reaps the tree and keeps window-booted evidence on the success path', async () => {
    const dir = tempDir()
    const { world, launched } = successWorld(dir)
    const { code, outDir, record, log } = await runSpikeCli(world)
    expect(code).toBe(0)
    expect(record.conclusion).toBe('window-booted')
    expect(record.reason).toBeNull()
    expect(record.url).toBe('out/renderer/index.html')
    expect((record.portProbe as SpikePortProbe[]).length).toBe(1)
    expect(existsSync(join(outDir, 'spike-launch.log'))).toBe(true)
    expect(log.includes('window-booted')).toBe(true)
    expect(pidAlive(launched[0]?.child.pid as number)).toBe(false)
    expect(pidAlive(readRecordedPid(dir, 'normal'))).toBe(false)
  }, 15_000)

  it('reaps the tree and keeps the process-exited contract on the failure path', async () => {
    const dir = tempDir()
    const { code, record, log } = await runSpikeCli(failingWorld(dir))
    expect(code).toBe(1)
    expect(record.conclusion).toBe('failed')
    expect(record.reason).toBe('process-exited')
    expect(record.exitCode).toBe(0)
    expect(log.includes('process-exited')).toBe(true)
    expect(pidAlive(readRecordedPid(dir, 'leader-exits'))).toBe(false)
  }, 15_000)
})

describe('deterministic CLI exit', () => {
  it('exits within budget after a success spike and keeps both files intact', async () => {
    const dir = tempDir()
    const outDir = join(dir, 'verify-out')
    const result = await runNode(driverScript(dir), [outDir, treeScript(dir, 'normal'), dir, pidFileOf(dir, 'normal')], 15_000)
    expect(result.output).not.toContain('Error')
    expect(result.signal).toBeNull()
    expect(result.code).toBe(0)
    expect(result.elapsedMs).toBeLessThan(15_000)
    const record = JSON.parse(readFileSync(join(outDir, 'spike.json'), 'utf8')) as Record<string, unknown>
    expect(record.conclusion).toBe('window-booted')
    expect(record.reason).toBeNull()
    const log = readFileSync(join(outDir, 'spike-launch.log'), 'utf8')
    expect(log.includes(`id=${String(record.id)}`)).toBe(true)
    expect(log.includes('/json/list')).toBe(true)
    expect(log.includes('pageTargets=1')).toBe(true)
    expect(pidAlive(readRecordedPid(dir, 'normal'))).toBe(false)
  }, 20_000)

  it('wires the bounded exit only at the module entry', () => {
    const source = readFileSync(join(repoRoot, 'scripts/verify-release.mjs'), 'utf8')
    const library = source.slice(source.indexOf('export async function runVerifyReleaseCli'), source.indexOf('const invokedPath'))
    expect(library.includes('exitAfterFlush(')).toBe(false)
    const entry = source.slice(source.indexOf('const invokedPath'))
    expect(entry.includes('exitAfterFlush(code)')).toBe(true)
    expect(entry.includes('exitAfterFlush(1)')).toBe(true)
  })

  it('flushes queued output first and falls back to a bounded exit', async () => {
    const fakeProc = (): FakeProc => {
      const callbacks: Array<() => void> = []
      const proc: FakeProc = {
        exitCode: undefined,
        exited: [],
        exit: (code) => {
          proc.exitCode = code
          proc.exited.push(code)
        },
        stdout: { write: (_chunk, done) => callbacks.push(done) },
        stderr: { write: (_chunk, done) => callbacks.push(done) },
        flush: () => {
          for (const done of callbacks) done()
        }
      }
      return proc
    }
    const drained = fakeProc()
    exitAfterFlush(0, { proc: drained, timeoutMs: 200 })
    expect(drained.exited).toEqual([])
    drained.flush()
    expect(drained.exited).toEqual([0])
    const stuck = fakeProc()
    exitAfterFlush(3, { proc: stuck, timeoutMs: 20 })
    expect(stuck.exited).toEqual([])
    await sleep(80)
    expect(stuck.exited).toEqual([3])
  })
})

describe('gate registration and run evidence', () => {
  it('registers the process-tree gate in the default matrix', () => {
    const manifest = JSON.parse(readFileSync(join(repoRoot, '.munk/code-gates.json'), 'utf8')) as {
      version: number
      gates: Array<{ id: string; cwd: string; command: string }>
    }
    expect(manifest.version).toBe(1)
    const gate = manifest.gates.find((entry) => entry.id === 'spike-process-tree-gate')
    expect(gate).toEqual({ id: 'spike-process-tree-gate', cwd: '.', command: 'pnpm test src/spike-process-tree-gate.test.ts' })
    expect(existsSync(join(repoRoot, 'src/spike-process-tree-gate.test.ts'))).toBe(true)
  })

  it('records the run, the artifact and the teardown contract in lessons', () => {
    const lessons = readFileSync(join(repoRoot, 'docs/lessons.md'), 'utf8')
    for (const marker of ['41560874002', '125670904874', '13195819978', 'detached: true', 'SIGKILL', 'spike-process-tree-gate']) {
      expect(lessons.includes(marker)).toBe(true)
    }
  })
})
