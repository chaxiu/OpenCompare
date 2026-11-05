// @vitest-environment jsdom
/**
 * Executable gate for the large-file syntax threshold. It proves the two sides
 * of the single entry (`resolveSyntaxView`), the plain-text parity one character
 * past the threshold, the untouched virtualisation constants and that the
 * committed evidence artifact agrees with the frozen code constant.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SYNTAX_CACHE_MAX_CHARS, SYNTAX_CACHE_MAX_ENTRIES, syntaxCacheStats } from '@core/syntax/cache'
import { SYNTAX_MAX_HIGHLIGHT_CHARS, resolveSyntaxView } from '@core/syntax/view'
import { renderWithI18n } from '@renderer/i18n/testing'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { DIFF_ROW_HEIGHT, ROW_OVERSCAN, WINDOW_THRESHOLD } from '@renderer/components/DiffPane'
import type { FilePair } from '@renderer/workbench/session'
import { CodeView } from '@renderer/views/CodeView'
import { installJsdomViewport } from './test/jsdomViewport'

installJsdomViewport({ height: 600 })

afterEach(cleanup)

const platform = createWebPlatformPort()
const THRESHOLD = SYNTAX_MAX_HIGHLIGHT_CHARS

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

function pairWith(extension: string, text: string): FilePair {
  return {
    left: { path: `/pairs/left.${extension}`, text },
    right: { path: `/pairs/right.${extension}`, text }
  }
}

/** Everything the acceptance criteria call "the same plain-text result". */
function renderSignature(pair: FilePair): string {
  renderWithI18n(<CodeView pair={pair} platform={platform} />)
  const count = document.querySelector('[data-code-diff-count]')?.textContent ?? ''
  const counter =
    Array.from(document.querySelectorAll('[data-shell-level="view-toolbar"] span')).find((span) =>
      /^\d+\/\d+$/.test(span.textContent ?? '')
    )?.textContent ?? ''
  const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-diff-row]')).map((row) => ({
    gutter: row.firstElementChild?.textContent ?? '',
    className: row.className,
    text: row.children[1]?.textContent ?? ''
  }))
  const markers = Array.from(document.querySelectorAll<HTMLElement>('[data-ruler-track] [data-start-row]')).map(
    (marker) => `${marker.dataset.startRow}-${marker.dataset.endRow}:${marker.dataset.diffStatus ?? ''}`
  )
  const contentHeight = document
    .querySelector('[data-diff-content-height]')
    ?.getAttribute('data-diff-content-height')
  const windowStart = document
    .querySelector('[data-diff-window-start]')
    ?.getAttribute('data-diff-window-start')
  const syntaxSpans = document.querySelectorAll('[data-syntax]').length
  return JSON.stringify({ count, counter, rows, markers, contentHeight, windowStart, syntaxSpans })
}

