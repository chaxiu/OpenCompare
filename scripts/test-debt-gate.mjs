#!/usr/bin/env node
/**
 * Test-debt regression gate: one read-only ratchet over the finished
 * Q3/Q4/Q5 test-debt work, so a whole-file rewrite, a truth literal or a
 * weakened assertion turns red instead of passing silently.
 *
 * - ceilings (lines) may only go down, floors (collected cases) only up;
 *   every number comes from `.munk/baseline/test-debt.json` (the script keeps
 *   no copy of them), and the committed baseline itself may only tighten.
 * - case counts come from `vitest list --json` (collection only, no run).
 * - zero-tolerance literals: the current `package.json#version` and any
 *   64-char lowercase hex sha256 outside the standard-vector whitelist.
 * - `docs/**` / `*.yml` content is never read; only `docs/**` code files
 *   (`.ts` / `.tsx`) join the literal scan. The only doc-related check is a
 *   regression scan for whole-sentence assertions in test files.
 * - the clear-debt harness gets a fixed 400-line per-file / 400-line total
 *   budget; the file list lives in the baseline.
 *
 * Read-only, deterministic, no network, no temp files. Single run budget
 * well under 20 s.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const BASELINE_PATH = '.munk/baseline/test-debt.json'
const APP_TEST = 'src/renderer/src/App.test.tsx'
const SYNC_TEST = 'src/sync-real-gate.test.ts'
const TEST_ROOT = 'src'
const LITERAL_ROOTS = ['src', 'scripts', 'docs']
const HARNESS_PER_FILE_MAX_LINES = 400
const HARNESS_TOTAL_MAX_LINES = 400
/** A declared growth entry may add at most this many lines, from the previous baseline. */
const GROWTH_MAX_LINES = 400
const SKIP_DIRS = new Set(['node_modules', 'dist', 'out', 'coverage', '.git'])

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

/** `wc -l` semantics: number of newline characters. */
function lineCount(relPath) {
  const text = readFileSync(abs(relPath), 'utf8')
  let count = 0
  for (const char of text) {
    if (char === '\n') count += 1
  }
  return count
}

function walkFiles(dir, matches, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walkFiles(join(dir, entry.name), matches, out)
      continue
    }
    if (matches(entry.name)) out.push(join(dir, entry.name))
  }
  return out
}

function isTestFileName(name) {
  return name.endsWith('.test.ts') || name.endsWith('.test.tsx')
}

function isCodeFileName(name) {
  return name.endsWith('.ts') || name.endsWith('.tsx')
}

function readJson(relPath) {
  return JSON.parse(readFileSync(abs(relPath), 'utf8'))
}

function readBaseline() {
  if (!existsSync(abs(BASELINE_PATH))) {
    fail(`baseline missing: ${BASELINE_PATH}`)
    return null
  }
  let baseline
  try {
    baseline = readJson(BASELINE_PATH)
  } catch (error) {
    fail(`baseline is not valid JSON: ${BASELINE_PATH}: ${error.message}`)
    return null
  }
  if (baseline?.version !== 1) fail(`baseline version must be 1, got ${baseline?.version}`)
  return baseline
}

function requirePositiveIntegers(baseline, fields, group) {
  for (const field of fields) {
    const value = baseline[group]?.[field]
    if (!Number.isInteger(value) || value <= 0) {
      fail(`baseline ${group}.${field} must be a positive integer, got ${value}`)
    }
  }
}

/** `vitest list --json` is collection only: no test body runs. */
function collectTestCases() {
  const vitest = abs('node_modules/vitest/vitest.mjs')
  if (!existsSync(vitest)) {
    fail('test case collection needs vitest: node_modules/vitest is missing (run pnpm install)')
    return null
  }
  let stdout
  try {
    stdout = execFileSync(process.execPath, [vitest, 'list', '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore']
    })
  } catch (error) {
    fail(`vitest list --json failed: ${error.message}`)
    return null
  }
  let entries
  try {
    entries = JSON.parse(stdout)
  } catch (error) {
    fail(`vitest list --json did not return JSON: ${error.message}`)
    return null
  }
  if (!Array.isArray(entries)) {
    fail('vitest list --json did not return a test array')
    return null
  }
  const perFile = new Map()
  for (const entry of entries) {
    const file = resolve(entry.file)
    perFile.set(file, (perFile.get(file) ?? 0) + 1)
  }
  return { total: entries.length, perFile, files: perFile.size }
}

