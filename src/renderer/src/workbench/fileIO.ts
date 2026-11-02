/**
 * Shared local-file IO for the file-level views (code / CSV / structured).
 *
 * The dialogs live behind `PlatformPort`, so this module only binds a pick to a
 * read and exposes the filter presets the views share. It behaves identically
 * in the Electron and web runtimes.
 */
import type { FileDialogFilter, PlatformPort, TextFileFacts } from '@shared/platform/types'

/** Code / plain-text bodies for the two-column diff and the merge panes. */
const TEXT_FILE_EXTENSIONS = [
  'txt',
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'css',
  'html',
  'md',
  'py',
  'go',
  'rs',
  'java',
  'kt',
  'swift',
  'rb',
  'php',
  'c',
  'h',
  'cpp',
  'sql',
  'sh',
  'xml',
  'toml',
  'ini',
  'log'
] as const

/**
 * The code / text picker filter for one language: the name is the caller's
 * localized copy, never a module-level translation, while the extensions stay
 * byte-for-byte the same.
 */
export function textFileFilter(name: string): FileDialogFilter {
  return { name, extensions: TEXT_FILE_EXTENSIONS }
}

export const DELIMITED_FILE_FILTER: FileDialogFilter = {
  name: 'CSV / TSV',
  extensions: ['csv', 'tsv']
}

export const STRUCTURED_FILE_FILTER: FileDialogFilter = {
  name: 'JSON / YAML',
  extensions: ['json', 'jsonc', 'json5', 'yaml', 'yml']
}

export interface PickedTextFile {
  readonly path: string
  readonly text: string
  /** Original probe facts, present when the file was read through the probe seam. */
  readonly facts?: TextFileFacts
}

/** Opens a picker and reads the chosen file; resolves `null` when cancelled. */
export async function pickTextFile(
  platform: PlatformPort,
  title: string,
  filters: readonly FileDialogFilter[]
): Promise<PickedTextFile | null> {
  const path = await platform.selectFile({ title, filters })
  if (path === null) return null
  return { path, text: await platform.readTextFile(path) }
}

/**
 * Opens a picker and probes the chosen code file once, so the view can swap one
 * side with the body and the original facts from the same read.
 */
export async function pickProbedTextFile(
  platform: PlatformPort,
  title: string,
  filters: readonly FileDialogFilter[]
): Promise<PickedTextFile | null> {
  const path = await platform.selectFile({ title, filters })
  if (path === null) return null
  const { text, ...facts } = await platform.probeTextFile(path)
  return { path, text, facts }
}
