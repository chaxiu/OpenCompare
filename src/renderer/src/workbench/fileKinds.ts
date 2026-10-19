/**
 * Maps a directory-tree file onto the file view that should open it.
 *
 * Both PRD-accepted families route to views that already exist: code/text →
 * the two-column code view, CSV/TSV → the table view, JSON/YAML → the
 * structured view. Anything else is not a supported drilldown target.
 */
export type DrilldownKind = 'code' | 'csv' | 'structured'

export interface DrilldownTarget {
  readonly kind: DrilldownKind
  /** Human label for the drilldown session subtitle. */
  readonly label: string
  readonly delimiter?: string
  readonly format?: 'json' | 'yaml'
}

const TEXT_EXTENSIONS = new Set([
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

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return ''
  return name.slice(dot + 1).toLowerCase()
}

/** Trailing separator tolerant base name of a POSIX or Windows path. */
export function baseName(path: string): string {
  const normalized = path.replace(/[\\/]+$/, '')
  const separator = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  return separator === -1 ? normalized : normalized.slice(separator + 1)
}

export function classifyFile(name: string): DrilldownTarget | null {
  const extension = extensionOf(name)

  if (extension === 'csv') return { kind: 'csv', label: 'CSV', delimiter: ',' }
  if (extension === 'tsv') return { kind: 'csv', label: 'TSV', delimiter: '\t' }
  if (extension === 'json' || extension === 'jsonc' || extension === 'json5') {
    return { kind: 'structured', label: 'JSON', format: 'json' }
  }
  if (extension === 'yaml' || extension === 'yml') {
    return { kind: 'structured', label: 'YAML', format: 'yaml' }
  }
  if (extension === '' || TEXT_EXTENSIONS.has(extension)) return { kind: 'code', label: '代码 / 文本' }

  return null
}
