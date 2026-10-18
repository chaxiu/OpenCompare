export type ClassValue = string | false | null | undefined

/** Joins conditional class names. */
export function cx(...values: readonly ClassValue[]): string {
  return values.filter(Boolean).join(' ')
}

const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB'] as const

/** Human byte size used by the dry-run summaries (e.g. `1.5 KiB`). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(1)} ${BYTE_UNITS[unit]}`
}
