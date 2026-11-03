#!/usr/bin/env node
/**
 * Release acceptance driver: one implementation for the local L1 run and the
 * post-release CI verification.
 *
 *   node scripts/verify-release.mjs --tag=v0.2.16 --layer=ci    --out=<dir>
 *   node scripts/verify-release.mjs --tag=v0.2.16 --layer=local --out=<dir>
 *   node scripts/verify-release.mjs --tag=v0.2.16 --layer=ci --platform=mac --out=<dir>
 *   node scripts/verify-release.mjs --tag=v0.2.16 --layer=ci --aggregate=<parts> --out=<dir>
 *   node scripts/verify-release.mjs --tag=v0.2.16 --layer=ci --spike --out=<dir>
 *
 * Two layers, one code path per layer:
 *
 *  - `--layer=ci` (A layer) is read-only verification of the public artifacts:
 *    release metadata + byte count + sha256, the macOS mount / version /
 *    codesign / spctl / stapler legs, the Linux AppImage and deb legs under
 *    xvfb with one synthetic directory comparison, the Windows zip version and
 *    Authenticode legs, the cancel leg with a zero-hit log scan, and the
 *    evidence legs. It never samples memory or heap and never reads the local
 *    6.4 GiB fixture pair. Without `--platform` the expected set is the whole
 *    six-group matrix; a workflow job narrows it with `--platform=<name>`.
 *  - `--layer=local` (B layer) drives the real 6.43 GiB directory pair for
 *    three rounds and judges the retained heap of round 3 against round 2. It
 *    only runs on the maintainer machine; the long three-round run is owned by
 *    the product-qa task, not by CI.
 *
 * Every check writes `<out>/steps/<NN>-<id>.json` plus `<out>/logs/<NN>-<id>.log`
 * and the run ends in a fail-closed `<out>/summary.json`: a missing step, an
 * extra step, a skipped step, a missing evidence file or a missing environment
 * field turns the summary red and the process exits non-zero.
 *
 * Standard library only. The pure judgment functions are exported so
 * `src/verify-release-gate.test.ts` can drive them without network, Electron or
 * the real fixture pair; `main()` only runs when this file is the entry point.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/* ------------------------------------------------------------------ */
/* Registry: the one place the expected check ids live.                */
/* ------------------------------------------------------------------ */

/** Platforms the A layer can verify; `--platform=all` selects every one. */
export const CI_PLATFORMS = ['mac', 'linux', 'windows']

/** Only these three statuses may appear on a step. */
export const STEP_STATUSES = ['pass', 'fail', 'skip']

/** The B layer needs exactly three settled rounds. */
export const LOCAL_ROUND_COUNT = 3

/** Round 3 minus round 2 retained heap must stay at or below 16 MiB. */
export const RETENTION_THRESHOLD_BYTES = 16 * 1024 * 1024

/** Cancellation noise: any hit fails the run, skip is not allowed. */
export const CANCEL_NOISE_PATTERN = /OperationCancelledError|ECANCELED/

/**
 * Spike budgets. Bounded on purpose: a dead Electron must fail in seconds, and
 * a live Electron that never exposes a page target must fail in under a minute.
 */
export const SPIKE_TARGET_POLL_INTERVAL_MS = 500
export const SPIKE_TARGET_TIMEOUT_MS = 60_000
export const SPIKE_APP_SHELL_TIMEOUT_MS = 60_000
export const SPIKE_PROCESS_EXIT_BUDGET_MS = 5_000

/**
 * Teardown budgets, same order of magnitude as the exit budget: after SIGKILL
 * the reap must still resolve instead of waiting forever, and the CLI may only
 * wait this long for stdout/stderr to drain before forcing the exit.
 */
export const SPIKE_PROCESS_KILL_WAIT_MS = 1_000
export const SPIKE_PROCESS_POLL_INTERVAL_MS = 25
export const SPIKE_EXIT_FLUSH_TIMEOUT_MS = 1_000

/** Closed set of spike failure reasons; no other value may reach `spike.json`. */
export const SPIKE_FAILURE_REASONS = ['process-exited', 'no-page-target', 'app-shell-timeout']

/** The real 6.43 GiB pair, read-only, local layer only. */
export const LOCAL_FIXTURE_ROOTS = {
  left: '/Users/zhutao/opencompare-fixtures/work/left',
  right: '/Users/zhutao/opencompare-fixtures/work/right'
}

/** Window layout, scrolling and the native panel / TCC stay human eyes. */
export const MANUAL_NOT_COVERED = [
  { id: 'manual-window-layout', label: '窗口布局', reason: 'not-covered' },
  { id: 'manual-window-scroll', label: '滚动', reason: 'not-covered' },
  { id: 'manual-native-panel-tcc', label: '原生面板 / TCC', reason: 'not-covered' }
]

/** Synthetic tree of the Linux comparison smoke (flat, so rows == files). */
export const SMOKE_TREE = {
  same: 10,
  added: 3,
  removed: 2,
  modified: 4
}

/** Synthetic tree of the cancel leg: wide enough for a real, observable cancel point. */
export const CANCEL_TREE_FILES_PER_SIDE = 20_000

const PROGRESS_EXPRESSION = `!!document.querySelector('[data-shell-level="events"] [role="status"]')`
const NO_PROGRESS_EXPRESSION = `!document.querySelector('[data-shell-level="events"] [role="status"]')`
const READY_DIRECTORY_EXPRESSION = `document.querySelectorAll('[role="tree"]').length >= 2 &&
  document.querySelectorAll('[role="treeitem"]').length > 0 &&
  !document.querySelector('[data-shell-level="events"] [role="status"]')`
const FOUR_STATE_EXPRESSION = `(() => {
  const footer = document.querySelector('footer[data-shell-level="status"]')
  if (!footer) return null
  const legend = Array.from(footer.querySelectorAll('span')).find((span) => {
    const cells = Array.from(span.children)
    return cells.length === 4 && cells.every((cell) => cell.querySelector('.tabular'))
  })
  if (!legend) return null
  const values = Array.from(legend.children).map((cell) =>
    Number(cell.querySelector('.tabular').textContent.trim())
  )
  if (values.some((value) => !Number.isFinite(value))) return null
  return { same: values[0], added: values[1], removed: values[2], modified: values[3] }
})()`
const SESSION_STATE_EXPRESSION = `(() => ({
  tabs: document.querySelectorAll('[data-session-tab]').length,
  trees: document.querySelectorAll('[role="tree"]').length
}))()`
const CANCEL_BUTTON_EXPRESSION = `(() => {
  const band = document.querySelector('[data-shell-level="events"] [role="status"]')
  if (!band) return false
  const button = band.querySelector('button.ml-auto')
  if (!button) return false
  button.click()
  return true
})()`
const OPERABLE_EXPRESSION = `!!document.querySelector('[data-shell-entry="new-compare"]')`
const APP_SHELL_EXPRESSION = `!!document.querySelector('[data-shell-level="app"]')`
const OPEN_COMPARE_DIALOG_EXPRESSION = `(() => {
  const entry = document.querySelector('[data-shell-entry="new-compare"]')
  if (!entry) return false
  entry.click()
  return true
})()`

const OPEN_COMPARE_SUBMIT_EXPRESSION = (left, right) => `(() => {
  const leftInput = document.querySelector('#new-compare-left')
  const rightInput = document.querySelector('#new-compare-right')
  if (!leftInput || !rightInput) return false
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(leftInput, ${JSON.stringify(left)})
  leftInput.dispatchEvent(new Event('input', { bubbles: true }))
  setter.call(rightInput, ${JSON.stringify(right)})
  rightInput.dispatchEvent(new Event('input', { bubbles: true }))
  rightInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  return true
})()`

const CLOSE_ALL_SESSIONS_EXPRESSION = `(() => {
  const tabs = document.querySelectorAll('[data-session-tab]')
  for (const tab of tabs) {
    const close = tab.querySelector('button:not([role="tab"])')
    if (close) close.click()
  }
  return tabs.length
})()`

/**
 * The A-layer registry, grouped exactly like the workflow jobs. A group with a
 * non-empty `platforms` list only registers when one of those platforms is
 * selected; the two platform-free groups always register.
 */
export const CI_CHECK_GROUPS = [
  {
    id: 'identity',
    platforms: [],
    checks: [
      {
        id: 'identity-release-metadata',
        name: 'Release metadata enumerates every asset with size and sha256',
        command: 'gh api repos/{owner}/{repo}/releases/tags/{tag}',
        run: runIdentityMetadata
      },
      {
        id: 'identity-asset-bytes-sha256',
        name: 'Every downloaded asset matches its declared byte count and sha256',
        command: 'gh release download {tag} --dir <assets>',
        run: runIdentityBytes
      }
    ]
  },
  {
    id: 'mac',
    platforms: ['mac'],
    checks: [
      {
        id: 'mac-dmg-version',
        name: 'The dmg mounts read-only and the copied app reports the tag version',
        command: 'hdiutil attach -nobrowse -readonly',
        run: runMacMount
      },
      {
        id: 'mac-codesign',
        name: 'codesign --verify --deep --strict accepts the downloaded app',
        command: 'codesign --verify --deep --strict',
        run: runMacCodesign
      },
      {
        id: 'mac-gatekeeper',
        name: 'spctl -a -t exec accepts the app as a Notarized Developer ID build',
        command: 'spctl -a -t exec -vv',
        run: runMacGatekeeper
      },
      {
        id: 'mac-stapler',
        name: 'xcrun stapler validate accepts the notarization ticket',
        command: 'xcrun stapler validate',
        run: runMacStapler
      }
    ]
  },
  {
    id: 'linux',
    platforms: ['linux'],
    checks: [
      {
        id: 'linux-appimage-version',
        name: 'The AppImage reports the tag version from its bundled package.json',
        command: 'xvfb-run -a <AppImage> --appimage-extract',
        run: runLinuxAppImage
      },
      {
        id: 'linux-deb-version',
        name: 'The deb control version equals the tag version and the app boots under xvfb',
        command: 'dpkg-deb -f <deb> Version',
        run: runLinuxDeb
      },
      {
        id: 'linux-directory-compare',
        name: 'A synthetic directory pair compares to the expected four-state counts',
        command: 'xvfb-run -a <AppImage> <left> <right>',
        run: runLinuxDirectoryCompare
      }
    ]
  },
  {
    id: 'windows',
    platforms: ['windows'],
    checks: [
      {
        id: 'windows-zip-version',
        name: 'The portable zip reports the tag version',
        command: 'unzip -q <portable zip> -d <dir>',
        run: runWindowsZipVersion
      },
      {
        id: 'windows-authenticode',
        name: 'Get-AuthenticodeSignature reports Valid for the installer',
        command: 'pwsh -NoProfile -Command Get-AuthenticodeSignature',
        run: runWindowsAuthenticode
      }
    ]
  },
  {
    id: 'cancel-log',
    platforms: ['linux'],
    checks: [
      {
        id: 'cancel-leg',
        name: 'Cancelling during progress returns to an operable state without leftovers',
        command: 'xvfb-run -a <AppImage> <left> <right>',
        run: runCancelLeg
      },
      {
        id: 'cancel-log-scan',
        name: 'No OperationCancelledError or ECANCELED noise in stdout, stderr or logs',
        command: 'scan <out>/logs',
        run: runCancelLogScan
      }
    ]
  },
  {
    id: 'evidence',
    platforms: [],
    checks: [
      {
        id: 'evidence-environment',
        name: 'Runner image, OS and run id are recorded and never unknown',
        command: 'node scripts/verify-release.mjs --layer=ci',
        run: runEvidenceEnvironment
      },
      {
        id: 'evidence-artifacts',
        name: 'Every step JSON and log file exists and parses',
        command: 'node scripts/verify-release.mjs --layer=ci',
        run: runEvidenceArtifacts
      }
    ]
  }
]

