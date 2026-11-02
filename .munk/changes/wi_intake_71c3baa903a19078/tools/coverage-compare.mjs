#!/usr/bin/env node
/* global console, process */
/**
 * Same-scope coverage comparator for the Q5 cold-run evidence.
 *
 * Reads `<root>/coverage/coverage-final.json` from two independent worktrees
 * (baseline 97a18f3 and current 120f06d), rebuilds the v8/istanbul counters the
 * provider emits, and prints:
 *   - whole-repo statements / branches / functions / lines per side,
 *   - the same four metrics restricted to files present on both sides,
 *   - the same four metrics with `src/test/**` (test-support files) removed,
 *   - the four metrics of the two modules named in the PRD,
 *   - the file set that exists on only one side.
 *
 * Read-only: it never writes a file.
 *
 * Usage:
 *   node .munk/changes/wi_intake_71c3baa903a19078/tools/coverage-compare.mjs \
 *     --baseline=/path/to/97a18f3 --current=/path/to/120f06d [--json]
 */
import fs from 'node:fs'
import path from 'node:path'

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, ...rest] = arg.replace(/^--/, '').split('=')
    return [k, rest.join('=') || 'true']
  }),
)
const BASELINE_ROOT = args.get('baseline')
const CURRENT_ROOT = args.get('current')
const AS_JSON = args.get('json') === 'true'
if (!BASELINE_ROOT || !CURRENT_ROOT) {
  console.error('usage: coverage-compare.mjs --baseline=<root> --current=<root> [--json]')
  process.exit(2)
}

function load(root) {
  const realRoot = fs.realpathSync(root)
  const file = path.join(realRoot, 'coverage/coverage-final.json')
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  const files = new Map()
  for (const [abs, entry] of Object.entries(data)) {
    const realAbs = fs.existsSync(abs) ? fs.realpathSync(abs) : abs
    const rel = realAbs.startsWith(realRoot) ? path.relative(realRoot, realAbs) : realAbs
    files.set(rel.split(path.sep).join('/'), entry)
  }
  return { file, files }
}

function summarize(entries) {
  const total = { statements: 0, coveredStatements: 0, branches: 0, coveredBranches: 0, functions: 0, coveredFunctions: 0 }
  const lines = new Map()
  for (const [file, entry] of entries) {
    for (const [key, count] of Object.entries(entry.s)) {
      total.statements += 1
      if (count > 0) total.coveredStatements += 1
      const line = entry.statementMap[key]?.start?.line
      if (line !== undefined) {
        const lineKey = `${file}#${line}`
        const prev = lines.get(lineKey)
        if (prev === undefined || prev < count) lines.set(lineKey, count)
      }
    }
    for (const counts of Object.values(entry.b)) {
      for (const count of counts) {
        total.branches += 1
        if (count > 0) total.coveredBranches += 1
      }
    }
    for (const count of Object.values(entry.f)) {
      total.functions += 1
      if (count > 0) total.coveredFunctions += 1
    }
  }
  const lineTotal = lines.size
  const coveredLines = [...lines.values()].filter((count) => count > 0).length
  return {
    statements: pct(total.coveredStatements, total.statements),
    branches: pct(total.coveredBranches, total.branches),
    functions: pct(total.coveredFunctions, total.functions),
    lines: pct(coveredLines, lineTotal),
    raw: {
      statements: `${total.coveredStatements}/${total.statements}`,
      branches: `${total.coveredBranches}/${total.branches}`,
      functions: `${total.coveredFunctions}/${total.functions}`,
      lines: `${coveredLines}/${lineTotal}`,
    },
  }
}

// istanbul-lib-coverage truncates to two decimals (floor), so match the provider.
const pct = (covered, total) => (total === 0 ? 100 : Math.floor((10000 * covered) / total) / 100)

const baseline = load(BASELINE_ROOT)
const current = load(CURRENT_ROOT)
const sharedKeys = [...baseline.files.keys()].filter((key) => current.files.has(key)).sort()
const baselineOnly = [...baseline.files.keys()].filter((key) => !current.files.has(key)).sort()
const currentOnly = [...current.files.keys()].filter((key) => !baseline.files.has(key)).sort()

