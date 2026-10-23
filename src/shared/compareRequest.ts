/**
 * Shared contract for starting a comparison from the three entry points:
 * manual input, launch arguments and `opencompare://compare` URLs.
 *
 * Pure module: no Electron, DOM or Node file-system imports. Every entry point
 * receives `homeDir` / `baseDir` explicitly, so parsing is deterministic in
 * tests and the real file system is only reached through {@link PathProbe}.
 */
import { isSupportedComparisonFile } from './fileExtensions'
import type { PathProbeKind } from './platform/types'

export interface ComparePaths {
  readonly left: string
  readonly right: string
}

export type CompareKind = 'file' | 'directory'

/** Fully parsed + probed request; the only input later session builders need. */
export interface CompareRequest extends ComparePaths {
  readonly kind: CompareKind
}

export type CompareErrorCode =
  | 'MISSING_SIDE'
  | 'DUPLICATE_SIDE'
  | 'EMPTY_PATH'
  | 'UNKNOWN_SCHEME'
  | 'UNKNOWN_ACTION'
  | 'NOT_FOUND'
  | 'TYPE_MISMATCH'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'ACCESS_DENIED'

export interface CompareError {
  readonly code: CompareErrorCode
  readonly message: string
}

export type CompareResult =
  | { readonly ok: true; readonly request: CompareRequest }
  | { readonly ok: false; readonly error: CompareError }

/**
 * Payload the launch source (argv / `opencompare://`) hands to the renderer.
 * A failed intake carries only the readable reason, so the renderer reports it
 * without opening a session.
 */
export type CompareRequestPayload =
  | { readonly ok: true; readonly request: CompareRequest }
  | { readonly ok: false; readonly message: string }

export type ParsedComparePaths =
  | { readonly ok: true; readonly paths: ComparePaths }
  | { readonly ok: false; readonly error: CompareError }

/** Context passed by the caller; nothing is read from `process.env` or `os`. */
export interface PathContext {
  /** Expands a leading `~` / `~/…`; omitted → the tilde stays literal. */
  readonly homeDir?: string
  /** Resolves relative paths; omitted → the path stays relative (only lexically folded). */
  readonly baseDir?: string
  /**
   * Echo platform (`'win32'`, `'darwin'`, `'linux'`); omitted → paths are
   * echoed with `/` separators. Only affects error messages, never parsing.
   */
  readonly platform?: string
}

/** Minimal probe seam, backed by `PlatformPort.statPath`. */
export interface PathProbe {
  statPath(path: string): Promise<PathProbeKind>
}

export interface ResolveContext extends PathContext {
  readonly probe: PathProbe
}

type Side = 'left' | 'right'

const SIDES: readonly Side[] = ['left', 'right']

const SIDE_LABEL: Record<Side, string> = { left: '左侧', right: '右侧' }

const QUOTE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['"', '"'],
  ["'", "'"],
  ['“', '”'],
  ['‘', '’']
]

function failure(code: CompareErrorCode, message: string): {
  readonly ok: false
  readonly error: CompareError
} {
  return { ok: false, error: { code, message } }
}

function emptyPathMessage(side: Side): string {
  return `${SIDE_LABEL[side]}路径为空，请输入有效路径。`
}

function missingSideMessage(side: Side): string {
  return `缺少${SIDE_LABEL[side]}路径，请同时提供左侧与右侧两个路径。`
}

function duplicateSideMessage(side: Side): string {
  return `${SIDE_LABEL[side]}路径重复，只能提供一个${SIDE_LABEL[side]}路径。`
}

function accessDeniedMessage(side: Side, path: string): string {
  return `无法访问${SIDE_LABEL[side]}路径：${path}（权限不足或不可读）。`
}

function stripPairedQuotes(value: string): string {
  for (const [open, close] of QUOTE_PAIRS) {
    if (value.length >= open.length + close.length && value.startsWith(open) && value.endsWith(close)) {
      return value.slice(open.length, value.length - close.length)
    }
  }
  return value
}

function expandHome(value: string, homeDir: string | undefined): string {
  if (homeDir === undefined || homeDir === '') return value
  if (value === '~') return homeDir
  if (value.startsWith('~/')) return `${homeDir}/${value.slice(2)}`
  // `~user` is intentionally left untouched.
  return value
}

function absolutize(value: string, baseDir: string | undefined): string {
  const normalized = toPosixSeparators(value)
  if (isAbsolutePath(normalized)) return normalized
  if (baseDir === undefined || baseDir === '') return normalized
  // The base is normalised with the same rules; its root keeps its only slash.
  const base = toPosixSeparators(baseDir).replace(/\/+$/, '')
  return base === '' ? `/${normalized}` : `${base}/${normalized}`
}

