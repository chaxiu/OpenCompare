import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BRAND_NAME, buildAboutPanelOptions, resolveBrandIconPath } from '../shared/brand'
import { createMenuTemplate } from './menu'
import {
  bilingualNotes,
  builder,
  currentTag,
  currentVersion,
  finalizeStep,
  packageStep,
  pkg,
  readmeEn,
  readmeZh,
  releaseNotes,
  releaseProcessDoc,
  releaseWorkflow,
  repoRoot,
  signingDoc
} from './release-doc-fixtures.test-helpers'

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
    expect(step).toContain('win) required_exts=(exe zip)')
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

describe('Windows portable zip release surface', () => {
  const versionStep = packageStep('Assert packaged version matches the tag')
  const winRequiredExtsScript = (versionStep?.run ?? '').replaceAll('${{ matrix.target }}', 'win')
  const feedStep = packageStep('Assert the Windows update feed points at the NSIS installer')
  const feedScript = feedStep?.run ?? ''
  const assetsStep = releaseStepBody('Assert the public release has every platform asset')
  const assetsGateScript =
    finalizeStep('Assert the public release has every platform asset')?.run ?? ''

  const setupAsset = `OpenCompare-Setup-${currentVersion}.exe`
  const portableAsset = `OpenCompare-${currentVersion}-win-x64.zip`

  const winLatestYml = (zipEntry: boolean): string =>
    [
      `version: ${currentVersion}`,
      'files:',
      `  - url: ${setupAsset}`,
      '    sha512: fixture',
      '    size: 1',
      ...(zipEntry ? [`  - url: ${portableAsset}`, '    sha512: fixture', '    size: 1'] : []),
      `path: ${setupAsset}`,
      'sha512: fixture'
    ].join('\n')

  // Tempdir fixtures are the only place this suite writes Windows artifacts.
  const runPackagingScript = (
    script: string,
    options: { artifacts?: string[]; latestYml?: string } = {}
  ): { status: number; output: string } => {
    const { artifacts = [], latestYml } = options
    const dir = mkdtempSync(join(tmpdir(), 'opencompare-win-packaging-'))
    try {
      // Each step runs after `pnpm install`, so `node -e` resolves the
      // repository's yaml package; the fixture reuses it instead of a copy.
      symlinkSync(join(repoRoot, 'node_modules'), join(dir, 'node_modules'), 'dir')
      const releaseDir = join(dir, 'release')
      mkdirSync(releaseDir, { recursive: true })
      if (latestYml !== undefined) writeFileSync(join(releaseDir, 'latest.yml'), latestYml)
      for (const artifact of artifacts) writeFileSync(join(releaseDir, artifact), 'fixture')
      const scriptPath = join(dir, 'step.sh')
      writeFileSync(scriptPath, script)
      const result = spawnSync('bash', [scriptPath], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, RELEASE_TAG: currentTag }
      })
      return {
        status: result.status ?? -1,
        output: `${result.stdout ?? ''}${result.stderr ?? ''}`
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  it('builds both the NSIS installer and the portable zip for Windows', () => {
    const targets = builder.win?.target ?? []
    expect(targets).toContain('nsis')
    expect(targets).toContain('zip')
    // No third Windows target: the release matrix promises exactly these two.
    expect([...targets].sort()).toEqual(['nsis', 'zip'])
  })

  it('derives both Windows artifact names from the version with no spaces', () => {
    const setupName = builder.nsis?.artifactName ?? ''
    const winName = builder.win?.artifactName ?? ''
    // The installer keeps its own template, so latest.yml's files[].url shape
    // does not move; the win-level template covers the zip only.
    expect(setupName).toBe('${productName}-Setup-${version}.${ext}')
    expect(winName).toBe('${productName}-${version}-win-${arch}.${ext}')
    for (const pattern of [setupName, winName]) {
      expect(pattern).toContain('${version}')
      expect(pattern).not.toContain(' ')
    }
    const productName = builder.productName ?? ''
    expect(productName).toBe('OpenCompare')
    const render = (pattern: string, ext: string): string =>
      pattern
        .replace('${productName}', productName)
        .replace('${version}', currentVersion)
        .replace('${arch}', 'x64')
        .replace('${ext}', ext)
    expect(render(setupName, 'exe')).toBe(`OpenCompare-Setup-${currentVersion}.exe`)
    expect(render(winName, 'zip')).toBe(`OpenCompare-${currentVersion}-win-x64.zip`)
    expect(render(winName, 'zip')).not.toMatch(/\s/)
  })

  it('produces the portable zip from the built-in target with no extra script', () => {
    // electron-builder's own `zip` target unpacks to a runnable directory, so the
    // build step, the upload glob and package.json need no zip-specific branch.
    const build = packageStep('Build installers')?.run ?? ''
    expect(build).toContain('electron-builder --${{ matrix.target }} --publish never')
    expect(build).not.toMatch(/\bzip\b/)
    for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
      expect(name.toLowerCase()).not.toContain('zip')
      expect(command).not.toContain('zip ')
    }
    for (const dependency of ['archiver', 'adm-zip', 'jszip', 'yazl']) {
      expect(pkg.dependencies?.[dependency]).toBeUndefined()
      expect(pkg.devDependencies?.[dependency]).toBeUndefined()
    }
    const upload = releaseStepBody("Upload installers to the tag's release")
    expect(upload).toContain('release/*.zip')
    expect(upload).toContain('release/*.exe')
  })

  it('requires both Windows extensions in the packaging job', () => {
    expect(builder.win?.target).toContain('zip')
    expect(winRequiredExtsScript).toContain('win) required_exts=(exe zip)')
    // The versioned-name loop covers both extensions, so neither can ship stale.
    expect(winRequiredExtsScript).toContain('for ext in "${required_exts[@]}"')
    expect(winRequiredExtsScript).toContain('does not match tag')
  })

  it('passes when the installer and the portable zip both carry the tag version', () => {
    const { status, output } = runPackagingScript(winRequiredExtsScript, {
      artifacts: [setupAsset, portableAsset],
      latestYml: winLatestYml(false)
    })
    expect(output).toContain(`release/latest.yml version=${currentVersion}`)
    expect(status).toBe(0)
  })

  it('fails closed when the NSIS installer is missing', () => {
    const { status, output } = runPackagingScript(winRequiredExtsScript, {
      artifacts: [portableAsset],
      latestYml: winLatestYml(false)
    })
    expect(status).not.toBe(0)
    expect(output).toContain('::error::No .exe artifact found')
  })

  it('fails closed when the portable zip is missing', () => {
    const { status, output } = runPackagingScript(winRequiredExtsScript, {
      artifacts: [setupAsset],
      latestYml: winLatestYml(false)
    })
    expect(status).not.toBe(0)
    expect(output).toContain('::error::No .zip artifact found')
  })

  it('keeps the Windows update feed on the NSIS installer as its own gate', () => {
    expect(feedStep).toBeDefined()
    expect(feedStep?.if).toBe("matrix.target == 'win'")
    expect(feedScript).toContain('release/latest*.yml')
    expect(feedScript).toContain('files[].url')
    expect(feedScript).toContain('endsWith(".zip")')
    expect(feedScript).toContain('exit 1')
    // Read-only: it never writes the feed or the release.
    expect(feedScript).not.toMatch(/gh release (upload|edit|create|delete)/)
    // It sits between the version/url checks and the upload, and the existing
    // latest*.yml version + files[].url gates stay in place next to it.
    const versionIndex = releaseWorkflow.indexOf('name: Assert packaged version matches the tag')
    const feedIndex = releaseWorkflow.indexOf(
      'name: Assert the Windows update feed points at the NSIS installer'
    )
    const uploadIndex = releaseWorkflow.indexOf("name: Upload installers to the tag's release")
    expect(feedIndex).toBeGreaterThan(versionIndex)
    expect(uploadIndex).toBeGreaterThan(feedIndex)
    expect(winRequiredExtsScript).toContain('String(metadata.version) !== tag')
    expect(winRequiredExtsScript).toContain('files[].url ${url} does not match tag')
  })

  it('passes a latest.yml that only lists the installer', () => {
    const { status, output } = runPackagingScript(feedScript, {
      latestYml: winLatestYml(false)
    })
    expect(output).toContain('files[] carries no zip entry')
    expect(status).toBe(0)
  })

  it('fails closed when latest.yml lists the portable zip', () => {
    const { status, output } = runPackagingScript(feedScript, {
      latestYml: winLatestYml(true)
    })
    expect(status).not.toBe(0)
    expect(output).toContain('::error::')
    expect(output).toContain('must use the NSIS installer')
    expect(output).toContain('refusing a Windows update feed')
  })

  it('verifies both Windows assets by their exact published names', () => {
    expect(assetsStep).toContain('has_exact_asset')
    expect(assetsStep).toContain(
      `for asset in "OpenCompare-Setup-\${tag}.exe" "OpenCompare-\${tag}-win-x64.zip"; do`
    )
    expect(assetsStep).toContain('if [ "${name}" = "${wanted}" ]; then return 0; fi')
    expect(assetsStep).toContain('is missing the Windows asset ${asset}')
    // The exact matcher is used, never the suffix matcher the macOS zip satisfies.
    expect(assetsStep).toContain('! has_exact_asset "${asset}"')
  })

  // `gh` is a local stub echoing a fixture release, so the gate runs for real
  // against exact asset-name sets without any network access.
  const runAssetGate = (assets: string[]): { status: number; output: string } => {
    const dir = mkdtempSync(join(tmpdir(), 'opencompare-win-assets-'))
    try {
      const fakeGh = join(dir, 'gh')
      writeFileSync(
        fakeGh,
        [
          '#!/usr/bin/env bash',
          'if [[ "$*" == *"/assets"* ]]; then',
          '  printf \'%s\\n\' "${FAKE_ASSETS}"',
          'else',
          '  printf \'[{"id":123,"tag_name":"%s"}]\\n\' "${RELEASE_TAG}"',
          'fi',
          ''
        ].join('\n'),
        { mode: 0o755 }
      )
      const scriptPath = join(dir, 'assets-gate.sh')
      writeFileSync(scriptPath, assetsGateScript)
      const result = spawnSync('bash', [scriptPath], {
        cwd: dir,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH ?? ''}`,
          RELEASE_TAG: currentTag,
          GITHUB_REPOSITORY: 'chaxiu/OpenCompare',
          FAKE_ASSETS: JSON.stringify(assets.map((name) => ({ name })))
        }
      })
      return {
        status: result.status ?? -1,
        output: `${result.stdout ?? ''}${result.stderr ?? ''}`
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  const publishedWindowsAssets = (omit?: 'exe' | 'zip'): string[] =>
    [
      `OpenCompare-${currentVersion}.dmg`,
      `OpenCompare-${currentVersion}-mac.zip`,
      setupAsset,
      portableAsset,
      `OpenCompare-${currentVersion}.AppImage`,
      `opencompare_${currentVersion}_amd64.deb`,
      'latest-mac.yml',
      'latest.yml',
      'latest-linux.yml'
    ].filter((name) => {
      if (omit === 'exe') return name !== setupAsset
      if (omit === 'zip') return name !== portableAsset
      return true
    })

  it('passes when both Windows assets are published under their exact names', () => {
    const { status, output } = runAssetGate(publishedWindowsAssets())
    expect(status).toBe(0)
    expect(output).not.toContain('is missing the Windows asset')
  })

  it('is not satisfied by the macOS zip when the Windows zip is missing', () => {
    const { status, output } = runAssetGate(publishedWindowsAssets('zip'))
    expect(status).not.toBe(0)
    expect(output).toContain(`is missing the Windows asset ${portableAsset}`)
  })

  it('fails closed when the Windows installer is missing', () => {
    const { status, output } = runAssetGate(publishedWindowsAssets('exe'))
    expect(status).not.toBe(0)
    expect(output).toContain(`is missing the Windows asset ${setupAsset}`)
  })

  it('keeps every pre-existing release gate', () => {
    for (const name of [
      'Assert the published release body is bilingual',
      'Verify the tag has exactly one public release',
      'Assert the public release has every platform asset',
      'Assert latest*.yml urls match the release assets',
      'Assert the tag is the latest published release'
    ]) {
      expect(finalizeStep(name)).toBeDefined()
    }
    expect(assetsStep).toContain('latest-mac.yml latest.yml latest-linux.yml')
    const uniqueStep = finalizeStep('Verify the tag has exactly one public release')?.run ?? ''
    expect(uniqueStep).toContain('select(.draft)')
    expect(uniqueStep).toContain('select(.prerelease)')
  })

  it('announces the portable zip in both language notes', () => {
    const noteSection = (notes: string, heading: string): string => {
      const start = notes.indexOf(`### ${heading}`)
      expect(start).toBeGreaterThan(-1)
      const end = notes.indexOf('\n## ', start)
      expect(end).toBeGreaterThan(start)
      return notes.slice(start, end)
    }
    const enSection = noteSection(releaseNotes, 'Windows portable download')
    const zhSection = noteSection(bilingualNotes, 'Windows 免安装包')
    expect(enSection).toContain(
      'Windows ships both the NSIS installer and a portable `.zip` (extract and run, no installation step).'
    )
    expect(zhSection).toContain(
      'Windows 同时提供 NSIS 安装包与免安装 `.zip`（解压即用，无安装步骤）。'
    )
    expect(enSection).toContain(
      'Auto-update keeps resolving to the NSIS installer, so the portable zip is a download only.'
    )
    expect(zhSection).toContain('自动更新仍指向 NSIS 安装包，免安装 zip 只作为下载。')
    // Sentence-for-sentence parity: two sentences on each side, same order.
    const body = (section: string): string => section.replace(/^###[^\n]*\n/, '').trim()
    const sentences = (text: string, separator: RegExp): string[] =>
      text.split(separator).map((part) => part.trim()).filter(Boolean)
    expect(sentences(body(enSection), /(?<=\.)\s+/)).toHaveLength(2)
    expect(sentences(body(zhSection), /(?<=。)/)).toHaveLength(2)
  })

  it('reframes the Windows assets in the release process doc', () => {
    expect(releaseProcessDoc).toContain(
      '- **Windows**：NSIS `.exe` 安装包 + 免安装 `.zip`（解压即用，无安装步骤）'
    )
    // The old "installer only" wording may not survive anywhere in the doc.
    expect(releaseProcessDoc).not.toContain('Windows**：NSIS `.exe` 安装包。')
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
