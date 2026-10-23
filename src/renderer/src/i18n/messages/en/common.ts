import { common as zhCommon } from '../zh/common'

/** Mirrors `zh/common.ts` key for key; a missing or extra key fails typecheck. */
export const common: Record<keyof typeof zhCommon, string> = {
  'common.confirm': 'Confirm',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.retry': 'Try again',
  'common.dismiss': 'Dismiss',
  'common.loading': 'Loading…',
  'common.splitPane.divider': 'Resize panes',
  'common.error.title': 'Something went wrong',
  'common.error.unknown': 'Unknown error',
  'common.itemCount': '{count} items',
  'common.sessions': 'Sessions',
  'common.closeTitle': 'Close {title}',
  'common.unsavedChanges': 'Unsaved changes',
  'common.side.left': 'left',
  'common.side.right': 'right',
  'common.kind.file': 'file',
  'common.kind.folder': 'folder',
  'common.kind.directory': 'directory',
  'common.diff.same': 'Same',
  'common.diff.added': 'Added',
  'common.diff.removed': 'Removed',
  'common.diff.modified': 'Modified',
  'common.diff.conflict': 'Conflict',
  'common.fileKind.code': 'Code / text',
  'common.fileKind.csv': 'CSV',
  'common.fileKind.tsv': 'TSV',
  'common.fileKind.json': 'JSON',
  'common.fileKind.yaml': 'YAML'
}