/** The B-layer registry. Memory is judged here and nowhere else. */
export const LOCAL_CHECKS = [
  {
    id: 'local-fixture',
    name: 'The real 6.43 GiB directory pair is readable',
    command: 'stat <left> <right>',
    run: runLocalFixture
  },
  {
    id: 'local-rounds-4state',
    name: 'Three rounds of four-state counts stay arithmetically self-consistent',
    command: 'node scripts/verify-release.mjs --layer=local',
    run: runLocalRounds
  },
  {
    id: 'local-retained-heap',
    name: 'Round 3 minus round 2 retained heap stays within 16 MiB',
    command: 'HeapProfiler.collectGarbage x2 then Performance.getMetrics',
    run: runLocalRetainedHeap
  }
]

/* ------------------------------------------------------------------ */
/* Pure judgments                                                      */
/* ------------------------------------------------------------------ */

/** Ordered expected ids for one layer / platform selection. */
export function expectedCheckIds({ layer, platforms = CI_PLATFORMS } = {}) {
  if (layer === 'local') return LOCAL_CHECKS.map((check) => check.id)
  const selected = new Set(platforms)
  const ids = []
  for (const group of CI_CHECK_GROUPS) {
    if (group.platforms.length > 0 && !group.platforms.some((platform) => selected.has(platform))) {
      continue
    }
    for (const check of group.checks) ids.push(check.id)
  }
  return ids
}

/** Ordered check definitions for one layer / platform selection. */
export function checksFor({ layer, platforms = CI_PLATFORMS } = {}) {
  if (layer === 'local') return [...LOCAL_CHECKS]
  const selected = new Set(platforms)
  const checks = []
  for (const group of CI_CHECK_GROUPS) {
    if (group.platforms.length > 0 && !group.platforms.some((platform) => selected.has(platform))) {
      continue
    }
    checks.push(...group.checks)
  }
  return checks
}

/** Difference between the expected and the actually executed id set. */
export function compareCheckSets(expected, actual) {
  const expectedSet = new Set(expected)
  const actualSet = new Set(actual)
  const missing = expected.filter((id) => !actualSet.has(id))
  const unexpected = actual.filter((id) => !expectedSet.has(id))
  return { missing, unexpected, ok: missing.length === 0 && unexpected.length === 0 }
}

/** `v0.2.16` / `0.2.16` / `0.2.16-1` all normalise to `0.2.16`; anything else is null. */
export function normalizeVersion(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/^v/i, '')
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(trimmed)
  if (match === null) return null
  return `${match[1]}.${match[2]}.${match[3]}`
}

/** True only when the artifact version normalises to the tag version. */
export function versionEqualsTag(version, tag) {
  const left = normalizeVersion(version)
  const right = normalizeVersion(tag)
  return left !== null && right !== null && left === right
}

/**
 * B-layer memory judgment: round 3 minus round 2 retained heap, after two GC
 * passes and one second of quiet, must stay at or below 16 MiB. There is no
 * argument that widens the threshold.
 */
export function judgeRetainedHeap({ round2RetainedBytes, round3RetainedBytes } = {}) {
  const problems = []
  if (!Number.isFinite(round2RetainedBytes) || round2RetainedBytes <= 0) {
    problems.push('第 2 轮保留堆缺失')
  }
  if (!Number.isFinite(round3RetainedBytes) || round3RetainedBytes <= 0) {
    problems.push('第 3 轮保留堆缺失')
  }
  const delta =
    problems.length === 0 ? round3RetainedBytes - round2RetainedBytes : null
  if (delta !== null && delta > RETENTION_THRESHOLD_BYTES) {
    problems.push(
      `第 3 轮 − 第 2 轮保留堆 ${delta} B > ${RETENTION_THRESHOLD_BYTES} B`
    )
  }
  return { ok: problems.length === 0, delta, threshold: RETENTION_THRESHOLD_BYTES, problems }
}

function sameCounts(left, right) {
  if (left === null || right === null || left === undefined || right === undefined) return false
  return (
    left.same === right.same &&
    left.added === right.added &&
    left.removed === right.removed &&
    left.modified === right.modified
  )
}

/** B-layer four-state judgment: three rounds, arithmetic sum, stable counts. */
export function judgeLocalRounds({ rounds } = {}) {
  const problems = []
  const list = Array.isArray(rounds) ? rounds : []
  if (list.length !== LOCAL_ROUND_COUNT) {
    problems.push(`轮次 ${list.length} ≠ ${LOCAL_ROUND_COUNT}`)
  }
  for (const round of list) {
    const counts = round.counts
    const values =
      counts === null || counts === undefined
        ? null
        : [counts.same, counts.added, counts.removed, counts.modified]
    if (values === null || values.some((value) => !Number.isFinite(value))) {
      problems.push(`第 ${round.index} 轮四态缺失`)
    } else {
      const sum = values.reduce((total, value) => total + value, 0)
      if (sum !== round.totalRows) {
        problems.push(`第 ${round.index} 轮四态和 ${sum} ≠ 总行数 ${round.totalRows}`)
      }
    }
    if (round.closedTabs !== 0 || round.closedTrees !== 0) {
      problems.push(
        `第 ${round.index} 轮关闭会话后 tab=${round.closedTabs} / 树=${round.closedTrees}`
      )
    }
  }
  const baseline = list[0]
  if (baseline !== undefined) {
    for (const round of list.slice(1)) {
      if (!sameCounts(baseline.counts, round.counts)) {
        problems.push(`第 ${round.index} 轮四态与第 1 轮不一致`)
      }
    }
  }
  return { ok: problems.length === 0, problems }
}

/** Counts every `OperationCancelledError` / `ECANCELED` hit; zero is the bar. */
export function scanCancelNoise(sources = []) {
  const hits = []
  for (const entry of sources) {
    const text = String(entry?.text ?? '')
    for (const line of text.split(/\r?\n/)) {
      if (!CANCEL_NOISE_PATTERN.test(line)) continue
      hits.push({ source: String(entry?.source ?? ''), line: line.trim() })
    }
  }
  return { hits, count: hits.length }
}

/**
 * Reads one JSON entry out of an asar archive buffer (the AppImage carries
 * `resources/app.asar`; its `package.json` is the packaged version).
 *
 * Layout written by `@electron/asar`: `[u32 4][u32 headerSize][u32 stringLen + 4]
 * [u32 stringLen][JSON header][file bodies]`, where `headerSize = 8 + stringLen`
 * and every entry offset is relative to `8 + headerSize`.
 */
export function readAsarJsonEntry(buffer, entryPath) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16) return null
  const headerSize = buffer.readUInt32LE(4)
  const dataBase = 8 + headerSize
  const stringLength = buffer.readUInt32LE(12)
  const jsonStart = 16
  const jsonEnd = jsonStart + stringLength
  if (dataBase > buffer.length || jsonEnd > dataBase) return null
  let header
  try {
    header = JSON.parse(
      buffer
        .subarray(jsonStart, jsonEnd)
        .toString('utf8')
        .replace(/\0+$/, '')
    )
  } catch {
    return null
  }
  let node = header
  for (const part of String(entryPath).split('/').filter(Boolean)) {
    node = node?.files?.[part]
    if (node === undefined || node === null) return null
  }
  if (node.files !== undefined || !Number.isFinite(node.size)) return null
  const start = dataBase + Number(node.offset ?? 0)
  const end = start + Number(node.size)
  if (start < dataBase || end > buffer.length) return null
  try {
    return JSON.parse(buffer.subarray(start, end).toString('utf8'))
  } catch {
    return null
  }
}

/** `--tag=v0.2.16` and `--tag v0.2.16` both parse; unknown flags are errors. */
export function parseArgs(argv = []) {
  const options = {}
  const forbidden = [
    '--threshold',
    '--max-retained',
    '--retained-threshold',
    '--tolerance',
    '--allow-skip',
    '--continue-on-error'
  ]
  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index])
    if (!arg.startsWith('--')) return { error: `未知参数: ${arg}` }
    const name = arg.slice(2)
    const eq = name.indexOf('=')
    const key = eq === -1 ? name : name.slice(0, eq)
    let value = eq === -1 ? undefined : name.slice(eq + 1)
    if (forbidden.includes(`--${key}`)) {
      return { error: `--${key} 不被接受：B 层阈值固定为 ${RETENTION_THRESHOLD_BYTES} B，不提供放宽开关` }
    }
    if (key === 'spike') {
      if (value !== undefined) return { error: `--spike 不接受取值` }
      options.spike = true
      continue
    }
    if (!['tag', 'layer', 'out', 'platform', 'aggregate'].includes(key)) {
      return { error: `未知参数: --${key}` }
    }
    if (value === undefined) {
      const next = argv[index + 1]
      if (next === undefined || String(next).startsWith('--')) {
        return { error: `--${key} 缺少取值` }
      }
      value = String(next)
      index += 1
    }
    if (value === '') return { error: `--${key} 缺少取值` }
    options[key] = value
  }

  if (options.tag === undefined) return { error: '缺少 --tag=vX.Y.Z' }
  if (!/^v\d+\.\d+\.\d+$/.test(options.tag)) {
    return { error: `--tag 必须是 vX.Y.Z: ${options.tag}` }
  }
  if (options.layer === undefined) return { error: '缺少 --layer=local|ci' }
  if (options.layer !== 'local' && options.layer !== 'ci') {
    return { error: `--layer 只能是 local 或 ci: ${options.layer}` }
  }
  if (options.out === undefined) return { error: '缺少 --out=<dir>' }
  if (options.platform !== undefined) {
    if (!['mac', 'linux', 'windows', 'all'].includes(options.platform)) {
      return { error: `--platform 只能是 mac / linux / windows / all: ${options.platform}` }
    }
    if (options.layer === 'local') return { error: '--platform 只适用于 --layer=ci' }
  }
  if (options.aggregate !== undefined && options.layer !== 'ci') {
    return { error: '--aggregate 只适用于 --layer=ci' }
  }
  if (options.spike === true && options.layer !== 'ci') {
    return { error: '--spike 只适用于 --layer=ci' }
  }
  if (options.spike === true && options.aggregate !== undefined) {
    return { error: '--spike 与 --aggregate 不能同时使用' }
  }
  return { options }
}

/** Selected platforms for a CLI run: `all`, one name, or the host platform. */
/**
 * Selected platforms: `--layer=ci` without `--platform` means every group of
 * the A layer (the six-group expected set). A workflow job narrows it with
 * `--platform=<name>`; the aggregate job always re-derives the full set.
 */
export function selectedPlatforms(option) {
  if (option === 'mac' || option === 'linux' || option === 'windows') return [option]
  return [...CI_PLATFORMS]
}

/** Counts one status set into the summary counters. */
export function summarizeCounts(steps = []) {
  const counts = { pass: 0, fail: 0, skip: 0, total: steps.length, expected: 0 }
  for (const step of steps) {
    if (step.status === 'pass') counts.pass += 1
    else if (step.status === 'skip') counts.skip += 1
    else counts.fail += 1
  }
  return counts
}

/**
 * Builds the fail-closed summary. Status is derived only from the executed
 * checks and the expected id set; nothing here can widen the bar.
 */
