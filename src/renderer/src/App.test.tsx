// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CSV_SCENE, DIRECTORY_SAMPLE_PATHS, STRUCTURED_SCENE } from '@shared/fixtures'
import type { CompareRequestPayload } from '@shared/compareRequest'
import type { DirectoryEntry, PlatformPort } from '@shared/platform/types'
import { compareDirectories, createComparisonCache } from '@core/directory/compare'
import { probeTextBytes } from '@core/text/probe'
import { zh } from './i18n/messages'
import { App } from './App'
import { createWebPlatformPort } from './platform/web-platform'
import { Workbench } from './workbench/Workbench'
import { exportSideSnapshot } from './workbench/snapshotOps'
import {
  dropPaths,
  fillComparePaths,
  memoryPort,
  mountWorkbench,
  openAnotherDirectory,
  openAnotherFile,
  openCompareDialog,
  openDirectoryPair,
  openFilePair,
  paneTree,
  scriptedPort,
  sessionTab,
  sessionTabCount,
  sessionTabRows,
  sessionTabs,
  statusText,
  submitCompare,
  submitComparePair,
  templatePort,
  treeRowTitles,
  writeFiles,
  EXTERNAL_TEMPLATE_FILES,
} from '../../test/sharedHarness'
import { installJsdomViewport } from '../../test/jsdomViewport'
import { clickMore, closeMore, moreItem } from '../../test/shellMenu'

/**
 * Counts real row-model builds, so a tab switch can prove that only the active
 * directory session ever builds (or rebuilds) its rows.
 */
const rowBuilds = vi.hoisted(() => ({ count: 0 }))
vi.mock('@core/directory/rows', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@core/directory/rows')>()
  return {
    ...actual,
    buildDirectoryRowModel: (...args: Parameters<typeof actual.buildDirectoryRowModel>) => {
      rowBuilds.count += 1
      return actual.buildDirectoryRowModel(...args)
    },
  }
})

installJsdomViewport()

beforeEach(() => {
  localStorage.setItem('opencompare.userSettings', JSON.stringify({ language: 'zh' }))
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const EMPTY_TITLE = '打开真实文件或文件夹开始对比'

/** Mounts the shell and waits for its first paint at the stored zh language. */
async function renderApp(): Promise<void> {
  render(<App />)
  await screen.findByRole('heading', { name: EMPTY_TITLE })
}

/** The entries the app header renders, in DOM order. */
function appHeaderEntries(): string[] {
  const header = document.querySelector('[data-shell-level="app"]')
  if (header === null) throw new Error('missing app header')
  return Array.from(header.querySelectorAll('[data-shell-entry]')).map((element) => element.getAttribute('data-shell-entry') ?? '')
}

/** Number of ARIA tablists inside the app header. */
function appHeaderTabLists(): number {
  const header = document.querySelector('[data-shell-level="app"]')
  if (header === null) throw new Error('missing app header')
  return header.querySelectorAll('[role="tablist"]').length
}

/** One diff-semantic count from the visible view legend. */
function legendCount(status: string): number {
  return Number(document.querySelector(`[data-legend-status="${status}"] .tabular`)?.textContent)
}

const LEFT_ENGINE = `${DIRECTORY_SAMPLE_PATHS.left}/src/core/engine.ts`
const RIGHT_ENGINE = `${DIRECTORY_SAMPLE_PATHS.right}/src/core/engine.ts`
const LEFT_REPORT = `${DIRECTORY_SAMPLE_PATHS.left}/src/data/report.csv`
const RIGHT_REPORT = `${DIRECTORY_SAMPLE_PATHS.right}/src/data/report.csv`
const SAMPLE_DIRECTORY_ID = `directory:${DIRECTORY_SAMPLE_PATHS.left} ↔ ${DIRECTORY_SAMPLE_PATHS.right}`

/** Runtime truth for the directory session: the engine over the sample roots. */
async function compareSampleDirectory(): Promise<ReturnType<typeof compareDirectories>> {
  const platform = createWebPlatformPort()
  return compareDirectories(
    DIRECTORY_SAMPLE_PATHS.left,
    DIRECTORY_SAMPLE_PATHS.right,
    (path) => platform.listDirectory(path),
    (path) => platform.readTextFile(path),
    createComparisonCache()
  )
}

/** One settings sample entry, addressed by its stable marker. */
function sampleEntry(id: string): HTMLElement {
  const dialog = screen.getByRole('dialog', { name: '设置' })
  const button = dialog.querySelector(`[data-sample-entry="${id}"]`)
  if (!(button instanceof HTMLElement)) throw new Error(`missing sample entry: ${id}`)
  return button
}

/** A port whose left directory listing appends one injected entry on both channels. */
function leftEntryPort(base: PlatformPort, entry: DirectoryEntry): PlatformPort {
  return {
    ...base,
    listDirectory: async (path) => [
      ...(await base.listDirectory(path)),
      ...(path === DIRECTORY_SAMPLE_PATHS.left ? [entry] : []),
    ],
    listDirectories: async (paths) =>
      Promise.all(
        paths.map(async (path) => {
          const entries = await base.listDirectory(path)
          return {
            path,
            ok: true as const,
            entries: path === DIRECTORY_SAMPLE_PATHS.left ? [...entries, entry] : entries,
          }
        })
      ),
  }
}

/** Opens the settings sample section and starts one built-in scene. */
function startSample(id: string): void {
  fireEvent.click(screen.getByRole('button', { name: '打开设置' }))
  fireEvent.click(sampleEntry(id))
}

/** Starts all four built-in scenes through the settings sample entries. */
async function loadDemoSamples(): Promise<void> {
  for (const id of ['directory', 'code', 'csv', 'structured']) {
    startSample(id)
  }
  const list = await screen.findByRole('tablist', { name: '会话' }, { timeout: 4000 })
  for (const name of [/3-Way Merge/, /CSV 主键对比/, /JSON \/ YAML/, /baseline ↔ candidate/]) {
    await within(list).findByRole('tab', { name }, { timeout: 4000 })
  }
  fireEvent.click(within(list).getByRole('tab', { name: /baseline ↔ candidate/ }))
}

/** Debug-only settings entry: the scripted sample read failure. */
function startSampleFailure(): void {
  fireEvent.click(screen.getByRole('button', { name: '打开设置' }))
  const failure = screen.getByRole('dialog', { name: '设置' }).querySelector('[data-sample-failure]')
  if (!(failure instanceof HTMLElement)) throw new Error('missing debugging sample entry')
  fireEvent.click(failure)
}

describe('workbench shell', () => {
  it('mounts the empty workbench on the in-memory PlatformPort', async () => {
    await renderApp()

    expect(screen.getByRole('heading', { name: 'OpenCompare' })).toBeDefined()
    expect(screen.queryByText('对比与三向合并工作台')).toBeNull()
    expect(screen.queryByText('web')).toBeNull()
    expect(screen.getByRole('heading', { name: EMPTY_TITLE })).toBeDefined()
    // Switching scenes is the session tabs' job now: the header has no tablist.
    expect(screen.queryByRole('tablist', { name: '视图切换' })).toBeNull()
    expect(screen.queryByRole('tablist', { name: 'Switch view' })).toBeNull()
    expect(appHeaderEntries()).toEqual(['new-compare', 'settings'])
    expect(appHeaderTabLists()).toBe(0)
    expect(screen.getByRole('button', { name: '打开文件' })).toBeDefined()
    expect(screen.getByRole('button', { name: '打开文件夹' })).toBeDefined()

    // The top bar carries no demo entry, and the empty state keeps three real CTAs.
    expect(document.querySelector('[data-shell-entry="samples"]')).toBeNull()
    expect(document.querySelector('[data-shell-entry="samples-menu"]')).toBeNull()
    expect(screen.queryByRole('button', { name: /加载演示样本|演示样本/ })).toBeNull()
    expect(within(screen.getByRole('main')).getAllByRole('button')).toHaveLength(3)
    // The old tutorial hint is gone: the empty state only keeps its CTAs.
    expect(screen.queryByText(/设置 → 示例与调试/)).toBeNull()
    expect(screen.queryByText(/顶栏/)).toBeNull()
  })

  it('shows the loading state, then every sample session', async () => {
    await renderApp()

    const loading = loadDemoSamples()
    expect(screen.getByRole('heading', { name: '正在载入样本…' })).toBeDefined()
    await loading

    expect(screen.getByRole('tab', { name: /3-Way Merge/ })).toBeDefined()
    expect(document.querySelector('[data-shell-entry="samples"]')).toBeNull()
    expect(document.querySelector('[data-shell-entry="samples-menu"]')).toBeNull()
    expect(statusText()).toContain('文件（源）')
    expect(screen.queryByText(SAMPLE_DIRECTORY_ID)).toBeNull()
    expect(screen.getAllByRole('tab', { name: /CSV 主键对比/ }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('tab', { name: /JSON \/ YAML/ }).length).toBeGreaterThan(0)
    // A ready shell keeps the same header actions and still has no view switcher.
    expect(appHeaderEntries()).toEqual(['new-compare', 'open-file', 'open-folder', 'settings'])
    expect(appHeaderTabLists()).toBe(0)
  })

  it('shows each session tab the type it was opened as and drives the view', async () => {
    await renderApp()
    await loadDemoSamples()

    const tabs = screen.getByRole('tablist', { name: '会话' })
    const iconOf = (id: string): string | null => {
      const node = tabs.querySelector(`[data-session-tab="${id}"]`)
      if (node === null) throw new Error(`missing session tab: ${id}`)
      return node.querySelector('svg[data-icon]')?.getAttribute('data-icon') ?? null
    }
    // One type icon per scene, independent of which tab is active.
    const expected: Readonly<Record<string, string>> = {
      [SAMPLE_DIRECTORY_ID]: 'folder-tree',
      'session-code': 'file-code-corner',
      'session-csv': 'table-2',
      'session-structured': 'braces',
    }
    for (const [id, icon] of Object.entries(expected)) expect(iconOf(id)).toBe(icon)
    expect(new Set(Object.keys(expected).map(iconOf)).size).toBe(4)

    // Clicking a session tab is the only way to switch scenes now.
    const open = (id: string): void => {
      const node = tabs.querySelector(`[data-session-tab="${id}"]`)
      if (!(node instanceof HTMLElement)) throw new Error(`missing session tab: ${id}`)
      fireEvent.click(within(node).getByRole('tab'))
    }

    open('session-code')
    await screen.findByRole('tablist', { name: '代码视图' })
    open('session-csv')
    await screen.findByRole('tablist', { name: '状态过滤' })
    open('session-structured')
    await screen.findByRole('tablist', { name: '结构化格式' })
    open(SAMPLE_DIRECTORY_ID)
    await screen.findByRole('tablist', { name: '差异过滤' })
    // The icons never follow the active state.
    for (const [id, icon] of Object.entries(expected)) expect(iconOf(id)).toBe(icon)
  })

  it('switches the work area and the status bar with the active session', async () => {
    await renderApp()

    await loadDemoSamples()
    const codeTab = await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })

    fireEvent.click(codeTab)

    expect(statusText()).toContain('冲突块')
    expect(screen.getByRole('tab', { name: '三向合并 base · ours · theirs' })).toBeDefined()
    // three-way merge renders three panes, i.e. two draggable dividers
    expect(screen.getAllByRole('separator', { name: '调整分栏宽度' }).length).toBe(2)
  })

  it('shows the key-aligned CSV reconciliation with runtime counts', async () => {
    await renderApp()

    startSample('csv')

    const total = CSV_SCENE.composition.same + CSV_SCENE.composition.added + CSV_SCENE.composition.removed + CSV_SCENE.composition.modified

    // The declared key column is selected and the merged view is sized by the
    // runtime alignment, not the sample answer key.
    const keyPicker = await screen.findByRole('group', { name: '主键列选择' }, { timeout: 4000 })
    expect(within(keyPicker).getByRole('button', { name: 'order_id' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('tablist', { name: '状态过滤' })).toBeDefined()
    expect(screen.getByText(`${total.toLocaleString('en-US')} / ${total.toLocaleString('en-US')} 行`)).toBeDefined()

    const { same } = CSV_SCENE.composition
    expect(statusText()).not.toContain(`${same}相同`)
    expect(statusText()).toContain('行数（左）')
  })

  it('surfaces a readable, retryable error state', async () => {
    await renderApp()

    startSampleFailure()

    expect(await screen.findByRole('heading', { name: '样本库读取失败' }, { timeout: 4000 })).toBeDefined()
    expect(screen.getByRole('button', { name: '重试' })).toBeDefined()
  })

  it('filters the directory comparison and drills a file into its file view', async () => {
    await renderApp()

    await loadDemoSamples()
    await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })

    // Runtime comparison: the paired file shows up in both projected panes.
    expect(screen.getByRole('tablist', { name: '差异过滤' })).toBeDefined()
    expect(screen.getAllByText('engine.ts').length).toBe(2)
    // Status-bar counts are computed by the engine, not read from the answer key.
    const comparison = await compareSampleDirectory()
    const statusBar = statusText() ?? ''
    expect(statusBar).toContain(`文件（源）${comparison.counts.same + comparison.counts.removed + comparison.counts.modified}`)
    expect(statusBar).toContain(`差异${comparison.counts.added + comparison.counts.removed + comparison.counts.modified}`)

    fireEvent.click(screen.getByRole('tab', { name: '仅差异' }))
    expect(screen.queryByText('parser.ts')).toBeNull()
    expect(screen.getAllByText('engine.ts').length).toBe(2)
    // Filtering also refreshes the status-bar legend. Directory statuses use
    // the directory vocabulary (right-only / left-only), not the text-diff words.
    expect(legendCount('same')).toBe(0)
    expect(legendCount('added')).toBe(comparison.counts.added)
    expect(legendCount('removed')).toBe(comparison.counts.removed)
    expect(legendCount('modified')).toBe(comparison.counts.modified)

    fireEvent.click(screen.getByRole('tab', { name: '全部' }))
    fireEvent.doubleClick(screen.getAllByText('engine.ts')[0])

    expect(await screen.findByRole('tab', { name: /engine\.ts/ }, { timeout: 4000 })).toBeDefined()
    expect(screen.getByText(/本地文件 · 双栏字符级 Diff/)).toBeDefined()
  })

  it('drills CSV and YAML files into their typed views', async () => {
    await renderApp()

    await loadDemoSamples()
    await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })

    fireEvent.doubleClick(screen.getAllByText('report.csv')[0])
    expect(await screen.findByRole('tab', { name: /report\.csv/ }, { timeout: 4000 })).toBeDefined()
    // No declared primary key on a drilldown: the first shared column wins.
    expect(await screen.findByText('对齐 4 行 · 主键 order_id')).toBeDefined()
    expect(statusText()).not.toContain('2相同1新增0删除1修改')
    expect(statusText()).toContain('行数（左）')

    const sessionTabs = screen.getByRole('tablist', { name: '会话' })
    fireEvent.click(within(sessionTabs).getByRole('tab', { name: /baseline ↔ candidate/ }))

    // The tab kept its tree while inactive; switching back remounts the view.
    await waitFor(() => expect(screen.getAllByText('deploy.yaml').length).toBeGreaterThan(0))
    fireEvent.doubleClick(screen.getAllByText('deploy.yaml')[0])
    expect(await screen.findByRole('tab', { name: /deploy\.yaml/ }, { timeout: 4000 })).toBeDefined()
    expect(screen.getByText(/YAML 原文/)).toBeDefined()
  })

  it('explains why a non-text file cannot be drilled into', async () => {
    await renderApp()

    await loadDemoSamples()
    await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })

    fireEvent.doubleClick(screen.getAllByText('logo.png')[0])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('暂不支持')
    // the directory session stays put instead of silently doing nothing
    expect(statusText()).toContain('文件（源）')
    expect(screen.queryByText(SAMPLE_DIRECTORY_ID)).toBeNull()
  })

  it('degrades the native directory picker on the web runtime', async () => {
    await renderApp()

    await loadDemoSamples()
    await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })

    expect(moreItem('选择左目录')).toBeDefined()
    expect(moreItem('选择右目录')).toBeDefined()
    closeMore()
    // The demo shortcuts are gone from the workflow toolbar.
    expect(screen.queryByRole('button', { name: '加载演示目录' })).toBeNull()
    expect(screen.queryByRole('button', { name: '演示：远端快照' })).toBeNull()
    expect(screen.getByText(/Web 预览模式没有原生目录选择/)).toBeDefined()
  })

  it('previews a sync dry-run with byte totals and cancels without writing', async () => {
    await renderApp()

    await loadDemoSamples()
    await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })

    fireEvent.click(screen.getByRole('tab', { name: '镜像' }))
    fireEvent.click(screen.getByRole('button', { name: '预览并同步' }))

    const dialog = await screen.findByRole('dialog', { name: /左 → 右 · 镜像同步预览/ })
    expect(within(dialog).getByText('待新增拷贝')).toBeDefined()
    expect(within(dialog).getByText('待覆盖修改')).toBeDefined()
    expect(within(dialog).getByText('待删除（镜像）')).toBeDefined()
    expect(within(dialog).getByText(/合计/)).toBeDefined()

    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    // The sample tree itself is untouched: the comparison still lists both roots.
    expect(screen.getAllByText('/samples/directory/baseline').length).toBeGreaterThan(0)
  })

  it('applies the confirmed sync and refreshes the comparison tree', async () => {
    await renderApp()

    await loadDemoSamples()
    await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })

    const tabCount = sessionTabRows().length
    const directoryTab = within(screen.getByRole('tablist', { name: '会话' })).getByRole('tab', {
      name: /baseline ↔ candidate/,
    })
    expect(directoryTab.getAttribute('aria-label') ?? '').toContain(DIRECTORY_SAMPLE_PATHS.right)

    fireEvent.click(screen.getByRole('button', { name: '预览并同步' }))
    const dialog = await screen.findByRole('dialog', { name: /左 → 右 · 增量同步预览/ })
    fireEvent.click(within(dialog).getByRole('button', { name: '确认执行' }))

    expect(await screen.findByText(/同步完成/)).toBeDefined()
    expect(screen.queryByRole('dialog')).toBeNull()
    // The refresh compares the materialised writable copy, not the read-only mount.
    expect(screen.queryByText('/samples/directory/candidate')).toBeNull()

    // The tab keeps its identity and position, and its label follows the new roots.
    const tabs = sessionTabRows()
    expect(tabs).toHaveLength(tabCount)
    expect(directoryTab.getAttribute('aria-selected')).toBe('true')
    const refreshedLabel = directoryTab.getAttribute('aria-label') ?? ''
    expect(refreshedLabel).toContain(DIRECTORY_SAMPLE_PATHS.left)
    expect(refreshedLabel).toContain('/memory/')
    expect(refreshedLabel).not.toContain(DIRECTORY_SAMPLE_PATHS.right)
  })

  it('previews the template placement and extracts it into a real output root', async () => {
    const port = await templatePort({ directories: ['/ext/a', '/ext/b'] })
    await openDirectoryPair(port, /a ↔ b/)

    clickMore('模板归位')
    const setup = await screen.findByRole('dialog', { name: '模板归位 · 选择根' })

    // Template A is the current left root and stays read-only: no input holds it.
    expect(within(setup).getByText('/ext/a')).toBeDefined()
    expect(screen.queryByDisplayValue('/ext/a')).toBeNull()

    fireEvent.change(within(setup).getByLabelText('散乱树 B 根'), {
      target: { value: '/ext/b' },
    })
    fireEvent.change(within(setup).getByLabelText('输出根'), {
      target: { value: '/ext/out' },
    })
    fireEvent.click(within(setup).getByRole('button', { name: '生成 Dry-run' }))

    const dialog = await screen.findByRole('dialog', { name: '模板归位映射预览' })
    expect(within(dialog).getByText('src/core/strings.ts')).toBeDefined()
    expect(within(dialog).getByText('misc/deep/strings.ts')).toBeDefined()
    expect(within(dialog).getByText(/已存在/)).toBeDefined()

    fireEvent.click(within(dialog).getByRole('button', { name: '确认归位' }))
    // The dialog stays open on the result step and re-checks every written row.
    const result = await screen.findByRole('dialog', { name: zh['directory.template.result.title'] })
    expect(within(result).getByText(zh['directory.template.result.written'].replace('{count}', '1'))).toBeDefined()
    expect(within(result).getByText(zh['directory.template.result.verified'].replace('{count}', '1'))).toBeDefined()
    expect(within(result).getByText('src/core/strings.ts')).toBeDefined()
    await expect(port.readTextFile('/ext/out/src/core/strings.ts')).resolves.toBe(EXTERNAL_TEMPLATE_FILES['/ext/b/misc/deep/strings.ts'])
    // The overwrite row started unchecked, so the existing file is untouched.
    await expect(port.readTextFile('/ext/out/src/core/engine.ts')).resolves.toBe('stale engine\n')

    // A rescan stays inside the same session and reopens the dry-run with the
    // written slot reported as already placed (no checkbox, nothing executable),
    // while the untouched stale target keeps its overwrite guard.
    const tabsBefore = sessionTabRows().length
    fireEvent.click(within(result).getByRole('button', { name: zh['directory.template.result.rescan'] }))
    const rescanned = await screen.findByRole('dialog', { name: zh['directory.template.title'] })
    expect(within(rescanned).getByText(zh['directory.template.section.placed'])).toBeDefined()
    expect(within(rescanned).queryByLabelText('勾选 src/core/strings.ts')).toBeNull()
    expect(within(rescanned).getAllByText(zh['directory.template.overwrite']).length).toBeGreaterThan(0)
    expect(
      (
        within(rescanned).getByRole('button', {
          name: zh['directory.template.place'],
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true)
    expect(sessionTabRows().length).toBe(tabsBefore)
  })

  it('reports the failed count when a checked template write is refused', async () => {
    const base = await templatePort({ directories: ['/ext/a', '/ext/b'] })
    let refuseWrites = false
    const port: PlatformPort = {
      ...base,
      writeTextFile: async (path, content, modifiedMs) => {
        if (refuseWrites && path.startsWith('/ext/out/')) throw new Error('EACCES')
        return base.writeTextFile(path, content, modifiedMs)
      },
    }
    await openDirectoryPair(port, /a ↔ b/)

    clickMore('模板归位')
    const setup = await screen.findByRole('dialog', { name: '模板归位 · 选择根' })
    fireEvent.change(within(setup).getByLabelText('散乱树 B 根'), {
      target: { value: '/ext/b' },
    })
    fireEvent.change(within(setup).getByLabelText('输出根'), {
      target: { value: '/ext/out' },
    })
    fireEvent.click(within(setup).getByRole('button', { name: '生成 Dry-run' }))
    const dialog = await screen.findByRole('dialog', { name: '模板归位映射预览' })

    refuseWrites = true
    fireEvent.click(within(dialog).getByRole('button', { name: '确认归位' }))

    // A refused write is never reported as an all-success run: the result step
    // keeps the dialog open and lists the failed row with its OS code.
    const result = await screen.findByRole('dialog', { name: zh['directory.template.result.title'] })
    expect(within(result).getByText(zh['directory.template.result.written'].replace('{count}', '0'))).toBeDefined()
    expect(within(result).getByText(zh['directory.template.result.writeFailed'].replace('{count}', '1'))).toBeDefined()
    const failureRow = result.querySelector('[data-template-failure-row]') as HTMLElement
    expect(failureRow.textContent).toContain('EACCES')
    expect(result.textContent ?? '').not.toContain('全部成功')
    expect(sessionTabRows().length).toBeGreaterThan(0)
  })

  it('refuses template placement when the left side is a mounted snapshot', async () => {
    const port = await templatePort({ directories: ['/ext/a', '/ext/b'] })
    const listDirectory = vi.fn(port.listDirectory)
    const writeTextFile = vi.fn(port.writeTextFile)
    const ensureDirectory = vi.fn(port.ensureDirectory)
    await openDirectoryPair({ ...port, listDirectory, writeTextFile, ensureDirectory }, /a ↔ b/)

    const exported = await exportSideSnapshot(port, { kind: 'directory', path: '/ext/a' })
    fireEvent.change(screen.getByLabelText('选择左侧快照文件'), {
      target: {
        files: [new File([exported.text], 'a.ocsnap.json', { type: 'application/json' })],
      },
    })
    await screen.findAllByText('/snapshots/left/a')

    listDirectory.mockClear()
    writeTextFile.mockClear()
    ensureDirectory.mockClear()

    clickMore('模板归位')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('当前左侧是快照，不能作为模板 A；请先打开真实目录对比。')
    // No setup step, and neither root was scanned or written.
    expect(screen.queryByRole('dialog', { name: '模板归位 · 选择根' })).toBeNull()
    expect(listDirectory).not.toHaveBeenCalled()
    expect(writeTextFile).not.toHaveBeenCalled()
    expect(ensureDirectory).not.toHaveBeenCalled()
    // The session stays usable: its tab is still there and still mounts the snapshot.
    expect(sessionTabRows().length).toBeGreaterThan(0)
    expect(screen.getAllByText('/snapshots/left/a').length).toBeGreaterThan(0)
  })

  it('cancels the template dry-run without writing and keeps the session usable', async () => {
    const port = await templatePort({ directories: ['/ext/a', '/ext/b'] })
    const writeTextFile = vi.fn(port.writeTextFile)
    const ensureDirectory = vi.fn(port.ensureDirectory)
    await openDirectoryPair({ ...port, writeTextFile, ensureDirectory }, /a ↔ b/)
    const tabsBefore = sessionTabRows().length

    clickMore('模板归位')
    const setup = await screen.findByRole('dialog', { name: '模板归位 · 选择根' })
    fireEvent.change(within(setup).getByLabelText('散乱树 B 根'), {
      target: { value: '/ext/b' },
    })
    fireEvent.change(within(setup).getByLabelText('输出根'), {
      target: { value: '/ext/out' },
    })
    fireEvent.click(within(setup).getByRole('button', { name: '生成 Dry-run' }))
    const dialog = await screen.findByRole('dialog', { name: '模板归位映射预览' })

    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))

    // Cancelling before confirmation writes nothing and keeps the session.
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(writeTextFile).not.toHaveBeenCalled()
    expect(ensureDirectory).not.toHaveBeenCalled()
    expect(sessionTabRows().length).toBe(tabsBefore)

    // The entry is still usable after the cancel.
    clickMore('模板归位')
    expect(await screen.findByRole('dialog', { name: '模板归位 · 选择根' })).toBeDefined()
  })
})

