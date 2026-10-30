import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TIER_WIDTHS } from './shellLayout'
import type { WidthTier } from './shellLayout'
import {
  PAIR_SEPARATOR,
  SUBTITLE_FORMAT_SEPARATOR,
  TAB_ELLIPSIS,
  TAB_TIER_BUDGETS,
  clipPair,
  clipSubtitle,
  clipTail,
  clipTitle,
  splitPairBudget
} from './sessionTabText'
import type { ClippedText } from './sessionTabText'

const ROOT = process.cwd()
const TIERS: readonly WidthTier[] = ['compact', 'regular', 'wide']

const LONG_PATH =
  '/Users/someone/workspace/client-project/packages/desktop/src/renderer/components/session-tabs.ts'
const LONG_PAIR = `${LONG_PATH}${PAIR_SEPARATOR}/Users/someone/archive/old-client-project/packages/desktop/src/renderer/components/session-tabs.ts`
const LONG_SUBTITLE = `${LONG_PATH}${PAIR_SEPARATOR}/Users/someone/archive/old-client-project/packages/desktop/src/renderer/components/session-tabs.ts${SUBTITLE_FORMAT_SEPARATOR}code`

/** Every clipping input the shape / bound properties are exercised on. */
const SAMPLES: readonly string[] = [
  '',
  'a',
  'engine.ts',
  'a'.repeat(40),
  LONG_PATH,
  LONG_PAIR,
  LONG_SUBTITLE,
  `${'x'.repeat(60)}.csv${PAIR_SEPARATOR}${'y'.repeat(60)}.csv`
]

const BUDGETS: readonly number[] = [1, 2, 3, 4, 5, 8, 12, 16, 21, 30, 40, 60]

function isSuffix(suffix: string, input: string): boolean {
  return input.endsWith(suffix)
}

/** Drops every comment so only executing code is checked for DOM globals. */
function stripComments(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/^\s*\/\/.*$/gm, '')
}

/** The `ac-clip-tail-shape` identity of one clipped side of an input. */
function expectTailShape(clip: ClippedText, input: string): void {
  expect(clip.text.startsWith(TAB_ELLIPSIS)).toBe(true)
  expect(clip.text.slice(1, 2)).not.toBe(TAB_ELLIPSIS)
  expect(isSuffix(clip.text.slice(1), input)).toBe(true)
  expect(clip.omittedCount).toBe(input.length - clip.text.slice(1).length)
  expect(clip.omittedAt).toBe(input.length - clip.text.slice(1).length)
  expect(clip.omittedAt).toBeLessThanOrEqual(input.length)
}

