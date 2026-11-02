/**
 * Gate for `scripts/verify-release.mjs`: the A layer is fail-closed, its check
 * set is fixed, it never samples heap and never touches the local 6.4 GiB
 * fixture pair; the B layer judges three rounds and the 16 MiB retained-heap
 * line; the post-release workflow stays read-only.
 *
 * Everything below runs offline: the release metadata, every runner command and
 * the DevTools page are injected fixtures. No network, no Electron, no real
 * `/Users/zhutao/opencompare-fixtures` access.
 */
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import {
  CANCEL_TREE_FILES_PER_SIDE,
  CANCEL_NOISE_PATTERN,
  CI_CHECK_GROUPS,
  CI_PLATFORMS,
  LOCAL_CHECKS,
  LOCAL_FIXTURE_ROOTS,
  MANUAL_NOT_COVERED,
  RETENTION_THRESHOLD_BYTES,
  SMOKE_TREE,
  buildEnvironment,
  buildSummary,
  checksFor,
  compareCheckSets,
  expectedCheckIds,
  judgeLocalRounds,
  judgeRetainedHeap,
  normalizeVersion,
  parseArgs,
  readAsarJsonEntry,
  runVerifyReleaseCli,
  scanCancelNoise,
  selectedPlatforms,
  summarizeCounts,
  validateStep,
  validateSummary,
  versionEqualsTag
} from '../scripts/verify-release.mjs'
import type {
  CiPlatform,
  CommandResult,
  FourStateCounts,
  LaunchHandle,
  ReleaseMetadata,
  StepRecord,
  StepStatus,
  Summary,
  World
} from '../scripts/verify-release.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const TAG = 'v0.2.16'
const VERSION = '0.2.16'
const B_LAYER_PREFIX = '/Users/zhutao/opencompare-fixtures'

const CI_ENV: Record<string, string> = {
  CI: 'true',
  GITHUB_ACTIONS: 'true',
  ImageOS: 'ubuntu24',
  ImageVersion: '20260101.1',
  RUNNER_OS: 'Linux',
  GITHUB_RUN_ID: '1234567890'
}

const LOCAL_ENV: Record<string, string> = {}

const silent = (): void => undefined

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

const ASSET_NAMES = [
  `OpenCompare-${VERSION}-arm64.dmg`,
  `OpenCompare-${VERSION}-arm64-mac.zip`,
  `OpenCompare-Setup-${VERSION}.exe`,
  `OpenCompare-${VERSION}-win-x64.zip`,
  `OpenCompare-${VERSION}.AppImage`,
  `opencompare_${VERSION}_amd64.deb`,
  'latest-mac.yml',
  'latest.yml',
  'latest-linux.yml'
]

const fixtureAssets = (): Array<{ name: string; bytes: Buffer }> =>
  ASSET_NAMES.map((name) => ({ name, bytes: Buffer.from(`fixture bytes for ${name}\n`) }))

/** A minimal, real asar header so the AppImage version leg reads a real buffer. */
const buildAsar = (files: Record<string, Buffer>): Buffer => {
  const header: { files: Record<string, { size: number; offset: string }> } = { files: {} }
  const bodies: Buffer[] = []
  let offset = 0
  for (const [name, bytes] of Object.entries(files)) {
    header.files[name] = { size: bytes.length, offset: String(offset) }
    bodies.push(bytes)
    offset += bytes.length
  }
  // The layout @electron/asar writes: [u32 4][u32 headerSize][u32 len + 4][u32 len][json][bodies].
  const json = Buffer.from(JSON.stringify(header), 'utf8')
  const padding = Buffer.alloc((4 - (json.length % 4)) % 4)
  const headerJson = Buffer.concat([json, padding])
  const outer = Buffer.alloc(8)
  outer.writeUInt32LE(4, 0)
  outer.writeUInt32LE(8 + headerJson.length, 4)
  const inner = Buffer.alloc(8)
  inner.writeUInt32LE(4 + headerJson.length, 0)
  inner.writeUInt32LE(headerJson.length, 4)
  return Buffer.concat([outer, inner, headerJson, ...bodies])
}

interface FakeOptions {
  macVersion?: string
  debVersion?: string
  linuxVersion?: string
  windowsVersion?: string
  authenticode?: string
  codesignStatus?: number
  gatekeeperOutput?: string
  staplerStatus?: number
  fourState?: FourStateCounts
  fourStateSequence?: FourStateCounts[]
  cancelNoise?: string
  progressAppears?: boolean
  cancelButton?: boolean
  operableAfterCancel?: boolean
  missingAsset?: string
  metadataSize?: (name: string) => number
  metadataSha?: (name: string) => string | null
  releaseTag?: string
  fixturePresent?: boolean
  heapSequence?: Array<number | null>
  failFourStateAtRound?: number
}

const ok = (stdout = ''): CommandResult => ({ status: 0, signal: null, stdout, stderr: '' })
const bad = (stderr = 'failed'): CommandResult => ({ status: 1, signal: null, stdout: '', stderr })

/** A real filesystem with scripted commands, release metadata and a fake window. */
class FakeHost {
  readonly paths: string[] = []
  readonly commands: string[][] = []
  readonly heapCalls: string[] = []
  readonly detached: string[] = []
  readonly assets: Array<{ name: string; bytes: Buffer }>
  readonly world: World

  private readonly options: FakeOptions
  private readonly heap: Array<number | null>
  private readonly virtualDirs = new Map<string, string[]>()
  private round = 0