describe('real file workbench', () => {
  it('opens two real files from the pickers without loading a sample', async () => {
    expect(await openFilePair(scriptedPort({ files: [LEFT_ENGINE, RIGHT_ENGINE] }), /engine\.ts/)).toBeDefined()
    expect(statusText()).not.toContain('file:')
    expect(statusText()).toContain('行数（左）')
    // A real pair lands on the shared file-session model, no sample scene involved.
    expect(screen.getByText(/本地文件 · 双栏字符级 Diff/)).toBeDefined()
    expect(screen.queryByRole('tab', { name: /3-Way Merge/ })).toBeNull()
  })

  it('opens two real folders and labels the session with both roots', async () => {
    mountWorkbench(
      scriptedPort({
        directories: [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.incoming, DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right],
      })
    )

    expect(await openAnotherDirectory(/baseline ↔ incoming/)).toBeDefined()
    // The tab's full label carries the two real roots of this pair.
    expect(screen.getByRole('tab', { name: /baseline ↔ incoming/ }).getAttribute('aria-label') ?? '').toContain(
      `${DIRECTORY_SAMPLE_PATHS.left} ↔ ${DIRECTORY_SAMPLE_PATHS.incoming}`
    )
    expect(screen.getAllByText('engine.ts').length).toBeGreaterThan(0)

    // A second pair adds its own tab instead of overwriting the first one.
    expect(await openAnotherDirectory(/baseline ↔ candidate/)).toBeDefined()
    expect(sessionTabRows()).toHaveLength(2)
  })

  it('builds directory rows only for the active session', async () => {
    rowBuilds.count = 0
    mountWorkbench(
      scriptedPort({
        directories: [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.incoming, DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right],
      })
    )

    const firstTab = await openAnotherDirectory(/baseline ↔ incoming/)
    // One mounted directory view = one row model per side.
    const afterFirst = rowBuilds.count
    expect(afterFirst).toBe(2)
    const firstRows = treeRowTitles()

    await openAnotherDirectory(/baseline ↔ candidate/)
    // The background session built nothing while hidden behind the new tab.
    expect(rowBuilds.count).toBe(afterFirst + 2)

    fireEvent.click(firstTab)
    await waitFor(() => expect(rowBuilds.count).toBe(afterFirst + 4))
    // Coming back rebuilds from the same comparison: rows are unchanged.
    expect(treeRowTitles()).toEqual(firstRows)
  })

  it('keeps 3 tabs resident and switches with zero scans or digests', async () => {
    rowBuilds.count = 0
    const base = createWebPlatformPort()
    const answers = [
      DIRECTORY_SAMPLE_PATHS.left,
      DIRECTORY_SAMPLE_PATHS.right,
      DIRECTORY_SAMPLE_PATHS.right,
      DIRECTORY_SAMPLE_PATHS.left,
      DIRECTORY_SAMPLE_PATHS.incoming,
      DIRECTORY_SAMPLE_PATHS.right,
    ]
    let directoryCalls = 0
    let digestCalls = 0
    let realpathCalls = 0
    const port: PlatformPort = {
      ...base,
      selectDirectory: async () => answers.shift() ?? null,
      realpath: async (paths) => {
        realpathCalls += 1
        return base.realpath(paths)
      },
      listDirectories: async (paths) => {
        directoryCalls += 1
        return base.listDirectories(paths)
      },
      digestFiles: async (paths, options) => {
        digestCalls += 1
        return base.digestFiles(paths, options)
      },
    }

    const firstTab = await openDirectoryPair(port, /baseline ↔ candidate/)
    const firstRows = treeRowTitles()
    const firstStatus = statusText()
    expect(firstRows.length).toBeGreaterThan(0)

    for (let pair = 1; pair < 3; pair += 1) {
      fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }))
      await waitFor(() => expect(sessionTabRows()).toHaveLength(pair + 1))
    }

    const tabs = sessionTabRows()
    expect(tabs).toHaveLength(3)
    await waitFor(() => expect(screen.getAllByRole('tree')).toHaveLength(2))

    const digestsBefore = digestCalls
    const scansBefore = directoryCalls
    const realpathsBefore = realpathCalls
    const buildsBefore = rowBuilds.count
    fireEvent.click(firstTab)

    // Switching tabs only remounts the active view: no scan, no digest, no realpath.
    expect(directoryCalls).toBe(scansBefore)
    expect(digestCalls).toBe(digestsBefore)
    expect(realpathCalls).toBe(realpathsBefore)
    expect(screen.queryByText(/正在从摘要缓存重建结果树/)).toBeNull()
    expect(firstTab.getAttribute('aria-selected')).toBe('true')

    await waitFor(() => expect(rowBuilds.count).toBe(buildsBefore + 2))
    // The tab kept its whole comparison: identical rows and four-state counts.
    expect(treeRowTitles()).toEqual(firstRows)
    expect(statusText()).toBe(firstStatus)
    expect(directoryCalls).toBe(scansBefore)
    expect(digestCalls).toBe(digestsBefore)
  })

  it('keeps filter, collapse, selection and scroll across a tab switch', async () => {
    mountWorkbench(
      scriptedPort({
        directories: [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right, DIRECTORY_SAMPLE_PATHS.right, DIRECTORY_SAMPLE_PATHS.left],
      })
    )

    await openAnotherDirectory(/baseline ↔ candidate/)
    const secondTab = await openAnotherDirectory(/candidate ↔ baseline/)

    // Put some real view state on the active (second) tab.
    fireEvent.click(screen.getByRole('tab', { name: '仅差异' }))
    fireEvent.click(screen.getAllByRole('button', { name: '折叠 config' })[0])
    const row = within(screen.getAllByRole('tree')[0]).getAllByText('engine.ts')[0]
    fireEvent.click(row)
    const leftBody = screen.getAllByRole('tree')[0].parentElement as HTMLElement
    leftBody.scrollTop = 96
    fireEvent.scroll(leftBody)

    const sessionTabs = screen.getByRole('tablist', { name: '会话' })
    fireEvent.click(within(sessionTabs).getAllByRole('tab')[0])
    await waitFor(() => expect(screen.getAllByRole('tree')).toHaveLength(2))
    expect(within(sessionTabs).getAllByRole('tab')[0].getAttribute('aria-selected')).toBe('true')

    fireEvent.click(secondTab)
    await waitFor(() => expect(secondTab.getAttribute('aria-selected')).toBe('true'))

    // Back on the second tab: every bit of its view state is still there.
    expect(screen.getByRole('tab', { name: '仅差异' }).getAttribute('aria-selected')).toBe('true')
    expect(within(screen.getAllByRole('tree')[0]).queryAllByText('deploy.yaml')).toHaveLength(0)
    expect(within(screen.getAllByRole('tree')[1]).queryAllByText('deploy.yaml')).toHaveLength(0)
    expect(within(screen.getAllByRole('tree')[0]).getAllByText('engine.ts')[0].closest('[role="treeitem"]')?.getAttribute('aria-selected')).toBe(
      'true'
    )
    const restoredBody = screen.getAllByRole('tree')[0].parentElement as HTMLElement
    expect(restoredBody.scrollTop).toBe(96)
  })

  it('reuses an alias root through the cache without folding its tab', async () => {
    const base = createWebPlatformPort()
    for (const root of ['real', 'alias']) {
      for (const side of ['left', 'right']) {
        await base.ensureDirectory(`/memory/${root}/${side}`)
      }
    }
    for (const root of ['real', 'alias']) {
      // Same size/mtime, different body: the real pass must hash this pair.
      await base.writeTextFile(`/memory/${root}/left/a.txt`, 'alpha', 1000)
      await base.writeTextFile(`/memory/${root}/right/a.txt`, 'alphA', 1000)
      await base.writeTextFile(`/memory/${root}/left/b.txt`, 'bravo', 1000)
      await base.writeTextFile(`/memory/${root}/right/b.txt`, 'bravo', 1000)
    }
    const answers = ['/memory/real/left', '/memory/real/right', '/memory/alias/left', '/memory/alias/right']
    let digestCalls = 0
    const port: PlatformPort = {
      ...base,
      selectDirectory: async () => answers.shift() ?? null,
      realpath: async (paths) => paths.map((path) => path.replace('/memory/alias/', '/memory/real/')),
      digestFiles: async (paths, options) => {
        digestCalls += 1
        return base.digestFiles(paths, options)
      },
    }

    await openDirectoryPair(port, /left ↔ right/)
    await waitFor(() => expect(digestCalls).toBeGreaterThan(0))
    await waitFor(() => expect((screen.getByRole('button', { name: '打开文件夹' }) as HTMLButtonElement).disabled).toBe(false))
    const digestsBefore = digestCalls

    fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }))

    // The alias root registers the real cache key, so the second pass hashes
    // nothing; the tab itself is still a second tab with the user's path.
    await waitFor(() => expect(sessionTabRows()).toHaveLength(2))
    expect(digestCalls).toBe(digestsBefore)
    const aliasTab = sessionTabRows()[1]
    expect(aliasTab.getAttribute('aria-label') ?? '').toContain('/memory/alias/left')
  })

  it('keeps one tab when the same directory pair is compared again', async () => {
    mountWorkbench(
      scriptedPort({
        directories: [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right, DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right],
      })
    )

    await openAnotherDirectory(/baseline ↔ candidate/)
    fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }))

    await waitFor(() => {
      const tabs = sessionTabRows()
      expect(tabs.filter((tab) => /baseline ↔ candidate/.test(tab.textContent ?? ''))).toHaveLength(1)
    })
  })

  it('leaves the workbench untouched when a picker is cancelled', async () => {
    mountWorkbench(scriptedPort({}))

    fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }))

    await waitFor(() => expect(screen.queryByRole('tablist', { name: '会话' })).toBeNull())
    expect(screen.getByRole('heading', { name: EMPTY_TITLE })).toBeDefined()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('opens nothing when the second picker is cancelled', async () => {
    // The left side resolves, the right one is dismissed.
    mountWorkbench(scriptedPort({ files: [LEFT_ENGINE] }))

    fireEvent.click(screen.getByRole('button', { name: '打开文件' }))

    await waitFor(() => expect(screen.queryByRole('tablist', { name: '会话' })).toBeNull())
    expect(screen.getByRole('heading', { name: EMPTY_TITLE })).toBeDefined()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('adds an independent tab for every opened pair', async () => {
    mountWorkbench(
      scriptedPort({
        files: [LEFT_ENGINE, RIGHT_ENGINE, LEFT_REPORT, RIGHT_REPORT],
      })
    )

    await openAnotherFile(/engine\.ts/)

    await openAnotherFile(/report\.csv/)

    expect(sessionTabRows()).toHaveLength(2)
    expect(screen.getAllByRole('tab', { name: /engine\.ts/ })).toHaveLength(1)
  })

  it('opens a pair when two same-kind paths are dropped', async () => {
    mountWorkbench(scriptedPort({ dropped: [LEFT_REPORT, RIGHT_REPORT] }))

    // The drop never reaches the browser default (which would navigate away).
    expect(dropPaths(screen.getByRole('main'), [LEFT_REPORT, RIGHT_REPORT])).toBe(false)

    expect(await screen.findByText('对齐 4 行 · 主键 order_id')).toBeDefined()
    expect(statusText()).not.toContain('file:')
    expect(statusText()).toContain('行数（左）')
  })

  it('opens a directory session when two directories are dropped', async () => {
    mountWorkbench(
      scriptedPort({
        dropped: [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right],
      })
    )

    dropPaths(screen.getByRole('main'), [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right])

    expect(await screen.findByRole('tab', { name: /baseline ↔ candidate/ }, { timeout: 4000 })).toBeDefined()
    expect(statusText()).toContain('差异')
  })

  it('reports skipped unreadable entries per side as an info notice and a view count', async () => {
    const base = scriptedPort({
      dropped: [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right],
    })
    const unreadable = {
      name: 'unreadable',
      path: `${DIRECTORY_SAMPLE_PATHS.left}/unreadable`,
      isDirectory: false,
      size: 0,
      modifiedMs: 0,
      broken: true,
      skippedReason: '不可读条目：没有访问权限（EACCES）',
    }
    const platform = leftEntryPort(base, unreadable)

    mountWorkbench(platform)
    dropPaths(screen.getByRole('main'), [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right])

    // A successful comparison reports the skips at info level, not as an error.
    const notice = await screen.findByRole('alert')
    expect(notice.textContent).toContain('已跳过：左 1 / 右 0')
    expect(notice.className).toContain('text-diff-added')
    // The directory view keeps the per-side count visible as well.
    expect(screen.getAllByText('已跳过：左 1 / 右 0')).toHaveLength(2)
  })

  it('does not drill into a directory link or read its target', async () => {
    const base = scriptedPort({
      dropped: [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right],
    })
    const dirLink = {
      name: 'dir-link',
      path: `${DIRECTORY_SAMPLE_PATHS.left}/dir-link`,
      isDirectory: false,
      size: 9,
      modifiedMs: 0,
      isSymbolicLink: true,
      linkTarget: '/targets/shared',
      linkTargetKind: 'directory' as const,
    }
    const readTextFile = vi.fn((path: string) => base.readTextFile(path))
    const platform: PlatformPort = { ...leftEntryPort(base, dirLink), readTextFile }

    mountWorkbench(platform)
    dropPaths(screen.getByRole('main'), [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right])
    await screen.findByRole('tab', { name: /baseline ↔ candidate/ }, { timeout: 4000 })

    fireEvent.doubleClick(within(screen.getAllByRole('tree')[0]).getAllByText('dir-link')[0])

    const notice = await screen.findByRole('alert')
    expect(notice.textContent).toContain('不跟随')
    expect(readTextFile).not.toHaveBeenCalledWith(`${DIRECTORY_SAMPLE_PATHS.left}/dir-link`)
    expect(screen.queryByRole('tab', { name: /dir-link/ })).toBeNull()
  })

  it('drills into a file link by reading the target body', async () => {
    const base = scriptedPort({
      dropped: [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right],
    })
    const fileLink = {
      name: 'linked-engine.ts',
      path: `${DIRECTORY_SAMPLE_PATHS.left}/linked-engine.ts`,
      isDirectory: false,
      size: 18,
      modifiedMs: 0,
      isSymbolicLink: true,
      linkTarget: '/targets/engine.ts',
      linkTargetKind: 'file' as const,
    }
    const platform: PlatformPort = {
      ...leftEntryPort(base, fileLink),
      probeTextFile: async (path) =>
        path === `${DIRECTORY_SAMPLE_PATHS.left}/linked-engine.ts`
          ? { path, ...probeTextBytes(new TextEncoder().encode('LINKED TARGET BODY')) }
          : base.probeTextFile(path),
    }

    mountWorkbench(platform)
    dropPaths(screen.getByRole('main'), [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right])
    await screen.findByRole('tab', { name: /baseline ↔ candidate/ }, { timeout: 4000 })

    fireEvent.doubleClick(within(screen.getAllByRole('tree')[0]).getAllByText('linked-engine.ts')[0])

    expect(await screen.findByText('LINKED TARGET BODY', {}, { timeout: 4000 })).toBeDefined()
    expect(screen.getByRole('tab', { name: /linked-engine\.ts/ })).toBeDefined()
  })

  it('shows no skip notice when every entry was readable', async () => {
    mountWorkbench(
      scriptedPort({
        dropped: [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right],
      })
    )

    dropPaths(screen.getByRole('main'), [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right])

    expect(await screen.findByRole('tab', { name: /baseline ↔ candidate/ }, { timeout: 4000 })).toBeDefined()
    expect(screen.queryByText(/已跳过/)).toBeNull()
  })

  it('reports file-handle exhaustion as a readable notice and opens no session', async () => {
    const platform: PlatformPort = {
      ...scriptedPort({
        dropped: [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right],
      }),
      // The comparison hashes raw bytes through the digest seam; descriptor
      // exhaustion there is fatal, never a per-file skip.
      digestFiles: async () => {
        throw Object.assign(new Error('EMFILE: too many open files'), { code: 'EMFILE' })
      },
    }

    mountWorkbench(platform)
    dropPaths(screen.getByRole('main'), [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('文件句柄')
    expect(alert.textContent).toContain('EMFILE')
    expect(screen.queryByRole('tablist', { name: '会话' })).toBeNull()
  })

  it('keeps a single dropped path as the left baseline and asks for its counterpart', async () => {
    mountWorkbench(scriptedPort({ dropped: [LEFT_ENGINE], files: [RIGHT_ENGINE] }))

    dropPaths(screen.getByRole('main'), [LEFT_ENGINE])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(LEFT_ENGINE)
    expect(alert.textContent).toContain('左侧基准')
    expect(screen.queryByRole('tablist', { name: '会话' })).toBeNull()

    // The next pick only asks for the right side and keeps the dropped baseline.
    expect(await openAnotherFile(/engine\.ts/)).toBeDefined()
    expect(statusText()).not.toContain('file:')
    expect(statusText()).toContain('行数（左）')
  })

  it('rejects a drop of more than two paths without opening a session', async () => {
    mountWorkbench(scriptedPort({ dropped: [LEFT_ENGINE, RIGHT_ENGINE, LEFT_REPORT] }))

    dropPaths(screen.getByRole('main'), [LEFT_ENGINE, RIGHT_ENGINE, LEFT_REPORT])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('两个文件或两个文件夹')
    expect(screen.queryByRole('tablist', { name: '会话' })).toBeNull()
  })

  it('rejects a mixed file / folder drop and keeps the current session', async () => {
    mountWorkbench(
      scriptedPort({
        files: [LEFT_ENGINE, RIGHT_ENGINE],
        dropped: [DIRECTORY_SAMPLE_PATHS.left, LEFT_REPORT],
      })
    )

    await openAnotherFile(/engine\.ts/)
    const before = statusText()

    dropPaths(screen.getByRole('main'), [DIRECTORY_SAMPLE_PATHS.left, LEFT_REPORT])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('一个是文件、一个是文件夹')
    expect(statusText()).toBe(before)
    expect(screen.getAllByRole('tab', { name: /engine\.ts/ })).toHaveLength(1)
  })

  it('reports an unsupported extension without opening a session', async () => {
    mountWorkbench(
      scriptedPort({
        files: [`${DIRECTORY_SAMPLE_PATHS.left}/assets/logo.png`, `${DIRECTORY_SAMPLE_PATHS.right}/assets/logo.png`],
      })
    )

    fireEvent.click(screen.getByRole('button', { name: '打开文件' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('暂不支持对比 logo.png')
    expect(screen.queryByRole('tablist', { name: '会话' })).toBeNull()
  })
})

describe('directory drilldown roundtrip', () => {
  async function loadDirectorySamples(): Promise<void> {
    await renderApp()
    await loadDemoSamples()
    await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })
  }

  it('returns to the source directory with filter, expansion, scroll and selection intact', async () => {
    await loadDirectorySamples()

    fireEvent.click(screen.getByRole('tab', { name: '仅差异' }))
    // Collapse `config`: its descendants hide on both panes, while `engine.ts`
    // stays visible, so a drilldown out of it can be opened and returned from.
    fireEvent.click(screen.getAllByRole('button', { name: '折叠 config' })[0])
    expect(within(paneTree(0)).queryAllByText('deploy.yaml')).toHaveLength(0)
    expect(within(paneTree(1)).queryAllByText('deploy.yaml')).toHaveLength(0)
    expect(within(paneTree(0)).queryAllByText('engine.ts')).toHaveLength(1)

    // Select a file row and scroll the left pane.
    const row = within(paneTree(0)).getAllByText('engine.ts')[0]
    fireEvent.click(row)
    expect(row.closest('[role="treeitem"]')?.getAttribute('aria-selected')).toBe('true')

    const leftBody = paneTree(0).parentElement as HTMLElement
    leftBody.scrollTop = 96
    fireEvent.scroll(leftBody)

    fireEvent.doubleClick(row)
    expect(await screen.findByRole('tab', { name: /engine\.ts/ }, { timeout: 4000 })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: '返回上级目录视图' }))

    // The source directory tab kept its tree while the drilldown was open; its
    // kept filter/scroll restore as the view remounts.
    await waitFor(() => expect(screen.getAllByRole('tree')).toHaveLength(2))
    // Back on the source directory session: nothing was reset by the roundtrip.
    expect(statusText()).toContain('文件（源）')
    expect(screen.getByRole('tab', { name: '仅差异' }).getAttribute('aria-selected')).toBe('true')
    expect(within(paneTree(0)).queryAllByText('deploy.yaml')).toHaveLength(0)
    expect(within(paneTree(1)).queryAllByText('deploy.yaml')).toHaveLength(0)
    expect(within(paneTree(0)).getAllByText('engine.ts')[0].closest('[role="treeitem"]')?.getAttribute('aria-selected')).toBe('true')
    expect((paneTree(0).parentElement as HTMLElement).scrollTop).toBe(96)
  })

  it('repeats drilldown and return without drifting', async () => {
    await loadDirectorySamples()
    fireEvent.click(screen.getByRole('tab', { name: '仅差异' }))

    for (let round = 0; round < 3; round += 1) {
      fireEvent.doubleClick(within(paneTree(1)).getAllByText('engine.ts')[0])
      const back = await screen.findByRole('button', { name: '返回上级目录视图' }, { timeout: 4000 })
      fireEvent.click(back)

      await waitFor(() => expect(screen.getAllByRole('tree')).toHaveLength(2))
      expect(statusText()).toContain('文件（源）')
      expect(screen.getByRole('tab', { name: '仅差异' }).getAttribute('aria-selected')).toBe('true')
      expect(within(paneTree(0)).queryAllByText('engine.ts')).toHaveLength(1)
    }
  })

  it('keeps same-path drilldowns of two directory sessions apart', async () => {
    mountWorkbench(
      scriptedPort({
        directories: [DIRECTORY_SAMPLE_PATHS.right, DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right],
      })
    )

    await openAnotherDirectory(/candidate ↔ baseline/)
    await openAnotherDirectory(/baseline ↔ candidate/)

    // Drill the same relative path out of the active (baseline → candidate) session.
    fireEvent.doubleClick(within(screen.getAllByRole('tree')[0]).getAllByText('engine.ts')[0])
    await screen.findByRole('tab', { name: /engine\.ts/ }, { timeout: 4000 })

    // Drill the same relative path out of the first (candidate → baseline) session.
    const sessionTabs = screen.getByRole('tablist', { name: '会话' })
    fireEvent.click(within(sessionTabs).getByRole('tab', { name: /candidate ↔ baseline/ }))
    await waitFor(() => expect(screen.getAllByRole('tree')).toHaveLength(2))
    fireEvent.doubleClick(within(screen.getAllByRole('tree')[0]).getAllByText('engine.ts')[0])
    await waitFor(() => expect(within(sessionTabs).getAllByRole('tab', { name: /engine\.ts/ })).toHaveLength(2), { timeout: 4000 })

    // Both same-path drilldowns exist; neither overwrote the other.
    expect(within(sessionTabs).getAllByRole('tab', { name: /engine\.ts/ })).toHaveLength(2)

    // The active drilldown returns to its own source session.
    fireEvent.click(screen.getByRole('button', { name: '返回上级目录视图' }))
    await waitFor(() => expect(screen.getAllByRole('tree')).toHaveLength(2))
    expect(sessionTab(/candidate ↔ baseline/).getAttribute('aria-selected')).toBe('true')
    expect(statusText()).toContain('文件（源）')

    // The other drilldown still returns to the other source session.
    fireEvent.click(within(sessionTabs).getAllByRole('tab', { name: /engine\.ts/ })[0])
    fireEvent.click(screen.getByRole('button', { name: '返回上级目录视图' }))
    await waitFor(() => expect(screen.getAllByRole('tree')).toHaveLength(2))
    expect(sessionTab(/baseline ↔ candidate/).getAttribute('aria-selected')).toBe('true')
  })
})

describe('session tabs lifecycle', () => {
  const LEFT_YAML = `${DIRECTORY_SAMPLE_PATHS.left}/config/deploy.yaml`
  const RIGHT_YAML = `${DIRECTORY_SAMPLE_PATHS.right}/config/deploy.yaml`

  /** Opens one real pair per click of「打开文件」; the port answers in order. */
  async function openPairs(count: number): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: '打开文件' }))
      // The picker button is disabled while a pair is being read.
      await waitFor(() => expect((screen.getByRole('button', { name: '打开文件' }) as HTMLButtonElement).disabled).toBe(false))
    }
  }

  async function openCodeAndCsv(): Promise<void> {
    await openPairs(2)
    await screen.findByRole('tab', { name: /report\.csv/ }, { timeout: 4000 })
  }

  function makeDirty(): void {
    fireEvent.click(screen.getByRole('button', { name: '覆写到右' }))
  }

  it('keeps unsaved edits and the dirty marker across a tab roundtrip', async () => {
    mountWorkbench(scriptedPort({ files: [LEFT_ENGINE, RIGHT_ENGINE, LEFT_REPORT, RIGHT_REPORT] }))
    await openCodeAndCsv()

    // Make the code session dirty, then leave it for the CSV session.
    fireEvent.click(sessionTab(/engine\.ts/))
    makeDirty()
    expect(sessionTab(/engine\.ts/).textContent).toContain('有未保存修改')
    expect(screen.getByText('已修改（未保存）')).toBeDefined()

    fireEvent.click(sessionTab(/report\.csv/))
    expect(screen.queryByText('已修改（未保存）')).toBeNull()
    expect(sessionTab(/report\.csv/).getAttribute('aria-selected')).toBe('true')
    expect(statusText()).toContain('行数（左）')

    // Back on A: the working copy survived the unmount, not just the flag.
    fireEvent.click(sessionTab(/engine\.ts/))
    expect(statusText()).toContain('行数（左）')
    expect(screen.getByText('已修改（未保存）')).toBeDefined()
    expect(screen.getByText('未保存：右')).toBeDefined()
    expect(sessionTab(/engine\.ts/).textContent).toContain('有未保存修改')

    // The dirty session now asks before closing.
    fireEvent.click(screen.getByRole('button', { name: '关闭 engine.ts' }))
    expect(screen.getByRole('dialog', { name: '关闭含未保存修改的会话？' })).toBeDefined()
  })

  it('closes a clean background session immediately without switching away', async () => {
    mountWorkbench(scriptedPort({ files: [LEFT_ENGINE, RIGHT_ENGINE, LEFT_REPORT, RIGHT_REPORT] }))
    await openCodeAndCsv()

    fireEvent.click(screen.getByRole('button', { name: '关闭 engine.ts' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(sessionTabRows()).toHaveLength(1)
    expect(screen.queryByRole('tab', { name: /engine\.ts/ })).toBeNull()
    // The active session and its content did not change.
    expect(sessionTab(/report\.csv/).getAttribute('aria-selected')).toBe('true')
    expect(statusText()).toContain('行数（左）')
  })

  it('activates the neighbour of the closed active session and empties on the last one', async () => {
    mountWorkbench(
      scriptedPort({
        files: [
          LEFT_ENGINE,
          RIGHT_ENGINE,
          LEFT_REPORT,
          RIGHT_REPORT,
          LEFT_YAML,
          RIGHT_YAML,
          // Answers for the pair opened after the workbench was emptied.
          LEFT_REPORT,
          RIGHT_REPORT,
        ],
      })
    )
    await openPairs(3)
    await screen.findByRole('tab', { name: /deploy\.yaml/ }, { timeout: 4000 })
    expect(sessionTabRows()).toHaveLength(3)

    // Close the middle one: the next tab (successor) takes over.
    fireEvent.click(sessionTab(/report\.csv/))
    fireEvent.click(screen.getByRole('button', { name: '关闭 report.csv' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(sessionTab(/deploy\.yaml/).getAttribute('aria-selected')).toBe('true')
    expect(statusText()).toContain('行数（左）')

    // Closing the last tab falls back to the previous one.
    fireEvent.click(screen.getByRole('button', { name: '关闭 deploy.yaml' }))
    expect(sessionTab(/engine\.ts/).getAttribute('aria-selected')).toBe('true')
    expect(statusText()).toContain('行数（左）')

    // Closing the last session returns to the empty workbench, still usable.
    fireEvent.click(screen.getByRole('button', { name: '关闭 engine.ts' }))
    expect(screen.queryByRole('tablist', { name: '会话' })).toBeNull()
    expect(screen.getByRole('heading', { name: EMPTY_TITLE })).toBeDefined()
    expect(screen.getByRole('button', { name: '打开文件' })).toBeDefined()

    expect(await openAnotherFile(/report\.csv/)).toBeDefined()
    expect(statusText()).toContain('行数（左）')
  })

  it('prompts before closing dirty work and keeps it on「继续编辑」', async () => {
    await openFilePair(scriptedPort({ files: [LEFT_ENGINE, RIGHT_ENGINE] }), /engine\.ts/)
    makeDirty()

    fireEvent.click(screen.getByRole('button', { name: '关闭 engine.ts' }))

    const dialog = screen.getByRole('dialog', { name: '关闭含未保存修改的会话？' })
    expect(dialog.textContent).toContain('engine.ts')
    expect(dialog.textContent).toContain('未保存修改')
    // Nothing is removed while the prompt is open.
    expect(sessionTab(/engine\.ts/)).toBeDefined()

    fireEvent.click(within(dialog).getByRole('button', { name: '继续编辑' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(sessionTab(/engine\.ts/).textContent).toContain('有未保存修改')
    expect(screen.getByText('已修改（未保存）')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: '关闭 engine.ts' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '放弃修改并关闭' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('tablist', { name: '会话' })).toBeNull()
    expect(screen.getByRole('heading', { name: EMPTY_TITLE })).toBeDefined()
  })

  it('discards a dirty background session without switching away', async () => {
    mountWorkbench(scriptedPort({ files: [LEFT_ENGINE, RIGHT_ENGINE, LEFT_REPORT, RIGHT_REPORT] }))
    await openCodeAndCsv()

    fireEvent.click(sessionTab(/engine\.ts/))
    makeDirty()
    fireEvent.click(sessionTab(/report\.csv/))

    fireEvent.click(screen.getByRole('button', { name: '关闭 engine.ts' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '放弃修改并关闭' }))

    expect(screen.queryByRole('tab', { name: /engine\.ts/ })).toBeNull()
    expect(sessionTab(/report\.csv/).getAttribute('aria-selected')).toBe('true')
    expect(statusText()).toContain('行数（左）')
  })

  it('drops the dirty marker after a reset and closes without a prompt', async () => {
    await openFilePair(scriptedPort({ files: [LEFT_ENGINE, RIGHT_ENGINE] }), /engine\.ts/)

    makeDirty()
    expect(sessionTab(/engine\.ts/).textContent).toContain('有未保存修改')

    clickMore('重置')
    expect(sessionTab(/engine\.ts/).textContent).not.toContain('有未保存修改')

    fireEvent.click(screen.getByRole('button', { name: '关闭 engine.ts' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('tablist', { name: '会话' })).toBeNull()
  })

  it('merges samples into open sessions instead of replacing them', async () => {
    render(<Workbench platform={scriptedPort({ files: [LEFT_ENGINE, RIGHT_ENGINE] })} showDebugSamples />)
    await openAnotherFile(/engine\.ts/)

    await loadDemoSamples()

    const tabs = sessionTabRows()
    // The real session keeps its place and the sample scenes are merged in, not
    // swapped for the open work.
    expect(tabs[0].textContent).toContain('engine.ts')
    // The four sample scenes are added next to the open real-file session.
    expect(sessionTabRows()).toHaveLength(5)
    expect(tabs.filter((item) => item.textContent?.includes('baseline ↔ candidate'))).toHaveLength(1)

    // Loading the same library again upserts by id: no duplicate sample tabs.
    await loadDemoSamples()
    expect(
      within(sessionTabs())
        .getAllByRole('tab')
        .filter((item) => item.textContent?.includes('baseline ↔ candidate'))
    ).toHaveLength(1)
    expect(sessionTabRows()[0].textContent).toContain('engine.ts')

    // A failed auxiliary load keeps the sessions on screen and reports it.
    startSampleFailure()

    const alert = await screen.findByRole('alert', {}, { timeout: 4000 })
    expect(alert.textContent).toContain('无法读取内置样本库')
    expect(sessionTabRows().length).toBeGreaterThan(1)
  })

  it('keeps a drilldown alive after its source directory session closes', async () => {
    mountWorkbench(
      scriptedPort({
        directories: [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.incoming, DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right],
      })
    )

    await openAnotherDirectory(/baseline ↔ incoming/)
    await openAnotherDirectory(/baseline ↔ candidate/)

    // Drill out of the active session, then close that source session.
    fireEvent.doubleClick(within(screen.getAllByRole('tree')[0]).getAllByText('engine.ts')[0])
    await screen.findByRole('button', { name: '返回上级目录视图' }, { timeout: 4000 })
    fireEvent.click(screen.getByRole('button', { name: '关闭 baseline ↔ candidate' }))

    // The file session still renders and returning falls back to the other tree.
    expect(screen.getByRole('button', { name: '返回上级目录视图' })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '返回上级目录视图' }))
    expect(screen.queryByText(/directory:/)).toBeNull()
    expect(statusText()).toContain('文件（源）')
    expect(await screen.findByRole('alert')).toBeDefined()
    expect(screen.getByRole('alert').textContent).toContain('已返回可用的目录对比')

    // With no directory session left at all, the same action still explains itself.
    fireEvent.click(within(sessionTabs()).getByRole('tab', { name: /engine\.ts/ }))
    fireEvent.click(screen.getByRole('button', { name: '关闭 baseline ↔ incoming' }))
    fireEvent.click(screen.getByRole('button', { name: '返回上级目录视图' }))
    expect(screen.getByRole('alert').textContent).toContain('没有其他目录对比会话可返回')
    expect(screen.queryByRole('heading', { name: EMPTY_TITLE })).toBeNull()
  })
})

describe('new compare dialog', () => {
  const LEFT_SPACED = '/memory/左 a.txt'
  const RIGHT_SPACED = '/memory/右 b.txt'

  function dialog(): HTMLElement {
    return screen.getByRole('dialog', { name: '新建对比' })
  }

  it('keeps「新建对比」in the toolbar in the empty state and with sessions', async () => {
    mountWorkbench(scriptedPort({ files: [LEFT_ENGINE, RIGHT_ENGINE] }))

    expect(screen.getAllByRole('button', { name: '新建对比' }).length).toBeGreaterThan(0)

    await openAnotherFile(/engine\.ts/)

    const buttons = screen.getAllByRole('button', { name: '新建对比' })
    expect(buttons).toHaveLength(1)
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(false)
  })

  it('offers two path inputs and both picker actions inside the dialog', async () => {
    const base = createWebPlatformPort()
    const files = [LEFT_ENGINE, RIGHT_ENGINE]
    const selectFile = vi.fn(async () => files.shift() ?? null)
    mountWorkbench({ ...base, selectFile })

    const panel = openCompareDialog()
    expect(within(panel).getByLabelText('左侧路径')).toBeDefined()
    expect(within(panel).getByLabelText('右侧路径')).toBeDefined()

    fireEvent.click(within(panel).getByRole('button', { name: '打开文件' }))

    expect(await screen.findByText(/本地文件 · 双栏字符级 Diff/)).toBeDefined()
    expect(selectFile).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('dialog', { name: '新建对比' })).toBeNull()
    expect(statusText()).not.toContain('file:')
    expect(statusText()).toContain('行数（左）')
  })

  it('opens a directory pair from the dialog picker', async () => {
    const base = createWebPlatformPort()
    const directories = [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right]
    const selectDirectory = vi.fn(async () => directories.shift() ?? null)
    mountWorkbench({ ...base, selectDirectory })

    fireEvent.click(within(openCompareDialog()).getByRole('button', { name: '打开文件夹' }))

    expect(await screen.findByRole('tab', { name: /baseline ↔ candidate/ }, { timeout: 4000 })).toBeDefined()
    expect(selectDirectory).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('tablist', { name: '差异过滤' })).toBeDefined()
  })

  it('opens with Cmd/Ctrl+N, ignores repeats and closes on Escape without touching sessions', async () => {
    await openFilePair(scriptedPort({ files: [LEFT_ENGINE, RIGHT_ENGINE] }), /engine\.ts/)
    const before = statusText()

    fireEvent.keyDown(document, { key: 'n', metaKey: true })
    expect(screen.getAllByRole('dialog', { name: '新建对比' })).toHaveLength(1)
    fireEvent.keyDown(document, { key: 'n', metaKey: true })
    expect(screen.getAllByRole('dialog', { name: '新建对比' })).toHaveLength(1)

    // Focus lands on the left input and editing shortcuts stay untouched.
    const leftInput = within(dialog()).getByLabelText('左侧路径')
    expect(document.activeElement).toBe(leftInput)
    fireEvent.keyDown(leftInput, { key: 'a', metaKey: true })
    expect(dialog()).toBeDefined()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '新建对比' })).toBeNull()
    expect(sessionTabRows()).toHaveLength(1)
    expect(statusText()).toBe(before)
  })

  it('submits once on Enter and disables the button while the session is built', async () => {
    const base = await memoryPort([
      [LEFT_SPACED, 'left\n'],
      [RIGHT_SPACED, 'right\n'],
    ])
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const reads: string[] = []
    const port: PlatformPort = {
      ...base,
      probeTextFile: async (path) => {
        reads.push(path)
        await gate
        return base.probeTextFile(path)
      },
    }
    mountWorkbench(port)

    const panel = openCompareDialog()
    fillComparePaths(LEFT_SPACED, RIGHT_SPACED)
    const submit = within(panel).getByRole('button', { name: '建立对比' }) as HTMLButtonElement

    fireEvent.keyDown(within(panel).getByLabelText('左侧路径'), { key: 'Enter' })
    await waitFor(() => expect(submit.disabled).toBe(true))

    // Repeats while the build is in flight must not start a second request.
    fireEvent.keyDown(within(panel).getByLabelText('左侧路径'), { key: 'Enter' })
    fireEvent.keyDown(within(panel).getByLabelText('右侧路径'), { key: 'Enter' })
    release()

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '新建对比' })).toBeNull())
    expect(reads).toEqual([LEFT_SPACED, RIGHT_SPACED])
    expect(sessionTabRows()).toHaveLength(1)
  })

  it('builds a code session from typed real file paths', async () => {
    const base = await memoryPort([
      [LEFT_SPACED, '左\n'],
      [RIGHT_SPACED, '右\n'],
    ])
    mountWorkbench(base)

    openCompareDialog()
    fillComparePaths(LEFT_SPACED, RIGHT_SPACED)
    submitCompare()

    const tab = await screen.findByRole('tab', { name: /左 a\.txt/ }, { timeout: 4000 })
    expect(tab.getAttribute('aria-selected')).toBe('true')
    expect(tab.getAttribute('aria-label') ?? '').toContain(`${LEFT_SPACED} ↔ ${RIGHT_SPACED}`)
    expect(screen.getByText(/本地文件 · 双栏字符级 Diff/)).toBeDefined()
  })

  it('builds a directory session from typed real directory paths', async () => {
    mountWorkbench(createWebPlatformPort())

    openCompareDialog()
    fillComparePaths(DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right)
    submitCompare()

    expect(await screen.findByRole('tab', { name: /baseline ↔ candidate/ }, { timeout: 4000 })).toBeDefined()
    expect(screen.getByRole('tablist', { name: '差异过滤' })).toBeDefined()
    expect(screen.getAllByText('engine.ts').length).toBeGreaterThan(0)
  })

  it('strips paired quotes and surrounding whitespace before probing', async () => {
    const base = await memoryPort([
      [LEFT_SPACED, 'left\n'],
      [RIGHT_SPACED, 'right\n'],
    ])
    const stats: string[] = []
    const reads: string[] = []
    const port: PlatformPort = {
      ...base,
      statPath: async (path) => {
        stats.push(path)
        return base.statPath(path)
      },
      probeTextFile: async (path) => {
        reads.push(path)
        return base.probeTextFile(path)
      },
    }
    mountWorkbench(port)

    openCompareDialog()
    fillComparePaths(`"  ${LEFT_SPACED}  "`, `“  ${RIGHT_SPACED}  ”`)
    submitCompare()

    const tab = await screen.findByRole('tab', { name: /左 a\.txt/ }, { timeout: 4000 })
    const quotedLabel = tab.getAttribute('aria-label') ?? ''
    expect(quotedLabel).toContain(`${LEFT_SPACED} ↔ ${RIGHT_SPACED}`)
    expect(quotedLabel).not.toContain('"')
    expect(quotedLabel).not.toContain('“')
    expect(stats).toEqual([LEFT_SPACED, RIGHT_SPACED])
    expect(reads).toEqual([LEFT_SPACED, RIGHT_SPACED])
  })

  it('expands ~ and resolves relative paths against the platform base', async () => {
    const base = await memoryPort([
      ['/Users/demo/项目/a.txt', 'home\n'],
      ['/memory/a.txt', 'relative\n'],
    ])
    const stats: string[] = []
    const port: PlatformPort = {
      ...base,
      homeDirectory: async () => '/Users/demo',
      workingDirectory: async () => '/memory',
      statPath: async (path) => {
        stats.push(path)
        return base.statPath(path)
      },
    }
    mountWorkbench(port)

    openCompareDialog()
    fillComparePaths('~/项目/a.txt', 'a.txt')
    submitCompare()

    const tab = await screen.findByRole('tab', { name: /a\.txt/ }, { timeout: 4000 })
    expect(tab.getAttribute('aria-label') ?? '').toContain('/Users/demo/项目/a.txt ↔ /memory/a.txt')
    expect(stats).toEqual(['/Users/demo/项目/a.txt', '/memory/a.txt'])
  })

  it('never opens a native picker or save dialog for a typed pair', async () => {
    const base = await memoryPort([
      [LEFT_SPACED, 'left\n'],
      [RIGHT_SPACED, 'right\n'],
    ])
    const selectFile = vi.fn(async () => null)
    const selectDirectory = vi.fn(async () => null)
    const saveFile = vi.fn(async () => null)
    mountWorkbench({ ...base, selectFile, selectDirectory, saveFile })

    openCompareDialog()
    fillComparePaths(LEFT_SPACED, RIGHT_SPACED)
    submitCompare()

    await screen.findByRole('tab', { name: /左 a\.txt/ }, { timeout: 4000 })
    expect(selectFile).not.toHaveBeenCalled()
    expect(selectDirectory).not.toHaveBeenCalled()
    expect(saveFile).not.toHaveBeenCalled()
  })

  it('adds one tab and keeps the existing session in place', async () => {
    const base = await memoryPort([
      ['/memory/x.txt', 'x\n'],
      ['/memory/y.txt', 'y\n'],
    ])
    const files = [LEFT_ENGINE, RIGHT_ENGINE]
    await openFilePair({ ...base, selectFile: async () => files.shift() ?? null }, /engine\.ts/)
    const firstTab = sessionTabRows()[0]
    const firstText = firstTab.textContent

    openCompareDialog()
    fillComparePaths('/memory/x.txt', '/memory/y.txt')
    submitCompare()

    const added = await screen.findByRole('tab', { name: /x\.txt/ }, { timeout: 4000 })
    const tabs = sessionTabRows()
    expect(tabs).toHaveLength(2)
    expect(tabs[0].textContent).toBe(firstText)
    expect(added.getAttribute('aria-selected')).toBe('true')
    expect(statusText()).not.toContain('file:')
    expect(statusText()).toContain('行数（左）')
  })

  it('re-submitting the same pair keeps a single tab', async () => {
    const base = await memoryPort([
      [LEFT_SPACED, 'left\n'],
      [RIGHT_SPACED, 'right\n'],
    ])
    mountWorkbench(base)

    openCompareDialog()
    fillComparePaths(LEFT_SPACED, RIGHT_SPACED)
    submitCompare()
    await screen.findByRole('tab', { name: /左 a\.txt/ }, { timeout: 4000 })
    const firstStatus = statusText()

    openCompareDialog()
    fillComparePaths(LEFT_SPACED, RIGHT_SPACED)
    submitCompare()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '新建对比' })).toBeNull())

    expect(sessionTabRows()).toHaveLength(1)
    expect(statusText()).toBe(firstStatus)
  })

  it('names the missing right path and opens no tab', async () => {
    const base = await memoryPort([['/memory/left.txt', 'left\n']])
    const listDirectories = vi.fn(base.listDirectories)
    mountWorkbench({ ...base, listDirectories })

    openCompareDialog()
    fillComparePaths('/memory/left.txt', '/memory/right-missing.txt')
    submitCompare()

    const alert = await within(dialog()).findByRole('alert')
    expect(alert.textContent).toContain('右侧')
    expect(alert.textContent).toContain('/memory/right-missing.txt')
    expect(screen.queryByRole('tablist', { name: '会话' })).toBeNull()
    expect(dialog()).toBeDefined()
    // A rejected path never starts a scan.
    expect(listDirectories).not.toHaveBeenCalled()
  })

  it('rejects an empty side without probing either path', async () => {
    const base = createWebPlatformPort()
    const statPath = vi.fn(base.statPath)
    mountWorkbench({ ...base, statPath })

    openCompareDialog()
    fillComparePaths('/memory/left.txt', '')
    submitCompare()

    const alert = await within(dialog()).findByRole('alert')
    expect(alert.textContent).toContain('右侧')
    expect(alert.textContent).toContain('路径为空')
    expect(statPath).not.toHaveBeenCalled()
    expect(screen.queryByRole('tablist', { name: '会话' })).toBeNull()
  })

  it('rejects a file / directory pair and keeps the dialog open', async () => {
    const base = createWebPlatformPort()
    await writeFiles(base, [['/memory/a.txt', 'a\n']])
    await base.ensureDirectory('/memory/folder')
    mountWorkbench(base)

    openCompareDialog()
    fillComparePaths('/memory/a.txt', '/memory/folder')
    submitCompare()

    const alert = await within(dialog()).findByRole('alert')
    expect(alert.textContent).toContain('类型不一致')
    expect(alert.textContent).toContain('/memory/a.txt')
    expect(alert.textContent).toContain('/memory/folder')
    expect(screen.queryByRole('tablist', { name: '会话' })).toBeNull()
  })

  it('lists the supported families for an unsupported extension', async () => {
    const base = createWebPlatformPort()
    await writeFiles(base, [
      ['/memory/a.bin', 'a'],
      ['/memory/b.bin', 'b'],
    ])
    mountWorkbench(base)

    openCompareDialog()
    fillComparePaths('/memory/a.bin', '/memory/b.bin')
    submitCompare()

    const alert = await within(dialog()).findByRole('alert')
    expect(alert.textContent).toContain('不支持')
    expect(alert.textContent).toContain('代码/文本')
    expect(alert.textContent).toContain('CSV/TSV')
    expect(alert.textContent).toContain('JSON/YAML')
    expect(screen.queryByRole('tablist', { name: '会话' })).toBeNull()
  })

  it('rejects a mixed file family without creating a blank tab', async () => {
    const base = await memoryPort([
      ['/memory/a.json', '{}\n'],
      ['/memory/b.yaml', 'a: 1\n'],
    ])
    mountWorkbench(base)

    openCompareDialog()
    fillComparePaths('/memory/a.json', '/memory/b.yaml')
    submitCompare()

    const alert = await within(dialog()).findByRole('alert')
    expect(alert.textContent).toContain('两侧文件类型不一致')
    expect(screen.queryByRole('tablist', { name: '会话' })).toBeNull()
  })

  it('keeps the active session and status bar unchanged when a submit fails', async () => {
    await openFilePair(scriptedPort({ files: [LEFT_ENGINE, RIGHT_ENGINE] }), /engine\.ts/)
    const before = statusText()

    openCompareDialog()
    fillComparePaths(LEFT_ENGINE, '/memory/does-not-exist.txt')
    submitCompare()

    await within(dialog()).findByRole('alert')
    expect(sessionTabRows()).toHaveLength(1)
    // The dialog's own footer is a second landmark while it stays open.
    expect(screen.getAllByRole('contentinfo').at(-1)?.textContent).toBe(before)
    expect(screen.getByText(/本地文件 · 双栏字符级 Diff/)).toBeDefined()
  })

  it('keeps unsaved working copies across manual sessions', async () => {
    const base = await memoryPort([
      ['/memory/l1.txt', 'a\nb\n'],
      ['/memory/r1.txt', 'a\nc\n'],
      ['/memory/l2.txt', 'x\n'],
      ['/memory/r2.txt', 'y\n'],
    ])
    mountWorkbench(base)

    openCompareDialog()
    fillComparePaths('/memory/l1.txt', '/memory/r1.txt')
    submitCompare()
    await screen.findByRole('tab', { name: /l1\.txt/ }, { timeout: 4000 })

    openCompareDialog()
    fillComparePaths('/memory/l2.txt', '/memory/r2.txt')
    submitCompare()
    await screen.findByRole('tab', { name: /l2\.txt/ }, { timeout: 4000 })

    fireEvent.click(within(sessionTabs()).getByRole('tab', { name: /l1\.txt/ }))
    fireEvent.click(screen.getByRole('button', { name: '覆写到右' }))
    expect(screen.getByText('未保存：右')).toBeDefined()

    fireEvent.click(within(sessionTabs()).getByRole('tab', { name: /l2\.txt/ }))
    expect(screen.queryByText('未保存：右')).toBeNull()

    fireEvent.click(within(sessionTabs()).getByRole('tab', { name: /l1\.txt/ }))
    expect(screen.getByText('未保存：右')).toBeDefined()
    expect(screen.getByText('已修改（未保存）')).toBeDefined()
  })

  /**
   * A long directory comparison must not keep the modal overlay on screen: the
   * shell progress bar and its cancel button have to stay reachable for the
   * whole scan, whichever entry point started it.
   */
  it('closes the dialog before a typed directory pair starts scanning', async () => {
    const base = await memoryPort([
      ['/memory/dialog-scan/left/a.txt', 'x'],
      ['/memory/dialog-scan/right/a.txt', 'y'],
    ])
    let releaseScan!: () => void
    const scanGate = new Promise<void>((resolve) => {
      releaseScan = resolve
    })
    const port: PlatformPort = {
      ...base,
      listDirectories: async (paths) => {
        await scanGate
        return base.listDirectories(paths)
      },
    }
    mountWorkbench(port)

    openCompareDialog()
    fillComparePaths('/memory/dialog-scan/left', '/memory/dialog-scan/right')
    submitCompare()

    const bar = await screen.findByRole('status', { name: '目录对比进度' })
    expect(screen.queryByRole('dialog', { name: '新建对比' })).toBeNull()
    expect(document.querySelectorAll('[aria-modal="true"]')).toHaveLength(0)
    expect(bar.textContent).toContain('正在扫描目录')
    expect(bar.textContent).toMatch(/已扫描 \d+ 个文件/)
    expect(bar.closest('[aria-modal="true"]')).toBeNull()
    expect((within(bar).getByRole('button', { name: '取消' }) as HTMLButtonElement).disabled).toBe(false)

    releaseScan()
    expect(await screen.findByRole('tab', { name: /left ↔ right/ }, { timeout: 4000 })).toBeDefined()
    expect(screen.queryByRole('status', { name: '目录对比进度' })).toBeNull()
  })

  it('closes the dialog before a picker-started directory pair starts scanning', async () => {
    const base = await memoryPort([
      ['/memory/dialog-pick/left/a.txt', 'x'],
      ['/memory/dialog-pick/right/a.txt', 'y'],
    ])
    const answers = ['/memory/dialog-pick/left', '/memory/dialog-pick/right']
    let releaseScan!: () => void
    const scanGate = new Promise<void>((resolve) => {
      releaseScan = resolve
    })
    const port: PlatformPort = {
      ...base,
      selectDirectory: async () => answers.shift() ?? null,
      listDirectories: async (paths) => {
        await scanGate
        return base.listDirectories(paths)
      },
    }
    mountWorkbench(port)

    fireEvent.click(within(openCompareDialog()).getByRole('button', { name: '打开文件夹' }))

    const bar = await screen.findByRole('status', { name: '目录对比进度' })
    expect(screen.queryByRole('dialog', { name: '新建对比' })).toBeNull()
    expect(document.querySelectorAll('[aria-modal="true"]')).toHaveLength(0)
    expect(within(bar).getByRole('button', { name: '取消' })).toBeDefined()
    expect((within(bar).getByRole('button', { name: '取消' }) as HTMLButtonElement).disabled).toBe(false)

    releaseScan()
    expect(await screen.findByRole('tab', { name: /left ↔ right/ }, { timeout: 4000 })).toBeDefined()
  })

  it('keeps the dialog open when the folder picker is cancelled', async () => {
    const base = createWebPlatformPort()
    const answers: (string | null)[] = [null, '/memory/dialog-pick-cancel/left', null]
    const listDirectories = vi.fn(base.listDirectories)
    mountWorkbench({
      ...base,
      selectDirectory: async () => answers.shift() ?? null,
      listDirectories,
    })

    const panel = openCompareDialog()

    // Cancelling the very first picker leaves the dialog waiting for a pair.
    fireEvent.click(within(panel).getByRole('button', { name: '打开文件夹' }))
    await waitFor(() => expect((within(dialog()).getByRole('button', { name: '建立对比' }) as HTMLButtonElement).disabled).toBe(false))
    expect(dialog()).toBeDefined()
    expect(screen.queryByRole('tablist', { name: '会话' })).toBeNull()

    // Cancelling the right side is the same story.
    fireEvent.click(within(dialog()).getByRole('button', { name: '打开文件夹' }))
    await waitFor(() => expect((within(dialog()).getByRole('button', { name: '建立对比' }) as HTMLButtonElement).disabled).toBe(false))
    expect(dialog()).toBeDefined()
    expect(screen.queryByRole('tablist', { name: '会话' })).toBeNull()
    expect(listDirectories).not.toHaveBeenCalled()
  })
})

