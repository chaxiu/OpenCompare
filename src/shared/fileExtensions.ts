/**
 * Single source of truth for the file families a comparison can open.
 *
 * Shared by the renderer's drilldown classifier and the open path, so the
 * whitelists cannot drift apart. An unknown extension no longer means
 * "unsupported": the open path decides from content (`resolveFileFamily`).
 * Pure data + string helpers: no Node, Electron or DOM imports.
 */
export const TEXT_FILE_EXTENSIONS: ReadonlySet<string> = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'css',
  'scss',
  'less',
  'html',
  'htm',
  'md',
  'markdown',
  'txt',
  'py',
  'go',
  'rs',
  'java',
  'kt',
  'kts',
  'swift',
  'rb',
  'php',
  'cs',
  'c',
  'h',
  'cpp',
  'hpp',
  'sql',
  'sh',
  'bash',
  'zsh',
  'fish',
  'xml',
  'svg',
  'ini',
  'toml',
  'conf',
  'cfg',
  'env',
  'log',
  'gradle'
])

export const CSV_FILE_EXTENSIONS: ReadonlySet<string> = new Set(['csv'])
export const TSV_FILE_EXTENSIONS: ReadonlySet<string> = new Set(['tsv'])
export const JSON_FILE_EXTENSIONS: ReadonlySet<string> = new Set(['json', 'jsonc', 'json5'])
export const YAML_FILE_EXTENSIONS: ReadonlySet<string> = new Set(['yaml', 'yml'])

/** A view family a comparison can render. Mirrors the renderer's `FileKind`. */
export type FileFamily = 'code' | 'csv' | 'tsv' | 'json' | 'yaml'

/** A byte probe's content verdict: only text reaches a comparison view. */
export type FileContentVerdict = 'text' | 'binary'

/** Lower-cased extension without the dot; `''` for dotfiles and extension-less names. */
export function fileExtension(name: string): string {
  const trimmed = name.replace(/[\\/]+$/, '')
  const separator = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  const base = separator === -1 ? trimmed : trimmed.slice(separator + 1)
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return ''
  return base.slice(dot + 1).toLowerCase()
}

/**
 * Extension-only family lookup. Known extensions and extension-less names /
 * dotfiles resolve here; an unknown extension returns `null` and the family is
 * decided by content instead. Never reads a file.
 */
export function extensionFamily(name: string): FileFamily | null {
  const extension = fileExtension(name)
  if (extension === '') return 'code'
  if (CSV_FILE_EXTENSIONS.has(extension)) return 'csv'
  if (TSV_FILE_EXTENSIONS.has(extension)) return 'tsv'
  if (JSON_FILE_EXTENSIONS.has(extension)) return 'json'
  if (YAML_FILE_EXTENSIONS.has(extension)) return 'yaml'
  if (TEXT_FILE_EXTENSIONS.has(extension)) return 'code'
  return null
}

/**
 * The single "extension + content → family" decision. `content` only matters
 * when the extension is unknown; unknown text opens as plain `code`, unknown
 * binary is unsupported (`null`).
 */
export function resolveFileFamily(name: string, content: FileContentVerdict): FileFamily | null {
  return extensionFamily(name) ?? (content === 'text' ? 'code' : null)
}