  constructor(options: FakeOptions = {}) {
    this.options = options
    this.assets = fixtureAssets()
    this.heap = [...(options.heapSequence ?? [])]
    this.world = {
      exists: (path) => {
        this.paths.push(path)
        if (this.isFixturePath(path)) return options.fixturePresent !== false
        return existsSync(path)
      },
      readdir: (path, readdirOptions) => {
        this.paths.push(path)
        if (this.isFixturePath(path)) {
          if (path === LOCAL_FIXTURE_ROOTS.left || path === LOCAL_FIXTURE_ROOTS.right) {
            return ['a.txt', 'b.txt', 'c.txt'].map((name) => ({
              name,
              isDirectory: () => false
            }))
          }
          return []
        }
        const virtual = this.virtualDirs.get(path)
        if (virtual !== undefined) {
          return virtual.map((name) => ({ name, isDirectory: () => false }))
        }
        return readdirSync(path, readdirOptions as never)
      },
      isDirectory: (path) => {
        this.paths.push(path)
        if (this.isFixturePath(path)) return false
        return false
      },
      readText: (path) => {
        this.paths.push(path)
        return readFileSync(path, 'utf8')
      },
      readBytes: (path) => {
        this.paths.push(path)
        return readFileSync(path)
      },
      size: (path) => {
        this.paths.push(path)
        return readFileSync(path).length
      },
      mkdir: (path) => {
        this.paths.push(path)
        mkdirSync(path, { recursive: true })
      },
      writeText: (path, text) => {
        this.paths.push(path)
        if (path.includes('/cancel/')) {
          const dir = dirname(path)
          const names = this.virtualDirs.get(dir) ?? []
          names.push(path.slice(dir.length + 1))
          this.virtualDirs.set(dir, names)
          return
        }
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, text)
      },
      chmod: () => undefined,
      sha256: (path) => {
        this.paths.push(path)
        return sha256(readFileSync(path))
      },
      run: (command, args = [], runOptions = {}) => {
        this.commands.push([command, ...args])
        return this.run(command, args, runOptions)
      },
      release: async (tag): Promise<ReleaseMetadata> => ({
        tag: this.options.releaseTag ?? tag,
        assets: this.assets
          .filter((asset) => asset.name !== this.options.missingAsset)
          .map((asset) => ({
            name: asset.name,
            size:
              this.options.metadataSize === undefined
                ? asset.bytes.length
                : this.options.metadataSize(asset.name),
            sha256:
              this.options.metadataSha === undefined
                ? sha256(asset.bytes)
                : this.options.metadataSha(asset.name),
            url: `https://example.test/${asset.name}`
          }))
      }),
      launchApp: async (): Promise<LaunchHandle> => {
        return {
          cdp: {
            url: 'devtools://opencompare/',
            send: async () => ({}),
            evaluate: async (expression) => this.evaluate(expression),
            waitFor: async (_expression, description) => {
              if (description.includes('progress to appear') && this.options.progressAppears === false) {
                throw new Error(`等待超时: ${description}`)
              }
              return true
            },
            close: () => undefined
          },
          output: [this.options.cancelNoise ?? ''],
          collectGarbage: async () => {
            this.heapCalls.push('HeapProfiler.collectGarbage')
          },
          readRetainedHeap: async () => {
            this.heapCalls.push('JSHeapUsedSize')
            return this.heap.length === 0 ? null : (this.heap.shift() ?? null)
          },
          stop: async () => undefined
        }
      }
    }
  }

  private isFixturePath(path: string): boolean {
    return (
      path === LOCAL_FIXTURE_ROOTS.left ||
      path === LOCAL_FIXTURE_ROOTS.right ||
      path.startsWith(`${LOCAL_FIXTURE_ROOTS.left}/`) ||
      path.startsWith(`${LOCAL_FIXTURE_ROOTS.right}/`)
    )
  }

  private fourState(): FourStateCounts {
    const sequence = this.options.fourStateSequence
    if (sequence !== undefined) {
      return sequence[Math.min(this.round, sequence.length - 1)]
    }
    return this.options.fourState ?? SMOKE_TREE
  }

  private evaluate(expression: string): unknown {
    if (expression.includes('footer[data-shell-level="status"]')) {
      this.round += 1
      if (this.options.failFourStateAtRound === this.round) {
        throw new Error('injected round failure')
      }
      return this.fourState()
    }
    if (expression.includes('button.ml-auto')) return this.options.cancelButton !== false
    if (expression.includes('data-session-tab')) return { tabs: 0, trees: 0 }
    if (expression.includes('data-shell-entry="new-compare"')) {
      return this.options.operableAfterCancel !== false
    }
    return true
  }

  private run(command: string, args: string[], options: Record<string, unknown>): CommandResult {
    if (command === 'gh') {
      const dirIndex = args.indexOf('--dir')
      if (args[0] === 'release' && args[1] === 'download' && dirIndex !== -1) {
        const dir = args[dirIndex + 1] as string
        mkdirSync(dir, { recursive: true })
        for (const asset of this.assets) {
          if (asset.name === this.options.missingAsset) continue
          writeFileSync(join(dir, asset.name), asset.bytes)
        }
        return ok()
      }
      return bad('unexpected gh call')
    }
    if (command === 'hdiutil') {
      if (args[0] === 'attach') {
        const mountPoint = args[args.indexOf('-mountpoint') + 1] as string
        mkdirSync(join(mountPoint, 'OpenCompare.app', 'Contents'), { recursive: true })
        writeFileSync(join(mountPoint, 'OpenCompare.app', 'Contents', 'Info.plist'), 'plist')
        return ok()
      }
      if (args[0] === 'detach') {
        this.detached.push(args[1] as string)
        return ok()
      }
      return bad('unexpected hdiutil call')
    }
    if (command === 'ditto') {
      mkdirSync(args[1] as string, { recursive: true })
      return ok()
    }
    if (command === 'plutil') return ok(`${this.options.macVersion ?? VERSION}\n`)
    if (command === 'codesign') return (this.options.codesignStatus ?? 0) === 0 ? ok() : bad('invalid signature')
    if (command === 'spctl') {
      return ok(
        this.options.gatekeeperOutput ?? 'OpenCompare.app: accepted\nsource=Notarized Developer ID\n'
      )
    }
    if (command === 'xcrun') {
      return (this.options.staplerStatus ?? 0) === 0 ? ok('The validate action worked!') : bad('no ticket')
    }
    if (command === 'cp') {
      copyFileSync(args[0] as string, args[1] as string)
      return ok()
    }
    if (command === 'xvfb-run') {
      const cwd = String(options.cwd ?? process.cwd())
      const root = join(cwd, 'squashfs-root')
      mkdirSync(join(root, 'resources'), { recursive: true })
      writeFileSync(join(root, 'opencompare'), 'binary')
      writeFileSync(
        join(root, 'resources', 'app.asar'),
        buildAsar({
          'package.json': Buffer.from(
            JSON.stringify({ version: this.options.linuxVersion ?? VERSION })
          )
        })
      )
      return ok()
    }
    if (command === 'dpkg-deb') {
      if (args[0] === '-f') return ok(`${this.options.debVersion ?? VERSION}\n`)
      if (args[0] === '-x') {
        const root = args[2] as string
        mkdirSync(join(root, 'opt', 'OpenCompare'), { recursive: true })
        writeFileSync(join(root, 'opt', 'OpenCompare', 'opencompare'), 'binary')
        return ok()
      }
      return bad('unexpected dpkg-deb call')
    }
    if (command === 'unzip') {
      const root = args[args.indexOf('-d') + 1] as string
      mkdirSync(root, { recursive: true })
      writeFileSync(join(root, 'OpenCompare.exe'), 'exe')
      return ok()
    }
    if (command === 'pwsh') {
      if (args.join(' ').includes('Get-AuthenticodeSignature')) {
        return ok(`${this.options.authenticode ?? 'Valid'}\n`)
      }
      return ok(`${this.options.windowsVersion ?? VERSION}\n`)
    }
    return bad(`unexpected command ${command}`)
  }
}

