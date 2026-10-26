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

// v0.2.5 shipped. Its evidence file is the post-release counterpart of the
// v0.2.4 record: the CI run identity, the 11 published asset digests, the raw
// codesign/stapler/spctl output for both macOS products, and the local
// `pnpm release:metadata` transcript. The inspector below is v0.2.5-specific so
// the v0.2.1 / v0.2.4 blocks stay byte-identical.
const evidenceV025Path = join(repoRoot, 'docs/release-evidence/v0.2.5.md')

const v025Assets: Array<[name: string, sha256: string]> = [
  ['latest-linux.yml', '1da4010a6aadca05009d8f66be60943b3e494e82b36b39f6a4828adc0fe9706b'],
  ['latest-mac.yml', '576e08f85d3d2698866bab6475c3d0c3fe157f203c50aae3d8380e357945ce37'],
  ['latest.yml', '00d8f97455e0e8b319d46b9c870f17ca8ed45dcbf66780b9c899b93903010f29'],
  ['opencompare_0.2.5_amd64.deb', '4d126dd1d35e64fbaeca67e512b70a590485382695c7daa6398aede7c50c68ba'],
  ['OpenCompare-0.2.5-arm64-mac.zip', '81cda3cc14413b15a5ad2f75256b562efcdfc9fef2bde480c344e0503663f121'],
  ['OpenCompare-0.2.5-arm64-mac.zip.blockmap', 'b5a2a66f5f2f5faceabdb46d2cf2115f32f8ea85c2f49e740038fbd8657eaf4e'],
  ['OpenCompare-0.2.5-arm64.dmg', '2068667f22bd92e38927732128443127e18f06c0fc1fe7da8ec1442d6142c527'],
  ['OpenCompare-0.2.5-arm64.dmg.blockmap', 'ba74335cd738c14e5b12a7140909b1131b097592eebca53b775c5b5f103fd1a4'],
  ['OpenCompare-0.2.5.AppImage', 'e0be93f63363b7ce93afb2d9be1886ff8dcf692642a56d010b19ecd0d29883b6'],
  ['OpenCompare-Setup-0.2.5.exe', '6fbf4698c284cf55109c07994cb65c145c5612685c249e7e6922a04cc8c62402'],
  ['OpenCompare-Setup-0.2.5.exe.blockmap', '272867f6e7655c1cdba52b5bdff424c3e53e3d1ef7b446ea365bf279bb606442']
]

// Raw `codesign -dv --verbose=4` output carries the signed bundle's own
// CandidateCDHashFull / CMSDigest. It is not an asset digest, so it is the only
// 64-hex value allowed outside the published asset table.
const v025BundleCdHash = '3a46aec75cdbf188cade0bcc04bb297f5fe91c4298b3efcc7dc5a19c21f56adb'

const v025Jobs = [
  'Quality gates',
  'Package mac',
  'Package win',
  'Package linux',
  'Publish the GitHub Release'
]

interface V025Report {
  status: 'verified' | null
  problems: string[]
}

