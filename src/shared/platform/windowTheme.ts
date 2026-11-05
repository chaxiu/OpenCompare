/**
 * Window backdrop per resolved theme. Zero DOM / zero Electron: the main
 * process only needs the concrete value, and the palette test proves both
 * entries equal `--color-surface-base` read from `main.css`, so this is a token
 * value rather than a second colour.
 */
export const WINDOW_BACKDROP: Readonly<Record<'light' | 'dark', string>> = {
  light: '#ffffff',
  dark: '#0b0e12'
}

/**
 * Backdrop of one resolved theme. Unknown input (a missing native answer, a
 * corrupt mode) falls back to the dark token instead of inventing a colour.
 */
export function resolveWindowBackdrop(theme: unknown): string {
  if (theme === 'light') return WINDOW_BACKDROP.light
  if (theme === 'dark') return WINDOW_BACKDROP.dark
  return WINDOW_BACKDROP.dark
}
