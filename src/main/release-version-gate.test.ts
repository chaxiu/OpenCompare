import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  judgeNotesOrder,
  judgeNotesPresence,
  judgeReleaseHistory,
  judgeVersionSources,
  type NotesOrderFacts,
  type NotesPresenceFacts,
  type ReleaseHistoryFacts,
  type VersionSourceFacts
} from './release-gate'
import { releaseFacts } from './release-doc-fixtures.test-helpers'

const versionFacts = (overrides: Partial<VersionSourceFacts> = {}): VersionSourceFacts => ({
  pkgVersion: '0.2.16',
  changelogTopTag: 'v0.2.16',
  notesHeadingTag: 'v0.2.16',
  readmeLine5Tag: 'v0.2.16',
  workflowDispatchDefault: 'v0.2.16',
  processDocDefault: 'v0.2.16',
  ...overrides
})

const nonSemverFacts = (): VersionSourceFacts =>
  versionFacts({
    pkgVersion: '0.2',
    changelogTopTag: 'v0.2',
    notesHeadingTag: 'v0.2',
    readmeLine5Tag: 'v0.2',
    workflowDispatchDefault: 'v0.2',
    processDocDefault: 'v0.2'
  })
const versionCases: Array<[string, VersionSourceFacts, string[]]> = [
  ['agrees on v0.2.16', versionFacts(), []],
  ['changelog top points elsewhere', versionFacts({ changelogTopTag: 'v0.2.15' }), ['tag-mismatch']],
  ['notes title points elsewhere', versionFacts({ notesHeadingTag: 'v0.2.15' }), ['tag-mismatch']],
  ['README line 5 points elsewhere', versionFacts({ readmeLine5Tag: 'v0.2.14' }), ['tag-mismatch']],
  ['workflow default points elsewhere', versionFacts({ workflowDispatchDefault: 'v0.2.15' }), ['tag-mismatch']],
  ['process doc default points elsewhere', versionFacts({ processDocDefault: 'v0.2.15' }), ['tag-mismatch']],
  ['package version is not semver', nonSemverFacts(), ['version-not-semver']],
  ['changelog top is absent', versionFacts({ changelogTopTag: '' }), ['missing']],
  ['notes title is absent', versionFacts({ notesHeadingTag: '' }), ['missing']],
  ['workflow default is absent', versionFacts({ workflowDispatchDefault: '' }), ['missing']],
  ['process doc default is absent', versionFacts({ processDocDefault: '' }), ['missing']]
]

describe('version single source', () => {
  it.each(versionCases)('%s', (_name, facts, codes) => {
    const verdict = judgeVersionSources(facts)
    expect(verdict.ok).toBe(codes.length === 0)
    expect(verdict.issues.map((issue) => issue.code)).toEqual(codes)
    if (codes.length > 0) expect(verdict.issues[0].path).not.toBe('')
  })

  it('derives the tag from package.json#version alone', () => {
    expect(judgeVersionSources(versionFacts({ pkgVersion: '9.9.9' })).issues[0].detail).toBe(
      'expected v9.9.9, got v0.2.16'
    )
  })

  it('names the mismatching document for every source field', () => {
    const fieldPaths: Array<[keyof VersionSourceFacts, string]> = [
      ['changelogTopTag', 'CHANGELOG.md#top-entry'],
      ['notesHeadingTag', 'release-notes#title'],
      ['readmeLine5Tag', 'README.md#line-5'],
      ['workflowDispatchDefault', '.github/workflows/release.yml#workflow_dispatch.tag.default'],
      ['processDocDefault', 'docs/release-process.md#workflow_dispatch.default']
    ]
    for (const [field, path] of fieldPaths) {
      const verdict = judgeVersionSources(versionFacts({ [field]: 'v0.2.15' }))
      expect(verdict.ok).toBe(false)
      expect(verdict.issues[0].path).toBe(path)
    }
  })
})

