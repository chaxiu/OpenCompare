/**
 * Whitelisted IPC channel names shared by the main process handlers and the
 * preload bridge. Keep both sides on this single source of truth.
 */
export const PLATFORM_CHANNELS = {
  selectDirectory: 'platform:select-directory',
  listDirectory: 'platform:list-directory',
  readTextFile: 'platform:read-text-file',
  writeTextFile: 'platform:write-text-file',
  exists: 'platform:exists'
} as const
