import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio, parseThemeTokens } from './contrast'
import {
  hueDistance,
  parseControlHeightsPx,
  parseRadiusPx,
  parseSpacingBasePx,
  parseTypeScale,
  saturationDropPercent
} from './tokens'

/**
 * The token contract is read from the shipped stylesheet, never from a copy, so
 * a hand-edited value fails the gate that documents it.
 */
const css = readFileSync(join(process.cwd(), 'src/renderer/src/assets/main.css'), 'utf8')
const direction = readFileSync(join(process.cwd(), 'docs/ui-visual-direction.md'), 'utf8')
const tokens = parseThemeTokens(css)

const token = (theme: 'dark' | 'light', name: string): string => {
  const value = tokens[theme][name]
  if (value === undefined) throw new Error(`missing --color-${name} in the ${theme} theme`)
  return value
}

const FOUR_STATES = ['same', 'added', 'removed', 'modified'] as const

/** `weight` of `foreground` composited over an opaque `background`, rounded per channel. */
const blendOver = (foreground: string, background: string, weight: number): string => {
  const channel = (hex: string, index: number): number =>
    Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16)
  const mixed = [0, 1, 2].map((index) =>
    Math.round(channel(foreground, index) * weight + channel(background, index) * (1 - weight))
      .toString(16)
      .padStart(2, '0')
  )
  return `#${mixed.join('')}`
}

describe('type scale', () => {
  it('is exactly 11/12/13/14/15 with line heights 16/18/20/24', () => {
    const scale = parseTypeScale(css)
    const sizes = Object.values(scale).map((entry) => entry.sizePx)
    expect(sizes.sort((a, b) => a - b)).toEqual([11, 12, 13, 14, 15])
    expect(new Set(sizes).size).toBe(sizes.length)
    expect([...new Set(Object.values(scale).map((entry) => entry.lineHeightPx))].sort((a, b) => a - b))
      .toEqual([16, 18, 20, 24])
    for (const [name, entry] of Object.entries(scale)) {
      expect([16, 18, 20, 24], `--text-${name} line height`).toContain(entry.lineHeightPx)
    }
  })
})

describe('spacing, radii and control heights', () => {
  it('uses one 0.25rem spacing base whose steps are 4/8/12/16/24', () => {
    const base = parseSpacingBasePx(css)
    expect(base).toBe(4)
    expect([1, 2, 3, 4, 6].map((step) => base * step)).toEqual([4, 8, 12, 16, 24])
  })

  it('has exactly three radii: 4/6/8', () => {
    expect(parseRadiusPx(css).sort((a, b) => a - b)).toEqual([4, 6, 8])
    const declarations = [...css.matchAll(/border-radius:\s*([^;]+);/g)].map((match) => match[1].trim())
    for (const value of declarations) {
      expect(value, `border-radius: ${value}`).toMatch(/^var\(--radius-(xs|sm|md)\)$/)
    }
  })

  it('has exactly three control heights: 28/32/36', () => {
    expect(parseControlHeightsPx(css).sort((a, b) => a - b)).toEqual([28, 32, 36])
  })
})

describe('dark colour tokens', () => {
  it('pins the layered surfaces, content and lines', () => {
    expect(token('dark', 'surface-base')).toBe('#0b0e12')
    expect(token('dark', 'surface-raised')).toBe('#11151b')
    expect(token('dark', 'surface-overlay')).toBe('#171c24')
    expect(token('dark', 'content-primary')).toBe('#e6e9ef')
    expect(token('dark', 'content-secondary')).toBe('#a8b0bd')
    expect(token('dark', 'content-muted')).toBe('#6f7887')
    expect(token('dark', 'line-subtle')).toBe('#232a35')
    expect(token('dark', 'line-strong')).toBe('#333c4a')
    expect(token('dark', 'accent')).toBe('#4c8dff')
  })

  it('keeps sunken and hover unique on the same neutral ramp', () => {
    expect(token('dark', 'surface-sunken')).toBe('#080b0f')
    expect(token('dark', 'surface-hover')).toBe('#1c2230')
    expect(token('dark', 'surface-sunken')).not.toBe(token('dark', 'surface-hover'))
    const lum = (name: string): number =>
      contrastRatio(token('dark', name), '#000000')
    expect(lum('surface-sunken')).toBeLessThan(lum('surface-base'))
    expect(lum('surface-base')).toBeLessThan(lum('surface-raised'))
    expect(lum('surface-raised')).toBeLessThan(lum('surface-overlay'))
    expect(lum('surface-overlay')).toBeLessThan(lum('surface-hover'))
  })
})