interface CiRun {
  code: number
  out: string
  summary: Summary
  steps: Record<string, StepRecord>
}

const tempDirs: string[] = []
const tempDir = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

const runCi = async (
  host: FakeHost,
  extraArgs: string[] = [],
  env: Record<string, string> = CI_ENV
): Promise<CiRun> => {
  const out = tempDir('opencompare-verify-ci-')
  const code = await runVerifyReleaseCli(
    [`--tag=${TAG}`, '--layer=ci', `--out=${out}`, ...extraArgs],
    { world: host.world, env, stdout: silent, stderr: silent }
  )
  const summary = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8')) as Summary
  const steps: Record<string, StepRecord> = {}
  for (const name of readdirSync(join(out, 'steps'))) {
    const step = JSON.parse(readFileSync(join(out, 'steps', name), 'utf8')) as StepRecord
    steps[step.id] = step
  }
  return { code, out, summary, steps }
}

const runLocal = async (host: FakeHost): Promise<CiRun> => {
  const out = tempDir('opencompare-verify-local-')
  const code = await runVerifyReleaseCli(
    [`--tag=${TAG}`, '--layer=local', `--out=${out}`],
    { world: host.world, env: LOCAL_ENV, stdout: silent, stderr: silent }
  )
  const summary = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8')) as Summary
  const steps: Record<string, StepRecord> = {}
  for (const name of readdirSync(join(out, 'steps'))) {
    const step = JSON.parse(readFileSync(join(out, 'steps', name), 'utf8')) as StepRecord
    steps[step.id] = step
  }
  return { code, out, summary, steps }
}

/* ------------------------------------------------------------------ */
/* A-layer registry                                                    */
/* ------------------------------------------------------------------ */

describe('A-layer check registry', () => {
  it('registers the six fixed groups with 15 checks in a fixed order', () => {
    expect(CI_CHECK_GROUPS.map((group) => group.id)).toEqual([
      'identity',
      'mac',
      'linux',
      'windows',
      'cancel-log',
      'evidence'
    ])
    expect(CI_CHECK_GROUPS.map((group) => group.checks.length)).toEqual([2, 4, 3, 2, 2, 2])
    const ids = expectedCheckIds({ layer: 'ci' })
    expect(ids).toHaveLength(15)
    expect(new Set(ids).size).toBe(15)
    expect(ids).toEqual(checksFor({ layer: 'ci' }).map((check) => check.id))
  })

  it('keeps memory and heap out of every A-layer check', () => {
    for (const check of checksFor({ layer: 'ci' })) {
      expect(check.id, `id of ${check.id}`).not.toMatch(/heap|memory/i)
      expect(check.name, `name of ${check.id}`).not.toMatch(/heap|memory/i)
      expect(check.command, `command of ${check.id}`).not.toMatch(
        /HeapProfiler|Performance\.getMetrics|JSHeapUsedSize/
      )
    }
    const localIds = LOCAL_CHECKS.map((check) => check.id)
    expect(localIds.some((id) => /heap/.test(id))).toBe(true)
    expect(localIds.filter((id) => expectedCheckIds({ layer: 'ci' }).includes(id))).toEqual([])
  })

  it('filters by platform while keeping the platform-free groups', () => {
    expect(expectedCheckIds({ layer: 'ci', platforms: ['mac'] })).toEqual([
      'identity-release-metadata',
      'identity-asset-bytes-sha256',
      'mac-dmg-version',
      'mac-codesign',
      'mac-gatekeeper',
      'mac-stapler',
      'evidence-environment',
      'evidence-artifacts'
    ])
    expect(expectedCheckIds({ layer: 'ci', platforms: ['linux'] })).toEqual([
      'identity-release-metadata',
      'identity-asset-bytes-sha256',
      'linux-appimage-version',
      'linux-deb-version',
      'linux-directory-compare',
      'cancel-leg',
      'cancel-log-scan',
      'evidence-environment',
      'evidence-artifacts'
    ])
    expect(expectedCheckIds({ layer: 'ci', platforms: [...CI_PLATFORMS] })).toHaveLength(15)
  })

  it('keeps the local registry at three checks plus the manual list', () => {
    expect(expectedCheckIds({ layer: 'local' })).toEqual([
      'local-fixture',
      'local-rounds-4state',
      'local-retained-heap'
    ])
    expect(LOCAL_CHECKS).toHaveLength(3)
    for (const entry of MANUAL_NOT_COVERED) {
      expect(entry.reason).toBe('not-covered')
      expect(LOCAL_CHECKS.map((check) => check.id)).not.toContain(entry.id)
    }
  })
})

/* ------------------------------------------------------------------ */
/* CLI contract                                                        */
/* ------------------------------------------------------------------ */

describe('CLI contract', () => {
  it('rejects a missing tag, a bad layer and unknown flags without a summary', async () => {
    const out = tempDir('opencompare-verify-args-')
    const host = new FakeHost()
    const cases: string[][] = [
      [`--layer=ci`, `--out=${out}`],
      [`--tag=${TAG}`, `--layer=fast`, `--out=${out}`],
      [`--tag=${TAG}`, `--layer=ci`, `--out=${out}`, '--nope=1'],
      [`--tag=0.2.16`, `--layer=ci`, `--out=${out}`]
    ]
    for (const argv of cases) {
      const code = await runVerifyReleaseCli(argv, {
        world: host.world,
        env: CI_ENV,
        stdout: silent,
        stderr: silent
      })
      expect(code, argv.join(' ')).not.toBe(0)
      expect(existsSync(join(out, 'summary.json')), argv.join(' ')).toBe(false)
    }
  })

  it('rejects an unwritable --out without writing a summary', async () => {
    const base = tempDir('opencompare-verify-out-')
    const file = join(base, 'not-a-dir')
    writeFileSync(file, 'x')
    const code = await runVerifyReleaseCli(
      [`--tag=${TAG}`, '--layer=ci', `--out=${join(file, 'out')}`],
      { world: new FakeHost().world, env: CI_ENV, stdout: silent, stderr: silent }
    )
    expect(code).not.toBe(0)
    expect(existsSync(join(file, 'out', 'summary.json'))).toBe(false)
  })

  it('refuses any CLI switch that would widen the retained-heap line', () => {
    for (const flag of ['--threshold=64', '--max-retained=1', '--tolerance=0.5']) {
      const parsed = parseArgs([`--tag=${TAG}`, '--layer=local', '--out=/tmp/oc', flag])
      expect(parsed.error, flag).toContain('不提供放宽开关')
    }
    expect(parseArgs([`--tag=${TAG}`, '--layer=local', '--out=/tmp/oc']).options).toMatchObject({
      tag: TAG,
      layer: 'local',
      out: '/tmp/oc'
    })
  })

  it('defaults --layer=ci to the full six-group set and narrows only on request', () => {
    expect(selectedPlatforms(undefined)).toEqual([...CI_PLATFORMS])
    expect(selectedPlatforms('all')).toEqual([...CI_PLATFORMS])
    expect(selectedPlatforms('windows')).toEqual(['windows'])
  })
})

