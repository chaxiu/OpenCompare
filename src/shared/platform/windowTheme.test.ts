import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseThemeTokens } from '@core/theme/contrast'
import { resolveWindowBackdrop, WINDOW_BACKDROP } from './windowTheme'

const css = readFileSync(join(process.cwd(), 'src/renderer/src/assets/main.css'), 'utf8')
const tokens = parseThemeTokens(css)

describe('window backdrop tokens', () => {
  it('equals the surface-base token in both themes', () => {
    expect(WINDOW_BACKDROP.dark).toBe(tokens.dark['surface-base'])
    expect(WINDOW_BACKDROP.light).toBe(tokens.light['surface-base'])
    expect(Object.keys(WINDOW_BACKDROP).sort()).toEqual(['dark', 'light'])
  })

  it('resolves each known theme and never invents a third colour', () => {
    expect(resolveWindowBackdrop('dark')).toBe(tokens.dark['surface-base'])
    expect(resolveWindowBackdrop('light')).toBe(tokens.light['surface-base'])
    const known = new Set([WINDOW_BACKDROP.dark, WINDOW_BACKDROP.light])
    for (const value of [undefined, null, '', 'system', 'sepia', 42]) {
      expect(known.has(resolveWindowBackdrop(value))).toBe(true)
    }
  })

  it('falls back to the dark token for unknown input', () => {
    expect(resolveWindowBackdrop('system')).toBe(WINDOW_BACKDROP.dark)
    expect(resolveWindowBackdrop(undefined)).toBe(WINDOW_BACKDROP.dark)
  })
})
