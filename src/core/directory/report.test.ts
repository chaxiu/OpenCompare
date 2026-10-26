// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { htmlLang } from '@renderer/i18n/htmlLang'
import { APP_VERSION } from '@shared/appVersion'
import type { DirectoryComparison, DirectoryDiffNode, FileDiffStatus } from './compare'
import {
  DIRECTORY_REPORT_MAX_BYTES,
  DIRECTORY_REPORT_MAX_ROWS,
  buildDirectoryReport,
  directoryReportSource
} from './report'
import type {
  DirectoryReport,
  DirectoryReportInput,
  DirectoryReportRow,
  DirectoryReportSource,
  DirectoryReportStrings
} from './report'

const STRINGS: DirectoryReportStrings = {
  title: '目录对比报告',
  privacyNotice: '由本机生成，分享前自查路径',
  generatedAt: '生成时间',
  appVersion: '应用版本',
  leftRoot: '左根',
  rightRoot: '右根',
  limits: '上限',
  scopeAll: '统计口径：全部条目（不受当前过滤影响）',
  countsHeading: '四态计数',
  status: { same: '相同', added: '新增', removed: '删除', modified: '修改' },
  columns: { path: '路径', leftSize: '左侧大小', rightSize: '右侧大小', status: '状态' },
  truncated: '已展示 {shown} / 原始 {total}（已截断）',
  truncatedHint: '截断处子树不全，完整清单请在本机查看。',
  empty: '没有可展示的条目。'
}

const ZERO_COUNTS: Record<FileDiffStatus, number> = {
  same: 2,
  added: 1,
  removed: 0,
  modified: 0
}

function makeRow(overrides: Partial<DirectoryReportRow> = {}): DirectoryReportRow {
  return {
    name: 'a.txt',
    relativePath: 'a.txt',
    depth: 1,
    kind: 'file',
    status: 'same',
    leftSize: 10,
    rightSize: 10,
    ...overrides
  }
}

const DEFAULT_ROWS: readonly DirectoryReportRow[] = [
  { name: 'left', relativePath: '', depth: 0, kind: 'directory', status: 'modified' },
  makeRow({ name: 'a.txt', relativePath: 'a.txt' }),
  makeRow({ name: 'b.txt', relativePath: 'b.txt', status: 'added', leftSize: undefined })
]

function makeSource(
  rows: Iterable<DirectoryReportRow> = DEFAULT_ROWS,
  totalRows = DEFAULT_ROWS.length,
  overrides: Partial<DirectoryReportSource> = {}
): DirectoryReportSource {
  return {
    leftName: 'left',
    rightName: 'right',
    leftRoot: '/Users/alice/work/left',
    rightRoot: '/Users/alice/work/right',
    counts: ZERO_COUNTS,
    rows,
    totalRows,
    ...overrides
  }
}

interface BuildOptions {
  readonly rows?: Iterable<DirectoryReportRow>
  readonly totalRows?: number
  readonly source?: Partial<DirectoryReportSource>
  readonly strings?: Partial<DirectoryReportStrings>
  readonly htmlLang?: string
  readonly generatedAt?: string
  readonly appVersion?: string
  readonly hideLocalPaths?: boolean
  readonly maxRows?: number
  readonly maxBytes?: number
}

function build(options: BuildOptions = {}): DirectoryReport {
  const source = makeSource(options.rows, options.totalRows, options.source)
  const strings: DirectoryReportStrings = { ...STRINGS, ...options.strings }
  const input: DirectoryReportInput = {
    source,
    strings,
    htmlLang: options.htmlLang ?? 'zh-CN',
    generatedAt: options.generatedAt ?? '2026-10-26T12:00:00.000Z',
    appVersion: options.appVersion ?? '0.2.7',
    hideLocalPaths: options.hideLocalPaths ?? true,
    maxRows: options.maxRows,
    maxBytes: options.maxBytes
  }
  return buildDirectoryReport(input)
}

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

