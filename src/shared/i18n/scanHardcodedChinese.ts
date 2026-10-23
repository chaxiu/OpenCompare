import { readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

/** A line that still carries Chinese source text. */
export interface HardcodedChineseHit {
  /** The path as reached from one of the requested roots. */
  readonly file: string
  /** 1-based line number. */
  readonly line: number
  /** The matching line, trimmed. */
  readonly text: string
}

const HAN = /\p{Script=Han}/u
const SOURCE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs)$/
const TEST_FILE = /\.test\./
const MESSAGE_SURFACE = /(^|\/)i18n\/messages(\/|$)/

function toPosix(path: string): string {
  return path.replaceAll('\\', '/')
}

/** Both dictionaries and their own tests legitimately carry Chinese. */
function isExcluded(path: string): boolean {
  return TEST_FILE.test(basename(path)) || MESSAGE_SURFACE.test(toPosix(path))
}

function sourceFiles(path: string): string[] {
  const info = readdirSync(path, { withFileTypes: true })
  return info.flatMap((entry) => {
    const child = join(path, entry.name)
    if (entry.isDirectory()) return sourceFiles(child)
    return entry.isFile() && SOURCE_FILE.test(entry.name) ? [child] : []
  })
}

function scanFile(path: string): HardcodedChineseHit[] {
  const hits: HardcodedChineseHit[] = []
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)
  lines.forEach((line, index) => {
    if (!HAN.test(line)) return
    hits.push({ file: path, line: index + 1, text: line.trim() })
  })
  return hits
}

/**
 * Scans an explicit path list (files and/or directories, directories walked
 * recursively for source files) for Chinese source text. Every line is matched
 * raw, so comments, `aria-label`, `title` and `data-testid` are hits too — the
 * only exclusions are `*.test.*` files and `i18n/messages/**`.
 */
export function scanHardcodedChinese(paths: readonly string[]): HardcodedChineseHit[] {
  const hits: HardcodedChineseHit[] = []
  for (const path of paths) {
    if (isExcluded(path)) continue
    let files: string[]
    try {
      files = sourceFiles(path)
    } catch {
      // A requested file, not a directory.
      files = [path]
    }
    for (const file of files) {
      if (isExcluded(file)) continue
      hits.push(...scanFile(file))
    }
  }
  return hits.sort((left, right) =>
    left.file === right.file ? left.line - right.line : left.file < right.file ? -1 : 1
  )
}
