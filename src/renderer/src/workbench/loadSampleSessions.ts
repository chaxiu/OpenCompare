import Papa from 'papaparse'
import { CSV_SCENE, buildSampleSessions } from '@shared/fixtures'
import type { CsvSample, FixtureSession, SceneId } from '@shared/fixtures'

export interface CsvTable {
  readonly header: readonly string[]
  readonly rows: readonly (readonly string[])[]
}

export interface CsvTables {
  readonly left: CsvTable
  readonly right: CsvTable
}

/** A session plus the presentation data a view needs. */
export interface LoadedSession extends FixtureSession {
  /** Parsed CSV/TSV tables — present for the CSV scene only. */
  readonly tables?: CsvTables
}

export interface LoadSampleOptions {
  /** Restrict the load to a single scene; omitted loads all four. */
  readonly scene?: SceneId
  /** Baseline-only control that exercises the error state. */
  readonly simulateFailure?: boolean
}

/**
 * Keeps the loading state on screen long enough to be perceived. The library
 * lives in memory, so parsing it finishes in a few milliseconds; without a
 * floor the state would flash. Real file-backed sessions will do genuine I/O.
 */
const LOADING_FLOOR_MS = 420

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function parseTable(sample: CsvSample): CsvTable {
  const result = Papa.parse<string[]>(sample.text.trimEnd(), { delimiter: sample.delimiter })
  const [header, ...rows] = result.data
  return { header, rows }
}

/**
 * Loads the built-in sample library into workbench sessions.
 *
 * Rejects when the sample library cannot be read, which drives the error state.
 */
export async function loadSampleSessions(
  options: LoadSampleOptions = {}
): Promise<readonly LoadedSession[]> {
  const startedAt = Date.now()

  if (options.simulateFailure) {
    await delay(LOADING_FLOOR_MS)
    throw new Error('无法读取内置样本库：/samples/csv/orders.left.csv 不存在。')
  }

  const sessions = buildSampleSessions()
    .filter((session) => options.scene === undefined || session.scene === options.scene)
    .map<LoadedSession>((session) =>
      session.scene === 'csv'
        ? {
            ...session,
            tables: { left: parseTable(CSV_SCENE.left), right: parseTable(CSV_SCENE.right) }
          }
        : session
    )

  const elapsed = Date.now() - startedAt
  if (elapsed < LOADING_FLOOR_MS) await delay(LOADING_FLOOR_MS - elapsed)

  return sessions
}
