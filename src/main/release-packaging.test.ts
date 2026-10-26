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

// The newest public release. It is a published fact, so this anchor is pinned
// explicitly and asserted against the README status line, not against the
// converged version in package.json. Once a release lands, one wrap-up commit
// updates both README line 5 and this constant together, so the two are equal
// right after a wrap-up and may differ by one unreleased version in between.
const latestPublishedTag = 'v0.2.7'
// The previous public release. Pinned on its own so flipping the newest anchor
// never retargets the history assertions below.
const previousPublishedTag = 'v0.2.6'
// Every published tag stays pinned as an explicit literal: flipping the newest
// anchor must never rewrite the shipped history.
const publishedTags = [
  'v0.2.0',
  'v0.2.1',
  'v0.2.2',
  'v0.2.4',
  'v0.2.5',
  previousPublishedTag,
  latestPublishedTag
]
const releaseTagLink = /releases\/tag\/(v\d+\.\d+\.\d+)/g

// Compares two `vMAJOR.MINOR.PATCH` tags so the previous published anchor can
// be asserted to trail the converged version. The newest published anchor is
// equal to the converged version right after a release wrap-up.
const isTagBefore = (older: string, newer: string): boolean => {
  const parts = (tag: string): number[] => tag.replace(/^v/, '').split('.').map(Number)
  const left = parts(older)
  const right = parts(newer)
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index]
  }
  return false
}

const documentPaths = (): string[] => {
  const docsRoot = join(repoRoot, 'docs')
  const docs = readdirSync(docsRoot, { recursive: true })
    .map((entry) => String(entry))
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => join(docsRoot, entry))
  return [
    join(repoRoot, 'README.md'),
    join(repoRoot, 'README.zh-CN.md'),
    join(repoRoot, 'CHANGELOG.md'),
    ...docs
  ]
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

// The release flow moved out of the READMEs into this document; the READMEs
// only carry a one-line link, so the workflow facts are asserted here.
const releaseProcessDoc = readFileSync(join(repoRoot, 'docs/release-process.md'), 'utf8')

// README.md is the English default and README.zh-CN.md is its Chinese mirror.
// Shared release facts are asserted against both so neither can drift alone.
const readmeEn = readFileSync(join(repoRoot, 'README.md'), 'utf8')
const readmeZh = readFileSync(join(repoRoot, 'README.zh-CN.md'), 'utf8')

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

// v0.2.6 shipped before the current version too; its notes are pinned as
// explicit history so flipping the released-notes anchor never drops them.
const historicalNotesV026Path = join(repoRoot, 'docs/release-notes/v0.2.6.md')
const historicalNotesV026 = existsSync(historicalNotesV026Path)
  ? readFileSync(historicalNotesV026Path, 'utf8')
  : ''

// v0.2.2 is explicit published history: its notes are still covered even after
// the released-notes anchor moved forward.
const historicalNotesV022Path = join(repoRoot, 'docs/release-notes/v0.2.2.md')
const historicalNotesV022 = existsSync(historicalNotesV022Path)
  ? readFileSync(historicalNotesV022Path, 'utf8')
  : ''

