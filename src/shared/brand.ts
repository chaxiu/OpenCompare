import { join } from 'node:path'

/**
 * Brand identity shared by the window, the macOS dock and the native About
 * panel. Keeping the name and icon path here (plus in `build/icons/icon.svg`
 * for the artwork) means there is exactly one source for both.
 */
export const BRAND_NAME = 'OpenCompare'

export interface BrandIconPathInput {
  /** `app.isPackaged` from the main process. */
  readonly isPackaged: boolean
  /** `process.resourcesPath`, where `extraResources` lands when packaged. */
  readonly resourcesPath: string
  /** `app.getAppPath()`, the repository root in development. */
  readonly appPath: string
}

/**
 * Resolves the runtime icon PNG. Packaged bundles read the `extraResources`
 * copy at `<resourcesPath>/icon.png`; development reads the checked-in
 * `build/icon.png`. Both are the same artwork, so the window and dock icon never
 * diverge from the packaging icon.
 */
export function resolveBrandIconPath(input: BrandIconPathInput): string {
  return input.isPackaged
    ? join(input.resourcesPath, 'icon.png')
    : join(input.appPath, 'build', 'icon.png')
}

export interface BrandAboutPanelOptions {
  readonly applicationName: string
  readonly applicationVersion: string
  readonly iconPath: string
}

/**
 * Builds the native About panel options. The version is always injected by the
 * caller (the main process passes `app.getVersion()`), never hard-coded here.
 */
export function buildAboutPanelOptions(input: {
  readonly version: string
  readonly iconPath: string
}): BrandAboutPanelOptions {
  return {
    applicationName: BRAND_NAME,
    applicationVersion: input.version,
    iconPath: input.iconPath
  }
}