const v025AssetRows = (doc: string): Array<[name: string, bytes: string, sha256: string]> => {
  const start = doc.indexOf('## 2.')
  const end = doc.indexOf('\n## 3.')
  if (start < 0 || end <= start) return []
  const rows: Array<[string, string, string]> = []
  for (const line of doc.slice(start, end).split(/\r?\n/)) {
    const match = /^\| `([^`]+)` \| ([\d,]+) \| `([0-9a-f]{64})` \|$/.exec(line)
    if (match) rows.push([match[1], match[2], match[3]])
  }
  return rows
}

const inspectV025Evidence = (doc: string): V025Report => {
  const problems: string[] = []
  const text = doc.trim()
  if (!text) return { status: null, problems: ['证据文件缺失或为空'] }
  if (!text.includes('v0.2.5')) problems.push('证据文件未声明 v0.2.5')

  const statusLines = text.match(/^\s*(?:-\s*)?status:\s*(\S+)\s*$/gm) ?? []
  const statusValues = text.match(/^\s*(?:-\s*)?status:\s*(\S+)\s*$/m)
  if (statusLines.length !== 1) problems.push('全文必须恰好一处 status: 行')
  if (statusValues?.[1] !== 'verified') {
    problems.push('status 必须为 verified')
    return { status: null, problems }
  }
  if (text.includes('pending')) problems.push('verified 记录不得残留 pending 字样')

  for (const marker of ['待回填', 'TBD', 'TODO']) {
    if (text.includes(marker)) problems.push(`不得残留占位标记「${marker}」`)
  }
  if (/<[^>\n]+>/.test(text)) problems.push('不得残留尖括号占位')
  if (/^```text\s*$/m.test(text) && /```text\r?\n\s*```/.test(text)) {
    problems.push('不得保留空的 text 代码块')
  }

  const rows = v025AssetRows(text)
  if (rows.length !== 11) problems.push(`资产表必须恰好 11 行，实际 ${rows.length} 行`)
  const expected = new Map(v025Assets)
  for (const [name, bytes, sha] of rows) {
    if (!expected.has(name)) problems.push(`资产表出现未发布资产名「${name}」`)
    if (!/^[1-9][\d,]*$/.test(bytes)) problems.push(`资产「${name}」字节数必须为正整数`)
    const pinned = expected.get(name)
    if (pinned !== undefined && pinned !== sha) {
      problems.push(`资产「${name}」sha256 与实测钉板不一致`)
    }
  }
  if (new Set(rows.map(([, , sha]) => sha)).size !== rows.length) {
    problems.push('11 个资产 sha256 必须互不相同')
  }
  const allowedDigests = new Set([...v025Assets.map(([, sha]) => sha), v025BundleCdHash])
  for (const digest of sha256Values(text)) {
    if (!allowedDigests.has(digest)) problems.push(`出现未登记的 64 位十六进制「${digest}」`)
  }
  for (const [name] of v025Assets) {
    if (!rows.some(([listed]) => listed === name)) problems.push(`资产表缺少「${name}」`)
  }

  const occurrences = (marker: string): number => text.split(marker).length - 1
  for (const marker of [
    'valid on disk',
    'satisfies its Designated Requirement',
    'The validate action worked!',
    'accepted',
    'source=Notarized Developer ID'
  ]) {
    if (occurrences(marker) < 2) problems.push(`需为两套产物各记录一次「${marker}」`)
  }
  for (const source of ['dmg 内 `.app`', 'zip 内 `.app`']) {
    if (!text.includes(source)) problems.push(`缺少「${source}」来源标注`)
  }

  const jobRows = text.split(/\r?\n/)
  for (const job of v025Jobs) {
    const row = jobRows.find((line) => line.startsWith(`| ${job} |`))
    if (row === undefined) problems.push(`缺少 job 行「${job}」`)
    else if (!row.includes('success')) problems.push(`job「${job}」结论不是 success`)
  }

  for (const line of [
    'releases for v0.2.5: 1 (drafts: 0, prereleases: 0)',
    'latest published release: v0.2.5 (this tag: v0.2.5)',
    '39713762292',
    '2eedc5de1ebfbc8e835d08d18e959b394fadceb4',
    '2026-10-22T02:56:27Z',
    'https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.5'
  ]) {
    if (!text.includes(line)) problems.push(`缺少发布标识原文「${line}」`)
  }

  const metadataLines = [...text.matchAll(/^(latest[\w.-]*\.yml): url (\d+)\/(\d+) 命中资产名$/gm)]
  if (metadataLines.length !== 3) {
    problems.push(`元数据命中行必须为 3 行，实际 ${metadataLines.length} 行`)
  }
  for (const [, file, hits, total] of metadataLines) {
    if (hits !== total) problems.push(`${file} 命中数 ${hits}/${total} 未全部命中`)
  }
  for (const line of [
    'release:metadata 校验通过：3 份 latest*.yml、11 个资产名。',
    '旧错位名 0 命中',
    'pnpm release:metadata --dir',
    'OpenCompare-Setup-0.2.5.exe',
    'OpenCompare.Setup.0.2.5.exe',
    '退出码 `0`'
  ]) {
    if (!text.includes(line)) problems.push(`缺少元数据实测证据「${line}」`)
  }

  for (const marker of [
    'product-qa',
    '干净环境',
    '3 轮',
    '取消',
    '已跳过：左 X / 右 Y',
    '不跟随符号链接',
    'spctl',
    'stapler',
    'codesign'
  ]) {
    if (!text.includes(marker)) problems.push(`第 6 节 product-qa 交接缺少「${marker}」`)
  }

  return { status: 'verified', problems }
}

