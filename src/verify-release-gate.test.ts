/**
 * Gate for `scripts/verify-release.mjs`: fail-closed A layer with a fixed check
 * set and no heap/fixture access, a three-round B layer against the 16 MiB
 * retained-heap line, a read-only post-release workflow, and one pure
 * `judgeReleaseGate` shared by the CLI and this suite. Everything runs offline:
 * release metadata, runner commands and the DevTools page are injected fixtures.
 */
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as ts from 'typescript'
import { afterAll, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import {
  CANCEL_NOISE_PATTERN, CANCEL_TREE_FILES_PER_SIDE, CI_CHECK_GROUPS, CI_PLATFORMS, LOCAL_CHECKS,
  LOCAL_FIXTURE_ROOTS, MANUAL_NOT_COVERED, RETENTION_THRESHOLD_BYTES, SMOKE_TREE, buildEnvironment,
  buildSummary, checksFor, compareCheckSets, expectedCheckIds, judgeLocalRounds, judgeReleaseGate,
  judgeRetainedHeap, normalizeVersion, parseArgs, readAsarJsonEntry, runVerifyReleaseCli, scanCancelNoise,
  selectedPlatforms, summarizeCounts, validateStep, validateSummary, versionEqualsTag
} from '../scripts/verify-release.mjs'
import type {
  CiPlatform, CommandResult, FourStateCounts, LaunchHandle, ReleaseMetadata, StepRecord, StepStatus,
  Summary, World
} from '../scripts/verify-release.mjs'
const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const TAG = 'v9.9.9'
const VERSION = '9.9.9'
const B_LAYER_PREFIX = '/Users/zhutao/opencompare-fixtures'
const MIB = 1024 * 1024
const ENVIRONMENT = { ImageOS: 'ubuntu24', ImageVersion: '20260101.1', RUNNER_OS: 'Linux', GITHUB_RUN_ID: '1234567890' }
const CI_ENV: Record<string, string> = { CI: 'true', GITHUB_ACTIONS: 'true', ...ENVIRONMENT }
const LOCAL_ENV: Record<string, string> = {}
const { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } = fs
const silent = (): void => undefined
/** The only file-read entry point: fixtures are input data, never assertions. */
const readBytes = (path: string): Buffer => fs.readFileSync(path)
const readText = (path: string): string => readBytes(path).toString('utf8')
const readJson = <T>(path: string): T => JSON.parse(readText(path)) as T
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')
/** Markdown assertions read parsed atoms (headings, code spans, tables, list items), never raw prose. */
const markdownAtoms = (markdown: string): string[] => {
  const atoms: string[] = []
  let fenced = false
  for (const raw of markdown.replaceAll('\r', '').split('\n')) {
    const line = raw.trim()
    if (/^(?:```|~~~)/.test(line)) { fenced = !fenced; continue }
    if (fenced) { atoms.push(line); continue }
    for (const span of line.matchAll(/`([^`]+)`/g)) atoms.push(span[1])
    const heading = /^#{1,6}\s+(.+)$/.exec(line)
    if (heading !== null) atoms.push(heading[1])
    const item = /^(?:[-*+]|\d+\.)\s+(.+)$/.exec(line)
    if (item !== null) atoms.push(item[1])
    if (line.startsWith('|')) atoms.push(...line.split('|').map((cell) => cell.trim()).filter(Boolean))
  }
  return atoms
}
const ASSET_NAMES = [
  `OpenCompare-${VERSION}-arm64.dmg`, `OpenCompare-${VERSION}-arm64-mac.zip`,
  `OpenCompare-Setup-${VERSION}.exe`, `OpenCompare-${VERSION}-win-x64.zip`,
  `OpenCompare-${VERSION}.AppImage`, `opencompare_${VERSION}_amd64.deb`, 'latest-mac.yml', 'latest.yml', 'latest-linux.yml'
]
const fixtureAssets = (): Array<{ name: string; bytes: Buffer }> => ASSET_NAMES.map((name) => ({ name, bytes: Buffer.from(`fixture bytes for ${name}\n`) }))
/** A minimal, real asar header so the AppImage version leg reads a real buffer. */
const buildAsar = (files: Record<string, Buffer>): Buffer => {
  const header: { files: Record<string, { size: number; offset: string }> } = { files: {} }
  const bodies: Buffer[] = []
  let offset = 0
  for (const [name, bytes] of Object.entries(files)) { header.files[name] = { size: bytes.length, offset: String(offset) }; bodies.push(bytes); offset += bytes.length }
  // The layout @electron/asar writes: [u32 4][u32 headerSize][u32 len + 4][u32 len][json][bodies].
  const json = Buffer.from(JSON.stringify(header), 'utf8')
  const headerJson = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4)])
  const outer = Buffer.alloc(8), inner = Buffer.alloc(8)
  outer.writeUInt32LE(4, 0); outer.writeUInt32LE(8 + headerJson.length, 4)
  inner.writeUInt32LE(4 + headerJson.length, 0); inner.writeUInt32LE(headerJson.length, 4)
  return Buffer.concat([outer, inner, headerJson, ...bodies])
}
interface FakeOptions {
  macVersion?: string; debVersion?: string; linuxVersion?: string; windowsVersion?: string
  authenticode?: string; codesignStatus?: number; gatekeeperOutput?: string; staplerStatus?: number
  fourState?: FourStateCounts; fourStateSequence?: FourStateCounts[]; cancelNoise?: string
  progressAppears?: boolean; cancelButton?: boolean; operableAfterCancel?: boolean; missingAsset?: string
  metadataSize?: (name: string) => number; metadataSha?: (name: string) => string | null
  releaseTag?: string; fixturePresent?: boolean; heapSequence?: Array<number | null>; failFourStateAtRound?: number
}
const ok = (stdout = ''): CommandResult => ({ status: 0, signal: null, stdout, stderr: '' })
const bad = (stderr = 'failed'): CommandResult => ({ status: 1, signal: null, stdout: '', stderr })
/** A real filesystem with scripted commands, release metadata and a fake window. */
class FakeHost {
  readonly paths: string[] = []; readonly commands: string[][] = []; readonly heapCalls: string[] = []
  readonly detached: string[] = []; readonly assets = fixtureAssets(); readonly world: World
  private readonly virtualDirs = new Map<string, string[]>(); private round = 0
  constructor(private readonly options: FakeOptions = {}) {
    const heap = [...(options.heapSequence ?? [])]
    const isFixture = (path: string): boolean => [LOCAL_FIXTURE_ROOTS.left, LOCAL_FIXTURE_ROOTS.right].some((root) => path === root || path.startsWith(`${root}/`))
    const seen = (path: string): void => { this.paths.push(path) }
    this.world = {
      exists: (path) => { seen(path); return isFixture(path) ? options.fixturePresent !== false : existsSync(path) },
      readdir: (path, readdirOptions) => {
        seen(path); if (isFixture(path)) return path === LOCAL_FIXTURE_ROOTS.left || path === LOCAL_FIXTURE_ROOTS.right ? ['a.txt', 'b.txt', 'c.txt'].map((name) => ({ name, isDirectory: () => false })) : []
        const virtual = this.virtualDirs.get(path); return virtual !== undefined ? virtual.map((name) => ({ name, isDirectory: () => false })) : readdirSync(path, readdirOptions as never)
      },
      isDirectory: (path) => { seen(path); return false },
      readText: (path) => { seen(path); return readText(path) },
      readBytes: (path) => { seen(path); return readBytes(path) },
      size: (path) => { seen(path); return readBytes(path).length },
      mkdir: (path) => { seen(path); mkdirSync(path, { recursive: true }) },
      writeText: (path, text) => {
        seen(path); if (!path.includes('/cancel/')) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); return }
        const names = this.virtualDirs.get(dirname(path)) ?? []; names.push(path.slice(dirname(path).length + 1)); this.virtualDirs.set(dirname(path), names)
      },
      chmod: () => undefined,
      sha256: (path) => { seen(path); return sha256(readBytes(path)) },
      run: (command, args = [], runOptions = {}) => { this.commands.push([command, ...args]); return this.runCommand(command, args, runOptions) },
      release: async (tag): Promise<ReleaseMetadata> => ({
        tag: options.releaseTag ?? tag,
        assets: this.assets.filter((asset) => asset.name !== options.missingAsset).map((asset) => ({
          name: asset.name, url: `https://example.test/${asset.name}`,
          size: options.metadataSize === undefined ? asset.bytes.length : options.metadataSize(asset.name),
          sha256: options.metadataSha === undefined ? sha256(asset.bytes) : options.metadataSha(asset.name)
        }))
      }),
      launchApp: async (): Promise<LaunchHandle> => ({
        cdp: {
          url: 'devtools://opencompare/', send: async () => ({}), close: () => undefined, evaluate: async (expression) => this.evaluate(expression),
          waitFor: async (_expression, description) => { if (description.includes('progress to appear') && options.progressAppears === false) throw new Error(`等待超时: ${description}`); return true }
        },
        output: [options.cancelNoise ?? ''],
        collectGarbage: async () => { this.heapCalls.push('HeapProfiler.collectGarbage') },
        readRetainedHeap: async () => { this.heapCalls.push('JSHeapUsedSize'); return heap.length === 0 ? null : (heap.shift() ?? null) },
        stop: async () => undefined
      })
    }
  }
  private fourState(): FourStateCounts {
    const sequence = this.options.fourStateSequence
    return sequence !== undefined ? sequence[Math.min(this.round, sequence.length - 1)] : (this.options.fourState ?? SMOKE_TREE)
  }
  private evaluate(expression: string): unknown {
    if (expression.includes('footer[data-shell-level="status"]')) {
      this.round += 1; if (this.options.failFourStateAtRound === this.round) throw new Error('injected round failure'); return this.fourState()
    }
    if (expression.includes('button.ml-auto')) return this.options.cancelButton !== false
    if (expression.includes('data-session-tab')) return { tabs: 0, trees: 0 }
    if (expression.includes('data-shell-entry="new-compare"')) return this.options.operableAfterCancel !== false
    return true
  }
  private runCommand(command: string, args: string[], options: Record<string, unknown>): CommandResult {
    if (command === 'gh') {
      const dir = args[args.indexOf('--dir') + 1] as string
      if (args[0] !== 'release' || args[1] !== 'download' || !args.includes('--dir')) return bad('unexpected gh call')
      mkdirSync(dir, { recursive: true })
      for (const asset of this.assets) if (asset.name !== this.options.missingAsset) writeFileSync(join(dir, asset.name), asset.bytes)
      return ok()
    }
    if (command === 'hdiutil') {
      if (args[0] === 'detach') { this.detached.push(args[1] as string); return ok() }
      if (args[0] !== 'attach') return bad('unexpected hdiutil call')
      const mountPoint = args[args.indexOf('-mountpoint') + 1] as string
      mkdirSync(join(mountPoint, 'OpenCompare.app', 'Contents'), { recursive: true }); writeFileSync(join(mountPoint, 'OpenCompare.app', 'Contents', 'Info.plist'), 'plist'); return ok()
    }
    if (command === 'ditto') { mkdirSync(args[1] as string, { recursive: true }); return ok() }
    if (command === 'plutil') return ok(`${this.options.macVersion ?? VERSION}\n`)
    if (command === 'codesign') return (this.options.codesignStatus ?? 0) === 0 ? ok() : bad('invalid signature')
    if (command === 'spctl') return ok(this.options.gatekeeperOutput ?? 'OpenCompare.app: accepted\nsource=Notarized Developer ID\n')
    if (command === 'xcrun') return (this.options.staplerStatus ?? 0) === 0 ? ok('The validate action worked!') : bad('no ticket')
    if (command === 'cp') { copyFileSync(args[0] as string, args[1] as string); return ok() }
    if (command === 'xvfb-run') {
      const root = join(String(options.cwd ?? process.cwd()), 'squashfs-root'); mkdirSync(join(root, 'resources'), { recursive: true }); writeFileSync(join(root, 'opencompare'), 'binary')
      writeFileSync(join(root, 'resources', 'app.asar'), buildAsar({ 'package.json': Buffer.from(JSON.stringify({ version: this.options.linuxVersion ?? VERSION })) }))
      return ok()
    }
    if (command === 'dpkg-deb') {
      if (args[0] === '-f') return ok(`${this.options.debVersion ?? VERSION}\n`)
      if (args[0] !== '-x') return bad('unexpected dpkg-deb call')
      mkdirSync(join(args[2] as string, 'opt', 'OpenCompare'), { recursive: true }); writeFileSync(join(args[2] as string, 'opt', 'OpenCompare', 'opencompare'), 'binary'); return ok()
    }
    if (command === 'unzip') { const root = args[args.indexOf('-d') + 1] as string; mkdirSync(root, { recursive: true }); writeFileSync(join(root, 'OpenCompare.exe'), 'exe'); return ok() }
    if (command === 'pwsh') return ok(`${(args.join(' ').includes('Get-AuthenticodeSignature') ? this.options.authenticode ?? 'Valid' : this.options.windowsVersion ?? VERSION)}\n`)
    return bad(`unexpected command ${command}`)
  }
}
interface CiRun { code: number; out: string; summary: Summary; steps: Record<string, StepRecord> }
const tempDirs: string[] = []
const tempDir = (prefix: string): string => { const dir = mkdtempSync(join(tmpdir(), prefix)); tempDirs.push(dir); return dir }
const runCli = async (host: FakeHost, layer: 'ci' | 'local', extra: string[] = [], env = layer === 'ci' ? CI_ENV : LOCAL_ENV): Promise<CiRun> => {
  const out = tempDir(`opencompare-verify-${layer}-`)
  const code = await runVerifyReleaseCli([`--tag=${TAG}`, `--layer=${layer}`, `--out=${out}`, ...extra], { world: host.world, env, stdout: silent, stderr: silent })
  const summary = readJson<Summary>(join(out, 'summary.json'))
  const steps: Record<string, StepRecord> = {}
  for (const name of readdirSync(join(out, 'steps'))) { const step = readJson<StepRecord>(join(out, 'steps', name)); steps[step.id] = step }
  return { code, out, summary, steps }
}
const runCi = (host: FakeHost, extra: string[] = [], env = CI_ENV): Promise<CiRun> => runCli(host, 'ci', extra, env)
const runLocal = (host: FakeHost): Promise<CiRun> => runCli(host, 'local')
const fakeStep = (id: string, status: StepStatus = 'pass'): StepRecord => ({ id, name: id, command: id, expected: {}, actual: {}, status, evidence: ['/tmp/evidence.log'], startedAt: '2026-11-02T00:00:00.000Z', finishedAt: '2026-11-02T00:00:01.000Z' })
const ciIds = expectedCheckIds({ layer: 'ci' })
const expectedMac = expectedCheckIds({ layer: 'ci', platforms: ['mac'] })
const summaryFrom = (steps: StepRecord[], opts: { expectedIds?: string[]; environment?: Summary['environment'] } = {}): Summary =>
  buildSummary({ tag: TAG, layer: 'ci', steps, environment: opts.environment ?? ENVIRONMENT, evidenceDir: '/tmp', expectedIds: opts.expectedIds ?? expectedMac })
