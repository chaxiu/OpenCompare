#!/usr/bin/env node
/**
 * `pnpm perf:gate`: generates a real on-disk dataset in the system temp
 * directory (6,000 files per side, 100 MiB+ of content, five nested levels,
 * same-size/different-content pairs and file/directory/dangling symlinks), then
 * runs the real Electron harness twice with the gate profile:
 *
 *  1. `upsert` — one pair re-compared 5 rounds, one tab, the semantics of
 *     `Workbench.upsertSession`;
 *  2. `multisession` — 3 distinct pairs, tabs 1 → 2 → 3, the semantics of the
 *     workbench's multi-tab session array.
 *
 * Both runs assert ready peaks, per-round peaks, the post-settle reading and the
 * post-GC liveness counts (`comparisons` / `rowModels` / `tabs`). The dataset is
 * always removed afterwards.
 */
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const electronPath = require('electron')

const FILES_PER_SIDE = 6000
const FILE_BYTES = 10240
const FIXED_MTIME = new Date('2024-01-01T00:00:00.000Z')
const MIN_BYTES = 100 * 1024 * 1024
const RUN_TIMEOUT_MS = 300_000
const UPSERT_ROUNDS = 5
const SETTLE_MS = 5000
const GATE_RENDERER_PEAK = 1073741824
const GATE_SETTLE = 1073741824
/** Optional archive of the two evidence files, outside the repo. */
const EVIDENCE_DIR = process.env.PERF_GATE_EVIDENCE_DIR
const EVIDENCE_STAMP = new Date().toISOString().replace(/[:.]/g, '-')

function relPath(index) {
  const bucket = String(Math.floor(index / 100)).padStart(2, '0')
  return join('d0', 'd1', 'd2', 'd3', 'd4', `bucket-${bucket}`, `file-${String(index).padStart(5, '0')}.bin`)
}

function contentFor(index) {
  const buffer = Buffer.alloc(FILE_BYTES, 97 + (index % 23))
  buffer.write(`opencompare perf gate file=${index}\n`, 0, 'utf8')
  return buffer
}

async function writeFileAt(path, buffer) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, buffer)
  await utimes(path, FIXED_MTIME, FIXED_MTIME)
}

/** Runs an async mapper in fixed-size batches so 10k writes stay bounded. */
async function inBatches(items, size, run) {
  for (let start = 0; start < items.length; start += size) {
    await Promise.all(items.slice(start, start + size).map(run))
  }
}

async function generate(left, right, links) {
  const indexes = Array.from({ length: FILES_PER_SIDE }, (_unused, index) => index)

  await inBatches(indexes, 64, async (index) => {
    const relative = relPath(index)
    const base = contentFor(index)
    await writeFileAt(join(left, relative), base)
    // Every 50th pair keeps size and mtime identical but differs by one byte,
    // so the comparison must fall through to the real SHA-256 digest.
    const rightBytes = index % 50 === 0 ? Buffer.from(base) : base
    if (index % 50 === 0) rightBytes[FILE_BYTES - 1] = rightBytes[FILE_BYTES - 1] ^ 0xff
    await writeFileAt(join(right, relative), rightBytes)
  })

  const extras = []
  for (let index = 0; index < 25; index += 1) {
    extras.push({ side: left, name: `extra-left-${index}.bin`, index: FILES_PER_SIDE + index })
    extras.push({ side: right, name: `extra-right-${index}.bin`, index: FILES_PER_SIDE + 100 + index })
  }
  await inBatches(extras, 16, async (extra) =>
    writeFileAt(join(extra.side, extra.name), contentFor(extra.index))
  )

  const linkTargetFile = relPath(0)
  const linkTargetDir = join('d0', 'd1', 'd2', 'd3', 'd4', 'bucket-01')
  for (const side of [left, right]) {
    await symlink(linkTargetFile, join(side, 'file-link'))
    await symlink(linkTargetDir, join(side, 'dir-link'))
    await symlink('missing-target.bin', join(side, 'dangling-link'))
  }

  // Third root of the multisession run: a directory symlink to `left`, the same
  // shape `multisession.mjs` uses for its third step.
  await mkdir(links, { recursive: true })
  await symlink(left, join(links, 'left'))

  const totalFiles = FILES_PER_SIDE * 2 + extras.length
  const totalBytes = FILES_PER_SIDE * 2 * FILE_BYTES
  return { totalFiles, totalBytes, depth: 5, symlinks: 6 }
}

function runHarness(args, out) {
  const spawnArgs = ['.', '--perf-harness', '--profile', 'gate', ...args, '--out', out, '--fail-on-violation']
  return spawnSync(electronPath, spawnArgs, {
    cwd: root,
    env: { ...process.env, OPENCOMPARE_PERF: '1' },
    stdio: 'inherit',
    timeout: RUN_TIMEOUT_MS
  })
}

async function archiveEvidence(label, out) {
  if (EVIDENCE_DIR === undefined || EVIDENCE_DIR === '') return
  await mkdir(EVIDENCE_DIR, { recursive: true })
  const target = join(EVIDENCE_DIR, `perf-gate-${EVIDENCE_STAMP}-${label}.json`)
  await copyFile(out, target)
  console.log(`perf:gate 证据归档 -> ${target}`)
}

