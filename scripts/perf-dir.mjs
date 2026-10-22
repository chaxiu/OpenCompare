#!/usr/bin/env node
/**
 * `pnpm perf:dir` launcher: builds are handled by the package script, this
 * wrapper only starts the real Electron app in measurement mode with the
 * environment variable the main process requires. All user arguments are
 * forwarded unchanged.
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = ['.', '--perf-harness', ...process.argv.slice(2)]

const result = spawnSync(electronPath, args, {
  cwd: root,
  env: { ...process.env, OPENCOMPARE_PERF: '1' },
  stdio: 'inherit'
})

if (result.error !== undefined && result.error !== null) {
  console.error(`perf: 无法启动 Electron：${result.error.message}`)
  process.exit(1)
}
process.exit(result.status ?? 1)
