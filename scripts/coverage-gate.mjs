#!/usr/bin/env node
/**
 * Release-only coverage gate for `src/core/**`.
 *
 * The only measurement input is a `coverage-summary.json` produced by the
 * current release job; the baseline supplies policy and expected values only.
 * This script is therefore read-only, deterministic, dependency-free and
 * network-free, and it is intentionally absent from `.munk/code-gates.json`
 * (release CI runs it once per release, not on every delivery).
 *
 * Checked here:
 * - fresh artifact: required, exists, outside the repository, and newer than
 *   `--started-at` (no fallback to a committed/historical summary);
 * - totals floors and per-module branch floor, with the two 0-branch modules
 *   exempt and proven to still have zero branches;
 * - module set equality against the baseline (no silent denominator shrink);
 * - zero `v8 ignore` / `c8 ignore` directives under `src/core`;
 * - the measured scope literals equal the baseline scope, literally and in
 *   order;
 * - the floors ratchet: lowers require a matching `floorLedger` entry;
 * - baseline freshness: `measuredAt.commit` is reachable from HEAD and is at
 *   or after the previous semver tag.
 *
 * All failures are printed together and exit non-zero. Every floor number is
 * read from the baseline; only measurement conventions live in this file
 * (`pct` fields, set equality, the exemption module list).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const DEFAULT_BASELINE = '.munk/baseline/coverage.json'
const METRICS = ['lines', 'branches', 'functions']
const EXEMPT_MODULES = ['src/core/directory/hash.ts', 'src/core/text/lines.ts']
const IGNORE_KINDS = ['v8', 'c8']

const failures = []
const report = []

function fail(message) {
  failures.push(message)
}

function ok(message) {
  report.push(message)
}

function abs(relPath) {
  return resolve(ROOT, relPath)
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function isInsideRepo(filePath) {
  const relPath = relative(ROOT, filePath)
  return relPath === '' || (!relPath.startsWith(`..${sep}`) && relPath !== '..' && !isAbsolute(relPath))
}

function parseArgs(argv) {
  const options = {
    summary: null,
    startedAt: null,
    include: [],
    exclude: [],
    baseline: DEFAULT_BASELINE,
    previousBaseline: null,
    previousTag: null
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const valueOf = () => {
      const value = argv[index + 1]
      if (value === undefined) {
        fail(`option ${arg} needs a value`)
        return null
      }
      index += 1
      return value
    }
    switch (arg) {
      case '--summary':
        options.summary = valueOf()
        break
      case '--started-at':
        options.startedAt = valueOf()
        break
      case '--include':
        options.include.push(valueOf())
        break
      case '--exclude':
        options.exclude.push(valueOf())
        break
      case '--baseline':
        options.baseline = valueOf() ?? DEFAULT_BASELINE
        break
      case '--previous-baseline':
        options.previousBaseline = valueOf()
        break
      case '--previous-tag':
        options.previousTag = valueOf()
        break
      default:
        fail(`unknown option: ${arg}`)
    }
  }
  return options
}

/** The fresh summary must be outside the repo and newer than the run start. */
function readFreshSummary(options) {
  if (options.summary === null) {
    fail('fresh artifact: --summary <coverage-summary.json> is required')
    return null
  }
  if (options.startedAt === null) {
    fail('fresh artifact: --started-at <epoch-seconds> is required')
    return null
  }
  const startedAt = Number(options.startedAt)
  if (!Number.isInteger(startedAt) || startedAt < 0) {
    fail(`fresh artifact: --started-at must be epoch seconds, got ${JSON.stringify(options.startedAt)}`)
    return null
  }
  const summaryPath = isAbsolute(options.summary) ? options.summary : abs(options.summary)
  if (isInsideRepo(summaryPath)) {
    fail(
      `fresh artifact: ${summaryPath} is inside the repository; committed or historical summaries are not accepted`
    )
    return null
  }
  if (!existsSync(summaryPath)) {
    fail(`fresh artifact: ${summaryPath} does not exist`)
    return null
  }
  const stat = statSync(summaryPath)
  if (!stat.isFile()) {
    fail(`fresh artifact: ${summaryPath} is not a file`)
    return null
  }
  if (stat.mtimeMs < startedAt * 1000) {
    fail(
      `fresh artifact: ${summaryPath} mtime ${new Date(stat.mtimeMs).toISOString()} is older than --started-at ${new Date(startedAt * 1000).toISOString()}`
    )
    return null
  }
  let summary
  try {
    summary = readJsonFile(summaryPath)
  } catch (error) {
    fail(`fresh artifact: ${summaryPath} is not valid JSON: ${error.message}`)
    return null
  }
  if (summary?.total === undefined || typeof summary.total !== 'object') {
    fail(`fresh artifact: ${summaryPath} has no total entry`)
    return null
  }
  ok(
    `fresh summary: ${summaryPath} (mtime ${new Date(stat.mtimeMs).toISOString()} >= started-at ${new Date(startedAt * 1000).toISOString()})`
  )
  return summary
}

