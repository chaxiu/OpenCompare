/**
 * Render-time display description of a workbench session.
 *
 * A session must never freeze visible copy into its own data: titles,
 * subtitles and status-bar labels are resolved from dictionary keys when the
 * shell renders. This module is pure (no DOM, no Electron) and decides every
 * key from the session identity (sample id, scene, adhoc payload, directory
 * comparison) rather than from any existing label text.
 */
import { CSV_SCENE } from '@shared/fixtures'
import type { DiffStatus } from '@shared/fixtures'
import type { Translate } from '@renderer/i18n/context'
import type { InterpolationParams } from '@renderer/i18n/interpolate'
import type { MessageKey } from '@renderer/i18n/messages'
import { baseName } from './fileKinds'
import type { FileKind } from './fileKinds'
import type { WorkbenchSession } from './session'

/** One fragment of a display text: literal user data or a dictionary key. */
export type SessionTextPart =
  | { readonly key: MessageKey; readonly params?: InterpolationParams }
  | { readonly text: string }

/** Ordered fragments joined when the shell renders the session. */
export type SessionText = readonly SessionTextPart[]

export interface SessionDisplayStat {
  readonly key: MessageKey
  readonly value: number | string
  readonly tone?: DiffStatus
}

export interface SessionDisplay {
  readonly title: SessionText
  readonly subtitle: SessionText
  readonly stats: readonly SessionDisplayStat[]
}

const SAMPLE_IDS = [
  'session-directory',
  'session-code',
  'session-csv',
  'session-structured'
] as const

type SampleId = (typeof SAMPLE_IDS)[number]

const SAMPLE_KEYS: Record<SampleId, { readonly title: MessageKey; readonly subtitle: MessageKey }> = {
  'session-directory': {
    title: 'shell.session.sample.directory.title',
    subtitle: 'shell.session.sample.directory.subtitle'
  },
  'session-code': {
    title: 'shell.session.sample.code.title',
    subtitle: 'shell.session.sample.code.subtitle'
  },
  'session-csv': {
    title: 'shell.session.sample.csv.title',
    subtitle: 'shell.session.sample.csv.subtitle'
  },
  'session-structured': {
    title: 'shell.session.sample.structured.title',
    subtitle: 'shell.session.sample.structured.subtitle'
  }
}

const SAMPLE_STAT_KEYS: Record<SampleId, readonly MessageKey[]> = {
  'session-directory': [
    'shell.stat.sourceFiles',
    'shell.stat.targetFiles',
    'shell.stat.scatteredTree'
  ],
  'session-code': ['shell.stat.linesLeft', 'shell.stat.linesRight', 'shell.stat.conflicts'],
  'session-csv': ['shell.stat.linesLeft', 'shell.stat.linesRight', 'shell.stat.keyColumns'],
  'session-structured': [
    'shell.stat.jsonNodesLeft',
    'shell.stat.jsonNodesRight',
    'shell.stat.sampleFiles'
  ]
}

const RUNTIME_DIRECTORY_STATS: readonly MessageKey[] = [
  'shell.stat.sourceFiles',
  'shell.stat.targetFiles',
  'shell.stat.differences'
]

const FILE_PAIR_STATS: readonly MessageKey[] = ['shell.stat.linesLeft', 'shell.stat.linesRight']

const MISSING_SUFFIX = {
  left: '::opencompare-missing-left',
  right: '::opencompare-missing-right'
} as const

/** Path data of a drilldown side that does not exist on disk. */
export function missingSidePath(path: string, side: 'left' | 'right'): string {
  return `${path}${MISSING_SUFFIX[side]}`
}

function missingSideOf(path: string): 'left' | 'right' | null {
  if (path.endsWith(MISSING_SUFFIX.left)) return 'left'
  if (path.endsWith(MISSING_SUFFIX.right)) return 'right'
  return null
}

function sampleId(session: WorkbenchSession): SampleId | null {
  const match = SAMPLE_IDS.find((id) => id === session.id)
  return match ?? null
}

/** Counts the CSV sample's left rows exactly like the fixture subtitle does. */
function csvSampleRows(): string {
  const { same, removed, modified } = CSV_SCENE.composition
  return (same + removed + modified).toLocaleString('en-US')
}

function sampleSubtitle(id: SampleId): SessionText {
  const key = SAMPLE_KEYS[id].subtitle
  return id === 'session-csv' ? [{ key, params: { rows: csvSampleRows() } }] : [{ key }]
}

