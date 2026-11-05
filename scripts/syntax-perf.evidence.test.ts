/**
 * Real-file evidence probe for the large-file syntax threshold.
 *
 * Run with `pnpm measure:syntax`. It writes deterministic `.ts` files to the
 * system temp dir, reads them back from disk and resolves each ladder tier
 * through the one production entry `resolveSyntaxView`, then records cold /
 * hot timings, cache readings and the rejection path. Nothing is hand-typed:
 * `docs/evidence/syntax-perf.json` and `.md` are rendered from the same object.
 */
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { arch, cpus, platform, release, tmpdir, totalmem } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, it } from 'vitest'
import {
  SYNTAX_CACHE_MAX_CHARS,
  SYNTAX_CACHE_MAX_ENTRIES,
  SYNTAX_MAX_HIGHLIGHT_CHARS,
  clearSyntaxCache,
  resolveSyntaxView,
  syntaxCacheStats
} from '../src/core/syntax'

const LADDER = [32_768, 65_536, 131_072, 262_144, 524_288, 1_048_576, 2_097_152, 4_194_304]
const COLD_RUNS = 3
const MAX_COLD_MEDIAN_MS = 150
const BOUNDED_ROUNDS = 40
const BOUNDED_DOC_CHARS = 20_000
const WORKTREE_ROOT = process.cwd()
const PRODUCT_REPO_ROOT =
  '/Users/zhutao/Library/Application Support/Munk-AI/munk-auto/codebases/projects/open-compare'
const JSON_PATH = process.env.OPENCOMPARE_SYNTAX_EVIDENCE_OUT
  ? resolve(process.env.OPENCOMPARE_SYNTAX_EVIDENCE_OUT)
  : join(WORKTREE_ROOT, 'docs/evidence/syntax-perf.json')
const MD_PATH = process.env.OPENCOMPARE_SYNTAX_EVIDENCE_MD_OUT
  ? resolve(process.env.OPENCOMPARE_SYNTAX_EVIDENCE_MD_OUT)
  : join(WORKTREE_ROOT, 'docs/evidence/syntax-perf.md')

interface Timing {
  readonly coldMs: number[]
  readonly coldMedianMs: number
  readonly hotMs: number[]
  readonly hotMedianMs: number
}

interface TierRecord {
  readonly targetChars: number
  readonly bytes: number
  readonly chars: number
  readonly foldedChars: number
  readonly lines: number
  readonly status: 'highlighted' | 'rejected'
  readonly timing: Timing
  readonly tokens: number
  readonly cache: ReturnType<typeof syntaxCacheStats>
  readonly sha256: string
}

interface CacheProbe {
  readonly rounds: number
  readonly docChars: number
  readonly size: number
  readonly charCount: number
  readonly hits: number
  readonly misses: number
  readonly maxEntries: number
  readonly maxChars: number
  readonly withinBounds: boolean
}

interface HitProbe {
  readonly chars: number
  readonly first: ReturnType<typeof syntaxCacheStats>
  readonly second: ReturnType<typeof syntaxCacheStats>
  readonly sameTokens: boolean
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return round(
    sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
  )
}

/** Deterministic valid TypeScript of exactly `target` characters. */
function tsTextOfLength(target: number): string {
  let text = ''
  let index = 0
  while (true) {
    const line = `${index === 0 ? '' : '\n'}const value${index} = ${index} // note`
    if (text.length + line.length > target) break
    text += line
    index += 1
  }
  return text + ' '.repeat(target - text.length)
}

function fold(text: string): string {
  return text.replace(/\r\n/g, '\n')
}

