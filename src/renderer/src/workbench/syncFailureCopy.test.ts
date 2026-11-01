import { describe, expect, it } from 'vitest'
import { SyncRefreshError, SyncTargetError } from '@core/directory/sync'
import type { Language } from '@shared/platform/types'
import { translate } from '@renderer/i18n/context'
import { syncRefreshReasonCopy, syncTargetFailureCopy } from './syncFailureCopy'
import type { SyncCopyFragment, SyncFailureCopy } from './syncFailureCopy'

const TARGET_PATH = '/Users/you/target dir/report.csv'
const HAN = /\p{Script=Han}/u

/** Renders one copy the way a notice does: the nested reason first. */
function render(copy: SyncFailureCopy | SyncCopyFragment, language: Language): string {
  const t = translate(language)
  const params: Record<string, string | number> = {}
  for (const [name, value] of Object.entries(copy.params ?? {})) {
    params[name] = typeof value === 'object' ? t(value.message, value.params) : value
  }
  return t('key' in copy ? copy.key : copy.message, params)
}

function writeFailure(code: string | undefined, detail = '没有访问权限'): SyncFailureCopy {
  const copy = syncTargetFailureCopy(new SyncTargetError(TARGET_PATH, code, detail))
  if (copy === null) throw new Error('expected a localized write refusal')
  return copy
}

describe('sync write failure copy', () => {
  it.each(['EACCES', 'EPERM', 'EROFS', 'EBUSY', 'ENOSPC'])(
    'localizes %s with the target path and the raw OS code in both languages',
    (code) => {
      const copy = writeFailure(code)

      for (const language of ['zh', 'en'] as const) {
        const text = render(copy, language)
        expect(text, language).toContain(TARGET_PATH)
        expect(text, language).toContain(code)
        expect(text, language).not.toContain('Error invoking remote method')
      }

      // The zh copy is the paired Chinese reason.
      expect(render(copy, 'zh')).toMatch(HAN)
    }
  )

  it('falls back to neutral localized copy without leaking the core detail', () => {
    const copy = writeFailure(undefined, '无法写入目标目录')

    const zhText = render(copy, 'zh')
    expect(zhText).toContain(TARGET_PATH)
    expect(zhText).toContain('系统错误码')
    expect(zhText).not.toContain('无法写入目标目录')

    const enText = render(copy, 'en')
    expect(enText).toContain(TARGET_PATH)
    expect(enText).toContain('without a recognizable system error code')
    expect(enText).not.toMatch(HAN)
  })

  it('treats an unrecognized system code as the fallback', () => {
    const copy = writeFailure('EWHATSOEVER')
    expect(render(copy, 'en')).not.toContain('EWHATSOEVER')
    expect(render(copy, 'en')).toContain('without a recognizable system error code')
    expect(render(copy, 'zh')).toContain('系统错误码')
  })

  it('ignores a failure that is not a target refusal', () => {
    expect(syncTargetFailureCopy(new Error('EACCES: permission denied'))).toBeNull()
    expect(syncTargetFailureCopy('boom')).toBeNull()
  })
})

describe('sync refresh reason copy', () => {
  it('extracts the stable code from the platform detail and localizes it', () => {
    const error = new SyncRefreshError('无法读取目录 /tmp/out：没有访问权限（EROFS）。', {
      copied: 1,
      updated: 0,
      deleted: 0
    })
    const reason = syncRefreshReasonCopy(error)

    const zhText = translate('zh')(reason.message, reason.params)
    expect(zhText).toContain('只读')
    expect(zhText).toContain('EROFS')

    const enText = translate('en')(reason.message, reason.params)
    expect(enText).toContain('read-only')
    expect(enText).toContain('EROFS')
    expect(enText).not.toMatch(HAN)
  })

  it('reads an English node-style detail the same way', () => {
    const error = new SyncRefreshError('EACCES: permission denied, scandir /tmp/out', {
      copied: 2,
      updated: 1,
      deleted: 0
    })
    const reason = syncRefreshReasonCopy(error)
    expect(translate('en')(reason.message, reason.params)).toBe('permission denied (EACCES)')
  })

  it('falls back to neutral copy when the detail carries no stable code', () => {
    const error = new SyncRefreshError('无法读取目录 /tmp/out。', {
      copied: 0,
      updated: 0,
      deleted: 0
    })
    const reason = syncRefreshReasonCopy(error)

    expect(translate('zh')(reason.message, reason.params)).toContain('系统错误码')
    const enText = translate('en')(reason.message, reason.params)
    expect(enText).toContain('without a recognizable system error code')
    expect(enText).not.toMatch(HAN)
  })
})