async function runAndRead(label, args, out) {
  const result = runHarness(args, out)
  if (result.error !== undefined && result.error !== null) {
    throw new Error(`perf:gate ${label} 无法启动 Electron：${result.error.message}`)
  }
  if (result.signal !== null) {
    throw new Error(`perf:gate ${label} 运行超时或被信号终止：${result.signal}`)
  }
  if (result.status !== 0) {
    throw new Error(`perf:gate ${label} 运行以退出码 ${result.status} 结束（阈值未通过或采样无效）。`)
  }
  await archiveEvidence(label, out)
  return JSON.parse(await readFile(out, 'utf8'))
}

function assertCommon(evidence, label) {
  if (evidence.verdict?.ok !== true) {
    throw new Error(`perf:gate ${label} 证据 verdict.ok=false：${JSON.stringify(evidence.verdict?.violations)}`)
  }
  if (!Array.isArray(evidence.samples) || evidence.samples.length === 0) {
    throw new Error(`perf:gate ${label} 证据没有采样。`)
  }
  if (evidence.settle === null || evidence.settle === undefined) {
    throw new Error(`perf:gate ${label} 证据缺少 settle 采样。`)
  }
  if (!(evidence.settle.renderer > 0) || evidence.settle.renderer > GATE_SETTLE) {
    throw new Error(
      `perf:gate ${label} settle.renderer 越线：${evidence.settle.renderer} > ${GATE_SETTLE}`
    )
  }
  if (!Array.isArray(evidence.holds) || evidence.holds.length === 0) {
    throw new Error(`perf:gate ${label} 证据缺少 holds 结构采样。`)
  }
  for (const hold of evidence.holds) {
    if (hold.gc !== true) {
      throw new Error(`perf:gate ${label} ${hold.label} 的 gc 未生效，结构断言无法成立。`)
    }
    if (hold.rowModels > 2) {
      throw new Error(`perf:gate ${label} ${hold.label} 仍持有 ${hold.rowModels} 份 row model（上限 2）。`)
    }
    if (!Array.isArray(evidence.pairs) || evidence.pairs.length === 0) {
      throw new Error(`perf:gate ${label} 证据缺少 pairs。`)
    }
  }
  const interval = evidence.sampling?.intervalMs ?? 1000
  for (const round of evidence.rounds) {
    const periodic = evidence.samples.filter(
      (sample) => sample.phase === 'periodic' && sample.round === round.index
    ).length
    const required = Math.floor(round.wallMs / interval) - 1
    if (periodic < required) {
      throw new Error(
        `perf:gate ${label} 第 ${round.index} 轮周期采样不足：${periodic} < ${required}（wallMs=${round.wallMs}）`
      )
    }
    if (!(round.tabs > 0)) {
      throw new Error(`perf:gate ${label} 第 ${round.index} 轮缺少 tabs 字段。`)
    }
    if (!(round.roundPeak > 0) || round.roundPeak > GATE_RENDERER_PEAK) {
      throw new Error(
        `perf:gate ${label} 第 ${round.index} 轮 ready 峰值越线：${round.roundPeak} > ${GATE_RENDERER_PEAK}`
      )
    }
  }
}

function assertUpsert(evidence, left, right) {
  assertCommon(evidence, 'upsert')
  if (evidence.mode !== 'upsert') throw new Error(`perf:gate upsert 证据 mode=${evidence.mode}。`)
  if (evidence.pairs.length !== 1) throw new Error('perf:gate upsert 证据 pairs 不是 1 对。')
  if (evidence.rounds.length !== UPSERT_ROUNDS) {
    throw new Error(`perf:gate upsert 轮次数不是 ${UPSERT_ROUNDS}。`)
  }
  const expectedId = `directory:${left} ↔ ${right}`
  const labels = evidence.holds.map((hold) => hold.label)
  const expectedLabels = [
    ...Array.from({ length: UPSERT_ROUNDS }, (_unused, index) => `round-${index + 1}`),
    'settle'
  ]
  if (JSON.stringify(labels) !== JSON.stringify(expectedLabels)) {
    throw new Error(`perf:gate upsert hold 序列异常：${JSON.stringify(labels)}`)
  }
  for (const hold of evidence.holds) {
    if (hold.tabs !== 1) throw new Error(`perf:gate upsert ${hold.label} tabs=${hold.tabs}（期望 1）。`)
    if (hold.comparisons !== 1) {
      throw new Error(`perf:gate upsert ${hold.label} 仍持有 ${hold.comparisons} 份 comparison（期望 1）。`)
    }
  }
  for (const round of evidence.rounds) {
    if (round.tabs !== 1) throw new Error(`perf:gate upsert 第 ${round.index} 轮 tabs=${round.tabs}。`)
    if (round.sessionId !== expectedId) {
      throw new Error(`perf:gate upsert 第 ${round.index} 轮 sessionId=${round.sessionId}。`)
    }
  }
  // The shared cache stays warm: only the first round hashes real bytes.
  if (!(evidence.rounds[0].counts.hashedFiles > 0)) {
    throw new Error('perf:gate upsert 第 1 轮没有实际哈希，数据集无效。')
  }
  for (const round of evidence.rounds.slice(1)) {
    if (round.counts.hashedFiles !== 0) {
      throw new Error(
        `perf:gate upsert 第 ${round.index} 轮重新哈希了 ${round.counts.hashedFiles} 个文件（热轮应为 0）。`
      )
    }
  }
}

