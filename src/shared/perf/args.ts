/**
 * CLI parsing and validation of the directory memory harness.
 *
 * Activation deliberately needs **both** an explicit flag and an environment
 * variable, so a normal launch (`opencompare --left A --right B`, which is the
 * launch-source comparison) can never be mistaken for a measurement run.
 */
import type { PerfHarnessConfig, PerfMode, PerfPair, PerfProfileName } from './types'

/** Flag the harness scripts pass; a normal app launch never carries it. */
export const PERF_HARNESS_FLAG = '--perf-harness'
/** Environment variable the harness scripts set. */
export const PERF_ENV_VAR = 'OPENCOMPARE_PERF'

export const PERF_MODES: readonly PerfMode[] = ['upsert', 'multisession', 'retained']
export const DEFAULT_PERF_ROUNDS = 3
export const DEFAULT_PERF_INTERVAL_MS = 1000
export const DEFAULT_PERF_HOT_ROUNDS = 2
export const MAX_PERF_INTERVAL_MS = 2000
export const DEFAULT_PERF_SETTLE_MS = 20_000
export const MAX_PERF_SETTLE_MS = 60_000

/** True only when the flag and the environment variable are both present. */
export function isPerfHarnessActive(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>
): boolean {
  return env[PERF_ENV_VAR] === '1' && argv.includes(PERF_HARNESS_FLAG)
}

export interface PerfArgProbe {
  /** True when the path exists, is a directory and can be listed. */
  readonly isReadableDirectory: (path: string) => Promise<boolean>
}

export type PerfArgResult =
  | { readonly ok: true; readonly config: PerfHarnessConfig }
  | { readonly ok: false; readonly error: string }

const PROFILES: readonly PerfProfileName[] = ['real', 'gate']

function parsePositiveInteger(flag: string, value: string | undefined): number | string {
  if (value === undefined || value === '') return `${flag} 需要一个正整数。`
  if (!/^\d+$/.test(value)) return `${flag} 必须是正整数，收到「${value}」。`
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return `${flag} 必须是正整数，收到「${value}」。`
  }
  return parsed
}

function parseNonNegativeInteger(flag: string, value: string | undefined): number | string {
  if (value === undefined || value === '') return `${flag} 需要以毫秒计的整数。`
  if (!/^\d+$/.test(value)) return `${flag} 必须是非负整数，收到「${value}」。`
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return `${flag} 必须是非负整数，收到「${value}」。`
  }
  return parsed
}

/**
 * Parses `--mode --left --right [--rounds] [--settle] [--interval] [--out]
 * [--profile] [--fail-on-violation] [--perf-harness]`.
 *
 * `--left` / `--right` are repeatable and pair up by position. `upsert` takes
 * exactly one pair (the legacy command line); `multisession` takes at least two
 * and one round per pair. Both roots of every pair are verified readable
 * directories. Unknown flags and stray positionals are rejected by name so a
 * typo never silently measures the wrong tree.
 */
