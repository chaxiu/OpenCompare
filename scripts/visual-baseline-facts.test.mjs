/**
 * Baseline fact sheet for the visual V1 work item.
 *
 * `VISUAL_BASELINE_WRITE=1 pnpm vitest run scripts/visual-baseline-facts.test.mjs`
 * writes `docs/visual/v1/baseline-facts.json` from a real temporary directory
 * pair; every later run recomputes the same facts and fails on any drift. The
 * captured commit is the `HEAD` at write time and must be the pre-token commit.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { compareDirectories, createComparisonCache } from '../src/core/directory/compare.ts'
import { resolveComparisonSwitches } from '../src/core/text/normalize.ts'
import { buildDirectoryReportForComparison } from '../src/renderer/src/workbench/directoryReport.ts'
import { translate } from '../src/renderer/src/i18n/context.ts'
import { APP_VERSION } from '../src/shared/appVersion.ts'
import { DIRECTORY_SCENE } from '../src/shared/fixtures/index.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FACTS_PATH = join(ROOT, 'docs/visual/v1/baseline-facts.json')
const GENERATED_AT = '2026-11-04T00:00:00.000Z'
const WRITE = process.env.VISUAL_BASELINE_WRITE === '1'

/**
 * The immutable pre-token capture: commit `11170a5` is the baseline commit
 * whose `main.css` has no token source yet. This record survives every rewrite;
 * only `refreshed` follows the live recompute and the current `HEAD`.
 */
export const PRE_TOKEN = Object.freeze({
  commit: '11170a5d300b5318c320913eaf6fea54ac510173',
  appVersion: '0.2.20',
  capturedAt: '2026-11-04T17:06:57.558Z',
  bytes: 5367,
  sha256: '8cfacec99138c21ef24b5eead14d4171ec4f4d657e815f1b8ba888bfc830a69b'
})

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * Pure assembly of the record: the top-level commit/capturedAt stay on the
 * pre-token capture, `directoryHtml` keeps the flat recomputed pair (so
 * `ac-baseline-facts` still reads the same keys) and carries both sources.
 */
export function composeFacts(existing, computed) {
  const preToken = { ...(existing?.directoryHtml?.preToken ?? PRE_TOKEN) }
  return {
    commit: existing?.commit ?? PRE_TOKEN.commit,
    capturedAt: existing?.capturedAt ?? PRE_TOKEN.capturedAt,
    fourStateCounts: computed.fourStateCounts,
    ignoreSwitches: computed.ignoreSwitches,
    directoryHtml: {
      bytes: computed.directoryHtml.bytes,
      sha256: computed.directoryHtml.sha256,
      preToken,
      refreshed: {
        commit: computed.commit,
        appVersion: computed.appVersion,
        capturedAt: computed.capturedAt,
        bytes: computed.directoryHtml.bytes,
        sha256: computed.directoryHtml.sha256
      }
    }
  }
}

async function listDirectory(path) {
  return readdirSync(path, { withFileTypes: true }).map((entry) => {
    const full = join(path, entry.name)
    const stat = statSync(full)
    return {
      name: entry.name,
      path: full,
      isDirectory: entry.isDirectory(),
      size: stat.size,
      modifiedMs: stat.mtimeMs
    }
  })
}

async function readTextFile(path) {
  return readFileSync(path, 'utf8')
}

function writePair(scratch) {
  const left = join(scratch, 'left')
  const right = join(scratch, 'right')
  mkdirSync(join(left, 'src'), { recursive: true })
  mkdirSync(join(right, 'src'), { recursive: true })

  const write = (side, relative, text) => writeFileSync(join(scratch, side, relative), text)

  const written = []
  // Six identical files: same.
  for (let index = 0; index < 6; index += 1) {
    const text = `export const same${index} = ${index}\n`
    write('left', `src/same-${index}.ts`, text)
    write('right', `src/same-${index}.ts`, text)
    written.push(`src/same-${index}.ts`)
  }
  // Five files whose bodies differ: modified.
  for (let index = 0; index < 5; index += 1) {
    write('left', `src/modified-${index}.ts`, `export const value = ${index}\n`)
    write('right', `src/modified-${index}.ts`, `export const value = ${index + 100}\n`)
  }
  // Four left-only files: removed; four right-only files: added.
  for (let index = 0; index < 4; index += 1) {
    write('left', `src/removed-${index}.ts`, `export const gone = ${index}\n`)
    write('right', `src/added-${index}.ts`, `export const fresh = ${index}\n`)
  }

  // Same bytes with a different mtime still count as modified; pin the stamp so
  // the six identical pairs stay `same` across machines.
  const stamp = new Date('2026-01-01T00:00:00.000Z')
  for (const relative of written) {
    utimesSync(join(left, relative), stamp, stamp)
    utimesSync(join(right, relative), stamp, stamp)
  }

  return { left, right }
}

