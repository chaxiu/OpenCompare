import { describe, expect, it, vi } from 'vitest'
import type { PlatformPort } from '@shared/platform/types'
import type { DirectoryComparison, DirectoryDiffNode } from '@core/directory/compare'
import { createComparisonCache } from '@core/directory/compare'
import { setLivenessEnabled, livenessCounts } from '@shared/perf/liveness'
import {
  attachDirectoryComparison,
  createDirectorySession,
  createDrilldownSession,
  createFilePairSession,
  directoryComparisonKey,
  directoryViewKey,
  FilePairError,
  openFilePairSession,
  releaseDirectoryComparison,
  replaceFilePairSide,
  resolveDirectoryReturn
} from './directoryCompare'
import { classifyFile } from './fileKinds'
import type { DrilldownTarget } from './fileKinds'
import type { WorkbenchSession } from './session'
import { describeSession } from './sessionDisplay'
import { translate } from '@renderer/i18n/context'

const TARGET: DrilldownTarget = { kind: 'code', label: 'code' }

function fileNode(relativePath: string): DirectoryDiffNode {
  const name = relativePath.slice(relativePath.lastIndexOf('/') + 1)
  return {
    name,
    relativePath,
    kind: 'file',
    status: 'modified',
    children: [],
    counts: { same: 0, added: 0, removed: 0, modified: 1 },
    leftPath: `/left/${relativePath}`,
    rightPath: `/right/${relativePath}`
  }
}

function directorySession(id: string): WorkbenchSession {
  return { id, scene: 'directory', title: id, subtitle: id, columns: 2, stats: [] }
}

describe('createDrilldownSession', () => {
  it('scopes the drilldown id to the source directory session', () => {
    const node = fileNode('src/core/engine.ts')
    const first = createDrilldownSession('directory:a ↔ b', node, TARGET, 'left', 'right')
    const second = createDrilldownSession('directory:c ↔ d', node, TARGET, 'left', 'right')

    // Same relative path, different source sessions: no tab can overwrite the other.
    expect(first.id).not.toBe(second.id)
    expect(first.id).toContain('src/core/engine.ts')
    expect(second.id).toContain('src/core/engine.ts')
    expect(first.parentDirectoryId).toBe('directory:a ↔ b')
    expect(second.parentDirectoryId).toBe('directory:c ↔ d')
  })

  it('takes its scene from the target family and its id from the parent scope', () => {
    const parent = 'directory:a ↔ b'
    const target: DrilldownTarget = { kind: 'csv', label: 'csv', delimiter: ',' }
    const child = createDrilldownSession(parent, fileNode('data/report.csv'), target, 'id\n1', 'id\n2')

    expect(child.scene).toBe('csv')
    expect(child.parentDirectoryId).toBe(parent)
    expect(child.id).toBe(`file:${parent}::data/report.csv`)
  })
})

describe('scene comes from the opened object', () => {
  it('maps every supported extension family through classifyFile', () => {
    expect(classifyFile('engine.ts')).toEqual({ kind: 'code', label: 'code' })
    expect(classifyFile('orders.csv')).toEqual({ kind: 'csv', label: 'csv', delimiter: ',' })
    expect(classifyFile('orders.tsv')).toEqual({ kind: 'csv', label: 'tsv', delimiter: '\t' })
    expect(classifyFile('config.json')).toEqual({
      kind: 'structured',
      label: 'json',
      format: 'json'
    })
    expect(classifyFile('config.yaml')).toEqual({
      kind: 'structured',
      label: 'yaml',
      format: 'yaml'
    })
    expect(classifyFile('archive.bin')).toBeNull()
  })

  it('keeps a real directory pair on the directory scene', () => {
    const session = createDirectorySession(comparisonOf('/left', '/right'), {
      left: { kind: 'directory', path: '/left' },
      right: { kind: 'directory', path: '/right' }
    })
    expect(session.scene).toBe('directory')
    expect(session.title).toBe('left ↔ right')
    expect(session.subtitle).toBe('/left ↔ /right')
  })
})

/** Minimal read-only PlatformPort; only `readTextFile` is ever used here. */
function stubPlatform(files: Readonly<Record<string, string>>): PlatformPort {
  return {
    readTextFile: async (path: string) => files[path] ?? ''
  } as unknown as PlatformPort
}

