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
 *   node scripts/spike-process-tree-soak.mjs           # 100 rounds
 *   node scripts/spike-process-tree-soak.mjs --rounds=50
 */
import { spawn } from 'node:child_process'

const DEFAULT_ROUNDS = 100
const TEST_FILE = 'src/spike-process-tree-gate.test.ts'
const TEST_FILTER = 'process-exited contract'
const ROUND_TIMEOUT_MS = 120_000

const parseRounds = (argv) => {
  const flag = argv.find((arg) => arg.startsWith('--rounds='))
  const raw = flag === undefined ? process.env.SPIKE_SOAK_ROUNDS ?? String(DEFAULT_ROUNDS) : flag.slice('--rounds='.length)
  const rounds = Number(raw)
  if (!Number.isInteger(rounds) || rounds <= 0) {
    throw new Error(`--rounds 必须是正整数，收到: ${raw}`)
  }
  return rounds
}

const runRound = () =>
  new Promise((resolve) => {
    const startedAt = Date.now()
    const child = spawn('pnpm', ['exec', 'vitest', 'run', TEST_FILE, '-t', TEST_FILTER], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: '1' }
    })
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

/** A green exit is not enough: the filter must have run exactly the one case. */
const ranTheCase = (output) => /Tests\s+1 passed/.test(output)

const main = async () => {
  const rounds = parseRounds(process.argv.slice(2))
  const startedAt = Date.now()
  console.log(`spike-process-tree soak: ${rounds} rounds of "${TEST_FILTER}" in ${TEST_FILE}`)
  for (let round = 1; round <= rounds; round += 1) {
    const result = await runRound()
    if (result.code !== 0 || !ranTheCase(result.output)) {
      console.error(`round ${round}/${rounds} FAILED (exit=${result.code}) in ${result.elapsedMs}ms`)
      if (result.code === 0) console.error(`round ${round}/${rounds} ran no matching case (filter "${TEST_FILTER}")`)
      console.error(result.output)
      process.exitCode = 1
      return
    }
    console.log(`round ${round}/${rounds} passed in ${result.elapsedMs}ms`)
  }
  const totalMs = Date.now() - startedAt
  console.log(`${rounds}/${rounds} passed (total ${(totalMs / 1000).toFixed(2)}s)`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
