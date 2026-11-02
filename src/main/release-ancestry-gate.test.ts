import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ancestryGateScript } from './release-doc-fixtures.test-helpers'

// ---------------------------------------------------------------------------
// v0.1.2 ancestry gate (strict ancestor OR per-commit patch equivalence).
// Real git fixtures run the workflow's shell gate; temp repos are the only
// place this suite writes git state.
// ---------------------------------------------------------------------------
type AncestryScenario = 'strict-ancestor' | 'patch-equivalent' | 'divergent' | 'deletes-protected-path'

interface FixtureRepo {
  dir: string
  home: string
  env: NodeJS.ProcessEnv
}

const createFixtureRepo = (): FixtureRepo => {
  const dir = mkdtempSync(join(tmpdir(), 'opencompare-ancestry-'))
  const home = mkdtempSync(join(tmpdir(), 'opencompare-ancestry-home-'))
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined || key.toUpperCase().startsWith('GIT_')) continue
    env[key] = value
  }
  env.HOME = home
  env.GIT_CONFIG_GLOBAL = '/dev/null'
  env.GIT_CONFIG_SYSTEM = '/dev/null'
  env.GIT_CONFIG_NOSYSTEM = '1'
  env.GIT_AUTHOR_NAME = 'OpenCompare Test'
  env.GIT_AUTHOR_EMAIL = 'test@opencompare.invalid'
  env.GIT_COMMITTER_NAME = 'OpenCompare Test'
  env.GIT_COMMITTER_EMAIL = 'test@opencompare.invalid'
  return { dir, home, env }
}

const disposeFixtureRepo = (repo: FixtureRepo): void => {
  rmSync(repo.dir, { recursive: true, force: true })
  rmSync(repo.home, { recursive: true, force: true })
}

const fixtureGit = (repo: FixtureRepo, args: string[]): string =>
  execFileSync('git', args, {
    cwd: repo.dir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: repo.env
  }).trim()

const writeFixtureFile = (dir: string, name: string, content: string): void => {
  writeFileSync(join(dir, name), content)
}

const initFixtureRepo = (repo: FixtureRepo): void => {
  fixtureGit(repo, ['init', '-b', 'main'])
  writeFixtureFile(repo.dir, 'package.json', '{"version":"9.9.9"}\n')
  writeFixtureFile(repo.dir, 'README.md', 'base\n')
  writeFixtureFile(repo.dir, 'electron-builder.yml', 'appId: com.opencompare.fixture\n')
  fixtureGit(repo, ['add', '-A'])
  fixtureGit(repo, ['commit', '-m', 'base'])
}

const tagFixtureHead = (repo: FixtureRepo, tagKind: 'annotated' | 'lightweight'): void => {
  fixtureGit(
    repo,
    tagKind === 'annotated'
      ? ['tag', '-a', 'v0.1.2', '-m', 'v0.1.2', 'HEAD']
      : ['tag', 'v0.1.2', 'HEAD']
  )
}

const createAncestryFixture = (
  scenario: AncestryScenario,
  tagKind: 'annotated' | 'lightweight' = 'annotated'
): { repo: FixtureRepo; tagSha: string } => {
  const repo = createFixtureRepo()
  initFixtureRepo(repo)
  if (scenario === 'strict-ancestor') {
    const tagSha = fixtureGit(repo, ['rev-parse', 'HEAD'])
    tagFixtureHead(repo, tagKind)
    writeFixtureFile(repo.dir, 'README.md', 'post tag\n')
    fixtureGit(repo, ['add', '-A'])
    fixtureGit(repo, ['commit', '-m', 'head change'])
    return { repo, tagSha }
  }
  fixtureGit(repo, ['checkout', '-b', 'tag-side'])
  if (scenario === 'deletes-protected-path') {
    rmSync(join(repo.dir, 'electron-builder.yml'))
  } else {
    writeFixtureFile(repo.dir, 'README.md', scenario === 'divergent' ? 'tag side\n' : 'fix\n')
  }
  fixtureGit(repo, ['add', '-A'])
  fixtureGit(repo, ['commit', '-m', 'tag-only change'])
  const tagSha = fixtureGit(repo, ['rev-parse', 'HEAD'])
  tagFixtureHead(repo, tagKind)
  fixtureGit(repo, ['checkout', 'main'])
  if (scenario === 'deletes-protected-path') {
    rmSync(join(repo.dir, 'electron-builder.yml'))
  } else {
    writeFixtureFile(repo.dir, 'README.md', scenario === 'divergent' ? 'main side\n' : 'fix\n')
  }
  fixtureGit(repo, ['add', '-A'])
  fixtureGit(repo, ['commit', '-m', 'head change'])
  return { repo, tagSha }
}

