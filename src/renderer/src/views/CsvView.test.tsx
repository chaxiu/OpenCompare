// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { CSV_SCENE } from '@shared/fixtures'
import { parseCsvTable } from '@renderer/workbench/session'
import { CsvView } from './CsvView'

/**
 * jsdom reports zero-sized elements, which would give the virtualizer no
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

afterEach(cleanup)

const SAMPLE_TABLES = {
  left: parseCsvTable(CSV_SCENE.left),
  right: parseCsvTable(CSV_SCENE.right)
}

function renderSample(): { readonly onAlign: ReturnType<typeof vi.fn> } {
  const onAlign = vi.fn()
  render(
    <CsvView
      sessionId="session-csv"
      left={CSV_SCENE.left}
      right={CSV_SCENE.right}
      defaultKeyColumns={CSV_SCENE.keyColumns}
      tables={SAMPLE_TABLES}
      onAlignStateChange={onAlign}
    />
  )
  return { onAlign }
}

describe('CsvView', () => {
  it('aligns the shuffled sample by order_id and reports runtime counts', () => {
    const { onAlign } = renderSample()
    const { same, added, removed, modified } = CSV_SCENE.composition

    expect(onAlign).toHaveBeenLastCalledWith({
      sessionId: 'session-csv',
      counts: { same, added, removed, modified }
    })
    expect(
      screen.getByText(
        `${(same + added + removed + modified).toLocaleString('en-US')} / ${(same + added + removed + modified).toLocaleString('en-US')} 行`
      )
    ).toBeDefined()
    // The right-only column is shown and labelled but never counted as a change.
    expect(screen.getByText('region')).toBeDefined()
    expect(screen.getByText('仅右')).toBeDefined()
  })

  it('virtualises the 1,240 rows', () => {
    renderSample()

    const rendered = screen.getByRole('table').querySelectorAll('tbody tr').length
    expect(rendered).toBeGreaterThan(1)
    expect(rendered).toBeLessThan(200)
  })

  it('highlights changed cells and applies the status filters', () => {
    const tables = {
      left: { header: ['id', 'qty', 'status'], rows: [['A', '1', 'paid'], ['B', '2', 'ok'], ['C', '3', 'x']] },
      right: { header: ['id', 'qty', 'status'], rows: [['A', '6', 'paid'], ['B', '2', 'ok'], ['D', '4', 'new']] }
    }
    const onAlign = vi.fn()
    render(
      <CsvView
        sessionId="session-csv"
        left={{ path: '/left.csv', text: '', delimiter: ',' }}
        right={{ path: '/right.csv', text: '', delimiter: ',' }}
        defaultKeyColumns={[]}
        tables={tables}
        onAlignStateChange={onAlign}
      />
    )

    expect(onAlign).toHaveBeenLastCalledWith({
      sessionId: 'session-csv',
      counts: { same: 1, added: 1, removed: 1, modified: 1 }
    })
    expect(screen.getByText('1 → 6')).toBeDefined()
    expect(screen.getByText('4 / 4 行')).toBeDefined()

    fireEvent.click(screen.getByRole('tab', { name: '修改' }))
    expect(screen.getByText('1 / 4 行')).toBeDefined()
    expect(screen.getByText('1 → 6')).toBeDefined()

    fireEvent.click(screen.getByRole('tab', { name: '新增' }))
    expect(screen.getByText('1 / 4 行')).toBeDefined()
    expect(screen.queryByText('1 → 6')).toBeNull()
    expect(screen.getByText('new')).toBeDefined()

    fireEvent.click(screen.getByRole('tab', { name: '删除' }))
    expect(screen.getByText('x')).toBeDefined()

    fireEvent.click(screen.getByRole('tab', { name: '相同' }))
    expect(screen.getByText('ok')).toBeDefined()

    fireEvent.click(screen.getByRole('tab', { name: '仅差异' }))
    expect(screen.getByText('3 / 4 行')).toBeDefined()

    fireEvent.click(screen.getByRole('tab', { name: '全部' }))
    expect(screen.getByText('4 / 4 行')).toBeDefined()
  })

  it('switches primary keys and recomputes the alignment', () => {
    const { onAlign } = renderSample()
    const picker = screen.getByRole('group', { name: '主键列选择' })
    const { same, added, removed, modified } = CSV_SCENE.composition

    // A second key column: keys stay unique, so the counts are unchanged.
    fireEvent.click(within(picker).getByRole('button', { name: 'sku' }))
    expect(screen.getByText('对齐 1,264 行 · 主键 order_id + sku')).toBeDefined()
    expect(onAlign).toHaveBeenLastCalledWith({
      sessionId: 'session-csv',
      counts: { same, added, removed, modified }
    })

    // Switching to a colliding key changes the runtime counts.
    fireEvent.click(within(picker).getByRole('button', { name: 'order_id' }))
    expect(screen.getByText(/· 主键 sku$/)).toBeDefined()
    const last = onAlign.mock.lastCall?.[0] as { counts: typeof CSV_SCENE.composition }
    expect(last.counts).not.toEqual({ same, added, removed, modified })
  })

  it('falls back to an empty state when the last key column is cleared', () => {
    const { onAlign } = renderSample()
    const picker = screen.getByRole('group', { name: '主键列选择' })

    fireEvent.click(within(picker).getByRole('button', { name: 'order_id' }))

    expect(screen.getByText(/未选择主键列/)).toBeDefined()
    expect(screen.getByText('0 / 0 行')).toBeDefined()
    expect(onAlign).toHaveBeenLastCalledWith({
      sessionId: 'session-csv',
      counts: { same: 0, added: 0, removed: 0, modified: 0 }
    })
  })
})
