import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  judgeNotesHeadings,
  judgeNotesOrder,
  judgeNotesPresence,
  judgePublishedAnchor,
  judgeReleaseHistory,
  judgeVersionSources,
  type GateVerdict,
  type NotesOrderFacts,
  type NotesPresenceFacts,
  type PublishedAnchorFacts,
  type ReleaseHistoryFacts,
  type VersionSourceFacts
} from './release-gate'
import { changelog, currentTag, markdownSection, parseMarkdown, pkg, releaseFacts } from './release-doc-fixtures.test-helpers'

const expectVerdict = (verdict: GateVerdict, codes: string[]): void => {
  expect(verdict.ok).toBe(codes.length === 0)
  expect(verdict.issues.map((issue) => issue.code)).toEqual(codes)
  for (const issue of verdict.issues) expect(issue.path).not.toBe('')
}

const versionFacts = (overrides: Partial<VersionSourceFacts> = {}): VersionSourceFacts => ({
  pkgVersion: '9.9.9',
  changelogTopTag: 'v9.9.9',
  notesHeadingTag: 'v9.9.9',
  workflowDispatchDefault: 'v9.9.9',
  processDocDefault: 'v9.9.9',
  ...overrides
})

const nonSemverFacts = (): VersionSourceFacts =>
  versionFacts({
    pkgVersion: '0.2',
    changelogTopTag: 'v0.2',
    notesHeadingTag: 'v0.2',
    workflowDispatchDefault: 'v0.2',
    processDocDefault: 'v0.2'
  })
const versionCases: Array<[string, VersionSourceFacts, string[]]> = [
  ['agrees on the synthetic tag', versionFacts(), []],
  ['changelog top points elsewhere', versionFacts({ changelogTopTag: 'v9.9.8' }), ['tag-mismatch']],
  ['notes title points elsewhere', versionFacts({ notesHeadingTag: 'v9.9.8' }), ['tag-mismatch']],
  ['workflow default points elsewhere', versionFacts({ workflowDispatchDefault: 'v9.9.8' }), ['tag-mismatch']],
  ['process doc default points elsewhere', versionFacts({ processDocDefault: 'v9.9.8' }), ['tag-mismatch']],
  ['package version is not semver', nonSemverFacts(), ['version-not-semver']],
  ['changelog top is absent', versionFacts({ changelogTopTag: '' }), ['missing']],
  ['notes title is absent', versionFacts({ notesHeadingTag: '' }), ['missing']],
  ['workflow default is absent', versionFacts({ workflowDispatchDefault: '' }), ['missing']],
  ['process doc default is absent', versionFacts({ processDocDefault: '' }), ['missing']]
]

describe('version single source', () => {
  it.each(versionCases)('%s', (_name, facts, codes) => expectVerdict(judgeVersionSources(facts), codes))
})

describe('published anchor', () => {
  const anchor = (overrides: Partial<PublishedAnchorFacts> = {}): PublishedAnchorFacts => ({ readmeLine5Tag: 'v1.2.2', readmeZhLine5Tag: 'v1.2.2', publishedTag: 'v1.2.2', ...overrides })
  const anchorCases: Array<[string, PublishedAnchorFacts, string[]]> = [
    ['both READMEs match the newest verified tag', anchor(), []],
    ['English README points elsewhere', anchor({ readmeLine5Tag: 'v9.9.7' }), ['tag-mismatch']],
    ['Chinese README points elsewhere', anchor({ readmeZhLine5Tag: 'v9.9.7' }), ['tag-mismatch']],
    ['no verified tag exists', anchor({ publishedTag: '' }), ['published-tag-missing']]
  ]
  it.each(anchorCases)('%s', (_name, facts, codes) => expectVerdict(judgePublishedAnchor(facts), codes))
})

describe('bilingual notes bundle', () => {
  const presence = (overrides: Partial<NotesPresenceFacts> = {}): NotesPresenceFacts => ({
    tag: 'v1.2.3',
    notesHeadingTag: 'v1.2.3',
    englishExists: true,
    chineseExists: true,
    ...overrides
  })
  const presenceCases: Array<[string, NotesPresenceFacts, string[]]> = [
    ['English and zh-CN notes exist', presence(), []],
    ['English notes are missing', presence({ englishExists: false }), ['notes-missing']],
    ['zh-CN notes are missing', presence({ chineseExists: false }), ['notes-missing']],
    ['notes title carries another tag', presence({ notesHeadingTag: 'v9.9.8' }), ['tag-mismatch']]
  ]
  it.each(presenceCases)('%s', (_name, facts, codes) => expectVerdict(judgeNotesPresence(facts), codes))

  const notes = (lines: string[]): NotesOrderFacts => ({ tag: 'v1.2.3', lines })
  const title = '# OpenCompare v1.2.3 release notes'
  const switcher = 'English | [简体中文](https://example.test/v1.2.3.zh-CN.md)'
  const orderCases: Array<[string, NotesOrderFacts, string[]]> = [
    ['title, language switch, then body', notes([title, '', switcher, '', 'Body.']), []],
    ['title is not on the first line', notes(['', title, switcher, '', 'Body.']), ['heading-not-first']],
    ['language switch precedes the title', notes([switcher, title, '', 'Body.']), ['heading-not-first', 'language-switch-before-heading']],
    ['language switch line is missing', notes([title, '', 'Body.']), ['language-switch-missing']],
    ['body is missing', notes([title, switcher]), ['body-missing']],
    ['title carries another tag', notes(['# OpenCompare v9.9.8 release notes', switcher, 'Body.']), ['tag-mismatch']],
    ['the notes are empty', notes([]), ['heading-missing', 'language-switch-missing']]
  ]
  it.each(orderCases)('%s', (_name, facts, codes) => expectVerdict(judgeNotesOrder(facts), codes))

  const h2 = ['## What changed', '## Windows installer and portable zip', '## macOS signing and notarization', '## Not in this release', '## Risk and verification scope', '## Upgrade']
  const zhH2 = ['## 本次变化', '## Windows 安装包与免安装 zip', '## macOS 签名与公证', '## 不做的事', '## 风险与验证规模', '## 升级方式']
  const headingCases: Array<[string, string[], string[], string[]]> = [
    ['paired H2s keep parity and order', h2, zhH2, []],
    ['the Chinese side drops a section', h2, zhH2.slice(0, 5), ['h2-count-mismatch', 'h2-mismatch']],
    ['the order drifts', h2, [zhH2[1], zhH2[0], ...zhH2.slice(2)], ['h2-mismatch', 'h2-mismatch']]
  ]
  it.each(headingCases)('%s', (_name, english, chinese, codes) => expectVerdict(judgeNotesHeadings({ englishLines: english, chineseLines: chinese }), codes))
})

