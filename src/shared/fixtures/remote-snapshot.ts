/**
 * Built-in deterministic snapshot of a fictional `remote-prod` server.
 *
 * Pure data + the canonical protocol serializer: no clock, no network, no SSH.
 * Files that the bundled local sample tree also carries keep its exact text,
 * size and mtime (the sample mount reports `modifiedMs: 0`), so comparing the
 * two trees is decided by content rather than by metadata drift. `lexer.ts`
 * deliberately keeps the local size and mtime while changing the body, which
 * exercises the SHA-256 confirmation path of the comparison engine.
 */
import { sha256Hex } from '@core/directory/hash'
import { serializeSnapshot } from '@core/directory/snapshot'
import { SNAPSHOT_SCHEMA } from '@shared/snapshot'
import type { SnapshotDocument, SnapshotEntry } from '@shared/snapshot'

export interface RemoteSnapshotFixture {
  readonly name: string
  readonly exportedAt: string
  /** Typed model, ready to mount as one comparison side. */
  readonly snapshot: SnapshotDocument
  /** Canonical `.ocsnap.json` text, accepted by `parseSnapshot`. */
  readonly text: string
}

/** Fixed capture time of the sample. */
const EXPORTED_AT = '2026-10-17T09:30:00.000Z'

/** Fixed mtime of remote files whose metadata differs from the local sample. */
const REMOTE_MTIME = 1760832000000

interface RemoteFile {
  readonly path: string
  readonly text: string
  /** The bundled local sample mount reports `0`; identical files keep it. */
  readonly modifiedMs: number
}

/* Identical to the local sample tree. */
const PACKAGE_JSON = '{\n  "name": "baseline",\n  "private": true\n}\n'
const GUIDE_MD = '# OpenCompare guide\n\nLoad the sample fixtures from the toolbar to start.\n'
const PARSER_TS =
  'export function parse(text: string) {\n  return text.trim().split("\\n")\n}\n'
const STRINGS_TS =
  'export const slug = (value: string) => value.toLowerCase().replace(/\\s+/g, "-")\n'
const TOKENS_TS = 'export const SURFACE_BASE = "#0b0d12"\nexport const ACCENT = "#4c8dff"\n'
const SPLIT_PANE_TSX =
  'export function SplitPane({ panes }: { panes: unknown[] }) {\n  return <div>{panes.length} panes</div>\n}\n'

/* Remote versions. */
const ENGINE_TS = [
  'export interface EngineOptions {',
  '  readonly workers: number',
  '  readonly timeoutMs: number',
  '  readonly retries: number',
  '}',
  '',
  'export function createEngine(options: EngineOptions) {',
  '  return { ...options, started: false, retries: 3 }',
  '}',
  ''
].join('\n')

/** Same byte length and mtime as the local `lexer.ts`, different body. */
const LEXER_TS = 'export function lex(text: string) {\n  return text.split(/\\S+/)\n}\n'

const SHELL_TSX = [
  'export function Shell({ title, version }: { title: string; version: number }) {',
  '  return <frame title={title} version={version} />',
  '}',
  ''
].join('\n')

const REPORT_CSV = [
  'order_id,qty,status',
  'ORD-1001,3,paid',
  'ORD-1002,6,pending',
  'ORD-1003,1,shipped',
  'ORD-1004,2,refunded',
  ''
].join('\n')

const METRICS_CSV = [
  'service,request_rate,error_rate,p95_ms',
  'checkout-api,142.5,0.0042,84',
  'search-api,318.0,0.0011,37',
  'billing-worker,9.5,0.01,210',
  ''
].join('\n')

const LIMITS_JSON = [
  '{',
  '  "service": "remote-prod",',
  '  "limits": {',
  '    "maxConnections": 2048,',
  '    "maxRequestBytes": 1048576,',
  '    "timeoutMs": 15000',
  '  },',
  '  "features": ["snapshot-import", "remote-diff"]',
  '}',
  ''
].join('\n')

const DEPLOY_YAML = [
  'schema: opencompare/v1',
  'profile: production',
  'service:',
  '  name: remote-prod',
  '  replicas: 6',
  '  resources:',
  '    cpu: 4',
  '    memory: 8Gi',
  '  env:',
  '    LOG_LEVEL: warn',
  '    FEATURE_SNAPSHOT: "true"',
  'mounted:',
  '  - /data/remote',
  '  - /data/cache',
  ''
].join('\n')

const WORKER_TS = [
  'export interface SnapshotJob {',
  '  readonly id: string',
  '  readonly paths: readonly string[]',
  '}',
  '',
  'export function dispatch(job: SnapshotJob): string[] {',
  '  return job.paths.map((path) => `${job.id}:${path}`)',
  '}',
  ''
].join('\n')

const REMOTE_FILES: readonly RemoteFile[] = [
  { path: 'config/deploy.yaml', text: DEPLOY_YAML, modifiedMs: REMOTE_MTIME },
  { path: 'config/limits.json', text: LIMITS_JSON, modifiedMs: REMOTE_MTIME },
  { path: 'docs/guide.md', text: GUIDE_MD, modifiedMs: 0 },
  { path: 'package.json', text: PACKAGE_JSON, modifiedMs: 0 },
  { path: 'src/core/engine.ts', text: ENGINE_TS, modifiedMs: REMOTE_MTIME },
  { path: 'src/core/lexer.ts', text: LEXER_TS, modifiedMs: 0 },
  { path: 'src/core/parser.ts', text: PARSER_TS, modifiedMs: 0 },
  { path: 'src/core/utils/strings.ts', text: STRINGS_TS, modifiedMs: 0 },
  { path: 'src/core/worker.ts', text: WORKER_TS, modifiedMs: REMOTE_MTIME },
  { path: 'src/data/metrics.csv', text: METRICS_CSV, modifiedMs: REMOTE_MTIME },
  { path: 'src/data/report.csv', text: REPORT_CSV, modifiedMs: REMOTE_MTIME },
  { path: 'src/ui/tokens.ts', text: TOKENS_TS, modifiedMs: 0 },
  { path: 'src/ui/workbench/Shell.tsx', text: SHELL_TSX, modifiedMs: REMOTE_MTIME },
  { path: 'src/ui/workbench/SplitPane.tsx', text: SPLIT_PANE_TSX, modifiedMs: 0 }
]

const encoder = new TextEncoder()

const entries: SnapshotEntry[] = REMOTE_FILES.map((file) => ({
  path: file.path,
  size: encoder.encode(file.text).length,
  modifiedMs: file.modifiedMs,
  sha256: sha256Hex(file.text),
  content: file.text
})).sort((left, right) => left.path.localeCompare(right.path))

const document: SnapshotDocument = {
  schema: SNAPSHOT_SCHEMA,
  name: 'remote-prod',
  exportedAt: EXPORTED_AT,
  entries
}

/** The one built-in remote snapshot sample: model plus canonical `.ocsnap.json` text. */
export const REMOTE_SNAPSHOT: RemoteSnapshotFixture = {
  name: document.name,
  exportedAt: document.exportedAt,
  snapshot: document,
  text: serializeSnapshot(document)
}
