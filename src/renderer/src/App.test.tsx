// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CSV_SCENE } from '@shared/fixtures'
import { App } from './App'

afterEach(cleanup)

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

  it('renders the CSV reconciliation tables with their parsed row counts', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '样本' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /CSV 主键对比/ }))

    const leftRows =
      CSV_SCENE.composition.same + CSV_SCENE.composition.removed + CSV_SCENE.composition.modified
    const rightRows =
      CSV_SCENE.composition.same + CSV_SCENE.composition.added + CSV_SCENE.composition.modified

    expect(leftRows).toBeGreaterThanOrEqual(1200)
    expect(
      await screen.findByText(`${leftRows.toLocaleString('en-US')} 行 · CSV`, {}, { timeout: 4000 })
    ).toBeDefined()
    expect(screen.getByText(`${rightRows.toLocaleString('en-US')} 行 · TSV`)).toBeDefined()
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
})
