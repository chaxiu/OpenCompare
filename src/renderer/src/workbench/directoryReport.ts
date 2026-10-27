/**
 * Renderer boundaries of the directory HTML report.
 *
 * The pure generator in `@core/directory/report` owns the document, the caps and
 * the privacy-relative roots; this module only supplies what the renderer knows:
 * the active dictionary, the interface language, the shared application version,
 * the current privacy switch and the save-dialog file name. Keeping the file
 * name normalisation and the notice copy here means the toolbar and the save
 * flow cannot drift apart.
 */
import type { DirectoryComparison, FileDiffStatus } from '@core/directory/compare'
import {
  buildDirectoryReport,
  buildDirectoryReportAsync,
  directoryReportSource
} from '@core/directory/report'
import type {
  DirectoryReport,
  DirectoryReportAsyncOptions,
  DirectoryReportProgress,
  DirectoryReportStrings
} from '@core/directory/report'
import type { FileDialogFilter, Language } from '@shared/platform/types'
import { APP_VERSION } from '@shared/appVersion'
import { DIFF_LABEL_KEYS } from '@renderer/components/diffSemantics'
import type { MessageKey } from '@renderer/i18n/messages'
import type { Translate } from '@renderer/i18n/context'
import { htmlLang } from '@renderer/i18n/htmlLang'

/** Characters no save-dialog file name may carry. */
const INVALID_FILE_NAME = /[\\/:*?"<>|]/g

const FALLBACK_NAME = 'directory'

function safeFileNamePart(raw: string): string {
  const cleaned = raw.replace(INVALID_FILE_NAME, '_').trim()
  return cleaned.length === 0 ? FALLBACK_NAME : cleaned
}

/** `<left>-vs-<right>.html`, with both names normalised for a save dialog. */
export function directoryReportFileName(leftName: string, rightName: string): string {
  return `${safeFileNamePart(leftName)}-vs-${safeFileNamePart(rightName)}.html`
}

/** Save-dialog filter of the HTML report, named in the caller's language. */
export function directoryReportFilter(name: string): FileDialogFilter {
  return { name, extensions: ['html', 'htm'] }
}

/** Report strings resolved from the active dictionary, never hardcoded. */
export function directoryReportStrings(t: Translate): DirectoryReportStrings {
  return {
    title: t('directory.report.title'),
    privacyNotice: t('directory.report.privacyNotice'),
    generatedAt: t('directory.report.generatedAt'),
    appVersion: t('directory.report.appVersion'),
    leftRoot: t('directory.report.leftRoot'),
    rightRoot: t('directory.report.rightRoot'),
    limits: t('directory.report.limits'),
    scopeAll: t('directory.report.scopeAll'),
    countsHeading: t('directory.report.countsHeading'),
    status: {
      same: t(DIFF_LABEL_KEYS.same),
      added: t(DIFF_LABEL_KEYS.added),
      removed: t(DIFF_LABEL_KEYS.removed),
      modified: t(DIFF_LABEL_KEYS.modified)
    } satisfies Record<FileDiffStatus, string>,
    columns: {
      path: t('directory.report.columns.path'),
      leftSize: t('directory.report.columns.leftSize'),
      rightSize: t('directory.report.columns.rightSize'),
      status: t('directory.report.columns.status')
    },
    truncated: t('directory.report.truncated'),
    truncatedHint: t('directory.report.truncatedHint'),
    empty: t('directory.report.empty')
  }
}

/**
 * Renders the report of one finished comparison. Counts and rows are projected
 * from the same comparison object the view shows, the version is the shared
 * `APP_VERSION`, and the language tag comes from the active interface language.
 */
export function buildDirectoryReportForComparison(
  comparison: DirectoryComparison,
  t: Translate,
  language: Language,
  hideLocalPaths: boolean,
  generatedAt: string = new Date().toISOString()
): DirectoryReport {
  return buildDirectoryReport({
    source: directoryReportSource(comparison),
    strings: directoryReportStrings(t),
    htmlLang: htmlLang(language),
    generatedAt,
    appVersion: APP_VERSION,
    hideLocalPaths
  })
}

/**
 * The same document as {@link buildDirectoryReportForComparison}, rendered in
 * chunks so the workbench can paint progress and cancel it. The input is built
 * exactly like the synchronous path; only the driver differs.
 */
export async function buildDirectoryReportForComparisonAsync(
  comparison: DirectoryComparison,
  t: Translate,
  language: Language,
  hideLocalPaths: boolean,
  options: DirectoryReportAsyncOptions = {},
  generatedAt: string = new Date().toISOString()
): Promise<DirectoryReport> {
  return buildDirectoryReportAsync(
    {
      source: directoryReportSource(comparison),
      strings: directoryReportStrings(t),
      htmlLang: htmlLang(language),
      generatedAt,
      appVersion: APP_VERSION,
      hideLocalPaths
    },
    options
  )
}

/** Window in which repeated progress callbacks collapse into one paint. */
export const REPORT_PROGRESS_THROTTLE_MS = 50

/** Leading + trailing progress throttle; the UI contract is in the tests. */
export interface ReportProgressThrottle {
  /** Reports one scalar progress sample, at most once per window. */
  push(progress: DirectoryReportProgress): void
  /** Forces the final sample through, cancelling any pending window. */
  finish(progress: DirectoryReportProgress): void
  /** Drops a pending sample without emitting it. */
  clear(): void
}

/**
 * Collapses a burst of chunk progress into one commit per window: the first
 * sample paints at once, the rest keep only the latest value and flush it when
 * the window ends. A finished generation forces its final value through, so a
 * stall between the last chunk and `resolve` cannot hide the true end state.
 */
export function createReportProgressThrottle(
  emit: (progress: DirectoryReportProgress) => void,
  intervalMs: number = REPORT_PROGRESS_THROTTLE_MS
): ReportProgressThrottle {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: DirectoryReportProgress | null = null

  return {
    push(progress) {
      if (timer === null) {
        emit(progress)
        timer = setTimeout(() => {
          timer = null
          const trailing = pending
          pending = null
          if (trailing !== null) emit(trailing)
        }, intervalMs)
        return
      }
      pending = progress
    },
    finish(progress) {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      pending = null
      emit(progress)
    },
    clear() {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      pending = null
    }
  }
}

/** Dictionary copy of the save confirmation, truncation summary included. */
export interface DirectoryReportSaveCopy {
  readonly key: MessageKey
  readonly params: Readonly<Record<string, string | number>>
}

export function directoryReportSaveCopy(
  report: DirectoryReport,
  path: string
): DirectoryReportSaveCopy {
  return report.truncated
    ? {
        key: 'directory.report.savedTruncated',
        params: { path, shown: report.shownRows, total: report.totalRows }
      }
    : { key: 'directory.report.saved', params: { path } }
}
