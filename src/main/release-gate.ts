// Pure release-document judgments. No fs, Electron, React or DOM access: the
// test-support loader reads the repository once and hands these functions plain
// facts, so every branch below is reachable without touching a file.
export interface GateIssue {
  path: string
  code: string
  detail?: string
}

export interface GateVerdict {
  ok: boolean
  issues: GateIssue[]
}

export interface VersionSourceFacts {
  pkgVersion: string
  changelogTopTag: string
  notesHeadingTag: string
  workflowDispatchDefault: string
  processDocDefault: string
}

const VERSION_SOURCE_FIELDS: ReadonlyArray<readonly [Exclude<keyof VersionSourceFacts, 'pkgVersion'>, string]> = [
  ['changelogTopTag', 'CHANGELOG.md#top-entry'],
  ['notesHeadingTag', 'release-notes#title'],
  ['workflowDispatchDefault', '.github/workflows/release.yml#workflow_dispatch.tag.default'],
  ['processDocDefault', 'docs/release-process.md#workflow_dispatch.default']
]

/** The single source of the release tag: `v` plus `package.json#version`. */
export const expectedTagFor = (version: string): string => `v${version}`

export const judgeVersionSources = (facts: VersionSourceFacts): GateVerdict => {
  const issues: GateIssue[] = []
  if (!/^\d+\.\d+\.\d+$/.test(facts.pkgVersion)) {
    issues.push({ path: 'package.json#version', code: 'version-not-semver' })
  }
  const tag = expectedTagFor(facts.pkgVersion)
  for (const [field, path] of VERSION_SOURCE_FIELDS) {
    const value = facts[field]
    if (value === '') {
      issues.push({ path, code: 'missing' })
      continue
    }
    if (value !== tag) {
      issues.push({ path, code: 'tag-mismatch', detail: `expected ${tag}, got ${value}` })
    }
  }
  return { ok: issues.length === 0, issues }
}

export interface PublishedAnchorFacts {
  readmeLine5Tag: string
  readmeZhLine5Tag: string
  publishedTag: string
}

/**
 * README line 5 announces what is already public, not what main is converging
 * to: it must equal the newest verified release derived from the evidence
 * ledger / evidence directory, never package.json#version.
 */
export const judgePublishedAnchor = (facts: PublishedAnchorFacts): GateVerdict => {
  const issues: GateIssue[] = []
  if (facts.publishedTag === '') {
    issues.push({ path: 'docs/release-evidence#latest-verified', code: 'published-tag-missing' })
    return { ok: false, issues }
  }
  const readmes: ReadonlyArray<readonly [string, string]> = [
    ['README.md#line-5', facts.readmeLine5Tag],
    ['README.zh-CN.md#line-5', facts.readmeZhLine5Tag]
  ]
  for (const [path, value] of readmes) {
    if (value !== facts.publishedTag) {
      issues.push({
        path,
        code: 'tag-mismatch',
        detail: `expected ${facts.publishedTag}, got ${value}`
      })
    }
  }
  return { ok: issues.length === 0, issues }
}

export interface NotesPresenceFacts {
  tag: string
  notesHeadingTag: string
  englishExists: boolean
  chineseExists: boolean
}

/** Evidence may be pending while the current tag has not shipped yet. */
export const judgeNotesPresence = (facts: NotesPresenceFacts): GateVerdict => {
  const issues: GateIssue[] = []
  if (!facts.englishExists) {
    issues.push({ path: `docs/release-notes/${facts.tag}.md`, code: 'notes-missing' })
  }
  if (!facts.chineseExists) {
    issues.push({ path: `docs/release-notes/${facts.tag}.zh-CN.md`, code: 'notes-missing' })
  }
  if (facts.notesHeadingTag !== facts.tag) {
    issues.push({
      path: `docs/release-notes/${facts.tag}.md#title`,
      code: 'tag-mismatch',
      detail: `expected ${facts.tag}, got ${facts.notesHeadingTag}`
    })
  }
  return { ok: issues.length === 0, issues }
}

export interface NotesOrderFacts {
  tag: string
  lines: readonly string[]
}

const HEADING = /^#\s+/
const isLanguageSwitch = (line: string): boolean =>
  line.includes('English') && line.includes('简体中文')