export async function computeReport() {
  const scratch = mkdtempSync(join(tmpdir(), 'oc-visual-facts-'))
  try {
    const { left, right } = writePair(scratch)
    const comparison = await compareDirectories(
      left,
      right,
      listDirectory,
      readTextFile,
      createComparisonCache()
    )

    // The counts must equal the built-in directory sample's authored answer key.
    const answerKey = DIRECTORY_SCENE.composition
    expect(comparison.counts).toEqual({
      same: answerKey.same,
      added: answerKey.added,
      removed: answerKey.removed,
      modified: answerKey.modified
    })

    const report = buildDirectoryReportForComparison(
      comparison,
      translate('en'),
      'en',
      true,
      GENERATED_AT
    )
    const switches = resolveComparisonSwitches({})

    return {
      html: report.html,
      fourStateCounts: {
        same: comparison.counts.same,
        added: comparison.counts.added,
        removed: comparison.counts.removed,
        modified: comparison.counts.modified
      },
      ignoreSwitches: {
        ignoreWhitespace: switches.ignoreWhitespace,
        ignoreNewline: switches.ignoreNewline,
        ignoreEncoding: switches.ignoreEncoding
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

export async function computeFacts() {
  const { html, fourStateCounts, ignoreSwitches } = await computeReport()

  return {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    capturedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    fourStateCounts,
    ignoreSwitches,
    directoryHtml: {
      bytes: Buffer.byteLength(html, 'utf8'),
      sha256: sha256(html)
    }
  }
}

it('records and then re-verifies the pre-token baseline facts', async () => {
  const facts = await computeFacts()
  const recorded = JSON.parse(readFileSync(FACTS_PATH, 'utf8'))

  if (WRITE) {
    writeFileSync(FACTS_PATH, `${JSON.stringify(composeFacts(recorded, facts), null, 2)}\n`)
    return
  }

  expect(recorded.commit).toMatch(/^[0-9a-f]{40}$/)
  expect(recorded.commit).toBe(PRE_TOKEN.commit)
  expect(recorded.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  expect(recorded.fourStateCounts).toEqual(facts.fourStateCounts)
  expect(recorded.ignoreSwitches).toEqual(facts.ignoreSwitches)

  const { directoryHtml } = recorded
  // Strict, per-character equality with the live recompute: any drift is red.
  expect(directoryHtml.refreshed.sha256).toBe(facts.directoryHtml.sha256)
  expect(directoryHtml.refreshed.bytes).toBe(facts.directoryHtml.bytes)
  expect(directoryHtml.refreshed.commit).toMatch(/^[0-9a-f]{40}$/)
  expect(directoryHtml.sha256).toBe(directoryHtml.refreshed.sha256)
  expect(directoryHtml.bytes).toBe(directoryHtml.refreshed.bytes)
  expect(directoryHtml.refreshed.appVersion).toBe(facts.appVersion)
  // The pre-token capture is immutable and still the top-level commit.
  expect(directoryHtml.preToken).toEqual(PRE_TOKEN)
  expect(directoryHtml.preToken.commit).toBe(recorded.commit)
  expect(directoryHtml.preToken.sha256).toBe(
    '8cfacec99138c21ef24b5eead14d4171ec4f4d657e815f1b8ba888bfc830a69b'
  )
  expect(directoryHtml.preToken.bytes).toBe(5367)
})

it('keeps the captured commit in history and before the token landing', () => {
  const recorded = JSON.parse(readFileSync(FACTS_PATH, 'utf8'))
  const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })

  git('cat-file', '-e', `${recorded.commit}^{commit}`)
  const history = git('rev-list', 'HEAD').split('\n').filter(Boolean)
  expect(history).toContain(recorded.commit)

  const css = git('show', `${recorded.commit}:src/renderer/src/assets/main.css`)
  expect(css).not.toContain('#0b0e12')
  expect(css).not.toContain('--height-control')
  expect(css).not.toMatch(/--text-(?:xs|sm|base|lg):/)

  const pkg = JSON.parse(git('show', `${recorded.commit}:package.json`))
  expect(pkg.version).toBe(recorded.directoryHtml.preToken.appVersion)
  expect(recorded.directoryHtml.preToken.commit).toBe(recorded.commit)
  expect(recorded.directoryHtml.preToken.sha256).toBe(
    '8cfacec99138c21ef24b5eead14d4171ec4f4d657e815f1b8ba888bfc830a69b'
  )
  expect(recorded.directoryHtml.preToken.bytes).toBe(5367)
})

it('proves the two sources differ only by the APP_VERSION string', async () => {
  const recorded = JSON.parse(readFileSync(FACTS_PATH, 'utf8'))
  const { preToken, refreshed } = recorded.directoryHtml
  const { html } = await computeReport()

  // The refreshed hash belongs to the live HTML at the current version.
  expect(sha256(html)).toBe(refreshed.sha256)
  expect(Buffer.byteLength(html, 'utf8')).toBe(refreshed.bytes)

  // Replacing only the current version string reproduces the pre-token bytes.
  expect(html).toContain(APP_VERSION)
  const preTokenHtml = html.split(APP_VERSION).join(preToken.appVersion)
  expect(Buffer.byteLength(preTokenHtml, 'utf8')).toBe(preToken.bytes)
  expect(sha256(preTokenHtml)).toBe(preToken.sha256)
})

it('preserves the pre-token segment when the write path only has recomputed values', () => {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
  const composed = composeFacts(undefined, {
    commit: head,
    capturedAt: '2026-11-04T22:42:28.000Z',
    appVersion: APP_VERSION,
    fourStateCounts: { same: 6, added: 4, removed: 4, modified: 5 },
    ignoreSwitches: { ignoreWhitespace: false, ignoreNewline: true, ignoreEncoding: true },
    directoryHtml: { bytes: 5367, sha256: 'current-recompute' }
  })

  expect(composed.commit).toBe('11170a5d300b5318c320913eaf6fea54ac510173')
  expect(composed.directoryHtml.preToken).toEqual(PRE_TOKEN)
  expect(composed.directoryHtml.refreshed.commit).toBe(head)
  expect(composed.directoryHtml.refreshed.appVersion).toBe(APP_VERSION)
  expect(composed.directoryHtml.sha256).toBe('current-recompute')
  expect(composed.directoryHtml.bytes).toBe(5367)
})