describe('openFilePairSession', () => {
  it('opens a code pair as the code scene', async () => {
    const session = await openFilePairSession(
      stubPlatform({ '/a/engine.ts': 'a\nb\n', '/b/engine.ts': 'a\nc\n' }),
      '/a/engine.ts',
      '/b/engine.ts'
    )
    expect(session.scene).toBe('code')
    expect(session.adhoc?.scene).toBe('code')
    expect(session.title).toBe('engine.ts')
  })

  it('opens a csv pair with both parsed tables', async () => {
    const session = await openFilePairSession(
      stubPlatform({
        '/a/orders.csv': 'id,name\n1,left\n',
        '/b/orders.csv': 'id,name\n1,right\n'
      }),
      '/a/orders.csv',
      '/b/orders.csv'
    )
    expect(session.scene).toBe('csv')
    expect(session.adhoc?.tables?.left.header).toEqual(['id', 'name'])
    expect(session.adhoc?.tables?.left.rows).toHaveLength(1)
    expect(session.adhoc?.tables?.right.rows).toHaveLength(1)
  })

  it('opens a json pair as the structured scene with the json format', async () => {
    const session = await openFilePairSession(
      stubPlatform({ '/a/x.json': '{"a":1}\n', '/b/x.json': '{"a":2}\n' }),
      '/a/x.json',
      '/b/x.json'
    )
    expect(session.scene).toBe('structured')
    expect(session.adhoc?.scene).toBe('structured')
    expect(session.adhoc?.format).toBe('json')
  })

  it('rejects a mixed family and an unsupported type without reading either side', async () => {
    const readTextFile = vi.fn(async () => '')
    const platform = { readTextFile } as unknown as PlatformPort

    const mixed = openFilePairSession(platform, '/a/x.json', '/b/x.yaml')
    await expect(mixed).rejects.toBeInstanceOf(FilePairError)
    await expect(mixed).rejects.toMatchObject({ code: 'mixed-family' })

    const unsupported = openFilePairSession(platform, '/a/x.bin', '/b/x.bin')
    await expect(unsupported).rejects.toBeInstanceOf(FilePairError)
    await expect(unsupported).rejects.toMatchObject({ code: 'unsupported-type' })

    // A rejected pair never reaches the platform and never builds a session.
    expect(readTextFile).not.toHaveBeenCalled()
  })
})

describe('resolveDirectoryReturn', () => {
  it('lands on the source directory session when it is still open', () => {
    const sessions = [directorySession('directory:a'), directorySession('directory:b')]
    expect(resolveDirectoryReturn(sessions, 'directory:b')).toEqual({
      id: 'directory:b',
      fallback: false
    })
  })

  it('falls back to a remaining directory session when the source is gone', () => {
    const sessions = [directorySession('directory:a'), directorySession('directory:c')]
    expect(resolveDirectoryReturn(sessions, 'directory:missing')).toEqual({
      id: 'directory:a',
      fallback: true
    })
  })

  it('reports no destination when nothing directory-shaped is left', () => {
    const file: WorkbenchSession = {
      id: 'file:x',
      scene: 'code',
      title: 'x',
      subtitle: 'x',
      columns: 2,
      stats: []
    }
    expect(resolveDirectoryReturn([file], 'directory:missing')).toBeNull()
  })
})

function comparisonOf(leftRoot: string, rightRoot: string): DirectoryComparison {
  const counts = { same: 0, added: 0, removed: 0, modified: 0 }
  return {
    leftRoot,
    rightRoot,
    leftName: leftRoot.slice(leftRoot.lastIndexOf('/') + 1),
    rightName: rightRoot.slice(rightRoot.lastIndexOf('/') + 1),
    root: {
      name: '',
      relativePath: '',
      kind: 'directory',
      status: 'same',
      children: [],
      counts
    },
    counts,
    fileCount: 0,
    leftSkipped: 0,
    rightSkipped: 0,
    skipped: 0
  }
}

function comparedSession(id: string, leftRoot: string, rightRoot: string): WorkbenchSession {
  return { ...directorySession(id), directory: comparisonOf(leftRoot, rightRoot) }
}

