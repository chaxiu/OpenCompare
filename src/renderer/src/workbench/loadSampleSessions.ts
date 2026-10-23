import {
  CSV_SCENE,
  CODE_SCENE,
  DIRECTORY_SAMPLE_PATHS,
  STRUCTURED_SCENE,
  buildSampleSessions
} from '@shared/fixtures'
import type { SceneId } from '@shared/fixtures'
import type { PlatformPort } from '@shared/platform/types'
import { compareDirectories, createComparisonCache } from '@core/directory/compare'
import type { ComparisonCache } from '@core/directory/compare'
import { createDirectorySession } from './directoryCompare'
import type { WorkbenchSession } from './session'
import { parseCsvTable } from './session'
import { directorySides } from './snapshotOps'
import { digestFilesForComparison } from '../platform'

export interface LoadSampleOptions {
  /** Restrict the load to a single scene; omitted loads all four. */
  readonly scene?: SceneId
  /** Baseline-only control that exercises the error state. */
  readonly simulateFailure?: boolean
  /** Shared hash cache, so unchanged sample trees are not re-read. */
  readonly cache?: ComparisonCache
}

/**
 * Keeps the loading state on screen long enough to be perceived. The library
 * lives in memory, so parsing it finishes in a few milliseconds; without a
 * floor the state would flash.
 */
const LOADING_FLOOR_MS = 420

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * Stable failure of the built-in sample library. The shell maps it to copy in
 * the active language, so the thrown message is a diagnostic, never UI copy.
 */
export class SampleLibraryError extends Error {
  constructor(readonly code: 'read-failed') {
    super('The built-in sample library could not be read.')
    this.name = 'SampleLibraryError'
  }
}

/**
 * Loads the built-in sample library into workbench sessions.
 *
 * The directory scene is *computed* through the comparison engine rather than
 * read from the sample's authored answer key. Rejects when a scene cannot be
 * read, which drives the error state.
 */
export async function loadSampleSessions(
  platform: PlatformPort,
  options: LoadSampleOptions = {}
): Promise<readonly WorkbenchSession[]> {
  const startedAt = Date.now()

  if (options.simulateFailure) {
    await delay(LOADING_FLOOR_MS)
    throw new SampleLibraryError('read-failed')
  }

  const cache = options.cache ?? createComparisonCache()

  const sessions = await Promise.all(
    buildSampleSessions()
      .filter((session) => options.scene === undefined || session.scene === options.scene)
      .map(async (session): Promise<WorkbenchSession> => {
        switch (session.scene) {
          case 'directory': {
            const comparison = await compareDirectories(
              DIRECTORY_SAMPLE_PATHS.left,
              DIRECTORY_SAMPLE_PATHS.right,
              (path) => platform.listDirectory(path),
              (path) => platform.readTextFile(path),
              cache,
              undefined,
              {
                digestFiles: (paths) => digestFilesForComparison(platform, paths),
                listDirectories: (paths) => platform.listDirectories(paths)
              }
            )
            return createDirectorySession(
              comparison,
              directorySides(DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right)
            )
          }
          case 'csv':
            return {
              ...session,
              composition: CSV_SCENE.composition,
              tables: {
                left: parseCsvTable(CSV_SCENE.left),
                right: parseCsvTable(CSV_SCENE.right)
              }
            }
          case 'code':
            return { ...session, composition: CODE_SCENE.composition }
          case 'structured':
            return { ...session, composition: STRUCTURED_SCENE.composition }
        }
      })
  )

  const elapsed = Date.now() - startedAt
  if (elapsed < LOADING_FLOOR_MS) await delay(LOADING_FLOOR_MS - elapsed)

  return sessions
}
