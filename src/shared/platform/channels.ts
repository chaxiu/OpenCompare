/**
 * Whitelisted IPC channel names shared by the main process handlers and the
 * preload bridge. Keep both sides on this single source of truth.
 */
export const PLATFORM_CHANNELS = {
  selectDirectory: 'platform:select-directory',
  selectFile: 'platform:select-file',
  saveFile: 'platform:save-file',
  listDirectory: 'platform:list-directory',
  readTextFile: 'platform:read-text-file',
  writeTextFile: 'platform:write-text-file',
  exists: 'platform:exists',
  ensureDirectory: 'platform:ensure-directory',
  deleteFile: 'platform:delete-file',
  temporaryDirectory: 'platform:temporary-directory'
} as const
