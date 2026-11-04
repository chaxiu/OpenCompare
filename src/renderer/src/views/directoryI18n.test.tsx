// @vitest-environment jsdom
import type { JSX } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { DirectoryComparison, DirectoryDiffNode, FileDiffStatus } from '@core/directory/compare'
import { DIRECTORY_FILTERS } from '@core/directory/filter'
import { visibleDirectoryCounts } from '@core/directory/rows'
import type { SyncMode, SyncPlanGroup, SyncPlanItem } from '@core/directory/sync'
import { createTemplatePlan } from '@core/directory/template'
import type { TemplateMatchResult } from '@core/directory/template'
import type { Language, PlatformPort } from '@shared/platform/types'
import { formatBytes } from '@renderer/components/utils'
import { I18nProvider } from '@renderer/i18n/I18nProvider'
import { useI18n } from '@renderer/i18n/context'
import { localeText } from '@renderer/i18n/localeTable'
import type { MessageKey } from '@renderer/i18n/messages'
import { renderWithI18n } from '@renderer/i18n/testing'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import type {
  SyncPreview,
  TemplateApplyOutcome,
  TemplatePreview
} from '@renderer/workbench/directoryOps'
import { Workbench } from '@renderer/workbench/Workbench'
import {
  DIRECTORY_STATUS_LABEL_KEYS,
  FILTER_LABEL_KEYS,
  SYNC_DIRECTION_KEYS,
  SYNC_MODE_KEYS
} from './directoryCopy'
import { DirectorySyncDialog } from './DirectorySyncDialog'
import { DirectoryView } from './DirectoryView'
import { TemplateDialog } from './TemplateDialog'
import { installJsdomViewport } from '../../../test/jsdomViewport'
import { closeMore, moreItem } from '../../../test/shellMenu'

const HAN = /\p{Script=Han}/u
const IPC_WRAPPER = 'Error invoking remote method'
const webPlatform: PlatformPort = createWebPlatformPort()

installJsdomViewport()

afterEach(cleanup)

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function makeFile(
  name: string,
  status: FileDiffStatus,
  leftPath: string | undefined,
  rightPath: string | undefined
): DirectoryDiffNode {
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
    leftPath,
    rightPath
  }
}

/** Four files, one per status, with two left and one right skipped entry. */
function comparisonFixture(): DirectoryComparison {
  const counts = { same: 1, added: 1, removed: 1, modified: 1 }
  const root: DirectoryDiffNode = {
    name: 'left',
    relativePath: '',
    kind: 'directory',
    status: 'modified',
    counts,
    leftPath: '/tmp/left',
    rightPath: '/tmp/right',
    children: [
      makeFile('same.txt', 'same', '/tmp/left/same.txt', '/tmp/right/same.txt'),
      makeFile('right.txt', 'added', undefined, '/tmp/right/right.txt'),
      makeFile('left.txt', 'removed', '/tmp/left/left.txt', undefined),
      makeFile('changed.txt', 'modified', '/tmp/left/changed.txt', '/tmp/right/changed.txt')
    ]
  }
  return {
    leftRoot: '/tmp/left',
    rightRoot: '/tmp/right',
    leftName: 'left',
    rightName: 'right',
    root,
    counts,
    fileCount: 4,
    leftSkipped: 2,
    rightSkipped: 1,
    skipped: 3
  }
}

function syncItem(relativePath: string, size: number): SyncPlanItem {
  return { relativePath, sourcePath: `/src/${relativePath}`, targetPath: `/dst/${relativePath}`, size, modifiedMs: 0 }
}

function syncGroup(items: readonly SyncPlanItem[]): SyncPlanGroup {
  return { items, count: items.length, bytes: items.reduce((total, item) => total + item.size, 0) }
}

function syncPreview(options: {
  readonly mode: SyncMode
  readonly copy?: readonly SyncPlanItem[]
  readonly update?: readonly SyncPlanItem[]
  readonly delete?: readonly SyncPlanItem[]
}): SyncPreview {
  const copy = syncGroup(options.copy ?? [])
  const update = syncGroup(options.update ?? [])
  const remove = syncGroup(options.delete ?? [])
  return {
    plan: {
      direction: 'left-to-right',
      mode: options.mode,
      sourceRoot: '/src',
      targetRoot: '/dst',
      copy,
      update,
      delete: remove,
      totalCount: copy.count + update.count + remove.count,
      totalBytes: copy.bytes + update.bytes + remove.bytes
    },
    materializeTarget: false,
    sourceRoot: '/src',
    originalTargetRoot: '/dst',
    linkAlignments: []
  }
}

