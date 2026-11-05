import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { evaluateModuleCoverage, zeroStatementVerdict } from './coverage-gate.mjs'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const GATE = join(ROOT, 'scripts/coverage-gate.mjs')
const BASELINE_PATH = join(ROOT, '.munk/baseline/coverage.json')
const realBaselineBytes = readFileSync(BASELINE_PATH)
const baseline = JSON.parse(realBaselineBytes.toString('utf8'))
const HEAD = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
const dirs = []

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function baselineAtHead(extraModules = {}) {
  const copy = clone(baseline)
  copy.measuredAt = { ...copy.measuredAt, commit: HEAD }
  Object.assign(copy.modules, clone(extraModules))
  return copy
}

function zeroStatementsEntry(pct = 0) {
  const metric = { pct, covered: 0, total: 0 }
  return { lines: { ...metric }, branches: { ...metric }, functions: { ...metric }, statements: { ...metric } }
}

function summaryFor({ extra = {}, overrides = {}, omit = [] } = {}) {
  const summary = {
    total: {
      lines: { pct: 100, covered: 1, total: 1 },
      branches: { pct: 100, covered: 1, total: 1 },
      functions: { pct: 100, covered: 1, total: 1 },
      statements: { pct: 100, covered: 1, total: 1 }
    }
  }
  for (const [name, entry] of Object.entries(baseline.modules)) {
    if (!omit.includes(name)) summary[name] = clone(entry)
  }
  Object.assign(summary, clone(extra))
  for (const [name, entry] of Object.entries(overrides)) summary[name] = clone(entry)
  return summary
}

