import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { en, messages, zh } from './messages'
import { common as zhCommon } from './messages/zh/common'
import { directory as zhDirectory } from './messages/zh/directory'
import { files as zhFiles } from './messages/zh/files'
import { settings as zhSettings } from './messages/zh/settings'
import { shell as zhShell } from './messages/zh/shell'
import { common as enCommon } from './messages/en/common'
import { directory as enDirectory } from './messages/en/directory'
import { files as enFiles } from './messages/en/files'
import { settings as enSettings } from './messages/en/settings'
import { shell as enShell } from './messages/en/shell'

const SURFACES = ['common', 'directory', 'files', 'settings', 'shell']
const zhValues: Readonly<Record<string, string>> = zh
const enValues: Readonly<Record<string, string>> = en
const MESSAGES_DIR = join(process.cwd(), 'src/renderer/src/i18n/messages')

/** Product-accurate acrostics that stay Latin-script in Chinese too. */
const LATIN_ONLY_KEYS = new Set([
  'common.fileKind.csv',
  'common.fileKind.tsv',
  'common.fileKind.json',
  'common.fileKind.yaml',
  'shell.view.structured'
])

const PAIRS: Record<string, [Record<string, string>, Record<string, string>]> = {
  common: [zhCommon, enCommon],
  shell: [zhShell, enShell],
  directory: [zhDirectory, enDirectory],
  files: [zhFiles, enFiles],
  settings: [zhSettings, enSettings]
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '').sort()
}

describe('dictionary files', () => {
  it('keeps one zh and one en file per surface', () => {
    expect(readdirSync(join(MESSAGES_DIR, 'zh')).map((file) => file.replace(/\.ts$/, '')).sort()).toEqual(
      SURFACES
    )
    expect(readdirSync(join(MESSAGES_DIR, 'en')).map((file) => file.replace(/\.ts$/, '')).sort()).toEqual(
      SURFACES
    )
  })

  it('exposes the merged dictionaries only', () => {
    expect(Object.keys(messages).sort()).toEqual(['en', 'zh'])
    expect(messages.zh).toBe(zh)
    expect(messages.en).toBe(en)
  })
})

describe('dictionary key sets', () => {
  it('has the same merged key set in both languages', () => {
    expect(Object.keys(enValues).sort()).toEqual(Object.keys(zhValues).sort())
  })

  it('has the same key set per surface, so one surface cannot hide a gap', () => {
    for (const [surface, [zhSurface, enSurface]] of Object.entries(PAIRS)) {
      expect(Object.keys(enSurface).sort(), surface).toEqual(Object.keys(zhSurface).sort())
    }
  })
})

describe('dictionary values', () => {
  it('never ships an empty value or an untranslated marker', () => {
    for (const [key, value] of [...Object.entries(zhValues), ...Object.entries(enValues)]) {
      expect(typeof value, key).toBe('string')
      expect(value.trim(), key).not.toBe('')
      expect(value, key).not.toMatch(/TODO|未翻译/)
    }
  })

  it('keeps the same placeholder names for every key', () => {
    for (const key of Object.keys(zhValues)) {
      expect(placeholders(enValues[key] ?? ''), key).toEqual(placeholders(zhValues[key] ?? ''))
    }
  })

  it('never carries Han characters in the English dictionary', () => {
    for (const [key, value] of Object.entries(enValues)) {
      expect(value, key).not.toMatch(/\p{Script=Han}/u)
    }
  })

  it('keeps Chinese wording in the zh dictionary instead of copied English', () => {
    for (const [key, value] of Object.entries(zhValues)) {
      if (/^\{(\w+)\}$/.test(value.trim()) || LATIN_ONLY_KEYS.has(key)) continue
      expect(value, key).toMatch(/\p{Script=Han}/u)
    }
  })
})
