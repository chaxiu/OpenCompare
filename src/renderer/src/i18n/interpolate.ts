/** Values a `{name}` placeholder can be replaced with. */
export type InterpolationParams = Readonly<Record<string, string | number>>

/** Single placeholder form supported by the dictionary: `{name}`. */
const PLACEHOLDER = /\{(\w+)\}/g

/**
 * Replaces every `{name}` placeholder the params know about and leaves the
 * others untouched, so a missing value stays visible instead of rendering
 * `undefined`. The result is always plain text: markup inside a dictionary
 * value is never parsed.
 */
export function interpolate(template: string, params?: InterpolationParams): string {
  if (params === undefined) return template
  return template.replace(PLACEHOLDER, (match, name: string) => {
    const value = Object.hasOwn(params, name) ? params[name] : undefined
    return value === undefined ? match : String(value)
  })
}
