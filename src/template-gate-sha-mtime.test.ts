/**
 * Template placement gate: source SHA-256 and mtimeSec are preserved.
 *
 * Every written target is re-read from the real disk by the test itself: its
 * bytes must digest to the source's bytes and its whole-second mtime must equal
 * the source's. The tamper pass proves a failed re-check is reported as a
 * verification reason (`hash` / `missing` / `mtime`) while the plan row keeps its
 * original `matched` conclusion, and that a sub-second drift never fails.
 */
import { readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { resolveTemplatePlan } from '@core/directory/template'
import type { TemplatePlanEntry } from '@core/directory/template'
import {
  applyTemplatePlan,
  previewTemplate,
  verifyTemplatePlan
} from '@renderer/workbench/directoryOps'
import {
  buildTemplateGateFixture,
  cleanupScratchRoots,
  diskPath,
  fileSha256,
  GATE_SLOTS,
  installTemplatePlatform,
  platform
} from './template-gate-support'

vi.mock('electron', async () => (await import('./template-gate-support')).electronMock)

beforeAll(async () => {
  await installTemplatePlatform()
})

afterAll(async () => {
  await cleanupScratchRoots()
})

function selectedDefaults(rows: readonly TemplatePlanEntry[]): string[] {
  return rows.filter((row) => row.defaultChecked).map((row) => row.relativePath)
}

async function applySelected() {
  const fixture = await buildTemplateGateFixture()
  const preview = await previewTemplate(platform, fixture)
  const checkedPaths = [
    ...selectedDefaults([...preview.plan.matched, ...preview.plan.conflicts]),
    GATE_SLOTS.overwrite,
    GATE_SLOTS.mismatch
  ]
  const resolved = resolveTemplatePlan(preview.plan, {
    checkedPaths,
    conflictChoices: { [GATE_SLOTS.mismatch]: fixture.mismatchChoice }
  })
  const outcome = await applyTemplatePlan(platform, resolved)
  return { fixture, preview, resolved, outcome }
}

describe('template sha-mtime gate', () => {
  it('keeps the source bytes and whole-second mtime on every written target', async () => {
    const { outcome } = await applySelected()
    expect(outcome.execution.failedCount, 'template sha-mtime: no failed rows').toBe(0)
    expect(outcome.verification.failed, 'template sha-mtime: verification failed rows').toBe(0)
    expect(outcome.verification.entries.length, 'template sha-mtime: one row per write').toBe(
      outcome.execution.writtenCount
    )

    for (const entry of outcome.execution.written) {
      const targetSha = await fileSha256(entry.targetPath)
      const sourceSha = await fileSha256(entry.sourcePath)
      expect(targetSha, `template sha-mtime: ${entry.relativePath} target sha256`).toBe(sourceSha)
      expect(targetSha, `template sha-mtime: ${entry.relativePath} planned sha256`).toBe(
        entry.sourceHash
      )

      const expectedSec = Math.floor(entry.modifiedMs / 1000)
      const targetSec = Math.floor((await stat(entry.targetPath)).mtimeMs / 1000)
      const sourceSec = Math.floor((await stat(entry.sourcePath)).mtimeMs / 1000)
      expect(targetSec, `template sha-mtime: ${entry.relativePath} target mtimeSec`).toBe(
        expectedSec
      )
      expect(sourceSec, `template sha-mtime: ${entry.relativePath} source mtimeSec`).toBe(expectedSec)

      const checked = outcome.verification.entries.find(
        (row) => row.relativePath === entry.relativePath
      )
      expect(checked?.ok, `template sha-mtime: ${entry.relativePath} verification ok`).toBe(true)
      expect(checked?.expectedHash, `template sha-mtime: ${entry.relativePath} expected hash`).toBe(
        sourceSha
      )
      expect(checked?.actualHash, `template sha-mtime: ${entry.relativePath} actual hash`).toBe(
        sourceSha
      )
      expect(
        checked?.expectedMtimeSec,
        `template sha-mtime: ${entry.relativePath} expected mtimeSec`
      ).toBe(expectedSec)
      expect(checked?.actualMtimeSec, `template sha-mtime: ${entry.relativePath} actual mtimeSec`).toBe(
        targetSec
      )
    }
  })

  it('reports hash / missing / mtime tampering but not sub-second drift', async () => {
    const { fixture, preview, outcome } = await applySelected()
    const written = outcome.execution.written
    expect(written.length).toBeGreaterThanOrEqual(4)

    const hashSlot = GATE_SLOTS.clean
    const missingSlot = GATE_SLOTS.plain
    const mtimeSlot = GATE_SLOTS.overwrite
    const subSecondSlot = GATE_SLOTS.mismatch

    const entryOf = (slot: string) => {
      const entry = written.find((item) => item.relativePath === slot)
      if (entry === undefined) throw new Error(`no written row for ${slot}`)
      return entry
    }

    await writeFile(entryOf(hashSlot).targetPath, 'tampered body\n', 'utf8')
    await rm(entryOf(missingSlot).targetPath)
    const mtimeEntry = entryOf(mtimeSlot)
    const expectedSec = Math.floor(mtimeEntry.modifiedMs / 1000)
    await utimes(mtimeEntry.targetPath, expectedSec - 2, expectedSec - 2)
    const subSecondEntry = entryOf(subSecondSlot)
    const subSecondSec = Math.floor(subSecondEntry.modifiedMs / 1000) + 0.4
    await utimes(subSecondEntry.targetPath, subSecondSec, subSecondSec)

    const verification = await verifyTemplatePlan(platform, written)
    expect(verification.entries.length, 'template sha-mtime: tamper rows complete').toBe(
      written.length
    )
    expect(
      verification.verified + verification.failed,
      'template sha-mtime: verified plus failed covers every row'
    ).toBe(verification.entries.length)

    const bySlot = new Map(verification.entries.map((row) => [row.relativePath, row]))
    expect(bySlot.get(hashSlot)?.ok, 'template sha-mtime: tampered body fails').toBe(false)
    expect(bySlot.get(hashSlot)?.reason, 'template sha-mtime: tampered body reason').toBe('hash')
    expect(bySlot.get(missingSlot)?.ok, 'template sha-mtime: deleted target fails').toBe(false)
    expect(bySlot.get(missingSlot)?.reason, 'template sha-mtime: deleted target reason').toBe(
      'missing'
    )
    expect(bySlot.get(mtimeSlot)?.ok, 'template sha-mtime: drifted mtime fails').toBe(false)
    expect(bySlot.get(mtimeSlot)?.reason, 'template sha-mtime: drifted mtime reason').toBe('mtime')
    expect(bySlot.get(subSecondSlot)?.ok, 'template sha-mtime: sub-second drift passes').toBe(true)

    // A failed re-check never rewrites the plan conclusion: the row is still a
    // match, it is only the disk that no longer agrees with it.
    const planRow = [...preview.plan.matched, ...preview.plan.conflicts].find(
      (row) => row.relativePath === hashSlot
    )
    expect(planRow?.outcome, 'template sha-mtime: tampered row still matched').toBe('matched')
    expect(diskPath(fixture.outputRoot, hashSlot)).toBe(entryOf(hashSlot).targetPath)
    await expect(readFile(entryOf(hashSlot).targetPath, 'utf8')).resolves.toBe('tampered body\n')
  })
})