function measureCases(collected) {
  const casesOf = (relPath) => collected?.perFile.get(abs(relPath)) ?? 0
  return {
    appTestCases: casesOf(APP_TEST),
    syncRealGateCases: casesOf(SYNC_TEST),
    repoTestCases: collected?.total ?? 0
  }
}

function measureLines() {
  const repoTestFiles = walkFiles(abs(TEST_ROOT), isTestFileName)
  let repoTestLines = 0
  for (const file of repoTestFiles) {
    repoTestLines += lineCount(relative(ROOT, file))
  }
  const appTestLines = lineCount(APP_TEST)
  const syncRealGateLines = lineCount(SYNC_TEST)
  return {
    appTestLines,
    syncRealGateLines,
    pairLines: appTestLines + syncRealGateLines,
    repoTestLines
  }
}

function checkCeilings(baseline, measured) {
  for (const [metric, current] of Object.entries(measured)) {
    const ceiling = baseline.ceilings?.[metric]
    if (!Number.isInteger(ceiling)) {
      fail(`ceiling ${metric}: baseline value missing`)
      continue
    }
    if (current > ceiling) {
      fail(`ceiling ${metric}: measured ${current} > ceiling ${ceiling} (test debt grew)`)
    } else {
      ok(`ceiling ${metric}: measured ${current} <= ceiling ${ceiling}`)
    }
  }
}

function checkFloors(baseline, measured) {
  for (const [metric, current] of Object.entries(measured)) {
    const floor = baseline.floors?.[metric]
    if (!Number.isInteger(floor)) {
      fail(`floor ${metric}: baseline value missing`)
      continue
    }
    if (current < floor) {
      fail(`floor ${metric}: measured ${current} < floor ${floor} (cases were deleted)`)
    } else {
      ok(`floor ${metric}: measured ${current} >= floor ${floor}`)
    }
  }
}

function printCaseCollection(collected, measured) {
  if (!collected) return
  ok(`collected ${APP_TEST}: ${measured.appTestCases} cases`)
  ok(`collected ${SYNC_TEST}: ${measured.syncRealGateCases} cases`)
  ok(`collected repo total: ${measured.repoTestCases} cases across ${collected.files} files`)
}

function checkHarness(baseline) {
  const harness = baseline.harness ?? {}
  if (harness.perFileMaxLines !== HARNESS_PER_FILE_MAX_LINES) {
    fail(
      `harness perFileMaxLines: baseline says ${harness.perFileMaxLines}, fixed budget is ${HARNESS_PER_FILE_MAX_LINES}`
    )
  }
  if (harness.totalMaxLines !== HARNESS_TOTAL_MAX_LINES) {
    fail(
      `harness totalMaxLines: baseline says ${harness.totalMaxLines}, fixed budget is ${HARNESS_TOTAL_MAX_LINES}`
    )
  }
  const files = Array.isArray(harness.files) ? harness.files : []
  let total = 0
  for (const relPath of files) {
    if (typeof relPath !== 'string' || relPath.length === 0) {
      fail(`harness file entry must be a non-empty path: ${JSON.stringify(relPath)}`)
      continue
    }
    if (!existsSync(abs(relPath))) {
      fail(`harness file ${relPath}: does not exist`)
      continue
    }
    const lines = lineCount(relPath)
    total += lines
    if (lines > HARNESS_PER_FILE_MAX_LINES) {
      fail(
        `harness file ${relPath}: ${lines} lines > per-file budget ${HARNESS_PER_FILE_MAX_LINES}`
      )
    }
  }
  if (total > HARNESS_TOTAL_MAX_LINES) {
    fail(`harness total: ${total} lines > total budget ${HARNESS_TOTAL_MAX_LINES}`)
  }
  ok(`harness budget: ${files.length} file(s), ${total}/${HARNESS_TOTAL_MAX_LINES} total lines`)
}

