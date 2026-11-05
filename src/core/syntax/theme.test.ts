import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio, parseHexColor, parseThemeTokens } from '../theme/contrast'

const css = readFileSync(join(process.cwd(), 'src/renderer/src/assets/main.css'), 'utf8')
const tokens = parseThemeTokens(css)
const THEMES = ['dark', 'light'] as const
const ROLES = ['keyword', 'string', 'number', 'comment'] as const
const BACKGROUNDS = [
  'surface-base',
  'surface-raised',
  'surface-sunken',
  'diff-added-soft',
  'diff-removed-soft',
  'diff-modified-soft',
  'diff-conflict-soft'
] as const

const token = (theme: (typeof THEMES)[number], name: string): string => {
  const value = tokens[theme][name]
  if (value === undefined) throw new Error(`missing --color-${name} in the ${theme} theme`)
  return value
}

function hsv(hex: string): readonly [number, number] {
  const { r, g, b } = parseHexColor(hex)
  const max = Math.max(r, g, b)
  const delta = max - Math.min(r, g, b)
  if (delta === 0) return [0, 0]
  const sector = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
  const hue = sector * 60
  return [hue < 0 ? hue + 360 : hue, delta / max]
}

function hueDistance(a: string, b: string): number {
  const difference = Math.abs(hsv(a)[0] - hsv(b)[0])
  return Math.min(difference, 360 - difference)
}

describe('syntax foreground tokens', () => {
  it('defines exactly four syntax names in both themes', () => {
    const names = (theme: (typeof THEMES)[number]): string[] =>
      Object.keys(tokens[theme])
        .filter((name) => name.startsWith('syntax-'))
        .sort()
    expect(names('dark')).toEqual(ROLES.map((role) => `syntax-${role}`).sort())
    expect(names('light')).toEqual(names('dark'))
  })

  it('clears WCAG AA on every surface and soft diff background', () => {
    for (const theme of THEMES) {
      for (const role of ROLES) {
        for (const background of BACKGROUNDS) {
          expect(
            contrastRatio(token(theme, `syntax-${role}`), token(theme, background)),
            `${theme} syntax-${role} / ${background}`
          ).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })

  it('stays inside the four existing hue families', () => {
    for (const theme of THEMES) {
      expect(hueDistance(token(theme, 'syntax-keyword'), token(theme, 'accent'))).toBeLessThanOrEqual(25)
      expect(hueDistance(token(theme, 'syntax-string'), token(theme, 'diff-added'))).toBeLessThanOrEqual(25)
      expect(hueDistance(token(theme, 'syntax-number'), token(theme, 'diff-modified'))).toBeLessThanOrEqual(25)
      expect(hsv(token(theme, 'syntax-comment'))[1]).toBeLessThanOrEqual(0.25)
    }
  })
})