/**
 * Windows accepts both separators, so every `\` becomes the canonical `/`
 * before anything is classified. The drive letter keeps its original case.
 */
function toPosixSeparators(value: string): string {
  return value.replace(/\\/g, '/')
}

/**
 * Absolute after separator normalisation: POSIX `/…`, UNC `//server/share…`
 * and drive-letter `C:/…` (including `C:/`). Drive-relative `C:foo` is not
 * absolute and is therefore resolved against `baseDir` like any other segment.
 */
function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:\//.test(value)
}

/**
 * Splits a `/`-separated path into the immutable root (`/`, `C:/`,
 * `//server/share`) and the remainder that `.` / `..` may fold.
 */
function splitPathRoot(value: string): { readonly root: string; readonly rest: string } {
  if (value.startsWith('//')) {
    const parts = value.slice(2).split('/')
    const server = parts[0] ?? ''
    if (server === '') return { root: '/', rest: value.slice(1) }
    const share = parts[1] ?? ''
    const rootParts = share === '' ? [server] : [server, share]
    return { root: `//${rootParts.join('/')}`, rest: parts.slice(rootParts.length).join('/') }
  }
  const drive = /^([A-Za-z]):\//.exec(value)
  if (drive !== null) return { root: `${drive[1]}:/`, rest: value.slice(3) }
  if (value.startsWith('/')) return { root: '/', rest: value.slice(1) }
  return { root: '', rest: value }
}

/**
 * Lexical `.` / `..` folding; never touches the file system or the case.
 * `..` never climbs above `/`, a drive root or a UNC share root.
 */
function foldPath(value: string): string {
  const { root, rest } = splitPathRoot(value)
  const segments: string[] = []
  for (const segment of rest.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (segments.length > 0 && segments[segments.length - 1] !== '..') segments.pop()
      else if (root === '') segments.push('..')
      continue
    }
    segments.push(segment)
  }
  const body = segments.join('/')
  if (root === '') return body
  if (root.endsWith('/')) return `${root}${body}`
  return body === '' ? root : `${root}/${body}`
}

/** Trims, strips paired quotes, expands `~`, resolves against `baseDir`, folds segments. */
function normalizePathValue(raw: string, context: PathContext): string | null {
  const trimmed = raw.trim()
  const unquoted = stripPairedQuotes(trimmed).trim()
  if (unquoted === '') return null
  const folded = foldPath(absolutize(expandHome(unquoted, context.homeDir), context.baseDir))
  return folded === '' ? null : folded
}

/**
 * Renders a canonical `/`-separated path the way the platform writes it.
 * Off Windows the canonical form is already the display form.
 */
export function toDisplayPath(path: string, platform?: string): string {
  return platform === 'win32' ? path.replace(/\//g, '\\') : path
}

/**
 * Side structure check shared by URL and argv parsing, in the frozen error
 * precedence: EMPTY_PATH → DUPLICATE_SIDE → MISSING_SIDE, left side first.
 */
function checkSideValues(values: Record<Side, readonly string[]>): CompareError | null {
  for (const side of SIDES) {
    if (values[side].some((value) => value.trim() === '')) {
      return { code: 'EMPTY_PATH', message: emptyPathMessage(side) }
    }
  }
  for (const side of SIDES) {
    if (values[side].length > 1) {
      return { code: 'DUPLICATE_SIDE', message: duplicateSideMessage(side) }
    }
  }
  for (const side of SIDES) {
    if (values[side].length === 0) {
      return { code: 'MISSING_SIDE', message: missingSideMessage(side) }
    }
  }
  return null
}

/** Decodes one query value; malformed escapes fall back to the literal text. */
function decodeUrlValue(value: string): string {
  // `+` is form-encoding for a space; `%2B` still decodes to a literal plus.
  const plusDecoded = value.replace(/\+/g, ' ')
  try {
    return decodeURIComponent(plusDecoded)
  } catch {
    return plusDecoded
  }
}

function collectQuerySides(query: string): Record<Side, string[]> {
  const values: Record<Side, string[]> = { left: [], right: [] }
  for (const part of query.split('&')) {
    if (part === '') continue
    const equals = part.indexOf('=')
    const key = equals === -1 ? part : part.slice(0, equals)
    if (key !== 'left' && key !== 'right') continue
    values[key].push(equals === -1 ? '' : part.slice(equals + 1))
  }
  return values
}

interface UrlHead {
  readonly scheme: string
  readonly action: string
}

function parseUrlHead(value: string): UrlHead | null {
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)/.exec(value)
  if (!match) return null
  return { scheme: match[1].toLowerCase(), action: match[2].toLowerCase() }
}