describe('v0.2.5 verified release evidence document', () => {
  const doc = (): string => readEvidence(evidenceV025Path)

  it('exists, is non-empty and declares verified exactly once', () => {
    expect(existsSync(evidenceV025Path)).toBe(true)
    const text = doc()
    expect(text.trim().length).toBeGreaterThan(0)
    expect(text.match(/^status:\s*verified$/gm)?.length).toBe(1)
    expect(text.match(/^status:/gm)?.length).toBe(1)
    expect(text).not.toContain('pending')
    const { status, problems } = inspectV025Evidence(text)
    expect(problems).toEqual([])
    expect(status).toBe('verified')
  })

  it('pins every published asset with real bytes and sha256', () => {
    const rows = v025AssetRows(doc())
    expect(rows).toHaveLength(11)
    expect(rows.map(([name]) => name).sort()).toEqual(v025Assets.map(([name]) => name).sort())
    for (const [name, bytes, sha] of rows) {
      expect(Number(bytes.replaceAll(',', '')), name).toBeGreaterThan(0)
      expect(sha, name).toBe(new Map(v025Assets).get(name))
    }
  })

  it('records the run identity, job conclusions and the latest gates', () => {
    const text = doc()
    for (const marker of [
      'releases for v0.2.5: 1 (drafts: 0, prereleases: 0)',
      'latest published release: v0.2.5 (this tag: v0.2.5)',
      '39713762292',
      '2eedc5de1ebfbc8e835d08d18e959b394fadceb4'
    ]) {
      expect(text).toContain(marker)
    }
    const rows = text.split(/\r?\n/)
    for (const job of v025Jobs) {
      const row = rows.find((line) => line.startsWith(`| ${job} |`))
      expect(row, `missing job row ${job}`).toBeDefined()
      expect(row).toContain('success')
    }
  })

  it('records both macOS products with every signing marker', () => {
    const text = doc()
    for (const marker of [
      'valid on disk',
      'satisfies its Designated Requirement',
      'The validate action worked!',
      'accepted',
      'source=Notarized Developer ID'
    ]) {
      expect(text.split(marker).length - 1, marker).toBeGreaterThanOrEqual(2)
    }
    expect(text).toContain('dmg 内 `.app`')
    expect(text).toContain('zip 内 `.app`')
    expect(text).toContain('codesign --verify --deep --strict --verbose=2')
    expect(text).toContain('codesign -dv --verbose=4')
    expect(text).toContain('xcrun stapler validate')
    expect(text).toContain('spctl -a -vv --type execute')
    expect(text).toContain('hdiutil detach')
  })

  it('records the metadata hits, the hyphenated windows name and zero legacy hits', () => {
    const text = doc()
    expect(text).toContain('release:metadata 校验通过：3 份 latest*.yml、11 个资产名。')
    expect(text).toContain('旧错位名 0 命中')
    expect(text).toContain('OpenCompare-Setup-0.2.5.exe')
    expect(text).toContain('OpenCompare.Setup.0.2.5.exe')
    expect(text).toContain('pnpm release:metadata --dir')
    const lines = [...text.matchAll(/^(latest[\w.-]*\.yml): url (\d+)\/(\d+) 命中资产名$/gm)]
    expect(lines).toHaveLength(3)
    for (const [, , hits, total] of lines) expect(hits).toBe(total)
  })

  it('keeps the product-qa handoff section and its status rule wording', () => {
    const text = doc()
    for (const marker of [
      'product-qa',
      '干净环境',
      '3 轮',
      '已跳过：左 X / 右 Y',
      '不跟随符号链接'
    ]) {
      expect(text).toContain(marker)
    }
    expect(text).toContain('第 6 节')
  })
})

