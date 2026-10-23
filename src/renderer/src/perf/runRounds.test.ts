import { describe, expect, it } from 'vitest'
import type { WorkbenchSession } from '../workbench/session'
import { createWebPlatformPort } from '../platform/web-platform'
import { runPerfRounds } from './runRounds'

async function seededPlatform() {
  const platform = createWebPlatformPort()
  for (const root of ['left', 'right', 'other-left', 'other-right']) {
    await platform.ensureDirectory(`/memory/${root}`)
  }
  await platform.writeTextFile('/memory/left/a.txt', 'alpha', 1000)
  await platform.writeTextFile('/memory/right/a.txt', 'alpha', 1000)
  await platform.writeTextFile('/memory/left/b.txt', 'bravo', 1000)
  await platform.writeTextFile('/memory/right/b.txt', 'bravO', 1000)
  await platform.writeTextFile('/memory/other-left/c.txt', 'charlie', 1000)
  await platform.writeTextFile('/memory/other-right/c.txt', 'charlie', 1000)
  return platform
}

describe('runPerfRounds', () => {
  it('upserts the same session for every round and never releases the previous one', async () => {
    const platform = await seededPlatform()
    const commits: Array<{ sessions: readonly WorkbenchSession[]; activeId: string }> = []
    const started: number[] = []

    const reports = await runPerfRounds(
      platform,
      { mode: 'upsert', pairs: [{ left: '/memory/left', right: '/memory/right' }], rounds: 5 },
      {
        onRoundStart: (round) => {
          started.push(round)
        },
        onCommit: (sessions, activeId) => {
          commits.push({ sessions, activeId })
        }
      }
    )

    expect(started).toEqual([1, 2, 3, 4, 5])
    expect(reports).toHaveLength(5)
    expect(commits).toHaveLength(5)
    // Workbench semantics: the tab count stays at 1 and the id never changes.
    for (const commit of commits) {
      expect(commit.sessions).toHaveLength(1)
      expect(commit.sessions[0].id).toBe('directory:/memory/left ↔ /memory/right')
      expect(commit.activeId).toBe(commit.sessions[0].id)
    }
    // Every round commits a *new* session object replacing the previous one.
    expect(new Set(commits.map((commit) => commit.sessions[0])).size).toBe(5)
    expect(reports.map((report) => report.tabs)).toEqual([1, 1, 1, 1, 1])
    expect(new Set(reports.map((report) => report.sessionId)).size).toBe(1)

    expect(reports[0].counts).toEqual({ files: 2, dirs: 1, hashedFiles: 4, bytesToHash: 20 })
    // The shared cache mirrors the workbench: later rounds need no digest at all.
    for (const report of reports.slice(1)) {
      expect(report.counts.hashedFiles).toBe(0)
      expect(report.counts.bytesToHash).toBe(0)
    }
  })

  it('appends one tab per pair in multisession mode', async () => {
    const platform = await seededPlatform()
    const counts: number[] = []

    const reports = await runPerfRounds(
      platform,
      {
        mode: 'multisession',
        pairs: [
          { left: '/memory/left', right: '/memory/right' },
          { left: '/memory/other-left', right: '/memory/other-right' }
        ],
        rounds: 2
      },
      {
        onCommit: (sessions) => {
          counts.push(sessions.length)
        }
      }
    )

    expect(counts).toEqual([1, 2])
    expect(reports.map((report) => report.tabs)).toEqual([1, 2])
    expect(new Set(reports.map((report) => report.sessionId)).size).toBe(2)
  })

  it('reports each round wall clock and ISO boundaries', async () => {
    const platform = await seededPlatform()
    let clock = 10_000
    const reports = await runPerfRounds(
      platform,
      { mode: 'upsert', pairs: [{ left: '/memory/left', right: '/memory/right' }], rounds: 2 },
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