function measureTier(targetChars: number, path: string, content: string, status: TierRecord['status']): TierRecord {
  const coldMs: number[] = []
  let lastTokens = 0
  for (let run = 0; run < COLD_RUNS; run += 1) {
    clearSyntaxCache()
    const started = performance.now()
    const view = resolveSyntaxView(path, content)
    coldMs.push(round(performance.now() - started))
    lastTokens = view?.tokens.length ?? 0
    if (status === 'highlighted' && view === null) {
      throw new Error(`expected ${targetChars} chars to highlight`)
    }
    if (status === 'rejected' && view !== null) {
      throw new Error(`expected ${targetChars} chars to fall back`)
    }
  }
  const cacheAfterCold = syntaxCacheStats()

  // Hot repeat: a highlighted tier reads the cached tokens; a rejected tier
  // repeats the same early null, so both sizes have a real hot number.
  const hot: number[] = []
  for (let run = 0; run < COLD_RUNS; run += 1) {
    const started = performance.now()
    const view = resolveSyntaxView(path, content)
    hot.push(round(performance.now() - started))
    if (status === 'highlighted' && view === null) {
      throw new Error(`expected hot ${targetChars} chars to highlight`)
    }
    if (status === 'rejected' && view !== null) {
      throw new Error(`expected hot ${targetChars} chars to fall back`)
    }
  }

  return {
    targetChars,
    bytes: Buffer.byteLength(content, 'utf8'),
    chars: content.length,
    foldedChars: fold(content).length,
    lines: content.split('\n').length,
    status,
    timing: {
      coldMs,
      coldMedianMs: median(coldMs),
      hotMs: hot,
      hotMedianMs: median(hot)
    },
    tokens: lastTokens,
    cache: cacheAfterCold,
    sha256: createHash('sha256').update(content).digest('hex')
  }
}

function machineInfo(): Record<string, string | number> {
  return {
    platform: platform(),
    arch: arch(),
    osVersion: release(),
    cpuModel: cpus()[0]?.model ?? 'unknown',
    cpuCount: cpus().length,
    totalMemoryBytes: totalmem(),
    nodeVersion: process.version
  }
}

function markdown(document: {
  generatedAt: string
  command: string
  threshold: number
  selection: { chosenChars: number; maxColdMedianMs: number; capChars: number }
  machine: Record<string, string | number>
  paths: { worktreeRoot: string; productRepoRoot: string; json: string; markdown: string }
  ladder: TierRecord[]
  cacheBounded: CacheProbe
  cacheHitAtThreshold: HitProbe
}): string {
  const rows = document.ladder
    .map(
      (tier) =>
        `| ${tier.targetChars} | ${tier.bytes} | ${tier.chars} | ${tier.foldedChars} | ${tier.lines} | ${tier.status} | ${tier.timing.coldMedianMs} | ${tier.timing.hotMedianMs} | ${tier.tokens} | ${tier.cache.size} / ${tier.cache.charCount} |`
    )
    .join('\n')
  return `# Syntax large-file threshold evidence

Generated by \`${document.command}\` at ${document.generatedAt}. Every number below comes from that run.

## Rule

- Threshold \`SYNTAX_MAX_HIGHLIGHT_CHARS\` = **${document.threshold}** folded characters.
- \`folded.length <= threshold\` highlights; \`folded.length > threshold\` falls back to plain text before cache/tokenizer.
- Selection: largest ladder tier with cold median ≤ ${document.selection.maxColdMedianMs} ms, clamped to \`SYNTAX_CACHE_MAX_CHARS\` = ${document.selection.capChars}. Chosen: **${document.selection.chosenChars}**.
- Cache limits: ${document.cacheBounded.maxEntries} entries / ${document.cacheBounded.maxChars} characters.

## Ladder (3 cold runs, median; hot = cached rerun)

| target chars | bytes | chars | folded chars | lines | status | cold median ms | hot median ms | tokens | cache size / chars |
| ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
${rows}

## Cache boundedness

- ${document.cacheBounded.rounds} distinct documents × ${document.cacheBounded.docChars} chars through \`resolveSyntaxView\`.
- Final size ${document.cacheBounded.size} ≤ ${document.cacheBounded.maxEntries}; charCount ${document.cacheBounded.charCount} ≤ ${document.cacheBounded.maxChars}; within bounds: ${document.cacheBounded.withinBounds}.
- Threshold-sized repeat: first read misses=${document.cacheHitAtThreshold.first.misses}, second read hits=${document.cacheHitAtThreshold.second.hits}; same tokens: ${document.cacheHitAtThreshold.sameTokens}.

## Machine

| field | value |
| --- | --- |
${Object.entries(document.machine)
  .map(([key, value]) => `| ${key} | ${value} |`)
  .join('\n')}

## Path mapping

- Worktree root: \`${document.paths.worktreeRoot}\`
- Product repo root: \`${document.paths.productRepoRoot}\`
- JSON: \`${document.paths.json}\`
- Markdown: \`${document.paths.markdown}\`
`
}

const tempRoot = await mkdtemp(join(tmpdir(), 'opencompare-syntax-perf-'))

afterAll(async () => {
  await rm(tempRoot, { recursive: true, force: true })
})

