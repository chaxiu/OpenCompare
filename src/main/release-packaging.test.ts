import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { UPLOAD_ASSET_GLOBS } from '../../scripts/verify-release.mjs'
import { builder, currentTag, currentVersion, finalizeStep, gateStep, gatesSteps, macEntitlements, packageStep, pkg, repoRoot, workflow, yamlScalars } from './release-doc-fixtures.test-helpers'

// Table-driven contract for the release package metadata, the body / link / metadata /
// AppImage gates and the release-evidence ledger. Expected data:
// src/main/__fixtures__/release-packaging.json (product files stay under test).

type Strings = string[]
interface ValueRow { id: string; path: string; value?: unknown; present?: boolean; nonEmpty?: boolean; tokens?: Strings }
interface StepRow { id: string; job: 'gates' | 'release' | 'finalize'; name: string; if?: string; tokens: Strings; absent: Strings; patterns: Strings; absentPatterns: Strings }
interface StepOrderRow { id: string; job: 'gates' | 'release' | 'finalize'; names: Strings; mustBeLast: boolean }
interface DocsRow { id: string; path: string; tokens: Strings; absent: Strings; absentPatterns: Strings }
interface CheckRow { id: string; scope: 'runs' | 'yaml'; tokens: Strings; absent: Strings; patterns: Strings; absentPatterns: Strings }
interface GuardRow { id: string; marker: string; message: string }
interface CaseRow { id: string; mode: string; status: 'zero' | 'nonzero'; tokens: Strings; absent: Strings }
interface AppImageCase { id: string; status: 'zero' | 'nonzero'; tokens: Strings; absent: Strings; declared?: number; size?: number; tailHex?: string; images?: number; metadataMode?: 'declared' | 'blockmap-missing' | 'file-missing' }
interface LedgerRow { id: string; version: string; status: string; assets?: number }
type MetadataTemplate = Record<'versionLine' | 'filesLine' | 'urlLine' | 'shaLine' | 'sizeLine' | 'blockMapLine' | 'pathLine' | 'sha512Line' | 'appImageUrl' | 'debUrl', string>
interface Fixture {
  schemaVersion: number
  packageRows: ValueRow[]; builderRows: ValueRow[]; entitlements: Array<{ id: string; key: string }>
  docs: DocsRow[]; steps: StepRow[]; stepOrder: StepOrderRow[]; workflowChecks: CheckRow[]
  postReleaseVerify: {
    id: string; path: string; runName: string; findStep: string; aggregateStep: string; tagRequired: boolean
    permissions: Record<string, string>; forbiddenTriggers: Strings; forbiddenPatterns: Strings
  }
  releaseBody: {
    id: string; name: string; makePublicName: string; versionDerivation: string
    notesPath: string; bilingualPath: string; bodyFile: string; notesFileFlag: string; notesFileWrites: number
    bodyReads: { english: string; chinese: string }; guards: GuardRow[]
    create: string; edit: string; draftProbe: string; previousRelease: string; previousSelector: string
    changelog: string; changelogLine: string; publicNote: string; separator: string
    foldOpen: string; foldClose: string; foldCounts: { open: number; close: number }; finalizeBodyFree: string
    previousLookup: string; exitToken: string; detailsTag: string; detailsCloseTag: string
  }
  notesLinks: { baseTemplate: string; rows: Array<{ id: string; doc: string; thirdLineTemplate: string; absent: Strings; linkCount: number }> }
  bodyAssembly: { separator: string; foldOpen: string; foldClose: string; changelog: string; previous: { bodyGate: string; linkGate: string } }
  bodyGate: { name: string; cases: CaseRow[] }
  linkGate: { name: string; cases: CaseRow[] }
  appImage: { gateName: string; fixtureVersion: string; declared: number; tailHex: string; littleEndianDecoded: number; metadata: MetadataTemplate; cases: AppImageCase[] }
  signing: { secrets: Strings; token: string; secretPattern: string; apiKeyRefPattern: string }
  evidence: { root: string; assetFamilyPattern: string; ledger: LedgerRow[] }
}

const readBytes = (path: string): Buffer => readFileSync(path)
const readText = (relative: string): string => readBytes(join(repoRoot, relative)).toString('utf8')
const fixture = JSON.parse(readText('src/main/__fixtures__/release-packaging.json')) as Fixture
const fill = (template: string, extra: Record<string, string> = {}): string =>
  template.replace(/\$\{(\w+)\}/g, (match, key: string) => extra[key] ?? match)
const pick = (source: unknown, path: string): unknown => {
  let value: unknown = source
  for (const key of path.split('.')) {
    if (value === null || typeof value !== 'object') return undefined
    value = (value as Record<string, unknown>)[key]
  }
  return value
}

// The only toContain / not.toContain helpers in this file.
const expectTokens = (text: string, tokens: readonly string[], label: string): void => {
  for (const token of tokens) expect(text, `${label}: ${token}`).toContain(token)
}
const expectAbsent = (text: string, tokens: readonly string[], label: string): void => {
  for (const token of tokens) expect(text, `${label}: ${token}`).not.toContain(token)
}
const expectPatterns = (text: string, patterns: readonly string[], label: string): void => {
  for (const pattern of patterns) expect(text, `${label}: ${pattern}`).toMatch(new RegExp(pattern))
}
const expectNoPattern = (text: string, patterns: readonly string[], label: string): void => {
  for (const pattern of patterns) expect(text, `${label}: ${pattern}`).not.toMatch(new RegExp(pattern))
}

const referencedIds = new Set<string>()
const useRow = (id: string): void => { referencedIds.add(id) }
const fixtureRowIds = [
  ...fixture.packageRows, ...fixture.builderRows, ...fixture.entitlements, ...fixture.docs,
  ...fixture.steps, ...fixture.stepOrder, ...fixture.workflowChecks, ...fixture.releaseBody.guards,
  ...fixture.notesLinks.rows, ...fixture.bodyGate.cases, ...fixture.linkGate.cases,
  ...fixture.appImage.cases, ...fixture.evidence.ledger, fixture.releaseBody.id, fixture.postReleaseVerify.id
].map((row) => (typeof row === 'string' ? row : row.id))

