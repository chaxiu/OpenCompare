import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Read-only assertions over docs/release-evidence/v0.2.1.md. This file never
// downloads, unpacks, mounts, signs, notarizes or writes to git; it only parses
// the evidence Markdown so a missing/fabricated evidence record fails `pnpm test`.
const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const evidencePath = join(repoRoot, 'docs/release-evidence/v0.2.1.md')

const PASSING_MARKERS = [
  'valid on disk',
  'satisfies its Designated Requirement',
  'The validate action worked!',
  'source=Notarized Developer ID'
]

type EvidenceStatus = 'verified' | 'blocked'

interface EvidenceReport {
  status: EvidenceStatus | null
  problems: string[]
}

const sha256Values = (doc: string): string[] => [
  ...new Set(doc.match(/[0-9a-f]{64}/g) ?? [])
]

const inspectReleaseEvidence = (doc: string, version = 'v0.2.1'): EvidenceReport => {
  const problems: string[] = []
  const text = doc.trim()
  if (!text) return { status: null, problems: ['证据文件缺失或为空'] }
  if (!text.includes(version)) problems.push(`证据文件未声明 ${version}`)

  const statusMatch = text.match(/^\s*(?:-\s*)?status:\s*(\S+)\s*$/m)
  const status = statusMatch?.[1]
  if (status !== 'verified' && status !== 'blocked') {
    problems.push('status 必须为 verified 或 blocked')
    return { status: null, problems }
  }

  const occurrences = (marker: string): number => text.split(marker).length - 1

  if (status === 'verified') {
    const required: Array<[marker: string, minimum: number]> = [
      ['valid on disk', 2],
      ['satisfies its Designated Requirement', 2],
      ['The validate action worked!', 2],
      ['accepted', 2],
      ['source=Notarized Developer ID', 2]
    ]
    for (const [marker, minimum] of required) {
      if (occurrences(marker) < minimum) {
        problems.push(`verified 分支需记录至少 ${minimum} 处「${marker}」`)
      }
    }
    if (sha256Values(text).length < 2) {
      problems.push('verified 分支需记录两个不同产物的 SHA-256')
    }
  } else {
    for (const marker of PASSING_MARKERS) {
      if (text.includes(marker)) {
        problems.push(`blocked 分支不得出现通过标记「${marker}」`)
      }
    }
    if (sha256Values(text).length > 0) {
      problems.push('blocked 分支不得记录产物 SHA-256')
    }
  }

  return { status, problems }
}

const readEvidence = (path = evidencePath): string =>
  existsSync(path) ? readFileSync(path, 'utf8') : ''

const verifiedFixture = (): string =>
  [
    '# v0.2.1 本机 dmg/zip 签名公证取证证据',
    'status: verified',
    '',
    'zip app: valid on disk',
    'zip app: satisfies its Designated Requirement',
    'dmg app: valid on disk',
    'dmg app: satisfies its Designated Requirement',
    'zip app: The validate action worked!',
    'dmg app: The validate action worked!',
    'zip app: accepted',
    'dmg app: accepted',
    'zip app: source=Notarized Developer ID',
    'dmg app: source=Notarized Developer ID',
    '',
    `dmg sha256: ${'a'.repeat(64)}`,
    `zip sha256: ${'b'.repeat(64)}`
  ].join('\n')

const blockedFixture = (): string =>
  [
    '# v0.2.1 本机 dmg/zip 签名公证取证证据',
    'status: blocked',
    '',
    'git ls-remote --tags origin refs/tags/v0.2.1',
    '',
    'gh release view v0.2.1 --repo chaxiu/OpenCompare --json tagName,isDraft,isPrerelease,url,assets',
    '',
    'release not found'
  ].join('\n')

