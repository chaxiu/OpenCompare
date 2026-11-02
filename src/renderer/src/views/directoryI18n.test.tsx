// @vitest-environment jsdom
import { useState } from 'react'
import type { JSX } from 'react'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { DirectoryComparison, DirectoryDiffNode, FileDiffStatus } from '@core/directory/compare'
import { DIRECTORY_FILTERS } from '@core/directory/filter'
import type { DirectoryFilter } from '@core/directory/filter'
import { visibleDirectoryCounts } from '@core/directory/rows'
import type {
  SyncDirection,
  SyncMode,
  SyncPlanGroup,
  SyncPlanItem
} from '@core/directory/sync'
import { createTemplatePlan } from '@core/directory/template'
import type { TemplateMatchResult } from '@core/directory/template'
import type { PlatformPort } from '@shared/platform/types'
import { en, zh } from '@renderer/i18n/messages'
import { renderWithI18n } from '@renderer/i18n/testing'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import type { SyncPreview, TemplateApplyOutcome, TemplatePreview } from '@renderer/workbench/directoryOps'
import { DirectorySyncDialog } from './DirectorySyncDialog'
import { DirectoryView } from './DirectoryView'
import {
  DIRECTORY_STATUS_LABEL_KEYS,
  FILTER_LABEL_KEYS,
  SYNC_DIRECTION_KEYS,
  SYNC_MODE_KEYS
} from './directoryCopy'
import { TemplateDialog } from './TemplateDialog'

const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 1200
  })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 640
  })
})

afterAll(() => {
  if (originalWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalWidth)
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
  if (originalHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalHeight)
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight')
})

afterEach(cleanup)

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const HAN = /\p{Script=Han}/u

/** The nine real toolbar buttons and the dictionary key of each English title. */
const EN_TOOLBAR = [
  ['Choose left folder', 'directory.toolbar.pickLeftTitle'],
  ['Choose right folder', 'directory.toolbar.pickRightTitle'],
  ['Preview & sync', 'directory.toolbar.previewSyncTitle'],
  ['Place from template', 'directory.toolbar.templateTitle'],
  ['Export left snapshot', 'directory.toolbar.exportLeftTitle'],
  ['Import left snapshot', 'directory.toolbar.importLeftTitle'],
  ['Export right snapshot', 'directory.toolbar.exportRightTitle'],
  ['Import right snapshot', 'directory.toolbar.importRightTitle'],
  ['Export HTML report', 'directory.report.toolbar.exportTitle']
] as const

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

/** Four files, one per status, in a small `src` directory. */
function buildComparison(overrides: Partial<DirectoryComparison> = {}): DirectoryComparison {
  const counts = { same: 1, added: 1, removed: 1, modified: 1 }
  const src: DirectoryDiffNode = {
    name: 'src',
    relativePath: 'src',
    kind: 'directory',
    status: 'modified',
    counts: { same: 1, added: 0, removed: 0, modified: 1 },
    leftPath: '/tmp/left/src',
    rightPath: '/tmp/right/src',
    children: [
      makeFile('a.ts', 'same', '/tmp/left/src/a.ts', '/tmp/right/src/a.ts'),
      makeFile('b.ts', 'modified', '/tmp/left/src/b.ts', '/tmp/right/src/b.ts')
    ]
  }
  const root: DirectoryDiffNode = {
    name: 'left',
    relativePath: '',
    kind: 'directory',
    status: 'modified',
    counts,
    leftPath: '/tmp/left',
    rightPath: '/tmp/right',
    children: [
      src,
      makeFile('left-only.txt', 'removed', '/tmp/left/left-only.txt', undefined),
      makeFile('right-only.txt', 'added', undefined, '/tmp/right/right-only.txt')
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
    leftSkipped: 0,
    rightSkipped: 0,
    skipped: 0,
    ...overrides
  }
}

/** Left tree with rows, right tree projected away entirely. */
function leftOnlyComparison(): DirectoryComparison {
  const counts = { same: 0, added: 0, removed: 1, modified: 0 }
  const root: DirectoryDiffNode = {
    name: 'left',
    relativePath: '',
    kind: 'directory',
    status: 'removed',
    counts,
    leftPath: '/tmp/left',
    children: [
      makeFile('left-only.txt', 'removed', '/tmp/left/left-only.txt', undefined)
    ]
  }
  return {
    leftRoot: '/tmp/left',
    rightRoot: '/tmp/right',
    leftName: 'left',
    rightName: 'right',
    root,
    counts,
    fileCount: 1,
    leftSkipped: 0,
    rightSkipped: 0,
    skipped: 0
  }
}

/** Comparison holding one right-only (`added`) or left-only (`removed`) probe file. */
function probeComparison(status: 'added' | 'removed'): DirectoryComparison {
  const counts = {
    same: 0,
    added: status === 'added' ? 1 : 0,
    removed: status === 'removed' ? 1 : 0,
    modified: 0
  }
  const root: DirectoryDiffNode = {
    name: 'left',
    relativePath: '',
    kind: 'directory',
    status,
    counts,
    leftPath: '/tmp/left',
    rightPath: '/tmp/right',
    children: [
      status === 'added'
        ? makeFile('探针.txt', 'added', undefined, '/tmp/right/探针.txt')
        : makeFile('探针.txt', 'removed', '/tmp/left/探针.txt', undefined)
    ]
  }
  return {
    leftRoot: '/tmp/left',
    rightRoot: '/tmp/right',
    leftName: 'left',
    rightName: 'right',
    root,
    counts,
    fileCount: 1,
    leftSkipped: 0,
    rightSkipped: 0,
    skipped: 0
  }
}

/** Comparison whose root carries Chinese user data that must never translate. */
function chineseComparison(): DirectoryComparison {
  return buildComparison({
    leftName: '源项目',
    rightName: '目标项目',
    leftRoot: '/tmp/源项目',
    rightRoot: '/tmp/目标项目'
  })
}

function syncItem(relativePath: string, size: number): SyncPlanItem {
  return {
    relativePath,
    sourcePath: `/src/${relativePath}`,
    targetPath: `/dst/${relativePath}`,
    size,
    modifiedMs: 0
  }
}

function syncGroup(items: readonly SyncPlanItem[]): SyncPlanGroup {
  return { items, count: items.length, bytes: items.reduce((total, item) => total + item.size, 0) }
}

function makeSyncPreview(
  overrides: {
    readonly direction?: SyncDirection
    readonly mode?: SyncMode
    readonly copy?: readonly SyncPlanItem[]
    readonly update?: readonly SyncPlanItem[]
    readonly delete?: readonly SyncPlanItem[]
    readonly links?: readonly string[]
    readonly materializeTarget?: boolean
  } = {}
): SyncPreview {
  const copy = syncGroup(overrides.copy ?? [])
  const update = syncGroup(overrides.update ?? [])
  const remove = syncGroup(overrides.delete ?? [])
  return {
    plan: {
      direction: overrides.direction ?? 'left-to-right',
      mode: overrides.mode ?? 'incremental',
      sourceRoot: '/src',
      targetRoot: '/dst',
      copy,
      update,
      delete: remove,
      totalCount: copy.count + update.count + remove.count,
      totalBytes: copy.bytes + update.bytes + remove.bytes
    },
    materializeTarget: overrides.materializeTarget ?? false,
    sourceRoot: '/src',
    originalTargetRoot: '/dst',
    linkAlignments: (overrides.links ?? []).map((relativePath) => ({
      relativePath,
      targetPath: `/dst/${relativePath}`,
      sourceMs: 1_700_001_000_000
    }))
  }
}

function makeTemplatePreview(overrides: Partial<TemplateMatchResult> = {}): TemplatePreview {
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
    missing: [
      {
        relativePath: 'app/b.ts',
        templatePath: '/template/app/b.ts',
        size: 20,
        hash: 'b1'
      }
    ],
    conflicts: [
      {
        relativePath: 'app/c.ts',
        templatePath: '/template/app/c.ts',
        reason: 'ambiguous',
        candidates: [
          {
            path: '/incoming/one/c.ts',
            sourceRelativePath: 'one/c.ts',
            size: 1,
            hash: 'c1',
            modifiedMs: 1_700_000_000_001
          },
          {
            path: '/incoming/two/c.ts',
            sourceRelativePath: 'two/c.ts',
            size: 2,
            hash: 'c2',
            modifiedMs: 1_700_000_000_002
          }
        ]
      },
      {
        relativePath: 'app/d.ts',
        templatePath: '/template/app/d.ts',
        reason: 'content-mismatch',
        candidates: [
          {
            path: '/incoming/three/d.ts',
            sourceRelativePath: 'three/d.ts',
            size: 3,
            hash: 'c3',
            modifiedMs: 1_700_000_000_003
          }
        ]
      }
    ],
    unused: [
      { relativePath: 'extras/e.ts', path: '/incoming/e.ts', size: 4 },
      { relativePath: 'extras/f.ts', path: '/incoming/f.ts', size: 5 },
      { relativePath: 'extras/g.ts', path: '/incoming/g.ts', size: 6 }
    ],
    templateFileCount: 4,
    ...overrides
  }
  return {
    plan: createTemplatePlan(result, { outputRoot: '/out' }),
    templateRoot: '/template',
    incomingRoot: '/incoming',
    outputRoot: '/out',
    outputRootExists: true
  }
}

