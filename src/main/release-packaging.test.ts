import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { BRAND_NAME, buildAboutPanelOptions, resolveBrandIconPath } from '../shared/brand'
import { createMenuTemplate } from './menu'

// Release packaging is driven by repository-root config; assert it here so a
// missing field fails `pnpm test` instead of a tag-triggered CI run.
const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
  version?: string
  author?: { name?: string; email?: string }
  license?: string
  homepage?: string
}

// The release documents and workflow defaults are asserted against the version
// declared in package.json, so a future bump only needs to touch package.json.
const currentVersion = pkg.version ?? ''
const currentTag = `v${currentVersion}`

// The never-published version was merged into main but never tagged or
// released, so its notes were folded into the current version. That ghost
// version is assembled at runtime so the negative assertions below can never
// match their own source text.
const ghostTag = ['v0.2', '3'].join('.')
const ghostNotesPath = `docs/release-notes/${ghostTag}.md`
const ghostReleaseLink = `releases/tag/${ghostTag}`
const ghostEvidencePath = `docs/release-evidence/${ghostTag}.md`

// The former pending-status word is assembled at runtime so the negative
// assertions below can never match their own source text.
const pendingWord = ['待', '发布'].join('')

// Published tags a document may still link to; the current tag shipped as
// v0.2.4, so it belongs to this set as well, everything else would be a dead
// release link.
const publishedTags = ['v0.2.0', 'v0.2.1', 'v0.2.2', currentTag]
const releaseTagLink = /releases\/tag\/(v\d+\.\d+\.\d+)/g

const documentPaths = (): string[] => {
  const docsRoot = join(repoRoot, 'docs')
  const docs = readdirSync(docsRoot, { recursive: true })
    .map((entry) => String(entry))
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => join(docsRoot, entry))
  return [join(repoRoot, 'README.md'), join(repoRoot, 'CHANGELOG.md'), ...docs]
}

const builder = parse(readFileSync(join(repoRoot, 'electron-builder.yml'), 'utf8')) as {
  appId?: string
  productName?: string
  protocols?: Array<{ name?: string; schemes?: string[] }>
  extraResources?: Array<{ from?: string; to?: string }>
  mac?: {
    icon?: string
    identity?: string
    hardenedRuntime?: boolean
    entitlements?: string
    entitlementsInherit?: string
    notarize?: boolean
    target?: string[]
  }
  win?: { icon?: string; target?: string[] }
  nsis?: { artifactName?: string }
  linux?: {
    icon?: string
    maintainer?: string
    target?: string[]
    desktop?: { entry?: { MimeType?: string } }
  }
  publish?: { provider?: string; releaseType?: string }
}

const builderConfig = readFileSync(join(repoRoot, 'electron-builder.yml'), 'utf8')

const entitlementsPath = builder.mac?.entitlements ?? ''
const macEntitlements = entitlementsPath
  ? readFileSync(join(repoRoot, entitlementsPath), 'utf8')
  : ''

const releaseWorkflow = readFileSync(join(repoRoot, '.github/workflows/release.yml'), 'utf8')

interface WorkflowStep {
  name?: string
  if?: string
  run?: string
  uses?: string
  with?: Record<string, string>
}

const workflow = parse(releaseWorkflow) as {
  jobs?: Record<string, { steps?: WorkflowStep[] }>
}
const gatesSteps: WorkflowStep[] = workflow.jobs?.gates?.steps ?? []
const gateStep = (name: string): WorkflowStep | undefined =>
  gatesSteps.find((step) => step.name === name)

const packageSteps: WorkflowStep[] = workflow.jobs?.release?.steps ?? []
const packageStep = (name: string): WorkflowStep | undefined =>
  packageSteps.find((step) => step.name === name)

const finalizeSteps: WorkflowStep[] = workflow.jobs?.finalize?.steps ?? []
const finalizeStep = (name: string): WorkflowStep | undefined =>
  finalizeSteps.find((step) => step.name === name)

// The ancestry gate is inlined in the workflow on purpose: workflow_dispatch
// runs the workflow from main, while gates check out refs/tags/<tag>, so a
// repository script would be missing on an older tag. The tests below run this
// exact `run` body in temporary git repositories.
const ancestryGateScript = gateStep('Preflight v0.1.2 ancestry')?.run ?? ''

const signingDoc = readFileSync(join(repoRoot, 'docs/release-signing.md'), 'utf8')

const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8')

const changelog = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8')

const releaseNotesPath = join(repoRoot, `docs/release-notes/${currentTag}.md`)
const releaseNotes = existsSync(releaseNotesPath) ? readFileSync(releaseNotesPath, 'utf8') : ''

const previousReleaseNotesPath = join(repoRoot, 'docs/release-notes/v0.2.0.md')
const previousReleaseNotes = existsSync(previousReleaseNotesPath)
  ? readFileSync(previousReleaseNotesPath, 'utf8')
  : ''

// The last publicly released notes stay on v0.2.2 while the current version is
// still pending; the current notes carry the dangling-link tolerance.
const lastReleasedNotesPath = join(repoRoot, 'docs/release-notes/v0.2.2.md')
const lastReleasedNotes = existsSync(lastReleasedNotesPath)
  ? readFileSync(lastReleasedNotesPath, 'utf8')
  : ''

const firstHeading = (markdown: string): string =>
  markdown.split(/\r?\n/).find((line) => line.startsWith('# ')) ?? ''

// The v0.1.2 drift record is asserted from committed documentation only. The
// ancestry fixture tests below build their own temporary repositories instead
// of reading this checkout's `.git` or a real tag, so a clean clone or a source
// tarball behaves exactly like local development.

const driftFacts = [
  /7ea2cc6/,
  /c4a6a95/,
  /annotated/,
  /祖先/,
  /13 个提交/,
  /公开/,
  /非预发布/,
  /11 个资产/
]

// App Store Connect API key mode: certificate + team id + .p8 key trio.
const signingSecrets = [
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'APPLE_TEAM_ID',
  'APPLE_API_KEY',
  'APPLE_API_KEY_ID',
  'APPLE_API_ISSUER'
]

describe('release package metadata', () => {
  it('declares an author with a non-empty email (required by Linux .deb)', () => {
    expect(typeof pkg.author).toBe('object')
    expect(pkg.author?.email?.trim()).toBeTruthy()
  })

  it('declares the repository license and homepage', () => {
    expect(pkg.license).toBe('MIT')
    expect(pkg.homepage).toBe('https://github.com/chaxiu/OpenCompare')
  })
})

describe('linux packaging targets', () => {
  it('sets an explicit deb maintainer containing an email', () => {
    const maintainer = builder.linux?.maintainer ?? ''
    expect(maintainer.trim()).toBeTruthy()
    expect(maintainer).toContain('@')
  })

  it('keeps both AppImage and deb targets', () => {
    expect(builder.linux?.target).toContain('AppImage')
    expect(builder.linux?.target).toContain('deb')
  })
})

describe('github release publishing', () => {
  it('publishes a real (non-draft) release', () => {
    expect(builder.publish?.provider).toBe('github')
    expect(builder.publish?.releaseType).toBe('release')
  })

  it('keeps the tag-triggered gates-first cross-platform workflow', () => {
    expect(releaseWorkflow).toMatch(/tags:\s*\n\s*-\s*'v\*'/)
    expect(releaseWorkflow).toMatch(/name: Quality gates/)
    expect(releaseWorkflow).toMatch(/needs: gates/)
    expect(releaseWorkflow).toMatch(/target: mac/)
    expect(releaseWorkflow).toMatch(/target: win/)
    expect(releaseWorkflow).toMatch(/target: linux/)
  })

  it('pre-creates a single draft release before the matrix packages', () => {
    // One release per tag: create it once in `gates`, targeting the repo
    // explicitly so no checkout / git context is required.
    expect(releaseWorkflow).toMatch(/GH_REPO: \$\{\{ github\.repository \}\}/)
    expect(releaseWorkflow).toMatch(
      /gh release create\s+"\$\{RELEASE_TAG\}"[\s\S]*?--repo\s+"\$\{GITHUB_REPOSITORY\}"[\s\S]*?--draft[\s\S]*?--generate-notes/
    )
    // Duplicates left behind by an earlier race are pruned, keeping one.
    expect(releaseWorkflow).toMatch(/gh api --method DELETE/)
  })

  it('packages locally without letting the matrix create releases', () => {
    expect(releaseWorkflow).toMatch(/electron-builder --\$\{\{ matrix\.target \}\} --publish never/)
    expect(releaseWorkflow).not.toMatch(/--publish always/)
  })

  it('uploads each platform artifacts into the single release with --clobber', () => {
    expect(releaseWorkflow).toMatch(
      /gh release upload\s+"\$\{RELEASE_TAG\}"[\s\S]*?--clobber[\s\S]*?--repo\s+"\$\{GITHUB_REPOSITORY\}"/
    )
  })

  it('promotes the tag release to public with an explicit --repo', () => {
    expect(releaseWorkflow).toMatch(
      /gh release edit\s+"\$\{RELEASE_TAG\}"\s+--repo\s+"\$\{GITHUB_REPOSITORY\}"\s+--draft=false\s+--latest/
    )
  })
})

