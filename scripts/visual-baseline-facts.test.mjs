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
import { DIRECTORY_SCENE } from '../src/shared/fixtures/index.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FACTS_PATH = join(ROOT, 'docs/visual/v1/baseline-facts.json')
const GENERATED_AT = '2026-11-04T00:00:00.000Z'
const WRITE = process.env.VISUAL_BASELINE_WRITE === '1'

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

async function computeFacts() {
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
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
      capturedAt: new Date().toISOString(),
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
      },
      directoryHtml: {
        bytes: Buffer.byteLength(report.html, 'utf8'),
        sha256: createHash('sha256').update(report.html, 'utf8').digest('hex')
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

it('records and then re-verifies the pre-token baseline facts', async () => {
  const facts = await computeFacts()

  if (WRITE) {
    writeFileSync(FACTS_PATH, `${JSON.stringify(facts, null, 2)}\n`)
    return
  }

  const recorded = JSON.parse(readFileSync(FACTS_PATH, 'utf8'))
  expect(recorded.commit).toMatch(/^[0-9a-f]{40}$/)
  expect(recorded.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  expect(recorded.fourStateCounts).toEqual(facts.fourStateCounts)
  expect(recorded.ignoreSwitches).toEqual(facts.ignoreSwitches)
  expect(recorded.directoryHtml).toEqual(facts.directoryHtml)
})
