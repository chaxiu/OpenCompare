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
 *
 * The instrumented full run is measured once and cached outside the repository.
 * A cache entry is reused only when its key matches HEAD commit + tree sha, the
 * preflight/gate script content, the baseline-covered file set and the
 * instrumentation-relevant environment; anything else is a `cache miss` and is
 * remeasured. The three workflow steps therefore keep their per-step
 * attribution while sharing one measurement.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  assessCacheEntry,
  computeCacheKey,
  environmentFacts,
  fileSetFingerprint,
  scriptHash
} from './coverage-gate-preflight-cache.mjs'
import { evaluateBaselineFreshness, previousReleaseTag } from './coverage-gate.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const BASELINE_PATH = join(ROOT, '.munk/baseline/coverage.json')
const REHEARSAL_TAG = 'v9.9.9-rehearsal'
const VITEST_ENTRY = join(ROOT, 'node_modules/vitest/vitest.mjs')
const CACHE_ROOT =
  process.env.OPENCOMPARE_COVERAGE_PREFLIGHT_CACHE_DIR ?? join(tmpdir(), 'coverage-gate-preflight-cache')
const KEYED_SCRIPTS = [
  'scripts/coverage-gate-preflight.mjs',
  'scripts/coverage-gate-preflight-cache.mjs',
  'scripts/coverage-gate.mjs'
]
const GIT_SHA = /^[0-9a-f]{40,64}$/

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

function readJson(path) {
  if (!existsSync(path)) return { value: null, reason: `missing ${path}` }
  try {
    return { value: JSON.parse(readFileSync(path, 'utf8')), reason: null }
  } catch (error) {
    return { value: null, reason: `${path} is not valid JSON: ${error.message}` }
  }
}

function writeJsonAtomic(path, value) {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(temporary, path)
}

