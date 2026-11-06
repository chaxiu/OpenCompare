import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  assessCacheEntry,
  computeCacheKey,
  environmentFacts,
  fileSetFingerprint,
  globRoot,
  globToRegExp,
  listCoveredFiles,
  scriptHash
} from './coverage-gate-preflight-cache.mjs'

const dirs = []
const INCLUDES = 'src/core/**'
const EXCLUDES = ['**/*.test.ts', '**/*.test.tsx', '**/__fixtures__/**']

function makeTree(files) {
  const root = mkdtempSync(join(tmpdir(), 'coverage-preflight-cache-'))
  dirs.push(root)
  for (const [relPath, content] of Object.entries(files)) {
    const full = join(root, relPath)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, content)
  }
  return root
}

function digestOf(text) {
  return createHash('sha256').update(text).digest('hex')
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

describe('globToRegExp', () => {
  it('anchors the baseline include and exclude globs', () => {
    const include = globToRegExp('src/core/**')
    expect(include.test('src/core/a.ts')).toBe(true)
    expect(include.test('src/core/deep/b.ts')).toBe(true)
    expect(include.test('src/main/a.ts')).toBe(false)
    const testFile = globToRegExp('**/*.test.ts')
    expect(testFile.test('src/core/a.test.ts')).toBe(true)
    expect(testFile.test('src/core/deep/b.test.ts')).toBe(true)
    expect(testFile.test('src/core/a.ts')).toBe(false)
    expect(globToRegExp('**/__fixtures__/**').test('src/core/__fixtures__/x.json')).toBe(true)
  })

  it('derives the walk root from the include glob', () => {
    expect(globRoot('src/core/**')).toBe('src/core')
    expect(globRoot('src/core/a.ts')).toBe('src/core')
  })
})

describe('fileSetFingerprint', () => {
  it('covers exactly the baseline include minus the excludes', () => {
    const root = makeTree({
      'src/core/a.ts': 'a\n',
      'src/core/deep/b.ts': 'b\n',
      'src/core/a.test.ts': 'test\n',
      'src/core/__fixtures__/x.json': '{}\n',
      'src/main/c.ts': 'c\n'
    })
    expect(listCoveredFiles(root, INCLUDES, EXCLUDES)).toEqual(['src/core/a.ts', 'src/core/deep/b.ts'])
    const fingerprint = fileSetFingerprint(root, INCLUDES, EXCLUDES)
    expect(fingerprint.count).toBe(2)
    expect(fingerprint.fingerprint).toMatch(/^[0-9a-f]{64}$/)
  })

  it('changes when a covered file is added, edited or removed', () => {
    const root = makeTree({ 'src/core/a.ts': 'a\n' })
    const before = fileSetFingerprint(root, INCLUDES, EXCLUDES).fingerprint
    writeFileSync(join(root, 'src/core/a.ts'), 'edited\n')
    const edited = fileSetFingerprint(root, INCLUDES, EXCLUDES).fingerprint
    writeFileSync(join(root, 'src/core/b.ts'), 'b\n')
    const added = fileSetFingerprint(root, INCLUDES, EXCLUDES).fingerprint
    rmSync(join(root, 'src/core/a.ts'))
    const removed = fileSetFingerprint(root, INCLUDES, EXCLUDES).fingerprint
    expect(edited).not.toBe(before)
    expect(added).not.toBe(edited)
    expect(removed).not.toBe(added)
    expect(removed).not.toBe(before)
  })
})

describe('environmentFacts and computeCacheKey', () => {
  it('keeps instrumentation env and the fixed runtime facts', () => {
    const facts = environmentFacts(
      { PATH: '/bin', NODE_OPTIONS: '--max-old-space-size=4096', VITEST_POOL: '1', OPENCOMPARE_X: '1', HOME: '/h' },
      { node: 'v22.0.0', packageManager: 'pnpm@10.18.3' }
    )
    expect(facts).toEqual({
      node: 'v22.0.0',
      packageManager: 'pnpm@10.18.3',
      env: { NODE_OPTIONS: '--max-old-space-size=4096', OPENCOMPARE_X: '1', VITEST_POOL: '1' }
    })
  })

  it('binds commit, tree, script hash, file set and environment into the key', () => {
    const base = { version: 1, commit: 'a'.repeat(40), tree: 'b'.repeat(40), fileSet: 'f', scripts: 's', environment: { node: 'v22' } }
    const key = computeCacheKey(base)
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    expect(computeCacheKey({ ...base })).toBe(key)
    expect(computeCacheKey({ ...base, commit: 'c'.repeat(40) })).not.toBe(key)
    expect(computeCacheKey({ ...base, tree: 'd'.repeat(40) })).not.toBe(key)
    expect(computeCacheKey({ ...base, scripts: 't' })).not.toBe(key)
    expect(computeCacheKey({ ...base, fileSet: 'g' })).not.toBe(key)
    expect(computeCacheKey({ ...base, environment: { node: 'v23' } })).not.toBe(key)
  })

  it('hashes script sources, including renamed or edited files', () => {
    const root = makeTree({ 'scripts/a.mjs': 'a\n', 'scripts/b.mjs': 'b\n' })
    const before = scriptHash(root, ['scripts/a.mjs', 'scripts/b.mjs'])
    writeFileSync(join(root, 'scripts/b.mjs'), 'changed\n')
    expect(scriptHash(root, ['scripts/a.mjs', 'scripts/b.mjs'])).not.toBe(before)
  })
})

describe('assessCacheEntry', () => {
  const key = digestOf('key')
  const validMeta = { key, measuredAt: 1_700_000_000 }
  const validSummary = { total: { lines: { pct: 97 } } }

  it('reuses a matching, parseable summary newer than its measurement start', () => {
    expect(
      assessCacheEntry({ expectedKey: key, meta: validMeta, summary: validSummary, summaryMtimeMs: 1_700_000_001_000 })
    ).toEqual({ hit: true, reason: null, startedAt: 1_700_000_000 })
  })

  it('fails closed on an absent or corrupt component', () => {
    const cases = [
      [{ expectedKey: key, meta: null, summary: validSummary, summaryMtimeMs: 1_700_000_001_000 }, 'missing cache metadata'],
      [{ expectedKey: key, meta: { ...validMeta, key: 'other' }, summary: validSummary, summaryMtimeMs: 1_700_000_001_000 }, 'key mismatch'],
      [{ expectedKey: key, meta: validMeta, summary: null, summaryMtimeMs: 1_700_000_001_000 }, 'missing summary'],
      [{ expectedKey: key, meta: validMeta, summary: {}, summaryMtimeMs: 1_700_000_001_000 }, 'no total entry'],
      [{ expectedKey: key, meta: { key }, summary: validSummary, summaryMtimeMs: 1_700_000_001_000 }, 'measuredAt'],
      [{ expectedKey: key, meta: validMeta, summary: validSummary, summaryMtimeMs: 1_600_000_000_000 }, 'older than its measurement start'],
      [{ expectedKey: key, meta: validMeta, summary: validSummary, summaryMtimeMs: Number.NaN }, 'older than its measurement start']
    ]
    for (const [input, reason] of cases) {
      const verdict = assessCacheEntry(input)
      expect(verdict.hit).toBe(false)
      expect(verdict.reason).toContain(reason)
    }
  })
})
