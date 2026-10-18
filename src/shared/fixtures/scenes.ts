import type {
  CodeSceneFixture,
  CsvSceneFixture,
  DirectoryNode,
  DirectorySceneFixture,
  DiffStatus,
  SampleComposition,
  StructuredSceneFixture,
  TextSample
} from './types'

/* ------------------------------------------------------------------ */
/* Scene A — nested directory trees plus a level-shuffled copy         */
/* ------------------------------------------------------------------ */

function file(name: string, status: DiffStatus, text: string): DirectoryNode {
  return { name, kind: 'file', status, text }
}

function folder(
  name: string,
  status: DiffStatus,
  children: readonly DirectoryNode[]
): DirectoryNode {
  return { name, kind: 'directory', status, children }
}

const ENGINE_LEFT = [
  'export interface EngineOptions {',
  '  readonly workers: number',
  '  readonly timeoutMs: number',
  '}',
  '',
  'export function createEngine(options: EngineOptions) {',
  '  return { ...options, started: false }',
  '}',
  ''
].join('\n')

const ENGINE_RIGHT = [
  'export interface EngineOptions {',
  '  readonly workers: number',
  '  readonly timeoutMs: number',
  '  readonly hash: "sha256" | "blake3"',
  '}',
  '',
  'export function createEngine(options: EngineOptions) {',
  '  return { ...options, started: false, cache: new Map() }',
  '}',
  ''
].join('\n')

const SHELL_LEFT = [
  'export function Shell({ title }: { title: string }) {',
  '  return <frame title={title} />',
  '}',
  ''
].join('\n')

const SHELL_RIGHT = [
  'export function Shell({ title, subtitle }: { title: string; subtitle?: string }) {',
  '  return <frame title={title} subtitle={subtitle ?? ""} />',
  '}',
  ''
].join('\n')

/** Delimited sample, so double-click drilldown can reach the CSV view. */
const REPORT_LEFT = [
  'order_id,qty,status',
  'ORD-1001,3,paid',
  'ORD-1002,5,pending',
  'ORD-1003,1,shipped',
  ''
].join('\n')

const REPORT_RIGHT = [
  'order_id,qty,status',
  'ORD-1001,3,paid',
  'ORD-1002,8,pending',
  'ORD-1003,1,shipped',
  'ORD-1004,2,refunded',
  ''
].join('\n')

/** YAML sample, so double-click drilldown can reach the structured view. */
const DEPLOY_LEFT = ['service:', '  name: baseline', '  replicas: 2', 'profile: production', ''].join(
  '\n'
)

const DEPLOY_RIGHT = [
  'service:',
  '  name: candidate',
  '  replicas: 4',
  '  health:',
  '    path: /healthz',
  'profile: staging',
  ''
].join('\n')

/**
 * A non-text sample. The library stores bodies as strings, but the name is what
 * matters: it exercises the "unsupported drilldown type" path of the directory
 * view without needing a real binary file on disk.
 */
const LOGO_LEFT = '89504e47 0d0a1a0a 49484452 00000010 00010000 00010008 06000000\n'

const LOGO_RIGHT =
  '89504e47 0d0a1a0a 49484452 00000020 00020000 00010008 06000000 01020304 05060708\n'

const NESTED_LEFT = folder('baseline', 'same', [
  folder('src', 'same', [
    folder('core', 'same', [
      file('engine.ts', 'modified', ENGINE_LEFT),
      file('parser.ts', 'same', 'export function parse(text: string) {\n  return text.trim().split("\\n")\n}\n'),
      file('lexer.ts', 'removed', 'export function lex(text: string) {\n  return text.split(/\\W+/)\n}\n'),
      folder('utils', 'same', [
        file('strings.ts', 'same', 'export const slug = (value: string) => value.toLowerCase().replace(/\\s+/g, "-")\n'),
        file('numbers.ts', 'removed', 'export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))\n')
      ])
    ]),
    folder('data', 'same', [file('report.csv', 'modified', REPORT_LEFT)]),
    folder('ui', 'same', [
      folder('workbench', 'same', [
        file('Shell.tsx', 'modified', SHELL_LEFT),
        file('SplitPane.tsx', 'same', 'export function SplitPane({ panes }: { panes: unknown[] }) {\n  return <div>{panes.length} panes</div>\n}\n')
      ]),
      file('tokens.ts', 'same', 'export const SURFACE_BASE = "#0b0d12"\nexport const ACCENT = "#4c8dff"\n')
    ])
  ]),
  folder('docs', 'same', [
    file('guide.md', 'same', '# OpenCompare guide\n\nLoad the sample fixtures from the toolbar to start.\n'),
    file('changelog.md', 'removed', '# Changelog\n\n## 0.0.1\n\n- scaffold\n')
  ]),
  folder('config', 'same', [file('deploy.yaml', 'modified', DEPLOY_LEFT)]),
  folder('assets', 'same', [file('logo.png', 'modified', LOGO_LEFT)]),
  file('package.json', 'same', '{\n  "name": "baseline",\n  "private": true\n}\n'),
  file('README.md', 'removed', '# baseline\n\nDeprecated sample tree.\n')
])

