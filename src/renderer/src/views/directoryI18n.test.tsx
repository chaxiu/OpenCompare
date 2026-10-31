// @vitest-environment jsdom
import { useState } from 'react'
import type { JSX } from 'react'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { DirectoryComparison, DirectoryDiffNode, FileDiffStatus } from '@core/directory/compare'
import { DIRECTORY_FILTERS } from '@core/directory/filter'
import type { DirectoryFilter } from '@core/directory/filter'
import type {
  SyncDirection,
  SyncMode,
  SyncPlanGroup,
  SyncPlanItem
} from '@core/directory/sync'
import type { TemplateMatchResult } from '@core/directory/template'
import { en, zh } from '@renderer/i18n/messages'
import { renderWithI18n } from '@renderer/i18n/testing'
import type { SyncPreview, TemplatePreview } from '@renderer/workbench/directoryOps'
import { DirectorySyncDialog } from './DirectorySyncDialog'
import { DirectoryView } from './DirectoryView'
import { FILTER_LABEL_KEYS, SYNC_DIRECTION_KEYS, SYNC_MODE_KEYS } from './directoryCopy'
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
    originalTargetRoot: '/dst'
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
        size: 12,
        hash: 'a1',
        text: 'a'
      }
    ],
    missing: [{ relativePath: 'app/b.ts', templatePath: '/template/app/b.ts', size: 20 }],
    conflicts: [
      {
        relativePath: 'app/c.ts',
        templatePath: '/template/app/c.ts',
        reason: 'ambiguous',
        candidates: [
          { path: '/incoming/one/c.ts', size: 1, hash: 'c1' },
          { path: '/incoming/two/c.ts', size: 2, hash: 'c2' }
        ]
      },
      {
        relativePath: 'app/d.ts',
        templatePath: '/template/app/d.ts',
        reason: 'content-mismatch',
        candidates: [{ path: '/incoming/three/d.ts', size: 3, hash: 'c3' }]
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
  return { result, templateRoot: '/template', incomingRoot: '/incoming', targetRoot: '/out' }
}

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
      visibleCounts={{ ...comparison.counts, conflict: 0 }}
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
      syncPreview={null}
      templatePreview={null}
      onCancelSync={() => undefined}
      onConfirmSync={() => undefined}
      onCancelTemplate={() => undefined}
      onConfirmTemplate={() => undefined}
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

  it('renders the shared legend in the active language', () => {
    renderWithI18n(<ViewHarness comparison={buildComparison()} />, 'en')
    for (const label of ['Same', 'Added', 'Removed', 'Modified']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
    cleanup()

    renderWithI18n(<ViewHarness comparison={buildComparison()} />, 'zh')
    for (const label of ['相同', '新增', '删除', '修改']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
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
    for (const label of ['Same', 'Added', 'Removed', 'Modified']) {
      covered.push(...screen.getAllByText(label).map((element) => element.textContent))
    }
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
    expect(screen.getByText('0 items · 0 B')).toBeDefined()
    expect(screen.getByText('This run: 1 copy · 2 overwrite · 0 delete')).toBeDefined()
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
    expect(screen.getByText('1 个 · 20 B')).toBeDefined()
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
    expect(screen.getByText('This run: 0 copy · 0 overwrite · 1 delete')).toBeDefined()
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

  it('shows the busy labels and keeps the whole en dialog Han free', () => {
    const { container } = renderWithI18n(
      <DirectorySyncDialog
        preview={makeSyncPreview()}
        busy={false}
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
      'en'
    )
    expect(container.textContent ?? '').not.toMatch(HAN)
    cleanup()

    renderWithI18n(
      <DirectorySyncDialog
        preview={makeSyncPreview({
          mode: 'mirror',
          copy: [syncItem('new.txt', 100)],
          delete: [syncItem('drop.txt', 20)]
        })}
        busy
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
      'en'
    )
    expect((button('Syncing…') as HTMLButtonElement).disabled).toBe(true)
  })
})

/* ------------------------------------------------------------------ */
/* TemplateDialog                                                      */
/* ------------------------------------------------------------------ */

describe('TemplateDialog bilingual copy', () => {
  it('localizes title, description, sections, reasons and counts in English', () => {
    renderWithI18n(
      <TemplateDialog
        preview={makeTemplatePreview()}
        busy={false}
        onCancel={() => undefined}
        onConfirm={() => undefined}
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
    expect(screen.getByText('/incoming/one/c.ts · /incoming/two/c.ts')).toBeDefined()
    expect(button('Cancel')).toBeDefined()
    expect(button('Extract and place')).toBeDefined()
  })

  it('keeps the zh template wording unchanged', () => {
    renderWithI18n(
      <TemplateDialog
        preview={makeTemplatePreview()}
        busy={false}
        onCancel={() => undefined}
        onConfirm={() => undefined}
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
    expect(button('确认提取归位')).toBeDefined()
  })

  it('disables the confirm action when nothing matched and shows None', () => {
    renderWithI18n(
      <TemplateDialog
        preview={makeTemplatePreview({ matched: [], templateFileCount: 3 })}
        busy={false}
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
      'en'
    )
    expect((button('Extract and place') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getAllByText('None').length).toBeGreaterThan(0)
    cleanup()

    renderWithI18n(
      <TemplateDialog
        preview={makeTemplatePreview({ matched: [], templateFileCount: 3 })}
        busy
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
      'en'
    )
    expect(screen.getByText('Placing…')).toBeDefined()
  })

  it('keeps the whole en template dialog Han free', () => {
    const { container } = renderWithI18n(
      <TemplateDialog
        preview={makeTemplatePreview()}
        busy={false}
        onCancel={() => undefined}
        onConfirm={() => undefined}
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
