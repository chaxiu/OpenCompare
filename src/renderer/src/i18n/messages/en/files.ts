import { files as zhFiles } from '../zh/files'

/** Mirrors `zh/files.ts` key for key. */
export const files: Record<keyof typeof zhFiles, string> = {
  'files.action.save': 'Save',
  'files.action.revert': 'Revert',
  'files.action.copy': 'Copy',
  'files.empty': 'Nothing to show',
  'files.unsavedChanges': 'Unsaved changes'
}