function readBaseline(relPath) {
  const baselinePath = isAbsolute(relPath) ? relPath : abs(relPath)
  if (!existsSync(baselinePath)) {
    fail(`baseline missing: ${baselinePath}`)
    return null
  }
  let baseline
  try {
    baseline = readJsonFile(baselinePath)
  } catch (error) {
    fail(`baseline is not valid JSON: ${baselinePath}: ${error.message}`)
    return null
  }
  if (baseline?.version !== 1) fail(`baseline version must be 1, got ${baseline?.version}`)
  return baseline
}

function pctOf(entry, metric) {
  const value = entry?.[metric]?.pct
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Absolute or repo-relative summary keys become canonical `src/...` paths. */
function modulePath(key) {
  const normalized = String(key).replaceAll('\\', '/')
  const absPath = isAbsolute(key) ? key : abs(key)
  const rel = relative(ROOT, absPath).replaceAll(sep, '/')
  if (rel !== '' && rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel)) return rel
  const marker = '/src/core/'
  const markerIndex = normalized.indexOf(marker)
  if (markerIndex >= 0) return normalized.slice(markerIndex + 1)
  if (normalized.startsWith('src/core/')) return normalized
  return normalized
}

function moduleEntries(summary) {
  const entries = new Map()
  for (const [key, value] of Object.entries(summary)) {
    if (key === 'total') continue
    entries.set(modulePath(key), value)
  }
  return entries
}

function checkTotals(summary, baseline) {
  for (const metric of METRICS) {
    const floor = baseline.floors?.totals?.[metric]
    if (typeof floor !== 'number') {
      fail(`baseline floors.totals.${metric} must be a number, got ${JSON.stringify(floor)}`)
      continue
    }
    const value = pctOf(summary.total, metric)
    if (value === null) {
      fail(`fresh summary total.${metric}.pct is missing`)
      continue
    }
    if (value < floor) fail(`totals ${metric}: ${value}% < floor ${floor}%`)
    else ok(`totals ${metric}: ${value}% >= ${floor}%`)
  }
}

function checkModuleSet(entries, baseline) {
  const baselineKeys = Object.keys(baseline.modules ?? {})
  if (baselineKeys.length === 0) {
    fail('baseline modules: no module entries')
    return
  }
  const expected = new Set(baselineKeys)
  const actual = new Set(entries.keys())
  const missing = [...expected].filter((key) => !actual.has(key))
  const extra = [...actual].filter((key) => !expected.has(key))
  if (missing.length > 0) fail(`module set: missing from fresh summary: ${missing.join(', ')}`)
  if (extra.length > 0) fail(`module set: unexpected modules in fresh summary: ${extra.join(', ')}`)
  if (missing.length === 0 && extra.length === 0) {
    ok(`module set: ${actual.size} modules match baseline`)
  }
}