/** Platform seam of the setup step; the copy tests never reach the disk. */
const templatePlatform: PlatformPort = createWebPlatformPort()

/** A confirm answer the copy tests never inspect: nothing is written here. */
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

/* ------------------------------------------------------------------ */
/* View harness                                                        */
/* ------------------------------------------------------------------ */

function ViewHarness({
  comparison,
  initialFilter = 'all',
  initialCollapsed = [],
  pickerAvailable = true,
  leftIsSnapshot = false,
  rightIsSnapshot = false,
  toggles,
  selects,
  hideLocalPaths = true
}: {
  readonly comparison: DirectoryComparison
  readonly initialFilter?: DirectoryFilter
  readonly initialCollapsed?: readonly string[]
  readonly pickerAvailable?: boolean
  readonly leftIsSnapshot?: boolean
  readonly rightIsSnapshot?: boolean
  readonly toggles?: string[]
  readonly selects?: string[]
  readonly hideLocalPaths?: boolean
}): JSX.Element {
  const [filter, setFilter] = useState<DirectoryFilter>(initialFilter)
  const [collapsed, setCollapsed] = useState<readonly string[]>(initialCollapsed)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  function togglePath(path: string): void {
    toggles?.push(path)
    setCollapsed((current) =>
      current.includes(path) ? current.filter((item) => item !== path) : [...current, path]
    )
  }

  return (
    <DirectoryView
      sessionId="directory-i18n"
      comparison={comparison}
      filter={filter}
      onFilterChange={setFilter}
      collapsedPaths={collapsed}
      onTogglePath={togglePath}
      selectedPath={selectedPath}
      onSelectPath={(path) => {
        selects?.push(path)
        setSelectedPath(path)
      }}
      scrollTops={{ left: 0, right: 0 }}
      onScrollTopChange={() => undefined}
      visibleCounts={{ ...visibleDirectoryCounts(comparison.root, filter), conflict: 0 }}
      pickerAvailable={pickerAvailable}
      busy={false}
      onPick={() => undefined}
      onOpenFile={() => undefined}
      leftIsSnapshot={leftIsSnapshot}
      rightIsSnapshot={rightIsSnapshot}
      onExportSnapshot={() => undefined}
      onImportSnapshot={() => undefined}
      hideLocalPaths={hideLocalPaths}
      onHideLocalPathsChange={() => undefined}
      onExportReport={() => undefined}
      onPreviewSync={() => undefined}
      onPreviewTemplate={() => undefined}
      platform={templatePlatform}
      syncPreview={null}
      templatePreview={null}
      templateOpen={false}
      onCancelSync={() => undefined}
      onAbortSync={() => {}}
      onConfirmSync={() => undefined}
      onPreviewTemplateRoots={async () => null}
      onCancelTemplate={() => undefined}
      onConfirmTemplate={templateOutcome}
    />
  )
}

