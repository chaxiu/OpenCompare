/**
 * Deterministic real-disk fixtures for the text-normalization evidence gate.
 *
 * One logical text per size group is written six times: UTF-8 + LF, UTF-8 +
 * CRLF, UTF-8 BOM + LF, UTF-16LE + CRLF, GBK + LF and a one-character mutation
 * of the UTF-8 + CRLF copy. Nothing here is random or timestamped, no encoder
 * dependency is added (GBK bytes come from the fixed table below) and every
 * probe result is derived from the bytes actually written to disk.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { diffLineTextsWithFacts } from '@core/text/diff'
import type { LineDiffComparison } from '@core/text/diff'
import type { TextFacts } from '@core/text/normalize'
import { decodeText, probeTextBytes } from '@core/text/probe'
import type { EncodingLabel, NewlineKind } from '@core/text/probe'
import type { PathProbeKind, PlatformPort } from '@shared/platform/types'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import type { MessageKey } from '@renderer/i18n/messages'

/** Fixed absolute root: rebuilt from scratch on every run, removed afterwards. */
export const EVIDENCE_ROOT = join(tmpdir(), 'opencompare-diff-normalize-evidence')

/** Byte floor of the large group's UTF-8 variants. */
export const FIVE_MIB = 5 * 1024 * 1024
/** Logical lines every fixture file must carry. */
export const THOUSAND_LINES = 1000
/** Explicit ceiling for one strict re-computation of the large group. */
export const STRICT_RECOMPUTE_BUDGET_MS = 10_000
/** Vitest timeout, kept apart from the recompute budget above. */
export const TEST_TIMEOUT_MS = 120_000

export const EVIDENCE_JSON_PATH = 'docs/evidence/diff-normalize-real-files.json'
export const EVIDENCE_COMMAND = `OPENCOMPARE_EVIDENCE_OUT=${EVIDENCE_JSON_PATH} pnpm test src/diff-normalize-real-gate.test.tsx`

export type FixtureGroupId = 'thousand' | 'five-megabyte'

export type VariantId =
  | 'utf8-lf'
  | 'utf8-crlf'
  | 'utf8bom-lf'
  | 'utf16le-crlf'
  | 'gbk-lf'
  | 'utf8-crlf-mutated'

export const VARIANT_IDS: readonly VariantId[] = [
  'utf8-lf',
  'utf8-crlf',
  'utf8bom-lf',
  'utf16le-crlf',
  'gbk-lf',
  'utf8-crlf-mutated'
]

/** Same logical text, only the encoding / terminator style changes. */
export const UNMUTATED_VARIANT_IDS: readonly VariantId[] = VARIANT_IDS.filter(
  (id) => id !== 'utf8-crlf-mutated'
)

export const GROUPS: readonly FixtureGroupId[] = ['thousand', 'five-megabyte']

/** Every compared variant pair; the mutated copy must report under both states. */
export const PAIRS = [
  { left: 'utf8-crlf', right: 'utf8-lf' },
  { left: 'utf16le-crlf', right: 'utf8-lf' },
  { left: 'gbk-lf', right: 'utf8-lf' },
  { left: 'utf8-crlf', right: 'gbk-lf' },
  { left: 'utf8bom-lf', right: 'utf8-lf' },
  { left: 'utf16le-crlf', right: 'gbk-lf' },
  { left: 'utf8-crlf-mutated', right: 'utf8-lf' }
] as const satisfies readonly { readonly left: VariantId; readonly right: VariantId }[]

/** The pair driven through the real Workbench DOM. */
export const DOM_PAIR = ['utf8-crlf', 'gbk-lf'] as const satisfies readonly [VariantId, VariantId]

/** The four raw status-bar labels, in DOM order. */
export const STATUS_KEYS: readonly MessageKey[] = [
  'shell.status.leftNewline',
  'shell.status.leftEncoding',
  'shell.status.rightNewline',
  'shell.status.rightEncoding'
]

/** Probe labels every variant must carry, byte for byte. */
export const EXPECTED_LABELS: Readonly<
  Record<VariantId, { readonly encoding: EncodingLabel; readonly newline: NewlineKind }>
