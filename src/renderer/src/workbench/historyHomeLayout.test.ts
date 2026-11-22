import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HISTORY_HOME_VISIBLE_LIMIT } from './historyHomeModel'

/**
 * The home history list renders `HISTORY_HOME_VISIBLE_LIMIT` rows, so its
 * container must be tall enough for every one of them. jsdom has no layout, so
 * this contract evaluates the shipped `@theme` token chain instead of trusting
 * a class name: a token that regresses below the row budget fails here.
 */
const ROOT_FONT_SIZE_PX = 16

const renderer = (path: string): string =>
  readFileSync(join(process.cwd(), 'src/renderer/src', path), 'utf8')

const css = renderer('assets/main.css')
const home = renderer('workbench/historyHome.tsx')

const THEME = (() => {
  const block = /@theme\s*\{([\s\S]*?)\n\}/.exec(css)
  if (block === null) throw new Error('main.css @theme block not found')
  const declarations = new Map<string, string>()
  for (const match of block[1]!.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    declarations.set(match[1]!, match[2]!.trim())
  }
  return declarations
})()

const token = (name: string): string => {
  const value = THEME.get(name)
  if (value === undefined) throw new Error(`main.css is missing ${name}`)
  return value
}

/** Resolves one token value (`calc` / `var` / px / rem) to pixels. */
const resolve = (value: string, seen: readonly string[] = []): number => {
  const calc = /^calc\(([\s\S]+)\)$/.exec(value.trim())
  let text = (calc === null ? value : calc[1]!).trim()
  text = text.replace(/var\((--[a-z0-9-]+)\)/g, (_all, name: string) => {
    if (seen.includes(name)) throw new Error(`cyclic token ${name}`)
    return `(${resolve(token(name), [...seen, name])})`
  })
  text = text.replace(/(\d+(?:\.\d+)?)rem/g, (_all, amount: string) => `${Number(amount) * ROOT_FONT_SIZE_PX}`)
  text = text.replace(/(\d+(?:\.\d+)?)px/g, '$1').replace(/[()]/g, ' ')
  if (!/^[\d\s+*.]*$/.test(text)) throw new Error(`unsupported CSS value: ${value}`)
  return text.split('+').reduce((total, term) => total + term.split('*').reduce((product, part) => product * Number(part.trim()), 1), 0)
}

const rowBox = resolve(token('--height-history-row'))
const rowGap = resolve(token('--height-history-gap'))
const listHeight = resolve(token('--height-history-list'))

describe('home history list height', () => {
  it('derives the row box from the control height, py-1 and its border', () => {
    expect(rowBox).toBe(resolve(token('--height-control-sm')) + 2 * resolve(token('--spacing')) + 2)
    expect(token('--height-history-row')).toContain('var(--height-control-sm)')
    expect(token('--height-history-gap')).toBe('var(--spacing)')
    // The derivation above only holds while the row markup keeps py-1 + border.
    expect(home).toMatch(/border border-line-subtle bg-surface-raised px-2 py-1/)
  })

  it('fits every visible row plus the gaps between them', () => {
    const needed = HISTORY_HOME_VISIBLE_LIMIT * rowBox + (HISTORY_HOME_VISIBLE_LIMIT - 1) * rowGap
    expect(listHeight).toBeGreaterThanOrEqual(needed)
  })

  it('keeps the token multipliers and the TS visible limit on one number', () => {
    const value = token('--height-history-list')
    expect(value).toContain(`${HISTORY_HOME_VISIBLE_LIMIT} * var(--height-history-row)`)
    expect(value).toContain(`${HISTORY_HOME_VISIBLE_LIMIT - 1} * var(--height-history-gap)`)
    expect(home).toContain('max-h-[var(--height-history-list)]')
  })
})
