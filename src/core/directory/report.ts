/**
 * Self-contained directory report (pure, zero Electron / React / DOM).
 *
 * The renderer hands this module a *lazy* pre-order row source plus the totals
 * the comparison already carries, and gets back one offline HTML document plus
 * the numbers the caller must show/save. Nothing here reads the clock, the
 * locale or the DOM: `generatedAt`, `appVersion`, `htmlLang` and every string
 * are injected, so the same input always renders the same document.
 *
 * Safety properties enforced here rather than in the UI:
 * - every dynamic value is escaped and only ever lands in a text node;
 * - `://` is neutralised so a file name cannot smuggle a URL into the source;
 * - local roots are relative to their common ancestor by default, falling back
 *   to just the root names when that ancestor is a filesystem/drive root or a
 *   shared home prefix;
 * - row count and UTF-8 byte count are both hard-capped, with re-checkable
 *   truncation metadata.
 */
import type { DirectoryComparison, DirectoryDiffNode, FileDiffStatus } from './compare'
import { FILE_DIFF_STATUSES } from './compare'

/** Data rows (`<tr>`) one report may carry. */
export const DIRECTORY_REPORT_MAX_ROWS = 200_000

/** UTF-8 bytes of the final document, measured with `TextEncoder`. */
export const DIRECTORY_REPORT_MAX_BYTES = 10_000_000

/** One tree-table row; produced lazily from a comparison tree. */
export interface DirectoryReportRow {
  readonly name: string
  readonly relativePath: string
  readonly depth: number
  readonly kind: 'file' | 'directory'
  readonly status: FileDiffStatus
  readonly leftSize?: number
  readonly rightSize?: number
}

/** Everything the report shows besides the injected strings and settings. */
export interface DirectoryReportSource {
  readonly leftName: string
  readonly rightName: string
  readonly leftRoot: string
  readonly rightRoot: string
  readonly counts: Readonly<Record<FileDiffStatus, number>>
  /** Pre-order, tree-table order; consumed lazily, possibly only up to a cap. */
  readonly rows: Iterable<DirectoryReportRow>
  /** Data rows of the untruncated table (root + directories + files). */
  readonly totalRows: number
}

/** Caller-resolved copy; the core never picks a language. */
export interface DirectoryReportStrings {
  readonly title: string
  /** Fixed privacy reminder; rendered once, in the header, in both modes. */
  readonly privacyNotice: string
  readonly generatedAt: string
  readonly appVersion: string
  readonly leftRoot: string
  readonly rightRoot: string
  readonly limits: string
  readonly scopeAll: string
  readonly countsHeading: string
  readonly status: Readonly<Record<FileDiffStatus, string>>
  readonly columns: {
    readonly path: string
    readonly leftSize: string
    readonly rightSize: string
    readonly status: string
  }
  /** Contains `{shown}` and `{total}` placeholders. */
  readonly truncated: string
  readonly truncatedHint: string
  readonly empty: string
}

export interface DirectoryReportInput {
  readonly source: DirectoryReportSource
  readonly strings: DirectoryReportStrings
  readonly htmlLang: string
  readonly generatedAt: string
  readonly appVersion: string
  readonly hideLocalPaths: boolean
  readonly maxRows?: number
  readonly maxBytes?: number
}

export interface DirectoryReport {
  readonly html: string
  readonly bytes: number
  readonly totalRows: number
  readonly shownRows: number
  readonly truncatedRows: number
  readonly truncated: boolean
}

/* -------------------------------------------------------------------------- */
/* Escaping                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Escapes one dynamic value for a text node, then neutralises `://`.
 *
 * `&` is replaced first so the entities introduced afterwards are never
 * double-escaped. The `://` step runs last on purpose: it emits `&#47;` entities
 * that must survive as markup (the browser still renders `://`), which keeps
 * `http://` / `https://` literals out of the generated source.
 */
function escapeReportText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('://', ':&#47;&#47;')
}

/* -------------------------------------------------------------------------- */
/* Privacy: relative roots                                                     */
/* -------------------------------------------------------------------------- */

interface SplitPath {
  /** `'/'`, a drive letter, or `''` for a relative path. */
  readonly prefix: string
  readonly segments: readonly string[]
}

function splitAbsolutePath(raw: string): SplitPath {
  const normalized = raw.replaceAll('\\', '/')
  const drive = /^([A-Za-z]):\/?/.exec(normalized)
  if (drive !== null) {
    return {
      prefix: drive[1].toUpperCase(),
      segments: normalized.slice(drive[0].length).split('/').filter(Boolean)
    }
  }
  if (normalized.startsWith('/')) {
    return { prefix: '/', segments: normalized.split('/').filter(Boolean) }
  }
  return { prefix: '', segments: normalized.split('/').filter(Boolean) }
}

