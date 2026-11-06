/**
 * Pure helpers behind `coverage-gate-preflight.mjs`'s "measure once, reuse the
 * summary" cache.
 *
 * The cache key must be fail-closed: it binds the measured tree (commit + tree
 * sha), the preflight/gate script content, the covered file set (baseline
 * `scope.include` / `scope.exclude`) and the instrumentation-relevant
 * environment. A missing or unreadable component is reported by the caller as
 * `cache miss: <reason>` and remeasured; nothing is ever reused across trees.
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'

const SKIP_DIRS = new Set(['node_modules', '.git'])
const ENV_PREFIX = /^(NODE_OPTIONS|NODE_V8_COVERAGE|NODE_ENV|VITEST_|COVERAGE_|OPENCOMPARE_)/

/** Convert a POSIX-style glob from the baseline scope into an anchored RegExp. */
export function globToRegExp(pattern) {
  let source = '^'
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        if (pattern[index + 2] === '/') {
          source += '(?:.*/)?'
          index += 2
        } else {
          source += '.*'
          index += 1
        }
      } else {
        source += '[^/]*'
      }
    } else if (char === '?') {
      source += '[^/]'
    } else if ('\\^$.|+()[]{}'.includes(char)) {
      source += `\\${char}`
    } else {
      source += char
    }
  }
  return new RegExp(`${source}$`)
}

function toPosix(path) {
  return path.split(sep).join('/')
}

/** The directory a `scope.include` glob starts walking from. */
export function globRoot(include) {
  const wildcard = include.search(/[*?]/)
  const prefix = wildcard === -1 ? include : include.slice(0, wildcard)
  const slash = prefix.lastIndexOf('/')
  const root = slash === -1 ? '.' : prefix.slice(0, slash)
  return root === '' ? '.' : root
}

/** Sorted POSIX-relative paths matching `include` and none of `excludes`. */
export function listCoveredFiles(root, include, excludes) {
  const base = resolve(root, globRoot(include))
  const includePattern = globToRegExp(toPosix(include))
  const excludePatterns = excludes.map(globToRegExp)
  const files = []
  const walk = (dir) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(resolve(dir, entry.name))
        continue
      }
      if (!entry.isFile()) continue
      const relPath = toPosix(relative(root, resolve(dir, entry.name)))
      if (!includePattern.test(relPath)) continue
      if (excludePatterns.some((pattern) => pattern.test(relPath))) continue
      files.push(relPath)
    }
  }
  walk(base)
  return files.sort()
}

/**
 * Fingerprint of the covered file set *and* its working-tree content. The
 * committed tree sha alone cannot see an uncommitted edit in a rehearsal
 * worktree, so content is part of the set fingerprint as well.
 */
export function fileSetFingerprint(root, include, excludes) {
  const files = listCoveredFiles(root, include, excludes)
  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(file).update('\0')
    hash.update(readFileSync(resolve(root, file))).update('\0')
  }
  return { fingerprint: hash.digest('hex'), count: files.length, files }
}

/** Fingerprint of the preflight/gate script sources that shape the result. */
export function scriptHash(root, files) {
  const hash = createHash('sha256')
  for (const file of [...files].sort()) {
    hash.update(file).update('\0')
    hash.update(readFileSync(resolve(root, file))).update('\0')
  }
  return hash.digest('hex')
}

/** Instrumentation-relevant environment plus fixed runtime facts. */
export function environmentFacts(env = process.env, facts = {}) {
  const picked = {}
  for (const key of Object.keys(env).sort()) {
    if (ENV_PREFIX.test(key)) picked[key] = env[key]
  }
  return { ...facts, env: picked }
}

export function computeCacheKey(parts) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex')
}

/**
 * Decide whether a stored summary may be reused. Any missing/invalid component
 * returns `hit: false` with a human-readable reason; the caller then remeasures.
 */
export function assessCacheEntry({ expectedKey, meta, summary, summaryMtimeMs }) {
  if (meta === null || typeof meta !== 'object') return { hit: false, reason: 'missing cache metadata' }
  if (meta.key !== expectedKey) {
    return { hit: false, reason: `key mismatch (stored ${JSON.stringify(meta.key ?? null)})` }
  }
  if (summary === null || typeof summary !== 'object') return { hit: false, reason: 'missing summary' }
  if (summary.total === undefined || typeof summary.total !== 'object') {
    return { hit: false, reason: 'summary has no total entry' }
  }
  if (!Number.isInteger(meta.measuredAt) || meta.measuredAt < 0) {
    return { hit: false, reason: 'metadata has no measuredAt epoch' }
  }
  if (!Number.isFinite(summaryMtimeMs) || summaryMtimeMs < meta.measuredAt * 1000) {
    return { hit: false, reason: 'summary mtime is older than its measurement start' }
  }
  return { hit: true, reason: null, startedAt: meta.measuredAt }
}
