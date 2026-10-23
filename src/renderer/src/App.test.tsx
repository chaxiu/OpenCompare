// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CSV_SCENE, DIRECTORY_SAMPLE_PATHS } from '@shared/fixtures'
import type { CompareRequestPayload } from '@shared/compareRequest'
import type { PlatformPort } from '@shared/platform/types'
import { compareDirectories, createComparisonCache } from '@core/directory/compare'
import { App } from './App'
import { createWebPlatformPort } from './platform/web-platform'
import { Workbench } from './workbench/Workbench'

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
    }
  }
})

/**
 * jsdom reports zero-sized elements, which would give the virtualised tree no
 * viewport at all. A fixed 1200×640 client box stands in for the real panel.
 */
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
const LEFT_ENGINE = `${DIRECTORY_SAMPLE_PATHS.left}/src/core/engine.ts`
const RIGHT_ENGINE = `${DIRECTORY_SAMPLE_PATHS.right}/src/core/engine.ts`
const LEFT_REPORT = `${DIRECTORY_SAMPLE_PATHS.left}/src/data/report.csv`
const RIGHT_REPORT = `${DIRECTORY_SAMPLE_PATHS.right}/src/data/report.csv`
const SAMPLE_DIRECTORY_ID = `directory:${DIRECTORY_SAMPLE_PATHS.left} ↔ ${DIRECTORY_SAMPLE_PATHS.right}`
/** Drilldown session ids carry the source directory session they came from. */
const DRILLDOWN_PREFIX = `file:${SAMPLE_DIRECTORY_ID}::`

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

/** The built-in library is an auxiliary, explicitly labelled demo entry. */
function loadDemoSamples(): void {
  fireEvent.click(screen.getByRole('button', { name: '加载演示样本' }))
}

interface PortScript {
  /** Answers of the successive `selectFile` calls; `undefined` cancels. */
  readonly files?: readonly string[]
  /** Answers of the successive `selectDirectory` calls. */
  readonly directories?: readonly string[]
  /** Paths resolved for the successive dropped handles. */
  readonly dropped?: readonly string[]
}

/** Memory PlatformPort with scripted picker answers and dropped paths. */
function scriptedPort(script: PortScript): PlatformPort {
  const base = createWebPlatformPort()
  const files = [...(script.files ?? [])]
  const directories = [...(script.directories ?? [])]
  const dropped = [...(script.dropped ?? [])]
  return {
    ...base,
    selectFile: async () => files.shift() ?? null,
    selectDirectory: async () => directories.shift() ?? null,
    resolveDroppedPath: async () => dropped.shift() ?? ''
  }
}

/** Row titles of the left tree pane, in render order. */
function treeRowTitles(): string[] {
  const tree = screen.getAllByRole('tree')[0]
  return within(tree)
    .getAllByRole('treeitem')
    .map((row) => row.getAttribute('title') ?? '')
}

/** Dispatches a file drop whose handles resolve to `paths`. */
function dropPaths(element: HTMLElement, paths: readonly string[]): boolean {
  const files = paths.map((path) => new File([''], path.slice(path.lastIndexOf('/') + 1)))
  return fireEvent.drop(element, { dataTransfer: { files, types: ['Files'] } })
}

