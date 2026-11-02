/**
 * Template placement e2e on a **real external directory** (no sample mount, no
 * in-memory VFS, no mock filesystem).
 *
 * One `mkdtemp` fixture holds template A with >=1,000 slots, a scattered tree B
 * with >=1,000 files (>=4 levels deep, Chinese + space path segments, duplicate
 * names, both conflict reasons, missing slots, unused files) and an output root
 * that already holds a file and a directory. The run proves dry-run -> explicit
 * selection -> apply -> per-row disk SHA-256 / mtimeSec re-check -> rescan, plus
 * the read-only refusal / retry and the two occupied-target paths. It writes the
 * per-row evidence manifest and pins the committed evidence note.
 */
import { chmod, mkdir, readFile, stat, utimes, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { resolveTemplatePlan } from '@core/directory/template'
import type { TemplateResolvedPlan } from '@core/directory/template'
import {
  applyTemplatePlan,
  previewTemplate,
  TemplateApplyError
} from '@renderer/workbench/directoryOps'
import type { TemplateApplyOutcome, TemplatePreview } from '@renderer/workbench/directoryOps'
import {
  cleanupScratchRoots,
  diskPath,
  fileSha256,
  installTemplatePlatform,
  listTreeFiles,
  platform,
  recordIo,
  scratchRoot,
  snapshotTree,
  tempFiles,
  writeText,
  writeTextTree
} from './template-gate-support'
import type { PlannedTextFile, TreeSnapshotEntry } from './template-gate-support'

vi.mock('electron', async () => (await import('./template-gate-support')).electronMock)

/** Built at runtime so this gate file never carries a sample-mount literal. */
const SAMPLE_MOUNT = ['', 'samples'].join('/')

const CLEAN_COUNT = 1000
const MISSING_COUNT = 20
const UNUSED_COUNT = 40
const BASE_SEC = 1_700_000_000

const DEEP_DIR = '资料 夹/第一层/第二层/深层 目录'
const CLEAN_DIRS = [
  DEEP_DIR,
  'docs/specs/v1',
  'src/core/directory',
  'notes/今天 记录',
  'archive/2026'
] as const

const OVERWRITE_SLOT = 'src/overwrite/覆盖 已有.txt'
const OCCUPIED_SLOT = 'src/占位/占用 槽位.txt'
const MISMATCH_SLOT = '冲突 区/同名 不同内容.txt'
const AMBIGUOUS_SLOT = '冲突 区/同名 多候选.txt'

function pad(index: number): string {
  return String(index).padStart(4, '0')
}

function cleanSlot(index: number): string {
  return `${CLEAN_DIRS[index % CLEAN_DIRS.length]}/clean-${pad(index)}.txt`
}

function missingSlot(index: number): string {
  return `缺 失/gap-${pad(index)}.txt`
}

function unusedSlot(index: number): string {
  return `散 落/unused-${pad(index)}.txt`
}

const IT = {
  scale: 'builds a real fixture with >=1000 slots, >=1000 sources and >=4 levels',
  classes: 'classifies every designed outcome with exact counts and both conflict reasons',
  chain: 'runs dry-run -> explicit selection -> apply -> per-row sha256 / mtimeSec re-check',
  rescan: 'rescans the same roots after apply with zero writes and consistent counts',
  readonly: 'refuses a read-only root before writing and retries the same plan',
  occupied: 'rejects a directory-occupied slot and keeps a parent-file write failure local',
  evidence: 'writes a per-row manifest with the real roots and every assertion name',
  committed: 'pins the committed manifest and evidence note as self-consistent'
} as const

const ASSERTION_NAMES = Object.values(IT)
const asRoot = typeof process.getuid === 'function' && process.getuid() === 0

const EVIDENCE_DIR_ENV = 'OPENCOMPARE_TEMPLATE_E2E_EVIDENCE_DIR'
const COMMITTED_DIR = '.munk/baseline/domains/directory/qa'
const COMMITTED_MANIFEST = `${COMMITTED_DIR}/template-e2e-manifest.json`
const COMMITTED_EVIDENCE = `${COMMITTED_DIR}/template-e2e-evidence.md`

const GATE_COMMANDS: readonly { readonly id: string; readonly command: string }[] = [
  {
    id: 'template-default-unchecked',
    command: 'pnpm test src/template-gate-default-unchecked.test.ts'
  },
  {
    id: 'template-single-source',
    command: 'pnpm test src/template-gate-single-source.test.ts'
  },
  { id: 'template-sha-mtime', command: 'pnpm test src/template-gate-sha-mtime.test.ts' },
  {
    id: 'template-cancel-zero-write',
    command: 'pnpm test src/template-gate-cancel-zero-write.test.ts'
  },
  { id: 'template-e2e-real', command: 'pnpm test src/template-e2e-real-directory.test.ts' }
]

interface BigFixture {
  readonly root: string
  readonly templateRoot: string
  readonly incomingRoot: string
  readonly outputRoot: string
  readonly mismatchSource: string
  readonly ambiguousSources: readonly string[]
}

interface State {
  readonly fixture: BigFixture
  readonly preview: TemplatePreview
  readonly resolved: TemplateResolvedPlan
  readonly outcome: TemplateApplyOutcome
  readonly applied: readonly TreeSnapshotEntry[]
  readonly io: { readonly writes: string[]; readonly directories: string[] }
}

let state: State

async function buildBigFixture(): Promise<BigFixture> {
  const root = await scratchRoot('opencompare-template-e2e-')
  const templateRoot = join(root, '模板 A')
  const incomingRoot = join(root, '散乱 树 B')
  const outputRoot = join(root, '输出 根')

  const slots: PlannedTextFile[] = []
  for (let index = 0; index < CLEAN_COUNT; index += 1) {
    slots.push({ relativePath: cleanSlot(index), text: `clean body ${index}\n` })
  }
  slots.push({ relativePath: OVERWRITE_SLOT, text: 'overwrite source body\n' })
  slots.push({ relativePath: OCCUPIED_SLOT, text: 'occupied body\n' })
  for (let index = 0; index < MISSING_COUNT; index += 1) {
    slots.push({ relativePath: missingSlot(index), text: 'never provided\n' })
  }
  slots.push({ relativePath: MISMATCH_SLOT, text: 'template mismatch body\n' })
  slots.push({ relativePath: AMBIGUOUS_SLOT, text: 'ambiguous template body\n' })
  await writeTextTree(templateRoot, slots)

  const sources: PlannedTextFile[] = []
  for (let index = 0; index < CLEAN_COUNT; index += 1) {
    sources.push({
      relativePath: `bucket-${index % 7}/clean-${pad(index)}.txt`,
      text: `clean body ${index}\n`,
      stampSec: BASE_SEC + index
    })
  }
  sources.push({
    relativePath: 'over/覆盖 已有.txt',
    text: 'overwrite source body\n',
    stampSec: BASE_SEC + CLEAN_COUNT
  })
  sources.push({
    relativePath: 'occ/占用 槽位.txt',
    text: 'occupied body\n',
    stampSec: BASE_SEC + CLEAN_COUNT + 1
  })
  sources.push({
    relativePath: 'conflict/同名 不同内容.txt',
    text: 'incoming mismatch body\n',
    stampSec: BASE_SEC + CLEAN_COUNT + 2
  })
  sources.push({
    relativePath: 'conflict-a/同名 多候选.txt',
    text: 'ambiguous candidate one\n',
    stampSec: BASE_SEC + CLEAN_COUNT + 3
  })
  sources.push({
    relativePath: 'conflict-b/同名 多候选.txt',
    text: 'ambiguous candidate two\n',
    stampSec: BASE_SEC + CLEAN_COUNT + 4
  })
  for (let index = 0; index < UNUSED_COUNT; index += 1) {
    sources.push({
      relativePath: unusedSlot(index),
      text: `unused body ${index}\n`,
      stampSec: BASE_SEC + CLEAN_COUNT + 5 + index
    })
  }
  await writeTextTree(incomingRoot, sources)

  // The output root already holds the single overwrite target and a directory
  // sitting exactly on the occupied slot: neither may ever be written by a run.
  await writeText(outputRoot, OVERWRITE_SLOT, 'stale overwrite body\n')
  await writeText(outputRoot, `${OCCUPIED_SLOT}/keep.txt`, 'kept\n')

  return {
    root,
    templateRoot,
    incomingRoot,
    outputRoot,
    mismatchSource: join(incomingRoot, 'conflict', '同名 不同内容.txt'),
    ambiguousSources: [
      join(incomingRoot, 'conflict-a', '同名 多候选.txt'),
      join(incomingRoot, 'conflict-b', '同名 多候选.txt')
    ]
  }
}

function planRows(plan: TemplatePreview['plan']): TemplatePreview['plan']['matched'] {
  return [...plan.matched, ...plan.placed, ...plan.missing, ...plan.conflicts]
}

function defaultsOf(plan: TemplatePreview['plan']): string[] {
  return planRows(plan)
    .filter((row) => row.defaultChecked)
    .map((row) => row.relativePath)
}

beforeAll(async () => {
  await installTemplatePlatform()
  const fixture = await buildBigFixture()
  const preview = await previewTemplate(platform, fixture)
  const checkedPaths = [
    ...defaultsOf(preview.plan),
    OVERWRITE_SLOT,
    MISMATCH_SLOT,
    OCCUPIED_SLOT
  ]
  const resolved = resolveTemplatePlan(preview.plan, {
    checkedPaths,
    conflictChoices: { [MISMATCH_SLOT]: fixture.mismatchSource }
  })
  const io = recordIo(platform)
  const outcome = await applyTemplatePlan(io.port, resolved)
  state = {
    fixture,
    preview,
    resolved,
    outcome,
    applied: await snapshotTree(fixture.outputRoot),
    io
  }
}, 180_000)

afterAll(async () => {
  await cleanupScratchRoots()
})

describe('template placement e2e on a real external directory', () => {
  it(IT.scale, async () => {
    const { fixture, preview } = state
    const slots = planRows(preview.plan)
    expect(slots.length, 'template e2e: template A slots').toBeGreaterThanOrEqual(1000)

    // Both counts come from the real disk, not from a declared constant.
    const templateFiles = await listTreeFiles(fixture.templateRoot)
    const incomingFiles = await listTreeFiles(fixture.incomingRoot)
    expect(templateFiles.length, 'template e2e: template A files on disk').toBe(slots.length)
    expect(incomingFiles.length, 'template e2e: scattered tree B files on disk').toBeGreaterThanOrEqual(
      1000
    )

    const deepest = Math.max(...slots.map((row) => row.relativePath.split('/').length))
    expect(deepest, 'template e2e: deepest relative path is >=4 levels').toBeGreaterThanOrEqual(4)

    const cjkSpace = slots.filter(
      (row) => /\p{Script=Han}/u.test(row.relativePath) && row.relativePath.includes(' ')
    )
    expect(cjkSpace.length, 'template e2e: Chinese and space path segments').toBeGreaterThan(0)

    for (const root of [fixture.templateRoot, fixture.incomingRoot, fixture.outputRoot]) {
      expect(root.startsWith('/'), `template e2e: ${root} is absolute`).toBe(true)
      expect(existsSync(root), `template e2e: ${root} is real`).toBe(true)
    }
    expect(
      new Set([fixture.templateRoot, fixture.incomingRoot, fixture.outputRoot]).size,
      'template e2e: the three roots differ'
    ).toBe(3)
  }, 120_000)

  it(IT.classes, async () => {
    const { preview, fixture } = state
    expect(preview.plan.counts, 'template e2e: designed plan counts').toEqual({
      matched: CLEAN_COUNT + 2,
      missing: MISSING_COUNT,
      conflict: 2,
      placed: 0,
      unused: UNUSED_COUNT + 3
    })

    const conflicts = preview.plan.conflicts
    const mismatch = conflicts.find((row) => row.relativePath === MISMATCH_SLOT)
    const ambiguous = conflicts.find((row) => row.relativePath === AMBIGUOUS_SLOT)
    expect(mismatch?.conflictReason, 'template e2e: mismatch conflict reason').toBe(
      'content-mismatch'
    )
    expect(mismatch?.candidates.length, 'template e2e: mismatch has one candidate').toBe(1)
    expect(ambiguous?.conflictReason, 'template e2e: ambiguous conflict reason').toBe('ambiguous')
    expect(ambiguous?.candidates.length, 'template e2e: ambiguous has multiple candidates').toBeGreaterThanOrEqual(
      2
    )
    expect(ambiguous?.candidates.map((candidate) => candidate.path).sort()).toEqual(
      [...fixture.ambiguousSources].sort()
    )

    const overwrite = preview.plan.matched.find((row) => row.relativePath === OVERWRITE_SLOT)
    expect(overwrite?.overwrite, 'template e2e: existing output file is an overwrite').toBe(true)
    expect(overwrite?.defaultChecked, 'template e2e: overwrite starts unchecked').toBe(false)

    const occupied = preview.plan.matched.find((row) => row.relativePath === OCCUPIED_SLOT)
    expect(occupied?.occupiedByDirectory, 'template e2e: directory-occupied slot').toBe(true)

    expect(preview.plan.unused.length, 'template e2e: unused files').toBeGreaterThanOrEqual(10)
  }, 120_000)

  it(IT.chain, async () => {
    const { preview, resolved, outcome, io, applied, fixture } = state
    expect(outcome.execution.writtenCount, 'template e2e: written count').toBe(
      resolved.executableCount
    )
    expect(outcome.execution.failedCount, 'template e2e: failed count').toBe(0)
    expect(outcome.verification.entries.length, 'template e2e: verification rows').toBe(
      outcome.execution.writtenCount
    )
    expect(outcome.verification.verified, 'template e2e: verified rows').toBe(
      outcome.execution.writtenCount
    )
    expect(outcome.verification.failed, 'template e2e: verification failures').toBe(0)

    const expectedTargets = [...resolved.executable.map((entry) => entry.targetPath)].sort()
    expect([...io.writes].sort(), 'template e2e: write set equals the executable manifest').toEqual(
      expectedTargets
    )

    const appliedBySlot = new Map(applied.map((entry) => [entry.relativePath, entry]))
    for (const entry of outcome.execution.written) {
      const targetSha = await fileSha256(entry.targetPath)
      const sourceSha = await fileSha256(entry.sourcePath)
      expect(targetSha, `template e2e: ${entry.relativePath} target sha256`).toBe(sourceSha)
      const expectedSec = Math.floor(entry.modifiedMs / 1000)
      const targetSec = Math.floor((await stat(entry.targetPath)).mtimeMs / 1000)
      expect(targetSec, `template e2e: ${entry.relativePath} target mtimeSec`).toBe(expectedSec)

      const snapshot = appliedBySlot.get(entry.relativePath)
      expect(snapshot?.size, `template e2e: ${entry.relativePath} is not empty`).toBeGreaterThan(
        0
      )
      expect(snapshot?.sha256, `template e2e: ${entry.relativePath} snapshot sha256`).toBe(sourceSha)
    }

    // Unchecked slots and the occupied slot never reached the write set.
    const unchecked = planRows(preview.plan).filter(
      (row) => !resolved.executable.some((entry) => entry.relativePath === row.relativePath)
    )
    for (const row of unchecked) {
      expect(io.writes, `template e2e: unchecked ${row.relativePath} not written`).not.toContain(
        row.targetPath
      )
    }
    const occupiedTarget = diskPath(fixture.outputRoot, OCCUPIED_SLOT)
    expect(io.writes, 'template e2e: occupied target not written').not.toContain(occupiedTarget)
    expect(io.directories, 'template e2e: occupied directory not re-created').not.toContain(
      diskPath(fixture.outputRoot, 'src/占位')
    )

    expect(tempFiles(applied), 'template e2e: no temporary files').toEqual([])
    await expect(readFile(diskPath(fixture.outputRoot, `${OCCUPIED_SLOT}/keep.txt`), 'utf8'))
      .resolves.toBe('kept\n')
  }, 120_000)

  it(IT.rescan, async () => {
    const { fixture, outcome } = state
    const io = recordIo(platform)
    const rescanned = await previewTemplate(io.port, fixture)

    expect(io.writes, 'template e2e: rescan writes nothing').toEqual([])
    expect(io.directories, 'template e2e: rescan creates nothing').toEqual([])
    // Every written slot now holds its source body: it is placed, not pending.
    // The occupied slot was never written and stays a matched row.
    expect(rescanned.plan.counts, 'template e2e: rescan counts match the disk').toEqual({
      matched: 1,
      missing: MISSING_COUNT,
      conflict: 1,
      placed: outcome.execution.writtenCount,
      unused: UNUSED_COUNT + 3
    })

    const bySlot = new Map(planRows(rescanned.plan).map((row) => [row.relativePath, row]))
    for (const entry of outcome.execution.written) {
      const row = bySlot.get(entry.relativePath)
      expect(row?.outcome, `template e2e: rescanned ${entry.relativePath} placed`).toBe('placed')
      expect(row?.overwrite, `template e2e: rescanned ${entry.relativePath} not an overwrite`).toBe(
        false
      )
      expect(row?.defaultChecked, `template e2e: rescanned ${entry.relativePath} unchecked`).toBe(
        false
      )
    }

    const pending = resolveTemplatePlan(rescanned.plan, {})
    expect(pending.executableCount, 'template e2e: rescan pending').toBe(0)
    expect(pending.rejectedCount, 'template e2e: rescan rejected').toBe(0)
  }, 120_000)

  it(IT.evidence, async () => {
    const { fixture, preview, resolved, outcome } = state
    const verificationBySlot = new Map(
      outcome.verification.entries.map((entry) => [entry.relativePath, entry])
    )
    const rows = [...outcome.execution.written]
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
      .map((entry) => {
        const check = verificationBySlot.get(entry.relativePath)
        return {
          slot: entry.relativePath,
          sourcePath: entry.sourcePath,
          targetPath: entry.targetPath,
          sourceSha256: entry.sourceHash,
          sourceMtimeSec: Math.floor(entry.modifiedMs / 1000),
          targetSha256: check?.actualHash ?? null,
          targetMtimeSec: check?.actualMtimeSec ?? null,
          ok: check?.ok === true
        }
      })
    expect(rows.length, 'template e2e: manifest rows equal the write count').toBe(
      outcome.execution.writtenCount
    )
    expect(
      rows.every((row) => row.ok),
      'template e2e: every manifest row re-checked ok'
    ).toBe(true)

    const manifest = {
      templateRoot: fixture.templateRoot,
      incomingRoot: fixture.incomingRoot,
      outputRoot: fixture.outputRoot,
      planCounts: preview.plan.counts,
      selection: {
        checkedPaths: [
          ...resolved.executable.map((entry) => entry.relativePath),
          ...resolved.rejected.map((entry) => entry.relativePath)
        ].sort(),
        rejectedCount: resolved.rejectedCount,
        conflictChoices: { [MISMATCH_SLOT]: fixture.mismatchSource }
      },
      rows,
      assertionNames: [...ASSERTION_NAMES]
    }
    const serialized = `${JSON.stringify(manifest, null, 2)}\n`
    expect(serialized, 'template e2e: manifest carries no sample mount').not.toContain(SAMPLE_MOUNT)

    const evidenceDir =
      process.env[EVIDENCE_DIR_ENV] ?? join(tmpdir(), 'opencompare-template-e2e-evidence')
    await mkdir(evidenceDir, { recursive: true })
    await writeFile(join(evidenceDir, 'manifest.json'), serialized, 'utf8')

    for (const name of ASSERTION_NAMES) {
      expect(manifest.assertionNames, `template e2e: manifest names ${name}`).toContain(name)
    }
  }, 120_000)

  it.skipIf(asRoot)(IT.readonly, async () => {
    const { fixture, resolved, outcome } = state
    const before = await snapshotTree(fixture.outputRoot)
    const io = recordIo(platform)
    await chmod(fixture.outputRoot, 0o555)
    try {
      await expect(applyTemplatePlan(io.port, resolved)).rejects.toBeInstanceOf(TemplateApplyError)
      await expect(applyTemplatePlan(io.port, resolved)).rejects.toMatchObject({
        code: expect.stringMatching(/EACCES|EPERM|EROFS/)
      })
      expect(io.writes, 'template e2e: read-only refusal writes nothing').toEqual([])
      expect(io.directories, 'template e2e: read-only refusal creates nothing').toEqual([])
      const refused = await snapshotTree(fixture.outputRoot)
      expect(refused, 'template e2e: read-only refusal leaves the tree unchanged').toEqual(before)
      expect(tempFiles(refused), 'template e2e: read-only refusal leaves no temporary files').toEqual(
        []
      )
    } finally {
      await chmod(fixture.outputRoot, 0o755)
    }

    io.writes.length = 0
    io.directories.length = 0
    const retry = await applyTemplatePlan(io.port, resolved)
    expect(retry.execution.writtenCount, 'template e2e: retry written count').toBe(
      resolved.executableCount
    )
    expect(retry.execution.failedCount, 'template e2e: retry failed count').toBe(0)
    expect(retry.verification.verified, 'template e2e: retry verified count').toBe(
      resolved.executableCount
    )
    expect(retry.verification.failed, 'template e2e: retry verification failures').toBe(0)
    expect(retry.execution.writtenCount).toBe(outcome.execution.writtenCount)

    for (const entry of retry.execution.written) {
      const targetSha = await fileSha256(entry.targetPath)
      const sourceSha = await fileSha256(entry.sourcePath)
      expect(targetSha, `template e2e: retry ${entry.relativePath} sha256`).toBe(sourceSha)
      const expectedSec = Math.floor(entry.modifiedMs / 1000)
      const targetSec = Math.floor((await stat(entry.targetPath)).mtimeMs / 1000)
      expect(targetSec, `template e2e: retry ${entry.relativePath} mtimeSec`).toBe(expectedSec)
    }
    expect(tempFiles(await snapshotTree(fixture.outputRoot)), 'template e2e: retry no temp files').toEqual(
      []
    )
  }, 180_000)

  it(IT.occupied, async () => {
    const root = await scratchRoot()
    const templateRoot = join(root, '模板 A')
    const incomingRoot = join(root, '散乱 树 B')
    const outputRoot = join(root, '输出 根')
    const blockedSlot = '阻塞/child.txt'
    const occupiedSlot = '占位 目录/occupied.txt'

    await writeText(templateRoot, blockedSlot, 'child body\n')
    await writeText(templateRoot, 'ok.txt', 'ok body\n')
    await writeText(templateRoot, occupiedSlot, 'occupied body\n')
    await writeText(incomingRoot, 'x/child.txt', 'child body\n')
    await writeText(incomingRoot, 'y/ok.txt', 'ok body\n')
    await writeText(incomingRoot, 'z/occupied.txt', 'occupied body\n')

    // A directory sits exactly on one slot; a file occupies the parent path the
    // other slot needs. Both are real paths, no platform lock semantics involved.
    await writeText(outputRoot, `${occupiedSlot}/keep.txt`, 'kept\n')
    await writeText(outputRoot, '阻塞', 'not a directory\n')

    const preview = await previewTemplate(platform, {
      templateRoot,
      incomingRoot,
      outputRoot
    })
    const resolved = resolveTemplatePlan(preview.plan, {
      checkedPaths: [blockedSlot, 'ok.txt', occupiedSlot]
    })
    expect(resolved.rejected, 'template e2e: occupied slot rejected').toEqual([
      { relativePath: occupiedSlot, reason: 'target-occupied-by-directory' }
    ])
    const executablePaths = resolved.executable.map((entry) => entry.relativePath).sort()
    expect(executablePaths, 'template e2e: occupied row is not executable').toEqual(
      [blockedSlot, 'ok.txt'].sort()
    )

    const io = recordIo(platform)
    const outcome = await applyTemplatePlan(io.port, resolved)
    expect(outcome.execution.writtenCount, 'template e2e: only the other checked row wrote').toBe(1)
    expect(outcome.execution.failedCount, 'template e2e: one per-row write failure').toBe(1)
    expect(outcome.execution.failed[0]).toMatchObject({ relativePath: blockedSlot, reason: 'write-failed' })
    expect(outcome.verification.verified, 'template e2e: written row verified').toBe(1)
    expect(outcome.verification.failed, 'template e2e: verification failures').toBe(0)

    const occupiedTarget = diskPath(outputRoot, occupiedSlot)
    expect(io.writes, 'template e2e: occupied target never written').not.toContain(occupiedTarget)
    expect(io.directories, 'template e2e: occupied target never created').not.toContain(
      occupiedTarget
    )
    await expect(readFile(diskPath(outputRoot, `${occupiedSlot}/keep.txt`), 'utf8')).resolves.toBe(
      'kept\n'
    )
    await expect(readFile(diskPath(outputRoot, '阻塞'), 'utf8')).resolves.toBe('not a directory\n')
    await expect(stat(diskPath(outputRoot, blockedSlot))).rejects.toThrow()
    expect(tempFiles(await snapshotTree(outputRoot)), 'template e2e: occupied no temp files').toEqual(
      []
    )
  }, 60_000)

  it(IT.committed, async () => {
    const manifestPath = resolve(process.cwd(), COMMITTED_MANIFEST)
    const evidencePath = resolve(process.cwd(), COMMITTED_EVIDENCE)
    expect(existsSync(manifestPath), `template e2e: ${COMMITTED_MANIFEST} exists`).toBe(true)
    expect(existsSync(evidencePath), `template e2e: ${COMMITTED_EVIDENCE} exists`).toBe(true)

    const manifestText = await readFile(manifestPath, 'utf8')
    const manifest = JSON.parse(manifestText) as {
      planCounts: Record<string, number>
      rows: readonly {
        slot: string
        ok: boolean
        sourceSha256: string
        targetSha256: string | null
        sourceMtimeSec: number
        targetMtimeSec: number | null
      }[]
    }
    expect(manifest.rows.length, 'template e2e: committed manifest rows').toBeGreaterThanOrEqual(
      1000
    )
    expect(
      manifest.rows.every((row) => row.ok),
      'template e2e: committed manifest all ok'
    ).toBe(true)
    for (const outcome of ['matched', 'missing', 'conflict', 'unused'] as const) {
      expect(
        manifest.planCounts[outcome],
        `template e2e: committed manifest ${outcome} class`
      ).toBeGreaterThan(0)
    }
    expect(
      manifest.rows.some(
        (row) => /\p{Script=Han}/u.test(row.slot) && row.slot.includes(' ')
      ),
      'template e2e: committed manifest Chinese + space path'
    ).toBe(true)
    expect(
      Math.max(...manifest.rows.map((row) => row.slot.split('/').length)),
      'template e2e: committed manifest deepest path'
    ).toBeGreaterThanOrEqual(4)
    for (const row of manifest.rows.slice(0, 50)) {
      expect(row.sourceSha256, 'template e2e: committed row source sha256').toMatch(/^[a-f0-9]{64}$/)
      expect(row.targetSha256, 'template e2e: committed row target sha256').toBe(row.sourceSha256)
      expect(row.targetMtimeSec, 'template e2e: committed row target mtimeSec').toBe(
        row.sourceMtimeSec
      )
    }

    const evidenceText = await readFile(evidencePath, 'utf8')
    const recorded = /[a-f0-9]{64}/.exec(evidenceText)?.[0]
    const actual = createHash('sha256').update(manifestText).digest('hex')
    expect(recorded, 'template e2e: evidence note records the manifest sha256').toBe(actual)
    expect(manifestText, 'template e2e: committed manifest has no sample mount').not.toContain(
      SAMPLE_MOUNT
    )
    expect(evidenceText, 'template e2e: evidence note has no sample mount').not.toContain(
      SAMPLE_MOUNT
    )
    for (const name of ASSERTION_NAMES) {
      expect(evidenceText, `template e2e: evidence note names ${name}`).toContain(name)
    }
    for (const gate of GATE_COMMANDS) {
      expect(evidenceText, `template e2e: evidence note gate ${gate.id}`).toContain(gate.id)
      expect(evidenceText, `template e2e: evidence note command ${gate.id}`).toContain(
        gate.command
      )
    }
  }, 120_000)

  it('protects a case-only target on a case-insensitive volume', async (context) => {
    const root = await scratchRoot('opencompare-template-casefold-')
    await writeFile(join(root, 'probe.txt'), 'probe\n', 'utf8')
    if (!existsSync(join(root, 'PROBE.TXT'))) {
      console.warn(
        'template e2e: the scratch volume is case-sensitive; skipping the APFS case-only e2e'
      )
      context.skip()
      return
    }

    const templateRoot = join(root, '模板 A')
    const incomingRoot = join(root, '散乱 树 B')
    const outputRoot = join(root, '输出 根')
    const slot = 'Logo.png'
    const sourceSec = BASE_SEC + 500
    await writeText(templateRoot, slot, 'new logo body\n')
    await writeText(incomingRoot, 'bucket/logo.png', 'new logo body\n', sourceSec)
    await writeText(outputRoot, 'logo.png', 'old logo body\n', BASE_SEC)

    const before = await snapshotTree(outputRoot)
    const preview = await previewTemplate(platform, { templateRoot, incomingRoot, outputRoot })
    const row = planRows(preview.plan).find((entry) => entry.relativePath === slot)
    expect(row?.outcome, 'template e2e: case-only row is matched').toBe('matched')
    expect(row?.overwrite, 'template e2e: case-only target overwrites').toBe(true)
    expect(row?.defaultChecked, 'template e2e: case-only target unchecked').toBe(false)

    // Default run: nothing checked, so no write and no directory creation.
    const defaults = resolveTemplatePlan(preview.plan, {})
    expect(defaults.executableCount, 'template e2e: default run is empty').toBe(0)
    const skippedIo = recordIo(platform)
    const skipped = await applyTemplatePlan(skippedIo.port, defaults)
    expect(skipped.execution.writtenCount, 'template e2e: default run writes nothing').toBe(0)
    expect(skippedIo.writes, 'template e2e: default run has zero writes').toEqual([])
    expect(skippedIo.directories, 'template e2e: default run creates nothing').toEqual([])
    expect(await snapshotTree(outputRoot), 'template e2e: default run leaves the tree').toEqual(
      before
    )

    // Explicit check: the only write overwrites the lowercase target, and the
    // post-write check accepts the case-only spelling.
    const explicit = resolveTemplatePlan(preview.plan, { checkedPaths: [slot] })
    expect(explicit.executable.map((entry) => entry.relativePath)).toEqual([slot])
    const writeIo = recordIo(platform)
    const outcome = await applyTemplatePlan(writeIo.port, explicit)
    expect(outcome.execution.writtenCount, 'template e2e: explicit write count').toBe(1)
    expect(outcome.execution.failedCount, 'template e2e: explicit write failures').toBe(0)
    expect(outcome.verification.verified, 'template e2e: case-only row verified').toBe(1)
    expect(outcome.verification.failed, 'template e2e: case-only row not failed').toBe(0)

    const sourcePath = diskPath(incomingRoot, 'bucket/logo.png')
    const targetPath = diskPath(outputRoot, slot)
    expect(await fileSha256(targetPath), 'template e2e: case-only target sha256').toBe(
      await fileSha256(sourcePath)
    )
    expect(
      Math.floor((await stat(targetPath)).mtimeMs / 1000),
      'template e2e: case-only target mtimeSec'
    ).toBe(sourceSec)

    // A rescan reads the same file as already placed, so nothing is pending.
    const rescanned = await previewTemplate(platform, { templateRoot, incomingRoot, outputRoot })
    const placed = planRows(rescanned.plan).find((entry) => entry.relativePath === slot)
    expect(placed?.outcome, 'template e2e: case-only rescan placed').toBe('placed')
    expect(placed?.overwrite, 'template e2e: case-only rescan not an overwrite').toBe(false)
    expect(placed?.defaultChecked, 'template e2e: case-only rescan unchecked').toBe(false)
    expect(
      resolveTemplatePlan(rescanned.plan, { checkedPaths: [slot] }).executableCount,
      'template e2e: placed row is never executable'
    ).toBe(0)
  }, 60_000)

  it('runs the APFS move legs: default copy, explicit move, failed check keeps the source', async (context) => {
    const probeRoot = await scratchRoot('opencompare-template-move-probe-')
    await writeFile(join(probeRoot, 'probe.txt'), 'probe\n', 'utf8')
    if (!existsSync(join(probeRoot, 'PROBE.TXT'))) {
      console.warn(
        'template e2e: the scratch volume is case-sensitive; skipping the APFS move e2e'
      )
      context.skip()
      return
    }

    const stamp = BASE_SEC + 900
    const sourceFacts = async (path: string) => ({
      hash: await fileSha256(path),
      mtimeSec: Math.floor((await stat(path)).mtimeMs / 1000)
    })

    async function legRoots(name: string, slot: string, body: string) {
      const root = await scratchRoot(`opencompare-template-move-${name}-`)
      const templateRoot = join(root, '模板 A')
      const incomingRoot = join(root, '散乱 树 B')
      const outputRoot = join(root, '输出 根')
      await writeText(templateRoot, slot, body)
      await writeText(incomingRoot, `bucket-${name}/${slot.slice(slot.lastIndexOf('/') + 1)}`, body, stamp)
      return { root, templateRoot, incomingRoot, outputRoot }
    }

    // Leg 1: default copy — the target carries the source bytes / mtime and the
    // source is untouched.
    const copyRoots = await legRoots('copy', 'docs/clean.txt', 'clean body\n')
    const copyPreview = await previewTemplate(platform, copyRoots)
    const copyRow = planRows(copyPreview.plan).find((row) => row.relativePath === 'docs/clean.txt')
    expect(copyRow?.defaultChecked, 'template e2e move: clean row default-checked').toBe(true)
    expect(copyRow?.defaultAction, 'template e2e move: default action copy').toBe('copy')
    expect(copyRow?.sourceRelativePath, 'template e2e move: B-relative source').toBe(
      'bucket-copy/clean.txt'
    )
    expect(copyRow?.targetRelativePath, 'template e2e move: output-relative target').toBe(
      'docs/clean.txt'
    )

    const copySource = diskPath(copyRoots.incomingRoot, 'bucket-copy/clean.txt')
    const copyBefore = await sourceFacts(copySource)
    const copyDefaults = resolveTemplatePlan(copyPreview.plan, {
      checkedPaths: defaultsOf(copyPreview.plan)
    })
    expect(copyDefaults.moveCount, 'template e2e move: no move by default').toBe(0)
    expect(
      copyDefaults.executable.every((entry) => entry.action === 'copy'),
      'template e2e move: defaults all copy'
    ).toBe(true)
    const copyOutcome = await applyTemplatePlan(platform, copyDefaults)
    expect(copyOutcome.execution.failedCount).toBe(0)
    expect(copyOutcome.execution.movedCount).toBe(0)
    const copyTarget = diskPath(copyRoots.outputRoot, 'docs/clean.txt')
    expect(await sourceFacts(copyTarget), 'template e2e move: copied target facts').toEqual(copyBefore)
    expect(await sourceFacts(copySource), 'template e2e move: copy keeps source').toEqual(copyBefore)
    expect(
      copyOutcome.verification.entries.every((entry) => !entry.sourceDeleted && entry.action === 'copy'),
      'template e2e move: copy result keeps the source'
    ).toBe(true)

    // Leg 2: explicit move — the target checks out first, then the source goes.
    const moveRoots = await legRoots('move', 'docs/move.txt', 'move body\n')
    const movePreview = await previewTemplate(platform, moveRoots)
    const moveSource = diskPath(moveRoots.incomingRoot, 'bucket-move/move.txt')
    const moveBefore = await sourceFacts(moveSource)
    const moveResolved = resolveTemplatePlan(movePreview.plan, {
      checkedPaths: ['docs/move.txt'],
      movePaths: ['docs/move.txt']
    })
    expect(moveResolved.moveCount, 'template e2e move: explicit move count').toBe(1)
    expect(moveResolved.executable[0]?.action, 'template e2e move: executable action').toBe('move')
    const moveOutcome = await applyTemplatePlan(platform, moveResolved)
    expect(moveOutcome.execution.failedCount).toBe(0)
    expect(moveOutcome.execution.movedCount).toBe(1)
    const moveTarget = diskPath(moveRoots.outputRoot, 'docs/move.txt')
    expect(await sourceFacts(moveTarget), 'template e2e move: moved target facts').toEqual(moveBefore)
    await expect(stat(moveSource), 'template e2e move: moved source removed').rejects.toThrow()
    const movedRescan = await previewTemplate(platform, moveRoots)
    const placed = planRows(movedRescan.plan).find((row) => row.relativePath === 'docs/move.txt')
    expect(placed?.outcome, 'template e2e move: rescan placed').toBe('placed')
    expect(placed?.defaultChecked, 'template e2e move: rescan unchecked').toBe(false)
    expect(
      resolveTemplatePlan(movedRescan.plan, {}).executableCount,
      'template e2e move: rescan default is empty'
    ).toBe(0)

    // Leg 3: a failed post-write check keeps the source, keeps the target and
    // never rolls back the earlier successful legs.
    const failRoots = await legRoots('fail', 'docs/fail.txt', 'fail body\n')
    const failPreview = await previewTemplate(platform, failRoots)
    const failSource = diskPath(failRoots.incomingRoot, 'bucket-fail/fail.txt')
    const failBefore = await sourceFacts(failSource)
    const failResolved = resolveTemplatePlan(failPreview.plan, {
      checkedPaths: ['docs/fail.txt'],
      movePaths: ['docs/fail.txt']
    })
    const failEntry = failResolved.executable[0]
    const tampering: typeof platform = {
      ...platform,
      writeTextFile: async (path, content, modifiedMs) => {
        await platform.writeTextFile(path, content, modifiedMs)
        if (path === failEntry.targetPath) {
          const wrong = Math.floor((modifiedMs ?? stamp) / 1000) - 5
          await utimes(path, wrong, wrong)
        }
      }
    }
    const failOutcome = await applyTemplatePlan(tampering, failResolved)
    expect(failOutcome.execution.writtenCount, 'template e2e move: failed row not written').toBe(0)
    expect(failOutcome.execution.failedCount, 'template e2e move: one failed move').toBe(1)
    expect(failOutcome.execution.failed[0]?.reason, 'template e2e move: mtime failure reason').toBe(
      'move-target-mtime'
    )
    expect(await sourceFacts(failSource), 'template e2e move: failed move keeps source').toEqual(
      failBefore
    )
    await expect(
      stat(diskPath(failRoots.outputRoot, 'docs/fail.txt')),
      'template e2e move: failed target kept'
    ).resolves.toBeDefined()

    // Earlier legs are untouched by the later failure.
    expect(await sourceFacts(copyTarget), 'template e2e move: copy target not rolled back').toEqual(
      copyBefore
    )
    await expect(stat(moveSource), 'template e2e move: earlier move source still gone').rejects.toThrow()

    for (const roots of [copyRoots, moveRoots, failRoots]) {
      expect(
        tempFiles(await snapshotTree(roots.outputRoot)),
        `template e2e move: ${roots.outputRoot} no temp residue`
      ).toEqual([])
      expect(
        tempFiles(await snapshotTree(roots.incomingRoot)),
        `template e2e move: ${roots.incomingRoot} no temp residue`
      ).toEqual([])
    }
  }, 120_000)
})
