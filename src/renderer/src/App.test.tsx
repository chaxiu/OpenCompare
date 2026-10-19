// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CSV_SCENE, DIRECTORY_SAMPLE_PATHS } from '@shared/fixtures'
import type { PlatformPort } from '@shared/platform/types'
import { compareDirectories, createComparisonCache } from '@core/directory/compare'
import { App } from './App'
import { createWebPlatformPort } from './platform/web-platform'
import { Workbench } from './workbench/Workbench'

afterEach(cleanup)

const EMPTY_TITLE = '打开真实文件或文件夹开始对比'
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

/** Dispatches a file drop whose handles resolve to `paths`. */
function dropPaths(element: HTMLElement, paths: readonly string[]): boolean {
  const files = paths.map((path) => new File([''], path.slice(path.lastIndexOf('/') + 1)))
  return fireEvent.drop(element, { dataTransfer: { files, types: ['Files'] } })
}

describe('workbench shell', () => {
  it('mounts the empty workbench on the in-memory PlatformPort', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'OpenCompare' })).toBeDefined()
    expect(screen.getByText('web')).toBeDefined()
    expect(screen.getByRole('heading', { name: EMPTY_TITLE })).toBeDefined()
    expect(screen.getByRole('tablist', { name: '视图切换' })).toBeDefined()
    expect(screen.getByRole('button', { name: '打开文件' })).toBeDefined()
    expect(screen.getByRole('button', { name: '打开文件夹' })).toBeDefined()
  })

  it('shows the loading state, then every sample session', async () => {
    render(<App />)

    loadDemoSamples()
    expect(screen.getByRole('heading', { name: '正在载入样本…' })).toBeDefined()

    expect(await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })).toBeDefined()
    expect(screen.getByText(SAMPLE_DIRECTORY_ID)).toBeDefined()
    expect(screen.getAllByRole('tab', { name: /CSV 主键对比/ }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('tab', { name: /JSON \/ YAML/ }).length).toBeGreaterThan(0)
  })

  it('switches the work area and the status bar with the active session', async () => {
    render(<App />)

    loadDemoSamples()
    const codeTab = await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })

    fireEvent.click(codeTab)

    expect(screen.getByText('session-code')).toBeDefined()
    expect(screen.getByRole('tab', { name: '三向合并 base · ours · theirs' })).toBeDefined()
    // three-way merge renders three panes, i.e. two draggable dividers
    expect(screen.getAllByRole('separator', { name: '调整分栏宽度' }).length).toBe(2)
  })

  it('shows the key-aligned CSV reconciliation with runtime counts', async () => {
    render(<App />)

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
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '演示样本' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /演示：样本读取失败/ }))

    expect(
      await screen.findByRole('heading', { name: '样本库读取失败' }, { timeout: 4000 })
    ).toBeDefined()
    expect(screen.getByRole('button', { name: '重试' })).toBeDefined()
  })

  it('filters the directory comparison and drills a file into its file view', async () => {
    render(<App />)

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
    render(<App />)

    loadDemoSamples()
    await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })

    fireEvent.doubleClick(screen.getAllByText('report.csv')[0])
    expect(await screen.findByText(`${DRILLDOWN_PREFIX}src/data/report.csv`, {}, { timeout: 4000 })).toBeDefined()
    // No declared primary key on a drilldown: the first shared column wins.
    expect(await screen.findByText('对齐 4 行 · 主键 order_id')).toBeDefined()
    expect(screen.getByRole('contentinfo').textContent).toContain('2相同1新增0删除1修改')

    const sessionTabs = screen.getByRole('tablist', { name: '会话' })
    fireEvent.click(within(sessionTabs).getByRole('tab', { name: /baseline ↔ candidate/ }))

    fireEvent.doubleClick(screen.getAllByText('deploy.yaml')[0])
    expect(await screen.findByText(`${DRILLDOWN_PREFIX}config/deploy.yaml`, {}, { timeout: 4000 })).toBeDefined()
    expect(screen.getByText(/YAML 原文/)).toBeDefined()
  })

  it('explains why a non-text file cannot be drilled into', async () => {
    render(<App />)

    loadDemoSamples()
    await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })

    fireEvent.doubleClick(screen.getAllByText('logo.png')[0])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('暂不支持')
    // the directory session stays put instead of silently doing nothing
    expect(screen.getByText(SAMPLE_DIRECTORY_ID)).toBeDefined()
  })

  it('degrades the native directory picker on the web runtime', async () => {
    render(<App />)

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
    render(<App />)

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
    render(<App />)

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
    render(<App />)

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
    render(<App />)
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
    fireEvent.doubleClick(within(screen.getAllByRole('tree')[0]).getAllByText('engine.ts')[0])
    await screen.findByText(`file:${REVERSED_DIRECTORY_ID}::src/core/engine.ts`, {}, { timeout: 4000 })

    // Both same-path drilldowns exist; neither overwrote the other.
    expect(within(sessionTabs).getAllByRole('tab', { name: /engine\.ts/ })).toHaveLength(2)

    // The active drilldown returns to its own source session.
    fireEvent.click(screen.getByRole('button', { name: '返回上级目录视图' }))
    expect(screen.getByRole('contentinfo').textContent).toContain(REVERSED_DIRECTORY_ID)

    // The other drilldown still returns to the other source session.
    fireEvent.click(within(sessionTabs).getAllByRole('tab', { name: /engine\.ts/ })[0])
    fireEvent.click(screen.getByRole('button', { name: '返回上级目录视图' }))
    expect(screen.getByRole('contentinfo').textContent).toContain(SAMPLE_DIRECTORY_ID)
  })
})