const stepOf = (row: StepRow): { if?: string; run?: string } | undefined =>
  row.job === 'gates' ? gateStep(row.name) : row.job === 'release' ? packageStep(row.name) : finalizeStep(row.name)
const stepsOf = (job: 'gates' | 'release' | 'finalize'): Array<{ name?: string; run?: string; uses?: string; env?: Record<string, string>; with?: Record<string, unknown> }> => workflow.jobs?.[job]?.steps ?? []
const stepIndex = (job: 'gates' | 'release' | 'finalize', name: string): number => stepsOf(job).findIndex((step) => step.name === name)
const allRunText = Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? [])
  .map((step) => step.run ?? '').join('\n')
const allStepText = Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? [])
  .map((step) => [step.run, step.uses, ...Object.entries(step.env ?? {}).map(([key, value]) => `${key}: ${value}`), ...Object.entries(step.with ?? {}).map(([key, value]) => `${key}: ${String(value)}`)].join('\n')).join('\n')
const runInTemp = (run: (dir: string) => ReturnType<typeof spawnSync>): { status: number; output: string } => {
  const dir = mkdtempSync(join(tmpdir(), 'opencompare-release-gate-'))
  try {
    const result = run(dir)
    return { status: result.status ?? -1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('release package metadata', () => {
  it.each(fixture.packageRows)('$id pins $path', (row) => {
    useRow(row.id)
    const actual = pick(pkg as unknown, row.path)
    if (row.present) expect(actual, row.id).toBeTruthy()
    if (row.nonEmpty) expect(String(actual ?? '').trim(), row.id).not.toBe('')
    if (row.value !== undefined) expect(actual, row.id).toEqual(row.value)
  })

  it.each(fixture.builderRows)('$id pins $path', (row) => {
    useRow(row.id)
    const actual = pick(builder as unknown, row.path)
    if (row.value !== undefined) expect(actual, row.id).toEqual(row.value)
    if (row.nonEmpty) expect(String(actual ?? '').trim(), row.id).not.toBe('')
    if (row.tokens) expectTokens(String(actual ?? ''), row.tokens, row.id)
  })

  it.each(fixture.entitlements)('$id is declared for the signed bundle', (row) => {
    useRow(row.id)
    expectTokens(macEntitlements, [row.key], row.id)
  })
})

describe('release workflow contracts', () => {
  it.each(fixture.steps)('$id satisfies $name', (row) => {
    useRow(row.id)
    const step = stepOf(row)
    expect(step, `${row.name}: present`).toBeDefined()
    if (row.if !== undefined) expect(step?.if, `${row.name}: if`).toBe(row.if)
    const body = step?.run ?? ''
    expect(body.length, `${row.name}: run`).toBeGreaterThan(0)
    expectTokens(body, row.tokens, row.name)
    expectAbsent(body, row.absent, row.name)
    expectPatterns(body, row.patterns, row.name)
    expectNoPattern(body, row.absentPatterns, row.name)
  })

  it.each(fixture.workflowChecks)('$id holds on the parsed workflow', (row) => {
    useRow(row.id)
    const text = row.scope === 'yaml' ? yamlScalars(workflow).join('\n') : allRunText
    expectTokens(text, row.tokens, row.id)
    expectAbsent(text, row.absent, row.id)
    expectPatterns(text, row.patterns, row.id)
    expectNoPattern(text, row.absentPatterns, row.id)
  })

  it('pins the trigger, gate job, release matrix and single-release wiring structurally', () => {
    expect(workflow.on?.push?.tags).toEqual(['v*'])
    expect(workflow.on?.workflow_dispatch?.inputs?.tag).toBeDefined()
    expect(workflow.jobs?.gates?.name).toBe('Quality gates')
    expect(workflow.jobs?.release?.needs).toBe('gates')
    expect((workflow.jobs?.release?.strategy?.matrix?.include ?? []).map((entry) => entry.target)).toEqual(['mac', 'win', 'linux'])
    expect(gatesSteps.some((step) => step.env?.GH_REPO === '${{ github.repository }}'), 'gates GH_REPO').toBe(true)
    expect(allRunText, 'electron-builder publish never').toContain('electron-builder --${{ matrix.target }} --publish never')
    expect(allRunText, 'duplicate release prune').toContain('gh api --method DELETE')
  })

  it('wires finalize to dispatch and check the post-release verification', () => {
    const spec = fixture.postReleaseVerify
    useRow(spec.id)
    const verify = parse(readText(spec.path)) as {
      on?: Record<string, { inputs?: Record<string, { required?: boolean }> }>
      'run-name'?: string
      permissions?: Record<string, string>
    }
    expect(workflow.jobs?.finalize?.permissions, 'finalize permissions').toEqual({ contents: 'write', actions: 'write' })
    expect(Object.keys(verify.on ?? {}), 'verify triggers').toEqual(['workflow_dispatch'])
    expect(spec.forbiddenTriggers.filter((event) => event in (verify.on ?? {})), 'dead triggers').toEqual([])
    expect([verify.on?.workflow_dispatch?.inputs?.tag?.required, verify['run-name'], verify.permissions]).toEqual([spec.tagRequired, spec.runName, spec.permissions])
    const text = JSON.stringify(verify)
    for (const pattern of spec.forbiddenPatterns) expect(text, pattern).not.toMatch(new RegExp(pattern))
  })

  it('pins every gates job command in order', () => {
    const pnpmRuns = gatesSteps.map((step) => (step.run ?? '').trim()).filter((run) => run.startsWith('pnpm '))
    expect(pnpmRuns, 'gates job pnpm steps').toEqual(['pnpm install --frozen-lockfile', 'pnpm lint', 'pnpm typecheck', 'pnpm test', 'pnpm test:soak -- --rounds=50', 'pnpm build'])
  })

  it.each(fixture.stepOrder)('$id keeps the workflow order', (row) => {
    useRow(row.id)
    const names = stepsOf(row.job).map((step) => step.name ?? '')
    const indexes = row.names.map((name) => {
      const index = names.indexOf(name)
      expect(index, `${row.job}: ${name}`).toBeGreaterThan(-1)
      return index
    })
    for (let index = 1; index < indexes.length; index += 1) expect(indexes[index], row.names[index]).toBeGreaterThan(indexes[index - 1])
    if (row.mustBeLast) expect(names[names.length - 1], `${row.job}: last step`).toBe(row.names[row.names.length - 1])
  })

  it.each(fixture.docs)('$id keeps the repository free of private key material', (row) => {
    useRow(row.id)
    const text = row.path.endsWith('.yml') ? yamlScalars(parse(readText(row.path))).join('\n') : readText(row.path)
    expectTokens(text, row.tokens, row.id)
    expectAbsent(text, row.absent, row.id)
    expectNoPattern(text, row.absentPatterns, row.id)
  })

  it.each(fixture.signing.secrets)('%s is wired into the mac matrix build', (secret) => {
    expect(allStepText, secret).toMatch(new RegExp(fixture.signing.secretPattern.replaceAll('${secret}', secret)))
  })

  it('wires only the fixture secrets plus the workflow token', () => {
    const refs = [...allStepText.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((match) => match[1])
    expect(new Set(refs), 'secret set').toEqual(new Set([...fixture.signing.secrets, fixture.signing.token]))
    expect(allStepText, 'api-key path').toMatch(new RegExp(fixture.signing.apiKeyRefPattern))
  })

  // The build-time baseline has to be produced by the same glob the upload
  // sends, archived as a workflow artifact only, and compared by one rule.
  it('hashes the upload set before upload and archives the manifest as an artifact', () => {
    const compute = stepIndex('release', 'Compute the build-time sha256 manifest')
    const archive = stepIndex('release', 'Archive the build-time sha256 manifest')
    const upload = stepIndex('release', "Upload installers to the tag's release")
    expect(compute, 'compute step').toBeGreaterThan(-1)
    expect(archive, 'archive step').toBeGreaterThan(compute)
    expect(upload, 'upload step').toBeGreaterThan(archive)
    const archiveStep = stepsOf('release')[archive]
    expect(String(archiveStep?.uses ?? ''), 'archive action').toMatch(/^actions\/upload-artifact@/)
    expect(String(archiveStep?.with?.name ?? ''), 'artifact name').toContain('env.RELEASE_TAG')
    expect(String(archiveStep?.with?.name ?? ''), 'artifact target').toContain('matrix.target')
    expect(archiveStep?.with?.path, 'artifact path').toBe('sha256-manifest')
    expect(archiveStep?.with?.['if-no-files-found'], 'artifact required').toBe('error')
    const uploadRun = stepsOf('release')[upload].run ?? ''
    const globs = UPLOAD_ASSET_GLOBS.map((glob) => `release/${glob}`).join(' ')
    expect(uploadRun, 'upload glob is the single source').toContain(`assets=(${globs})`)
    expect(uploadRun, 'the manifest never reaches the upload set').not.toContain('sha256-manifest')
    expect(stepsOf('release')[compute].run ?? '', 'no second glob enumeration').not.toContain('release/*')
  })

  // Only `scripts/verify-release.mjs` maps a local name onto its uploaded name.
  it('keeps one spaces-to-dots mapping outside the workflow', () => {
    const text = readText('.github/workflows/release.yml')
    expect(text, 'no shell rewrite').not.toMatch(/tr ' ' '\.'/)
    expect(text, 'no jq rewrite').not.toMatch(/gsub\(\s*" "\s*;\s*"\."\s*\)/)
    expect(text, 'no sed rewrite').not.toMatch(/sed[^\n]*s\/ \/\./)
  })
})

// A dispatch is only worth the permission if the gates after it really fail
// closed, so both shell steps run in-process against a fake `gh` on PATH.
describe('post-release verification dispatch gates', () => {
  const spec = fixture.postReleaseVerify
  const print = (text: string): string => `printf '%s\\n' '${text}'`
  const runGate = (step: string, gh: string, extraEnv: Record<string, string> = {}, since = '1970-01-01T00:00:00Z'): { status: number; output: string } =>
    runInTemp((dir) => {
      writeFileSync(join(dir, 'gh'), `#!/usr/bin/env bash\n${gh}\n`, { mode: 0o755 })
      writeFileSync(join(dir, 'post-release-verify-run-id.txt'), '4242\n')
      writeFileSync(join(dir, 'post-release-verify-since.txt'), `${since}\n`)
      writeFileSync(join(dir, 'gate.sh'), step)
      return spawnSync('bash', [join(dir, 'gate.sh')], {
        cwd: dir, encoding: 'utf8',
        env: { ...process.env, PATH: `${dir}:${process.env.PATH ?? ''}`, RUNNER_TEMP: dir, RELEASE_TAG: currentTag, GITHUB_REPOSITORY: 'chaxiu/OpenCompare', ...extraEnv }
      })
    })

  it('finds the run named after this tag and fails closed when none appears', () => {
    const find = finalizeStep(spec.findStep)?.run ?? ''
    const runs = (tag: string): string => print(JSON.stringify([{ databaseId: 4242, displayTitle: `post-release-verify ${tag}`, createdAt: '2026-11-03T00:00:00Z' }]))
    const found = runGate(find, runs(currentTag))
    const missing = runGate(find, runs('v0.0.1'), { POST_RELEASE_LOOKUP_SECONDS: '0' })
    const stale = runGate(find, runs(currentTag), { POST_RELEASE_LOOKUP_SECONDS: '0' }, '2026-11-04T00:00:00Z')
    expect(found.status, 'found').toBe(0)
    expectTokens(found.output, ['run 4242'], 'found')
    expect(missing.status, 'missing').not.toBe(0)
    expect(stale.status, 'stale').not.toBe(0)
    expectTokens(missing.output, ['appeared within five minutes'], 'missing')
  })

  it('accepts only a successful aggregate job with the tag and run artifact', () => {
    const aggregate = finalizeStep(spec.aggregateStep)?.run ?? ''
    const gh = (conclusion: string): string => ['if [ "$1" = "run" ]; then',
      `  ${print(JSON.stringify({ status: 'completed', jobs: [{ name: 'spike', conclusion: 'success' }, { name: 'aggregate', conclusion }] }))}`,
      'else', `  ${print(`post-release-verify-${currentTag}-4242-aggregate`)}`, 'fi'].join('\n')
    const passed = runGate(aggregate, gh('success'))
    const failed = runGate(aggregate, gh('failure'))
    expect(passed.status, 'passed').toBe(0)
    expectTokens(passed.output, [`post-release-verify-${currentTag}-4242-aggregate`], 'passed')
    expect(failed.status, 'failed').not.toBe(0)
    expectTokens(failed.output, ['concluded failure'], 'failed')
  })
})

// The publish step may only be reached after the draft aggregate PASSed. The
// five finalize steps run in order against a fake `gh` that logs every call, so
// a failure leaves `gh release edit` out of the log entirely.
describe('finalize publish gate', () => {
  const resolveName = fixture.steps.find((row) => row.id === 'finalize-resolve-state')?.name ?? ''
  const dispatchName = fixture.steps.find((row) => row.id === 'finalize-dispatch-verify')?.name ?? ''
  const chainNames = [resolveName, dispatchName, fixture.postReleaseVerify.findStep, fixture.postReleaseVerify.aggregateStep, fixture.releaseBody.makePublicName]
  const runChain = (conclusion: string, artifactPresent: boolean): { status: number; output: string; calls: string[] } => {
    const dir = mkdtempSync(join(tmpdir(), 'opencompare-finalize-chain-'))
    try {
      const calls = join(dir, 'gh-calls.log')
      const gh = [
        '#!/usr/bin/env bash', `echo "$*" >> "${calls}"`,
        'if [ "$1" = "api" ]; then', '  shift',
        '  case "$*" in',
        `    *"releases --paginate"*) printf '%s\\n' '${JSON.stringify([{ id: 7, tag_name: currentTag, draft: true }])}' ;;`,
        `    *"actions/runs/4242/artifacts"*) if [ ${artifactPresent ? 1 : 0} = 1 ]; then printf '%s\\n' 'post-release-verify-${currentTag}-4242-aggregate'; fi ;;`,
        '  esac', '  exit 0', 'fi',
        'if [ "$1" = "run" ]; then', '  case "$2" in',
        `    list) printf '%s\\n' '${JSON.stringify([{ databaseId: 4242, displayTitle: `post-release-verify ${currentTag}`, createdAt: '2026-11-03T00:00:00Z' }])}' ;;`,
        `    view) printf '%s\\n' '${JSON.stringify({ status: 'completed', jobs: [{ name: 'spike', conclusion: 'success' }, { name: 'aggregate', conclusion }] })}' ;;`,
        '    download) dir=""; prev=""; for arg in "$@"; do if [ "$prev" = "--dir" ]; then dir="$arg"; fi; prev="$arg"; done',
        '      mkdir -p "$dir/steps"',
        '      printf \'%s\\n\' \'{"status":"fail","problems":["linux-directory-compare 失败"]}\' > "$dir/summary.json"',
        '      printf \'%s\\n\' \'{"id":"linux-directory-compare","status":"fail"}\' > "$dir/steps/01-linux-directory-compare.json" ;;',
        '  esac', '  exit 0', 'fi', 'exit 0'
      ].join('\n')
      writeFileSync(join(dir, 'gh'), `${gh}\n`, { mode: 0o755 })
      writeFileSync(join(dir, 'date'), '#!/usr/bin/env bash\nprintf \'%s\\n\' \'1970-01-01T00:00:00Z\'\n', { mode: 0o755 })
      let output = ''
      let status = 0
      for (const [index, name] of chainNames.entries()) {
        const body = finalizeStep(name)?.run ?? ''
        expect(body.length, name).toBeGreaterThan(0)
        const script = join(dir, `step-${index}.sh`)
        writeFileSync(script, body)
        const result = spawnSync('bash', [script], {
          cwd: dir, encoding: 'utf8',
          env: { ...process.env, PATH: `${dir}:${process.env.PATH ?? ''}`, RUNNER_TEMP: dir, RELEASE_TAG: currentTag, GITHUB_REPOSITORY: 'chaxiu/OpenCompare', GITHUB_RUN_ID: '4242' }
        })
        output += `${result.stdout ?? ''}${result.stderr ?? ''}`
        if ((result.status ?? -1) !== 0) { status = result.status ?? -1; break }
      }
      const callsText = existsSync(calls) ? readFileSync(calls, 'utf8') : ''
      return { status, output, calls: callsText.split('\n').filter((line) => line.length > 0) }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  it('publishes only after the dispatch, aggregate and artifact gate', () => {
    const success = runChain('success', true)
    expect(success.status, success.output).toBe(0)
    const dispatch = success.calls.findIndex((line) => line.startsWith('workflow run'))
    const view = success.calls.findIndex((line) => line.startsWith('run view'))
    const artifact = success.calls.findIndex((line) => line.includes('actions/runs/4242/artifacts'))
    const publish = success.calls.findIndex((line) => line.startsWith('release edit'))
    expect(success.calls[dispatch], 'dispatch mode').toContain('-f mode=draft')
    expect(dispatch).toBeGreaterThan(-1)
    expect(view).toBeGreaterThan(dispatch); expect(artifact).toBeGreaterThan(view); expect(publish).toBeGreaterThan(artifact)
    expectTokens(success.output, ['aggregate PASS'], 'success')
  })

  it('keeps the release draft and never publishes when a check failed', () => {
    const failed = runChain('failure', true)
    expect(failed.status, failed.output).not.toBe(0)
    expect(failed.calls.some((line) => line.startsWith('release edit')), 'publish call').toBe(false)
    expectTokens(failed.output, ['check: linux-directory-compare=fail', 'problem: linux-directory-compare', 'verify-out', 'the release stays draft'], 'failure')
  })
})

// Public L1 is a post-publish check over the public metadata, URLs and the
// build-time sha256 manifests. The digest comparison itself lives only in
// `scripts/verify-release.mjs`; this suite executes the real step and script.
describe('public L1 after publish', () => {
  const l1Name = fixture.steps.find((row) => row.id === 'public-l1-after-publish')?.name ?? ''
  const payload = 'public-l1-payload'
  const shaOf = (text: string): string => createHash('sha256').update(text).digest('hex')
  const digestOf = (text: string): string => `sha256:${shaOf(text)}`
  const curl = [
    '#!/usr/bin/env bash', 'out=""', 'prev=""', 'for arg in "$@"; do',
    '  if [ "$prev" = "-o" ]; then out="$arg"; fi', '  prev="$arg"', 'done',
    'if [ -n "$out" ] && [ "$out" != "/dev/null" ]; then printf "%s" "$FAKE_ASSET_PAYLOAD" > "$out"; fi',
    'case "$*" in', '  *"-w"*) printf "%s" "${FAKE_HTTP_CODE:-200}" ;;', 'esac', 'exit 0'
  ].join('\n')
  type ManifestMode = 'match' | 'mismatch' | 'missing' | 'orphan'
  const runL1 = (options: { httpCode?: string; digest?: string; manifest?: ManifestMode } = {}): { status: number; output: string } =>
    runInTemp((dir) => {
      const assets = [{ name: 'OpenCompare.dmg', browser_download_url: 'https://github.test/OpenCompare.dmg', size: payload.length, digest: options.digest ?? digestOf(payload) }]
      const meta = JSON.stringify({ draft: false, html_url: `https://github.test/releases/tag/${currentTag}`, assets })
      mkdirSync(join(dir, 'scripts'), { recursive: true })
      for (const name of ['verify-release.mjs', 'four-state-legend.mjs']) copyFileSync(join(repoRoot, 'scripts', name), join(dir, 'scripts', name))
      const mode = options.manifest ?? 'match'
      const manifest = JSON.stringify({
        version: 1, tag: currentTag, target: 'mac',
        files: [
          { name: 'OpenCompare.dmg', sha256: mode === 'mismatch' ? shaOf('other bytes') : shaOf(payload), bytes: payload.length },
          ...(mode === 'orphan' ? [{ name: 'ghost.zip', sha256: shaOf('ghost'), bytes: 1 }] : [])
        ]
      })
      const gh = [
        '#!/usr/bin/env bash',
        'if [ "$1" = "run" ] && [ "$2" = "download" ]; then',
        `  if [ "${mode}" = "missing" ]; then echo "no manifests" >&2; exit 1; fi`,
        '  out=""; prev=""; for arg in "$@"; do if [ "$prev" = "--dir" ]; then out="$arg"; fi; prev="$arg"; done',
        `  mkdir -p "$out/sha256-manifest-${currentTag}-mac"`,
        `  printf '%s\\n' '${manifest}' > "$out/sha256-manifest-${currentTag}-mac/mac.json"`,
        '  exit 0',
        'fi',
        `printf '%s\\n' '${meta}'`
      ].join('\n')
      writeFileSync(join(dir, 'gh'), `${gh}\n`, { mode: 0o755 })
      writeFileSync(join(dir, 'curl'), `${curl}\n`, { mode: 0o755 })
      const script = join(dir, 'l1.sh')
      writeFileSync(script, finalizeStep(l1Name)?.run ?? '')
      return spawnSync('bash', [script], {
        cwd: dir, encoding: 'utf8',
        env: { ...process.env, PATH: `${dir}:${process.env.PATH ?? ''}`, RUNNER_TEMP: dir, RELEASE_TAG: currentTag,
          GITHUB_REPOSITORY: 'chaxiu/OpenCompare', GITHUB_RUN_ID: '4242', FAKE_ASSET_PAYLOAD: payload, FAKE_HTTP_CODE: options.httpCode ?? '200' }
      })
    })

  it('passes when every asset digest equals the build-time sha256', () => {
    const passed = runL1()
    expect(passed.status, passed.output).toBe(0)
    expect(passed.output).toContain('public L1 PASS')
    expect(passed.output).toContain('1 assets digest == build sha256')
  })
  it('fails closed on a non-200 asset URL and on a digest mismatch', () => {
    const notFound = runL1({ httpCode: '404' })
    expect(notFound.status, notFound.output).not.toBe(0)
    expect(notFound.output).toContain('returned HTTP 404')
    const mismatch = runL1({ manifest: 'mismatch' })
    expect(mismatch.status, mismatch.output).not.toBe(0)
    expect(mismatch.output).toContain(`OpenCompare.dmg digest 期望(构建期) ${shaOf('other bytes')} 实测 sha256:${shaOf(payload)}`)
  })
  it('fails closed when the manifest is missing or has an orphan entry', () => {
    const missing = runL1({ manifest: 'missing' })
    expect(missing.status, missing.output).not.toBe(0)
    expect(missing.output).toContain('缺构建期 sha256 清单')
    const orphan = runL1({ manifest: 'orphan' })
    expect(orphan.status, orphan.output).not.toBe(0)
    expect(orphan.output).toContain('ghost.zip 清单条目在发布上不存在')
  })
  it('refuses to pass the sha256 leg when no asset carries a digest', () => {
    const missing = runL1({ digest: '' })
    expect(missing.status, missing.output).not.toBe(0)
    expect(missing.output).toContain('digest 为空')
  })
})

describe('release body from repository notes', () => {
  const spec = fixture.releaseBody
  const script = gateStep(spec.name)?.run ?? ''

  it('derives both notes paths from package.json and reads each language once', () => {
    useRow(spec.id)
    const derive = script.indexOf(spec.versionDerivation)
    expect(derive, spec.id).toBeGreaterThan(-1)
    for (const path of [spec.notesPath, spec.bilingualPath]) {
      expect(script.indexOf(path), `${spec.id}: ${path}`).toBeGreaterThan(derive)
    }
    expectTokens(script, [spec.bodyFile], spec.id)
    expectTokens(script, [spec.bodyReads.english, spec.bodyReads.chinese], spec.id)
    expect(script.split(spec.notesFileFlag).length - 1, `${spec.id}: body writes`).toBe(spec.notesFileWrites)
  })

  it.each(spec.guards)('$id fails closed before any release write', (guard) => {
    useRow(guard.id)
    const marker = script.indexOf(guard.marker)
    expect(marker, guard.id).toBeGreaterThan(-1)
    expectTokens(script, [guard.message], guard.id)
    expectTokens(script.slice(marker, script.indexOf(spec.create)), [spec.exitToken], guard.id)
  })

  it('folds the zh-CN notes into one details block in body order', () => {
    const offsets = [
      spec.bodyReads.english, spec.separator, spec.foldOpen, spec.bodyReads.chinese, spec.foldClose, spec.changelog
    ].map((token) => {
      const index = script.indexOf(token)
      expect(index, token).toBeGreaterThan(-1)
      return index
    })
    for (let index = 1; index < offsets.length; index += 1) {
      expect(offsets[index], `order ${index}`).toBeGreaterThan(offsets[index - 1])
    }
    expect(script.split(spec.detailsTag).length - 1, 'fold open').toBe(spec.foldCounts.open)
    expect(script.split(spec.detailsCloseTag).length - 1, 'fold close').toBe(spec.foldCounts.close)
  })

  it('resolves the previous release and appends the changelog line', () => {
    const resolveLast = script.indexOf(spec.previousLookup)
    expectTokens(script, [spec.previousSelector, spec.changelogLine], spec.id)
    expect(resolveLast).toBeGreaterThan(-1)
    expect(resolveLast).toBeLessThan(script.indexOf(spec.changelog))
    const missingLast = script.indexOf(spec.previousRelease)
    expect(missingLast).toBeGreaterThan(resolveLast)
    expect(script.indexOf(spec.exitToken, missingLast)).toBeGreaterThan(missingLast)
    expect(script.indexOf(spec.create)).toBeGreaterThan(missingLast)
  })

  it('writes the body only into the draft create and the draft-only edit', () => {
    const create = script.indexOf(spec.create)
    const draft = script.indexOf(spec.draftProbe)
    const edit = script.indexOf(spec.edit)
    expectTokens(script.slice(create, draft), [spec.notesFileFlag], spec.id)
    expect(draft).toBeGreaterThan(create)
    expect(edit).toBeGreaterThan(draft)
    expectTokens(script.slice(edit), [spec.notesFileFlag, spec.publicNote], spec.id)
  })

  it('keeps the finalize publish step body-free', () => {
    expect(finalizeStep(spec.makePublicName)?.run, spec.makePublicName).toBe(spec.finalizeBodyFree)
  })
})

describe('published release body gate', () => {
  const assembly = fixture.bodyAssembly
  const publishedBody = (english: string, chinese: string, previous: string): string =>
    [english, '', assembly.separator, '', assembly.foldOpen, '', chinese, '', assembly.foldClose, '',
      fill(assembly.changelog, { previous, tag: currentTag })].join('\n')

  const runBodyGate = (body: string): { status: number; output: string } =>
    runInTemp((dir) => {
      const fixturePath = join(dir, 'fixture-body.md')
      writeFileSync(fixturePath, body)
      writeFileSync(join(dir, 'gh'), '#!/usr/bin/env bash\ncat "${FAKE_RELEASE_BODY}"\n', { mode: 0o755 })
      const script = join(dir, 'body-gate.sh')
      writeFileSync(script, finalizeStep(fixture.bodyGate.name)?.run ?? '')
      return spawnSync('bash', [script], {
        cwd: dir, encoding: 'utf8',
        env: { ...process.env, PATH: `${dir}:${process.env.PATH ?? ''}`, RUNNER_TEMP: dir, RELEASE_TAG: currentTag,
          GITHUB_REPOSITORY: 'chaxiu/OpenCompare', FAKE_RELEASE_BODY: fixturePath }
      })
    })

  it('runs in finalize after the release is made public', () => {
    const publish = stepIndex('finalize', fixture.releaseBody.makePublicName)
    expect(finalizeStep(fixture.bodyGate.name)).toBeDefined()
    expect(stepIndex('finalize', fixture.bodyGate.name), fixture.bodyGate.name).toBeGreaterThan(publish)
  })

  it.each(fixture.bodyGate.cases)('$id runs the body gate', (row) => {
    useRow(row.id)
    const english = `# OpenCompare ${currentTag} release notes`
    const chinese = `# OpenCompare ${currentTag} 发布说明`
    const previous = assembly.previous.bodyGate
    const body = row.mode === 'no-fold'
      ? `${english}\n\n${fill(assembly.changelog, { previous, tag: currentTag })}\n`
      : publishedBody(
          row.mode === 'missing-en' ? '# OpenCompare release notes' : english,
          row.mode === 'missing-zh' ? '# OpenCompare 发布说明' : chinese,
          previous
        )
    const result = runBodyGate(body)
    if (row.status === 'zero') expect(result.status, row.id).toBe(0)
    else expect(result.status, row.id).not.toBe(0)
    expectTokens(result.output, row.tokens.map((token) => fill(token, { tag: currentTag })), row.id)
    expectAbsent(result.output, row.absent, row.id)
  })
})

describe('published release body link gate', () => {
  const spec = fixture.linkGate
  const script = finalizeStep(spec.name)?.run ?? ''
  const base = fill(fixture.notesLinks.baseTemplate, { tag: currentTag })
  const enSwitch = `${base}/${currentTag}.zh-CN.md`
  const zhSwitch = `${base}/${currentTag}.md`
  const releaseNotes = readText(fill(fixture.notesLinks.rows[0].doc, { tag: currentTag }))
  const bilingualNotes = readText(fill(fixture.notesLinks.rows[1].doc, { tag: currentTag }))
  const assembly = fixture.bodyAssembly

  it.each(fixture.notesLinks.rows)('$id pins the tag-fixed absolute switch link', (row) => {
    useRow(row.id)
    const text = readText(fill(row.doc, { tag: currentTag }))
    const third = text.split('\n')[2] ?? ''
    expect(third, row.id).toBe(fill(row.thirdLineTemplate, { tag: currentTag, base }))
    expectAbsent(third, row.absent.map((token) => fill(token, { tag: currentTag })), row.id)
    expect(text.match(/\]\([^)]*\)/g)?.length ?? 0, `${row.id}: markdown links`).toBe(row.linkCount)
  })

  it('runs the read-only link gate in finalize after the release is public', () => {
    const publish = stepIndex('finalize', fixture.releaseBody.makePublicName)
    expect(finalizeStep(spec.name)).toBeDefined()
    expect(stepIndex('finalize', spec.name), spec.name).toBeGreaterThan(publish)
  })

  it.each(fixture.linkGate.cases)('$id runs the link gate', (row) => {
    useRow(row.id)
    const dropped = (url: string): string => url.replace('/blob/', '/blobs/')
    const english = row.mode === 'relative' ? releaseNotes.replace(enSwitch, `./${currentTag}.zh-CN.md`)
      : row.mode === 'drop-en' || row.mode === 'drop-both' ? releaseNotes.replace(enSwitch, dropped(enSwitch))
        : releaseNotes
    const chinese = row.mode === 'drop-zh' || row.mode === 'drop-both'
      ? bilingualNotes.replace(zhSwitch, dropped(zhSwitch)) : bilingualNotes
    const body = [english.trimEnd(), '', assembly.separator, '', assembly.foldOpen, '', chinese.trimEnd(), '',
      assembly.foldClose, '', fill(assembly.changelog, { previous: assembly.previous.linkGate, tag: currentTag })].join('\n')
    const result = runInTemp((dir) => {
      const fixturePath = join(dir, 'fixture-body.md')
      writeFileSync(fixturePath, body)
      writeFileSync(join(dir, 'gh'), '#!/usr/bin/env bash\ncat "${FAKE_RELEASE_BODY}"\n', { mode: 0o755 })
      const scriptPath = join(dir, 'link-gate.sh')
      writeFileSync(scriptPath, script)
      return spawnSync('bash', [scriptPath], {
        cwd: dir, encoding: 'utf8',
        env: { ...process.env, PATH: `${dir}:${process.env.PATH ?? ''}`, RUNNER_TEMP: dir, RELEASE_TAG: currentTag,
          GITHUB_REPOSITORY: 'chaxiu/OpenCompare', FAKE_RELEASE_BODY: fixturePath }
      })
    })
    if (row.status === 'zero') expect(result.status, row.id).toBe(0)
    else expect(result.status, row.id).not.toBe(0)
    expectTokens(result.output, row.tokens.map((token) => fill(token, { tag: currentTag, enSwitch, zhSwitch })), row.id)
    expectAbsent(result.output, row.absent, row.id)
  })
})

describe('AppImage embedded blockmap gate', () => {
  const spec = fixture.appImage
  const script = packageStep(spec.gateName)?.run ?? ''
  const meta = spec.metadata
  const imageUrl = fill(meta.appImageUrl, { version: spec.fixtureVersion })
  const debUrl = fill(meta.debUrl, { version: spec.fixtureVersion })
  const buildMetadata = (declared: number | null): string =>
    [fill(meta.versionLine, { version: spec.fixtureVersion }), meta.filesLine, fill(meta.urlLine, { url: imageUrl }),
      meta.shaLine, meta.sizeLine, ...(declared === null ? [] : [fill(meta.blockMapLine, { declared: String(declared) })]),
      fill(meta.urlLine, { url: debUrl }), meta.shaLine, meta.sizeLine,
      fill(meta.pathLine, { appImageUrl: imageUrl }), meta.sha512Line].join('\n')

  it('reads the historical trailer as big-endian, not little-endian', () => {
    const tail = Buffer.from(spec.tailHex, 'hex')
    expect(tail.readUInt32BE(0)).toBe(spec.declared)
    expect(tail.readUInt32LE(0)).toBe(spec.littleEndianDecoded)
    expect(tail.readUInt32LE(0)).not.toBe(spec.declared)
  })

  it.each(spec.cases)('$id runs the AppImage gate', (row) => {
    useRow(row.id)
    const declared = row.declared ?? spec.declared
    const tail = Buffer.from(row.tailHex ?? spec.tailHex, 'hex')
    const size = row.size ?? spec.declared
    const images = row.images ?? 1
    const metadataMode = row.metadataMode ?? 'declared'
    const result = runInTemp((dir) => {
      const releaseDir = join(dir, 'release')
      mkdirSync(releaseDir, { recursive: true })
      const bytes = Buffer.alloc(size, 0)
      tail.copy(bytes, size - tail.length)
      for (let index = 0; index < images; index += 1) {
        const base = imageUrl.replace(/\.AppImage$/, '')
        writeFileSync(join(releaseDir, `${base}${index === 0 ? '' : `-${index}`}.AppImage`), bytes)
      }
      if (metadataMode !== 'file-missing') {
        writeFileSync(join(releaseDir, 'latest-linux.yml'), buildMetadata(metadataMode === 'blockmap-missing' ? null : declared))
      }
      const scriptPath = join(dir, 'appimage-gate.sh')
      writeFileSync(scriptPath, script)
      return spawnSync('bash', [scriptPath], { cwd: dir, encoding: 'utf8' })
    })
    if (row.status === 'zero') expect(result.status, row.id).toBe(0)
    else expect(result.status, row.id).not.toBe(0)
    expectTokens(result.output, row.tokens, row.id)
    expectAbsent(result.output, row.absent, row.id)
  })
})

// --- Release evidence ledger: one table-driven traversal over docs/release-evidence ---
const evidenceFiles = readdirSync(join(repoRoot, fixture.evidence.root)).filter((file) => file.endsWith('.md')).sort()
const ASSET_NAME = /(OpenCompare[.-][\w.-]*\.(?:blockmap|dmg|zip|exe|AppImage|deb)|opencompare_[\w.-]*\.deb|latest(?:-mac|-linux)?\.yml)/
const ASSET_FAMILY = new RegExp(fixture.evidence.assetFamilyPattern)
const SHA256 = /(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])/
const parseEvidence = (file: string) => {
  const text = readText(join(fixture.evidence.root, file))
  const version = file.slice(0, -'.md'.length)
  const assets = [...new Set(text.split(/\r?\n/).flatMap((line) => {
    const row = /^([^\t|]+)\t\d+\tsha256:[0-9a-f]{64}$/.exec(line)
    if (row) return [row[1]]
    const match = line.startsWith('| ') ? ASSET_NAME.exec(line) : null
    return match ? [match[1]] : []
  }))]
  const commitLine = text.split(/\r?\n/)
    .find((line) => /`[0-9a-f]{7,40}`/.test(line) && /tag\s*→\s*commit|提交|构建检出|本地 HEAD/.test(line)) ?? ''
  return {
    version, text, assets,
    status: /^status:\s*(\w+)$/m.exec(text)?.[1] ?? '',
    declared: Number((/^\| 资产数 \| *([0-9]+)/m.exec(text) ?? /（([0-9]+) 个资产）/.exec(text))?.[1] ?? NaN),
    tag: (/^"tagName":"([^"]+)"/m.exec(text) ?? /^\| tag_name \| *`([^`]+)`/m.exec(text) ?? /^\| tag \| *`([^`]+)`/m.exec(text))?.[1] ?? '',
    commit: /`([0-9a-f]{7,40})`/.exec(commitLine)?.[1] ?? '',
    digests: text.match(new RegExp(SHA256.source, 'g')) ?? [],
    malformed: (text.match(/\b[0-9A-Za-z]{64}\b/g) ?? []).filter((token) => !SHA256.test(token))
  }
}
const evidenceRecords = evidenceFiles.map(parseEvidence)
const verifiedEvidence = evidenceRecords.filter((record) => record.status === 'verified')
const evidenceAssets = verifiedEvidence.flatMap((record) => record.assets.map((name) => ({ version: record.version, name })))
const ledgerRow = (version: string): LedgerRow | undefined => fixture.evidence.ledger.find((row) => row.version === version)

describe('release evidence ledger (table-driven)', () => {
  it.each(fixture.evidence.ledger)('$id maps to its status and asset count', (row) => {
    useRow(row.id)
    const record = evidenceRecords.find((entry) => entry.version === row.version)
    expect(record, `${row.version}: evidence file`).toBeDefined()
    expect(record?.status, `${row.version}: status`).toBe(row.status)
    if (row.assets !== undefined) expect(record?.declared, `${row.version}: 资产数`).toBe(row.assets)
  })

  it('covers every evidence file once and keeps the ledger family', () => {
    expect(new Set(evidenceFiles).size).toBe(evidenceFiles.length)
    expect(fixture.evidence.ledger.map((row) => row.version).sort())
      .toEqual(evidenceFiles.map((file) => file.slice(0, -'.md'.length)).sort())
    expect(evidenceRecords.every((record) => /^v\d+\.\d+\.\d+$/.test(record.version))).toBe(true)
    // The converging tag may still be pending: only an existing evidence file
    // has to reconcile with its fixture ledger row.
    const current = evidenceRecords.find((record) => record.version === currentTag)
    if (current !== undefined && ledgerRow(currentTag)?.assets !== undefined) {
      const currentRow = ledgerRow(currentTag)
      expect(currentRow, `${currentTag}: fixture row`).toBeDefined()
      expect(current.assets.length, `${currentTag}: assets`).toBe(currentRow?.assets)
      expect(current.assets.some((name) => name.endsWith('win-x64.zip'))).toBe(true)
    }
  })

  it.each(evidenceRecords)('$version declares status, tag and commit identity', (record) => {
    expect(fixture.evidence.ledger.map((row) => row.status).includes(record.status), record.status).toBe(true)
    expect(record.text.match(/^status:/gm) ?? [], `${record.version}: status lines`).toHaveLength(1)
    expectTokens(record.text.split(/\r?\n/)[0], [record.version], `${record.version}: heading`)
    expect(record.text.split(/\r?\n/)[0], `${record.version}: Chinese heading`).toMatch(/\p{Script=Han}/u)
    if (record.tag) expect(record.tag.replace(/\s*（.*$/, '')).toBe(record.version)
    if (record.status === 'verified') {
      expect(record.commit, `${record.version}: commit`).toMatch(/^[0-9a-f]{7,40}$/)
      expectTokens(record.text, [`releases/tag/${record.version}`], `${record.version}: tag link`)
    }
  })

  it.each(verifiedEvidence)('$version asset rows satisfy the declared count', (record) => {
    const expected = ledgerRow(record.version)?.assets ?? -1
    expect(record.declared, `${record.version}: 资产数`).toBe(expected)
    expect(record.assets.length, `${record.version}: rows`).toBe(record.declared)
    expect(new Set(record.assets).size, `${record.version}: unique names`).toBe(record.assets.length)
  })

  it.each(evidenceAssets)('$version asset $name stays inside the family', ({ version, name }) => {
    expect(ASSET_FAMILY.test(name), `${version}: ${name}`).toBe(true)
    if (!name.startsWith('latest')) expectTokens(name, [version.slice(1)], `${version}: ${name}`)
  })

  it.each(verifiedEvidence)('$version digests are well-formed with one measured value', (record) => {
    expect(record.malformed, `${record.version}: malformed digest token`).toEqual([])
    expect(record.digests.length, `${record.version}: measured digests`).toBeGreaterThanOrEqual(1)
  })

  it.each(evidenceRecords.filter((record) => record.status !== 'verified'))(
    '$version keeps an explicit status without an asset ledger',
    (record) => {
      expect(record.declared, `${record.version}: 资产数 must stay absent`).toBeNaN()
    }
  )
})

describe('fixture ledger coverage', () => {
  it('consumes every fixture row exactly once by id', () => {
    expect(new Set(fixtureRowIds).size, 'duplicate fixture ids').toBe(fixtureRowIds.length)
    expect([...referencedIds].sort(), 'unused fixture rows').toEqual([...fixtureRowIds].sort())
    expect(fixture.schemaVersion, 'schemaVersion').toBe(1)
    expect(currentVersion, 'current version').toBe(pkg.version)
  })
})
