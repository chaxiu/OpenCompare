import { settings as zhSettings } from '../zh/settings'

/** Mirrors `zh/settings.ts` key for key. */
export const settings: Record<keyof typeof zhSettings, string> = {
  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.language.name': 'English',
  'settings.close': 'Close settings',
  'settings.saved': 'Settings saved',
  'settings.saveError': 'Could not save settings: {reason}'
}