describe('launch request injection', () => {
  const LEFT = '/memory/左 a.txt'
  const RIGHT = '/memory/右 b.txt'
  const FILE_REQUEST = { kind: 'file', left: LEFT, right: RIGHT } as const

  interface InjectionPort {
    readonly platform: PlatformPort
    readonly calls: string[]
    emit(payload: CompareRequestPayload): void
    listenerCount(): number
  }

  /**
   * PlatformPort with the optional launch stream: it holds requests that arrive
   * before the ready signal (like the main-process queue) and records the order
   * in which the workbench subscribes and announces itself.
   */
  function injectionPort(base: PlatformPort = createWebPlatformPort()): InjectionPort {
    const listeners = new Set<(payload: CompareRequestPayload) => void>()
    const queued: CompareRequestPayload[] = []
    const calls: string[] = []
    let ready = false

    function deliver(payload: CompareRequestPayload): void {
      for (const listener of [...listeners]) listener(payload)
    }

    return {
      calls,
      listenerCount: () => listeners.size,
      emit: (payload) => {
        if (ready) deliver(payload)
        else queued.push(payload)
      },
      platform: {
        ...base,
        onCompareRequest: (listener) => {
          calls.push('subscribe')
          listeners.add(listener)
          return () => {
            calls.push('unsubscribe')
            listeners.delete(listener)
          }
        },
        compareRequestsReady: async () => {
          calls.push('ready')
          ready = true
          while (queued.length > 0) deliver(queued.shift() as CompareRequestPayload)
        },
      },
    }
  }

  async function seedPair(platform: PlatformPort): Promise<void> {
    await platform.writeTextFile(LEFT, 'alpha\n')
    await platform.writeTextFile(RIGHT, 'beta\n')
  }

  async function mountReady(port: InjectionPort): Promise<void> {
    mountWorkbench(port.platform)
    await waitFor(() => expect(port.calls).toContain('ready'))
  }

  function activeSceneIcon(): string | null {
    const list = screen.queryByRole('tablist', { name: '会话' })
    if (list === null) return null
    const selected = within(list)
      .getAllByRole('tab')
      .find((tab) => tab.getAttribute('aria-selected') === 'true')
    return selected?.querySelector('svg[data-icon]')?.getAttribute('data-icon') ?? null
  }

  it('opens a file session from an injected request without a picker', async () => {
    const base = createWebPlatformPort()
    await seedPair(base)
    const selectFile = vi.fn(base.selectFile)
    const selectDirectory = vi.fn(base.selectDirectory)
    const saveFile = vi.fn(base.saveFile)
    const port = injectionPort({ ...base, selectFile, selectDirectory, saveFile })
    await mountReady(port)

    act(() => port.emit({ ok: true, request: FILE_REQUEST }))

    await waitFor(() => expect(sessionTabCount()).toBe(1))
    expect(activeSceneIcon()).toBe('file-code-corner')
    expect(statusText()).not.toContain('file:')
    expect(statusText()).toContain('行数（左）')
    expect(selectFile).not.toHaveBeenCalled()
    expect(selectDirectory).not.toHaveBeenCalled()
    expect(saveFile).not.toHaveBeenCalled()
  })

  it('opens a directory session from an injected request', async () => {
    const base = createWebPlatformPort()
    await base.writeTextFile('/memory/left-dir/same.txt', 'same\n')
    await base.writeTextFile('/memory/right-dir/same.txt', 'same\n')
    await base.writeTextFile('/memory/left-dir/only-left.txt', 'left\n')
    const port = injectionPort(base)
    await mountReady(port)

    act(() =>
      port.emit({
        ok: true,
        request: { kind: 'directory', left: '/memory/left-dir', right: '/memory/right-dir' },
      })
    )

    await waitFor(() => expect(sessionTabCount()).toBe(1))
    expect(activeSceneIcon()).toBe('folder-tree')
    expect(statusText()).not.toContain('directory:')
    expect(statusText()).toContain('文件（源）')
  })

  it('builds the very same session the manual entry builds for the pair', async () => {
    const base = createWebPlatformPort()
    await seedPair(base)
    const port = injectionPort(base)
    await mountReady(port)

    act(() => port.emit({ ok: true, request: FILE_REQUEST }))
    await waitFor(() => expect(sessionTabCount()).toBe(1))
    const injected = statusText()

    fireEvent.click(screen.getByRole('button', { name: '关闭 左 a.txt ↔ 右 b.txt' }))
    expect(sessionTabCount()).toBe(0)

    fireEvent.keyDown(document, { key: 'n', metaKey: true })
    const panel = screen.getByRole('dialog', { name: '新建对比' })
    fireEvent.change(within(panel).getByLabelText('左侧路径'), { target: { value: LEFT } })
    fireEvent.change(within(panel).getByLabelText('右侧路径'), { target: { value: RIGHT } })
    fireEvent.click(within(panel).getByRole('button', { name: '建立对比' }))

    await waitFor(() => expect(sessionTabCount()).toBe(1))
    expect(statusText()).toBe(injected)
  })

  it('reports a rejected request without touching the open sessions', async () => {
    const base = createWebPlatformPort()
    await seedPair(base)
    const port = injectionPort(base)
    await mountReady(port)

    act(() => port.emit({ ok: true, request: FILE_REQUEST }))
    await waitFor(() => expect(sessionTabCount()).toBe(1))
    const before = statusText()

    act(() => port.emit({ ok: false, message: '右侧路径不存在：/nope' }))

    expect(screen.getByRole('alert').textContent).toContain('右侧路径不存在：/nope')
    expect(sessionTabCount()).toBe(1)
    expect(statusText()).toBe(before)
  })

  it('keeps a single effective subscription under StrictMode', async () => {
    const base = createWebPlatformPort()
    await seedPair(base)
    const port = injectionPort(base)
    render(
      <StrictMode>
        <Workbench platform={port.platform} />
      </StrictMode>
    )
    await waitFor(() => expect(port.calls).toContain('ready'))
    expect(port.listenerCount()).toBe(1)

    act(() => port.emit({ ok: true, request: FILE_REQUEST }))
    await waitFor(() => expect(sessionTabCount()).toBe(1))
    expect(sessionTabCount()).toBe(1)
    expect(port.listenerCount()).toBe(1)
  })

  it('releases the subscription on unmount', async () => {
    const base = createWebPlatformPort()
    await seedPair(base)
    const port = injectionPort(base)
    const view = mountWorkbench(port.platform)
    await waitFor(() => expect(port.listenerCount()).toBe(1))

    view.unmount()

    expect(port.listenerCount()).toBe(0)
    expect(port.calls).toContain('unsubscribe')
    expect(() => port.emit({ ok: true, request: FILE_REQUEST })).not.toThrow()
  })

  it('signals readiness after subscribing and flushes a pre-mount request', async () => {
    const base = createWebPlatformPort()
    await seedPair(base)
    const port = injectionPort(base)

    port.emit({ ok: true, request: FILE_REQUEST })
    expect(port.calls).toEqual([])

    mountWorkbench(port.platform)

    await waitFor(() => expect(sessionTabCount()).toBe(1))
    expect(port.calls).toEqual(['subscribe', 'ready'])
  })
})

