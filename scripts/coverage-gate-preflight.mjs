#!/usr/bin/env node
/**
 * Local rehearsal for the release coverage gate.
 *
 * Creates a throwaway semver tag (`v9.9.9-rehearsal`) on HEAD, runs the same
 * coverage measurement + gate the release workflow runs, then deletes the tag.
 * Because the rehearsal tag sits on HEAD, `previousReleaseTag()` skips it and
 * the gate sees the same "previous tag" it would see on a real release-tag
 * checkout.
 *
 * `--negative floor` / `--negative stale` re-run the gate with a temporary
 * baseline that must fail, proving the gate is not vacuously green. The real
 * `.munk/baseline/coverage.json` is never modified, and this script never
 * pushes anything.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { evaluateBaselineFreshness, previousReleaseTag } from './coverage-gate.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const BASELINE_PATH = join(ROOT, '.munk/baseline/coverage.json')
const REHEARSAL_TAG = 'v9.9.9-rehearsal'
const VITEST_ENTRY = join(ROOT, 'node_modules/vitest/vitest.mjs')

function git(args) {
  return spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' })
}

function deleteRehearsalTag() {
  git(['tag', '-d', REHEARSAL_TAG])
}

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
  return {
    status: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`
  }
}

function parseNegative(argv) {
  let negative = null
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--negative') {
      negative = argv[index + 1] ?? null
      index += 1
      if (negative !== 'floor' && negative !== 'stale') {
        console.error(`--negative expects floor|stale, got ${JSON.stringify(negative)}`)
        process.exit(2)
      }
      continue
    }
    console.error(`unknown option: ${arg}`)
    process.exit(2)
  }
  return negative
}

function printOutput(label, result) {
  console.log(`--- ${label} (exit ${result.status}) ---`)
  console.log(result.output.trim())
}

function main() {
  const negative = parseNegative(process.argv.slice(2))
  const realBaselineBytes = readFileSync(BASELINE_PATH)
  const baseline = JSON.parse(realBaselineBytes.toString('utf8'))
  const include = baseline.scope?.include
  const excludes = Array.isArray(baseline.scope?.exclude) ? baseline.scope.exclude : null
  const provider = baseline.provider
  if (typeof include !== 'string' || excludes === null || typeof provider !== 'string') {
    console.error('baseline is missing provider/scope.include/scope.exclude')
    process.exit(2)
  }

  const freshness = evaluateBaselineFreshness(baseline)
  if (freshness.problems.length > 0) {
    for (const problem of freshness.problems) console.error(`FAIL ${problem}`)
    console.error(
      'This checkout is already past the release point for the committed baseline. Rehearse on the release commit worktree (apply the fix there without committing on top of the tag), or refresh the baseline through the release process first. This script never edits the baseline.'
    )
    process.exit(1)
  }
  for (const message of freshness.messages) console.log(`ok   ${message}`)

  if (!existsSync(VITEST_ENTRY)) {
    console.error(`missing ${VITEST_ENTRY}; run pnpm install --frozen-lockfile first`)
    process.exit(2)
  }

  const previous = previousReleaseTag()
  const workDir = mkdtempSync(join(tmpdir(), 'coverage-gate-preflight-'))
  const summaryDir = join(workDir, 'reports')
  const baselineDir = join(workDir, 'baselines')
  mkdirSync(baselineDir, { recursive: true })
  const startedAt = Math.floor(Date.now() / 1000)
  const summaryPath = join(summaryDir, 'coverage-summary.json')

  const gateArgs = (baselinePath) => {
    const args = [
      join(ROOT, 'scripts/coverage-gate.mjs'),
      '--summary',
      summaryPath,
      '--started-at',
      String(startedAt),
      '--include',
      include
    ]
    for (const exclude of excludes) args.push('--exclude', exclude)
    if (baselinePath !== undefined) args.push('--baseline', baselinePath)
    return args
  }

  const results = { positive: false, floor: false, stale: false }
  let tagDeleted
  try {
    deleteRehearsalTag()
    const created = git(['tag', REHEARSAL_TAG])
    if (created.status !== 0) {
      throw new Error(`cannot create rehearsal tag: ${created.stderr.trim()}`)
    }

    const coverageArgs = [
      VITEST_ENTRY,
      'run',
      '--coverage',
      `--coverage.provider=${provider}`,
      `--coverage.include=${include}`
    ]
    for (const exclude of excludes) coverageArgs.push(`--coverage.exclude=${exclude}`)
    coverageArgs.push('--coverage.reporter=json-summary', `--coverage.reportsDirectory=${summaryDir}`)

    const coverage = runNode(coverageArgs)
    if (coverage.status !== 0) {
      printOutput('coverage', coverage)
      console.error('PREFLIGHT positive: FAIL (coverage measurement failed)')
    } else {
      const positive = runNode(gateArgs())
      printOutput('gate', positive)
      results.positive = positive.status === 0
      console.log(`PREFLIGHT positive: ${results.positive ? 'PASS' : 'FAIL'}`)
    }

    const floorBaselinePath = join(baselineDir, 'baseline-floor.json')
    const floorBaseline = JSON.parse(realBaselineBytes.toString('utf8'))
    floorBaseline.floors.totals.lines = baseline.floors.totals.lines - 1
    writeFileSync(floorBaselinePath, `${JSON.stringify(floorBaseline, null, 2)}\n`)
    const floorRun = runNode(gateArgs(floorBaselinePath))
    printOutput('negative floor', floorRun)
    results.floor =
      floorRun.status !== 0 && floorRun.output.includes('needs a matching floorLedger entry')
    console.log(`PREFLIGHT negative floor: ${results.floor ? 'PASS' : 'FAIL'}`)

    const staleBaselinePath = join(baselineDir, 'baseline-stale.json')
    const staleBaseline = JSON.parse(realBaselineBytes.toString('utf8'))
    let olderCommit = '0'.repeat(40)
    if (previous !== null) {
      const parent = git(['rev-parse', `${previous.sha}^`])
      if (parent.status === 0 && /^[0-9a-f]{40}$/.test(parent.stdout.trim())) {
        olderCommit = parent.stdout.trim()
      }
    }
    staleBaseline.measuredAt.commit = olderCommit
    writeFileSync(staleBaselinePath, `${JSON.stringify(staleBaseline, null, 2)}\n`)
    const staleRun = runNode(gateArgs(staleBaselinePath))
    printOutput('negative stale', staleRun)
    results.stale =
      staleRun.status !== 0 &&
      (staleRun.output.includes('older than the previous semver tag') ||
        staleRun.output.includes('not reachable from HEAD'))
    console.log(`PREFLIGHT negative stale: ${results.stale ? 'PASS' : 'FAIL'}`)
  } finally {
    deleteRehearsalTag()
    const remaining = git(['tag', '--list', `${REHEARSAL_TAG}*`])
    tagDeleted = remaining.status === 0 && remaining.stdout.trim() === ''
    rmSync(workDir, { recursive: true, force: true })
  }

  const baselineUntouched = readFileSync(BASELINE_PATH).equals(realBaselineBytes)
  if (!baselineUntouched) console.error('FAIL real baseline bytes changed during preflight')
  console.log(`PREFLIGHT baseline untouched: ${baselineUntouched ? 'PASS' : 'FAIL'}`)
  console.log(`PREFLIGHT rehearsal tag removed: ${tagDeleted ? 'PASS' : 'FAIL'}`)

  const requested = [results.positive, baselineUntouched, tagDeleted]
  if (negative === null || negative === 'floor') requested.push(results.floor)
  if (negative === null || negative === 'stale') requested.push(results.stale)
  const passed = requested.every(Boolean)
  console.log(`PREFLIGHT overall: ${passed ? 'PASS' : 'FAIL'}`)
  process.exit(passed ? 0 : 1)
}

try {
  main()
} catch (error) {
  console.error(`PREFLIGHT error: ${error.message}`)
  process.exit(1)
}