const NESTED_RIGHT = folder('candidate', 'same', [
  folder('src', 'same', [
    folder('core', 'same', [
      file('engine.ts', 'modified', ENGINE_RIGHT),
      file('parser.ts', 'same', 'export function parse(text: string) {\n  return text.trim().split("\\n")\n}\n'),
      folder('utils', 'same', [
        file('strings.ts', 'same', 'export const slug = (value: string) => value.toLowerCase().replace(/\\s+/g, "-")\n'),
        file('format.ts', 'added', 'export const formatBytes = (bytes: number) => `${(bytes / 1024).toFixed(1)} KiB`\n')
      ])
    ]),
    folder('data', 'same', [file('report.csv', 'modified', REPORT_RIGHT)]),
    folder('ui', 'same', [
      folder('workbench', 'same', [
        file('Shell.tsx', 'modified', SHELL_RIGHT),
        file('StatsPanel.tsx', 'added', 'export function StatsPanel({ rows }: { rows: number }) {\n  return <span>{rows} rows</span>\n}\n'),
        file('SplitPane.tsx', 'same', 'export function SplitPane({ panes }: { panes: unknown[] }) {\n  return <div>{panes.length} panes</div>\n}\n')
      ]),
      file('tokens.ts', 'same', 'export const SURFACE_BASE = "#0b0d12"\nexport const ACCENT = "#4c8dff"\n')
    ])
  ]),
  folder('docs', 'same', [
    file('guide.md', 'same', '# OpenCompare guide\n\nLoad the sample fixtures from the toolbar to start.\n'),
    file('migration.md', 'added', '# Migration\n\nMove deprecated trees into `archive/`.\n')
  ]),
  folder('config', 'same', [file('deploy.yaml', 'modified', DEPLOY_RIGHT)]),
  folder('assets', 'same', [file('logo.png', 'modified', LOGO_RIGHT)]),
  file('package.json', 'same', '{\n  "name": "baseline",\n  "private": true\n}\n'),
  file('CHANGELOG.md', 'added', '# Changelog\n\n## 0.1.0\n\n- candidate tree\n')
])

/**
 * Tree B holds the same logical files as the template tree, but its directory
 * levels are shuffled: `src/core/utils/strings.ts` lands four levels deep
 * inside `misc/deep/deeper`, and `src/ui/workbench/SplitPane.tsx` sits at
 * `misc/ui`.
 */
const SCATTERED = folder('incoming', 'same', [
  file('package.json', 'same', '{\n  "name": "baseline",\n  "private": true\n}\n'),
  file('tokens.ts', 'same', 'export const SURFACE_BASE = "#0b0d12"\nexport const ACCENT = "#4c8dff"\n'),
  folder('docs', 'same', [
    file('guide.md', 'same', '# OpenCompare guide\n\nLoad the sample fixtures from the toolbar to start.\n')
  ]),
  folder('misc', 'same', [
    folder('core', 'same', [
      file('engine.ts', 'same', ENGINE_LEFT),
      file('parser.ts', 'same', 'export function parse(text: string) {\n  return text.trim().split("\\n")\n}\n')
    ]),
    folder('deep', 'same', [
      folder('deeper', 'same', [
        file('strings.ts', 'same', 'export const slug = (value: string) => value.toLowerCase().replace(/\\s+/g, "-")\n'),
        file('numbers.ts', 'same', 'export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))\n')
      ])
    ]),
    folder('ui', 'same', [
      file('SplitPane.tsx', 'same', 'export function SplitPane({ panes }: { panes: unknown[] }) {\n  return <div>{panes.length} panes</div>\n}\n'),
      file('lexer.ts', 'same', 'export function lex(text: string) {\n  return text.split(/\\W+/)\n}\n')
    ])
  ])
])

