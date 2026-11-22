import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { evaluateBaselineFreshness } from './coverage-gate.mjs'

const FIXED_DATE = '2024-01-01T00:00:00Z'
const dirs = []

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'coverage-gate-freshness-'))
  dirs.push(dir)
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: join(dir, 'missing-global-gitconfig'),
    GIT_AUTHOR_NAME: 'Coverage Gate Fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Coverage Gate Fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    GIT_AUTHOR_DATE: FIXED_DATE,
    GIT_COMMITTER_DATE: FIXED_DATE
  }
  const git = (...args) =>
    execFileSync('git', args, { cwd: dir, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-q')
  return { dir, git }
}

function commit(repo, name) {
  writeFileSync(join(repo.dir, name), `${name}\n`)
  repo.git('add', '-A')
  repo.git('-c', 'commit.gpgsign=false', 'commit', '-q', '-m', name)
  return repo.git('rev-parse', 'HEAD')
}

function tag(repo, name, ref = 'HEAD') {
  repo.git('-c', 'tag.gpgsign=false', 'tag', name, ref)
}

function baselineAt(commitSha) {
  return { measuredAt: { commit: commitSha, date: FIXED_DATE } }
}

describe('evaluateBaselineFreshness', () => {
  it('passes when HEAD carries a tag and the baseline equals the previous tag commit', () => {
    const repo = makeRepo()
    const previous = commit(repo, 'a.txt')
    tag(repo, 'v1.0.0', previous)
    commit(repo, 'b.txt')
    tag(repo, 'v1.1.0')

    const { problems, messages } = evaluateBaselineFreshness(baselineAt(previous), repo.dir)

    expect(problems).toEqual([])
    expect(messages.join('\n')).toContain('is reachable from HEAD')
  })

  it('passes when the baseline predates the previous tag but is still reachable from HEAD', () => {
    const repo = makeRepo()
    const older = commit(repo, 'a.txt')
    const previous = commit(repo, 'b.txt')
    tag(repo, 'v1.0.0', previous)
    commit(repo, 'c.txt')
    tag(repo, 'v1.1.0')

    const { problems, messages } = evaluateBaselineFreshness(baselineAt(older), repo.dir)

    expect(problems).toEqual([])
    expect(messages.join('\n')).toContain('is reachable from HEAD')
  })

  it('passes with no semver tag when the baseline equals HEAD', () => {
    const repo = makeRepo()
    const head = commit(repo, 'a.txt')

    const { problems, messages } = evaluateBaselineFreshness(baselineAt(head), repo.dir)

    expect(problems).toEqual([])
    expect(messages.join('\n')).toContain('is reachable from HEAD')
  })

  it('fails when the baseline commit is not reachable from HEAD', () => {
    const repo = makeRepo()
    commit(repo, 'a.txt')
    const orphaned = commit(repo, 'b.txt')
    repo.git('reset', '-q', '--hard', 'HEAD~1')
    const head = commit(repo, 'c.txt')
    tag(repo, 'v1.0.0', head)

    const { problems } = evaluateBaselineFreshness(baselineAt(orphaned), repo.dir)

    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('is not reachable from HEAD')
  })
})