describe('v0.2.1 release evidence document', () => {
  it('exists, is non-empty and carries a supported status', () => {
    expect(existsSync(evidencePath)).toBe(true)
    const doc = readEvidence()
    expect(doc.trim().length).toBeGreaterThan(0)
    expect(doc).toContain('v0.2.1')

    const { status, problems } = inspectReleaseEvidence(doc)
    expect(problems).toEqual([])
    expect(status === 'verified' || status === 'blocked').toBe(true)
  })

  it('blocked record keeps readiness-gate raw output and escalation request', () => {
    const doc = readEvidence()
    expect(doc).toContain('git ls-remote --tags origin refs/tags/v0.2.1')
    expect(doc).toContain('gh release view v0.2.1 --repo chaxiu/OpenCompare')
    expect(doc).toContain('release not found')
    expect(doc).toContain('缺失项')
    expect(doc).toContain('待人工动作')
    expect(doc).toContain('升级')
  })
})

describe('inspectReleaseEvidence', () => {
  it('accepts a complete verified record', () => {
    expect(inspectReleaseEvidence(verifiedFixture())).toEqual({
      status: 'verified',
      problems: []
    })
  })

  it('accepts a blocked record without passing output', () => {
    expect(inspectReleaseEvidence(blockedFixture())).toEqual({
      status: 'blocked',
      problems: []
    })
  })

  it('rejects a missing or empty record', () => {
    expect(inspectReleaseEvidence('').status).toBeNull()
    expect(inspectReleaseEvidence('   \n').problems.length).toBeGreaterThan(0)
  })

  it('rejects an unsupported status value', () => {
    const { status, problems } = inspectReleaseEvidence(
      blockedFixture().replace('status: blocked', 'status: pending')
    )
    expect(status).toBeNull()
    expect(problems).toContain('status 必须为 verified 或 blocked')
  })

  it('rejects a verified record that misses any required marker pair', () => {
    const markers = [
      'valid on disk',
      'satisfies its Designated Requirement',
      'The validate action worked!',
      'accepted',
      'source=Notarized Developer ID'
    ]
    for (const marker of markers) {
      const doc = verifiedFixture()
        .split('\n')
        .filter((line) => !line.includes(marker))
        .join('\n')
      expect(inspectReleaseEvidence(doc).problems.length).toBeGreaterThan(0)
    }
  })

  it('rejects a verified record with fewer than two distinct sha256 values', () => {
    const doc = verifiedFixture().replace('b'.repeat(64), 'a'.repeat(64))
    expect(inspectReleaseEvidence(doc).problems).toContain(
      'verified 分支需记录两个不同产物的 SHA-256'
    )
  })

  it('rejects a blocked record that carries passing output', () => {
    for (const marker of PASSING_MARKERS) {
      const doc = `${blockedFixture()}\n${marker}\n`
      expect(inspectReleaseEvidence(doc).problems.length).toBeGreaterThan(0)
    }
  })

  it('rejects a blocked record that carries an artifact sha256', () => {
    const doc = `${blockedFixture()}\ndmg sha256: ${'c'.repeat(64)}\n`
    expect(inspectReleaseEvidence(doc).problems).toContain(
      'blocked 分支不得记录产物 SHA-256'
    )
  })
})

// Same read-only parser, different evidence record. The v0.2.2 file is the
// published-release counterpart of the v0.2.1 blocked record above.
const evidenceV022Path = join(repoRoot, 'docs/release-evidence/v0.2.2.md')