/* ------------------------------------------------------------------ */
/* Green A-layer run                                                   */
/* ------------------------------------------------------------------ */

describe('A-layer run', () => {
  it('passes a fully injected run and writes the summary, steps and logs', async () => {
    const host = new FakeHost()
    const run = await runCi(host, ['--platform=all'])
    expect(run.code).toBe(0)
    expect(run.summary.status).toBe('pass')
    expect(run.summary.counts).toEqual({ pass: 15, fail: 0, skip: 0, total: 15, expected: 15 })
    expect(run.summary.missing).toEqual([])
    expect(run.summary.unexpected).toEqual([])
    expect(run.summary.duplicates).toEqual([])
    expect(run.summary.manual).toEqual([])
    expect(run.summary.environment).toEqual({
      ImageOS: 'ubuntu24',
      ImageVersion: '20260101.1',
      RUNNER_OS: 'Linux',
      GITHUB_RUN_ID: '1234567890'
    })
    expect(run.summary.evidenceDir).toBe(run.out)
    expect(Object.keys(run.steps)).toHaveLength(15)
    expect(readdirSync(join(run.out, 'logs'))).toHaveLength(15)

    for (const step of Object.values(run.steps)) {
      expect(Object.keys(step).sort()).toEqual([
        'actual',
        'command',
        'evidence',
        'expected',
        'finishedAt',
        'id',
        'name',
        'startedAt',
        'status'
      ])
      expect(['pass', 'fail', 'skip']).toContain(step.status)
      expect(step.status).toBe('pass')
      expect(step.evidence.length).toBeGreaterThan(0)
      for (const path of step.evidence) expect(existsSync(path)).toBe(true)
    }
  })

  it('never samples heap and never touches the local 6.4 GiB fixture pair', async () => {
    const host = new FakeHost()
    const run = await runCi(host, ['--platform=all'])
    expect(run.code).toBe(0)
    expect(host.heapCalls).toEqual([])
    expect(host.paths.filter((path) => path.startsWith(B_LAYER_PREFIX))).toEqual([])
    expect(host.commands.filter((args) => args.join(' ').includes(B_LAYER_PREFIX))).toEqual([])
    expect(host.commands.filter((args) => /HeapProfiler|Performance\.getMetrics/.test(args.join(' ')))).toEqual([])
  })

  it('keeps the identity conclusion independent of the selected platform', async () => {
    const single = await runCi(new FakeHost(), ['--platform=mac'])
    const all = await runCi(new FakeHost(), ['--platform=all'])
    expect(JSON.stringify(single.steps['identity-asset-bytes-sha256'].actual)).toBe(
      JSON.stringify(all.steps['identity-asset-bytes-sha256'].actual)
    )
    expect(single.steps['identity-release-metadata'].actual).toEqual(
      all.steps['identity-release-metadata'].actual
    )
  })
})

/* ------------------------------------------------------------------ */
/* Identity failures                                                   */
/* ------------------------------------------------------------------ */

describe('identity leg', () => {
  it('fails on a sha256 mismatch and names the asset', async () => {
    const host = new FakeHost({
      metadataSha: (name) =>
        name === `OpenCompare-${VERSION}-arm64.dmg` ? 'a'.repeat(64) : null
    })
    const run = await runCi(host, ['--platform=mac'])
    expect(run.code).not.toBe(0)
    expect(run.summary.status).toBe('fail')
    expect(run.steps['identity-asset-bytes-sha256'].status).toBe('fail')
    expect(JSON.stringify(run.steps['identity-asset-bytes-sha256'].actual)).toContain(
      `OpenCompare-${VERSION}-arm64.dmg`
    )
    // A null sha256 is missing metadata, so the metadata leg fails too.
    expect(run.steps['identity-release-metadata'].status).toBe('fail')
  })

  it('fails on a byte-count mismatch', async () => {
    const host = new FakeHost({
      metadataSize: (name) => (name === 'latest.yml' ? 1 : undefined as unknown as number)
    })
    const run = await runCi(host, ['--platform=mac'])
    expect(run.code).not.toBe(0)
    expect(run.steps['identity-asset-bytes-sha256'].status).toBe('fail')
    expect(JSON.stringify(run.steps['identity-asset-bytes-sha256'].actual)).toContain('latest.yml')
  })

  it('fails when an asset is missing from the release', async () => {
    const host = new FakeHost({ missingAsset: `OpenCompare-${VERSION}-arm64.dmg` })
    const run = await runCi(host, ['--platform=mac'])
    expect(run.code).not.toBe(0)
    expect(run.steps['mac-dmg-version'].status).toBe('fail')
  })

  it('fails when the release metadata carries no sha256 at all', async () => {
    const host = new FakeHost({ metadataSha: () => null })
    const run = await runCi(host, ['--platform=mac'])
    expect(run.code).not.toBe(0)
    expect(run.steps['identity-release-metadata'].status).toBe('fail')
    expect(JSON.stringify(run.steps['identity-release-metadata'].actual)).toContain('缺 sha256')
  })
})

/* ------------------------------------------------------------------ */
/* Platform legs                                                       */
/* ------------------------------------------------------------------ */

