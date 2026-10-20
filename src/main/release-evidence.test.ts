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

const inspectReleaseEvidence = (doc: string): EvidenceReport => {
  const problems: string[] = []
  const text = doc.trim()
  if (!text) return { status: null, problems: ['证据文件缺失或为空'] }
  if (!text.includes('v0.2.1')) problems.push('证据文件未声明 v0.2.1')

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

const readEvidence = (): string =>
  existsSync(evidencePath) ? readFileSync(evidencePath, 'utf8') : ''

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