// v0.2.7 is the newest published version; its notes stay byte-identical as
// history once the converged version owns the release-notes anchor.
const historicalNotesV027Path = join(repoRoot, 'docs/release-notes/v0.2.7.md')
const historicalNotesV027 = existsSync(historicalNotesV027Path)
  ? readFileSync(historicalNotesV027Path, 'utf8')
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
    // The README status line is a published fact, so it anchors the last shipped
    // tag instead of the converged one; a wrap-up commit updates README line 5
    // and the constant after each release.
    for (const line of [readmeStatusLine(readmeEn), readmeStatusLine(readmeZh)]) {
      expect(line).toContain(latestPublishedTag)
    }
    // The newest published anchor is the shipped tag; it trails the converged
    // version until the release wrap-up moves README line 5 forward.
    expect(publishedTags).toContain(latestPublishedTag)
    expect(latestPublishedTag).not.toBe(currentTag)
    expect(isTagBefore(latestPublishedTag, currentTag)).toBe(true)
    expect(isTagBefore(previousPublishedTag, latestPublishedTag)).toBe(true)
    expect(isTagBefore(previousPublishedTag, currentTag)).toBe(true)
    expect(releaseWorkflow).toContain(`default: '${currentTag}'`)
    expect(releaseProcessDoc).toContain(`default: '${currentTag}'`)
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
    expect(signingDoc).toContain(`正式版发布姿态（${latestPublishedTag}）`)
    expect(signingDoc).toContain(`docs/release-notes/${latestPublishedTag}.md`)
    expect(signingDoc).not.toMatch(/发布冻结/)
    // The v0.1.2 drift record stays documented rather than being deleted.
    expect(signingDoc).toMatch(/v0\.1\.2/)
  })

  it('records the v0.1.2 drift facts in the signing doc', () => {
    for (const fact of driftFacts) {
      expect(signingDoc).toMatch(fact)
    }
  })

  it('keeps credential names, team id and local paths out of both READMEs', () => {
    for (const doc of [readmeEn, readmeZh]) {
      for (const secret of signingSecrets) {
        expect(doc).not.toContain(secret)
      }
      expect(doc).not.toContain('3X4J53U6RY')
      expect(doc).not.toContain('Tao Zhu')
      expect(doc).not.toContain('/Users/')
      expect(doc).toContain('docs/release-signing.md')
    }
  })

  it('reports the latest published tag once on line 5 and links that release', () => {
    for (const line of [readmeStatusLine(readmeZh), readmeStatusLine(readmeEn)]) {
      expect(line).toContain(latestPublishedTag)
      expect([...line.matchAll(/releases\/tag\//g)]).toHaveLength(1)
      expect(line).toContain(`releases/tag/${latestPublishedTag}`)
    }
    expect(readmeZh).not.toContain(pendingWord)
    for (const doc of [readmeEn, readmeZh]) {
      expect(doc).not.toContain(`releases/tag/${previousPublishedTag}`)
      expect(doc).not.toContain('releases/tag/v0.2.4')
      expect(doc).not.toContain('releases/tag/v0.2.2')
      expect(doc).not.toContain(`releases/tag/${ghostTag}`)
    }
  })

  it('keeps the fixed-issue history in the release notes instead of the READMEs', () => {
    for (const phrase of ['v0.2.2 及更早', '悬空符号链接', '不可读项', '已跳过']) {
      expect(historicalNotesV024).toContain(phrase)
    }
    for (const phrase of ['8 路', '有界并发', '文件句柄耗尽', 'EMFILE']) {
      expect(historicalNotesV022).toContain(phrase)
    }
    for (const doc of [readmeEn, readmeZh]) {
      expect(doc).not.toContain('悬空符号链接')
      expect(doc).not.toContain('dangling symlink')
      expect(doc).not.toContain('EMFILE')
    }
  })

  it('documents the no-follow symlink policy in its own doc', () => {
    const issues = readmeZh.slice(readmeZh.indexOf('## 已知问题'))
    expect(issues).not.toContain('符号链接计数放大')
    expect(readmeZh).not.toMatch(/悬空符号链接[^\n]*跳过并计数/)
    expect(readmeEn).not.toMatch(/symlink[^\n]*count inflation/i)
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
    for (const doc of [readmeEn, readmeZh]) {
      expect(doc).toContain('docs/symlink-no-follow.md')
    }
  })

  it('keeps the workflow_dispatch default in sync between the release doc and the workflow', () => {
    expect(releaseProcessDoc).toContain('workflow_dispatch')
    expect(releaseProcessDoc).toContain(`default: '${currentTag}'`)
    expect(releaseWorkflow).toContain(`default: '${currentTag}'`)
    for (const doc of [readmeEn, readmeZh]) {
      expect(doc).not.toContain('workflow_dispatch')
      expect(doc).toContain('docs/release-process.md')
    }
  })

  it('documents that version convergence leaves the README status line alone', () => {
    for (const phrase of [
      'README 第 5 行',
      '已发布',
      '不改这一行',
      'latestPublishedTag',
      '收尾提交'
    ]) {
      expect(releaseProcessDoc).toContain(phrase)
    }
  })

  it('reports the signing doc status as published for the latest published tag', () => {
    expect(signingDoc).toContain(`当前状态：${latestPublishedTag} 已发布`)
    expect(signingDoc).toContain(`正式版发布姿态（${latestPublishedTag}）`)
    expect(signingDoc).toContain(`docs/release-notes/${latestPublishedTag}.md`)
    expect(signingDoc).toContain(`docs/release-evidence/${latestPublishedTag}.md`)
    expect(signingDoc).not.toContain(pendingWord)
    // The re-issue entry keeps the converged version as its dispatch default.
    expect(signingDoc).toContain(`默认 \`${currentTag}\``)
    expect(signingDoc).not.toContain(`当前状态：${previousPublishedTag}`)
    expect(signingDoc).not.toContain('当前状态：v0.2.4')
    expect(signingDoc).not.toContain('当前状态：v0.2.2')
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

  it('orders the current, v0.2.6, v0.2.5, v0.2.4, v0.2.2, v0.2.0 and v0.1.2 entries newest first', () => {
    const current = changelog.indexOf(`## ${currentTag}`)
    // The published anchors are explicit literals, not derived from the current
    // tag, so a version convergence keeps the shipped history in place.
    const latestPublished = changelog.indexOf(`## ${latestPublishedTag}`)
    const lastReleased = changelog.indexOf(`## ${previousPublishedTag}`)
    const releasedV025 = changelog.indexOf('## v0.2.5')
    const released = changelog.indexOf('## v0.2.4')
    const previousEntry = changelog.indexOf('## v0.2.2')
    const superseded = changelog.indexOf('## v0.2.0')
    const previous = changelog.indexOf('## v0.1.2')
    expect(current).toBeGreaterThan(-1)
    // The converged version sits above the shipped one; the wrap-up commit
    // that moves README line 5 forward also makes the two indices equal.
    expect(latestPublished).toBeGreaterThan(current)
    expect(lastReleased).toBeGreaterThan(latestPublished)
    expect(releasedV025).toBeGreaterThan(lastReleased)
    expect(released).toBeGreaterThan(releasedV025)
    expect(previousEntry).toBeGreaterThan(released)
    expect(superseded).toBeGreaterThan(previousEntry)
    expect(previous).toBeGreaterThan(superseded)
  })

  it('documents the Windows absolute-path fix in the v0.2.6 changelog entry', () => {
    const start = changelog.indexOf(`## ${previousPublishedTag}`)
    const end = changelog.indexOf('## v0.2.5')
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

  it('documents the HTML report export and the Open Rebuilds rename in the current entry', () => {
    const start = changelog.indexOf(`## ${currentTag}`)
    const end = changelog.indexOf(`## ${latestPublishedTag}`)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const section = changelog.slice(start, end)
    for (const phrase of [
      '### 新增',
      '### 改进',
      '### 升级方式',
      'HTML',
      '自包含',
      '隐藏本机路径',
      '200,000',
      '10 MB',
      'Open Rebuilds',
      'https://github.com/munk-sh/open-rebuilds',
      latestPublishedTag
    ]) {
      expect(section).toContain(phrase)
    }
    expect(section).not.toMatch(/\b(?:TODO|TBD|FIXME)\b/)
    expect(section).not.toMatch(/[0-9a-f]{64}/)
    // No benchmark numbers are claimed for this release; the documented byte
    // cap is the only MB figure the entry may carry.
    expect(section).not.toMatch(/\b\d+(?:[.,]\d+)?\s*(?:GiB|MiB|GB)\b/)
    expect(section.match(/\b\d+(?:[.,]\d+)?\s*MB\b/g) ?? []).toEqual(['10 MB'])
  })

  it('keeps the bilingual UI and the 9-section README in the v0.2.7 entry as history', () => {
    const start = changelog.indexOf(`## ${latestPublishedTag}`)
    const end = changelog.indexOf(`## ${previousPublishedTag}`)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const section = changelog.slice(start, end)
    for (const phrase of [
      '### 新增',
      '### 改进',
      '### 升级方式',
      '双语',
      '系统语言',
      'zh',
      '设置',
      '持久化',
      '即时生效',
      '无需重启',
      'README',
      '9 节',
      'docs/',
      '已知问题'
    ]) {
      expect(section).toContain(phrase)
    }
    expect(section).not.toMatch(/\b(?:TODO|TBD|FIXME)\b/)
    expect(section).not.toMatch(/[0-9a-f]{64}/)
  })

  it('keeps the v0.2.5 fixes in the released changelog entry as history', () => {
    const start = changelog.indexOf('## v0.2.5')
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
    // The converged entry and the shipped one; no ghost version in between.
    expect(headings).toEqual([currentTag, latestPublishedTag])
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
    expect(signingDoc).toContain(`tag 之后的修复由 ${latestPublishedTag} 承接`)
  })

  it('ships the current release notes as paste-ready source text', () => {
    expect(existsSync(releaseNotesPath)).toBe(true)
    expect(releaseNotes.trim().length).toBeGreaterThan(0)
    expect(firstHeading(releaseNotes)).toContain(currentTag)
  })

  it('anchors the newest published release notes at the shipped tag', () => {
    // A version convergence keeps the published notes at the shipped tag while
    // the converged notes file is already in place for the coming release.
    expect(existsSync(lastReleasedNotesPath)).toBe(true)
    expect(firstHeading(lastReleasedNotes)).toContain(latestPublishedTag)
    expect(existsSync(releaseNotesPath)).toBe(true)
    expect(firstHeading(releaseNotes)).toContain(currentTag)
    expect(lastReleasedNotesPath).not.toBe(releaseNotesPath)
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

  it('documents the v0.2.6 release notes with the Windows path fix and evidence', () => {
    expect(existsSync(historicalNotesV026Path)).toBe(true)
    expect(firstHeading(historicalNotesV026)).toContain(previousPublishedTag)
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
      expect(historicalNotesV026).toContain(phrase)
    }
    expect(historicalNotesV026).not.toContain('待验证')
    expect(historicalNotesV026).not.toContain('预计通过')
    expect(historicalNotesV026).not.toContain('应该通过')
    expect(historicalNotesV026).not.toMatch(/\b(?:TODO|TBD|FIXME)\b/)
    expect(historicalNotesV026).not.toMatch(/[0-9a-f]{64}/)
  })

  it('documents the current release notes with the HTML report and the Open Rebuilds rename', () => {
    expect(firstHeading(releaseNotes)).toContain(currentTag)
    for (const phrase of [
      'HTML',
      '自包含',
      '内联 CSS',
      '无 JS',
      '无外链',
      'http(s)',
      'file://',
      '隐藏本机路径',
      '200,000',
      '10 MB',
      '四态计数',
      '<html lang>',
      'Open Rebuilds',
      'https://github.com/munk-sh/open-rebuilds',
      '升级方式',
      latestPublishedTag
    ]) {
      expect(releaseNotes).toContain(phrase)
    }
    expect(releaseNotes).not.toContain('待验证')
    expect(releaseNotes).not.toContain('预计通过')
    expect(releaseNotes).not.toContain('应该通过')
    expect(releaseNotes).not.toMatch(/\b(?:TODO|TBD|FIXME)\b/)
    expect(releaseNotes).not.toMatch(/[0-9a-f]{64}/)
    // No benchmark numbers or timelines are claimed for this release; the
    // documented byte cap is the only MB figure the notes may carry.
    expect(releaseNotes).not.toMatch(/\b\d+(?:[.,]\d+)?\s*(?:GiB|MiB|GB)\b/)
    expect(releaseNotes.match(/\b\d+(?:[.,]\d+)?\s*MB\b/g) ?? []).toEqual(['10 MB'])
  })

  it('keeps the v0.2.7 bilingual UI release notes as shipped history', () => {
    expect(existsSync(historicalNotesV027Path)).toBe(true)
    expect(firstHeading(historicalNotesV027)).toContain(latestPublishedTag)
    for (const phrase of [
      '双语',
      '系统语言',
      '设置',
      '持久化',
      '即时生效',
      '无需重启',
      'README',
      '9 节',
      '升级方式',
      latestPublishedTag
    ]) {
      expect(historicalNotesV027).toContain(phrase)
    }
    expect(historicalNotesV027).not.toContain('待验证')
    expect(historicalNotesV027).not.toContain('预计通过')
    expect(historicalNotesV027).not.toContain('应该通过')
    expect(historicalNotesV027).not.toMatch(/\b(?:TODO|TBD|FIXME)\b/)
    expect(historicalNotesV027).not.toMatch(/[0-9a-f]{64}/)
  })

  it('keeps the v0.2.5 release notes as released history', () => {
    expect(existsSync(historicalNotesV025Path)).toBe(true)
    expect(firstHeading(historicalNotesV025)).toContain('v0.2.5')
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

  it('keeps the single-line release status on line 5 of both READMEs', () => {
    const zhStatus = readmeZh.split(/\r?\n/)[4] ?? ''
    expect(zhStatus).toContain(`最新公开版本：[${latestPublishedTag}]`)
    expect(zhStatus).toContain('Developer ID')
    expect(zhStatus).toContain('公证')
    expect([...zhStatus.matchAll(/releases\/tag\//g)]).toHaveLength(1)
    expect(zhStatus).toContain(`releases/tag/${latestPublishedTag}`)
    expect(zhStatus).not.toContain(pendingWord)
    expect(zhStatus).not.toContain(ghostNotesPath)

    const enStatus = readmeEn.split(/\r?\n/)[4] ?? ''
    expect(enStatus).toContain(`Latest public release: [${latestPublishedTag}]`)
    expect(enStatus).toContain('Developer ID')
    expect(enStatus).toMatch(/notariz/i)
    expect([...enStatus.matchAll(/releases\/tag\//g)]).toHaveLength(1)
    expect(enStatus).toContain(`releases/tag/${latestPublishedTag}`)
    expect(enStatus).not.toContain(pendingWord)
    expect(enStatus).not.toContain(ghostNotesPath)

    for (const status of [zhStatus, enStatus]) {
      for (const secret of signingSecrets) {
        expect(status).not.toContain(secret)
      }
    }
  })

  it('drops the version table and keeps known issues to the current unfixed state', () => {
    for (const doc of [readmeEn, readmeZh]) {
      expect(doc).not.toContain('| Version |')
      expect(doc).not.toContain('| 版本 |')
      expect(doc).not.toContain(`| [${latestPublishedTag}]`)
    }

    const zhIssues = readmeZh.slice(readmeZh.indexOf('## 已知问题'), readmeZh.indexOf('## 证据与文档'))
    expect(zhIssues).toContain('当前没有已知未修复问题。')
    expect(zhIssues).toContain('https://github.com/chaxiu/OpenCompare/issues')

    const enIssues = readmeEn.slice(
      readmeEn.indexOf('## Known issues'),
      readmeEn.indexOf('## Evidence and docs')
    )
    expect(enIssues).toContain('None known right now.')
    expect(enIssues).toContain('https://github.com/chaxiu/OpenCompare/issues')

    for (const section of [zhIssues, enIssues]) {
      for (const banned of [
        'Fixed in',
        '已修复',
        'v0.2.',
        'ECANCELED',
        'EMFILE',
        '1,960,394,752'
      ]) {
        expect(section).not.toContain(banned)
      }
    }

    // The fixed-issue history lives in the release notes and perf evidence.
    for (const phrase of ['不跟随符号链接', '已跳过：左 X / 右 Y', 'ECANCELED']) {
      expect(historicalNotesV025).toContain(phrase)
    }
    const perfDoc = readFileSync(join(repoRoot, 'docs/perf/large-directory-memory.md'), 'utf8')
    for (const number of ['1,960,394,752', '1,257,750,528', '71,286,784']) {
      expect(perfDoc).toContain(number)
    }
  })
})

// The published README carries one status line; the release assets themselves
// live in the release evidence record asserted further below.
const readmeStatusLine = (markdown: string): string => markdown.split(/\r?\n/)[4] ?? ''

// The newest published-asset digests are release-time facts; pinning them here
// makes a fabricated or hand-edited evidence record fail `pnpm test`.
const releaseEvidencePath = join(repoRoot, `docs/release-evidence/${latestPublishedTag}.md`)
const releaseEvidence = existsSync(releaseEvidencePath)
  ? readFileSync(releaseEvidencePath, 'utf8')
  : ''

const publishedEvidenceAssets: Array<[name: string, sha256: string]> = [
  [
    'OpenCompare-0.2.7-arm64.dmg',
    '4375fe95f5048195e1bcf46513da6291a8363585ed01f6f636ec18845a24e8f5'
  ],
  [
    'OpenCompare-0.2.7-arm64.dmg.blockmap',
    'd5c8ff7e0efba2ddf59c9502c1b0d14f397e00918189ac93b3228274c7b2a554'
  ],
  [
    'OpenCompare-0.2.7-arm64-mac.zip',
    '24a047c1364bc2621f1de6a6091815c27533a63d4906d96dfdd344b6b828e98e'
  ],
  [
    'OpenCompare-0.2.7-arm64-mac.zip.blockmap',
    '09252378a3afcf41a13758c79e5ca628c293b12cb1143b387d4645a4bc59cc6b'
  ],
  [
    'OpenCompare-Setup-0.2.7.exe',
    'bc3563ecd98fd13903fd2ab829a997d337779474ed17c0373aa15f2ef0d59806'
  ],
  [
    'OpenCompare-Setup-0.2.7.exe.blockmap',
    'ad84d71bdd0d33d17e739930695b6f241a695158feec76e81b755b368489564b'
  ],
  [
    'OpenCompare-0.2.7.AppImage',
    '406f61840383b0b10899456ac682360b115a9d0c558a2b9620a7576e26d05aa8'
  ],
  [
    'opencompare_0.2.7_amd64.deb',
    '13c0a4d0441633a462111ce0d74e07b95e3f1b811605594fff816068b1610ea8'
  ],
  ['latest.yml', '2e902100c9f85e5434e01d9fa59f28bed675ec3c78e050b02f7e4d662cbd2902'],
  ['latest-mac.yml', 'a5ba8a740f5bf501431200d26ed62b52f6de156547899a5f1f2905593ae85e5b'],
  ['latest-linux.yml', '5a954755eb2e36ff4a954b34dc689503e8b57c95a371776bf81a99e63e35ed68']
]

// v0.2.6 shipped before the current version: its evidence record and asset
// digests stay pinned as explicit history instead of following the anchor.
const historicalEvidenceV026Path = join(repoRoot, 'docs/release-evidence/v0.2.6.md')
const historicalEvidenceV026 = existsSync(historicalEvidenceV026Path)
  ? readFileSync(historicalEvidenceV026Path, 'utf8')
  : ''

const historicalEvidenceV026Assets: Array<[name: string, sha256: string]> = [
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
  it('declares the same published version on line 5 of both READMEs and in package.json', () => {
    const zhStatus = readmeStatusLine(readmeZh)
    const enStatus = readmeStatusLine(readmeEn)
    for (const status of [zhStatus, enStatus]) {
      expect(status).toContain(`[${latestPublishedTag}]`)
      expect(status).toContain(`releases/tag/${latestPublishedTag}`)
    }
    expect(currentTag).toBe(`v${pkg.version}`)
    // The release shipped: both READMEs must link the published tag.
    for (const doc of [readmeEn, readmeZh]) {
      expect(doc).toContain(`releases/tag/${latestPublishedTag}`)
    }
  })

  it('sends downloads to the releases page instead of versioned asset urls', () => {
    for (const doc of [readmeEn, readmeZh]) {
      expect(doc).toContain('https://github.com/chaxiu/OpenCompare/releases')
      expect(doc).not.toContain('releases/download/')
      expect(doc).not.toContain(`OpenCompare-${pkg.version}-arm64.dmg`)
      expect(doc).not.toContain(`OpenCompare-Setup-${pkg.version}.exe`)
    }
  })
})

const readmeLines = (markdown: string): string[] => markdown.split(/\r?\n/)
const stripLanguageSwitch = (markdown: string): string =>
  readmeLines(markdown)
    .filter(
      (line) => !line.includes('README.zh-CN.md') && !line.includes('[English](./README.md)')
    )
    .join('\n')

describe('bilingual README parity', () => {
  const h2Headings = (markdown: string): string[] =>
    readmeLines(markdown)
      .filter((line) => line.startsWith('## '))
      .map((line) => line.slice(3))

  const readmeSection = (markdown: string, heading: string, next: string): string => {
    const start = markdown.indexOf(heading)
    const end = markdown.indexOf(next, start)
    return start === -1 || end === -1 ? '' : markdown.slice(start, end)
  }

  // Word-count rule shared with the delivery notes: drop fenced code, keep link
  // text, drop URLs, inline code and HTML, then count Latin words.
  const wordCount = (markdown: string): number => {
    let text = markdown.replace(/```[\s\S]*?```/g, ' ')
    text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    text = text.replace(/https?:\/\/\S+/g, ' ')
    text = text.replace(/`[^`]*`/g, ' ')
    text = text.replace(/<[^>]+>/g, ' ')
    return (text.match(/[A-Za-z][A-Za-z0-9'’-]*/g) ?? []).length
  }

  it('ships an English default with no Han characters outside the language switch', () => {
    expect(readmeEn.trim().length).toBeGreaterThan(0)
    expect(readmeLines(readmeEn)[0]).toBe('# OpenCompare')
    expect(stripLanguageSwitch(readmeEn)).not.toMatch(/\p{Script=Han}/u)
    for (const heading of ['## 已知问题', '## 核心能力', '## 下载与安装']) {
      expect(readmeEn).not.toContain(heading)
    }
  })

  it('ships exactly nine mirrored H2 sections in both versions', () => {
    expect(readmeZh.trim().length).toBeGreaterThan(0)
    expect(readmeLines(readmeZh)[0]).toBe('# OpenCompare')
    expect(h2Headings(readmeEn)).toEqual([
      'Download and install',
      'Features',
      'Quickstart',
      'Requirements and development',
      'Project structure',
      'Known issues',
      'Evidence and docs',
      'Open Rebuilds 001',
      'License'
    ])
    expect(h2Headings(readmeZh)).toEqual([
      '下载与安装',
      '核心能力',
      '快速上手',
      '环境要求与开发',
      '项目结构',
      '已知问题',
      '证据与文档',
      'Open Rebuilds 001 平替',
      '许可'
    ])
  })

  it('keeps the English body within the 700 word budget', () => {
    expect(wordCount(readmeEn)).toBeLessThanOrEqual(700)
    for (const doc of [readmeEn, readmeZh]) {
      expect(doc).not.toMatch(/\b(?:TODO|TBD|FIXME)\b/)
      expect(doc).not.toContain('待补')
      expect(doc.toLowerCase()).not.toContain('roadmap')
    }
  })

  it('cross-links the two versions in the first ten lines', () => {
    expect(readmeLines(readmeEn).slice(0, 10).join('\n')).toContain(
      '[简体中文](./README.zh-CN.md)'
    )
    expect(readmeLines(readmeZh).slice(0, 10).join('\n')).toContain('[English](./README.md)')
    for (const path of ['README.md', 'README.zh-CN.md']) {
      expect(existsSync(join(repoRoot, path))).toBe(true)
      expect(readFileSync(join(repoRoot, path), 'utf8').trim().length).toBeGreaterThan(0)
    }
  })

  it('keeps title, language switch and the status line on the same first five lines', () => {
    for (const doc of [readmeEn, readmeZh]) {
      const lines = readmeLines(doc)
      expect(lines[0]).toBe('# OpenCompare')
      expect((lines[1] ?? '').trim()).toBe('')
      expect(lines[2]).toContain('README.')
      expect((lines[3] ?? '').trim()).toBe('')
      expect(lines[4]).toMatch(/^> (?:Latest public release:|最新公开版本：)/)
    }
  })

  it('keeps only the release and license badges in the first screen', () => {
    for (const doc of [readmeEn, readmeZh]) {
      const head = readmeLines(doc).slice(0, 12).join('\n')
      expect([...head.matchAll(/img\.shields\.io/g)]).toHaveLength(2)
      expect(head).toContain('github/v/release')
      expect(head).toContain('license-MIT')
      expect(head).not.toMatch(/actions\/workflow|badge\/branch|github\/actions/i)
    }
  })

  it('ships one real workbench screenshot referenced by both READMEs', () => {
    const screenshot = join(repoRoot, 'docs/assets/opencompare-workbench.png')
    expect(existsSync(screenshot)).toBe(true)
    const bytes = readFileSync(screenshot)
    expect(bytes.subarray(0, 4).equals(PNG_SIGNATURE)).toBe(true)
    expect(bytes.readUInt32BE(16)).toBeGreaterThanOrEqual(1000)
    expect(bytes.readUInt32BE(20)).toBeGreaterThanOrEqual(600)
    expect(bytes.length).toBeGreaterThan(10 * 1024)
    for (const doc of [readmeEn, readmeZh]) {
      expect(doc).toContain('docs/assets/opencompare-workbench.png')
    }
    expect(readFileSync(join(repoRoot, '.gitignore'), 'utf8')).not.toMatch(
      /opencompare-workbench/
    )
  })

  it('documents the three platform downloads in both READMEs', () => {
    for (const doc of [readmeEn, readmeZh]) {
      expect(doc).toContain('.dmg')
      expect(doc).toContain('Applications')
      expect(doc).toContain('.exe')
      expect(doc).toContain('chmod +x')
      expect(doc).toContain('.AppImage')
      expect(doc).toContain('.deb')
      expect(doc).toContain('https://github.com/chaxiu/OpenCompare/releases')
      expect(doc).not.toContain(`OpenCompare-Setup-${pkg.version}.exe`)
    }
  })

  it('lists exactly five user-facing features in both READMEs', () => {
    const enFeatures = readmeSection(readmeEn, '## Features', '## Quickstart')
    const zhFeatures = readmeSection(readmeZh, '## 核心能力', '## 快速上手')
    for (const featureBlock of [enFeatures, zhFeatures]) {
      const items = featureBlock.split(/\r?\n/).filter((line) => line.startsWith('- '))
      expect(items).toHaveLength(5)
      expect(featureBlock).not.toContain('Fixed in')
      expect(featureBlock).not.toContain('已修复')
      expect(featureBlock).not.toMatch(/v0\.2\./)
    }
  })

  it('walks through paths, four states, drill-down and sync in Quickstart', () => {
    const enQuickstart = readmeSection(readmeEn, '## Quickstart', '## Requirements and development')
    const zhQuickstart = readmeSection(readmeZh, '## 快速上手', '## 环境要求与开发')
    for (const fact of ['two paths', 'same / added / removed / modified', 'drill down', 'sync']) {
      expect(enQuickstart).toContain(fact)
    }
    for (const fact of ['两个路径', '相同 / 新增 / 删除 / 修改', '下钻', '同步']) {
      expect(zhQuickstart).toContain(fact)
    }
  })

  it('lists Node, pnpm and every gate command in both READMEs', () => {
    for (const doc of [readmeEn, readmeZh]) {
      expect(doc).toContain('Node.js >= 20.19')
      expect(doc).toContain('pnpm 10')
      for (const command of [
        'pnpm install',
        'pnpm dev',
        'pnpm dev:web',
        'pnpm lint',
        'pnpm typecheck',
        'pnpm test',
        'pnpm build',
        'pnpm build:web'
      ]) {
        expect(doc).toContain(command)
      }
    }
  })

  it('keeps the five-line project structure in both READMEs', () => {
    for (const [doc, heading, next] of [
      [readmeEn, '## Project structure', '## Known issues'],
      [readmeZh, '## 项目结构', '## 已知问题']
    ] as Array<[string, string, string]>) {
      const structure = readmeSection(doc, heading, next)
      for (const path of [
        'src/main/',
        'src/preload/',
        'src/core/',
        'src/renderer/',
        'src/shared/'
      ]) {
        expect(structure).toContain(path)
      }
      const fenced = /```(?:text)?\n([\s\S]*?)```/.exec(structure)?.[1] ?? ''
      expect(fenced.trim().split(/\r?\n/)).toHaveLength(5)
    }
  })

  it('indexes the docs and performance evidence in one line each', () => {
    for (const [doc, heading, next] of [
      [readmeEn, '## Evidence and docs', '## Open Rebuilds 001'],
      [readmeZh, '## 证据与文档', '## Open Rebuilds 001 平替']
    ] as Array<[string, string, string]>) {
      const evidence = readmeSection(doc, heading, next)
      for (const path of [
        'docs/release-process.md',
        'docs/release-signing.md',
        'docs/symlink-no-follow.md',
        'docs/perf/large-directory-memory.md'
      ]) {
        expect(evidence).toContain(path)
      }
      const perfLine = evidence
        .split(/\r?\n/)
        .find((line) => line.includes('Performance & memory evidence'))
      expect(perfLine).toBeDefined()
      expect(perfLine).toContain('docs/perf/upsert-memory-diagnosis-2026-10-23.md')
      expect(perfLine).toContain('docs/perf/large-directory-memory.md')
    }
  })

  it('drops measured memory numbers from both READMEs', () => {
    for (const doc of [readmeEn, readmeZh]) {
      expect(doc).not.toContain('MiB')
      expect(doc).not.toContain('GiB')
      for (const number of [
        '76,604',
        '11,105,870,346',
        '21.6',
        '22.5',
        '8.5',
        '10.0',
        '1.68',
        '1.81',
        '1.24',
        '1.9–2.0',
        '1.6–1.9',
        '2.15–2.5'
      ]) {
        expect(doc).not.toContain(number)
      }
      expect(doc.toLowerCase()).not.toContain('archived evidence')
      expect(doc.toLowerCase()).not.toContain('memory target')
    }
  })

  it('keeps TODO markers and delivery schedules out of both READMEs and the metadata doc', () => {
    const metadataDoc = readFileSync(join(repoRoot, 'docs/repo-metadata.md'), 'utf8')
    for (const doc of [readmeEn, readmeZh, metadataDoc]) {
      expect(doc).not.toMatch(/\b(?:TODO|TBD|FIXME)\b/)
      expect(doc).not.toContain('待补')
      expect(doc).not.toContain('预计')
      expect(doc.toLowerCase()).not.toContain('roadmap')
    }
  })

  it('links the Open Rebuilds 001 alternative in both READMEs', () => {
    expect(readmeEn).toContain(
      'OpenCompare is a free MIT alternative to Beyond Compare 5 Pro, tracked as alternative 001 in [Open Rebuilds](https://github.com/munk-sh/open-rebuilds).'
    )
    expect(readmeZh).toContain(
      'OpenCompare 是 Beyond Compare 5 Pro 的免费 MIT 平替，收录为 [Open Rebuilds](https://github.com/munk-sh/open-rebuilds) 系列第 001 号项目。'
    )
    for (const doc of [readmeEn, readmeZh]) {
      expect(doc).toContain('https://github.com/munk-sh/open-rebuilds')
      expect(doc).toContain('001')
      expect(doc).toContain('Beyond Compare 5 Pro')
    }
  })

  it('keeps only the published tag and shared project facts in both READMEs', () => {
    for (const doc of [readmeEn, readmeZh]) {
      expect(doc).toContain(latestPublishedTag)
      expect(doc).toContain('https://github.com/munk-sh/open-rebuilds')
      expect(doc).toContain('Beyond Compare 5 Pro')
      const otherLines = readmeLines(doc)
        .filter((_, index) => index !== 4)
        .join('\n')
      expect(otherLines).not.toMatch(/\bv\d+\.\d+\.\d+\b/)
    }
  })

  it('ships English repository metadata with a paste-ready gh command', () => {
    const path = join(repoRoot, 'docs/repo-metadata.md')
    expect(existsSync(path)).toBe(true)
    const doc = readFileSync(path, 'utf8')
    expect(doc.trim().length).toBeGreaterThan(0)
    const description = /## Description\n\n```text\n([\s\S]*?)\n```/.exec(doc)?.[1] ?? ''
    expect(description.trim().length).toBeGreaterThan(0)
    expect(description.trim().length).toBeLessThanOrEqual(350)
    expect(description).not.toMatch(/\p{Script=Han}/u)

    const topicsSection = doc.slice(doc.indexOf('## Topics'), doc.indexOf('## Command'))
    const topics = [...topicsSection.matchAll(/`([^`]+)`/g)].map((match) => match[1])
    expect(topics.length).toBeGreaterThanOrEqual(1)
    expect(topics.length).toBeLessThanOrEqual(20)
    expect(new Set(topics).size).toBe(topics.length)
    for (const topic of topics) {
      expect(topic).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    }

    const commandSection = doc.slice(doc.indexOf('## Command'))
    expect(commandSection).toContain('gh repo edit chaxiu/OpenCompare')
    expect(commandSection).toContain('--description')
    for (const topic of topics) {
      expect(commandSection).toContain(`--add-topic ${topic}`)
    }
    expect(doc).not.toMatch(/\bgh[op]_[A-Za-z0-9]+/)
    expect(doc.toLowerCase()).not.toContain('token')
    expect(doc.toLowerCase()).not.toContain('secret')
  })

  it('marks repository metadata as the independent last step and failure-tolerant', () => {
    const doc = readFileSync(join(repoRoot, 'docs/repo-metadata.md'), 'utf8')
    expect(doc.toLowerCase()).toContain('independent last step')
    expect(doc.toLowerCase()).toContain('quality gates')
    expect(doc.toLowerCase()).toContain('raw stderr')
    expect(doc.toLowerCase()).toContain('do not block')
  })

  it('scans both READMEs as release documents', () => {
    const paths = documentPaths().map((path) => relative(repoRoot, path))
    expect(paths).toContain('README.md')
    expect(paths).toContain('README.zh-CN.md')
  })
})

describe('v0.2.6 verified release evidence record (historical)', () => {
  it('exists, is non-empty and declares the verified run identity', () => {
    expect(existsSync(historicalEvidenceV026Path)).toBe(true)
    expect(historicalEvidenceV026.trim().length).toBeGreaterThan(0)
    expect(historicalEvidenceV026).toMatch(/^status:\s*verified$/m)
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
      expect(historicalEvidenceV026).toContain(marker)
    }
    expect(historicalEvidenceV026).not.toMatch(/\b(?:TODO|TBD|FIXME)\b/)
  })

  it('lists all five release CI jobs as successful for the tagged commit', () => {
    const rows = historicalEvidenceV026.split(/\r?\n/).filter((line) => line.startsWith('| '))
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
    expect(historicalEvidenceV026).toContain(
      'headSha `30967cd1e8fd521fa517588b2a7ac503305797e5`'
    )
  })

  it('pins every published asset name, sha256 and public url', () => {
    expect(historicalEvidenceV026Assets).toHaveLength(11)
    for (const [name, sha] of historicalEvidenceV026Assets) {
      expect(historicalEvidenceV026).toContain(`\`${name}\``)
      expect(historicalEvidenceV026).toContain(sha)
      expect(historicalEvidenceV026).toContain(
        `https://github.com/chaxiu/OpenCompare/releases/download/v0.2.6/${name}`
      )
    }
    for (const marker of [
      'version: 0.2.6',
      'path: OpenCompare-Setup-0.2.6.exe',
      '102,945,648'
    ]) {
      expect(historicalEvidenceV026).toContain(marker)
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
      expect(historicalEvidenceV026).toContain(marker)
    }
    // The dmg container boundary is recorded instead of being glossed over.
    expect(historicalEvidenceV026).toContain('dmg 容器文件本身')
    expect(historicalEvidenceV026).toContain('exit 65')
  })
})

describe('v0.2.7 verified release evidence record', () => {
  it('exists, is non-empty and declares the verified run identity', () => {
    expect(existsSync(releaseEvidencePath)).toBe(true)
    expect(releaseEvidence.trim().length).toBeGreaterThan(0)
    expect(releaseEvidence).toMatch(/^status:\s*verified$/m)
    for (const marker of [
      'adc6e1e50b84e211d1e1791a4ae61b6d6ba87d24',
      'e071f876da8cf502728e4d31b2699da8254629d5',
      '422765578',
      '2026-10-24T14:05:12Z',
      'draft=false',
      'prerelease=false',
      '40100596470',
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
      'headSha `e071f876da8cf502728e4d31b2699da8254629d5`'
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
      'version: 0.2.7',
      'path: OpenCompare-Setup-0.2.7.exe',
      '102,964,024'
    ]) {
      expect(releaseEvidence).toContain(marker)
    }
  })

  it('records the uniqueness, latest gate and notarization markers', () => {
    for (const marker of [
      `releases for ${latestPublishedTag}: 1 (drafts: 0, prereleases: 0)`,
      `latest published release: ${latestPublishedTag} (this tag: ${latestPublishedTag})`,
      `\`releases/latest\` = \`${latestPublishedTag}\``,
      'notarization successful',
      // The evidence record is shipped history: its bundle version must stay
      // the released one instead of drifting with package.json.
      'CFBundleShortVersionString=0.2.7',
      'com.opencompare.app',
      'valid on disk',
      'satisfies its Designated Requirement',
      'The validate action worked!',
      'accepted',
      'source=Notarized Developer ID',
      publishedEvidenceAssets[0][1]
    ]) {
      expect(releaseEvidence).toContain(marker)
    }
  })

  it('archives the L1 recheck with all four load legs blocked', () => {
    for (const marker of [
      'blocked',
      'ZenMind',
      'Δ3=2.06 MB',
      '116 ms',
      '3,043 / 5,262 / 46,827 / 1,377',
      '51,247 / 9,682 / 53,466'
    ]) {
      expect(releaseEvidence).toContain(marker)
    }
    expect(releaseEvidence.match(/blocked/g)?.length ?? 0).toBeGreaterThanOrEqual(4)
    // The four load legs stay blocked; the L1 section never claims a pass.
    const l1Section = releaseEvidence.slice(releaseEvidence.indexOf('## 7.'))
    expect(l1Section).not.toBe('')
    expect(l1Section).not.toContain('通过')
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

  it('keeps the release flow in docs/release-process.md and links it from both READMEs', () => {
    for (const marker of [
      '.github/workflows/release.yml',
      'workflow_dispatch',
      'v*',
      'install → lint → typecheck → test → build',
      'v0.1.2',
      'latest*.yml',
      'release:metadata',
      'codesign --verify --deep --strict',
      'xcrun stapler validate',
      'spctl -a -vv',
      '唯一公开 Release'
    ]) {
      expect(releaseProcessDoc).toContain(marker)
    }
    for (const doc of [readmeEn, readmeZh]) {
      expect(doc).toContain('docs/release-process.md')
      expect(doc).not.toContain('codesign --verify')
      expect(doc).not.toContain('xcrun stapler validate')
      expect(doc).not.toContain('spctl -a -vv')
    }
  })

  it('lands the L3 performance group in the release-process doc', () => {
    const evidence = releaseProcessDoc.slice(
      releaseProcessDoc.indexOf('Release-time performance evidence')
    )
    expect(evidence).not.toBe('')
    const normalized = evidence.replaceAll('–', '-')
    for (const range of ['1.9-2.0 GiB', '1.6-1.9 GiB', '2.15-2.5 GiB']) {
      expect(normalized).toContain(range)
    }
    expect(evidence).toContain('1.3M')
    expect(evidence).toContain('3 会话')
    expect(evidence).toContain('原始证据归档在仓库外')
    expect(evidence).toContain('archived outside the repository')
  })

  it('keeps every removed README number in the archived perf docs', () => {
    const perfDocs = readdirSync(join(repoRoot, 'docs/perf'), { recursive: true })
      .map((entry) => String(entry))
      .filter((entry) => entry.endsWith('.md'))
      .map((entry) => readFileSync(join(repoRoot, 'docs/perf', entry), 'utf8'))
      .join('\n')
    for (const number of [
      '76,604',
      '11,105,870,346',
      '21.6',
      '22.5',
      '694',
      '706',
      '8.5',
      '10.0',
      '1.68',
      '1.81',
      '1.28',
      '+20 s'
    ]) {
      expect(perfDocs).toContain(number)
    }
    // The README rounded 1.24 while the docs record 1.25–1.28; docs win.
    expect(perfDocs).toContain('1.25–1.28')
    for (const doc of [readmeEn, readmeZh]) {
      expect(doc).not.toContain('1.24')
    }
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