/** Counts files (not directories) carrying the given authored status. */
export function countStatus(node: DirectoryNode, status: DiffStatus): number {
  const own = node.kind === 'file' && node.status === status ? 1 : 0
  const nested = (node.children ?? []).reduce(
    (total, child) => total + countStatus(child, status),
    0
  )
  return own + nested
}

/** Counts every file below (and including) the given node. */
export function countFiles(node: DirectoryNode): number {
  if (node.kind === 'file') return 1
  return (node.children ?? []).reduce((total, child) => total + countFiles(child), 0)
}

const DIRECTORY_COMPOSITION: SampleComposition = {
  same: countStatus(NESTED_LEFT, 'same'),
  added: countStatus(NESTED_RIGHT, 'added'),
  removed: countStatus(NESTED_LEFT, 'removed'),
  modified: countStatus(NESTED_LEFT, 'modified'),
  conflict: 0
}

export const DIRECTORY_SCENE: DirectorySceneFixture = {
  scene: 'directory',
  composition: DIRECTORY_COMPOSITION,
  left: NESTED_LEFT,
  right: NESTED_RIGHT,
  scattered: SCATTERED
}

/* ------------------------------------------------------------------ */
/* Scene B — two-column code diff and a three-way merge with conflicts */
/* ------------------------------------------------------------------ */

const CODE_DIFF_LEFT: TextSample = {
  path: '/samples/code/summary.left.ts',
  text: [
    'export interface RunSummary {',
    '  readonly total: number',
    '  readonly changed: number',
    '}',
    '',
    'export function summarize(rows: readonly string[]): RunSummary {',
    '  const changed = rows.filter((row) => row.trim().length > 0).length',
    '  return { total: rows.length, changed }',
    '}',
    '',
    'export function formatSummary(summary: RunSummary): string {',
    '  return `${summary.total} rows, ${summary.changed} non-empty`',
    '}',
    ''
  ].join('\n')
}

const CODE_DIFF_RIGHT: TextSample = {
  path: '/samples/code/summary.right.ts',
  text: [
    'export interface RunSummary {',
    '  readonly total: number',
    '  readonly changed: number',
    '}',
    '',
    'export const EMPTY_SUMMARY: RunSummary = { total: 0, changed: 0 }',
    '',
    'export function summarize(rows: readonly string[]): RunSummary {',
    '  const changed = rows.filter((row) => row.trim().length > 0).length',
    '  if (rows.length === 0) return EMPTY_SUMMARY',
    '  return { total: rows.length, changed }',
    '}',
    '',
    'export function formatSummary(summary: RunSummary): string {',
    '  return `${summary.total} rows · ${summary.changed} non-empty`',
    '}',
    ''
  ].join('\n')
}

const MERGE_COMMON_HEADER = ['export const theme = {', '  surface: "#0b0d12"'].join('\n')

const MERGE_COMMON_TAIL = ['}', '', 'export const limits = {'].join('\n')

const MERGE_BASE: TextSample = {
  path: '/samples/code/merge.base.ts',
  text: [
    MERGE_COMMON_HEADER,
    '  accent: "#4c8dff",',
    '  radius: 6',
    MERGE_COMMON_TAIL,
    '  pageSize: 50,',
    '  retries: 3',
    '}',
    '',
    'export function label(count: number) {',
    '  return `${count} items`',
    '}',
    ''
  ].join('\n')
}

const MERGE_OURS: TextSample = {
  path: '/samples/code/merge.ours.ts',
  text: [
    MERGE_COMMON_HEADER,
    '  accent: "#3fb950",',
    '  radius: 8',
    MERGE_COMMON_TAIL,
    '  pageSize: 50,',
    '  retries: 5',
    '}',
    '',
    'export function label(count: number) {',
    '  return `${count} items changed`',
    '}',
    ''
  ].join('\n')
}