export function buildSummary({
  tag,
  layer,
  steps = [],
  environment = {},
  evidenceDir = '',
  expectedIds = [],
  manual = [],
  duplicates = [],
  startedAt = '',
  finishedAt = ''
} = {}) {
  const counts = summarizeCounts(steps)
  counts.expected = expectedIds.length
  const actualIds = steps.map((step) => step.id)
  const { missing, unexpected } = compareCheckSets(expectedIds, actualIds)
  const skipped = steps.filter((step) => step.status === 'skip').map((step) => step.id)
  const failed = steps.filter((step) => step.status === 'fail').map((step) => step.id)
  const status =
    missing.length === 0 &&
    unexpected.length === 0 &&
    duplicates.length === 0 &&
    counts.fail === 0 &&
    counts.skip === 0 &&
    counts.total === counts.expected
      ? 'pass'
      : 'fail'
  return {
    tag,
    layer,
    status,
    counts,
    environment,
    evidenceDir,
    missing,
    unexpected,
    duplicates,
    skipped,
    failed,
    checks: steps.map((step) => ({
      id: step.id,
      name: step.name,
      status: step.status,
      command: step.command,
      evidence: step.evidence
    })),
    manual,
    startedAt,
    finishedAt
  }
}

const REQUIRED_ENVIRONMENT_KEYS = ['ImageOS', 'ImageVersion', 'RUNNER_OS', 'GITHUB_RUN_ID']
const REQUIRED_SUMMARY_KEYS = ['tag', 'layer', 'status', 'counts', 'environment', 'evidenceDir']
const REQUIRED_STEP_KEYS = [
  'id',
  'name',
  'command',
  'expected',
  'actual',
  'status',
  'evidence',
  'startedAt',
  'finishedAt'
]
const SUMMARY_CHECK_KEYS = ['id', 'name', 'command', 'status', 'evidence']

/**
 * Schema + evidence validation of one step. `exists` is injected so the gate
 * test can drive the missing-evidence branch without touching the disk.
 */
export function validateStep(step, { exists = existsSync, keys = REQUIRED_STEP_KEYS } = {}) {
  const problems = []
  if (step === null || typeof step !== 'object') return { ok: false, problems: ['step 不是对象'] }
  for (const key of keys) {
    if (!(key in step)) problems.push(`step ${step.id ?? '?'} 缺字段 ${key}`)
  }
  if (!STEP_STATUSES.includes(step.status)) {
    problems.push(`step ${step.id ?? '?'} status=${step.status} 不在 pass|fail|skip`)
  }
  if (!Array.isArray(step.evidence) || step.evidence.length === 0) {
    problems.push(`step ${step.id ?? '?'} evidence 为空`)
  } else {
    for (const path of step.evidence) {
      if (typeof path !== 'string' || path === '') {
        problems.push(`step ${step.id ?? '?'} evidence 路径无效`)
        continue
      }
      if (!exists(path)) problems.push(`step ${step.id ?? '?'} evidence 不存在: ${path}`)
    }
  }
  return { ok: problems.length === 0, problems }
}

/** Full summary validation: required fields, counts, set equality, evidence. */
export function validateSummary(summary, { expectedIds = [], exists = existsSync } = {}) {
  const problems = []
  if (summary === null || typeof summary !== 'object') {
    return { ok: false, problems: ['summary 不是对象'] }
  }
  for (const key of REQUIRED_SUMMARY_KEYS) {
    if (!(key in summary)) problems.push(`summary 缺字段 ${key}`)
  }
  if (!['pass', 'fail'].includes(summary.status)) {
    problems.push(`summary.status=${summary.status} 不在 pass|fail`)
  }
  if (summary.layer !== 'local' && summary.layer !== 'ci') {
    problems.push(`summary.layer=${summary.layer} 不在 local|ci`)
  }
  const counts = summary.counts ?? {}
  for (const key of ['pass', 'fail', 'skip', 'total', 'expected']) {
    if (!Number.isFinite(counts[key])) problems.push(`summary.counts.${key} 缺失`)
  }
  if (Number.isFinite(counts.total) && Number.isFinite(counts.pass)) {
    const sum = counts.pass + counts.fail + counts.skip
    if (sum !== counts.total) problems.push(`summary.counts 之和 ${sum} ≠ total ${counts.total}`)
  }
  if (Number.isFinite(counts.expected) && counts.expected !== expectedIds.length) {
    problems.push(`summary.counts.expected ${counts.expected} ≠ 期望 ${expectedIds.length}`)
  }
  const environment = summary.environment ?? {}
  for (const key of REQUIRED_ENVIRONMENT_KEYS) {
    const value = environment[key]
    if (typeof value !== 'string' || value.trim() === '') {
      problems.push(`summary.environment.${key} 缺失`)
    } else if (value === 'unknown') {
      problems.push(`summary.environment.${key}=unknown 不得静默放行`)
    }
  }
  if (typeof summary.evidenceDir !== 'string' || summary.evidenceDir.trim() === '') {
    problems.push('summary.evidenceDir 缺失')
  } else if (!exists(summary.evidenceDir)) {
    problems.push(`summary.evidenceDir 不存在: ${summary.evidenceDir}`)
  }
  const checks = Array.isArray(summary.checks) ? summary.checks : null
  if (checks === null) {
    problems.push('summary.checks 不是数组')
  } else {
    const ids = checks.map((check) => check.id)
    if (new Set(ids).size !== ids.length) problems.push('summary.checks 有重复 id')
    for (const check of checks) {
      const verdict = validateStep(check, { exists, keys: SUMMARY_CHECK_KEYS })
      if (!verdict.ok) problems.push(...verdict.problems)
    }
  }
  if (!Array.isArray(summary.missing)) problems.push('summary.missing 不是数组')
  if (!Array.isArray(summary.unexpected)) problems.push('summary.unexpected 不是数组')
  if (!Array.isArray(summary.manual)) problems.push('summary.manual 不是数组')
  if (Array.isArray(summary.missing) && summary.missing.length > 0 && summary.status === 'pass') {
    problems.push('summary.missing 非空却 status=pass')
  }
  if (Array.isArray(summary.duplicates) && summary.duplicates.length > 0 && summary.status === 'pass') {
    problems.push('summary.duplicates 非空却 status=pass')
  }
  if (Array.isArray(summary.unexpected) && summary.unexpected.length > 0 && summary.status === 'pass') {
    problems.push('summary.unexpected 非空却 status=pass')
  }
  if (Array.isArray(summary.checks)) {
    const skipped = summary.checks.filter((check) => check.status === 'skip')
    if (skipped.length > 0 && summary.status === 'pass') {
      problems.push('存在 skip 检查却 status=pass')
    }
    const failed = summary.checks.filter((check) => check.status === 'fail')
    if (failed.length > 0 && summary.status === 'pass') {
      problems.push('存在 fail 检查却 status=pass')
    }
  }
  if (summary.layer === 'ci') {
    if (Array.isArray(summary.manual) && summary.manual.length > 0) {
      problems.push('--layer=ci 不得产出 manual 项')
    }
  }
  if (Array.isArray(summary.manual) && Array.isArray(summary.checks)) {
    const checkIds = new Set(summary.checks.map((check) => check.id))
    for (const entry of summary.manual) {
      if (entry?.reason !== 'not-covered') {
        problems.push(`manual 项 ${entry?.id} 未标注 not-covered`)
      }
      if (checkIds.has(entry?.id)) {
        problems.push(`manual 项 ${entry?.id} 同时出现在 checks 中`)
      }
    }
  }
  return { ok: problems.length === 0, problems }
}

/**
 * Final fail-closed release verdict. Pure: no disk, env, network or clock —
 * `exists` is injected by the caller. `ok` is true only when every summary
 * rule holds AND the summary itself declares `status=pass`.
 */
export function judgeReleaseGate(summary, { expectedIds = [], exists = existsSync } = {}) {
  const validation = validateSummary(summary, { expectedIds, exists })
  if (summary === null || typeof summary !== 'object') {
    return { ok: false, status: 'fail', problems: validation.problems }
  }
  const passed = validation.ok && summary.status === 'pass'
  const problems = [...validation.problems]
  if (validation.ok && !passed) {
    problems.push(`summary.status=${summary.status} 不是 pass`)
  }
  return { ok: passed, status: passed ? 'pass' : 'fail', problems }
}

/* ------------------------------------------------------------------ */
/* Evidence writing                                                    */
/* ------------------------------------------------------------------ */

/** Temporary file plus rename: a half-written JSON can never look like a pass. */
export function writeJsonAtomic(path, value) {
  writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`)
}

/** Same rename discipline for diagnostics, so a crash never truncates them. */
export function writeTextAtomic(path, text) {
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(temp, text, 'utf8')
  renameSync(temp, path)
}

function ensureWritableDir(dir) {
  try {
    mkdirSync(dir, { recursive: true })
    const probe = join(dir, `.write-probe-${process.pid}`)
    writeFileSync(probe, '')
    rmSync(probe, { force: true })
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

/* ------------------------------------------------------------------ */
/* Ports: commands, CDP, the filesystem and the release metadata        */
/* ------------------------------------------------------------------ */

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function runCommand(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: 'utf8',
    timeout: options.timeout ?? 300_000,
    maxBuffer: 64 * 1024 * 1024
  })
  const stdout = result.stdout ?? ''
  const stderr = result.stderr ?? (result.error ? String(result.error.message) : '')
  return {
    status: typeof result.status === 'number' ? result.status : -1,
    signal: result.signal ?? null,
    stdout,
    stderr
  }
}

/**
 * Linux launches the spike in its own process group (`detached: true`), so the
 * whole tree `xvfb-run` → `Xvfb` → Electron can be reaped through `-pid`.
 * Windows has no process groups; the spike matrix never runs there, so it and
 * every other platform keep the direct-child signal.
 */
export function spikeUsesProcessGroup(platform = process.platform) {
  return platform === 'linux'
}

/**
 * Signal the launched tree, never the CLI itself. A group kill is attempted
 * first and the direct child is kept as a fallback; ESRCH (already gone) and
 * EPERM (not ours) must not turn a reap into a hang.
 */
function signalChildTree(child, { processGroup, signal }) {
  const pid = typeof child?.pid === 'number' ? child.pid : null
  if (pid === null || pid <= 0) return
  const targets = processGroup && process.platform !== 'win32' ? [-pid, pid] : [pid]
  for (const target of targets) {
    try {
      process.kill(target, signal)
    } catch {
      // Nothing to reap, or no permission: the bounded wait still decides.
    }
  }
}

/** Group liveness on POSIX; a plain child liveness check everywhere else. */
function childTreeAlive(child, { processGroup }) {
  const pid = typeof child?.pid === 'number' ? child.pid : null
  // A spawn that never produced a pid has nothing to reap.
  if (pid === null || pid <= 0) return false
  if (processGroup && process.platform !== 'win32') {
    try {
      process.kill(-pid, 0)
      return true
    } catch (error) {
      // ESRCH means the whole group is gone; EPERM means it still exists.
      if (error?.code === 'ESRCH') return false
      return true
    }
  }
  return child.exitCode === null && child.signalCode === null
}

async function waitUntilReaped(child, { processGroup, timeoutMs }) {
  const deadline = Date.now() + timeoutMs
  while (childTreeAlive(child, { processGroup })) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) return false
    await sleep(Math.min(SPIKE_PROCESS_POLL_INTERVAL_MS, remaining))
  }
  return true
}

/**
 * Drop every handle the parent still holds on the tree: data/exit/error
 * listeners first, then the pipes themselves. A surviving grandchild that
 * inherited the write end can therefore never pin the CLI event loop.
 */
function releaseChildHandles(child) {
  for (const stream of [child.stdin, child.stdout, child.stderr]) {
    if (stream === null || stream === undefined) continue
    stream.removeAllListeners()
    if (stream.destroyed !== true) {
      try {
        stream.destroy()
      } catch {
        // Already closed by the child side.
      }
    }
  }
  for (const event of ['exit', 'close', 'error']) child.removeAllListeners(event)
  try {
    child.unref()
  } catch {
    // A child that already exited has nothing to unref.
  }
}

/**
 * Reap one launched tree: SIGTERM the group, then SIGKILL whatever survived
 * the grace budget. Always resolves — the SIGKILL leg is bounded too — and
 * always releases the captured pipes before returning.
 *
 * The leader is signalled even when it already exited: on Linux `xvfb-run` can
 * be gone while `Xvfb` / Electron still hold the inherited pipes.
 */
export async function stopChild(
  child,
  {
    processGroup = false,
    graceMs = SPIKE_PROCESS_EXIT_BUDGET_MS,
    killWaitMs = SPIKE_PROCESS_KILL_WAIT_MS
  } = {}
) {
  if (child === null || child === undefined) return
  const leaderReaped = child.exitCode !== null || child.signalCode !== null
  if (processGroup || !leaderReaped) {
    signalChildTree(child, { processGroup, signal: 'SIGTERM' })
    const reaped = await waitUntilReaped(child, { processGroup, timeoutMs: graceMs })
    if (!reaped) {
      signalChildTree(child, { processGroup, signal: 'SIGKILL' })
      await waitUntilReaped(child, { processGroup, timeoutMs: killWaitMs })
    }
  }
  releaseChildHandles(child)
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/** A page target is the only entry CDP may attach to: it must carry a socket URL. */
function isPageTarget(entry) {
  return (
    entry !== null &&
    typeof entry === 'object' &&
    entry.type === 'page' &&
    typeof entry.webSocketDebuggerUrl === 'string' &&
    entry.webSocketDebuggerUrl.length > 0
  )
}

/** Real `/json/list` probe; a refused port is an error record, never a silent spin. */
async function probeDevToolsTargets(port) {
  if (typeof fetch === 'undefined') {
    throw new Error('需要 Node 22+（全局 fetch）才能探测 DevTools')
  }
  const response = await fetch(`http://127.0.0.1:${port}/json/list`)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

/**
 * One platform launch descriptor. macOS stays byte-for-byte the old command;
 * Linux owns its own xvfb and the two Chromium flags its verify legs already
 * use. Everything else launches the same Electron entry directly.
 */
export function buildSpikeLaunchDescriptor({
  platform = process.platform,
  port,
  root = '.',
  electronBinary
} = {}) {
  if (typeof electronBinary !== 'string' || electronBinary.length === 0) {
    throw new Error('spike 需要一个 Electron 可执行文件')
  }
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`spike 端口非法: ${port}`)
  }
  const debugging = `--remote-debugging-port=${port}`
  if (platform === 'linux') {
    return {
      command: 'xvfb-run',
      args: ['-a', electronBinary, '.', '--no-sandbox', '--disable-dev-shm-usage', debugging],
      cwd: root
    }
  }
  return { command: electronBinary, args: ['.', debugging], cwd: root }
}