const pick = (files, keys) => keys.map((key) => [key, files.get(key)])
const withoutTestSupport = (keys) => keys.filter((key) => !key.startsWith('src/test/'))
const MODULES = ['src/renderer/src/App.tsx', 'src/core/directory/sync.ts']

const report = {
  baseline: { root: BASELINE_ROOT, coverageFile: baseline.file },
  current: { root: CURRENT_ROOT, coverageFile: current.file },
  fileCount: { baseline: baseline.files.size, current: current.files.size, shared: sharedKeys.length },
  baselineOnly,
  currentOnly,
  wholeRepo: {
    baseline: summarize(baseline.files),
    current: summarize(current.files),
  },
  sameScope: {
    baseline: summarize(pick(baseline.files, sharedKeys)),
    current: summarize(pick(current.files, sharedKeys)),
  },
  sameScopeWithoutTestSupport: {
    keys: withoutTestSupport(sharedKeys).length,
    baseline: summarize(pick(baseline.files, withoutTestSupport(sharedKeys))),
    current: summarize(pick(current.files, withoutTestSupport(sharedKeys))),
  },
  modules: MODULES.map((module) => ({
    module,
    baseline: baseline.files.has(module) ? summarize([[module, baseline.files.get(module)]]) : null,
    current: current.files.has(module) ? summarize([[module, current.files.get(module)]]) : null,
  })),
}

if (AS_JSON) {
  fs.writeSync(1, `${JSON.stringify(report, null, 2)}\n`)
  process.exit(0)
}

const METRICS = ['statements', 'branches', 'functions', 'lines']
const fmt = (s) => METRICS.map((m) => `${m} ${s[m]}% (${s.raw[m]})`).join(' | ')
const delta = (a, b) => {
  const out = []
  for (const m of METRICS) {
    const d = b[m] - a[m]
    out.push(`${m} ${d >= 0 ? '+' : ''}${d.toFixed(2)}pp`)
  }
  return out.join(' | ')
}

console.log(`# Coverage comparison\n`)
console.log(`- baseline: ${report.baseline.root}`)
console.log(`- current : ${report.current.root}`)
console.log(`- files: baseline ${report.fileCount.baseline}, current ${report.fileCount.current}, shared ${report.fileCount.shared}`)
console.log(`- baseline-only files: ${baselineOnly.length}${baselineOnly.length ? ` -> ${baselineOnly.join(', ')}` : ''}`)
console.log(`- current-only files: ${currentOnly.length}${currentOnly.length ? ` -> ${currentOnly.join(', ')}` : ''}\n`)

console.log('## Whole repo\n')
console.log(`- baseline: ${fmt(report.wholeRepo.baseline)}`)
console.log(`- current : ${fmt(report.wholeRepo.current)}`)
console.log(`- delta   : ${delta(report.wholeRepo.baseline, report.wholeRepo.current)}\n`)

console.log('## Same scope (files present on both sides)\n')
console.log(`- baseline: ${fmt(report.sameScope.baseline)}`)
console.log(`- current : ${fmt(report.sameScope.current)}`)
console.log(`- delta   : ${delta(report.sameScope.baseline, report.sameScope.current)}\n`)

console.log('## Same scope without src/test/**\n')
console.log(`- files: ${report.sameScopeWithoutTestSupport.keys}`)
console.log(`- baseline: ${fmt(report.sameScopeWithoutTestSupport.baseline)}`)
console.log(`- current : ${fmt(report.sameScopeWithoutTestSupport.current)}`)
console.log(`- delta   : ${delta(report.sameScopeWithoutTestSupport.baseline, report.sameScopeWithoutTestSupport.current)}\n`)

console.log('## Named modules\n')
for (const module of report.modules) {
  console.log(`### ${module.module}\n`)
  if (!module.baseline || !module.current) {
    console.log(`- missing on one side: baseline=${Boolean(module.baseline)} current=${Boolean(module.current)}\n`)
    continue
  }
  console.log(`- baseline: ${fmt(module.baseline)}`)
  console.log(`- current : ${fmt(module.current)}`)
  console.log(`- delta   : ${delta(module.baseline, module.current)}\n`)
}
