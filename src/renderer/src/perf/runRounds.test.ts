import { describe, expect, it } from 'vitest'
import type { WorkbenchSession } from '../workbench/session'
import { createWebPlatformPort } from '../platform/web-platform'
import { runPerfRounds } from './runRounds'

async function seededPlatform() {
  const platform = createWebPlatformPort()
  await platform.ensureDirectory('/memory/left')
  await platform.ensureDirectory('/memory/right')
  await platform.writeTextFile('/memory/left/a.txt', 'alpha', 1000)
  await platform.writeTextFile('/memory/right/a.txt', 'alpha', 1000)
  await platform.writeTextFile('/memory/left/b.txt', 'bravo', 1000)
  await platform.writeTextFile('/memory/right/b.txt', 'bravO', 1000)
  return platform
}

describe('runPerfRounds', () => {
  it('builds a fresh session every round and reports real digest totals', async () => {
    const platform = await seededPlatform()
    const sessions: WorkbenchSession[] = []
    const started: number[] = []

    const reports = await runPerfRounds(
      platform,
      { left: '/memory/left', right: '/memory/right', rounds: 2 },
      {
        onRoundStart: (round) => {
          started.push(round)
        },
        onSession: (session) => sessions.push(session)
      }
    )

    expect(started).toEqual([1, 2])
    expect(reports).toHaveLength(2)
    expect(reports[0].counts).toEqual({
      files: 2,
      dirs: 1,
      hashedFiles: 4,
      bytesToHash: 20
    })
    // The shared cache mirrors the workbench: round 2 needs no digest at all.
    expect(reports[1].counts.hashedFiles).toBe(0)
    expect(reports[1].counts.bytesToHash).toBe(0)

    expect(sessions).toHaveLength(2)
    expect(sessions[0]).not.toBe(sessions[1])
    expect(sessions[0].id).toMatch(/^directory:\/memory\/left ↔ \/memory\/right/)
    expect(new Set(sessions.map((session) => session.id)).size).toBe(2)
    expect(reports.map((report) => report.sessionId)).toEqual(sessions.map((session) => session.id))
    expect(sessions[0].directory?.counts).toEqual({
      same: 1,
      added: 0,
      removed: 0,
      modified: 1
    })
  })

  it('releases the previous round session before the next boundary', async () => {
    const platform = await seededPlatform()
    const events: string[] = []
    let held: WorkbenchSession | null = null

    const reports = await runPerfRounds(
      platform,
      { left: '/memory/left', right: '/memory/right', rounds: 3 },
      {
        onRoundStart: (round) => {
          // The boundary never sees the previous round's session.
          expect(held).toBeNull()
          events.push(`start-${round}`)
        },
        onSession: (session) => {
          held = session
          events.push(`hold-${session.id}`)
        },
        onReleaseSession: (id) => {
          events.push(`release-${id}`)
          held = null
        }
      }
    )

    const releases = events.flatMap((event, index) => (event.startsWith('release-') ? [index] : []))
    const starts = events.flatMap((event, index) => (event.startsWith('start-') ? [index] : []))
    expect(releases).toHaveLength(2)
    expect(releases[0]).toBeLessThan(starts[1])
    expect(releases[1]).toBeLessThan(starts[2])
    // Only the round in flight is held after the run, never one per round.
    expect(held).not.toBeNull()

    // A round report is scalars only: no tree, session or comparison object.
    expect(Object.keys(reports[0]).sort()).toEqual([
      'counts',
      'endedAt',
      'index',
      'sessionId',
      'startedAt',
      'wallMs'
    ])
    const serialized = JSON.parse(JSON.stringify(reports)) as Array<Record<string, unknown>>
    for (const report of serialized) {
      expect(report.directory).toBeUndefined()
      expect(report.root).toBeUndefined()
      expect(report.sides).toBeUndefined()
    }
  })

  it('reports each round wall clock and ISO boundaries', async () => {
    const platform = await seededPlatform()
    let clock = 10_000
    const reports = await runPerfRounds(
      platform,
      { left: '/memory/left', right: '/memory/right', rounds: 2 },
      {
        now: () => {
          clock += 250
          return clock
        }
      }
    )
    expect(reports).toHaveLength(2)
    for (const report of reports) {
      expect(report.wallMs).toBeGreaterThan(0)
      expect(Date.parse(report.endedAt)).toBeGreaterThanOrEqual(Date.parse(report.startedAt))
    }
  })
})
