import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { buildMergeModel } from '@core/text/merge'
import { resolveComparisonSwitches } from '@core/text/normalize'
import { comparisonHistoryId, resolveComparisonHistoryReopen, upsertComparisonHistory } from '@shared/history/model'
import { PLATFORM_CHANNELS } from '@shared/platform/channels'
import type { PlatformPort } from '@shared/platform/types'
import { interpolate } from '@renderer/i18n/interpolate'
import { zh } from '@renderer/i18n/messages'
import type { Translate } from '@renderer/i18n/context'
import { probeTextBytes } from '@core/text/probe'
import { historyCandidate } from './historyHomeModel'
import { buildMergeSession, mergeSessionErrorMessage, mergeSessionId, mergeSessionText, MergeSessionError } from './mergeSession'
import { ipcPort, releaseScratchRoots, scratchRoot } from '../../../test/sharedHarness'

const BASE_TEXT = 'head\nvalue = 1\nmid\ntail\n'
const OURS_TEXT = 'head\nvalue = ours\nmid\ntail\n'
const THEIRS_TEXT = 'head\nvalue = theirs\nmid\ntail\n'
const t: Translate = (key, params) => interpolate(zh[key], params)

afterAll(releaseScratchRoots)

/** A real-file IPC port: only the channel a merge build needs. */
function realFilePort(read: (path: string) => Promise<string> = (path) => readFile(path, 'utf8')): PlatformPort {
  return ipcPort(async (channel, ...args) => {
    if (channel !== PLATFORM_CHANNELS.readTextFile) throw new Error(`unexpected channel ${channel}`)
    return read(String(args[0]))
  })
}

/** A real-file port for unknown extensions: probe once per side, no plain read. */
function realProbePort(): PlatformPort {
  const port = {
    readTextFile: async (path: string) => {
      throw new Error(`unexpected plain read ${path}`)
    },
    probeTextFile: async (path: string) => ({
      path,
      ...probeTextBytes(await readFile(path))
    })
  }
  return port as unknown as PlatformPort
}

async function writeTrio(root: string, names = ['base.txt', 'ours.txt', 'theirs.txt']) {
  const paths = names.map((name) => join(root, name))
  await mkdir(dirname(paths[0]!), { recursive: true })
  await Promise.all([BASE_TEXT, OURS_TEXT, THEIRS_TEXT].map((text, index) => writeFile(paths[index]!, text, 'utf8')))
  return { base: paths[0]!, ours: paths[1]!, theirs: paths[2]! }
}

describe('buildMergeSession', () => {
  it('reads three real files into a three-column session with real paths and conflicts', async () => {
    const paths = await writeTrio(await scratchRoot())
    const session = await buildMergeSession(realFilePort(), paths.base, paths.ours, paths.theirs)
    expect(session.id).toBe(mergeSessionId(paths.base, paths.ours, paths.theirs))
    expect(session.id.startsWith('merge:')).toBe(true)
    expect({ scene: session.scene, columns: session.columns }).toEqual({ scene: 'code', columns: 3 })
    expect(session.merge).toEqual({ base: { path: paths.base, text: BASE_TEXT }, ours: { path: paths.ours, text: OURS_TEXT }, theirs: { path: paths.theirs, text: THEIRS_TEXT } })
    expect({ title: session.title, subtitle: session.subtitle }).toEqual({ title: 'base.txt ↔ ours.txt ↔ theirs.txt', subtitle: `${paths.base} ↔ ${paths.ours} ↔ ${paths.theirs}` })
    const merge = session.merge!
    expect(buildMergeModel(merge.base.text, merge.ours.text, merge.theirs.text).conflictIds.length).toBeGreaterThan(0)
  })

  it('collapses three identical names and localizes a read failure without echoing the path', async () => {
    expect(mergeSessionText({ base: { path: '/a/app.ts', text: BASE_TEXT }, ours: { path: '/b/app.ts', text: OURS_TEXT }, theirs: { path: '/c/app.ts', text: THEIRS_TEXT } })).toEqual({ title: 'app.ts', subtitle: '/a/app.ts ↔ /b/app.ts ↔ /c/app.ts' })
    const root = await scratchRoot()
    const paths = await writeTrio(root)
    const read = async (path: string): Promise<string> => { if (path === paths.theirs) throw new Error('ENOENT'); return readFile(path, 'utf8') }
    const failure = await buildMergeSession(realFilePort(read), paths.base, paths.ours, paths.theirs).catch((cause: unknown) => cause)
    expect(failure).toBeInstanceOf(MergeSessionError)
    expect({ code: (failure as MergeSessionError).code, side: (failure as MergeSessionError).side }).toEqual({ code: 'READ_FAILED', side: 'theirs' })
    expect(mergeSessionErrorMessage(failure, t)).toContain('theirs')
    expect(mergeSessionErrorMessage(failure, t)).not.toContain(root)
  })
})

describe('buildMergeSession with unknown extensions', () => {
  it('opens three unknown-extension text files as one merge view', async () => {
    const paths = await writeTrio(await scratchRoot(), ['base.vue', 'ours.vue', 'theirs.vue'])
    const session = await buildMergeSession(realProbePort(), paths.base, paths.ours, paths.theirs)
    expect(session.scene).toBe('code')
    expect(session.merge).toEqual({
      base: { path: paths.base, text: BASE_TEXT },
      ours: { path: paths.ours, text: OURS_TEXT },
      theirs: { path: paths.theirs, text: THEIRS_TEXT }
    })
  })

  it('rejects a binary unknown-extension side with its side and file name', async () => {
    const root = await scratchRoot()
    const paths = await writeTrio(root, ['base.vue', 'ours.vue', 'theirs.vue'])
    await writeFile(
      paths.ours,
      Uint8Array.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52
      ])
    )
    const failure = await buildMergeSession(realProbePort(), paths.base, paths.ours, paths.theirs).catch(
      (cause: unknown) => cause
    )
    expect(failure).toBeInstanceOf(MergeSessionError)
    expect({ code: (failure as MergeSessionError).code, side: (failure as MergeSessionError).side }).toEqual({
      code: 'UNSUPPORTED_FILE_TYPE',
      side: 'ours'
    })
    const message = mergeSessionErrorMessage(failure, t)
    expect(message).toContain('ours.vue')
    expect(message).not.toContain(root)
  })
})

describe('merge session history', () => {
  it('upserts one ordered row, refreshes createdAt and treats a swap as new', () => {
    const ordered = ['/repo/base.ts', '/repo/ours.ts', '/repo/theirs.ts']
    const switches = resolveComparisonSwitches({})
    const first = upsertComparisonHistory([], historyCandidate('merge', ordered, switches, 1000))
    const again = upsertComparisonHistory(first, historyCandidate('merge', ordered, switches, 2000))
    expect(again).toHaveLength(1)
    expect(again[0]).toMatchObject({ id: comparisonHistoryId('merge', ordered), paths: ordered, createdAt: 2000 })
    expect(again[0]?.id).toBe(first[0]?.id)
    const plan = resolveComparisonHistoryReopen(again[0]!)
    expect(plan.ok && plan.kind).toBe('merge')
    expect(plan.ok && plan.paths).toEqual(ordered)
    const swapped = upsertComparisonHistory(again, historyCandidate('merge', [ordered[0]!, ordered[2]!, ordered[1]!], switches, 3000))
    expect(swapped).toHaveLength(2)
    expect(swapped[0]?.id).not.toBe(swapped[1]?.id)
  })
})
