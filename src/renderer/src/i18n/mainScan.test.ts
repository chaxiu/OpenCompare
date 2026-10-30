import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scanHardcodedChinese } from '@shared/i18n/scanHardcodedChinese'

const ROOT = process.cwd()

/**
 * Explicit roots of the main-chain scan. Comments, `aria-label`, `title` and
 * `data-testid` are all in scope: only `*.test.*` and `i18n/messages/**` are
 * excluded by the scanner itself.
 */
const SCAN_ROOTS = [
  'src/renderer/src/assets/icons',
  'src/renderer/src/workbench',
  'src/renderer/src/views',
  'src/renderer/src/components',
  'src/renderer/src/i18n',
  'src/renderer/src/theme',
  'src/renderer/src/App.tsx',
  'src/renderer/src/main.tsx',
  'src/renderer/src/env.d.ts'
] as const

/** Directories deliberately outside the scan, each with its own reason. */
const UNCOVERED = [
  {
    path: 'src/renderer/src/perf',
    reason:
      'Measurement probe window: the main chain never loads it and it renders no product copy.'
  },
  {
    path: 'src/renderer/src/platform',
    reason:
      'Web runtime fallback diagnostics of the platform layer, not product copy to translate.'
  }
] as const

const SOURCE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs)$/
const TEST_FILE = /\.test\./
const MESSAGE_SURFACE = /(^|\/)i18n\/messages(\/|$)/

function toPosix(path: string): string {
  return path.replaceAll('\\', '/')
}

/** The scanner's own inclusion rules, repeated so the roots can be verified. */
function included(path: string): boolean {
  const posix = toPosix(path)
  return SOURCE_FILE.test(posix) && !TEST_FILE.test(posix) && !MESSAGE_SURFACE.test(posix)
}

/** Recursively lists source files under one root (a file root lists itself). */
function collect(path: string): string[] {
  let entries
  try {
    entries = readdirSync(join(ROOT, path), { withFileTypes: true })
  } catch {
    return [path]
  }
  return entries.flatMap((entry) => {
    const child = `${path}/${entry.name}`
    return entry.isDirectory() ? collect(child) : [child]
  })
}

function isUnder(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`)
}

function coveredFiles(): string[] {
  return SCAN_ROOTS.flatMap(collect).filter(included).sort()
}

/** Every main-chain source file the explicit roots must reach, nothing more. */
function actualMainChainFiles(): string[] {
  return collect('src/renderer/src')
    .filter(included)
    .filter((file) => !UNCOVERED.some((entry) => isUnder(file, entry.path)))
    .sort()
}

describe('main-chain Chinese scan', () => {
  it('finds no hardcoded Chinese anywhere in the explicit roots', () => {
    expect(scanHardcodedChinese([...SCAN_ROOTS])).toEqual([])
  })

  it('covers every existing main-chain source file', () => {
    expect(coveredFiles()).toEqual(actualMainChainFiles())
  })

  it('lists each uncovered directory with a real path and a non-empty reason', () => {
    for (const entry of UNCOVERED) {
      expect(statSync(join(ROOT, entry.path)).isDirectory(), entry.path).toBe(true)
      expect(entry.reason.trim(), entry.path).not.toBe('')
      expect(
        SCAN_ROOTS.some((root) => isUnder(entry.path, root) || isUnder(root, entry.path)),
        entry.path
      ).toBe(false)
    }
  })

  it('declares the English default on the renderer root html element', () => {
    const html = readFileSync(join(ROOT, 'src/renderer/index.html'), 'utf8')

    expect(html).not.toContain('zh-CN')
    expect(html).toMatch(/<html lang="en">/)
  })
})
