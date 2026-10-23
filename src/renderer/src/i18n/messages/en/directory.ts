import { directory as zhDirectory } from '../zh/directory'

/** Mirrors `zh/directory.ts` key for key. */
export const directory: Record<keyof typeof zhDirectory, string> = {
  'directory.filter.label': 'Filter',
  'directory.filter.clear': 'Clear filter',
  'directory.tree.empty': 'No comparable entries in this directory',
  'directory.action.refresh': 'Refresh',
  'directory.summary.files': '{count} files'
}
