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

// The ghost version was folded into v0.2.4 and that is history: pin the merge
// target on its own so moving the published anchor never retargets the row.
const ghostMergeTargetTag = 'v0.2.4'

// The former pending-status word is assembled at runtime so the negative
// assertions below can never match their own source text.
const pendingWord = ['待', '发布'].join('')

// The newest public release. It is a published fact, so this anchor is pinned
// explicitly; the current version anchor stays derived from package.json and the
// two are expected to be equal while the just-shipped version is the latest one.
const latestPublishedTag = 'v0.2.6'
// The previous public release. Pinned on its own so flipping the newest anchor
// never retargets the history assertions below.
const previousPublishedTag = 'v0.2.5'
const publishedTags = [
  'v0.2.0',
  'v0.2.1',
  'v0.2.2',
  'v0.2.4',
  previousPublishedTag,
  latestPublishedTag
]
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

const symlinkDoc = readFileSync(join(repoRoot, 'docs/symlink-no-follow.md'), 'utf8')

const changelog = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8')

const releaseNotesPath = join(repoRoot, `docs/release-notes/${currentTag}.md`)
const releaseNotes = existsSync(releaseNotesPath) ? readFileSync(releaseNotesPath, 'utf8') : ''

const previousReleaseNotesPath = join(repoRoot, 'docs/release-notes/v0.2.0.md')
const previousReleaseNotes = existsSync(previousReleaseNotesPath)
  ? readFileSync(previousReleaseNotesPath, 'utf8')
  : ''

// v0.2.4 shipped; its notes stay byte-identical as history.
const historicalNotesV024Path = join(repoRoot, 'docs/release-notes/v0.2.4.md')
const historicalNotesV024 = existsSync(historicalNotesV024Path)
  ? readFileSync(historicalNotesV024Path, 'utf8')
  : ''

// The newest shipped release notes; this anchor moves with the published tag.
const lastReleasedNotesPath = join(repoRoot, `docs/release-notes/${latestPublishedTag}.md`)
const lastReleasedNotes = existsSync(lastReleasedNotesPath)
  ? readFileSync(lastReleasedNotesPath, 'utf8')
  : ''

// v0.2.5 shipped before the current version: its notes stay byte-identical, so
// the assertions that describe v0.2.5 content read this explicit path.
const historicalNotesV025Path = join(repoRoot, 'docs/release-notes/v0.2.5.md')
const historicalNotesV025 = existsSync(historicalNotesV025Path)
  ? readFileSync(historicalNotesV025Path, 'utf8')
  : ''

