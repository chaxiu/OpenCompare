import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
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

const builder = parse(readFileSync(join(repoRoot, 'electron-builder.yml'), 'utf8')) as {
  appId?: string
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
  linux?: { icon?: string; maintainer?: string; target?: string[] }
  publish?: { provider?: string; releaseType?: string }
}

const builderConfig = readFileSync(join(repoRoot, 'electron-builder.yml'), 'utf8')

const entitlementsPath = builder.mac?.entitlements ?? ''
const macEntitlements = entitlementsPath
  ? readFileSync(join(repoRoot, entitlementsPath), 'utf8')
  : ''

const releaseWorkflow = readFileSync(join(repoRoot, '.github/workflows/release.yml'), 'utf8')

const signingDoc = readFileSync(join(repoRoot, 'docs/release-signing.md'), 'utf8')

const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8')

const changelog = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8')

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
      /gh release create\s+"\$\{GITHUB_REF_NAME\}"[\s\S]*?--repo\s+"\$\{GITHUB_REPOSITORY\}"[\s\S]*?--draft[\s\S]*?--generate-notes/
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
      /gh release upload\s+"\$\{GITHUB_REF_NAME\}"[\s\S]*?--clobber[\s\S]*?--repo\s+"\$\{GITHUB_REPOSITORY\}"/
    )
  })

  it('promotes the tag release to public with an explicit --repo', () => {
    expect(releaseWorkflow).toMatch(
      /gh release edit\s+"\$\{GITHUB_REF_NAME\}"\s+--repo\s+"\$\{GITHUB_REPOSITORY\}"\s+--draft=false\s+--latest/
    )
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
  it('asserts package.json version matches the tag before packaging', () => {
    expect(releaseWorkflow).toMatch(/Assert the tag matches package\.json version/)
    expect(releaseWorkflow).toMatch(/\$\{GITHUB_REF_NAME#v\}/)
  })

  it('asserts the packaged latest*.yml version matches the tag', () => {
    expect(releaseWorkflow).toMatch(/Assert packaged version matches the tag/)
    expect(releaseWorkflow).toMatch(/latest\*\.yml/)
  })

  it('enforces exactly one public release per tag', () => {
    expect(releaseWorkflow).toMatch(/Verify the tag has exactly one public release/)
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

  it('documents the v0.1.2 formal-release posture instead of the former freeze', () => {
    expect(signingDoc).toMatch(/v0\.1\.2/)
    expect(signingDoc).toMatch(/正式版/)
    expect(signingDoc).not.toMatch(/发布冻结/)
  })

  it('lists the six secrets and fail-closed behavior in the README', () => {
    for (const secret of signingSecrets) {
      expect(readme).toContain(secret)
    }
    expect(readme).toMatch(/fail-closed/)
  })

  it('presents the README as the v0.1.2 formal release', () => {
    expect(readme).toMatch(/v0\.1\.2/)
    expect(readme).not.toMatch(/发布状态：冻结/)
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
