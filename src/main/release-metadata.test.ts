import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import {
  extractMetadataRefs,
  findLegacyWindowsNames,
  inspectReleaseMetadata,
  runReleaseMetadataCli
} from '../../scripts/release-metadata.mjs'

// Tempdir fixtures are the only place this suite writes release artifacts; the
// checks below never read a real `release/` directory or touch the network.
const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const scriptPath = join(repoRoot, 'scripts/release-metadata.mjs')

const VERSION = '0.2.5'
const APPIMAGE_NAME = `OpenCompare-${VERSION}.AppImage`
// v0.2.5 CI trailer `00 01 EF A4`: big-endian 126884 matches latest-linux.yml,
// little-endian 2767126784 does not (the old LE-only gate rejected it).
const APPIMAGE_TAIL = Buffer.from([0x00, 0x01, 0xef, 0xa4])
const APPIMAGE_BLOCKMAP_SIZE = 126884
const APPIMAGE_LITTLE_ENDIAN = 2767126784

const buildAppImage = (size: number, tail: Buffer = APPIMAGE_TAIL): Buffer => {
  const bytes = Buffer.alloc(size, 0)
  tail.copy(bytes, size - tail.length)
  return bytes
}

const linuxMetadata = (options: { blockMapSize?: number | null; deb?: boolean } = {}): string => {
  const { blockMapSize = APPIMAGE_BLOCKMAP_SIZE, deb = true } = options
  return [
    `version: ${VERSION}`,
    'files:',
    `  - url: ${APPIMAGE_NAME}`,
    '    sha512: fixture',
    '    size: 262144',
    ...(blockMapSize === null ? [] : [`    blockMapSize: ${blockMapSize}`]),
    ...(deb
      ? [`  - url: opencompare_${VERSION}_amd64.deb`, '    sha512: fixture', '    size: 16']
      : []),
    `path: ${APPIMAGE_NAME}`,
    'sha512: fixture'
  ].join('\n')
}

const ASSETS = [
  `OpenCompare-${VERSION}-arm64-mac.zip`,
  `OpenCompare-${VERSION}-arm64-mac.zip.blockmap`,
  `OpenCompare-${VERSION}-arm64.dmg`,
  `OpenCompare-${VERSION}-arm64.dmg.blockmap`,
  `OpenCompare-Setup-${VERSION}.exe`,
  `OpenCompare-Setup-${VERSION}.exe.blockmap`,
  APPIMAGE_NAME,
  `opencompare_${VERSION}_amd64.deb`,
  'latest-mac.yml',
  'latest.yml',
  'latest-linux.yml'
]

const legacyWinUrl = `OpenCompare.Setup.${VERSION}.exe`
const spacedWinUrl = `OpenCompare Setup ${VERSION}.exe`

const metadataFixtures = (): Record<string, string> => ({
  'latest-mac.yml': [
    `version: ${VERSION}`,
    'files:',
    `  - url: OpenCompare-${VERSION}-arm64-mac.zip`,
    '    sha512: fixture',
    '    size: 16',
    '    blockMapSize: 16',
    `  - url: OpenCompare-${VERSION}-arm64.dmg`,
    '    sha512: fixture',
    '    size: 16',
    `path: OpenCompare-${VERSION}-arm64-mac.zip`,
    'sha512: fixture'
  ].join('\n'),
  'latest.yml': [
    `version: ${VERSION}`,
    'files:',
    `  - url: OpenCompare-Setup-${VERSION}.exe`,
    '    sha512: fixture',
    '    size: 16',
    `path: OpenCompare-Setup-${VERSION}.exe`,
    'sha512: fixture'
  ].join('\n'),
  'latest-linux.yml': linuxMetadata()
})

interface Fixture {
  dir: string
  dispose: () => void
}

interface FixtureOptions {
  overrides?: Record<string, string>
  skip?: string[]
  appImage?: Buffer
}

