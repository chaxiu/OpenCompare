import { settings as zhSettings } from '../zh/settings'

/** Mirrors `zh/settings.ts` key for key. */
export const settings: Record<keyof typeof zhSettings, string> = {
  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.language.name': 'English',
  'settings.theme': 'Theme',
  'settings.theme.light': 'Light',
  'settings.theme.dark': 'Dark',
  'settings.theme.system': 'Follow system',
  'settings.close': 'Close settings',
  'settings.saved': 'Settings saved',
  'settings.saveError': 'Could not save settings: {reason}',
  'settings.samples.title': 'Samples & debugging',
  'settings.samples.description':
    'The built-in samples only help you explore each scene; comparing real files and folders never needs one. Picking one closes settings and opens its session.',
  'settings.samples.directory.description':
    'Open the built-in directory comparison with status filters and file drilldown',
  'settings.samples.code.description':
    'Open the built-in two-column diff and the base · ours · theirs three-way merge',
  'settings.samples.csv.description': 'Open the built-in CSV key alignment with shuffled keys',
  'settings.samples.structured.description': 'Open the built-in JSON / YAML semantic comparison',
  'settings.samples.remoteSnapshot': 'Remote snapshot',
  'settings.samples.remoteSnapshot.description':
    'Compare a built-in remote snapshot against a local directory',
  'settings.samples.failure.label': 'Demo: sample read failure',
  'settings.samples.failure.description':
    'For debugging: see the sample read error state and its retry'
}
