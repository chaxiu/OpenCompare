import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { BRAND_NAME, buildAboutPanelOptions, resolveBrandIconPath } from '../shared/brand'
import { createMenuTemplate } from './menu'
import { builder, currentTag, currentVersion, finalizeStep, markdownSection, packageStep, parseMarkdown, pkg, repoRoot, workflow, yamlScalars } from './release-doc-fixtures.test-helpers'

// Table-driven contract for the shipped brand assets, release.yml and the release docs.
// Expected data: src/main/__fixtures__/release-artifacts-and-brand.json (product files stay under test).

type Strings = string[]
interface BrandAsset { id: string; path: string; kind: string; headerHex: string; minBytes: number; width?: number; height?: number }
interface BuilderRow { id: string; path: string; value?: unknown; mustExist?: boolean }
interface SourceRow { id: string; path: string; patterns: Strings; absentPatterns: Strings }
interface StepRow { id: string; job: 'release' | 'finalize'; name: string; if?: string; tokens: Strings; absent: Strings; patterns: Strings; absentPatterns: Strings }
interface StepOrderRow { id: string; job: 'release' | 'finalize'; names: Strings; mustBeLast: boolean }
interface DocsRow {
  id: string; path: string; recursive: boolean; anchor: string | null; normalizeEnDash: boolean
  code?: Strings; codePatterns?: Strings; headings?: Strings; table?: Strings; links?: Strings; items?: Strings; text?: Strings; atoms?: Strings
  absent: Strings; absentPatterns: Strings
}
interface NotesRow { id: string; doc: string; heading: string; sentences: number; sentenceSeparator: string; code: Strings; text: Strings; absent: Strings }
interface Screenshots {
  id: string; readmes: Strings; assets: Strings; record: string; commitPattern: string; reproduce: string
  width: number; height: number; minBytes: number; rendererDir: string; cleanTreeTokens: Strings; rerunHint: string
}
interface RenderRow { id: string; builderPath: string; arch: string; ext: string; expected: string }
interface WinCase { id: string; script: 'version' | 'feed' | 'assets'; artifacts?: 'both' | 'zip-only' | 'exe-only' | 'none'; latest?: 'installer-only' | 'with-zip'; omit?: 'none' | 'zip' | 'exe'; status: 'zero' | 'nonzero'; tokens: Strings; absent: Strings }
interface Fixture {
  schemaVersion: number
  brandAssets: BrandAsset[]; builderRows: BuilderRow[]; sources: SourceRow[]; steps: StepRow[]
  stepOrder: StepOrderRow[]; finalizeGates: Strings; docs: DocsRow[]; notesSections: NotesRow[]; screenshots: Screenshots
  iconPolicy: { id: string; requiredPrefix: string; forbiddenPattern: string; electronCandidates: Strings }
  ghApiCompatibility: { id: string; slurp: string; forbidden: Strings }
  packageBans: { id: string; scriptNamesAbsent: Strings; scriptCommandsAbsent: Strings; bannedDependencies: Strings }
  windowsPackaging: {
    render: RenderRow[]
    latestYml: Record<'versionLine' | 'filesLine' | 'setupUrl' | 'portableUrl' | 'shaLine' | 'sizeLine' | 'pathLine' | 'sha512Line', string>
    publishedAssets: Strings
    cases: WinCase[]
  }
}

const readBytes = (path: string): Buffer => readFileSync(path)
const readText = (relative: string): string => readBytes(join(repoRoot, relative)).toString('utf8')
const fixture = JSON.parse(readText('src/main/__fixtures__/release-artifacts-and-brand.json')) as Fixture
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
  ...fixture.brandAssets, ...fixture.builderRows, ...fixture.steps, ...fixture.stepOrder,
  ...fixture.docs, ...fixture.sources, ...fixture.notesSections, ...fixture.windowsPackaging.render,
  ...fixture.windowsPackaging.cases, fixture.iconPolicy.id, fixture.packageBans.id, fixture.screenshots.id
].map((row) => (typeof row === 'string' ? row : row.id))

