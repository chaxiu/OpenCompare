export type ClassValue = string | false | null | undefined

/** Joins conditional class names. */
export function cx(...values: readonly ClassValue[]): string {
  return values.filter(Boolean).join(' ')
}