function lastSegment(path: SplitPath): string {
  return path.segments[path.segments.length - 1] ?? ''
}

/** Filesystem/drive roots and shared home levels that must not be exposed. */
function isSensitiveAncestor(ancestor: SplitPath): boolean {
  if (ancestor.segments.length === 0) return true
  if (ancestor.segments.length > 1) return false
  const only = (ancestor.segments[0] ?? '').toLowerCase()
  return ancestor.prefix !== '/' ? only === 'users' : only === 'users' || only === 'home'
}

function pathRootName(path: SplitPath, raw: string): string {
  return lastSegment(path) || raw
}

/**
 * Left/right labels for the report header. Default mode hides local paths:
 * both roots are shown relative to their common ancestor, except when that
 * ancestor is too shallow to be meaningful (filesystem root, `/Users`, `/home`,
 * `C:\Users`, drive root) or does not exist, in which case only the roots' own
 * names are shown. With `hideLocalPaths: false` the roots pass through as-is.
 */
function resolveReportRoots(
  leftRoot: string,
  rightRoot: string,
  hideLocalPaths: boolean
): { readonly left: string; readonly right: string } {
  if (!hideLocalPaths) return { left: leftRoot, right: rightRoot }

  const left = splitAbsolutePath(leftRoot)
  const right = splitAbsolutePath(rightRoot)
  let shared = 0
  if (left.prefix === right.prefix) {
    while (
      shared < left.segments.length &&
      shared < right.segments.length &&
      left.segments[shared] === right.segments[shared]
    ) {
      shared += 1
    }
  }

  const ancestor: SplitPath = {
    prefix: left.prefix,
    segments: left.segments.slice(0, shared)
  }
  if (shared === 0 || isSensitiveAncestor(ancestor)) {
    return { left: pathRootName(left, leftRoot), right: pathRootName(right, rightRoot) }
  }

  const leftRelative = left.segments.slice(shared).join('/')
  const rightRelative = right.segments.slice(shared).join('/')
  return {
    left: leftRelative || pathRootName(left, leftRoot),
    right: rightRelative || pathRootName(right, rightRoot)
  }
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                   */
/* -------------------------------------------------------------------------- */

/** Single source of the report's styles; no imports, fonts, URLs or scripts. */
const REPORT_STYLE = [
  ':root{color-scheme:light}',
  '*{box-sizing:border-box}',
  'body{margin:0;padding:32px 24px;background:#f5f6f8;color:#1b2029;font:13px/1.5 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}',
  'main{max-width:1080px;margin:0 auto}',
  'h1{margin:0 0 6px;font-size:20px;line-height:1.3}',
  'h2{margin:0 0 6px;font-size:13px;color:#4a5361}',
  'header{margin-bottom:20px}',
  '.privacy-notice{margin:0 0 12px;padding:8px 10px;border:1px solid #e0b45a;border-radius:6px;background:#fdf6e3;color:#6b4d10}',
  '.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:6px 24px;margin:0}',
  '.meta div{display:flex;gap:8px;min-width:0}',
  '.meta dt{color:#5c6675;white-space:nowrap}',
  '.meta dd{margin:0;overflow-wrap:anywhere;word-break:break-word}',
  '.truncated{margin:0 0 4px;font-weight:600;color:#8a5a00}',
  '.truncated-hint{margin:0 0 12px;color:#5c6675}',
  '.counts{margin:0 0 16px;padding:12px;border:1px solid #e2e6ec;border-radius:8px;background:#fff}',
  '.counts ul{display:flex;flex-wrap:wrap;gap:6px 20px;margin:0;padding:0;list-style:none}',
  '.count{display:flex;align-items:center;gap:6px}',
  '.count i,td i{display:inline-block;width:9px;height:9px;border-radius:2px;flex:none}',
  'td i{margin-right:6px}',
  '.count-value{font-weight:600;font-variant-numeric:tabular-nums}',
  '.scope{margin:6px 0 0;color:#5c6675}',
  '.empty{padding:24px;border:1px dashed #cdd3dc;border-radius:8px;text-align:center;color:#5c6675}',
  'table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e6ec}',
  'th,td{padding:4px 8px;border-bottom:1px solid #eceff3;text-align:left;vertical-align:top}',
  'th{font-weight:600;color:#5c6675;background:#f7f8fa;white-space:nowrap}',
  'td{overflow-wrap:anywhere;word-break:break-word}',
  'th.num,td:nth-child(2),td:nth-child(3){text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}',
  '.count-same i,td.s i{background:#6b7583}',
  '.count-added i,td.a i{background:#3fb950}',
  '.count-removed i,td.r i{background:#f2555a}',
  '.count-modified i,td.m i{background:#d8a13a}'
].join('')

/** Single-letter status class keeps the per-row markup inside the byte budget. */
const STATUS_CLASS: Readonly<Record<FileDiffStatus, string>> = {
  same: 's',
  added: 'a',
  removed: 'r',
  modified: 'm'
}

const EMPTY_SIZE = '—'

function fillCounts(template: string, shown: number, total: number): string {
  return template.replaceAll('{shown}', String(shown)).replaceAll('{total}', String(total))
}

function renderRow(row: DirectoryReportRow, strings: DirectoryReportStrings): string {
  const depth = Number.isFinite(row.depth) ? Math.max(0, Math.floor(row.depth)) : 0
  const indent = depth === 0 ? '' : ` style="padding-left:${Math.min(depth, 40) * 16}px"`
  const path = row.relativePath === '' ? row.name : row.relativePath
  const leftSize = row.leftSize === undefined ? EMPTY_SIZE : String(row.leftSize)
  const rightSize = row.rightSize === undefined ? EMPTY_SIZE : String(row.rightSize)
  const statusClass = STATUS_CLASS[row.status]
  // `</td>` / `</tr>` are omitted on purpose: HTML closes them at the next cell
  // or row, and the ~5 saved bytes per tag matter once 200k rows must also stay
  // inside the 10 MB byte cap.
  return (
    `<tr><td${indent}>${escapeReportText(path)}` +
    `<td>${leftSize}` +
    `<td>${rightSize}` +
    `<td class=${statusClass}><i></i>${escapeReportText(strings.status[row.status] ?? '')}`
  )
}

interface DocumentContext {
  readonly strings: DirectoryReportStrings
  readonly source: DirectoryReportSource
  readonly htmlLang: string
  readonly generatedAt: string
  readonly appVersion: string
  readonly roots: { readonly left: string; readonly right: string }
  readonly maxRows: number
  readonly maxBytes: number
  readonly empty: boolean
  readonly total: number
}

function renderPrefix(context: DocumentContext, shown: number): string {
  const { strings, source, roots, maxRows, maxBytes, empty, total } = context
  const lines = [
    '<!DOCTYPE html>',
    `<html lang="${escapeReportText(context.htmlLang)}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta name="opencompare-report-limits" content="rows=${maxRows};bytes=${maxBytes}">`,
    `<title>${escapeReportText(strings.title)}</title>`,
    `<style>${REPORT_STYLE}</style>`,
    '</head>',
    '<body>',
    '<main>',
    '<header>',
    `<h1>${escapeReportText(strings.title)}</h1>`,
    `<p class="privacy-notice">${escapeReportText(strings.privacyNotice)}</p>`,
    '<dl class="meta">',
    `<div><dt>${escapeReportText(strings.generatedAt)}</dt><dd class="meta-generated-at">${escapeReportText(context.generatedAt)}</dd></div>`,
    `<div><dt>${escapeReportText(strings.appVersion)}</dt><dd class="meta-app-version">${escapeReportText(context.appVersion)}</dd></div>`,
    `<div><dt>${escapeReportText(strings.leftRoot)}</dt><dd class="meta-left-root">${escapeReportText(roots.left)}</dd></div>`,
    `<div><dt>${escapeReportText(strings.rightRoot)}</dt><dd class="meta-right-root">${escapeReportText(roots.right)}</dd></div>`,
    `<div><dt>${escapeReportText(strings.limits)}</dt><dd class="meta-limits">${maxRows} / ${maxBytes}</dd></div>`,
    '</dl>'
  ]
  if (shown < total) {
    lines.push(
      `<p class="truncated">${escapeReportText(fillCounts(strings.truncated, shown, total))}</p>`,
      `<p class="truncated-hint">${escapeReportText(strings.truncatedHint)}</p>`
    )
  }
  lines.push(
    '</header>',
    `<section class="counts"><h2>${escapeReportText(strings.countsHeading)}</h2><ul>`
  )
  for (const status of FILE_DIFF_STATUSES) {
    lines.push(
      `<li class="count count-${status}"><i></i>` +
        `<span class="count-label">${escapeReportText(strings.status[status])}</span>` +
        `<span class="count-value">${source.counts[status] ?? 0}</span></li>`
    )
  }
  lines.push('</ul>', `<p class="scope">${escapeReportText(strings.scopeAll)}</p>`, '</section>')
  if (empty) {
    lines.push(`<p class="empty">${escapeReportText(strings.empty)}</p>`)
  } else {
    lines.push(
      '<table>',
      '<thead><tr>' +
        `<th>${escapeReportText(strings.columns.path)}</th>` +
        `<th class="num">${escapeReportText(strings.columns.leftSize)}</th>` +
        `<th class="num">${escapeReportText(strings.columns.rightSize)}</th>` +
        `<th>${escapeReportText(strings.columns.status)}</th>` +
        '</tr></thead>',
      '<tbody>'
    )
  }
  return lines.join('\n')
}

function renderSuffix(empty: boolean): string {
  return empty ? '</main></body></html>' : '</tbody></table></main></body></html>'
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const rounded = Math.floor(value)
  return Number.isFinite(rounded) && rounded > 0 ? rounded : fallback
}

function normalizeTotal(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

/**
 * Renders one directory report. The row source is consumed at most `maxRows`
 * times; the byte cap is then applied by rolling back to the last row whose
 * complete document (including the truncation notice) still fits.
 */
export function buildDirectoryReport(input: DirectoryReportInput): DirectoryReport {
  const { source, strings } = input
  const maxRows = normalizeLimit(input.maxRows, DIRECTORY_REPORT_MAX_ROWS)
  const maxBytes = normalizeLimit(input.maxBytes, DIRECTORY_REPORT_MAX_BYTES)
  const encoder = new TextEncoder()

  const collected: DirectoryReportRow[] = []
  let exhausted = false
  const iterator = source.rows[Symbol.iterator]()
  while (collected.length < maxRows) {
    const next = iterator.next()
    if (next.done === true) {
      exhausted = true
      break
    }
    collected.push(next.value)
  }

  // The caller's total is a promise, not a fact: when the source ends early we
  // trust what it produced, and when it promised fewer rows we drop the excess.
  let total = normalizeTotal(source.totalRows)
  if (exhausted && collected.length < total) total = collected.length
  if (collected.length > total) collected.length = total

  const empty = total === 0
  const context: DocumentContext = {
    strings,
    source,
    htmlLang: input.htmlLang,
    generatedAt: input.generatedAt,
    appVersion: input.appVersion,
    roots: resolveReportRoots(source.leftRoot, source.rightRoot, input.hideLocalPaths),
    maxRows,
    maxBytes,
    empty,
    total
  }

  const rowHtml: string[] = []
  for (const row of collected) rowHtml.push(renderRow(row, strings))

  const suffix = renderSuffix(empty)
  const suffixBytes = encoder.encode(suffix).length
  let shown = rowHtml.length
  let prefix = renderPrefix(context, shown)
  const wholeBytes =
    encoder.encode(prefix).length + encoder.encode(rowHtml.join('')).length + suffixBytes

  if (wholeBytes > maxBytes) {
    // Only the byte-capped path needs per-row weights; the row-capped path
    // stays at one encode of the whole document.
    const rowPrefixBytes: number[] = []
    let cumulativeBytes = 0
    for (const html of rowHtml) {
      cumulativeBytes += encoder.encode(html).length
      rowPrefixBytes.push(cumulativeBytes)
    }
    const fits = (count: number): boolean => {
      const prefixBytes = encoder.encode(renderPrefix(context, count)).length
      const rowsBytes = count === 0 ? 0 : (rowPrefixBytes[count - 1] ?? 0)
      return prefixBytes + rowsBytes + suffixBytes <= maxBytes
    }
    let low = 0
    let high = rowHtml.length
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (fits(middle)) low = middle
      else high = middle - 1
    }
    shown = low
    prefix = renderPrefix(context, shown)
  }

  const html = prefix + (shown === 0 ? '' : rowHtml.slice(0, shown).join('')) + suffix

  return {
    html,
    bytes: encoder.encode(html).length,
    totalRows: total,
    shownRows: shown,
    truncatedRows: total - shown,
    truncated: shown < total
  }
}

function* walkReportRows(node: DirectoryDiffNode, depth: number): Generator<DirectoryReportRow> {
  yield {
    name: node.name,
    relativePath: node.relativePath,
    depth,
    kind: node.kind,
    status: node.status,
    leftSize: node.leftSize,
    rightSize: node.rightSize
  }
  if (node.kind !== 'directory') return
  for (const child of node.children) yield* walkReportRows(child, depth + 1)
}

function countReportRows(node: DirectoryDiffNode): number {
  let count = 1
  if (node.kind === 'directory') {
    for (const child of node.children) count += countReportRows(child)
  }
  return count
}

/**
 * Projects a finished comparison onto the report source. The rows are a lazy
 * pre-order generator over the existing nodes (nothing is copied), and the node
 * total is computed on access so merely iterating a few rows never walks the
 * whole tree.
 */
export function directoryReportSource(comparison: DirectoryComparison): DirectoryReportSource {
  return {
    leftName: comparison.leftName,
    rightName: comparison.rightName,
    leftRoot: comparison.leftRoot,
    rightRoot: comparison.rightRoot,
    counts: comparison.counts,
    rows: walkReportRows(comparison.root, 0),
    get totalRows(): number {
      return countReportRows(comparison.root)
    }
  }
}