const stepOf = (row: StepRow): { if?: string; run?: string } | undefined =>
  row.job === 'release' ? packageStep(row.name) : finalizeStep(row.name)
const stepsOf = (job: 'release' | 'finalize'): Array<{ name?: string; run?: string }> => workflow.jobs?.[job]?.steps ?? []
const allRunText = Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? []).map((step) => step.run ?? '').join('\n')
const perfArchiveText = (path: string): string =>
  readdirSync(join(repoRoot, path), { recursive: true }).map((entry) => String(entry))
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => readText(join(path, entry))).join('\n')
const documentAtoms = (doc: ReturnType<typeof parseMarkdown>): string[] => [
  ...doc.headings, ...doc.codeSpans, ...doc.tableCells, ...doc.listItems, ...doc.paragraphs, ...doc.links.flatMap((link) => [link.text, link.target])
]

describe('brand icon assets', () => {
  it.each(fixture.brandAssets)('$id ships at $path with its declared header', (asset) => {
    useRow(asset.id)
    const path = join(repoRoot, asset.path)
    expect(existsSync(path), `${asset.id}: ${asset.path}`).toBe(true)
    expect(statSync(path).size, `${asset.id}: size`).toBeGreaterThan(asset.minBytes)
    const bytes = readBytes(path)
    expect(bytes.subarray(0, asset.headerHex.length / 2).toString('hex'), `${asset.id}: header`).toBe(asset.headerHex)
    if (asset.kind === 'png') {
      expect({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }, `${asset.id}: dimensions`)
        .toEqual({ width: asset.width, height: asset.height })
    }
  })
})

describe('electron-builder packaging surface', () => {
  it.each(fixture.builderRows)('$id pins $path', (row) => {
    useRow(row.id)
    const actual = pick(builder as unknown, row.path)
    if (row.value !== undefined) expect(actual, row.id).toEqual(row.value)
    if (row.mustExist) expect(existsSync(join(repoRoot, String(actual))), row.id).toBe(true)
  })

  it('keeps every icon under build/ and off the Electron default names', () => {
    const policy = fixture.iconPolicy
    useRow(policy.id)
    for (const path of fixture.builderRows.filter((row) => row.mustExist).map((row) => row.path)) {
      const icon = String(pick(builder as unknown, path) ?? '')
      expect(icon, `${path}: prefix`).toMatch(new RegExp(`^${policy.requiredPrefix}`))
      expect(icon, `${path}: default name`).not.toMatch(new RegExp(policy.forbiddenPattern))
    }
    const electronIcns = policy.electronCandidates.map((entry) => join(repoRoot, entry)).find((entry) => existsSync(entry))
    if (electronIcns) {
      const digest = (path: string): string => createHash('sha256').update(readBytes(path)).digest('hex')
      expect(digest(join(repoRoot, fixture.brandAssets.find((asset) => asset.kind === 'icns')?.path ?? '')), 'brand icns vs Electron default').not.toBe(digest(electronIcns))
    }
  })
})

describe('brand wiring in the main process and brand module', () => {
  it.each(fixture.sources)('$id in $path', (row) => {
    useRow(row.id)
    const text = readText(row.path)
    expectPatterns(text, row.patterns, `${row.id} ${row.path}`)
    expectNoPattern(text, row.absentPatterns, `${row.id} ${row.path}`)
  })
})

interface MenuNode { role?: string; label?: string; submenu?: MenuNode[] }

