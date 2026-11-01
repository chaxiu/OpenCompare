/**
 * Template placement gate: cancel writes nothing.
 *
 * Two cancels are proven on real directories: a preview + resolve the user then
 * abandons (no execute call at all), and an explicit pre-aborted `AbortSignal`
 * handed to `executeTemplatePlan`. Both must leave the full output tree — every
 * relative path, body SHA-256 and whole-second mtime — byte-identical, with no
 * `*.tmp` and no directory created. A missing output root must still be missing.
 */
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { OperationCancelledError } from '@core/io'
import { executeTemplatePlan, resolveTemplatePlan } from '@core/directory/template'
import type { TemplateExecuteIo, TemplatePlan } from '@core/directory/template'
import { previewTemplate } from '@renderer/workbench/directoryOps'
import {
  buildTemplateGateFixture,
  cleanupScratchRoots,
  GATE_SLOTS,
  installTemplatePlatform,
  platform,
  recordIo,
  scratchRoot,
  snapshotTree,
  tempFiles
} from './template-gate-support'
import type { PlatformPort } from '@shared/platform/types'

vi.mock('electron', async () => (await import('./template-gate-support')).electronMock)

beforeAll(async () => {
  await installTemplatePlatform()
})

afterAll(async () => {
  await cleanupScratchRoots()
})

function defaultsOf(plan: TemplatePlan): string[] {
  return [...plan.matched, ...plan.missing, ...plan.conflicts]
    .filter((row) => row.defaultChecked)
    .map((row) => row.relativePath)
}

function executeIo(port: PlatformPort): TemplateExecuteIo {
  return {
    readTextFile: (path) => port.readTextFile(path),
    writeTextFile: (path, content, modifiedMs) => port.writeTextFile(path, content, modifiedMs),
    ensureDirectory: (path) => port.ensureDirectory(path)
  }
}

describe('template cancel gate', () => {
  it('writes nothing when a previewed plan is abandoned before execution', async () => {
    const fixture = await buildTemplateGateFixture()
    const before = await snapshotTree(fixture.outputRoot)

    const io = recordIo(platform)
    const preview = await previewTemplate(io.port, fixture)
    const resolved = resolveTemplatePlan(preview.plan, {
      checkedPaths: [...defaultsOf(preview.plan), GATE_SLOTS.overwrite, GATE_SLOTS.mismatch],
      conflictChoices: { [GATE_SLOTS.mismatch]: fixture.mismatchChoice }
    })
    expect(resolved.executableCount, 'template cancel: plan is executable before cancel').toBeGreaterThan(
      0
    )

    expect(io.writes, 'template cancel: abandoned preview writes nothing').toEqual([])
    expect(io.directories, 'template cancel: abandoned preview creates nothing').toEqual([])
    const after = await snapshotTree(fixture.outputRoot)
    expect(after, 'template cancel: output tree unchanged').toEqual(before)
    expect(tempFiles(after), 'template cancel: no temporary files').toEqual([])
  })

  it('rejects a pre-aborted signal with zero writes and an unchanged tree', async () => {
    const fixture = await buildTemplateGateFixture()
    const preview = await previewTemplate(platform, fixture)
    const resolved = resolveTemplatePlan(preview.plan, {
      checkedPaths: [...defaultsOf(preview.plan), GATE_SLOTS.overwrite]
    })
    const before = await snapshotTree(fixture.outputRoot)

    const controller = new AbortController()
    controller.abort()
    const io = recordIo(platform)
    await expect(
      executeTemplatePlan(resolved, executeIo(io.port), { signal: controller.signal })
    ).rejects.toBeInstanceOf(OperationCancelledError)

    expect(io.writes, 'template cancel: pre-aborted writes nothing').toEqual([])
    expect(io.directories, 'template cancel: pre-aborted creates nothing').toEqual([])
    const after = await snapshotTree(fixture.outputRoot)
    expect(after, 'template cancel: pre-aborted tree unchanged').toEqual(before)
    expect(tempFiles(after), 'template cancel: pre-aborted no temporary files').toEqual([])
  })

  it('leaves a missing output root missing after a pre-aborted signal', async () => {
    const fixture = await buildTemplateGateFixture()
    const outputRoot = join(await scratchRoot(), '尚不存在 输出')
    const preview = await previewTemplate(platform, {
      templateRoot: fixture.templateRoot,
      incomingRoot: fixture.incomingRoot,
      outputRoot
    })
    const resolved = resolveTemplatePlan(preview.plan, {
      checkedPaths: [...defaultsOf(preview.plan), GATE_SLOTS.overwrite]
    })

    const controller = new AbortController()
    controller.abort()
    const io = recordIo(platform)
    await expect(
      executeTemplatePlan(resolved, executeIo(io.port), { signal: controller.signal })
    ).rejects.toBeInstanceOf(OperationCancelledError)

    expect(io.writes, 'template cancel: missing root no writes').toEqual([])
    expect(io.directories, 'template cancel: missing root no directories').toEqual([])
    expect(await platform.statPath(outputRoot), 'template cancel: missing root still missing').toBe(
      'missing'
    )
  })
})
