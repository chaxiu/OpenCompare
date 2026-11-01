import { describe, expect, it, vi } from 'vitest'
import type { PlatformPort } from '@shared/platform/types'
import { resolveTemplatePlan } from '@core/directory/template'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { applyTemplatePlan, previewTemplate } from './directoryOps'

/** Memory PlatformPort seeded with a real external tree; nothing else is faked. */
async function seededPort(
  files: Readonly<Record<string, string>>,
  mtimes: Readonly<Record<string, number>> = {}
): Promise<PlatformPort> {
  const base = createWebPlatformPort()
  for (const [path, text] of Object.entries(files)) {
    await base.writeTextFile(path, text, mtimes[path])
  }
  return base
}

/** Template A / scattered tree B pair of one matched slot plus one extra slot. */
const MATCHED_PAIR = {
  '/ext/a/src/a.ts': 'A',
  '/ext/a/src/b.ts': 'B',
  '/ext/b/x/a.ts': 'A',
  '/ext/b/y/b.ts': 'B'
} as const

async function refusalCode(roots: {
  readonly templateRoot: string
  readonly incomingRoot: string
  readonly outputRoot: string
}): Promise<string> {
  try {
    await previewTemplate(
      await seededPort(MATCHED_PAIR),
      roots
    )
  } catch (error) {
    return error instanceof Error && 'code' in error ? String(error.code) : 'not-a-template-error'
  }
  return 'accepted'
}

describe('template preview roots', () => {
  it('refuses a missing or non-directory tree B before listing anything', async () => {
    const base = await seededPort(MATCHED_PAIR)
    const listDirectory = vi.fn(base.listDirectory)
    const port: PlatformPort = { ...base, listDirectory }

    await expect(
      previewTemplate(port, {
        templateRoot: '/ext/a',
        incomingRoot: '/ext/gone',
        outputRoot: '/ext/out'
      })
    ).rejects.toMatchObject({ code: 'incoming-missing' })

    await expect(
      previewTemplate(port, {
        templateRoot: '/ext/a',
        incomingRoot: '/ext/a/src/a.ts',
        outputRoot: '/ext/out'
      })
    ).rejects.toMatchObject({ code: 'incoming-not-directory' })

    expect(listDirectory).not.toHaveBeenCalled()
  })

  it('refuses B equal to A and an output root equal to either other root', async () => {
    await expect(
      refusalCode({ templateRoot: '/ext/a', incomingRoot: '/ext/a/', outputRoot: '/ext/out' })
    ).resolves.toBe('incoming-equals-template')
    await expect(
      refusalCode({ templateRoot: '/ext/a', incomingRoot: '/ext/b', outputRoot: '/ext/a' })
    ).resolves.toBe('output-equals-template')
    await expect(
      refusalCode({ templateRoot: '/ext/a', incomingRoot: '/ext/b', outputRoot: '/ext/b/' })
    ).resolves.toBe('output-equals-incoming')
  })
})

