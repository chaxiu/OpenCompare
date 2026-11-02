/**
 * Template placement gate: conflict and overwrite stay default-unchecked.
 *
 * Real temporary directories and the production `PlatformPort` handlers only.
 * The default-checked set is asserted to be *bidirectionally* equal to "a
 * matched row whose target is absent", so neither a silently checked conflict /
 * overwrite row nor a wrongly unchecked clean row can pass.
 */
import { join } from 'node:path'
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
  recordIo,
  scratchRoot,
  writeText
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
  readonly placed: readonly TemplatePlanEntry[]
  readonly missing: readonly TemplatePlanEntry[]
  readonly conflicts: readonly TemplatePlanEntry[]
}): TemplatePlanEntry[] {
  return [...plan.matched, ...plan.placed, ...plan.missing, ...plan.conflicts]
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

  it('defaults every source row to copy, never moves by default and ignores moves on hazards', async () => {
    const fixture = await buildTemplateGateFixture()
    const preview = await previewTemplate(platform, fixture)
    const rows = allRows(preview.plan)

    for (const row of rows) {
      if (row.outcome === 'matched') {
        expect(row.defaultAction, `template default-checked: ${row.relativePath} default action`).toBe(
          'copy'
        )
      } else {
        expect(
          row.defaultAction,
          `template default-checked: ${row.relativePath} has no source action`
        ).toBe(undefined)
      }
    }

    const defaults = rows.filter((row) => row.defaultChecked).map((row) => row.relativePath)
    const resolved = resolveTemplatePlan(preview.plan, { checkedPaths: defaults })
    expect(resolved.moveCount, 'template default-checked: no move by default').toBe(0)
    expect(
      resolved.executable.every((entry) => entry.action === 'copy'),
      'template default-checked: default executable rows copy'
    ).toBe(true)

    // A move selection on an unchecked hazard changes nothing.
    const hazards = resolveTemplatePlan(preview.plan, {
      checkedPaths: defaults,
      movePaths: [GATE_SLOTS.overwrite, GATE_SLOTS.mismatch, GATE_SLOTS.ambiguous]
    })
    expect(hazards.executable.every((entry) => entry.action === 'copy')).toBe(true)
    expect(hazards.actions[GATE_SLOTS.overwrite], 'template default-checked: hazard stays copy').toBe(
      'copy'
    )
    expect(
      hazards.actions[GATE_SLOTS.mismatch],
      'template default-checked: a conflict without a candidate has no action'
    ).toBe(undefined)
    expect(hazards.executable.map((entry) => entry.relativePath)).not.toContain(GATE_SLOTS.overwrite)
    expect(hazards.executable.map((entry) => entry.relativePath)).not.toContain(GATE_SLOTS.mismatch)
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

  it('rescans written slots as placed and leaves nothing to execute', async () => {
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
      expect(row?.outcome, `template default-checked: ${slot} rescanned placed`).toBe('placed')
      expect(row?.overwrite, `template default-checked: ${slot} not an overwrite`).toBe(false)
      expect(row?.defaultChecked, `template default-checked: ${slot} rescanned unchecked`).toBe(
        false
      )
    }
    expect(rescanned.plan.counts.placed, 'template default-checked: placed count').toBe(
      writtenSlots.length
    )

    const empty = resolveTemplatePlan(rescanned.plan, {})
    expect(empty.executableCount, 'template default-checked: empty selection no writes').toBe(0)
    expect(empty.rejectedCount, 'template default-checked: empty selection no rejections').toBe(0)

    // A placed row stays inert even when it is explicitly checked.
    const explicit = resolveTemplatePlan(rescanned.plan, { checkedPaths: writtenSlots })
    expect(explicit.executableCount, 'template default-checked: placed rows not executable').toBe(0)
    expect(explicit.rejectedCount, 'template default-checked: placed rows not rejected').toBe(0)
    expect(io.writes).toEqual([])
  })

  it('re-plans a fully applied six-slot fixture with nothing left to execute', async () => {
    const root = await scratchRoot()
    const templateRoot = join(root, '模板 A')
    const incomingRoot = join(root, '散乱 树 B')
    const outputRoot = join(root, '输出 根')
    const matchedSlots = ['a/one.txt', 'b/two.txt', 'c/three.txt'] as const
    const conflictSlots = ['双/x.txt', '双/y.txt', '双/z.txt'] as const

    for (const [index, slot] of matchedSlots.entries()) {
      const name = slot.slice(slot.lastIndexOf('/') + 1)
      await writeText(templateRoot, slot, `matched ${index}\n`)
      await writeText(incomingRoot, `bucket-${index}/${name}`, `matched ${index}\n`)
    }
    const choices: Record<string, string> = {}
    for (const [index, slot] of conflictSlots.entries()) {
      const name = slot.slice(slot.lastIndexOf('/') + 1)
      await writeText(templateRoot, slot, `template ${index}\n`)
      const one = join(incomingRoot, `p${index}`, name)
      await writeText(incomingRoot, `p${index}/${name}`, `candidate one ${index}\n`)
      await writeText(incomingRoot, `q${index}/${name}`, `candidate two ${index}\n`)
      choices[slot] = one
    }

    const first = await previewTemplate(platform, { templateRoot, incomingRoot, outputRoot })
    expect(first.plan.counts, 'template default-checked: first plan').toEqual({
      matched: 3,
      missing: 0,
      conflict: 3,
      placed: 0,
      unused: 6
    })
    const defaults = allRows(first.plan)
      .filter((row) => row.defaultChecked)
      .map((row) => row.relativePath)
    expect([...defaults].sort(), 'template default-checked: matched defaults').toEqual(
      [...matchedSlots].sort()
    )

    const resolved = resolveTemplatePlan(first.plan, {
      checkedPaths: [...defaults, ...conflictSlots],
      conflictChoices: choices
    })
    expect(resolved.executableCount, 'template default-checked: first executable').toBe(6)
    const applied = await applyTemplatePlan(platform, resolved)
    expect(applied.execution.writtenCount, 'template default-checked: first writes').toBe(6)

    const io = recordIo(platform)
    const second = await previewTemplate(io.port, { templateRoot, incomingRoot, outputRoot })
    expect(io.writes, 'template default-checked: replan writes nothing').toEqual([])
    expect(io.directories, 'template default-checked: replan creates nothing').toEqual([])
    expect(second.plan.counts, 'template default-checked: replan counts').toEqual({
      matched: 0,
      missing: 0,
      conflict: 0,
      placed: 6,
      unused: 6
    })
    expect(
      allRows(second.plan).filter((row) => row.defaultChecked),
      'template default-checked: replan has no defaults'
    ).toEqual([])

    const pending = resolveTemplatePlan(second.plan, {})
    expect(pending.executableCount, 'template default-checked: replan pending').toBe(0)
    expect(pending.rejectedCount, 'template default-checked: replan rejected').toBe(0)
    const explicit = resolveTemplatePlan(second.plan, {
      checkedPaths: [...matchedSlots, ...conflictSlots],
      conflictChoices: choices
    })
    expect(explicit.executableCount, 'template default-checked: replan explicit').toBe(0)
    expect(explicit.rejectedCount, 'template default-checked: replan explicit rejected').toBe(0)
  })
})
