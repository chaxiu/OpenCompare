/**
 * Shared synthetic directory comparison for the >700k-row tree tests.
 *
 * Eight directories of 100,000 files cycle through all four statuses, so every
 * filter and both single-sided projections keep 70% of the files and a pane
 * still holds 700,009 rows — beyond the browser's 2^24 px layout cap. The tree
 * lives here rather than in a test file so the pure row-model suite and the
 * renderer suite exercise the same fixture instead of building two copies.
 */
import type { DirectoryComparison, DirectoryDiffNode, FileDiffStatus } from '@core/directory/compare'
import { FILE_DIFF_STATUSES } from '@core/directory/compare'

/** 6 of every 8 files exist on both sides; the other two are single-sided. */
const STATUS_PATTERN: readonly FileDiffStatus[] = [
  'same',
  'modified',
  'same',
  'added',
  'same',
  'modified',
  'same',
  'removed'
]

export const LARGE_DIRECTORY_COUNT = 8
export const LARGE_FILES_PER_DIRECTORY = 100_000
export const LARGE_FILE_COUNT = LARGE_DIRECTORY_COUNT * LARGE_FILES_PER_DIRECTORY
/** 7 of 8 files survive either single-sided projection, per directory. */
export const LARGE_SIDE_FILES_PER_DIRECTORY =
  (LARGE_FILES_PER_DIRECTORY / STATUS_PATTERN.length) * 7
/** Root + one row per directory + every file that survives one side. */
export const LARGE_ROW_COUNT =
  1 + LARGE_DIRECTORY_COUNT + LARGE_DIRECTORY_COUNT * LARGE_SIDE_FILES_PER_DIRECTORY

/** The projection only checks presence, so every node shares one dummy path. */
const LEFT_PATH = '/left/big'
const RIGHT_PATH = '/right/big'

const SINGLE_STATUS_COUNTS: Record<FileDiffStatus, Readonly<Record<FileDiffStatus, number>>> = {
  same: { same: 1, added: 0, removed: 0, modified: 0 },
  added: { same: 0, added: 1, removed: 0, modified: 0 },
  removed: { same: 0, added: 0, removed: 1, modified: 0 },
  modified: { same: 0, added: 0, removed: 0, modified: 1 }
}

function directoryStatus(counts: Readonly<Record<FileDiffStatus, number>>): FileDiffStatus {
  if (counts.added === 0 && counts.removed === 0 && counts.modified === 0) return 'same'
  if (counts.modified > 0) return 'modified'
  if (counts.added > 0 && counts.removed > 0) return 'modified'
  if (counts.added > 0) return 'added'
  return 'removed'
}

/** A real (not stubbed) 700,009-row-per-side comparison. */
export function createLargeDirectoryComparison(): DirectoryComparison {
  const counts: Record<FileDiffStatus, number> = { same: 0, added: 0, removed: 0, modified: 0 }
  const directories: DirectoryDiffNode[] = []

  for (let directoryIndex = 0; directoryIndex < LARGE_DIRECTORY_COUNT; directoryIndex += 1) {
    const directoryName = `dir-${directoryIndex}`
    const directoryCounts: Record<FileDiffStatus, number> = {
      same: 0,
      added: 0,
      removed: 0,
      modified: 0
    }
    const files: DirectoryDiffNode[] = []
    for (let fileIndex = 0; fileIndex < LARGE_FILES_PER_DIRECTORY; fileIndex += 1) {
      const status = STATUS_PATTERN[(fileIndex + directoryIndex) % STATUS_PATTERN.length]
      const name = `file-${fileIndex}.ts`
      directoryCounts[status] += 1
      files.push({
        name,
        relativePath: `${directoryName}/${name}`,
        kind: 'file',
        status,
        children: [],
        counts: SINGLE_STATUS_COUNTS[status],
        leftPath: status === 'added' ? undefined : LEFT_PATH,
        rightPath: status === 'removed' ? undefined : RIGHT_PATH
      })
    }
    for (const status of FILE_DIFF_STATUSES) counts[status] += directoryCounts[status]
    directories.push({
      name: directoryName,
      relativePath: directoryName,
      kind: 'directory',
      status: directoryStatus(directoryCounts),
      children: files,
      counts: directoryCounts,
      leftPath: LEFT_PATH,
      rightPath: RIGHT_PATH
    })
  }

  const root: DirectoryDiffNode = {
    name: 'big-root',
    relativePath: '',
    kind: 'directory',
    status: directoryStatus(counts),
    children: directories,
    counts,
    leftPath: LEFT_PATH,
    rightPath: RIGHT_PATH
  }
  return {
    leftRoot: '/left',
    rightRoot: '/right',
    leftName: 'left',
    rightName: 'right',
    root,
    counts,
    fileCount: LARGE_FILE_COUNT,
    leftSkipped: 0,
    rightSkipped: 0,
    skipped: 0
  }
}