> = {
  'utf8-lf': { encoding: 'UTF-8', newline: 'LF' },
  'utf8-crlf': { encoding: 'UTF-8', newline: 'CRLF' },
  'utf8bom-lf': { encoding: 'UTF-8 BOM', newline: 'LF' },
  'utf16le-crlf': { encoding: 'UTF-16LE', newline: 'CRLF' },
  'gbk-lf': { encoding: 'GBK', newline: 'LF' },
  'utf8-crlf-mutated': { encoding: 'UTF-8', newline: 'CRLF' }
}

/**
 * Fixed character → GBK byte table. Only ASCII and the characters listed here
 * appear in the GBK variant, so no encoder dependency is needed.
 */
const GBK_BYTES: Record<string, readonly [number, number]> = {
  行: [0xd0, 0xd0],
  中: [0xd6, 0xd0],
  文: [0xce, 0xc4],
  内: [0xc4, 0xda],
  容: [0xc8, 0xdd],
  对: [0xb6, 0xd4],
  比: [0xb1, 0xc8],
  测: [0xb2, 0xe2],
  试: [0xca, 0xd4],
  件: [0xbc, 0xfe],
  编: [0xb1, 0xe0],
  码: [0xc2, 0xeb],
  换: [0xbb, 0xbb],
  数: [0xca, 0xfd],
  据: [0xbe, 0xdd],
  差: [0xb2, 0xee],
  异: [0xd2, 0xec],
  高: [0xb8, 0xdf],
  亮: [0xc1, 0xc1],
  状: [0xd7, 0xb4],
  态: [0xcc, 0xac],
  栏: [0xc0, 0xb8],
  归: [0xb9, 0xe9],
  一: [0xd2, 0xbb]
}

const THOUSAND_LINE_PREFIX = '行中文内容对比测试文件编码换行数据'
const LARGE_LINE_PREFIX = '数据'
const LARGE_LINE_PATTERN = '差异高亮状态栏换行编码归一中内容对比测试文件'
const LARGE_LINE_COUNT = 1200
const LARGE_LINE_PATTERN_REPEAT = Math.ceil(1500 / LARGE_LINE_PATTERN.length)

const LF = '\n'
const CRLF = '\r\n'

/** Thousands group: short, unique lines, never a trailing empty line. */
function buildThousandLines(): string[] {
  return Array.from(
    { length: THOUSAND_LINES },
    (_, index) => `${THOUSAND_LINE_PREFIX} ${index}`
  )
}

/** Large group: long CJK-dense lines, ≥ 5 MiB once UTF-8 encoded. */
function buildLargeLines(): string[] {
  const body = LARGE_LINE_PATTERN.repeat(LARGE_LINE_PATTERN_REPEAT)
  return Array.from({ length: LARGE_LINE_COUNT }, (_, index) => `${LARGE_LINE_PREFIX}${index}:${body}`)
}

/** Changes exactly one character of one line; every other line is untouched. */
function mutateOneCharacter(lines: readonly string[]): string[] {
  const next = [...lines]
  const index = Math.floor(lines.length / 2)
  const row = next[index]
  const at = row.indexOf('中')
  if (at < 0) throw new Error('mutation target character is missing from the fixture line')
  next[index] = `${row.slice(0, at)}错${row.slice(at + 1)}`
  return next
}

function joinLines(lines: readonly string[], terminator: string): string {
  return lines.map((line) => `${line}${terminator}`).join('')
}

function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function encodeUtf8Bom(text: string): Uint8Array {
  const body = encodeUtf8(text)
  const out = new Uint8Array(3 + body.length)
  out.set([0xef, 0xbb, 0xbf], 0)
  out.set(body, 3)
  return out
}

function encodeUtf16LeBom(text: string): Uint8Array {
  const out = new Uint8Array(2 + text.length * 2)
  out[0] = 0xff
  out[1] = 0xfe
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    out[2 + index * 2] = code & 0xff
    out[3 + index * 2] = code >> 8
  }
  return out
}

function encodeGbk(text: string): Uint8Array {
  const out: number[] = []
  for (const character of text) {
    const code = character.charCodeAt(0)
    if (code < 0x80) {
      out.push(code)
      continue
    }
    const pair = GBK_BYTES[character]
    if (pair === undefined) throw new Error(`GBK table has no entry for ${character}`)
    out.push(pair[0], pair[1])
  }
  return Uint8Array.from(out)
}

/** Counts newline terminators exactly like `detectNewline` groups them. */
export function countNewlineTerminators(text: string): number {
  let count = 0
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code === 0x0a) count += 1
    else if (code === 0x0d) {
      count += 1
      if (text.charCodeAt(index + 1) === 0x0a) index += 1
    }
  }
  return count
}

