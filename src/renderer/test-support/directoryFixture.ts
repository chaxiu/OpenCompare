/**
 * Real on-disk directory fixture shared by the directory view and workbench
 * report suites.
 *
 * Two trees of 26,000 files each (plus 557 directories), one `big` directory
 * with 20,000 direct children, and at least 1,000 files of each of the four
 * statuses. `same` pairs share content and a pinned mtime so the engine settles
 * them by hash. Test-support only: nothing in the product imports this module.
 */
import { mkdir, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  compareDirectories,
  createComparisonCache
} from '@core/directory/compare'
import type { DirectoryComparison, FileDiffStatus } from '@core/directory/compare'
import type { DirectoryEntry } from '@shared/platform/types'

const FIXED_MTIME = new Date('2026-01-02T03:04:05.000Z')
const BIG_SAME = 10_000
const BIG_MODIFIED = 10_000
const BIG_COUNT = BIG_SAME + BIG_MODIFIED
const SAME_FILES = 3_500
const MODIFIED_FILES = 1_000
const REMOVED_FILES = 1_500
const ADDED_FILES = 1_500
const LEAF_DIR_COUNT = 500
const OTHER_FILES = SAME_FILES + MODIFIED_FILES + REMOVED_FILES + ADDED_FILES

export const REAL_FIXTURE_COUNTS: Readonly<Record<FileDiffStatus, number>> = {
  same: BIG_SAME + SAME_FILES,
  added: ADDED_FILES,
  removed: REMOVED_FILES,
  modified: BIG_MODIFIED + MODIFIED_FILES
}

export interface RealDirectoryFixture {
  readonly root: string
  readonly left: string
  readonly right: string
  readonly comparison: DirectoryComparison
}

/** `g{g}/s{s}/t{t}`: three directory levels below the root. */
function leafDirectory(index: number): string {
  const group = Math.floor(index / 100)
  const sub = Math.floor((index % 100) / 10)
  const leaf = index % 10
  return `g${group}/s${sub}/t${leaf}`
}

/** Lists one real directory in the shape `PlatformPort.listDirectory` uses. */
export async function listRealDirectory(directory: string): Promise<readonly DirectoryEntry[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  return Promise.all(
    entries.map(async (entry) => {
      const full = path.join(directory, entry.name)
      const info = await stat(full)
      return {
        name: entry.name,
        path: full,
        isDirectory: entry.isDirectory(),
        size: info.size,
        modifiedMs: info.mtimeMs
      }
    })
  )
}

export async function createRealDirectoryFixture(): Promise<RealDirectoryFixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'opencompare-directory-view-'))
  const left = path.join(root, 'left')
  const right = path.join(root, 'right')
  await mkdir(path.join(left, 'big'), { recursive: true })
  await mkdir(path.join(right, 'big'), { recursive: true })

  const samePairs: { readonly left: string; readonly right: string }[] = []

  for (let index = 0; index < BIG_COUNT; index += 1) {
    const name = `big-${String(index).padStart(5, '0')}.txt`
    const leftPath = path.join(left, 'big', name)
    const rightPath = path.join(right, 'big', name)
    if (index < BIG_SAME) {
      const content = `big same ${index}`
      await writeFile(leftPath, content)
      await writeFile(rightPath, content)
      samePairs.push({ left: leftPath, right: rightPath })
    } else {
      await writeFile(leftPath, `big modified ${index}`)
      await writeFile(rightPath, `big modified ${index} with more bytes`)
    }
  }

  for (let index = 0; index < LEAF_DIR_COUNT; index += 1) {
    const relative = leafDirectory(index)
    await mkdir(path.join(left, relative), { recursive: true })
    await mkdir(path.join(right, relative), { recursive: true })
  }

  for (let index = 0; index < OTHER_FILES; index += 1) {
    const relative = leafDirectory(index % LEAF_DIR_COUNT)
    const name = `leaf-${String(index).padStart(5, '0')}.txt`
    const leftPath = path.join(left, relative, name)
    const rightPath = path.join(right, relative, name)
    if (index < SAME_FILES) {
      const content = `leaf same ${index}`
      await writeFile(leftPath, content)
      await writeFile(rightPath, content)
      samePairs.push({ left: leftPath, right: rightPath })
    } else if (index < SAME_FILES + MODIFIED_FILES) {
      await writeFile(leftPath, `leaf modified ${index}`)
      await writeFile(rightPath, `leaf modified ${index} with more bytes`)
    } else if (index < SAME_FILES + MODIFIED_FILES + REMOVED_FILES) {
      await writeFile(leftPath, `leaf removed ${index}`)
    } else {
      await writeFile(rightPath, `leaf added ${index}`)
    }
  }

  await Promise.all(
    samePairs.map(async (pair) => {
      await utimes(pair.left, FIXED_MTIME, FIXED_MTIME)
      await utimes(pair.right, FIXED_MTIME, FIXED_MTIME)
    })
  )

  const comparison = await compareDirectories(
    left,
    right,
    listRealDirectory,
    (file) => readFile(file, 'utf8'),
    createComparisonCache(),
    undefined,
    { concurrency: 32 }
  )
  return { root, left, right, comparison }
}

export async function removeRealDirectoryFixture(fixture: RealDirectoryFixture): Promise<void> {
  await rm(fixture.root, { recursive: true, force: true })
}
