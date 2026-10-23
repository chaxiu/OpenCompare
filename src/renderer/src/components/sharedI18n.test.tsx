// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderWithI18n } from '@renderer/i18n/testing'
import { Dialog } from './Dialog'
import { DiffBadge } from './DiffBadge'
import { SessionTabs } from './SessionTabs'
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