describe('window, dock and about panel share the packaged brand icon', () => {
  const iconPngPath = join(repoRoot, fixture.brandAssets.find((asset) => asset.id === 'png-main')?.path ?? '')

  it('resolves the packaged and development icon to the same shipped PNG', () => {
    const resourcesPath = '/Applications/OpenCompare.app/Contents/Resources'
    expect(resolveBrandIconPath({ isPackaged: true, resourcesPath, appPath: join(resourcesPath, 'app.asar') }))
      .toBe(join(resourcesPath, 'icon.png'))
    const development = resolveBrandIconPath({ isPackaged: false, resourcesPath: '/ignored', appPath: repoRoot })
    expect(development).toBe(iconPngPath)
    expect(existsSync(development)).toBe(true)
  })

  it('resolves platform-independently to one existing file', () => {
    const first = resolveBrandIconPath({ isPackaged: false, resourcesPath: '/a', appPath: repoRoot })
    const second = resolveBrandIconPath({ isPackaged: false, resourcesPath: '/b', appPath: repoRoot })
    expect(first).toBe(second)
    expect(existsSync(first)).toBe(true)
  })

  it('fixes the brand name and reuses the runtime icon path', () => {
    const options = buildAboutPanelOptions({ version: pkg.version ?? '', iconPath: iconPngPath })
    expect(options.applicationName).toBe('OpenCompare')
    expect(options.applicationName).toBe(BRAND_NAME)
    expect(options.iconPath).toBe(iconPngPath)
  })

  it('takes the version from package.json without hard-coding it', () => {
    expect(pkg.version?.trim()).toBeTruthy()
    const options = buildAboutPanelOptions({ version: pkg.version ?? '', iconPath: iconPngPath })
    expect(options.applicationVersion).toBe(pkg.version)
    expect(buildAboutPanelOptions({ version: '9.9.9', iconPath: '/tmp/icon.png' }).applicationVersion).toBe('9.9.9')
  })
})

describe('native About menu entry', () => {
  const macTemplate = createMenuTemplate({ isMac: true }) as unknown as MenuNode[]
  const otherTemplate = createMenuTemplate({ isMac: false }) as unknown as MenuNode[]

  it('puts the about role in the macOS app menu', () => {
    expect(macTemplate[0]?.submenu?.some((item) => item.role === 'about')).toBe(true)
  })

  it('puts the about role in the Windows/Linux Help submenu', () => {
    expect(otherTemplate.find((item) => item.role === 'help')?.submenu?.some((item) => item.role === 'about')).toBe(true)
  })

  it('keeps edit and view menus, plus the window menu on macOS', () => {
    for (const template of [macTemplate, otherTemplate]) {
      expect(template.some((item) => item.role === 'editMenu')).toBe(true)
      expect(template.some((item) => item.role === 'viewMenu')).toBe(true)
    }
    expect(macTemplate.some((item) => item.role === 'windowMenu')).toBe(true)
  })
})

describe('documentation markers', () => {
  it.each(fixture.docs)('$id documents its markers', (row) => {
    useRow(row.id)
    if (row.path.endsWith('.yml')) {
      const text = yamlScalars(parse(readText(row.path))).join('\n')
      expectAbsent(text, row.absent, row.id); expectNoPattern(text, row.absentPatterns, row.id); return
    }
    const raw = row.recursive ? perfArchiveText(row.path) : readText(row.path)
    const scoped = row.anchor ? markdownSection(raw, row.anchor) : raw
    const doc = parseMarkdown(row.normalizeEnDash ? scoped.replaceAll('–', '-') : scoped)
    const groups: Array<[string, Strings | undefined]> = [['code', row.code], ['headings', row.headings], ['table', row.table], ['links', row.links], ['items', row.items], ['text', row.text], ['atoms', row.atoms]]
    const values: Record<string, string[]> = {
      code: doc.codeSpans, headings: doc.headings, table: doc.tableCells,
      links: doc.links.flatMap((link) => [link.text, link.target]), items: doc.listItems, text: doc.paragraphs, atoms: documentAtoms(doc)
    }
    for (const [group, tokens] of groups) for (const token of tokens ?? []) expect(values[group].some((value) => value.includes(token)), `${row.id} ${group}: ${token}`).toBe(true)
    for (const pattern of row.codePatterns ?? []) expect(values.code.some((value) => new RegExp(pattern).test(value)), `${row.id} codePattern: ${pattern}`).toBe(true)
    const present = documentAtoms(doc).join('\n')
    expectAbsent(present, row.absent, row.id); expectNoPattern(present, row.absentPatterns, row.id)
  })
})