function templatePreview(): TemplatePreview {
  const result: TemplateMatchResult = {
    templateRoot: '/template',
    incomingRoot: '/incoming',
    matched: [
      {
        relativePath: 'app/a.ts',
        templatePath: '/template/app/a.ts',
        sourcePath: '/incoming/x/a.ts',
        sourceRelativePath: 'x/a.ts',
        size: 12,
        hash: 'a1',
        modifiedMs: 1_700_000_000_000,
        text: 'a'
      }
    ],
    missing: [{ relativePath: 'app/b.ts', templatePath: '/template/app/b.ts', size: 20, hash: 'b1' }],
    conflicts: [
      {
        relativePath: 'app/c.ts',
        templatePath: '/template/app/c.ts',
        reason: 'ambiguous',
        candidates: [
          { path: '/incoming/one/c.ts', sourceRelativePath: 'one/c.ts', size: 1, hash: 'c1', modifiedMs: 1 },
          { path: '/incoming/two/c.ts', sourceRelativePath: 'two/c.ts', size: 2, hash: 'c2', modifiedMs: 2 }
        ]
      },
      {
        relativePath: 'app/d.ts',
        templatePath: '/template/app/d.ts',
        reason: 'content-mismatch',
        candidates: [
          { path: '/incoming/three/d.ts', sourceRelativePath: 'three/d.ts', size: 3, hash: 'c3', modifiedMs: 3 }
        ]
      }
    ],
    unused: [{ relativePath: 'extras/e.ts', path: '/incoming/e.ts', size: 4 }],
    templateFileCount: 4
  }
  return {
    plan: createTemplatePlan(result, { outputRoot: '/out' }),
    templateRoot: '/template',
    incomingRoot: '/incoming',
    outputRoot: '/out',
    outputRootExists: true
  }
}

const templateOutcome = async (): Promise<TemplateApplyOutcome> => ({
  execution: {
    written: [],
    writtenCount: 0,
    movedCount: 0,
    failed: [],
    failedCount: 0,
    cancelled: false
  },
  verification: { entries: [], verified: 0, failed: 0 }
})

function View({ comparison }: { readonly comparison: DirectoryComparison }): JSX.Element {
  return (
    <DirectoryView
      sessionId="directory-i18n"
      comparison={comparison}
      filter="all"
      onFilterChange={() => undefined}
      collapsedPaths={[]}
      onTogglePath={() => undefined}
      selectedPath={null}
      onSelectPath={() => undefined}
      scrollTops={{ left: 0, right: 0 }}
      onScrollTopChange={() => undefined}
      visibleCounts={{ ...visibleDirectoryCounts(comparison.root, 'all'), conflict: 0 }}
      pickerAvailable
      busy={false}
      onPick={() => undefined}
      onOpenFile={() => undefined}
      leftIsSnapshot={false}
      rightIsSnapshot={false}
      onExportSnapshot={() => undefined}
      onImportSnapshot={() => undefined}
      hideLocalPaths
      onHideLocalPathsChange={() => undefined}
      onExportReport={() => undefined}
      onPreviewSync={() => undefined}
      onPreviewTemplate={() => undefined}
      platform={webPlatform}
      syncPreview={null}
      templatePreview={null}
      templateOpen={false}
      onCancelSync={() => undefined}
      onAbortSync={() => undefined}
      onConfirmSync={() => undefined}
      onPreviewTemplateRoots={async () => null}
      onCancelTemplate={() => undefined}
      onConfirmTemplate={templateOutcome}
    />
  )
}