/**
 * Bounded target wait with a liveness check. Every dependency (clock, probe,
 * sleep, child liveness) is injected so the deterministic gate never boots a
 * real window. A dead child fails on the next tick instead of burning the
 * whole budget; a live child that never exposes a target ends in
 * `no-page-target` with the probe trail attached.
 */
export async function waitForSpikePageTarget({
  port,
  timeoutMs = SPIKE_TARGET_TIMEOUT_MS,
  intervalMs = SPIKE_TARGET_POLL_INTERVAL_MS,
  probe = probeDevToolsTargets,
  childAlive = () => true,
  now = () => Date.now(),
  sleepFn = sleep
} = {}) {
  const startedAtMs = now()
  const deadline = startedAtMs + timeoutMs
  const portProbe = []
  let target = null
  let reason = null
  for (;;) {
    if (!childAlive()) {
      reason = 'process-exited'
      break
    }
    const probeAt = now()
    try {
      const entries = await probe(port)
      const list = Array.isArray(entries) ? entries : []
      target = list.find(isPageTarget) ?? null
      portProbe.push({
        at: new Date(probeAt).toISOString(),
        elapsedMs: probeAt - startedAtMs,
        ok: true,
        pageTargets: list.filter(isPageTarget).length,
        url: target?.url ?? null,
        error: null
      })
    } catch (error) {
      portProbe.push({
        at: new Date(probeAt).toISOString(),
        elapsedMs: probeAt - startedAtMs,
        ok: false,
        pageTargets: 0,
        url: null,
        error: error instanceof Error ? error.message : String(error)
      })
    }
    if (target !== null) break
    if (!childAlive()) {
      reason = 'process-exited'
      break
    }
    const remaining = deadline - now()
    if (remaining <= 0) {
      reason = 'no-page-target'
      break
    }
    await sleepFn(Math.min(intervalMs, remaining))
  }
  return {
    target,
    reason: target === null ? reason : null,
    portProbe,
    startedAt: new Date(startedAtMs).toISOString(),
    finishedAt: new Date(now()).toISOString()
  }
}

/** One log file the maintainer can read without any other tooling. */
export function formatSpikeLaunchLog(record) {
  const lines = [
    `[spike] id=${record.id} tag=${record.tag} conclusion=${record.conclusion}`,
    `[spike] reason=${record.reason ?? 'none'} exitCode=${record.exitCode ?? 'null'} signal=${record.signal ?? 'null'}`,
    `[spike] startedAt=${record.startedAt} finishedAt=${record.finishedAt}`,
    `[spike] error=${record.error ?? 'none'}`,
    '',
    '--- electron stdout (xvfb-run wrapper output included) ---',
    record.stdout ?? '',
    '--- electron stderr (xvfb-run wrapper output included) ---',
    record.stderr ?? '',
    '--- devtools /json/list probes ---'
  ]
  for (const probe of record.portProbe ?? []) {
    lines.push(
      `[${probe.at} +${probe.elapsedMs}ms] ok=${probe.ok} pageTargets=${probe.pageTargets}` +
        `${probe.url === null ? '' : ` url=${probe.url}`}` +
        `${probe.error === null ? '' : ` error=${probe.error}`}`
    )
  }
  return `${lines.join('\n')}\n`
}

/** Minimal DevTools-protocol client over the global WebSocket (Node 22+). */
class CdpClient {
  static async connectToTarget(target) {
    if (typeof WebSocket === 'undefined') {
      throw new Error('需要 Node 22+（全局 WebSocket）才能连接 DevTools')
    }
    const socket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((accept, reject) => {
      socket.addEventListener('open', accept, { once: true })
      socket.addEventListener('error', () => reject(new Error('DevTools socket failed')), {
        once: true
      })
    })
    return new CdpClient(socket, target.url)
  }

  constructor(socket, url) {
    this.socket = socket
    this.url = url
    this.pending = new Map()
    this.nextId = 0
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      const entry = this.pending.get(message.id)
      if (entry === undefined) return
      this.pending.delete(message.id)
      if (message.error) entry.reject(new Error(message.error.message))
      else entry.resolve(message.result)
    })
  }

  send(method, params = {}) {
    return new Promise((accept, reject) => {
      this.nextId += 1
      const id = this.nextId
      this.pending.set(id, { resolve: accept, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    })
    return result?.result?.value
  }

  async waitFor(expression, description, { timeoutMs = 60_000, intervalMs = 150 } = {}) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (await this.evaluate(expression)) return true
      await sleep(intervalMs)
    }
    throw new Error(`等待超时: ${description}`)
  }

  close() {
    try {
      this.socket.close()
    } catch {
      // The socket is already gone.
    }
  }
}

/**
 * Spawn one captured child and own its teardown. `detached` is only set when
 * the caller asked for a process group, so macOS keeps the historical spawn and
 * a fake process tree can exercise the Linux group path anywhere.
 */
export function spawnCapturedChild({
  command,
  args = [],
  cwd,
  env,
  processGroup = false
} = {}) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: processGroup
  })
  const output = []
  const stdoutChunks = []
  const stderrChunks = []
  child.stdout?.on('data', (chunk) => {
    const text = String(chunk)
    stdoutChunks.push(text)
    output.push(text)
  })
  child.stderr?.on('data', (chunk) => {
    const text = String(chunk)
    stderrChunks.push(text)
    output.push(text)
  })
  let exitInfo = null
  child.once('exit', (code, signal) => {
    exitInfo = { code, signal }
  })
  child.once('error', (spawnError) => {
    exitInfo = { code: -1, signal: null }
    stderrChunks.push(`spawn error: ${spawnError.message}\n`)
    output.push(`spawn error: ${spawnError.message}\n`)
  })
  return {
    child,
    output,
    alive: () => exitInfo === null && child.exitCode === null && child.signalCode === null,
    exitCode: () => exitInfo?.code ?? child.exitCode ?? null,
    signal: () => exitInfo?.signal ?? child.signalCode ?? null,
    stdout: () => stdoutChunks.join(''),
    stderr: () => stderrChunks.join(''),
    stop: () => stopChild(child, { processGroup })
  }
}

