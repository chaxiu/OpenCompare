/**
 * Single source of the application version.
 *
 * Imported from the root `package.json`, which is the same file the packaged
 * Electron app reports through `app.getVersion()`. Nothing else may hardcode a
 * version string; the report generator only receives this value and displays it.
 */
import pkg from '../../package.json'

export const APP_VERSION: string = pkg.version