describe('v0.2.2 release evidence document', () => {
  it('exists, is non-empty, declares the version once and passes the verified branch', () => {
    expect(existsSync(evidenceV022Path)).toBe(true)
    const doc = readEvidence(evidenceV022Path)
    expect(doc.trim().length).toBeGreaterThan(0)
    expect(doc).toContain('v0.2.2')
    expect(doc.match(/^status:\s*verified$/gm)?.length).toBe(1)

    const { status, problems } = inspectReleaseEvidence(doc, 'v0.2.2')
    expect(problems).toEqual([])
    expect(status).toBe('verified')
  })

  it('records the public dmg and zip SHA-256 values', () => {
    const doc = readEvidence(evidenceV022Path)
    expect(doc).toContain('7c7232b9c02431c36d98a6b367436697ab379e9ef8c97e30c59b29e57eaa6ae8')
    expect(doc).toContain('2f0a2e0fb00cacaa442ffa4796c47afc3e438555a8641dc8234aa3f608b12f34')
  })

  it('records the read-only forensic commands and the host facts', () => {
    const doc = readEvidence(evidenceV022Path)
    for (const command of [
      'gh release view v0.2.2 --repo chaxiu/OpenCompare',
      'shasum -a 256',
      'ditto -x -k',
      'hdiutil attach -nobrowse -readonly',
      'hdiutil detach',
      'codesign -dv --verbose=4',
      'sw_vers',
      'uname -m'
    ]) {
      expect(doc).toContain(command)
    }
    expect(doc).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{4}/)
  })

  it('records both bundle identities and the packaged brand icon digest', () => {
    const doc = readEvidence(evidenceV022Path)
    expect(doc).toContain('CFBundleShortVersionString')
    expect(doc).toContain('CFBundleIconFile')
    for (const marker of [
      /Authority=Developer ID Application: Tao Zhu \(3X4J53U6RY\)/g,
      /TeamIdentifier=3X4J53U6RY/g,
      /flags=0x10000\(runtime\)/g
    ]) {
      expect(doc.match(marker)?.length ?? 0).toBeGreaterThanOrEqual(2)
    }
    expect(doc).toContain('a099851e7c8888e244410a5490800e837920d337c2588fb9e70ce577c2fc0f8f')
  })

  it('flags a document that does not declare the expected version', () => {
    expect(inspectReleaseEvidence(readEvidence(), 'v0.2.2').problems).toContain(
      '证据文件未声明 v0.2.2'
    )
  })
})

// v0.2.4 shipped. Its evidence file is a read-only record of the tag-triggered
// CI run plus the host-side recheck; the table below mirrors the run's
// evidence/assets-sha256.txt and must stay byte-identical.
const evidenceV024Path = join(repoRoot, 'docs/release-evidence/v0.2.4.md')

const v024Assets: Array<[name: string, sha256: string]> = [
  ['latest-linux.yml', 'f1a51b5d107b942b49258773f9cf52bf3a47c7dfd72aa86f8d2772d899285e72'],
  ['latest-mac.yml', '1b47bfa931f32ee1398dcef13f937bbff02c1ec6d8d3e874dff34c2f4d5bf0ba'],
  ['latest.yml', '8e5c05e69dd9334009089a44e1962538413c5ecbd995b018b0f3624792e6eaca'],
  ['opencompare_0.2.4_amd64.deb', '4ddd85c57444746eded750d87b25583de82166d3dc5dc3f663b8db257671c972'],
  ['OpenCompare-0.2.4-arm64-mac.zip', '8f8ff17af1e8439fa8a2c4a3ee1819c4a8e4e2ec6c1235e390fbc047674ddca4'],
  ['OpenCompare-0.2.4-arm64-mac.zip.blockmap', '855090700f75c0a2577f8ed3631f650c5dad0a498531af48ddba4e2a516df716'],
  ['OpenCompare-0.2.4-arm64.dmg', 'ae0dc1081db73e0b2f9148fee8cdee8110cc1a12189246a2a5f60f22e566d6f3'],
  ['OpenCompare-0.2.4-arm64.dmg.blockmap', '2bc656ab743cc90b1c260622a9af4962ead1f6ef05a301fda20805ae90d63d73'],
  ['OpenCompare-0.2.4.AppImage', 'fcb6c2c95cac7db51747d5238cdcdc4d8fef0c2bfe62c6f1f111f6ec66a4f896'],
  ['OpenCompare.Setup.0.2.4.exe', 'd7e39acb8dead8a2adca9e7a016f7b5ff0f3c99445333fcae7b45916a7195ede'],
  ['OpenCompare.Setup.0.2.4.exe.blockmap', 'fa26cbb8915371acc2626f90afdd0e793e84e663326e892e80678533fc9843d9']
]