const MERGE_THEIRS: TextSample = {
  path: '/samples/code/merge.theirs.ts',
  text: [
    MERGE_COMMON_HEADER,
    '  accent: "#d8a13a",',
    '  radius: 4',
    MERGE_COMMON_TAIL,
    '  pageSize: 100,',
    '  retries: 3',
    '}',
    '',
    'export function label(count: number) {',
    '  return `${count} entries`',
    '}',
    ''
  ].join('\n')
}

/**
 * `diff3MergeRegions(base, ours, theirs)` on this trio yields three conflicting
 * regions: the `theme.accent` line, the `theme.radius` line and the `label()`
 * return statement. `src/shared/fixtures/fixtures.test.ts` re-derives the count.
 */
const CODE_COMPOSITION: SampleComposition = {
  same: 7,
  added: 3,
  removed: 0,
  modified: 2,
  conflict: 3
}

export const CODE_SCENE: CodeSceneFixture = {
  scene: 'code',
  composition: CODE_COMPOSITION,
  diff: { left: CODE_DIFF_LEFT, right: CODE_DIFF_RIGHT },
  merge: { base: MERGE_BASE, ours: MERGE_OURS, theirs: MERGE_THEIRS }
}

/* ------------------------------------------------------------------ */
/* Scene C — 1,240-row reconciliations with shuffled keys              */
/* ------------------------------------------------------------------ */

const CSV_ROW_TOTAL = 1240
const CSV_TRANSFER_ROWS = 24

const CSV_HEADER_LEFT = [
  'order_id',
  'account',
  'sku',
  'qty',
  'unit_price',
  'status',
  'updated_at'
]

/**
 * The target side carries an extra leading `region` column and reorders the
 * remaining columns — the column offset a key-based aligner has to absorb.
 */
const CSV_HEADER_RIGHT = [
  'region',
  'order_id',
  'sku',
  'account',
  'qty',
  'unit_price',
  'status',
  'updated_at'
]

const CSV_STATUSES = ['paid', 'pending', 'shipped', 'refunded']
const CSV_REGIONS = ['apac', 'emea', 'amer']

const CSV_ROW_INDICES = Array.from({ length: CSV_ROW_TOTAL }, (_, index) => index)
const CSV_REMOVED_ROWS = CSV_ROW_INDICES.filter((index) => index % 41 === 0)
const CSV_MODIFIED_ROWS = CSV_ROW_INDICES.filter(
  (index) => index % 14 === 0 && index % 41 !== 0
)

function baseOrderRow(index: number): string[] {
  return [
    `ORD-${100000 + index}`,
    `ACC-${(index * 7) % 97}`,
    `SKU-${(index * 13) % 211}`,
    String(1 + ((index * 3) % 17)),
    (19.5 + (index % 53) * 2.25).toFixed(2),
    CSV_STATUSES[index % CSV_STATUSES.length],
    `2026-09-${String((index % 28) + 1).padStart(2, '0')}`
  ]
}

function transformedOrderRow(index: number): string[] {
  const row = baseOrderRow(index)
  row[3] = String(Number(row[3]) + 5)
  row[5] = 'refunded'
  return row
}

function transferOrderRow(index: number): string[] {
  return [
    `ORD-${200000 + index}`,
    `ACC-${(index * 11) % 97}`,
    `SKU-${(index * 17) % 211}`,
    String(1 + ((index * 5) % 17)),
    (21.75 + (index % 41) * 3.5).toFixed(2),
    CSV_STATUSES[(index + 2) % CSV_STATUSES.length],
    `2026-10-${String((index % 28) + 1).padStart(2, '0')}`
  ]
}

/** Deterministic Fisher–Yates so the sample is identical on every machine. */
function deterministicShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = items.slice()
  let state = seed
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (state * 1664525 + 1013904223) % 4294967296
    const j = state % (i + 1)
    const swap = out[i]
    out[i] = out[j]
    out[j] = swap
  }
  return out
}

function renderDelimited(rows: readonly (readonly string[])[], delimiter: string): string {
  return `${rows.map((row) => row.join(delimiter)).join('\n')}\n`
}

/** Reorders base columns into the target layout and prepends `region`. */
function toRightOrderRow(row: readonly string[], index: number): string[] {
  const [orderId, account, sku, ...rest] = row
  return [CSV_REGIONS[index % CSV_REGIONS.length], orderId, sku, account, ...rest]
}

const CSV_LEFT_ROWS = deterministicShuffle(CSV_ROW_INDICES.map(baseOrderRow), 20260901)