const createReleaseFixture = (options: FixtureOptions = {}): Fixture => {
  const {
    overrides = {},
    skip = [],
    appImage = buildAppImage(APPIMAGE_BLOCKMAP_SIZE)
  } = options
  const skipped = new Set(skip)
  const dir = mkdtempSync(join(tmpdir(), 'opencompare-metadata-'))
  for (const asset of ASSETS) {
    if (skipped.has(asset)) continue
    writeFileSync(join(dir, asset), asset === APPIMAGE_NAME ? appImage : Buffer.alloc(1))
  }
  for (const [name, content] of Object.entries({ ...metadataFixtures(), ...overrides })) {
    if (skipped.has(name)) continue
    writeFileSync(join(dir, name), content)
  }
  return { dir, dispose: () => rmSync(dir, { recursive: true, force: true }) }
}

const withReleaseFixture = (
  run: (fixture: Fixture) => void,
  options: FixtureOptions = {}
): void => {
  const fixture = createReleaseFixture(options)
  try {
    run(fixture)
  } finally {
    fixture.dispose()
  }
}

const runCli = (args: string[]): { status: number; stdout: string; stderr: string } => {
  const result = spawnSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8' })
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  }
}

const workflow = parse(readFileSync(join(repoRoot, '.github/workflows/release.yml'), 'utf8')) as {
  jobs?: Record<string, { steps?: Array<{ name?: string; run?: string }> }>
}
const appImageGateScript =
  workflow.jobs?.release?.steps?.find(
    (step) => step.name === 'Assert the AppImage embeds its declared blockmap'
  )?.run ?? ''