describe('inspectV025Evidence negative fixtures', () => {
  it('rejects a record that loses one product marker pair', () => {
    const doc = readEvidence(evidenceV025Path)
      .split('\n')
      .filter((line) => !line.includes('source=Notarized Developer ID'))
      .join('\n')
    expect(inspectV025Evidence(doc).problems).not.toEqual([])
  })

  it('rejects a record whose asset sha256 does not match the measured digest', () => {
    const doc = readEvidence(evidenceV025Path).replace(v025Assets[0][1], 'f'.repeat(64))
    const problems = inspectV025Evidence(doc).problems
    expect(problems).toContain('资产「latest-linux.yml」sha256 与实测钉板不一致')
  })

  it('rejects a record with fewer than eleven asset rows', () => {
    const doc = readEvidence(evidenceV025Path)
      .split('\n')
      .filter((line) => !line.startsWith('| `OpenCompare-0.2.5.AppImage` |'))
      .join('\n')
    const problems = inspectV025Evidence(doc).problems
    expect(problems).toContain('资产表必须恰好 11 行，实际 10 行')
    expect(problems).toContain('资产表缺少「OpenCompare-0.2.5.AppImage」')
  })

  it('rejects a record that still carries a pending status', () => {
    const doc = readEvidence(evidenceV025Path).replace(
      'status: verified',
      'status: verified\nstatus: pending'
    )
    const { status, problems } = inspectV025Evidence(doc)
    expect(problems).toContain('全文必须恰好一处 status: 行')
    expect(problems).toContain('verified 记录不得残留 pending 字样')
    expect(status).toBe('verified')
  })
})

// v0.2.7 shipped. Its evidence record is the newest published counterpart of
// the v0.2.5 record above: the same read-only parser with an explicit path, so
// a missing or fabricated record fails `pnpm test` without touching history.
const evidenceV027Path = join(repoRoot, 'docs/release-evidence/v0.2.7.md')

describe('v0.2.7 release evidence document', () => {
  const doc = (): string => readEvidence(evidenceV027Path)

  it('exists, is non-empty and declares verified exactly once', () => {
    expect(existsSync(evidenceV027Path)).toBe(true)
    const text = doc()
    expect(text.trim().length).toBeGreaterThan(0)
    expect(text.match(/^status:\s*verified$/gm)?.length).toBe(1)

    const { status, problems } = inspectReleaseEvidence(text, 'v0.2.7')
    expect(problems).toEqual([])
    expect(status).toBe('verified')
  })

  it('records the release identity, run, dmg digest and the blocked L1 legs', () => {
    const text = doc()
    for (const marker of [
      'adc6e1e50b84e211d1e1791a4ae61b6d6ba87d24',
      'e071f876da8cf502728e4d31b2699da8254629d5',
      '422765578',
      '40100596470',
      '4375fe95f5048195e1bcf46513da6291a8363585ed01f6f636ec18845a24e8f5',
      'blocked',
      'ZenMind',
      'Δ3=2.06 MB',
      '116 ms'
    ]) {
      expect(text).toContain(marker)
    }
    expect(text.match(/blocked/g)?.length ?? 0).toBeGreaterThanOrEqual(4)
    expect(text).not.toMatch(/\b(?:TODO|TBD|FIXME)\b/)
  })
})
