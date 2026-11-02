import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  extractMetadataRefs,
  inspectReleaseMetadata,
  runReleaseMetadataCli
} from '../../scripts/release-metadata.mjs'
import {
  judgeReleaseMetadata,
  type AppImageFact,
  type ReleaseMetadataFacts
} from './release-metadata-gate'

const VERSION = '0.2.5'
const APPIMAGE_NAME = `OpenCompare-${VERSION}.AppImage`
const APPIMAGE_BLOCKMAP_SIZE = 126884
const APPIMAGE_LITTLE_ENDIAN = 2767126784
const APPIMAGE_TAIL = Buffer.from([0x00, 0x01, 0xef, 0xa4])
const MAC_ZIP = `OpenCompare-${VERSION}-arm64-mac.zip`
const MAC_DMG = `OpenCompare-${VERSION}-arm64.dmg`
const WIN_EXE = `OpenCompare-Setup-${VERSION}.exe`
const DEB = `opencompare_${VERSION}_amd64.deb`
const legacyWinUrl = `OpenCompare.Setup.${VERSION}.exe`
const spacedWinUrl = `OpenCompare Setup ${VERSION}.exe`
const ASSETS = [MAC_ZIP, `${MAC_ZIP}.blockmap`, MAC_DMG, `${MAC_DMG}.blockmap`, WIN_EXE, `${WIN_EXE}.blockmap`, APPIMAGE_NAME, DEB, 'latest-mac.yml', 'latest.yml', 'latest-linux.yml']

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
    ...(deb ? [`  - url: ${DEB}`, '    sha512: fixture', '    size: 16'] : []),
    `path: ${APPIMAGE_NAME}`,
    'sha512: fixture'
  ].join('\n')
}

const metadataFixtures = (): Record<string, string> => ({
  'latest-mac.yml': [
    `version: ${VERSION}`,
    'files:',
    `  - url: ${MAC_ZIP}`,
    '    sha512: fixture',
    '    size: 16',
    '    blockMapSize: 16',
    `  - url: ${MAC_DMG}`,
    '    sha512: fixture',
    '    size: 16',
    `path: ${MAC_ZIP}`,
    'sha512: fixture'
  ].join('\n'),
  'latest.yml': [
    `version: ${VERSION}`,
    'files:',
    `  - url: ${WIN_EXE}`,
    '    sha512: fixture',
    '    size: 16',
    `path: ${WIN_EXE}`,
    'sha512: fixture'
  ].join('\n'),
  'latest-linux.yml': linuxMetadata()
})

interface FixtureOptions {
  overrides?: Record<string, string>
  skip?: string[]
  appImage?: Buffer
}

// Tempdir fixtures are the only place this suite writes release artifacts; the
// checks below never read a real `release/` directory or touch the network.
const createReleaseFixture = (options: FixtureOptions = {}): string => {
  const { overrides = {}, skip = [], appImage = buildAppImage(APPIMAGE_BLOCKMAP_SIZE) } = options
  const skipped = new Set(skip)
  const dir = mkdtempSync(join(tmpdir(), 'opencompare-metadata-'))
  for (const asset of ASSETS) {
    if (!skipped.has(asset)) {
      writeFileSync(join(dir, asset), asset === APPIMAGE_NAME ? appImage : Buffer.alloc(1))
    }
  }
  for (const [name, text] of Object.entries({ ...metadataFixtures(), ...overrides })) {
    if (!skipped.has(name)) writeFileSync(join(dir, name), text)
  }
  return dir
}

