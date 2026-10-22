#!/usr/bin/env node
/**
 * `pnpm perf:gate`: generates a real on-disk dataset in the system temp
 * directory (5,200 files per side, ~100 MiB+ of content, five nested levels,
 * same-size/different-content pairs and file/directory/dangling symlinks), runs
 * the real Electron harness for three rounds with the gate profile, asserts the
 * written evidence and always removes the dataset.
 */
import { mkdir, mkdtemp, readFile, rm, symlink, utimes, writeFile } from 'node:fs/promises'
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
const RUN_TIMEOUT_MS = 150_000

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

async function generate(left, right) {
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

  const totalFiles = FILES_PER_SIDE * 2 + extras.length
  const totalBytes = FILES_PER_SIDE * 2 * FILE_BYTES
  return { totalFiles, totalBytes, depth: 5, symlinks: 6 }
}

function runHarness(left, right, out) {
  const args = [
    '.',
    '--perf-harness',
    '--profile',
    'gate',
    '--left',
    left,
    '--right',
    right,
    '--rounds',
    '3',
    '--interval',
    '500',
    '--out',
    out,
    '--fail-on-violation'
  ]
  return spawnSync(electronPath, args, {
    cwd: root,
    env: { ...process.env, OPENCOMPARE_PERF: '1' },
    stdio: 'inherit',
    timeout: RUN_TIMEOUT_MS
  })
}

async function main() {
  const temp = await mkdtemp(join(tmpdir(), 'opencompare-perf-gate-'))
  const left = join(temp, 'left')
  const right = join(temp, 'right')
  const out = join(temp, 'evidence.json')
  try {
    const generated = await generate(left, right)
    console.log(
      `perf:gate dataset -> ${temp} (files=${generated.totalFiles}, bytes=${generated.totalBytes}, ` +
        `depth=${generated.depth}, symlinks=${generated.symlinks})`
    )
    if (generated.totalFiles < 5000) throw new Error('perf:gate 数据集文件数不足 5000。')
    if (generated.totalBytes < MIN_BYTES) throw new Error('perf:gate 数据集内容不足 100 MiB。')
    if (generated.depth < 5) throw new Error('perf:gate 数据集嵌套不足 5 层。')

    const result = runHarness(left, right, out)
    if (result.error !== undefined && result.error !== null) {
      throw new Error(`perf:gate 无法启动 Electron：${result.error.message}`)
    }
    if (result.signal !== null) {
      throw new Error(`perf:gate 运行超时或被信号终止：${result.signal}`)
    }
    if (result.status !== 0) {
      // The harness already printed the violated threshold ids.
      throw new Error(`perf:gate 运行以退出码 ${result.status} 结束（阈值未通过或采样无效）。`)
    }

    const evidence = JSON.parse(await readFile(out, 'utf8'))
    if (evidence.verdict?.ok !== true) {
      throw new Error(`perf:gate 证据 verdict.ok=false：${JSON.stringify(evidence.verdict?.violations)}`)
    }
    if (evidence.roots?.left !== left || evidence.roots?.right !== right) {
      throw new Error('perf:gate 证据 roots 未指向本次临时数据集。')
    }
    for (const rootPath of [evidence.roots.left, evidence.roots.right]) {
      if (rootPath.includes('src/shared/fixtures') || rootPath.includes('/samples')) {
        throw new Error('perf:gate 不得使用内置样本路径。')
      }
    }
    if (!Array.isArray(evidence.rounds) || evidence.rounds.length !== 3) {
      throw new Error('perf:gate 证据轮次数不是 3。')
    }
    if (!Array.isArray(evidence.samples) || evidence.samples.length === 0) {
      throw new Error('perf:gate 证据没有采样。')
    }
    if (!(evidence.counts.hashedFiles > 0) || !(evidence.counts.bytesToHash >= MIN_BYTES)) {
      throw new Error(
        `perf:gate 哈希计数不足：files=${evidence.counts.hashedFiles}, bytes=${evidence.counts.bytesToHash}`
      )
    }
    const interval = evidence.sampling?.intervalMs ?? 1000
    for (const round of evidence.rounds) {
      const periodic = evidence.samples.filter(
        (sample) => sample.phase === 'periodic' && sample.round === round.index
      ).length
      const required = Math.floor(round.wallMs / interval) - 1
      if (periodic < required) {
        throw new Error(
          `perf:gate 第 ${round.index} 轮周期采样不足：${periodic} < ${required}（wallMs=${round.wallMs}）`
        )
      }
    }

    console.log(
      `perf:gate PASS -> rounds=${evidence.rounds.length}, hashedFiles=${evidence.counts.hashedFiles}, ` +
        `bytesToHash=${evidence.counts.bytesToHash}, rendererPeak=${evidence.peaks.renderer}, ` +
        `appPeak=${evidence.peaks.appTotal}`
    )
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(`perf:gate FAIL: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