describe('readme screenshots and capture provenance', () => {
  it('references both screenshots from both READMEs', () => {
    useRow(fixture.screenshots.id)
    for (const readme of fixture.screenshots.readmes) {
      const targets = new Set(parseMarkdown(readText(readme)).links.map((link) => link.target))
      for (const asset of fixture.screenshots.assets) expect(targets.has(asset), `${readme}: ${asset}`).toBe(true)
    }
  })

  it('ships both screenshots as committed 2560x1584 PNG files', () => {
    const { width, height, minBytes } = fixture.screenshots
    for (const asset of fixture.screenshots.assets) {
      const bytes = readBytes(join(repoRoot, asset))
      expect(bytes.length, `${asset} bytes`).toBeGreaterThan(minBytes)
      expect([...bytes.subarray(0, 4)], `${asset} PNG signature`).toEqual([0x89, 0x50, 0x4e, 0x47])
      expect(bytes.readUInt32BE(16), `${asset} width`).toBe(width)
      expect(bytes.readUInt32BE(20), `${asset} height`).toBe(height)
      const ignored = spawnSync('git', ['check-ignore', '--quiet', '--', asset], { cwd: repoRoot })
      expect(ignored.status, `${asset} must not be gitignored`).toBe(1)
      const tracked = spawnSync('git', ['ls-files', '--error-unmatch', '--', asset], { cwd: repoRoot })
      expect(tracked.status, `${asset} must be tracked`).toBe(0)
    }
  })

  it('records a capture commit the local repository can resolve', () => {
    const record = readText(fixture.screenshots.record)
    const commit = new RegExp(fixture.screenshots.commitPattern).exec(record)?.[1] ?? ''
    expect(commit, 'captured commit shape').toMatch(/^[0-9a-f]{40}$/)
    const lookup = spawnSync('git', ['cat-file', '-e', `${commit}^{commit}`], { cwd: repoRoot })
    expect(lookup.status, `git cat-file ${commit}`).toBe(0)
    expectTokens(record, [fixture.screenshots.reproduce, ...fixture.screenshots.cleanTreeTokens], fixture.screenshots.id)
  })

  it('keeps the whole renderer unchanged since the captured commit', () => {
    useRow(fixture.screenshots.id)
    const { record: recordPath, commitPattern, rendererDir, rerunHint } = fixture.screenshots
    const commit = new RegExp(commitPattern).exec(readText(recordPath))?.[1] ?? ''
    const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], { cwd: repoRoot })
    expect(ancestor.status, `git merge-base --is-ancestor ${commit} HEAD`).toBe(0)
    const range = `${commit}..HEAD`
    const quiet = spawnSync('git', ['diff', '--quiet', range, '--', rendererDir], { cwd: repoRoot })
    if (quiet.status !== 0) {
      const changed = spawnSync('git', ['diff', '--name-only', range, '--', rendererDir], { cwd: repoRoot, encoding: 'utf8' })
      expect.fail(`${rerunHint}\n${rendererDir} changed since the captured commit ${commit}:\n${changed.stdout.trim()}`)
    }
  })
})

describe('bilingual portable-zip notes', () => {
  it.each(fixture.notesSections)('$id announces the portable zip', (row) => {
    useRow(row.id)
    const text = readText(fill(row.doc, { tag: currentTag }))
    const section = parseMarkdown(markdownSection(text, row.heading))
    expect(section.headings.some((heading) => heading.includes(row.heading)), `${row.id}: heading ${row.heading}`).toBe(true)
    for (const token of row.code) expect(section.codeSpans.some((span) => span.includes(token)), `${row.id}: ${token}`).toBe(true)
    for (const token of row.text) expect(section.paragraphs.some((paragraph) => paragraph.includes(token)), `${row.id}: ${token}`).toBe(true)
    const present = section.paragraphs.join('\n')
    expectAbsent(present, row.absent, row.id)
    const sentences = present.split(new RegExp(row.sentenceSeparator)).map((part) => part.trim()).filter(Boolean)
    expect(sentences, row.id).toHaveLength(row.sentences)
  })
})

