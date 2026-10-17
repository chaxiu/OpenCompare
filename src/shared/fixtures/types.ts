/**
 * Domain types for the built-in sample library.
 *
 * Everything in `src/shared/fixtures/` is plain data plus pure functions: no
 * Electron, no DOM, no diff/merge computation. The authored `DiffStatus` and
 * `SampleComposition` values are the samples' answer key — a future algorithm
 * work item validates its output against them.
 */

/** Diff semantics — the core visual language of OpenCompare. */
export type DiffStatus = 'same' | 'added' | 'removed' | 'modified' | 'conflict'

/** The four built-in scenes; each scene becomes exactly one session. */
export type SceneId = 'directory' | 'code' | 'csv' | 'structured'

/** A text sample as served by the sample library. */
export interface TextSample {
  /** Absolute path inside the sample library, e.g. `/samples/code/summary.left.ts`. */
  readonly path: string
  readonly text: string
}

/** One directory tree node with its authored classification. */
export interface DirectoryNode {
  readonly name: string
  readonly kind: 'directory' | 'file'
  /** Authored answer key, never computed at runtime. */
  readonly status: DiffStatus
  readonly children?: readonly DirectoryNode[]
  /** File body; used when the library is served through `PlatformPort`. */
  readonly text?: string
}

/** Authored answer-key counts for one sample scene. */
export interface SampleComposition {
  readonly same: number
  readonly added: number
  readonly removed: number
  readonly modified: number
  readonly conflict: number
}

export interface DirectorySceneFixture {
  readonly scene: 'directory'
  readonly composition: SampleComposition
  /** Deeply nested source tree. */
  readonly left: DirectoryNode
  /** Deeply nested target tree. */
  readonly right: DirectoryNode
  /** Same logical files, stored across shuffled directory levels. */
  readonly scattered: DirectoryNode
}

export interface CodeSceneFixture {
  readonly scene: 'code'
  readonly composition: SampleComposition
  readonly diff: { readonly left: TextSample; readonly right: TextSample }
  readonly merge: {
    readonly base: TextSample
    readonly ours: TextSample
    readonly theirs: TextSample
  }
}

export interface CsvSample extends TextSample {
  /** Column delimiter of this side (CSV vs TSV). */
  readonly delimiter: string
}

export interface CsvSceneFixture {
  readonly scene: 'csv'
  readonly composition: SampleComposition
  /** Column names that identify a row, e.g. `order_id`. */
  readonly keyColumns: readonly string[]
  readonly left: CsvSample
  readonly right: CsvSample
}

export interface StructuredSceneFixture {
  readonly scene: 'structured'
  readonly composition: SampleComposition
  readonly json: { readonly left: TextSample; readonly right: TextSample }
  readonly yaml: { readonly left: TextSample; readonly right: TextSample }
}

/** A single file of the sample library, keyed by its virtual path. */
export interface SampleFile {
  readonly path: string
  readonly text: string
}

/** One status-bar entry of a session. */
export interface SessionStat {
  readonly label: string
  readonly value: number | string
  /** Optional diff-semantic tone, rendered as a coloured dot. */
  readonly tone?: DiffStatus
}

/** A workbench session descriptor: one sample library scene opened for review. */
export interface FixtureSession {
  readonly id: string
  readonly scene: SceneId
  readonly title: string
  readonly subtitle: string
  /** Panes the scene wants on screen (three-way merge uses three). */
  readonly columns: 2 | 3
  readonly stats: readonly SessionStat[]
}