/** The exemption list is fixed; every exempt module must still have 0 branches. */
function checkExemptModules(entries, baseline) {
  const declared = baseline.floors?.moduleBranchesMinExempt
  const expected = new Set(EXEMPT_MODULES)
  const actual = new Set(Array.isArray(declared) ? declared : [])
  const sameList =
    Array.isArray(declared) &&
    declared.length === EXEMPT_MODULES.length &&
    [...expected].every((key) => actual.has(key))
  if (!sameList) {
    fail(
      `baseline floors.moduleBranchesMinExempt must be exactly ${JSON.stringify(EXEMPT_MODULES)}, got ${JSON.stringify(declared)}`
    )
  }
  for (const moduleName of EXEMPT_MODULES) {
    const entry = entries.get(moduleName)
    if (entry === undefined) {
      fail(`exempt module ${moduleName}: missing from fresh summary`)
      continue
    }
    const total = entry?.branches?.total
    if (total !== 0) {
      fail(`exempt module ${moduleName}: branches.total is ${total}, exemption only covers 0-branch modules`)
      continue
    }
    ok(`exempt module ${moduleName}: 0 branches`)
  }
  return expected
}

function checkModuleBranches(entries, baseline, exempt) {
  const min = baseline.floors?.moduleBranchesMin
  if (typeof min !== 'number') {
    fail(`baseline floors.moduleBranchesMin must be a number, got ${JSON.stringify(min)}`)
    return
  }
  let lowest = null
  for (const [moduleName, entry] of entries) {
    if (exempt.has(moduleName)) continue
    const value = pctOf(entry, 'branches')
    if (value === null) {
      fail(`module ${moduleName}: branches.pct is missing`)
      continue
    }
    if (lowest === null || value < lowest.pct) lowest = { path: moduleName, pct: value }
    if (value < min) fail(`module branches: ${moduleName} ${value}% < ${min}%`)
  }
  if (lowest !== null) ok(`module branches min: ${lowest.path} ${lowest.pct}% >= ${min}%`)
}

function walkTs(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = join(dir, entry.name)
    if (entry.isDirectory()) {
      walkTs(child, out)
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.ts')) out.push(child)
  }
  return out
}

function checkIgnoreDirectives(baseline) {
  const coreDir = abs('src/core')
  const hits = []
  const counts = { v8: 0, c8: 0 }
  if (existsSync(coreDir)) {
    for (const file of walkTs(coreDir)) {
      const relPath = relative(ROOT, file).replaceAll(sep, '/')
      const source = readFileSync(file, 'utf8')
      for (const kind of IGNORE_KINDS) {
        const count = (source.match(new RegExp(`${kind}\\s+ignore`, 'g')) ?? []).length
        if (count === 0) continue
        counts[kind] += count
        hits.push(`${relPath} ${kind} x${count}`)
      }
    }
  }
  const max = baseline.floors?.ignoreDirectivesMax
  if (!Number.isInteger(max) || max < 0) {
    fail(`baseline floors.ignoreDirectivesMax must be a non-negative integer, got ${JSON.stringify(max)}`)
    return
  }
  for (const kind of IGNORE_KINDS) {
    if (counts[kind] > max) {
      fail(`ignore directives: ${kind} ${counts[kind]} > max ${max} (${hits.join('; ') || 'no hits'})`)
    }
  }
  if (IGNORE_KINDS.every((kind) => counts[kind] <= max)) {
    ok(`ignore directives: v8 ${counts.v8} <= ${max}, c8 ${counts.c8} <= ${max}`)
  }
}

function checkScope(options, baseline) {
  const include = options.include
  const baseInclude = baseline.scope?.include
  const baseExclude = Array.isArray(baseline.scope?.exclude) ? baseline.scope.exclude : null
  let mismatch = false
  if (include.length !== 1) {
    fail(`scope: --include must be passed exactly once, got ${include.length}`)
    mismatch = true
  } else if (include[0] !== baseInclude) {
    fail(`scope: include ${JSON.stringify(include[0])} != baseline ${JSON.stringify(baseInclude)}`)
    mismatch = true
  }
  if (baseExclude === null) {
    fail('scope: baseline scope.exclude must be an array')
    mismatch = true
  } else if (JSON.stringify(options.exclude) !== JSON.stringify(baseExclude)) {
    fail(
      `scope: exclude ${JSON.stringify(options.exclude)} != baseline ${JSON.stringify(baseExclude)} (literal order matters)`
    )
    mismatch = true
  }
  if (!mismatch) {
    ok(`scope: include ${JSON.stringify(baseInclude)}, exclude ${JSON.stringify(baseExclude)}`)
  }
}