describe('syntax large-file threshold evidence', () => {
  it('measures the ladder, cache bounds and writes the evidence artifacts', async () => {
    const built: { path: string; content: string }[] = []
    for (const target of LADDER) {
      const content = tsTextOfLength(target)
      const path = join(tempRoot, `ladder-${target}.ts`)
      await writeFile(path, content, 'utf8')
      built.push({ path, content: await readFile(path, 'utf8') })
    }

    const ladder: TierRecord[] = []
    for (const tier of built) {
      const foldedChars = fold(tier.content).length
      const status: TierRecord['status'] = foldedChars > SYNTAX_MAX_HIGHLIGHT_CHARS ? 'rejected' : 'highlighted'
      ladder.push(measureTier(foldedChars, tier.path, tier.content, status))
    }

    clearSyntaxCache()
    for (let index = 0; index < BOUNDED_ROUNDS; index += 1) {
      const text = tsTextOfLength(BOUNDED_DOC_CHARS).replace(
        /const value0/,
        `const value${index}x`
      )
      const path = join(tempRoot, `bounded-${index}.ts`)
      await writeFile(path, text, 'utf8')
      const view = resolveSyntaxView(path, await readFile(path, 'utf8'))
      if (view === null) throw new Error(`bounded document ${index} unexpectedly fell back`)
    }
    const boundedStats = syntaxCacheStats()
    const cacheBounded: CacheProbe = {
      rounds: BOUNDED_ROUNDS,
      docChars: BOUNDED_DOC_CHARS,
      size: boundedStats.size,
      charCount: boundedStats.charCount,
      hits: boundedStats.hits,
      misses: boundedStats.misses,
      maxEntries: SYNTAX_CACHE_MAX_ENTRIES,
      maxChars: SYNTAX_CACHE_MAX_CHARS,
      withinBounds:
        boundedStats.size <= SYNTAX_CACHE_MAX_ENTRIES &&
        boundedStats.charCount <= SYNTAX_CACHE_MAX_CHARS
    }
    if (!cacheBounded.withinBounds) throw new Error('syntax cache exceeded its bounds')

    const thresholdText = tsTextOfLength(SYNTAX_MAX_HIGHLIGHT_CHARS)
    const thresholdPath = join(tempRoot, 'threshold-hit.ts')
    await writeFile(thresholdPath, thresholdText, 'utf8')
    const thresholdContent = await readFile(thresholdPath, 'utf8')
    clearSyntaxCache()
    const firstView = resolveSyntaxView(thresholdPath, thresholdContent)
    const firstStats = syntaxCacheStats()
    const secondView = resolveSyntaxView(thresholdPath, thresholdContent)
    const secondStats = syntaxCacheStats()
    const cacheHitAtThreshold: HitProbe = {
      chars: fold(thresholdContent).length,
      first: firstStats,
      second: secondStats,
      sameTokens: firstView !== null && firstView.tokens === secondView?.tokens
    }

    const highlighted = ladder.filter((tier) => tier.status === 'highlighted')
    const eligible = highlighted.filter(
      (tier) => tier.timing.coldMedianMs <= MAX_COLD_MEDIAN_MS && tier.targetChars <= SYNTAX_CACHE_MAX_CHARS
    )
    const chosenChars = eligible.length === 0 ? 0 : eligible[eligible.length - 1].targetChars

    const generatedAt = new Date().toISOString()
    const document = {
      version: 1,
      generatedAt,
      command: 'pnpm measure:syntax',
      threshold: SYNTAX_MAX_HIGHLIGHT_CHARS,
      selection: {
        chosenChars,
        maxColdMedianMs: MAX_COLD_MEDIAN_MS,
        capChars: SYNTAX_CACHE_MAX_CHARS
      },
      machine: machineInfo(),
      paths: {
        worktreeRoot: WORKTREE_ROOT,
        productRepoRoot: PRODUCT_REPO_ROOT,
        json: JSON_PATH,
        markdown: MD_PATH
      },
      ladder,
      cacheBounded,
      cacheHitAtThreshold
    }

    await mkdir(join(WORKTREE_ROOT, 'docs/evidence'), { recursive: true })
    await writeFile(JSON_PATH, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
    await writeFile(MD_PATH, markdown(document), 'utf8')
    process.stdout.write(`SYNTAX_PERF_EVIDENCE ${JSON.stringify({ threshold: document.threshold, chosenChars })}\n`)
  }, 3_600_000)
})
