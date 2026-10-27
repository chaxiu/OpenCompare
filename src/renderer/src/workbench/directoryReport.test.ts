import { describe, expect, it, vi } from 'vitest'
import type { DirectoryComparison, DirectoryDiffNode, FileDiffStatus } from '@core/directory/compare'
import {
  DIRECTORY_REPORT_MAX_BYTES,
  DIRECTORY_REPORT_MAX_ROWS,
  buildDirectoryReport,
  directoryReportSource
} from '@core/directory/report'
import type { DirectoryReportProgress } from '@core/directory/report'
import { APP_VERSION } from '@shared/appVersion'
import { DIFF_LABEL_KEYS } from '@renderer/components/diffSemantics'
import { translate } from '@renderer/i18n/context'
import { interpolate } from '@renderer/i18n/interpolate'
import { htmlLang } from '@renderer/i18n/htmlLang'
import { en, zh } from '@renderer/i18n/messages'
import {
  REPORT_PROGRESS_THROTTLE_MS,
  buildDirectoryReportForComparison,
  buildDirectoryReportForComparisonAsync,
  createReportProgressThrottle,
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

describe('createReportProgressThrottle', () => {
  it('paints the first sample at once and coalesces a burst into one trailing commit', () => {
    vi.useFakeTimers()
    try {
      const emitted: DirectoryReportProgress[] = []
      const throttle = createReportProgressThrottle((progress) => emitted.push(progress))

      for (let index = 1; index <= 100; index += 1) {
        throttle.push({ processedRows: index, totalRows: 100 })
      }

      // The first sample never waits for the window, so the row is not blank.
      expect(emitted).toEqual([{ processedRows: 1, totalRows: 100 }])

      vi.advanceTimersByTime(REPORT_PROGRESS_THROTTLE_MS)
      expect(emitted).toHaveLength(2)
      expect(emitted[1]).toEqual({ processedRows: 100, totalRows: 100 })

      // Once the window has closed, the next sample paints immediately again.
      throttle.push({ processedRows: 120, totalRows: 200 })
      expect(emitted.at(-1)).toEqual({ processedRows: 120, totalRows: 200 })
      throttle.clear()
    } finally {
      vi.useRealTimers()
    }
  })

  it('forces the final value through when the generation resolves', () => {
    vi.useFakeTimers()
    try {
      const emitted: DirectoryReportProgress[] = []
      const throttle = createReportProgressThrottle((progress) => emitted.push(progress))

      throttle.push({ processedRows: 10, totalRows: 40 })
      throttle.push({ processedRows: 40, totalRows: 40 })
      // Resolving before the window ends must not leave the row at 10 / 40.
      throttle.finish({ processedRows: 40, totalRows: 40 })
      expect(emitted.at(-1)).toEqual({ processedRows: 40, totalRows: 40 })

      const commits = emitted.length
      vi.advanceTimersByTime(REPORT_PROGRESS_THROTTLE_MS * 4)
      expect(emitted).toHaveLength(commits)
    } finally {
      vi.useRealTimers()
    }
  })

  it('drops a pending sample on clear without emitting it', () => {
    vi.useFakeTimers()
    try {
      const emitted: DirectoryReportProgress[] = []
      const throttle = createReportProgressThrottle((progress) => emitted.push(progress))

      throttle.push({ processedRows: 1, totalRows: 10 })
      throttle.push({ processedRows: 2, totalRows: 10 })
      throttle.clear()
      vi.advanceTimersByTime(REPORT_PROGRESS_THROTTLE_MS * 4)

      expect(emitted).toEqual([{ processedRows: 1, totalRows: 10 }])
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('buildDirectoryReportForComparisonAsync', () => {
  it('renders the byte-identical document of the synchronous path in both languages', async () => {
    for (const language of ['zh', 'en'] as const) {
      for (const hideLocalPaths of [true, false]) {
        const source = comparison()
        const sync = buildDirectoryReportForComparison(
          source,
          translate(language),
          language,
          hideLocalPaths,
          GENERATED_AT
        )
        const asyncReport = await buildDirectoryReportForComparisonAsync(
          source,
          translate(language),
          language,
          hideLocalPaths,
          undefined,
          GENERATED_AT
        )

        expect(asyncReport.html).toBe(sync.html)
        expect(asyncReport.bytes).toBe(sync.bytes)
        expect(asyncReport.totalRows).toBe(sync.totalRows)
        expect(asyncReport.shownRows).toBe(sync.shownRows)
        expect(asyncReport.truncatedRows).toBe(sync.truncatedRows)
        expect(asyncReport.truncated).toBe(sync.truncated)
      }
    }
  })

  it('passes progress through with the tree total and the consumed row count', async () => {
    const source = comparison()
    const expectedTotal = directoryReportSource(source).totalRows
    const samples: DirectoryReportProgress[] = []

    const built = await buildDirectoryReportForComparisonAsync(
      source,
      translate('zh'),
      'zh',
      true,
      { onProgress: (progress) => samples.push(progress) },
      GENERATED_AT
    )

    expect(samples.length).toBeGreaterThan(0)
    for (const sample of samples) expect(sample.totalRows).toBe(expectedTotal)

    const processed = samples.map((sample) => sample.processedRows)
    expect(processed).toEqual([...processed].sort((left, right) => left - right))
    expect(processed.at(-1)).toBe(expectedTotal)
    expect(built.totalRows).toBe(expectedTotal)
  })

  it('rejects an already aborted signal as a cancellation', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      buildDirectoryReportForComparisonAsync(
        comparison(),
        translate('zh'),
        'zh',
        true,
        { signal: controller.signal },
        GENERATED_AT
      )
    ).rejects.toMatchObject({ name: 'OperationCancelledError' })
  })
})
