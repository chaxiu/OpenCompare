import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')

describe('native theme wiring', () => {
  it('restores the persisted mode before the first window and before launch', () => {
    const readIndex = source.indexOf('await readUserSettings()')
    const assignIndex = source.indexOf('nativeTheme.themeSource')
    const readyIndex = source.indexOf('launch.onAppReady()')
    expect(readIndex).toBeGreaterThan(-1)
    expect(assignIndex).toBeGreaterThan(readIndex)
    expect(readyIndex).toBeGreaterThan(assignIndex)
    expect(source).toContain('isTheme(settings?.theme)')
    expect(source).toContain('DEFAULT_THEME')
  })

  it('registers one native update listener and repaints every window', () => {
    expect(source.match(/nativeTheme\.on\('updated', applyWindowBackdrop\)/g)).toHaveLength(1)
    expect(source).toContain('BrowserWindow.getAllWindows()')
    expect(source).toContain('window.setBackgroundColor(backdrop)')
    expect(source).toContain('onNativeThemeChanged: applyWindowBackdrop')
  })

  it('never reintroduces a backdrop literal or a second settings reader', () => {
    expect(source).not.toContain('#0b0d12')
    expect(source).toMatch(/backgroundColor:\s*resolveWindowBackdrop\(/)
    expect(source).not.toContain('parseUserSettingsJson')
    expect(source).not.toContain('settings.json')
  })

  it('keeps the native menu and never draws custom window chrome', () => {
    expect(source).toContain('Menu.setApplicationMenu(')
    expect(source).toContain('createMenuTemplate(')
    expect(source).not.toContain('titleBarStyle')
    expect(source).not.toContain('titleBarOverlay')
    expect(source).not.toMatch(/frame:\s*false/)
  })
})