function gitOutput(args) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  }).trim()
}

function isAncestor(ancestor, descendant) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd: ROOT,
      stdio: ['ignore', 'ignore', 'ignore']
    })
    return true
  } catch {
    return false
  }
}

/** The nearest semver tag reachable from HEAD, including a tag on HEAD itself. */
function latestReachableTag() {
  try {
    const tag = gitOutput(['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*'])
    return { tag, sha: gitOutput(['rev-parse', `${tag}^{commit}`]) }
  } catch {
    return null
  }
}

/** The newest semver tag reachable from HEAD that is not HEAD itself. */
function previousReleaseTag() {
  let tags
  try {
    tags = gitOutput(['tag', '--merged', 'HEAD', '--sort=-v:refname', '--list', 'v[0-9]*'])
      .split('\n')
      .filter(Boolean)
  } catch {
    return null
  }
  let head
  try {
    head = gitOutput(['rev-parse', 'HEAD'])
  } catch {
    return null
  }
  for (const tag of tags) {
    let sha
    try {
      sha = gitOutput(['rev-parse', `${tag}^{commit}`])
    } catch {
      continue
    }
    if (sha !== head) return { tag, sha }
  }
  return null
}

function checkBaselineFreshness(baseline) {
  const commit = baseline.measuredAt?.commit
  const date = baseline.measuredAt?.date
  if (typeof commit !== 'string' || !/^[0-9a-f]{40}$/.test(commit)) {
    fail('baseline freshness: measuredAt.commit must be a 40-char lowercase hex sha')
    return
  }
  if (typeof date !== 'string' || Number.isNaN(Date.parse(date))) {
    fail(`baseline freshness: measuredAt.date must be a valid ISO timestamp, got ${JSON.stringify(date)}`)
  }
  let head
  try {
    head = gitOutput(['rev-parse', 'HEAD'])
  } catch {
    fail('baseline freshness: cannot resolve HEAD')
    return
  }
  if (!isAncestor(commit, head)) {
    fail(`baseline stale: measuredAt.commit ${commit} is not reachable from HEAD ${head}`)
    return
  }
  const latestTag = latestReachableTag()
  if (latestTag === null) {
    ok(`baseline freshness: measuredAt.commit ${commit.slice(0, 12)} is reachable from HEAD (no semver tag)`)
    return
  }
  if (!isAncestor(latestTag.sha, commit)) {
    fail(
      `baseline stale: measuredAt.commit ${commit} is older than the latest semver tag ${latestTag.tag} (${latestTag.sha})`
    )
    return
  }
  ok(`baseline freshness: measuredAt.commit ${commit.slice(0, 12)} is at or after ${latestTag.tag}`)
}

function baselineAtRef(ref) {
  try {
    return JSON.parse(gitOutput(['show', `${ref}:${DEFAULT_BASELINE}`]))
  } catch {
    return null
  }
}

function previousCommittedBaseline() {
  let sha
  try {
    sha = gitOutput(['log', '-1', '--format=%H', '--', DEFAULT_BASELINE])
  } catch {
    return null
  }
  if (sha.length === 0) return null
  return baselineAtRef(sha)
}

function readJsonPath(filePath, label) {
  const resolved = isAbsolute(filePath) ? filePath : abs(filePath)
  if (!existsSync(resolved)) {
    fail(`${label}: ${resolved} does not exist`)
    return null
  }
  try {
    return readJsonFile(resolved)
  } catch (error) {
    fail(`${label}: ${resolved} is not valid JSON: ${error.message}`)
    return null
  }
}

function collectAnchors(options, previousTag) {
  if (options.previousBaseline !== null) {
    const baseline = readJsonPath(options.previousBaseline, 'previous baseline')
    return baseline === null ? [] : [{ label: options.previousBaseline, baseline }]
  }
  const anchors = []
  const seen = new Set()
  const add = (label, baseline) => {
    if (baseline === null || baseline.floors === undefined) return
    const key = JSON.stringify(baseline.floors)
    if (seen.has(key)) return
    seen.add(key)
    anchors.push({ label, baseline })
  }
  add('previous committed baseline', previousCommittedBaseline())
  if (previousTag !== null) add(`baseline at ${previousTag.tag}`, baselineAtRef(previousTag.sha))
  if (options.previousTag !== null) {
    const baseline = baselineAtRef(options.previousTag)
    if (baseline === null) fail(`previous-tag: cannot read ${DEFAULT_BASELINE} at ${options.previousTag}`)
    else add(`baseline at ${options.previousTag}`, baseline)
  }
  return anchors
}

