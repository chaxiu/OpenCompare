// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CSV_SCENE, DIRECTORY_SAMPLE_PATHS } from '@shared/fixtures'
import { compareDirectories, createComparisonCache } from '@core/directory/compare'
import { App } from './App'
import { createWebPlatformPort } from './platform/web-platform'

afterEach(cleanup)

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

describe('workbench shell', () => {
  it('mounts the empty workbench on the in-memory PlatformPort', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'OpenCompare' })).toBeDefined()
    expect(screen.getByText('web')).toBeDefined()
    expect(screen.getByRole('heading', { name: '尚未载入样本' })).toBeDefined()
    expect(screen.getByRole('tablist', { name: '视图切换' })).toBeDefined()
    expect(screen.getAllByRole('button', { name: 'Load Sample Fixtures' }).length).toBeGreaterThan(0)
  })

  it('shows the loading state, then every sample session', async () => {
    render(<App />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Load Sample Fixtures' })[0])
    expect(screen.getByRole('heading', { name: '正在载入样本…' })).toBeDefined()

    expect(await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })).toBeDefined()
    expect(screen.getByText('session-directory')).toBeDefined()
    expect(screen.getAllByRole('tab', { name: /CSV 主键对比/ }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('tab', { name: /JSON \/ YAML/ }).length).toBeGreaterThan(0)
  })

  it('switches the work area and the status bar with the active session', async () => {
    render(<App />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Load Sample Fixtures' })[0])
    const codeTab = await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })

    fireEvent.click(codeTab)

    expect(screen.getByText('session-code')).toBeDefined()
    expect(screen.getByRole('tab', { name: '三向合并 base · ours · theirs' })).toBeDefined()
    // three-way merge renders three panes, i.e. two draggable dividers
    expect(screen.getAllByRole('separator', { name: '调整分栏宽度' }).length).toBe(2)
  })

  it('shows the key-aligned CSV reconciliation with runtime counts', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '样本' }))
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

    fireEvent.click(screen.getByRole('button', { name: '样本' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /演示：样本读取失败/ }))

    expect(
      await screen.findByRole('heading', { name: '样本库读取失败' }, { timeout: 4000 })
    ).toBeDefined()
    expect(screen.getByRole('button', { name: '重试' })).toBeDefined()
  })

  it('filters the directory comparison and drills a file into its file view', async () => {
    render(<App />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Load Sample Fixtures' })[0])
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

    expect(await screen.findByText('file:src/core/engine.ts', {}, { timeout: 4000 })).toBeDefined()
    expect(screen.getByText(/来自目录对比下钻/)).toBeDefined()
  })

  it('drills CSV and YAML files into their typed views', async () => {
    render(<App />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Load Sample Fixtures' })[0])
    await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })

    fireEvent.doubleClick(screen.getAllByText('report.csv')[0])
    expect(await screen.findByText('file:src/data/report.csv', {}, { timeout: 4000 })).toBeDefined()
    // No declared primary key on a drilldown: the first shared column wins.
    expect(await screen.findByText('对齐 4 行 · 主键 order_id')).toBeDefined()
    expect(screen.getByRole('contentinfo').textContent).toContain('2相同1新增0删除1修改')

    const sessionTabs = screen.getByRole('tablist', { name: '会话' })
    fireEvent.click(within(sessionTabs).getByRole('tab', { name: /目录对比/ }))

    fireEvent.doubleClick(screen.getAllByText('deploy.yaml')[0])
    expect(await screen.findByText('file:config/deploy.yaml', {}, { timeout: 4000 })).toBeDefined()
    expect(screen.getByText(/YAML 原文/)).toBeDefined()
  })

  it('explains why a non-text file cannot be drilled into', async () => {
    render(<App />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Load Sample Fixtures' })[0])
    await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })

    fireEvent.doubleClick(screen.getAllByText('logo.png')[0])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('暂不支持')
    // the directory session stays put instead of silently doing nothing
    expect(screen.getByText('session-directory')).toBeDefined()
  })

  it('degrades the native directory picker on the web runtime', async () => {
    render(<App />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Load Sample Fixtures' })[0])
    await screen.findByRole('tab', { name: /3-Way Merge/ }, { timeout: 4000 })

    const leftPicker = screen.getByRole('button', { name: '选择左目录' }) as HTMLButtonElement
    const rightPicker = screen.getByRole('button', { name: '选择右目录' }) as HTMLButtonElement
    const samplePicker = screen.getByRole('button', { name: '加载样本目录' }) as HTMLButtonElement

    expect(leftPicker.disabled).toBe(true)
    expect(rightPicker.disabled).toBe(true)
    expect(samplePicker.disabled).toBe(false)
    expect(screen.getByText(/Web 预览模式没有原生目录选择/)).toBeDefined()
  })

  it('previews a sync dry-run with byte totals and cancels without writing', async () => {
    render(<App />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Load Sample Fixtures' })[0])
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

    fireEvent.click(screen.getAllByRole('button', { name: 'Load Sample Fixtures' })[0])
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

    fireEvent.click(screen.getAllByRole('button', { name: 'Load Sample Fixtures' })[0])
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
