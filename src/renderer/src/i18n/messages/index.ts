import type { Language } from '@shared/platform/types'
import { common as zhCommon } from './zh/common'
import { directory as zhDirectory } from './zh/directory'
import { files as zhFiles } from './zh/files'
import { settings as zhSettings } from './zh/settings'
import { shell as zhShell } from './zh/shell'
import { common as enCommon } from './en/common'
import { directory as enDirectory } from './en/directory'
import { files as enFiles } from './en/files'
import { settings as enSettings } from './en/settings'
import { shell as enShell } from './en/shell'

/**
 * Merged dictionaries. The five surfaces are aggregated here and nowhere else,
 * so a surface is only ever added as a zh/en pair.
 */
export const zh = {
  ...zhCommon,
  ...zhShell,
  ...zhDirectory,
  ...zhFiles,
  ...zhSettings
} as const

/** Every dictionary key, derived from the zh source of truth. */
export type MessageKey = keyof typeof zh

export const en = {
  ...enCommon,
  ...enShell,
  ...enDirectory,
  ...enFiles,
  ...enSettings
} satisfies Record<MessageKey, string>

export const messages: Record<Language, Readonly<Record<MessageKey, string>>> = { zh, en }