export interface WrittenVariant {
  readonly id: VariantId
  readonly path: string
  readonly text: string
  readonly bytes: number
  readonly sha256: string
  readonly lines: number
  readonly encoding: EncodingLabel
  readonly newline: NewlineKind
  readonly probeMs: number
}

export interface WrittenGroup {
  readonly id: FixtureGroupId
  readonly variants: Readonly<Record<VariantId, WrittenVariant>>
}

export interface WrittenFixtures {
  readonly root: string
  readonly groups: Readonly<Record<FixtureGroupId, WrittenGroup>>
}

export interface EvidenceState {
  readonly differenceCount: number
  readonly blocks: number
  readonly nonSameRows: number
  readonly inlineSegments: number
}

export interface EvidencePair {
  readonly left: VariantId
  readonly right: VariantId
  readonly default: EvidenceState
  readonly strict: EvidenceState
  readonly defaultElapsedMs: number
  readonly strictElapsedMs: number
}

export interface EvidenceVariant {
  readonly path: string
  readonly bytes: number
  readonly sha256: string
  readonly lines: number
  readonly encoding: EncodingLabel
  readonly newline: NewlineKind
}

export interface EvidenceGroup {
  readonly logicalLines: number
  readonly probeMs: number
  readonly variants: Readonly<Record<VariantId, EvidenceVariant>>
  readonly pairs: readonly EvidencePair[]
}

export interface EvidenceDom {
  readonly pair: readonly [VariantId, VariantId]
  readonly statusDefault: readonly string[]
  readonly statusAfterClickCycle: readonly string[]
  readonly statusAfterSpaceCycle: readonly string[]
  readonly countDefault: number
  readonly countClickOff: number
  readonly countClickReopened: number
  readonly countSpaceOff: number
  readonly countSpaceOn: number
  readonly blocksDefault: number
  readonly blocksClickOff: number
  readonly blocksClickReopened: number
  readonly switchClickMs: number
  readonly switchSpaceMs: number
  readonly leftRows: number
  readonly rightRows: number
}

export interface EvidenceDocument {
  readonly version: 1
  readonly command: string
  readonly root: string
  readonly thresholds: {
    readonly fiveMib: number
    readonly thousandLines: number
    readonly strictRecomputeBudgetMs: number
  }
  readonly groups: {
    readonly thousand: EvidenceGroup & { readonly dom: EvidenceDom }
    readonly 'five-megabyte': EvidenceGroup & {
      readonly strictRecomputeMs: number
      readonly operability: string
    }
  }
}

/** Rebuilds the fixture root from scratch. */
export function resetEvidenceRoot(): void {
  rmSync(EVIDENCE_ROOT, { recursive: true, force: true })
  mkdirSync(EVIDENCE_ROOT, { recursive: true })
}

/** Drops the fixture root; called once the gate is finished. */
export function removeEvidenceRoot(): void {
  rmSync(EVIDENCE_ROOT, { recursive: true, force: true })
}

function writeVariant(
  groupDirectory: string,
  id: VariantId,
  text: string,
  bytes: Uint8Array
): WrittenVariant {
  const path = join(groupDirectory, `${id}.txt`)
  writeFileSync(path, bytes)
  // Probe timing starts at the disk read so it reflects the real single-read seam.
  const probeStart = performance.now()
  const diskBytes = readFileSync(path)
  const probe = probeTextBytes(diskBytes)
  const probeMs = performance.now() - probeStart
  const diskSha = createHash('sha256').update(diskBytes).digest('hex')

  if (statSync(path).size !== bytes.length) {
    throw new Error(`${path}: on-disk size disagrees with the written byte length`)
  }
  if (probe.sha256 !== diskSha) throw new Error(`${path}: probe sha256 disagrees with the file`)
  if (probe.text !== text) throw new Error(`${path}: probe text disagrees with the source text`)
  if (id === 'gbk-lf' && probe.encoding !== 'GBK') {
    throw new Error(`${path}: GBK bytes were not detected as GBK (${probe.encoding})`)
  }

  return {
    id,
    path,
    text,
    bytes: bytes.length,
    sha256: probe.sha256,
    lines: countNewlineTerminators(text),
    encoding: probe.encoding,
    newline: probe.newline,
    probeMs
  }
}