describe('directory progress and cancel UI', () => {
  function progressBar(): HTMLElement | null {
    return screen.queryByRole('status', { name: '目录对比进度' })
  }

  function scannedCount(text: string | null): number {
    const match = /已扫描 (\d+) 个文件/.exec(text ?? '')
    if (match === null) throw new Error(`no scanned count in: ${text}`)
    return Number(match[1])
  }

  function verifiedCount(text: string | null): number {
    const match = /已校验 (\d+) 个文件/.exec(text ?? '')
    if (match === null) throw new Error(`no verified count in: ${text}`)
    return Number(match[1])
  }

  function cumulativeCount(text: string | null): number {
    const match = /累计 (\d+) 个文件/.exec(text ?? '')
    if (match === null) throw new Error(`no cumulative count in: ${text}`)
    return Number(match[1])
  }

  const BYTE_SCALE: Record<string, number> = {
    B: 1,
    KiB: 1024,
    MiB: 1024 ** 2,
    GiB: 1024 ** 3,
  }

  function processedBytes(text: string | null): number {
    const match = /已处理 (\d+(?:\.\d+)?) (B|KiB|MiB|GiB)/.exec(text ?? '')
    if (match === null) throw new Error(`no processed bytes in: ${text}`)
    return Number(match[1]) * BYTE_SCALE[match[2]]
  }

  it('shows real scan and digest progress, then clears it once the comparison succeeds', async () => {
    const base = await memoryPort([
      ['/memory/live/left/a.txt', 'x'],
      ['/memory/live/left/b.txt', 'x'],
      ['/memory/live/right/a.txt', 'x'],
      ['/memory/live/right/b.txt', 'x'],
    ])

    const answers = ['/memory/live/left', '/memory/live/right']
    let releaseScan!: () => void
    const scanGate = new Promise<void>((resolve) => {
      releaseScan = resolve
    })
    let scanCalls = 0
    let releaseDigest!: () => void
    const digestGate = new Promise<void>((resolve) => {
      releaseDigest = resolve
    })
    let digestCalls = 0

    const port: PlatformPort = {
      ...base,
      selectDirectory: async () => answers.shift() ?? null,
      listDirectories: async (paths) => {
        scanCalls += 1
        // The first side's root batch waits, so the other side's count lands first.
        if (scanCalls === 1) await scanGate
        return base.listDirectories(paths)
      },
      digestFiles: async (paths, options) => {
        digestCalls += 1
        await digestGate
        return base.digestFiles(paths, options)
      },
    }

    mountWorkbench(port)
    fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }))

    const bar = await screen.findByRole('status', { name: '目录对比进度' })
    expect(bar.textContent).toContain('已扫描')
    expect(bar.textContent).toContain('已处理')
    expect(within(bar).getByRole('button', { name: '取消' })).toBeDefined()

    // One real batch settles while the other is still blocked: the number grows.
    await waitFor(() => expect(scannedCount(bar.textContent)).toBe(2))
    releaseScan()
    await waitFor(() => expect(scannedCount(bar.textContent)).toBe(4))

    await waitFor(() => expect(digestCalls).toBeGreaterThan(0))
    expect(within(bar).getByRole('button', { name: '取消' })).toBeDefined()

    releaseDigest()
    await waitFor(() => expect(progressBar()).toBeNull())
    expect(await screen.findByRole('tab', { name: /left ↔ right/ }, { timeout: 4000 })).toBeDefined()
  })

  it('switches to the digest phase without falling back behind the scan total', async () => {
    const base = createWebPlatformPort()
    // Enough pairs to need more than one digest chunk (64 paths each), so the
    // bar can be observed between two real settled chunks.
    const files: [string, string][] = []
    for (let index = 0; index < 130; index += 1) {
      files.push([`/memory/phase/left/f-${index}.txt`, 'x'])
      files.push([`/memory/phase/right/f-${index}.txt`, 'x'])
    }
    await writeFiles(base, files)

    const answers = ['/memory/phase/left', '/memory/phase/right']
    let digestCalls = 0
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    let releaseSecond!: () => void
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve
    })
    const port: PlatformPort = {
      ...base,
      selectDirectory: async () => answers.shift() ?? null,
      digestFiles: async (paths, options) => {
        digestCalls += 1
        if (digestCalls === 1) await firstGate
        if (digestCalls === 2) await secondGate
        return base.digestFiles(paths, options)
      },
    }

    mountWorkbench(port)
    fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }))

    const bar = await screen.findByRole('status', { name: '目录对比进度' })
    // The scan settles on the real total of both sides before any digest chunk.
    await waitFor(() => expect(scannedCount(bar.textContent)).toBe(260))
    expect(bar.textContent).toContain('正在扫描目录')
    const scannedFiles = scannedCount(bar.textContent)
    const scannedBytes = processedBytes(bar.textContent)
    expect(scannedBytes).toBe(260)

    // The first digest chunk settles; the second one still pends, so the digest
    // copy stays on screen with both its increment and the pipeline total.
    releaseFirst()
    await waitFor(() => expect(bar.textContent).toContain('正在校验内容'))
    expect(bar.textContent).toContain('已校验 64 个文件')
    const verifiedFiles = verifiedCount(bar.textContent)
    expect(verifiedFiles).toBe(64)
    expect(verifiedFiles).toBeLessThan(scannedFiles)
    expect(cumulativeCount(bar.textContent)).toBe(260 + verifiedFiles)
    expect(cumulativeCount(bar.textContent)).toBeGreaterThanOrEqual(scannedFiles)
    expect(processedBytes(bar.textContent)).toBeGreaterThanOrEqual(scannedBytes)

    releaseSecond()
    await waitFor(() => expect(progressBar()).toBeNull())
    expect(await screen.findByRole('tab', { name: /left ↔ right/ }, { timeout: 4000 })).toBeDefined()
  })

  it('cancels during the scan phase without touching sessions or the view', async () => {
    const base = await memoryPort([
      ['/memory/scan-cancel/left/a.txt', 'x'],
      ['/memory/scan-cancel/right/a.txt', 'x'],
    ])

    const answers = ['/memory/scan-cancel/left', '/memory/scan-cancel/right']
    let releaseScan!: () => void
    const scanGate = new Promise<void>((resolve) => {
      releaseScan = resolve
    })
    const cancelIds: string[] = []
    const port: PlatformPort = {
      ...base,
      selectDirectory: async () => answers.shift() ?? null,
      listDirectories: async (paths) => {
        await scanGate
        return base.listDirectories(paths)
      },
      cancelOperation: async (operationId) => {
        cancelIds.push(operationId)
      },
    }

    mountWorkbench(port)
    const statusBefore = statusText()
    const viewBefore = screen.getByRole('main').innerHTML

    fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }))
    const bar = await screen.findByRole('status', { name: '目录对比进度' })
    expect(bar.textContent).toContain('正在扫描目录')

    const cancel = within(bar).getByRole('button', { name: '取消' }) as HTMLButtonElement
    fireEvent.click(cancel)
    expect(cancel.disabled).toBe(true)

    await waitFor(() => expect(progressBar()).toBeNull())
    const notice = await screen.findByRole('alert')
    expect(notice.textContent).toBe('已取消本次目录对比，工作台保持取消前的状态。')
    expect(cancelIds).toHaveLength(1)

    // The cancelled scan commits no session and leaves the shell exactly as it was.
    expect(screen.queryByRole('tab', { name: /left ↔ right/ })).toBeNull()
    expect(statusText()).toBe(statusBefore)
    expect(screen.getByRole('main').innerHTML).toBe(viewBefore)

    releaseScan()
  })

  it('cancels a running comparison and leaves sessions, view and status bar untouched', async () => {
    const base = await memoryPort([
      ['/memory/cancel/left/a.txt', 'x'],
      ['/memory/cancel/left/b.txt', 'x'],
      ['/memory/cancel/right/a.txt', 'x'],
      ['/memory/cancel/right/b.txt', 'x'],
    ])

    const answers = ['/memory/cancel/left', '/memory/cancel/right', '/memory/cancel/left', '/memory/cancel/right']
    const digestIds: string[] = []
    const cancelIds: string[] = []
    let released = false
    let releaseDigest!: () => void
    const digestGate = new Promise<void>((resolve) => {
      releaseDigest = resolve
    })

    const port: PlatformPort = {
      ...base,
      selectDirectory: async () => answers.shift() ?? null,
      digestFiles: async (paths, options) => {
        if (options?.operationId !== undefined) {
          digestIds.push(options.operationId)
          if (!released) await digestGate
        }
        return base.digestFiles(paths)
      },
      cancelOperation: async (operationId) => {
        cancelIds.push(operationId)
      },
    }

    mountWorkbench(port)
    await loadDemoSamples()

    const tabsBefore = within(screen.getByRole('tablist', { name: '会话' }))
      .getAllByRole('tab')
      .map((tab) => tab.textContent)
    const statusBefore = statusText()
    const viewBefore = screen.getByRole('main').innerHTML

    fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }))
    const bar = await screen.findByRole('status', { name: '目录对比进度' })
    await waitFor(() => expect(digestIds.length).toBeGreaterThan(0))

    fireEvent.click(within(bar).getByRole('button', { name: '取消' }))
    await waitFor(() => expect(progressBar()).toBeNull())

    // One operation id crosses the seam for both digesting and cancelling.
    expect(cancelIds).toEqual([digestIds[0]])

    const notice = await screen.findByRole('alert')
    expect(notice.textContent).toContain('已取消')
    expect(notice.className).toContain('text-diff-added')

    expect(
      within(screen.getByRole('tablist', { name: '会话' }))
        .getAllByRole('tab')
        .map((tab) => tab.textContent)
    ).toEqual(tabsBefore)
    expect(statusText()).toBe(statusBefore)
    expect(screen.getByRole('main').innerHTML).toBe(viewBefore)
    const newCompare = screen.getAllByRole('button', { name: '新建对比' })[0] as HTMLButtonElement
    expect(newCompare.disabled).toBe(false)

    // The same pair can be started again right away and now completes.
    released = true
    releaseDigest()
    expect(await openAnotherDirectory(/left ↔ right/)).toBeDefined()
    await waitFor(() => expect(progressBar()).toBeNull())
    expect(
      within(screen.getByRole('tablist', { name: '会话' }))
        .getAllByRole('tab')
        .map((item) => item.getAttribute('aria-label') ?? '')
        .some((label) => label.includes('/memory/cancel/left ↔ /memory/cancel/right'))
    ).toBe(true)
  })

  /**
   * Cancelling a comparison started from 「新建对比」 has to work while the
   * dialog is already gone: no modal overlay, the same operation id on both
   * seams, and the workbench exactly as it was before.
   */
  it('cancels a dialog-started comparison with no modal overlay left behind', async () => {
    const base = await memoryPort([
      ['/memory/dialog-cancel/left/a.txt', 'x'],
      ['/memory/dialog-cancel/left/b.txt', 'x'],
      ['/memory/dialog-cancel/right/a.txt', 'x'],
      ['/memory/dialog-cancel/right/b.txt', 'x'],
    ])

    const digestIds: string[] = []
    const cancelIds: string[] = []
    let releaseDigest!: () => void
    const digestGate = new Promise<void>((resolve) => {
      releaseDigest = resolve
    })
    const port: PlatformPort = {
      ...base,
      digestFiles: async (paths, options) => {
        if (options?.operationId !== undefined) {
          digestIds.push(options.operationId)
          await digestGate
        }
        return base.digestFiles(paths)
      },
      cancelOperation: async (operationId) => {
        cancelIds.push(operationId)
      },
    }

    mountWorkbench(port)
    await loadDemoSamples()

    const tabsBefore = within(screen.getByRole('tablist', { name: '会话' }))
      .getAllByRole('tab')
      .map((tab) => tab.textContent)
    const statusBefore = statusText()
    const viewBefore = screen.getByRole('main').innerHTML

    fireEvent.click(screen.getAllByRole('button', { name: '新建对比' })[0])
    const panel = screen.getByRole('dialog', { name: '新建对比' })
    fireEvent.change(within(panel).getByLabelText('左侧路径'), {
      target: { value: '/memory/dialog-cancel/left' },
    })
    fireEvent.change(within(panel).getByLabelText('右侧路径'), {
      target: { value: '/memory/dialog-cancel/right' },
    })
    fireEvent.click(within(panel).getByRole('button', { name: '建立对比' }))

    const bar = await screen.findByRole('status', { name: '目录对比进度' })
    await waitFor(() => expect(digestIds.length).toBeGreaterThan(0))

    expect(screen.queryByRole('dialog', { name: '新建对比' })).toBeNull()
    expect(document.querySelectorAll('[aria-modal="true"]')).toHaveLength(0)
    expect(bar.textContent).toMatch(/正在(扫描目录|校验内容)/)
    expect(bar.textContent).toMatch(/已扫描 \d+ 个文件/)
    expect(bar.closest('[aria-modal="true"]')).toBeNull()

    const cancel = within(bar).getByRole('button', { name: '取消' }) as HTMLButtonElement
    expect(cancel.disabled).toBe(false)
    fireEvent.click(cancel)

    // The very same operation id reaches digesting and cancelling, and the
    // button locks until the abort settles.
    expect(cancelIds).toEqual([digestIds[0]])
    expect(cancel.disabled).toBe(true)

    await waitFor(() => expect(progressBar()).toBeNull())
    const notice = await screen.findByRole('alert')
    expect(notice.textContent).toBe('已取消本次目录对比，工作台保持取消前的状态。')

    expect(
      within(screen.getByRole('tablist', { name: '会话' }))
        .getAllByRole('tab')
        .map((tab) => tab.textContent)
    ).toEqual(tabsBefore)
    expect(screen.queryByRole('tab', { name: /left ↔ right/ })).toBeNull()
    expect(statusText()).toBe(statusBefore)
    expect(screen.getByRole('main').innerHTML).toBe(viewBefore)

    releaseDigest()
  })

  it('renders no progress bar while nothing is comparing', async () => {
    const port = await templatePort({
      files: [LEFT_ENGINE, RIGHT_ENGINE],
      directories: ['/ext/a', '/ext/b'],
    })
    mountWorkbench(port)

    // Idle empty workbench.
    expect(progressBar()).toBeNull()

    // A file pair is not a directory comparison.
    await openAnotherFile(/engine\.ts/)
    expect(progressBar()).toBeNull()

    // A real external directory pair, then the sync / template flows.
    fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '预览并同步' })).toBeDefined())
    expect(progressBar()).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '预览并同步' }))
    const syncDialog = await screen.findByRole('dialog', { name: /同步预览/ })
    expect(progressBar()).toBeNull()
    fireEvent.click(within(syncDialog).getByRole('button', { name: '取消' }))
    expect(progressBar()).toBeNull()

    clickMore('模板归位')
    const setupDialog = await screen.findByRole('dialog', { name: '模板归位 · 选择根' })
    expect(progressBar()).toBeNull()
    fireEvent.change(within(setupDialog).getByLabelText('散乱树 B 根'), {
      target: { value: '/ext/b' },
    })
    fireEvent.change(within(setupDialog).getByLabelText('输出根'), {
      target: { value: '/ext/out' },
    })
    fireEvent.click(within(setupDialog).getByRole('button', { name: '生成 Dry-run' }))
    const templateDialog = await screen.findByRole('dialog', { name: '模板归位映射预览' })
    expect(progressBar()).toBeNull()
    fireEvent.click(within(templateDialog).getByRole('button', { name: '确认归位' }))
    await screen.findByRole('dialog', { name: zh['directory.template.result.title'] })
    expect(progressBar()).toBeNull()
  })
})

