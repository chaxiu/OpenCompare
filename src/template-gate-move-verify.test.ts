/**
 * Template placement gate: real-disk move write → verify → delete semantics.
 *
 * Every case runs on `mkdtemp` directories through the production
 * `PlatformPort` handlers. The recording seam proves the source is deleted only
 * after the written target exists with the source's SHA-256 and whole-second
 * mtime, and that a failed check or refused deletion keeps the source, keeps the
 * target, and never rolls back rows that already succeeded.
 */
import { readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { OperationCancelledError } from '@core/io'
import { executeTemplatePlan, resolveTemplatePlan, verifyTemplateExtraction } from '@core/directory/template'
import type {
  TemplateExecuteIo,
  TemplateExecutableEntry,
  TemplatePlan,
  TemplateResolvedPlan,
  TemplateWriteFailureReason
} from '@core/directory/template'
import { applyTemplatePlan, previewTemplate } from '@renderer/workbench/directoryOps'
import type { PlatformPort } from '@shared/platform/types'
import {
  buildTemplateGateFixture,
  cleanupScratchRoots,
  fileSha256,
  GATE_SLOTS,
  installTemplatePlatform,
  listTreeFiles,
  platform,
  recordIo,
  snapshotTree,
  tempFiles
} from './template-gate-support'

vi.mock('electron', async () => (await import('./template-gate-support')).electronMock)

beforeAll(async () => {
  await installTemplatePlatform()
})

afterAll(async () => {
  await cleanupScratchRoots()
})

function defaultsOf(plan: TemplatePlan): string[] {
  return [...plan.matched, ...plan.missing, ...plan.conflicts]
    .filter((entry) => entry.defaultChecked)
    .map((entry) => entry.relativePath)
}

function mtimeSecOf(ms: number): number {
  return Math.floor(ms / 1000)
}

interface HookedIo {
  readonly io: TemplateExecuteIo
  readonly writes: string[]
  readonly deletes: string[]
  readonly order: string[]
  /** Target facts the delete call found missing or unequal — must stay empty. */
  readonly violations: string[]
}

interface HookOptions {
  readonly executable: readonly TemplateExecutableEntry[]
  /** Runs right after a target write landed, before the post-write check. */
  readonly afterWrite?: (path: string) => Promise<void>
  /** Returns an error to refuse a specific source deletion, if any. */
  readonly deleteErrorFor?: (sourcePath: string) => Error | undefined
}

/**
 * Real platform IO plus the recording seam. `deleteFile` re-reads the real
 * target before deleting, so a source removed before the three checks (or for a
 * target whose hash / mtime drifted) records a violation instead of passing.
 */
function hookedIo(port: PlatformPort, options: HookOptions): HookedIo {
  const writes: string[] = []
  const deletes: string[] = []
  const order: string[] = []
  const violations: string[] = []
  const expectedBySource = new Map(
    options.executable.map((entry) => [entry.sourcePath, entry] as const)
  )

  return {
    writes,
    deletes,
    order,
    violations,
    io: {
      readTextFile: (path) => port.readTextFile(path),
      ensureDirectory: (path) => port.ensureDirectory(path),
      listDirectory: (path) => port.listDirectory(path),
      writeTextFile: async (path, content, modifiedMs) => {
        writes.push(path)
        order.push(`write:${path}`)
        await port.writeTextFile(path, content, modifiedMs)
        if (options.afterWrite !== undefined) await options.afterWrite(path)
      },
      deleteFile: async (sourcePath) => {
        const expected = expectedBySource.get(sourcePath)
        if (expected === undefined) {
          violations.push(`delete outside the plan: ${sourcePath}`)
        } else {
          try {
            const [sha, info] = await Promise.all([
              fileSha256(expected.targetPath),
              stat(expected.targetPath)
            ])
            if (sha !== expected.sourceHash) {
              violations.push(`target hash unchecked before delete: ${expected.targetPath}`)
            }
            if (mtimeSecOf(info.mtimeMs) !== mtimeSecOf(expected.modifiedMs)) {
              violations.push(`target mtime unchecked before delete: ${expected.targetPath}`)
            }
          } catch {
            violations.push(`target missing before delete: ${expected.targetPath}`)
          }
        }
        deletes.push(sourcePath)
        order.push(`delete:${sourcePath}`)
        const refused = options.deleteErrorFor?.(sourcePath)
        if (refused !== undefined) throw refused
        await port.deleteFile(sourcePath)
      }
    }
  }
}

function moveSelection(plan: TemplatePlan, paths: readonly string[]): TemplateResolvedPlan {
  return resolveTemplatePlan(plan, { checkedPaths: paths, movePaths: paths })
}

async function fileFacts(path: string): Promise<{ hash: string; mtimeSec: number }> {
  return {
    hash: await fileSha256(path),
    mtimeSec: mtimeSecOf((await stat(path)).mtimeMs)
  }
}

describe('template move-verify gate', () => {
  it('deletes exactly the recorded source only after the written target proves equal', async () => {
    const fixture = await buildTemplateGateFixture()
    const preview = await previewTemplate(platform, fixture)
    const paths = defaultsOf(preview.plan)
    const resolved = moveSelection(preview.plan, paths)
    expect(resolved.moveCount, 'template move-verify: all selected rows move').toBe(paths.length)

    const sourceFacts = new Map<string, { hash: string; mtimeSec: number }>()
    for (const entry of resolved.executable) {
      sourceFacts.set(entry.sourcePath, await fileFacts(entry.sourcePath))
    }

    const hooked = hookedIo(platform, { executable: resolved.executable })
    const execution = await executeTemplatePlan(resolved, hooked.io)

    expect(execution.failedCount, 'template move-verify: no write failures').toBe(0)
    expect(execution.writtenCount, 'template move-verify: written count').toBe(resolved.executableCount)
    expect(execution.movedCount, 'template move-verify: moved count').toBe(resolved.executableCount)
    expect(execution.written.every((entry) => entry.action === 'move')).toBe(true)

    expect(hooked.violations, 'template move-verify: delete only after a passing check').toEqual([])
    expect([...hooked.deletes].sort(), 'template move-verify: deleted sources').toEqual(
      resolved.executable.map((entry) => entry.sourcePath).sort()
    )
    for (const entry of resolved.executable) {
      await expect(stat(entry.sourcePath), `template move-verify: ${entry.relativePath} source gone`).rejects.toThrow()
      const target = await fileFacts(entry.targetPath)
      expect(target.hash, `template move-verify: ${entry.relativePath} target sha256`).toBe(
        sourceFacts.get(entry.sourcePath)?.hash
      )
      expect(target.mtimeSec, `template move-verify: ${entry.relativePath} target mtimeSec`).toBe(
        sourceFacts.get(entry.sourcePath)?.mtimeSec
      )
      expect(hooked.order.indexOf(`delete:${entry.sourcePath}`)).toBeGreaterThan(
        hooked.order.indexOf(`write:${entry.targetPath}`)
      )
    }

    const verification = await verifyTemplateExtraction(execution.written, {
      readTextFile: (path) => platform.readTextFile(path),
      listDirectory: (path) => platform.listDirectory(path)
    })
    expect(verification.verified, 'template move-verify: result rows verified').toBe(
      execution.writtenCount
    )
    for (const entry of verification.entries) {
      expect(entry.action, 'template move-verify: result carries the action').toBe('move')
      expect(entry.sourceDeleted, 'template move-verify: result carries source state').toBe(true)
    }
  })

  it('keeps the source when the written target fails the hash / mtime / presence check', async () => {
    const cases: readonly {
      readonly name: string
      readonly tamper: (targetPath: string, modifiedMs: number) => Promise<void>
      readonly reason: TemplateWriteFailureReason
      readonly targetKept: boolean
    }[] = [
      {
        name: 'mtime',
        tamper: (targetPath, modifiedMs) =>
          utimes(targetPath, mtimeSecOf(modifiedMs) - 5, mtimeSecOf(modifiedMs) - 5),
        reason: 'move-target-mtime',
        targetKept: true
      },
      {
        name: 'hash',
        tamper: (targetPath) => writeFile(targetPath, 'tampered body\n', 'utf8'),
        reason: 'move-target-hash',
        targetKept: true
      },
      {
        name: 'missing',
        tamper: (targetPath) => rm(targetPath),
        reason: 'move-target-missing',
        targetKept: false
      }
    ]

    for (const testCase of cases) {
      const fixture = await buildTemplateGateFixture()
      const preview = await previewTemplate(platform, fixture)
      const resolved = moveSelection(preview.plan, [GATE_SLOTS.clean])
      expect(resolved.executableCount).toBe(1)
      const entry = resolved.executable[0]
      const before = await fileFacts(entry.sourcePath)

      const hooked = hookedIo(platform, {
        executable: resolved.executable,
        afterWrite: (path) => testCase.tamper(path, entry.modifiedMs)
      })
      const execution = await executeTemplatePlan(resolved, hooked.io)

      expect(execution.writtenCount, `template move-verify: ${testCase.name} writes no row`).toBe(0)
      expect(execution.failedCount, `template move-verify: ${testCase.name} one failure`).toBe(1)
      expect(execution.failed[0]?.reason, `template move-verify: ${testCase.name} reason`).toBe(
        testCase.reason
      )
      expect(hooked.deletes, `template move-verify: ${testCase.name} zero deletes`).toEqual([])

      const after = await fileFacts(entry.sourcePath)
      expect(after, `template move-verify: ${testCase.name} source unchanged`).toEqual(before)
      if (testCase.targetKept) {
        await expect(stat(entry.targetPath), `template move-verify: ${testCase.name} target kept`).resolves.toBeDefined()
      } else {
        await expect(stat(entry.targetPath), `template move-verify: ${testCase.name} target not recreated`).rejects.toThrow()
      }
    }
  })

  it('reports a refused source deletion and keeps every other moved row', async () => {
    const fixture = await buildTemplateGateFixture()
    const preview = await previewTemplate(platform, fixture)
    const paths = defaultsOf(preview.plan)
    const resolved = moveSelection(preview.plan, paths)
    expect(resolved.executableCount).toBeGreaterThanOrEqual(3)

    const ordered = [...resolved.executable]
    const refused = ordered[1]
    const before = await fileFacts(refused.sourcePath)
    const hooked = hookedIo(platform, {
      executable: resolved.executable,
      deleteErrorFor: (sourcePath) =>
        sourcePath === refused.sourcePath
          ? Object.assign(new Error('EACCES: source removal refused'), { code: 'EACCES' })
          : undefined
    })
    const execution = await executeTemplatePlan(resolved, hooked.io)

    expect(execution.writtenCount, 'template move-verify: other rows still written').toBe(
      resolved.executableCount - 1
    )
    expect(execution.failedCount, 'template move-verify: one delete failure').toBe(1)
    expect(execution.failed[0]).toMatchObject({
      relativePath: refused.relativePath,
      reason: 'move-delete-failed',
      code: 'EACCES'
    })
    expect(execution.failed[0]?.sourcePath).toBe(refused.sourcePath)
    expect(hooked.violations, 'template move-verify: refused delete still checked the target').toEqual([])

    // The refused row keeps its source and the target written for it.
    expect(await fileFacts(refused.sourcePath), 'template move-verify: refused source kept').toEqual(
      before
    )
    const refusedTarget = await fileFacts(refused.targetPath)
    expect(refusedTarget.hash).toBe(before.hash)
    expect(refusedTarget.mtimeSec).toBe(before.mtimeSec)

    // Rows before and after it are complete: target present, source gone.
    for (const entry of ordered) {
      if (entry.relativePath === refused.relativePath) continue
      await expect(stat(entry.sourcePath), `template move-verify: ${entry.relativePath} source removed`).rejects.toThrow()
      expect((await fileFacts(entry.targetPath)).hash, `template move-verify: ${entry.relativePath} keeps target`).toBe(
        entry.sourceHash
      )
    }
  })

  it('cancels before the first row with zero writes and zero deletions', async () => {
    const fixture = await buildTemplateGateFixture()
    const preview = await previewTemplate(platform, fixture)
    const defaults = defaultsOf(preview.plan)
    const resolved = moveSelection(preview.plan, defaults)
    const beforeOutput = await snapshotTree(fixture.outputRoot)
    const beforeIncoming = await snapshotTree(fixture.incomingRoot)

    const hooked = hookedIo(platform, { executable: resolved.executable })
    const controller = new AbortController()
    controller.abort()
    await expect(
      executeTemplatePlan(resolved, hooked.io, { signal: controller.signal })
    ).rejects.toBeInstanceOf(OperationCancelledError)

    expect(hooked.writes, 'template move-verify: cancel writes nothing').toEqual([])
    expect(hooked.deletes, 'template move-verify: cancel deletes nothing').toEqual([])
    expect(await snapshotTree(fixture.outputRoot), 'template move-verify: output untouched').toEqual(
      beforeOutput
    )
    expect(
      await snapshotTree(fixture.incomingRoot),
      'template move-verify: tree B untouched'
    ).toEqual(beforeIncoming)
    expect(tempFiles(beforeOutput), 'template move-verify: no temp files').toEqual([])
  })

  it('rescans the same roots after a move run with zero residue', async () => {
    const fixture = await buildTemplateGateFixture()
    const preview = await previewTemplate(platform, fixture)
    const paths = defaultsOf(preview.plan)
    const resolved = moveSelection(preview.plan, paths)
    const outcome = await applyTemplatePlan(platform, resolved)
    expect(outcome.execution.failedCount, 'template move-verify: apply has no failures').toBe(0)
    expect(outcome.execution.movedCount, 'template move-verify: apply moved every row').toBe(
      resolved.executableCount
    )

    const io = recordIo(platform)
    const rescanned = await previewTemplate(io.port, fixture)
    expect(io.writes, 'template move-verify: rescan writes nothing').toEqual([])
    expect(io.directories, 'template move-verify: rescan creates nothing').toEqual([])
    expect(io.deletes, 'template move-verify: rescan deletes nothing').toEqual([])

    const remaining = await listTreeFiles(fixture.incomingRoot)
    for (const entry of resolved.executable) {
      const sourceRelative = entry.sourcePath.slice(fixture.incomingRoot.length + 1).split('\\').join('/')
      expect(remaining, `template move-verify: ${sourceRelative} not left in B`).not.toContain(
        sourceRelative
      )
    }
    const outputFiles = await listTreeFiles(fixture.outputRoot)
    expect(outputFiles.filter((path) => path.endsWith('.tmp'))).toEqual([])
    expect(remaining.filter((path) => path.endsWith('.tmp'))).toEqual([])

    const bySlot = new Map(
      [...rescanned.plan.matched, ...rescanned.plan.placed, ...rescanned.plan.missing, ...rescanned.plan.conflicts].map(
        (entry) => [entry.relativePath, entry]
      )
    )
    for (const entry of resolved.executable) {
      const row = bySlot.get(entry.relativePath)
      expect(row?.outcome, `template move-verify: ${entry.relativePath} rescanned placed`).toBe('placed')
      expect(row?.defaultChecked, `template move-verify: ${entry.relativePath} unchecked after rescan`).toBe(
        false
      )
    }
    expect(
      resolveTemplatePlan(rescanned.plan, {}).executableCount,
      'template move-verify: default selection after rescan is empty'
    ).toBe(0)
  })

  it('keeps a failed move row detectable on the next scan', async () => {
    const fixture = await buildTemplateGateFixture()
    const preview = await previewTemplate(platform, fixture)
    const resolved = moveSelection(preview.plan, [GATE_SLOTS.clean])
    const entry = resolved.executable[0]
    const before = await fileFacts(entry.sourcePath)

    const hooked = hookedIo(platform, {
      executable: resolved.executable,
      afterWrite: (path) => utimes(path, mtimeSecOf(entry.modifiedMs) - 5, mtimeSecOf(entry.modifiedMs) - 5)
    })
    const execution = await executeTemplatePlan(resolved, hooked.io)
    expect(execution.failedCount).toBe(1)

    // The source is still there with its original bytes and time; the scan also
    // sees the already-written target as an existing item (placed), so nothing
    // is pending and the failed source stays recognizable in B.
    expect(await fileFacts(entry.sourcePath)).toEqual(before)
    const rescanned = await previewTemplate(platform, fixture)
    const row = [...rescanned.plan.matched, ...rescanned.plan.placed].find(
      (item) => item.relativePath === GATE_SLOTS.clean
    )
    expect(row?.outcome, 'template move-verify: failed source is still recognized').toBe('placed')
    expect(row?.sourceRelativePath, 'template move-verify: placed row keeps its source').toBe(
      entry.sourcePath.slice(fixture.incomingRoot.length + 1)
    )
    expect(await readFile(entry.sourcePath, 'utf8')).toContain('clean body')
    expect(
      resolveTemplatePlan(rescanned.plan, { checkedPaths: [GATE_SLOTS.clean] }).executableCount,
      'template move-verify: failed row is never executable again'
    ).toBe(0)
    expect(tempFiles(await snapshotTree(fixture.outputRoot)), 'template move-verify: no temp residue').toEqual(
      []
    )
  })
})