describe('macOS leg', () => {
  it('fails when CFBundleShortVersionString is not the tag version and still detaches', async () => {
    const host = new FakeHost({ macVersion: '0.2.15' })
    const run = await runCi(host, ['--platform=mac'])
    expect(run.steps['mac-dmg-version'].status).toBe('fail')
    expect(host.detached).toHaveLength(1)
    expect(run.code).not.toBe(0)
  })

  it('fails codesign, gatekeeper and stapler independently', async () => {
    const codesign = await runCi(new FakeHost({ codesignStatus: 1 }), ['--platform=mac'])
    expect(codesign.steps['mac-codesign'].status).toBe('fail')

    const gatekeeper = await runCi(
      new FakeHost({ gatekeeperOutput: 'rejected\nsource=Unnotarized Developer ID\n' }),
      ['--platform=mac']
    )
    expect(gatekeeper.steps['mac-gatekeeper'].status).toBe('fail')

    const stapler = await runCi(new FakeHost({ staplerStatus: 1 }), ['--platform=mac'])
    expect(stapler.steps['mac-stapler'].status).toBe('fail')
  })
})

describe('Linux leg', () => {
  it('fails when the AppImage version is not the tag version', async () => {
    const run = await runCi(new FakeHost({ linuxVersion: '0.2.15' }), ['--platform=linux'])
    expect(run.steps['linux-appimage-version'].status).toBe('fail')
    expect(run.code).not.toBe(0)
  })

  it('fails when the deb control version is not the tag version', async () => {
    const run = await runCi(new FakeHost({ debVersion: '0.2.15' }), ['--platform=linux'])
    expect(run.steps['linux-deb-version'].status).toBe('fail')
  })

  it('fails when the synthetic four-state counts differ from the fixture', async () => {
    const run = await runCi(
      new FakeHost({ fourState: { same: 9, added: 3, removed: 2, modified: 4 } }),
      ['--platform=linux']
    )
    expect(run.steps['linux-directory-compare'].status).toBe('fail')
    expect(run.code).not.toBe(0)
    const expected = Object.values(SMOKE_TREE).reduce((total, value) => total + value, 0)
    expect(JSON.stringify(run.steps['linux-directory-compare'].expected)).toContain(String(expected))
  })
})

describe('Windows leg', () => {
  it('fails when the portable zip reports another version', async () => {
    const run = await runCi(new FakeHost({ windowsVersion: '0.2.15' }), ['--platform=windows'])
    expect(run.steps['windows-zip-version'].status).toBe('fail')
  })

  it('fails when Authenticode is not Valid', async () => {
    const run = await runCi(new FakeHost({ authenticode: 'NotSigned' }), ['--platform=windows'])
    expect(run.steps['windows-authenticode'].status).toBe('fail')
    expect(run.code).not.toBe(0)
  })
})

describe('cancel leg', () => {
  it('fails when the cancel point is never observed', async () => {
    const run = await runCi(new FakeHost({ progressAppears: false }), ['--platform=linux'])
    expect(run.steps['cancel-leg'].status).toBe('fail')
    expect(run.code).not.toBe(0)
  })

  it('fails when the progress bar has no cancel button', async () => {
    const run = await runCi(new FakeHost({ cancelButton: false }), ['--platform=linux'])
    expect(run.steps['cancel-leg'].status).toBe('fail')
  })

  it('fails when cancelling does not return to an operable state', async () => {
    const run = await runCi(new FakeHost({ operableAfterCancel: false }), ['--platform=linux'])
    expect(run.steps['cancel-leg'].status).toBe('fail')
  })

  it('fails on any OperationCancelledError or ECANCELED noise', async () => {
    const run = await runCi(
      new FakeHost({ cancelNoise: 'stderr: OperationCancelledError: aborted\n' }),
      ['--platform=linux']
    )
    expect(run.steps['cancel-log-scan'].status).toBe('fail')
    expect(JSON.stringify(run.steps['cancel-log-scan'].actual)).toContain('OperationCancelledError')
    expect(run.code).not.toBe(0)
  })

  it('records the synthetic tree size in the evidence', async () => {
    const run = await runCi(new FakeHost(), ['--platform=linux'])
    expect(JSON.stringify(run.steps['cancel-leg'].actual)).toContain(
      String(CANCEL_TREE_FILES_PER_SIDE)
    )
  })
})

/* ------------------------------------------------------------------ */
/* Fail-closed summary                                                 */
/* ------------------------------------------------------------------ */

const fakeStep = (id: string, status: StepStatus = 'pass'): StepRecord => ({
  id,
  name: id,
  command: id,
  expected: {},
  actual: {},
  status,
  evidence: ['/tmp/evidence.log'],
  startedAt: '2026-11-02T00:00:00.000Z',
  finishedAt: '2026-11-02T00:00:01.000Z'
})

const ENVIRONMENT = {
  ImageOS: 'ubuntu24',
  ImageVersion: '20260101.1',
  RUNNER_OS: 'Linux',
  GITHUB_RUN_ID: '1234567890'
}

const expectedMac = expectedCheckIds({ layer: 'ci', platforms: ['mac'] })

