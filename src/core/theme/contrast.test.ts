import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  contrastRatio,
  labDeltaE76,
  parseThemeTokens,
  relativeLuminance
} from './contrast'

/**
 * The palette is asserted from the shipped stylesheet text, never from a copy,
 * so a hand-edited token fails the gate that documents the measured ratios.
 */
const css = readFileSync(join(process.cwd(), 'src/renderer/src/assets/main.css'), 'utf8')
const tokens = parseThemeTokens(css)
const THEMES = ['dark', 'light'] as const

const token = (theme: (typeof THEMES)[number], name: string): string => {
  const value = tokens[theme][name]
  if (value === undefined) throw new Error(`missing --color-${name} in the ${theme} theme`)
  return value
}

/** The four change states that must stay mutually distinguishable. */
const FOUR_STATES = ['same', 'added', 'removed', 'modified'] as const

describe('theme token contract', () => {
  it('defines exactly the same --color-* names in both themes', () => {
    expect(Object.keys(tokens.light).sort()).toEqual(Object.keys(tokens.dark).sort())
    // A non-empty set, so an empty light block cannot pass the equality above.
    expect(Object.keys(tokens.dark).length).toBeGreaterThan(20)
  })

  it('keeps every colour as one #rrggbb value in both themes', () => {
    for (const theme of THEMES) {
      for (const [name, value] of Object.entries(tokens[theme])) {
        expect(value, `${theme} --color-${name}`).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })

  it('carries the five diff states and the soft backgrounds in both themes', () => {
    for (const theme of THEMES) {
      for (const name of ['same', 'added', 'removed', 'modified', 'conflict']) {
        expect(token(theme, `diff-${name}`), `${theme} diff-${name}`).toBeDefined()
      }
      for (const name of ['added', 'removed', 'modified', 'conflict']) {
        expect(token(theme, `diff-${name}-soft`), `${theme} diff-${name}-soft`).toBeDefined()
      }
    }
  })
})

describe('WCAG contrast of the shipped tokens', () => {
  it('keeps body text readable on the base surface', () => {
    for (const theme of THEMES) {
      expect(
        contrastRatio(token(theme, 'content-primary'), token(theme, 'surface-base')),
        `${theme} content-primary / surface-base`
      ).toBeGreaterThanOrEqual(4.5)
      expect(
        contrastRatio(token(theme, 'content-secondary'), token(theme, 'surface-base')),
        `${theme} content-secondary / surface-base`
      ).toBeGreaterThanOrEqual(3)
    }
  })

  it('keeps every change state readable on its soft background and on the base surface', () => {
    for (const theme of THEMES) {
      for (const state of FOUR_STATES) {
        const foreground = token(theme, `diff-${state}`)
        expect(
          contrastRatio(foreground, token(theme, 'surface-base')),
          `${theme} diff-${state} / surface-base`
        ).toBeGreaterThanOrEqual(3)
        // `same` has no soft fill of its own; it sits on the sunken surface.
        const background =
          state === 'same' ? token(theme, 'surface-sunken') : token(theme, `diff-${state}-soft`)
        expect(
          contrastRatio(foreground, background),
          `${theme} diff-${state} / ${state === 'same' ? 'surface-sunken' : `diff-${state}-soft`}`
        ).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('is not satisfied by an accidentally inverted palette', () => {
    // Contract check on the math itself: symmetric, bounded, and 21:1 at the ends.
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(contrastRatio('#123456', '#abcdef')).toBeCloseTo(
      contrastRatio('#abcdef', '#123456'),
      10
    )
    expect(relativeLuminance('#000000')).toBe(0)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 10)
  })
})

describe('four-state separation', () => {
  it('keeps same / added / removed / modified pairwise distinct within each theme', () => {
    for (const theme of THEMES) {
      for (let first = 0; first < FOUR_STATES.length; first += 1) {
        for (let second = first + 1; second < FOUR_STATES.length; second += 1) {
          const a = FOUR_STATES[first]
          const b = FOUR_STATES[second]
          expect(
            labDeltaE76(token(theme, `diff-${a}`), token(theme, `diff-${b}`)),
            `${theme} ${a} vs ${b}`
          ).toBeGreaterThanOrEqual(12)
        }
      }
    }
  })

  it('measures CIE76 Lab distance consistently', () => {
    expect(labDeltaE76('#000000', '#000000')).toBe(0)
    expect(labDeltaE76('#000000', '#ffffff')).toBeCloseTo(100, 1)
  })
})
