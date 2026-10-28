/* global URL, console */
// Fail-closed checks for this change pack's doc-only acceptance items.
// Reads the real repository files; run with: node .munk/changes/wi_ws_6ece0152a47c9c1a/verify-release-notes.mjs
import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const notes = readFileSync(`${root}/docs/release-notes/v0.2.11.md`, 'utf8')
const changelog = readFileSync(`${root}/CHANGELOG.md`, 'utf8')
const pkg = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'))
const workflow = readFileSync(`${root}/.github/workflows/release.yml`, 'utf8')

const units = (text) => text.match(/\d+(?:[.,]\d+)?\s*(?:GiB|MiB|GB|MB)/g) ?? []
const changelogSlice = changelog.slice(
  changelog.indexOf('## v0.2.11'),
  changelog.indexOf('## v0.2.9')
)

// ac-notes-ci-section: the CI section exists and carries every measured figure.
{
  const start = notes.indexOf('## CI 测试稳定性修复')
  assert.ok(start > -1, 'notes: missing CI stability section')
  const end = notes.indexOf('\n## ', start + 1)
  const section = notes.slice(start, end === -1 ? undefined : end)
  for (const phrase of ['30_000', '6,816', '27.42', '358,000', '69 files', '1104']) {
    assert.ok(section.includes(phrase), `notes CI section: missing ${phrase}`)
  }
}

// ac-notes-unverified-claims
for (const claim of ['CI 已通过', 'CI 通过', 'Release 已就绪', '待验证', '预计通过', '应该通过']) {
  assert.ok(!notes.includes(claim), `notes: unverified claim ${claim}`)
}
assert.doesNotMatch(notes, /\b(?:TODO|TBD|FIXME)\b/)
assert.doesNotMatch(notes, /[0-9a-f]{40,64}/)

// ac-notes-length
assert.ok([...notes].length > 1000, 'notes: shorter than 1000 chars')

// ac-notes-memory-whitelist + ac-notes-existing-whitelist
assert.deepEqual(units(notes), ['451.6 MiB', '909.0 MiB', '2.25 GiB', '2.5 GiB', '9.29 GiB', '9.62 GiB'])
for (const phrase of [
  '指示条',
  '四态',
  'same',
  'added',
  'removed',
  'modified',
  '滚动',
  '点选',
  '跳转',
  'minimap',
  '不新增扫描',
  '不改对比与合并算法',
  '升级方式',
  'trun_08764efa44c39426',
  '2bcdc53e'
]) {
  assert.ok(notes.includes(phrase), `notes: missing ${phrase}`)
}
assert.match(notes.split(/\r?\n/)[0], /v0\.2\.11/)
for (const banned of ['200,000', '10 MB', '本版新增', 'releases/tag/v0.2.10', 'Full Changelog']) {
  assert.ok(!notes.includes(banned), `notes: banned phrase ${banned}`)
}

// ac-changelog-overview
{
  const body = changelogSlice.slice(changelogSlice.indexOf('\n')).trim()
  const overview = body.split(/\n\s*\n/)[0]
  for (const keyword of ['指示条', '窗口渲染', '测试', '30_000']) {
    assert.ok(overview.includes(keyword), `changelog overview: missing ${keyword}`)
  }
}

// ac-changelog-fix-entry
{
  const start = changelogSlice.indexOf('### 修复')
  assert.ok(start > -1, 'changelog: missing ### 修复')
  const end = changelogSlice.indexOf('\n### ', start + 1)
  const section = changelogSlice.slice(start, end === -1 ? undefined : end)
  for (const phrase of ['30_000', '6,816', '27.42', '358,000', '规模与全部断言不变']) {
    assert.ok(section.includes(phrase), `changelog 修复: missing ${phrase}`)
  }
}

// ac-changelog-kept-sections + ac-changelog-no-units + ac-changelog-single-heading
for (const phrase of [
  '### 新增',
  '### 不做的事',
  '### 升级方式',
  '四态',
  'same',
  'added',
  'removed',
  'modified',
  '滚动',
  '点选',
  '跳转',
  'minimap',
  '不新增扫描',
  '不改对比与合并算法'
]) {
  assert.ok(changelogSlice.includes(phrase), `changelog: missing ${phrase}`)
}
assert.deepEqual(units(changelogSlice), [])
for (const banned of ['200,000', '10 MB', '本版新增']) {
  assert.ok(!changelogSlice.includes(banned), `changelog: banned phrase ${banned}`)
}
assert.doesNotMatch(changelogSlice, /\b(?:TODO|TBD|FIXME)\b/)
assert.doesNotMatch(changelogSlice, /[0-9a-f]{40,64}/)
assert.deepEqual(
  [...changelogSlice.matchAll(/^## (.+)$/gm)].map((match) => match[1]),
  ['v0.2.11']
)

// ac-version-triple
assert.equal(pkg.version, '0.2.11')
const dispatch = workflow.slice(workflow.indexOf('workflow_dispatch:'), workflow.indexOf('permissions:'))
assert.match(dispatch, /default: 'v0\.2\.11'/)

console.log('verify-release-notes: all doc acceptance checks passed')