describe('directory view key', () => {
  it('is stable for one comparison and changes for a re-compared object', () => {
    const first = comparisonOf('/left', '/right')
    const second = comparisonOf('/left', '/right')
    expect(directoryComparisonKey(first)).toBe(directoryComparisonKey(first))
    expect(directoryComparisonKey(first)).not.toBe(directoryComparisonKey(second))
  })

  it('remounts the view on a same-tab re-compare and on a tab switch', () => {
    const session = comparedSession('directory:left ↔ right', '/left', '/right')
    const sameComparison = { ...session }
    expect(directoryViewKey(sameComparison)).toBe(directoryViewKey(session))

    const recompared = { ...session, directory: comparisonOf('/left', '/right') }
    expect(directoryViewKey(recompared)).not.toBe(directoryViewKey(session))

    const otherTab = { ...session, id: 'directory:other ↔ right' }
    expect(directoryViewKey(otherTab)).not.toBe(directoryViewKey(session))
  })
})

describe('attaching a comparison', () => {
  it('keeps the tab identity, fills the counts and registers the tree live', () => {
    setLivenessEnabled(true)
    try {
      const session = directorySession('directory:left ↔ right')
      const comparison = comparisonOf('/left', '/right')
      const attached = attachDirectoryComparison(session, comparison)

      expect(attached.id).toBe(session.id)
      expect(attached.title).toBe(session.title)
      expect(attached.subtitle).toBe(session.subtitle)
      expect(attached.directory).toBe(comparison)
      expect(attached.composition).toEqual({ ...comparison.counts, conflict: 0 })
      expect(livenessCounts().comparisons).toBe(1)
    } finally {
      setLivenessEnabled(false)
    }
  })
})

describe('session stats', () => {
  it('carries stable stat ids instead of visible copy', () => {
    const comparison = comparisonOf('/left', '/right')
    const attached = attachDirectoryComparison(directorySession('directory:left ↔ right'), comparison)
    expect(attached.stats.map((stat) => stat.label)).toEqual([
      'sourceFiles',
      'targetFiles',
      'differences'
    ])
    expect(attached.stats.map((stat) => stat.value)).toEqual([0, 0, 0])

    const pair = createFilePairSession(
      'file:a.txt',
      'a.txt',
      TARGET,
      { path: '/left/a.txt', text: 'a\nb' },
      { path: '/right/a.txt', text: 'a\nb\nc' }
    )
    expect(pair.stats.map((stat) => stat.label)).toEqual(['linesLeft', 'linesRight'])
    expect(pair.stats.map((stat) => stat.value)).toEqual([2, 3])

    for (const stat of [...attached.stats, ...pair.stats]) {
      expect(stat.label).not.toMatch(/\p{Script=Han}/u)
    }
  })
})

describe('releaseDirectoryComparison', () => {
  const entry = { size: 1, modifiedMs: 0, hash: 'a'.repeat(64) }

  it('evicts both roots of a closed session and keeps other sessions cached', () => {
    const cache = createComparisonCache()
    cache.set('/left/a.txt', entry)
    cache.set('/left/nested/b.txt', entry)
    cache.set('/right/c.txt', entry)
    cache.set('/other/d.txt', entry)
    cache.set('/other-extra/e.txt', entry)

    const closing = comparedSession('directory:a ↔ b', '/left', '/right')
    const other = comparedSession('directory:other', '/other', '/other-extra')
    const released = releaseDirectoryComparison(cache, closing.directory as DirectoryComparison, [
      other
    ])

    expect(released).toBe(3)
    expect([...cache.hashes.keys()].sort()).toEqual(['/other-extra/e.txt', '/other/d.txt'])
  })

  it('keeps a root cached while another open session compares from it', () => {
    const cache = createComparisonCache()
    cache.set('/shared/a.txt', entry)
    cache.set('/right/b.txt', entry)

    const closing = comparedSession('directory:shared ↔ right', '/shared', '/right')
    const sibling = comparedSession('directory:shared ↔ other', '/shared', '/other')
    const released = releaseDirectoryComparison(cache, closing.directory as DirectoryComparison, [
      sibling
    ])

    expect(released).toBe(1)
    expect(cache.hashes.has('/shared/a.txt')).toBe(true)
    expect(cache.hashes.has('/right/b.txt')).toBe(false)
  })

  it('drops a replaced comparison so the new object is the only one held', () => {
    const cache = createComparisonCache()
    cache.set('/left/a.txt', entry)
    const previous = comparedSession('directory:left ↔ right', '/left', '/right')
    const replacement: WorkbenchSession = {
      ...comparedSession('directory:left ↔ right', '/left', '/right')
    }

    releaseDirectoryComparison(cache, previous.directory as DirectoryComparison, [replacement])

    // Same roots stay warm for the replacement, but the old tree is gone.
    expect(previous.directory).not.toBe(replacement.directory)
    expect(replacement.directory).not.toBe(undefined)
    expect(cache.hashes.has('/left/a.txt')).toBe(true)
  })
})

