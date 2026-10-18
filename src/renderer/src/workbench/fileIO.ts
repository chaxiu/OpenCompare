/**
 * Shared local-file IO for the file-level views (code / CSV / structured).
 *
 * The dialogs live behind `PlatformPort`, so this module only binds a pick to a
 * read and exposes the filter presets the views share. It behaves identically
 * in the Electron and web runtimes.
 */
import type { FileDialogFilter, PlatformPort } from '@shared/platform/types'

/** Code / plain-text bodies for the two-column diff and the merge panes. */
export const TEXT_FILE_FILTER: FileDialogFilter = {
  name: '代码 / 文本',
  extensions: [
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
  ]
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