describe('fail-closed summary', () => {
  it('goes red with the exact id when a check is missing', () => {
    const steps = expectedMac.filter((id) => id !== 'mac-stapler').map((id) => fakeStep(id))
    const summary = buildSummary({
      tag: TAG,
      layer: 'ci',
      steps,
      environment: ENVIRONMENT,
      evidenceDir: '/tmp',
      expectedIds: expectedMac
    })
    expect(summary.status).toBe('fail')
    expect(summary.missing).toEqual(['mac-stapler'])
    expect(summary.counts.expected).toBe(8)
    expect(summary.counts.total).toBe(7)
  })

  it('goes red with the exact id when an unexpected check appears', () => {
    const steps = [...expectedMac.map((id) => fakeStep(id)), fakeStep('mac-heap-sample')]
    const summary = buildSummary({
      tag: TAG,
      layer: 'ci',
      steps,
      environment: ENVIRONMENT,
      evidenceDir: '/tmp',
      expectedIds: expectedMac
    })
    expect(summary.status).toBe('fail')
    expect(summary.unexpected).toEqual(['mac-heap-sample'])
  })

  it('goes red when any step is skipped', () => {
    const steps = expectedMac.map((id) => fakeStep(id, id === 'mac-codesign' ? 'skip' : 'pass'))
    const summary = buildSummary({
      tag: TAG,
      layer: 'ci',
      steps,
      environment: ENVIRONMENT,
      evidenceDir: '/tmp',
      expectedIds: expectedMac
    })
    expect(summary.status).toBe('fail')
    expect(summary.skipped).toEqual(['mac-codesign'])
    expect(summary.counts.skip).toBe(1)
    expect(summary.counts.fail).toBe(0)
  })

  it('rejects a summary whose expected count or environment is wrong', () => {
    const summary = buildSummary({
      tag: TAG,
      layer: 'ci',
      steps: expectedMac.map((id) => fakeStep(id)),
      environment: { ...ENVIRONMENT, ImageOS: 'unknown' },
      evidenceDir: '/tmp',
      expectedIds: expectedMac
    })
    const broken = { ...summary, counts: { ...summary.counts, expected: 3 } }
    const verdict = validateSummary(broken, { expectedIds: expectedMac, exists: () => true })
    expect(verdict.ok).toBe(false)
    expect(verdict.problems.join('\n')).toContain('counts.expected 3')
    expect(verdict.problems.join('\n')).toContain('ImageOS=unknown')
  })

  it('rejects a summary whose evidence file does not exist', () => {
    const summary = buildSummary({
      tag: TAG,
      layer: 'ci',
      steps: expectedMac.map((id) => fakeStep(id)),
      environment: ENVIRONMENT,
      evidenceDir: '/tmp',
      expectedIds: expectedMac
    })
    const verdict = validateSummary(summary, { expectedIds: expectedMac, exists: () => false })
    expect(verdict.ok).toBe(false)
    expect(verdict.problems.join('\n')).toContain('evidence 不存在')
  })

  it('rejects a step that is missing a required field', () => {
    const step = fakeStep('identity-release-metadata') as Partial<StepRecord>
    delete step.finishedAt
    const verdict = validateStep(step, { exists: () => true })
    expect(verdict.ok).toBe(false)
    expect(verdict.problems.join('\n')).toContain('finishedAt')
  })

  it('never reports pass when a platform job is missing from the aggregate', () => {
    const steps = expectedCheckIds({ layer: 'ci', platforms: ['mac'] }).map((id) => fakeStep(id))
    const summary = buildSummary({
      tag: TAG,
      layer: 'ci',
      steps,
      environment: ENVIRONMENT,
      evidenceDir: '/tmp',
      expectedIds: expectedCheckIds({ layer: 'ci' })
    })
    expect(summary.status).toBe('fail')
    expect(summary.counts.expected).toBe(15)
    expect(summary.missing).toContain('linux-appimage-version')
    expect(summary.missing).toContain('windows-authenticode')
  })

  it('merges three platform jobs through the same aggregator', async () => {
    const parts = tempDir('opencompare-verify-parts-')
    for (const platform of ['mac', 'linux', 'windows'] as CiPlatform[]) {
      const out = join(parts, platform)
      const code = await runVerifyReleaseCli(
        [`--tag=${TAG}`, '--layer=ci', `--platform=${platform}`, `--out=${out}`],
        { world: new FakeHost().world, env: CI_ENV, stdout: silent, stderr: silent }
      )
      expect(code, platform).toBe(0)
    }
    const out = join(parts, 'aggregate')
    const code = await runVerifyReleaseCli(
      [`--tag=${TAG}`, '--layer=ci', `--aggregate=${parts}`, `--out=${out}`],
      { world: new FakeHost().world, env: CI_ENV, stdout: silent, stderr: silent }
    )
    const summary = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8')) as Summary
    expect(code).toBe(0)
    expect(summary.status).toBe('pass')
    expect(summary.counts).toEqual({ pass: 15, fail: 0, skip: 0, total: 15, expected: 15 })
    expect(summary.duplicates).toEqual([])
  })
})

/* ------------------------------------------------------------------ */
/* B layer                                                             */
/* ------------------------------------------------------------------ */

const LOCAL_COUNTS: FourStateCounts = { same: 2, added: 1, removed: 0, modified: 0 }
const HAPPY_HEAP = [
  150 * 1024 * 1024,
  120 * 1024 * 1024,
  150 * 1024 * 1024,
  120 * 1024 * 1024,
  150 * 1024 * 1024,
  120 * 1024 * 1024
]

describe('local B layer', () => {
  it('judges three rounds and keeps the manual list out of the checks', async () => {
    const host = new FakeHost({ heapSequence: HAPPY_HEAP, fourState: LOCAL_COUNTS })
    const run = await runLocal(host)
    expect(run.code).toBe(0)
    expect(run.summary.status).toBe('pass')
    expect(run.summary.checks.map((check) => check.id)).toEqual([
      'local-fixture',
      'local-rounds-4state',
      'local-retained-heap'
    ])
    expect(run.summary.manual.map((entry) => entry.reason)).toEqual(
      MANUAL_NOT_COVERED.map((entry) => entry.reason)
    )
    for (const entry of run.summary.manual) {
      expect(run.summary.checks.some((check) => check.id === entry.id)).toBe(false)
      expect(run.summary.checks.every((check) => check.status === 'pass')).toBe(true)
    }
    expect(readdirSync(join(run.out, 'evidence')).sort()).toEqual([
      'round-1.json',
      'round-2.json',
      'round-3.json'
    ])
    expect(host.heapCalls.filter((call) => call === 'JSHeapUsedSize')).toHaveLength(6)
    expect(host.heapCalls.filter((call) => call === 'HeapProfiler.collectGarbage')).toHaveLength(3)
  })

  it('fails when the real directory pair is missing', async () => {
    const host = new FakeHost({
      fixturePresent: false,
      heapSequence: HAPPY_HEAP,
      fourState: LOCAL_COUNTS
    })
    const run = await runLocal(host)
    expect(run.code).not.toBe(0)
    expect(run.steps['local-fixture'].status).toBe('fail')
  })

  it('fails when a round is missing', async () => {
    const host = new FakeHost({ heapSequence: HAPPY_HEAP, failFourStateAtRound: 2 })
    const run = await runLocal(host)
    expect(run.steps['local-rounds-4state'].status).toBe('fail')
    expect(run.code).not.toBe(0)
  })

  it('fails when the four-state sum is not the round total', async () => {
    const host = new FakeHost({
      heapSequence: HAPPY_HEAP,
      fourState: { same: 9, added: 1, removed: 0, modified: 0 }
    })
    const run = await runLocal(host)
    expect(run.steps['local-rounds-4state'].status).toBe('fail')
  })

  it('fails when the three rounds disagree', async () => {
    const host = new FakeHost({
      heapSequence: HAPPY_HEAP,
      fourStateSequence: [
        { same: 2, added: 1, removed: 0, modified: 0 },
        { same: 1, added: 2, removed: 0, modified: 0 },
        { same: 2, added: 1, removed: 0, modified: 0 }
      ]
    })
    const run = await runLocal(host)
    expect(run.steps['local-rounds-4state'].status).toBe('fail')
  })

  it('fails when round 3 grows the retained heap by more than 16 MiB', async () => {
    const over = 120 * 1024 * 1024 + RETENTION_THRESHOLD_BYTES + 1
    const host = new FakeHost({
      fourState: LOCAL_COUNTS,
      heapSequence: [
        150 * 1024 * 1024,
        120 * 1024 * 1024,
        150 * 1024 * 1024,
        120 * 1024 * 1024,
        150 * 1024 * 1024,
        over
      ]
    })
    const run = await runLocal(host)
    expect(run.steps['local-retained-heap'].status).toBe('fail')
    expect(JSON.stringify(run.steps['local-retained-heap'].actual)).toContain('deltaBytes')
    expect(run.code).not.toBe(0)
  })
})

