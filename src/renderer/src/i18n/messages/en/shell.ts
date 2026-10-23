import { shell as zhShell } from '../zh/shell'

/** Mirrors `zh/shell.ts` key for key. */
export const shell: Record<keyof typeof zhShell, string> = {
  'shell.app.ready': 'Ready',
  'shell.settings.open': 'Open settings',
  'shell.notification.dismiss': 'Dismiss notification',
  'shell.loading.preparing': 'Preparing…'
}
