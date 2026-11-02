/* Real-disk proof of the code pair open link and its drilldown probes. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { DirectoryDiffNode } from '@core/directory/compare'
import { detectNewline } from '@core/text/probe'
import { SNAPSHOT_SCHEMA } from '@shared/snapshot'
import type { SnapshotDocument } from '@shared/snapshot'
import type { PlatformPort, TextFileProbe } from '@shared/platform/types'
import type { DrilldownTarget } from './renderer/src/workbench/fileKinds'
import { openDrilldownSession, openFilePairSession } from './renderer/src/workbench/directoryCompare'
import type { WorkbenchSession } from './renderer/src/workbench/session'
import { directorySides, snapshotSide } from './renderer/src/workbench/snapshotOps'
import { ipcPort, sha256Hex, TEXT_PROBE_CASES } from './test/sharedHarness'
import { registerPlatformIpc } from './main/platform/electron-platform'

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>()
}))

vi.mock('electron', () => ({
  app: { getPath: () => tmpdir(), getLocale: () => 'en-US' },
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    showSaveDialog: async () => ({ canceled: true, filePath: undefined })
  },
  ipcMain: { handle: (channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler) }
}))

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = handlers.get(channel)
  if (handler === undefined) throw new Error(`No handler registered for ${channel}`)
  return Promise.resolve(handler({}, ...args))
}

const base = ipcPort(invoke)
const probeCalls: string[] = []
const readCalls: string[] = []
const platform: PlatformPort = {
  ...base,
  probeTextFile: (path) => {
    probeCalls.push(path)
    return base.probeTextFile(path)
  },
  readTextFile: (path) => {
    readCalls.push(path)
    return base.readTextFile(path)
  }
}

const TARGET: DrilldownTarget = { kind: 'code', label: 'code' }
let root = ''
function fileNode(relativePath: string, leftPath?: string, rightPath?: string): DirectoryDiffNode {
  const name = relativePath.slice(relativePath.lastIndexOf('/') + 1)
  return {
    name,
    relativePath,
    kind: 'file',
    status: 'modified',
    children: [],
    counts: { same: 0, added: 0, removed: 0, modified: 1 },
    leftPath,
    rightPath
  }
}

/** Asserts one side of a session carries exactly the platform probe's facts. */
function expectSide(session: WorkbenchSession, side: 'left' | 'right', probe: TextFileProbe): void {
  const { text, ...facts } = probe
  expect(session.probes?.[side]).toEqual(facts)
  expect(session.adhoc?.pair[side].text).toBe(text)
}
beforeAll(async () => {
  registerPlatformIpc()
  root = await mkdtemp(join(tmpdir(), 'opencompare-pair-probe-'))
})

afterAll(async () => {
  if (root.length > 0) await rm(root, { recursive: true, force: true })
})
describe('real file-pair open probe facts', () => {
  it('matches platform.probeTextFile for all four encodings with one probe per side', async () => {
    const paths: string[] = []
    for (const [index, item] of TEXT_PROBE_CASES.entries()) {
      const left = join(root, `${index}-left.ts`)
      const right = join(root, `${index}-right.ts`)
      await writeFile(left, item.bytes)
      await writeFile(right, item.bytes)
      paths.push(left, right)

      const session = await openFilePairSession(platform, left, right)
      expectSide(session, 'left', await base.probeTextFile(left))
      expectSide(session, 'right', await base.probeTextFile(right))
      expect(session.adhoc?.pair.left.text).toBe(item.decoded)
    }
    expect([...probeCalls].sort()).toEqual([...paths].sort())
    expect(probeCalls).toHaveLength(paths.length)
    expect(readCalls).toEqual([])
  })
})
describe('drilldown probe facts', () => {
  it('probes each real side independently and never probes a missing side', async () => {
    const left = join(root, 'drill-left.ts')
    const right = join(root, 'drill-right.ts')
    await writeFile(left, 'alpha\r\nbeta\r\n')
    await writeFile(right, 'alpha\nbeta\n')
    const sides = directorySides(root, root)

    const session = await openDrilldownSession(
      platform,
      'directory:a ↔ b',
      fileNode('src/engine.ts', left, right),
      TARGET,
      sides
    )
    expect(session.probes?.left?.newline).toBe('CRLF')
    expect(session.probes?.right?.newline).toBe('LF')
    expectSide(session, 'left', await base.probeTextFile(left))
    expectSide(session, 'right', await base.probeTextFile(right))

    probeCalls.length = 0
    const added = await openDrilldownSession(
      platform,
      'directory:a ↔ b',
      fileNode('src/new.ts', undefined, right),
      TARGET,
      sides
    )
    expect(added.probes?.left).toBeUndefined()
    expect(added.probes?.right?.path).toBe(right)
    expect(added.adhoc?.pair.left.text).toBe('')
    expect(added.adhoc?.pair.left.path).toContain('opencompare-missing-left')
    expect(probeCalls).toEqual([right])
  })

  it('probes a snapshot-inlined body as memory UTF-8 and never touches its virtual path', async () => {
    const inline = 'alpha\r\nbeta\n'
    const inlineBytes = new TextEncoder().encode(inline)
    const document: SnapshotDocument = {
      schema: SNAPSHOT_SCHEMA,
      name: 'snap',
      exportedAt: '2026-11-02T00:00:00.000Z',
      entries: [
        { path: 'src/inline.ts', size: inline.length, modifiedMs: 0, sha256: sha256Hex(inlineBytes), content: inline }
      ]
    }
    const mountedPath = '/snapshots/right/snap/src/inline.ts'
    const sides = {
      left: { kind: 'directory', path: root },
      right: snapshotSide('right', document)
    } as const

    probeCalls.length = 0
    const session = await openDrilldownSession(
      platform,
      'directory:a ↔ b',
      fileNode('src/inline.ts', undefined, mountedPath),
      TARGET,
      { ...sides }
    )
    expect(session.adhoc?.pair.right.text).toBe(inline)
    expect(session.probes?.right).toEqual({
      path: mountedPath,
      encoding: 'UTF-8',
      newline: detectNewline(inline),
      bytes: inlineBytes.length,
      sha256: sha256Hex(inlineBytes)
    })
    expect(probeCalls.filter((path) => path.startsWith('/snapshots/'))).toEqual([])
  })
})
