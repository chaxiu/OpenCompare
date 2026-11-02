import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
// Read-only assertions over docs/release-evidence/*.md and the ledger that pins
// their historical asset rows. No download, unpack, mount, sign, notarize or git
// write happens here; a missing or fabricated record fails `pnpm test`.
const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const evidenceDir = join(repoRoot, 'docs/release-evidence')
const ledgerPath = join(repoRoot, 'docs/release-evidence-ledger.json')

type EvidenceStatus = 'verified' | 'blocked'
interface LedgerAsset { name: string; bytes: number; sha256: string }
interface ExtraDigest { label: string; sha256: string }
interface LedgerVersion { version: string; status: EvidenceStatus; assets: LedgerAsset[]; extraDigests: ExtraDigest[] }
interface Ledger { versions: LedgerVersion[] }
interface EvidenceReport { status: EvidenceStatus | null; problems: string[] }
interface MarkerRule { marker: string; minimum: number }
interface VersionSpec {
  sections: string
  commands: string
  identities: string
  markers: MarkerRule[]
  jobs: string[]
  finalize: boolean
  sourceLabels: string
  facts: Array<[heading: string, text: string]>
  minBlockedBullets?: number
}
const HEX64 = /^[0-9a-f]{64}$/
const PASSING_MARKERS = ['valid on disk', 'satisfies its Designated Requirement', 'The validate action worked!', 'source=Notarized Developer ID']
const JOBS = ['Quality gates', 'Package mac', 'Package win', 'Package linux', 'Publish the GitHub Release']
const SIGNING_MARKERS: MarkerRule[] = ['valid on disk', 'satisfies its Designated Requirement', 'The validate action worked!', 'accepted', 'source=Notarized Developer ID'].map((marker) => ({ marker, minimum: 2 }))
const list = (value: string): string[] => (value.trim() ? value.split(' | ') : [])
const ledgerSource = existsSync(ledgerPath) ? readFileSync(ledgerPath, 'utf8') : ''
const ledger = JSON.parse(ledgerSource || '{"versions":[]}') as Ledger
const versions = ledger.versions
const docCache = new Map<string, string>()
const readEvidence = (version: string): string => {
  const path = join(evidenceDir, `${version}.md`)
  const doc = docCache.get(version) ?? (existsSync(path) ? readFileSync(path, 'utf8') : '')
  docCache.set(version, doc)
  return doc
}
const sha256Values = (doc: string): string[] => [...new Set(doc.match(/[0-9a-f]{64}/g) ?? [])]
const occurrences = (text: string, marker: string): number => text.split(marker).length - 1
const parseStatus = (doc: string): string | null => /^\s*(?:-\s*)?status:\s*(\S+)\s*$/m.exec(doc)?.[1] ?? null

