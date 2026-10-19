/**
 * Single source of truth for the file families a comparison can open.
 *
 * Shared by the renderer's drilldown classifier and the shared request
 * validation, so the whitelists cannot drift apart. Pure data + string helpers:
 * no Node, Electron or DOM imports.
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

/** Every extension a file comparison accepts, regardless of view family. */
export const SUPPORTED_FILE_EXTENSIONS: ReadonlySet<string> = new Set([
  ...TEXT_FILE_EXTENSIONS,
  ...CSV_FILE_EXTENSIONS,
  ...TSV_FILE_EXTENSIONS,
  ...JSON_FILE_EXTENSIONS,
  ...YAML_FILE_EXTENSIONS
])

/** Lower-cased extension without the dot; `''` for dotfiles and extension-less names. */
export function fileExtension(name: string): string {
  const trimmed = name.replace(/[\\/]+$/, '')
  const separator = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  const base = separator === -1 ? trimmed : trimmed.slice(separator + 1)
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return ''
  return base.slice(dot + 1).toLowerCase()
}

/** Whether a file name / path belongs to a supported comparison family. */
export function isSupportedComparisonFile(name: string): boolean {
  const extension = fileExtension(name)
  return extension === '' || SUPPORTED_FILE_EXTENSIONS.has(extension)
}
