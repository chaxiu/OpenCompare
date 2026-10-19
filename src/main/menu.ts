import type { MenuItemConstructorOptions } from 'electron'
import { BRAND_NAME } from '../shared/brand'

/**
 * Application menu template. Kept as pure data (no Electron runtime import) so
 * it can be asserted directly in unit tests. macOS gets the conventional app
 * menu with the native About role; Windows/Linux expose the same About entry
 * under Help. Edit and view menus are preserved so copy/paste and reload
 * shortcuts keep working.
 */
export function createMenuTemplate(input: { readonly isMac: boolean }): MenuItemConstructorOptions[] {
  const aboutItem: MenuItemConstructorOptions = {
    role: 'about',
    label: `About ${BRAND_NAME}`
  }

  if (input.isMac) {
    return [
      {
        label: BRAND_NAME,
        submenu: [
          aboutItem,
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' }
    ]
  }

  return [
    { role: 'editMenu' },
    { role: 'viewMenu' },
    {
      role: 'help',
      submenu: [aboutItem]
    }
  ]
}
