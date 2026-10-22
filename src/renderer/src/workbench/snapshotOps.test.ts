import { describe, expect, it, vi } from 'vitest'
import { DIRECTORY_SAMPLE_PATHS, REMOTE_SNAPSHOT } from '@shared/fixtures'
import type { PlatformPort } from '@shared/platform/types'
import type { SnapshotDocument } from '@shared/snapshot'
import { SNAPSHOT_SCHEMA } from '@shared/snapshot'
import { createComparisonCache } from '@core/directory/compare'
import {
  SnapshotContentError,
  SnapshotFormatError,
  serializeSnapshot
} from '@core/directory/snapshot'
import { sha256Hex } from '@core/directory/hash'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import {
  compareSides,
  describeSnapshotContentError,
  describeSnapshotImportError,
  directorySides,
  exportSideSnapshot,
  findSnapshotMount,
  parseSnapshotText,
  readSideFile,
  remoteSnapshotSides,
  snapshotMountPath,
  snapshotSide,
  withSide
} from './snapshotOps'

const LEFT = DIRECTORY_SAMPLE_PATHS.left

describe('snapshotOps export', () => {
  it('captures a real directory side as canonical .ocsnap.json', async () => {
    const platform = createWebPlatformPort()
    const exported = await exportSideSnapshot(platform, { kind: 'directory', path: LEFT })

    expect(exported.snapshot.schema).toBe(SNAPSHOT_SCHEMA)
    expect(exported.snapshot.name).toBe('baseline')
    expect(exported.snapshot.entries).toHaveLength(15)
    expect(exported.entryCount).toBe(15)
    for (const entry of exported.snapshot.entries) {
      expect(Number.isInteger(entry.size) && entry.size >= 0).toBe(true)
      expect(Number.isFinite(entry.modifiedMs)).toBe(true)
      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/)
    }

    const engineText = await platform.readTextFile(`${LEFT}/src/core/engine.ts`)
    const engine = exported.snapshot.entries.find((entry) => entry.path === 'src/core/engine.ts')
    expect(engine?.content).toBe(engineText)
    expect(engine?.sha256).toBe(sha256Hex(engineText))

    // Non-drilldown-able files stay metadata + digest only.
    const logo = exported.snapshot.entries.find((entry) => entry.path === 'assets/logo.png')
    expect(logo?.content).toBeUndefined()

    const reparsed = parseSnapshotText(exported.text)
    expect(reparsed.entries).toHaveLength(15)
    expect(reparsed.name).toBe('baseline')
  })

  it('mounts snapshots under /snapshots/<side>/<name>', () => {
    expect(snapshotMountPath('right', 'remote-prod')).toBe('/snapshots/right/remote-prod')
    expect(snapshotMountPath('left', 'a b/c')).toBe('/snapshots/left/a-b-c')
    expect(snapshotMountPath('left', '///')).toBe('/snapshots/left/snapshot')
  })
})