const TOOLBAR: readonly (readonly [MessageKey, MessageKey])[] = [
  ['directory.toolbar.pickLeft', 'directory.toolbar.pickLeftTitle'],
  ['directory.toolbar.pickRight', 'directory.toolbar.pickRightTitle'],
  ['directory.toolbar.previewSync', 'directory.toolbar.previewSyncTitle'],
  ['directory.toolbar.template', 'directory.toolbar.templateTitle'],
  ['directory.toolbar.exportLeft', 'directory.toolbar.exportLeftTitle'],
  ['directory.toolbar.importLeft', 'directory.toolbar.importLeftTitle'],
  ['directory.toolbar.exportRight', 'directory.toolbar.exportRightTitle'],
  ['directory.toolbar.importRight', 'directory.toolbar.importRightTitle'],
  ['directory.report.toolbar.export', 'directory.report.toolbar.exportTitle']
]

/* ------------------------------------------------------------------ */
/* View and dialog copy                                                */
/* ------------------------------------------------------------------ */

describe('directory copy from the locale table', () => {
  it('reads the view and both dialogs from the same single source', () => {
    for (const language of ['en', 'zh'] as const) {
      const view = renderWithI18n(<View comparison={comparisonFixture()} />, language)
      const filters = screen.getByRole('tablist', {
        name: localeText(language, 'directory.filter.group')
      })
      expect(within(filters).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(
        DIRECTORY_FILTERS.map((filter) => localeText(language, FILTER_LABEL_KEYS[filter]))
      )
      for (const [labelKey, titleKey] of TOOLBAR) {
        const label = localeText(language, labelKey)
        const title = localeText(language, titleKey)
        // The primary sync action stays inline; every other declared entry is a
        // menu item whose description carries the same localized title.
        if (labelKey === 'directory.toolbar.previewSync') {
          expect(screen.getByRole('button', { name: label }).getAttribute('title')).toBe(title)
          continue
        }
        expect(moreItem(label).textContent).toContain(title)
        closeMore()
      }
      expect(screen.getByText(localeText(language, 'directory.panel.source'))).toBeDefined()
      expect(screen.getByText(localeText(language, 'directory.panel.target'))).toBeDefined()
      expect(
        screen.getByText(localeText(language, 'directory.skipped', { left: 2, right: 1 }))
      ).toBeDefined()
      expect(screen.getByText(localeText(language, 'directory.drilldownHint'))).toBeDefined()
      for (const status of ['same', 'added', 'removed', 'modified'] as const) {
        expect(
          screen.getAllByText(localeText(language, DIRECTORY_STATUS_LABEL_KEYS[status])).length
        ).toBeGreaterThan(0)
      }
      if (language === 'en') {
        expect(view.container.textContent ?? '').not.toMatch(HAN)
      }
      view.unmount()
    }

    const preview = syncPreview({
      mode: 'mirror',
      copy: [syncItem('new.txt', 100)],
      update: [syncItem('a.txt', 1024)],
      delete: [syncItem('keep.txt', 10), syncItem('drop.txt', 20)]
    })
    for (const language of ['en', 'zh'] as const) {
      const view = renderWithI18n(
        <DirectorySyncDialog
          preview={preview}
          busy={false}
          onCancel={() => undefined}
          onAbort={() => undefined}
          onConfirm={() => undefined}
        />,
        language
      )
      const dialog = screen.getByRole('dialog')
      expect(dialog.getAttribute('aria-label')).toBe(
        localeText(language, 'directory.sync.title', {
          direction: localeText(language, SYNC_DIRECTION_KEYS['left-to-right']),
          mode: localeText(language, SYNC_MODE_KEYS.mirror)
        })
      )
      expect(screen.getByText(localeText(language, 'directory.sync.group.copy'))).toBeDefined()
      expect(screen.getByText(localeText(language, 'directory.sync.group.update'))).toBeDefined()
      expect(screen.getByText(localeText(language, 'directory.sync.group.delete'))).toBeDefined()
      expect(
        screen.getByText(
          localeText(language, 'directory.sync.groupCount.one', { count: 1, size: formatBytes(100) })
        )
      ).toBeDefined()
      fireEvent.click(
        screen.getByRole('button', { name: localeText(language, 'directory.sync.selectAll') })
      )
      fireEvent.click(
        screen.getByRole('button', { name: localeText(language, 'directory.sync.clearSelection') })
      )
      if (language === 'en') expect(dialog.textContent ?? '').not.toMatch(HAN)
      view.unmount()
    }

    const incremental = renderWithI18n(
      <DirectorySyncDialog
        preview={syncPreview({
          mode: 'incremental',
          copy: [syncItem('new.txt', 100)],
          delete: [syncItem('drop.txt', 20)]
        })}
        busy={false}
        onCancel={() => undefined}
        onAbort={() => undefined}
        onConfirm={() => undefined}
      />,
      'en'
    )
    expect(screen.queryByText(localeText('en', 'directory.sync.group.delete'))).toBeNull()
    expect(screen.getAllByText(localeText('en', 'directory.none')).length).toBeGreaterThan(0)
    incremental.unmount()

    const mirrorEmpty = renderWithI18n(
      <DirectorySyncDialog
        preview={syncPreview({ mode: 'mirror', copy: [syncItem('new.txt', 100)] })}
        busy={false}
        onCancel={() => undefined}
        onAbort={() => undefined}
        onConfirm={() => undefined}
      />,
      'en'
    )
    expect(screen.getAllByText(localeText('en', 'directory.none')).length).toBeGreaterThanOrEqual(2)
    mirrorEmpty.unmount()

    const template = templatePreview()
    for (const language of ['en', 'zh'] as const) {
      const view = renderWithI18n(
        <TemplateDialog
          platform={webPlatform}
          templateRoot="/template"
          preview={template}
          busy={false}
          onPreview={async () => null}
          onCancel={() => undefined}
          onConfirm={templateOutcome}
        />,
        language
      )
      const dialog = screen.getByRole('dialog')
      expect(dialog.getAttribute('aria-label')).toBe(
        localeText(language, 'directory.template.title')
      )
      const description = dialog.querySelector('p')?.textContent ?? ''
      for (const key of [
        'directory.template.label.template',
        'directory.template.label.incoming',
        'directory.template.label.output'
      ] as const) {
        expect(description).toContain(localeText(language, key))
      }
      for (const key of [
        'directory.template.section.matched',
        'directory.template.section.missing',
        'directory.template.section.conflicts',
        'directory.template.section.unused',
        'directory.template.reason.ambiguous',
        'directory.template.reason.contentMismatch'
      ] as const) {
        expect(screen.getByText(localeText(language, key))).toBeDefined()
      }
      expect(
        screen.getByLabelText(
          localeText(language, 'directory.template.conflict.candidate', { path: 'app/c.ts' })
        )
      ).toBeDefined()
      expect(
        screen.getAllByText(localeText(language, 'directory.template.count.one', { count: 1 }))
          .length
      ).toBeGreaterThan(0)
      expect(
        screen.getByRole('button', { name: localeText(language, 'common.cancel') })
      ).toBeDefined()
      expect(
        screen.getByRole('button', { name: localeText(language, 'directory.template.place') })
      ).toBeDefined()
      if (language === 'en') expect(dialog.textContent ?? '').not.toMatch(HAN)
      view.unmount()
    }
  })
})

/* ------------------------------------------------------------------ */
/* Sync failure copy                                                   */
/* ------------------------------------------------------------------ */

const REFUSAL_CODES = ['EACCES', 'EPERM'] as const
const REASON_KEYS = {
  EACCES: 'shell.sync.reason.EACCES',
  EPERM: 'shell.sync.reason.EPERM'
} as const

function refusal(code: string): Error {
  return Object.assign(new Error(`${code}: permission denied`), { code })
}

function targetText(language: Language, code: 'EACCES' | 'EPERM', path: string): string {
  return localeText(language, 'shell.sync.error.target', {
    path,
    reason: localeText(language, REASON_KEYS[code], { code })
  })
}

function LanguageProbe(): JSX.Element {
  const { setLanguage } = useI18n()
  return (
    <div aria-hidden>
      <button type="button" data-testid="switch-en" onClick={() => setLanguage('en')} />
      <button type="button" data-testid="switch-zh" onClick={() => setLanguage('zh')} />
    </div>
  )
}

function Harness({ platform }: { readonly platform: PlatformPort }): JSX.Element {
  return (
    <I18nProvider initialLanguage="en">
      <LanguageProbe />
      <Workbench platform={platform} />
    </I18nProvider>
  )
}

async function openDirectoryPair(language: Language, left: string, right: string): Promise<void> {
  fireEvent.click(
    screen.getAllByRole('button', { name: localeText(language, 'shell.toolbar.newCompare') })[0]
  )
  const panel = await screen.findByRole('dialog', {
    name: localeText(language, 'shell.compare.title')
  })
  fireEvent.change(within(panel).getByLabelText(localeText(language, 'shell.compare.leftPath')), {
    target: { value: left }
  })
  fireEvent.change(within(panel).getByLabelText(localeText(language, 'shell.compare.rightPath')), {
    target: { value: right }
  })
  fireEvent.click(
    within(panel).getByRole('button', { name: localeText(language, 'shell.compare.submit') })
  )
}

async function applySync(language: Language): Promise<HTMLElement> {
  const preview = await screen.findByRole(
    'button',
    { name: localeText(language, 'directory.toolbar.previewSync') },
    { timeout: 30_000 }
  )
  await waitFor(() => expect((preview as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(preview)
  const dialog = await screen.findByRole('dialog')
  const apply = within(dialog).getByRole('button', {
    name: localeText(language, 'directory.sync.apply')
  })
  await waitFor(() => expect((apply as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(apply)
  return screen.findByRole('alert', {}, { timeout: 30_000 })
}

describe('sync failure localization', () => {
  it('localizes EACCES / EPERM refusals and a failed refresh in both languages', async () => {
    for (const code of REFUSAL_CODES) {
      const base = createWebPlatformPort()
      const left = `/memory/sync-${code}-left`
      const right = `/memory/sync-${code}-right`
      await base.writeTextFile(`${left}/same.txt`, 'same\n')
      await base.writeTextFile(`${right}/same.txt`, 'same\n')
      await base.writeTextFile(`${left}/a.txt`, 'a\n')
      const port: PlatformPort = {
        ...base,
        checkWritable: async () => {
          throw refusal(code)
        }
      }

      render(<Harness platform={port} />)
      await openDirectoryPair('en', left, right)
      const notice = await applySync('en')
      expect(notice.textContent).toBe(targetText('en', code, right))
      expect(notice.textContent ?? '').not.toMatch(HAN)

      fireEvent.click(screen.getByTestId('switch-zh'))
      expect(screen.getByRole('alert')).toBe(notice)
      expect(notice.textContent).toBe(targetText('zh', code, right))
      cleanup()
    }

    const base = createWebPlatformPort()
    const left = '/memory/refresh-left'
    const right = '/memory/refresh-right'
    await base.writeTextFile(`${left}/same.txt`, 'same\n')
    await base.writeTextFile(`${right}/same.txt`, 'same\n')
    await base.writeTextFile(`${left}/new.txt`, 'left only\n')
    let written = false
    const detail = `${IPC_WRAPPER} 'platform:list-directory': Error: EACCES: permission denied`
    const port: PlatformPort = {
      ...base,
      writeFileBytes: async (path, content, modifiedMs) => {
        await base.writeFileBytes(path, content, modifiedMs)
        written = true
      },
      listDirectory: async (path) => {
        if (written) throw new Error(detail)
        return base.listDirectory(path)
      },
      listDirectories: async (paths) => {
        if (written) throw new Error(detail)
        return base.listDirectories(paths)
      }
    }

    render(<Harness platform={port} />)
    await openDirectoryPair('en', left, right)
    const notice = await applySync('en')
    const refreshText = (language: Language): string =>
      localeText(language, 'shell.notice.syncRefreshFailed', {
        copied: 1,
        updated: 0,
        deleted: 0,
        reason: localeText(language, 'shell.sync.reason.EACCES', { code: 'EACCES' })
      })
    expect(notice.textContent).toBe(refreshText('en'))
    expect(notice.textContent ?? '').not.toMatch(HAN)
    expect(notice.textContent ?? '').not.toContain(IPC_WRAPPER)

    fireEvent.click(screen.getByTestId('switch-zh'))
    expect(screen.getByRole('alert')).toBe(notice)
    expect(notice.textContent).toBe(refreshText('zh'))
  }, 90_000)
})