export async function parsePerfArgs(
  argv: readonly string[],
  probe: PerfArgProbe
): Promise<PerfArgResult> {
  const lefts: string[] = []
  const rights: string[] = []
  let out: string | undefined
  let mode: PerfMode = 'upsert'
  let rounds: number | undefined
  let hotRounds: number | string = DEFAULT_PERF_HOT_ROUNDS
  let hotRoundsProvided = false
  let settleMs: number | string = DEFAULT_PERF_SETTLE_MS
  let intervalMs: number | string = DEFAULT_PERF_INTERVAL_MS
  let profile: PerfProfileName = 'real'
  let failOnViolation = false

  const args = [...argv]
  // Electron prepends its executable and, in a dev run, the app entry; neither
  // starts with a dash. Ignore those leading positionals, reject later ones.
  const firstFlag = args.findIndex((argument) => argument.startsWith('-'))
  const leading = firstFlag === -1 ? args.length : firstFlag
  const rest = args.slice(leading)

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index]
    const [flag, inline] = argument.includes('=')
      ? [argument.slice(0, argument.indexOf('=')), argument.slice(argument.indexOf('=') + 1)]
      : [argument, undefined]

    if (flag === PERF_HARNESS_FLAG) continue
    if (flag === '--fail-on-violation') {
      failOnViolation = true
      continue
    }
    if (flag === '--left' || flag === '--right' || flag === '--out') {
      const value = inline ?? rest[index + 1]
      if (inline === undefined) index += 1
      if (value === undefined || value === '' || value.startsWith('--')) {
        return { ok: false, error: `${flag} 缺少参数值。` }
      }
      if (flag === '--left') lefts.push(value)
      else if (flag === '--right') rights.push(value)
      else out = value
      continue
    }
    if (flag === '--mode') {
      const value = inline ?? rest[index + 1]
      if (inline === undefined) index += 1
      if (value === undefined || !PERF_MODES.includes(value as PerfMode)) {
        return {
          ok: false,
          error: `${flag} 只接受 ${PERF_MODES.join(' / ')}，收到「${value ?? ''}」。`
        }
      }
      mode = value as PerfMode
      continue
    }
    if (flag === '--rounds') {
      const value = inline ?? rest[index + 1]
      if (inline === undefined) index += 1
      const parsed = parsePositiveInteger(flag, value)
      if (typeof parsed === 'string') return { ok: false, error: parsed }
      rounds = parsed
      continue
    }
    if (flag === '--hot-rounds') {
      const value = inline ?? rest[index + 1]
      if (inline === undefined) index += 1
      const parsed = parsePositiveInteger(flag, value)
      if (typeof parsed === 'string') return { ok: false, error: parsed }
      hotRounds = parsed
      hotRoundsProvided = true
      continue
    }
    if (flag === '--settle') {
      const value = inline ?? rest[index + 1]
      if (inline === undefined) index += 1
      const parsed = parseNonNegativeInteger(flag, value)
      if (typeof parsed === 'string') return { ok: false, error: parsed }
      if (parsed > MAX_PERF_SETTLE_MS) {
        return {
          ok: false,
          error: `${flag} 不能大于 ${MAX_PERF_SETTLE_MS}ms（静置等待上限）。`
        }
      }
      settleMs = parsed
      continue
    }
    if (flag === '--interval') {
      const value = inline ?? rest[index + 1]
      if (inline === undefined) index += 1
      const parsed = parsePositiveInteger(flag, value)
      if (typeof parsed === 'string') return { ok: false, error: parsed }
      if (parsed > MAX_PERF_INTERVAL_MS) {
        return {
          ok: false,
          error: `${flag} 不能大于 ${MAX_PERF_INTERVAL_MS}ms（周期采样间隔上限）。`
        }
      }
      intervalMs = parsed
      continue
    }
    if (flag === '--profile') {
      const value = inline ?? rest[index + 1]
      if (inline === undefined) index += 1
      if (value === undefined || !PROFILES.includes(value as PerfProfileName)) {
        return { ok: false, error: `${flag} 只接受 ${PROFILES.join(' / ')}，收到「${value ?? ''}」。` }
      }
      profile = value as PerfProfileName
      continue
    }
    return { ok: false, error: `未知参数：${argument}。` }
  }

  if (lefts.length === 0) return { ok: false, error: '缺少 --left <目录>。' }
  if (rights.length === 0) return { ok: false, error: '缺少 --right <目录>。' }
  if (out === undefined) return { ok: false, error: '缺少 --out <证据文件>。' }
  if (lefts.length !== rights.length) {
    return {
      ok: false,
      error: `--left 与 --right 数量不一致（左 ${lefts.length} / 右 ${rights.length}）。`
    }
  }

  const pairs: PerfPair[] = lefts.map((left, index) => ({ left, right: rights[index] }))
  if (mode === 'upsert') {
    if (pairs.length !== 1) {
      return { ok: false, error: '--mode upsert 只接受 1 对 --left / --right。' }
    }
    if (hotRoundsProvided) {
      return { ok: false, error: '--hot-rounds 只用于 --mode retained。' }
    }
    hotRounds = 0
  } else if (mode === 'multisession') {
    if (pairs.length < 2) {
      return { ok: false, error: '--mode multisession 至少需要 2 对 --left / --right。' }
    }
    if (rounds !== undefined && rounds !== pairs.length) {
      return {
        ok: false,
        error: `--mode multisession 的 --rounds 必须等于对数（${pairs.length}），收到 ${rounds}。`
      }
    }
    if (hotRoundsProvided) {
      return { ok: false, error: '--hot-rounds 只用于 --mode retained。' }
    }
    hotRounds = 0
  } else {
    if (pairs.length < 2) {
      return { ok: false, error: '--mode retained 至少需要 2 对 --left / --right。' }
    }
    if (rounds !== undefined && rounds !== pairs.length) {
      return {
        ok: false,
        error: `--mode retained 的 --rounds 必须等于对数（${pairs.length}），收到 ${rounds}。`
      }
    }
    if (typeof hotRounds !== 'number') return { ok: false, error: hotRounds }
  }
  const roundCount = rounds ?? (mode === 'upsert' ? DEFAULT_PERF_ROUNDS : pairs.length)

  for (const pair of pairs) {
    if (!(await probe.isReadableDirectory(pair.left))) {
      return { ok: false, error: `--left 根目录不存在或不可读：${pair.left}` }
    }
    if (!(await probe.isReadableDirectory(pair.right))) {
      return { ok: false, error: `--right 根目录不存在或不可读：${pair.right}` }
    }
  }

  return {
    ok: true,
    config: {
      mode,
      pairs,
      left: pairs[0].left,
      right: pairs[0].right,
      rounds: roundCount,
      hotRounds: typeof hotRounds === 'number' ? hotRounds : DEFAULT_PERF_HOT_ROUNDS,
      settleMs,
      intervalMs,
      out,
      profile,
      failOnViolation
    }
  }
}