function trees(): readonly [HTMLElement, HTMLElement] {
  const [left, right] = screen.getAllByRole('tree')
  return [left, right]
}

function renderedRows(tree: HTMLElement): HTMLElement[] {
  return Array.from(tree.querySelectorAll<HTMLElement>('[role="treeitem"]'))
}

function renderedPaths(tree: HTMLElement, rootName: string): string[] {
  return renderedRows(tree).map((row) => {
    const title = row.getAttribute('title') ?? ''
    return title === rootName ? '' : title
  })
}

function button(name: string): HTMLElement {
  return screen.getByRole('button', { name })
}

function checkbox(name: string): HTMLElement {
  return screen.getByRole('checkbox', { name })
}

function expectNoHan(values: readonly (string | null | undefined)[]): void {
  for (const value of values) {
    expect(value ?? '', value ?? '').not.toMatch(HAN)
  }
}

/** Statuses the directory legend renders, in the legend's display order. */
const LEGEND_STATUSES = ['same', 'added', 'removed', 'modified'] as const

/** The toolbar legend root, located by its four directory status labels. */
function directoryLegend(dictionary: typeof en | typeof zh): HTMLElement {
  const labels = LEGEND_STATUSES.map((status) => dictionary[DIRECTORY_STATUS_LABEL_KEYS[status]])
  const legend = Array.from(document.querySelectorAll<HTMLElement>('span')).find((span) => {
    const cells = Array.from(span.children)
    return (
      cells.length === labels.length &&
      labels.every((label, index) => cells[index]?.textContent?.includes(label) === true)
    )
  })
  if (!legend) throw new Error('no directory legend found')
  return legend
}

/** Legend counts keyed by status, independent of the horizontal cell order. */
function legendCounts(dictionary: typeof en | typeof zh): Record<FileDiffStatus, number> {
  const counts: Record<FileDiffStatus, number> = { same: 0, added: 0, removed: 0, modified: 0 }
  for (const cell of Array.from(directoryLegend(dictionary).children)) {
    const text = cell.textContent ?? ''
    const status = LEGEND_STATUSES.find((candidate) =>
      text.includes(dictionary[DIRECTORY_STATUS_LABEL_KEYS[candidate]])
    )
    if (!status) throw new Error(`legend cell has no directory status label: ${text}`)
    counts[status] = Number(cell.querySelector('.tabular')?.textContent)
  }
  return counts
}

/* ------------------------------------------------------------------ */
/* DirectoryView copy                                                  */
/* ------------------------------------------------------------------ */

