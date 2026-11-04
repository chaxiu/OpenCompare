#!/usr/bin/env node
/**
 * Repeat the spike failing-path case on one machine (same runner image in CI)
 * so the `process-exited` -> `exitCode === 0` timing claim is stability
 * evidence, not a single green run.
 *
 * Every round runs the real `spike CLI teardown` failure-path case through
 * vitest: the assertion that is repeated is the gate's own assertion, never a
 * copy. The first red round exits non-zero and prints that round's output.
 *
 * Selection is machine readable, never an ANSI-coloured text summary:
 * `vitest list --json` must resolve the filter to exactly one case before the
 * first round, and each round's `--reporter=json` report must show that case
 * as `passed` with no failed case in the file. A filter that matches 0 (or
 * more than 1) case fails loudly and prints every available case name.
 *
 *   node scripts/spike-process-tree-soak.mjs           # 100 rounds
 *   node scripts/spike-process-tree-soak.mjs --rounds=50
 *   node scripts/spike-process-tree-soak.mjs --filter='reaps the tree'
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_ROUNDS = 100
const TEST_FILE = 'src/spike-process-tree-gate.test.ts'
const DEFAULT_FILTER = 'reaps the tree and keeps the process-exited contract on the failure path'
const CONTRACT_CASE =
  'spike CLI teardown > reaps the tree and keeps the process-exited contract on the failure path'
const ROUND_TIMEOUT_MS = 120_000

const parseOptions = (argv) => {
  const roundsFlag = argv.find((arg) => arg.startsWith('--rounds='))
  const raw =
    roundsFlag === undefined
      ? process.env.SPIKE_SOAK_ROUNDS ?? String(DEFAULT_ROUNDS)
      : roundsFlag.slice('--rounds='.length)
  const rounds = Number(raw)
  if (!Number.isInteger(rounds) || rounds <= 0) {
    throw new Error(`--rounds 必须是正整数，收到: ${raw}`)
  }
  const filterFlag = argv.find((arg) => arg.startsWith('--filter='))
  const filter = filterFlag === undefined ? DEFAULT_FILTER : filterFlag.slice('--filter='.length)
  if (filter.trim().length === 0) {
    throw new Error('--filter 不能为空')
  }
  return { rounds, filter }
}

const listCases = () => {
  const result = spawnSync('pnpm', ['exec', 'vitest', 'list', TEST_FILE, '--json'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, CI: '1' }
  })
  if (result.status !== 0) {
    throw new Error(`vitest list failed (exit=${result.status})\n${result.stdout ?? ''}${result.stderr ?? ''}`)
  }
  let parsed
  try {
    parsed = JSON.parse(result.stdout)
  } catch (error) {
    throw new Error(`vitest list --json is not JSON: ${error.message}\n${result.stdout}`, { cause: error })
  }
  if (!Array.isArray(parsed)) {
    throw new Error('vitest list --json did not return an array')
  }
  return parsed.map((entry) => String(entry?.name ?? '')).filter((name) => name.length > 0)
}

const printCandidates = (filter, names) => {
  console.error(`matched 0 cases for filter "${filter}" in ${TEST_FILE}`)
  console.error(`available cases (${names.length}):`)
  for (const name of names) console.error(`  ${name}`)
}

/** Resolve the filter to exactly one case, or fail with every available name. */
const selectCase = (filter, names) => {
  const matches = names.filter((name) => name.includes(filter))
  if (matches.length === 1) return matches[0]
  if (matches.length === 0) {
    printCandidates(filter, names)
    process.exitCode = 1
    return null
  }
  console.error(`matched ${matches.length} cases for filter "${filter}" in ${TEST_FILE}, expected exactly 1:`)
  for (const name of matches) console.error(`  ${name}`)
  console.error(`available cases (${names.length}):`)
  for (const name of names) console.error(`  ${name}`)
  process.exitCode = 1
  return null
}

const runRound = (title, reportFile) =>
  new Promise((resolve) => {
    const startedAt = Date.now()
    const child = spawn(
      'pnpm',
      ['exec', 'vitest', 'run', TEST_FILE, '-t', title, '--reporter=json', `--outputFile=${reportFile}`],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, CI: '1' }
      }
    )
    let output = ''
    child.stdout?.on('data', (chunk) => {
      output += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      output += String(chunk)
    })
    const timer = setTimeout(() => child.kill('SIGKILL'), ROUND_TIMEOUT_MS)
    child.once('error', (error) => {
      clearTimeout(timer)
      resolve({ code: -1, elapsedMs: Date.now() - startedAt, output: `${output}\nspawn error: ${error.message}` })
    })
    child.once('close', (code, signal) => {
      clearTimeout(timer)
      resolve({ code: code ?? (signal === null ? -1 : -2), elapsedMs: Date.now() - startedAt, output })
    })
  })

/**
 * A green exit is not enough: the JSON report must show the selected case as
 * `passed`, with no failed case standing in for it.
 */
const roundVerdict = (title, reportFile) => {
  let report
  try {
    report = JSON.parse(readFileSync(reportFile, 'utf8'))
  } catch (error) {
    return { ok: false, reason: `round report is missing or not JSON: ${error.message}` }
  }
  const assertions = Array.isArray(report.testResults)
    ? report.testResults.flatMap((file) => (Array.isArray(file?.assertionResults) ? file.assertionResults : []))
    : []
  const failed = assertions.filter((assertion) => assertion?.status === 'failed')
  if (failed.length > 0) {
    return { ok: false, reason: `round has ${failed.length} failed case(s): ${failed.map((a) => a.title).join(', ')}` }
  }
  const matched = assertions.filter((assertion) => assertion?.title === title)
  if (matched.length !== 1) {
    return { ok: false, reason: `round report has ${matched.length} entries for "${title}"` }
  }
  if (matched[0].status !== 'passed') {
    return { ok: false, reason: `selected case status is "${matched[0].status}", expected "passed"` }
  }
  if (Number(report.numPassedTests) !== 1) {
    return { ok: false, reason: `round passed ${report.numPassedTests} case(s), expected exactly 1` }
  }
  return { ok: true }
}

const main = async () => {
  const { rounds, filter } = parseOptions(process.argv.slice(2))
  const names = listCases()
  const selected = selectCase(filter, names)
  if (selected === null) return
  if (selected !== CONTRACT_CASE) {
    console.error(`filter "${filter}" resolved to "${selected}", expected "${CONTRACT_CASE}"`)
    process.exitCode = 1
    return
  }
  const title = selected.split(' > ').pop()
  const startedAt = Date.now()
  console.log(`spike-process-tree soak: ${rounds} rounds of "${filter}" in ${TEST_FILE}`)
  console.log(`selected case: ${selected}`)
  const workDir = mkdtempSync(join(tmpdir(), 'spike-soak-'))
  try {
    for (let round = 1; round <= rounds; round += 1) {
      const reportFile = join(workDir, `round-${round}.json`)
      const result = await runRound(title, reportFile)
      const verdict = result.code === 0 ? roundVerdict(title, reportFile) : { ok: false, reason: `exit=${result.code}` }
      if (!verdict.ok) {
        console.error(`round ${round}/${rounds} FAILED (exit=${result.code}) in ${result.elapsedMs}ms: ${verdict.reason}`)
        console.error(result.output)
        process.exitCode = 1
        return
      }
      console.log(`round ${round}/${rounds} passed in ${result.elapsedMs}ms`)
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
  const totalMs = Date.now() - startedAt
  console.log(`${rounds}/${rounds} passed (total ${(totalMs / 1000).toFixed(2)}s)`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