/* ------------------------------------------------------------------ */
/* Pure judgments                                                      */
/* ------------------------------------------------------------------ */

describe('pure judgments', () => {
  it('normalises only the v prefix and X.Y.Z', () => {
    expect(normalizeVersion('v0.2.16')).toBe('0.2.16')
    expect(normalizeVersion('0.2.16')).toBe('0.2.16')
    expect(normalizeVersion('0.2.16-1')).toBe('0.2.16')
    expect(normalizeVersion('nightly')).toBeNull()
    expect(normalizeVersion(undefined)).toBeNull()
    expect(versionEqualsTag('v0.2.16', 'v0.2.16')).toBe(true)
    expect(versionEqualsTag('0.2.15', 'v0.2.16')).toBe(false)
  })

  it('puts the retained-heap line exactly at 16 MiB', () => {
    const base = 100 * 1024 * 1024
    const at = judgeRetainedHeap({
      round2RetainedBytes: base,
      round3RetainedBytes: base + RETENTION_THRESHOLD_BYTES
    })
    expect(at.ok).toBe(true)
    expect(at.delta).toBe(RETENTION_THRESHOLD_BYTES)
    const over = judgeRetainedHeap({
      round2RetainedBytes: base,
      round3RetainedBytes: base + RETENTION_THRESHOLD_BYTES + 1
    })
    expect(over.ok).toBe(false)
    expect(over.problems.join('\n')).toContain('> 16777216')
    expect(RETENTION_THRESHOLD_BYTES).toBe(16777216)
  })

  it('needs three rounds that agree and close their sessions', () => {
    const rounds = [1, 2, 3].map((index) => ({
      index,
      counts: { same: 2, added: 1, removed: 0, modified: 0 },
      totalRows: 3,
      closedTabs: 0,
      closedTrees: 0,
      uncollectedHeapBytes: null,
      retainedHeapBytes: null
    }))
    expect(judgeLocalRounds({ rounds }).ok).toBe(true)
    expect(judgeLocalRounds({ rounds: rounds.slice(0, 2) }).ok).toBe(false)
    const open = rounds.map((round, index) =>
      index === 2 ? { ...round, closedTabs: 1 } : round
    )
    expect(judgeLocalRounds({ rounds: open }).ok).toBe(false)
  })

  it('counts cancel noise only for the fixed pattern', () => {
    expect(String(CANCEL_NOISE_PATTERN)).toBe('/OperationCancelledError|ECANCELED/')
    expect(scanCancelNoise([{ source: 'a', text: 'all good' }]).count).toBe(0)
    expect(scanCancelNoise([{ source: 'a', text: 'OperationCancelledError: x' }]).count).toBe(1)
    expect(scanCancelNoise([{ source: 'b', text: 'write ECANCELED\nmore' }]).count).toBe(1)
  })

  it('reads a JSON entry out of a real asar header', () => {
    const asar = buildAsar({
      'package.json': Buffer.from(JSON.stringify({ version: VERSION }))
    })
    expect(readAsarJsonEntry(asar, 'package.json')).toEqual({ version: VERSION })
    expect(readAsarJsonEntry(asar, 'missing.json')).toBeNull()
    expect(readAsarJsonEntry(Buffer.alloc(8), 'package.json')).toBeNull()
  })

  it('compares expected and actual id sets', () => {
    expect(compareCheckSets(['a', 'b'], ['a', 'b'])).toEqual({
      missing: [],
      unexpected: [],
      ok: true
    })
    expect(compareCheckSets(['a', 'b'], ['a', 'c'])).toEqual({
      missing: ['b'],
      unexpected: ['c'],
      ok: false
    })
    expect(summarizeCounts([fakeStep('a'), fakeStep('b', 'fail'), fakeStep('c', 'skip')])).toEqual({
      pass: 1,
      fail: 1,
      skip: 1,
      total: 3,
      expected: 0
    })
  })

  it('never substitutes unknown for a missing CI runner image', () => {
    expect(
      buildEnvironment({ env: { ...CI_ENV, ImageOS: '' }, isCi: true, now: () => new Date(0) })
    ).toEqual({
      ImageOS: '',
      ImageVersion: '20260101.1',
      RUNNER_OS: 'Linux',
      GITHUB_RUN_ID: '1234567890'
    })
    const local = buildEnvironment({ env: {}, isCi: false, now: () => new Date(0) })
    expect(local.ImageOS).toBe(`local-${process.platform}`)
    expect(local.GITHUB_RUN_ID).toBe('local-0')
  })

  it('fails the evidence leg when the runner image is unknown', async () => {
    const run = await runCi(new FakeHost(), ['--platform=mac'], {
      ...CI_ENV,
      ImageOS: 'unknown'
    })
    expect(run.steps['evidence-environment'].status).toBe('fail')
    expect(run.code).not.toBe(0)
  })
})