describe('workbench shell', () => {
  it('mounts the empty workbench on the in-memory PlatformPort', async () => {
    await renderApp()

    expect(screen.getByRole('heading', { name: 'OpenCompare' })).toBeDefined()
    expect(screen.getByText('web')).toBeDefined()
    expect(screen.getByRole('heading', { name: EMPTY_TITLE })).toBeDefined()
    expect(screen.getByRole('tablist', { name: '视图切换' })).toBeDefined()
    expect(screen.getByRole('button', { name: '打开文件' })).toBeDefined()
    expect(screen.getByRole('button', { name: '打开文件夹' })).toBeDefined()
  })

  it('shows the loading state, then every sample session', async () => {
    await renderApp()

    loadDemoSamples()
    expect(screen.getByRole('heading', { name: '正在载入样本…' })).toBeDefined()

    expect(await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })).toBeDefined()
    expect(screen.getByText(SAMPLE_DIRECTORY_ID)).toBeDefined()
    expect(screen.getAllByRole('tab', { name: /CSV 主键对比/ }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('tab', { name: /JSON \/ YAML/ }).length).toBeGreaterThan(0)
  })

  it('switches the work area and the status bar with the active session', async () => {
    await renderApp()

    loadDemoSamples()
    const codeTab = await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })

    fireEvent.click(codeTab)

    expect(screen.getByText('session-code')).toBeDefined()
    expect(screen.getByRole('tab', { name: '三向合并 base · ours · theirs' })).toBeDefined()
    // three-way merge renders three panes, i.e. two draggable dividers
    expect(screen.getAllByRole('separator', { name: '调整分栏宽度' }).length).toBe(2)
  })

  it('shows the key-aligned CSV reconciliation with runtime counts', async () => {
    await renderApp()

    fireEvent.click(screen.getByRole('button', { name: '演示样本' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /CSV 主键对比/ }))

    const total = CSV_SCENE.composition.same + CSV_SCENE.composition.added +
      CSV_SCENE.composition.removed + CSV_SCENE.composition.modified

    // The declared key column is selected and the merged view is sized by the
    // runtime alignment, not the sample answer key.
    const keyPicker = await screen.findByRole('group', { name: '主键列选择' }, { timeout: 4000 })
    expect(
      within(keyPicker).getByRole('button', { name: 'order_id' }).getAttribute('aria-pressed')
    ).toBe('true')
    expect(screen.getByRole('tablist', { name: '状态过滤' })).toBeDefined()
    expect(screen.getByText(`${total.toLocaleString('en-US')} / ${total.toLocaleString('en-US')} 行`)).toBeDefined()

    const { same, added, removed, modified } = CSV_SCENE.composition
    expect(screen.getByRole('contentinfo').textContent).toContain(
      `${same}相同${added}新增${removed}删除${modified}修改`
    )
  })

  it('surfaces a readable, retryable error state', async () => {
    await renderApp()

    fireEvent.click(screen.getByRole('button', { name: '演示样本' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /演示：样本读取失败/ }))

    expect(
      await screen.findByRole('heading', { name: '样本库读取失败' }, { timeout: 4000 })
    ).toBeDefined()
    expect(screen.getByRole('button', { name: '重试' })).toBeDefined()
  })

  it('filters the directory comparison and drills a file into its file view', async () => {
    await renderApp()

    loadDemoSamples()
    await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })

    // Runtime comparison: the paired file shows up in both projected panes.
    expect(screen.getByRole('tablist', { name: '差异过滤' })).toBeDefined()
    expect(screen.getAllByText('engine.ts').length).toBe(2)
    // Status-bar counts are computed by the engine, not read from the answer key.
    const comparison = await compareSampleDirectory()
    const statusBar = screen.getByRole('contentinfo').textContent ?? ''
    expect(statusBar).toContain(
      `文件（源）${comparison.counts.same + comparison.counts.removed + comparison.counts.modified}`
    )
    expect(statusBar).toContain(
      `差异${comparison.counts.added + comparison.counts.removed + comparison.counts.modified}`
    )

    fireEvent.click(screen.getByRole('tab', { name: '仅差异' }))
    expect(screen.queryByText('parser.ts')).toBeNull()
    expect(screen.getAllByText('engine.ts').length).toBe(2)
    // Filtering also refreshes the status-bar legend.
    expect(screen.getByRole('contentinfo').textContent).toContain(
      `0相同${comparison.counts.added}新增${comparison.counts.removed}删除${comparison.counts.modified}修改`
    )

    fireEvent.click(screen.getByRole('tab', { name: '全部' }))
    fireEvent.doubleClick(screen.getAllByText('engine.ts')[0])

    expect(await screen.findByText(`${DRILLDOWN_PREFIX}src/core/engine.ts`, {}, { timeout: 4000 })).toBeDefined()
    expect(screen.getByText(/本地文件 · 双栏字符级 Diff/)).toBeDefined()
  })

  it('drills CSV and YAML files into their typed views', async () => {
    await renderApp()

    loadDemoSamples()
    await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })

    fireEvent.doubleClick(screen.getAllByText('report.csv')[0])
    expect(await screen.findByText(`${DRILLDOWN_PREFIX}src/data/report.csv`, {}, { timeout: 4000 })).toBeDefined()
    // No declared primary key on a drilldown: the first shared column wins.
    expect(await screen.findByText('对齐 4 行 · 主键 order_id')).toBeDefined()
    expect(screen.getByRole('contentinfo').textContent).toContain('2相同1新增0删除1修改')

    const sessionTabs = screen.getByRole('tablist', { name: '会话' })
    fireEvent.click(within(sessionTabs).getByRole('tab', { name: /baseline ↔ candidate/ }))

    // The tab kept its tree while inactive; switching back remounts the view.
    await waitFor(() => expect(screen.getAllByText('deploy.yaml').length).toBeGreaterThan(0))
    fireEvent.doubleClick(screen.getAllByText('deploy.yaml')[0])
    expect(await screen.findByText(`${DRILLDOWN_PREFIX}config/deploy.yaml`, {}, { timeout: 4000 })).toBeDefined()
    expect(screen.getByText(/YAML 原文/)).toBeDefined()
  })

  it('explains why a non-text file cannot be drilled into', async () => {
    await renderApp()

    loadDemoSamples()
    await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })

    fireEvent.doubleClick(screen.getAllByText('logo.png')[0])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('暂不支持')
    // the directory session stays put instead of silently doing nothing
    expect(screen.getByText(SAMPLE_DIRECTORY_ID)).toBeDefined()
  })

  it('degrades the native directory picker on the web runtime', async () => {
    await renderApp()

    loadDemoSamples()
    await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })

    const leftPicker = screen.getByRole('button', { name: '选择左目录' }) as HTMLButtonElement
    const rightPicker = screen.getByRole('button', { name: '选择右目录' }) as HTMLButtonElement
    const samplePicker = screen.getByRole('button', { name: '加载演示目录' }) as HTMLButtonElement

    expect(leftPicker.disabled).toBe(true)
    expect(rightPicker.disabled).toBe(true)
    expect(samplePicker.disabled).toBe(false)
    expect(screen.getByText(/Web 预览模式没有原生目录选择/)).toBeDefined()
  })

  it('previews a sync dry-run with byte totals and cancels without writing', async () => {
    await renderApp()

    loadDemoSamples()
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
    expect(screen.getByText('/samples/directory/baseline')).toBeDefined()
  })

  it('applies the confirmed sync and refreshes the comparison tree', async () => {
    await renderApp()

    loadDemoSamples()
    await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })

    fireEvent.click(screen.getByRole('button', { name: '预览并同步' }))
    const dialog = await screen.findByRole('dialog', { name: /左 → 右 · 增量同步预览/ })
    fireEvent.click(within(dialog).getByRole('button', { name: '确认执行' }))

    expect(await screen.findByText(/同步完成/)).toBeDefined()
    expect(screen.queryByRole('dialog')).toBeNull()
    // The refresh compares the materialised writable copy, not the read-only mount.
    expect(screen.queryByText('/samples/directory/candidate')).toBeNull()
  })

  it('previews the template placement and extracts it into a writable root', async () => {
    await renderApp()

    loadDemoSamples()
    await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })

    fireEvent.click(screen.getByRole('button', { name: '模板归位' }))
    const dialog = await screen.findByRole('dialog', { name: '模板归位映射预览' })

    expect(within(dialog).getByText('src/core/utils/strings.ts')).toBeDefined()
    expect(
      within(dialog).getByText('/samples/directory/incoming/misc/deep/deeper/strings.ts')
    ).toBeDefined()
    expect(within(dialog).getByText('缺失槽位')).toBeDefined()

    fireEvent.click(within(dialog).getByRole('button', { name: '确认提取归位' }))
    const notice = await screen.findByText(/模板归位完成/)
    expect(notice.textContent).toContain('已匹配 9')
    // Complete restore: every written slot lands, nothing missing or conflicting.
    expect(notice.textContent).toContain('缺失 0')
    expect(notice.textContent).toContain('冲突 0')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('real file workbench', () => {
  it('opens two real files from the pickers without loading a sample', async () => {
    render(<Workbench platform={scriptedPort({ files: [LEFT_ENGINE, RIGHT_ENGINE] })} />)

    fireEvent.click(screen.getByRole('button', { name: '打开文件' }))

    expect(await screen.findByRole('tab', { name: /engine\.ts/ }, { timeout: 4000 })).toBeDefined()
    expect(screen.getByRole('contentinfo').textContent).toContain(
      `${LEFT_ENGINE} ↔ ${RIGHT_ENGINE}`
    )
    // A real pair lands on the shared file-session model, no sample scene involved.
    expect(screen.getByText(/本地文件 · 双栏字符级 Diff/)).toBeDefined()
    expect(screen.queryByRole('tab', { name: /3-Way Merge/ })).toBeNull()
  })

  it('opens two real folders and labels the session with both roots', async () => {
    render(
      <Workbench
        platform={scriptedPort({
          directories: [
            DIRECTORY_SAMPLE_PATHS.left,
            DIRECTORY_SAMPLE_PATHS.incoming,
            DIRECTORY_SAMPLE_PATHS.left,
            DIRECTORY_SAMPLE_PATHS.right
          ]
        })}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }))

    expect(
      await screen.findByRole('tab', { name: /baseline ↔ incoming/ }, { timeout: 4000 })
    ).toBeDefined()
    // The tab subtitle carries the two real roots of this pair.
    expect(
      screen.getByText(
        `${DIRECTORY_SAMPLE_PATHS.left} ↔ ${DIRECTORY_SAMPLE_PATHS.incoming}`
      )
    ).toBeDefined()
    expect(screen.getAllByText('engine.ts').length).toBeGreaterThan(0)

    // A second pair adds its own tab instead of overwriting the first one.
    fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }))
    expect(
      await screen.findByRole('tab', { name: /baseline ↔ candidate/ }, { timeout: 4000 })
    ).toBeDefined()
    expect(within(screen.getByRole('tablist', { name: '会话' })).getAllByRole('tab')).toHaveLength(2)
  })

  it('builds directory rows only for the active session', async () => {
    rowBuilds.count = 0
    render(
      <Workbench
        platform={scriptedPort({
          directories: [
            DIRECTORY_SAMPLE_PATHS.left,
            DIRECTORY_SAMPLE_PATHS.incoming,
            DIRECTORY_SAMPLE_PATHS.left,
            DIRECTORY_SAMPLE_PATHS.right
          ]
        })}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }))
    const firstTab = await screen.findByRole(
      'tab',
      { name: /baseline ↔ incoming/ },
      { timeout: 4000 }
    )
    // One mounted directory view = one row model per side.
    const afterFirst = rowBuilds.count
    expect(afterFirst).toBe(2)
    const firstRows = treeRowTitles()

    fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }))
    await screen.findByRole('tab', { name: /baseline ↔ candidate/ }, { timeout: 4000 })
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
      DIRECTORY_SAMPLE_PATHS.right
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
      }
    }

    render(<Workbench platform={port} />)
    fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }))
    const firstTab = await screen.findByRole(
      'tab',
      { name: /baseline ↔ candidate/ },
      { timeout: 4000 }
    )
    const firstRows = treeRowTitles()
    const firstStatus = screen.getByRole('contentinfo').textContent
    expect(firstRows.length).toBeGreaterThan(0)

    for (let pair = 1; pair < 3; pair += 1) {
      fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }))
      await waitFor(() =>
        expect(
          within(screen.getByRole('tablist', { name: '会话' })).getAllByRole('tab')
        ).toHaveLength(pair + 1)
      )
    }

    const tabs = within(screen.getByRole('tablist', { name: '会话' })).getAllByRole('tab')
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
    expect(screen.getByRole('contentinfo').textContent).toBe(firstStatus)
    expect(directoryCalls).toBe(scansBefore)
    expect(digestCalls).toBe(digestsBefore)
  })

  it('keeps filter, collapse, selection and scroll across a tab switch', async () => {
    render(
      <Workbench
        platform={scriptedPort({
          directories: [
            DIRECTORY_SAMPLE_PATHS.left,
            DIRECTORY_SAMPLE_PATHS.right,
            DIRECTORY_SAMPLE_PATHS.right,
            DIRECTORY_SAMPLE_PATHS.left
          ]
        })}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }))
    await screen.findByRole('tab', { name: /baseline ↔ candidate/ }, { timeout: 4000 })
    fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }))
    const secondTab = await screen.findByRole(
      'tab',
      { name: /candidate ↔ baseline/ },
      { timeout: 4000 }
    )

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
    expect(
      within(screen.getAllByRole('tree')[0])
        .getAllByText('engine.ts')[0]
        .closest('[role="treeitem"]')
        ?.getAttribute('aria-selected')
    ).toBe('true')
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
    const answers = [
      '/memory/real/left',
      '/memory/real/right',
      '/memory/alias/left',
      '/memory/alias/right'
    ]
    let digestCalls = 0
    const port: PlatformPort = {
      ...base,
      selectDirectory: async () => answers.shift() ?? null,
      realpath: async (paths) =>
        paths.map((path) => path.replace('/memory/alias/', '/memory/real/')),
      digestFiles: async (paths, options) => {
        digestCalls += 1
        return base.digestFiles(paths, options)
      }
    }

    render(<Workbench platform={port} />)
    fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }))
    await screen.findByRole('tab', { name: /left ↔ right/ }, { timeout: 4000 })
    await waitFor(() => expect(digestCalls).toBeGreaterThan(0))
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: '打开文件夹' }) as HTMLButtonElement).disabled
      ).toBe(false)
    )
    const digestsBefore = digestCalls

    fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }))

    // The alias root registers the real cache key, so the second pass hashes
    // nothing; the tab itself is still a second tab with the user's path.
    await waitFor(() =>
      expect(within(screen.getByRole('tablist', { name: '会话' })).getAllByRole('tab')).toHaveLength(2)
    )
    expect(digestCalls).toBe(digestsBefore)
    const aliasTab = within(screen.getByRole('tablist', { name: '会话' })).getAllByRole('tab')[1]
    expect(aliasTab.textContent).toContain('/memory/alias/left')
  })

  it('keeps one tab when the same directory pair is compared again', async () => {
    render(
      <Workbench
        platform={scriptedPort({
          directories: [
            DIRECTORY_SAMPLE_PATHS.left,
            DIRECTORY_SAMPLE_PATHS.right,
            DIRECTORY_SAMPLE_PATHS.left,
            DIRECTORY_SAMPLE_PATHS.right
          ]
        })}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }))
    await screen.findByRole('tab', { name: /baseline ↔ candidate/ }, { timeout: 4000 })
    fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }))

    await waitFor(() => {
      const tabs = within(screen.getByRole('tablist', { name: '会话' })).getAllByRole('tab')
      expect(tabs.filter((tab) => /baseline ↔ candidate/.test(tab.textContent ?? ''))).toHaveLength(1)
    })
  })

  it('leaves the workbench untouched when a picker is cancelled', async () => {
    render(<Workbench platform={scriptedPort({})} />)

    fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }))

    await waitFor(() =>
      expect(screen.queryByRole('tablist', { name: '会话' })).toBeNull()
    )
    expect(screen.getByRole('heading', { name: EMPTY_TITLE })).toBeDefined()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('opens nothing when the second picker is cancelled', async () => {
    // The left side resolves, the right one is dismissed.
    render(<Workbench platform={scriptedPort({ files: [LEFT_ENGINE] })} />)

    fireEvent.click(screen.getByRole('button', { name: '打开文件' }))

    await waitFor(() =>
      expect(screen.queryByRole('tablist', { name: '会话' })).toBeNull()
    )
    expect(screen.getByRole('heading', { name: EMPTY_TITLE })).toBeDefined()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('adds an independent tab for every opened pair', async () => {
    render(
      <Workbench
        platform={scriptedPort({
          files: [LEFT_ENGINE, RIGHT_ENGINE, LEFT_REPORT, RIGHT_REPORT]
        })}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '打开文件' }))
    await screen.findByRole('tab', { name: /engine\.ts/ }, { timeout: 4000 })

    fireEvent.click(screen.getByRole('button', { name: '打开文件' }))
    await screen.findByRole('tab', { name: /report\.csv/ }, { timeout: 4000 })

    expect(within(screen.getByRole('tablist', { name: '会话' })).getAllByRole('tab')).toHaveLength(2)
    expect(screen.getAllByRole('tab', { name: /engine\.ts/ })).toHaveLength(1)
  })

  it('opens a pair when two same-kind paths are dropped', async () => {
    render(
      <Workbench platform={scriptedPort({ dropped: [LEFT_REPORT, RIGHT_REPORT] })} />
    )

    // The drop never reaches the browser default (which would navigate away).
    expect(dropPaths(screen.getByRole('main'), [LEFT_REPORT, RIGHT_REPORT])).toBe(false)

    expect(await screen.findByText('对齐 4 行 · 主键 order_id')).toBeDefined()
    expect(screen.getByRole('contentinfo').textContent).toContain(
      `${LEFT_REPORT} ↔ ${RIGHT_REPORT}`
    )
  })

  it('opens a directory session when two directories are dropped', async () => {
    render(
      <Workbench
        platform={scriptedPort({
          dropped: [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right]
        })}
      />
    )

    dropPaths(screen.getByRole('main'), [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right])

    expect(
      await screen.findByRole('tab', { name: /baseline ↔ candidate/ }, { timeout: 4000 })
    ).toBeDefined()
    expect(screen.getByRole('contentinfo').textContent).toContain('差异')
  })

  it('reports skipped unreadable entries per side as an info notice and a view count', async () => {
    const base = scriptedPort({
      dropped: [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right]
    })
    const unreadable = {
      name: 'unreadable',
      path: `${DIRECTORY_SAMPLE_PATHS.left}/unreadable`,
      isDirectory: false,
      size: 0,
      modifiedMs: 0,
      broken: true,
      skippedReason: '不可读条目：没有访问权限（EACCES）'
    }
    const platform: PlatformPort = {
      ...base,
      listDirectory: async (path) => [
        ...(await base.listDirectory(path)),
        ...(path === DIRECTORY_SAMPLE_PATHS.left ? [unreadable] : [])
      ],
      // The real scan goes through the batch channel, so the injected broken
      // entry has to be visible there too.
      listDirectories: async (paths) =>
        Promise.all(
          paths.map(async (path) => {
            const entries = await base.listDirectory(path)
            return {
              path,
              ok: true as const,
              entries: path === DIRECTORY_SAMPLE_PATHS.left ? [...entries, unreadable] : entries
            }
          })
        )
    }

    render(<Workbench platform={platform} />)
    dropPaths(screen.getByRole('main'), [
      DIRECTORY_SAMPLE_PATHS.left,
      DIRECTORY_SAMPLE_PATHS.right
    ])

    // A successful comparison reports the skips at info level, not as an error.
    const notice = await screen.findByRole('alert')
    expect(notice.textContent).toContain('已跳过：左 1 / 右 0')
    expect(notice.className).toContain('text-diff-added')
    // The directory view keeps the per-side count visible as well.
    expect(screen.getAllByText('已跳过：左 1 / 右 0')).toHaveLength(2)
  })

  it('does not drill into a directory link or read its target', async () => {
    const base = scriptedPort({
      dropped: [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right]
    })
    const dirLink = {
      name: 'dir-link',
      path: `${DIRECTORY_SAMPLE_PATHS.left}/dir-link`,
      isDirectory: false,
      size: 9,
      modifiedMs: 0,
      isSymbolicLink: true,
      linkTarget: '/targets/shared',
      linkTargetKind: 'directory' as const
    }
    const readTextFile = vi.fn((path: string) => base.readTextFile(path))
    const platform: PlatformPort = {
      ...base,
      readTextFile,
      listDirectory: async (path) => [
        ...(await base.listDirectory(path)),
        ...(path === DIRECTORY_SAMPLE_PATHS.left ? [dirLink] : [])
      ],
      listDirectories: async (paths) =>
        Promise.all(
          paths.map(async (path) => {
            const entries = await base.listDirectory(path)
            return {
              path,
              ok: true as const,
              entries: path === DIRECTORY_SAMPLE_PATHS.left ? [...entries, dirLink] : entries
            }
          })
        )
    }

    render(<Workbench platform={platform} />)
    dropPaths(screen.getByRole('main'), [
      DIRECTORY_SAMPLE_PATHS.left,
      DIRECTORY_SAMPLE_PATHS.right
    ])
    await screen.findByRole('tab', { name: /baseline ↔ candidate/ }, { timeout: 4000 })

    fireEvent.doubleClick(within(screen.getAllByRole('tree')[0]).getAllByText('dir-link')[0])

    const notice = await screen.findByRole('alert')
    expect(notice.textContent).toContain('不跟随')
    expect(readTextFile).not.toHaveBeenCalledWith(`${DIRECTORY_SAMPLE_PATHS.left}/dir-link`)
    expect(screen.queryByRole('tab', { name: /dir-link/ })).toBeNull()
  })

  it('drills into a file link by reading the target body', async () => {
    const base = scriptedPort({
      dropped: [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right]
    })
    const fileLink = {
      name: 'linked-engine.ts',
      path: `${DIRECTORY_SAMPLE_PATHS.left}/linked-engine.ts`,
      isDirectory: false,
      size: 18,
      modifiedMs: 0,
      isSymbolicLink: true,
      linkTarget: '/targets/engine.ts',
      linkTargetKind: 'file' as const
    }
    const platform: PlatformPort = {
      ...base,
      readTextFile: async (path) =>
        path === `${DIRECTORY_SAMPLE_PATHS.left}/linked-engine.ts`
          ? 'LINKED TARGET BODY'
          : base.readTextFile(path),
      listDirectory: async (path) => [
        ...(await base.listDirectory(path)),
        ...(path === DIRECTORY_SAMPLE_PATHS.left ? [fileLink] : [])
      ],
      listDirectories: async (paths) =>
        Promise.all(
          paths.map(async (path) => {
            const entries = await base.listDirectory(path)
            return {
              path,
              ok: true as const,
              entries: path === DIRECTORY_SAMPLE_PATHS.left ? [...entries, fileLink] : entries
            }
          })
        )
    }

    render(<Workbench platform={platform} />)
    dropPaths(screen.getByRole('main'), [
      DIRECTORY_SAMPLE_PATHS.left,
      DIRECTORY_SAMPLE_PATHS.right
    ])
    await screen.findByRole('tab', { name: /baseline ↔ candidate/ }, { timeout: 4000 })

    fireEvent.doubleClick(
      within(screen.getAllByRole('tree')[0]).getAllByText('linked-engine.ts')[0]
    )

    expect(await screen.findByText('LINKED TARGET BODY', {}, { timeout: 4000 })).toBeDefined()
    expect(screen.getByRole('tab', { name: /linked-engine\.ts/ })).toBeDefined()
  })

  it('shows no skip notice when every entry was readable', async () => {
    render(
      <Workbench
        platform={scriptedPort({
          dropped: [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right]
        })}
      />
    )

    dropPaths(screen.getByRole('main'), [
      DIRECTORY_SAMPLE_PATHS.left,
      DIRECTORY_SAMPLE_PATHS.right
    ])

    expect(
      await screen.findByRole('tab', { name: /baseline ↔ candidate/ }, { timeout: 4000 })
    ).toBeDefined()
    expect(screen.queryByText(/已跳过/)).toBeNull()
  })

  it('reports file-handle exhaustion as a readable notice and opens no session', async () => {
    const platform: PlatformPort = {
      ...scriptedPort({
        dropped: [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right]
      }),
      // The comparison hashes raw bytes through the digest seam; descriptor
      // exhaustion there is fatal, never a per-file skip.
      digestFiles: async () => {
        throw Object.assign(new Error('EMFILE: too many open files'), { code: 'EMFILE' })
      }
    }

    render(<Workbench platform={platform} />)
    dropPaths(screen.getByRole('main'), [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('文件句柄')
    expect(alert.textContent).toContain('EMFILE')
    expect(screen.queryByRole('tablist', { name: '会话' })).toBeNull()
  })

  it('keeps a single dropped path as the left baseline and asks for its counterpart', async () => {
    render(
      <Workbench platform={scriptedPort({ dropped: [LEFT_ENGINE], files: [RIGHT_ENGINE] })} />
    )

    dropPaths(screen.getByRole('main'), [LEFT_ENGINE])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(LEFT_ENGINE)
    expect(alert.textContent).toContain('左侧基准')
    expect(screen.queryByRole('tablist', { name: '会话' })).toBeNull()

    // The next pick only asks for the right side and keeps the dropped baseline.
    fireEvent.click(screen.getByRole('button', { name: '打开文件' }))
    expect(await screen.findByRole('tab', { name: /engine\.ts/ }, { timeout: 4000 })).toBeDefined()
    expect(screen.getByRole('contentinfo').textContent).toContain(
      `${LEFT_ENGINE} ↔ ${RIGHT_ENGINE}`
    )
  })

  it('rejects a drop of more than two paths without opening a session', async () => {
    render(
      <Workbench
        platform={scriptedPort({ dropped: [LEFT_ENGINE, RIGHT_ENGINE, LEFT_REPORT] })}
      />
    )

    dropPaths(screen.getByRole('main'), [LEFT_ENGINE, RIGHT_ENGINE, LEFT_REPORT])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('两个文件或两个文件夹')
    expect(screen.queryByRole('tablist', { name: '会话' })).toBeNull()
  })

  it('rejects a mixed file / folder drop and keeps the current session', async () => {
    render(
      <Workbench
        platform={scriptedPort({
          files: [LEFT_ENGINE, RIGHT_ENGINE],
          dropped: [DIRECTORY_SAMPLE_PATHS.left, LEFT_REPORT]
        })}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '打开文件' }))
    await screen.findByRole('tab', { name: /engine\.ts/ }, { timeout: 4000 })
    const before = screen.getByRole('contentinfo').textContent

    dropPaths(screen.getByRole('main'), [DIRECTORY_SAMPLE_PATHS.left, LEFT_REPORT])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('一个是文件、一个是文件夹')
    expect(screen.getByRole('contentinfo').textContent).toBe(before)
    expect(screen.getAllByRole('tab', { name: /engine\.ts/ })).toHaveLength(1)
  })

  it('reports an unsupported extension without opening a session', async () => {
    render(
      <Workbench
        platform={scriptedPort({
          files: [
            `${DIRECTORY_SAMPLE_PATHS.left}/assets/logo.png`,
            `${DIRECTORY_SAMPLE_PATHS.right}/assets/logo.png`
          ]
        })}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '打开文件' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('暂不支持对比 logo.png')
    expect(screen.queryByRole('tablist', { name: '会话' })).toBeNull()
  })
})

