import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
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
  ...fixture.appImage.cases, ...fixture.evidence.ledger, fixture.releaseBody.id
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

  it('pins every gates job command in order', () => {
    const pnpmRuns = gatesSteps.map((step) => (step.run ?? '').trim()).filter((run) => run.startsWith('pnpm '))
    expect(pnpmRuns, 'gates job pnpm steps').toEqual(['pnpm install --frozen-lockfile', 'pnpm lint', 'pnpm typecheck', 'pnpm test', 'pnpm build'])
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
