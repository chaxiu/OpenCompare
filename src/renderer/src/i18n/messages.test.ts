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
  'shell.view.structured',
  // Merge accept actions and side names are existing English technical words.
  'files.merge.accept.ours',
  'files.merge.accept.theirs',
  'files.merge.accept.both',
  'files.merge.accept.base',
  'files.merge.choice.ours',
  'files.merge.choice.theirs',
  'files.merge.choice.both',
  'files.merge.choice.base',
  'files.merge.side.base',
  'files.merge.side.ours',
  'files.merge.side.theirs',
  // Format identifiers stay JSON / YAML in both dictionaries.
  'files.structured.format.json',
  'files.structured.format.yaml'
])

const PAIRS: Record<string, [Record<string, string>, Record<string, string>]> = {
  common: [zhCommon, enCommon],
  shell: [zhShell, enShell],
  directory: [zhDirectory, enDirectory],
  files: [zhFiles, enFiles],
  settings: [zhSettings, enSettings]
}

/**
 * Label fragments the layout renders immediately before or after a monospace
 * path, so their one boundary space is part of the sentence, not stray input.
 */
const INLINE_COPY_KEYS = new Set([
  'directory.sync.targetRoot',
  'directory.sync.materialize',
  'directory.sync.total.one',
  'directory.sync.total.other',
  'directory.template.label.template',
  'directory.template.label.incoming',
  'directory.template.label.output'
])

/** Canonical American-English forms of the product's core concepts. */
const GLOSSARY = [
  'comparison',
  'difference',
  'conflict',
  'snapshot',
  'sync',
  'template',
  'key column',
  'session'
] as const

/** Spelling and case variants the English dictionary must never carry. */
const BANNED_VARIANTS = [
  'Synchronisation',
  'Snap shot',
  'Comparision',
  'Cancelation',
  'colour',
  'behaviour'
] as const

/** Change blocks and change counts always say difference(s), never diff. */
const DIFFERENCE_ONLY_KEYS = [
  'shell.stat.differences',
  'files.code.prevDifference',
  'files.code.nextDifference',
  'files.code.blocks',
  'directory.filter.differences',
  'files.csv.filter.differences'
] as const

/** Diff is only a view / mode name. */
const DIFF_VIEW_KEYS = ['shell.view.code', 'files.code.mode.diff'] as const

function glossaryPattern(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  return new RegExp(`\\b${escaped}(?:s|es)?\\b`, 'i')
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

  it('drops the view switcher label but keeps the four scene labels', () => {
    expect(zhValues['shell.viewSwitcher.label']).toBeUndefined()
    expect(enValues['shell.viewSwitcher.label']).toBeUndefined()
    for (const key of [
      'shell.view.directory',
      'shell.view.code',
      'shell.view.csv',
      'shell.view.structured'
    ] as const) {
      expect(zhValues[key]).toBeTruthy()
      expect(enValues[key]).toBeTruthy()
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

  it('ships clean English copy without placeholders, Han text or stray whitespace', () => {
    for (const [key, value] of Object.entries(enValues)) {
      expect(value.trim(), key).not.toBe('')
      expect(value, key).not.toMatch(/TODO|未翻译/)
      expect(value, key).not.toMatch(/\p{Script=Han}/u)
      expect(value.includes('  '), key).toBe(false)
      if (INLINE_COPY_KEYS.has(key)) {
        // Exactly one boundary space on one side only; never on both.
        expect(value.startsWith(' ') && value.endsWith(' '), key).toBe(false)
        expect(value.startsWith('  ') || value.endsWith('  '), key).toBe(false)
        expect(value.trim(), key).not.toBe('')
      } else {
        expect(value, key).toBe(value.trim())
      }
    }
  })
})

describe('English glossary', () => {
  it('uses every canonical core-concept word form at least once', () => {
    const all = Object.values(enValues).join('\n')
    for (const term of GLOSSARY) {
      expect(glossaryPattern(term).test(all), term).toBe(true)
    }
  })

  it('never carries a banned spelling or case variant', () => {
    const all = Object.values(enValues).join('\n')
    for (const variant of BANNED_VARIANTS) {
      expect(all.toLowerCase(), variant).not.toContain(variant.toLowerCase())
    }
  })

  it('uses difference(s) for change blocks and diff only as a view or mode name', () => {
    for (const key of DIFFERENCE_ONLY_KEYS) {
      expect(enValues[key], key).toMatch(/difference/i)
      expect(enValues[key], key).not.toMatch(/\bdiff(s|ed|ing)?\b/i)
    }
    for (const key of DIFF_VIEW_KEYS) {
      expect(enValues[key], key).toMatch(/\bdiff\b/i)
    }
  })
})