describe('light colour tokens', () => {
  it('pins the layered surfaces, content and lines', () => {
    expect(token('light', 'surface-base')).toBe('#ffffff')
    expect(token('light', 'surface-raised')).toBe('#f6f8fa')
    expect(token('light', 'surface-overlay')).toBe('#eef1f5')
    expect(token('light', 'content-primary')).toBe('#1f2328')
    expect(token('light', 'content-secondary')).toBe('#5b6470')
    expect(token('light', 'content-muted')).toBe('#8b949e')
    expect(token('light', 'line-subtle')).toBe('#e3e7ee')
    expect(token('light', 'line-strong')).toBe('#c6cdd8')
  })

  it('keeps the accent on the dark accent hue and readable with white text', () => {
    expect(hueDistance(token('light', 'accent'), '#4c8dff')).toBeLessThanOrEqual(12)
    expect(contrastRatio(token('light', 'accent'), '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps both line tokens discernible from the base surface', () => {
    const base = token('light', 'surface-base')
    expect(contrastRatio(token('light', 'line-subtle'), base)).toBeGreaterThanOrEqual(1.2)
    expect(contrastRatio(token('light', 'line-strong'), base)).toBeGreaterThanOrEqual(1.4)
  })
})

describe('diff semantics', () => {
  it('pins the four state colours in the dark theme', () => {
    expect(token('dark', 'diff-added')).toBe('#3fb950')
    expect(token('dark', 'diff-removed')).toBe('#f85149')
    expect(token('dark', 'diff-modified')).toBe('#d29922')
    expect(token('dark', 'diff-same')).toBe('#8b949e')
  })

  it('drops the purple conflict hue and reuses the modified family', () => {
    expect(token('dark', 'diff-conflict')).not.toBe('#a371f7')
    expect(token('light', 'diff-conflict')).not.toBe('#8250df')
    for (const theme of ['dark', 'light'] as const) {
      expect(hueDistance(token(theme, 'diff-conflict'), token(theme, 'diff-modified')))
        .toBeLessThanOrEqual(12)
      expect(hueDistance(token(theme, 'danger'), token(theme, 'diff-removed')))
        .toBeLessThanOrEqual(12)
    }
  })

  it('never introduces a fifth interface hue', () => {
    // Blue, green, red and amber are the only families; every token must land
    // within 25 degrees of one of them (very dark tints shift hue slightly).
    const families = ['#4c8dff', '#3fb950', '#f85149', '#d29922']
    for (const theme of ['dark', 'light'] as const) {
      for (const [name, value] of Object.entries(tokens[theme])) {
        const nearest = Math.min(...families.map((family) => hueDistance(value, family)))
        expect(nearest, `${theme} --color-${name} (${value})`).toBeLessThanOrEqual(25)
      }
    }
  })

  it('desaturates the light semantic colours by 10–15% without moving the hue', () => {
    for (const state of FOUR_STATES) {
      const dark = token('dark', `diff-${state}`)
      const light = token('light', `diff-${state}`)
      expect(hueDistance(light, dark), `${state} hue`).toBeLessThanOrEqual(12)
      const drop = saturationDropPercent(dark, light)
      expect(drop, `${state} saturation drop`).toBeGreaterThanOrEqual(9)
      expect(drop, `${state} saturation drop`).toBeLessThanOrEqual(16)
    }
  })

  it('pins the four light state colours at their WCAG-hardened values', () => {
    expect(token('light', 'diff-same')).toBe('#63696f')
    expect(token('light', 'diff-added')).toBe('#32773c')
    expect(token('light', 'diff-removed')).toBe('#b04843')
    expect(token('light', 'diff-modified')).toBe('#856523')
  })

  it('renders chip tints as 12% of the semantic hue over the base surface', () => {
    for (const theme of ['dark', 'light'] as const) {
      for (const state of ['added', 'removed', 'modified', 'conflict'] as const) {
        const expected = blendOver(token(theme, `diff-${state}`), token(theme, 'surface-base'), 0.12)
        expect(token(theme, `diff-${state}-soft`), `${theme} ${state} tint`).toBe(expected)
      }
    }
  })

  it('handles near-grey HSV instead of dividing by zero', () => {
    expect(saturationDropPercent('#000000', '#ffffff')).toBe(0)
    expect(hueDistance('#808080', '#808080')).toBe(0)
  })
})

describe('direction document matches the shipped tokens', () => {
  it('lists every colour token with the exact stylesheet value', () => {
    for (const theme of ['dark', 'light'] as const) {
      for (const [name, value] of Object.entries(tokens[theme])) {
        expect(direction, `${theme} --color-${name}`).toContain(`| \`--color-${name}\` | \`${value}\` |`)
      }
    }
  })

  it('keeps the control shape inventory at three radius steps and three heights', () => {
    // Shapes stay within rectangle (radius xs/sm/md), round dot and thin bar;
    // the only radius scale is the three-step token set.
    const radii = [...new Set(parseRadiusPx(css))]
    expect(radii).toHaveLength(3)
    expect(radii.sort((a, b) => a - b)).toEqual([4, 6, 8])
    const heights = [...new Set(parseControlHeightsPx(css))]
    expect(heights).toHaveLength(3)
    expect(css).not.toMatch(/border-radius:\s*[0-9]+px/)
  })

  it('lists the type, radius and control-height values', () => {
    for (const [name, entry] of Object.entries(parseTypeScale(css))) {
      expect(direction, `--text-${name}`).toContain(
        `| \`--text-${name}\` | ${entry.sizePx}px | ${entry.lineHeightPx}px |`
      )
    }
    const radii = parseRadiusPx(css).sort((a, b) => a - b)
    const radiusNames = ['xs', 'sm', 'md']
    radii.forEach((value, index) => {
      expect(direction, `--radius-${radiusNames[index]}`).toContain(
        `| \`--radius-${radiusNames[index]}\` | ${value}px |`
      )
    })
    const heights = parseControlHeightsPx(css).sort((a, b) => a - b)
    const heightNames = ['sm', 'md', 'lg']
    heights.forEach((value, index) => {
      expect(direction, `--height-control-${heightNames[index]}`).toContain(
        `| \`--height-control-${heightNames[index]}\` | ${value}px |`
      )
    })
    expect(direction).toContain('--spacing: 0.25rem')
  })
})