describe('DirectoryView bilingual copy', () => {
  it('renders the five filters in DIRECTORY_FILTERS order with dictionary labels', () => {
    renderWithI18n(<ViewHarness comparison={buildComparison()} />, 'en')
    const group = screen.getByRole('tablist', { name: 'Difference filter' })
    const labels = within(group)
      .getAllByRole('tab')
      .map((tab) => tab.textContent)
    expect(labels).toEqual(DIRECTORY_FILTERS.map((filter) => en[FILTER_LABEL_KEYS[filter]]))
  })

  it('keeps the zh filter wording verbatim and the group name unchanged', () => {
    renderWithI18n(<ViewHarness comparison={buildComparison()} />, 'zh')
    const group = screen.getByRole('tablist', { name: zh['directory.filter.group'] })
    const labels = within(group)
      .getAllByRole('tab')
      .map((tab) => tab.textContent)
    expect(labels).toEqual(DIRECTORY_FILTERS.map((filter) => zh[FILTER_LABEL_KEYS[filter]]))
  })

  it('keeps sample paths and sample entries out of the workflow toolbar', () => {
    for (const language of ['en', 'zh'] as const) {
      const view = renderWithI18n(<ViewHarness comparison={buildComparison()} />, language)

      const buttons = screen.getAllByRole('button')
      expect(buttons.length, language).toBeGreaterThan(0)
      for (const element of buttons) {
        expect(element.textContent ?? '', language).not.toContain('/samples')
        expect(element.getAttribute('title') ?? '', language).not.toContain('/samples')
      }
      expect(document.querySelectorAll('[data-sample-entry]').length, language).toBe(0)
      expect(document.querySelectorAll('[data-shell-entry="samples"]').length, language).toBe(0)
      expect(document.querySelectorAll('[data-shell-entry="samples-menu"]').length, language).toBe(
        0
      )
      view.unmount()
    }

    // The template tooltip no longer names the built-in scattered tree either.
    expect(en['directory.toolbar.templateTitle']).not.toContain('built-in')
    expect(zh['directory.toolbar.templateTitle']).not.toContain('内置')
  })

  it('localizes all nine real toolbar buttons and their titles', () => {
    renderWithI18n(<ViewHarness comparison={buildComparison()} />, 'en')
    for (const [label, key] of EN_TOOLBAR) {
      expect(button(label).getAttribute('title')).toBe(en[key])
    }

    for (const [key, text] of [
      ['directory.toolbar.pickLeft', '选择左目录'],
      ['directory.toolbar.previewSync', '预览并同步'],
      ['directory.toolbar.template', '模板归位'],
      ['directory.toolbar.exportLeft', '导出左侧快照'],
      ['directory.toolbar.importLeft', '导入左侧快照'],
      ['directory.toolbar.exportRight', '导出右侧快照'],
      ['directory.toolbar.importRight', '导入右侧快照'],
      ['directory.report.toolbar.export', '导出 HTML 报告'],
      ['directory.report.toolbar.hideLocalPaths', '隐藏本机路径']
    ] as const) {
      expect(zh[key]).toBe(text)
    }

    cleanup()
    renderWithI18n(<ViewHarness comparison={buildComparison()} />, 'zh')
    expect(button(zh['directory.toolbar.pickLeft']).getAttribute('title')).toBe(
      zh['directory.toolbar.pickLeftTitle']
    )
    expect(button(zh['directory.toolbar.previewSync']).getAttribute('title')).toBe(
      zh['directory.toolbar.previewSyncTitle']
    )
    expect(button(zh['directory.report.toolbar.export']).getAttribute('title')).toBe(
      zh['directory.report.toolbar.exportTitle']
    )
    expect(checkbox(zh['directory.report.toolbar.hideLocalPaths']).closest('label')?.getAttribute('title')).toBe(
      zh['directory.report.toolbar.hideLocalPathsTitle']
    )
  })

  it('defaults the hide-local-paths switch on and carries the English title', () => {
    renderWithI18n(<ViewHarness comparison={buildComparison()} />, 'en')

    const switchInput = checkbox(en['directory.report.toolbar.hideLocalPaths']) as HTMLInputElement
    expect(switchInput.checked).toBe(true)
    expect(switchInput.closest('label')?.getAttribute('title')).toBe(
      en['directory.report.toolbar.hideLocalPathsTitle']
    )
    expect(button(en['directory.report.toolbar.export']).getAttribute('title')).toBe(
      en['directory.report.toolbar.exportTitle']
    )
  })

  it('gates the picker titles on pickerAvailable in both languages', () => {
    const enView = renderWithI18n(<ViewHarness comparison={buildComparison()} />, 'en')
    expect(screen.queryByText(en['directory.picker.unavailable'])).toBeNull()
    expect(button('Choose left folder').getAttribute('title')).toBe(
      en['directory.toolbar.pickLeftTitle']
    )
    enView.unmount()

    renderWithI18n(
      <ViewHarness comparison={buildComparison()} pickerAvailable={false} />,
      'en'
    )
    expect(screen.getByText(en['directory.picker.unavailable'])).toBeDefined()
    // The copy can no longer point at the removed demo toolbar button.
    expect(en['directory.picker.unavailable']).not.toContain('Load demo folder')
    expect(en['directory.picker.unavailable']).toContain('Settings → Samples & debugging')
    expect(button('Choose left folder').getAttribute('title')).toBeNull()
    expect(button('Choose right folder').getAttribute('title')).toBeNull()
    cleanup()

    renderWithI18n(
      <ViewHarness comparison={buildComparison()} pickerAvailable={false} />,
      'zh'
    )
    expect(screen.getByText(zh['directory.picker.unavailable'])).toBeDefined()
    expect(zh['directory.picker.unavailable']).not.toContain('加载演示目录')
    expect(zh['directory.picker.unavailable']).toContain('设置 → 示例与调试')
    expect(button(zh['directory.toolbar.pickLeft']).getAttribute('title')).toBeNull()
    expect(button(zh['directory.toolbar.pickRight']).getAttribute('title')).toBeNull()
  })

  it('localizes the two hidden snapshot inputs', () => {
    renderWithI18n(<ViewHarness comparison={buildComparison()} />, 'en')
    expect(screen.getByLabelText('Choose left snapshot file')).toBeDefined()
    expect(screen.getByLabelText('Choose right snapshot file')).toBeDefined()
    cleanup()

    renderWithI18n(<ViewHarness comparison={buildComparison()} />, 'zh')
    expect(screen.getByLabelText(zh['directory.snapshot.pickLeftFile'])).toBeDefined()
    expect(screen.getByLabelText(zh['directory.snapshot.pickRightFile'])).toBeDefined()
  })

  it('localizes panel meta and switches it to Snapshot per side', () => {
    renderWithI18n(<ViewHarness comparison={buildComparison()} />, 'en')
    expect(screen.getByText('Source folder')).toBeDefined()
    expect(screen.getByText('Target folder')).toBeDefined()
    cleanup()

    renderWithI18n(<ViewHarness comparison={buildComparison()} leftIsSnapshot />, 'en')
    expect(screen.getByText('Snapshot')).toBeDefined()
    expect(screen.getByText('Target folder')).toBeDefined()
    cleanup()

    renderWithI18n(<ViewHarness comparison={buildComparison()} />, 'zh')
    expect(screen.getByText(zh['directory.panel.source'])).toBeDefined()
    expect(screen.getByText(zh['directory.panel.target'])).toBeDefined()
    cleanup()

    renderWithI18n(<ViewHarness comparison={buildComparison()} rightIsSnapshot />, 'zh')
    expect(screen.getByText(zh['directory.panel.snapshot'])).toBeDefined()
    expect(screen.getByText(zh['directory.panel.source'])).toBeDefined()
  })

  it('never translates panel titles, subtitles or tree labels', () => {
    const comparison = chineseComparison()
    for (const language of ['zh', 'en'] as const) {
      const view = renderWithI18n(<ViewHarness comparison={comparison} />, language)
      expect(screen.getByTitle(comparison.leftName)).toBeDefined()
      expect(screen.getByTitle(comparison.rightName)).toBeDefined()
      expect(screen.getByText(comparison.leftRoot)).toBeDefined()
      expect(screen.getByText(comparison.rightRoot)).toBeDefined()
      const [left, right] = trees()
      expect(left.getAttribute('aria-label')).toBe(comparison.leftName)
      expect(right.getAttribute('aria-label')).toBe(comparison.rightName)
      view.unmount()
    }
  })

  it('localizes the per-side empty state without touching the other side', () => {
    const comparison = leftOnlyComparison()
    renderWithI18n(
      <ViewHarness comparison={comparison} initialFilter="left-only" />,
      'en'
    )
    const [left] = trees()
    expect(renderedRows(left)).toHaveLength(2)
    expect(screen.getByText('No entries in the right folder under this filter.')).toBeDefined()
    cleanup()

    renderWithI18n(
      <ViewHarness comparison={comparison} initialFilter="left-only" />,
      'zh'
    )
    expect(screen.getByText(zh['directory.empty.right'])).toBeDefined()
  })

  it('localizes the skipped line and hides it when nothing was skipped', () => {
    const skipped = buildComparison({ leftSkipped: 2, rightSkipped: 1 })
    renderWithI18n(<ViewHarness comparison={skipped} />, 'en')
    expect(screen.getByText('Skipped: left 2 / right 1')).toBeDefined()
    cleanup()

    renderWithI18n(<ViewHarness comparison={skipped} />, 'zh')
    expect(screen.getByText('已跳过：左 2 / 右 1')).toBeDefined()
    cleanup()

    renderWithI18n(<ViewHarness comparison={buildComparison()} />, 'en')
    expect(screen.queryByText(/^Skipped:/)).toBeNull()
  })

  it('localizes the drilldown hint and keeps its formats', () => {
    renderWithI18n(<ViewHarness comparison={buildComparison()} />, 'en')
    const hint = screen.getByText(/^Double-click/)
    expect(hint.textContent).toContain('CSV / TSV / JSON / YAML')
    expect(hint.textContent).not.toMatch(HAN)
    cleanup()

    renderWithI18n(<ViewHarness comparison={buildComparison()} />, 'zh')
    expect(screen.getByText(zh['directory.drilldownHint'])).toBeDefined()
  })

  it('renders the directory legend in the active language', () => {
    // Directory statuses are product-labelled left-only / right-only; the old
    // Added / Removed text-diff words must not reach this legend.
    const enView = renderWithI18n(<ViewHarness comparison={buildComparison()} />, 'en')
    expect(legendCounts(en)).toEqual({ same: 1, added: 1, removed: 1, modified: 1 })
    expect(directoryLegend(en).textContent).not.toMatch(/Added|Removed/)
    enView.unmount()

    renderWithI18n(<ViewHarness comparison={buildComparison()} />, 'zh')
    expect(legendCounts(zh)).toEqual({ same: 1, added: 1, removed: 1, modified: 1 })
    expect(directoryLegend(zh).textContent).not.toMatch(/新增|删除/)
  })

  it('keeps the right-only and left-only legend wording under each filter', () => {
    const cases = [
      { language: 'en', dictionary: en, rightOnly: 'Right only', leftOnly: 'Left only' },
      { language: 'zh', dictionary: zh, rightOnly: '右独有', leftOnly: '左独有' }
    ] as const

    for (const { language, dictionary, rightOnly, leftOnly } of cases) {
      const view = renderWithI18n(
        <ViewHarness comparison={buildComparison()} />,
        language
      )

      fireEvent.click(
        screen.getByRole('tab', { name: dictionary[FILTER_LABEL_KEYS['right-only']] })
      )
      expect(legendCounts(dictionary)).toEqual({ same: 0, added: 1, removed: 0, modified: 0 })
      expect(directoryLegend(dictionary).textContent).toContain(rightOnly)
      expect(directoryLegend(dictionary).textContent).not.toMatch(/Added|Removed|新增|删除/)

      fireEvent.click(
        screen.getByRole('tab', { name: dictionary[FILTER_LABEL_KEYS['left-only']] })
      )
      expect(legendCounts(dictionary)).toEqual({ same: 0, added: 0, removed: 1, modified: 0 })
      expect(directoryLegend(dictionary).textContent).toContain(leftOnly)
      expect(directoryLegend(dictionary).textContent).not.toMatch(/Added|Removed|新增|删除/)

      view.unmount()
    }
  })

  it('labels a right-only row with the right-only badge on the right tree only', () => {
    const comparison = probeComparison('added')
    const enView = renderWithI18n(<ViewHarness comparison={comparison} />, 'en')
    const [enLeft, enRight] = trees()
    const enRow = renderedRows(enRight).find((row) => row.textContent?.includes('探针.txt'))
    expect(enRow).toBeDefined()
    expect(within(enRow as HTMLElement).getByText('Right only').textContent).toBe('Right only')
    expect(enRow?.textContent).not.toContain('Added')
    expect(renderedRows(enLeft).some((row) => row.textContent?.includes('探针.txt'))).toBe(false)
    enView.unmount()

    renderWithI18n(<ViewHarness comparison={comparison} />, 'zh')
    const [zhLeft, zhRight] = trees()
    const zhRow = renderedRows(zhRight).find((row) => row.textContent?.includes('探针.txt'))
    expect(zhRow).toBeDefined()
    expect(within(zhRow as HTMLElement).getByText('右独有').textContent).toBe('右独有')
    expect(zhRow?.textContent).not.toMatch(/新增/)
    expect(renderedRows(zhLeft).some((row) => row.textContent?.includes('探针.txt'))).toBe(false)
  })

  it('labels a left-only row with the left-only badge on the left tree only', () => {
    const comparison = probeComparison('removed')
    const enView = renderWithI18n(<ViewHarness comparison={comparison} />, 'en')
    const [enLeft, enRight] = trees()
    const enRow = renderedRows(enLeft).find((row) => row.textContent?.includes('探针.txt'))
    expect(enRow).toBeDefined()
    expect(within(enRow as HTMLElement).getByText('Left only').textContent).toBe('Left only')
    expect(enRow?.textContent).not.toContain('Removed')
    expect(renderedRows(enRight).some((row) => row.textContent?.includes('探针.txt'))).toBe(false)
    enView.unmount()

    renderWithI18n(<ViewHarness comparison={comparison} />, 'zh')
    const [zhLeft, zhRight] = trees()
    const zhRow = renderedRows(zhLeft).find((row) => row.textContent?.includes('探针.txt'))
    expect(zhRow).toBeDefined()
    expect(within(zhRow as HTMLElement).getByText('左独有').textContent).toBe('左独有')
    expect(zhRow?.textContent).not.toMatch(/删除/)
    expect(renderedRows(zhRight).some((row) => row.textContent?.includes('探针.txt'))).toBe(false)
  })

  it('localizes the expand/collapse toggle without changing selection', () => {
    const toggles: string[] = []
    const selects: string[] = []
    renderWithI18n(
      <ViewHarness
        comparison={buildComparison()}
        initialCollapsed={['src']}
        toggles={toggles}
        selects={selects}
      />,
      'en'
    )
    fireEvent.click(within(trees()[0]).getByRole('button', { name: 'Expand src' }))
    expect(within(trees()[0]).getByRole('button', { name: 'Collapse src' })).toBeDefined()
    expect(toggles).toEqual(['src'])
    expect(selects).toEqual([])
    cleanup()

    renderWithI18n(
      <ViewHarness comparison={buildComparison()} initialCollapsed={['src']} />,
      'zh'
    )
    fireEvent.click(
      within(trees()[0]).getByRole('button', {
        name: zh['directory.tree.expand'].replace('{name}', 'src')
      })
    )
    expect(
      within(trees()[0]).getByRole('button', {
        name: zh['directory.tree.collapse'].replace('{name}', 'src')
      })
    ).toBeDefined()
  })

  it('keeps rows, filters, collapse and callbacks identical across languages', () => {
    function snapshot(language: 'zh' | 'en'): {
      readonly leftPaths: readonly string[]
      readonly rightPaths: readonly string[]
      readonly rowCount: number
      readonly selectedFilterIndex: number
      readonly toggles: readonly string[]
      readonly selects: readonly string[]
    } {
      const toggles: string[] = []
      const selects: string[] = []
      const view = renderWithI18n(
        <ViewHarness
          comparison={buildComparison()}
          initialFilter="differences"
          initialCollapsed={['src']}
          toggles={toggles}
          selects={selects}
        />,
        language
      )
      const [left, right] = trees()
      const filterGroup = screen.getByRole('tablist', {
        name: language === 'en' ? 'Difference filter' : zh['directory.filter.group']
      })
      const selectedFilterIndex = within(filterGroup)
        .getAllByRole('tab')
        .findIndex((tab) => tab.getAttribute('aria-selected') === 'true')
      const leftPaths = renderedPaths(left, 'left')
      const rightPaths = renderedPaths(right, 'right')
      const rowCount = screen.getAllByRole('treeitem').length

      const expand = language === 'en' ? 'Expand src' : zh['directory.tree.expand'].replace('{name}', 'src')
      fireEvent.click(within(left).getByRole('button', { name: expand }))
      fireEvent.click(within(left).getAllByRole('treeitem')[1])
      view.unmount()

      return { leftPaths, rightPaths, rowCount, selectedFilterIndex, toggles, selects }
    }

    const zhSnapshot = snapshot('zh')
    const enSnapshot = snapshot('en')
    expect(enSnapshot).toEqual(zhSnapshot)
    expect(zhSnapshot.leftPaths).not.toContain('src/b.ts')
    expect(zhSnapshot.selectedFilterIndex).toBe(1)
  })

  it('keeps the en surface free of Han characters', () => {
    const view = renderWithI18n(
      <ViewHarness
        comparison={buildComparison({ leftSkipped: 2, rightSkipped: 1 })}
        pickerAvailable={false}
      />,
      'en'
    )
    const covered: (string | null)[] = []
    const filterGroup = screen.getByRole('tablist', { name: 'Difference filter' })
    covered.push(...within(filterGroup).getAllByRole('tab').map((tab) => tab.textContent))
    for (const [label, key] of EN_TOOLBAR) {
      const element = button(label)
      covered.push(element.textContent, element.getAttribute('title'), en[key])
    }
    covered.push(screen.getByText('Source folder').textContent)
    covered.push(screen.getByText('Target folder').textContent)
    covered.push(screen.getByText('Skipped: left 2 / right 1').textContent)
    covered.push(screen.getByText(/^Double-click/).textContent)
    covered.push(screen.getByText(en['directory.picker.unavailable']).textContent)
    covered.push(
      screen.getByLabelText('Choose left snapshot file').getAttribute('aria-label'),
      screen.getByLabelText('Choose right snapshot file').getAttribute('aria-label')
    )
    for (const status of LEGEND_STATUSES) {
      const label = en[DIRECTORY_STATUS_LABEL_KEYS[status]]
      covered.push(...screen.getAllByText(label).map((element) => element.textContent))
    }
    expect(directoryLegend(en).textContent).not.toMatch(/Added|Removed/)
    expectNoHan(covered)
    view.unmount()

    renderWithI18n(
      <ViewHarness comparison={leftOnlyComparison()} initialFilter="left-only" pickerAvailable={false} />,
      'en'
    )
    expectNoHan([
      screen.getByText('No entries in the right folder under this filter.').textContent,
      screen.getByText('Source folder').textContent,
      screen.getByText('Target folder').textContent
    ])
  })
})