describe('release workflow step contracts', () => {
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

  it('never hands the macOS Developer ID certificate to the win/linux packaging legs', () => {
    const step = packageStep('Build installers')
    expect(step, 'Build installers: present').toBeDefined()
    for (const name of ['CSC_LINK', 'CSC_KEY_PASSWORD']) {
      expect(step?.env?.[name], name).toContain("matrix.target == 'mac'")
    }
  })

  it('never combines gh api --slurp with --jq or --template', () => {
    const config = fixture.ghApiCompatibility
    const commands = allRunText.replace(/\\\r?\n\s*/g, ' ').split(/\r?\n/)
      .filter((line) => /\bgh api\b/.test(line) && !line.trimStart().startsWith('#'))
    expect(commands.length).toBeGreaterThan(0)
    for (const command of commands.filter((line) => line.includes(config.slurp))) {
      expectAbsent(command, config.forbidden, config.id)
    }
  })
})

describe('single public release gate', () => {
  it.each(fixture.finalizeGates)('%s stays defined in finalize', (name) => {
    expect(finalizeStep(name), name).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Windows artifact surface: names rendered from builder templates; the workflow
// scripts themselves run against tempdir fixtures.
// ---------------------------------------------------------------------------

const renderName = (builderPath: string, ext: string, arch = 'x64'): string =>
  fill(String(pick(builder as unknown, builderPath) ?? ''), {
    productName: String(builder.productName ?? ''), version: currentVersion, arch, ext
  })
const scriptOf = (id: string): string => {
  const row = fixture.steps.find((step) => step.id === id)
  return row ? (stepOf(row)?.run ?? '') : ''
}
const renderRow = (ext: string): RenderRow | undefined => fixture.windowsPackaging.render.find((row) => row.ext === ext)
const setupAsset = renderName(renderRow('exe')?.builderPath ?? '', 'exe')
const portableAsset = renderName(renderRow('zip')?.builderPath ?? '', 'zip')
const versionScript = scriptOf('version-artifacts').replaceAll('${{ matrix.target }}', 'win')
const feedScript = scriptOf('windows-feed')
const assetsScript = scriptOf('platform-assets')

const latestYml = (withZip: boolean): string => {
  const template = fixture.windowsPackaging.latestYml
  const vars = { version: currentVersion, setupAsset, portableAsset }
  const lines = [fill(template.versionLine, vars), template.filesLine, fill(template.setupUrl, vars), template.shaLine, template.sizeLine]
  if (withZip) lines.push(fill(template.portableUrl, vars), template.shaLine, template.sizeLine)
  lines.push(fill(template.pathLine, vars), template.sha512Line)
  return lines.join('\n')
}

const runScript = (script: string, artifacts: string[], metadata?: string): { status: number; output: string } => {
  const dir = mkdtempSync(join(tmpdir(), 'opencompare-win-packaging-'))
  try {
    symlinkSync(join(repoRoot, 'node_modules'), join(dir, 'node_modules'), 'dir')
    const releaseDir = join(dir, 'release')
    mkdirSync(releaseDir, { recursive: true })
    if (metadata !== undefined) writeFileSync(join(releaseDir, 'latest.yml'), metadata)
    for (const artifact of artifacts) writeFileSync(join(releaseDir, artifact), 'fixture')
    const scriptPath = join(dir, 'step.sh')
    writeFileSync(scriptPath, script)
    const result = spawnSync('bash', [scriptPath], { cwd: dir, encoding: 'utf8', env: { ...process.env, RELEASE_TAG: currentTag } })
    return { status: result.status ?? -1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const runAssetGate = (assets: string[]): { status: number; output: string } => {
  const dir = mkdtempSync(join(tmpdir(), 'opencompare-win-assets-'))
  try {
    writeFileSync(join(dir, 'gh'), [
      '#!/usr/bin/env bash',
      'if [[ "$*" == *"/assets"* ]]; then',
      "  printf '%s\\n' \"${FAKE_ASSETS}\"",
      'else',
      "  printf '[{\"id\":123,\"tag_name\":\"%s\"}]\\n' \"${RELEASE_TAG}\"",
      'fi', ''
    ].join('\n'), { mode: 0o755 })
    const scriptPath = join(dir, 'assets-gate.sh')
    writeFileSync(scriptPath, assetsScript)
    const result = spawnSync('bash', [scriptPath], {
      cwd: dir, encoding: 'utf8',
      env: {
        ...process.env, PATH: `${dir}:${process.env.PATH ?? ''}`, RELEASE_TAG: currentTag,
        GITHUB_REPOSITORY: 'chaxiu/OpenCompare', FAKE_ASSETS: JSON.stringify(assets.map((name) => ({ name })))
      }
    })
    return { status: result.status ?? -1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('Windows portable zip release surface', () => {
  it.each(fixture.windowsPackaging.render)('$id renders the versioned asset name', (row) => {
    useRow(row.id)
    const template = String(pick(builder as unknown, row.builderPath) ?? '')
    expect(template, row.id).toMatch(/\$\{version\}/)
    const actual = renderName(row.builderPath, row.ext, row.arch)
    expect(actual, row.id).toBe(fill(row.expected, { version: currentVersion }))
    expect(actual, row.id).not.toMatch(/\s/)
  })

  it('never adds zip tooling to scripts or dependencies', () => {
    const bans = fixture.packageBans
    useRow(bans.id)
    for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
      expectAbsent(name.toLowerCase(), bans.scriptNamesAbsent, bans.id)
      expectAbsent(command, bans.scriptCommandsAbsent, bans.id)
    }
    for (const dependency of bans.bannedDependencies) {
      expect(pkg.dependencies?.[dependency], dependency).toBeUndefined()
      expect(pkg.devDependencies?.[dependency], dependency).toBeUndefined()
    }
  })

  it.each(fixture.windowsPackaging.cases)('$id runs the $script gate', (row) => {
    useRow(row.id)
    const vars = { version: currentVersion, setupAsset, portableAsset }
    let result: { status: number; output: string }
    if (row.script === 'assets') {
      const published = fixture.windowsPackaging.publishedAssets.map((name) => fill(name, vars))
        .filter((name) => {
          if (row.omit !== 'zip' && row.omit !== 'exe') return true
          return row.omit === 'zip' ? name !== portableAsset : name !== setupAsset
        })
      result = runAssetGate(published)
    } else {
      const script = row.script === 'version' ? versionScript : feedScript
      const artifacts = row.artifacts === 'both' ? [setupAsset, portableAsset]
        : row.artifacts === 'zip-only' ? [portableAsset]
          : row.artifacts === 'exe-only' ? [setupAsset] : []
      result = runScript(script, artifacts, latestYml(row.latest === 'with-zip'))
    }
    if (row.status === 'zero') expect(result.status, row.id).toBe(0)
    else expect(result.status, row.id).not.toBe(0)
    expectTokens(result.output, row.tokens.map((token) => fill(token, vars)), row.id)
    expectAbsent(result.output, row.absent.map((token) => fill(token, vars)), row.id)
  })
})

describe('fixture ledger coverage', () => {
  it('keeps every documentation token a structural atom, never a sentence', () => {
    const docs = fixture.docs.flatMap((row) => [row.code, row.headings, row.table, row.links, row.items, row.text, row.atoms, row.absent].flatMap((tokens) => tokens ?? []))
    const notes = fixture.notesSections.flatMap((row) => [...row.code, ...row.text, ...row.absent])
    const sentence = /[，。：；]/
    const longEnglish = (token: string): boolean => token.trim().split(/\s+/).filter(Boolean).length >= 8
    expect([...docs, ...notes].filter((token) => sentence.test(token) || longEnglish(token))).toEqual([])
  })

  it('consumes every fixture row exactly once by id', () => {
    expect(new Set(fixtureRowIds).size, 'duplicate fixture ids').toBe(fixtureRowIds.length)
    expect([...referencedIds].sort(), 'unused fixture rows').toEqual([...fixtureRowIds].sort())
    expect(fixture.schemaVersion, 'schemaVersion').toBe(1)
  })
})
