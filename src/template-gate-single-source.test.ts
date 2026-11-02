/**
 * Template placement gate: counts and Apply read one resolved plan.
 *
 * Six explicit selections (empty / defaults / +overwrite / +resolved conflict /
 * checked-but-unresolved conflict / checked-but-occupied) are resolved once and
 * compared against the real writes: the executable / rejected partitions must
 * union to exactly the checked set, and the real `writeTextFile` targets must be
 * the executable targets and nothing else.
 */
import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { resolveTemplatePlan } from '@core/directory/template'
import type { TemplatePlan, TemplateResolvedPlan, TemplateSelection } from '@core/directory/template'
import { applyTemplatePlan, previewTemplate } from '@renderer/workbench/directoryOps'
import {
  buildTemplateGateFixture,
  cleanupScratchRoots,
  diskPath,
  GATE_SLOTS,
  installTemplatePlatform,
  platform,
  recordIo
} from './template-gate-support'
import type { TemplateGateFixture } from './template-gate-support'

vi.mock('electron', async () => (await import('./template-gate-support')).electronMock)

beforeAll(async () => {
  await installTemplatePlatform()
})

afterAll(async () => {
  await cleanupScratchRoots()
})

function defaultCheckedPaths(plan: TemplatePlan): string[] {
  return [...plan.matched, ...plan.missing, ...plan.conflicts]
    .filter((row) => row.defaultChecked)
    .map((row) => row.relativePath)
    .sort()
}

interface Case {
  readonly name: string
  readonly selection: (defaults: readonly string[], fixture: TemplateGateFixture) => TemplateSelection
}

const CASES: readonly Case[] = [
  { name: 'empty selection', selection: () => ({}) },
  {
    name: 'defaults only',
    selection: (defaults) => ({ checkedPaths: [...defaults] })
  },
  {
    name: 'defaults plus one overwrite row',
    selection: (defaults) => ({ checkedPaths: [...defaults, GATE_SLOTS.overwrite] })
  },
  {
    name: 'defaults plus one resolved conflict',
    selection: (defaults, fixture) => ({
      checkedPaths: [...defaults, GATE_SLOTS.mismatch],
      conflictChoices: { [GATE_SLOTS.mismatch]: fixture.mismatchChoice }
    })
  },
  {
    name: 'checked conflict without a candidate',
    selection: (defaults) => ({ checkedPaths: [...defaults, GATE_SLOTS.mismatch] })
  },
  {
    name: 'checked occupied row',
    selection: (defaults) => ({ checkedPaths: [...defaults, GATE_SLOTS.occupied] })
  }
]

function checkedPathsOf(selection: TemplateSelection): string[] {
  return [...(selection.checkedPaths ?? [])].sort()
}

function partitionPaths(resolved: TemplateResolvedPlan): string[] {
  return [
    ...resolved.executable.map((entry) => entry.relativePath),
    ...resolved.rejected.map((entry) => entry.relativePath)
  ].sort()
}

function sortedCopy(paths: readonly string[]): string[] {
  return [...paths].sort()
}