function writeGroup(id: FixtureGroupId, lines: readonly string[]): WrittenGroup {
  const directory = join(EVIDENCE_ROOT, id)
  mkdirSync(directory, { recursive: true })
  const lfText = joinLines(lines, LF)
  const crlfText = joinLines(lines, CRLF)
  const mutatedText = joinLines(mutateOneCharacter(lines), CRLF)
  const variants = {
    'utf8-lf': writeVariant(directory, 'utf8-lf', lfText, encodeUtf8(lfText)),
    'utf8-crlf': writeVariant(directory, 'utf8-crlf', crlfText, encodeUtf8(crlfText)),
    'utf8bom-lf': writeVariant(directory, 'utf8bom-lf', lfText, encodeUtf8Bom(lfText)),
    'utf16le-crlf': writeVariant(directory, 'utf16le-crlf', crlfText, encodeUtf16LeBom(crlfText)),
    'gbk-lf': writeVariant(directory, 'gbk-lf', lfText, encodeGbk(lfText)),
    'utf8-crlf-mutated': writeVariant(
      directory,
      'utf8-crlf-mutated',
      mutatedText,
      encodeUtf8(mutatedText)
    )
  } satisfies Record<VariantId, WrittenVariant>
  return { id, variants }
}

/** Writes both groups to the fixed root and probes every written file. */
export function writeEvidenceFixtures(): WrittenFixtures {
  resetEvidenceRoot()
  return {
    root: EVIDENCE_ROOT,
    groups: {
      thousand: writeGroup('thousand', buildThousandLines()),
      'five-megabyte': writeGroup('five-megabyte', buildLargeLines())
    }
  }
}

/** Platform port backed by the real disk for exactly the three seams the gate needs. */
export function createDiskPlatformPort(): PlatformPort {
  const base = createWebPlatformPort()
  return {
    ...base,
    probeTextFile: async (path) => {
      const bytes = readFileSync(path)
      return { path, ...probeTextBytes(bytes) }
    },
    readTextFile: async (path) => decodeText(readFileSync(path)).text,
    statPath: async (path): Promise<PathProbeKind> => {
      try {
        return statSync(path).isDirectory() ? 'directory' : 'file'
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return 'missing'
        throw cause
      }
    }
  }
}

/** Prints the run's evidence on one stdout line, for the report and the docs. */
export function emitEvidenceLine(evidence: EvidenceDocument): void {
  console.log(`OPENCOMPARE_DIFF_NORMALIZE_EVIDENCE ${JSON.stringify(evidence)}`)
}

