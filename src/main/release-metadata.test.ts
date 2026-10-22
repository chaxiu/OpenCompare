import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
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

const ASSETS = [
  `OpenCompare-${VERSION}-arm64-mac.zip`,
  `OpenCompare-${VERSION}-arm64-mac.zip.blockmap`,
  `OpenCompare-${VERSION}-arm64.dmg`,
  `OpenCompare-${VERSION}-arm64.dmg.blockmap`,
  `OpenCompare-Setup-${VERSION}.exe`,
  `OpenCompare-Setup-${VERSION}.exe.blockmap`,
  `OpenCompare-${VERSION}.AppImage`,
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
  'latest-linux.yml': [
    `version: ${VERSION}`,
    'files:',
    `  - url: OpenCompare-${VERSION}.AppImage`,
    '    sha512: fixture',
    '    size: 16',
    `  - url: opencompare_${VERSION}_amd64.deb`,
    '    sha512: fixture',
    '    size: 16',
    `path: OpenCompare-${VERSION}.AppImage`,
    'sha512: fixture'
  ].join('\n')
})

interface Fixture {
  dir: string
  dispose: () => void
}

const createReleaseFixture = (
  overrides: Record<string, string> = {}
): Fixture => {
  const dir = mkdtempSync(join(tmpdir(), 'opencompare-metadata-'))
  for (const asset of ASSETS) {
    writeFileSync(join(dir, asset), Buffer.alloc(1))
  }
  for (const [name, content] of Object.entries({ ...metadataFixtures(), ...overrides })) {
    writeFileSync(join(dir, name), content)
  }
  return { dir, dispose: () => rmSync(dir, { recursive: true, force: true }) }
}

const withReleaseFixture = (
  run: (fixture: Fixture) => void,
  overrides: Record<string, string> = {}
): void => {
  const fixture = createReleaseFixture(overrides)
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