// v0.2.2 is explicit published history: its notes are still covered even after
// the released-notes anchor moved forward.
const historicalNotesV022Path = join(repoRoot, 'docs/release-notes/v0.2.2.md')
const historicalNotesV022 = existsSync(historicalNotesV022Path)
  ? readFileSync(historicalNotesV022Path, 'utf8')
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

  // v0.2.5 CI trailer `00 01 EF A4`: big-endian 126884 is what latest-linux.yml
  // declares, little-endian is 2767126784. The old LE-only gate rejected it.
  const v025Trailer = Buffer.from([0x00, 0x01, 0xef, 0xa4])
  const v025BlockMapSize = 126884
  const v025LittleEndian = 2767126784

  it('verifies the embedded AppImage blockmap inside the linux packaging job', () => {
    expect(appImageGateStep).toBeDefined()
    expect(appImageGateStep?.if).toBe("matrix.target == 'linux'")
    expect(appImageGateScript).toContain('release/*.AppImage')
    expect(appImageGateScript).toContain('latest-linux.yml')
    expect(appImageGateScript).toContain('blockMapSize')
    // Both byte orders are read and matched; the old LE-only wording is gone.
    expect(appImageGateScript).toMatch(/readUInt32LE/)
    expect(appImageGateScript).toMatch(/readUInt32BE/)
    expect(appImageGateScript).not.toContain('little-endian uint32')
    expect(appImageGateScript).toContain('exit 1')
    // No separate *.AppImage.blockmap artifact is required or expected.
    expect(appImageGateScript).not.toContain('AppImage.blockmap')
  })

  interface AppImageGateOptions {
    declared?: number
    tail?: Buffer
    size?: number
    images?: number
    metadata?: string | null
  }

  const appImageMetadata = (declared: number | null): string =>
    [
      'version: 0.2.5',
      'files:',
      '  - url: OpenCompare-0.2.5.AppImage',
      '    sha512: fixture',
      '    size: 262144',
      ...(declared === null ? [] : [`    blockMapSize: ${declared}`]),
      '  - url: opencompare_0.2.5_amd64.deb',
      '    sha512: fixture',
      '    size: 262144',
      'path: OpenCompare-0.2.5.AppImage',
      'sha512: fixture'
    ].join('\n')

  // Tempdir fixtures are the only place this suite writes AppImage bytes.
  const runAppImageGate = (
    options: AppImageGateOptions = {}
  ): { status: number; output: string } => {
    const {
      declared = v025BlockMapSize,
      tail = v025Trailer,
      size = v025BlockMapSize,
      images = 1,
      metadata = appImageMetadata(declared)
    } = options
    const dir = mkdtempSync(join(tmpdir(), 'opencompare-appimage-'))
    try {
      const releaseDir = join(dir, 'release')
      mkdirSync(releaseDir, { recursive: true })
      const bytes = Buffer.alloc(size, 0)
      tail.copy(bytes, size - tail.length)
      for (let index = 0; index < images; index += 1) {
        const suffix = index === 0 ? '' : `-${index}`
        writeFileSync(join(releaseDir, `OpenCompare-0.2.5${suffix}.AppImage`), bytes)
      }
      if (metadata !== null) {
        writeFileSync(join(releaseDir, 'latest-linux.yml'), metadata)
      }
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

  it('passes the v0.2.5 fixture as big-endian while LE single-order would fail', () => {
    // Negative control on the same fixture: the old LE-only rule cannot pass.
    expect(v025Trailer.readUInt32BE(0)).toBe(v025BlockMapSize)
    expect(v025Trailer.readUInt32LE(0)).toBe(v025LittleEndian)
    expect(v025Trailer.readUInt32LE(0)).not.toBe(v025BlockMapSize)

    const { status, output } = runAppImageGate()
    expect(output).toContain('embedded blockMapSize=126884')
    expect(status).toBe(0)
  })

  it('fails closed when neither trailer byte order matches blockMapSize', () => {
    // Trailer `00 00 01 00`: BE 256 and LE 65536 are both in range but wrong.
    const { status, output } = runAppImageGate({ tail: Buffer.from([0x00, 0x00, 0x01, 0x00]) })
    expect(status).not.toBe(0)
    expect(output).toContain('::error::')
    expect(output).toContain(`blockMapSize=${v025BlockMapSize}`)
    expect(output).toContain('LE=65536')
    expect(output).toContain('BE=256')
  })

  it('fails closed when both trailer candidates exceed the file size', () => {
    const { status, output } = runAppImageGate({
      declared: 4294967295,
      size: 16,
      tail: Buffer.from([0xff, 0xff, 0xff, 0xff])
    })
    expect(status).not.toBe(0)
    expect(output).toContain('::error::')
    expect(output).toContain('exceed the file size 16')
  })

  it('fails closed when latest-linux.yml has no blockMapSize for the AppImage', () => {
    const { status, output } = runAppImageGate({ metadata: appImageMetadata(null) })
    expect(status).not.toBe(0)
    expect(output).toContain('::error::')
    expect(output).toContain('blockMapSize')
  })

  it('fails closed when the metadata file or the single AppImage is missing', () => {
    const missingMetadata = runAppImageGate({ metadata: null })
    expect(missingMetadata.status).not.toBe(0)
    expect(missingMetadata.output).toContain('Missing release/latest-linux.yml')

    const noImage = runAppImageGate({ images: 0 })
    expect(noImage.status).not.toBe(0)
    expect(noImage.output).toContain('Expected exactly one .AppImage')

    const twoImages = runAppImageGate({ images: 2 })
    expect(twoImages.status).not.toBe(0)
    expect(twoImages.output).toContain('found 2')
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
    expect(readme).toContain(`最新公开 Release 为 [${latestPublishedTag}]`)
    expect(latestPublishedTag).toBe(currentTag)
    expect(readme).toContain(`docs/release-notes/${currentTag}.md`)
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

  it('reports the current tag as published and links the latest public release', () => {
    expect(readme).toContain(`当前发布状态：${currentTag} 已发布`)
    expect(readme).toContain(`最新公开 Release 为 [${latestPublishedTag}]`)
    expect(readme).toContain(`docs/release-notes/${currentTag}.md`)
    expect(readme).not.toContain(pendingWord)
    // The newest public release is the current tag; older tags are history only.
    expect(readme).toContain(`当前发布状态：${latestPublishedTag} 已发布`)
    expect(readme).not.toContain(`当前发布状态：${previousPublishedTag}`)
    expect(readme).not.toContain('当前发布状态：v0.2.4')
    // v0.2.6 is the newest public release; v0.2.5/v0.2.4/v0.2.2 are published history.
    expect(readme).toContain(`releases/tag/${latestPublishedTag}`)
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
    expect(signingDoc).toContain(`正式版发布姿态（${currentTag}）`)
    expect(signingDoc).toContain(`docs/release-notes/${currentTag}.md`)
    expect(signingDoc).toContain(`docs/release-evidence/${latestPublishedTag}.md`)
    expect(signingDoc).not.toContain(pendingWord)
    // The re-issue entry keeps the current tag as its dispatch default.
    expect(signingDoc).toContain(`默认 \`${currentTag}\``)
    expect(signingDoc).not.toContain(`当前状态：${previousPublishedTag}`)
    expect(signingDoc).not.toContain('当前状态：v0.2.4')
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

  it('documents the no-follow symlink policy and drops the contradictory copy', () => {
    const issues = readme.slice(readme.indexOf('## 已知问题'))
    expect(issues).toContain('不跟随符号链接')
    expect(issues).not.toContain('符号链接计数放大')
    expect(readme).not.toMatch(/悬空符号链接[^\n]*跳过并计数/)
    for (const phrase of [
      '不进入链接指向的任何目录',
      '链接自身作为一条叶条目',
      '悬空链接',
      'EACCES',
      '已跳过：左 X / 右 Y',
      '指向**文件**的链接',
      '指向**目录**的链接',
      'opencompare.snapshot/v1'
    ]) {
      expect(symlinkDoc).toContain(phrase)
    }
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

  it('orders the current, v0.2.5, v0.2.4, v0.2.2, v0.2.0 and v0.1.2 entries newest first', () => {
    const current = changelog.indexOf(`## ${currentTag}`)
    // Both anchors are explicit: the newest tag and its predecessor are pinned
    // literals, not derived from one another.
    const lastReleased = changelog.indexOf(`## ${previousPublishedTag}`)
    const released = changelog.indexOf('## v0.2.4')
    const previousEntry = changelog.indexOf('## v0.2.2')
    const superseded = changelog.indexOf('## v0.2.0')
    const previous = changelog.indexOf('## v0.1.2')
    expect(current).toBeGreaterThan(-1)
    expect(lastReleased).toBeGreaterThan(current)
    expect(released).toBeGreaterThan(lastReleased)
    expect(previousEntry).toBeGreaterThan(released)
    expect(superseded).toBeGreaterThan(previousEntry)
    expect(previous).toBeGreaterThan(superseded)
  })

  it('documents the Windows absolute-path fix in the current changelog entry', () => {
    const start = changelog.indexOf(`## ${currentTag}`)
    const end = changelog.indexOf(`## ${previousPublishedTag}`)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const section = changelog.slice(start, end)
    for (const phrase of [
      '### 修复',
      '### 升级方式',
      'Windows',
      'CLI',
      '单实例',
      '手工输入',
      'opencompare://',
      '盘符',
      '盘根',
      'UNC',
      '0cc0914f3aebea9649d76be80fd3592a95bcdd87',
      '39888946270',
      'success'
    ]) {
      expect(section).toContain(phrase)
    }
    expect(section).not.toMatch(/\b(?:TODO|TBD|FIXME)\b/)
  })

  it('keeps the v0.2.5 fixes in the released changelog entry as history', () => {
    const start = changelog.indexOf(`## ${previousPublishedTag}`)
    const end = changelog.indexOf('## v0.2.4')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const section = changelog.slice(start, end)
    for (const phrase of [
      '### 修复',
      '### 升级方式',
      '内存收敛',
      'ECANCELED',
      '不跟随符号链接',
      'docs/perf/large-directory-memory.md',
      'docs/symlink-no-follow.md'
    ]) {
      expect(section).toContain(phrase)
    }
    expect(section).not.toMatch(/\b(?:TODO|TBD|FIXME)\b/)
  })

  it('keeps the dangling-link fix in the v0.2.4 changelog entry as history', () => {
    const start = changelog.indexOf('## v0.2.4')
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
    const end = changelog.indexOf(`## ${previousPublishedTag}`)
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

  it('anchors the newest published release notes at the shipped tag', () => {
    expect(existsSync(lastReleasedNotesPath)).toBe(true)
    // The newest published notes are the current release notes while the
    // just-shipped tag is the latest public release.
    expect(lastReleasedNotesPath).toBe(releaseNotesPath)
    expect(firstHeading(lastReleasedNotes)).toContain(latestPublishedTag)
  })

  it('covers the still-public v0.2.2 release notes', () => {
    expect(existsSync(historicalNotesV022Path)).toBe(true)
    expect(firstHeading(historicalNotesV022)).toMatch(/v0\.2\.2/)
    for (const keyword of ['EMFILE', 'ENFILE', '8 路', '有界并发', '文件句柄耗尽']) {
      expect(historicalNotesV022).toContain(keyword)
    }
  })

  it('keeps the dangling-link fix in the v0.2.4 release notes as history', () => {
    expect(existsSync(historicalNotesV024Path)).toBe(true)
    expect(firstHeading(historicalNotesV024)).toMatch(/v0\.2\.4/)
    for (const phrase of [
      '悬空符号链接',
      '不可读项',
      '已跳过 N 个不可读项/悬空链接',
      '摘要直写缓存',
      '134 万',
      '10.67 GiB'
    ]) {
      expect(historicalNotesV024).toContain(phrase)
    }
    expect(historicalNotesV024).toMatch(/v0\.2\.2 及更早/)
    expect(historicalNotesV024).toContain('升级')
  })

  it('documents the current release notes with the Windows path fix and evidence', () => {
    expect(firstHeading(releaseNotes)).toContain(currentTag)
    for (const phrase of [
      '--left',
      '单实例',
      '手工输入',
      'opencompare://',
      '盘符',
      '盘根',
      'UNC',
      'C:/',
      '//server/share',
      '..',
      '升级方式',
      '0cc0914f3aebea9649d76be80fd3592a95bcdd87',
      '39888946270',
      'success'
    ]) {
      expect(releaseNotes).toContain(phrase)
    }
    expect(releaseNotes).not.toContain('待验证')
    expect(releaseNotes).not.toContain('预计通过')
    expect(releaseNotes).not.toContain('应该通过')
    expect(releaseNotes).not.toMatch(/\b(?:TODO|TBD|FIXME)\b/)
    expect(releaseNotes).not.toMatch(/[0-9a-f]{64}/)
  })

  it('keeps the v0.2.5 release notes as released history', () => {
    expect(existsSync(historicalNotesV025Path)).toBe(true)
    expect(firstHeading(historicalNotesV025)).toContain(previousPublishedTag)
    for (const phrase of [
      '不跟随符号链接',
      '已跳过：左 X / 右 Y',
      '结构化取消',
      '有界缓存',
      '升级方式',
      '1,257,750,528',
      '71,286,784',
      'docs/perf/evidence/dawnchat-zenmind-20261022-post-fix-3rounds.json',
      'docs/symlink-no-follow.md'
    ]) {
      expect(historicalNotesV025).toContain(phrase)
    }
    expect(historicalNotesV025).not.toMatch(/\b(?:TODO|TBD|FIXME)\b/)
    expect(historicalNotesV025).not.toMatch(/[0-9a-f]{64}/)
    expect(historicalNotesV025).not.toContain('已知未修')
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

  it('links only published tags or the current tag', () => {
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
    expect(statusLine).toContain(
      `最新公开 Release 为 [${latestPublishedTag}](https://github.com/chaxiu/OpenCompare/releases/tag/${latestPublishedTag})`
    )
    expect(statusLine).toContain(`docs/release-notes/${currentTag}.md`)
    expect(statusLine).toContain(`当前发布状态：${latestPublishedTag} 已发布`)
    expect(statusLine).not.toContain(pendingWord)
    expect(statusLine).not.toContain(`当前发布状态：${previousPublishedTag}`)
    expect(statusLine).not.toContain('最新公开 Release 为 [v0.2.2]')
    expect(statusLine).not.toContain(ghostNotesPath)
    expect(statusLine).toContain('Developer ID 签名 + Apple 公证')
    expect(statusLine).toContain('fail-closed')
    expect(statusLine).toContain('App Store Connect API Key')
    for (const secret of signingSecrets) {
      expect(statusLine).toContain(secret)
    }
  })

  it('lists the latest, previous, older, never-published and historical versions in the download table', () => {
    const start = readme.indexOf('## 版本与下载')
    const end = readme.indexOf('## 核心能力')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const rows = readme
      .slice(start, end)
      .split(/\r?\n/)
      .filter((line) => line.startsWith('|'))
    const rowIndex = (prefix: string): number =>
      rows.findIndex((row) => row.startsWith(prefix))
    const currentRow = rows.find((row) => row.startsWith(`| [${currentTag}]`))
    const previousRow = rows.find((row) => row.startsWith(`| [${previousPublishedTag}]`))
    const olderRow = rows.find((row) => row.startsWith('| [v0.2.4]'))
    const ghostRow = rows.find((row) => row.startsWith(`| ${ghostTag}`))
    const oldRow = rows.find((row) => row.startsWith('| [v0.2.2]'))
    // Newest first: current (latest public) → previous → v0.2.4 → ghost → old.
    expect(rowIndex(`| [${currentTag}]`)).toBeGreaterThan(-1)
    expect(rowIndex(`| [${previousPublishedTag}]`)).toBeGreaterThan(
      rowIndex(`| [${currentTag}]`)
    )
    expect(rowIndex('| [v0.2.4]')).toBeGreaterThan(rowIndex(`| [${previousPublishedTag}]`))
    expect(rowIndex(`| ${ghostTag}`)).toBeGreaterThan(rowIndex('| [v0.2.4]'))
    expect(rowIndex('| [v0.2.2]')).toBeGreaterThan(rowIndex(`| ${ghostTag}`))
    expect(currentRow).toBeDefined()
    expect(currentRow).toContain('已发布（最新公开 Release）')
    expect(currentRow).toContain(`releases/tag/${latestPublishedTag}`)
    expect(currentRow).toContain(`docs/release-notes/${currentTag}.md`)
    expect(currentRow).toContain('盘符 / 盘根 / UNC')
    expect(currentRow).not.toContain(pendingWord)
    expect(previousRow).toBeDefined()
    expect(previousRow).toContain('已发布（上一版）')
    expect(previousRow).toContain(`releases/tag/${previousPublishedTag}`)
    expect(previousRow).toContain('多轮内存收敛、取消零日志噪声、符号链接「不跟随」计数口径')
    expect(olderRow).toBeDefined()
    expect(olderRow).toContain('已发布')
    expect(olderRow).not.toContain('上一版')
    expect(olderRow).not.toContain('最新公开 Release')
    expect(olderRow).toContain('releases/tag/v0.2.4')
    expect(ghostRow).toBeDefined()
    expect(ghostRow).toContain('未发布')
    // The ghost row is a historical fact: it stays merged into v0.2.4.
    expect(ghostRow).toContain(`内容并入 ${ghostMergeTargetTag}`)
    expect(ghostRow).not.toContain(ghostReleaseLink)
    expect(oldRow).toBeDefined()
    expect(oldRow).toContain('已发布')
    expect(oldRow).not.toContain('上一版')
    expect(oldRow).not.toContain('最新公开 Release')
    expect(oldRow).toContain('releases/tag/v0.2.2')
    expect(rows.filter((row) => row.includes('最新公开 Release'))).toHaveLength(1)
    expect(readme).not.toContain('最新公开 Release 为 [v0.2.2]')
    expect(readme).not.toContain(`最新公开 Release 为 [${ghostTag}]`)
  })

  it('records zero unfixed known issues and both v0.2.5 fix attributions', () => {
    const issues = readme.slice(readme.indexOf('## 已知问题'))
    const lines = issues.split(/\r?\n/).filter((line) => line.startsWith('- '))
    expect(lines.filter((line) => line.includes('已知未修'))).toHaveLength(0)

    const memory = lines.find((line) => line.includes('内存增长'))
    const cancel = lines.find((line) => line.includes('ECANCELED'))
    expect(memory).toBeDefined()
    expect(cancel).toBeDefined()
    // The two v0.2.5 fixes keep their original attribution.
    for (const line of [memory, cancel]) {
      expect(line).toContain(`已在 ${previousPublishedTag} 修复`)
    }

    // Issue #3 (Windows four absolute-path entry points) is fixed in the newest tag.
    const windows = lines.find((line) => line.includes('issues/3'))
    expect(windows).toBeDefined()
    for (const phrase of [
      `已在 ${latestPublishedTag} 修复`,
      'C:\\',
      'CLI',
      '单实例',
      '手工输入',
      'opencompare://',
      '39890047849',
      'src/shared/compareRequest.test.ts'
    ]) {
      expect(windows).toContain(phrase)
    }
    expect(windows).not.toContain(`已在 ${previousPublishedTag} 修复`)
    expect(memory).toContain('docs/perf/large-directory-memory.md')
    expect(memory).toContain(
      'docs/perf/evidence/dawnchat-zenmind-20261022-post-fix-3rounds.json'
    )
    expect(cancel).toContain('pnpm test:cancel')

    // The numbers are quoted from the archived perf evidence, never re-derived.
    const perfDoc = readFileSync(join(repoRoot, 'docs/perf/large-directory-memory.md'), 'utf8')
    for (const number of ['1,960,394,752', '1,257,750,528', '71,286,784']) {
      expect(perfDoc).toContain(number)
      expect(memory).toContain(number)
    }
    for (const marker of [
      '零 `Error occurred in handler`',
      '零 `OperationCancelledError`',
      '零 `ECANCELED`'
    ]) {
      expect(cancel).toContain(marker)
    }

    // Historical wording and the no-follow policy stay in place.
    for (const phrase of [
      'v0.2.2 及更早',
      'v0.2.1 及更早',
      '8 路',
      '有界并发',
      '文件句柄耗尽',
      '不跟随符号链接',
      '已跳过'
    ]) {
      expect(issues).toContain(phrase)
    }
    expect(issues).not.toContain('符号链接计数放大')
  })

  it('keeps the unsolved known issues in the v0.2.4 release notes as history', () => {
    expect(existsSync(historicalNotesV024Path)).toBe(true)
    expect(historicalNotesV024).toContain('已知问题')
    const fixesStart = historicalNotesV024.indexOf('## 本次修复')
    const knownStart = historicalNotesV024.indexOf('## 已知问题')
    expect(fixesStart).toBeGreaterThan(-1)
    expect(knownStart).toBeGreaterThan(fixesStart)
    const fixes = historicalNotesV024.slice(fixesStart, knownStart)
    expect(fixes).not.toContain('已知未修')
    const known = historicalNotesV024.slice(knownStart)
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
    // The current notes carry no leftover unfixed item.
    expect(releaseNotes).not.toContain('已知未修')
  })
})

// The published README claims the newest tag and links its release assets; these
// anchors are release-time facts and are asserted against package.json below.
const readmeStatusLine = (): string => readme.split(/\r?\n/)[4] ?? ''

const README_ASSET_PREFIX = `releases/download/${latestPublishedTag}/`

// The v0.2.6 published-asset digests are release-time facts; pinning them here
// makes a fabricated or hand-edited evidence record fail `pnpm test`.
const releaseEvidencePath = join(repoRoot, `docs/release-evidence/${latestPublishedTag}.md`)
const releaseEvidence = existsSync(releaseEvidencePath)
  ? readFileSync(releaseEvidencePath, 'utf8')
  : ''

const publishedEvidenceAssets: Array<[name: string, sha256: string]> = [
  [
    'OpenCompare-0.2.6-arm64.dmg',
    '5d58b832891d64cc552a913750eb3a073d81e42622bd8a0ef2b2dc5d45d0a60c'
  ],
  [
    'OpenCompare-0.2.6-arm64.dmg.blockmap',
    '3e715e4d1fa0f7566c51b5945d7d0cb6c8cd3dd535816f301c46bf89f0f91289'
  ],
  [
    'OpenCompare-0.2.6-arm64-mac.zip',
    '2b21766410ae6dcee83e61e297bff9dcfe942c0f886958286ed3bceee3eaa609'
  ],
  [
    'OpenCompare-0.2.6-arm64-mac.zip.blockmap',
    '0c4667d2b19f0f0e85662aba3c425c4776fe0f0ed49bda038237fe3c5c86261d'
  ],
  [
    'OpenCompare-Setup-0.2.6.exe',
    '9bef79c243aef99331e76f0436eaefa9c714d3b5fa5f37d60f807a4abbd4aed7'
  ],
  [
    'OpenCompare-Setup-0.2.6.exe.blockmap',
    '326f1d21f6a12305588ffbbc3aec9b36423a108f0c2ad035fea2a5767c254c3f'
  ],
  [
    'OpenCompare-0.2.6.AppImage',
    'ddbfa3796a2a96213da0f451033e2ae6ff07215e004094862bcc62b25be7b8cd'
  ],
  [
    'opencompare_0.2.6_amd64.deb',
    '6bfb9052f55b22fd23db10e63d8560e1c915a190bf38c89f4f90ba1c61427426'
  ],
  ['latest.yml', '8d163aee20df63fecfd8734ca2c9ae80007ae857b05c80f3125afbd30b75cb4e'],
  ['latest-mac.yml', '9243e0232f3f4aea2420d9b57be8116ec81e24dabd75b40d29e06b1c219c99db'],
  ['latest-linux.yml', '1813ac1516f98e0da4018e2fcd171db58e06dd76a39faeeb47b156d71c686878']
]

describe('published README release anchors', () => {
  it('declares the same published version in the README status line, the release anchor and package.json', () => {
    const statusLine = readmeStatusLine()
    const declared = /当前发布状态：(v\d+\.\d+\.\d+) 已发布/.exec(statusLine)?.[1] ?? ''
    const latest = /最新公开 Release 为 \[(v\d+\.\d+\.\d+)\]/.exec(statusLine)?.[1] ?? ''
    expect(declared, 'README status line must declare a published version').not.toBe('')
    expect(latest, 'README status line must link the latest public release').not.toBe('')
    expect(declared).toBe(latestPublishedTag)
    expect(latest).toBe(latestPublishedTag)
    expect(latestPublishedTag).toBe(`v${pkg.version}`)
  })

  it('links only space-free asset names under the published tag', () => {
    const matches = [
      ...readme.matchAll(
        new RegExp(`${README_ASSET_PREFIX.replaceAll('/', '\\/')}([^)\\s]+)`, 'g')
      )
    ].map((match) => match[1])
    expect(matches.length).toBeGreaterThanOrEqual(5)
    const basenames = matches.map((value) => value.split('/').pop() ?? '')
    for (const name of basenames) {
      expect(name).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
    }
    for (const expected of [
      `OpenCompare-${pkg.version}-arm64.dmg`,
      `OpenCompare-${pkg.version}-arm64-mac.zip`,
      `OpenCompare-Setup-${pkg.version}.exe`,
      `OpenCompare-${pkg.version}.AppImage`,
      `opencompare_${pkg.version}_amd64.deb`
    ]) {
      expect(basenames).toContain(expected)
    }
    expect(readme).not.toContain(`OpenCompare.Setup.${pkg.version}.exe`)
    expect(readme).not.toContain(`OpenCompare Setup ${pkg.version}.exe`)
  })
})

describe('v0.2.6 verified release evidence record', () => {
  it('exists, is non-empty and declares the verified run identity', () => {
    expect(existsSync(releaseEvidencePath)).toBe(true)
    expect(releaseEvidence.trim().length).toBeGreaterThan(0)
    expect(releaseEvidence).toMatch(/^status:\s*verified$/m)
    for (const marker of [
      'a0517102f90d769f71661cdf2f7bec43327b5d61',
      '30967cd1e8fd521fa517588b2a7ac503305797e5',
      '421396682',
      '2026-10-23T02:44:51Z',
      'draft=false',
      'prerelease=false',
      '39890773909',
      '39890047849',
      'pnpm test src/shared/compareRequest.test.ts',
      'releases/latest',
      '已知遗留'
    ]) {
      expect(releaseEvidence).toContain(marker)
    }
    expect(releaseEvidence).not.toMatch(/\b(?:TODO|TBD|FIXME)\b/)
  })

  it('lists all five release CI jobs as successful for the tagged commit', () => {
    const rows = releaseEvidence.split(/\r?\n/).filter((line) => line.startsWith('| '))
    for (const job of [
      'Quality gates',
      'Package win',
      'Package linux',
      'Package mac',
      'Publish the GitHub Release'
    ]) {
      const row = rows.find((line) => line.startsWith(`| ${job} |`))
      expect(row, `missing job row ${job}`).toBeDefined()
      expect(row).toContain('success')
    }
    expect(releaseEvidence).toContain(
      'headSha `30967cd1e8fd521fa517588b2a7ac503305797e5`'
    )
  })

  it('pins every published asset name, sha256 and public url', () => {
    expect(publishedEvidenceAssets).toHaveLength(11)
    for (const [name, sha] of publishedEvidenceAssets) {
      expect(releaseEvidence).toContain(`\`${name}\``)
      expect(releaseEvidence).toContain(sha)
      expect(releaseEvidence).toContain(
        `https://github.com/chaxiu/OpenCompare/releases/download/${latestPublishedTag}/${name}`
      )
    }
    for (const marker of [
      'version: 0.2.6',
      'path: OpenCompare-Setup-0.2.6.exe',
      '102,945,648'
    ]) {
      expect(releaseEvidence).toContain(marker)
    }
  })

  it('records the uniqueness, latest gate and notarization markers', () => {
    for (const marker of [
      'releases for v0.2.6: 1 (drafts: 0, prereleases: 0)',
      'latest published release: v0.2.6 (this tag: v0.2.6)',
      '`releases/latest` = `v0.2.6`',
      '04-notarization-macos.txt',
      'valid on disk',
      'satisfies its Designated Requirement',
      'The validate action worked!',
      'accepted',
      'source=Notarized Developer ID',
      'TeamIdentifier=3X4J53U6RY',
      'CDHash=3ee9d42220e5c02f061098a330fe90847c35f951'
    ]) {
      expect(releaseEvidence).toContain(marker)
    }
    // The dmg container boundary is recorded instead of being glossed over.
    expect(releaseEvidence).toContain('dmg 容器文件本身')
    expect(releaseEvidence).toContain('exit 65')
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
