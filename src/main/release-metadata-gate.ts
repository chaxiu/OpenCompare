// Pure release update-metadata judgment. It mirrors the fail-closed rules of
// scripts/release-metadata.mjs and the release workflow, but consumes typed
// facts (asset names, reference lists, AppImage trailer decodings) instead of a
// directory, so it never reads fs and can run in plain Node.
export interface MetadataIssue {
  path: string
  code: string
  detail?: string
}

export interface MetadataFileFact {
  file: string
  refs: readonly string[]
}

export interface AppImageFact {
  /** latest*.yml that declares the entry. */
  file: string
  name: string
  blockMapSize: number | null
  /** File size, or null when the declared AppImage is missing. */
  size: number | null
  /** 4-byte trailer decoded both ways, or null when the file is too small. */
  tailLe: number | null
  tailBe: number | null
}

export interface ReleaseMetadataFacts {
  /** Label for the scanned metadata directory; no path is ever read here. */
  directoryLabel: string
  directoryReadable: boolean
  assets: readonly string[]
  metadataFiles: readonly MetadataFileFact[]
  appImages: readonly AppImageFact[]
}

export interface MetadataFileVerdict {
  file: string
  refs: string[]
  hits: number
}

export interface ReleaseMetadataVerdict {
  ok: boolean
  metadata: MetadataFileVerdict[]
  missing: string[]
  legacyHits: string[]
  issues: MetadataIssue[]
}

// electron-builder's default NSIS name is "OpenCompare Setup <ver>.exe"; GitHub
// normalizes the spaces to dots on upload. Only the hyphen form is valid here.
const LEGACY_WINDOWS_NAME = /OpenCompare[. ]Setup[. ]\d+\.\d+\.\d+\.exe(?:\.blockmap)?/g

export const findLegacyWindowsNames = (names: readonly string[]): string[] => {
  const hits = new Set<string>()
  for (const name of names) {
    for (const match of String(name).matchAll(LEGACY_WINDOWS_NAME)) hits.add(match[0])
  }
  return [...hits]
}

export const normalizeAssetNames = (assets: readonly string[]): string[] =>
  assets.map((name) => String(name).trim()).filter(Boolean)

const judgeAppImages = (facts: ReleaseMetadataFacts, issues: MetadataIssue[]): void => {
  for (const entry of facts.appImages) {
    if (entry.blockMapSize === null) {
      issues.push({ path: entry.file, code: 'blockmap-missing', detail: entry.name })
      continue
    }
    if (entry.size === null) {
      issues.push({ path: entry.file, code: 'appimage-missing', detail: entry.name })
      continue
    }
    if (entry.size < 4 || entry.tailLe === null || entry.tailBe === null) {
      issues.push({ path: entry.file, code: 'appimage-too-small', detail: entry.name })
      continue
    }
    const size = entry.size
    const candidates = [entry.tailLe, entry.tailBe]
    const inRange = candidates.filter((value) => value <= size)
    if (inRange.includes(entry.blockMapSize)) continue
    const detail = `${entry.name} LE=${entry.tailLe} BE=${entry.tailBe} blockMapSize=${entry.blockMapSize}`
    if (inRange.length === 0) {
      issues.push({ path: entry.file, code: 'blockmap-out-of-range', detail })
      continue
    }
    issues.push({ path: entry.file, code: 'blockmap-mismatch', detail })
  }
}

/** Fail-closed judgment of the update metadata against the release asset list. */
export const judgeReleaseMetadata = (facts: ReleaseMetadataFacts): ReleaseMetadataVerdict => {
  const issues: MetadataIssue[] = []
  const missing: string[] = []
  const metadata: MetadataFileVerdict[] = []
  const assetNames = normalizeAssetNames(facts.assets)
  const assetSet = new Set(assetNames)

  if (assetNames.length === 0) {
    issues.push({ path: 'assets', code: 'assets-empty' })
  }
  if (!facts.directoryReadable) {
    issues.push({ path: facts.directoryLabel, code: 'directory-unreadable' })
  } else if (facts.metadataFiles.length === 0) {
    issues.push({ path: facts.directoryLabel, code: 'metadata-missing' })
  }

  const allRefs: string[] = []
  for (const { file, refs } of facts.metadataFiles) {
    const fileMissing = refs.filter((ref) => !assetSet.has(ref))
    missing.push(...fileMissing)
    allRefs.push(...refs)
    if (refs.length === 0) issues.push({ path: file, code: 'refs-empty' })
    metadata.push({ file, refs: [...refs], hits: refs.length - fileMissing.length })
  }
  judgeAppImages(facts, issues)

  const legacyHits = findLegacyWindowsNames([...assetNames, ...allRefs])
  return {
    ok: issues.length === 0 && missing.length === 0 && legacyHits.length === 0,
    metadata,
    missing,
    legacyHits,
    issues
  }
}
