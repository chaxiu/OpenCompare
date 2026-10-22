#!/usr/bin/env node
// Local pre-upload check for electron-builder update metadata. It mirrors the
// workflow's "Assert latest*.yml urls match the release assets" rule (line-based
// scan of the files: block, membership against the release asset names) and adds
// the Windows artifact-name form check. Standard library only: it runs on a
// plain Node without a build step, and it never touches the network.
import { closeSync, openSync, readdirSync, readFileSync, readSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const METADATA_GLOB = /^latest.*\.yml$/
// electron-builder's default NSIS name is "OpenCompare Setup <ver>.exe"; GitHub
// normalizes the spaces to dots on upload. Only the hyphen form is valid here.
const LEGACY_WINDOWS_NAME = /OpenCompare[. ]Setup[. ]\d+\.\d+\.\d+\.exe(?:\.blockmap)?/g

const normalizeRef = (ref) => ref.replace(/^"|"$/g, '').replace(/^\.\//, '')

// Same line rules as the CI gate: refs are the `- url:` entry lines plus the
// `url` / `path` keys that follow them, all inside the top-level `files:` block.
export function extractMetadataRefs(text) {
  const lines = text.split(/\r?\n/)
  const refs = []
  let inFiles = false
  let inEntry = false
  for (const line of lines) {
    if (/^files:\s*$/.test(line)) {
      inFiles = true
      inEntry = false
      continue
    }
    if (!inFiles) continue
    if (/^\S/.test(line)) {
      inFiles = false
      inEntry = false
      continue
    }
    const entry = /^\s*-\s*url:\s*(.+?)\s*$/.exec(line)
    if (entry) {
      inEntry = true
      refs.push(entry[1])
      continue
    }
    if (!inEntry) continue
    const key = /^\s+(url|path):\s*(.+?)\s*$/.exec(line)
    if (key) refs.push(key[2])
  }
  return refs.map(normalizeRef)
}

export function findLegacyWindowsNames(names) {
  const hits = new Set()
  for (const name of names) {
    for (const match of String(name).matchAll(LEGACY_WINDOWS_NAME)) {
      hits.add(match[0])
    }
  }
  return [...hits]
}

// Same line rules as the workflow's AppImage blockmap gate: a files[] entry
// starts at `- url:` and its `blockMapSize` sits on a following indented line.
// The AppImage trailer is a 4-byte uint32 that electron-builder writes in a
// platform-dependent order, so both LE and BE decodings are candidates.
export function extractAppImageEntries(text) {
  const lines = text.split(/\r?\n/)
  const entries = []
  let inFiles = false
  let current = null
  for (const line of lines) {
    if (/^files:\s*$/.test(line)) {
      inFiles = true
      current = null
      continue
    }
    if (!inFiles) continue
    if (/^\S/.test(line)) {
      inFiles = false
      current = null
      continue
    }
    const entry = /^\s*-\s*url:\s*(.+?)\s*$/.exec(line)
    if (entry) {
      current = { url: normalizeRef(entry[1]), blockMapSize: null }
      entries.push(current)
      continue
    }
    if (!current) continue
    const blockMap = /^\s*blockMapSize:\s*(\d+)\s*$/.exec(line)
    if (blockMap) current.blockMapSize = Number(blockMap[1])
  }
  return entries.filter((entry) => entry.url.endsWith('.AppImage'))
}

const APPIMAGE_TAIL_BYTES = 4

// Mirrors the release workflow gate on the local release/ directory: every
// .AppImage entry declared by latest-linux.yml must exist, declare blockMapSize
// and match one of the two 4-byte trailer decodings without exceeding the file
// size. Failures land in problems, never as a silent pass.
const inspectAppImageBlockmaps = ({ dir, file, text, problems }) => {
  for (const entry of extractAppImageEntries(text)) {
    const name = entry.url
    if (entry.blockMapSize === null) {
      problems.push(`${file} 中 ${name} 缺少 blockMapSize`)
      continue
    }
    const path = join(dir, name)
    let size
    try {
      size = statSync(path).size
    } catch {
      problems.push(`${file} 声明的 AppImage 文件缺失: ${name}`)
      continue
    }
    if (size < APPIMAGE_TAIL_BYTES) {
      problems.push(`${name} 小于 4 字节，无法读取 blockMapSize 尾部`)
      continue
    }
    const tail = Buffer.alloc(APPIMAGE_TAIL_BYTES)
    let fd
    try {
      fd = openSync(path, 'r')
      readSync(fd, tail, 0, APPIMAGE_TAIL_BYTES, size - APPIMAGE_TAIL_BYTES)
    } catch (error) {
      problems.push(
        `AppImage 不可读: ${name} (${error instanceof Error ? error.message : error})`
      )
      continue
    } finally {
      if (fd !== undefined) closeSync(fd)
    }
    const candidates = [tail.readUInt32LE(0), tail.readUInt32BE(0)]
    const inRange = candidates.filter((value) => value <= size)
    if (inRange.includes(entry.blockMapSize)) continue
    if (inRange.length === 0) {
      problems.push(
        `${name} 尾部候选值 LE=${candidates[0]} BE=${candidates[1]} 超过文件大小 ${size}`
      )
      continue
    }
    problems.push(
      `${name} 尾部候选值 LE=${candidates[0]} BE=${candidates[1]} 与 ${file} 声明 blockMapSize=${entry.blockMapSize} 不等`
    )
  }
}

export function inspectReleaseMetadata({ dir, assets }) {
  const problems = []
  const missing = []
  const metadata = []
  const assetNames = Array.isArray(assets)
    ? assets.map((name) => String(name).trim()).filter(Boolean)
    : []
  const assetSet = new Set(assetNames)
  let latestFiles = []

  if (assetNames.length === 0) {
    problems.push('资产名清单为空: 至少需要一个资产名，当前为 0 个')
  }

  if (!dir || !String(dir).trim()) {
    problems.push('目录不可读: 未提供 --dir 目录')
  } else {
    try {
      latestFiles = readdirSync(dir)
        .filter((name) => METADATA_GLOB.test(name))
        .sort()
    } catch (error) {
      problems.push(`目录不可读: ${dir} (${error instanceof Error ? error.message : error})`)
    }
    if (latestFiles.length === 0 && !problems.some((problem) => problem.startsWith('目录不可读'))) {
      problems.push(`无 latest*.yml: ${dir} 内没有 latest*.yml`)
    }
  }

  const allRefs = []
  for (const name of latestFiles) {
    let text
    try {
      text = readFileSync(join(dir, name), 'utf8')
    } catch (error) {
      problems.push(`目录不可读: ${join(dir, name)} (${error instanceof Error ? error.message : error})`)
      continue
    }
    const refs = extractMetadataRefs(text)
    allRefs.push(...refs)
    const fileMissing = refs.filter((ref) => !assetSet.has(ref))
    missing.push(...fileMissing)
    if (refs.length === 0) {
      problems.push(`${name} 未声明 files[].url 条目`)
    }
    metadata.push({
      file: name,
      refs,
      missing: fileMissing,
      hits: refs.length - fileMissing.length
    })
    if (name === 'latest-linux.yml') {
      inspectAppImageBlockmaps({ dir, file: name, text, problems })
    }
  }

  const legacyHits = findLegacyWindowsNames([...assetNames, ...allRefs])
  const ok = problems.length === 0 && missing.length === 0 && legacyHits.length === 0
  return { ok, assets: assetNames, metadata, missing, legacyHits, problems }
}

const readAssetsFile = (path) => {
  const text = readFileSync(path, 'utf8')
  return text
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean)
}

const parseArgs = (argv) => {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--dir' || arg === '--assets') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) {
        return { error: `${arg} 缺少取值` }
      }
      options[arg.slice(2)] = value
      index += 1
      continue
    }
    return { error: `未知参数: ${arg}` }
  }
  return { options }
}

