/**
 * Reads the non-colour half of the visual token contract out of the shipped
 * `main.css` text: type scale, spacing base, radii and control heights.
 *
 * The colour half already lives in `./contrast` (both themes, parsed from the
 * same file). Tests assert these values from the stylesheet, never from a copy.
 */

export interface TypeToken {
  readonly sizePx: number
  readonly lineHeightPx: number
}

const SIZE_TOKEN = /--text-([a-z0-9-]+):\s*([\d.]+)(px|rem)\s*;/g
const LINE_HEIGHT_TOKEN = /--text-([a-z0-9-]+)--line-height:\s*([\d.]+)(px|rem)\s*;/g

function toPx(raw: string, unit: string): number {
  const value = Number.parseFloat(raw)
  return unit === 'rem' ? value * 16 : value
}

function themeBlock(css: string): string {
  const start = css.indexOf('@theme')
  if (start === -1) throw new Error('main.css is missing the @theme block')
  const open = css.indexOf('{', start)
  if (open === -1) throw new Error('main.css is missing the body of @theme')
  let depth = 0
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1
    else if (css[index] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(open + 1, index)
    }
  }
  throw new Error('main.css has an unclosed @theme block')
}

/** Every `--text-*` size token with the line height declared for it. */
export function parseTypeScale(css: string): Record<string, TypeToken> {
  const block = themeBlock(css)
  const lineHeights = new Map<string, number>()
  for (const match of block.matchAll(LINE_HEIGHT_TOKEN)) {
    lineHeights.set(match[1], toPx(match[2], match[3]))
  }
  const scale: Record<string, TypeToken> = {}
  for (const match of block.matchAll(SIZE_TOKEN)) {
    const name = match[1]
    if (name.includes('line-height')) continue
    const lineHeightPx = lineHeights.get(name)
    if (lineHeightPx === undefined) throw new Error(`--text-${name} has no line height`)
    scale[name] = { sizePx: toPx(match[2], match[3]), lineHeightPx }
  }
  return scale
}

function valuesOf(css: string, pattern: RegExp): number[] {
  return [...themeBlock(css).matchAll(pattern)].map((match) => toPx(match[1], match[2]))
}

/** Tailwind's single spacing base, in pixels. */
export function parseSpacingBasePx(css: string): number {
  const match = /--spacing:\s*([\d.]+)(px|rem)\s*;/.exec(themeBlock(css))
  if (match === null) throw new Error('main.css is missing --spacing')
  return toPx(match[1], match[2])
}

/** Radius tokens, in pixels. */
export function parseRadiusPx(css: string): number[] {
  return valuesOf(css, /--radius-[a-z0-9-]+:\s*([\d.]+)(px|rem)\s*;/g)
}

/** Control-height tokens, in pixels. */
export function parseControlHeightsPx(css: string): number[] {
  return valuesOf(css, /--height-control-[a-z0-9-]+:\s*([\d.]+)(px|rem)\s*;/g)
}

export interface Hsv {
  readonly h: number
  readonly s: number
  readonly v: number
}

function channel(hex: string, index: number): number {
  return Number.parseInt(hex.replace('#', '').slice(index * 2, index * 2 + 2), 16) / 255
}

/** HSV of one `#rrggbb` colour; hue in degrees, saturation / value in 0..1. */
export function hsvOf(hex: string): Hsv {
  const r = channel(hex, 0)
  const g = channel(hex, 1)
  const b = channel(hex, 2)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  let h = 0
  if (delta !== 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6)
    else if (max === g) h = 60 * ((b - r) / delta + 2)
    else h = 60 * ((r - g) / delta + 4)
  }
  if (h < 0) h += 360
  return { h, s: max === 0 ? 0 : delta / max, v: max }
}

/** Smallest angular distance between two hues, in degrees. */
export function hueDistance(first: string, second: string): number {
  const raw = Math.abs(hsvOf(first).h - hsvOf(second).h) % 360
  return raw > 180 ? 360 - raw : raw
}

/** How much lower `light`'s HSV saturation is than `dark`'s, in percent. */
export function saturationDropPercent(dark: string, light: string): number {
  const from = hsvOf(dark).s
  if (from === 0) return 0
  return ((from - hsvOf(light).s) / from) * 100
}