describe('template single-source gate', () => {
  it('counts equal lengths and both partitions union to the checked set', async () => {
    for (const testCase of CASES) {
      const fixture = await buildTemplateGateFixture()
      const preview = await previewTemplate(platform, fixture)
      const selection = testCase.selection(defaultCheckedPaths(preview.plan), fixture)
      const resolved = resolveTemplatePlan(preview.plan, selection)

      expect(
        resolved.executableCount,
        `template single-source: ${testCase.name} executableCount`
      ).toBe(resolved.executable.length)
      expect(
        resolved.rejectedCount,
        `template single-source: ${testCase.name} rejectedCount`
      ).toBe(resolved.rejected.length)
      expect(
        partitionPaths(resolved),
        `template single-source: ${testCase.name} partitions cover the checked set`
      ).toEqual(checkedPathsOf(selection))
      expect(
        resolved.copyCount + resolved.moveCount,
        `template single-source: ${testCase.name} actions cover the executable set`
      ).toBe(resolved.executableCount)
      for (const entry of resolved.executable) {
        expect(
          resolved.actions[entry.relativePath],
          `template single-source: ${testCase.name} ${entry.relativePath} action map`
        ).toBe(entry.action)
      }
    }
  })

  it('writes exactly the executable targets and nothing else', async () => {
    for (const testCase of CASES) {
      const fixture = await buildTemplateGateFixture()
      const preview = await previewTemplate(platform, fixture)
      const defaults = defaultCheckedPaths(preview.plan)
      const selection = testCase.selection(defaults, fixture)
      const resolved = resolveTemplatePlan(preview.plan, selection)

      const io = recordIo(platform)
      const outcome = await applyTemplatePlan(io.port, resolved)

      const executableTargets = sortedCopy(
        resolved.executable.map((entry) => entry.targetPath)
      )
      expect(
        sortedCopy(io.writes),
        `template single-source: ${testCase.name} write set`
      ).toEqual(executableTargets)
      expect(
        outcome.execution.writtenCount,
        `template single-source: ${testCase.name} writtenCount`
      ).toBe(resolved.executableCount)
      expect(
        outcome.verification.entries.length,
        `template single-source: ${testCase.name} verification rows`
      ).toBe(resolved.executableCount)
      expect(
        outcome.execution.failedCount,
        `template single-source: ${testCase.name} no failures`
      ).toBe(0)

      // Rows that never became executable have exactly zero writes.
      const executablePathSet = new Set(resolved.executable.map((entry) => entry.relativePath))
      for (const row of [...preview.plan.matched, ...preview.plan.conflicts]) {
        if (executablePathSet.has(row.relativePath)) continue
        expect(
          io.writes,
          `template single-source: ${testCase.name} unchecked ${row.relativePath}`
        ).not.toContain(row.targetPath)
        expect(
          io.directories,
          `template single-source: ${testCase.name} unchecked ${row.relativePath} target not made`
        ).not.toContain(row.targetPath)
      }

      // The directory-occupied target is never written or created under.
      const occupiedTarget = diskPath(fixture.outputRoot, GATE_SLOTS.occupied)
      const occupiedParent = diskPath(fixture.outputRoot, 'src/占位')
      expect(io.writes, `template single-source: ${testCase.name} occupied not written`).not.toContain(
        occupiedTarget
      )
      expect(
        io.directories,
        `template single-source: ${testCase.name} occupied parent not created`
      ).not.toContain(occupiedParent)
    }
  })

  it('rejects an unresolved conflict and reports the occupied refusal reason', async () => {
    const fixture = await buildTemplateGateFixture()
    const preview = await previewTemplate(platform, fixture)
    const defaults = defaultCheckedPaths(preview.plan)

    const unresolved = resolveTemplatePlan(preview.plan, {
      checkedPaths: [...defaults, GATE_SLOTS.mismatch]
    })
    expect(unresolved.rejected, 'template single-source: unresolved conflict reason').toContainEqual(
      { relativePath: GATE_SLOTS.mismatch, reason: 'conflict-unresolved' }
    )

    const occupied = resolveTemplatePlan(preview.plan, {
      checkedPaths: [...defaults, GATE_SLOTS.occupied]
    })
    expect(occupied.rejected, 'template single-source: occupied refusal reason').toContainEqual({
      relativePath: GATE_SLOTS.occupied,
      reason: 'target-occupied-by-directory'
    })

    const resolved = resolveTemplatePlan(preview.plan, {
      checkedPaths: [...defaults, GATE_SLOTS.mismatch],
      conflictChoices: { [GATE_SLOTS.mismatch]: fixture.mismatchChoice }
    })
    const chosen = resolved.executable.find((entry) => entry.relativePath === GATE_SLOTS.mismatch)
    expect(chosen?.sourcePath, 'template single-source: chosen candidate source').toBe(
      fixture.mismatchChoice
    )
    await expect(readFile(fixture.mismatchChoice, 'utf8')).resolves.toBe(
      'incoming mismatch body\n'
    )
  })

  it('writes and deletes exactly what the resolved actions say', async () => {
    const fixture = await buildTemplateGateFixture()
    const preview = await previewTemplate(platform, fixture)
    const defaults = defaultCheckedPaths(preview.plan)
    const moved = GATE_SLOTS.clean
    const resolved = resolveTemplatePlan(preview.plan, {
      checkedPaths: defaults,
      movePaths: [moved]
    })

    const movedEntry = resolved.executable.find((entry) => entry.relativePath === moved)
    expect(movedEntry?.action, 'template single-source: move action').toBe('move')
    expect(resolved.actions[moved], 'template single-source: move map').toBe('move')
    expect(resolved.moveCount).toBe(1)
    expect(resolved.copyCount).toBe(resolved.executableCount - 1)
    expect(
      resolved.executable.filter((entry) => entry.relativePath !== moved).every(
        (entry) => entry.action === 'copy'
      ),
      'template single-source: the rest copy'
    ).toBe(true)

    const io = recordIo(platform)
    const outcome = await applyTemplatePlan(io.port, resolved)
    expect(
      sortedCopy(io.writes),
      'template single-source: move write set equals the executable targets'
    ).toEqual(sortedCopy(resolved.executable.map((entry) => entry.targetPath)))
    expect(io.deletes, 'template single-source: only the moved source is deleted').toEqual([
      movedEntry?.sourcePath
    ])
    expect(outcome.execution.movedCount, 'template single-source: moved count').toBe(1)
    expect(outcome.execution.writtenCount).toBe(resolved.executableCount)
  })
})