export function runReleaseMetadataCli(argv, io = {}) {
  const stdout = io.stdout ?? ((line) => process.stdout.write(`${line}\n`))
  const stderr = io.stderr ?? ((line) => process.stderr.write(`${line}\n`))
  const { options, error } = parseArgs(argv)
  if (error) {
    stderr(`release:metadata ${error}`)
    stderr('用法: pnpm release:metadata --dir <release 目录> [--assets <资产名清单文件>]')
    return 1
  }

  const dir = options.dir ? resolve(options.dir) : ''
  let assets = []
  if (options.assets) {
    try {
      assets = readAssetsFile(options.assets)
    } catch (readError) {
      stderr(
        `资产名清单不可读: ${options.assets} (${
          readError instanceof Error ? readError.message : readError
        })`
      )
      return 1
    }
  } else if (dir) {
    try {
      assets = readdirSync(dir).sort()
    } catch {
      assets = []
    }
  }

  const report = inspectReleaseMetadata({ dir, assets })
  for (const entry of report.metadata) {
    stdout(`${entry.file}: url ${entry.hits}/${entry.refs.length} 命中资产名`)
  }
  stdout(`旧错位名 ${report.legacyHits.length} 命中`)

  for (const problem of report.problems) stderr(`::error:: ${problem}`)
  for (const name of report.missing) stderr(`::error:: files[].url 未命中资产名: ${name}`)
  for (const name of report.legacyHits) stderr(`::error:: 旧错位名命中: ${name}`)
  if (!report.ok) {
    stderr('release:metadata 校验未通过，禁止上传该 Release 的更新元数据。')
    return 1
  }
  stdout(`release:metadata 校验通过：${report.metadata.length} 份 latest*.yml、${report.assets.length} 个资产名。`)
  return 0
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = runReleaseMetadataCli(process.argv.slice(2))
}