const v024Jobs = [
  'Quality gates',
  'Package mac',
  'Package win',
  'Package linux',
  'Publish the GitHub Release'
]

describe('v0.2.4 release evidence document', () => {
  const doc = (): string => readEvidence(evidenceV024Path)

  it('exists, is non-empty and declares the verified run identity', () => {
    expect(existsSync(evidenceV024Path)).toBe(true)
    const text = doc()
    expect(text.trim().length).toBeGreaterThan(0)
    expect(text.match(/^status:\s*verified$/gm)?.length).toBe(1)
    for (const marker of [
      'v0.2.4',
      '39692988051',
      '55d3af2db1632d05f94b3eca88020240714b21f6'
    ]) {
      expect(text).toContain(marker)
    }
  })

  it('records every job with the CI success conclusion', () => {
    const rows = doc()
      .split(/\r?\n/)
      .filter((line) => line.startsWith('| '))
    for (const job of v024Jobs) {
      const row = rows.find((line) => line.startsWith(`| ${job} |`))
      expect(row, `missing job row ${job}`).toBeDefined()
      expect(row).toContain('success')
    }
    expect(rows.filter((line) => line.startsWith('| Package ')).length).toBe(3)
  })

  it('lists exactly the 11 published assets and their sha256 values', () => {
    const text = doc()
    const rows = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith('| `'))
    const listed = rows
      .map((row) => /^\| `([^`]+)` \|[^|]*\| `([0-9a-f]{64})` \|$/.exec(row))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => [match[1], match[2]] as const)
    expect(listed.map(([name]) => name).sort()).toEqual(v024Assets.map(([name]) => name).sort())
    for (const [name, sha] of v024Assets) {
      expect(listed.find(([listedName]) => listedName === name)?.[1]).toBe(sha)
    }
    // No sha256 outside the published asset list.
    const digests = new Set(text.match(/[0-9a-f]{64}/g) ?? [])
    expect([...digests].sort()).toEqual(v024Assets.map(([, sha]) => sha).sort())
  })

  it('records the mac signing markers with their source', () => {
    const text = doc()
    for (const marker of [
      'notarization successful',
      'valid on disk',
      'satisfies its Designated Requirement',
      'The validate action worked!',
      'accepted',
      'source=Notarized Developer ID',
      'Authority=Developer ID Application: Tao Zhu (3X4J53U6RY)',
      'TeamIdentifier=3X4J53U6RY',
      'flags=0x10000(runtime)'
    ]) {
      expect(text).toContain(marker)
    }
    expect(text).toContain('CI 日志')
    expect(text).toContain('本机复核')
  })

  it('records the release uniqueness and latest gates', () => {
    const text = doc()
    expect(text).toContain('releases for v0.2.4: 1 (drafts: 0, prereleases: 0)')
    expect(text).toContain('latest published release: v0.2.4 (this tag: v0.2.4)')
    expect(text).toContain('11/11')
  })

  it('records the Windows update url defect as an unfixed P2 leftover', () => {
    const text = doc()
    for (const marker of [
      'OpenCompare-Setup-0.2.4.exe',
      'OpenCompare.Setup.0.2.4.exe',
      'P2',
      'v0.2.2 起既有',
      '无运行时消费者',
      '不重发',
      '不改写'
    ]) {
      expect(text).toContain(marker)
    }
  })

  it('records the embedded AppImage blockmap conclusion', () => {
    const text = doc()
    expect(text).toContain('blockMapSize')
    expect(text).toContain('*.AppImage.blockmap')
    expect(text).toContain('内嵌')
  })
})
