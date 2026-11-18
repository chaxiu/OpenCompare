/**
 * Dependency gate for the vendored SheetJS release (ac-dep-pinned /
 * ac-no-static-eval). Fails when the pinned version, the tarball hash, the
 * lockfile integrity or the no-eval/no-new-func rules drift.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { XLSX_DEPENDENCY } from '@core/xlsx/dependency'

const root = process.cwd()

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8')
}

function digest(relativePath: string, algorithm: 'sha256' | 'sha512'): string {
  return createHash(algorithm).update(readFileSync(join(root, relativePath))).digest(
    algorithm === 'sha256' ? 'hex' : 'base64'
  )
}

const packageJson = JSON.parse(read('package.json')) as {
  dependencies: Record<string, string>
}
const lockfile = read('pnpm-lock.yaml')

describe('vendored xlsx dependency', () => {
  it('pins the package.json specifier to the vendored CDN tarball', () => {
    expect(packageJson.dependencies[XLSX_DEPENDENCY.name]).toBe(XLSX_DEPENDENCY.specifier)
    expect(XLSX_DEPENDENCY.sourceUrl).toBe(
      `https://cdn.sheetjs.com/xlsx-${XLSX_DEPENDENCY.version}/xlsx-${XLSX_DEPENDENCY.version}.tgz`
    )
  })

  it('matches the recorded tarball sha256 and size', () => {
    const recorded = read(XLSX_DEPENDENCY.sha256File).trim().split(/\s+/)[0]
    expect(recorded).toMatch(/^[0-9a-f]{64}$/)
    expect(digest(XLSX_DEPENDENCY.tarball, 'sha256')).toBe(recorded)
    expect(readFileSync(join(root, XLSX_DEPENDENCY.tarball)).byteLength).toBe(
      XLSX_DEPENDENCY.bytes
    )
  })

  it('records the same artifact in the lockfile and keeps 0.18.x out', () => {
    const integrity = `sha512-${digest(XLSX_DEPENDENCY.tarball, 'sha512')}`
    expect(lockfile).toContain(`specifier: ${XLSX_DEPENDENCY.specifier}`)
    expect(lockfile).toContain(integrity)
    expect(lockfile).toContain(`tarball: ${XLSX_DEPENDENCY.specifier}`)
    expect(lockfile).not.toMatch(/xlsx@0\.18\./)
    expect(read('package.json')).not.toMatch(/"xlsx":\s*"[~^]?0\.18\./)
  })

  it('installs the pinned version', () => {
    const installed = JSON.parse(read('node_modules/xlsx/package.json')) as { version: string }
    expect(installed.version).toBe(XLSX_DEPENDENCY.version)
  })
})

describe('no static eval in the new layer or the vendored bundle', () => {
  const sources = [
    'src/core/xlsx/parse.ts',
    'src/core/xlsx/limits.ts',
    'src/core/xlsx/dependency.ts',
    'node_modules/xlsx/xlsx.mjs',
    'node_modules/xlsx/xlsx.js'
  ]

  it.each(sources)('%s has no eval( / new Function', (file) => {
    const source = read(file)
    expect(source).not.toMatch(/\beval\s*\(/)
    expect(source).not.toMatch(/new\s+Function\s*\(/)
  })

  it('keeps the ESLint no-eval and no-new-func rules enabled', () => {
    const eslintConfig = read('eslint.config.mjs')
    expect(eslintConfig).toContain('js.configs.recommended')
    expect(eslintConfig).not.toMatch(/['"]no-eval['"]\s*:\s*['"]off['"]/)
    expect(eslintConfig).not.toMatch(/['"]no-new-func['"]\s*:\s*['"]off['"]/)
  })
})

interface SourceFile {
  readonly path: string
  readonly source: string
}

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

function resolveCoreModule(specifier: string): string | undefined {
  const base = specifier.replace(/^@core\//, 'src/core/')
  return [`${base}.ts`, `${base}/index.ts`].find((candidate) =>
    existsSync(join(root, candidate))
  )
}

/** `src/core/xlsx/**` plus every core module the renderer sources import directly. */
function rendererReachableSources(): SourceFile[] {
  const paths = new Set<string>()
  for (const name of readdirSync(join(root, 'src/core/xlsx'))) {
    if (name.endsWith('.ts') && !name.endsWith('.test.ts')) {
      paths.add(`src/core/xlsx/${name}`)
    }
  }
  for (const file of walk(join(root, 'src/renderer/src'))) {
    if (!/\.(ts|tsx)$/.test(file) || file.includes('.test.')) continue
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/['"](@core\/[^'"]+)['"]/g)) {
      const resolved = resolveCoreModule(match[1])
      if (resolved !== undefined) paths.add(resolved)
    }
  }
  return [...paths].sort().map((path) => ({ path, source: read(path) }))
}

/** `file:line` entries for Node-only globals that crash the sandboxed renderer. */
function nodeGlobalViolations(files: readonly SourceFile[]): string[] {
  const violations: string[] = []
  for (const file of files) {
    file.source.split('\n').forEach((line, index) => {
      const code = line.replace(/\/\/.*$/, '')
      if (/\bBuffer\b/.test(code)) violations.push(`${file.path}:${index + 1}: Buffer`)
      if (/(^|[^.\w])process\s*\./.test(code)) violations.push(`${file.path}:${index + 1}: process.`)
    })
  }
  return violations
}

describe('renderer-reachable core modules use no Node globals', () => {
  const files = rendererReachableSources()
  const paths = files.map((file) => file.path)

  it('covers the xlsx layer and the renderer-imported core modules', () => {
    expect(paths).toContain('src/core/xlsx/limits.ts')
    expect(paths).toContain('src/core/xlsx/parse.ts')
  })

  it('reports no Buffer / process. usage in the current tree', () => {
    expect(nodeGlobalViolations(files)).toEqual([])
  })

  it('flags an injected Node global with its file and line', () => {
    const violations = nodeGlobalViolations([
      {
        path: 'src/core/xlsx/sample.ts',
        source: ['const ok = 1', 'Buffer.from(ok)', 'process.memoryUsage()'].join('\n')
      }
    ])
    expect(violations).toEqual([
      'src/core/xlsx/sample.ts:2: Buffer',
      'src/core/xlsx/sample.ts:3: process.'
    ])
  })
})