function runGate({ summary, baselineData = baselineAtHead(), previousBaseline = baselineAtHead() }) {
  const dir = mkdtempSync(join(tmpdir(), 'coverage-gate-zero-statement-'))
  dirs.push(dir)
  const summaryPath = join(dir, 'coverage-summary.json')
  const baselinePath = join(dir, 'baseline.json')
  const previousPath = join(dir, 'previous-baseline.json')
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`)
  writeFileSync(baselinePath, `${JSON.stringify(baselineData, null, 2)}\n`)
  writeFileSync(previousPath, `${JSON.stringify(previousBaseline, null, 2)}\n`)
  const startedAt = Math.floor(Date.now() / 1000) - 5
  const args = [
    GATE,
    '--summary',
    summaryPath,
    '--started-at',
    String(startedAt),
    '--include',
    baseline.scope.include
  ]
  for (const exclude of baseline.scope.exclude) args.push('--exclude', exclude)
  args.push('--baseline', baselinePath, '--previous-baseline', previousPath)
  const result = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' })
  const stdout = result.stdout ?? ''
  const stderr = result.stderr ?? ''
  return { status: result.status, stdout, stderr, all: `${stdout}${stderr}` }
}

function exemptionLines(result) {
  return result.stdout.split('\n').filter((line) => line.includes('exempt module ') && line.includes('0 executable statements'))
}

const BARREL = 'src/core/syntax/index.ts'

describe('zero-statement module exemption', () => {
  it('exempts an extra empty barrel from set equality and audits it once', () => {
    const result = runGate({ summary: summaryFor({ extra: { [BARREL]: zeroStatementsEntry() } }) })

    expect(result.status).toBe(0)
    expect(result.stderr.trim()).toBe('')
    const lines = exemptionLines(result)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toBe(`ok   exempt module ${BARREL}: 0 executable statements`)
    expect(result.stdout).not.toContain('module set: unexpected modules')
  })

  it('does not report a zero-statement module in the branch floor or the minimum line', () => {
    const result = runGate({ summary: summaryFor({ extra: { [BARREL]: zeroStatementsEntry() } }) })

    expect(result.status).toBe(0)
    expect(result.stderr).not.toContain('module branches:')
    const minLine = result.stdout.split('\n').find((line) => line.includes('module branches min:'))
    expect(minLine).toBeDefined()
    expect(minLine).not.toContain(BARREL)
  })

  it('exempts a baseline-only empty barrel that is missing from the fresh summary', () => {
    const result = runGate({
      summary: summaryFor(),
      baselineData: baselineAtHead({ [BARREL]: zeroStatementsEntry() })
    })

    expect(result.status).toBe(0)
    expect(result.stderr.trim()).toBe('')
    expect(exemptionLines(result)).toEqual([`ok   exempt module ${BARREL}: 0 executable statements`])
    expect(result.stdout).not.toContain('module set: missing from fresh summary')
  })

  it('keeps a real zero-coverage module red and never exempts it', () => {
    const zeroed = { ...clone(baseline.modules['src/core/io.ts']), branches: { pct: 0, covered: 0, total: 4 } }
    const result = runGate({ summary: summaryFor({ overrides: { 'src/core/io.ts': zeroed } }) })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('module branches: src/core/io.ts 0% < 75%')
    expect(exemptionLines(result)).toEqual([])
    expect(result.all).not.toContain('exempt module src/core/io.ts')
  })

  it('audits every auto-detected exemption exactly once and nothing else', () => {
    const second = 'src/core/syntax/empty-barrel.ts'
    const result = runGate({
      summary: summaryFor({
        extra: { [BARREL]: zeroStatementsEntry(), [second]: zeroStatementsEntry() }
      })
    })

    expect(result.status).toBe(0)
    const lines = exemptionLines(result)
    expect(lines).toHaveLength(2)
    expect(lines).toContain(`ok   exempt module ${BARREL}: 0 executable statements`)
    expect(lines).toContain(`ok   exempt module ${second}: 0 executable statements`)
    expect(lines.filter((line) => line.includes('exempt module src/core/io.ts'))).toEqual([])
  })
})

describe('evaluateModuleCoverage / zeroStatementVerdict', () => {
  const zero = zeroStatementsEntry()

  it('accepts all-zero totals on either side of the module set', () => {
    const baselineData = { modules: { [BARREL]: zero, 'src/core/a.ts': zero }, floors: { moduleBranchesMin: 75 } }
    const entries = new Map([['src/core/a.ts', zero]])

    const { problems, messages } = evaluateModuleCoverage(entries, baselineData, new Set())

    expect(problems).toEqual([])
    expect(messages).toContain(`exempt module ${BARREL}: 0 executable statements`)
  })

  it('fails closed on missing, negative or non-integer totals instead of exempting', () => {
    expect(zeroStatementVerdict({ ...zero, statements: { pct: 0, covered: 0 } })).toMatchObject({
      exempt: false
    })
    expect(zeroStatementVerdict({ ...zero, branches: { pct: 0, covered: 0, total: -1 } })).toMatchObject({
      exempt: false
    })
    expect(zeroStatementVerdict({ ...zero, lines: { pct: 0, covered: 0, total: 1.5 } })).toMatchObject({
      exempt: false
    })
    expect(zeroStatementVerdict(zero)).toEqual({ exempt: true, problem: null })

    const baselineData = { modules: { 'src/core/a.ts': zero }, floors: { moduleBranchesMin: 75 } }
    const malformed = { ...zero, functions: { pct: 0, covered: 0 } }
    const { problems, messages } = evaluateModuleCoverage(
      new Map([['src/core/a.ts', malformed]]),
      baselineData,
      new Set()
    )
    expect(problems).toContain(
      'module src/core/a.ts: functions.total must be a non-negative integer, got undefined'
    )
    expect(messages).not.toContain('exempt module src/core/a.ts: 0 executable statements')
  })

  it('still fails strict set equality and the branch floor for non-zero modules', () => {
    const live = {
      lines: { pct: 10, covered: 1, total: 10 },
      branches: { pct: 0, covered: 0, total: 4 },
      functions: { pct: 100, covered: 1, total: 1 },
      statements: { pct: 10, covered: 1, total: 10 }
    }
    const baselineData = { modules: { 'src/core/a.ts': live }, floors: { moduleBranchesMin: 75 } }

    const { problems } = evaluateModuleCoverage(new Map([['src/core/b.ts', live]]), baselineData, new Set())

    expect(problems).toContain('module set: missing from fresh summary: src/core/a.ts')
    expect(problems).toContain('module set: unexpected modules in fresh summary: src/core/b.ts')
    expect(problems).toContain('module branches: src/core/b.ts 0% < 75%')
  })
})

describe('unchanged floors, scope and release-only posture', () => {
  it('keeps the baseline floors, scope literals and fixed exemption list untouched', () => {
    expect(baseline.floors.totals).toEqual({ lines: 97, branches: 90, functions: 99 })
    expect(baseline.floors.moduleBranchesMin).toBe(75)
    expect(baseline.floors.ignoreDirectivesMax).toBe(0)
    expect(baseline.floors.moduleBranchesMinExempt).toEqual([
      'src/core/directory/hash.ts',
      'src/core/text/lines.ts'
    ])
    expect(baseline.scope.include).toBe('src/core/**')
    expect(baseline.scope.exclude).toEqual(['**/*.test.ts', '**/*.test.tsx', '**/__fixtures__/**'])
  })

  it('keeps the coverage gate out of the delivery matrix and the test-debt gate', () => {
    const gates = JSON.parse(readFileSync(join(ROOT, '.munk/code-gates.json'), 'utf8'))
    const commands = (gates.gates ?? []).map((gate) => String(gate.command ?? ''))
    expect(commands.some((command) => command.includes('coverage-gate'))).toBe(false)
    expect((gates.gates ?? []).some((gate) => gate.id === 'test')).toBe(true)
    expect(readFileSync(join(ROOT, 'scripts/test-debt-gate.mjs'), 'utf8')).not.toContain('coverage-gate')
  })

  it('is executed by the default pnpm test collection', () => {
    expect(readFileSync(join(ROOT, 'vitest.config.mts'), 'utf8')).toContain('scripts/**/*.test.mjs')
  })

  it('keeps zero v8 / c8 ignore directives under src/core', () => {
    const files = []
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const child = join(dir, entry.name)
        if (entry.isDirectory()) walk(child)
        else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(child)
      }
    }
    walk(join(ROOT, 'src/core'))
    const directives = files.reduce(
      (count, file) => count + (readFileSync(file, 'utf8').match(/(v8|c8)\s+ignore/g) ?? []).length,
      0
    )
    expect(directives).toBe(0)
  })

  it('still fails a lowered floor without a floorLedger entry and a stale baseline', () => {
    const lowered = baselineAtHead()
    lowered.floors.totals.lines -= 1
    const floorResult = runGate({ summary: summaryFor(), baselineData: lowered })
    expect(floorResult.status).not.toBe(0)
    expect(floorResult.stderr).toContain('needs a matching floorLedger entry')

    const stale = baselineAtHead()
    stale.measuredAt.commit = '0'.repeat(40)
    const staleResult = runGate({ summary: summaryFor(), baselineData: stale })
    expect(staleResult.status).not.toBe(0)
    expect(staleResult.stderr).toContain('baseline stale')
  })

  it('never writes the real baseline', () => {
    expect(readFileSync(BASELINE_PATH).equals(realBaselineBytes)).toBe(true)
  })
})
