/**
 * The workbench session model.
 *
 * A session is either a built-in sample scene or something the runtime produced:
 * a directory comparison result, or an ad-hoc file pair carrying the left/right
 * bodies of a directory-tree drilldown.
 */
import Papa from 'papaparse'
import type { CsvSample, FixtureSession, SampleComposition, TextSample } from '@shared/fixtures'
import type { DirectoryComparison } from '@core/directory/compare'

export interface CsvTable {
  readonly header: readonly string[]
  readonly rows: readonly (readonly string[])[]
}

export interface CsvTables {
  readonly left: CsvTable
  readonly right: CsvTable
}

/** Left/right text bodies of a file-level comparison. */
export interface FilePair {
  readonly left: TextSample
  readonly right: TextSample
}

/** Drilldown payload: file contents opened outside the sample library. */
export interface AdhocFilePair {
  readonly scene: 'code' | 'csv' | 'structured'
  readonly pair: FilePair
  /** CSV/TSV cell separator, when the payload came from a delimited file. */
  readonly delimiter?: string
  readonly format?: 'json' | 'yaml'
  readonly tables?: CsvTables
}

export interface WorkbenchSession extends FixtureSession {
  /** Diff-semantic counts backing the status bar legend, when known. */
  readonly composition?: SampleComposition
  /** Parsed CSV/TSV tables, present for the CSV scene only. */
  readonly tables?: CsvTables
  readonly adhoc?: AdhocFilePair
  readonly directory?: DirectoryComparison
}

/** Parses one CSV/TSV side into a header plus data rows. */
export function parseCsvTable(sample: CsvSample): CsvTable {
  if (sample.text.trim().length === 0) return { header: [], rows: [] }
  const result = Papa.parse<string[]>(sample.text.trimEnd(), { delimiter: sample.delimiter })
  const [header, ...rows] = result.data
  return { header, rows }
}

export function countTextLines(text: string): number {
  return text.length === 0 ? 0 : text.trimEnd().split('\n').length
}
