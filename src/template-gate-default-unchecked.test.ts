/**
 * Template placement gate: conflict and overwrite stay default-unchecked.
 *
 * Real temporary directories and the production `PlatformPort` handlers only.
 * The default-checked set is asserted to be *bidirectionally* equal to "a
 * matched row whose target is absent", so neither a silently checked conflict /
 * overwrite row nor a wrongly unchecked clean row can pass.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { resolveTemplatePlan } from '@core/directory/template'
import type { TemplatePlanEntry } from '@core/directory/template'
import { applyTemplatePlan, previewTemplate } from '@renderer/workbench/directoryOps'
import {
  buildTemplateGateFixture,
  cleanupScratchRoots,
  GATE_SLOTS,
  installTemplatePlatform,
  platform,
  recordIo
} from './template-gate-support'

vi.mock('electron', async () => (await import('./template-gate-support')).electronMock)

beforeAll(async () => {
  await installTemplatePlatform()
})

afterAll(async () => {
  await cleanupScratchRoots()
})

function allRows(plan: {
  readonly matched: readonly TemplatePlanEntry[]
  readonly missing: readonly TemplatePlanEntry[]
  readonly conflicts: readonly TemplatePlanEntry[]
}): TemplatePlanEntry[] {
  return [...plan.matched, ...plan.missing, ...plan.conflicts]
}

describe('template default-checked gate', () => {
  it('checks exactly the matched rows whose target is absent', async () => {
    const fixture = await buildTemplateGateFixture()
    const preview = await previewTemplate(platform, fixture)

    const rows = allRows(preview.plan)
    const checked = rows
      .filter((row) => row.defaultChecked)
      .map((row) => row.relativePath)
      .sort()
    const expected = rows
      .filter(
        (row) =>
          row.outcome === 'matched' && !row.overwrite && !row.occupiedByDirectory
      )
      .map((row) => row.relativePath)
      .sort()

    expect(checked, 'template default-checked: checked set equals predicate set').toEqual(
      expected
    )
    for (const row of rows) {
      expect(
        row.defaultChecked,
        `template default-checked: ${row.relativePath} (${row.outcome})`
      ).toBe(row.outcome === 'matched' && !row.overwrite && !row.occupiedByDirectory)
    }
  })

  it('leaves every overwrite, conflict, missing and occupied row unchecked', async () => {
    const fixture = await buildTemplateGateFixture()
    const preview = await previewTemplate(platform, fixture)
    const bySlot = new Map(allRows(preview.plan).map((row) => [row.relativePath, row]))

    const overwrite = bySlot.get(GATE_SLOTS.overwrite)
    expect(overwrite?.outcome, 'template default-checked: overwrite row is matched').toBe('matched')
    expect(overwrite?.overwrite, 'template default-checked: overwrite row overwrites').toBe(true)
    expect(overwrite?.defaultChecked, 'template default-checked: overwrite row unchecked').toBe(false)

    for (const slot of [GATE_SLOTS.mismatch, GATE_SLOTS.ambiguous]) {
      const row = bySlot.get(slot)
      expect(row?.outcome, `template default-checked: ${slot} is a conflict`).toBe('conflict')
      expect(row?.defaultChecked, `template default-checked: ${slot} unchecked`).toBe(false)
    }
    expect(bySlot.get(GATE_SLOTS.missing)?.outcome).toBe('missing')
    expect(bySlot.get(GATE_SLOTS.missing)?.defaultChecked).toBe(false)

    const occupied = bySlot.get(GATE_SLOTS.occupied)
    expect(occupied?.occupiedByDirectory, 'template default-checked: occupied slot').toBe(true)
    expect(occupied?.defaultChecked, 'template default-checked: occupied unchecked').toBe(false)
  })

  it('rescans written slots as unchecked overwrites and writes nothing', async () => {
    const fixture = await buildTemplateGateFixture()
    const preview = await previewTemplate(platform, fixture)
    const defaults = allRows(preview.plan)
      .filter((row) => row.defaultChecked)
      .map((row) => row.relativePath)
    const writtenSlots = [...defaults, GATE_SLOTS.overwrite]
    await applyTemplatePlan(
      platform,
      resolveTemplatePlan(preview.plan, { checkedPaths: writtenSlots })
    )

    const io = recordIo(platform)
    const rescanned = await previewTemplate(io.port, fixture)
    expect(io.writes, 'template default-checked: rescan writes nothing').toEqual([])
    expect(io.directories, 'template default-checked: rescan creates nothing').toEqual([])

    const bySlot = new Map(allRows(rescanned.plan).map((row) => [row.relativePath, row]))
    for (const slot of writtenSlots) {
      const row = bySlot.get(slot)
      expect(row?.overwrite, `template default-checked: ${slot} now overwrites`).toBe(true)
      expect(row?.defaultChecked, `template default-checked: ${slot} rescanned unchecked`).toBe(
        false
      )
    }

    const empty = resolveTemplatePlan(rescanned.plan, {})
    expect(empty.executableCount, 'template default-checked: empty selection no writes').toBe(0)
    expect(empty.rejectedCount, 'template default-checked: empty selection no rejections').toBe(0)
    expect(io.writes).toEqual([])
  })
})
