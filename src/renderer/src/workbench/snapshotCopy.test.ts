import { describe, expect, it } from 'vitest'
import { SnapshotContentError, SnapshotFormatError } from '@core/directory/snapshot'
import type { SnapshotErrorCode } from '@core/directory/snapshot'
import type { MessageKey } from '@renderer/i18n/messages'
import { messages } from '@renderer/i18n/messages'
import type { Language } from '@shared/platform/types'
import { snapshotContentCopy, snapshotImportCopy } from './snapshotCopy'
import type { SnapshotCopy } from './snapshotCopy'

function resolved(language: Language, copy: SnapshotCopy): string {
  let text: string = messages[language][copy.key]
  for (const [name, value] of Object.entries(copy.params ?? {})) {
    text = text.replace(`{${name}}`, value)
  }
  return text
}

function importCase(code: SnapshotErrorCode, path?: string): SnapshotFormatError {
  return new SnapshotFormatError(code, 'engine detail', path)
}

const IMPORT_CODES: readonly {
  readonly code: SnapshotErrorCode
  readonly path?: string
  readonly key: MessageKey
}[] = [
  { code: 'invalid-json', key: 'shell.snapshot.error.invalid-json' },
  { code: 'invalid-schema', key: 'shell.snapshot.error.invalid-schema' },
  { code: 'invalid-metadata', key: 'shell.snapshot.error.invalid-metadata' },
  { code: 'invalid-entry', key: 'shell.snapshot.error.invalid-entry' },
  { code: 'invalid-path', key: 'shell.snapshot.error.invalid-path' },
  {
    code: 'invalid-path',
    path: 'src/../a.ts',
    key: 'shell.snapshot.error.invalid-pathWithPath'
  },
  { code: 'duplicate-path', path: 'src/a.ts', key: 'shell.snapshot.error.duplicate-path' },
  { code: 'invalid-hash', path: 'src/a.ts', key: 'shell.snapshot.error.invalid-hash' }
]

describe('snapshot failure copy', () => {
  it('maps every known import failure to current-language copy', () => {
    for (const testCase of IMPORT_CODES) {
      const copy = snapshotImportCopy(importCase(testCase.code, testCase.path))
      expect(copy?.key, testCase.code).toBe(testCase.key)
      for (const language of ['zh', 'en'] as const) {
        const text = resolved(language, copy!)
        expect(text, `${language} ${testCase.code}`).not.toBe('')
        expect(text).not.toMatch(/未翻译|TODO/)
        if (testCase.path !== undefined) expect(text).toContain(testCase.path)
        if (language === 'en') expect(text).not.toMatch(/\p{Script=Han}/u)
      }
    }
  })

  it('keeps invalid-path readable when the engine carried no path', () => {
    const copy = snapshotImportCopy(importCase('invalid-path'))
    expect(resolved('zh', copy!)).toBe(messages.zh['shell.snapshot.error.invalid-path'])
    expect(resolved('en', copy!)).toBe(messages.en['shell.snapshot.error.invalid-path'])
  })

  it('maps both known content failures to current-language copy', () => {
    const cases = [
      {
        error: new SnapshotContentError('content-not-inlined', 'detail', 'src/a.ts'),
        key: 'shell.snapshot.error.content-not-inlined'
      },
      {
        error: new SnapshotContentError('not-found', 'detail', 'src/missing.ts'),
        key: 'shell.snapshot.error.content-missing'
      }
    ] as const

    for (const testCase of cases) {
      const copy = snapshotContentCopy(testCase.error, 'fallback/path.ts')
      expect(copy?.key).toBe(testCase.key)
      for (const language of ['zh', 'en'] as const) {
        const text = resolved(language, copy!)
        expect(text).toContain(testCase.error.path)
        expect(text).not.toMatch(/未翻译|TODO/)
        if (language === 'en') expect(text).not.toMatch(/\p{Script=Han}/u)
      }
    }
  })

  it('returns null for unknown failures so the shell can pass the detail through', () => {
    expect(snapshotImportCopy(new Error('EACCES: permission denied'))).toBeNull()
    expect(snapshotContentCopy(new Error('ECANCELED'), 'a.ts')).toBeNull()
  })
})