function parseUrlHeadResult(head: UrlHead | null): CompareError | null {
  if (head === null) {
    return {
      code: 'UNKNOWN_SCHEME',
      message: '不支持的链接协议，仅支持 opencompare://compare?left=…&right=…。'
    }
  }
  if (head.scheme !== 'opencompare') {
    return {
      code: 'UNKNOWN_SCHEME',
      message: `不支持的链接协议「${head.scheme}」，仅支持 opencompare://compare?left=…&right=…。`
    }
  }
  if (head.action !== 'compare') {
    return {
      code: 'UNKNOWN_ACTION',
      message: `未知的链接操作「${head.action}」，仅支持 compare。`
    }
  }
  return null
}

function normalizeSides(
  values: Record<Side, string[]>,
  context: PathContext,
  decode: boolean
): ComparePaths | CompareError {
  const left = normalizePathValue(decode ? decodeUrlValue(values.left[0]) : values.left[0], context)
  if (left === null) return { code: 'EMPTY_PATH', message: emptyPathMessage('left') }
  const right = normalizePathValue(decode ? decodeUrlValue(values.right[0]) : values.right[0], context)
  if (right === null) return { code: 'EMPTY_PATH', message: emptyPathMessage('right') }
  return { left, right }
}

function isCompareError(value: ComparePaths | CompareError): value is CompareError {
  return 'code' in value
}

/**
 * Parses `opencompare://compare?left=<encoded>&right=<encoded>`.
 *
 * Percent escapes and `+` are decoded, then the paths are normalised. Duplicate
 * detection happens on the raw query, before decoding.
 */
export function parseCompareUrl(input: string, context: PathContext = {}): ParsedComparePaths {
  const raw = typeof input === 'string' ? input : ''
  const queryIndex = raw.indexOf('?')
  const headPart = queryIndex === -1 ? raw : raw.slice(0, queryIndex)
  const query = queryIndex === -1 ? '' : raw.slice(queryIndex + 1).split('#')[0]

  const values = collectQuerySides(query)
  const sideError = checkSideValues(values)
  if (sideError !== null) return { ok: false, error: sideError }

  const headError = parseUrlHeadResult(parseUrlHead(headPart))
  if (headError !== null) return { ok: false, error: headError }

  const normalized = normalizeSides(values, context, true)
  if (isCompareError(normalized)) return { ok: false, error: normalized }
  return { ok: true, paths: normalized }
}

function looksLikeExecutable(value: string): boolean {
  const base = value.slice(Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\')) + 1).toLowerCase()
  if (base === 'electron' || base === 'electron.exe' || base === 'opencompare' || base === 'opencompare.exe') {
    return true
  }
  return value.includes('.app/Contents/MacOS/')
}

/**
 * Drops a leading executable path so a bare pair still works when the caller
 * hands over the raw `process.argv` (packaged app or `pnpm dev`).
 */
function withoutExecutable(positionals: readonly string[]): readonly string[] {
  if (positionals.length <= 2) return positionals
  return looksLikeExecutable(positionals[0]) ? positionals.slice(1) : positionals
}

/**
 * Parses launch arguments.
 *
 * `--left <path>` / `--left=<path>` (and the right counterparts) are
 * authoritative; every other switch and positional argument is ignored. With
 * no side flags, exactly two positional arguments are used as the pair.
 */
export function parseCompareArgv(
  argv: readonly string[],
  context: PathContext = {}
): ParsedComparePaths {
  const args = Array.isArray(argv)
    ? argv.filter((argument): argument is string => typeof argument === 'string')
    : []
  const values: Record<Side, string[]> = { left: [], right: [] }
  const positionals: string[] = []
  let sawSideFlag = false

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--left' || argument === '--right') {
      const side: Side = argument === '--left' ? 'left' : 'right'
      sawSideFlag = true
      const next = args[index + 1]
      if (next !== undefined && !next.startsWith('--')) {
        values[side].push(next)
        index += 1
      } else {
        values[side].push('')
      }
      continue
    }
    if (argument.startsWith('--left=')) {
      sawSideFlag = true
      values.left.push(argument.slice('--left='.length))
      continue
    }
    if (argument.startsWith('--right=')) {
      sawSideFlag = true
      values.right.push(argument.slice('--right='.length))
      continue
    }
    if (argument.startsWith('-')) continue
    positionals.push(argument)
  }

  if (!sawSideFlag) {
    const pair = withoutExecutable(positionals)
    if (pair.length >= 1) values.left.push(pair[0])
    if (pair.length >= 2) values.right.push(pair[1])
  }

  const sideError = checkSideValues(values)
  if (sideError !== null) return { ok: false, error: sideError }

  const normalized = normalizeSides(values, context, false)
  if (isCompareError(normalized)) return { ok: false, error: normalized }
  return { ok: true, paths: normalized }
}

