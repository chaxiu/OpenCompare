import { describe, expect, it } from 'vitest'
import type { DirectoryDiffNode } from '@core/directory/compare'
import { createDrilldownSession, resolveDirectoryReturn } from './directoryCompare'
import type { DrilldownTarget } from './fileKinds'
import type { WorkbenchSession } from './session'

const TARGET: DrilldownTarget = { kind: 'code', label: '代码 / 文本' }

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