describe('replacing one side of an open file session', () => {
  const en = translate('en')

  it('moves a CSV side, its parsed table, delimiter and line stats together', () => {
    const session = createFilePairSession(
      'file:/a/orders.csv ↔ /b/orders.csv',
      'orders.csv',
      { kind: 'csv', label: 'csv', delimiter: ',' },
      { path: '/a/orders.csv', text: 'id,name\n1,left\n' },
      { path: '/b/orders.csv', text: 'id,name\n1,right\n' }
    )

    const next = replaceFilePairSide(session, 'left', {
      path: '/c/new.tsv',
      text: 'id\tname\n1\tone\n2\ttwo\n'
    })

    expect(next.adhoc?.pair.left.path).toBe('/c/new.tsv')
    expect(next.adhoc?.pair.right.path).toBe('/b/orders.csv')
    expect(next.adhoc?.delimiter).toBe('\t')
    expect(next.adhoc?.tables?.left.header).toEqual(['id', 'name'])
    expect(next.adhoc?.tables?.left.rows).toHaveLength(2)
    // The untouched side keeps its own parsed table.
    expect(next.adhoc?.tables?.right.rows).toHaveLength(1)
    expect(next.stats.map((stat) => stat.value)).toEqual([3, 2])
    expect(next.stats.map((stat) => stat.label)).toEqual(['linesLeft', 'linesRight'])
    // The tab text derives from the new facts, not the tab's opening copy.
    expect(
      describeSession(next).subtitle.map((part) => ('text' in part ? part.text : en(part.key))).join('')
    ).toBe('/c/new.tsv ↔ /b/orders.csv · TSV')
  })

  it('moves a structured side and its format', () => {
    const session = createFilePairSession(
      'file:/a/x.json ↔ /b/x.json',
      'x.json',
      { kind: 'structured', label: 'json', format: 'json' },
      { path: '/a/x.json', text: '{"a":1}\n' },
      { path: '/b/x.json', text: '{"a":2}\n' }
    )

    const next = replaceFilePairSide(session, 'right', {
      path: '/c/y.yaml',
      text: 'a: 2\n'
    })

    expect(next.adhoc?.pair.right.path).toBe('/c/y.yaml')
    expect(next.adhoc?.pair.left.path).toBe('/a/x.json')
    expect(next.adhoc?.format).toBe('yaml')
  })

  it('resets the code working copy of the opened side and keeps the other side', () => {
    const session = createFilePairSession(
      'file:/a/engine.ts ↔ /b/engine.ts',
      'engine.ts',
      TARGET,
      { path: '/a/engine.ts', text: 'a\nb\n' },
      { path: '/b/engine.ts', text: 'a\nc\n' }
    )
    const withBuffer: WorkbenchSession = {
      ...session,
      codeBuffer: {
        leftPath: '/a/engine.ts',
        rightPath: '/b/engine.ts',
        leftSource: 'a\nb\n',
        rightSource: 'a\nc\n',
        leftText: 'a\nb\nedited\n',
        rightText: 'a\nc\n'
      }
    }

    const next = replaceFilePairSide(withBuffer, 'left', {
      path: '/c/other.ts',
      text: 'x\ny\nz\n'
    })

    expect(next.adhoc?.pair.left).toEqual({ path: '/c/other.ts', text: 'x\ny\nz\n' })
    expect(next.codeBuffer?.leftPath).toBe('/c/other.ts')
    expect(next.codeBuffer?.leftSource).toBe('x\ny\nz\n')
    expect(next.codeBuffer?.leftText).toBe('x\ny\nz\n')
    // The side that was not opened keeps its unsaved working copy.
    expect(next.codeBuffer?.rightText).toBe('a\nc\n')
    expect(next.stats.map((stat) => stat.value)).toEqual([3, 2])
  })

  it('leaves a session without an ad-hoc pair untouched', () => {
    const sample: WorkbenchSession = {
      id: 'session-code',
      scene: 'code',
      title: 'sample',
      subtitle: 'sample',
      columns: 3,
      stats: []
    }

    expect(replaceFilePairSide(sample, 'left', { path: '/a.txt', text: 'a\n' })).toBe(sample)
  })
})