// Parity harness: one temp dir feeds both the workflow gate body (run from the
// directory root against release/) and the local script (--dir release).
const runBlockmapParity = (options: {
  declared: number | null
  appImage?: Buffer
}): { gateStatus: number; cliStatus: number } => {
  const root = mkdtempSync(join(tmpdir(), 'opencompare-blockmap-parity-'))
  try {
    const releaseDir = join(root, 'release')
    mkdirSync(releaseDir, { recursive: true })
    writeFileSync(
      join(releaseDir, 'latest-linux.yml'),
      linuxMetadata({ blockMapSize: options.declared, deb: false })
    )
    if (options.appImage) {
      writeFileSync(join(releaseDir, APPIMAGE_NAME), options.appImage)
    }
    const script = join(root, 'appimage-gate.sh')
    writeFileSync(script, appImageGateScript)
    const gate = spawnSync('bash', [script], { cwd: root, encoding: 'utf8' })
    const cli = runCli(['--dir', releaseDir])
    return { gateStatus: gate.status ?? -1, cliStatus: cli.status }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('release update metadata gate', () => {
  it('accepts a complete artifact set whose urls all match the asset names', () => {
    withReleaseFixture(({ dir }) => {
      const report = inspectReleaseMetadata({ dir, assets: ASSETS })
      expect(report.ok).toBe(true)
      expect(report.missing).toEqual([])
      expect(report.legacyHits).toEqual([])
      expect(report.problems).toEqual([])
      expect(report.metadata.map((entry) => entry.file).sort()).toEqual([
        'latest-linux.yml',
        'latest-mac.yml',
        'latest.yml'
      ])
      expect(report.metadata.find((entry) => entry.file === 'latest-mac.yml')?.hits).toBe(2)
      expect(report.metadata.find((entry) => entry.file === 'latest.yml')?.hits).toBe(1)
      expect(report.metadata.find((entry) => entry.file === 'latest-linux.yml')?.hits).toBe(2)

      const cli = runCli(['--dir', dir])
      expect(cli.status).toBe(0)
      expect(cli.stdout).toContain('latest-mac.yml: url 2/2 命中资产名')
      expect(cli.stdout).toContain('latest.yml: url 1/1 命中资产名')
      expect(cli.stdout).toContain('latest-linux.yml: url 2/2 命中资产名')
      expect(cli.stdout).toContain('旧错位名 0 命中')
    })
  })

  it('fails closed with the exact missing name and still counts the remaining hits', () => {
    const missingName = 'OpenCompare-Setup-9.9.9.exe'
    withReleaseFixture(
      ({ dir }) => {
        const report = inspectReleaseMetadata({ dir, assets: ASSETS })
        expect(report.ok).toBe(false)
        expect(report.missing).toEqual([missingName])
        const win = report.metadata.find((entry) => entry.file === 'latest.yml')
        expect(win?.hits).toBe(0)
        expect(win?.refs).toHaveLength(1)

        const cli = runCli(['--dir', dir])
        expect(cli.status).not.toBe(0)
        expect(cli.stderr).toContain(missingName)
        expect(cli.stdout).toContain('latest.yml: url 0/1 命中资产名')
        // The other metadata files are still fully counted.
        expect(cli.stdout).toContain('latest-mac.yml: url 2/2 命中资产名')
      },
      {
        overrides: {
          'latest.yml': [
            `version: ${VERSION}`,
            'files:',
            `  - url: ${missingName}`,
            '    sha512: fixture',
            '    size: 16',
            `path: OpenCompare-Setup-${VERSION}.exe`,
            'sha512: fixture'
          ].join('\n')
        }
      }
    )
  })

  it('rejects the dotted and spaced Windows installer names', () => {
    for (const legacyName of [legacyWinUrl, spacedWinUrl]) {
      expect(findLegacyWindowsNames([legacyName])).toEqual([legacyName])
      const validNames = findLegacyWindowsNames([`OpenCompare-Setup-${VERSION}.exe`])
      expect(validNames).toEqual([])
    }

    withReleaseFixture(
      ({ dir }) => {
        const report = inspectReleaseMetadata({
          dir,
          assets: ASSETS.filter((name) => name !== `OpenCompare-Setup-${VERSION}.exe`)
        })
        expect(report.ok).toBe(false)
        expect(report.legacyHits).toContain(legacyWinUrl)

        const cli = runCli(['--dir', dir])
        expect(cli.status).not.toBe(0)
        expect(cli.stderr).toContain(`旧错位名命中: ${legacyWinUrl}`)
      },
      {
        overrides: {
          'latest.yml': [
            `version: ${VERSION}`,
            'files:',
            `  - url: ${legacyWinUrl}`,
            '    sha512: fixture',
            '    size: 16',
            `path: ${legacyWinUrl}`,
            'sha512: fixture'
          ].join('\n')
        }
      }
    )

    withReleaseFixture(({ dir }) => {
      const assets = [...ASSETS, spacedWinUrl]
      const report = inspectReleaseMetadata({ dir, assets })
      expect(report.ok).toBe(false)
      expect(report.legacyHits).toContain(spacedWinUrl)

      const assetsFile = join(dir, 'assets.txt')
      writeFileSync(assetsFile, assets.join('\n'))
      const cli = runCli(['--dir', dir, '--assets', assetsFile])
      expect(cli.status).not.toBe(0)
      expect(cli.stderr).toContain(spacedWinUrl)
      expect(cli.stdout).toContain('旧错位名 1 命中')
    })
  })

  it('reports an unreadable directory instead of crashing', () => {
    const dir = join(tmpdir(), `opencompare-metadata-missing-${Date.now()}`)
    const report = inspectReleaseMetadata({ dir, assets: ASSETS })
    expect(report.ok).toBe(false)
    expect(report.problems.join('\n')).toContain('目录不可读')
    const cli = runCli(['--dir', dir])
    expect(cli.status).not.toBe(0)
    expect(cli.stderr).toContain('目录不可读')
  })

  it('fails when the directory carries no latest*.yml', () => {
    const dir = mkdtempSync(join(tmpdir(), 'opencompare-metadata-empty-'))
    try {
      writeFileSync(join(dir, `OpenCompare-${VERSION}.AppImage`), Buffer.alloc(1))
      const report = inspectReleaseMetadata({ dir, assets: [`OpenCompare-${VERSION}.AppImage`] })
      expect(report.ok).toBe(false)
      expect(report.problems.join('\n')).toContain('无 latest*.yml')
      const cli = runCli(['--dir', dir])
      expect(cli.status).not.toBe(0)
      expect(cli.stderr).toContain('无 latest*.yml')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails when the asset name list is empty', () => {
    withReleaseFixture(({ dir }) => {
      const report = inspectReleaseMetadata({ dir, assets: [] })
      expect(report.ok).toBe(false)
      expect(report.problems.join('\n')).toContain('资产名清单为空')

      const emptyAssets = join(dir, 'empty-assets.txt')
      writeFileSync(emptyAssets, '\n')
      const cli = runCli(['--dir', dir, '--assets', emptyAssets])
      expect(cli.status).not.toBe(0)
      expect(cli.stderr).toContain('资产名清单为空')
    })
  })

  it('accepts the v0.2.5 AppImage trailer as big-endian', () => {
    expect(APPIMAGE_TAIL.readUInt32BE(0)).toBe(APPIMAGE_BLOCKMAP_SIZE)
    expect(APPIMAGE_TAIL.readUInt32LE(0)).toBe(APPIMAGE_LITTLE_ENDIAN)
    expect(APPIMAGE_TAIL.readUInt32LE(0)).not.toBe(APPIMAGE_BLOCKMAP_SIZE)

    withReleaseFixture(({ dir }) => {
      const report = inspectReleaseMetadata({ dir, assets: ASSETS })
      expect(report.ok).toBe(true)
      expect(report.problems).toEqual([])

      const cli = runCli(['--dir', dir])
      expect(cli.status).toBe(0)
    })
  })

  it('fails when latest-linux.yml declares an AppImage the directory lacks', () => {
    withReleaseFixture(
      ({ dir }) => {
        const report = inspectReleaseMetadata({ dir, assets: ASSETS })
        expect(report.ok).toBe(false)
        expect(report.problems.join('\n')).toContain(APPIMAGE_NAME)

        const cli = runCli(['--dir', dir])
        expect(cli.status).not.toBe(0)
        expect(cli.stderr).toContain(APPIMAGE_NAME)
      },
      { skip: [APPIMAGE_NAME] }
    )
  })

  it('fails when the AppImage entry has no blockMapSize', () => {
    withReleaseFixture(
      ({ dir }) => {
        const report = inspectReleaseMetadata({ dir, assets: ASSETS })
        expect(report.ok).toBe(false)
        expect(report.problems.join('\n')).toContain('blockMapSize')

        const cli = runCli(['--dir', dir])
        expect(cli.status).not.toBe(0)
        expect(cli.stderr).toContain('blockMapSize')
      },
      { overrides: { 'latest-linux.yml': linuxMetadata({ blockMapSize: null }) } }
    )
  })

  it('fails when neither trailer byte order matches blockMapSize', () => {
    withReleaseFixture(
      ({ dir }) => {
        const report = inspectReleaseMetadata({ dir, assets: ASSETS })
        expect(report.ok).toBe(false)
        const problems = report.problems.join('\n')
        expect(problems).toContain(`blockMapSize=${APPIMAGE_BLOCKMAP_SIZE}`)
        expect(problems).toContain('LE=65536')
        expect(problems).toContain('BE=256')

        const cli = runCli(['--dir', dir])
        expect(cli.status).not.toBe(0)
        expect(cli.stderr).toContain('LE=65536')
      },
      {
        appImage: buildAppImage(
          APPIMAGE_BLOCKMAP_SIZE,
          Buffer.from([0x00, 0x00, 0x01, 0x00])
        )
      }
    )
  })

  it('fails when both trailer candidates exceed the file size', () => {
    withReleaseFixture(
      ({ dir }) => {
        const report = inspectReleaseMetadata({ dir, assets: ASSETS })
        expect(report.ok).toBe(false)
        expect(report.problems.join('\n')).toContain('超过文件大小')

        const cli = runCli(['--dir', dir])
        expect(cli.status).not.toBe(0)
      },
      { appImage: buildAppImage(16, Buffer.from([0xff, 0xff, 0xff, 0xff])) }
    )
  })

  it('leaves directories without latest-linux.yml unchanged', () => {
    const linuxOnly = [APPIMAGE_NAME, 'latest-linux.yml']
    withReleaseFixture(
      ({ dir }) => {
        const skipped = new Set(linuxOnly)
        const report = inspectReleaseMetadata({
          dir,
          assets: ASSETS.filter((name) => !skipped.has(name))
        })
        expect(report.ok).toBe(true)
        expect(report.problems).toEqual([])
        expect(report.missing).toEqual([])

        const cli = runCli(['--dir', dir])
        expect(cli.status).toBe(0)
      },
      { skip: linuxOnly }
    )
  })

  it('keeps the workflow gate and the local script in parity', () => {
    expect(appImageGateScript).toContain('readUInt32LE')
    expect(appImageGateScript).toContain('readUInt32BE')
    const bothMismatchTail = Buffer.from([0x00, 0x00, 0x01, 0x00])
    const results = [
      {
        label: 'big-endian match',
        ...runBlockmapParity({
          declared: APPIMAGE_BLOCKMAP_SIZE,
          appImage: buildAppImage(APPIMAGE_BLOCKMAP_SIZE)
        })
      },
      {
        label: 'both byte orders mismatch',
        ...runBlockmapParity({
          declared: APPIMAGE_BLOCKMAP_SIZE,
          appImage: buildAppImage(APPIMAGE_BLOCKMAP_SIZE, bothMismatchTail)
        })
      },
      {
        label: 'missing AppImage',
        ...runBlockmapParity({ declared: APPIMAGE_BLOCKMAP_SIZE })
      }
    ]

    expect(results[0].gateStatus).toBe(0)
    expect(results[0].cliStatus).toBe(0)
    for (const result of results.slice(1)) {
      expect(result.gateStatus).not.toBe(0)
      expect(result.cliStatus).not.toBe(0)
    }
    for (const result of results) {
      expect(result.gateStatus === 0, result.label).toBe(result.cliStatus === 0)
    }
  })

  it('exposes the pure check and a CLI wrapper without any third-party import', () => {
    const source = readFileSync(scriptPath, 'utf8')
    const imports = [...source.matchAll(/^import .* from '([^']+)'$/gm)].map((match) => match[1])
    expect(imports.length).toBeGreaterThan(0)
    for (const specifier of imports) {
      expect(specifier.startsWith('node:')).toBe(true)
    }
    expect(source).not.toMatch(/\bfetch\(|https?:\/\/|require\(['"](?:https?|axios|undici)/)
    expect(typeof inspectReleaseMetadata).toBe('function')
    expect(typeof runReleaseMetadataCli).toBe('function')

    // In-process CLI wrapper keeps the same exit code contract as the script.
    const lines: string[] = []
    const code = runReleaseMetadataCli(['--nope'], {
      stdout: (line) => lines.push(line),
      stderr: (line) => lines.push(line)
    })
    expect(code).toBe(1)
    expect(lines.join('\n')).toContain('未知参数')
  })

  it('parses the same files: block shape as the CI gate', () => {
    const text = [
      'version: 0.2.5',
      'files:',
      '  - url: "OpenCompare-0.2.5.AppImage"',
      '    sha512: fixture',
      '    size: 16',
      '    path: ./opencompare_0.2.5_amd64.deb',
      'path: OpenCompare-0.2.5.AppImage',
      'sha512: fixture'
    ].join('\n')
    // Quotes and the ./ prefix are stripped, an indented path: inside an entry
    // counts, and the top-level path: (outside files:) is ignored like in CI.
    expect(extractMetadataRefs(text)).toEqual([
      'OpenCompare-0.2.5.AppImage',
      'opencompare_0.2.5_amd64.deb'
    ])
    expect(extractMetadataRefs('version: 0.2.5\n')).toEqual([])
  })
})