/* ------------------------------------------------------------------ */
/* DirectorySyncDialog                                                 */
/* ------------------------------------------------------------------ */

describe('DirectorySyncDialog bilingual copy', () => {
  it('localizes title, description, groups and counts in English', () => {
    const preview = makeSyncPreview({
      mode: 'mirror',
      materializeTarget: true,
      copy: [syncItem('new.txt', 100)],
      update: [syncItem('a.txt', 1024), syncItem('b.txt', 1024)]
    })
    renderWithI18n(
      <DirectorySyncDialog
        preview={preview}
        busy={false}
        onCancel={() => undefined}
        onAbort={() => undefined}
        onConfirm={() => undefined}
      />,
      'en'
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-label')).toBe('Left → Right · Mirror sync preview')
    const description = dialog.querySelector('p')?.textContent ?? ''
    expect(description).toContain('Target root: ')
    expect(description).toContain('/dst')
    expect(description).toContain('(the read-only sample tree is copied to a writable area after you confirm)')
    expect(description).toContain('Total 3 items / 2.1 KiB')

    expect(screen.getByText('Files to copy')).toBeDefined()
    expect(screen.getByText('Files to overwrite')).toBeDefined()
    expect(screen.getByText('Files to delete (mirror)')).toBeDefined()
    expect(screen.getByText('1 item · 100 B')).toBeDefined()
    expect(screen.getByText('2 items · 2.0 KiB')).toBeDefined()
    expect(screen.getByText('0 items · 0 B · 0 selected')).toBeDefined()
    expect(
      screen.getByText('This run: 1 copy · 2 overwrite · 0 delete · 0 link time aligned')
    ).toBeDefined()
    expect(button('Cancel')).toBeDefined()
    expect((button('Apply changes') as HTMLButtonElement).disabled).toBe(false)
  })

  it('keeps the zh title, groups, totals and actions unchanged', () => {
    const preview = makeSyncPreview({
      mode: 'mirror',
      copy: [syncItem('new.txt', 100)],
      update: [syncItem('a.txt', 1024)],
      delete: [syncItem('drop.txt', 20)]
    })
    renderWithI18n(
      <DirectorySyncDialog
        preview={preview}
        busy={false}
        onCancel={() => undefined}
        onAbort={() => undefined}
        onConfirm={() => undefined}
      />,
      'zh'
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-label')).toBe('左 → 右 · 镜像同步预览')
    const description = dialog.querySelector('p')?.textContent ?? ''
    expect(description).toContain(zh['directory.sync.targetRoot'])
    expect(description).toContain(' · 合计 3 项 / 1.1 KiB')
    expect(screen.getByText(zh['directory.sync.group.copy'])).toBeDefined()
    expect(screen.getByText(zh['directory.sync.group.update'])).toBeDefined()
    expect(screen.getByText(zh['directory.sync.group.delete'])).toBeDefined()
    expect(screen.getByText('1 个 · 100 B')).toBeDefined()
    expect(screen.getByText('1 个 · 1.0 KiB')).toBeDefined()
    expect(screen.getByText('1 个 · 20 B · 已选 0')).toBeDefined()
    expect(button('取消')).toBeDefined()
    expect(button('确认执行')).toBeDefined()
  })

  it('hides the delete group in incremental mode and shows None for empty groups', () => {
    const preview = makeSyncPreview({
      mode: 'incremental',
      copy: [syncItem('new.txt', 100)],
      delete: [syncItem('drop.txt', 20)]
    })
    renderWithI18n(
      <DirectorySyncDialog
        preview={preview}
        busy={false}
        onCancel={() => undefined}
        onAbort={() => undefined}
        onConfirm={() => undefined}
      />,
      'en'
    )
    expect(screen.queryByText('Files to delete (mirror)')).toBeNull()
    expect(screen.getAllByText('None')).toHaveLength(1)
    cleanup()

    const mirror = makeSyncPreview({
      mode: 'mirror',
      copy: [syncItem('new.txt', 100)]
    })
    renderWithI18n(
      <DirectorySyncDialog
        preview={mirror}
        busy={false}
        onCancel={() => undefined}
        onAbort={() => undefined}
        onConfirm={() => undefined}
      />,
      'zh'
    )
    expect(screen.getAllByText(zh['directory.none'])).toHaveLength(2)
  })

  it('renders the empty plan and disables Apply in English', () => {
    renderWithI18n(
      <DirectorySyncDialog
        preview={makeSyncPreview()}
        busy={false}
        onCancel={() => undefined}
        onAbort={() => undefined}
        onConfirm={() => undefined}
      />,
      'en'
    )
    expect(
      screen.getByText(
        'This direction has no changes to sync; the target already matches the source.'
      )
    ).toBeDefined()
    expect((button('Apply changes') as HTMLButtonElement).disabled).toBe(true)
    cleanup()

    renderWithI18n(
      <DirectorySyncDialog
        preview={makeSyncPreview()}
        busy={false}
        onCancel={() => undefined}
        onAbort={() => undefined}
        onConfirm={() => undefined}
      />,
      'zh'
    )
    expect(screen.getByText(zh['directory.sync.empty'])).toBeDefined()
    expect((button(zh['directory.sync.apply']) as HTMLButtonElement).disabled).toBe(true)
  })

  it('starts mirror deletions unchecked, requires a selection and confirms only checked paths', () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const preview = makeSyncPreview({
      mode: 'mirror',
      delete: [syncItem('keep.txt', 10), syncItem('drop.txt', 20)]
    })
    renderWithI18n(
      <DirectorySyncDialog
        preview={preview}
        busy={false}
        onCancel={onCancel}
        onAbort={() => undefined}
        onConfirm={onConfirm}
      />,
      'en'
    )

    const keep = checkbox('Delete keep.txt') as HTMLInputElement
    const drop = checkbox('Delete drop.txt') as HTMLInputElement
    expect(keep.checked).toBe(false)
    expect(drop.checked).toBe(false)
    // Only unselected deletions: nothing is executable, and the reason is shown.
    expect((button('Apply changes') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Delete items are unchecked by default/)).toBeDefined()

    fireEvent.click(button('Select all'))
    expect(keep.checked).toBe(true)
    expect(drop.checked).toBe(true)
    fireEvent.click(button('Clear'))
    expect(keep.checked).toBe(false)
    expect(drop.checked).toBe(false)

    // A single explicit selection is the only deletion that can be confirmed.
    fireEvent.click(drop)
    expect(
      screen.getByText('This run: 0 copy · 0 overwrite · 1 delete · 0 link time aligned')
    ).toBeDefined()
    expect((button('Apply changes') as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(button('Apply changes'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith(['drop.txt'])

    fireEvent.click(button('Cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
    cleanup()

    renderWithI18n(
      <DirectorySyncDialog
        preview={preview}
        busy={false}
        onCancel={() => undefined}
        onAbort={() => undefined}
        onConfirm={() => undefined}
      />,
      'zh'
    )
    expect(
      (
        checkbox(
          zh['directory.sync.deleteItem'].replace('{path}', 'keep.txt')
        ) as HTMLInputElement
      ).checked
    ).toBe(false)
    expect(button(zh['directory.sync.selectAll'])).toBeDefined()
    expect((button(zh['directory.sync.apply']) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows the busy labels, keeps cancel usable mid-run and stays Han free', () => {
    const { container } = renderWithI18n(
      <DirectorySyncDialog
        preview={makeSyncPreview()}
        busy={false}
        onCancel={() => undefined}
        onAbort={() => undefined}
        onConfirm={() => undefined}
      />,
      'en'
    )
    expect(container.textContent ?? '').not.toMatch(HAN)
    cleanup()

    const onCancel = vi.fn()
    const onAbort = vi.fn()
    renderWithI18n(
      <DirectorySyncDialog
        preview={makeSyncPreview({
          mode: 'mirror',
          copy: [syncItem('new.txt', 100)],
          delete: [syncItem('drop.txt', 20)]
        })}
        busy
        onCancel={onCancel}
        onAbort={onAbort}
        onConfirm={() => undefined}
      />,
      'en'
    )
    // Apply is locked while the run is in flight, but the same cancel action
    // stays usable and stops the run (it aborts; it never just closes).
    expect((button('Syncing…') as HTMLButtonElement).disabled).toBe(true)
    const cancel = button('Cancel') as HTMLButtonElement
    expect(cancel.disabled).toBe(false)
    fireEvent.click(cancel)
    expect(onAbort).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })
})

/* ------------------------------------------------------------------ */
/* TemplateDialog                                                      */
/* ------------------------------------------------------------------ */

describe('TemplateDialog bilingual copy', () => {
  it('localizes title, description, sections, reasons and counts in English', () => {
    renderWithI18n(
      <TemplateDialog
        platform={templatePlatform}
        templateRoot="/template"
        preview={makeTemplatePreview()}
        busy={false}
        onPreview={async () => null}
        onCancel={() => undefined}
        onConfirm={templateOutcome}
      />,
      'en'
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-label')).toBe('Template placement preview')
    const description = dialog.querySelector('p')?.textContent ?? ''
    expect(description).toContain('Template A: /template')
    expect(description).toContain('Scattered tree B: /incoming')
    expect(description).toContain('Output root: /out')

    expect(screen.getByText('Matched')).toBeDefined()
    expect(screen.getByText('Missing slots')).toBeDefined()
    expect(screen.getByText('Conflicts')).toBeDefined()
    expect(screen.getByText('Unused files in B')).toBeDefined()
    expect(screen.getAllByText('1 item')).toHaveLength(2)
    expect(screen.getByText('2 items')).toBeDefined()
    expect(screen.getByText('3 items')).toBeDefined()
    expect(screen.getByText('Multiple candidates with the same name')).toBeDefined()
    expect(screen.getByText('Same name, different content')).toBeDefined()
    const candidate = screen.getByLabelText(
      en['directory.template.conflict.candidate'].replace('{path}', 'app/c.ts')
    ) as HTMLSelectElement
    expect(Array.from(candidate.options).map((option) => option.value)).toEqual([
      '',
      '/incoming/one/c.ts',
      '/incoming/two/c.ts'
    ])
    expect(screen.getAllByText(en['directory.template.conflict.choose']).length).toBe(2)
    expect(button('Cancel')).toBeDefined()
    expect(button('Place files')).toBeDefined()
  })

  it('keeps the zh template wording unchanged', () => {
    renderWithI18n(
      <TemplateDialog
        platform={templatePlatform}
        templateRoot="/template"
        preview={makeTemplatePreview()}
        busy={false}
        onPreview={async () => null}
        onCancel={() => undefined}
        onConfirm={templateOutcome}
      />,
      'zh'
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-label')).toBe(zh['directory.template.title'])
    const description = dialog.querySelector('p')?.textContent ?? ''
    expect(description).toContain(zh['directory.template.label.template'])
    expect(description).toContain(zh['directory.template.label.incoming'])
    expect(description).toContain(zh['directory.template.label.output'])
    expect(screen.getByText(zh['directory.template.section.matched'])).toBeDefined()
    expect(screen.getByText(zh['directory.template.section.missing'])).toBeDefined()
    expect(screen.getByText(zh['directory.template.section.conflicts'])).toBeDefined()
    expect(screen.getByText(zh['directory.template.section.unused'])).toBeDefined()
    expect(screen.getByText(zh['directory.template.reason.ambiguous'])).toBeDefined()
    expect(screen.getByText(zh['directory.template.reason.contentMismatch'])).toBeDefined()
    expect(screen.getAllByText('1 个')).toHaveLength(2)
    expect(button('取消')).toBeDefined()
    expect(button('确认归位')).toBeDefined()
  })

  it('disables the confirm action when nothing matched and shows None', () => {
    renderWithI18n(
      <TemplateDialog
        platform={templatePlatform}
        templateRoot="/template"
        preview={makeTemplatePreview({ matched: [], templateFileCount: 3 })}
        busy={false}
        onPreview={async () => null}
        onCancel={() => undefined}
        onConfirm={templateOutcome}
      />,
      'en'
    )
    expect((button('Place files') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getAllByText('None').length).toBeGreaterThan(0)
    cleanup()

    renderWithI18n(
      <TemplateDialog
        platform={templatePlatform}
        templateRoot="/template"
        preview={makeTemplatePreview({ matched: [], templateFileCount: 3 })}
        busy
        onPreview={async () => null}
        onCancel={() => undefined}
        onConfirm={templateOutcome}
      />,
      'en'
    )
    expect(screen.getByText('Placing…')).toBeDefined()
  })

  it('keeps the whole en template dialog Han free', () => {
    const { container } = renderWithI18n(
      <TemplateDialog
        platform={templatePlatform}
        templateRoot="/template"
        preview={makeTemplatePreview()}
        busy={false}
        onPreview={async () => null}
        onCancel={() => undefined}
        onConfirm={templateOutcome}
      />,
      'en'
    )
    expect(container.textContent ?? '').not.toMatch(HAN)
  })
})

/* Keep the direction/mode key maps exercised independently of the dialogs. */
describe('shared directory key maps', () => {
  it('maps every direction and mode to a dictionary key', () => {
    expect(en[SYNC_DIRECTION_KEYS['left-to-right']]).toBe('Left → Right')
    expect(en[SYNC_DIRECTION_KEYS['right-to-left']]).toBe('Right → Left')
    expect(en[SYNC_MODE_KEYS.incremental]).toBe('Incremental')
    expect(en[SYNC_MODE_KEYS.mirror]).toBe('Mirror')
  })
})
