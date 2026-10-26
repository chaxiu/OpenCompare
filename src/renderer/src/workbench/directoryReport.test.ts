import { describe, expect, it } from 'vitest'
import type { DirectoryComparison, DirectoryDiffNode, FileDiffStatus } from '@core/directory/compare'
import {
  DIRECTORY_REPORT_MAX_BYTES,
  DIRECTORY_REPORT_MAX_ROWS,
  buildDirectoryReport,
  directoryReportSource
} from '@core/directory/report'
import { APP_VERSION } from '@shared/appVersion'
import { DIFF_LABEL_KEYS } from '@renderer/components/diffSemantics'
import { translate } from '@renderer/i18n/context'
import { interpolate } from '@renderer/i18n/interpolate'
import { htmlLang } from '@renderer/i18n/htmlLang'
import { en, zh } from '@renderer/i18n/messages'
import {
  buildDirectoryReportForComparison,
  directoryReportFileName,
  directoryReportFilter,
  directoryReportSaveCopy,
  directoryReportStrings
} from './directoryReport'

const GENERATED_AT = '2026-10-26T08:00:00.000Z'

function makeFile(name: string, status: FileDiffStatus): DirectoryDiffNode {
  return {
    name,
    relativePath: name,
    kind: 'file',
    status,
    children: [],
    counts: {
      same: status === 'same' ? 1 : 0,
      added: status === 'added' ? 1 : 0,
      removed: status === 'removed' ? 1 : 0,
      modified: status === 'modified' ? 1 : 0
    },
    leftPath: `/Users/alice/work/left/${name}`,
    rightPath: `/Users/alice/work/right/${name}`
  }
}

/** One directory holding a file of each status, under two `/Users` roots. */
function comparison(): DirectoryComparison {
  const counts = { same: 1, added: 1, removed: 1, modified: 1 }
  const src: DirectoryDiffNode = {
    name: 'src',
    relativePath: 'src',
    kind: 'directory',
    status: 'modified',
    children: [
      makeFile('same.txt', 'same'),
      makeFile('added.txt', 'added'),
      makeFile('removed.txt', 'removed'),
      makeFile('modified.txt', 'modified')
    ],
    counts,
    leftPath: '/Users/alice/work/left/src',
    rightPath: '/Users/alice/work/right/src'
  }
  return {
    leftRoot: '/Users/alice/work/left',
    rightRoot: '/Users/alice/work/right',
    leftName: 'left',
    rightName: 'right',
    root: {
      name: 'left',
      relativePath: '',
      kind: 'directory',
      status: 'modified',
      children: [src],
      counts,
      leftPath: '/Users/alice/work/left',
      rightPath: '/Users/alice/work/right'
    },
    counts,
    fileCount: 4,
    leftSkipped: 0,
    rightSkipped: 0,
    skipped: 0
  }
}

describe('directoryReportFileName', () => {
  it('joins both names with the report suffix', () => {
    expect(directoryReportFileName('left', 'right')).toBe('left-vs-right.html')
  })

  it('replaces save-dialog reserved characters and trailing spaces', () => {
    expect(directoryReportFileName('a/b\\c:d*e?f"g<h>i|j', 'name  ')).toBe(
      'a_b_c_d_e_f_g_h_i_j-vs-name.html'
    )
  })

  it('falls back to a plain name for blank inputs and never keeps a path', () => {
    expect(directoryReportFileName('  ', '')).toBe('directory-vs-directory.html')
    const absolute = directoryReportFileName('/Users/alice/work/left', '/Users/alice/work/right')
    expect(absolute.startsWith('/')).toBe(false)
    expect(absolute.includes('/')).toBe(false)
    expect(absolute.endsWith('.html')).toBe(true)
  })
})

describe('directoryReportFilter', () => {
  it('offers the HTML extensions under the caller-provided dialog name', () => {
    expect(directoryReportFilter('HTML report')).toEqual({
      name: 'HTML report',
      extensions: ['html', 'htm']
    })
  })
})