function parseFloorLedger(baseline) {
  const entries = Array.isArray(baseline.floorLedger) ? baseline.floorLedger : []
  const ledger = []
  for (const entry of entries) {
    const valid =
      typeof entry === 'object' &&
      entry !== null &&
      typeof entry.metric === 'string' &&
      entry.metric.length > 0 &&
      typeof entry.from === 'number' &&
      typeof entry.to === 'number' &&
      typeof entry.reason === 'string' &&
      entry.reason.trim().length > 0
    if (!valid) {
      fail(`floorLedger entry malformed: ${JSON.stringify(entry)}`)
      continue
    }
    ledger.push(entry)
  }
  return ledger
}

function hasLedgerEntry(ledger, metric, from, to) {
  return ledger.some((entry) => entry.metric === metric && entry.from === from && entry.to === to)
}

function compareFloor(ledger, label, metric, oldValue, currentValue, direction) {
  if (typeof oldValue !== 'number' || typeof currentValue !== 'number') return false
  const tightened = direction === 'up' ? currentValue >= oldValue : currentValue <= oldValue
  if (tightened) {
    ok(`floor ratchet ${label}: ${metric} ${oldValue} -> ${currentValue} (tightened or unchanged)`)
    return true
  }
  if (!hasLedgerEntry(ledger, metric, oldValue, currentValue)) {
    fail(`floor ratchet ${label}: ${metric} ${oldValue} -> ${currentValue} needs a matching floorLedger entry`)
    return true
  }
  ok(`floor ratchet ${label}: ${metric} ${oldValue} -> ${currentValue} documented by floorLedger`)
  return true
}

function checkFloorRatchet(baseline, anchors) {
  const ledger = parseFloorLedger(baseline)
  let compared = 0
  for (const anchor of anchors) {
    const old = anchor.baseline.floors ?? {}
    for (const metric of METRICS) {
      if (
        compareFloor(
          ledger,
          anchor.label,
          metric,
          old.totals?.[metric],
          baseline.floors?.totals?.[metric],
          'up'
        )
      ) {
        compared += 1
      }
    }
    if (
      compareFloor(
        ledger,
        anchor.label,
        'moduleBranchesMin',
        old.moduleBranchesMin,
        baseline.floors?.moduleBranchesMin,
        'up'
      )
    ) {
      compared += 1
    }
    if (
      compareFloor(
        ledger,
        anchor.label,
        'ignoreDirectivesMax',
        old.ignoreDirectivesMax,
        baseline.floors?.ignoreDirectivesMax,
        'down'
      )
    ) {
      compared += 1
    }
  }
  if (compared === 0) ok('floor ratchet: first landing (no historical floors anchor)')
}

function finish(startedAt) {
  for (const line of report) console.log(`ok   ${line}`)
  for (const failure of failures) console.error(`FAIL ${failure}`)
  if (failures.length > 0) process.exit(1)
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(2)
  console.log(`coverage gate passed in ${elapsed}s`)
}

function main() {
  const startedAt = Date.now()
  const options = parseArgs(process.argv.slice(2))
  const summary = readFreshSummary(options)
  if (summary === null) {
    finish(startedAt)
    return
  }
  const baseline = readBaseline(options.baseline)
  if (baseline === null) {
    finish(startedAt)
    return
  }

  checkScope(options, baseline)
  checkTotals(summary, baseline)
  const entries = moduleEntries(summary)
  checkModuleSet(entries, baseline)
  const exempt = checkExemptModules(entries, baseline)
  checkModuleBranches(entries, baseline, exempt)
  checkIgnoreDirectives(baseline)

  const previousTag = previousReleaseTag()
  checkBaselineFreshness(baseline)
  checkFloorRatchet(baseline, collectAnchors(options, previousTag))

  finish(startedAt)
}

main()