const runAncestryGate = (repo: FixtureRepo): { status: number; output: string } => {
  const scriptPath = join(repo.dir, 'ancestry-gate.sh')
  writeFileSync(scriptPath, ancestryGateScript)
  const result = spawnSync('bash', [scriptPath], { cwd: repo.dir, encoding: 'utf8', env: repo.env })
  return { status: result.status ?? -1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

const withFixtureRepo = (run: (repo: FixtureRepo) => void): void => {
  const repo = createFixtureRepo()
  try {
    run(repo)
  } finally {
    disposeFixtureRepo(repo)
  }
}

const withAncestryFixture = (
  scenario: AncestryScenario,
  run: (fixture: { repo: FixtureRepo; tagSha: string }) => void,
  tagKind: 'annotated' | 'lightweight' = 'annotated'
): void => {
  const fixture = createAncestryFixture(scenario, tagKind)
  try {
    run(fixture)
  } finally {
    disposeFixtureRepo(fixture.repo)
  }
}

describe('v0.1.2 ancestry gate', () => {
  it('passes when the tag is a strict ancestor with a non-zero lead', () => {
    withAncestryFixture('strict-ancestor', ({ repo, tagSha }) => {
      const { status, output } = runAncestryGate(repo)
      expect(output).toMatch(new RegExp(`ref type=tag \\(annotated\\) commit=${tagSha}`))
      expect(output).toMatch(/v0\.1\.2\.\.HEAD commits=1 HEAD\.\.v0\.1\.2 commits=0/)
      expect(status).toBe(0)
    })
  })

  it('passes when a tag-only commit is patch-equivalent and logs its SHA with -', () => {
    withAncestryFixture('patch-equivalent', ({ repo, tagSha }) => {
      const { status, output } = runAncestryGate(repo)
      expect(output).toMatch(new RegExp(`v0\\.1\\.2-only commit ${tagSha} cherry=-`))
      expect(status).toBe(0)
    })
  })

  it('logs every tag-only commit in a chain with its own decision', () => {
    withFixtureRepo((repo) => {
      initFixtureRepo(repo)
      fixtureGit(repo, ['checkout', '-b', 'tag-side'])
      writeFixtureFile(repo.dir, 'README.md', 'fix one\n')
      fixtureGit(repo, ['add', '-A'])
      fixtureGit(repo, ['commit', '-m', 'tag-only one'])
      const firstSha = fixtureGit(repo, ['rev-parse', 'HEAD'])
      writeFixtureFile(repo.dir, 'README.md', 'fix two\n')
      fixtureGit(repo, ['add', '-A'])
      fixtureGit(repo, ['commit', '-m', 'tag-only two'])
      const secondSha = fixtureGit(repo, ['rev-parse', 'HEAD'])
      tagFixtureHead(repo, 'annotated')
      fixtureGit(repo, ['checkout', 'main'])
      writeFixtureFile(repo.dir, 'README.md', 'fix one\n')
      fixtureGit(repo, ['add', '-A'])
      fixtureGit(repo, ['commit', '-m', 'head one'])
      writeFixtureFile(repo.dir, 'README.md', 'fix two\n')
      fixtureGit(repo, ['add', '-A'])
      fixtureGit(repo, ['commit', '-m', 'head two'])
      const { status, output } = runAncestryGate(repo)
      expect(output).toMatch(new RegExp(`v0\\.1\\.2-only commit ${firstSha} cherry=-`))
      expect(output).toMatch(new RegExp(`v0\\.1\\.2-only commit ${secondSha} cherry=-`))
      expect(status).toBe(0)
    })
  })

  it('logs a lightweight tag as a commit ref with its resolved commit SHA', () => {
    withAncestryFixture(
      'patch-equivalent',
      ({ repo, tagSha }) => {
        const { status, output } = runAncestryGate(repo)
        expect(output).toMatch(new RegExp(`ref type=commit \\(lightweight\\) commit=${tagSha}`))
        expect(status).toBe(0)
      },
      'lightweight'
    )
  })

  it('rejects a tag-only commit whose patch is not present in HEAD', () => {
    withAncestryFixture('divergent', ({ repo, tagSha }) => {
      const { status, output } = runAncestryGate(repo)
      expect(output).toMatch(new RegExp(`v0\\.1\\.2-only commit ${tagSha} cherry=\\+`))
      expect(output).toMatch(/not present in HEAD/)
      expect(status).not.toBe(0)
    })
  })

  it('rejects a patch-equivalent tag-only commit that deletes a protected path', () => {
    withAncestryFixture('deletes-protected-path', ({ repo }) => {
      const { status, output } = runAncestryGate(repo)
      expect(output).toMatch(/deletes the release-critical path electron-builder\.yml/)
      expect(status).not.toBe(0)
    })
  })

  it('fails closed when the tag cannot be resolved', () => {
    withFixtureRepo((repo) => {
      initFixtureRepo(repo)
      const { status, output } = runAncestryGate(repo)
      expect(output).toMatch(/not visible/)
      expect(status).not.toBe(0)
    })
  })

  it('keeps the non-zero lead requirement', () => {
    withFixtureRepo((repo) => {
      initFixtureRepo(repo)
      tagFixtureHead(repo, 'lightweight')
      const { status, output } = runAncestryGate(repo)
      expect(output).toMatch(/no commits after v0\.1\.2/)
      expect(status).not.toBe(0)
    })
  })
})