const CSV_RIGHT_ROWS = deterministicShuffle(
  [
    ...CSV_ROW_INDICES.filter((index) => index % 41 !== 0).map((index) =>
      index % 14 === 0 ? transformedOrderRow(index) : baseOrderRow(index)
    ),
    ...Array.from({ length: CSV_TRANSFER_ROWS }, (_, index) => transferOrderRow(index))
  ].map(toRightOrderRow),
  20261018
)

const CSV_COMPOSITION: SampleComposition = {
  same: CSV_ROW_TOTAL - CSV_REMOVED_ROWS.length - CSV_MODIFIED_ROWS.length,
  added: CSV_TRANSFER_ROWS,
  removed: CSV_REMOVED_ROWS.length,
  modified: CSV_MODIFIED_ROWS.length,
  conflict: 0
}

export const CSV_SCENE: CsvSceneFixture = {
  scene: 'csv',
  composition: CSV_COMPOSITION,
  keyColumns: ['order_id'],
  left: {
    path: '/samples/csv/orders.left.csv',
    delimiter: ',',
    text: renderDelimited([CSV_HEADER_LEFT, ...CSV_LEFT_ROWS], ',')
  },
  right: {
    path: '/samples/csv/orders.right.tsv',
    delimiter: '\t',
    text: renderDelimited([CSV_HEADER_RIGHT, ...CSV_RIGHT_ROWS], '\t')
  }
}

/* ------------------------------------------------------------------ */
/* Scene D — shuffled, deeply nested JSON and YAML                     */
/* ------------------------------------------------------------------ */

const STRUCTURED_JSON_LEFT: TextSample = {
  path: '/samples/structured/config.left.json',
  text: `{
  "service": {
    "name": "opencompare",
    "version": 2,
    "features": {
      "merge": { "enabled": true, "mode": "three-way" },
      "sync": { "enabled": false },
      "limits": { "maxFiles": 5000, "timeoutMs": 30000 }
    },
    "logging": { "level": "info", "sinks": ["stdout"] }
  },
  "telemetry": { "enabled": false },
  "updatedAt": "2026-09-01"
}
`
}

const STRUCTURED_JSON_RIGHT: TextSample = {
  path: '/samples/structured/config.right.json',
  text: `{
  "updatedAt": "2026-10-18",
  "telemetry": { "enabled": true },
  "service": {
    "features": {
      "limits": { "maxFiles": 20000, "timeoutMs": 30000, "maxBytes": 104857600 },
      "sync": { "enabled": true, "direction": "bidirectional" },
      "merge": { "enabled": true, "mode": "three-way", "autoResolve": false }
    },
    "logging": { "level": "debug", "sinks": ["stdout", "file"] },
    "name": "opencompare",
    "version": "2.0.0"
  }
}
`
}

const STRUCTURED_YAML_LEFT: TextSample = {
  path: '/samples/structured/deploy.left.yaml',
  text: `schema: opencompare/v1
profile: production
service:
  name: opencompare
  replicas: 3
  resources:
    cpu: 2
    memory: 4Gi
  env:
    LOG_LEVEL: info
    FEATURE_SYNC: "false"
mounted:
  - /data/left
  - /data/cache
`
}

const STRUCTURED_YAML_RIGHT: TextSample = {
  path: '/samples/structured/deploy.right.yaml',
  text: `mounted:
  - /data/right
  - /data/cache
  - /data/archive
service:
  env:
    LOG_LEVEL: debug
    FEATURE_SYNC: "true"
    FEATURE_MERGE: "true"
  resources:
    cpu: 4
    memory: 8Gi
    disk: 64Gi
  health:
    path: /healthz
    port: 8080
  replicas: 3
  name: opencompare
profile: staging
schema: opencompare/v1
`
}

const STRUCTURED_COMPOSITION: SampleComposition = {
  same: 14,
  added: 6,
  removed: 1,
  modified: 6,
  conflict: 0
}

export const STRUCTURED_SCENE: StructuredSceneFixture = {
  scene: 'structured',
  composition: STRUCTURED_COMPOSITION,
  json: { left: STRUCTURED_JSON_LEFT, right: STRUCTURED_JSON_RIGHT },
  yaml: { left: STRUCTURED_YAML_LEFT, right: STRUCTURED_YAML_RIGHT }
}
