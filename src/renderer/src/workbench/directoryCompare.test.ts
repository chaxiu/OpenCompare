import { describe, expect, it } from 'vitest'
import type { DirectoryComparison, DirectoryDiffNode } from '@core/directory/compare'
import { createComparisonCache } from '@core/directory/compare'
import { setLivenessEnabled, livenessCounts } from '@shared/perf/liveness'
import {
  attachDirectoryComparison,
  createDrilldownSession,
  directoryComparisonKey,
  directoryViewKey,
  releaseDirectoryComparison,
  resolveDirectoryReturn
} from './directoryCompare'
import type { DrilldownTarget } from './fileKinds'
import type { WorkbenchSession } from './session'

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
