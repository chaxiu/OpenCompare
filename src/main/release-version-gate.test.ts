import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ancestryGateScript,
  changelog,
  currentTag,
  documentPaths,
  driftFacts,
  firstHeading,
  foldedBilingualNotesPath,
  foldedEvidencePath,
  foldedNotesPath,
  foldedReleaseLink,
  foldedTag,
  gateStep,
  ghostEvidencePath,
  ghostNotesPath,
  ghostReleaseLink,
  ghostTag,
  h2Headings,
  historicalNotesV022,
  historicalNotesV024,
  isTagBefore,
  lastReleasedNotes,
  lastReleasedNotesPath,
  lastShippedTag,
  latestPublishedTag,
  pendingWord,
  pkg,
  previousPublishedTag,
  publishedTags,
  readmeEn,
  readmeLines,
  readmeStatusLine,
  readmeZh,
  releaseNotes,
  releaseNotesPath,
  releaseProcessDoc,
  releaseWorkflow,
  repoRoot,
  signingDoc,
  signingSecrets,
  stripLanguageSwitch,
  symlinkDoc,
  wordCount
} from './release-doc-fixtures.test-helpers'

describe('release version gate', () => {
  it('derives the release tag from package.json and cross-checks the release documents', () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(currentTag).toBe(`v${pkg.version}`)
    // Every version-bearing document and workflow default is keyed off this tag.
    expect(changelog).toContain(`## ${currentTag}`)
    expect(existsSync(releaseNotesPath)).toBe(true)
    expect(firstHeading(releaseNotes)).toContain(currentTag)
    // The README status line is a published fact, so it anchors the last shipped
    // tag instead of the converged one; a wrap-up commit updates README line 5
    // and the constant after each release.
    for (const line of [readmeStatusLine(readmeEn), readmeStatusLine(readmeZh)]) {
      expect(line).toContain(latestPublishedTag)
    }
    // v0.2.16 shipped and now equals the converged version; v0.2.15 stays pinned
    // one step below it, and the v0.2.12 anchor still precedes both.
    expect(publishedTags).toContain(latestPublishedTag)
    expect(publishedTags).toContain(lastShippedTag)
    // The folded version was never tagged, so it must never join the shipped list.
    expect(publishedTags).not.toContain(foldedTag)
    expect(latestPublishedTag).toBe('v0.2.16')
    expect(latestPublishedTag).toBe(currentTag)
    expect(isTagBefore(latestPublishedTag, currentTag)).toBe(false)
    expect(isTagBefore(lastShippedTag, latestPublishedTag)).toBe(true)
    expect(isTagBefore('v0.2.12', latestPublishedTag)).toBe(true)
    expect(isTagBefore(previousPublishedTag, latestPublishedTag)).toBe(true)
    expect(isTagBefore(previousPublishedTag, currentTag)).toBe(true)
    // The changelog top is the converged entry, directly above the newest
    // historical entry.
    const headings = [...changelog.matchAll(/^## (.+)$/gm)].map((match) => match[1])
    expect(headings.slice(0, 2)).toEqual([currentTag, lastShippedTag])
    // The newest published notes now point at the converged pair.
    expect(relative(repoRoot, lastReleasedNotesPath)).toBe(
      `docs/release-notes/${latestPublishedTag}.md`
    )
    expect(lastReleasedNotesPath).toBe(releaseNotesPath)
    expect(existsSync(lastReleasedNotesPath)).toBe(true)
    expect(firstHeading(lastReleasedNotes)).toContain(latestPublishedTag)
    expect(releaseWorkflow).toContain(`default: '${currentTag}'`)
    expect(releaseProcessDoc).toContain(`default: '${currentTag}'`)
  })

  it('asserts package.json version matches the tag before packaging', () => {
    expect(releaseWorkflow).toMatch(/Assert the tag matches package\.json version/)
    expect(releaseWorkflow).toMatch(/\$\{RELEASE_TAG#v\}/)
  })

  it('rejects a non-semver package version before comparing it to the tag', () => {
    const semverGuard = releaseWorkflow.indexOf('^[0-9]+\\.[0-9]+\\.[0-9]+$')
    const comparison = releaseWorkflow.indexOf('if [ "${version}" != "${tag}" ]; then')
    expect(semverGuard).toBeGreaterThan(-1)
    expect(comparison).toBeGreaterThan(-1)
    expect(semverGuard).toBeLessThan(comparison)
    expect(releaseWorkflow).toMatch(/is not a valid semver/)
  })

  it('fetches the full history in the gates checkout so tags are visible', () => {
    expect(releaseWorkflow).toMatch(
      /name: Quality gates[\s\S]*?uses: actions\/checkout@v4\s*\n\s*with:\s*\n\s*fetch-depth: 0/
    )
  })

  it('runs the read-only version and v0.1.2 ancestry gates before the tests', () => {
    const version = releaseWorkflow.indexOf('name: Preflight package version')
    const ancestry = releaseWorkflow.indexOf('name: Preflight v0.1.2 ancestry')
    const install = releaseWorkflow.indexOf('- run: pnpm install --frozen-lockfile')
    const tests = releaseWorkflow.indexOf('- run: pnpm test')
    expect(version).toBeGreaterThan(-1)
    expect(ancestry).toBeGreaterThan(version)
    expect(install).toBeGreaterThan(ancestry)
    expect(tests).toBeGreaterThan(install)
    expect(ancestryGateScript).toMatch(/git rev-list --count "\$\{tag\}\.\.HEAD"/)
    expect(ancestryGateScript).toMatch(/git rev-list --count "HEAD\.\.\$\{tag\}"/)
    expect(ancestryGateScript).toMatch(/::error::/)
    expect(ancestryGateScript).toMatch(/exit 1/)
  })

  it('asserts the packaged latest*.yml version matches the tag', () => {
    expect(releaseWorkflow).toMatch(/Assert packaged version matches the tag/)
    expect(releaseWorkflow).toMatch(/latest\*\.yml/)
  })

  it('keeps the latest*.yml gate glob and its empty-directory guard', () => {
    expect(releaseWorkflow).toMatch(/files=\(release\/latest\*\.yml\)/)
    expect(releaseWorkflow).toMatch(/No latest\*\.yml update metadata found/)
    expect(releaseWorkflow).toMatch(/does not match tag/)
  })

  it('keeps the tag-triggered gates-first publish model intact', () => {
    const gates = releaseWorkflow.indexOf('name: Quality gates')
    const matrix = releaseWorkflow.indexOf('name: Package ${{ matrix.target }}')
    const finalize = releaseWorkflow.indexOf('name: Publish the GitHub Release')
    expect(releaseWorkflow).toMatch(/tags:\s*\n\s*-\s*'v\*'/)
    expect(gates).toBeGreaterThan(-1)
    expect(matrix).toBeGreaterThan(gates)
    expect(finalize).toBeGreaterThan(matrix)
    expect(releaseWorkflow).toMatch(/needs: gates/)
    expect(releaseWorkflow).toMatch(/needs: release/)
    expect(releaseWorkflow).toMatch(/--publish never/)
    expect(releaseWorkflow).toMatch(/--draft=false --latest/)
  })

  it('enforces exactly one public release per tag', () => {
    expect(releaseWorkflow).toMatch(/Verify the tag has exactly one public release/)
  })

  it('never reads the repository-root git metadata or a real tag', () => {
    const testSource = readFileSync(fileURLToPath(import.meta.url), 'utf8')
    // Built at runtime so these assertions do not match their own source text.
    for (const forbidden of [
      ['cwd', ': ', 'repoRoot'].join(''),
      ['git', 'Metadata', 'Skip', 'Reason'].join(''),
      ['drift', 'Tag'].join('')
    ]) {
      expect(testSource).not.toContain(forbidden)
    }
    // Every git process runs in a tmpdir fixture with isolated config.
    expect(testSource).toContain("GIT_CONFIG_GLOBAL = '/dev/null'")
    expect(testSource).toContain("GIT_CONFIG_NOSYSTEM = '1'")
  })

  it('never spawns gh or a mutating command in the repository root', () => {
    const testSource = readFileSync(fileURLToPath(import.meta.url), 'utf8')
    expect(testSource).toMatch(/import \{ execFileSync, spawnSync \} from 'node:child_process'/)
    expect(testSource).not.toMatch(/execFileSync\(\s*'gh'/)
    expect(testSource).not.toMatch(/spawnSync\(\s*'gh'/)
    // Mutating git calls only exist inside the tmpdir fixture helper.
    expect(testSource).toContain(
      'const fixtureGit = (repo: FixtureRepo, args: string[]): string =>'
    )
  })
})

// ---------------------------------------------------------------------------
// v0.1.2 ancestry gate (strict ancestor OR per-commit patch equivalence) and
// the workflow_dispatch re-run entry that must not move the tag.
// ---------------------------------------------------------------------------

type AncestryScenario =
  | 'strict-ancestor'
  | 'patch-equivalent'
  | 'divergent'
  | 'deletes-protected-path'

interface FixtureRepo {
  dir: string
  home: string
  env: NodeJS.ProcessEnv
}

// Every fixture owns a temp repository and a temp HOME. Inherited GIT_*
// variables (GIT_DIR, GIT_WORK_TREE, alternates, ...) are dropped, global and
// system config are disabled, and the identity is explicit, so a hostile
// ~/.gitconfig cannot leak into the suite.
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

// Tempdir fixtures are the only place this suite writes git state.
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
  const result = spawnSync('bash', [scriptPath], {
    cwd: repo.dir,
    encoding: 'utf8',
    env: repo.env
  })
  return {
    status: result.status ?? -1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`
  }
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
  run: (fixture: { repo: FixtureRepo; tagSha: string }) => void
): void => {
  const fixture = createAncestryFixture(scenario)
  try {
    run(fixture)
  } finally {
    disposeFixtureRepo(fixture.repo)
  }
}

describe('v0.1.2 ancestry gate', () => {
  it('inlines the gate script with ref-type, per-commit and fail-closed logging', () => {
    expect(ancestryGateScript).toContain("tag='v0.1.2'")
    expect(ancestryGateScript).toContain('git cat-file -t')
    expect(ancestryGateScript).toContain('git cherry HEAD')
    expect(ancestryGateScript).toContain('ref type=')
    expect(ancestryGateScript).toContain('cherry=${decision}')
    expect(ancestryGateScript).toContain('git diff-tree')
    expect(ancestryGateScript).toMatch(/exit 1/)
    expect(ancestryGateScript).not.toMatch(/\|\|\s*true/)
  })

  it('passes when the tag is a strict ancestor with a non-zero lead', () => {
    withAncestryFixture('strict-ancestor', ({ repo, tagSha }) => {
      const { status, output } = runAncestryGate(repo)
      expect(output).toContain(`ref type=tag (annotated) commit=${tagSha}`)
      expect(output).toContain('v0.1.2..HEAD commits=1 HEAD..v0.1.2 commits=0')
      expect(output).toContain('is a strict ancestor of HEAD; ancestry check passed.')
      expect(status).toBe(0)
    })
  })

  it('passes when a tag-only commit is patch-equivalent and logs its SHA with -', () => {
    withAncestryFixture('patch-equivalent', ({ repo, tagSha }) => {
      const { status, output } = runAncestryGate(repo)
      expect(output).toContain(`ref type=tag (annotated) commit=${tagSha}`)
      expect(output).toContain(`v0.1.2-only commit ${tagSha} cherry=-`)
      expect(output).toContain('ancestry check passed')
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
      expect(output).toContain(`v0.1.2-only commit ${firstSha} cherry=-`)
      expect(output).toContain(`v0.1.2-only commit ${secondSha} cherry=-`)
      expect(status).toBe(0)
    })
  })

  it('logs a lightweight tag as a commit ref with its resolved commit SHA', () => {
    const fixture = createAncestryFixture('patch-equivalent', 'lightweight')
    try {
      const { status, output } = runAncestryGate(fixture.repo)
      expect(output).toContain(`ref type=commit (lightweight) commit=${fixture.tagSha}`)
      expect(status).toBe(0)
    } finally {
      disposeFixtureRepo(fixture.repo)
    }
  })

  it('rejects a tag-only commit whose patch is not present in HEAD', () => {
    withAncestryFixture('divergent', ({ repo, tagSha }) => {
      const { status, output } = runAncestryGate(repo)
      expect(output).toContain(`v0.1.2-only commit ${tagSha} cherry=+`)
      expect(output).toContain('::error::')
      expect(output).toContain('not present in HEAD')
      expect(status).not.toBe(0)
    })
  })

  it('rejects a patch-equivalent tag-only commit that deletes a protected path', () => {
    withAncestryFixture('deletes-protected-path', ({ repo, tagSha }) => {
      const { status, output } = runAncestryGate(repo)
      expect(output).toContain(`v0.1.2-only commit ${tagSha} cherry=-`)
      expect(output).toContain('deletes the release-critical path electron-builder.yml')
      expect(status).not.toBe(0)
    })
  })

  it('fails closed when the tag cannot be resolved', () => {
    withFixtureRepo((repo) => {
      initFixtureRepo(repo)
      const { status, output } = runAncestryGate(repo)
      expect(output).toContain('::error::')
      expect(output).toContain('not visible')
      expect(status).not.toBe(0)
    })
  })

  it('keeps the non-zero lead requirement', () => {
    withFixtureRepo((repo) => {
      initFixtureRepo(repo)
      tagFixtureHead(repo, 'lightweight')
      const { status, output } = runAncestryGate(repo)
      expect(output).toContain('no commits after v0.1.2')
      expect(status).not.toBe(0)
    })
  })

  it('has no escape hatch on the gates path', () => {
    const gatesBlock = releaseWorkflow.slice(
      releaseWorkflow.indexOf('name: Quality gates'),
      releaseWorkflow.indexOf('name: Package ${{ matrix.target }}')
    )
    expect(gatesBlock).not.toContain('continue-on-error')
    expect(gatesBlock).not.toContain('|| true')
  })
})

describe('manual re-run dispatch entry', () => {
  const dispatchBlock = ((): string => {
    const start = releaseWorkflow.indexOf('workflow_dispatch:')
    const end = releaseWorkflow.indexOf('permissions:')
    return start === -1 ? '' : releaseWorkflow.slice(start, end === -1 ? undefined : end)
  })()

  it('declares workflow_dispatch with a tag input defaulting to the current tag', () => {
    expect(dispatchBlock).not.toBe('')
    expect(dispatchBlock).toMatch(/inputs:\s*\n\s+tag:\s*\n/)
    expect(dispatchBlock).toMatch(/required:\s*true/)
    expect(dispatchBlock).toContain(`default: '${currentTag}'`)
  })

  it('resolves one RELEASE_TAG and checks out refs/tags/<tag> in both jobs', () => {
    expect(releaseWorkflow).toMatch(
      /RELEASE_TAG:\s*\$\{\{\s*inputs\.tag\s*\|\|\s*github\.ref_name\s*\}\}/
    )
    const tagCheckouts = [
      ...releaseWorkflow.matchAll(/ref:\s*refs\/tags\/\$\{\{\s*env\.RELEASE_TAG\s*\}\}/g)
    ]
    expect(tagCheckouts.length).toBe(2)
    expect(releaseWorkflow).not.toMatch(/GITHUB_REF_NAME/)
  })

  it('validates the tag format and its existence before install', () => {
    const validate = gateStep('Validate the release tag')?.run ?? ''
    const exists = gateStep('Assert the release tag exists in the checkout')?.run ?? ''
    expect(validate).toContain('^v[0-9]+\\.[0-9]+\\.[0-9]+$')
    expect(validate).toMatch(/exit 1/)
    expect(exists).toContain('refs/tags/${RELEASE_TAG}')
    expect(exists).toMatch(/exit 1/)
    const install = releaseWorkflow.indexOf('- run: pnpm install --frozen-lockfile')
    expect(releaseWorkflow.indexOf('name: Validate the release tag')).toBeLessThan(install)
    expect(
      releaseWorkflow.indexOf('name: Assert the release tag exists in the checkout')
    ).toBeLessThan(install)
  })

  it('keeps the push v* trigger and the gates-first publish model', () => {
    expect(releaseWorkflow).toMatch(/push:\s*\n\s+tags:\s*\n\s*-\s*'v\*'/)
    const gates = releaseWorkflow.indexOf('name: Quality gates')
    const matrix = releaseWorkflow.indexOf('name: Package ${{ matrix.target }}')
    const finalize = releaseWorkflow.indexOf('name: Publish the GitHub Release')
    expect(gates).toBeGreaterThan(-1)
    expect(matrix).toBeGreaterThan(gates)
    expect(finalize).toBeGreaterThan(matrix)
    expect(releaseWorkflow).toMatch(/needs: gates/)
    expect(releaseWorkflow).toMatch(/needs: release/)
    expect(releaseWorkflow).toMatch(/--publish never/)
    expect(releaseWorkflow).toMatch(/--draft=false --latest/)
  })
})

describe('release signing credentials checklist', () => {
  it('documents each credential for human entry as a GitHub secret', () => {
    for (const secret of signingSecrets) {
      expect(signingDoc).toContain(secret)
    }
    expect(signingDoc).toMatch(/GitHub Secrets?/)
  })

  it('documents the App Store Connect API key mode', () => {
    expect(signingDoc).toMatch(/App Store Connect API Key/)
    expect(signingDoc).toMatch(/Developer\*{0,2} 角色/)
    expect(signingDoc).toMatch(/仅可下载一次/)
    expect(signingDoc).toMatch(/Key ID/)
    expect(signingDoc).toMatch(/Issuer ID/)
    expect(signingDoc).toContain('3X4J53U6RY')
  })

  it('defers the actual credential entry to the Apple Developer Program decision', () => {
    expect(signingDoc).toMatch(/Apple Developer Program/)
  })

  it('documents the current formal-release posture instead of the former freeze', () => {
    expect(signingDoc).toContain(`正式版发布姿态（${currentTag}）`)
    expect(signingDoc).toContain(`docs/release-notes/${latestPublishedTag}.md`)
    expect(signingDoc).not.toMatch(/发布冻结/)
    // The v0.1.2 drift record stays documented rather than being deleted.
    expect(signingDoc).toMatch(/v0\.1\.2/)
  })

  it('records the v0.1.2 drift facts in the signing doc', () => {
    for (const fact of driftFacts) {
      expect(signingDoc).toMatch(fact)
    }
  })

  it('keeps credential names, team id and local paths out of both READMEs', () => {
    for (const doc of [readmeEn, readmeZh]) {
      for (const secret of signingSecrets) {
        expect(doc).not.toContain(secret)
      }
      expect(doc).not.toContain('3X4J53U6RY')
      expect(doc).not.toContain('Tao Zhu')
      expect(doc).not.toContain('/Users/')
      expect(doc).toContain('docs/release-signing.md')
    }
  })

  it('reports the latest published tag once on line 5 and links that release', () => {
    for (const line of [readmeStatusLine(readmeZh), readmeStatusLine(readmeEn)]) {
      expect(line).toContain(latestPublishedTag)
      expect([...line.matchAll(/releases\/tag\//g)]).toHaveLength(1)
      expect(line).toContain(`releases/tag/${latestPublishedTag}`)
    }
    expect(readmeZh).not.toContain(pendingWord)
    for (const doc of [readmeEn, readmeZh]) {
      expect(doc).not.toContain(`releases/tag/${previousPublishedTag}`)
      expect(doc).not.toContain('releases/tag/v0.2.4')
      expect(doc).not.toContain('releases/tag/v0.2.2')
      expect(doc).not.toContain(`releases/tag/${ghostTag}`)
    }
  })

  it('keeps the fixed-issue history in the release notes instead of the READMEs', () => {
    for (const phrase of ['v0.2.2 及更早', '悬空符号链接', '不可读项', '已跳过']) {
      expect(historicalNotesV024).toContain(phrase)
    }
    for (const phrase of ['8 路', '有界并发', '文件句柄耗尽', 'EMFILE']) {
      expect(historicalNotesV022).toContain(phrase)
    }
    for (const doc of [readmeEn, readmeZh]) {
      expect(doc).not.toContain('悬空符号链接')
      expect(doc).not.toContain('dangling symlink')
      expect(doc).not.toContain('EMFILE')
    }
  })

  it('documents the no-follow symlink policy in its own doc', () => {
    const issues = readmeZh.slice(readmeZh.indexOf('## 已知问题'))
    expect(issues).not.toContain('符号链接计数放大')
    expect(readmeZh).not.toMatch(/悬空符号链接[^\n]*跳过并计数/)
    expect(readmeEn).not.toMatch(/symlink[^\n]*count inflation/i)
    for (const phrase of [
      '不进入链接指向的任何目录',
      '链接自身作为一条叶条目',
      '悬空链接',
      'EACCES',
      '已跳过：左 X / 右 Y',
      '指向**文件**的链接',
      '指向**目录**的链接',
      'opencompare.snapshot/v1'
    ]) {
      expect(symlinkDoc).toContain(phrase)
    }
    for (const doc of [readmeEn, readmeZh]) {
      expect(doc).toContain('docs/symlink-no-follow.md')
    }
  })

  it('keeps the workflow_dispatch default in sync between the release doc and the workflow', () => {
    expect(releaseProcessDoc).toContain('workflow_dispatch')
    expect(releaseProcessDoc).toContain(`default: '${currentTag}'`)
    expect(releaseWorkflow).toContain(`default: '${currentTag}'`)
    for (const doc of [readmeEn, readmeZh]) {
      expect(doc).not.toContain('workflow_dispatch')
      expect(doc).toContain('docs/release-process.md')
    }
  })

  it('documents that version convergence leaves the README status line alone', () => {
    for (const phrase of [
      'README 第 5 行',
      '已发布',
      '不改这一行',
      'latestPublishedTag',
      '收尾提交'
    ]) {
      expect(releaseProcessDoc).toContain(phrase)
    }
  })

  it('reports the signing doc status as published for the latest published tag', () => {
    expect(signingDoc).toContain(`当前状态：${latestPublishedTag} 已发布`)
    expect(signingDoc).toContain(`正式版发布姿态（${currentTag}）`)
    expect(signingDoc).toContain(`docs/release-notes/${latestPublishedTag}.md`)
    expect(signingDoc).toContain(`docs/release-evidence/${latestPublishedTag}.md`)
    expect(signingDoc).not.toContain(pendingWord)
    // The re-issue entry keeps the converged version as its dispatch default.
    expect(signingDoc).toContain(`默认 \`${currentTag}\``)
    // The convergence is merged on main and the published anchor equals it.
    expect(signingDoc).toContain('已合入 `main`')
    expect(signingDoc).toContain(`docs/release-notes/${currentTag}.md`)
    expect(signingDoc).not.toContain(`当前状态：${previousPublishedTag}`)
    expect(signingDoc).not.toContain('当前状态：v0.2.4')
    expect(signingDoc).not.toContain('当前状态：v0.2.2')
  })

  it('records the v0.2.16 signing and notarization facts in section three', () => {
    const section = signingDoc.slice(signingDoc.indexOf('## 三、'), signingDoc.indexOf('## 四、'))
    // v0.2.15 is demoted to history while v0.2.16 owns the current status.
    expect(section).toContain(`${lastShippedTag} 已发布（历史）`)
    for (const marker of [
      'notarization successful',
      'valid on disk',
      'satisfies its Designated Requirement',
      'stapler validate',
      'Gatekeeper acceptance'
    ]) {
      expect(section).toContain(marker)
    }
  })
})


// --- Changelog and README ledgers: structure and cross-document invariants ---
const evidenceVersions = readdirSync(join(repoRoot, 'docs/release-evidence'))
  .filter((file) => file.endsWith('.md'))
  .map((file) => file.slice(0, -'.md'.length))
const evidenceStatus = new Map(
  evidenceVersions.map((version) => [
    version,
    /^status:\s*(\w+)$/m.exec(
      readFileSync(join(repoRoot, 'docs/release-evidence', `${version}.md`), 'utf8')
    )?.[1] ?? ''
  ])
)
const changelogHeadings = [...changelog.matchAll(/^## (.+)$/gm)].map((match) => match[1])
const newestEvidenceTag = [...evidenceVersions].sort((a, b) => (isTagBefore(a, b) ? 1 : -1))[0]
const README_SECTIONS: Array<[string, string]> = [
  ['Download and install', '下载与安装'],
  ['Features', '核心能力'],
  ['Quickstart', '快速上手'],
  ['Requirements and development', '环境要求与开发'],
  ['Project structure', '项目结构'],
  ['Known issues', '已知问题'],
  ['Evidence and docs', '证据与文档'],
  ['Open Rebuilds 001', 'Open Rebuilds 001 平替'],
  ['License', '许可']
]

describe('release history structure', () => {
  it('keeps changelog headings unique, newest first and anchored to evidence', () => {
    expect(changelogHeadings[0]).toBe(currentTag)
    expect(new Set(changelogHeadings).size).toBe(changelogHeadings.length)
    expect(changelogHeadings).toEqual(
      [...changelogHeadings].sort((a, b) => (isTagBefore(a, b) ? 1 : -1))
    )
    for (const heading of changelogHeadings) {
      expect(heading, 'changelog heading').toMatch(/^v\d+\.\d+\.\d+$/)
      if (heading !== 'v0.1.2') expect(evidenceVersions, `evidence ${heading}`).toContain(heading)
    }
    for (const version of evidenceVersions) {
      if (evidenceStatus.get(version) === 'verified')
        expect(changelogHeadings, `changelog ${version}`).toContain(version)
    }
  })

  it('keeps changelog links absolute and never points at a ghost or folded release', () => {
    const allowed = new Set([...changelogHeadings, currentTag])
    for (const match of changelog.matchAll(
      /https:\/\/github\.com\/chaxiu\/OpenCompare\/releases\/tag\/(v\d+\.\d+\.\d+)/g
    )) {
      expect(allowed.has(match[1]), `unknown link ${match[1]}`).toBe(true)
    }
    expect(changelog).not.toMatch(/(^|[^/])releases\/tag\//)
    expect(changelog).not.toMatch(/releases\/download\//)
    expect(changelog).not.toMatch(new RegExp(`^## ${ghostTag}$`, 'm'))
    expect(changelog).not.toMatch(new RegExp(`^## ${foldedTag}$`, 'm'))
  })

  it('keeps never-published and folded versions out of every release document', () => {
    for (const path of [
      ghostNotesPath,
      ghostEvidencePath,
      foldedNotesPath,
      foldedBilingualNotesPath,
      foldedEvidencePath
    ]) {
      expect(existsSync(join(repoRoot, path)), path).toBe(false)
    }
    const offenders = documentPaths()
      .filter((path) => {
        const text = readFileSync(path, 'utf8')
        return [ghostNotesPath, ghostReleaseLink, foldedNotesPath, foldedReleaseLink].some(
          (needle) => text.includes(needle)
        )
      })
      .map((path) => relative(repoRoot, path))
    expect(offenders).toEqual([])
  })
})

describe('README invariants', () => {
  it('ships mirrored nine-section bilingual READMEs with cross-links', () => {
    for (const doc of [readmeEn, readmeZh]) {
      expect(readmeLines(doc)[0]).toBe('# OpenCompare')
      expect(h2Headings(doc)).toHaveLength(9)
    }
    expect(h2Headings(readmeEn)).toEqual(README_SECTIONS.map(([en]) => en))
    expect(h2Headings(readmeZh)).toEqual(README_SECTIONS.map(([, zh]) => zh))
    expect(readmeLines(readmeEn).slice(0, 10).join('\n')).toContain('[简体中文](./README.zh-CN.md)')
    expect(readmeLines(readmeZh).slice(0, 10).join('\n')).toContain('[English](./README.md)')
    expect(stripLanguageSwitch(readmeEn)).not.toMatch(/\p{Script=Han}/u)
  })

  it('points line 5 at the newest evidence tag and keeps the English word budget', () => {
    for (const doc of [readmeEn, readmeZh]) {
      const status = readmeStatusLine(doc)
      expect(status, 'line 5').toContain(newestEvidenceTag)
      expect([...status.matchAll(/releases\/tag\//g)]).toHaveLength(1)
    }
    expect(wordCount(readmeEn)).toBeLessThanOrEqual(700)
  })

  it('keeps version history and versioned download urls out of the README body', () => {
    for (const doc of [readmeEn, readmeZh]) {
      expect(doc).not.toContain('| Version |')
      expect(doc).not.toContain('| 版本 |')
      expect(doc).not.toContain('releases/download/')
      expect(doc).toContain('https://github.com/chaxiu/OpenCompare/releases')
      expect(doc).not.toMatch(/\bKNOWN\b/)
      expect(readmeLines(doc).filter((_, index) => index !== 4).join('\n')).not.toMatch(
        /\bv\d+\.\d+\.\d+\b/
      )
    }
  })
})
