import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { evaluateBaselineFreshness } from './coverage-gate.mjs'
import { createUnreachableCommit, staleProbePassed } from './coverage-gate-preflight.mjs'

const FIXED_DATE = '2024-01-01T00:00:00Z'
const dirs = []

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'coverage-gate-preflight-'))
  dirs.push(dir)
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: join(dir, 'missing-global-gitconfig'),
    GIT_AUTHOR_NAME: 'Coverage Preflight Fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Coverage Preflight Fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    GIT_AUTHOR_DATE: FIXED_DATE,
    GIT_COMMITTER_DATE: FIXED_DATE
  }
  const git = (...args) =>
    execFileSync('git', args, { cwd: dir, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const run = (args, options = {}) => {
    const result = spawnSync('git', args, {
      cwd: dir,
      env: { ...env, ...(options.env ?? {}) },
      encoding: 'utf8'
    })
    return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
  }
  git('init', '-q')
  return { dir, git, run }
}

function commit(repo, name) {
  writeFileSync(join(repo.dir, name), `${name}\n`)
  repo.git('add', '-A')
  repo.git('-c', 'commit.gpgsign=false', 'commit', '-q', '-m', name)
  return repo.git('rev-parse', 'HEAD')
}

function baselineAt(commitSha) {
  return { measuredAt: { commit: commitSha, date: FIXED_DATE } }
}

describe('coverage-gate-preflight stale probe', () => {
  it('builds a dangling commit that freshness rejects as not reachable from HEAD', () => {
    const repo = makeRepo()
    const head = commit(repo, 'a.txt')
    repo.git('-c', 'tag.gpgsign=false', 'tag', 'v1.0.0', head)
    commit(repo, 'b.txt')

    const reachable = evaluateBaselineFreshness(baselineAt(head), repo.dir)
    expect(reachable.problems).toEqual([])
    expect(reachable.messages.join('\n')).toContain('is reachable from HEAD')

    const stale = createUnreachableCommit(repo.run)
    expect(stale).toMatch(/^[0-9a-f]{40}$/)
    expect(stale).not.toBe(repo.git('rev-parse', 'HEAD'))

    const unreachable = evaluateBaselineFreshness(baselineAt(stale), repo.dir)
    expect(unreachable.problems).toHaveLength(1)
    expect(unreachable.problems[0]).toContain('is not reachable from HEAD')
  })

  it('does not pass when the sample is reachable from HEAD', () => {
    expect(staleProbePassed({ status: 0, output: 'baseline freshness: abc is reachable from HEAD' })).toBe(false)
    expect(
      staleProbePassed({ status: 1, output: 'negative floor needs a matching floorLedger entry' })
    ).toBe(false)
  })

  it('passes only on the explicit unreachable rejection', () => {
    expect(
      staleProbePassed({
        status: 1,
        output: 'FAIL baseline stale: measuredAt.commit abc is not reachable from HEAD def'
      })
    ).toBe(true)
  })
})