/** Real world: filesystem, commands, `gh`, CDP launches and heap sampling. */
export function createWorld({ env = process.env } = {}) {
  return {
    exists: (path) => existsSync(path),
    readdir: (path, options) => (options === undefined ? readdirSync(path) : readdirSync(path, options)),
    isDirectory: (path) => statSync(path).isDirectory(),
    readText: (path) => readFileSync(path, 'utf8'),
    readBytes: (path) => readFileSync(path),
    size: (path) => statSync(path).size,
    mkdir: (path) => mkdirSync(path, { recursive: true }),
    writeText: (path, text) => {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, text)
    },
    chmod: (path, mode) => chmodSync(path, mode),
    sha256: (path) => sha256File(path),
    run: (command, args, options) => runCommand(command, args, options),
    release: async (tag) => {
      const result = runCommand('gh', [
        'api',
        `repos/{owner}/{repo}/releases/tags/${tag}`,
        '--jq',
        '{tag: .tag_name, assets: [.assets[] | {name: .name, size: .size, digest: .digest, url: .browser_download_url}]}'
      ])
      if (result.status !== 0) {
        throw new Error(`gh api 读取 Release 失败: ${result.stderr.trim() || result.status}`)
      }
      const parsed = JSON.parse(result.stdout)
      return {
        tag: parsed.tag,
        assets: (parsed.assets ?? []).map((asset) => ({
          name: asset.name,
          size: asset.size,
          sha256: typeof asset.digest === 'string' ? asset.digest.replace(/^sha256:/, '') : null,
          url: asset.url
        }))
      }
    },
    launchApp: async ({
      command,
      args = [],
      port,
      cwd,
      env: extraEnv,
      timeoutMs,
      waitForTarget,
      processGroup = false
    }) => {
      const launchStartedAt = new Date().toISOString()
      const proc = spawnCapturedChild({
        command,
        args,
        cwd,
        env: { ...env, ...extraEnv },
        processGroup
      })
      const { output } = proc
      const childAlive = () => proc.alive()
      const diagnostics = (reason, wait) => ({
        reason,
        exitCode: proc.exitCode(),
        signal: proc.signal(),
        stdout: proc.stdout(),
        stderr: proc.stderr(),
        portProbe: wait?.portProbe ?? [],
        startedAt: launchStartedAt,
        finishedAt: new Date().toISOString()
      })
      const failure = (reason, message, wait) => {
        const error = new Error(message)
        error.diagnostics = diagnostics(reason, wait)
        return error
      }
      let wait
      let cdp
      try {
        const waitFn = waitForTarget ?? waitForSpikePageTarget
        wait = await waitFn({
          port,
          timeoutMs: timeoutMs ?? 120_000,
          childAlive
        })
        if (wait.target === null || wait.target === undefined) {
          const reason = wait.reason ?? 'no-page-target'
          throw failure(
            reason,
            reason === 'process-exited'
              ? `Electron 在暴露 DevTools page 前退出 (port ${port})`
              : `窗口未暴露 DevTools page target (port ${port})`,
            wait
          )
        }
        cdp = await CdpClient.connectToTarget(wait.target)
      } catch (error) {
        const wrapped =
          error?.diagnostics === undefined
            ? failure(childAlive() ? 'no-page-target' : 'process-exited', String(error?.message ?? error), wait)
            : error
        await proc.stop()
        throw wrapped
      }
      return {
        cdp,
        output,
        diagnostics: () => diagnostics(null, wait),
        collectGarbage: async () => {
          await cdp.send('HeapProfiler.enable')
          await cdp.send('HeapProfiler.collectGarbage')
          await cdp.send('HeapProfiler.collectGarbage')
        },
        readRetainedHeap: async () => {
          const metrics = await cdp.send('Performance.getMetrics')
          const entry = (metrics?.metrics ?? []).find((metric) => metric.name === 'JSHeapUsedSize')
          return entry === undefined ? null : entry.value
        },
        stop: async () => {
          cdp.close()
          await proc.stop()
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Check context                                                       */
/* ------------------------------------------------------------------ */

function pass(expected, actual, extraEvidence = []) {
  return { status: 'pass', expected, actual, extraEvidence }
}

function fail(expected, actual, extraEvidence = []) {
  return { status: 'fail', expected, actual, extraEvidence }
}

function createCheckContext({ world, tag, outDir, workRoot, state, environment }) {
  const log = []
  const exec = (command, args = [], options = {}) => {
    const result = world.run(command, args, options)
    log.push(`$ ${[command, ...args].join(' ')}\n${result.stdout ?? ''}${result.stderr ?? ''}`)
    if (result.status !== 0) log.push(`[exit ${result.status}]\n`)
    return result
  }
  return {
    world,
    tag,
    outDir,
    workRoot,
    state,
    environment,
    exec,
    log,
    path: (name) => join(workRoot, name),
    sleep
  }
}

/* ------------------------------------------------------------------ */
/* A layer: identity                                                   */
/* ------------------------------------------------------------------ */

async function runIdentityMetadata(ctx) {
  const expected = { tag: ctx.tag, assets: '每个资产都有 name / size / sha256' }
  const release = await ctx.world.release(ctx.tag)
  if (release === null || typeof release !== 'object') {
    return fail(expected, { error: 'Release 元数据不可读' })
  }
  if (release.tag !== ctx.tag) {
    return fail(expected, { tag: release.tag, error: 'Release tag 与 --tag 不等' })
  }
  const assets = Array.isArray(release.assets) ? release.assets : []
  if (assets.length === 0) {
    return fail(expected, { assets: 0, error: 'Release 没有资产' })
  }
  const problems = []
  for (const asset of assets) {
    if (!Number.isFinite(asset.size) || asset.size <= 0) {
      problems.push(`${asset.name} 缺字节数`)
    }
    if (typeof asset.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(asset.sha256)) {
      problems.push(`${asset.name} 缺 sha256`)
    }
  }
  ctx.state.release = release
  const actual = { assets: assets.length, names: assets.map((asset) => asset.name) }
  if (problems.length > 0) return fail(expected, { ...actual, problems })
  return pass(expected, actual)
}

async function runIdentityBytes(ctx) {
  const expected = { bytes: '逐资产相等', sha256: '逐资产相等' }
  const release = ctx.state.release
  if (release === undefined) {
    return fail(expected, { error: '先决步骤 identity-release-metadata 未取得 Release 元数据' })
  }
  const dir = ctx.path('release-assets')
  ctx.world.mkdir(dir)
  const download = ctx.exec('gh', ['release', 'download', ctx.tag, '--dir', dir])
  if (download.status !== 0) {
    return fail(expected, { error: `gh release download 退出 ${download.status}` })
  }
  const problems = []
  const perAsset = []
  for (const asset of release.assets) {
    const path = join(dir, asset.name)
    if (!ctx.world.exists(path)) {
      problems.push(`${asset.name} 缺失`)
      perAsset.push({ name: asset.name, expectedBytes: asset.size, actualBytes: null })
      continue
    }
    const actualBytes = ctx.world.size(path)
    const actualSha = ctx.world.sha256(path)
    perAsset.push({
      name: asset.name,
      expectedBytes: asset.size,
      actualBytes,
      expectedSha256: asset.sha256,
      actualSha256: actualSha
    })
    if (actualBytes !== asset.size) {
      problems.push(`${asset.name} 字节 期望 ${asset.size} 实测 ${actualBytes}`)
    }
    if (actualSha !== asset.sha256) {
      problems.push(`${asset.name} sha256 期望 ${asset.sha256} 实测 ${actualSha}`)
    }
  }
  ctx.state.assetsDir = dir
  if (problems.length > 0) return fail(expected, { problems, assets: perAsset })
  return pass(expected, { assets: perAsset })
}

/* ------------------------------------------------------------------ */
/* A layer: macOS                                                      */
/* ------------------------------------------------------------------ */

/** The release metadata is fetched once per run and shared by every check. */
async function ensureRelease(ctx) {
  if (ctx.state.release !== undefined) return ctx.state.release
  const release = await ctx.world.release(ctx.tag)
  ctx.state.release = release
  return release
}

function singleAsset(release, pattern, label) {
  const matches = (release?.assets ?? []).filter((asset) => pattern.test(asset.name))
  if (matches.length !== 1) {
    return {
      ok: false,
      reason: `${label} 资产应为 1 个，实测 ${matches.length} 个: ${matches
        .map((asset) => asset.name)
        .join(', ')}`
    }
  }
  return { ok: true, asset: matches[0] }
}

function assetPath(ctx, asset) {
  return join(ctx.state.assetsDir ?? ctx.path('release-assets'), asset.name)
}

async function runMacMount(ctx) {
  const expected = {
    mount: 'hdiutil attach -nobrowse -readonly',
    version: normalizeVersion(ctx.tag)
  }
  const picked = singleAsset(ctx.state.release, /\.dmg$/, 'dmg')
  if (!picked.ok) return fail(expected, { error: picked.reason })
  const dmg = assetPath(ctx, picked.asset)
  const mountPoint = ctx.path('mac-mount')
  const appDir = ctx.path('mac-app')
  ctx.world.mkdir(mountPoint)
  ctx.world.mkdir(appDir)
  let attached = false
  try {
    const attach = ctx.exec('hdiutil', [
      'attach',
      '-nobrowse',
      '-readonly',
      '-mountpoint',
      mountPoint,
      dmg
    ])
    if (attach.status !== 0) {
      return fail(expected, { error: `hdiutil attach 退出 ${attach.status}`, stderr: attach.stderr })
    }
    attached = true
    const appName = ctx.world.readdir(mountPoint).find((name) => name.endsWith('.app'))
    if (appName === undefined) {
      return fail(expected, { error: `挂载点内没有 .app: ${mountPoint}` })
    }
    const appPathInMount = join(mountPoint, appName)
    const copy = ctx.exec('ditto', [appPathInMount, join(appDir, appName)])
    if (copy.status !== 0) {
      return fail(expected, { error: `ditto 拷贝 .app 退出 ${copy.status}`, stderr: copy.stderr })
    }
    const app = join(appDir, appName)
    const plist = join(app, 'Contents', 'Info.plist')
    const version = ctx.exec('plutil', [
      '-extract',
      'CFBundleShortVersionString',
      'raw',
      '-o',
      '-',
      plist
    ])
    if (version.status !== 0) {
      return fail(expected, { error: `plutil 读取版本退出 ${version.status}`, stderr: version.stderr })
    }
    ctx.state.macApp = app
    const actual = { version: version.stdout.trim(), app }
    if (!versionEqualsTag(actual.version, ctx.tag)) {
      return fail(expected, { ...actual, error: 'CFBundleShortVersionString 与 tag 不等' })
    }
    return pass(expected, actual)
  } finally {
    if (attached) ctx.exec('hdiutil', ['detach', mountPoint])
  }
}

function requireMacApp(ctx, expected) {
  const app = ctx.state.macApp
  if (typeof app !== 'string' || app === '') {
    return { ok: false, failure: fail(expected, { error: '先决步骤 mac-dmg-version 未产出 .app' }) }
  }
  return { ok: true, app }
}

async function runMacCodesign(ctx) {
  const expected = { exit: 0, command: 'codesign --verify --deep --strict' }
  const ready = requireMacApp(ctx, expected)
  if (!ready.ok) return ready.failure
  const result = ctx.exec('codesign', ['--verify', '--deep', '--strict', '--verbose=2', ready.app])
  const actual = { exit: result.status, stderr: result.stderr.trim() }
  if (result.status !== 0) return fail(expected, actual)
  return pass(expected, actual)
}

async function runMacGatekeeper(ctx) {
  const expected = { exit: 0, output: 'accepted + Notarized Developer ID' }
  const ready = requireMacApp(ctx, expected)
  if (!ready.ok) return ready.failure
  const result = ctx.exec('spctl', ['-a', '-t', 'exec', '-vv', ready.app])
  const output = `${result.stdout}\n${result.stderr}`
  const actual = { exit: result.status, output: output.trim() }
  if (result.status !== 0) return fail(expected, actual)
  if (!output.includes('accepted')) return fail(expected, { ...actual, error: '缺少 accepted' })
  if (!output.includes('Notarized Developer ID')) {
    return fail(expected, { ...actual, error: '缺少 Notarized Developer ID' })
  }
  return pass(expected, actual)
}

async function runMacStapler(ctx) {
  const expected = { exit: 0, command: 'xcrun stapler validate' }
  const ready = requireMacApp(ctx, expected)
  if (!ready.ok) return ready.failure
  const result = ctx.exec('xcrun', ['stapler', 'validate', ready.app])
  const actual = { exit: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() }
  if (result.status !== 0) return fail(expected, actual)
  return pass(expected, actual)
}

/* ------------------------------------------------------------------ */
/* A layer: Linux                                                      */
/* ------------------------------------------------------------------ */

async function extractAppImage(ctx, expected) {
  const picked = singleAsset(ctx.state.release, /\.AppImage$/, 'AppImage')
  if (!picked.ok) return { ok: false, failure: fail(expected, { error: picked.reason }) }
  const source = assetPath(ctx, picked.asset)
  const copy = ctx.path(join('linux', picked.asset.name))
  ctx.world.mkdir(dirname(copy))
  const copied = ctx.exec('cp', [source, copy])
  if (copied.status !== 0) {
    return { ok: false, failure: fail(expected, { error: '拷贝 AppImage 失败', stderr: copied.stderr }) }
  }
  // The download stays read-only; only the temp copy becomes executable.
  ctx.world.chmod(copy, 0o755)
  const extractDir = ctx.path('linux-extract')
  ctx.world.mkdir(extractDir)
  const extracted = ctx.exec('xvfb-run', ['-a', copy, '--appimage-extract'], { cwd: extractDir })
  if (extracted.status !== 0) {
    return {
      ok: false,
      failure: fail(expected, {
        error: `--appimage-extract 退出 ${extracted.status}`,
        stderr: extracted.stderr.trim()
      })
    }
  }
  const root = join(extractDir, 'squashfs-root')
  return { ok: true, appImage: copy, root }
}

function readBundledVersion(ctx, root) {
  const asar = join(root, 'resources', 'app.asar')
  if (ctx.world.exists(asar)) {
    const pkg = readAsarJsonEntry(ctx.world.readBytes(asar), 'package.json')
    return pkg?.version ?? null
  }
  const plain = join(root, 'resources', 'app', 'package.json')
  if (!ctx.world.exists(plain)) return null
  try {
    return JSON.parse(ctx.world.readText(plain)).version ?? null
  } catch {
    return null
  }
}

/**
 * The packaged Linux executable is named after the package (`opencompare` in
 * the deb, possibly capitalised inside the AppImage), so it is resolved from the
 * unpacked tree instead of guessed from an artifact name.
 */
function findLinuxBinary(ctx, root, depth = 3) {
  const entriesOf = (current) => {
    try {
      return ctx.world.readdir(current, { withFileTypes: true }).map((entry) => {
        const name = typeof entry === 'string' ? entry : entry.name
        const isDirectory =
          typeof entry === 'string'
            ? ctx.world.isDirectory(join(current, name))
            : entry.isDirectory()
        return { name, isDirectory, path: join(current, name) }
      })
    } catch {
      return []
    }
  }
  const level = entriesOf(root)
  const match = level.find((entry) => !entry.isDirectory && /^opencompare$/i.test(entry.name))
  if (match !== undefined) return match.path
  if (depth === 0) return null
  for (const entry of level) {
    if (!entry.isDirectory) continue
    const found = findLinuxBinary(ctx, entry.path, depth - 1)
    if (found !== null) return found
  }
  return null
}

async function runLinuxAppImage(ctx) {
  const expected = { version: normalizeVersion(ctx.tag), binary: 'resolved from the unpacked AppImage' }
  const extracted = await extractAppImage(ctx, expected)
  if (!extracted.ok) return extracted.failure
  const version = readBundledVersion(ctx, extracted.root)
  const binary = findLinuxBinary(ctx, extracted.root)
  const actual = { version, root: extracted.root, binary }
  if (binary === null) {
    return fail(expected, { ...actual, error: '解包后找不到 Linux 可执行文件' })
  }
  ctx.state.linuxAppImage = { binary, root: extracted.root }
  if (!versionEqualsTag(version, ctx.tag)) {
    return fail(expected, { ...actual, error: 'AppImage 内 package.json 版本与 tag 不等' })
  }
  return pass(expected, actual)
}

async function runLinuxDeb(ctx) {
  const expected = { controlVersion: normalizeVersion(ctx.tag), boot: 'xvfb window' }
  const picked = singleAsset(ctx.state.release, /\.deb$/, 'deb')
  if (!picked.ok) return fail(expected, { error: picked.reason })
  const deb = assetPath(ctx, picked.asset)
  const control = ctx.exec('dpkg-deb', ['-f', deb, 'Version'])
  if (control.status !== 0) {
    return fail(expected, { error: `dpkg-deb -f 退出 ${control.status}`, stderr: control.stderr })
  }
  const controlVersion = control.stdout.trim()
  if (!versionEqualsTag(controlVersion, ctx.tag)) {
    return fail(expected, { controlVersion, error: 'deb control Version 与 tag 不等' })
  }
  const root = ctx.path('deb-root')
  ctx.world.mkdir(root)
  const unpacked = ctx.exec('dpkg-deb', ['-x', deb, root])
  if (unpacked.status !== 0) {
    return fail(expected, { controlVersion, error: `dpkg-deb -x 退出 ${unpacked.status}` })
  }
  const binary = findLinuxBinary(ctx, root)
  if (binary === null) {
    return fail(expected, { controlVersion, error: '解包后找不到 Linux 可执行文件' })
  }
  const port = 9500 + Math.floor(Math.random() * 400)
  let launch
  try {
    launch = await ctx.world.launchApp({
      command: 'xvfb-run',
      args: ['-a', binary, '--no-sandbox', `--remote-debugging-port=${port}`],
      port,
      timeoutMs: 120_000
    })
    await launch.cdp.waitFor(APP_SHELL_EXPRESSION, 'deb app shell', { timeoutMs: 60_000 })
  } catch (error) {
    return fail(expected, {
      controlVersion,
      error: error instanceof Error ? error.message : String(error)
    })
  } finally {
    if (launch !== undefined) await launch.stop()
  }
  return pass(expected, { controlVersion, boot: 'xvfb window' })
}

/** Flat synthetic pair with a known four-state composition. */
function writeSmokeTree(ctx) {
  const left = ctx.path('smoke/left')
  const right = ctx.path('smoke/right')
  ctx.world.mkdir(left)
  ctx.world.mkdir(right)
  for (let index = 0; index < SMOKE_TREE.same; index += 1) {
    const text = `same ${index}\n`
    ctx.world.writeText(join(left, `same-${index}.txt`), text)
    ctx.world.writeText(join(right, `same-${index}.txt`), text)
  }
  for (let index = 0; index < SMOKE_TREE.added; index += 1) {
    ctx.world.writeText(join(right, `added-${index}.txt`), `added ${index}\n`)
  }
  for (let index = 0; index < SMOKE_TREE.removed; index += 1) {
    ctx.world.writeText(join(left, `removed-${index}.txt`), `removed ${index}\n`)
  }
  for (let index = 0; index < SMOKE_TREE.modified; index += 1) {
    ctx.world.writeText(join(left, `modified-${index}.txt`), `before ${index}\n`)
    ctx.world.writeText(join(right, `modified-${index}.txt`), `after ${index} with more bytes\n`)
  }
  return { left, right }
}

async function runLinuxDirectoryCompare(ctx) {
  const expected = { ...SMOKE_TREE, totalRows: Object.values(SMOKE_TREE).reduce((a, b) => a + b, 0) }
  const appImage = ctx.state.linuxAppImage
  if (appImage === undefined) {
    return fail(expected, { error: '先决步骤 linux-appimage-version 未产出解包后的 AppImage' })
  }
  const tree = writeSmokeTree(ctx)
  const port = 9900 + Math.floor(Math.random() * 90)
  let launch
  let counts
  try {
    launch = await ctx.world.launchApp({
      command: 'xvfb-run',
      args: [
        '-a',
        appImage.binary,
        '--no-sandbox',
        tree.left,
        tree.right,
        `--remote-debugging-port=${port}`
      ],
      port,
      timeoutMs: 120_000
    })
    await launch.cdp.waitFor(READY_DIRECTORY_EXPRESSION, 'synthetic comparison to settle', {
      timeoutMs: 120_000
    })
    counts = await launch.cdp.evaluate(FOUR_STATE_EXPRESSION)
  } catch (error) {
    return fail(expected, { error: error instanceof Error ? error.message : String(error) })
  } finally {
    if (launch !== undefined) await launch.stop()
  }
  if (counts === null || counts === undefined) {
    return fail(expected, { counts, error: '读不到四态计数' })
  }
  const total = counts.same + counts.added + counts.removed + counts.modified
  const actual = { ...counts, totalRows: total, tree }
  if (total !== expected.totalRows) {
    return fail(expected, { ...actual, error: '四态和与合成树总行数不等' })
  }
  for (const key of ['same', 'added', 'removed', 'modified']) {
    if (counts[key] !== expected[key]) {
      return fail(expected, { ...actual, error: `${key} 期望 ${expected[key]} 实测 ${counts[key]}` })
    }
  }
  return pass(expected, actual)
}

/* ------------------------------------------------------------------ */
/* A layer: Windows                                                    */
/* ------------------------------------------------------------------ */

async function runWindowsZipVersion(ctx) {
  const expected = { version: normalizeVersion(ctx.tag) }
  const picked = singleAsset(ctx.state.release, /-win-x64\.zip$/, 'portable zip')
  if (!picked.ok) return fail(expected, { error: picked.reason })
  const zip = assetPath(ctx, picked.asset)
  const root = ctx.path('windows-zip')
  ctx.world.mkdir(root)
  const unzip = ctx.exec('unzip', ['-q', zip, '-d', root])
  if (unzip.status !== 0) {
    return fail(expected, { error: `unzip 退出 ${unzip.status}`, stderr: unzip.stderr.trim() })
  }
  const exe = join(root, 'OpenCompare.exe')
  if (!ctx.world.exists(exe)) {
    return fail(expected, { error: `解压后找不到 OpenCompare.exe: ${root}` })
  }
  ctx.state.windowsExe = exe
  const version = ctx.exec('pwsh', [
    '-NoProfile',
    '-Command',
    `(Get-Item -LiteralPath '${exe.replace(/'/g, "''")}').VersionInfo.ProductVersion`
  ])
  if (version.status !== 0) {
    return fail(expected, { error: `读取 exe VersionInfo 退出 ${version.status}` })
  }
  const actual = { version: version.stdout.trim(), exe }
  if (!versionEqualsTag(actual.version, ctx.tag)) {
    return fail(expected, { ...actual, error: 'zip 内 exe 版本与 tag 不等' })
  }
  return pass(expected, actual)
}

async function runWindowsAuthenticode(ctx) {
  const expected = { status: 'Valid', nativeDialog: 'never driven' }
  const picked = singleAsset(ctx.state.release, /-Setup-.*\.exe$/, 'installer exe')
  if (!picked.ok) return fail(expected, { error: picked.reason })
  const exe = assetPath(ctx, picked.asset)
  const result = ctx.exec('pwsh', [
    '-NoProfile',
    '-Command',
    `$s = Get-AuthenticodeSignature -LiteralPath '${exe.replace(/'/g, "''")}'; $s.Status`
  ])
  const actual = { status: result.stdout.trim(), exe, exit: result.status }
  if (result.status !== 0) return fail(expected, actual)
  if (actual.status !== 'Valid') return fail(expected, actual)
  return pass(expected, actual)
}

/* ------------------------------------------------------------------ */
/* A layer: cancel leg                                                 */
/* ------------------------------------------------------------------ */

/** Wide synthetic pair: enough entries for a real, observable cancel point. */
function writeCancelTree(ctx) {
  const left = ctx.path('cancel/left')
  const right = ctx.path('cancel/right')
  ctx.world.mkdir(left)
  ctx.world.mkdir(right)
  for (let index = 0; index < CANCEL_TREE_FILES_PER_SIDE; index += 1) {
    const name = `entry-${String(index).padStart(6, '0')}.txt`
    const text = `cancel tree ${index}\n`
    ctx.world.writeText(join(left, name), text)
    ctx.world.writeText(join(right, name), text)
  }
  return { left, right }
}

function listRelative(ctx, root) {
  const found = []
  const walk = (current, prefix) => {
    let entries
    try {
      entries = ctx.world.readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const name = typeof entry === 'string' ? entry : entry.name
      const next = prefix === '' ? name : `${prefix}/${name}`
      found.push(next)
      const full = join(current, name)
      const isDirectory = typeof entry === 'string' ? ctx.world.isDirectory(full) : entry.isDirectory()
      if (isDirectory) walk(full, next)
    }
  }
  walk(root, '')
  return found.sort()
}

async function runCancelLeg(ctx) {
  const expected = {
    progress: 'observed then cancelled',
    operable: true,
    leftovers: 0,
    treeFilesPerSide: CANCEL_TREE_FILES_PER_SIDE
  }
  const appImage = ctx.state.linuxAppImage
  if (appImage === undefined) {
    return fail(expected, { error: '先决步骤 linux-appimage-version 未产出解包后的 AppImage' })
  }
  const tree = writeCancelTree(ctx)
  const before = { left: listRelative(ctx, tree.left), right: listRelative(ctx, tree.right) }
  const port = 9000 + Math.floor(Math.random() * 400)
  let launch
  let cancelledAt = null
  try {
    launch = await ctx.world.launchApp({
      command: 'xvfb-run',
      args: [
        '-a',
        appImage.binary,
        '--no-sandbox',
        tree.left,
        tree.right,
        `--remote-debugging-port=${port}`
      ],
      port,
      timeoutMs: 120_000
    })
    await launch.cdp.waitFor(PROGRESS_EXPRESSION, 'progress to appear', {
      timeoutMs: 120_000,
      intervalMs: 25
    })
    const clicked = await launch.cdp.evaluate(CANCEL_BUTTON_EXPRESSION)
    if (clicked !== true) {
      return fail(expected, { error: '进度条内没有取消按钮' })
    }
    cancelledAt = Date.now()
    await launch.cdp.waitFor(NO_PROGRESS_EXPRESSION, 'cancel to settle', {
      timeoutMs: 60_000,
      intervalMs: 50
    })
    const operable = await launch.cdp.evaluate(OPERABLE_EXPRESSION)
    const after = { left: listRelative(ctx, tree.left), right: listRelative(ctx, tree.right) }
    const afterLeft = new Set(after.left)
    const afterRight = new Set(after.right)
    const leftovers = [
      ...before.left.filter((name) => !afterLeft.has(name)),
      ...before.right.filter((name) => !afterRight.has(name)),
      ...after.left.filter((name) => name.endsWith('.tmp')),
      ...after.right.filter((name) => name.endsWith('.tmp'))
    ]
    const actual = {
      cancelledAt,
      operable,
      leftovers: leftovers.length,
      treeFilesPerSide: CANCEL_TREE_FILES_PER_SIDE
    }
    if (operable !== true) return fail(expected, { ...actual, error: '取消后未回到可操作态' })
    if (leftovers.length > 0) return fail(expected, { ...actual, leftovers })
    return pass(expected, actual)
  } catch (error) {
    return fail(expected, {
      cancelledAt,
      error: error instanceof Error ? error.message : String(error)
    })
  } finally {
    if (launch !== undefined) {
      ctx.state.cancelOutput = launch.output.join('')
      await launch.stop()
    }
  }
}

async function runCancelLogScan(ctx) {
  const expected = { pattern: String(CANCEL_NOISE_PATTERN), hits: 0 }
  const sources = []
  if (typeof ctx.state.cancelOutput === 'string') {
    sources.push({ source: 'cancel-leg stdout/stderr', text: ctx.state.cancelOutput })
  }
  const logsDir = join(ctx.outDir, 'logs')
  let names
  try {
    names = ctx.world.readdir(logsDir)
  } catch {
    names = []
  }
  for (const name of names) {
    if (!name.endsWith('.log')) continue
    sources.push({ source: join(logsDir, name), text: ctx.world.readText(join(logsDir, name)) })
  }
  const scanned = scanCancelNoise(sources)
  const actual = { sources: sources.length, hits: scanned.count, hitLines: scanned.hits }
  if (scanned.count > 0) return fail(expected, actual)
  return pass(expected, actual)
}

/* ------------------------------------------------------------------ */
/* A layer: evidence                                                   */
/* ------------------------------------------------------------------ */

async function runEvidenceEnvironment(ctx) {
  const expected = { keys: REQUIRED_ENVIRONMENT_KEYS, values: '记录且不为 unknown' }
  const problems = []
  for (const key of REQUIRED_ENVIRONMENT_KEYS) {
    const value = ctx.environment[key]
    if (typeof value !== 'string' || value.trim() === '') problems.push(`${key} 缺失`)
    else if (value === 'unknown') problems.push(`${key}=unknown 不得静默放行`)
  }
  const actual = { ...ctx.environment }
  if (problems.length > 0) return fail(expected, { ...actual, problems })
  return pass(expected, actual)
}

async function runEvidenceArtifacts(ctx) {
  const expected = { steps: '每份 step JSON 与日志存在且可解析' }
  const problems = []
  const written = ctx.state.written ?? []
  if (written.length === 0) problems.push('没有任何已写入的检查项')
  for (const entry of written) {
    for (const path of [entry.stepPath, entry.logPath]) {
      if (!ctx.world.exists(path)) {
        problems.push(`证据缺失: ${path}`)
        continue
      }
      if (path.endsWith('.json')) {
        try {
          const parsed = JSON.parse(ctx.world.readText(path))
          const verdict = validateStep(parsed)
          if (!verdict.ok) problems.push(...verdict.problems.map((item) => `${path}: ${item}`))
        } catch (error) {
          problems.push(`${path} 不可解析: ${error instanceof Error ? error.message : error}`)
        }
      }
    }
  }
  const actual = { steps: written.map((entry) => entry.id) }
  if (problems.length > 0) return fail(expected, { ...actual, problems })
  return pass(expected, actual)
}

/* ------------------------------------------------------------------ */
/* B layer                                                             */
/* ------------------------------------------------------------------ */

async function runLocalFixture(ctx) {
  const expected = { left: LOCAL_FIXTURE_ROOTS.left, right: LOCAL_FIXTURE_ROOTS.right }
  const problems = []
  for (const [side, root] of Object.entries(LOCAL_FIXTURE_ROOTS)) {
    if (!ctx.world.exists(root)) {
      problems.push(`${side} 目录不存在: ${root}`)
      continue
    }
    try {
      ctx.world.readdir(root)
    } catch (error) {
      problems.push(`${side} 目录不可读: ${root} (${error instanceof Error ? error.message : error})`)
    }
  }
  if (problems.length > 0) return fail(expected, { problems })
  return pass(expected, actualTreeTotals(ctx))
}

function actualTreeTotals(ctx) {
  return {
    left: listRelative(ctx, LOCAL_FIXTURE_ROOTS.left).length,
    right: listRelative(ctx, LOCAL_FIXTURE_ROOTS.right).length
  }
}

/** Relative path set of both sides; the four-state sum must equal its size. */
function countPairEntries(ctx, left, right) {
  const names = new Set([...listRelative(ctx, left), ...listRelative(ctx, right)])
  return names.size
}

async function prepareLocalApp(ctx, expected) {
  const picked = singleAsset(await ensureRelease(ctx), /\.dmg$/, 'dmg')
  if (!picked.ok) return { ok: false, failure: fail(expected, { error: picked.reason }) }
  const dmg = assetPath(ctx, picked.asset)
  const mountPoint = ctx.path('local-mount')
  const appDir = ctx.path('local-app')
  ctx.world.mkdir(mountPoint)
  ctx.world.mkdir(appDir)
  const attach = ctx.exec('hdiutil', [
    'attach',
    '-nobrowse',
    '-readonly',
    '-mountpoint',
    mountPoint,
    dmg
  ])
  if (attach.status !== 0) {
    return { ok: false, failure: fail(expected, { error: `hdiutil attach 退出 ${attach.status}` }) }
  }
  const appName = ctx.world.readdir(mountPoint).find((name) => name.endsWith('.app'))
  if (appName === undefined) {
    ctx.exec('hdiutil', ['detach', mountPoint])
    return { ok: false, failure: fail(expected, { error: '挂载点内没有 .app' }) }
  }
  const copy = ctx.exec('ditto', [join(mountPoint, appName), join(appDir, appName)])
  ctx.exec('hdiutil', ['detach', mountPoint])
  if (copy.status !== 0) {
    return { ok: false, failure: fail(expected, { error: `ditto 拷贝 .app 退出 ${copy.status}` }) }
  }
  return {
    ok: true,
    binary: join(appDir, appName, 'Contents', 'MacOS', 'OpenCompare'),
    app: join(appDir, appName)
  }
}

async function runLocalRounds(ctx) {
  const expected = { rounds: LOCAL_ROUND_COUNT, counts: '四态稳定且与总行数自洽' }
  const prepared = await prepareLocalApp(ctx, expected)
  if (!prepared.ok) return prepared.failure
  const { left, right } = LOCAL_FIXTURE_ROOTS
  const totalRows = countPairEntries(ctx, left, right)
  const port = 9800 + Math.floor(Math.random() * 90)
  const rounds = []
  let launch
  try {
    launch = await ctx.world.launchApp({
      command: prepared.binary,
      args: [left, right, `--remote-debugging-port=${port}`],
      port,
      timeoutMs: 180_000
    })
    for (let index = 1; index <= LOCAL_ROUND_COUNT; index += 1) {
      if (index > 1) {
        const opened = await launch.cdp.evaluate(OPEN_COMPARE_DIALOG_EXPRESSION)
        if (opened !== true) throw new Error('打不开新建对比对话框')
        const submitted = await launch.cdp.evaluate(OPEN_COMPARE_SUBMIT_EXPRESSION(left, right))
        if (submitted !== true) throw new Error('对话框内找不到左右路径输入框')
      }
      await launch.cdp.waitFor(READY_DIRECTORY_EXPRESSION, `round ${index} to settle`, {
        timeoutMs: 600_000
      })
      const counts = await launch.cdp.evaluate(FOUR_STATE_EXPRESSION)
      await launch.cdp.evaluate(CLOSE_ALL_SESSIONS_EXPRESSION)
      await launch.cdp.waitFor(
        `document.querySelectorAll('[data-session-tab]').length === 0 &&
          document.querySelectorAll('[role="tree"]').length === 0`,
        `round ${index} sessions to close`,
        { timeoutMs: 60_000 }
      )
      const closed = await launch.cdp.evaluate(SESSION_STATE_EXPRESSION)
      const uncollectedHeapBytes = await launch.readRetainedHeap()
      await launch.collectGarbage()
      await ctx.sleep(1000)
      const retainedHeapBytes = await launch.readRetainedHeap()
      const round = {
        index,
        counts,
        totalRows,
        closedTabs: closed?.tabs ?? null,
        closedTrees: closed?.trees ?? null,
        uncollectedHeapBytes,
        retainedHeapBytes
      }
      rounds.push(round)
      writeJsonAtomic(join(ctx.outDir, 'evidence', `round-${index}.json`), round)
    }
  } catch (error) {
    ctx.state.rounds = rounds
    return fail(
      expected,
      { rounds: rounds.length, error: error instanceof Error ? error.message : String(error) },
      rounds.map((round) => join(ctx.outDir, 'evidence', `round-${round.index}.json`))
    )
  } finally {
    if (launch !== undefined) await launch.stop()
  }
  ctx.state.rounds = rounds
  const evidence = rounds.map((round) => join(ctx.outDir, 'evidence', `round-${round.index}.json`))
  const verdict = judgeLocalRounds({ rounds })
  const actual = { rounds }
  if (!verdict.ok) return fail(expected, { ...actual, problems: verdict.problems }, evidence)
  return pass(expected, actual, evidence)
}

async function runLocalRetainedHeap(ctx) {
  const expected = { thresholdBytes: RETENTION_THRESHOLD_BYTES }
  const rounds = ctx.state.rounds ?? []
  const round2 = rounds.find((round) => round.index === 2)
  const round3 = rounds.find((round) => round.index === 3)
  const verdict = judgeRetainedHeap({
    round2RetainedBytes: round2?.retainedHeapBytes,
    round3RetainedBytes: round3?.retainedHeapBytes
  })
  const actual = {
    round2RetainedBytes: round2?.retainedHeapBytes ?? null,
    round3RetainedBytes: round3?.retainedHeapBytes ?? null,
    deltaBytes: verdict.delta,
    thresholdBytes: verdict.threshold,
    uncollectedHeapBytes: {
      round2: round2?.uncollectedHeapBytes ?? null,
      round3: round3?.uncollectedHeapBytes ?? null
    }
  }
  if (!verdict.ok) return fail(expected, { ...actual, problems: verdict.problems })
  return pass(expected, actual)
}

/* ------------------------------------------------------------------ */
/* Runner                                                              */
/* ------------------------------------------------------------------ */

function nowIso(now) {
  return now().toISOString()
}

/** Environment block of the summary; CI never substitutes `unknown`. */
export function buildEnvironment({ env = process.env, isCi = false, now = () => new Date() } = {}) {
  const pick = (key, fallback) => {
    const value = env[key]
    if (typeof value === 'string' && value.trim() !== '') return value
    return isCi ? '' : fallback
  }
  return {
    ImageOS: pick('ImageOS', `local-${process.platform}`),
    ImageVersion: pick('ImageVersion', `local-${process.platform}`),
    RUNNER_OS: pick('RUNNER_OS', process.platform),
    GITHUB_RUN_ID: pick('GITHUB_RUN_ID', `local-${now().getTime()}`)
  }
}

function isCiEnvironment(env) {
  return env.GITHUB_ACTIONS === 'true' || env.CI === 'true'
}

async function executeChecks({ checks, world, outDir, workRoot, tag, environment, state, stdout }) {
  const steps = []
  const stepsDir = join(outDir, 'steps')
  const logsDir = join(outDir, 'logs')
  mkdirSync(stepsDir, { recursive: true })
  mkdirSync(logsDir, { recursive: true })
  for (const [index, check] of checks.entries()) {
    const startedAt = new Date().toISOString()
    const ctx = createCheckContext({ world, tag, outDir, workRoot, state, environment })
    let outcome
    try {
      outcome = await check.run(ctx)
    } catch (error) {
      outcome = fail(
        { note: '检查未完成' },
        { error: error instanceof Error ? error.message : String(error) }
      )
    }
    const finishedAt = new Date().toISOString()
    const number = String(index + 1).padStart(2, '0')
    const logPath = join(logsDir, `${number}-${check.id}.log`)
    const body = [
      `# ${check.id} — ${check.name}`,
      `status: ${outcome.status}`,
      `command: ${check.command}`,
      `expected: ${JSON.stringify(outcome.expected)}`,
      `actual: ${JSON.stringify(outcome.actual)}`,
      '',
      ...ctx.log
    ].join('\n')
    writeFileSync(logPath, `${body}\n`, 'utf8')
    const stepPath = join(stepsDir, `${number}-${check.id}.json`)
    const evidence = [logPath, ...(Array.isArray(outcome.extraEvidence) ? outcome.extraEvidence : [])]
    const step = {
      id: check.id,
      name: check.name,
      command: check.command,
      expected: outcome.expected,
      actual: outcome.actual,
      status: outcome.status,
      evidence,
      startedAt,
      finishedAt
    }
    writeJsonAtomic(stepPath, step)
    state.written.push({ id: check.id, stepPath, logPath })
    steps.push(step)
    stdout(`${outcome.status.toUpperCase()} ${check.id}`)
  }
  return steps
}

function collectStepFiles(dir) {
  const found = []
  const walk = (current) => {
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (entry.name.endsWith('.json') && dirname(full).endsWith('steps')) found.push(full)
    }
  }
  walk(dir)
  return found.sort()
}

/**
 * `--aggregate`: merges every job's step JSON into one fail-closed summary.
 * The same id from several platform jobs is one check; a status disagreement
 * between jobs is a conflict and turns the aggregate red.
 */
function aggregateSteps(dir) {
  const byId = new Map()
  const conflicts = new Set()
  for (const path of collectStepFiles(dir)) {
    let step
    try {
      step = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      // An unparsable step file is a missing step: the id never shows up.
      continue
    }
    const existing = byId.get(step.id)
    if (existing === undefined) {
      byId.set(step.id, step)
      continue
    }
    if (existing.status !== step.status) conflicts.add(step.id)
  }
  return { steps: [...byId.values()], conflicts: [...conflicts] }
}

/**
 * A spike run always lands two files, pass or fail: `spike.json` holds the
 * verdict plus the closed-set `reason`, and `spike-launch.log` holds the raw
 * Electron / xvfb output and every `/json/list` probe. Both are written
 * atomically after the child is stopped, so a crash cannot swallow them.
 */
async function runSpike({
  tag,
  outDir,
  world,
  environment,
  stdout,
  env = process.env,
  platform = process.platform
}) {
  const startedAt = nowIso(() => new Date())
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const port = 9700 + Math.floor(Math.random() * 90)
  const home = join(outDir, 'spike-home')
  mkdirSync(home, { recursive: true })
  let electronBinary = env.ELECTRON_BINARY ?? ''
  let conclusion = 'window-booted'
  let error = null
  let url = null
  let reason = null
  let pendingReason = null
  let launch
  let diagnostics = {
    exitCode: null,
    signal: null,
    stdout: '',
    stderr: '',
    portProbe: []
  }
  try {
    if (electronBinary === '') {
      electronBinary = createRequire(import.meta.url)('electron')
    }
    const descriptor = buildSpikeLaunchDescriptor({ platform, port, root, electronBinary })
    launch = await world.launchApp({
      ...descriptor,
      processGroup: spikeUsesProcessGroup(platform),
      env: { HOME: home },
      port,
      timeoutMs: SPIKE_TARGET_TIMEOUT_MS
    })
    try {
      await launch.cdp.waitFor(APP_SHELL_EXPRESSION, 'the Electron window to boot', {
        timeoutMs: SPIKE_APP_SHELL_TIMEOUT_MS
      })
    } catch (shellCause) {
      pendingReason = 'app-shell-timeout'
      throw shellCause
    }
    url = launch.cdp.url ?? null
  } catch (cause) {
    conclusion = 'failed'
    error = cause instanceof Error ? cause.message : String(cause)
    const fromCause = cause?.diagnostics
    if (fromCause !== undefined) diagnostics = { ...diagnostics, ...fromCause }
    reason = fromCause?.reason ?? pendingReason ?? 'no-page-target'
  } finally {
    if (launch !== undefined) {
      if (typeof launch.diagnostics === 'function') {
        const final = launch.diagnostics()
        diagnostics = {
          ...diagnostics,
          ...final,
          portProbe: final.portProbe ?? diagnostics.portProbe
        }
      }
      await launch.stop()
    }
  }
  const record = {
    id: 'spike-window-boot',
    tag,
    conclusion,
    reason,
    url,
    error,
    exitCode: diagnostics.exitCode ?? null,
    signal: diagnostics.signal ?? null,
    stdout: diagnostics.stdout ?? '',
    stderr: diagnostics.stderr ?? '',
    portProbe: diagnostics.portProbe ?? [],
    environment,
    startedAt,
    finishedAt: nowIso(() => new Date())
  }
  writeJsonAtomic(join(outDir, 'spike.json'), record)
  writeTextAtomic(join(outDir, 'spike-launch.log'), formatSpikeLaunchLog(record))
  stdout(`spike ${conclusion}${error === null ? '' : `: ${error}`}`)
  return conclusion === 'window-booted' ? 0 : 1
}

const USAGE = [
  '用法:',
  '  node scripts/verify-release.mjs --tag=vX.Y.Z --layer=ci --out=<dir> [--platform=mac|linux|windows|all]',
  '  node scripts/verify-release.mjs --tag=vX.Y.Z --layer=local --out=<dir>',
  '  node scripts/verify-release.mjs --tag=vX.Y.Z --layer=ci --aggregate=<parts> --out=<dir>',
  '  node scripts/verify-release.mjs --tag=vX.Y.Z --layer=ci --spike --out=<dir>'
].join('\n')

/**
 * Deterministic CLI exit. Every evidence file is already written with sync
 * atomic writes before this runs, so the only thing left is the captured
 * stdout/stderr: wait for their queued writes to flush, then exit. A bounded
 * fallback timer keeps the exit deterministic even if a stream never drains.
 */
export function exitAfterFlush(code, { proc = process, timeoutMs = SPIKE_EXIT_FLUSH_TIMEOUT_MS } = {}) {
  proc.exitCode = code
  let finished = false
  let timer
  const finish = () => {
    if (finished) return
    finished = true
    if (timer !== undefined) clearTimeout(timer)
    proc.exit(code)
  }
  timer = setTimeout(finish, timeoutMs)
  const streams = [proc.stdout, proc.stderr].filter(
    (stream) => stream !== null && stream !== undefined && typeof stream.write === 'function'
  )
  let pending = streams.length
  if (pending === 0) {
    finish()
    return
  }
  const onFlushed = () => {
    pending -= 1
    if (pending === 0) finish()
  }
  for (const stream of streams) {
    try {
      stream.write('', onFlushed)
    } catch {
      onFlushed()
    }
  }
}

/**
 * CLI entry. Returns the process exit code; the summary is written atomically
 * only after every check has produced its own evidence.
 */
export async function runVerifyReleaseCli(argv = [], io = {}) {
  const stdout = io.stdout ?? ((line) => process.stdout.write(`${line}\n`))
  const stderr = io.stderr ?? ((line) => process.stderr.write(`${line}\n`))
  const parsed = parseArgs(argv)
  if (parsed.error !== undefined) {
    stderr(`verify-release ${parsed.error}`)
    stderr(USAGE)
    return 2
  }
  const options = parsed.options
  const outDir = resolve(options.out)
  const writable = ensureWritableDir(outDir)
  if (!writable.ok) {
    stderr(`verify-release --out 不可写: ${outDir} (${writable.reason})`)
    return 2
  }
  const env = io.env ?? process.env
  const now = io.now ?? (() => new Date())
  const environment = buildEnvironment({ env, isCi: isCiEnvironment(env), now })
  const world = io.world ?? createWorld({ env })

  if (options.spike === true) {
    return runSpike({
      tag: options.tag,
      outDir,
      world,
      environment,
      stdout,
      env,
      platform: io.platform ?? process.platform
    })
  }

  const platforms = options.aggregate !== undefined ? [...CI_PLATFORMS] : selectedPlatforms(options.platform)
  const expectedIds = expectedCheckIds({ layer: options.layer, platforms })
  const startedAt = nowIso(now)

  if (options.aggregate !== undefined) {
    const merged = aggregateSteps(resolve(options.aggregate))
    const summary = buildSummary({
      tag: options.tag,
      layer: 'ci',
      steps: merged.steps,
      environment,
      evidenceDir: outDir,
      expectedIds,
      duplicates: merged.conflicts,
      startedAt,
      finishedAt: nowIso(now)
    })
    const verdict = judgeReleaseGate(summary, { expectedIds })
    if (!verdict.ok) {
      summary.status = 'fail'
      summary.problems = verdict.problems
    }
    writeJsonAtomic(join(outDir, 'summary.json'), summary)
    stdout(
      `summary ${summary.status} pass=${summary.counts.pass} fail=${summary.counts.fail} ` +
        `skip=${summary.counts.skip} total=${summary.counts.total} expected=${summary.counts.expected}`
    )
    for (const id of summary.missing) stderr(`::error:: 缺少检查项 ${id}`)
    for (const id of summary.unexpected) stderr(`::error:: 多余检查项 ${id}`)
    return verdict.ok ? 0 : 1
  }

  const workRoot = mkdtempSync(join(tmpdir(), 'opencompare-verify-'))
  const state = { written: [] }
  let steps
  try {
    steps = await executeChecks({
      checks: checksFor({ layer: options.layer, platforms }),
      world,
      outDir,
      workRoot,
      tag: options.tag,
      environment,
      state,
      stdout
    })
  } finally {
    rmSync(workRoot, { recursive: true, force: true })
  }

  const summary = buildSummary({
    tag: options.tag,
    layer: options.layer,
    steps,
    environment,
    evidenceDir: outDir,
    expectedIds,
    manual: options.layer === 'local' ? MANUAL_NOT_COVERED.map((entry) => ({ ...entry })) : [],
    startedAt,
    finishedAt: nowIso(now)
  })
  const verdict = judgeReleaseGate(summary, { expectedIds })
  if (!verdict.ok) {
    summary.status = 'fail'
    summary.problems = verdict.problems
  }
  writeJsonAtomic(join(outDir, 'summary.json'), summary)
  stdout(
    `summary ${summary.status} pass=${summary.counts.pass} fail=${summary.counts.fail} ` +
      `skip=${summary.counts.skip} total=${summary.counts.total} expected=${summary.counts.expected}`
  )
  for (const id of summary.missing) stderr(`::error:: 缺少检查项 ${id}`)
  for (const id of summary.unexpected) stderr(`::error:: 多余检查项 ${id}`)
  for (const id of summary.skipped) stderr(`::error:: 检查项 skip 不允许: ${id}`)
  for (const problem of summary.problems ?? []) stderr(`::error:: ${problem}`)
  return verdict.ok ? 0 : 1
}

const invokedPath = process.argv[1] === undefined ? '' : resolve(process.argv[1])
if (invokedPath !== '' && invokedPath === fileURLToPath(import.meta.url)) {
  runVerifyReleaseCli(process.argv.slice(2)).then(
    (code) => {
      exitAfterFlush(code)
    },
    (error) => {
      process.stderr.write(`verify-release ${error instanceof Error ? error.message : error}\n`)
      exitAfterFlush(1)
    }
  )
}