/** The reversed pair is a second directory session over the same roots. */
const REVERSED_DIRECTORY_ID = `directory:${DIRECTORY_SAMPLE_PATHS.right} ↔ ${DIRECTORY_SAMPLE_PATHS.left}`

describe('directory drilldown roundtrip', () => {
  async function loadDirectorySamples(): Promise<void> {
    await renderApp()
    loadDemoSamples()
    await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })
  }

  /** Both pane trees share the merged root's accessible name; index them. */
  function paneTree(side: 0 | 1): HTMLElement {
    return screen.getAllByRole('tree')[side]
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
    expect(
      await screen.findByText(`${DRILLDOWN_PREFIX}src/core/engine.ts`, {}, { timeout: 4000 })
    ).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: '返回上级目录视图' }))

    // The source directory tab kept its tree while the drilldown was open; its
    // kept filter/scroll restore as the view remounts.
    await waitFor(() => expect(screen.getAllByRole('tree')).toHaveLength(2))
    // Back on the source directory session: nothing was reset by the roundtrip.
    expect(screen.getByText(SAMPLE_DIRECTORY_ID)).toBeDefined()
    expect(screen.getByRole('tab', { name: '仅差异' }).getAttribute('aria-selected')).toBe('true')
    expect(within(paneTree(0)).queryAllByText('deploy.yaml')).toHaveLength(0)
    expect(within(paneTree(1)).queryAllByText('deploy.yaml')).toHaveLength(0)
    expect(
      within(paneTree(0)).getAllByText('engine.ts')[0].closest('[role="treeitem"]')
        ?.getAttribute('aria-selected')
    ).toBe('true')
    expect((paneTree(0).parentElement as HTMLElement).scrollTop).toBe(96)
  })

  it('repeats drilldown and return without drifting', async () => {
    await loadDirectorySamples()
    fireEvent.click(screen.getByRole('tab', { name: '仅差异' }))

    for (let round = 0; round < 3; round += 1) {
      fireEvent.doubleClick(within(paneTree(1)).getAllByText('engine.ts')[0])
      const back = await screen.findByRole(
        'button',
        { name: '返回上级目录视图' },
        { timeout: 4000 }
      )
      fireEvent.click(back)

      await waitFor(() => expect(screen.getAllByRole('tree')).toHaveLength(2))
      expect(screen.getByText(SAMPLE_DIRECTORY_ID)).toBeDefined()
      expect(screen.getByRole('tab', { name: '仅差异' }).getAttribute('aria-selected')).toBe('true')
      expect(within(paneTree(0)).queryAllByText('engine.ts')).toHaveLength(1)
    }
  })

  it('keeps same-path drilldowns of two directory sessions apart', async () => {
    render(
      <Workbench
        platform={scriptedPort({
          directories: [
            DIRECTORY_SAMPLE_PATHS.right,
            DIRECTORY_SAMPLE_PATHS.left,
            DIRECTORY_SAMPLE_PATHS.left,
            DIRECTORY_SAMPLE_PATHS.right
          ]
        })}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }))
    await screen.findByRole('tab', { name: /candidate ↔ baseline/ }, { timeout: 4000 })
    fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }))
    await screen.findByRole('tab', { name: /baseline ↔ candidate/ }, { timeout: 4000 })

    // Drill the same relative path out of the active (baseline → candidate) session.
    fireEvent.doubleClick(within(screen.getAllByRole('tree')[0]).getAllByText('engine.ts')[0])
    await screen.findByText(`${DRILLDOWN_PREFIX}src/core/engine.ts`, {}, { timeout: 4000 })

    // Drill the same relative path out of the first (candidate → baseline) session.
    const sessionTabs = screen.getByRole('tablist', { name: '会话' })
    fireEvent.click(within(sessionTabs).getByRole('tab', { name: /candidate ↔ baseline/ }))
    await waitFor(() => expect(screen.getAllByRole('tree')).toHaveLength(2))
    fireEvent.doubleClick(within(screen.getAllByRole('tree')[0]).getAllByText('engine.ts')[0])
    await screen.findByText(`file:${REVERSED_DIRECTORY_ID}::src/core/engine.ts`, {}, { timeout: 4000 })

    // Both same-path drilldowns exist; neither overwrote the other.
    expect(within(sessionTabs).getAllByRole('tab', { name: /engine\.ts/ })).toHaveLength(2)

    // The active drilldown returns to its own source session.
    fireEvent.click(screen.getByRole('button', { name: '返回上级目录视图' }))
    await waitFor(() => expect(screen.getAllByRole('tree')).toHaveLength(2))
    expect(screen.getByRole('contentinfo').textContent).toContain(REVERSED_DIRECTORY_ID)

    // The other drilldown still returns to the other source session.
    fireEvent.click(within(sessionTabs).getAllByRole('tab', { name: /engine\.ts/ })[0])
    fireEvent.click(screen.getByRole('button', { name: '返回上级目录视图' }))
    await waitFor(() => expect(screen.getAllByRole('tree')).toHaveLength(2))
    expect(screen.getByRole('contentinfo').textContent).toContain(SAMPLE_DIRECTORY_ID)
  })
})