function statEntries(
  session: WorkbenchSession,
  keys: readonly MessageKey[]
): readonly SessionDisplayStat[] {
  return session.stats.slice(0, keys.length).map((stat, index) => ({
    key: keys[index],
    value: stat.value,
    tone: stat.tone
  }))
}

const FILE_KIND_KEYS: Record<FileKind, MessageKey> = {
  code: 'common.fileKind.code',
  csv: 'common.fileKind.csv',
  tsv: 'common.fileKind.tsv',
  json: 'common.fileKind.json',
  yaml: 'common.fileKind.yaml'
}

/** Dictionary key of one stable file-family identity. */
export function fileKindMessageKey(kind: FileKind): MessageKey {
  return FILE_KIND_KEYS[kind]
}

function fileKindKey(session: WorkbenchSession): MessageKey {
  const adhoc = session.adhoc
  if (adhoc?.scene === 'csv') {
    return adhoc.delimiter === '\t' ? 'common.fileKind.tsv' : 'common.fileKind.csv'
  }
  if (adhoc?.scene === 'structured') {
    return adhoc.format === 'yaml' ? 'common.fileKind.yaml' : 'common.fileKind.json'
  }
  return 'common.fileKind.code'
}

function pathParts(path: string): SessionText {
  const missing = missingSideOf(path)
  if (missing === null) return [{ text: path }]
  const suffix = MISSING_SUFFIX[missing]
  return [
    {
      key: missing === 'left' ? 'shell.session.missing.left' : 'shell.session.missing.right',
      params: { path: path.slice(0, path.length - suffix.length) }
    }
  ]
}

/** File name of one side path, with the internal missing-side token stripped. */
function displayName(path: string): string {
  const missing = missingSideOf(path)
  if (missing === null) return baseName(path)
  return baseName(path.slice(0, path.length - MISSING_SUFFIX[missing].length))
}

/** Title of a file pair: the shared file name, or both names when they differ. */
function filePairTitle(session: WorkbenchSession): SessionText {
  const adhoc = session.adhoc
  if (!adhoc) return [{ text: session.title }]
  const left = displayName(adhoc.pair.left.path)
  const right = displayName(adhoc.pair.right.path)
  return [{ text: left === right ? left : `${left} ↔ ${right}` }]
}

function filePairSubtitle(session: WorkbenchSession): SessionText {
  const adhoc = session.adhoc
  if (!adhoc) return [{ text: session.subtitle }]
  return [
    ...pathParts(adhoc.pair.left.path),
    { text: ' ↔ ' },
    ...pathParts(adhoc.pair.right.path),
    { text: ' · ' },
    { key: fileKindKey(session) }
  ]
}

/**
 * Title and subtitle of a directory pair, derived from the roots of the
 * comparison actually on screen. A session never freezes these at creation, so
 * swapping one side or re-comparing the same tab follows the new roots.
 */
function directoryText(session: WorkbenchSession): { title: SessionText; subtitle: SessionText } {
  const comparison = session.directory
  if (comparison === undefined) {
    return { title: [{ text: session.title }], subtitle: [{ text: session.subtitle }] }
  }
  return {
    title: [{ text: `${comparison.leftName} ↔ ${comparison.rightName}` }],
    subtitle: [{ text: `${comparison.leftRoot} ↔ ${comparison.rightRoot}` }]
  }
}

/** Describes one session for the shell, without resolving any dictionary value. */
export function describeSession(session: WorkbenchSession): SessionDisplay {
  const id = sampleId(session)
  if (id !== null) {
    return {
      title: [{ key: SAMPLE_KEYS[id].title }],
      subtitle: sampleSubtitle(id),
      stats: statEntries(session, SAMPLE_STAT_KEYS[id])
    }
  }

  if (session.directory !== undefined) {
    const text = directoryText(session)
    return {
      title: text.title,
      subtitle: text.subtitle,
      stats: statEntries(session, RUNTIME_DIRECTORY_STATS)
    }
  }

  return {
    title: filePairTitle(session),
    subtitle: filePairSubtitle(session),
    stats: statEntries(session, FILE_PAIR_STATS)
  }
}

/** Resolves one display text in the active language. */
export function renderSessionText(text: SessionText, t: Translate): string {
  return text
    .map((part) => ('key' in part ? t(part.key, part.params) : part.text))
    .join('')
}
