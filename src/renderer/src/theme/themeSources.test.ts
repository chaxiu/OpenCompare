import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The palette stays a single source: one stylesheet defines the token names and
 * every component reads them. Both scanners walk the real tree, so a new
 * palette file or an inline colour is caught here instead of in review.
 */
const ROOT = process.cwd()
const RENDERER = join(ROOT, 'src/renderer/src')
const ASSETS = join(RENDERER, 'assets')
const MAIN_CSS = join(ASSETS, 'main.css')

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

const repoPath = (path: string): string => relative(ROOT, path).replaceAll('\\', '/')
const isTestFile = (path: string): boolean => /\.test\.[jt]sx?$/.test(path)
const TOKEN_DEFINITION = /--color-[a-z0-9-]+\s*:/
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/

describe('single palette source', () => {
  it('defines --color-* only in assets/main.css', () => {
    const defining = walk(ASSETS)
      .filter((path) => TOKEN_DEFINITION.test(readFileSync(path, 'utf8')))
      .map(repoPath)
    expect(defining).toEqual(['src/renderer/src/assets/main.css'])
  })

  it('keeps every token definition out of the rest of the renderer', () => {
    const offenders = walk(RENDERER)
      .filter((path) => path !== MAIN_CSS)
      .filter((path) => !isTestFile(path))
      .filter((path) => TOKEN_DEFINITION.test(readFileSync(path, 'utf8')))
      .map(repoPath)
    expect(offenders).toEqual([])
  })

  it('still owns both themes in one file', () => {
    const css = readFileSync(MAIN_CSS, 'utf8')
    expect(css).toContain('@theme {')
    expect(css).toContain(":root[data-theme='light'] {")
  })
})

describe('no hardcoded colours in renderer code', () => {
  it('keeps #hex, rgb() and hsl() literals out of every non-test source file', () => {
    const offenders = walk(RENDERER)
      .filter((path) => /\.(ts|tsx)$/.test(path))
      .filter((path) => !isTestFile(path))
      .flatMap((path) => {
        const text = readFileSync(path, 'utf8')
        return COLOR_LITERAL.test(text) ? [repoPath(path)] : []
      })
    expect(offenders).toEqual([])
  })

  it('finds the real stylesheet so the scan above is not vacuous', () => {
    expect(statSync(MAIN_CSS).size).toBeGreaterThan(0)
    expect(walk(RENDERER).length).toBeGreaterThan(20)
  })
})
