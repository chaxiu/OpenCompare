// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithI18n } from '@renderer/i18n/testing'
import { Dialog } from './Dialog'
import { DiffBadge } from './DiffBadge'
import { SessionTabs } from './SessionTabs'
import { SplitPane } from './SplitPane'
import { CompositionLegend } from './StatusBar'

afterEach(cleanup)

const COMPOSITION = { same: 4, added: 3, removed: 2, modified: 1, conflict: 1 }

describe('shared component copy', () => {
  it('localizes the dialog close button', () => {
    renderWithI18n(
      <Dialog title="Confirm" onClose={() => undefined}>
        <p>body</p>
      </Dialog>,
      'en'
    )
    expect(screen.getByRole('button', { name: 'Close' })).toBeDefined()
  })

  it('localizes the diff-semantic badge and status-bar legend together', () => {
    renderWithI18n(
      <div>
        <DiffBadge status="conflict" />
        <CompositionLegend composition={COMPOSITION} />
      </div>,
      'en'
    )

    expect(screen.getAllByText('Conflict').length).toBeGreaterThan(0)
    for (const label of ['Same', 'Added', 'Removed', 'Modified']) {
      expect(screen.getByText(label)).toBeDefined()
    }
  })

  it('keeps the Chinese diff wording unchanged', () => {
    renderWithI18n(
      <div>
        <DiffBadge status="same" />
        <CompositionLegend composition={COMPOSITION} />
      </div>
    )

    expect(screen.getAllByText('相同').length).toBeGreaterThan(0)
    expect(screen.getAllByText('修改').length).toBeGreaterThan(0)
  })

  it('localizes the session tablist, dirty marker and close name', () => {
    renderWithI18n(
      <SessionTabs
        tabs={[{ id: 'a', title: 'engine.ts', dirty: true }]}
        activeId="a"
        onSelect={() => undefined}
        onClose={() => undefined}
      />,
      'en'
    )

    const tablist = screen.getByRole('tablist', { name: 'Sessions' })
    expect(within(tablist).getByRole('tab', { name: /engine\.ts/ })).toBeDefined()
    expect(within(tablist).getByTitle('Unsaved changes')).toBeDefined()
    expect(within(tablist).getByText('Unsaved changes')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Close engine.ts' })).toBeDefined()
  })

  it('keeps the Chinese session-tab wording unchanged', () => {
    renderWithI18n(
      <SessionTabs
        tabs={[{ id: 'a', title: 'engine.ts', dirty: true }]}
        activeId="a"
        onSelect={() => undefined}
        onClose={() => undefined}
      />
    )

    expect(screen.getByRole('tablist', { name: '会话' })).toBeDefined()
    expect(screen.getByTitle('有未保存修改')).toBeDefined()
    expect(screen.getByRole('button', { name: '关闭 engine.ts' })).toBeDefined()
  })
})

/** Pane shares of the split, read back from the inline flex-grow style. */
function paneRatios(): number[] {
  return Array.from(document.querySelectorAll<HTMLElement>('div'))
    .filter((element) => element.style.flexGrow !== '')
    .map((element) => Number(element.style.flexGrow))
}

const PANES = [<div key="left" />, <div key="right" />]

describe('split pane divider', () => {
  it('localizes the separator name and keeps the keyboard ratio steps', () => {
    renderWithI18n(<SplitPane panes={PANES} />, 'en')
    const separator = screen.getByRole('separator', { name: 'Resize panes' })
    expect(paneRatios()).toEqual([0.5, 0.5])

    fireEvent.keyDown(separator, { key: 'ArrowRight' })
    expect(paneRatios()).toEqual([0.52, 0.48])

    fireEvent.keyDown(separator, { key: 'ArrowLeft' })
    fireEvent.keyDown(separator, { key: 'ArrowLeft' })
    expect(paneRatios()).toEqual([0.48, 0.52])
  })

  it('keeps the Chinese name and the pointer drag ratio sequence', () => {
    const bounds = { left: 0, width: 1000 }
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ ...bounds, right: bounds.width, top: 0, bottom: 100 } as DOMRect)
    const setPointerCapture = vi.fn()
    HTMLElement.prototype.setPointerCapture = setPointerCapture
    HTMLElement.prototype.releasePointerCapture = vi.fn()
    HTMLElement.prototype.hasPointerCapture = () => false

    try {
      renderWithI18n(<SplitPane panes={PANES} />)
      const separator = screen.getByRole('separator', { name: '调整分栏宽度' })

      fireEvent.pointerDown(separator, { pointerId: 1, clientX: 500 })
      expect(setPointerCapture).toHaveBeenCalledWith(1)
      fireEvent.pointerMove(separator, { pointerId: 1, clientX: 700 })
      const [left, right] = paneRatios()
      expect(left).toBeCloseTo(0.7)
      expect(right).toBeCloseTo(0.3)

      fireEvent.pointerMove(separator, { pointerId: 1, clientX: 100 })
      const [clamped] = paneRatios()
      expect(clamped).toBeCloseTo(0.12)
    } finally {
      rect.mockRestore()
      Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture')
      Reflect.deleteProperty(HTMLElement.prototype, 'releasePointerCapture')
      Reflect.deleteProperty(HTMLElement.prototype, 'hasPointerCapture')
    }
  })
})