/** Writes the same JSON to `path`; only the explicit env-driven run does this. */
export function writeEvidenceOut(path: string, evidence: EvidenceDocument): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`)
}

/** Reads the committed evidence document back for the pinning assertion. */
export function readEvidenceDocument(path: string): EvidenceDocument {
  return JSON.parse(readFileSync(path, 'utf8')) as EvidenceDocument
}

/* ------------------------------------------------------------------ */
/* One comparison run → evidence document                              */
/* ------------------------------------------------------------------ */

export interface PairComparisons {
  readonly defaultComparison: LineDiffComparison
  readonly strictComparison: LineDiffComparison
  readonly newlineOnlyComparison: LineDiffComparison
  readonly defaultElapsedMs: number
  readonly strictElapsedMs: number
}

export interface EvidenceRun {
  readonly evidence: EvidenceDocument
  readonly pairs: ReadonlyMap<string, PairComparisons>
}

export function pairKey(group: FixtureGroupId, left: VariantId, right: VariantId): string {
  return `${group}:${left}>${right}`
}

function factsOf(fixtures: WrittenFixtures, group: FixtureGroupId, id: VariantId): TextFacts {
  const variant = fixtures.groups[group].variants[id]
  return { text: variant.text, encoding: variant.encoding, sha256: variant.sha256 }
}

function measurePair(
  fixtures: WrittenFixtures,
  group: FixtureGroupId,
  left: VariantId,
  right: VariantId
): PairComparisons {
  const leftFacts = factsOf(fixtures, group, left)
  const rightFacts = factsOf(fixtures, group, right)

  const defaultStart = performance.now()
  const defaultComparison = diffLineTextsWithFacts(leftFacts, rightFacts, {})
  const defaultElapsedMs = performance.now() - defaultStart

  const strictStart = performance.now()
  const strictComparison = diffLineTextsWithFacts(leftFacts, rightFacts, {
    ignoreNewline: false,
    ignoreEncoding: false
  })
  const strictElapsedMs = performance.now() - strictStart

  const newlineOnlyComparison = diffLineTextsWithFacts(leftFacts, rightFacts, {
    ignoreNewline: false
  })

  return {
    defaultComparison,
    strictComparison,
    newlineOnlyComparison,
    defaultElapsedMs,
    strictElapsedMs
  }
}

/** The one place a comparison turns into the evidence numbers. */
export function stateOf(comparison: LineDiffComparison): EvidenceState {
  let inlineSegments = 0
  for (const row of comparison.rows) {
    for (const segment of row.leftSegments ?? []) if (segment.changed) inlineSegments += 1
    for (const segment of row.rightSegments ?? []) if (segment.changed) inlineSegments += 1
  }
  return {
    differenceCount: comparison.differenceCount,
    blocks: comparison.blocks.length,
    nonSameRows: comparison.rows.filter((row) => row.status !== 'same').length,
    inlineSegments
  }
}

function buildGroupEvidence(fixtures: WrittenFixtures, group: FixtureGroupId, pairs: Map<string, PairComparisons>): EvidenceGroup {
  const written = fixtures.groups[group]
  const variants = {} as Record<VariantId, EvidenceVariant>
  let probeMs = 0
  for (const id of VARIANT_IDS) {
    const variant = written.variants[id]
    probeMs += variant.probeMs
    variants[id] = {
      path: variant.path,
      bytes: variant.bytes,
      sha256: variant.sha256,
      lines: variant.lines,
      encoding: variant.encoding,
      newline: variant.newline
    }
  }

  const evidencePairs: EvidencePair[] = PAIRS.map((spec) => {
    const comparison = measurePair(fixtures, group, spec.left, spec.right)
    pairs.set(pairKey(group, spec.left, spec.right), comparison)
    return {
      left: spec.left,
      right: spec.right,
      default: stateOf(comparison.defaultComparison),
      strict: stateOf(comparison.strictComparison),
      defaultElapsedMs: comparison.defaultElapsedMs,
      strictElapsedMs: comparison.strictElapsedMs
    }
  })

  return { logicalLines: written.variants['utf8-lf'].lines, probeMs, variants, pairs: evidencePairs }
}

/** Compares every pair of both groups and assembles the evidence document. */
export function measureEvidence(fixtures: WrittenFixtures, dom: EvidenceDom): EvidenceRun {
  const pairs = new Map<string, PairComparisons>()
  const thousand = buildGroupEvidence(fixtures, 'thousand', pairs)
  const five = buildGroupEvidence(fixtures, 'five-megabyte', pairs)
  const strictRecomputeMs = Math.max(
    ...PAIRS.map((spec) => pairs.get(pairKey('five-megabyte', spec.left, spec.right))?.strictElapsedMs ?? 0)
  )

  return {
    pairs,
    evidence: {
      version: 1,
      command: EVIDENCE_COMMAND,
      root: fixtures.root,
      thresholds: {
        fiveMib: FIVE_MIB,
        thousandLines: THOUSAND_LINES,
        strictRecomputeBudgetMs: STRICT_RECOMPUTE_BUDGET_MS
      },
      groups: {
        thousand: { ...thousand, dom },
        'five-megabyte': {
          ...five,
          strictRecomputeMs,
          operability: 'core-only rows: compared through diffLineTextsWithFacts, not rendered into jsdom'
        }
      }
    }
  }
}

/** Only the deterministic fields: timings and absolute paths stay out of the pin. */
export function pinnedFields(document: EvidenceDocument): unknown {
  const project = (group: EvidenceGroup) => ({
    variants: Object.fromEntries(
      VARIANT_IDS.map((id) => {
        const variant = group.variants[id]
        return [id, { bytes: variant.bytes, sha256: variant.sha256 }]
      })
    ),
    pairs: group.pairs.map((pair) => ({
      left: pair.left,
      right: pair.right,
      default: { differenceCount: pair.default.differenceCount, blocks: pair.default.blocks },
      strict: { differenceCount: pair.strict.differenceCount, blocks: pair.strict.blocks }
    }))
  })
  return {
    thousand: project(document.groups.thousand),
    'five-megabyte': project(document.groups['five-megabyte'])
  }
}