function sourceOf(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('large-file threshold rendering', () => {
  it('highlights a threshold-sized .ts side', () => {
    const text = tsTextOfLength(THRESHOLD)
    expect(resolveSyntaxView('/pairs/left.ts', text)).not.toBeNull()
    renderWithI18n(<CodeView pair={pairWith('ts', text)} platform={platform} />)
    expect(document.querySelectorAll('[data-syntax]').length).toBeGreaterThan(0)
  }, 30_000)

  it('renders one character over the threshold exactly like the .txt plain path', () => {
    const text = tsTextOfLength(THRESHOLD + 1)
    expect(resolveSyntaxView('/pairs/left.ts', text)).toBeNull()
    const ts = JSON.parse(renderSignature(pairWith('ts', text))) as {
      syntaxSpans: number
      rows: unknown[]
    }
    expect(ts.syntaxSpans).toBe(0)
    expect(ts.rows.length).toBeGreaterThan(0)
    cleanup()
    const txt = JSON.parse(renderSignature(pairWith('txt', text))) as { syntaxSpans: number }
    expect(txt.syntaxSpans).toBe(0)
    cleanup()
    const tsAgain = renderSignature(pairWith('ts', text))
    cleanup()
    const txtAgain = renderSignature(pairWith('txt', text))
    expect(tsAgain).toEqual(txtAgain)
  }, 30_000)

  it('flips on folded length for LF and CRLF at T and T + 1', () => {
    const inside = tsTextOfLength(THRESHOLD)
    const outside = tsTextOfLength(THRESHOLD + 1)
    expect(resolveSyntaxView('/pairs/a.ts', inside.replace(/\n/g, '\r\n'))).not.toBeNull()
    expect(resolveSyntaxView('/pairs/b.ts', outside.replace(/\n/g, '\r\n'))).toBeNull()
  })
})

describe('single predicate and untouched virtualisation', () => {
  it('keeps the threshold constant out of both renderer panes', () => {
    for (const file of [
      'src/renderer/src/components/DiffPane.tsx',
      'src/renderer/src/views/CodeView.tsx'
    ]) {
      const source = sourceOf(file)
      expect(source, `${file}: threshold constant`).not.toContain('SYNTAX_MAX_HIGHLIGHT_CHARS')
      expect(source, `${file}: raw threshold literal`).not.toMatch(/262_?144/)
      expect(source, `${file}: cache cap literal`).not.toMatch(/SYNTAX_CACHE_MAX/)
    }
  })

  it('routes both panes through the one resolveSyntaxView entry', () => {
    const source = sourceOf('src/renderer/src/views/CodeView.tsx')
    expect(source.match(/resolveSyntaxView\(/g) ?? []).toHaveLength(2)
    expect(source).toContain('syntaxView={leftSyntax}')
    expect(source).toContain('syntaxView={rightSyntax}')
  })

  it('keeps the frozen virtualisation constants and cache bounds', () => {
    expect(DIFF_ROW_HEIGHT).toBe(22)
    expect(ROW_OVERSCAN).toBe(10)
    expect(WINDOW_THRESHOLD).toBe(1_000)
    expect(SYNTAX_CACHE_MAX_ENTRIES).toBe(32)
    expect(SYNTAX_CACHE_MAX_CHARS).toBe(262_144)
    expect(THRESHOLD).toBeLessThanOrEqual(SYNTAX_CACHE_MAX_CHARS)
  })

  it('still returns null for the pre-existing plain-text fallbacks', () => {
    expect(resolveSyntaxView('/pairs/left.txt', 'const a = 1')).toBeNull()
    expect(resolveSyntaxView('/pairs/left.ts', '')).toBeNull()
    expect(resolveSyntaxView('/pairs/left.ts', 'const a = 1\rconst b = 2')).toBeNull()
  })

  it('keeps the module cache bounded after the oversized rejection', () => {
    expect(syntaxCacheStats().size).toBeLessThanOrEqual(SYNTAX_CACHE_MAX_ENTRIES)
    expect(syntaxCacheStats().charCount).toBeLessThanOrEqual(SYNTAX_CACHE_MAX_CHARS)
  })
})

describe('committed syntax-perf evidence', () => {
  const jsonPath = 'docs/evidence/syntax-perf.json'
  const mdPath = 'docs/evidence/syntax-perf.md'

  it('exists, is non-empty and agrees with the frozen threshold', () => {
    expect(existsSync(resolve(process.cwd(), jsonPath))).toBe(true)
    expect(existsSync(resolve(process.cwd(), mdPath))).toBe(true)
    const evidence = JSON.parse(readFileSync(resolve(process.cwd(), jsonPath), 'utf8')) as {
      threshold: number
      command: string
      generatedAt: string
      selection: { chosenChars: number; maxColdMedianMs: number; capChars: number }
      machine: Record<string, unknown>
      paths: { worktreeRoot: string; productRepoRoot: string }
      ladder: Array<{ targetChars: number; status: string; timing: { coldMedianMs: number } }>
      cacheBounded: { withinBounds: boolean; maxChars: number }
    }
    expect(evidence.threshold).toBe(THRESHOLD)
    expect(evidence.selection.chosenChars).toBe(THRESHOLD)
    expect(evidence.selection.capChars).toBe(SYNTAX_CACHE_MAX_CHARS)
    expect(evidence.selection.maxColdMedianMs).toBe(150)
    expect(evidence.command).toBe('pnpm measure:syntax')
    expect(Number.isNaN(Date.parse(evidence.generatedAt))).toBe(false)
    expect(evidence.cacheBounded.withinBounds).toBe(true)
    expect(evidence.cacheBounded.maxChars).toBe(SYNTAX_CACHE_MAX_CHARS)
    expect(evidence.paths.worktreeRoot.startsWith('/')).toBe(true)
    expect(evidence.paths.productRepoRoot.startsWith('/')).toBe(true)
    for (const field of ['platform', 'arch', 'osVersion', 'cpuModel', 'cpuCount', 'totalMemoryBytes', 'nodeVersion']) {
      expect(evidence.machine[field], `machine.${field}`).toBeDefined()
    }

    const highlighted = evidence.ladder.filter((tier) => tier.status === 'highlighted')
    const rejected = evidence.ladder.filter((tier) => tier.status === 'rejected')
    expect(highlighted.length).toBeGreaterThan(0)
    expect(rejected.length).toBeGreaterThan(0)
    const eligible = highlighted.filter(
      (tier) => tier.timing.coldMedianMs <= 150 && tier.targetChars <= SYNTAX_CACHE_MAX_CHARS
    )
    expect(eligible[eligible.length - 1]?.targetChars).toBe(THRESHOLD)
    for (const tier of rejected) expect(tier.targetChars).toBeGreaterThan(THRESHOLD)

    const markdown = readFileSync(resolve(process.cwd(), mdPath), 'utf8')
    expect(markdown).toContain('SYNTAX_MAX_HIGHLIGHT_CHARS')
    expect(markdown).toContain(String(THRESHOLD))
    expect(markdown).toContain(evidence.paths.worktreeRoot)
    expect(markdown).toContain(evidence.paths.productRepoRoot)
  })
})
