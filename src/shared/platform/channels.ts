/**
 * Whitelisted IPC channel names shared by the main process handlers and the
 * preload bridge. Keep both sides on this single source of truth.
 */
export const PLATFORM_CHANNELS = {
  homeDirectory: 'platform:home-directory',
  workingDirectory: 'platform:working-directory',
  selectDirectory: 'platform:select-directory',
  selectFile: 'platform:select-file',
  saveFile: 'platform:save-file',
  listDirectory: 'platform:list-directory',
  listDirectories: 'platform:list-directories',
  readTextFile: 'platform:read-text-file',
  digestFiles: 'platform:digest-files',
  cancelOperation: 'platform:cancel-operation',
  writeTextFile: 'platform:write-text-file',
  exists: 'platform:exists',
  statPath: 'platform:stat-path',
  ensureDirectory: 'platform:ensure-directory',
  deleteFile: 'platform:delete-file',
  temporaryDirectory: 'platform:temporary-directory',
  /** main → renderer: one compare request collected from the launch source. */
  compareRequest: 'platform:compare-request',
  /** renderer → main: the subscriber is listening, deliver queued requests. */
  compareRequestsReady: 'platform:compare-requests-ready',
  /** renderer → main: fetch the measurement config (harness mode only). */
  perfConfig: 'platform:perf-config',
  /** renderer → main: round boundary / completion events of a measurement run. */
  perfEvent: 'platform:perf-event'
} as const
