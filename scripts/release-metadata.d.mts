export interface MetadataFileReport {
  /** File name of the latest*.yml being checked. */
  file: string
  /** Every files[].url / path reference, normalized like the CI gate does. */
  refs: string[]
  /** Refs that do not name a release asset. */
  missing: string[]
  /** refs.length - missing.length */
  hits: number
}

export interface ReleaseMetadataReport {
  ok: boolean
  assets: string[]
  metadata: MetadataFileReport[]
  missing: string[]
  legacyHits: string[]
  problems: string[]
}

export function extractMetadataRefs(text: string): string[]

export function findLegacyWindowsNames(names: string[]): string[]

export function inspectReleaseMetadata(options: {
  dir?: string
  assets?: string[]
}): ReleaseMetadataReport

export function runReleaseMetadataCli(
  argv: string[],
  io?: { stdout?: (line: string) => void; stderr?: (line: string) => void }
): number