function countOf(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

function pathCells(html: string): string[] {
  return [...parse(html).querySelectorAll('tbody tr')].map(
    (row) => row.querySelector('td')?.textContent ?? ''
  )
}

function expectZeroOfSelfContainedMarkers(html: string): void {
  const lowered = html.toLowerCase()
  const forbidden = [
    '<script',
    '<link',
    '<img',
    '<iframe',
    '<object',
    '<embed',
    '@import',
    'url(',
    '@font-face',
    'src=',
    'href=',
    'fetch(',
    'http://',
    'https://'
  ]
  for (const needle of forbidden) {
    expect(countOf(lowered, needle), needle).toBe(0)
  }
}

/** Deterministic tiny rows for the cap tests; also exposes how many were pulled. */
function* tinyRows(count: number, counter: { produced: number }): Generator<DirectoryReportRow> {
  for (let index = 0; index < count; index += 1) {
    counter.produced += 1
    yield makeRow({ name: 'a', relativePath: 'a', depth: 0, leftSize: 1, rightSize: 1 })
  }
}

describe('escaping and injection', () => {
  const payloads = [
    'ampersand & more',
    'less < than > greater',
    'double " and single \' quotes',
    '<script>alert(1)</script>',
    'line\nbreak',
    'emoji 🧪🚀',
    '中文文件名',
    'x'.repeat(320)
  ]

  const injectedAt = '<b>generated</b> & "at"'
  const injectedVersion = 'v1.0.0 & <i>x</i>'

  function renderAll(): DirectoryReport {
    const rows: DirectoryReportRow[] = [
      { name: payloads[3], relativePath: '', depth: 0, kind: 'directory', status: 'same' },
      ...payloads.map((payload, index) =>
        makeRow({ name: payload, relativePath: payload, depth: index + 1 })
      )
    ]
    return build({
      rows,
      totalRows: rows.length,
      hideLocalPaths: false,
      generatedAt: injectedAt,
      appVersion: injectedVersion,
      source: { leftRoot: '<script>left</script>', rightRoot: 'a & "b"' }
    })
  }

  it('round-trips every injected value through the parser unchanged', () => {
    const result = renderAll()
    const document = parse(result.html)

    expect(document.querySelector('.meta-generated-at')?.textContent).toBe(injectedAt)
    expect(document.querySelector('.meta-app-version')?.textContent).toBe(injectedVersion)
    expect(document.querySelector('.meta-left-root')?.textContent).toBe('<script>left</script>')
    expect(document.querySelector('.meta-right-root')?.textContent).toBe('a & "b"')

    const rows = [...document.querySelectorAll('tbody tr')]
    expect(rows).toHaveLength(payloads.length + 1)
    expect(rows[0]?.querySelector('td')?.textContent).toBe(payloads[3])
    payloads.forEach((payload, index) => {
      expect(rows[index + 1]?.querySelector('td')?.textContent).toBe(payload)
    })
  })

  it('keeps injected text out of markup and attributes', () => {
    const result = renderAll()
    const lowered = result.html.toLowerCase()
    expect(countOf(lowered, '<script')).toBe(0)
    expect(countOf(lowered, 'alert(1)')).toBeGreaterThanOrEqual(1)
    expect(result.html).not.toContain('data-')
    expect(result.html).not.toMatch(/\stitle=/)

    const document = parse(result.html)
    expect(document.querySelectorAll('script, img, b').length).toBe(0)
    for (const element of document.querySelectorAll('*')) {
      for (const attribute of element.attributes) {
        expect(attribute.value).not.toContain('alert(1)')
        expect(attribute.value).not.toContain('<script')
      }
    }
  })

  it('neutralises :// so no URL literal reaches the source', () => {
    const path = 'notes/https://example.com/a'
    const result = build({
      rows: [makeRow({ name: path, relativePath: path })],
      totalRows: 1
    })
    expect(result.html).not.toContain('https://')
    expect(result.html).not.toContain('http://')
    expect(result.html).toContain(':&#47;&#47;')
    expect(pathCells(result.html)).toEqual([path])
  })
})

describe('self-contained document', () => {
  it('contains no scripts, links, fonts, URLs or fetches', () => {
    const result = build()
    expectZeroOfSelfContainedMarkers(result.html)
    expect(countOf(result.html.toLowerCase(), '<style')).toBe(1)
    expect(result.html).not.toMatch(/<style[^>]*src/i)
    expect(result.html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(result.html).toContain('<meta charset="utf-8">')
    expect(result.html.endsWith('</table></main></body></html>')).toBe(true)

    const document = parse(result.html)
    expect(document.querySelectorAll('script, link, img, iframe, object, embed')).toHaveLength(0)
    expect(document.querySelector('title')?.textContent).toBe(STRINGS.title)
  })

  it('uses the injected htmlLang without branching on language', () => {
    expect(parse(build({ htmlLang: 'zh-CN' }).html).documentElement.lang).toBe('zh-CN')
    expect(parse(build({ htmlLang: 'en' }).html).documentElement.lang).toBe('en')
  })

  it('renders the renderer language mapping verbatim', () => {
    expect(parse(build({ htmlLang: htmlLang('zh') }).html).documentElement.lang).toBe('zh-CN')
    expect(parse(build({ htmlLang: htmlLang('en') }).html).documentElement.lang).toBe('en')
  })
})

describe('privacy', () => {
  it('relativises roots to their common ancestor by default', () => {
    const result = build()
    const document = parse(result.html)
    expect(document.querySelector('.meta-left-root')?.textContent).toBe('left')
    expect(document.querySelector('.meta-right-root')?.textContent).toBe('right')
    expect(result.html).not.toContain('/Users')
    expect(result.html).not.toContain('/Users/alice/work/left')
    for (const cell of pathCells(result.html)) expect(cell).not.toContain('/Users')
  })

  it('falls back to root names when the ancestor is not meaningful', () => {
    const cases: readonly [string, string, string, string][] = [
      ['/Users/alice', '/Users/bob', 'alice', 'bob'],
      ['/home/alice', '/home/bob', 'alice', 'bob'],
      ['/opt/alpha/left', '/srv/beta/right', 'left', 'right'],
      ['C:\\Users\\alice\\work\\left', 'C:\\Users\\alice\\work\\right', 'left', 'right'],
      ['C:\\Users', 'C:\\Users', 'Users', 'Users'],
      ['C:\\left', 'C:\\right', 'left', 'right'],
      ['/home/bob/left', '/home/bob/right', 'left', 'right']
    ]
    for (const [leftRoot, rightRoot, left, right] of cases) {
      const result = build({ source: { leftRoot, rightRoot } })
      const document = parse(result.html)
      expect(document.querySelector('.meta-left-root')?.textContent, leftRoot).toBe(left)
      expect(document.querySelector('.meta-right-root')?.textContent, rightRoot).toBe(right)
      expect(result.html, leftRoot).not.toContain(leftRoot)
      expect(result.html, rightRoot).not.toContain(rightRoot)
    }
  })

  it('never exposes /Users, /home or C:\\Users by default', () => {
    const cases: readonly [string, string, string][] = [
      ['/Users/alice/work/left', '/Users/alice/work/right', '/Users'],
      ['/Users/alice', '/Users/bob', '/Users'],
      ['/home/bob/work/left', '/home/bob/work/right', '/home'],
      ['C:\\Users\\alice\\work\\left', 'C:\\Users\\alice\\work\\right', 'C:\\Users']
    ]
    for (const [leftRoot, rightRoot, prefix] of cases) {
      const result = build({ source: { leftRoot, rightRoot } })
      expect(result.html, prefix).not.toContain(prefix)
    }
  })

  it('shows absolute roots only when the toggle is off, and rows stay relative', () => {
    const hidden = build()
    const shown = build({ hideLocalPaths: false })
    const document = parse(shown.html)
    expect(document.querySelector('.meta-left-root')?.textContent).toBe(
      '/Users/alice/work/left'
    )
    expect(document.querySelector('.meta-right-root')?.textContent).toBe(
      '/Users/alice/work/right'
    )
    for (const cell of pathCells(shown.html)) {
      expect(cell).not.toContain('/Users')
      expect(cell).not.toBe('')
    }
    expect(hidden.html).not.toContain('/Users/alice/work/left')
  })

  it('renders the fixed privacy notice once, in both modes', () => {
    for (const hideLocalPaths of [true, false]) {
      const result = build({ hideLocalPaths })
      const document = parse(result.html)
      const notices = document.querySelectorAll('.privacy-notice')
      expect(notices).toHaveLength(1)
      expect(notices[0]?.textContent).toBe(STRINGS.privacyNotice)
      expect(countOf(result.html, STRINGS.privacyNotice)).toBe(1)
      expect(result.html.indexOf(STRINGS.privacyNotice)).toBeLessThan(
        result.html.indexOf('<table>')
      )
    }
  })
})

describe('counts, scope, version and time', () => {
  it('passes injected counts through without recomputing them from rows', () => {
    const counts: Record<FileDiffStatus, number> = {
      same: 7,
      added: 3,
      removed: 2,
      modified: 5
    }
    // Every row is `same`; the report must still show the injected distribution.
    const result = build({
      rows: [makeRow(), makeRow({ relativePath: 'b.txt' })],
      totalRows: 2,
      source: { counts }
    })
    const document = parse(result.html)
    for (const status of ['same', 'added', 'removed', 'modified'] as const) {
      expect(
        document.querySelector(`.count-${status} .count-value`)?.textContent,
        status
      ).toBe(String(counts[status]))
    }
  })

  it('shows the scope note exactly once', () => {
    const result = build()
    expect(countOf(result.html, STRINGS.scopeAll)).toBe(1)
  })

  it('renders the injected app version and timestamp verbatim', () => {
    const result = build({ appVersion: '3.4.5', generatedAt: 'time-injected' })
    const document = parse(result.html)
    expect(document.querySelector('.meta-app-version')?.textContent).toBe('3.4.5')
    expect(document.querySelector('.meta-generated-at')?.textContent).toBe('time-injected')
  })

  it('is deterministic for the same input', () => {
    expect(build().html).toBe(build().html)
  })
})

describe('limits and truncation', () => {
  const encoder = new TextEncoder()
  const tiny = (): DirectoryReportRow =>
    makeRow({ name: 'a', relativePath: 'a', depth: 0, leftSize: 1, rightSize: 1 })

  it('exports the exact limits and mirrors them into the document', () => {
    expect(DIRECTORY_REPORT_MAX_ROWS).toBe(200_000)
    expect(DIRECTORY_REPORT_MAX_BYTES).toBe(10_000_000)
    const result = build()
    const document = parse(result.html)
    expect(
      document
        .querySelector('meta[name="opencompare-report-limits"]')
        ?.getAttribute('content')
    ).toBe('rows=200000;bytes=10000000')
    const limits = document.querySelector('.meta-limits')?.textContent ?? ''
    expect(limits).toContain('200000')
    expect(limits).toContain('10000000')
  })

  it('does not truncate exactly at the row cap', () => {
    const counter = { produced: 0 }
    const result = build({ rows: tinyRows(200_000, counter), totalRows: 200_000 })
    expect(result.truncated).toBe(false)
    expect(result.shownRows).toBe(200_000)
    expect(result.truncatedRows).toBe(0)
    expect(result.totalRows).toBe(200_000)
    expect(result.html).not.toContain(STRINGS.truncatedHint)
    expect(result.html).not.toContain('（已截断）')
    expect(result.bytes).toBe(encoder.encode(result.html).length)
    expect(result.bytes).toBeLessThanOrEqual(DIRECTORY_REPORT_MAX_BYTES)
  })

  it('truncates one row over the cap and reports the numbers', () => {
    const counter = { produced: 0 }
    const result = build({ rows: tinyRows(200_001, counter), totalRows: 200_001 })
    expect(result.truncated).toBe(true)
    expect(result.shownRows).toBe(200_000)
    expect(result.truncatedRows).toBe(1)
    expect(result.totalRows).toBe(200_001)
    expect(result.shownRows + result.truncatedRows).toBe(result.totalRows)
    expect(result.html).toContain('已展示 200000 / 原始 200001（已截断）')
    expect(result.html).toContain(STRINGS.truncatedHint)
    expect(result.bytes).toBe(encoder.encode(result.html).length)
    expect(result.bytes).toBeLessThanOrEqual(DIRECTORY_REPORT_MAX_BYTES)
  })

  it('consumes a 2,000,000-row generator lazily', () => {
    const counter = { produced: 0 }
    const result = build({ rows: tinyRows(2_000_000, counter), totalRows: 2_000_000 })
    expect(result.truncated).toBe(true)
    expect(result.shownRows).toBe(200_000)
    expect(result.totalRows).toBe(2_000_000)
    expect(result.shownRows + result.truncatedRows).toBe(2_000_000)
    expect(counter.produced).toBeLessThanOrEqual(200_001)
    expect(counter.produced).toBe(200_000)
    expect(result.bytes).toBe(encoder.encode(result.html).length)
    expect(result.bytes).toBeLessThanOrEqual(DIRECTORY_REPORT_MAX_BYTES)
  })

  it('lets the byte cap fire before the row cap', () => {
    const longPath = `deep/${'x'.repeat(300)}`
    const counter = { produced: 0 }
    const rows = (function* (): Generator<DirectoryReportRow> {
      for (let index = 0; index < 60_000; index += 1) {
        counter.produced += 1
        yield makeRow({ name: 'f', relativePath: longPath, depth: 2, leftSize: 1, rightSize: 1 })
      }
    })()
    const result = build({ rows, totalRows: 60_000 })
    expect(result.truncated).toBe(true)
    expect(result.shownRows).toBeLessThan(200_000)
    expect(result.shownRows).toBeGreaterThan(0)
    expect(result.totalRows).toBe(60_000)
    expect(result.shownRows + result.truncatedRows).toBe(60_000)
    expect(result.bytes).toBe(encoder.encode(result.html).length)
    expect(result.bytes).toBeLessThanOrEqual(DIRECTORY_REPORT_MAX_BYTES)
    expect(result.html.endsWith('</table></main></body></html>')).toBe(true)
    expect(countOf(result.html, '<tr>') - 1).toBe(result.shownRows)
    expect(result.html).toContain('已展示')
  })

  it('keeps truncated documents complete and row-consistent', () => {
    const rows = Array.from({ length: 5 }, (_, index) =>
      makeRow({ name: `f${index}`, relativePath: `f${index}` })
    )
    const result = build({ rows, totalRows: 5, maxRows: 3 })
    expect(result.shownRows).toBe(3)
    expect(result.truncatedRows).toBe(2)
    expect(result.html.endsWith('</table></main></body></html>')).toBe(true)
    const document = parse(result.html)
    expect(document.querySelectorAll('tbody tr')).toHaveLength(3)
    expect(document.body.querySelectorAll('table tr')).toHaveLength(4)
  })

  it('renders a valid empty report and trusts the smaller total', () => {
    const empty = build({ rows: [], totalRows: 0 })
    expect(empty.shownRows).toBe(0)
    expect(empty.truncated).toBe(false)
    const emptyDocument = parse(empty.html)
    expect(emptyDocument.querySelector('.empty')?.textContent).toBe(STRINGS.empty)
    expect(emptyDocument.querySelector('table')).toBeNull()
    expect(empty.html.endsWith('</main></body></html>')).toBe(true)

    const short = build({ rows: [tiny(), tiny(), tiny()], totalRows: 10 })
    expect(short.totalRows).toBe(3)
    expect(short.shownRows).toBe(3)
    expect(short.truncated).toBe(false)

    const long = build({ rows: [tiny(), tiny(), tiny(), tiny(), tiny()], totalRows: 2 })
    expect(long.totalRows).toBe(2)
    expect(long.shownRows).toBe(2)
    expect(long.truncatedRows).toBe(0)
    expect(long.shownRows + long.truncatedRows).toBeLessThanOrEqual(long.totalRows)
  })
})

describe('directoryReportSource', () => {
  function file(name: string, relativePath: string, status: FileDiffStatus): DirectoryDiffNode {
    return {
      name,
      relativePath,
      kind: 'file',
      status,
      children: [],
      counts: { same: 0, added: 0, removed: 0, modified: 0, [status]: 1 },
      leftSize: 1,
      rightSize: 2
    }
  }

  function directory(
    name: string,
    relativePath: string,
    children: readonly DirectoryDiffNode[]
  ): DirectoryDiffNode {
    return {
      name,
      relativePath,
      kind: 'directory',
      status: 'same',
      children,
      counts: { same: 0, added: 0, removed: 0, modified: 0 }
    }
  }

  function comparison(root: DirectoryDiffNode): DirectoryComparison {
    return {
      leftRoot: '/Users/alice/work/left',
      rightRoot: '/Users/alice/work/right',
      leftName: 'left',
      rightName: 'right',
      root,
      counts: { same: 1, added: 1, removed: 0, modified: 1 },
      fileCount: 3,
      leftSkipped: 0,
      rightSkipped: 0,
      skipped: 0
    }
  }

  it('projects the tree in pre-order with matching fields and total', () => {
    const root = directory('root', '', [
      directory('src', 'src', [
        file('a.ts', 'src/a.ts', 'modified'),
        file('b.ts', 'src/b.ts', 'same')
      ]),
      file('readme.md', 'readme.md', 'added')
    ])
    const source = directoryReportSource(comparison(root))
    const rows = [...source.rows]

    expect(source.totalRows).toBe(5)
    expect(rows.map((row) => [row.relativePath, row.depth, row.kind, row.status])).toEqual([
      ['', 0, 'directory', 'same'],
      ['src', 1, 'directory', 'same'],
      ['src/a.ts', 2, 'file', 'modified'],
      ['src/b.ts', 2, 'file', 'same'],
      ['readme.md', 1, 'file', 'added']
    ])
    expect(rows[3]).toMatchObject({
      name: 'b.ts',
      relativePath: 'src/b.ts',
      kind: 'file',
      status: 'same',
      leftSize: 1,
      rightSize: 2
    })
    expect(rows[0]?.name).toBe('root')
  })

  it('feeds comparison counts and the shared version straight into the report', () => {
    const root = directory('root', '', [file('a.txt', 'a.txt', 'added')])
    const compared = comparison(root)
    const result = buildDirectoryReport({
      source: directoryReportSource(compared),
      strings: STRINGS,
      htmlLang: htmlLang('zh'),
      generatedAt: '2026-10-26T12:00:00.000Z',
      appVersion: APP_VERSION,
      hideLocalPaths: true
    })
    const document = parse(result.html)
    expect(document.querySelector('.meta-app-version')?.textContent).toBe(APP_VERSION)
    expect(result.totalRows).toBe(2)
    expect(document.querySelectorAll('tbody tr')).toHaveLength(2)
    for (const status of ['same', 'added', 'removed', 'modified'] as const) {
      expect(
        document.querySelector(`.count-${status} .count-value`)?.textContent,
        status
      ).toBe(String(compared.counts[status]))
    }
  })

  it('stays lazy: ten rows never touch the eleventh node', () => {
    let elementReads = 0
    let childrenAccesses = 0
    const children: DirectoryDiffNode[] = []
    for (let index = 0; index < 200_000; index += 1) {
      const node = directory(`d${index}`, `d${index}`, [])
      Object.defineProperty(node, 'children', {
        get() {
          childrenAccesses += 1
          return []
        }
      })
      children.push(node)
    }
    const proxied = new Proxy(children, {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) elementReads += 1
        return Reflect.get(target, property, receiver)
      }
    })
    const root = directory('root', '', proxied)
    const source = directoryReportSource(comparison(root))

    const iterator = source.rows[Symbol.iterator]()
    const seen: DirectoryReportRow[] = []
    for (let index = 0; index < 10; index += 1) {
      const next = iterator.next()
      if (next.done !== true) seen.push(next.value)
    }

    expect(seen).toHaveLength(10)
    expect(seen[9]?.relativePath).toBe('d8')
    expect(elementReads).toBeLessThanOrEqual(10)
    expect(childrenAccesses).toBeLessThanOrEqual(10)
  })
})