describe('update metadata consistency', () => {
  it('pins a space-free nsis artifact name that matches the latest.yml url template', () => {
    const artifactName = builder.nsis?.artifactName ?? ''
    expect(artifactName).toBe('${productName}-Setup-${version}.${ext}')
    expect(artifactName).not.toContain(' ')
    expect(builder.productName).toBe('OpenCompare')
    const rendered = artifactName
      .replace('${productName}', builder.productName ?? '')
      .replace('${version}', currentVersion)
      .replace('${ext}', 'exe')
    // The on-disk installer name is exactly what latest.yml writes as files[].url.
    expect(rendered).toBe(`OpenCompare-Setup-${currentVersion}.exe`)
    expect(rendered).toMatch(/^[\w.-]+-Setup-\d+\.\d+\.\d+\.exe$/)
    expect(rendered).not.toMatch(/\s/)
    // No divergence with the dotted default (`OpenCompare.Setup.<ver>.exe`).
    expect(rendered).not.toBe(`OpenCompare.Setup.${currentVersion}.exe`)
  })

  const metadataGateScript = finalizeStep('Assert latest*.yml urls match the release assets')?.run ?? ''

  it('gates latest*.yml urls against the release asset names before the latest-release gate', () => {
    const assetGate = releaseWorkflow.indexOf(
      'name: Assert the public release has every platform asset'
    )
    const urlGate = releaseWorkflow.indexOf(
      'name: Assert latest*.yml urls match the release assets'
    )
    const latestGate = releaseWorkflow.indexOf('name: Assert the tag is the latest published release')
    expect(assetGate).toBeGreaterThan(-1)
    expect(urlGate).toBeGreaterThan(assetGate)
    expect(latestGate).toBeGreaterThan(urlGate)

    expect(metadataGateScript).toContain('files[].url')
    // Asset name set comes from the published release, not from the build.
    expect(metadataGateScript).toContain('--json assets')
    expect(metadataGateScript).toContain('.assets[].name')
    expect(metadataGateScript).toContain('latest*.yml')
    expect(metadataGateScript).toContain('exit 1')
    // The finalize job has no checkout, so no repository modules / yaml package.
    expect(metadataGateScript).not.toMatch(/require\(\s*["']yaml["']\s*\)/)
  })

  it('keeps the latest*.yml url gate read-only', () => {
    expect(metadataGateScript).not.toMatch(/gh release (upload|edit|create|delete)/)
    expect(metadataGateScript).not.toMatch(/--method\s+(POST|PATCH|PUT|DELETE)/)
  })

  const appImageGateStep = packageStep('Assert the AppImage embeds its declared blockmap')
  const appImageGateScript = appImageGateStep?.run ?? ''

  it('verifies the embedded AppImage blockmap inside the linux packaging job', () => {
    expect(appImageGateStep).toBeDefined()
    expect(appImageGateStep?.if).toBe("matrix.target == 'linux'")
    expect(appImageGateScript).toContain('release/*.AppImage')
    expect(appImageGateScript).toContain('latest-linux.yml')
    expect(appImageGateScript).toContain('blockMapSize')
    expect(appImageGateScript).toMatch(/readUInt32LE/)
    expect(appImageGateScript).toContain('exit 1')
    // No separate *.AppImage.blockmap artifact is required or expected.
    expect(appImageGateScript).not.toContain('AppImage.blockmap')
  })

  // Tempdir fixtures are the only place this suite writes AppImage bytes.
  const runAppImageGate = (declared: number, actual: number): { status: number; output: string } => {
    const dir = mkdtempSync(join(tmpdir(), 'opencompare-appimage-'))
    try {
      const releaseDir = join(dir, 'release')
      mkdirSync(releaseDir, { recursive: true })
      const image = join(releaseDir, 'OpenCompare-0.2.4.AppImage')
      const bytes = Buffer.alloc(16)
      bytes.writeUInt32LE(actual, bytes.length - 4)
      writeFileSync(image, bytes)
      writeFileSync(
        join(releaseDir, 'latest-linux.yml'),
        [
          'version: 0.2.4',
          'files:',
          '  - url: OpenCompare-0.2.4.AppImage',
          '    sha512: fixture',
          '    size: 16',
          `    blockMapSize: ${declared}`,
          '  - url: opencompare_0.2.4_amd64.deb',
          '    sha512: fixture',
          '    size: 16',
          'path: OpenCompare-0.2.4.AppImage',
          'sha512: fixture'
        ].join('\n')
      )
      const script = join(dir, 'appimage-gate.sh')
      writeFileSync(script, appImageGateScript)
      const result = spawnSync('bash', [script], { cwd: dir, encoding: 'utf8' })
      return {
        status: result.status ?? -1,
        output: `${result.stdout ?? ''}${result.stderr ?? ''}`
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  it('passes when the AppImage trailer matches blockMapSize', () => {
    const { status, output } = runAppImageGate(126886, 126886)
    expect(output).toContain('embedded blockMapSize=126886')
    expect(status).toBe(0)
  })

  it('fails closed when the AppImage trailer disagrees with blockMapSize', () => {
    const { status, output } = runAppImageGate(126886, 999)
    expect(output).toContain('::error::')
    expect(output).toContain('blockMapSize 999')
    expect(output).toContain('declares 126886')
    expect(status).not.toBe(0)
  })
})

describe('macOS signing and notarization', () => {
  it('enables the hardened runtime with the shipped entitlements files', () => {
    expect(builder.mac?.hardenedRuntime).toBe(true)
    expect(builder.mac?.entitlements).toBe('build/entitlements.mac.plist')
    expect(builder.mac?.entitlementsInherit).toBe('build/entitlements.mac.plist')
  })

  it('declares the entitlements Electron needs to launch after signing', () => {
    for (const key of [
      'com.apple.security.cs.allow-jit',
      'com.apple.security.cs.allow-unsigned-executable-memory',
      'com.apple.security.cs.disable-library-validation'
    ]) {
      expect(macEntitlements).toContain(key)
    }
  })

  it('enables notarization of the Developer ID bundle', () => {
    expect(builder.mac?.notarize).toBe(true)
  })

  it('pins the Developer ID identity and keeps the OpenCompare appId', () => {
    expect(builder.mac?.identity).toBe('Tao Zhu (3X4J53U6RY)')
    expect(builder.appId).toBe('com.opencompare.app')
  })

  it('keeps the macOS dmg and zip targets', () => {
    expect(builder.mac?.target).toContain('dmg')
    expect(builder.mac?.target).toContain('zip')
  })

  it('keeps certificate material out of the repository config', () => {
    expect(builderConfig).not.toMatch(/BEGIN (RSA |EC )?PRIVATE KEY/)
    expect(releaseWorkflow).not.toMatch(/BEGIN (RSA |EC )?PRIVATE KEY/)
  })
})

describe('release signing secrets wiring', () => {
  it('wires every signing/notarization secret into the mac matrix build', () => {
    for (const secret of signingSecrets) {
      expect(releaseWorkflow).toMatch(
        new RegExp(`${secret}:\\s*\\$\\{\\{ secrets\\.${secret} \\}\\}`)
      )
    }
    // The packaging step receives the decoded .p8 path, not the base64 secret.
    expect(releaseWorkflow).toMatch(
      /APPLE_API_KEY:\s*\$\{\{\s*steps\.api-key\.outputs\.key-path\s*\}\}/
    )
  })

  it('wires only the six mac signing secrets plus the workflow token', () => {
    const secretRefs = [...releaseWorkflow.matchAll(/secrets\.([A-Z0-9_]+)/g)].map(
      (match) => match[1]
    )
    expect(new Set(secretRefs)).toEqual(new Set([...signingSecrets, 'GITHUB_TOKEN']))
  })

  it('fails closed when the mac credentials are missing', () => {
    expect(releaseWorkflow).toMatch(/Require macOS signing and notarization credentials/)
    expect(releaseWorkflow).toMatch(/matrix\.target == 'mac'/)
    expect(releaseWorkflow).toMatch(/Missing macOS signing\/notarization secrets/)
    expect(releaseWorkflow).toMatch(
      /for name in CSC_LINK CSC_KEY_PASSWORD APPLE_TEAM_ID APPLE_API_KEY APPLE_API_KEY_ID APPLE_API_ISSUER; do/
    )
    expect(releaseWorkflow).toMatch(/exit 1/)
  })

  it('decodes the API key to a 0600 file outside the checkout without logging it', () => {
    expect(releaseWorkflow).toMatch(/base64 --decode/)
    expect(releaseWorkflow).toMatch(/\$\{RUNNER_TEMP\}\/opencompare-appstoreconnect\.p8/)
    expect(releaseWorkflow).toMatch(/chmod 600/)
    expect(releaseWorkflow).toMatch(/key-path=\$\{key_path\}/)
    expect(releaseWorkflow).toMatch(/Remove the temporary App Store Connect API key/)
    expect(releaseWorkflow).not.toMatch(/echo[^\n]*\$\{APPLE_API_KEY\}/)
  })

  it('no longer reads the legacy Apple ID credentials', () => {
    expect(releaseWorkflow).not.toMatch(/\bAPPLE_ID\b/)
    expect(releaseWorkflow).not.toMatch(/APPLE_APP_SPECIFIC_PASSWORD/)
  })
})

describe('release version gate', () => {
  it('derives the release tag from package.json and cross-checks the release documents', () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(currentTag).toBe(`v${pkg.version}`)
    // Every version-bearing document and workflow default is keyed off this tag.
    expect(changelog).toContain(`## ${currentTag}`)
    expect(existsSync(releaseNotesPath)).toBe(true)
    expect(firstHeading(releaseNotes)).toContain(currentTag)
    expect(readme).toContain(`当前发布状态：${currentTag} 已发布`)
    expect(readme).toContain(`https://github.com/chaxiu/OpenCompare/releases/tag/${currentTag}`)
    expect(releaseWorkflow).toContain(`default: '${currentTag}'`)
  })

  it('asserts package.json version matches the tag before packaging', () => {
    expect(releaseWorkflow).toMatch(/Assert the tag matches package\.json version/)
    expect(releaseWorkflow).toMatch(/\$\{RELEASE_TAG#v\}/)
  })

  it('rejects a non-semver package version before comparing it to the tag', () => {
    const semverGuard = releaseWorkflow.indexOf('^[0-9]+\\.[0-9]+\\.[0-9]+$')
    const comparison = releaseWorkflow.indexOf('if [ "${version}" != "${tag}" ]; then')
    expect(semverGuard).toBeGreaterThan(-1)
    expect(comparison).toBeGreaterThan(-1)
    expect(semverGuard).toBeLessThan(comparison)
    expect(releaseWorkflow).toMatch(/is not a valid semver/)
  })

  it('fetches the full history in the gates checkout so tags are visible', () => {
    expect(releaseWorkflow).toMatch(
      /name: Quality gates[\s\S]*?uses: actions\/checkout@v4\s*\n\s*with:\s*\n\s*fetch-depth: 0/
    )
  })

  it('runs the read-only version and v0.1.2 ancestry gates before the tests', () => {
    const version = releaseWorkflow.indexOf('name: Preflight package version')
    const ancestry = releaseWorkflow.indexOf('name: Preflight v0.1.2 ancestry')
    const install = releaseWorkflow.indexOf('- run: pnpm install --frozen-lockfile')
    const tests = releaseWorkflow.indexOf('- run: pnpm test')
    expect(version).toBeGreaterThan(-1)
    expect(ancestry).toBeGreaterThan(version)
    expect(install).toBeGreaterThan(ancestry)
    expect(tests).toBeGreaterThan(install)
    expect(ancestryGateScript).toMatch(/git rev-list --count "\$\{tag\}\.\.HEAD"/)
    expect(ancestryGateScript).toMatch(/git rev-list --count "HEAD\.\.\$\{tag\}"/)
    expect(ancestryGateScript).toMatch(/::error::/)
    expect(ancestryGateScript).toMatch(/exit 1/)
  })

  it('asserts the packaged latest*.yml version matches the tag', () => {
    expect(releaseWorkflow).toMatch(/Assert packaged version matches the tag/)
    expect(releaseWorkflow).toMatch(/latest\*\.yml/)
  })

  it('keeps the latest*.yml gate glob and its empty-directory guard', () => {
    expect(releaseWorkflow).toMatch(/files=\(release\/latest\*\.yml\)/)
    expect(releaseWorkflow).toMatch(/No latest\*\.yml update metadata found/)
    expect(releaseWorkflow).toMatch(/does not match tag/)
  })

  it('keeps the tag-triggered gates-first publish model intact', () => {
    const gates = releaseWorkflow.indexOf('name: Quality gates')
    const matrix = releaseWorkflow.indexOf('name: Package ${{ matrix.target }}')
    const finalize = releaseWorkflow.indexOf('name: Publish the GitHub Release')
    expect(releaseWorkflow).toMatch(/tags:\s*\n\s*-\s*'v\*'/)
    expect(gates).toBeGreaterThan(-1)
    expect(matrix).toBeGreaterThan(gates)
    expect(finalize).toBeGreaterThan(matrix)
    expect(releaseWorkflow).toMatch(/needs: gates/)
    expect(releaseWorkflow).toMatch(/needs: release/)
    expect(releaseWorkflow).toMatch(/--publish never/)
    expect(releaseWorkflow).toMatch(/--draft=false --latest/)
  })

  it('enforces exactly one public release per tag', () => {
    expect(releaseWorkflow).toMatch(/Verify the tag has exactly one public release/)
  })

  it('never reads the repository-root git metadata or a real tag', () => {
    const testSource = readFileSync(fileURLToPath(import.meta.url), 'utf8')
    // Built at runtime so these assertions do not match their own source text.
    for (const forbidden of [
      ['cwd', ': ', 'repoRoot'].join(''),
      ['git', 'Metadata', 'Skip', 'Reason'].join(''),
      ['drift', 'Tag'].join('')
    ]) {
      expect(testSource).not.toContain(forbidden)
    }
    // Every git process runs in a tmpdir fixture with isolated config.
    expect(testSource).toContain("GIT_CONFIG_GLOBAL = '/dev/null'")
    expect(testSource).toContain("GIT_CONFIG_NOSYSTEM = '1'")
  })

  it('never spawns gh or a mutating command in the repository root', () => {
    const testSource = readFileSync(fileURLToPath(import.meta.url), 'utf8')
    expect(testSource).toMatch(/import \{ execFileSync, spawnSync \} from 'node:child_process'/)
    expect(testSource).not.toMatch(/execFileSync\(\s*'gh'/)
    expect(testSource).not.toMatch(/spawnSync\(\s*'gh'/)
    // Mutating git calls only exist inside the tmpdir fixture helper.
    expect(testSource).toContain(
      'const fixtureGit = (repo: FixtureRepo, args: string[]): string =>'
    )
  })
})

// ---------------------------------------------------------------------------
// v0.1.2 ancestry gate (strict ancestor OR per-commit patch equivalence) and
// the workflow_dispatch re-run entry that must not move the tag.
// ---------------------------------------------------------------------------

type AncestryScenario =
  | 'strict-ancestor'
  | 'patch-equivalent'
  | 'divergent'
  | 'deletes-protected-path'

interface FixtureRepo {
  dir: string
  home: string
  env: NodeJS.ProcessEnv
}

// Every fixture owns a temp repository and a temp HOME. Inherited GIT_*
// variables (GIT_DIR, GIT_WORK_TREE, alternates, ...) are dropped, global and
// system config are disabled, and the identity is explicit, so a hostile
// ~/.gitconfig cannot leak into the suite.
const createFixtureRepo = (): FixtureRepo => {
  const dir = mkdtempSync(join(tmpdir(), 'opencompare-ancestry-'))
  const home = mkdtempSync(join(tmpdir(), 'opencompare-ancestry-home-'))
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined || key.toUpperCase().startsWith('GIT_')) continue
    env[key] = value
  }
  env.HOME = home
  env.GIT_CONFIG_GLOBAL = '/dev/null'
  env.GIT_CONFIG_SYSTEM = '/dev/null'
  env.GIT_CONFIG_NOSYSTEM = '1'
  env.GIT_AUTHOR_NAME = 'OpenCompare Test'
  env.GIT_AUTHOR_EMAIL = 'test@opencompare.invalid'
  env.GIT_COMMITTER_NAME = 'OpenCompare Test'
  env.GIT_COMMITTER_EMAIL = 'test@opencompare.invalid'
  return { dir, home, env }
}

const disposeFixtureRepo = (repo: FixtureRepo): void => {
  rmSync(repo.dir, { recursive: true, force: true })
  rmSync(repo.home, { recursive: true, force: true })
}

// Tempdir fixtures are the only place this suite writes git state.
const fixtureGit = (repo: FixtureRepo, args: string[]): string =>
  execFileSync('git', args, {
    cwd: repo.dir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: repo.env
  }).trim()

const writeFixtureFile = (dir: string, name: string, content: string): void => {
  writeFileSync(join(dir, name), content)
}

const initFixtureRepo = (repo: FixtureRepo): void => {
  fixtureGit(repo, ['init', '-b', 'main'])
  writeFixtureFile(repo.dir, 'package.json', '{"version":"9.9.9"}\n')
  writeFixtureFile(repo.dir, 'README.md', 'base\n')
  writeFixtureFile(repo.dir, 'electron-builder.yml', 'appId: com.opencompare.fixture\n')
  fixtureGit(repo, ['add', '-A'])
  fixtureGit(repo, ['commit', '-m', 'base'])
}

const tagFixtureHead = (repo: FixtureRepo, tagKind: 'annotated' | 'lightweight'): void => {
  fixtureGit(
    repo,
    tagKind === 'annotated'
      ? ['tag', '-a', 'v0.1.2', '-m', 'v0.1.2', 'HEAD']
      : ['tag', 'v0.1.2', 'HEAD']
  )
}

const createAncestryFixture = (
  scenario: AncestryScenario,
  tagKind: 'annotated' | 'lightweight' = 'annotated'
): { repo: FixtureRepo; tagSha: string } => {
  const repo = createFixtureRepo()
  initFixtureRepo(repo)
  if (scenario === 'strict-ancestor') {
    const tagSha = fixtureGit(repo, ['rev-parse', 'HEAD'])
    tagFixtureHead(repo, tagKind)
    writeFixtureFile(repo.dir, 'README.md', 'post tag\n')
    fixtureGit(repo, ['add', '-A'])
    fixtureGit(repo, ['commit', '-m', 'head change'])
    return { repo, tagSha }
  }
  fixtureGit(repo, ['checkout', '-b', 'tag-side'])
  if (scenario === 'deletes-protected-path') {
    rmSync(join(repo.dir, 'electron-builder.yml'))
  } else {
    writeFixtureFile(repo.dir, 'README.md', scenario === 'divergent' ? 'tag side\n' : 'fix\n')
  }
  fixtureGit(repo, ['add', '-A'])
  fixtureGit(repo, ['commit', '-m', 'tag-only change'])
  const tagSha = fixtureGit(repo, ['rev-parse', 'HEAD'])
  tagFixtureHead(repo, tagKind)
  fixtureGit(repo, ['checkout', 'main'])
  if (scenario === 'deletes-protected-path') {
    rmSync(join(repo.dir, 'electron-builder.yml'))
  } else {
    writeFixtureFile(repo.dir, 'README.md', scenario === 'divergent' ? 'main side\n' : 'fix\n')
  }
  fixtureGit(repo, ['add', '-A'])
  fixtureGit(repo, ['commit', '-m', 'head change'])
  return { repo, tagSha }
}

const runAncestryGate = (repo: FixtureRepo): { status: number; output: string } => {
  const scriptPath = join(repo.dir, 'ancestry-gate.sh')
  writeFileSync(scriptPath, ancestryGateScript)
  const result = spawnSync('bash', [scriptPath], {
    cwd: repo.dir,
    encoding: 'utf8',
    env: repo.env
  })
  return {
    status: result.status ?? -1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`
  }
}

const withFixtureRepo = (run: (repo: FixtureRepo) => void): void => {
  const repo = createFixtureRepo()
  try {
    run(repo)
  } finally {
    disposeFixtureRepo(repo)
  }
}

const withAncestryFixture = (
  scenario: AncestryScenario,
  run: (fixture: { repo: FixtureRepo; tagSha: string }) => void
): void => {
  const fixture = createAncestryFixture(scenario)
  try {
    run(fixture)
  } finally {
    disposeFixtureRepo(fixture.repo)
  }
}

describe('v0.1.2 ancestry gate', () => {
  it('inlines the gate script with ref-type, per-commit and fail-closed logging', () => {
    expect(ancestryGateScript).toContain("tag='v0.1.2'")
    expect(ancestryGateScript).toContain('git cat-file -t')
    expect(ancestryGateScript).toContain('git cherry HEAD')
    expect(ancestryGateScript).toContain('ref type=')
    expect(ancestryGateScript).toContain('cherry=${decision}')
    expect(ancestryGateScript).toContain('git diff-tree')
    expect(ancestryGateScript).toMatch(/exit 1/)
    expect(ancestryGateScript).not.toMatch(/\|\|\s*true/)
  })

  it('passes when the tag is a strict ancestor with a non-zero lead', () => {
    withAncestryFixture('strict-ancestor', ({ repo, tagSha }) => {
      const { status, output } = runAncestryGate(repo)
      expect(output).toContain(`ref type=tag (annotated) commit=${tagSha}`)
      expect(output).toContain('v0.1.2..HEAD commits=1 HEAD..v0.1.2 commits=0')
      expect(output).toContain('is a strict ancestor of HEAD; ancestry check passed.')
      expect(status).toBe(0)
    })
  })

  it('passes when a tag-only commit is patch-equivalent and logs its SHA with -', () => {
    withAncestryFixture('patch-equivalent', ({ repo, tagSha }) => {
      const { status, output } = runAncestryGate(repo)
      expect(output).toContain(`ref type=tag (annotated) commit=${tagSha}`)
      expect(output).toContain(`v0.1.2-only commit ${tagSha} cherry=-`)
      expect(output).toContain('ancestry check passed')
      expect(status).toBe(0)
    })
  })

  it('logs every tag-only commit in a chain with its own decision', () => {
    withFixtureRepo((repo) => {
      initFixtureRepo(repo)
      fixtureGit(repo, ['checkout', '-b', 'tag-side'])
      writeFixtureFile(repo.dir, 'README.md', 'fix one\n')
      fixtureGit(repo, ['add', '-A'])
      fixtureGit(repo, ['commit', '-m', 'tag-only one'])
      const firstSha = fixtureGit(repo, ['rev-parse', 'HEAD'])
      writeFixtureFile(repo.dir, 'README.md', 'fix two\n')
      fixtureGit(repo, ['add', '-A'])
      fixtureGit(repo, ['commit', '-m', 'tag-only two'])
      const secondSha = fixtureGit(repo, ['rev-parse', 'HEAD'])
      tagFixtureHead(repo, 'annotated')
      fixtureGit(repo, ['checkout', 'main'])
      writeFixtureFile(repo.dir, 'README.md', 'fix one\n')
      fixtureGit(repo, ['add', '-A'])
      fixtureGit(repo, ['commit', '-m', 'head one'])
      writeFixtureFile(repo.dir, 'README.md', 'fix two\n')
      fixtureGit(repo, ['add', '-A'])
      fixtureGit(repo, ['commit', '-m', 'head two'])

      const { status, output } = runAncestryGate(repo)
      expect(output).toContain(`v0.1.2-only commit ${firstSha} cherry=-`)
      expect(output).toContain(`v0.1.2-only commit ${secondSha} cherry=-`)
      expect(status).toBe(0)
    })
  })

  it('logs a lightweight tag as a commit ref with its resolved commit SHA', () => {
    const fixture = createAncestryFixture('patch-equivalent', 'lightweight')
    try {
      const { status, output } = runAncestryGate(fixture.repo)
      expect(output).toContain(`ref type=commit (lightweight) commit=${fixture.tagSha}`)
      expect(status).toBe(0)
    } finally {
      disposeFixtureRepo(fixture.repo)
    }
  })

  it('rejects a tag-only commit whose patch is not present in HEAD', () => {
    withAncestryFixture('divergent', ({ repo, tagSha }) => {
      const { status, output } = runAncestryGate(repo)
      expect(output).toContain(`v0.1.2-only commit ${tagSha} cherry=+`)
      expect(output).toContain('::error::')
      expect(output).toContain('not present in HEAD')
      expect(status).not.toBe(0)
    })
  })

  it('rejects a patch-equivalent tag-only commit that deletes a protected path', () => {
    withAncestryFixture('deletes-protected-path', ({ repo, tagSha }) => {
      const { status, output } = runAncestryGate(repo)
      expect(output).toContain(`v0.1.2-only commit ${tagSha} cherry=-`)
      expect(output).toContain('deletes the release-critical path electron-builder.yml')
      expect(status).not.toBe(0)
    })
  })

  it('fails closed when the tag cannot be resolved', () => {
    withFixtureRepo((repo) => {
      initFixtureRepo(repo)
      const { status, output } = runAncestryGate(repo)
      expect(output).toContain('::error::')
      expect(output).toContain('not visible')
      expect(status).not.toBe(0)
    })
  })

  it('keeps the non-zero lead requirement', () => {
    withFixtureRepo((repo) => {
      initFixtureRepo(repo)
      tagFixtureHead(repo, 'lightweight')
      const { status, output } = runAncestryGate(repo)
      expect(output).toContain('no commits after v0.1.2')
      expect(status).not.toBe(0)
    })
  })

  it('has no escape hatch on the gates path', () => {
    const gatesBlock = releaseWorkflow.slice(
      releaseWorkflow.indexOf('name: Quality gates'),
      releaseWorkflow.indexOf('name: Package ${{ matrix.target }}')
    )
    expect(gatesBlock).not.toContain('continue-on-error')
    expect(gatesBlock).not.toContain('|| true')
  })
})

describe('manual re-run dispatch entry', () => {
  const dispatchBlock = ((): string => {
    const start = releaseWorkflow.indexOf('workflow_dispatch:')
    const end = releaseWorkflow.indexOf('permissions:')
    return start === -1 ? '' : releaseWorkflow.slice(start, end === -1 ? undefined : end)
  })()

  it('declares workflow_dispatch with a tag input defaulting to the current tag', () => {
    expect(dispatchBlock).not.toBe('')
    expect(dispatchBlock).toMatch(/inputs:\s*\n\s+tag:\s*\n/)
    expect(dispatchBlock).toMatch(/required:\s*true/)
    expect(dispatchBlock).toContain(`default: '${currentTag}'`)
  })

  it('resolves one RELEASE_TAG and checks out refs/tags/<tag> in both jobs', () => {
    expect(releaseWorkflow).toMatch(
      /RELEASE_TAG:\s*\$\{\{\s*inputs\.tag\s*\|\|\s*github\.ref_name\s*\}\}/
    )
    const tagCheckouts = [
      ...releaseWorkflow.matchAll(/ref:\s*refs\/tags\/\$\{\{\s*env\.RELEASE_TAG\s*\}\}/g)
    ]
    expect(tagCheckouts.length).toBe(2)
    expect(releaseWorkflow).not.toMatch(/GITHUB_REF_NAME/)
  })

  it('validates the tag format and its existence before install', () => {
    const validate = gateStep('Validate the release tag')?.run ?? ''
    const exists = gateStep('Assert the release tag exists in the checkout')?.run ?? ''
    expect(validate).toContain('^v[0-9]+\\.[0-9]+\\.[0-9]+$')
    expect(validate).toMatch(/exit 1/)
    expect(exists).toContain('refs/tags/${RELEASE_TAG}')
    expect(exists).toMatch(/exit 1/)
    const install = releaseWorkflow.indexOf('- run: pnpm install --frozen-lockfile')
    expect(releaseWorkflow.indexOf('name: Validate the release tag')).toBeLessThan(install)
    expect(
      releaseWorkflow.indexOf('name: Assert the release tag exists in the checkout')
    ).toBeLessThan(install)
  })

  it('keeps the push v* trigger and the gates-first publish model', () => {
    expect(releaseWorkflow).toMatch(/push:\s*\n\s+tags:\s*\n\s*-\s*'v\*'/)
    const gates = releaseWorkflow.indexOf('name: Quality gates')
    const matrix = releaseWorkflow.indexOf('name: Package ${{ matrix.target }}')
    const finalize = releaseWorkflow.indexOf('name: Publish the GitHub Release')
    expect(gates).toBeGreaterThan(-1)
    expect(matrix).toBeGreaterThan(gates)
    expect(finalize).toBeGreaterThan(matrix)
    expect(releaseWorkflow).toMatch(/needs: gates/)
    expect(releaseWorkflow).toMatch(/needs: release/)
    expect(releaseWorkflow).toMatch(/--publish never/)
    expect(releaseWorkflow).toMatch(/--draft=false --latest/)
  })
})

describe('release signing credentials checklist', () => {
  it('documents each credential for human entry as a GitHub secret', () => {
    for (const secret of signingSecrets) {
      expect(signingDoc).toContain(secret)
    }
    expect(signingDoc).toMatch(/GitHub Secrets?/)
  })

  it('documents the App Store Connect API key mode', () => {
    expect(signingDoc).toMatch(/App Store Connect API Key/)
    expect(signingDoc).toMatch(/Developer\*{0,2} 角色/)
    expect(signingDoc).toMatch(/仅可下载一次/)
    expect(signingDoc).toMatch(/Key ID/)
    expect(signingDoc).toMatch(/Issuer ID/)
    expect(signingDoc).toContain('3X4J53U6RY')
  })

  it('defers the actual credential entry to the Apple Developer Program decision', () => {
    expect(signingDoc).toMatch(/Apple Developer Program/)
  })

  it('documents the current formal-release posture instead of the former freeze', () => {
    expect(signingDoc).toContain(`正式版发布姿态（${currentTag}）`)
    expect(signingDoc).toContain(`docs/release-notes/${currentTag}.md`)
    expect(signingDoc).not.toMatch(/发布冻结/)
    // The v0.1.2 drift record stays documented rather than being deleted.
    expect(signingDoc).toMatch(/v0\.1\.2/)
  })

  it('records the v0.1.2 drift facts in the signing doc', () => {
    for (const fact of driftFacts) {
      expect(signingDoc).toMatch(fact)
    }
  })

  it('lists the six secrets and fail-closed behavior in the README', () => {
    for (const secret of signingSecrets) {
      expect(readme).toContain(secret)
    }
    expect(readme).toMatch(/fail-closed/)
  })

  it('reports the current tag as published and links its release', () => {
    expect(readme).toContain(`当前发布状态：${currentTag} 已发布`)
    expect(readme).toContain(`https://github.com/chaxiu/OpenCompare/releases/tag/${currentTag}`)
    expect(readme).toContain(`docs/release-notes/${currentTag}.md`)
    expect(readme).not.toContain(`${currentTag} ${pendingWord}`)
    // The previous release is published history, no longer the latest one.
    expect(readme).not.toContain('最新公开 Release 为 [v0.2.2]')
    expect(readme).toContain('releases/tag/v0.2.2')
    expect(readme).not.toContain('当前发布状态：v0.2.2')
    expect(readme).not.toContain('最新公开 Release 为 [v0.2.1]')
    expect(readme).not.toMatch(/最新公开 Release 为 v0\.1\.2/)
    expect(readme).not.toMatch(/正式版 v0\.2\.0/)
    expect(readme).not.toMatch(/当前发布状态：正式版 v0\.1\.2/)
    expect(readme).not.toMatch(/发布状态：冻结/)
  })

  it('reports the signing doc status as published for the current tag', () => {
    expect(signingDoc).toContain(`当前状态：${currentTag} 已发布`)
    expect(signingDoc).not.toContain(`${currentTag} ${pendingWord}`)
    expect(signingDoc).not.toContain('当前状态：v0.2.2')
  })

  it('attributes the dangling-link bug to v0.2.2 and earlier in the README', () => {
    const issues = readme.slice(readme.indexOf('## 已知问题'))
    expect(issues).toContain('v0.2.2 及更早')
    expect(issues).toContain('悬空符号链接')
    expect(issues).toContain('不可读项')
    expect(issues).toContain('已跳过')
    expect(issues).toContain('当前版本已修复')
  })

  it('attributes the file-handle bug to v0.2.1 and earlier in the README', () => {
    const issues = readme.slice(readme.indexOf('## 已知问题'))
    expect(issues).toContain('v0.2.1 及更早')
    expect(issues).toContain('当前版本已修复')
    expect(issues).toContain('8 路')
    expect(issues).toContain('有界并发')
    expect(issues).toContain('文件句柄耗尽')
  })

  it('keeps the README workflow_dispatch default in sync with the workflow', () => {
    const flow = readme.slice(readme.indexOf('## 发布流程'), readme.indexOf('## 项目结构'))
    expect(flow).toContain(`默认 \`${currentTag}\``)
    expect(releaseWorkflow).toContain(`default: '${currentTag}'`)
  })
})

describe('release notes changelog', () => {
  it('documents the v0.1.2 entry with signing, reproducible packaging and the version gate', () => {
    expect(changelog).toMatch(/## v0\.1\.2/)
    expect(changelog).toMatch(/Developer ID/)
    expect(changelog).toMatch(/App Store Connect API Key/)
    expect(changelog).toMatch(/fail-closed/)
    expect(changelog).toMatch(/唯一/)
    expect(changelog).toMatch(/latest\*\.yml/)
  })

  it('orders the current, v0.2.2, v0.2.0 and v0.1.2 entries newest first', () => {
    const current = changelog.indexOf(`## ${currentTag}`)
    const previousEntry = changelog.indexOf('## v0.2.2')
    const superseded = changelog.indexOf('## v0.2.0')
    const previous = changelog.indexOf('## v0.1.2')
    expect(current).toBeGreaterThan(-1)
    expect(previousEntry).toBeGreaterThan(current)
    expect(superseded).toBeGreaterThan(previousEntry)
    expect(previous).toBeGreaterThan(superseded)
  })

  it('documents the dangling-link fix in the current changelog entry', () => {
    const start = changelog.indexOf(`## ${currentTag}`)
    const end = changelog.indexOf('## v0.2.2')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const section = changelog.slice(start, end)
    for (const phrase of [
      '悬空符号链接',
      '不可读项',
      '已跳过',
      '摘要直写缓存',
      `${ghostTag} 已合入但未发布`,
      '悬空链接容错',
      '摘要缓存改进'
    ]) {
      expect(section).toContain(phrase)
    }
  })

  it('drops the never-published entry and adds no fake version heading', () => {
    expect(changelog).not.toMatch(new RegExp(`^## ${ghostTag}`, 'm'))
    const start = changelog.indexOf(`## ${currentTag}`)
    const end = changelog.indexOf('## v0.2.2')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const headings = [...changelog.slice(start, end).matchAll(/^## (.+)$/gm)].map(
      (match) => match[1]
    )
    expect(headings).toEqual([currentTag])
  })

  it('keeps the v0.2.2 changelog entry as history', () => {
    const start = changelog.indexOf('## v0.2.2')
    const end = changelog.indexOf('## v0.2.1')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const section = changelog.slice(start, end)
    for (const phrase of ['8 路', '有界并发', 'EMFILE', 'ENFILE']) {
      expect(section).toContain(phrase)
    }
    expect(section).toContain('https://github.com/chaxiu/OpenCompare/issues/2')
  })

  it('explains why v0.2.1 ships and keeps the v0.2.0 user-visible changes', () => {
    const start = changelog.indexOf('## v0.2.1')
    const end = changelog.indexOf('## v0.2.0')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const section = changelog.slice(start, end)
    for (const phrase of [
      '从未公开发布',
      '用户可见变化与 v0.2.0 相同',
      '不依赖本机 git 状态'
    ]) {
      expect(section).toContain(phrase)
    }
    for (const keyword of [
      '新建对比',
      '路径',
      '启动参数',
      'opencompare://',
      '图标',
      '原位写回'
    ]) {
      expect(section).toContain(keyword)
    }
  })

  it('records the v0.1.2 drift facts in the changelog', () => {
    for (const fact of driftFacts) {
      expect(changelog).toMatch(fact)
    }
  })

  it('keeps the v0.1.2 no-action statement in both release documents', () => {
    for (const doc of [changelog, signingDoc]) {
      for (const phrase of ['不删除', '不移动', '不重打', '不替换']) {
        expect(doc).toContain(phrase)
      }
    }
    expect(changelog).toMatch(/tag 之后的修复由 v0\.2\.0 承接/)
    expect(signingDoc).toContain(`tag 之后的修复由 ${currentTag} 承接`)
  })

  it('ships the current release notes as paste-ready source text', () => {
    expect(existsSync(releaseNotesPath)).toBe(true)
    expect(releaseNotes.trim().length).toBeGreaterThan(0)
    expect(firstHeading(releaseNotes)).toContain(currentTag)
  })

  it('covers the still-public v0.2.2 release notes', () => {
    expect(existsSync(lastReleasedNotesPath)).toBe(true)
    for (const keyword of ['EMFILE', 'ENFILE', '8 路', '有界并发', '文件句柄耗尽']) {
      expect(lastReleasedNotes).toContain(keyword)
    }
  })

  it('records the dangling-link fix in the current release notes', () => {
    for (const phrase of [
      '悬空符号链接',
      '不可读项',
      '已跳过 N 个不可读项/悬空链接',
      '摘要直写缓存',
      '134 万',
      '10.67 GiB'
    ]) {
      expect(releaseNotes).toContain(phrase)
    }
    expect(releaseNotes).toMatch(/v0\.2\.2 及更早/)
    expect(releaseNotes).toContain('升级')
  })

  it('keeps the v0.2.0 release notes as history', () => {
    expect(existsSync(previousReleaseNotesPath)).toBe(true)
    expect(firstHeading(previousReleaseNotes)).toMatch(/v0\.2\.0/)
  })

  it('keeps placeholder markers out of the release notes', () => {
    expect(releaseNotes).not.toMatch(/\b(?:TODO|TBD|FIXME)\b/)
  })

  it('keeps the release notes version in sync with package.json', () => {
    const headingVersion = /v(\d+\.\d+\.\d+)/.exec(firstHeading(releaseNotes))?.[1] ?? ''
    expect(headingVersion).toBe(pkg.version)
  })
})

describe('release document consistency', () => {
  it('removes the never-published notes and every link to them', () => {
    expect(existsSync(join(repoRoot, ghostNotesPath))).toBe(false)
    const offenders = documentPaths().filter((path) => {
      const text = readFileSync(path, 'utf8')
      return text.includes(ghostNotesPath) || text.includes(ghostReleaseLink)
    })
    expect(offenders.map((path) => relative(repoRoot, path))).toEqual([])
  })

  it('keeps a fake evidence file for the never-published version out of the repository', () => {
    expect(existsSync(join(repoRoot, ghostEvidencePath))).toBe(false)
  })

  it('links only published tags or the current pending tag', () => {
    const allowed = new Set([...publishedTags, currentTag])
    const offenders: string[] = []
    for (const path of documentPaths()) {
      const text = readFileSync(path, 'utf8')
      for (const match of text.matchAll(releaseTagLink)) {
        if (!allowed.has(match[1])) {
          offenders.push(`${relative(repoRoot, path)}: ${match[1]}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps the published status and the signing copy on README line 5', () => {
    const statusLine = readme.split(/\r?\n/)[4] ?? ''
    expect(statusLine).toContain(`当前发布状态：${currentTag} 已发布`)
    expect(statusLine).toContain(`https://github.com/chaxiu/OpenCompare/releases/tag/${currentTag}`)
    expect(statusLine).toContain(`docs/release-notes/${currentTag}.md`)
    expect(statusLine).not.toContain(pendingWord)
    expect(statusLine).not.toContain('最新公开 Release 为 [v0.2.2]')
    expect(statusLine).not.toContain(ghostNotesPath)
    expect(statusLine).toContain('Developer ID 签名 + Apple 公证')
    expect(statusLine).toContain('fail-closed')
    expect(statusLine).toContain('App Store Connect API Key')
    for (const secret of signingSecrets) {
      expect(statusLine).toContain(secret)
    }
  })

  it('lists the published, never-published and previous versions in the download table', () => {
    const start = readme.indexOf('## 版本与下载')
    const end = readme.indexOf('## 核心能力')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const rows = readme
      .slice(start, end)
      .split(/\r?\n/)
      .filter((line) => line.startsWith('|'))
    const currentRow = rows.find((row) => row.startsWith(`| [${currentTag}]`))
    const ghostRow = rows.find((row) => row.startsWith(`| ${ghostTag}`))
    const releasedRow = rows.find((row) => row.startsWith('| [v0.2.2]'))
    expect(currentRow).toBeDefined()
    expect(currentRow).toContain('已发布')
    expect(currentRow).toContain(`releases/tag/${currentTag}`)
    expect(currentRow).toContain(`docs/release-notes/${currentTag}.md`)
    expect(ghostRow).toBeDefined()
    expect(ghostRow).toContain('未发布')
    expect(ghostRow).toContain(`内容并入 ${currentTag}`)
    expect(ghostRow).not.toContain(ghostReleaseLink)
    expect(releasedRow).toBeDefined()
    expect(releasedRow).toContain('已发布')
    expect(releasedRow).not.toContain('最新公开 Release')
    expect(releasedRow).toContain('releases/tag/v0.2.2')
    // The latest public release moved to the just-published tag.
    expect(readme).toContain('已发布（最新公开 Release）')
    expect(readme).not.toContain('最新公开 Release 为 [v0.2.2]')
    expect(readme).not.toContain(`最新公开 Release 为 [${ghostTag}]`)
  })

  it('records the three unfixed known issues without claiming a fix', () => {
    const issues = readme.slice(readme.indexOf('## 已知问题'))
    expect(issues.match(/当前版本已修复/g)?.length).toBe(2)
    const unfixed = issues
      .split(/\r?\n/)
      .filter((line) => line.startsWith('- ') && line.includes('已知未修'))
    expect(unfixed).toHaveLength(3)
    for (const phrase of [
      '849',
      '1,510 MB',
      '未 OOM',
      'ECANCELED',
      '不影响取消结果',
      '符号链接计数放大'
    ]) {
      expect(issues).toContain(phrase)
    }
    for (const line of unfixed) {
      expect(line).not.toContain('已修复')
    }
  })

  it('documents the unsolved known issues outside the fix list', () => {
    expect(existsSync(releaseNotesPath)).toBe(true)
    expect(releaseNotes).toContain('已知问题')
    const fixesStart = releaseNotes.indexOf('## 本次修复')
    const knownStart = releaseNotes.indexOf('## 已知问题')
    expect(fixesStart).toBeGreaterThan(-1)
    expect(knownStart).toBeGreaterThan(fixesStart)
    const fixes = releaseNotes.slice(fixesStart, knownStart)
    expect(fixes).not.toContain('已知未修')
    const known = releaseNotes.slice(knownStart)
    expect(known.split('已知未修').length - 1).toBeGreaterThanOrEqual(3)
    for (const phrase of [
      '849',
      '1,510 MB',
      '未 OOM',
      'ECANCELED',
      '不影响取消结果',
      '符号链接计数放大'
    ]) {
      expect(known).toContain(phrase)
    }
  })
})

// ---------------------------------------------------------------------------
// Brand icon assets (self-made, replaceable) and their packaging / runtime wiring
// ---------------------------------------------------------------------------

const iconSourcePath = join(repoRoot, 'build/icons/icon.svg')
const iconPngPath = join(repoRoot, 'build/icon.png')
const iconIcnsPath = join(repoRoot, 'build/icon.icns')
const iconIcoPath = join(repoRoot, 'build/icon.ico')

const brandDoc = readFileSync(join(repoRoot, 'docs/brand-assets.md'), 'utf8')
const brandModuleSource = readFileSync(join(repoRoot, 'src/shared/brand.ts'), 'utf8')
const mainSource = readFileSync(join(repoRoot, 'src/main/index.ts'), 'utf8')

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47])
const ICON_SIZES = [16, 32, 64, 128, 256, 512, 1024]

const fileSize = (path: string): number => statSync(path).size
const pngDimensions = (path: string): { width: number; height: number } => {
  const bytes = readFileSync(path)
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}
const sha256 = (path: string): string =>
  createHash('sha256').update(readFileSync(path)).digest('hex')

describe('brand icon assets', () => {
  it('ships a non-empty editable SVG source', () => {
    expect(existsSync(iconSourcePath)).toBe(true)
    expect(fileSize(iconSourcePath)).toBeGreaterThan(0)
    expect(readFileSync(iconSourcePath, 'utf8')).toContain('<svg')
  })

  it('ships a 1024x1024 PNG main icon with a valid PNG signature', () => {
    expect(fileSize(iconPngPath)).toBeGreaterThan(0)
    expect(readFileSync(iconPngPath).subarray(0, 4).equals(PNG_SIGNATURE)).toBe(true)
    expect(pngDimensions(iconPngPath)).toEqual({ width: 1024, height: 1024 })
  })

  it('ships every multi-size PNG as a valid PNG of the declared size', () => {
    for (const size of ICON_SIZES) {
      const path = join(repoRoot, 'build/icons', `icon-${size}.png`)
      expect(existsSync(path), `missing ${path}`).toBe(true)
      expect(fileSize(path)).toBeGreaterThan(0)
      expect(readFileSync(path).subarray(0, 4).equals(PNG_SIGNATURE)).toBe(true)
      expect(pngDimensions(path)).toEqual({ width: size, height: size })
    }
  })

  it('ships a macOS icns container', () => {
    expect(fileSize(iconIcnsPath)).toBeGreaterThan(8)
    expect(readFileSync(iconIcnsPath).subarray(0, 4).toString('ascii')).toBe('icns')
  })

  it('ships a Windows ico resource with the icon header', () => {
    expect(fileSize(iconIcoPath)).toBeGreaterThan(22)
    expect(readFileSync(iconIcoPath).subarray(0, 6).toString('hex')).toBe('000001000100')
  })
})

describe('packaging points at the shipped brand icons', () => {
  it('configures mac, win and linux icons against existing repository files', () => {
    expect(builder.mac?.icon).toBe('build/icon.icns')
    expect(builder.win?.icon).toBe('build/icon.ico')
    expect(builder.linux?.icon).toBe('build/icon.png')
    for (const icon of [builder.mac?.icon, builder.win?.icon, builder.linux?.icon]) {
      expect(icon?.trim()).toBeTruthy()
      expect(existsSync(join(repoRoot, icon ?? ''))).toBe(true)
    }
  })

  it('never falls back to the Electron default icon names', () => {
    for (const icon of [builder.mac?.icon, builder.win?.icon, builder.linux?.icon]) {
      expect(icon).toMatch(/^build\//)
      expect(icon).not.toMatch(/electron\.(icns|ico|png)/)
    }

    // When the Electron distribution is installed, its stock icns must differ
    // byte-for-byte from the shipped brand icon.
    const electronIcns = [
      join(repoRoot, 'node_modules/electron/dist/Electron.app/Contents/Resources/electron.icns'),
      join(repoRoot, 'node_modules/electron/dist/resources/electron.icns')
    ].find((path) => existsSync(path))
    if (electronIcns) {
      expect(sha256(iconIcnsPath)).not.toBe(sha256(electronIcns))
    }
  })

  it('copies the main PNG into the packaged resources as icon.png', () => {
    const entry = (builder.extraResources ?? []).find(
      (resource) => resource.from === 'build/icon.png'
    )
    expect(entry).toBeTruthy()
    expect(entry?.to).toBe('icon.png')
  })

  it('resolves the packaged and development icon to the same shipped PNG', () => {
    const resourcesPath = '/Applications/OpenCompare.app/Contents/Resources'
    expect(
      resolveBrandIconPath({
        isPackaged: true,
        resourcesPath,
        appPath: join(resourcesPath, 'app.asar')
      })
    ).toBe(join(resourcesPath, 'icon.png'))

    const development = resolveBrandIconPath({
      isPackaged: false,
      resourcesPath: '/ignored',
      appPath: repoRoot
    })
    expect(development).toBe(iconPngPath)
    expect(existsSync(development)).toBe(true)
  })
})

describe('window and dock share the packaged brand icon', () => {
  it('passes the resolved PNG to BrowserWindow and the macOS dock', () => {
    expect(mainSource).toMatch(/resolveBrandIconPath\(/)
    expect(mainSource).toMatch(/icon:\s*iconPath/)
    expect(mainSource).toMatch(/app\.dock\?\.setIcon\(iconPath\)/)
  })

  it('resolves platform-independently to one existing file', () => {
    const first = resolveBrandIconPath({
      isPackaged: false,
      resourcesPath: '/whatever',
      appPath: repoRoot
    })
    const second = resolveBrandIconPath({
      isPackaged: false,
      resourcesPath: '/another',
      appPath: repoRoot
    })
    expect(first).toBe(second)
    expect(existsSync(first)).toBe(true)
  })
})

describe('about panel brand and version', () => {
  it('fixes the brand name and reuses the runtime icon path', () => {
    const options = buildAboutPanelOptions({
      version: pkg.version ?? '',
      iconPath: iconPngPath
    })
    expect(options.applicationName).toBe('OpenCompare')
    expect(options.applicationName).toBe(BRAND_NAME)
    expect(options.iconPath).toBe(iconPngPath)
    expect(options.iconPath).toBe(
      resolveBrandIconPath({ isPackaged: false, resourcesPath: '/x', appPath: repoRoot })
    )
  })

  it('takes the version from package.json without hard-coding it', () => {
    expect(pkg.version?.trim()).toBeTruthy()
    const options = buildAboutPanelOptions({
      version: pkg.version ?? '',
      iconPath: iconPngPath
    })
    expect(options.applicationVersion).toBe(pkg.version)
    // A different injected version flows straight through.
    expect(
      buildAboutPanelOptions({ version: '9.9.9', iconPath: '/tmp/icon.png' })
        .applicationVersion
    ).toBe('9.9.9')
  })

  it('wires app.getVersion() into app.setAboutPanelOptions', () => {
    expect(mainSource).toMatch(/app\.setAboutPanelOptions\(/)
    expect(mainSource).toMatch(/app\.getVersion\(\)/)
    expect(mainSource).not.toMatch(/\b\d+\.\d+\.\d+\b/)
    expect(mainSource).not.toMatch(/Electron/)
    expect(brandModuleSource).not.toMatch(/\b\d+\.\d+\.\d+\b/)
  })
})

interface MenuNode {
  role?: string
  label?: string
  submenu?: MenuNode[]
}

describe('native About menu entry', () => {
  const macTemplate = createMenuTemplate({ isMac: true }) as unknown as MenuNode[]
  const otherTemplate = createMenuTemplate({ isMac: false }) as unknown as MenuNode[]

  it('puts the about role in the macOS app menu', () => {
    const appMenu = macTemplate[0]
    expect(appMenu?.submenu?.some((item) => item.role === 'about')).toBe(true)
  })

  it('puts the about role in the Windows/Linux Help submenu', () => {
    const helpMenu = otherTemplate.find((item) => item.role === 'help')
    expect(helpMenu?.submenu?.some((item) => item.role === 'about')).toBe(true)
  })

  it('keeps edit and view menus, plus the window menu on macOS', () => {
    for (const template of [macTemplate, otherTemplate]) {
      expect(template.some((item) => item.role === 'editMenu')).toBe(true)
      expect(template.some((item) => item.role === 'viewMenu')).toBe(true)
    }
    expect(macTemplate.some((item) => item.role === 'windowMenu')).toBe(true)
  })
})

describe('brand asset documentation', () => {
  it('marks the artwork as self-made and replaceable with all core paths', () => {
    expect(brandDoc).toContain('自制')
    expect(brandDoc).toContain('可替换')
    for (const path of [
      'build/icons/icon.svg',
      'build/icon.png',
      'build/icon.icns',
      'build/icon.ico'
    ]) {
      expect(brandDoc).toContain(path)
    }
    expect(brandDoc).toContain('node build/icons/generate-icons.mjs')
  })
})

describe('opencompare protocol declaration', () => {
  it('declares the opencompare scheme for packaged bundles', () => {
    const protocols = builder.protocols ?? []
    expect(protocols.length).toBeGreaterThan(0)
    const compare = protocols.find((protocol) => protocol.schemes?.includes('opencompare'))
    expect(compare).toBeDefined()
    expect(compare?.name?.trim()).toBeTruthy()
  })

  it('registers the scheme handler in the Linux desktop entry', () => {
    expect(builder.linux?.desktop?.entry?.MimeType ?? '').toContain(
      'x-scheme-handler/opencompare'
    )
  })
})

// ---------------------------------------------------------------------------
// Release hardening: packaged-app assertions, signature/notarization checks,
// artifact naming and the single public release gate.
// ---------------------------------------------------------------------------

const releaseStepBody = (name: string): string => {
  const label = `- name: ${name}`
  const start = releaseWorkflow.indexOf(label)
  expect(start, `missing workflow step: ${name}`).toBeGreaterThan(-1)
  const boundaries = [
    releaseWorkflow.indexOf('\n      - ', start + label.length),
    releaseWorkflow.indexOf('\n\n  ', start + label.length)
  ].filter((index) => index !== -1)
  const next = boundaries.length > 0 ? Math.min(...boundaries) : -1
  return releaseWorkflow.slice(start, next === -1 ? undefined : next)
}

describe('packaged macOS app icon and identity assertions', () => {
  const step = releaseStepBody('Locate the packaged app and assert its icon and version')

  it('runs only on the mac matrix target', () => {
    expect(step).toMatch(/if: matrix\.target == 'mac'/)
  })

  it('locates the real OpenCompare.app without hard-coding an arch directory', () => {
    expect(step).toContain("find release -maxdepth 2 -name 'OpenCompare.app'")
    expect(step).not.toMatch(/mac-arm64|mac-x64/)
    expect(step).toContain('No OpenCompare.app found')
    expect(step).toContain('::error::')
    expect(step).toContain('exit 1')
  })

  it('requires a non-empty, non-Electron CFBundleIconFile', () => {
    expect(step).toContain('CFBundleIconFile')
    expect(step).toContain('electron.icns')
    expect(step).toContain("PlistBuddy -c 'Print :CFBundleIconFile'")
  })

  it('requires the icns resource to exist with a real icns header', () => {
    expect(step).toContain('Contents/Resources/')
    expect(step).toContain('head -c 4')
    expect(step).toContain('icns')
  })

  it('compares the packaged icon against the Electron default when it is locatable', () => {
    expect(step).toContain(
      'node_modules/electron/dist/Electron.app/Contents/Resources/electron.icns'
    )
    expect(step).toContain('shasum -a 256')
    expect(step).toContain('skipping the SHA-256 default-icon comparison')
  })

  it('requires the packaged icon.png to be byte-identical to build/icon.png', () => {
    expect(step).toContain('Contents/Resources/icon.png')
    expect(step).toContain('build/icon.png')
    expect(step).toContain('does not match build/icon.png')
  })

  it('pins the bundle identifier and the tag version in Info.plist', () => {
    expect(step).toContain('CFBundleIdentifier')
    expect(step).toContain('com.opencompare.app')
    expect(step).toContain('CFBundleShortVersionString')
    expect(step).toContain('${RELEASE_TAG#v}')
  })
})

describe('macOS signature, notarization and Gatekeeper hard checks', () => {
  const step = releaseStepBody(
    'Verify the app signature, notarization and Gatekeeper acceptance'
  )

  it('runs only on the mac matrix target', () => {
    expect(step).toMatch(/if: matrix\.target == 'mac'/)
  })

  it('verifies the deep strict signature and exits on failure', () => {
    expect(step).toContain('codesign --verify --deep --strict --verbose=2')
    expect(step).toContain('codesign --verify --deep --strict failed')
    expect(step).toContain('::error::')
    expect(step).toContain('exit 1')
  })

  it('requires a Developer ID signature with the team id and hardened runtime', () => {
    expect(step).toContain('codesign -dv --verbose=4')
    expect(step).toContain('Authority=Developer ID Application')
    expect(step).toContain('TeamIdentifier=3X4J53U6RY')
    expect(step).toContain('Signature=adhoc')
    expect(step).toContain('(runtime)')
  })

  it('validates the stapled ticket, falling back to the app inside the dmg', () => {
    expect(step).toContain('xcrun stapler validate')
    expect(step).toContain('hdiutil attach -nobrowse -readonly')
    expect(step).toContain('hdiutil detach')
    expect(step).toContain('trap detach_dmg EXIT')
    expect(step).toContain("find release -maxdepth 1 -name '*.dmg'")
  })

  it('requires Gatekeeper to accept a notarized Developer ID app', () => {
    expect(step).toContain('spctl -a -vv --type execute')
    expect(step).toContain('accepted')
    expect(step).toContain('Notarized Developer ID')
  })
})

describe('packaged artifact names and update metadata', () => {
  const step = releaseStepBody('Assert packaged version matches the tag')

  it('requires the versioned artifact of every platform', () => {
    expect(step).toContain('case "${{ matrix.target }}" in')
    expect(step).toContain('mac) required_exts=(dmg zip)')
    expect(step).toContain('win) required_exts=(exe)')
    expect(step).toContain('linux) required_exts=(AppImage deb)')
  })

  it('rejects artifacts that do not carry the tag version', () => {
    expect(step).toContain('[0-9]+\\.[0-9]+\\.[0-9]+')
    expect(step).toContain('does not match tag')
  })

  it('keeps the latest*.yml gate glob, its empty guard and the version check', () => {
    expect(step).toContain('files=(release/latest*.yml)')
    expect(step).toContain('No latest*.yml update metadata found')
    expect(step).toContain('String(metadata.version) !== tag')
  })

  it('requires the update metadata urls and paths to carry the tag version', () => {
    expect(step).toContain('files[].url')
    expect(step).toContain('files[].path')
    expect(step).toContain('path ${metadata.path}')
    expect(step).toContain('update metadata does not match tag')
  })
})

describe('single public release gate', () => {
  const step = releaseStepBody('Verify the tag has exactly one public release')
  const assetsStep = releaseStepBody('Assert the public release has every platform asset')

  it('slurps every release page through jq -s before counting', () => {
    expect(step).toMatch(
      /gh api "repos\/\$\{GITHUB_REPOSITORY\}\/releases" --paginate \| jq -s/
    )
    expect(step).not.toContain('--slurp')
    expect(step).toContain('.[][]')
    expect(step).toContain('select(.draft)')
    expect(step).toContain('select(.prerelease)')
    expect(step).toContain('[ "${count}" -ne 1 ]')
    expect(step).toContain('[ "${drafts}" -ne 0 ]')
    expect(step).toContain('[ "${prereleases}" -ne 0 ]')
  })

  it('fails the count gate when a count is empty or not an integer', () => {
    expect(step).toContain('for value in "${count}" "${drafts}" "${prereleases}"')
    expect(step).toContain('^[0-9]+$')
    expect(step).toContain('::error::Could not count the releases')
    expect(step).toContain('exit 1')
  })

  it('reads the release id and asset names through jq -s', () => {
    expect(assetsStep).toContain(
      'gh api "repos/${GITHUB_REPOSITORY}/releases" --paginate | jq -s -r'
    )
    expect(assetsStep).toContain(
      'gh api "repos/${GITHUB_REPOSITORY}/releases/${release_id}/assets" --paginate | jq -s -r'
    )
    expect(assetsStep).not.toContain('--slurp')
    expect(assetsStep).toContain('if [ -z "${release_id}" ]')
    expect(assetsStep).toContain('while checking its assets')
    expect(assetsStep).toContain('if [ -z "${assets}" ]')
    expect(assetsStep).toContain('has no assets')
  })

  it('requires the assets to cover all three platforms and latest*.yml', () => {
    expect(assetsStep).toContain('releases/${release_id}/assets')
    for (const suffix of [
      '.dmg',
      '.zip',
      '.exe',
      '.AppImage',
      '.deb',
      'latest-mac.yml',
      'latest.yml',
      'latest-linux.yml'
    ]) {
      expect(assetsStep).toContain(suffix)
    }
    expect(assetsStep).toContain('has_asset')
    expect(assetsStep).toContain('does not carry the tag version')
  })
})

describe('gh api option compatibility', () => {
  // `gh api --slurp` is rejected when combined with --jq/--template; paginated
  // JSON bodies have to be piped through `jq -s` instead.
  const ghApiCommands = releaseWorkflow
    .replace(/\\\r?\n\s*/g, ' ')
    .split(/\r?\n/)
    .filter((line) => /\bgh api\b/.test(line) && !line.trimStart().startsWith('#'))

  it('never passes --slurp together with --jq or --template', () => {
    expect(ghApiCommands.length).toBeGreaterThan(0)
    for (const command of ghApiCommands) {
      if (!command.includes('--slurp')) continue
      expect(command).not.toContain('--jq')
      expect(command).not.toContain('--template')
    }
  })
})

describe('hard verification order and fail-closed upload path', () => {
  const indexOfStep = (name: string): number => releaseWorkflow.indexOf(`- name: ${name}`)

  it('runs credentials → build → app checks → signature checks → artifact checks → upload', () => {
    const credentials = indexOfStep('Require macOS signing and notarization credentials')
    const build = indexOfStep('Build installers')
    const appChecks = indexOfStep('Locate the packaged app and assert its icon and version')
    const signature = indexOfStep(
      'Verify the app signature, notarization and Gatekeeper acceptance'
    )
    const artifacts = indexOfStep('Assert packaged version matches the tag')
    const upload = indexOfStep("Upload installers to the tag's release")
    for (const index of [credentials, build, appChecks, signature, artifacts, upload]) {
      expect(index).toBeGreaterThan(-1)
    }
    expect(credentials).toBeLessThan(build)
    expect(build).toBeLessThan(appChecks)
    expect(appChecks).toBeLessThan(signature)
    expect(signature).toBeLessThan(artifacts)
    expect(artifacts).toBeLessThan(upload)
  })

  it('keeps no escape hatch on the upload path', () => {
    expect(releaseWorkflow).not.toContain('continue-on-error')
    expect(releaseWorkflow).not.toContain('|| true')
    expect(releaseWorkflow).not.toContain('--no-verify')
    const upload = releaseStepBody("Upload installers to the tag's release")
    expect(upload).not.toMatch(/if:\s*always\(\)/)
  })
})

describe('release hardening documentation', () => {
  it('documents the post-build hard checks and the single public release gate', () => {
    expect(signingDoc).toContain('打包后硬校验')
    expect(signingDoc).toContain('codesign --verify --deep --strict')
    expect(signingDoc).toContain('xcrun stapler validate')
    expect(signingDoc).toContain('spctl -a -vv')
    expect(signingDoc).toContain('失败即终止')
    expect(signingDoc).toContain('不上传')
    expect(signingDoc).toContain('唯一公开')
  })

  it('keeps the README release flow in sync', () => {
    const flow = readme.slice(readme.indexOf('## 发布流程'), readme.indexOf('## 项目结构'))
    expect(flow).toContain('codesign --verify --deep --strict')
    expect(flow).toContain('xcrun stapler validate')
    expect(flow).toContain('spctl -a -vv')
  })
})

describe('latest published release gate', () => {
  const stepName = 'Assert the tag is the latest published release'
  const step = releaseStepBody(stepName)

  it('runs after the platform asset assertion as the last step of finalize', () => {
    const assets = releaseWorkflow.indexOf(
      '- name: Assert the public release has every platform asset'
    )
    const gate = releaseWorkflow.indexOf(`- name: ${stepName}`)
    expect(assets).toBeGreaterThan(-1)
    expect(gate).toBeGreaterThan(assets)
    expect(releaseWorkflow.slice(gate + stepName.length)).not.toMatch(/\n {6}- name:/)
  })

  it('compares the newest published tag with the release tag through a read-only call', () => {
    expect(step).toContain('gh release list --limit 1 --json tagName')
    expect(step).toContain("jq -r '.[0].tagName // empty'")
    expect(step).toContain('${RELEASE_TAG}')
    expect(step).toContain('[ -z "${latest}" ]')
    expect(step).toContain('::error::')
    expect(step).toContain('exit 1')
    expect(step).not.toMatch(/gh release (?:create|edit|delete|upload)/)
    expect(step).not.toMatch(/--method\s+(?:POST|PATCH|PUT|DELETE)/)
  })
})