describe('extracted pure fail-closed judgments', () => {
  const ciIds = expectedCheckIds({ layer: 'ci' })
  const validSummary = (): Summary =>
    buildSummary({
      tag: TAG,
      layer: 'ci',
      steps: ciIds.map((id) => fakeStep(id)),
      environment: ENVIRONMENT,
      evidenceDir: '/tmp',
      expectedIds: ciIds
    })

  it('fails closed when the evidence file is missing', () => {
    const verdict = validateSummary(validSummary(), { expectedIds: ciIds, exists: () => false })
    expect(verdict.ok).toBe(false)
    expect(verdict.problems.join('\n')).toContain('evidence 不存在')
  })

  it('fails closed when a required summary section is missing', () => {
    const broken = { ...validSummary() } as Record<string, unknown>
    delete broken.environment
    const verdict = validateSummary(broken as unknown as Summary, {
      expectedIds: ciIds,
      exists: () => true
    })
    expect(verdict.ok).toBe(false)
    expect(verdict.problems.join('\n')).toContain('summary 缺字段 environment')
  })

  it('fails closed when the expected check count does not match the registry', () => {
    const summary = validSummary()
    const broken = { ...summary, counts: { ...summary.counts, expected: 3 } }
    const verdict = validateSummary(broken, { expectedIds: ciIds, exists: () => true })
    expect(verdict.ok).toBe(false)
    expect(verdict.problems.join('\n')).toContain('≠ 期望 15')
  })

  it('labels every fail-closed verdict with a Chinese marker', () => {
    const verdict = validateSummary({} as Summary, { expectedIds: ciIds, exists: () => false })
    expect(verdict.ok).toBe(false)
    expect(verdict.problems.join('\n')).toMatch(/缺字段|缺失|不存在|不得|≠/)
  })

  it('fails closed when an artifact version does not equal the tag', () => {
    expect(versionEqualsTag(VERSION, TAG)).toBe(true)
    expect(versionEqualsTag('0.2.16-1', TAG)).toBe(true)
    expect(versionEqualsTag('0.2.15', TAG)).toBe(false)
  })

  it('pins the fixed counts the pure registry owns', () => {
    expect(ciIds).toHaveLength(15)
    expect(expectedCheckIds({ layer: 'local' })).toEqual([
      'local-fixture',
      'local-rounds-4state',
      'local-retained-heap'
    ])
    expect(LOCAL_CHECKS).toHaveLength(3)
    expect(RETENTION_THRESHOLD_BYTES).toBe(16 * 1024 * 1024)
  })
})

/* ------------------------------------------------------------------ */
/* Post-release workflow                                               */
/* ------------------------------------------------------------------ */

interface WorkflowStep {
  name?: string
  uses?: string
  run?: string
  if?: string
  with?: Record<string, unknown>
}

interface WorkflowJob {
  needs?: string | string[]
  steps?: WorkflowStep[]
}

const workflowText = readFileSync(
  join(repoRoot, '.github/workflows/post-release-verify.yml'),
  'utf8'
)
const workflow = parse(workflowText) as {
  on?: Record<string, unknown>
  permissions?: Record<string, string>
  env?: Record<string, string>
  jobs?: Record<string, WorkflowJob>
}

describe('post-release-verify workflow', () => {
  it('only triggers on a published release and a manual tag dispatch', () => {
    const triggers = Object.keys(workflow.on ?? {})
    expect(triggers.sort()).toEqual(['release', 'workflow_dispatch'])
    const release = workflow.on?.release as { types?: string[] }
    expect(release.types).toEqual(['published'])
    const dispatch = workflow.on?.workflow_dispatch as {
      inputs?: Record<string, { required?: boolean }>
    }
    expect(dispatch.inputs?.tag?.required).toBe(true)
  })

  it('is read-only and holds no secrets or release write commands', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(workflowText).not.toMatch(/secrets\./)
    expect(workflowText).not.toMatch(/gh release (upload|edit|create|delete)/)
    expect(workflowText).not.toMatch(/git (tag|push)/)
    expect(workflowText).not.toMatch(/continue-on-error/)
  })

  it('calls the one script from every job instead of inlining judgments', () => {
    for (const [name, job] of Object.entries(workflow.jobs ?? {})) {
      const scripts = (job.steps ?? []).map((step) => step.run ?? '').join('\n')
      expect(scripts, `job ${name}`).toContain('scripts/verify-release.mjs')
    }
  })

  it('gates the full matrix behind the spike', () => {
    const verify = workflow.jobs?.verify
    expect(verify, 'verify job').toBeDefined()
    const needs = Array.isArray(verify?.needs) ? verify?.needs : [verify?.needs]
    expect(needs).toContain('spike')
    expect(workflow.jobs?.spike, 'spike job').toBeDefined()
  })

  it('archives every run with the tag and the run id', () => {
    for (const [name, job] of Object.entries(workflow.jobs ?? {})) {
      const upload = (job.steps ?? []).find((step) =>
        String(step.uses ?? '').startsWith('actions/upload-artifact')
      )
      expect(upload, `job ${name} uploads evidence`).toBeDefined()
      const artifactName = String(upload?.with?.name ?? '')
      expect(artifactName, `job ${name} artifact name`).toContain('env.TAG')
      expect(artifactName, `job ${name} artifact name`).toContain('github.run_id')
      expect(String(upload?.with?.path ?? '')).toContain('verify-out')
      if (upload?.if !== undefined) expect(upload.if).toContain('always()')
    }
  })
})

/* ------------------------------------------------------------------ */
/* Gate matrix and lessons                                             */
/* ------------------------------------------------------------------ */

describe('gate matrix', () => {
  const manifest = JSON.parse(readFileSync(join(repoRoot, '.munk/code-gates.json'), 'utf8')) as {
    version: number
    gates: Array<{ id: string; cwd: string; command: string }>
  }

  it('registers verify-release-gate with a single argv command', () => {
    const gate = manifest.gates.find((entry) => entry.id === 'verify-release-gate')
    expect(gate).toEqual({
      id: 'verify-release-gate',
      cwd: '.',
      command: 'pnpm test src/verify-release-gate.test.ts'
    })
    for (const forbidden of ['&&', '||', '|', ';']) {
      expect(gate?.command).not.toContain(forbidden)
    }
    expect(existsSync(join(repoRoot, 'src/verify-release-gate.test.ts'))).toBe(true)
  })

  it('keeps the test gate and the default matrix intact', () => {
    expect(manifest.version).toBe(1)
    expect(manifest.gates.some((entry) => entry.id === 'test')).toBe(true)
  })
})

describe('lessons', () => {
  const lessons = readFileSync(join(repoRoot, 'docs/lessons.md'), 'utf8')

  it('records the GC memory caliber, the v0.2.16 evidence and the retired d1>=d2>=d3 rule', () => {
    for (const marker of [
      'HeapProfiler.collectGarbage',
      'Performance.getMetrics',
      'JSHeapUsedSize',
      '静置 1s',
      '第 3 轮保留堆 − 第 2 轮 ≤16 MiB',
      '未 GC 的轮末堆只记录',
      'projects/ops_df43e423451170fd/.munk/runs/trun_5d107ebc931e4ffe/evidence/32-heap-gc-probe.json',
      '241.6',
      '241.8',
      'd1≥d2≥d3',
      'CI 不跑内存腿',
      'task_0194dba8b812d08b'
    ]) {
      expect(lessons, `lessons.md marker "${marker}"`).toContain(marker)
    }
  })
})

/* ------------------------------------------------------------------ */
/* Cleanup                                                             */
/* ------------------------------------------------------------------ */

// Every fixture lives under the OS temp dir and is removed after the suite.
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})