describe('snapshotOps comparison', () => {
  it('compares the local sample directory against the remote snapshot across four statuses', async () => {
    const platform = createWebPlatformPort()
    const comparison = await compareSides(
      platform,
      remoteSnapshotSides(),
      createComparisonCache()
    )

    expect(comparison.leftName).toBe('baseline')
    expect(comparison.rightName).toBe('remote-prod')
    expect(comparison.rightRoot).toBe('/snapshots/right/remote-prod')
    expect(comparison.counts.same).toBeGreaterThan(0)
    expect(comparison.counts.added).toBeGreaterThan(0)
    expect(comparison.counts.removed).toBeGreaterThan(0)
    expect(comparison.counts.modified).toBeGreaterThan(0)
  })

  it('round-trips an exported directory snapshot back to an all-same comparison', async () => {
    const platform = createWebPlatformPort()
    const exported = await exportSideSnapshot(platform, { kind: 'directory', path: LEFT })
    const imported = parseSnapshotText(exported.text)
    const sides = withSide(
      directorySides(LEFT, DIRECTORY_SAMPLE_PATHS.right),
      'right',
      snapshotSide('right', imported)
    )

    const comparison = await compareSides(platform, sides, createComparisonCache())
    expect(comparison.counts).toEqual({ same: 15, added: 0, removed: 0, modified: 0 })
  })

  it('hits snapshot-seeded digests and recomputes the same result after eviction', async () => {
    const base = createWebPlatformPort()
    const exported = await exportSideSnapshot(base, { kind: 'directory', path: LEFT })
    const imported = parseSnapshotText(exported.text)
    const sides = withSide(
      directorySides(LEFT, DIRECTORY_SAMPLE_PATHS.right),
      'right',
      snapshotSide('right', imported)
    )
    const readTextFile = vi.fn((path: string) => base.readTextFile(path))
    const platform: PlatformPort = { ...base, readTextFile }
    const cache = createComparisonCache()

    const first = await compareSides(platform, sides, cache)
    expect(first.counts).toEqual({ same: 15, added: 0, removed: 0, modified: 0 })
    // The seeded digests cover the mounted side: no body is ever read from a
    // virtual `/snapshots/...` path through the platform.
    expect(readTextFile.mock.calls.filter(([path]) => path.startsWith('/snapshots/'))).toEqual([])

    // Evicting the seeded entries must not change the result: the snapshot
    // document itself supplies the body, never a platform read of the mount.
    const released = cache.evictUnderRoots([first.rightRoot])
    expect(released).toBeGreaterThan(0)
    const second = await compareSides(platform, sides, cache)
    expect(second.counts).toEqual(first.counts)
    expect(readTextFile.mock.calls.filter(([path]) => path.startsWith('/snapshots/'))).toEqual([])
  })

  it('compares snapshot against snapshot', async () => {
    const platform = createWebPlatformPort()
    const sides = {
      left: snapshotSide('left', REMOTE_SNAPSHOT.snapshot),
      right: snapshotSide('right', REMOTE_SNAPSHOT.snapshot)
    }

    const comparison = await compareSides(platform, sides, createComparisonCache())
    expect(comparison.leftRoot).toBe('/snapshots/left/remote-prod')
    expect(comparison.rightRoot).toBe('/snapshots/right/remote-prod')
    expect(comparison.counts).toEqual({
      same: REMOTE_SNAPSHOT.snapshot.entries.length,
      added: 0,
      removed: 0,
      modified: 0
    })
  })

  it('rejects non-snapshot text with a readable hint', () => {
    let caught: unknown
    try {
      parseSnapshotText('{"a":1}')
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(SnapshotFormatError)
    expect((caught as SnapshotFormatError).code).toBe('invalid-schema')
    expect(describeSnapshotImportError(caught)).toContain('opencompare.snapshot/v1')
  })

  it('reads directory paths from the platform and snapshot paths from the mount', async () => {
    const platform = createWebPlatformPort()
    const sides = remoteSnapshotSides()

    const directoryText = await readSideFile(platform, sides, `${LEFT}/package.json`)
    expect(directoryText).toContain('"name": "baseline"')

    const snapshotText = await readSideFile(
      platform,
      sides,
      '/snapshots/right/remote-prod/config/deploy.yaml'
    )
    expect(snapshotText).toContain('service:')

    expect(findSnapshotMount(sides, `${LEFT}/package.json`)).toBeNull()
    expect(findSnapshotMount(sides, '/snapshots/right/remote-prod/config/deploy.yaml')).not.toBeNull()
  })

  it('flags a snapshot file whose content was not inlined', async () => {
    const platform = createWebPlatformPort()
    const document: SnapshotDocument = {
      schema: SNAPSHOT_SCHEMA,
      name: 'meta-only',
      exportedAt: '2026-10-17T00:00:00.000Z',
      entries: [{ path: 'src/notes.ts', size: 3, modifiedMs: 0, sha256: sha256Hex('abc') }]
    }
    const sides = withSide(
      directorySides(LEFT, DIRECTORY_SAMPLE_PATHS.right),
      'right',
      snapshotSide('right', document)
    )
    const mountedPath = '/snapshots/right/meta-only/src/notes.ts'

    await expect(readSideFile(platform, sides, mountedPath)).rejects.toBeInstanceOf(
      SnapshotContentError
    )

    let caught: unknown
    try {
      await readSideFile(platform, sides, mountedPath)
    } catch (error) {
      caught = error
    }
    expect((caught as SnapshotContentError).code).toBe('content-not-inlined')
    expect(describeSnapshotContentError(caught, 'src/notes.ts')).toContain('未内联')
  })

  it('re-serializes a mounted snapshot unchanged', async () => {
    const platform = createWebPlatformPort()
    const side = snapshotSide('right', REMOTE_SNAPSHOT.snapshot)
    const exported = await exportSideSnapshot(platform, side)

    expect(exported.text).toBe(serializeSnapshot(REMOTE_SNAPSHOT.snapshot))
    expect(exported.entryCount).toBe(REMOTE_SNAPSHOT.snapshot.entries.length)
  })
})