describe('session tabs lifecycle', () => {
  const LEFT_YAML = `${DIRECTORY_SAMPLE_PATHS.left}/config/deploy.yaml`
  const RIGHT_YAML = `${DIRECTORY_SAMPLE_PATHS.right}/config/deploy.yaml`
  const ENGINE_SESSION_ID = `file:${LEFT_ENGINE} ↔ ${RIGHT_ENGINE}`
  const REPORT_SESSION_ID = `file:${LEFT_REPORT} ↔ ${RIGHT_REPORT}`
  const YAML_SESSION_ID = `file:${LEFT_YAML} ↔ ${RIGHT_YAML}`

  /** Opens one real pair per click of「打开文件」; the port answers in order. */
  async function openPairs(count: number): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: '打开文件' }))
      // The picker button is disabled while a pair is being read.
      await waitFor(() =>
        expect((screen.getByRole('button', { name: '打开文件' }) as HTMLButtonElement).disabled).toBe(
          false
        )
      )
    }
  }

  async function openCodeAndCsv(): Promise<void> {
    await openPairs(2)
    await screen.findByRole('tab', { name: /report\.csv/ }, { timeout: 4000 })
  }

  function sessionTabs(): HTMLElement {
    return screen.getByRole('tablist', { name: '会话' })
  }

  function tab(name: RegExp): HTMLElement {
    return within(sessionTabs()).getByRole('tab', { name })
  }

  function makeDirty(): void {
    fireEvent.click(screen.getByRole('button', { name: '覆写到右' }))
  }

  it('keeps unsaved edits and the dirty marker across a tab roundtrip', async () => {
    render(<Workbench platform={scriptedPort({ files: [LEFT_ENGINE, RIGHT_ENGINE, LEFT_REPORT, RIGHT_REPORT] })} />)
    await openCodeAndCsv()

    // Make the code session dirty, then leave it for the CSV session.
    fireEvent.click(tab(/engine\.ts/))
    makeDirty()
    expect(tab(/engine\.ts/).textContent).toContain('有未保存修改')
    expect(screen.getByText('已修改（未保存）')).toBeDefined()

    fireEvent.click(tab(/report\.csv/))
    expect(screen.queryByText('已修改（未保存）')).toBeNull()
    expect(screen.getByRole('contentinfo').textContent).toContain(REPORT_SESSION_ID)

    // Back on A: the working copy survived the unmount, not just the flag.
    fireEvent.click(tab(/engine\.ts/))
    expect(screen.getByRole('contentinfo').textContent).toContain(ENGINE_SESSION_ID)
    expect(screen.getByText('已修改（未保存）')).toBeDefined()
    expect(screen.getByText('未保存：右')).toBeDefined()
    expect(tab(/engine\.ts/).textContent).toContain('有未保存修改')

    // The dirty session now asks before closing.
    fireEvent.click(screen.getByRole('button', { name: '关闭 engine.ts' }))
    expect(screen.getByRole('dialog', { name: '关闭含未保存修改的会话？' })).toBeDefined()
  })

  it('closes a clean background session immediately without switching away', async () => {
    render(<Workbench platform={scriptedPort({ files: [LEFT_ENGINE, RIGHT_ENGINE, LEFT_REPORT, RIGHT_REPORT] })} />)
    await openCodeAndCsv()

    fireEvent.click(screen.getByRole('button', { name: '关闭 engine.ts' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(within(sessionTabs()).getAllByRole('tab')).toHaveLength(1)
    expect(screen.queryByRole('tab', { name: /engine\.ts/ })).toBeNull()
    // The active session and its content did not change.
    expect(tab(/report\.csv/).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('contentinfo').textContent).toContain(REPORT_SESSION_ID)
  })

  it('activates the neighbour of the closed active session and empties on the last one', async () => {
    render(
      <Workbench
        platform={scriptedPort({
          files: [
            LEFT_ENGINE,
            RIGHT_ENGINE,
            LEFT_REPORT,
            RIGHT_REPORT,
            LEFT_YAML,
            RIGHT_YAML,
            // Answers for the pair opened after the workbench was emptied.
            LEFT_REPORT,
            RIGHT_REPORT
          ]
        })}
      />
    )
    await openPairs(3)
    await screen.findByRole('tab', { name: /deploy\.yaml/ }, { timeout: 4000 })
    expect(within(sessionTabs()).getAllByRole('tab')).toHaveLength(3)

    // Close the middle one: the next tab (successor) takes over.
    fireEvent.click(tab(/report\.csv/))
    fireEvent.click(screen.getByRole('button', { name: '关闭 report.csv' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(tab(/deploy\.yaml/).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('contentinfo').textContent).toContain(YAML_SESSION_ID)

    // Closing the last tab falls back to the previous one.
    fireEvent.click(screen.getByRole('button', { name: '关闭 deploy.yaml' }))
    expect(tab(/engine\.ts/).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('contentinfo').textContent).toContain(ENGINE_SESSION_ID)

    // Closing the last session returns to the empty workbench, still usable.
    fireEvent.click(screen.getByRole('button', { name: '关闭 engine.ts' }))
    expect(screen.queryByRole('tablist', { name: '会话' })).toBeNull()
    expect(screen.getByRole('heading', { name: EMPTY_TITLE })).toBeDefined()
    expect(screen.getByRole('button', { name: '打开文件' })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: '打开文件' }))
    expect(
      await screen.findByRole('tab', { name: /report\.csv/ }, { timeout: 4000 })
    ).toBeDefined()
    expect(screen.getByRole('contentinfo').textContent).toContain(REPORT_SESSION_ID)
  })

  it('prompts before closing dirty work and keeps it on「继续编辑」', async () => {
    render(<Workbench platform={scriptedPort({ files: [LEFT_ENGINE, RIGHT_ENGINE] })} />)
    fireEvent.click(screen.getByRole('button', { name: '打开文件' }))
    await screen.findByRole('tab', { name: /engine\.ts/ }, { timeout: 4000 })
    makeDirty()

    fireEvent.click(screen.getByRole('button', { name: '关闭 engine.ts' }))

    const dialog = screen.getByRole('dialog', { name: '关闭含未保存修改的会话？' })
    expect(dialog.textContent).toContain('engine.ts')
    expect(dialog.textContent).toContain('未保存修改')
    // Nothing is removed while the prompt is open.
    expect(tab(/engine\.ts/)).toBeDefined()

    fireEvent.click(within(dialog).getByRole('button', { name: '继续编辑' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(tab(/engine\.ts/).textContent).toContain('有未保存修改')
    expect(screen.getByText('已修改（未保存）')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: '关闭 engine.ts' }))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: '放弃修改并关闭' })
    )

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('tablist', { name: '会话' })).toBeNull()
    expect(screen.getByRole('heading', { name: EMPTY_TITLE })).toBeDefined()
  })

  it('discards a dirty background session without switching away', async () => {
    render(<Workbench platform={scriptedPort({ files: [LEFT_ENGINE, RIGHT_ENGINE, LEFT_REPORT, RIGHT_REPORT] })} />)
    await openCodeAndCsv()

    fireEvent.click(tab(/engine\.ts/))
    makeDirty()
    fireEvent.click(tab(/report\.csv/))

    fireEvent.click(screen.getByRole('button', { name: '关闭 engine.ts' }))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: '放弃修改并关闭' })
    )

    expect(screen.queryByRole('tab', { name: /engine\.ts/ })).toBeNull()
    expect(tab(/report\.csv/).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('contentinfo').textContent).toContain(REPORT_SESSION_ID)
  })

  it('drops the dirty marker after a reset and closes without a prompt', async () => {
    render(<Workbench platform={scriptedPort({ files: [LEFT_ENGINE, RIGHT_ENGINE] })} />)
    fireEvent.click(screen.getByRole('button', { name: '打开文件' }))
    await screen.findByRole('tab', { name: /engine\.ts/ }, { timeout: 4000 })

    makeDirty()
    expect(tab(/engine\.ts/).textContent).toContain('有未保存修改')

    fireEvent.click(screen.getByRole('button', { name: '重置' }))
    expect(tab(/engine\.ts/).textContent).not.toContain('有未保存修改')

    fireEvent.click(screen.getByRole('button', { name: '关闭 engine.ts' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('tablist', { name: '会话' })).toBeNull()
  })

  it('merges samples into open sessions instead of replacing them', async () => {
    render(<Workbench platform={scriptedPort({ files: [LEFT_ENGINE, RIGHT_ENGINE] })} />)
    fireEvent.click(screen.getByRole('button', { name: '打开文件' }))
    await screen.findByRole('tab', { name: /engine\.ts/ }, { timeout: 4000 })

    loadDemoSamples()
    await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })

    const tabs = within(sessionTabs()).getAllByRole('tab')
    // The real session stays first, and the active one is not switched away.
    expect(tabs[0].textContent).toContain('engine.ts')
    expect(screen.getByRole('contentinfo').textContent).toContain(ENGINE_SESSION_ID)
    expect(tabs.filter((item) => item.textContent?.includes('baseline ↔ candidate'))).toHaveLength(1)

    // Loading the same library again upserts by id: no duplicate sample tabs.
    loadDemoSamples()
    await screen.findByRole('heading', { name: '正在载入样本…' })
    await waitFor(() => expect(screen.queryByRole('heading', { name: '正在载入样本…' })).toBeNull())
    expect(
      within(sessionTabs())
        .getAllByRole('tab')
        .filter((item) => item.textContent?.includes('baseline ↔ candidate'))
    ).toHaveLength(1)

    // A failed auxiliary load keeps the sessions on screen and reports it.
    fireEvent.click(screen.getByRole('button', { name: '演示样本' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /演示：样本读取失败/ }))

    const alert = await screen.findByRole('alert', {}, { timeout: 4000 })
    expect(alert.textContent).toContain('无法读取内置样本库')
    expect(screen.getByRole('contentinfo').textContent).toContain(ENGINE_SESSION_ID)
    expect(within(sessionTabs()).getAllByRole('tab').length).toBeGreaterThan(1)
  })

  it('keeps a drilldown alive after its source directory session closes', async () => {
    render(
      <Workbench
        platform={scriptedPort({
          directories: [
            DIRECTORY_SAMPLE_PATHS.left,
            DIRECTORY_SAMPLE_PATHS.incoming,
            DIRECTORY_SAMPLE_PATHS.left,
            DIRECTORY_SAMPLE_PATHS.right
          ]
        })}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }))
    await screen.findByRole('tab', { name: /baseline ↔ incoming/ }, { timeout: 4000 })
    fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }))
    await screen.findByRole('tab', { name: /baseline ↔ candidate/ }, { timeout: 4000 })

    // Drill out of the active session, then close that source session.
    fireEvent.doubleClick(within(screen.getAllByRole('tree')[0]).getAllByText('engine.ts')[0])
    await screen.findByRole('button', { name: '返回上级目录视图' }, { timeout: 4000 })
    fireEvent.click(screen.getByRole('button', { name: '关闭 baseline ↔ candidate' }))

    // The file session still renders and returning falls back to the other tree.
    expect(screen.getByRole('button', { name: '返回上级目录视图' })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '返回上级目录视图' }))
    expect(screen.getByRole('contentinfo').textContent).toContain('directory:')
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

  function openDialog(): HTMLElement {
    fireEvent.click(screen.getAllByRole('button', { name: '新建对比' })[0])
    return dialog()
  }

  function fillPaths(left: string, right: string): void {
    const panel = dialog()
    fireEvent.change(within(panel).getByLabelText('左侧路径'), { target: { value: left } })
    fireEvent.change(within(panel).getByLabelText('右侧路径'), { target: { value: right } })
  }

  function submitDialog(): void {
    fireEvent.click(within(dialog()).getByRole('button', { name: '建立对比' }))
  }

  function sessionTabs(): HTMLElement {
    return screen.getByRole('tablist', { name: '会话' })
  }

  /** Writes one in-memory file per path so the manual entry can probe it. */
  async function writeFiles(
    platform: PlatformPort,
    files: readonly (readonly [string, string])[]
  ): Promise<void> {
    for (const [path, text] of files) await platform.writeTextFile(path, text)
  }

  it('keeps「新建对比」in the toolbar in the empty state and with sessions', async () => {
    render(<Workbench platform={scriptedPort({ files: [LEFT_ENGINE, RIGHT_ENGINE] })} />)

    expect(screen.getAllByRole('button', { name: '新建对比' }).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: '打开文件' }))
    await screen.findByRole('tab', { name: /engine\.ts/ }, { timeout: 4000 })

    const buttons = screen.getAllByRole('button', { name: '新建对比' })
    expect(buttons).toHaveLength(1)
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(false)
  })

  it('offers two path inputs and both picker actions inside the dialog', async () => {
    const base = createWebPlatformPort()
    const files = [LEFT_ENGINE, RIGHT_ENGINE]
    const selectFile = vi.fn(async () => files.shift() ?? null)
    render(<Workbench platform={{ ...base, selectFile }} />)

    const panel = openDialog()
    expect(within(panel).getByLabelText('左侧路径')).toBeDefined()
    expect(within(panel).getByLabelText('右侧路径')).toBeDefined()

    fireEvent.click(within(panel).getByRole('button', { name: '打开文件' }))

    expect(await screen.findByText(/本地文件 · 双栏字符级 Diff/)).toBeDefined()
    expect(selectFile).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('dialog', { name: '新建对比' })).toBeNull()
    expect(screen.getByRole('contentinfo').textContent).toContain(
      `${LEFT_ENGINE} ↔ ${RIGHT_ENGINE}`
    )
  })

  it('opens a directory pair from the dialog picker', async () => {
    const base = createWebPlatformPort()
    const directories = [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right]
    const selectDirectory = vi.fn(async () => directories.shift() ?? null)
    render(<Workbench platform={{ ...base, selectDirectory }} />)

    fireEvent.click(within(openDialog()).getByRole('button', { name: '打开文件夹' }))

    expect(
      await screen.findByRole('tab', { name: /baseline ↔ candidate/ }, { timeout: 4000 })
    ).toBeDefined()
    expect(selectDirectory).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('tablist', { name: '差异过滤' })).toBeDefined()
  })

  it('opens with Cmd/Ctrl+N, ignores repeats and closes on Escape without touching sessions', async () => {
    render(<Workbench platform={scriptedPort({ files: [LEFT_ENGINE, RIGHT_ENGINE] })} />)
    fireEvent.click(screen.getByRole('button', { name: '打开文件' }))
    await screen.findByRole('tab', { name: /engine\.ts/ }, { timeout: 4000 })
    const before = screen.getByRole('contentinfo').textContent

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
    expect(within(sessionTabs()).getAllByRole('tab')).toHaveLength(1)
    expect(screen.getByRole('contentinfo').textContent).toBe(before)
  })

  it('submits once on Enter and disables the button while the session is built', async () => {
    const base = createWebPlatformPort()
    await writeFiles(base, [
      [LEFT_SPACED, 'left\n'],
      [RIGHT_SPACED, 'right\n']
    ])
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const reads: string[] = []
    const port: PlatformPort = {
      ...base,
      readTextFile: async (path) => {
        reads.push(path)
        await gate
        return base.readTextFile(path)
      }
    }
    render(<Workbench platform={port} />)

    const panel = openDialog()
    fillPaths(LEFT_SPACED, RIGHT_SPACED)
    const submit = within(panel).getByRole('button', { name: '建立对比' }) as HTMLButtonElement

    fireEvent.keyDown(within(panel).getByLabelText('左侧路径'), { key: 'Enter' })
    await waitFor(() => expect(submit.disabled).toBe(true))

    // Repeats while the build is in flight must not start a second request.
    fireEvent.keyDown(within(panel).getByLabelText('左侧路径'), { key: 'Enter' })
    fireEvent.keyDown(within(panel).getByLabelText('右侧路径'), { key: 'Enter' })
    release()

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '新建对比' })).toBeNull())
    expect(reads).toEqual([LEFT_SPACED, RIGHT_SPACED])
    expect(within(sessionTabs()).getAllByRole('tab')).toHaveLength(1)
  })

  it('builds a code session from typed real file paths', async () => {
    const base = createWebPlatformPort()
    await writeFiles(base, [
      [LEFT_SPACED, '左\n'],
      [RIGHT_SPACED, '右\n']
    ])
    render(<Workbench platform={base} />)

    openDialog()
    fillPaths(LEFT_SPACED, RIGHT_SPACED)
    submitDialog()

    const tab = await screen.findByRole('tab', { name: /左 a\.txt/ }, { timeout: 4000 })
    expect(tab.getAttribute('aria-selected')).toBe('true')
    expect(tab.textContent).toContain(`${LEFT_SPACED} ↔ ${RIGHT_SPACED}`)
    expect(screen.getByText(/本地文件 · 双栏字符级 Diff/)).toBeDefined()
  })

  it('builds a directory session from typed real directory paths', async () => {
    render(<Workbench platform={createWebPlatformPort()} />)

    openDialog()
    fillPaths(DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right)
    submitDialog()

    expect(
      await screen.findByRole('tab', { name: /baseline ↔ candidate/ }, { timeout: 4000 })
    ).toBeDefined()
    expect(screen.getByRole('tablist', { name: '差异过滤' })).toBeDefined()
    expect(screen.getAllByText('engine.ts').length).toBeGreaterThan(0)
  })

  it('strips paired quotes and surrounding whitespace before probing', async () => {
    const base = createWebPlatformPort()
    await writeFiles(base, [
      [LEFT_SPACED, 'left\n'],
      [RIGHT_SPACED, 'right\n']
    ])
    const stats: string[] = []
    const reads: string[] = []
    const port: PlatformPort = {
      ...base,
      statPath: async (path) => {
        stats.push(path)
        return base.statPath(path)
      },
      readTextFile: async (path) => {
        reads.push(path)
        return base.readTextFile(path)
      }
    }
    render(<Workbench platform={port} />)

    openDialog()
    fillPaths(`"  ${LEFT_SPACED}  "`, `“  ${RIGHT_SPACED}  ”`)
    submitDialog()

    const tab = await screen.findByRole('tab', { name: /左 a\.txt/ }, { timeout: 4000 })
    expect(tab.textContent).toContain(`${LEFT_SPACED} ↔ ${RIGHT_SPACED}`)
    expect(tab.textContent).not.toContain('"')
    expect(tab.textContent).not.toContain('“')
    expect(stats).toEqual([LEFT_SPACED, RIGHT_SPACED])
    expect(reads).toEqual([LEFT_SPACED, RIGHT_SPACED])
  })

  it('expands ~ and resolves relative paths against the platform base', async () => {
    const base = createWebPlatformPort()
    await writeFiles(base, [
      ['/Users/demo/项目/a.txt', 'home\n'],
      ['/memory/a.txt', 'relative\n']
    ])
    const stats: string[] = []
    const port: PlatformPort = {
      ...base,
      homeDirectory: async () => '/Users/demo',
      workingDirectory: async () => '/memory',
      statPath: async (path) => {
        stats.push(path)
        return base.statPath(path)
      }
    }
    render(<Workbench platform={port} />)

    openDialog()
    fillPaths('~/项目/a.txt', 'a.txt')
    submitDialog()

    const tab = await screen.findByRole('tab', { name: /a\.txt/ }, { timeout: 4000 })
    expect(tab.textContent).toContain('/Users/demo/项目/a.txt ↔ /memory/a.txt')
    expect(stats).toEqual(['/Users/demo/项目/a.txt', '/memory/a.txt'])
  })

  it('never opens a native picker or save dialog for a typed pair', async () => {
    const base = createWebPlatformPort()
    await writeFiles(base, [
      [LEFT_SPACED, 'left\n'],
      [RIGHT_SPACED, 'right\n']
    ])
    const selectFile = vi.fn(async () => null)
    const selectDirectory = vi.fn(async () => null)
    const saveFile = vi.fn(async () => null)
    render(
      <Workbench platform={{ ...base, selectFile, selectDirectory, saveFile }} />
    )

    openDialog()
    fillPaths(LEFT_SPACED, RIGHT_SPACED)
    submitDialog()

    await screen.findByRole('tab', { name: /左 a\.txt/ }, { timeout: 4000 })
    expect(selectFile).not.toHaveBeenCalled()
    expect(selectDirectory).not.toHaveBeenCalled()
    expect(saveFile).not.toHaveBeenCalled()
  })

  it('adds one tab and keeps the existing session in place', async () => {
    const base = createWebPlatformPort()
    await writeFiles(base, [
      ['/memory/x.txt', 'x\n'],
      ['/memory/y.txt', 'y\n']
    ])
    const files = [LEFT_ENGINE, RIGHT_ENGINE]
    render(<Workbench platform={{ ...base, selectFile: async () => files.shift() ?? null }} />)

    fireEvent.click(screen.getByRole('button', { name: '打开文件' }))
    await screen.findByRole('tab', { name: /engine\.ts/ }, { timeout: 4000 })
    const firstTab = within(sessionTabs()).getAllByRole('tab')[0]
    const firstText = firstTab.textContent

    openDialog()
    fillPaths('/memory/x.txt', '/memory/y.txt')
    submitDialog()

    const added = await screen.findByRole('tab', { name: /x\.txt/ }, { timeout: 4000 })
    const tabs = within(sessionTabs()).getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[0].textContent).toBe(firstText)
    expect(added.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('contentinfo').textContent).toContain('/memory/x.txt ↔ /memory/y.txt')
  })

  it('re-submitting the same pair keeps a single tab', async () => {
    const base = createWebPlatformPort()
    await writeFiles(base, [
      [LEFT_SPACED, 'left\n'],
      [RIGHT_SPACED, 'right\n']
    ])
    render(<Workbench platform={base} />)

    openDialog()
    fillPaths(LEFT_SPACED, RIGHT_SPACED)
    submitDialog()
    await screen.findByRole('tab', { name: /左 a\.txt/ }, { timeout: 4000 })
    const firstStatus = screen.getByRole('contentinfo').textContent

    openDialog()
    fillPaths(LEFT_SPACED, RIGHT_SPACED)
    submitDialog()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '新建对比' })).toBeNull())

    expect(within(sessionTabs()).getAllByRole('tab')).toHaveLength(1)
    expect(screen.getByRole('contentinfo').textContent).toBe(firstStatus)
  })

  it('names the missing right path and opens no tab', async () => {
    const base = createWebPlatformPort()
    await writeFiles(base, [['/memory/left.txt', 'left\n']])
    const listDirectories = vi.fn(base.listDirectories)
    render(<Workbench platform={{ ...base, listDirectories }} />)

    openDialog()
    fillPaths('/memory/left.txt', '/memory/right-missing.txt')
    submitDialog()

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
    render(<Workbench platform={{ ...base, statPath }} />)

    openDialog()
    fillPaths('/memory/left.txt', '')
    submitDialog()

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
    render(<Workbench platform={base} />)

    openDialog()
    fillPaths('/memory/a.txt', '/memory/folder')
    submitDialog()

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
      ['/memory/b.bin', 'b']
    ])
    render(<Workbench platform={base} />)

    openDialog()
    fillPaths('/memory/a.bin', '/memory/b.bin')
    submitDialog()

    const alert = await within(dialog()).findByRole('alert')
    expect(alert.textContent).toContain('不支持')
    expect(alert.textContent).toContain('代码/文本')
    expect(alert.textContent).toContain('CSV/TSV')
    expect(alert.textContent).toContain('JSON/YAML')
    expect(screen.queryByRole('tablist', { name: '会话' })).toBeNull()
  })

  it('rejects a mixed file family without creating a blank tab', async () => {
    const base = createWebPlatformPort()
    await writeFiles(base, [
      ['/memory/a.json', '{}\n'],
      ['/memory/b.yaml', 'a: 1\n']
    ])
    render(<Workbench platform={base} />)

    openDialog()
    fillPaths('/memory/a.json', '/memory/b.yaml')
    submitDialog()

    const alert = await within(dialog()).findByRole('alert')
    expect(alert.textContent).toContain('两侧文件类型不一致')
    expect(screen.queryByRole('tablist', { name: '会话' })).toBeNull()
  })

  it('keeps the active session and status bar unchanged when a submit fails', async () => {
    render(<Workbench platform={scriptedPort({ files: [LEFT_ENGINE, RIGHT_ENGINE] })} />)
    fireEvent.click(screen.getByRole('button', { name: '打开文件' }))
    await screen.findByRole('tab', { name: /engine\.ts/ }, { timeout: 4000 })
    const before = screen.getByRole('contentinfo').textContent

    openDialog()
    fillPaths(LEFT_ENGINE, '/memory/does-not-exist.txt')
    submitDialog()

    await within(dialog()).findByRole('alert')
    expect(within(sessionTabs()).getAllByRole('tab')).toHaveLength(1)
    // The dialog's own footer is a second landmark while it stays open.
    expect(screen.getAllByRole('contentinfo').at(-1)?.textContent).toBe(before)
    expect(screen.getByText(/本地文件 · 双栏字符级 Diff/)).toBeDefined()
  })

  it('keeps unsaved working copies across manual sessions', async () => {
    const base = createWebPlatformPort()
    await writeFiles(base, [
      ['/memory/l1.txt', 'a\nb\n'],
      ['/memory/r1.txt', 'a\nc\n'],
      ['/memory/l2.txt', 'x\n'],
      ['/memory/r2.txt', 'y\n']
    ])
    render(<Workbench platform={base} />)

    openDialog()
    fillPaths('/memory/l1.txt', '/memory/r1.txt')
    submitDialog()
    await screen.findByRole('tab', { name: /l1\.txt/ }, { timeout: 4000 })

    openDialog()
    fillPaths('/memory/l2.txt', '/memory/r2.txt')
    submitDialog()
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
    const base = createWebPlatformPort()
    await writeFiles(base, [
      ['/memory/dialog-scan/left/a.txt', 'x'],
      ['/memory/dialog-scan/right/a.txt', 'y']
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
      }
    }
    render(<Workbench platform={port} />)

    openDialog()
    fillPaths('/memory/dialog-scan/left', '/memory/dialog-scan/right')
    submitDialog()

    const bar = await screen.findByRole('status', { name: '目录对比进度' })
    expect(screen.queryByRole('dialog', { name: '新建对比' })).toBeNull()
    expect(document.querySelectorAll('[aria-modal="true"]')).toHaveLength(0)
    expect(bar.textContent).toContain('正在扫描目录')
    expect(bar.textContent).toMatch(/已扫描 \d+ 个文件/)
    expect(bar.closest('[aria-modal="true"]')).toBeNull()
    expect(
      (within(bar).getByRole('button', { name: '取消' }) as HTMLButtonElement).disabled
    ).toBe(false)

    releaseScan()
    expect(
      await screen.findByRole('tab', { name: /left ↔ right/ }, { timeout: 4000 })
    ).toBeDefined()
    expect(screen.queryByRole('status', { name: '目录对比进度' })).toBeNull()
  })

  it('closes the dialog before a picker-started directory pair starts scanning', async () => {
    const base = createWebPlatformPort()
    await writeFiles(base, [
      ['/memory/dialog-pick/left/a.txt', 'x'],
      ['/memory/dialog-pick/right/a.txt', 'y']
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
      }
    }
    render(<Workbench platform={port} />)

    fireEvent.click(within(openDialog()).getByRole('button', { name: '打开文件夹' }))

    const bar = await screen.findByRole('status', { name: '目录对比进度' })
    expect(screen.queryByRole('dialog', { name: '新建对比' })).toBeNull()
    expect(document.querySelectorAll('[aria-modal="true"]')).toHaveLength(0)
    expect(within(bar).getByRole('button', { name: '取消' })).toBeDefined()
    expect(
      (within(bar).getByRole('button', { name: '取消' }) as HTMLButtonElement).disabled
    ).toBe(false)

    releaseScan()
    expect(
      await screen.findByRole('tab', { name: /left ↔ right/ }, { timeout: 4000 })
    ).toBeDefined()
  })

  it('keeps the dialog open when the folder picker is cancelled', async () => {
    const base = createWebPlatformPort()
    const answers: (string | null)[] = [null, '/memory/dialog-pick-cancel/left', null]
    const listDirectories = vi.fn(base.listDirectories)
    render(
      <Workbench
        platform={{
          ...base,
          selectDirectory: async () => answers.shift() ?? null,
          listDirectories
        }}
      />
    )

    const panel = openDialog()

    // Cancelling the very first picker leaves the dialog waiting for a pair.
    fireEvent.click(within(panel).getByRole('button', { name: '打开文件夹' }))
    await waitFor(() =>
      expect(
        (within(dialog()).getByRole('button', { name: '建立对比' }) as HTMLButtonElement).disabled
      ).toBe(false)
    )
    expect(dialog()).toBeDefined()
    expect(screen.queryByRole('tablist', { name: '会话' })).toBeNull()

    // Cancelling the right side is the same story.
    fireEvent.click(within(dialog()).getByRole('button', { name: '打开文件夹' }))
    await waitFor(() =>
      expect(
        (within(dialog()).getByRole('button', { name: '建立对比' }) as HTMLButtonElement).disabled
      ).toBe(false)
    )
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
        }
      }
    }
  }

  async function seedPair(platform: PlatformPort): Promise<void> {
    await platform.writeTextFile(LEFT, 'alpha\n')
    await platform.writeTextFile(RIGHT, 'beta\n')
  }

  async function mountReady(port: InjectionPort): Promise<void> {
    render(<Workbench platform={port.platform} />)
    await waitFor(() => expect(port.calls).toContain('ready'))
  }

  function tabCount(): number {
    const list = screen.queryByRole('tablist', { name: '会话' })
    return list ? within(list).getAllByRole('tab').length : 0
  }

  function activeSession(): string {
    return screen.getByRole('contentinfo').textContent ?? ''
  }

  function activeScene(): string | null {
    const views = screen.getByRole('tablist', { name: '视图切换' })
    return (
      within(views)
        .getAllByRole('tab')
        .find((tab) => tab.getAttribute('aria-selected') === 'true')?.textContent ?? null
    )
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

    await waitFor(() => expect(tabCount()).toBe(1))
    expect(activeScene()).toBe('代码 Diff & 3-Way')
    expect(activeSession()).toContain(`file:${LEFT} ↔ ${RIGHT}`)
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
        request: { kind: 'directory', left: '/memory/left-dir', right: '/memory/right-dir' }
      })
    )

    await waitFor(() => expect(tabCount()).toBe(1))
    expect(activeScene()).toBe('目录对比')
    expect(activeSession()).toContain('directory:/memory/left-dir ↔ /memory/right-dir')
  })

  it('builds the very same session the manual entry builds for the pair', async () => {
    const base = createWebPlatformPort()
    await seedPair(base)
    const port = injectionPort(base)
    await mountReady(port)

    act(() => port.emit({ ok: true, request: FILE_REQUEST }))
    await waitFor(() => expect(tabCount()).toBe(1))
    const injected = activeSession()

    fireEvent.click(screen.getByRole('button', { name: '关闭 左 a.txt ↔ 右 b.txt' }))
    expect(tabCount()).toBe(0)

    fireEvent.keyDown(document, { key: 'n', metaKey: true })
    const panel = screen.getByRole('dialog', { name: '新建对比' })
    fireEvent.change(within(panel).getByLabelText('左侧路径'), { target: { value: LEFT } })
    fireEvent.change(within(panel).getByLabelText('右侧路径'), { target: { value: RIGHT } })
    fireEvent.click(within(panel).getByRole('button', { name: '建立对比' }))

    await waitFor(() => expect(tabCount()).toBe(1))
    expect(activeSession()).toBe(injected)
  })

  it('reports a rejected request without touching the open sessions', async () => {
    const base = createWebPlatformPort()
    await seedPair(base)
    const port = injectionPort(base)
    await mountReady(port)

    act(() => port.emit({ ok: true, request: FILE_REQUEST }))
    await waitFor(() => expect(tabCount()).toBe(1))
    const before = activeSession()

    act(() => port.emit({ ok: false, message: '右侧路径不存在：/nope' }))

    expect(screen.getByRole('alert').textContent).toContain('右侧路径不存在：/nope')
    expect(tabCount()).toBe(1)
    expect(activeSession()).toBe(before)
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
    await waitFor(() => expect(tabCount()).toBe(1))
    expect(tabCount()).toBe(1)
    expect(port.listenerCount()).toBe(1)
  })

  it('releases the subscription on unmount', async () => {
    const base = createWebPlatformPort()
    await seedPair(base)
    const port = injectionPort(base)
    const view = render(<Workbench platform={port.platform} />)
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

    render(<Workbench platform={port.platform} />)

    await waitFor(() => expect(tabCount()).toBe(1))
    expect(port.calls).toEqual(['subscribe', 'ready'])
  })
})

