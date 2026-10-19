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
import type { ComparisonSides } from './snapshotOps'

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

/**
 * Editable state of one code file pair, owned by the session rather than the
 * view: a tab switch may unmount the view, but the unsaved working copies (and
 * the loaded bodies they are compared against) must survive it.
 */
export interface CodeFileBuffer {
  readonly leftPath: string
  readonly rightPath: string
  /** Bodies as loaded from disk / last saved; the reset target. */
  readonly leftSource: string
  readonly rightSource: string
  /** Working copies the per-block overwrite mutates. */
  readonly leftText: string
  readonly rightText: string
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
  /**
   * True while any side of the session carries unsaved edits (a file pair whose
   * working text no longer matches what was loaded from disk). Reported by the
   * active file view so a later close prompt can reuse the flag.
   */
  readonly dirty?: boolean
  /**
   * The code view's working copies kept on the session, so switching tabs does
   * not destroy unsaved work and the view always remounts from its real buffer.
   */
  readonly codeBuffer?: CodeFileBuffer
  /**
   * The directory session this file session was drilled out of. Set only on a
   * directory-tree drilldown, so the file view can offer「返回上级目录视图」and
   * two directory sessions never claim each other's same-path drilldown.
   */
  readonly parentDirectoryId?: string
  /**
   * The two inputs this directory session compares. They live on the session
   * rather than in one shell-wide slot, so several directory pairs can be opened
   * side by side without their pickers, drilldowns and snapshots crossing over.
   */
  readonly sides?: ComparisonSides
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