describe('template dry-run plan', () => {
  it('derives overwrite and directory occupancy from the real output root', async () => {
    const port = await seededPort({
      ...MATCHED_PAIR,
      '/ext/out/src/a.ts': 'stale',
      '/ext/out/src/b.ts/keep.txt': 'occupied'
    })
    const writeTextFile = vi.fn(port.writeTextFile)
    const ensureDirectory = vi.fn(port.ensureDirectory)
    const preview = await previewTemplate(
      { ...port, writeTextFile, ensureDirectory },
      { templateRoot: '/ext/a', incomingRoot: '/ext/b', outputRoot: '/ext/out' }
    )

    expect(preview.outputRootExists).toBe(true)
    expect(preview.plan.counts).toEqual({ matched: 2, missing: 0, conflict: 0, unused: 0 })
    const bySlot = new Map(preview.plan.matched.map((entry) => [entry.relativePath, entry]))
    expect(bySlot.get('src/a.ts')).toMatchObject({
      overwrite: true,
      occupiedByDirectory: false,
      defaultChecked: false,
      targetPath: '/ext/out/src/a.ts'
    })
    expect(bySlot.get('src/b.ts')).toMatchObject({
      overwrite: false,
      occupiedByDirectory: true,
      defaultChecked: false
    })

    // A dry-run never creates a directory and never writes a file.
    expect(writeTextFile).not.toHaveBeenCalled()
    expect(ensureDirectory).not.toHaveBeenCalled()
  })

  it('previews a not-yet-existing output root without writing or marking overwrite', async () => {
    const port = await seededPort(MATCHED_PAIR)
    const writeTextFile = vi.fn(port.writeTextFile)
    const ensureDirectory = vi.fn(port.ensureDirectory)
    const preview = await previewTemplate(
      { ...port, writeTextFile, ensureDirectory },
      { templateRoot: '/ext/a', incomingRoot: '/ext/b', outputRoot: '/ext/new-out' }
    )

    expect(preview.outputRootExists).toBe(false)
    expect(preview.plan.counts.matched).toBe(2)
    for (const entry of preview.plan.matched) {
      expect(entry.overwrite).toBe(false)
      expect(entry.defaultChecked).toBe(true)
    }
    expect(writeTextFile).not.toHaveBeenCalled()
    expect(ensureDirectory).not.toHaveBeenCalled()
  })

  it('keeps every partition count equal to its rendered rows', async () => {
    const port = await seededPort({
      '/ext/a/src/a.ts': 'A',
      '/ext/a/src/missing.ts': 'M',
      '/ext/a/src/conflict.ts': 'slot body',
      '/ext/b/x/a.ts': 'A',
      '/ext/b/z/conflict.ts': 'different body',
      '/ext/b/extras/unused.ts': 'U'
    })
    const preview = await previewTemplate(
      port,
      { templateRoot: '/ext/a', incomingRoot: '/ext/b', outputRoot: '/ext/out' }
    )

    expect(preview.plan.counts).toEqual({ matched: 1, missing: 1, conflict: 1, unused: 2 })
    expect(preview.plan.counts.matched).toBe(preview.plan.matched.length)
    expect(preview.plan.counts.missing).toBe(preview.plan.missing.length)
    expect(preview.plan.counts.conflict).toBe(preview.plan.conflicts.length)
    expect(preview.plan.counts.unused).toBe(preview.plan.unused.length)
    expect(preview.plan.matched[0]).toMatchObject({
      relativePath: 'src/a.ts',
      sourcePath: '/ext/b/x/a.ts'
    })
    expect(preview.plan.missing[0].relativePath).toBe('src/missing.ts')
    expect(preview.plan.conflicts[0].candidates.map((candidate) => candidate.path)).toEqual([
      '/ext/b/z/conflict.ts'
    ])
    // The unplaced conflict candidate is unused too: no slot consumed it.
    expect(preview.plan.unused.map((item) => item.relativePath)).toEqual([
      'extras/unused.ts',
      'z/conflict.ts'
    ])
  })
})

describe('template apply', () => {
  it('writes only the checked executable rows with their source mtime', async () => {
    const mtime = 1_700_000_555_000
    const port = await seededPort(
      {
        '/ext/a/src/a.ts': 'A',
        '/ext/a/src/skip.ts': 'S',
        '/ext/b/x/a.ts': 'A',
        '/ext/b/y/skip.ts': 'S'
      },
      { '/ext/b/x/a.ts': mtime }
    )
    const preview = await previewTemplate(
      port,
      { templateRoot: '/ext/a', incomingRoot: '/ext/b', outputRoot: '/ext/out' }
    )
    const resolved = resolveTemplatePlan(preview.plan, { checkedPaths: ['src/a.ts'] })
    expect(resolved.executableCount).toBe(1)

    const writeTextFile = vi.fn(port.writeTextFile)
    const execution = await applyTemplatePlan({ ...port, writeTextFile }, resolved)

    expect(execution.writtenCount).toBe(1)
    expect(execution.failedCount).toBe(0)
    expect(writeTextFile).toHaveBeenCalledTimes(1)
    expect(writeTextFile).toHaveBeenCalledWith('/ext/out/src/a.ts', 'A', mtime)
    await expect(port.readTextFile('/ext/out/src/a.ts')).resolves.toBe('A')
    // The unchecked slot was never written.
    await expect(port.readTextFile('/ext/out/src/skip.ts')).rejects.toThrow()
  })
})