describe('directory progress and cancel UI', () => {
  /** Writes in-memory files, creating their directories on the web port. */
  async function writeMemoryFiles(
    platform: PlatformPort,
    files: readonly (readonly [string, string])[]
  ): Promise<void> {
    for (const [path, text] of files) await platform.writeTextFile(path, text)
  }

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
    GiB: 1024 ** 3
  }

  function processedBytes(text: string | null): number {
    const match = /已处理 (\d+(?:\.\d+)?) (B|KiB|MiB|GiB)/.exec(text ?? '')
    if (match === null) throw new Error(`no processed bytes in: ${text}`)
    return Number(match[1]) * BYTE_SCALE[match[2]]
  }

  it('shows real scan and digest progress, then clears it once the comparison succeeds', async () => {
    const base = createWebPlatformPort()
    await writeMemoryFiles(base, [
      ['/memory/live/left/a.txt', 'x'],
      ['/memory/live/left/b.txt', 'x'],
      ['/memory/live/right/a.txt', 'x'],
      ['/memory/live/right/b.txt', 'x']
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
      }
    }

    render(<Workbench platform={port} />)
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
    expect(
      await screen.findByRole('tab', { name: /left ↔ right/ }, { timeout: 4000 })
    ).toBeDefined()
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
    await writeMemoryFiles(base, files)

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
      }
    }

    render(<Workbench platform={port} />)
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
    expect(
      await screen.findByRole('tab', { name: /left ↔ right/ }, { timeout: 4000 })
    ).toBeDefined()
  })

  it('cancels during the scan phase without touching sessions or the view', async () => {
    const base = createWebPlatformPort()
    await writeMemoryFiles(base, [
      ['/memory/scan-cancel/left/a.txt', 'x'],
      ['/memory/scan-cancel/right/a.txt', 'x']
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
      }
    }

    render(<Workbench platform={port} />)
    const statusBefore = screen.getByRole('contentinfo').textContent
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
    expect(screen.getByRole('contentinfo').textContent).toBe(statusBefore)
    expect(screen.getByRole('main').innerHTML).toBe(viewBefore)

    releaseScan()
  })

  it('cancels a running comparison and leaves sessions, view and status bar untouched', async () => {
    const base = createWebPlatformPort()
    await writeMemoryFiles(base, [
      ['/memory/cancel/left/a.txt', 'x'],
      ['/memory/cancel/left/b.txt', 'x'],
      ['/memory/cancel/right/a.txt', 'x'],
      ['/memory/cancel/right/b.txt', 'x']
    ])

    const answers = [
      '/memory/cancel/left',
      '/memory/cancel/right',
      '/memory/cancel/left',
      '/memory/cancel/right'
    ]
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
      }
    }

    render(<Workbench platform={port} />)
    fireEvent.click(screen.getByRole('button', { name: '加载演示样本' }))
    await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })
    fireEvent.click(screen.getByRole('tab', { name: /baseline ↔ candidate/ }))

    const tabsBefore = within(screen.getByRole('tablist', { name: '会话' }))
      .getAllByRole('tab')
      .map((tab) => tab.textContent)
    const statusBefore = screen.getByRole('contentinfo').textContent
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
    expect(screen.getByRole('contentinfo').textContent).toBe(statusBefore)
    expect(screen.getByRole('main').innerHTML).toBe(viewBefore)
    const newCompare = screen.getAllByRole('button', { name: '新建对比' })[0] as HTMLButtonElement
    expect(newCompare.disabled).toBe(false)

    // The same pair can be started again right away and now completes.
    released = true
    releaseDigest()
    fireEvent.click(screen.getByRole('button', { name: '打开文件夹' }))

    expect(
      await screen.findByRole('tab', { name: /left ↔ right/ }, { timeout: 4000 })
    ).toBeDefined()
    await waitFor(() => expect(progressBar()).toBeNull())
    expect(
      screen.getByText('/memory/cancel/left ↔ /memory/cancel/right')
    ).toBeDefined()
  })

  /**
   * Cancelling a comparison started from 「新建对比」 has to work while the
   * dialog is already gone: no modal overlay, the same operation id on both
   * seams, and the workbench exactly as it was before.
   */
  it('cancels a dialog-started comparison with no modal overlay left behind', async () => {
    const base = createWebPlatformPort()
    await writeMemoryFiles(base, [
      ['/memory/dialog-cancel/left/a.txt', 'x'],
      ['/memory/dialog-cancel/left/b.txt', 'x'],
      ['/memory/dialog-cancel/right/a.txt', 'x'],
      ['/memory/dialog-cancel/right/b.txt', 'x']
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
      }
    }

    render(<Workbench platform={port} />)
    fireEvent.click(screen.getByRole('button', { name: '加载演示样本' }))
    await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })
    fireEvent.click(screen.getByRole('tab', { name: /baseline ↔ candidate/ }))

    const tabsBefore = within(screen.getByRole('tablist', { name: '会话' }))
      .getAllByRole('tab')
      .map((tab) => tab.textContent)
    const statusBefore = screen.getByRole('contentinfo').textContent
    const viewBefore = screen.getByRole('main').innerHTML

    fireEvent.click(screen.getAllByRole('button', { name: '新建对比' })[0])
    const panel = screen.getByRole('dialog', { name: '新建对比' })
    fireEvent.change(within(panel).getByLabelText('左侧路径'), {
      target: { value: '/memory/dialog-cancel/left' }
    })
    fireEvent.change(within(panel).getByLabelText('右侧路径'), {
      target: { value: '/memory/dialog-cancel/right' }
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
    expect(screen.getByRole('contentinfo').textContent).toBe(statusBefore)
    expect(screen.getByRole('main').innerHTML).toBe(viewBefore)

    releaseDigest()
  })

  it('renders no progress bar while nothing is comparing', async () => {
    render(<Workbench platform={scriptedPort({ files: [LEFT_ENGINE, RIGHT_ENGINE] })} />)

    // Idle empty workbench.
    expect(progressBar()).toBeNull()

    // A file pair is not a directory comparison.
    fireEvent.click(screen.getByRole('button', { name: '打开文件' }))
    await screen.findByRole('tab', { name: /engine\.ts/ }, { timeout: 4000 })
    expect(progressBar()).toBeNull()

    // Load the demo directory, then run sync / template flows.
    fireEvent.click(screen.getByRole('button', { name: '加载演示样本' }))
    await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })
    fireEvent.click(screen.getByRole('tab', { name: /baseline ↔ candidate/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: '预览并同步' })).toBeDefined())
    expect(progressBar()).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '预览并同步' }))
    const syncDialog = await screen.findByRole('dialog', { name: /同步预览/ })
    expect(progressBar()).toBeNull()
    fireEvent.click(within(syncDialog).getByRole('button', { name: '取消' }))
    expect(progressBar()).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '模板归位' }))
    const templateDialog = await screen.findByRole('dialog', { name: '模板归位映射预览' })
    expect(progressBar()).toBeNull()
    fireEvent.click(within(templateDialog).getByRole('button', { name: '确认提取归位' }))
    await screen.findByText(/模板归位完成/)
    expect(progressBar()).toBeNull()
  })
})