describe('directoryReportStrings', () => {
  it('resolves every report string from the active dictionary', () => {
    for (const language of ['zh', 'en'] as const) {
      const strings = directoryReportStrings(translate(language))
      const dictionary = language === 'zh' ? zh : en

      expect(strings.title).toBe(dictionary['directory.report.title'])
      expect(strings.privacyNotice).toBe(dictionary['directory.report.privacyNotice'])
      expect(strings.generatedAt).toBe(dictionary['directory.report.generatedAt'])
      expect(strings.appVersion).toBe(dictionary['directory.report.appVersion'])
      expect(strings.leftRoot).toBe(dictionary['directory.report.leftRoot'])
      expect(strings.rightRoot).toBe(dictionary['directory.report.rightRoot'])
      expect(strings.limits).toBe(dictionary['directory.report.limits'])
      expect(strings.scopeAll).toBe(dictionary['directory.report.scopeAll'])
      expect(strings.countsHeading).toBe(dictionary['directory.report.countsHeading'])
      expect(strings.columns).toEqual({
        path: dictionary['directory.report.columns.path'],
        leftSize: dictionary['directory.report.columns.leftSize'],
        rightSize: dictionary['directory.report.columns.rightSize'],
        status: dictionary['directory.report.columns.status']
      })
      expect(strings.truncated).toBe(dictionary['directory.report.truncated'])
      expect(strings.truncatedHint).toBe(dictionary['directory.report.truncatedHint'])
      expect(strings.empty).toBe(dictionary['directory.report.empty'])
      for (const status of ['same', 'added', 'removed', 'modified'] as const) {
        expect(strings.status[status]).toBe(dictionary[DIFF_LABEL_KEYS[status]])
      }
    }
  })
})

describe('buildDirectoryReportForComparison', () => {
  it('injects the shared version, the interface language and the same counts', () => {
    const source = comparison()
    const built = buildDirectoryReportForComparison(
      source,
      translate('zh'),
      'zh',
      true,
      GENERATED_AT
    )

    expect(built.totalRows).toBe(6)
    expect(built.truncated).toBe(false)
    expect(built.html).toContain(`<html lang="${htmlLang('zh')}">`)
    expect(built.html).toContain(APP_VERSION)
    expect(built.html).toContain(zh['directory.report.title'])
    for (const status of ['same', 'added', 'removed', 'modified'] as const) {
      const value = new RegExp(
        `count-${status}"><i></i><span class="count-label">[^<]*</span><span class="count-value">(\\d+)<`
      ).exec(built.html)
      expect(Number(value?.[1])).toBe(source.counts[status])
    }
  })

  it('hides local roots by default and exposes them only with the switch off', () => {
    const source = comparison()
    const hidden = buildDirectoryReportForComparison(
      source,
      translate('zh'),
      'zh',
      true,
      GENERATED_AT
    )
    expect(hidden.html.split('/Users').length - 1).toBe(0)
    expect(hidden.html).toContain(zh['directory.report.privacyNotice'])

    const exposed = buildDirectoryReportForComparison(
      source,
      translate('en'),
      'en',
      false,
      GENERATED_AT
    )
    expect(exposed.html).toContain('/Users/alice/work/left')
    expect(exposed.html).toContain(en['directory.report.privacyNotice'])
    expect(exposed.html).not.toContain(zh['directory.report.title'])
  })

  it('keeps the report inside the shared row and byte caps by default', () => {
    const built = buildDirectoryReportForComparison(
      comparison(),
      translate('en'),
      'en',
      true,
      GENERATED_AT
    )
    expect(built.shownRows).toBeLessThanOrEqual(DIRECTORY_REPORT_MAX_ROWS)
    expect(built.bytes).toBeLessThanOrEqual(DIRECTORY_REPORT_MAX_BYTES)
  })
})

describe('directoryReportSaveCopy', () => {
  it('confirms the saved path without truncation wording when nothing was dropped', () => {
    const built = buildDirectoryReportForComparison(
      comparison(),
      translate('zh'),
      'zh',
      true,
      GENERATED_AT
    )
    const copy = directoryReportSaveCopy(built, '/tmp/left-vs-right.html')

    expect(copy.key).toBe('directory.report.saved')
    expect(copy.params).toEqual({ path: '/tmp/left-vs-right.html' })
    expect(zh[copy.key]).not.toContain('{shown}')
  })

  it('adds the shown and original row counts when the report was truncated', () => {
    const source = comparison()
    const built = buildDirectoryReport({
      source: directoryReportSource(source),
      strings: directoryReportStrings(translate('zh')),
      htmlLang: htmlLang('zh'),
      generatedAt: GENERATED_AT,
      appVersion: APP_VERSION,
      hideLocalPaths: true,
      maxRows: 2
    })
    expect(built.truncated).toBe(true)

    const copy = directoryReportSaveCopy(built, '/tmp/left-vs-right.html')
    expect(copy.key).toBe('directory.report.savedTruncated')
    expect(copy.params.shown).toBe(built.shownRows)
    expect(copy.params.total).toBe(built.totalRows)
    expect(built.shownRows).toBeLessThan(built.totalRows)

    const notice = interpolate(zh[copy.key], copy.params)
    expect(notice).toContain(String(built.shownRows))
    expect(notice).toContain(String(built.totalRows))
  })
})