function codeFiles() {
  const files = []
  for (const root of LITERAL_ROOTS) {
    if (!existsSync(abs(root))) continue
    files.push(...walkFiles(abs(root), isCodeFileName))
  }
  return files.sort()
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Current release version, derived at run time, in plain and `v`-prefixed form. */
function checkVersionLiteral() {
  const version = readJson('package.json').version
  if (typeof version !== 'string' || version.length === 0) {
    fail('package.json version is missing')
    return
  }
  const pattern = new RegExp(`(?<![0-9A-Za-z.])v?${escapeRegExp(version)}(?![0-9A-Za-z])`)
  let hits = 0
  for (const file of codeFiles()) {
    const relPath = relative(ROOT, file)
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, index) => {
      if (!pattern.test(line)) return
      hits += 1
      fail(`version literal ${relPath}:${index + 1}: ${line.trim().slice(0, 160)}`)
    })
  }
  if (hits === 0) ok(`version literal (${version}): 0 hits in .ts/.tsx`)
}

/** 64-char lowercase hex literals outside the two standard-vector hashes. */
function checkAssetShaLiteral(baseline) {
  const whitelist = new Set(
    (baseline.literalWhitelist?.sha256 ?? []).map((value) => String(value).toLowerCase())
  )
  const sha = /(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])/g
  let hits = 0
  let whitelisted = 0
  for (const file of codeFiles()) {
    const relPath = relative(ROOT, file)
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, index) => {
      for (const match of line.matchAll(sha)) {
        hits += 1
        if (whitelist.has(match[0])) {
          whitelisted += 1
          continue
        }
        fail(`asset sha256 literal ${relPath}:${index + 1}: ${match[0]}`)
      }
    })
  }
  ok(`asset sha256 literals: ${hits} hit(s), ${whitelisted} standard vector(s) whitelisted`)
}

