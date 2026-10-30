/**
 * Theme token contract and colour math, pure and Node-testable.
 *
 * The single palette source is `src/renderer/src/assets/main.css`: the dark
 * values live in the Tailwind `@theme` block and the light theme overrides the
 * same `--color-*` names in one `:root[data-theme='light']` block. This module
 * reads that text so contrast and four-state separation can be asserted from
 * the real token values instead of copies.
 */

/** The colour tokens of both themes, keyed by token name without the `--color-` prefix. */
export interface ThemeTokens {
  readonly dark: Readonly<Record<string, string>>
  readonly light: Readonly<Record<string, string>>
}

const DARK_BLOCK = '@theme'
const LIGHT_BLOCK = ":root[data-theme='light']"
const COLOR_TOKEN = /--color-([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g

/** Body between the first `{` after `selector` and its matching `}`. */
function blockAfter(css: string, selector: string): string {
  const start = css.indexOf(selector)
  if (start === -1) throw new Error(`main.css is missing the ${selector} block`)
  const open = css.indexOf('{', start + selector.length)
  if (open === -1) throw new Error(`main.css is missing the body of ${selector}`)
  let depth = 0
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1
    else if (css[index] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(open + 1, index)
    }
  }
  throw new Error(`main.css has an unclosed ${selector} block`)
}

function collectColorTokens(block: string): Record<string, string> {
  const tokens: Record<string, string> = {}
  for (const match of block.matchAll(COLOR_TOKEN)) {
    tokens[match[1]] = match[2]
  }
  return tokens
}

/** Reads both `--color-*` maps out of the main stylesheet text. */
export function parseThemeTokens(css: string): ThemeTokens {
  return {
    dark: collectColorTokens(blockAfter(css, DARK_BLOCK)),
    light: collectColorTokens(blockAfter(css, LIGHT_BLOCK))
  }
}

/** One sRGB colour with channels in 0..1. */
export interface Rgb {
  readonly r: number
  readonly g: number
  readonly b: number
}

/** Parses `#rrggbb` (the only form the palette uses). */
export function parseHexColor(value: string): Rgb {
  const match = /^#([0-9a-fA-F]{6})$/.exec(value.trim())
  if (match === null) throw new Error(`not a #rrggbb colour: ${value}`)
  const hex = match[1]
  return {
    r: Number.parseInt(hex.slice(0, 2), 16) / 255,
    g: Number.parseInt(hex.slice(2, 4), 16) / 255,
    b: Number.parseInt(hex.slice(4, 6), 16) / 255
  }
}

function toLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance of an sRGB colour. */
export function relativeLuminance(value: string): number {
  const { r, g, b } = parseHexColor(value)
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/** WCAG 2.x contrast ratio, always >= 1 and order-independent. */
export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a)
  const second = relativeLuminance(b)
  const light = Math.max(first, second)
  const dark = Math.min(first, second)
  return (light + 0.05) / (dark + 0.05)
}

function toXyz(value: string): readonly [number, number, number] {
  const { r, g, b } = parseHexColor(value)
  const lr = toLinear(r)
  const lg = toLinear(g)
  const lb = toLinear(b)
  return [
    lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375,
    lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175,
    lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041
  ]
}

function labF(t: number): number {
  return t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116
}

/** CIE L*a*b* (D65) of an sRGB colour. */
export function toLab(value: string): readonly [number, number, number] {
  const [x, y, z] = toXyz(value)
  const fx = labF(x / 0.95047)
  const fy = labF(y)
  const fz = labF(z / 1.08883)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/** CIE76 colour difference between two sRGB colours. */
export function labDeltaE76(a: string, b: string): number {
  const [l1, a1, b1] = toLab(a)
  const [l2, a2, b2] = toLab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}