describe('bilingual notes bundle', () => {
  const presence = (overrides: Partial<NotesPresenceFacts> = {}): NotesPresenceFacts => ({
    tag: 'v0.2.16',
    notesHeadingTag: 'v0.2.16',
    englishExists: true,
    chineseExists: true,
    evidenceExists: true,
    ...overrides
  })
  const presenceCases: Array<[string, NotesPresenceFacts, string[]]> = [
    ['English and zh-CN notes plus evidence exist', presence(), []],
    ['English notes are missing', presence({ englishExists: false }), ['notes-missing']],
    ['zh-CN notes are missing', presence({ chineseExists: false }), ['notes-missing']],
    ['evidence is missing', presence({ evidenceExists: false }), ['evidence-missing']],
    ['notes title carries another tag', presence({ notesHeadingTag: 'v0.2.15' }), ['tag-mismatch']]
  ]
  it.each(presenceCases)('%s', (_name, facts, codes) => {
    const verdict = judgeNotesPresence(facts)
    expect(verdict.ok).toBe(codes.length === 0)
    expect(verdict.issues.map((issue) => issue.code)).toEqual(codes)
  })

  it('points each missing artifact at its path', () => {
    const verdict = judgeNotesPresence(
      presence({ englishExists: false, chineseExists: false, evidenceExists: false })
    )
    expect(verdict.issues.map((issue) => issue.path)).toEqual([
      'docs/release-notes/v0.2.16.md',
      'docs/release-notes/v0.2.16.zh-CN.md',
      'docs/release-evidence/v0.2.16.md'
    ])
  })

  const notes = (lines: string[]): NotesOrderFacts => ({ tag: 'v0.2.16', lines })
  const title = '# OpenCompare v0.2.16 release notes'
  const switcher = 'English | [简体中文](https://example.test/v0.2.16.zh-CN.md)'
  const orderCases: Array<[string, NotesOrderFacts, string[]]> = [
    ['title, language switch, then body', notes([title, '', switcher, '', 'Body.']), []],
    ['title is not on the first line', notes(['', title, switcher, '', 'Body.']), ['heading-not-first']],
    ['language switch precedes the title', notes([switcher, title, '', 'Body.']), ['heading-not-first', 'language-switch-before-heading']],
    ['language switch line is missing', notes([title, '', 'Body.']), ['language-switch-missing']],
    ['body is missing', notes([title, switcher]), ['body-missing']],
    ['title carries another tag', notes(['# OpenCompare v0.2.15 release notes', switcher, 'Body.']), ['tag-mismatch']],
    ['the notes are empty', notes([]), ['heading-missing', 'language-switch-missing']]
  ]
  it.each(orderCases)('%s', (_name, facts, codes) => {
    const verdict = judgeNotesOrder(facts)
    expect(verdict.ok).toBe(codes.length === 0)
    expect(verdict.issues.map((issue) => issue.code)).toEqual(codes)
  })
})

describe('release history ledger', () => {
  const evidence = (...tags: string[]) =>
    tags.map((tag) => ({ tag, status: tag === 'v0.2.9' ? 'verified' : 'blocked' }))
  const history = (overrides: Partial<ReleaseHistoryFacts> = {}): ReleaseHistoryFacts => ({
    currentTag: 'v0.2.16',
    headings: ['v0.2.16', 'v0.2.15'],
    evidence: evidence('v0.2.16', 'v0.2.15'),
    ...overrides
  })
  const historyCases: Array<[string, ReleaseHistoryFacts, string[]]> = [
    ['newest first with evidence for every entry', history(), []],
    ['changelog top entry is not the current tag', history({ headings: ['v0.2.15'], evidence: evidence('v0.2.15') }), ['changelog-top-mismatch']],
    ['changelog has no entries', history({ headings: [], evidence: [] }), ['changelog-empty']],
    ['a heading repeats', history({ headings: ['v0.2.16', 'v0.2.16'] }), ['changelog-duplicate', 'changelog-order']],
    ['headings are out of order', history({ headings: ['v0.2.16', 'v0.2.14', 'v0.2.15'], evidence: evidence('v0.2.16', 'v0.2.14', 'v0.2.15') }), ['changelog-order']],
    ['a heading is not a tag', history({ headings: ['v0.2.16', 'release-1'] }), ['changelog-tag-invalid']],
    ['a heading has no evidence file', history({ headings: ['v0.2.16', 'v0.2.10'] }), ['evidence-missing']],
    ['verified evidence has no changelog entry', history({ headings: ['v0.2.16'], evidence: evidence('v0.2.16', 'v0.2.9') }), ['changelog-entry-missing']]
  ]
  it.each(historyCases)('%s', (_name, facts, codes) => {
    const verdict = judgeReleaseHistory(facts)
    expect(verdict.ok).toBe(codes.length === 0)
    expect(verdict.issues.map((issue) => issue.code)).toEqual(codes)
  })

  it('never requires evidence for the v0.1.2 anchor', () => {
    expect(
      judgeReleaseHistory(history({ headings: ['v0.2.16', 'v0.1.2'], evidence: evidence('v0.2.16') }))
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
    expect(releaseFacts.versionSources.pkgVersion).toBe('0.2.16')
  })

  it('keeps the pure gate modules free of fs and platform imports', () => {
    for (const name of ['release-gate.ts', 'release-metadata-gate.ts']) {
      const source = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
      expect(source).not.toMatch(/node:fs|from 'electron'|from 'react'|document\.|window\./)
    }
  })
})