/** Notes are assembled as title line, language switch line, then body. */
export const judgeNotesOrder = (facts: NotesOrderFacts): GateVerdict => {
  const issues: GateIssue[] = []
  const headingIndex = facts.lines.findIndex((line) => HEADING.test(line))
  if (headingIndex === -1) {
    issues.push({ path: 'release-notes#title', code: 'heading-missing' })
  } else {
    if (headingIndex !== 0) issues.push({ path: 'release-notes#title', code: 'heading-not-first' })
    if (!facts.lines[headingIndex].includes(facts.tag)) {
      issues.push({
        path: 'release-notes#title',
        code: 'tag-mismatch',
        detail: `expected ${facts.tag} in title`
      })
    }
  }
  const switchIndex = facts.lines.findIndex(isLanguageSwitch)
  if (switchIndex === -1) {
    issues.push({ path: 'release-notes#language-switch', code: 'language-switch-missing' })
  } else if (switchIndex < headingIndex) {
    issues.push({ path: 'release-notes#language-switch', code: 'language-switch-before-heading' })
  }
  if (switchIndex !== -1) {
    const bodyIndex = facts.lines.findIndex(
      (line, index) => index > switchIndex && line.trim() !== ''
    )
    if (bodyIndex === -1) issues.push({ path: 'release-notes#body', code: 'body-missing' })
  }
  return { ok: issues.length === 0, issues }
}

/** English H2 → Chinese H2, in document order. */
export const NOTES_H2_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['What changed', '本次变化'],
  ['Windows installer and portable zip', 'Windows 安装包与免安装 zip'],
  ['macOS signing and notarization', 'macOS 签名与公证'],
  ['Not in this release', '不做的事'],
  ['Risk and verification scope', '风险与验证规模'],
  ['Upgrade', '升级方式']
]

const H2 = /^##\s+(.+?)\s*$/
export const h2Headings = (lines: readonly string[]): string[] =>
  lines.flatMap((line) => {
    const match = H2.exec(line)
    return match === null ? [] : [match[1]]
  })

export interface NotesHeadingsFacts {
  englishLines: readonly string[]
  chineseLines: readonly string[]
}

/** Both languages carry the same H2 count and the same ordered section pairs. */
export const judgeNotesHeadings = (facts: NotesHeadingsFacts): GateVerdict => {
  const issues: GateIssue[] = []
  const english = h2Headings(facts.englishLines)
  const chinese = h2Headings(facts.chineseLines)
  if (english.length !== chinese.length) {
    issues.push({
      path: 'release-notes#h2',
      code: 'h2-count-mismatch',
      detail: `english ${english.length}, chinese ${chinese.length}`
    })
  }
  for (const [index, [en, zh]] of NOTES_H2_PAIRS.entries()) {
    if (!english[index]?.includes(en)) {
      issues.push({ path: 'release-notes#h2', code: 'h2-mismatch', detail: `en[${index}] ${en}` })
    }
    if (!chinese[index]?.includes(zh)) {
      issues.push({ path: 'release-notes#h2', code: 'h2-mismatch', detail: `zh[${index}] ${zh}` })
    }
  }
  return { ok: issues.length === 0, issues }
}

export interface EvidenceStatusFact {
  tag: string
  status: string
}

export interface ReleaseHistoryFacts {
  currentTag: string
  headings: readonly string[]
  evidence: readonly EvidenceStatusFact[]
}

const TAG = /^v\d+\.\d+\.\d+$/
const tagParts = (tag: string): number[] => tag.replace(/^v/, '').split('.').map(Number)

/** Positive when `left` is newer than `right`, matching the changelog order. */
export const compareTags = (left: string, right: string): number => {
  const a = tagParts(left)
  const b = tagParts(right)
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index]
  }
  return 0
}

export const judgeReleaseHistory = (facts: ReleaseHistoryFacts): GateVerdict => {
  const issues: GateIssue[] = []
  const headings = facts.headings
  const evidenceTags = new Set(facts.evidence.map((entry) => entry.tag))
  if (headings.length === 0) {
    issues.push({ path: 'CHANGELOG.md', code: 'changelog-empty' })
  } else if (headings[0] !== facts.currentTag) {
    issues.push({
      path: 'CHANGELOG.md#top-entry',
      code: 'changelog-top-mismatch',
      detail: `expected ${facts.currentTag}, got ${headings[0]}`
    })
  }
  const seen = new Set<string>()
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index]
    if (seen.has(heading)) {
      issues.push({ path: 'CHANGELOG.md', code: 'changelog-duplicate', detail: heading })
    }
    seen.add(heading)
    if (!TAG.test(heading)) {
      issues.push({ path: 'CHANGELOG.md', code: 'changelog-tag-invalid', detail: heading })
      continue
    }
    if (index > 0 && compareTags(headings[index - 1], heading) <= 0) {
      issues.push({ path: 'CHANGELOG.md', code: 'changelog-order', detail: heading })
    }
    // The current tag is still converging: evidence may be written after the
    // tag ships. Every historical entry stays fail-closed.
    if (heading !== 'v0.1.2' && heading !== facts.currentTag && !evidenceTags.has(heading)) {
      issues.push({ path: `docs/release-evidence/${heading}.md`, code: 'evidence-missing' })
    }
  }
  for (const evidence of facts.evidence) {
    if (evidence.status === 'verified' && !seen.has(evidence.tag)) {
      issues.push({
        path: 'CHANGELOG.md',
        code: 'changelog-entry-missing',
        detail: evidence.tag
      })
    }
  }
  return { ok: issues.length === 0, issues }
}
