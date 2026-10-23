// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { JSX } from 'react'
import { CSV_SCENE } from '@shared/fixtures'
import type { Language, PlatformPort } from '@shared/platform/types'
import { I18nProvider } from '@renderer/i18n/I18nProvider'
import { useI18n } from '@renderer/i18n/context'
import { renderWithI18n } from '@renderer/i18n/testing'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { parseCsvTable } from '@renderer/workbench/session'
import { CsvView } from './CsvView'

/** Test-only probe: switches the provider language from inside the tree. */
function LanguageSwitch({ to }: { readonly to: Language }): JSX.Element {
  const { setLanguage } = useI18n()
  return (
    <button type="button" onClick={() => setLanguage(to)}>
      switch-language
    </button>
  )
}

const platform = createWebPlatformPort()

/** Drives the web runtime's hidden file picker with a chosen local file. */
function chooseFile(name: string, text: string): void {
  const input = document.querySelector<HTMLInputElement>('input[data-opencompare-picker="file"]')
  if (!input) throw new Error('no open-file input was created')
  fireEvent.change(input, { target: { files: [new File([text], name, { type: 'text/csv' })] } })
}

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
      platform={platform}
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
        platform={platform}
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

describe('local file entry points', () => {
  it('opens a local CSV file on one side and re-aligns it by the shared key', async () => {
    renderSample()
    expect(screen.getByText('orders.left.csv ↔ orders.right.tsv')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: '打开左文件' }))
    chooseFile('next-left.csv', 'order_id,qty\nA,1\nB,2\n')

    // The panel follows the opened path and the alignment is recomputed.
    await waitFor(() => expect(screen.getByText('next-left.csv ↔ orders.right.tsv')).toBeDefined())
    expect(screen.getByText(/主键 order_id/)).toBeDefined()
    expect(await screen.findByText(/已打开 \/memory\/next-left\.csv/)).toBeDefined()
  })

  it('falls back to the first shared column when the opened pair has new headers', async () => {
    render(
      <CsvView
        sessionId="session-csv"
        left={{ path: '/left.csv', text: '', delimiter: ',' }}
        right={{ path: '/right.csv', text: '', delimiter: ',' }}
        defaultKeyColumns={[]}
        tables={{ left: { header: ['id', 'sku'], rows: [] }, right: { header: ['id', 'sku'], rows: [] } }}
        platform={platform}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '打开右文件' }))
    chooseFile('right.csv', 'sku,qty\nX,1\nY,2\n')

    await waitFor(() => expect(screen.getByText('left.csv ↔ right.csv')).toBeDefined())
    // The previous key column is gone; the first shared column is re-picked.
    expect(await screen.findByText(/主键 sku/)).toBeDefined()
  })
})

const DUPLICATE_TABLES = {
  left: { header: ['id', 'v'], rows: [['A', '1'], ['A', '2']] },
  right: { header: ['id', 'v'], rows: [['A', '1'], ['A', '3']] }
}

function renderWithTables(
  tables: typeof DUPLICATE_TABLES,
  language: Language,
  onAlignStateChange?: (state: { sessionId: string }) => void
): void {
  renderWithI18n(
    <CsvView
      sessionId="session-csv"
      left={{ path: '/left.csv', text: '', delimiter: ',' }}
      right={{ path: '/right.csv', text: '', delimiter: ',' }}
      defaultKeyColumns={[]}
      tables={tables}
      platform={platform}
      onAlignStateChange={onAlignStateChange}
    />,
    language
  )
}

