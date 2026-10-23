/**
 * Maps a directory-tree file onto the file view that should open it.
 *
 * Both PRD-accepted families route to views that already exist: code/text →
 * the two-column code view, CSV/TSV → the table view, JSON/YAML → the
 * structured view. Anything else is not a supported drilldown target.
 *
 * The extension whitelists live in `@shared/fileExtensions` so request
 * validation and this classifier cannot drift apart.
 */
import {
  CSV_FILE_EXTENSIONS,
  JSON_FILE_EXTENSIONS,
  TEXT_FILE_EXTENSIONS,
  TSV_FILE_EXTENSIONS,
  YAML_FILE_EXTENSIONS
} from '@shared/fileExtensions'

export type DrilldownKind = 'code' | 'csv' | 'structured'

/** Stable file-family identity; the display name comes from the dictionary. */
export type FileKind = 'code' | 'csv' | 'tsv' | 'json' | 'yaml'

export interface DrilldownTarget {
  readonly kind: DrilldownKind
  /** Stable family identity, resolved to a display name at render time. */
  readonly label: FileKind
  readonly delimiter?: string
  readonly format?: 'json' | 'yaml'
}

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

  if (CSV_FILE_EXTENSIONS.has(extension)) return { kind: 'csv', label: 'csv', delimiter: ',' }
  if (TSV_FILE_EXTENSIONS.has(extension)) return { kind: 'csv', label: 'tsv', delimiter: '\t' }
  if (JSON_FILE_EXTENSIONS.has(extension)) {
    return { kind: 'structured', label: 'json', format: 'json' }
  }
  if (YAML_FILE_EXTENSIONS.has(extension)) {
    return { kind: 'structured', label: 'yaml', format: 'yaml' }
  }
  if (extension === '' || TEXT_FILE_EXTENSIONS.has(extension)) {
    return { kind: 'code', label: 'code' }
  }

  return null
}