describe('session tab text module purity', () => {
  it('keeps its runtime dependency chain free of React, DOM and Electron', () => {
    const files = ['src/renderer/src/workbench/sessionTabText.ts', 'src/renderer/src/workbench/shellLayout.ts']

    for (const file of files) {
      const source = readFileSync(join(ROOT, file), 'utf8')
      expect(source).not.toMatch(/\bfrom\s+['"]react['"]/)
      expect(source).not.toMatch(/\bfrom\s+['"]react-dom/)
      expect(source).not.toMatch(/\bfrom\s+['"]electron['"]/)
      expect(source).not.toMatch(/\brequire\(\s*['"]electron['"]\s*\)/)

      // Comments may talk about a window; only code may touch the DOM.
      const code = stripComments(source)
      expect(code).not.toMatch(/\bdocument\b/)
      expect(code).not.toMatch(/\bwindow\b/)
    }

    // The only import of the pure module is a type-only tier import.
    const source = readFileSync(join(ROOT, 'src/renderer/src/workbench/sessionTabText.ts'), 'utf8')
    const specifiers = Array.from(source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)).map(
      (match) => match[1]
    )
    expect(specifiers).toEqual(['./shellLayout'])
    expect(source).toContain("import type { WidthTier } from './shellLayout'")
  })

  it('is deterministic and idempotent', () => {
    const rules = [clipTail, clipPair, clipTitle, clipSubtitle] as const
    for (const rule of rules) {
      for (const input of SAMPLES) {
        for (const budget of BUDGETS) {
          const first = rule(input, budget)
          const second = rule(input, budget)
          expect(second).toEqual(first)
          // Clipping the rendered text again never changes it.
          expect(rule(first.text, budget).text).toBe(first.text)
        }
      }
    }
  })
})

describe('clipTail', () => {
  it('renders one ellipsis plus a contiguous tail of the input', () => {
    for (const input of SAMPLES) {
      for (const budget of BUDGETS) {
        const clip = clipTail(input, budget)
        if (input.length > budget) {
          expect(clip.truncated).toBe(true)
          expectTailShape(clip, input)
        } else {
          expect(clip.truncated).toBe(false)
        }
      }
    }
  })

  it('never exceeds the budget and leaves a fitting input untouched', () => {
    for (const input of SAMPLES) {
      for (const budget of BUDGETS) {
        const clip = clipTail(input, budget)
        if (budget >= 1) expect(clip.text.length).toBeLessThanOrEqual(budget)
        if (input.length <= budget) {
          expect(clip.text).toBe(input)
          expect(clip.truncated).toBe(false)
          expect(clip.omittedCount).toBe(0)
        }
      }
    }
  })

  it('never throws and never returns an empty string at a tiny budget', () => {
    for (const budget of [1, 0, -3, 0.4]) {
      const clip = clipTail(LONG_PATH, budget)
      expect(clip.text.length).toBeGreaterThan(0)
      expect(clip.text.startsWith(TAB_ELLIPSIS)).toBe(true)
    }
  })

  it('keeps the file extension when the budget allows it', () => {
    for (const extension of ['.ts', '.json', '.csv']) {
      const input = `${LONG_PATH.slice(0, -3)}${extension}`
      for (let budget = extension.length + 1; budget <= 40; budget += 1) {
        const clip = clipTail(input, budget)
        expect(clip.text.endsWith(extension)).toBe(true)
      }
      // Below that the text is still non-empty, just not extension-preserving.
      expect(clipTail(input, extension.length).text.length).toBeGreaterThan(0)
    }
  })
})

describe('clipPair', () => {
  it('keeps the separator with its spaces and both sides non-empty', () => {
    for (const budget of BUDGETS.filter((value) => value >= 8)) {
      const clip = clipPair(LONG_PAIR, budget)
      expect(clip.text).toContain(PAIR_SEPARATOR)
      expect(clip.text.length).toBeLessThanOrEqual(budget)
      const [left, right] = clip.text.split(PAIR_SEPARATOR)
      expect(left.length).toBeGreaterThan(0)
      expect(right.length).toBeGreaterThan(0)
    }
  })

  it('splits the budget evenly and clips each side with the tail rule', () => {
    const at = LONG_PAIR.indexOf(PAIR_SEPARATOR)
    const leftInput = LONG_PAIR.slice(0, at)
    const rightInput = LONG_PAIR.slice(at + PAIR_SEPARATOR.length)
    for (const budget of BUDGETS.filter((value) => value >= 8)) {
      const clip = clipPair(LONG_PAIR, budget)
      const [left, right] = clip.text.split(PAIR_SEPARATOR)
      expect(clip.text.length).toBeLessThanOrEqual(budget)
      expect(Math.abs(left.length - right.length)).toBeLessThanOrEqual(1)
      expectTailShape(clipTail(leftInput, splitPairBudget(budget).leftCols), leftInput)
      expectTailShape(clipTail(rightInput, splitPairBudget(budget).rightCols), rightInput)
    }

    const shares = splitPairBudget(21)
    expect(Math.abs(shares.leftCols - shares.rightCols)).toBeLessThanOrEqual(1)
    for (const value of BUDGETS.filter((value) => value >= 8)) {
      const split = splitPairBudget(value)
      expect(Math.abs(split.leftCols - split.rightCols)).toBeLessThanOrEqual(1)
      expect(split.leftCols).toBeGreaterThan(0)
      expect(split.rightCols).toBeGreaterThan(0)
    }
  })

  it('leaves a short side alone instead of padding it', () => {
    const clip = clipPair(`a.ts${PAIR_SEPARATOR}${'b'.repeat(60)}.json`, 16)
    const [left, right] = clip.text.split(PAIR_SEPARATOR)
    expect(left).toBe('a.ts')
    expect(right.startsWith(TAB_ELLIPSIS)).toBe(true)
    expect(right.endsWith('.json')).toBe(true)
  })

  it('falls back to plain tail clipping when there is no pair', () => {
    expect(clipPair(LONG_PATH, 12)).toEqual(clipTail(LONG_PATH, 12))
    expect(clipPair(` ${PAIR_SEPARATOR}tail.ts`, 12)).toEqual(clipTail(` ${PAIR_SEPARATOR}tail.ts`, 12))
  })
})

describe('clipSubtitle', () => {
  it('drops the format suffix before clipping the path', () => {
    const path = `/left/root/deep/file.ts${PAIR_SEPARATOR}/right/root/deep/file.ts`
    const input = `${path}${SUBTITLE_FORMAT_SEPARATOR}code`
    expect(input.length).toBeGreaterThan(path.length)

    const clip = clipSubtitle(input, path.length)
    expect(clip.text).toBe(path)
    expect(clip.text).not.toContain(SUBTITLE_FORMAT_SEPARATOR)
    expect(clip.truncated).toBe(true)
  })

  it('clips the path only after the suffix is gone', () => {
    const path = LONG_SUBTITLE.slice(0, LONG_SUBTITLE.lastIndexOf(SUBTITLE_FORMAT_SEPARATOR))
    const clip = clipSubtitle(LONG_SUBTITLE, 16)
    expect(clip.text).not.toContain(SUBTITLE_FORMAT_SEPARATOR)
    expect(clip.text.length).toBeLessThanOrEqual(16)
    expect(clip.text.startsWith(TAB_ELLIPSIS)).toBe(true)
    expect(isSuffix(clip.text.slice(1), path)).toBe(true)
    expect(clip.omittedCount).toBe(LONG_SUBTITLE.length - clip.text.slice(1).length)
  })

  it('keeps the suffix when the whole subtitle fits', () => {
    const fits = `${LONG_PATH}${SUBTITLE_FORMAT_SEPARATOR}code`
    const clip = clipSubtitle(fits, fits.length)
    expect(clip.text).toBe(fits)
    expect(clip.truncated).toBe(false)
    expect(clip.omittedCount).toBe(0)
  })
})

describe('tab tier budget table', () => {
  it('covers exactly the shell width tiers', () => {
    expect(Object.keys(TAB_TIER_BUDGETS).sort()).toEqual(Object.keys(TIER_WIDTHS).sort())
  })

  it('holds the tab width above the chrome plus the text columns', () => {
    for (const tier of TIERS) {
      const budget = TAB_TIER_BUDGETS[tier]
      expect(budget.tabMaxWidthPx).toBeGreaterThanOrEqual(
        budget.chromeWidthPx + (budget.titleCols + budget.subtitleCols) * budget.columnPx
      )
      expect(budget.titleCols).toBeGreaterThanOrEqual(8)
      expect(budget.titleCols).toBeGreaterThan(0)
      expect(budget.subtitleCols).toBeGreaterThanOrEqual(0)
      expect(budget.columnPx).toBeGreaterThan(0)
    }
  })

  it('grows width and copy budgets monotonically across the tiers', () => {
    for (const field of ['tabMaxWidthPx', 'titleCols', 'subtitleCols'] as const) {
      expect(TAB_TIER_BUDGETS.compact[field]).toBeLessThan(TAB_TIER_BUDGETS.regular[field])
      expect(TAB_TIER_BUDGETS.regular[field]).toBeLessThan(TAB_TIER_BUDGETS.wide[field])
    }
    expect(TAB_TIER_BUDGETS.compact.subtitleCols).toBe(0)
  })
})