describe('English copy', () => {
  it('renders the toolbar, filters, column presence and counts in English', () => {
    const total = CSV_SCENE.composition.same + CSV_SCENE.composition.added + CSV_SCENE.composition.removed + CSV_SCENE.composition.modified
    const { container } = renderWithI18n(
      <CsvView
        sessionId="session-csv"
        left={CSV_SCENE.left}
        right={CSV_SCENE.right}
        defaultKeyColumns={CSV_SCENE.keyColumns}
        tables={SAMPLE_TABLES}
        platform={platform}
      />,
      'en'
    )

    expect(screen.getByRole('toolbar', { name: 'CSV alignment tools' })).toBeDefined()
    expect(screen.getByText('Key columns')).toBeDefined()
    expect(screen.getByRole('group', { name: 'Key column selection' })).toBeDefined()
    expect(screen.getByRole('tablist', { name: 'Status filter' })).toBeDefined()
    for (const name of ['All', 'Differences only', 'Added', 'Removed', 'Modified', 'Same']) {
      expect(screen.getByRole('tab', { name })).toBeDefined()
    }
    expect(screen.getByText('Only right')).toBeDefined()
    expect(
      screen.getByText(
        `${total.toLocaleString('en-US')} / ${total.toLocaleString('en-US')} rows`
      )
    ).toBeDefined()
    expect(screen.getByText(`Aligned ${total.toLocaleString('en-US')} rows · key order_id`)).toBeDefined()
    expect(screen.getByRole('button', { name: 'Open left file' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Open right file' })).toBeDefined()
    expect(container.textContent).not.toMatch(/\p{Script=Han}/u)
  })

  it('localizes the picker title and the open notice', async () => {
    const selectFile = vi.fn(async () => null)
    const port: PlatformPort = { ...platform, selectFile }
    renderWithI18n(
      <CsvView
        sessionId="session-csv"
        left={CSV_SCENE.left}
        right={CSV_SCENE.right}
        defaultKeyColumns={CSV_SCENE.keyColumns}
        tables={SAMPLE_TABLES}
        platform={port}
      />,
      'en'
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open left file' }))
    expect(selectFile).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Open left CSV / TSV file' })
    )

    cleanup()
    renderWithI18n(
      <CsvView
        sessionId="session-csv"
        left={CSV_SCENE.left}
        right={CSV_SCENE.right}
        defaultKeyColumns={CSV_SCENE.keyColumns}
        tables={SAMPLE_TABLES}
        platform={platform}
      />,
      'en'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open right file' }))
    chooseFile('next-right.csv', 'order_id,qty\nA,1\n')
    expect(await screen.findByText(/Opened \/memory\/next-right\.csv/)).toBeDefined()
  })
})

describe('duplicate key badge', () => {
  it('labels duplicate keys with the localized count and per-key detail', () => {
    renderWithTables(DUPLICATE_TABLES, 'en')
    const badge = screen.getByLabelText('Duplicate keys')
    expect(badge.textContent).toContain('Duplicate keys: 1')
    expect(badge.getAttribute('title')).toBe('A (left 2 · right 2)')

    cleanup()
    renderWithTables(DUPLICATE_TABLES, 'zh')
    const zhBadge = screen.getByLabelText('重复主键')
    expect(zhBadge.textContent).toContain('重复主键 1')
    expect(zhBadge.getAttribute('title')).toBe('A（左 2 · 右 2）')
  })

  it('renders no badge when the keys are unique', () => {
    renderWithTables(
      {
        left: { header: ['id'], rows: [['A']] },
        right: { header: ['id'], rows: [['B']] }
      },
      'en'
    )
    expect(screen.queryByLabelText('Duplicate keys')).toBeNull()
  })
})

describe('empty states', () => {
  it('explains a missing key column in both languages', () => {
    renderWithTables(
      { left: { header: ['a'], rows: [['1']] }, right: { header: ['b'], rows: [['1']] } },
      'en'
    )
    expect(screen.getByText(/No key columns selected/)).toBeDefined()
    expect(screen.getByText('Aligned 0 rows · key none selected')).toBeDefined()

    cleanup()
    renderWithTables(
      { left: { header: ['a'], rows: [['1']] }, right: { header: ['b'], rows: [['1']] } },
      'zh'
    )
    expect(screen.getByText(/未选择主键列/)).toBeDefined()
    expect(screen.getByText('对齐 0 行 · 主键 未选择')).toBeDefined()
  })

  it('distinguishes no aligned rows from no filtered rows', () => {
    renderWithTables(
      { left: { header: ['id'], rows: [] }, right: { header: ['id'], rows: [] } },
      'en'
    )
    expect(screen.getByText('No rows to align under the current keys.')).toBeDefined()

    cleanup()
    renderWithTables(
      { left: { header: ['id'], rows: [['A']] }, right: { header: ['id'], rows: [['A']] } },
      'en'
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Added' }))
    expect(screen.getByText('No rows under the current filter.')).toBeDefined()

    cleanup()
    renderWithTables(
      { left: { header: ['id'], rows: [] }, right: { header: ['id'], rows: [] } },
      'zh'
    )
    expect(screen.getByText('当前主键下没有可对齐的行。')).toBeDefined()

    cleanup()
    renderWithTables(
      { left: { header: ['id'], rows: [['A']] }, right: { header: ['id'], rows: [['A']] } },
      'zh'
    )
    fireEvent.click(screen.getByRole('tab', { name: '新增' }))
    expect(screen.getByText('当前过滤条件下没有行。')).toBeDefined()
  })
})

describe('language switch keeps CSV state', () => {
  it('keeps the keys, filter, counts and visible rows', () => {
    const onAlign = vi.fn()
    render(
      <I18nProvider initialLanguage="zh">
        <CsvView
          sessionId="session-csv"
          left={CSV_SCENE.left}
          right={CSV_SCENE.right}
          defaultKeyColumns={CSV_SCENE.keyColumns}
          tables={SAMPLE_TABLES}
          platform={platform}
          onAlignStateChange={onAlign}
        />
        <LanguageSwitch to="en" />
      </I18nProvider>
    )

    fireEvent.click(within(screen.getByRole('group', { name: '主键列选择' })).getByRole('button', { name: 'sku' }))
    fireEvent.click(screen.getByRole('tab', { name: '修改' }))
    const callsBefore = onAlign.mock.calls.length
    const countsBefore = onAlign.mock.lastCall?.[0]
    const rowsBefore = screen.getByText(/\d+ \/ [\d,]+ 行$/).textContent

    fireEvent.click(screen.getByRole('button', { name: 'switch-language' }))

    expect(onAlign.mock.calls.length).toBe(callsBefore)
    expect(onAlign.mock.lastCall?.[0]).toEqual(countsBefore)
    expect(screen.getByRole('tab', { name: 'Modified' }).getAttribute('aria-selected')).toBe('true')
    expect(
      within(screen.getByRole('group', { name: 'Key column selection' }))
        .getByRole('button', { name: 'sku' })
        .getAttribute('aria-pressed')
    ).toBe('true')
    const rowsAfter = screen.getByText(/\d+ \/ [\d,]+ rows$/).textContent
    expect(rowsAfter?.split(' ')[0]).toBe(rowsBefore?.split(' ')[0])
  })
})