function packageManagerField() {
  try {
    return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).packageManager ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

/** Fail-closed key context: any unresolved component throws and forces a remeasure. */
function cacheKeyContext(baseline) {
  const head = git(['rev-parse', 'HEAD'])
  const tree = git(['rev-parse', 'HEAD^{tree}'])
  if (head.status !== 0 || tree.status !== 0) throw new Error('cannot resolve HEAD/tree')
  const commit = head.stdout.trim()
  const treeSha = tree.stdout.trim()
  if (!GIT_SHA.test(commit) || !GIT_SHA.test(treeSha)) throw new Error('git returned an unexpected sha')
  const fileSet = fileSetFingerprint(ROOT, baseline.scope.include, baseline.scope.exclude)
  const scripts = scriptHash(ROOT, KEYED_SCRIPTS)
  const environment = environmentFacts(process.env, {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    packageManager: packageManagerField(),
    provider: baseline.provider,
    include: baseline.scope.include,
    exclude: baseline.scope.exclude
  })
  const parts = {
    version: 1,
    commit,
    tree: treeSha,
    fileSet: fileSet.fingerprint,
    fileSetCount: fileSet.count,
    scripts,
    environment
  }
  return { parts, key: computeCacheKey(parts), fileCount: fileSet.count }
}

function cachedMeasurement(key) {
  const summaryPath = join(CACHE_ROOT, key, 'coverage-summary.json')
  const meta = readJson(join(CACHE_ROOT, `${key}.meta.json`))
  if (meta.reason !== null) return { hit: false, reason: `metadata: ${meta.reason}` }
  const summary = readJson(summaryPath)
  if (summary.reason !== null) return { hit: false, reason: `summary: ${summary.reason}` }
  let summaryMtimeMs
  try {
    summaryMtimeMs = statSync(summaryPath).mtimeMs
  } catch {
    return { hit: false, reason: `summary: missing ${summaryPath}` }
  }
  const verdict = assessCacheEntry({
    expectedKey: key,
    meta: meta.value,
    summary: summary.value,
    summaryMtimeMs
  })
  if (!verdict.hit) return { hit: false, reason: verdict.reason }
  return { hit: true, summaryPath, startedAt: verdict.startedAt, meta: meta.value }
}

/** Keep only the measurement for the current tree so a revert cannot silently hit an old tree. */
function pruneCache(keepKey, keepDir) {
  for (const entry of readdirSync(CACHE_ROOT)) {
    if (entry === keepKey || entry === `${keepKey}.meta.json`) continue
    const full = join(CACHE_ROOT, entry)
    if (keepDir !== undefined && resolve(full) === resolve(keepDir)) continue
    rmSync(full, { recursive: true, force: true })
  }
}

function measure(context, baseline, workDir) {
  const startedAt = Math.floor(Date.now() / 1000)
  const startedMs = Date.now()
  mkdirSync(CACHE_ROOT, { recursive: true })
  const measureDir = mkdtempSync(
    context === null ? join(workDir, 'uncached-') : join(CACHE_ROOT, `${context.key}.measure-`)
  )

  const coverageArgs = [
    VITEST_ENTRY,
    'run',
    '--coverage',
    `--coverage.provider=${baseline.provider}`,
    `--coverage.include=${baseline.scope.include}`
  ]
  for (const exclude of baseline.scope.exclude) coverageArgs.push(`--coverage.exclude=${exclude}`)
  coverageArgs.push('--coverage.reporter=json-summary', `--coverage.reportsDirectory=${measureDir}`)

  const coverage = runNode(coverageArgs)
  if (coverage.status !== 0) return { ok: false, coverage, startedAt }
  const durationMs = Date.now() - startedMs
  if (context === null) {
    return { ok: true, summaryPath: join(measureDir, 'coverage-summary.json'), startedAt, durationMs, cached: false }
  }

  const targetDir = join(CACHE_ROOT, context.key)
  pruneCache(context.key, measureDir)
  rmSync(targetDir, { recursive: true, force: true })
  renameSync(measureDir, targetDir)
  const meta = {
    version: 1,
    key: context.key,
    commit: context.parts.commit,
    tree: context.parts.tree,
    fileSet: { fingerprint: context.parts.fileSet, count: context.parts.fileSetCount },
    scripts: context.parts.scripts,
    environment: context.parts.environment,
    measuredAt: startedAt,
    measuredAtIso: new Date(startedAt * 1000).toISOString(),
    durationMs,
    runId: process.env.GITHUB_RUN_ID ?? null,
    createdAt: new Date().toISOString()
  }
  writeJsonAtomic(join(CACHE_ROOT, `${context.key}.meta.json`), meta)
  return {
    ok: true,
    summaryPath: join(targetDir, 'coverage-summary.json'),
    startedAt,
    durationMs,
    cached: false,
    meta
  }
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
  const baselineDir = join(workDir, 'baselines')
  mkdirSync(baselineDir, { recursive: true })

  const results = { positive: false, floor: false, stale: false }
  let context = null
  let tagDeleted
  try {
    deleteRehearsalTag()
    const created = git(['tag', REHEARSAL_TAG])
    if (created.status !== 0) {
      throw new Error(`cannot create rehearsal tag: ${created.stderr.trim()}`)
    }

    try {
      context = cacheKeyContext(baseline)
    } catch (error) {
      console.log(`cache miss: cache key unavailable (${error.message})`)
    }

    let measurement = null
    if (context !== null) {
      const cached = cachedMeasurement(context.key)
      if (cached.hit) {
        measurement = { ok: true, summaryPath: cached.summaryPath, startedAt: cached.startedAt, cached: true }
        console.log(`cache hit: ${cached.summaryPath} key=${context.key}`)
        const sourceRun = cached.meta.runId ? ` run ${cached.meta.runId}` : ''
        console.log(
          `cache source: commit ${String(cached.meta.commit).slice(0, 12)} tree ${String(cached.meta.tree).slice(0, 12)} measured ${cached.meta.measuredAtIso}${sourceRun}`
        )
      } else {
        console.log(`cache miss: ${cached.reason}`)
      }
    }

    if (measurement === null) {
      if (context !== null) console.log(`cache key: ${context.key} (${context.fileCount} covered files)`)
      measurement = measure(context, baseline, workDir)
      if (!measurement.ok) {
        printOutput('coverage', measurement.coverage)
        console.error('PREFLIGHT positive: FAIL (coverage measurement failed)')
      } else {
        console.log(
          `coverage measurement: ${(measurement.durationMs / 1000).toFixed(2)}s commit ${context === null ? 'unknown' : context.parts.commit.slice(0, 12)}`
        )
      }
    }

    if (measurement.ok) {
      const summaryPath = measurement.summaryPath
      const gateArgs = (baselinePath) => {
        const args = [
          join(ROOT, 'scripts/coverage-gate.mjs'),
          '--summary',
          summaryPath,
          '--started-at',
          String(measurement.startedAt),
          '--include',
          include
        ]
        for (const exclude of excludes) args.push('--exclude', exclude)
        if (baselinePath !== undefined) args.push('--baseline', baselinePath)
        return args
      }

      const positive = runNode(gateArgs())
      printOutput('gate', positive)
      results.positive = positive.status === 0
      console.log(`PREFLIGHT positive: ${results.positive ? 'PASS' : 'FAIL'}`)

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
    }
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
