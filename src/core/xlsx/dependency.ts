/**
 * Pinned xlsx dependency record.
 *
 * The SheetJS CE release is vendored as the official CDN tarball so the version
 * cannot drift and the tarball can be re-checked offline. `pnpm` installs it
 * from `vendor/xlsx-0.20.3.tgz`; the recorded sha256 lives next to the tarball
 * (`vendor/xlsx-0.20.3.tgz.sha256`) and `src/xlsx-dep-gate.test.ts` verifies it
 * together with the installed version and the lockfile entry, failing on drift.
 *
 * Source: https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz (Apache-2.0)
 */
export const XLSX_DEPENDENCY = {
  name: 'xlsx',
  version: '0.20.3',
  sourceUrl: 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz',
  specifier: 'file:vendor/xlsx-0.20.3.tgz',
  tarball: 'vendor/xlsx-0.20.3.tgz',
  sha256File: 'vendor/xlsx-0.20.3.tgz.sha256',
  bytes: 2409319
} as const
