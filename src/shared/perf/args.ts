/**
 * CLI parsing and validation of the directory memory harness.
 *
 * Activation deliberately needs **both** an explicit flag and an environment
 * variable, so a normal launch (`opencompare --left A --right B`, which is the
 * launch-source comparison) can never be mistaken for a measurement run.
 */
import type { PerfHarnessConfig, PerfProfileName } from './types'

/** Flag the harness scripts pass; a normal app launch never carries it. */
export const PERF_HARNESS_FLAG = '--perf-harness'
/** Environment variable the harness scripts set. */
export const PERF_ENV_VAR = 'OPENCOMPARE_PERF'

export const DEFAULT_PERF_ROUNDS = 3
export const DEFAULT_PERF_INTERVAL_MS = 1000
export const MAX_PERF_INTERVAL_MS = 2000

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

/**
 * Parses `--left --right [--rounds] [--interval] [--out] [--profile]
 * [--fail-on-violation] [--perf-harness]`, then verifies both roots are readable
 * directories. Unknown flags and stray positionals are rejected by name so a
 * typo never silently measures the wrong tree.
 */
export async function parsePerfArgs(
  argv: readonly string[],
  probe: PerfArgProbe
): Promise<PerfArgResult> {
  let left: string | undefined
  let right: string | undefined
  let out: string | undefined
  let rounds: number | string = DEFAULT_PERF_ROUNDS
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
      if (flag === '--left') left = value
      else if (flag === '--right') right = value
      else out = value
      continue
    }
    if (flag === '--rounds') {
      const value = inline ?? rest[index + 1]
      if (inline === undefined) index += 1
      rounds = parsePositiveInteger(flag, value)
      if (typeof rounds === 'string') return { ok: false, error: rounds }
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

  if (left === undefined) return { ok: false, error: '缺少 --left <目录>。' }
  if (right === undefined) return { ok: false, error: '缺少 --right <目录>。' }
  if (out === undefined) return { ok: false, error: '缺少 --out <证据文件>。' }

  if (!(await probe.isReadableDirectory(left))) {
    return { ok: false, error: `--left 根目录不存在或不可读：${left}` }
  }
  if (!(await probe.isReadableDirectory(right))) {
    return { ok: false, error: `--right 根目录不存在或不可读：${right}` }
  }

  return {
    ok: true,
    config: { left, right, rounds, intervalMs, out, profile, failOnViolation }
  }
}