const validSummary = (steps = ciIds.map((id) => fakeStep(id))): Summary => summaryFrom(steps, { expectedIds: ciIds })
describe('A-layer check registry', () => {
  it('registers the six fixed groups with 15 checks and filters by platform', () => {
    expect(CI_CHECK_GROUPS.map((group) => group.id)).toEqual(['identity', 'mac', 'linux', 'windows', 'cancel-log', 'evidence'])
    expect(CI_CHECK_GROUPS.map((group) => group.checks.length)).toEqual([2, 4, 3, 2, 2, 2])
    expect([ciIds.length, new Set(ciIds).size]).toEqual([15, 15])
    expect(ciIds).toEqual(checksFor({ layer: 'ci' }).map((check) => check.id))
    expect(expectedCheckIds({ layer: 'ci', platforms: ['mac'] })).toEqual(['identity-release-metadata', 'identity-asset-bytes-sha256', 'mac-dmg-version', 'mac-codesign', 'mac-gatekeeper', 'mac-stapler', 'evidence-environment', 'evidence-artifacts'])
    expect(expectedCheckIds({ layer: 'ci', platforms: ['linux'] })).toEqual(['identity-release-metadata', 'identity-asset-bytes-sha256', 'linux-appimage-version', 'linux-deb-version', 'linux-directory-compare', 'cancel-leg', 'cancel-log-scan', 'evidence-environment', 'evidence-artifacts'])
    expect(expectedCheckIds({ layer: 'ci', platforms: [...CI_PLATFORMS] })).toEqual(ciIds)
  })
  it('keeps heap out of the A layer and the local registry at three checks', () => {
    for (const check of checksFor({ layer: 'ci' })) {
      expect(`${check.id} ${check.name}`, check.id).not.toMatch(/heap|memory/i); expect(check.command, check.id).not.toMatch(/HeapProfiler|Performance\.getMetrics|JSHeapUsedSize/)
    }
    const localIds = expectedCheckIds({ layer: 'local' })
    expect(localIds).toEqual(['local-fixture', 'local-rounds-4state', 'local-retained-heap']); expect(LOCAL_CHECKS.map((check) => check.id)).toEqual(localIds)
    expect(localIds.includes('local-retained-heap')).toBe(true); expect(localIds.filter((id) => ciIds.includes(id))).toEqual([])
    for (const entry of MANUAL_NOT_COVERED) expect([entry.reason, localIds.includes(entry.id)]).toEqual(['not-covered', false])
  })
})
describe('CLI contract', () => {
  it('rejects bad argv and an unwritable --out without a summary', async () => {
    const out = tempDir('opencompare-verify-args-')
    const cases = [['--layer=ci', `--out=${out}`], [`--tag=${TAG}`, '--layer=fast', `--out=${out}`], [`--tag=${TAG}`, '--layer=ci', `--out=${out}`, '--nope=1'], ['--tag=1.2.3', '--layer=ci', `--out=${out}`]]
    for (const argv of cases) {
      const code = await runVerifyReleaseCli(argv, { world: new FakeHost().world, env: CI_ENV, stdout: silent, stderr: silent })
      expect(code, argv.join(' ')).toBeGreaterThan(0); expect(existsSync(join(out, 'summary.json')), argv.join(' ')).toBe(false)
    }
    const file = join(tempDir('opencompare-verify-out-'), 'not-a-dir'); writeFileSync(file, 'x')
    const code = await runVerifyReleaseCli([`--tag=${TAG}`, '--layer=ci', `--out=${join(file, 'out')}`], { world: new FakeHost().world, env: CI_ENV, stdout: silent, stderr: silent })
    expect(code).toBeGreaterThan(0); expect(existsSync(join(file, 'out', 'summary.json'))).toBe(false)
  })
  it('refuses any switch that would widen the retained-heap line and narrows platforms only on request', () => {
    for (const flag of ['--threshold=64', '--max-retained=1', '--tolerance=0.5']) expect(parseArgs([`--tag=${TAG}`, '--layer=local', '--out=/tmp/oc', flag])).toEqual({ error: expect.any(String) })
    expect(parseArgs([`--tag=${TAG}`, '--layer=local', '--out=/tmp/oc']).options).toEqual({ tag: TAG, layer: 'local', out: '/tmp/oc' })
    expect([selectedPlatforms(undefined), selectedPlatforms('all'), selectedPlatforms('windows')]).toEqual([[...CI_PLATFORMS], [...CI_PLATFORMS], ['windows']])
  })
})
describe('A-layer run', () => {
  it('passes a fully injected run and writes the summary, steps and logs', async () => {
    const run = await runCi(new FakeHost(), ['--platform=all'])
    expect(run.code).toBe(0); expect(run.summary).toMatchObject({ status: 'pass', counts: { pass: 15, fail: 0, skip: 0, total: 15, expected: 15 }, missing: [], unexpected: [], duplicates: [], manual: [], environment: ENVIRONMENT })
    expect(run.summary.problems).toBeUndefined(); expect(run.summary.evidenceDir).toBe(run.out)
    expect(Object.keys(run.steps)).toHaveLength(15); expect(readdirSync(join(run.out, 'logs'))).toHaveLength(15)
    const stepKeys = ['actual', 'command', 'evidence', 'expected', 'finishedAt', 'id', 'name', 'startedAt', 'status']
    for (const step of Object.values(run.steps)) {
      expect(Object.keys(step).sort()).toEqual(stepKeys); expect(step.status).toBe('pass'); expect(step.evidence.length).toBeGreaterThan(0)
      for (const path of step.evidence) expect(existsSync(path)).toBe(true)
    }
  })
  it('never samples heap and never touches the local 6.4 GiB fixture pair', async () => {
    const host = new FakeHost(); const run = await runCi(host, ['--platform=all'])
    expect(run.code).toBe(0); expect(host.heapCalls).toEqual([])
    expect(host.paths.filter((path) => path.startsWith(B_LAYER_PREFIX))).toEqual([])
    expect(host.commands.filter((args) => args.join(' ').includes(B_LAYER_PREFIX))).toEqual([])
    expect(host.commands.filter((args) => /HeapProfiler|Performance\.getMetrics/.test(args.join(' ')))).toEqual([])
  })
  it('keeps the identity conclusion independent of the selected platform', async () => {
    const single = await runCi(new FakeHost(), ['--platform=mac']); const all = await runCi(new FakeHost(), ['--platform=all'])
    expect(single.steps['identity-asset-bytes-sha256'].actual).toEqual(all.steps['identity-asset-bytes-sha256'].actual); expect(single.steps['identity-release-metadata'].actual).toEqual(all.steps['identity-release-metadata'].actual)
  })
})
interface FailCase { name: string; opts: FakeOptions; platform: CiPlatform; step: string; detached?: boolean }
const failCases: FailCase[] = [
  { name: 'mac version mismatch', opts: { macVersion: '9.9.8' }, platform: 'mac', step: 'mac-dmg-version', detached: true },
  { name: 'codesign', opts: { codesignStatus: 1 }, platform: 'mac', step: 'mac-codesign' },
  { name: 'gatekeeper', opts: { gatekeeperOutput: 'rejected\nsource=Unnotarized Developer ID\n' }, platform: 'mac', step: 'mac-gatekeeper' },
  { name: 'stapler', opts: { staplerStatus: 1 }, platform: 'mac', step: 'mac-stapler' },
  { name: 'missing dmg asset', opts: { missingAsset: `OpenCompare-${VERSION}-arm64.dmg` }, platform: 'mac', step: 'mac-dmg-version' },
  { name: 'AppImage version', opts: { linuxVersion: '9.9.8' }, platform: 'linux', step: 'linux-appimage-version' },
  { name: 'deb version', opts: { debVersion: '9.9.8' }, platform: 'linux', step: 'linux-deb-version' },
  { name: 'synthetic four-state drift', opts: { fourState: { same: 9, added: 3, removed: 2, modified: 4 } }, platform: 'linux', step: 'linux-directory-compare' },
  { name: 'portable zip version', opts: { windowsVersion: '9.9.8' }, platform: 'windows', step: 'windows-zip-version' },
  { name: 'Authenticode', opts: { authenticode: 'NotSigned' }, platform: 'windows', step: 'windows-authenticode' },
  { name: 'unobserved cancel point', opts: { progressAppears: false }, platform: 'linux', step: 'cancel-leg' },
  { name: 'missing cancel button', opts: { cancelButton: false }, platform: 'linux', step: 'cancel-leg' },
  { name: 'inoperable after cancel', opts: { operableAfterCancel: false }, platform: 'linux', step: 'cancel-leg' },
  { name: 'cancellation noise', opts: { cancelNoise: 'stderr: OperationCancelledError: aborted\n' }, platform: 'linux', step: 'cancel-log-scan' }
]
describe('platform legs', () => {
  it.each(failCases)('$name fails $step', async ({ opts, platform, step, detached }) => {
    const host = new FakeHost(opts); const run = await runCi(host, [`--platform=${platform}`])
    expect(run.summary.status, step).toBe('fail'); expect(run.code, step).toBeGreaterThan(0)
    expect(run.steps[step].status, step).toBe('fail')
    if (detached === true) expect(host.detached).toHaveLength(1)
  })
  it('names the tampered asset and the byte-count mismatch on the exact asset', async () => {
    const tampered = await runCi(new FakeHost({ metadataSha: (name) => (name === ASSET_NAMES[0] ? 'a'.repeat(64) : null) }), ['--platform=mac'])
    const actual = tampered.steps['identity-asset-bytes-sha256'].actual as { problems: string[] }
    expect(actual.problems).toHaveLength(ASSET_NAMES.length); expect(actual.problems[0].startsWith(`${ASSET_NAMES[0]} sha256`)).toBe(true)
    expect(tampered.steps['identity-release-metadata'].status).toBe('fail')
    const sized = await runCi(new FakeHost({ metadataSize: (name) => (name === 'latest.yml' ? 1 : undefined as unknown as number) }), ['--platform=mac'])
    expect((sized.steps['identity-asset-bytes-sha256'].actual as { problems: string[] }).problems.some((problem) => problem.startsWith('latest.yml 字节'))).toBe(true)
  })
  it('fails the metadata leg when a release asset carries no sha256', async () => {
    const run = await runCi(new FakeHost({ metadataSha: () => null }), ['--platform=mac'])
    const problems = (run.steps['identity-release-metadata'].actual as { problems: string[] }).problems
    expect(problems).toHaveLength(ASSET_NAMES.length); expect(problems.every((problem) => problem.endsWith('缺 sha256'))).toBe(true)
  })
})
describe('fail-closed summary', () => {
  it('goes red with the exact id when a check is missing, unexpected or skipped', () => {
    expect(summaryFrom(expectedMac.filter((id) => id !== 'mac-stapler').map((id) => fakeStep(id)))).toMatchObject({ status: 'fail', missing: ['mac-stapler'], counts: { expected: 8, total: 7 } })
    expect(summaryFrom([...expectedMac.map((id) => fakeStep(id)), fakeStep('mac-heap-sample')])).toMatchObject({ status: 'fail', unexpected: ['mac-heap-sample'] })
    expect(summaryFrom(expectedMac.map((id) => fakeStep(id, id === 'mac-codesign' ? 'skip' : 'pass')))).toMatchObject({ status: 'fail', skipped: ['mac-codesign'], counts: { skip: 1, fail: 0 } })
  })
  it('rejects a wrong expected count, runner image, missing evidence file and missing step field', () => {
    const summary = summaryFrom(expectedMac.map((id) => fakeStep(id)), { environment: { ...ENVIRONMENT, ImageOS: 'unknown' } })
    const verdict = validateSummary({ ...summary, counts: { ...summary.counts, expected: 3 } }, { expectedIds: expectedMac, exists: () => true })
    expect(verdict.ok).toBe(false); expect(verdict.problems).toEqual(expect.arrayContaining([expect.stringMatching(/counts\.expected 3/), expect.stringMatching(/ImageOS=unknown/)]))
    const missingEvidence = judgeReleaseGate(summaryFrom(expectedMac.map((id) => fakeStep(id))), { expectedIds: expectedMac, exists: () => false })
    expect(missingEvidence).toMatchObject({ ok: false, status: 'fail' }); expect(missingEvidence.problems.some((problem) => problem.includes('不存在'))).toBe(true)
    const step = fakeStep('identity-release-metadata') as Partial<StepRecord>; delete step.finishedAt
    const fieldVerdict = validateStep(step, { exists: () => true })
    expect(fieldVerdict.ok).toBe(false); expect(fieldVerdict.problems.some((problem) => problem.includes('finishedAt'))).toBe(true)
  })
  it('never reports pass when a platform job is missing and merges three platform jobs', async () => {
    const partial = summaryFrom(expectedMac.map((id) => fakeStep(id)), { expectedIds: ciIds })
    expect(partial.status).toBe('fail'); expect(partial.counts.expected).toBe(15)
    expect(partial.missing).toEqual(ciIds.filter((id) => !expectedMac.includes(id)))
    const parts = tempDir('opencompare-verify-parts-')
    for (const platform of CI_PLATFORMS) {
      const code = await runVerifyReleaseCli([`--tag=${TAG}`, '--layer=ci', `--platform=${platform}`, `--out=${join(parts, platform)}`], { world: new FakeHost().world, env: CI_ENV, stdout: silent, stderr: silent })
      expect(code, platform).toBe(0)
    }
    const out = join(parts, 'aggregate')
    const code = await runVerifyReleaseCli([`--tag=${TAG}`, '--layer=ci', `--aggregate=${parts}`, `--out=${out}`], { world: new FakeHost().world, env: CI_ENV, stdout: silent, stderr: silent })
    expect(code).toBe(0); expect(readJson<Summary>(join(out, 'summary.json'))).toMatchObject({ status: 'pass', counts: { pass: 15, fail: 0, skip: 0, total: 15, expected: 15 }, duplicates: [] })
  })
})
const LOCAL_COUNTS: FourStateCounts = { same: 2, added: 1, removed: 0, modified: 0 }
const HAPPY_HEAP = [150, 120, 150, 120, 150, 120].map((value) => value * MIB)
describe('local B layer', () => {
  it('judges three rounds and keeps the manual list out of the checks', async () => {
    const host = new FakeHost({ heapSequence: HAPPY_HEAP, fourState: LOCAL_COUNTS }); const run = await runLocal(host)
    expect(run.code).toBe(0); expect(run.summary.status).toBe('pass')
    expect(run.summary.checks.map((check) => check.id)).toEqual(['local-fixture', 'local-rounds-4state', 'local-retained-heap']); expect(run.summary.manual.map((entry) => entry.reason)).toEqual(MANUAL_NOT_COVERED.map((entry) => entry.reason))
    for (const entry of run.summary.manual) expect(run.summary.checks.some((check) => check.id === entry.id)).toBe(false)
    expect(run.summary.checks.every((check) => check.status === 'pass')).toBe(true); expect(readdirSync(join(run.out, 'evidence')).sort()).toEqual(['round-1.json', 'round-2.json', 'round-3.json'])
    expect(host.heapCalls.filter((call) => call === 'JSHeapUsedSize')).toHaveLength(6); expect(host.heapCalls.filter((call) => call === 'HeapProfiler.collectGarbage')).toHaveLength(3)
  })
  it.each([
    ['the real directory pair is missing', { fixturePresent: false, heapSequence: HAPPY_HEAP, fourState: LOCAL_COUNTS }, 'local-fixture'],
    ['a round is missing', { heapSequence: HAPPY_HEAP, failFourStateAtRound: 2 }, 'local-rounds-4state'],
    ['the four-state sum is not the round total', { heapSequence: HAPPY_HEAP, fourState: { same: 9, added: 1, removed: 0, modified: 0 } }, 'local-rounds-4state'],
    ['the three rounds disagree', { heapSequence: HAPPY_HEAP, fourStateSequence: [
      { same: 2, added: 1, removed: 0, modified: 0 }, { same: 1, added: 2, removed: 0, modified: 0 }, { same: 2, added: 1, removed: 0, modified: 0 }
    ] }, 'local-rounds-4state']
  ] as Array<[string, FakeOptions, string]>)('fails when %s', async (_name, options, step) => {
    const run = await runLocal(new FakeHost(options))
    expect(run.steps[step].status).toBe('fail'); expect(run.code).toBeGreaterThan(0)
  })
  it('fails when round 3 grows the retained heap by more than 16 MiB', async () => {
    const over = 120 * MIB + RETENTION_THRESHOLD_BYTES + 1
    const run = await runLocal(new FakeHost({ fourState: LOCAL_COUNTS, heapSequence: [...HAPPY_HEAP.slice(0, 5), over] }))
    expect(run.steps['local-retained-heap'].actual).toMatchObject({ deltaBytes: RETENTION_THRESHOLD_BYTES + 1 })
    expect(run.steps['local-retained-heap'].status).toBe('fail'); expect(run.code).toBeGreaterThan(0)
  })
})
describe('pure judgments', () => {
  it('normalises only the v prefix and X.Y.Z', () => {
    expect(['v9.9.9', '9.9.9', '9.9.9-1', 'nightly', undefined].map((value) => normalizeVersion(value))).toEqual(['9.9.9', '9.9.9', '9.9.9', null, null]); expect([versionEqualsTag('v9.9.9', 'v9.9.9'), versionEqualsTag('9.9.8', 'v9.9.9')]).toEqual([true, false])
  })
  it('puts the retained-heap line exactly at 16 MiB', () => {
    const base = 100 * MIB
    expect(judgeRetainedHeap({ round2RetainedBytes: base, round3RetainedBytes: base + RETENTION_THRESHOLD_BYTES })).toMatchObject({ ok: true, delta: RETENTION_THRESHOLD_BYTES })
    const over = judgeRetainedHeap({ round2RetainedBytes: base, round3RetainedBytes: base + RETENTION_THRESHOLD_BYTES + 1 })
    expect(over.ok).toBe(false); expect(over.problems).toEqual([expect.stringMatching(/> 16777216/)]); expect(RETENTION_THRESHOLD_BYTES).toBe(16 * MIB)
  })
  it('needs three rounds that agree and close their sessions', () => {
    const rounds = [1, 2, 3].map((index) => ({ index, counts: { same: 2, added: 1, removed: 0, modified: 0 }, totalRows: 3, closedTabs: 0, closedTrees: 0, uncollectedHeapBytes: null, retainedHeapBytes: null }))
    expect([judgeLocalRounds({ rounds }).ok, judgeLocalRounds({ rounds: rounds.slice(0, 2) }).ok]).toEqual([true, false])
    expect(judgeLocalRounds({ rounds: rounds.map((round, index) => (index === 2 ? { ...round, closedTabs: 1 } : round)) }).ok).toBe(false)
  })
  it('counts cancel noise only for the fixed pattern and reads an asar JSON entry', () => {
    expect(String(CANCEL_NOISE_PATTERN)).toBe('/OperationCancelledError|ECANCELED/'); expect([scanCancelNoise([{ source: 'a', text: 'all good' }]).count, scanCancelNoise([{ source: 'a', text: 'OperationCancelledError: x' }]).count, scanCancelNoise([{ source: 'b', text: 'write ECANCELED\nmore' }]).count]).toEqual([0, 1, 1])
    const asar = buildAsar({ 'package.json': Buffer.from(JSON.stringify({ version: VERSION })) })
    expect(readAsarJsonEntry(asar, 'package.json')).toEqual({ version: VERSION }); expect([readAsarJsonEntry(asar, 'missing.json'), readAsarJsonEntry(Buffer.alloc(8), 'package.json')]).toEqual([null, null])
  })
  it('compares expected and actual id sets', () => {
    expect(compareCheckSets(['a', 'b'], ['a', 'b'])).toEqual({ missing: [], unexpected: [], ok: true }); expect(compareCheckSets(['a', 'b'], ['a', 'c'])).toEqual({ missing: ['b'], unexpected: ['c'], ok: false })
    expect(summarizeCounts([fakeStep('a'), fakeStep('b', 'fail'), fakeStep('c', 'skip')])).toEqual({ pass: 1, fail: 1, skip: 1, total: 3, expected: 0 })
  })
  it('never substitutes unknown for a missing runner image and records the synthetic calibers', async () => {
    expect(buildEnvironment({ env: { ...CI_ENV, ImageOS: '' }, isCi: true, now: () => new Date(0) })).toEqual({ ...ENVIRONMENT, ImageOS: '' })
    const local = buildEnvironment({ env: {}, isCi: false, now: () => new Date(0) }); expect([local.ImageOS, local.GITHUB_RUN_ID]).toEqual([`local-${process.platform}`, 'local-0'])
    const unknown = await runCi(new FakeHost(), ['--platform=mac'], { ...CI_ENV, ImageOS: 'unknown' })
    expect(unknown.steps['evidence-environment'].status).toBe('fail'); expect(unknown.code).toBeGreaterThan(0)
    const run = await runCi(new FakeHost(), ['--platform=linux'])
    expect(run.steps['cancel-leg'].actual).toMatchObject({ treeFilesPerSide: CANCEL_TREE_FILES_PER_SIDE }); expect(run.steps['linux-directory-compare'].expected).toMatchObject({ ...SMOKE_TREE, totalRows: Object.values(SMOKE_TREE).reduce((total, value) => total + value, 0) })
  })
})
describe('judgeReleaseGate', () => {
  const judge = (summary: unknown, expectedIds = ciIds): ReturnType<typeof judgeReleaseGate> => judgeReleaseGate(summary, { expectedIds, exists: () => true })
  const withStatus = (steps: StepRecord[], status: 'pass' | 'fail'): Summary => ({ ...summaryFrom(steps, { expectedIds: ciIds }), status })
  it('passes a complete summary and fails closed on a missing section or non-object', () => {
    expect(judge(validSummary())).toEqual({ ok: true, status: 'pass', problems: [] })
    const broken = { ...validSummary() } as Record<string, unknown>; delete broken.environment
    expect(judge(broken)).toMatchObject({ ok: false, status: 'fail' }); expect(judge(broken).problems).toEqual(expect.arrayContaining([expect.stringMatching(/summary 缺字段 environment/)]))
    expect(judge(null)).toEqual({ ok: false, status: 'fail', problems: ['summary 不是对象'] })
  })
  it('refuses tampered pass/fail statuses, a skipped check and an expected-count mismatch', () => {
    for (const id of ['mac-dmg-version', 'identity-asset-bytes-sha256'] as const) {
      const verdict = judge(withStatus(ciIds.map((checkId) => fakeStep(checkId, checkId === id ? 'fail' : 'pass')), 'pass'))
      expect(verdict).toMatchObject({ ok: false, status: 'fail' }); expect(verdict.problems.some((problem) => problem.includes('status=pass') || problem.includes(id))).toBe(true)
    }
    const skipped = judge(withStatus(ciIds.map((checkId) => fakeStep(checkId, checkId === 'cancel-leg' ? 'skip' : 'pass')), 'pass'))
    expect(skipped.ok).toBe(false); expect(skipped.problems.some((problem) => problem.includes('status=pass'))).toBe(true)
    expect(judge(withStatus(ciIds.map((id) => fakeStep(id)), 'fail'))).toMatchObject({ ok: false, status: 'fail' })
    expect(judge(withStatus(ciIds.map((id) => fakeStep(id)), 'fail')).problems).toEqual([expect.stringMatching(/summary\.status=fail 不是 pass/)])
    const summary = validSummary(); const counted = judge({ ...summary, counts: { ...summary.counts, expected: 3 } })
    expect(counted.ok).toBe(false); expect(counted.problems.some((problem) => problem.includes('≠ 期望 15'))).toBe(true)
  })
})
describe('script structure (AST)', () => {
  const script = ts.createSourceFile('verify-release.mjs', readText(join(repoRoot, 'scripts/verify-release.mjs')), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const findExported = (name: string): ts.FunctionDeclaration => {
    for (const node of script.statements) {
      if (ts.isFunctionDeclaration(node) && node.name?.text === name && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) return node
    }
    throw new Error(`scripts/verify-release.mjs 未导出函数 ${name}`)
  }
  const walk = (node: ts.Node, visit: (node: ts.Node) => void): void => { visit(node); ts.forEachChild(node, (child) => walk(child, visit)) }
  const callsIn = (name: string): string[] => {
    const names: string[] = []; const body = findExported(name).body
    if (body !== undefined) walk(body, (node) => { if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) names.push(node.expression.text) })
    return names
  }
  it('exports judgeReleaseGate with summary plus injected expectedIds/exists and calls validateSummary', () => {
    const fn = findExported('judgeReleaseGate')
    expect(fn.parameters).toHaveLength(2); expect(fn.parameters[0].name.getText(script)).toBe('summary')
    expect(ts.isObjectBindingPattern(fn.parameters[1].name)).toBe(true)
    expect((fn.parameters[1].name as ts.ObjectBindingPattern).elements.map((element) => element.name.getText(script))).toEqual(['expectedIds', 'exists'])
    expect(callsIn('judgeReleaseGate')).toEqual(expect.arrayContaining(['validateSummary'])); expect(callsIn('runVerifyReleaseCli')).toEqual(expect.arrayContaining(['judgeReleaseGate']))
  })
  it('keeps the final verdict out of the CLI and routes both exits through judgeReleaseGate', () => {
    const inline: string[] = []
    walk(findExported('runVerifyReleaseCli'), (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'validateSummary') inline.push(node.getText(script))
      if (!ts.isConditionalExpression(node) || !node.condition.getText(script).includes('summary')) return
      if (node.condition.getText(script).includes('summary.status') || [node.whenTrue, node.whenFalse].every((branch) => /^[01]$/.test(branch.getText(script)))) inline.push(node.getText(script))
    })
    const returns: string[] = []; walk(findExported('runVerifyReleaseCli'), (node) => { if (ts.isReturnStatement(node) && node.expression !== undefined) returns.push(node.expression.getText(script)) })
    expect(inline).toEqual([]); expect(returns.filter((text) => text.includes('verdict.ok ? 0 : 1'))).toHaveLength(2)
  })
})
interface PostReleaseWorkflow {
  on?: Record<string, unknown>; permissions?: Record<string, string>
  jobs?: Record<string, { needs?: string | string[]; steps?: Array<{ uses?: string; run?: string; if?: string; env?: Record<string, string>; with?: Record<string, unknown> }> }>
}
describe('post-release-verify workflow', () => {
  const workflow = parse(readText(join(repoRoot, '.github/workflows/post-release-verify.yml'))) as PostReleaseWorkflow
  const jobs = Object.entries(workflow.jobs ?? {}); const steps = jobs.flatMap(([name, job]) => (job.steps ?? []).map((step) => ({ job: name, step })))
  const commandText = steps.map(({ step }) => [step.run, step.uses, step.if, ...Object.values(step.env ?? {}), ...Object.values(step.with ?? {}).map(String)].join('\n')).join('\n')
  it('only triggers on a published release and a manual tag dispatch, read-only', () => {
    expect(Object.keys(workflow.on ?? {}).sort()).toEqual(['release', 'workflow_dispatch'])
    expect((workflow.on?.release as { types?: string[] }).types).toEqual(['published'])
    expect((workflow.on?.workflow_dispatch as { inputs?: Record<string, { required?: boolean }> }).inputs?.tag?.required).toBe(true)
    expect(workflow.permissions).toEqual({ contents: 'read' })
    for (const forbidden of [/secrets\./, /gh release (upload|edit|create|delete)/, /git (tag|push)/, /continue-on-error/]) expect(`${commandText}\n${JSON.stringify(workflow)}`, String(forbidden)).not.toMatch(forbidden)
  })
  it('calls the one script from every job, gated behind the spike, and archives every run', () => {
    for (const [name, job] of jobs) expect((job.steps ?? []).map((step) => step.run ?? '').join('\n').includes('scripts/verify-release.mjs'), `job ${name}`).toBe(true)
    const verify = workflow.jobs?.verify
    expect(verify, 'verify job').toBeDefined(); expect([verify?.needs].flat()).toEqual(expect.arrayContaining(['spike'])); expect(workflow.jobs?.spike, 'spike job').toBeDefined()
    for (const { job, step } of steps) {
      if (!String(step.uses ?? '').startsWith('actions/upload-artifact')) continue
      expect(String(step.with?.name ?? ''), `job ${job} artifact name`).toMatch(/env\.TAG.*github\.run_id/)
      expect(String(step.with?.path ?? ''), `job ${job} artifact path`).toMatch(/verify-out/)
      if (step.if !== undefined) expect(step.if).toMatch(/always\(\)/)
    }
    for (const [name] of jobs) expect(steps.some(({ job, step }) => job === name && String(step.uses ?? '').startsWith('actions/upload-artifact')), `job ${name} uploads evidence`).toBe(true)
  })
})
describe('gate matrix', () => {
  const manifest = readJson<{ version: number; gates: Array<{ id: string; cwd: string; command: string }> }>(join(repoRoot, '.munk/code-gates.json'))
  it('registers verify-release-gate with a single argv command, keeps version 1 and one test gate', () => {
    const gate = manifest.gates.find((entry) => entry.id === 'verify-release-gate')
    expect(gate).toEqual({ id: 'verify-release-gate', cwd: '.', command: 'pnpm test src/verify-release-gate.test.ts' })
    for (const forbidden of ['&&', '||', '|', ';']) expect(gate?.command.includes(forbidden), forbidden).toBe(false)
    expect(existsSync(join(repoRoot, 'src/verify-release-gate.test.ts'))).toBe(true)
    expect(manifest.version).toBe(1); expect(manifest.gates.filter((entry) => entry.id === 'test')).toHaveLength(1)
  })
})
describe('lessons', () => {
  it('records the GC memory caliber, the current evidence and the retired d1>=d2>=d3 rule in parsed atoms', () => {
    const atoms = markdownAtoms(readText(join(repoRoot, 'docs/lessons.md')))
    const markers = [
      'HeapProfiler.collectGarbage', 'Performance.getMetrics', 'JSHeapUsedSize', '静置 1s',
      '第 3 轮保留堆 − 第 2 轮 ≤16 MiB', '未 GC 的轮末堆只记录',
      'projects/ops_df43e423451170fd/.munk/runs/trun_5d107ebc931e4ffe/evidence/32-heap-gc-probe.json',
      '241.6', '241.8', 'd1≥d2≥d3', 'CI 不跑内存腿', 'task_0194dba8b812d08b'
    ]
    expect(markers.filter((marker) => !atoms.some((atom) => atom.includes(marker)))).toEqual([])
  })
})
// Every fixture lives under the OS temp dir and is removed after the suite.
afterAll(() => { for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true }) })
