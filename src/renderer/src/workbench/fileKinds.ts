/**
 * Maps a directory-tree file onto the file view that should open it.
 *
 * The extension whitelists and the "extension + content → family" decision live
 * in `@shared/fileExtensions`; this module only maps a family onto its view
 * target, so the classifier and the open path cannot drift apart.
 */
import type { TextBytesProbe } from '@core/text/probe'
import { isTextProbe } from '@core/text/probe'
import {
  extensionFamily,
  resolveFileFamily,
  type FileFamily
} from '@shared/fileExtensions'

export type DrilldownKind = 'code' | 'csv' | 'structured'

/** Stable file-family identity; the display name comes from the dictionary. */
export type FileKind = FileFamily

export interface DrilldownTarget {
  readonly kind: DrilldownKind
  /** Stable family identity, resolved to a display name at render time. */
  readonly label: FileKind
  readonly delimiter?: string
  readonly format?: 'json' | 'yaml'
}

/** Trailing separator tolerant base name of a POSIX or Windows path. */
export function baseName(path: string): string {
  const normalized = path.replace(/[\\/]+$/, '')
  const separator = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  return separator === -1 ? normalized : normalized.slice(separator + 1)
}

/** Family → view target. Mapping only, no extension logic. */
export function classifyFamily(family: FileFamily): DrilldownTarget {
  switch (family) {
    case 'csv':
      return { kind: 'csv', label: 'csv', delimiter: ',' }
    case 'tsv':
      return { kind: 'csv', label: 'tsv', delimiter: '\t' }
    case 'json':
      return { kind: 'structured', label: 'json', format: 'json' }
    case 'yaml':
      return { kind: 'structured', label: 'yaml', format: 'yaml' }
    case 'code':
      return { kind: 'code', label: 'code' }
  }
}

/** Extension-only classification; `null` means the content decides. */
export function classifyFile(name: string): DrilldownTarget | null {
  const family = extensionFamily(name)
  return family === null ? null : classifyFamily(family)
}

/**
 * The open path's only content decision: one probe result → family; `null`
 * means binary and therefore unsupported.
 */
export function contentFamily(
  name: string,
  probe: Pick<TextBytesProbe, 'text' | 'encoding'>
): FileKind | null {
  return resolveFileFamily(name, isTextProbe(probe) ? 'text' : 'binary')
}
