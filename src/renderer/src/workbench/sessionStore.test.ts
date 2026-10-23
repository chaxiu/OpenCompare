import { describe, expect, it } from 'vitest'
import type { DirectoryComparison } from '@core/directory/compare'
import { createComparisonCache } from '@core/directory/compare'
import { createDirectorySession, releaseSessionTree } from './directoryCompare'
import {
  commitSessionTree,
  commitUpsert,
  closeSessions,
  replaceSessions,
  retainActiveTree,
  upsertSessions
} from './sessionStore'
import { directorySides } from './snapshotOps'
import type { WorkbenchSession } from './session'

const entry = { size: 1, modifiedMs: 0, hash: 'a'.repeat(64) }

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

function session(leftRoot: string, rightRoot: string): WorkbenchSession {
  return createDirectorySession(
    comparisonOf(leftRoot, rightRoot),
    directorySides(leftRoot, rightRoot)
  )
}

describe('session list semantics', () => {
  it('replaces a matching id in place and keeps the tab order', () => {
    const a = session('/a', '/b')
    const b = session('/b', '/a')
    const c = session('/c', '/a')
    const nextB: WorkbenchSession = { ...session('/b', '/c'), id: b.id }
    const next = upsertSessions([a, b, c], nextB)
    expect(next.map((item) => item.id)).toEqual([a.id, b.id, c.id])
    expect(next[1]).not.toBe(b)
    expect(next[1].id).toBe(b.id)
  })

  it('appends a new id after the existing tabs', () => {
    const a = session('/a', '/b')
    const c = session('/c', '/d')
    expect(upsertSessions([a], c).map((item) => item.id)).toEqual([a.id, c.id])
  })

  it('keeps the opened tab id when a refreshed session carries a new one', () => {
    const a = session('/a', '/b')
    const refreshed = session('/a', '/c')
    const next = replaceSessions([a], a.id, refreshed)
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe(a.id)
    expect(next[0].directory).toBe(refreshed.directory)
  })

  it('closes only the requested tab', () => {
    const a = session('/a', '/b')
    const c = session('/c', '/d')
    expect(closeSessions([a, c], a.id)).toEqual([c])
  })
})

describe('retaining only the active tree', () => {
  it('keeps the active comparison and reduces every other tab to its summary', () => {
    const a = session('/a', '/b')
    const c = session('/c', '/d')
    const file: WorkbenchSession = {
      id: 'file:x',
      scene: 'code',
      title: 'x',
      subtitle: 'x',
      columns: 2,
      stats: []
    }

    const next = retainActiveTree([a, c, file], c.id)

    expect(next.map((item) => item.id)).toEqual([a.id, c.id, file.id])
    expect(next[0]).not.toBe(a)
    expect(next[0].directory).toBeUndefined()
    expect(next[0].directorySummary?.fileCount).toBe(a.directory?.fileCount)
    expect(next[0].directorySummary?.counts).toEqual(a.directory?.counts)
    expect(next[0].sides).toBe(a.sides)
    expect(next[1]).toBe(c)
    expect(next[2]).toBe(file)
  })

  it('returns an already-summary tab unchanged', () => {
    const a = session('/a', '/b')
    const c = session('/c', '/d')
    const once = retainActiveTree([a, c], c.id)
    expect(retainActiveTree(once, c.id)).toEqual(once)
    expect(retainActiveTree(once, c.id)[0]).toBe(once[0])
  })
})

describe('commitSessionTree', () => {
  it('never drops a tab and keeps only the committed tree resident', () => {
    const cache = createComparisonCache()
    const a = session('/a', '/b')
    const c = session('/c', '/d')
    const next = commitSessionTree(cache, [a], c)

    expect(next.map((item) => item.id)).toEqual([a.id, c.id])
    expect(next[0].directory).toBeUndefined()
    expect(next[1].directory).toBeDefined()
  })

  it('replaces a tab in place and releases the summary roots it owned', () => {
    const cache = createComparisonCache()
    cache.set('/c/z.txt', entry)
    cache.set('/d/w.txt', entry)
    const first = session('/a', '/b')
    const summary = retainActiveTree([first, session('/c', '/d')], first.id)[1]
    const replacement = session('/e', '/f')

    const next = commitSessionTree(cache, [summary], replacement, { replaceId: summary.id })

    expect(next).toHaveLength(1)
    expect(next[0].id).toBe(summary.id)
    expect(next[0].directory).toBeDefined()
    // The replaced summary had no tree, so its roots come from `sides`.
    expect(cache.hashes.has('/c/z.txt')).toBe(false)
    expect(cache.hashes.has('/d/w.txt')).toBe(false)
  })

  it('releases a summary-only session without touching another tab root', () => {
    const cache = createComparisonCache()
    cache.aliasRoot('/alias/left', '/real/left')
    cache.set('/real/left/a.txt', entry)
    cache.set('/real/left/b.txt', entry)
    const closed = retainActiveTree([session('/alias/left', '/alias/right')], null)[0]
    const open = session('/real/left', '/real/right')

    releaseSessionTree(cache, closed, [open])

    // Closing the alias tab must not evict the real path another tab still uses.
    expect(cache.hashes.has('/real/left/a.txt')).toBe(true)
    expect(cache.hashes.has('/real/left/b.txt')).toBe(true)
  })
})

describe('commitUpsert', () => {
  it('keeps the shared roots warm across a re-compare', () => {
    const cache = createComparisonCache()
    cache.set('/a/x.txt', entry)
    cache.set('/b/y.txt', entry)

    const first = session('/a', '/b')
    const next = commitUpsert(cache, [first], session('/a', '/b'))

    expect(next).toHaveLength(1)
    expect(next[0]).not.toBe(first)
    // The new session still uses both roots, so nothing is evicted and the next
    // round can hit the digest cache (this is the `hashedFiles=0` guarantee).
    expect([...cache.hashes.keys()].sort()).toEqual(['/a/x.txt', '/b/y.txt'])
    expect(cache.stats.evictions).toBe(0)
  })

  it('releases the roots of a replaced comparison that no tab uses any more', () => {
    const cache = createComparisonCache()
    cache.set('/a/x.txt', entry)
    cache.set('/b/y.txt', entry)
    cache.set('/c/z.txt', entry)

    const first = session('/a', '/b')
    // Same tab id, different roots (a sync rewrite of the compared sides).
    const rewritten: WorkbenchSession = { ...session('/c', '/d'), id: first.id }
    const next = commitUpsert(cache, [first], rewritten)

    expect(next[0].id).toBe(first.id)
    expect([...cache.hashes.keys()]).toEqual(['/c/z.txt'])
  })
})