function assertMultisession(evidence) {
  assertCommon(evidence, 'multisession')
  if (evidence.mode !== 'multisession') {
    throw new Error(`perf:gate multisession 证据 mode=${evidence.mode}。`)
  }
  if (evidence.pairs.length !== 3) throw new Error('perf:gate multisession 证据 pairs 不是 3 对。')
  if (evidence.rounds.length !== 3) throw new Error('perf:gate multisession 轮次数不是 3。')
  const tabs = evidence.rounds.map((round) => round.tabs)
  if (JSON.stringify(tabs) !== JSON.stringify([1, 2, 3])) {
    throw new Error(`perf:gate multisession tabs 不是 1→2→3：${JSON.stringify(tabs)}`)
  }
  const labels = evidence.holds.map((hold) => hold.label)
  const expectedLabels = ['round-1', 'round-2', 'round-3', 'settle']
  if (JSON.stringify(labels) !== JSON.stringify(expectedLabels)) {
    throw new Error(`perf:gate multisession hold 序列异常：${JSON.stringify(labels)}`)
  }
  for (const hold of evidence.holds) {
    if (hold.tabs !== hold.round) {
      throw new Error(`perf:gate multisession ${hold.label} tabs=${hold.tabs}（期望 ${hold.round}）。`)
    }
    if (hold.comparisons !== hold.round) {
      throw new Error(
        `perf:gate multisession ${hold.label} comparisons=${hold.comparisons}（期望 ${hold.round}）。`
      )
    }
  }
}

async function main() {
  const temp = await mkdtemp(join(tmpdir(), 'opencompare-perf-gate-'))
  const left = join(temp, 'left')
  const right = join(temp, 'right')
  const links = join(temp, 'links')
  const upsertOut = join(temp, 'evidence-upsert.json')
  const multiOut = join(temp, 'evidence-multisession.json')
  try {
    const generated = await generate(left, right, links)
    console.log(
      `perf:gate dataset -> ${temp} (files=${generated.totalFiles}, bytes=${generated.totalBytes}, ` +
        `depth=${generated.depth}, symlinks=${generated.symlinks})`
    )
    if (generated.totalFiles < 5000) throw new Error('perf:gate 数据集文件数不足 5000。')
    if (generated.totalBytes < MIN_BYTES) throw new Error('perf:gate 数据集内容不足 100 MiB。')
    if (generated.depth < 5) throw new Error('perf:gate 数据集嵌套不足 5 层。')

    const upsert = await runAndRead(
      'upsert',
      [
        '--mode',
        'upsert',
        '--left',
        left,
        '--right',
        right,
        '--rounds',
        String(UPSERT_ROUNDS),
        '--settle',
        String(SETTLE_MS),
        '--interval',
        '500'
      ],
      upsertOut
    )
    if (upsert.roots?.left !== left || upsert.roots?.right !== right) {
      throw new Error('perf:gate upsert 证据 roots 未指向本次临时数据集。')
    }
    assertUpsert(upsert, left, right)

    const multisession = await runAndRead(
      'multisession',
      [
        '--mode',
        'multisession',
        '--left',
        left,
        '--left',
        right,
        '--left',
        join(links, 'left'),
        '--right',
        right,
        '--right',
        left,
        '--right',
        right,
        '--settle',
        String(SETTLE_MS),
        '--interval',
        '500'
      ],
      multiOut
    )
    if (multisession.roots?.left !== left || multisession.roots?.right !== right) {
      throw new Error('perf:gate multisession 证据 roots 未指向本次临时数据集。')
    }
    assertMultisession(multisession)

    for (const [label, evidence] of [
      ['upsert', upsert],
      ['multisession', multisession]
    ]) {
      for (const pair of evidence.pairs) {
        for (const rootPath of [pair.left, pair.right]) {
          if (rootPath.includes('src/shared/fixtures') || rootPath.includes('/samples')) {
            throw new Error(`perf:gate ${label} 不得使用内置样本路径。`)
          }
        }
      }
    }

    const format = (evidence) =>
      `rounds=${evidence.rounds.length}, tabs=${evidence.rounds.map((r) => r.tabs).join('/')}, ` +
      `rendererPeak=${evidence.peaks.renderer}, roundPeaks=${evidence.rounds
        .map((r) => r.roundPeak)
        .join('/')}, settle=${evidence.settle.renderer}, ` +
      `holds=${evidence.holds
        .map((h) => `${h.label}:${h.comparisons}/${h.rowModels}`)
        .join(',')}`
    console.log(`perf:gate PASS upsert -> ${format(upsert)}`)
    console.log(`perf:gate PASS multisession -> ${format(multisession)}`)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(`perf:gate FAIL: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