// Three formats live in the pinned history: 3-column markdown, 4-column
// markdown (v0.2.7 adds the public URL) and the v0.2.2 TSV asset listing.
const parseAssetRows = (doc: string): LedgerAsset[] => {
  const rows: LedgerAsset[] = []
  for (const line of doc.split(/\r?\n/)) {
    const markdown = /^\| `([^`]+)` \| ([\d,]+) \| `([0-9a-f]{64})` \|(?: .+ \|)?$/.exec(line)
    if (markdown) {
      rows.push({ name: markdown[1], bytes: Number(markdown[2].replaceAll(',', '')), sha256: markdown[3] })
      continue
    }
    const tsv = /^([\w.@-]+)\t(\d+)\tsha256:([0-9a-f]{64})$/.exec(line)
    if (tsv) rows.push({ name: tsv[1], bytes: Number(tsv[2]), sha256: tsv[3] })
  }
  return rows
}
const sectionText = (doc: string, heading: string): string => {
  const start = doc.indexOf(heading)
  if (start < 0) return ''
  const rest = doc.slice(start + heading.length)
  const end = rest.search(/\n## /)
  return end < 0 ? rest : rest.slice(0, end)
}
const tableRows = (doc: string, heading: string): string[][] =>
  sectionText(doc, heading).split(/\r?\n/).filter((line) => line.startsWith('| ')).map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))

// Baseline pure inspector: status grammar, verified marker pairs and the blocked
// branch. Fixture digests stay synthetic so no history is copied into this file.
const inspectReleaseEvidence = (doc: string, version: string): EvidenceReport => {
  const problems: string[] = []
  const text = doc.trim()
  if (!text) return { status: null, problems: ['证据文件缺失或为空'] }
  if (!text.includes(version)) problems.push(`证据文件未声明 ${version}`)
  const status = parseStatus(text)
  if (status !== 'verified' && status !== 'blocked') {
    problems.push('status 必须为 verified 或 blocked')
    return { status: null, problems }
  }
  if (status === 'verified') {
    for (const { marker, minimum } of SIGNING_MARKERS) {
      if (occurrences(text, marker) < minimum) problems.push(`verified 分支需记录至少 ${minimum} 处「${marker}」`)
    }
    if (sha256Values(text).length < 2) problems.push('verified 分支需记录两个不同产物的 SHA-256')
  } else {
    for (const marker of PASSING_MARKERS) if (text.includes(marker)) problems.push(`blocked 分支不得出现通过标记「${marker}」`)
    if (sha256Values(text).length > 0) problems.push('blocked 分支不得记录产物 SHA-256')
  }
  return { status, problems }
}

// Ledger-driven inspector: every expected value is injected from the JSON, so a
// tampered ledger row or a tampered document row both surface as a named problem.
const inspectLedgerEvidence = (doc: string, node: LedgerVersion): EvidenceReport => {
  const problems: string[] = []
  const text = doc.trim()
  if (!text) return { status: null, problems: ['证据文件缺失或为空'] }
  if (!text.includes(node.version)) problems.push(`证据文件未声明 ${node.version}`)
  const statusLines = text.match(/^\s*(?:-\s*)?status:\s*(\S+)\s*$/gm) ?? []
  if (statusLines.length !== 1) problems.push('全文必须恰好一处 status: 行')
  const status = parseStatus(text)
  if (status !== node.status) problems.push(`${node.version} status 必须为 ${node.status}`)
  if (node.status === 'blocked') {
    for (const marker of PASSING_MARKERS) if (text.includes(marker)) problems.push(`blocked 分支不得出现通过标记「${marker}」`)
    if (sha256Values(text).length > 0) problems.push('blocked 分支不得记录产物 SHA-256')
    return { status: status as EvidenceStatus | null, problems }
  }
  if (text.includes('pending')) problems.push('verified 记录不得残留 pending 字样')
  if (/待回填|TBD|TODO|FIXME/.test(text)) problems.push('verified 记录不得残留占位标记')
  if (node.version === 'v0.2.5' && (/<[^>\n]+>/.test(text) || /```text\r?\n\s*```/.test(text))) problems.push('v0.2.5 不得残留尖括号占位或空 text 代码块')
  const rows = parseAssetRows(text)
  if (rows.length !== node.assets.length) problems.push(`${node.version} 资产表必须恰好 ${node.assets.length} 行，实际 ${rows.length} 行`)
  const pinned = new Map(node.assets.map((asset) => [asset.name, asset]))
  for (const row of rows) {
    const expected = pinned.get(row.name)
    if (expected === undefined) { problems.push(`${node.version} 资产表出现未登记资产名「${row.name}」`); continue }
    if (row.bytes !== expected.bytes) problems.push(`${node.version} 资产「${row.name}」字节数与台账不一致`)
    if (row.sha256 !== expected.sha256) problems.push(`${node.version} 资产「${row.name}」sha256 与台账不一致`)
  }
  for (const asset of node.assets) if (!rows.some((row) => row.name === asset.name)) problems.push(`${node.version} 资产表缺少「${asset.name}」`)

  const closure = new Set([...node.assets.map((asset) => asset.sha256), ...node.extraDigests.map((digest) => digest.sha256)])
  const found = sha256Values(text)
  for (const digest of found) if (!closure.has(digest)) problems.push(`${node.version} 出现未登记的 64 位十六进制「${digest}」`)
  for (const digest of closure) if (!found.includes(digest)) problems.push(`${node.version} 证据文档缺少台账 digest「${digest}」`)
  return { status: status as EvidenceStatus | null, problems }
}
const specs: Record<string, VersionSpec> = {
  'v0.2.1': {
    sections: '## 1. 机器与取证时间 | ## 2. 只读就绪门 | ## 3. 缺失项 | ## 4. 未执行的取证动作 | ## 5. 待人工动作 | ## 6. 升级说明',
    commands: 'git ls-remote --tags origin refs/tags/v0.2.1 | gh release view v0.2.1 --repo chaxiu/OpenCompare | git tag --list v0.2.1',
    identities: 'release not found', markers: [], jobs: [], finalize: false, sourceLabels: '', facts: []
  },
  'v0.2.2': {
    sections: '## 1. 机器与取证时间 | ## 2. 公开 Release 只读门 | ## 3. 下载与 SHA-256 对账 | ## 4. 解包与挂载 | ## 5. dmg 内 `OpenCompare.app` | ## 6. zip 内 `OpenCompare.app` | ## 7. 双产物身份与图标对账 | ## 8. 卸载与清理',
    commands: 'gh release view v0.2.2 --repo chaxiu/OpenCompare | shasum -a 256 | ditto -x -k | hdiutil attach -nobrowse -readonly | hdiutil detach | codesign -dv --verbose=4 | sw_vers | uname -m',
    identities: 'https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.2',
    markers: [
      { marker: 'CFBundleShortVersionString', minimum: 1 },
      { marker: 'CFBundleIconFile', minimum: 1 },
      { marker: 'Authority=Developer ID Application: Tao Zhu (3X4J53U6RY)', minimum: 2 },
      { marker: 'TeamIdentifier=3X4J53U6RY', minimum: 2 },
      { marker: 'flags=0x10000(runtime)', minimum: 2 }
    ],
    jobs: [], finalize: false, sourceLabels: '', facts: []
  },
  'v0.2.4': {
    sections: '## 1. 发布标识 | ## 2. CI job 结论 | ## 3. 资产 sha256 全表 | ## 4. macOS 签名、公证与 Gatekeeper | ## 5. Release 唯一性、latest 门与资产对账 | ## 6. 更新元数据：AppImage blockmap 形态 | ## 7. 遗留缺陷：Windows 更新 URL 与真实资产名不一致',
    commands: 'shasum -a 256 | gh release list',
    identities: 'https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.4 | 39692988051 | 55d3af2db1632d05f94b3eca88020240714b21f6',
    markers: ['notarization successful', ...SIGNING_MARKERS.map(({ marker }) => marker), 'Authority=Developer ID Application: Tao Zhu (3X4J53U6RY)', 'TeamIdentifier=3X4J53U6RY', 'flags=0x10000(runtime)'].map((marker) => ({ marker, minimum: 1 })),
    jobs: JOBS, finalize: true, sourceLabels: 'CI 日志 | 本机复核',
    facts: [['## 6. 更新元数据：AppImage blockmap 形态', 'blockMapSize'], ['## 6. 更新元数据：AppImage blockmap 形态', '*.AppImage.blockmap'], ['## 6. 更新元数据：AppImage blockmap 形态', '内嵌']]
  },
  'v0.2.5': {
    sections: '## 1. 发布前就绪清单（发布前快照） | ## 2. 资产名 / 字节 / sha256 | ## 3. 发布标识、CI job 结论与唯一 Release / latest 门 | ## 4. macOS 两套产物的签名 / 公证 / Gatekeeper 原文 | ## 5. 本地元数据命中校验实测 | ## 6. product-qa 公开复验交接区',
    commands: 'codesign --verify --deep --strict --verbose=2 | codesign -dv --verbose=4 | xcrun stapler validate | spctl -a -vv --type execute | hdiutil detach | pnpm release:metadata --dir',
    identities: 'https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.5 | 39713762292 | 2eedc5de1ebfbc8e835d08d18e959b394fadceb4',
    markers: SIGNING_MARKERS, jobs: JOBS, finalize: true, sourceLabels: 'dmg 内 `.app` | zip 内 `.app`',
    facts: [
      ['## 5. 本地元数据命中校验实测', '旧错位名 0 命中'], ['## 5. 本地元数据命中校验实测', 'OpenCompare-Setup-0.2.5.exe'],
      ['## 5. 本地元数据命中校验实测', 'OpenCompare.Setup.0.2.5.exe'], ['## 5. 本地元数据命中校验实测', 'release:metadata 校验通过：3 份 latest*.yml、11 个资产名。'],
      ['## 6. product-qa 公开复验交接区', 'product-qa'], ['## 6. product-qa 公开复验交接区', '干净环境'], ['## 6. product-qa 公开复验交接区', '3 轮'],
      ['## 6. product-qa 公开复验交接区', '已跳过：左 X / 右 Y'], ['## 6. product-qa 公开复验交接区', '不跟随符号链接'], ['## 6. product-qa 公开复验交接区', '第 6 节']
    ]
  },
  'v0.2.7': {
    sections: '## 1. tag 与构建检出 | ## 2. 公开 Release | ## 3. Release CI run 与五 job 结论 | ## 4. 11 件公开资产：字节 / sha256 / 公开 URL | ## 5. 唯一性与 latest 门 | ## 6. macOS 签名 / 公证 | ## 7. L1 公开包复验 | ## 8. 负载面对照复验 | ## 9. 判定口径（公司 2026-10-27 裁决） | ## 10. 已知遗留 / 边界',
    commands: '',
    identities: 'https://github.com/chaxiu/OpenCompare/releases/tag/v0.2.7 | 422765578 | 40100596470 | adc6e1e50b84e211d1e1791a4ae61b6d6ba87d24 | e071f876da8cf502728e4d31b2699da8254629d5',
    markers: SIGNING_MARKERS, jobs: JOBS, finalize: true, sourceLabels: '',
    facts: [['## 7. L1 公开包复验', 'ZenMind'], ['## 7. L1 公开包复验', 'Δ3=2.06 MB'], ['## 7. L1 公开包复验', '116 ms']], minBlockedBullets: 4
  }
}
const specFor = (version: string): VersionSpec => {
  const spec = specs[version]
  if (spec === undefined) throw new Error(`missing structural spec for ${version}`)
  return spec
}
const verifiedFixture = (): string =>
  [
    '# v0.2.1 本机 dmg/zip 签名公证取证证据', 'status: verified',
    'zip app: valid on disk', 'zip app: satisfies its Designated Requirement', 'dmg app: valid on disk', 'dmg app: satisfies its Designated Requirement',
    'zip app: The validate action worked!', 'dmg app: The validate action worked!', 'zip app: accepted', 'dmg app: accepted',
    'zip app: source=Notarized Developer ID', 'dmg app: source=Notarized Developer ID',
    `dmg sha256: ${'a'.repeat(64)}`, `zip sha256: ${'b'.repeat(64)}`
  ].join('\n')
const blockedFixture = (): string =>
  ['# v0.2.1 本机 dmg/zip 签名公证取证证据', 'status: blocked', 'git ls-remote --tags origin refs/tags/v0.2.1', 'gh release view v0.2.1 --repo chaxiu/OpenCompare --json tagName,isDraft,isPrerelease,url,assets', 'release not found'].join('\n')
describe('release evidence ledger', () => {
  it('exists, parses and lists exactly the five pinned versions', () => {
    expect(existsSync(ledgerPath)).toBe(true)
    expect(ledgerSource.trim().length).toBeGreaterThan(0)
    expect(Array.isArray(ledger.versions)).toBe(true)
    expect(versions.map((node) => node.version)).toEqual(['v0.2.1', 'v0.2.2', 'v0.2.4', 'v0.2.5', 'v0.2.7'])
    expect(new Set(versions.map((node) => node.version)).size).toBe(versions.length)
    expect(Object.keys(specs).sort()).toEqual(versions.map((node) => node.version).sort())
  })
  it('pins 44 asset rows, 3 extra digests and the blocked zero-asset version', () => {
    expect(versions.map((node) => node.assets.length)).toEqual([0, 11, 11, 11, 11])
    expect(versions.reduce((total, node) => total + node.assets.length, 0)).toBe(44)
    expect(versions.reduce((total, node) => total + node.extraDigests.length, 0)).toBe(3)
    expect(versions.find((node) => node.version === 'v0.2.1')?.status).toBe('blocked')
  })
  it('keeps every asset name unique, every byte count positive and every sha256 well formed', () => {
    for (const node of versions) {
      const names = node.assets.map((asset) => asset.name)
      expect(names.every((name) => name.trim().length > 0)).toBe(true)
      expect(new Set(names).size).toBe(names.length)
      for (const asset of node.assets) {
        expect(Number.isInteger(asset.bytes) && asset.bytes > 0, `${node.version} ${asset.name}`).toBe(true)
        expect(asset.sha256, `${node.version} ${asset.name}`).toMatch(HEX64)
      }
    }
  })
  it('labels every extra digest and gives it a valid sha256', () => {
    const extras = versions.flatMap((node) => node.extraDigests)
    expect(extras).toHaveLength(3)
    for (const digest of extras) {
      expect(digest.label.trim().length).toBeGreaterThan(0)
      expect(digest.sha256).toMatch(HEX64)
    }
  })
  it('closes 47 unique digests over assets plus extra digests', () => {
    const all = new Set(versions.flatMap((node) => [...node.assets.map((asset) => asset.sha256), ...node.extraDigests.map((digest) => digest.sha256)]))
    expect(all.size).toBe(47)
    expect(versions.map((node) => new Set([...node.assets.map((asset) => asset.sha256), ...node.extraDigests.map((digest) => digest.sha256)]).size)).toEqual([0, 13, 11, 12, 11])
  })
  it('parses the three documented asset table formats', () => {
    const first = 'a'.repeat(64)
    const second = 'b'.repeat(64)
    const rows = parseAssetRows([`| \`a.bin\` | 1,024 | \`${first}\` |`, `| \`b.bin\` | 2048 | \`${second}\` | <https://example.test/b.bin> |`, `c.bin\t3072\tsha256:${first}`].join('\n'))
    expect(rows).toEqual([{ name: 'a.bin', bytes: 1024, sha256: first }, { name: 'b.bin', bytes: 2048, sha256: second }, { name: 'c.bin', bytes: 3072, sha256: first }])
  })
})
describe.each(versions)('$version release evidence', (node) => {
  const doc = (): string => readEvidence(node.version)
  const spec = specFor(node.version)
  it('exists, declares the version and carries the ledger status', () => {
    expect(existsSync(join(evidenceDir, `${node.version}.md`))).toBe(true)
    const text = doc()
    expect(text.trim().length).toBeGreaterThan(0)
    expect(parseStatus(text)).toBe(node.status)
    expect(text.match(/^\s*(?:-\s*)?status:\s*\S+\s*$/gm) ?? []).toHaveLength(1)
    expect(inspectLedgerEvidence(text, node).problems).toEqual([])
  })
  it('matches the ledger asset table row by row', () => {
    const rows = parseAssetRows(doc())
    expect(rows).toHaveLength(node.assets.length)
    expect(rows.map((row) => row.name).sort()).toEqual(node.assets.map((asset) => asset.name).sort())
    for (const asset of node.assets) expect(rows.find((row) => row.name === asset.name), `${node.version} ${asset.name}`).toEqual(asset)
  })
  it('closes the document digest set over the ledger', () => {
    const expected = [...new Set([...node.assets.map((asset) => asset.sha256), ...node.extraDigests.map((digest) => digest.sha256)])].sort()
    expect(sha256Values(doc()).sort()).toEqual(expected)
  })
  it('keeps the documented sections, commands, identities and source labels', () => {
    const text = doc()
    expect(text).toContain(node.version)
    for (const heading of list(spec.sections)) expect(text).toContain(heading)
    for (const command of list(spec.commands)) expect(text).toContain(command)
    for (const identity of list(spec.identities)) expect(text).toContain(identity)
    for (const label of list(spec.sourceLabels)) expect(text).toContain(label)
  })
  it('records every required signing marker at its minimum count', () => {
    const text = doc()
    if (spec.markers.length === 0) {
      for (const marker of PASSING_MARKERS) expect(occurrences(text, marker)).toBe(0)
      return
    }
    for (const { marker, minimum } of spec.markers) expect(occurrences(text, marker), `${node.version} ${marker}`).toBeGreaterThanOrEqual(minimum)
  })
})
describe.each(versions.filter((node) => specFor(node.version).jobs.length > 0))('$version CI jobs', (node) => {
  it('records every job with the success conclusion', () => {
    const rows = readEvidence(node.version).split(/\r?\n/).filter((line) => line.startsWith('| '))
    for (const job of JOBS) {
      const row = rows.find((line) => line.startsWith(`| ${job} |`))
      expect(row, `${node.version} missing job row ${job}`).toBeDefined()
      expect(row).toContain('success')
    }
    expect(rows.filter((line) => line.startsWith('| Package '))).toHaveLength(3)
  })
})
describe.each(versions.filter((node) => specFor(node.version).finalize))('$version release uniqueness gate', (node) => {
  it('records the finalize gate output for the tag', () => {
    const text = readEvidence(node.version)
    expect(text).toContain(`releases for ${node.version}: 1 (drafts: 0, prereleases: 0)`)
    expect(text).toContain(`latest published release: ${node.version} (this tag: ${node.version})`)
  })
})
describe.each(versions.filter((node) => specFor(node.version).facts.length > 0))('$version section facts', (node) => {
  it('keeps every technical fact inside its documented section', () => {
    const text = readEvidence(node.version)
    const spec = specFor(node.version)
    for (const [heading, fact] of spec.facts) expect(sectionText(text, heading)).toContain(fact)
    if (spec.minBlockedBullets !== undefined) expect(occurrences(sectionText(text, '## 7. L1 公开包复验'), 'blocked')).toBeGreaterThanOrEqual(spec.minBlockedBullets)
  })
})
describe('v0.2.1 blocked record', () => {
  it('parses as blocked with zero asset rows and zero digests', () => {
    const text = readEvidence('v0.2.1')
    expect(parseStatus(text)).toBe('blocked')
    expect(parseAssetRows(text)).toEqual([])
    expect(sha256Values(text)).toEqual([])
  })
  it('keeps the missing-item conclusions and the escalation sections', () => {
    const text = readEvidence('v0.2.1')
    const conclusions = tableRows(text, '## 3. 缺失项').slice(2).map((row) => row[2])
    expect(conclusions.length).toBeGreaterThan(0)
    expect(conclusions.every((value) => /^(缺失|不可核验)$/.test(value))).toBe(true)
    for (const heading of ['## 4. 未执行的取证动作', '## 5. 待人工动作', '## 6. 升级说明']) expect(text).toContain(heading)
  })
})
describe('v0.2.4 defect record', () => {
  it('records the Windows update url defect as a P2 leftover table', () => {
    const rows = tableRows(readEvidence('v0.2.4'), '## 7. 遗留缺陷：Windows 更新 URL 与真实资产名不一致').slice(2)
    expect(rows.map(([key]) => key)).toEqual(['等级', '现象', '根因', '起始版本', '运行时影响', '本次处置'])
    expect(rows.every(([, value]) => value.trim().length > 0)).toBe(true)
    expect(rows[0][1]).toMatch(/^P2/)
    expect(rows[1][1]).toMatch(/OpenCompare-Setup-0\.2\.4\.exe.*OpenCompare\.Setup\.0\.2\.4\.exe/)
  })
})
describe('v0.2.5 metadata hits', () => {
  it('records three latest*.yml files whose urls all hit a real asset name', () => {
    const lines = [...readEvidence('v0.2.5').matchAll(/^(latest[\w.-]*\.yml): url (\d+)\/(\d+) 命中资产名$/gm)]
    expect(lines.map(([, file]) => file)).toEqual(['latest-linux.yml', 'latest-mac.yml', 'latest.yml'])
    for (const [, , hits, total] of lines) expect(hits).toBe(total)
  })
})
describe('inspectReleaseEvidence negative fixtures', () => {
  it('accepts a complete verified record', () => {
    expect(inspectReleaseEvidence(verifiedFixture(), 'v0.2.1')).toEqual({ status: 'verified', problems: [] })
  })
  it('accepts a blocked record without passing output', () => {
    expect(inspectReleaseEvidence(blockedFixture(), 'v0.2.1')).toEqual({ status: 'blocked', problems: [] })
  })
  it('rejects a missing or empty record', () => {
    expect(inspectReleaseEvidence('', 'v0.2.1').status).toBeNull()
    expect(inspectReleaseEvidence('   \n', 'v0.2.1').problems.length).toBeGreaterThan(0)
  })
  it('rejects a record that does not declare the expected version', () => {
    expect(inspectReleaseEvidence(readEvidence('v0.2.1'), 'v0.2.2').problems.join('\n')).toMatch(/证据文件未声明 v0\.2\.2/)
  })
  it('rejects an unsupported status value', () => {
    const report = inspectReleaseEvidence(blockedFixture().replace('status: blocked', 'status: pending'), 'v0.2.1')
    expect(report.status).toBeNull()
    expect(report.problems.join('\n')).toMatch(/status 必须为 verified 或 blocked/)
  })
  it('rejects a verified record that misses any required marker pair', () => {
    for (const { marker } of SIGNING_MARKERS) {
      const doc = verifiedFixture().split('\n').filter((line) => !line.includes(marker)).join('\n')
      expect(inspectReleaseEvidence(doc, 'v0.2.1').problems.length, marker).toBeGreaterThan(0)
    }
  })
  it('rejects a verified record with fewer than two distinct sha256 values', () => {
    expect(inspectReleaseEvidence(verifiedFixture().replace('b'.repeat(64), 'a'.repeat(64)), 'v0.2.1').problems.join('\n')).toMatch(/verified 分支需记录两个不同产物的 SHA-256/)
  })
  it('rejects a blocked record that carries passing output', () => {
    for (const marker of PASSING_MARKERS) expect(inspectReleaseEvidence(`${blockedFixture()}\n${marker}\n`, 'v0.2.1').problems.length, marker).toBeGreaterThan(0)
  })
  it('rejects a blocked record that carries an artifact sha256', () => {
    expect(inspectReleaseEvidence(`${blockedFixture()}\ndmg sha256: ${'c'.repeat(64)}\n`, 'v0.2.1').problems.join('\n')).toMatch(/blocked 分支不得记录产物 SHA-256/)
  })
})
describe('inspectLedgerEvidence v0.2.5 negative fixtures', () => {
  const v025 = (): LedgerVersion => {
    const node = versions.find((candidate) => candidate.version === 'v0.2.5')
    if (node === undefined) throw new Error('v0.2.5 missing from ledger')
    return node
  }
  it('rejects a record that loses one product marker pair', () => {
    const doc = readEvidence('v0.2.5').split('\n').filter((line) => !line.includes('source=Notarized Developer ID')).join('\n')
    expect(inspectReleaseEvidence(doc, 'v0.2.5').problems.length).toBeGreaterThan(0)
  })
  it('rejects an asset sha256 that does not match the ledger', () => {
    const node = v025()
    expect(inspectLedgerEvidence(readEvidence('v0.2.5').replace(node.assets[0].sha256, 'f'.repeat(64)), node).problems.join('\n')).toMatch(/资产「latest-linux\.yml」sha256 与台账不一致/)
  })
  it('rejects a record with fewer than eleven asset rows', () => {
    const node = v025()
    const doc = readEvidence('v0.2.5').split('\n').filter((line) => !line.startsWith('| `OpenCompare-0.2.5.AppImage` |')).join('\n')
    const problems = inspectLedgerEvidence(doc, node).problems.join('\n')
    expect(problems).toMatch(/资产表必须恰好 11 行，实际 10 行/)
    expect(problems).toMatch(/资产表缺少「OpenCompare-0\.2\.5\.AppImage」/)
  })
  it('rejects a record that still carries a pending status', () => {
    const node = v025()
    const report = inspectLedgerEvidence(readEvidence('v0.2.5').replace('status: verified', 'status: verified\nstatus: pending'), node)
    expect(report.problems.join('\n')).toMatch(/全文必须恰好一处 status: 行/)
    expect(report.problems.join('\n')).toMatch(/verified 记录不得残留 pending 字样/)
    expect(report.status).toBe('verified')
  })
})