const withFixture = <T>(options: FixtureOptions, run: (dir: string) => T): T => {
  const dir = createReleaseFixture(options)
  try {
    return run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const runCli = (args: string[]): { code: number; output: string } => {
  const lines: string[] = []
  const io = { stdout: (line: string) => lines.push(line), stderr: (line: string) => lines.push(line) }
  const code = runReleaseMetadataCli(args, io)
  return { code, output: lines.join('\n') }
}

const appImageFact = (blockMapSize: number | null, bytes: Buffer | null): AppImageFact => ({
  file: 'latest-linux.yml',
  name: APPIMAGE_NAME,
  blockMapSize,
  size: bytes?.length ?? null,
  tailLe: bytes && bytes.length >= 4 ? bytes.readUInt32LE(bytes.length - 4) : null,
  tailBe: bytes && bytes.length >= 4 ? bytes.readUInt32BE(bytes.length - 4) : null
})

const facts = (overrides: Partial<ReleaseMetadataFacts> = {}): ReleaseMetadataFacts => ({
  directoryLabel: '/release',
  directoryReadable: true,
  assets: ASSETS,
  metadataFiles: [
    { file: 'latest-mac.yml', refs: [MAC_ZIP, MAC_DMG] },
    { file: 'latest.yml', refs: [WIN_EXE] },
    { file: 'latest-linux.yml', refs: [APPIMAGE_NAME, DEB] }
  ],
  appImages: [appImageFact(APPIMAGE_BLOCKMAP_SIZE, buildAppImage(APPIMAGE_BLOCKMAP_SIZE))],
  ...overrides
})

const verdictCases: Array<[string, ReleaseMetadataFacts, boolean, string[], string[]?]> = [
  ['a complete asset set passes', facts(), true, []],
  ['a url outside the asset list fails closed', facts({ metadataFiles: [{ file: 'latest.yml', refs: ['OpenCompare-Setup-9.9.9.exe'] }] }), false, []],
  ['the hyphen Windows installer form is accepted', facts(), true, []],
  ['a dotted Windows installer name is rejected', facts({ assets: [...ASSETS, legacyWinUrl] }), false, [], [legacyWinUrl]],
  ['a spaced Windows installer name is rejected', facts({ assets: [...ASSETS, spacedWinUrl] }), false, [], [spacedWinUrl]],
  ['a directory without latest*.yml fails', facts({ metadataFiles: [] }), false, ['metadata-missing']],
  ['an empty asset list fails', facts({ assets: [] }), false, ['assets-empty']],
  ['an unreadable directory fails', facts({ directoryLabel: '/missing', directoryReadable: false }), false, ['directory-unreadable']],
  ['a latest*.yml without refs fails', facts({ metadataFiles: [{ file: 'latest.yml', refs: [] }] }), false, ['refs-empty']],
  ['a declared AppImage without blockMapSize fails', facts({ appImages: [appImageFact(null, buildAppImage(APPIMAGE_BLOCKMAP_SIZE))] }), false, ['blockmap-missing']],
  ['a declared AppImage that is absent fails', facts({ appImages: [appImageFact(APPIMAGE_BLOCKMAP_SIZE, null)] }), false, ['appimage-missing']],
  ['an AppImage shorter than its trailer fails', facts({ appImages: [appImageFact(16, Buffer.from([0x01, 0x02]))] }), false, ['appimage-too-small']],
  ['both trailer byte orders mismatching fails', facts({ appImages: [appImageFact(APPIMAGE_BLOCKMAP_SIZE, buildAppImage(APPIMAGE_BLOCKMAP_SIZE, Buffer.from([0x00, 0x00, 0x01, 0x00])))] }), false, ['blockmap-mismatch']],
  ['both trailer candidates exceeding the file size fails', facts({ appImages: [appImageFact(APPIMAGE_BLOCKMAP_SIZE, buildAppImage(16, Buffer.from([0xff, 0xff, 0xff, 0xff])))] }), false, ['blockmap-out-of-range']],
  ['a little-endian trailer also matches', facts({ appImages: [appImageFact(16, buildAppImage(16, Buffer.from([0x10, 0x00, 0x00, 0x00])))] }), true, []],
  ['a blockMapSize matching the little-endian decoding passes', facts({ appImages: [appImageFact(APPIMAGE_LITTLE_ENDIAN, buildAppImage(APPIMAGE_LITTLE_ENDIAN, Buffer.from([0x00, 0x01, 0xef, 0xa4])))] }), true, []]
]

describe('release update metadata verdicts', () => {
  it.each(verdictCases)('%s', (_name, input, ok, codes, legacy) => {
    const verdict = judgeReleaseMetadata(input)
    expect(verdict.ok).toBe(ok)
    expect(verdict.issues.map((issue) => issue.code)).toEqual(codes)
    expect(verdict.legacyHits).toEqual(legacy ?? [])
  })

  it('reports each missing asset reference and per-file hits', () => {
    const missingName = 'OpenCompare-Setup-9.9.9.exe'
    const verdict = judgeReleaseMetadata(
      facts({ metadataFiles: [{ file: 'latest.yml', refs: [missingName, WIN_EXE] }] })
    )
    expect(verdict.missing).toEqual([missingName])
    expect(verdict.metadata).toEqual([{ file: 'latest.yml', refs: [missingName, WIN_EXE], hits: 1 }])
    expect(verdict.ok).toBe(false)
  })
})

interface ReportCase extends FixtureOptions {
  name: string
  assets?: string[]
  ok: boolean
  problem?: string
  missing?: string
  legacy?: string
}

// Real-directory parity: the same fixture feeds the local script and the pure
// judgment so a drift in either side fails this suite.
const reportCases: ReportCase[] = [
  { name: 'a complete release directory passes', ok: true },
  { name: 'an empty asset list fails', assets: [], ok: false, problem: '资产名清单为空' },
  { name: 'a directory without latest*.yml fails', skip: ['latest-mac.yml', 'latest.yml', 'latest-linux.yml'], ok: false, problem: '无 latest*.yml' },
  { name: 'a latest*.yml without refs fails', overrides: { 'latest.yml': `version: ${VERSION}\n` }, ok: false, problem: '未声明 files[].url' },
  { name: 'a url outside the asset list fails', overrides: { 'latest.yml': `version: ${VERSION}\nfiles:\n  - url: OpenCompare-Setup-9.9.9.exe\n` }, ok: false, missing: 'OpenCompare-Setup-9.9.9.exe' },
  { name: 'a dotted installer asset name fails', assets: [...ASSETS, legacyWinUrl], ok: false, legacy: legacyWinUrl },
  { name: 'a legacy installer reference fails', overrides: { 'latest.yml': `version: ${VERSION}\nfiles:\n  - url: ${spacedWinUrl}\n` }, ok: false, legacy: spacedWinUrl },
  { name: 'an AppImage without blockMapSize fails', overrides: { 'latest-linux.yml': linuxMetadata({ blockMapSize: null }) }, ok: false, problem: 'blockMapSize' },
  { name: 'a declared AppImage that is absent fails', skip: [APPIMAGE_NAME], ok: false, problem: APPIMAGE_NAME },
  { name: 'an AppImage shorter than 4 bytes fails', appImage: Buffer.from([0x01, 0x02]), ok: false, problem: '小于 4 字节' },
  { name: 'a mismatching trailer fails', appImage: buildAppImage(APPIMAGE_BLOCKMAP_SIZE, Buffer.from([0x00, 0x00, 0x01, 0x00])), ok: false, problem: '不等' },
  { name: 'trailer candidates beyond the file size fail', appImage: buildAppImage(16, Buffer.from([0xff, 0xff, 0xff, 0xff])), ok: false, problem: '超过文件大小' },
  { name: 'a big-endian trailer passes', ok: true },
  { name: 'a little-endian trailer passes', overrides: { 'latest-linux.yml': linuxMetadata({ blockMapSize: 16, deb: false }) }, appImage: buildAppImage(16, Buffer.from([0x10, 0x00, 0x00, 0x00])), ok: true },
  { name: 'a directory without latest-linux.yml passes', skip: [APPIMAGE_NAME, 'latest-linux.yml'], ok: true }
]

describe('local script parity', () => {
  it.each(reportCases)('$name', (row) => {
    const report = withFixture(row, (dir) =>
      inspectReleaseMetadata({ dir, assets: row.assets ?? ASSETS })
    )
    expect(report.ok).toBe(row.ok)
    if (row.problem) expect(report.problems.join('\n')).toContain(row.problem)
    if (row.missing) expect(report.missing).toContain(row.missing)
    if (row.legacy) expect(report.legacyHits).toContain(row.legacy)
  })

  it('reports an unreadable directory instead of crashing', () => {
    const dir = join(tmpdir(), `opencompare-metadata-missing-${Date.now()}`)
    const report = inspectReleaseMetadata({ dir, assets: ASSETS })
    expect(report.ok).toBe(false)
    expect(report.problems.join('\n')).toContain('目录不可读')
  })

  it('lets the pure judgment and the script agree on every fixture', () => {
    for (const options of reportCases) {
      const report = withFixture(options, (dir) =>
        inspectReleaseMetadata({ dir, assets: options.assets ?? ASSETS })
      )
      const linuxText = options.overrides?.['latest-linux.yml'] ?? linuxMetadata()
      const pure = judgeReleaseMetadata({
        directoryLabel: 'fixture',
        directoryReadable: true,
        assets: options.assets ?? ASSETS,
        metadataFiles: (['latest-mac.yml', 'latest.yml', 'latest-linux.yml'] as const)
          .filter((file) => !(options.skip ?? []).includes(file))
          .map((file) => ({
            file,
            refs: extractMetadataRefs(options.overrides?.[file] ?? metadataFixtures()[file])
          })),
        appImages: options.skip?.includes('latest-linux.yml')
          ? []
          : [appImageFact(
              /blockMapSize: (\d+)/.exec(linuxText)?.[1] ? Number(/blockMapSize: (\d+)/.exec(linuxText)?.[1]) : null,
              options.skip?.includes(APPIMAGE_NAME) ? null : options.appImage ?? buildAppImage(APPIMAGE_BLOCKMAP_SIZE)
            )]
      })
      expect(pure.ok, `${report.problems.join(';')}`).toBe(report.ok)
    }
  })

  it('parses the same files: block shape as the CI gate', () => {
    const text = [
      'version: 0.2.5',
      'files:',
      '  - url: "OpenCompare-0.2.5.AppImage"',
      '    sha512: fixture',
      '    path: ./opencompare_0.2.5_amd64.deb',
      'path: OpenCompare-0.2.5.AppImage'
    ].join('\n')
    expect(extractMetadataRefs(text)).toEqual([
      'OpenCompare-0.2.5.AppImage',
      'opencompare_0.2.5_amd64.deb'
    ])
    expect(extractMetadataRefs('version: 0.2.5\n')).toEqual([])
  })
})

describe('release metadata CLI', () => {
  it.each([
    ['a complete release directory', (dir: string) => ['--dir', dir], 0, 'release:metadata 校验通过'],
    ['an unknown argument', () => ['--nope'], 1, '未知参数'],
    ['a option without a value', () => ['--dir'], 1, '缺少取值'],
    ['a missing directory', (dir: string) => ['--dir', join(dir, 'no-such')], 1, '目录不可读'],
    ['an empty asset list file', (dir: string) => {
      writeFileSync(join(dir, 'assets.txt'), '\n')
      return ['--dir', dir, '--assets', join(dir, 'assets.txt')]
    }, 1, '资产名清单为空'],
    ['a legacy asset list file', (dir: string) => {
      writeFileSync(join(dir, 'assets.txt'), [...ASSETS, spacedWinUrl].join('\n'))
      return ['--dir', dir, '--assets', join(dir, 'assets.txt')]
    }, 1, spacedWinUrl],
    ['an unreadable asset list file', (dir: string) => ['--dir', dir, '--assets', join(dir, 'nope.txt')], 1, '资产名清单不可读']
  ] as Array<[string, (dir: string) => string[], number, string]>)('%s', (_name, args, code, expected) => {
    withFixture({}, (dir) => {
      const result = runCli(args(dir))
      expect(result.code).toBe(code)
      expect(result.output).toContain(expected)
    })
  })
})