describe('session tab labels follow the session facts', () => {
  const LEFT_YAML = `${DIRECTORY_SAMPLE_PATHS.left}/config/deploy.yaml`
  const RIGHT_YAML = `${DIRECTORY_SAMPLE_PATHS.right}/config/deploy.yaml`
  const JSON_LEFT = STRUCTURED_SCENE.json.left.path
  const JSON_RIGHT = STRUCTURED_SCENE.json.right.path

  /** Clicks「打开文件」and waits for the pair to be read. */
  async function clickOpenFile(): Promise<void> {
    fireEvent.click(screen.getByRole('button', { name: '打开文件' }))
    await waitFor(() => expect((screen.getByRole('button', { name: '打开文件' }) as HTMLButtonElement).disabled).toBe(false))
  }

  /** Full label of one tab: the clipped spans stay visible, the label does not. */
  function fullTabText(item: HTMLElement): string {
    return item.getAttribute('aria-label') ?? item.textContent ?? ''
  }

  function tabTexts(): string[] {
    return sessionTabRows().map(fullTabText)
  }

  /** One status-bar cell as rendered: label plus value. */
  function statusValue(label: string): string {
    return screen.getByText(label).parentElement?.textContent ?? ''
  }

  /** Text of the panel whose header shows `title` (a path). */
  function panelText(title: string): string {
    return screen.getAllByTitle(title)[0].closest('section')?.textContent ?? ''
  }

  /**
   * Title and subtitle of one tab, read from its full accessible name: the
   * visible spans are clipped per width tier, the label carries the derived
   * text unchanged.
   */
  function tabLabels(item: HTMLElement): { title: string; subtitle: string } {
    const label = fullTabText(item)
    const at = label.indexOf(' — ')
    if (at < 0) return { title: label, subtitle: '' }
    return { title: label.slice(0, at), subtitle: label.slice(at + 3) }
  }

  /** One `{ title, subtitle }` pair per tab, in tablist order. */
  function tabMatrix(): { title: string; subtitle: string }[] {
    return sessionTabRows().map(tabLabels)
  }

  function activeTab(): HTMLElement {
    const selected = within(sessionTabs())
      .getAllByRole('tab')
      .find((item) => item.getAttribute('aria-selected') === 'true')
    if (!selected) throw new Error('no active session tab')
    return selected
  }

  it('labels each file pair from its own two paths, same name or not', async () => {
    const engine = await openFilePair(scriptedPort({ files: [LEFT_ENGINE, RIGHT_ENGINE, LEFT_REPORT, RIGHT_REPORT] }), /engine\.ts/)
    // Both sides share a file name: the title is that name, the subtitle both paths.
    expect(fullTabText(engine)).toContain(LEFT_ENGINE)
    expect(fullTabText(engine)).toContain(RIGHT_ENGINE)

    await clickOpenFile()
    await screen.findByRole('tab', { name: /report\.csv/ }, { timeout: 4000 })

    // Each tab keeps its own pair; the first one was not re-labelled by the second.
    expect(fullTabText(sessionTab(/engine\.ts/))).toContain(LEFT_ENGINE)
    expect(fullTabText(sessionTab(/engine\.ts/))).toContain(RIGHT_ENGINE)
    expect(fullTabText(sessionTab(/engine\.ts/))).not.toContain(LEFT_REPORT)
    expect(fullTabText(sessionTab(/report\.csv/))).toContain(LEFT_REPORT)
    expect(fullTabText(sessionTab(/report\.csv/))).toContain(RIGHT_REPORT)
    expect(tabTexts()).toHaveLength(2)
  })

  it('moves a swapped directory side onto the visible tab without the replaced path', async () => {
    const base = createWebPlatformPort()
    const answers = [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right, DIRECTORY_SAMPLE_PATHS.incoming]
    const port: PlatformPort = {
      ...base,
      kind: 'electron',
      selectDirectory: async () => answers.shift() ?? null,
    }

    await openDirectoryPair(port, /baseline ↔ candidate/)

    clickMore('选择右目录')

    const swapped = await screen.findByRole('tab', { name: /baseline ↔ incoming/ }, { timeout: 4000 })
    expect(swapped.getAttribute('aria-selected')).toBe('true')
    expect(fullTabText(swapped)).toContain(DIRECTORY_SAMPLE_PATHS.left)
    expect(fullTabText(swapped)).toContain(DIRECTORY_SAMPLE_PATHS.incoming)
    expect(fullTabText(swapped)).not.toContain(DIRECTORY_SAMPLE_PATHS.right)

    // The tab that was not swapped keeps its own pair.
    expect(fullTabText(sessionTab(/baseline ↔ candidate/))).toContain(DIRECTORY_SAMPLE_PATHS.right)
    expect(tabTexts()).toHaveLength(2)
  })

  it('writes a code-view file open back to the tab and the working copy', async () => {
    const base = createWebPlatformPort()
    const OTHER = '/memory/notes/other.ts'
    await base.writeTextFile(OTHER, 'export const onlyHere = 1\n')
    const answers = [LEFT_ENGINE, RIGHT_ENGINE, LEFT_YAML, RIGHT_YAML, OTHER]
    const port: PlatformPort = { ...base, selectFile: async () => answers.shift() ?? null }

    mountWorkbench(port)
    await clickOpenFile()
    await screen.findByRole('tab', { name: /engine\.ts/ }, { timeout: 4000 })
    await clickOpenFile()
    await screen.findByRole('tab', { name: /deploy\.yaml/ }, { timeout: 4000 })

    fireEvent.click(sessionTab(/engine\.ts/))
    clickMore('打开左文件')

    const opened = await screen.findByRole('tab', { name: /other\.ts ↔ engine\.ts/ }, { timeout: 4000 })
    expect(fullTabText(opened)).toContain(OTHER)
    expect(fullTabText(opened)).toContain(RIGHT_ENGINE)
    expect(fullTabText(opened)).not.toContain(LEFT_ENGINE)
    // The panel shows the same file the tab claims, and the stats follow it.
    expect(panelText(OTHER)).toContain('onlyHere = 1')
    expect(statusValue('行数（左）')).toBe('行数（左）1')

    // Leaving and coming back remounts from the session facts, not the old file.
    fireEvent.click(sessionTab(/deploy\.yaml/))
    fireEvent.click(sessionTab(/other\.ts ↔ engine\.ts/))
    expect(panelText(OTHER)).toContain('onlyHere = 1')
    expect(statusValue('行数（左）')).toBe('行数（左）1')
  })

  it('recomputes a CSV session from the file opened in its view', async () => {
    const base = createWebPlatformPort()
    const OTHER = '/memory/data/other.csv'
    await base.writeTextFile(OTHER, 'id,name\n1,a\n2,b\n')
    const answers = [LEFT_ENGINE, RIGHT_ENGINE, LEFT_REPORT, RIGHT_REPORT, OTHER]
    const port: PlatformPort = { ...base, selectFile: async () => answers.shift() ?? null }

    mountWorkbench(port)
    await clickOpenFile()
    await screen.findByRole('tab', { name: /engine\.ts/ }, { timeout: 4000 })
    await clickOpenFile()
    await screen.findByRole('tab', { name: /report\.csv/ }, { timeout: 4000 })

    fireEvent.click(screen.getByRole('button', { name: '打开左文件' }))

    const opened = await screen.findByRole('tab', { name: /other\.csv ↔ report\.csv/ }, { timeout: 4000 })
    expect(fullTabText(opened)).toContain(OTHER)
    expect(fullTabText(opened)).toContain('· CSV')
    expect(statusValue('行数（左）')).toBe('行数（左）3')

    fireEvent.click(sessionTab(/engine\.ts/))
    fireEvent.click(sessionTab(/other\.csv ↔ report\.csv/))
    expect(screen.getAllByRole('tab', { name: /other\.csv ↔ report\.csv/ }).length).toBeGreaterThan(0)
    expect(statusValue('行数（左）')).toBe('行数（左）3')
  })

  it('moves a structured session onto the format of the file opened in its view', async () => {
    const base = createWebPlatformPort()
    const OTHER = '/memory/structured/other.yaml'
    await base.writeTextFile(OTHER, 'service:\n  name: other\n')
    const answers = [LEFT_ENGINE, RIGHT_ENGINE, JSON_LEFT, JSON_RIGHT, OTHER]
    const port: PlatformPort = { ...base, selectFile: async () => answers.shift() ?? null }

    mountWorkbench(port)
    await clickOpenFile()
    await screen.findByRole('tab', { name: /engine\.ts/ }, { timeout: 4000 })
    await clickOpenFile()
    await screen.findByRole('tab', { name: /config\.left\.json/ }, { timeout: 4000 })

    fireEvent.click(screen.getByRole('button', { name: '打开左文件' }))

    const opened = await screen.findByRole('tab', { name: /other\.yaml ↔ config\.right\.json/ }, { timeout: 4000 })
    expect(fullTabText(opened)).toContain(OTHER)
    expect(fullTabText(opened)).toContain('· YAML')

    fireEvent.click(sessionTab(/engine\.ts/))
    fireEvent.click(sessionTab(/other\.yaml ↔ config\.right\.json/))
    expect(screen.getAllByTitle(OTHER).length).toBeGreaterThan(0)
    expect(fullTabText(opened)).toContain('· YAML')
  })

  it('keeps a file, a directory and a drilldown tab apart, and restores the directory label', async () => {
    const base = createWebPlatformPort()
    const FILE_LEFT = '/memory/notes/a.md'
    const FILE_RIGHT = '/memory/notes/b.md'
    await base.writeTextFile(FILE_LEFT, '# a\n')
    await base.writeTextFile(FILE_RIGHT, '# b\n')
    const files = [FILE_LEFT, FILE_RIGHT]
    const directories = [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right]
    const port: PlatformPort = {
      ...base,
      selectFile: async () => files.shift() ?? null,
      selectDirectory: async () => directories.shift() ?? null,
    }

    mountWorkbench(port)
    await clickOpenFile()
    await screen.findByRole('tab', { name: /a\.md ↔ b\.md/ }, { timeout: 4000 })

    const directoryTab = await openAnotherDirectory(/baseline ↔ candidate/)
    expect(fullTabText(directoryTab)).toContain(DIRECTORY_SAMPLE_PATHS.left)
    expect(fullTabText(directoryTab)).toContain(DIRECTORY_SAMPLE_PATHS.right)

    fireEvent.doubleClick(within(screen.getAllByRole('tree')[0]).getAllByText('engine.ts')[0])
    const drilldown = await screen.findByRole('tab', { name: /engine\.ts/ }, { timeout: 4000 })
    expect(fullTabText(drilldown)).toContain(LEFT_ENGINE)
    expect(fullTabText(drilldown)).toContain(RIGHT_ENGINE)
    expect(tabTexts()).toHaveLength(3)

    // Switching tabs never borrows another session's paths.
    fireEvent.click(sessionTab(/a\.md ↔ b\.md/))
    expect(sessionTab(/a\.md ↔ b\.md/).getAttribute('aria-selected')).toBe('true')
    expect(fullTabText(sessionTab(/a\.md ↔ b\.md/))).not.toContain('/samples/directory')
    expect(fullTabText(sessionTab(/baseline ↔ candidate/))).toContain(`${DIRECTORY_SAMPLE_PATHS.left} ↔ ${DIRECTORY_SAMPLE_PATHS.right}`)

    // Going back lands on the directory tab with its own roots again.
    fireEvent.click(sessionTab(/engine\.ts/))
    fireEvent.click(screen.getByRole('button', { name: '返回上级目录视图' }))
    await waitFor(() => expect(screen.getAllByRole('tree')).toHaveLength(2))
    expect(fullTabText(sessionTab(/baseline ↔ candidate/))).toContain(`${DIRECTORY_SAMPLE_PATHS.left} ↔ ${DIRECTORY_SAMPLE_PATHS.right}`)
    expect(fullTabText(sessionTab(/baseline ↔ candidate/))).not.toContain('engine.ts')

    // Closing a neighbour leaves the remaining labels untouched.
    fireEvent.click(screen.getByRole('button', { name: '关闭 a.md ↔ b.md' }))
    expect(tabTexts()).toHaveLength(2)
    expect(fullTabText(sessionTab(/engine\.ts/))).toContain(LEFT_ENGINE)
    expect(fullTabText(sessionTab(/baseline ↔ candidate/))).toContain(DIRECTORY_SAMPLE_PATHS.right)
  })

  it('does not let a slow read clobber a session committed meanwhile', async () => {
    const base = createWebPlatformPort()
    const SLOW_LEFT = '/memory/slow/one.txt'
    const SLOW_RIGHT = '/memory/slow/two.txt'
    const FAST_LEFT = '/memory/fast/alpha.txt'
    const FAST_RIGHT = '/memory/fast/beta.txt'
    for (const [path, body] of [
      [SLOW_LEFT, 'slow left\n'],
      [SLOW_RIGHT, 'slow right\n'],
      [FAST_LEFT, 'fast left\n'],
      [FAST_RIGHT, 'fast right\n'],
    ] as const) {
      await base.writeTextFile(path, body)
    }

    let release = (): void => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const listeners = new Set<(payload: CompareRequestPayload) => void>()
    const port: PlatformPort = {
      ...base,
      probeTextFile: async (path) => {
        if (path.startsWith('/memory/slow/')) await gate
        return base.probeTextFile(path)
      },
      onCompareRequest: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      compareRequestsReady: async () => undefined,
    }

    mountWorkbench(port)
    await waitFor(() => expect(listeners.size).toBe(1))

    const emit = (request: CompareRequestPayload): void => {
      act(() => {
        for (const listener of [...listeners]) listener(request)
      })
    }

    emit({ ok: true, request: { kind: 'file', left: SLOW_LEFT, right: SLOW_RIGHT } })
    emit({ ok: true, request: { kind: 'file', left: FAST_LEFT, right: FAST_RIGHT } })

    await waitFor(() => expect(tabTexts()).toHaveLength(1))
    release()

    // Both sessions survive the overlapping reads, each with its own paths.
    await waitFor(() => expect(tabTexts()).toHaveLength(2))
    expect(fullTabText(sessionTab(/one\.txt ↔ two\.txt/))).toContain(SLOW_LEFT)
    expect(fullTabText(sessionTab(/alpha\.txt ↔ beta\.txt/))).toContain(FAST_LEFT)
  })

  it('rebuilds a same-name pair from A to B without borrowing A paths', async () => {
    const base = createWebPlatformPort()
    const A_LEFT = '/memory/one/report.md'
    const A_RIGHT = '/memory/two/report.md'
    const B_LEFT = '/memory/three/report.md'
    const B_RIGHT = '/memory/four/report.md'
    for (const path of [A_LEFT, A_RIGHT, B_LEFT, B_RIGHT]) {
      await base.writeTextFile(path, `# ${path}\n`)
    }

    mountWorkbench(base)

    submitComparePair(A_LEFT, A_RIGHT)
    await waitFor(() => expect(tabMatrix()).toHaveLength(1))
    expect(tabMatrix()).toEqual([{ title: 'report.md', subtitle: `${A_LEFT} ↔ ${A_RIGHT} · 代码 / 文本` }])

    // A second pair with the same file name in two other directories.
    submitComparePair(B_LEFT, B_RIGHT)
    await waitFor(() => expect(tabMatrix()).toHaveLength(2))

    const [aTab, bTab] = sessionTabRows()
    expect(bTab.getAttribute('aria-selected')).toBe('true')
    expect(tabLabels(bTab)).toEqual({
      title: 'report.md',
      subtitle: `${B_LEFT} ↔ ${B_RIGHT} · 代码 / 文本`,
    })
    expect(tabLabels(aTab)).toEqual({
      title: 'report.md',
      subtitle: `${A_LEFT} ↔ ${A_RIGHT} · 代码 / 文本`,
    })
    expect(tabLabels(bTab).subtitle).not.toContain(A_LEFT)
    expect(tabLabels(bTab).subtitle).not.toContain(A_RIGHT)
    expect(tabLabels(aTab).subtitle).not.toContain(B_LEFT)
    expect(tabLabels(aTab).subtitle).not.toContain(B_RIGHT)
  })

  it('follows both sides opened inside the view without minting a new tab', async () => {
    const base = createWebPlatformPort()
    const NEXT_LEFT = '/memory/next/alpha.ts'
    const NEXT_RIGHT = '/memory/next/beta.ts'
    await base.writeTextFile(NEXT_LEFT, 'export const alpha = 1\n')
    await base.writeTextFile(NEXT_RIGHT, 'export const beta = 2\n')
    const answers = [LEFT_ENGINE, RIGHT_ENGINE, LEFT_YAML, RIGHT_YAML, NEXT_LEFT, NEXT_RIGHT]
    const port: PlatformPort = { ...base, selectFile: async () => answers.shift() ?? null }

    mountWorkbench(port)
    await clickOpenFile()
    await screen.findByRole('tab', { name: /engine\.ts/ }, { timeout: 4000 })
    await clickOpenFile()
    await screen.findByRole('tab', { name: /deploy\.yaml/ }, { timeout: 4000 })

    fireEvent.click(sessionTab(/engine\.ts/))
    clickMore('打开左文件')
    await waitFor(() => expect(tabLabels(activeTab()).title).toBe('alpha.ts ↔ engine.ts'))

    clickMore('打开右文件')
    await waitFor(() => expect(tabLabels(activeTab()).title).toBe('alpha.ts ↔ beta.ts'))

    // The session kept its identity: still one tab per opened pair, same slots.
    expect(tabMatrix()).toEqual([
      { title: 'alpha.ts ↔ beta.ts', subtitle: `${NEXT_LEFT} ↔ ${NEXT_RIGHT} · 代码 / 文本` },
      { title: 'deploy.yaml', subtitle: `${LEFT_YAML} ↔ ${RIGHT_YAML} · YAML` },
    ])
    const openedLabels = tabLabels(sessionTab(/alpha\.ts ↔ beta\.ts/))
    expect(openedLabels.subtitle).not.toContain(LEFT_ENGINE)
    expect(openedLabels.subtitle).not.toContain(RIGHT_ENGINE)

    // Leaving and coming back remounts from the new pair, not the old one.
    fireEvent.click(sessionTab(/deploy\.yaml/))
    fireEvent.click(sessionTab(/alpha\.ts ↔ beta\.ts/))
    expect(tabLabels(activeTab())).toEqual({
      title: 'alpha.ts ↔ beta.ts',
      subtitle: `${NEXT_LEFT} ↔ ${NEXT_RIGHT} · 代码 / 文本`,
    })
  })

  it('labels a drilldown tab and restores the directory tab on return', async () => {
    const base = createWebPlatformPort()
    const directories = [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right]
    const port: PlatformPort = {
      ...base,
      selectDirectory: async () => directories.shift() ?? null,
    }

    await openDirectoryPair(port, /baseline ↔ candidate/)

    const directoryLabels = {
      title: 'baseline ↔ candidate',
      subtitle: `${DIRECTORY_SAMPLE_PATHS.left} ↔ ${DIRECTORY_SAMPLE_PATHS.right}`,
    }
    expect(tabLabels(sessionTab(/baseline ↔ candidate/))).toEqual(directoryLabels)

    fireEvent.doubleClick(within(screen.getAllByRole('tree')[0]).getAllByText('engine.ts')[0])
    await screen.findByRole('tab', { name: /engine\.ts/ }, { timeout: 4000 })

    const drilldownLabels = {
      title: 'engine.ts',
      subtitle: `${LEFT_ENGINE} ↔ ${RIGHT_ENGINE} · 代码 / 文本`,
    }
    expect(tabLabels(sessionTab(/engine\.ts/))).toEqual(drilldownLabels)
    // Drilling out never rewrites the source directory tab.
    expect(tabLabels(sessionTab(/baseline ↔ candidate/))).toEqual(directoryLabels)

    fireEvent.click(screen.getByRole('button', { name: '返回上级目录视图' }))
    await waitFor(() => expect(screen.getAllByRole('tree')).toHaveLength(2))

    expect(tabLabels(sessionTab(/baseline ↔ candidate/))).toEqual(directoryLabels)
    expect(tabLabels(sessionTab(/engine\.ts/))).toEqual(drilldownLabels)
    expect(tabLabels(sessionTab(/baseline ↔ candidate/)).subtitle).not.toContain('engine.ts')
  })

  it('keeps file, directory and drilldown labels apart and stable on neighbour close', async () => {
    const base = createWebPlatformPort()
    const FILE_LEFT = '/memory/notes/a.md'
    const FILE_RIGHT = '/memory/notes/b.md'
    await base.writeTextFile(FILE_LEFT, '# a\n')
    await base.writeTextFile(FILE_RIGHT, '# b\n')
    const files = [FILE_LEFT, FILE_RIGHT]
    const directories = [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right]
    const port: PlatformPort = {
      ...base,
      selectFile: async () => files.shift() ?? null,
      selectDirectory: async () => directories.shift() ?? null,
    }

    mountWorkbench(port)
    await clickOpenFile()
    await screen.findByRole('tab', { name: /a\.md ↔ b\.md/ }, { timeout: 4000 })
    await openAnotherDirectory(/baseline ↔ candidate/)

    fireEvent.doubleClick(within(screen.getAllByRole('tree')[0]).getAllByText('engine.ts')[0])
    await screen.findByRole('tab', { name: /engine\.ts/ }, { timeout: 4000 })

    const expected = [
      { title: 'a.md ↔ b.md', subtitle: `${FILE_LEFT} ↔ ${FILE_RIGHT} · 代码 / 文本` },
      {
        title: 'baseline ↔ candidate',
        subtitle: `${DIRECTORY_SAMPLE_PATHS.left} ↔ ${DIRECTORY_SAMPLE_PATHS.right}`,
      },
      { title: 'engine.ts', subtitle: `${LEFT_ENGINE} ↔ ${RIGHT_ENGINE} · 代码 / 文本` },
    ]
    expect(tabMatrix()).toEqual(expected)

    // Every tab owns its own facts; none borrows another session's paths.
    const [fileTab, directoryTab, drilldownTab] = sessionTabRows()
    expect(tabLabels(fileTab).subtitle).not.toContain(DIRECTORY_SAMPLE_PATHS.left)
    expect(tabLabels(fileTab).subtitle).not.toContain(LEFT_ENGINE)
    expect(tabLabels(directoryTab).subtitle).not.toContain(FILE_LEFT)
    expect(tabLabels(directoryTab).subtitle).not.toContain('engine.ts')
    expect(tabLabels(drilldownTab).subtitle).not.toContain(FILE_LEFT)

    // A full round trip: each selection keeps every label on its own facts.
    for (const [index, name] of [
      [0, /a\.md ↔ b\.md/],
      [1, /baseline ↔ candidate/],
      [2, /engine\.ts/],
      [0, /a\.md ↔ b\.md/],
    ] as const) {
      fireEvent.click(sessionTab(name))
      expect(tabMatrix()).toEqual(expected)
      expect(tabLabels(activeTab())).toEqual(expected[index])
    }

    // Active middle tab (the directory); close its non-active left neighbour.
    fireEvent.click(sessionTab(/baseline ↔ candidate/))
    const beforeClose = tabMatrix()
    const panelBefore = statusText()
    fireEvent.click(screen.getByRole('button', { name: '关闭 a.md ↔ b.md' }))

    expect(tabMatrix()).toEqual([beforeClose[1], beforeClose[2]])
    expect(tabLabels(activeTab())).toEqual({
      title: 'baseline ↔ candidate',
      subtitle: `${DIRECTORY_SAMPLE_PATHS.left} ↔ ${DIRECTORY_SAMPLE_PATHS.right}`,
    })
    expect(activeTab().getAttribute('aria-selected')).toBe('true')
    expect(statusText()).toBe(panelBefore)
    expect(screen.getAllByRole('tree')).toHaveLength(2)
  })
})