describe('release history ledger', () => {
  const evidence = (...tags: string[]) =>
    tags.map((tag) => ({ tag, status: tag === 'v1.1.9' ? 'verified' : 'blocked' }))
  const history = (overrides: Partial<ReleaseHistoryFacts> = {}): ReleaseHistoryFacts => ({
    currentTag: 'v1.2.3',
    headings: ['v1.2.3', 'v1.2.2'],
    evidence: evidence('v1.2.3', 'v1.2.2'),
    ...overrides
  })
  const historyCases: Array<[string, ReleaseHistoryFacts, string[]]> = [
    ['newest first with evidence for every entry', history(), []],
    ['changelog top entry is not the current tag', history({ headings: ['v1.2.2'], evidence: evidence('v1.2.2') }), ['changelog-top-mismatch']],
    ['changelog has no entries', history({ headings: [], evidence: [] }), ['changelog-empty']],
    ['a heading repeats', history({ headings: ['v1.2.3', 'v1.2.3'] }), ['changelog-duplicate', 'changelog-order']],
    ['headings are out of order', history({ headings: ['v1.2.3', 'v1.2.1', 'v1.2.2'], evidence: evidence('v1.2.3', 'v1.2.1', 'v1.2.2') }), ['changelog-order']],
    ['a heading is not a tag', history({ headings: ['v1.2.3', 'release-1'] }), ['changelog-tag-invalid']],
    ['a heading has no evidence file', history({ headings: ['v1.2.3', 'v1.2.0'] }), ['evidence-missing']],
    ['the pending current tag has no evidence', history({ headings: ['v1.2.3'], evidence: [] }), []],
    ['verified evidence has no changelog entry', history({ headings: ['v1.2.3'], evidence: evidence('v1.2.3', 'v1.1.9') }), ['changelog-entry-missing']]
  ]
  it.each(historyCases)('%s', (_name, facts, codes) => expectVerdict(judgeReleaseHistory(facts), codes))

  it('never requires evidence for the v0.1.2 anchor', () => {
    expect(
      judgeReleaseHistory(history({ headings: ['v1.2.3', 'v0.1.2'], evidence: evidence('v1.2.3') }))
    ).toEqual({ ok: true, issues: [] })
  })
})

describe('repository release facts', () => {
  it('accepts the real repository facts end to end', () => {
    expect(judgeVersionSources(releaseFacts.versionSources)).toEqual({ ok: true, issues: [] })
    expect(judgeNotesPresence(releaseFacts.notes)).toEqual({ ok: true, issues: [] })
    expect(
      judgeNotesOrder({ tag: releaseFacts.notes.tag, lines: releaseFacts.notes.englishLines })
    ).toEqual({ ok: true, issues: [] })
    expect(
      judgeNotesOrder({ tag: releaseFacts.notes.tag, lines: releaseFacts.notes.chineseLines })
    ).toEqual({ ok: true, issues: [] })
    expect(judgeReleaseHistory(releaseFacts.history)).toEqual({ ok: true, issues: [] })
    expect(judgePublishedAnchor(releaseFacts.publishedAnchor)).toEqual({ ok: true, issues: [] })
    expect(judgeNotesHeadings(releaseFacts.notes)).toEqual({ ok: true, issues: [] })
    expect(releaseFacts.versionSources.pkgVersion).toBe(pkg.version)
  })

  const noteFacts: Array<[string, readonly string[]]> = [
    [releaseFacts.notes.englishLines.join('\n'), ['Actions column', 'copies by default', 'explicitly checked', 'sha256', 'mtimeSec', 'source and the target', 'no rollback', 'Case-fold collisions', 'Path escape refused']],
    [releaseFacts.notes.chineseLines.join('\n'), ['动作列', '默认复制', '显式勾选', 'sha256', 'mtimeSec', '源与目标', '不执行回滚', '碰撞折叠', '路径越界拒绝']],
    [markdownSection(changelog, currentTag), ['动作列', '碰撞折叠', '路径越界']]
  ]
  it.each(noteFacts)('states the template move and safety facts', (markdown, tokens) => {
    const atoms = parseMarkdown(markdown)
    const text = [...atoms.paragraphs, ...atoms.listItems, ...atoms.codeSpans, ...atoms.headings].join('\n')
    for (const token of tokens) expect(text, token).toContain(token)
  })

  it('keeps the pure gate modules free of fs and platform imports', () => {
    for (const name of ['release-gate.ts', 'release-metadata-gate.ts']) {
      const source = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
      expect(source).not.toMatch(/node:fs|from 'electron'|from 'react'|document\.|window\./)
    }
  })
})