/** Parses the two strings typed / pasted into the manual entry point. */
export function parseManualPaths(
  left: string,
  right: string,
  context: PathContext = {}
): ParsedComparePaths {
  const leftValue = normalizePathValue(typeof left === 'string' ? left : '', context)
  if (leftValue === null) return { ok: false, error: { code: 'EMPTY_PATH', message: emptyPathMessage('left') } }
  const rightValue = normalizePathValue(typeof right === 'string' ? right : '', context)
  if (rightValue === null) {
    return { ok: false, error: { code: 'EMPTY_PATH', message: emptyPathMessage('right') } }
  }
  return { ok: true, paths: { left: leftValue, right: rightValue } }
}

type ProbeOutcome =
  | { readonly ok: true; readonly kind: PathProbeKind }
  | { readonly ok: false }

async function probeSide(path: string, probe: PathProbe): Promise<ProbeOutcome> {
  try {
    return { ok: true, kind: await probe.statPath(path) }
  } catch {
    // Permission and transport errors both surface as "unreadable" here; the
    // underlying exception is never leaked to the caller.
    return { ok: false }
  }
}

function describeKind(kind: CompareKind): string {
  return kind === 'file' ? '文件' : '目录'
}

function notFoundMessage(side: Side, path: string): string {
  return `${SIDE_LABEL[side]}路径不存在：${path}`
}

function typeMismatchMessage(
  left: string,
  right: string,
  leftKind: CompareKind,
  rightKind: CompareKind
): string {
  return `左右两侧类型不一致：左侧是${describeKind(leftKind)}（${left}），右侧是${describeKind(rightKind)}（${right}）。`
}

function unsupportedFileMessage(side: Side, path: string): string {
  return `不支持的文件类型：${SIDE_LABEL[side]}「${path}」。支持代码/文本、CSV/TSV、JSON/YAML 文件。`
}

/**
 * Resolves raw paths into a validated {@link CompareRequest}: normalises both
 * sides, probes each exactly once, then applies the frozen error precedence
 * NOT_FOUND → TYPE_MISMATCH → UNSUPPORTED_FILE_TYPE, left side first.
 */
export async function resolveCompareRequest(
  paths: ComparePaths,
  context: ResolveContext
): Promise<CompareResult> {
  const left = normalizePathValue(typeof paths.left === 'string' ? paths.left : '', context)
  if (left === null) return failure('EMPTY_PATH', emptyPathMessage('left'))
  const right = normalizePathValue(typeof paths.right === 'string' ? paths.right : '', context)
  if (right === null) return failure('EMPTY_PATH', emptyPathMessage('right'))

  // Errors echo paths the way the caller's platform writes them; the request
  // itself always keeps the canonical `/` form.
  const display = (path: string): string => toDisplayPath(path, context.platform)

  const leftProbe = await probeSide(left, context.probe)
  if (!leftProbe.ok) return failure('ACCESS_DENIED', accessDeniedMessage('left', display(left)))
  const rightProbe = await probeSide(right, context.probe)
  if (!rightProbe.ok) return failure('ACCESS_DENIED', accessDeniedMessage('right', display(right)))

  if (leftProbe.kind === 'missing') {
    return failure('NOT_FOUND', notFoundMessage('left', display(left)))
  }
  if (rightProbe.kind === 'missing') {
    return failure('NOT_FOUND', notFoundMessage('right', display(right)))
  }

  const leftKind: CompareKind = leftProbe.kind === 'directory' ? 'directory' : 'file'
  const rightKind: CompareKind = rightProbe.kind === 'directory' ? 'directory' : 'file'
  if (leftKind !== rightKind) {
    return failure(
      'TYPE_MISMATCH',
      typeMismatchMessage(display(left), display(right), leftKind, rightKind)
    )
  }

  if (leftKind === 'file') {
    if (!isSupportedComparisonFile(left)) {
      return failure('UNSUPPORTED_FILE_TYPE', unsupportedFileMessage('left', display(left)))
    }
    if (!isSupportedComparisonFile(right)) {
      return failure('UNSUPPORTED_FILE_TYPE', unsupportedFileMessage('right', display(right)))
    }
  }

  return { ok: true, request: { left, right, kind: leftKind } }
}
