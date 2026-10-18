import { describe, expect, it } from 'vitest'
import type { DirectoryDiffNode } from '@core/directory/compare'
import { createComparisonCache } from '@core/directory/compare'
import { sha256Hex } from '@core/directory/hash'
import { compareDirectorySides, parseSnapshot, readSnapshotContent } from '@core/directory/snapshot'
import { DIRECTORY_SAMPLE_PATHS, REMOTE_SNAPSHOT, SAMPLE_FIXTURE_FILES } from './index'

/**
 * Serves the bundled local sample directory through the same capability shape
 * as `PlatformPort`: size is the text length and mtime is always 0, exactly
 * like the Electron and web sample mounts.
 */
const SAMPLE_ROOT = DIRECTORY_SAMPLE_PATHS.left

const sampleFiles = new Map(
  SAMPLE_FIXTURE_FILES.filter((file) => file.path.startsWith(`${SAMPLE_ROOT}/`)).map((file) => [
    file.path,
    file.text
  ])
)

function listSampleDirectory(path: string): {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modifiedMs: number
}[] {
  const prefix = `${path}/`
  const children = new Map<string, ReturnType<typeof listSampleDirectory>[number]>()

  for (const filePath of sampleFiles.keys()) {
    if (!filePath.startsWith(prefix)) continue
    const rest = filePath.slice(prefix.length)
    const separator = rest.indexOf('/')
    const name = separator === -1 ? rest : rest.slice(0, separator)
    const childPath = `${path}/${name}`
    if (children.has(childPath)) continue
    children.set(childPath, {
      name,
      path: childPath,
      isDirectory: separator !== -1,
      size: separator === -1 ? (sampleFiles.get(filePath) ?? '').length : 0,
      modifiedMs: 0
    })
  }

  return [...children.values()]
}

const samplePort = {
  list: async (path: string) => listSampleDirectory(path),
  readTextFile: async (path: string) => {
    const text = sampleFiles.get(path)
    if (text === undefined) throw new Error(`No bundled sample file: ${path}`)
    return text
  }
}

function fileStatuses(node: DirectoryDiffNode, out: Map<string, string>): Map<string, string> {
  if (node.kind === 'file') out.set(node.relativePath, node.status)
  for (const child of node.children) fileStatuses(child, out)
  return out
}

describe('remote snapshot fixture', () => {
  it('round-trips through its canonical .ocsnap.json text', () => {
    expect(parseSnapshot(REMOTE_SNAPSHOT.text)).toEqual(REMOTE_SNAPSHOT.snapshot)
    expect(REMOTE_SNAPSHOT.text.endsWith('\n')).toBe(true)
  })

  it('keeps hashes, byte sizes and inline bodies self-consistent', () => {
    const encoder = new TextEncoder()

    for (const entry of REMOTE_SNAPSHOT.snapshot.entries) {
      expect(entry.content).toBeTypeOf('string')
      expect(entry.sha256).toBe(sha256Hex(entry.content ?? ''))
      expect(entry.size).toBe(encoder.encode(entry.content ?? '').length)
    }
    expect(Number.isNaN(Date.parse(REMOTE_SNAPSHOT.snapshot.exportedAt))).toBe(false)
  })

  it('covers code, CSV, JSON and YAML files for drilldown', () => {
    const extensions = new Set(
      REMOTE_SNAPSHOT.snapshot.entries.map((entry) =>
        entry.path.slice(entry.path.lastIndexOf('.'))
      )
    )

    expect(extensions).toContain('.ts')
    expect(extensions).toContain('.tsx')
    expect(extensions).toContain('.csv')
    expect(extensions).toContain('.json')
    expect(extensions).toContain('.yaml')
    expect(
      JSON.parse(readSnapshotContent(REMOTE_SNAPSHOT.snapshot, 'config/limits.json'))
    ).toBeTypeOf('object')
  })

  it('keeps content-identical files metadata-aligned with the local sample', () => {
    for (const entry of REMOTE_SNAPSHOT.snapshot.entries) {
      const local = sampleFiles.get(`${SAMPLE_ROOT}/${entry.path}`)
      if (local !== undefined && local === entry.content) {
        expect(entry.modifiedMs).toBe(0)
        expect(entry.size).toBe(local.length)
      }
    }

    // Same size and mtime as the local copy, different body: the SHA-256
    // confirmation path has to classify this pair as modified.
    const lexer = REMOTE_SNAPSHOT.snapshot.entries.find(
      (entry) => entry.path === 'src/core/lexer.ts'
    )
    const localLexer = sampleFiles.get(`${SAMPLE_ROOT}/src/core/lexer.ts`)
    expect(localLexer).toBeTypeOf('string')
    expect(lexer?.modifiedMs).toBe(0)
    expect(lexer?.size).toBe((localLexer ?? '').length)
    expect(lexer?.content).not.toBe(localLexer)
  })

  it('yields all four statuses against the local sample and stays drillable', async () => {
    const comparison = await compareDirectorySides(
      { kind: 'directory', path: SAMPLE_ROOT },
      { kind: 'snapshot', snapshot: REMOTE_SNAPSHOT.snapshot },
      samplePort.list,
      samplePort.readTextFile,
      createComparisonCache()
    )

    expect(comparison.counts).toEqual({ same: 6, added: 3, removed: 4, modified: 5 })
    expect(comparison.leftName).toBe('baseline')
    expect(comparison.rightName).toBe('remote-prod')

    const statuses = fileStatuses(comparison.root, new Map())
    expect(statuses.get('src/core/parser.ts')).toBe('same')
    expect(statuses.get('src/core/lexer.ts')).toBe('modified')
    expect(statuses.get('src/data/metrics.csv')).toBe('added')
    expect(statuses.get('docs/changelog.md')).toBe('removed')

    for (const relativePath of [
      'src/core/worker.ts',
      'src/data/metrics.csv',
      'config/limits.json',
      'src/core/engine.ts',
      'src/core/lexer.ts',
      'src/ui/workbench/Shell.tsx',
      'src/data/report.csv',
      'config/deploy.yaml'
    ]) {
      expect(readSnapshotContent(REMOTE_SNAPSHOT.snapshot, relativePath).length).toBeGreaterThan(0)
    }
  })
})