const CHINESE_PUNCTUATION = /[，。；：、]/
const DIRECT_STRING_ARGUMENT = /\.(?:toContain|includes)\(\s*(['"`])([^'"`\n]*)\1/g

function englishWordCount(text) {
  return text
    .trim()
    .split(/\s+/)
    .filter((token) => /[A-Za-z]/.test(token)).length
}

/**
 * Doc-reading test files must assert parsed structure, never a whole sentence.
 * Only files that already name a `docs/` or `.yml` path are scanned.
 */
function checkDocAssertions() {
  const testFiles = [
    ...walkFiles(abs(TEST_ROOT), isTestFileName),
    ...walkFiles(abs('scripts'), isTestFileName)
  ]
  let scanned = 0
  let hits = 0
  for (const file of testFiles) {
    const relPath = relative(ROOT, file)
    const source = readFileSync(file, 'utf8')
    if (!/['"`][^'"`\n]*(?:docs\/|\.yml(?![\w]))/.test(source)) continue
    scanned += 1
    source.split('\n').forEach((line, index) => {
      for (const match of line.matchAll(DIRECT_STRING_ARGUMENT)) {
        const text = match[2]
        if (CHINESE_PUNCTUATION.test(text) || englishWordCount(text) >= 8) {
          hits += 1
          fail(
            `whole-sentence assertion ${relPath}:${index + 1}: ${match[0].trim().slice(0, 160)}`
          )
        }
      }
    })
  }
  if (hits === 0) {
    ok(`doc-reading assertions: ${scanned} test file(s) named docs/.yml, 0 whole-sentence hits`)
  }
}

/** The last committed version of the baseline file, or `null` on first landing. */
function previousBaseline() {
  let sha
  try {
    sha = execFileSync('git', ['log', '-1', '--format=%H', '--', BASELINE_PATH], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
  } catch {
    return null
  }
  if (sha.length === 0) return null
  try {
    return JSON.parse(
      execFileSync('git', ['show', `${sha}:${BASELINE_PATH}`], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      })
    )
  } catch {
    return null
  }
}

/**
 * Parses the baseline `growth` declarations. A declaration is the only way a
 * ceiling may rise above the **previous committed** value, and it must state
 * where the rise starts, where it ends, why, and how many cases it added.
 */
function parseGrowth(baseline) {
  const entries = Array.isArray(baseline.growth) ? baseline.growth : []
  const byMetric = new Map()
  for (const entry of entries) {
    const valid =
      typeof entry === 'object' &&
      entry !== null &&
      typeof entry.metric === 'string' &&
      entry.metric.length > 0 &&
      Number.isInteger(entry.from) &&
      Number.isInteger(entry.to) &&
      typeof entry.reason === 'string' &&
      entry.reason.trim().length > 0 &&
      Number.isInteger(entry.addedCases) &&
      entry.addedCases > 0
    if (!valid) {
      fail(`growth entry malformed: ${JSON.stringify(entry)}`)
      continue
    }
    if (byMetric.has(entry.metric)) {
      fail(`growth entry duplicated: ${entry.metric}`)
      continue
    }
    byMetric.set(entry.metric, entry)
  }
  return byMetric
}

/**
 * The baseline is a ratchet against the **previous committed** version:
 * ceilings only go down, floors only go up. A ceiling that rises needs a
 * matching `growth` entry bounded by {@link GROWTH_MAX_LINES}, and every
 * allowed rise is printed so it can never pass silently.
 */
function checkBaselineTightenOnly(baseline) {
  const previous = previousBaseline()
  if (previous === null) {
    ok('baseline tighten-only: first landing (no committed history yet)')
    return
  }
  const growth = parseGrowth(baseline)

  for (const [metric, ceiling] of Object.entries(baseline.ceilings ?? {})) {
    const anchor = previous.ceilings?.[metric]
    if (!Number.isInteger(anchor)) continue
    if (ceiling <= anchor) {
      ok(`baseline ceiling ${metric}: ${anchor} -> ${ceiling} (tightened or unchanged)`)
      continue
    }
    const entry = growth.get(metric)
    if (entry === undefined) {
      fail(
        `baseline only tighten: ceiling ${metric} raised to ${ceiling}, previous committed value ${anchor}`
      )
      continue
    }
    if (entry.from !== anchor) {
      fail(`growth ${metric}: from ${entry.from} must equal previous committed ceiling ${anchor}`)
    } else if (entry.to !== ceiling) {
      fail(`growth ${metric}: to ${entry.to} must equal the new ceiling ${ceiling}`)
    } else if (entry.to - entry.from > GROWTH_MAX_LINES) {
      fail(
        `growth ${metric}: +${entry.to - entry.from} lines exceeds the ${GROWTH_MAX_LINES}-line allowance`
      )
    } else {
      ok(
        `ALLOWED growth: ${metric} ${entry.from}->${entry.to} (+${entry.to - entry.from} lines, +${entry.addedCases} cases, ${entry.reason})`
      )
    }
  }

  for (const metric of growth.keys()) {
    if (!(metric in (baseline.ceilings ?? {}))) {
      fail(`growth entry ${metric}: no matching ceiling`)
    }
  }

  for (const [metric, floor] of Object.entries(baseline.floors ?? {})) {
    const anchor = previous.floors?.[metric]
    if (!Number.isInteger(anchor)) continue
    if (floor < anchor) {
      fail(`baseline only tighten: floor ${metric} lowered to ${floor}, previous committed value ${anchor}`)
    } else {
      ok(`baseline floor ${metric}: ${anchor} -> ${floor} (raised or unchanged)`)
    }
  }
}

function main() {
  const startedAt = Date.now()
  const baseline = readBaseline()
  if (!baseline) {
    printFailures()
    process.exit(1)
  }
  requirePositiveIntegers(baseline, ['appTestLines', 'syncRealGateLines', 'pairLines', 'repoTestLines'], 'ceilings')
  requirePositiveIntegers(baseline, ['appTestCases', 'syncRealGateCases', 'repoTestCases'], 'floors')

  const measuredLines = measureLines()
  const collected = collectTestCases()
  const measuredCases = measureCases(collected)

  checkCeilings(baseline, measuredLines)
  checkFloors(baseline, measuredCases)
  printCaseCollection(collected, measuredCases)
  checkHarness(baseline)
  checkVersionLiteral()
  checkAssetShaLiteral(baseline)
  checkDocAssertions()
  checkBaselineTightenOnly(baseline)

  for (const line of report) console.log(`ok   ${line}`)
  printFailures()
  if (failures.length > 0) process.exit(1)
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(2)
  console.log(`test-debt gate passed in ${elapsed}s`)
}

function printFailures() {
  for (const failure of failures) console.error(`FAIL ${failure}`)
}

main()
