// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import type { PlatformPort } from '@shared/platform/types'
import { Workbench } from './Workbench'

const VIEWPORT_HEIGHT = 640
const SOURCE_HEIGHT = 4000

const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
const originalScrollHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollHeight'
)

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => VIEWPORT_HEIGHT
  })
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.hasAttribute('data-source-pane') ? SOURCE_HEIGHT : 0
    }
  })
})

afterAll(() => {
  if (originalHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalHeight)
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight')
  if (originalScrollHeight) {
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', originalScrollHeight)
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight')
  }
})

beforeEach(() => {
  localStorage.setItem('opencompare.userSettings', JSON.stringify({ language: 'zh' }))
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function pane(side: 'left' | 'right'): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-source-pane="${side}"]`)
  if (!element) throw new Error(`no ${side} source pane`)
  return element
}

function changeRow(path: string): HTMLElement {
  const row = document.querySelector<HTMLElement>(`[data-change-path="${path}"]`)
  if (!row) throw new Error(`change row ${path} is not rendered`)
  return row
}

function sessionTabs(): HTMLElement {
  return screen.getByRole('tablist', { name: '会话' })
}

async function openPair(
  platform: PlatformPort,
  left: string,
  right: string
): Promise<void> {
  await platform.writeTextFile(left, '{"a":1}')
  await platform.writeTextFile(right, '{"a":1,"b":2,"c":3}')
  fireEvent.click(screen.getAllByRole('button', { name: '新建对比' })[0])
  const dialog = screen.getByRole('dialog', { name: '新建对比' })
  fireEvent.change(within(dialog).getByLabelText('左侧路径'), { target: { value: left } })
  fireEvent.change(within(dialog).getByLabelText('右侧路径'), { target: { value: right } })
  fireEvent.click(within(dialog).getByRole('button', { name: '建立对比' }))
}

describe('structured per-session navigation state', () => {
  it('restores filter, selection and both offsets on tab switch without crossing sessions', async () => {
    const platform = createWebPlatformPort()
    render(<Workbench platform={platform} />)

    // Session A: two added nodes on the right.
    await openPair(platform, '/memory/state/a.left.json', '/memory/state/a.right.json')
    await screen.findByRole('tab', { name: /a\.left\.json/ })
    await screen.findByText('/b')

    // Session B: one modified node.
    await platform.writeTextFile('/memory/state/b.left.json', '{"x":1}')
    await platform.writeTextFile('/memory/state/b.right.json', '{"x":2}')
    fireEvent.click(screen.getAllByRole('button', { name: '新建对比' })[0])
    const second = screen.getByRole('dialog', { name: '新建对比' })
    fireEvent.change(within(second).getByLabelText('左侧路径'), {
      target: { value: '/memory/state/b.left.json' }
    })
    fireEvent.change(within(second).getByLabelText('右侧路径'), {
      target: { value: '/memory/state/b.right.json' }
    })
    fireEvent.click(within(second).getByRole('button', { name: '建立对比' }))
    await screen.findByRole('tab', { name: /b\.left\.json/ })
    await screen.findByText('/x')

    // Back to A: select /b, filter to Added, scroll both panes to the middle.
    fireEvent.click(within(sessionTabs()).getByRole('tab', { name: /a\.left\.json/ }))
    await screen.findByText('/b')
    fireEvent.click(changeRow('/b'))
    fireEvent.click(screen.getByRole('tab', { name: '新增' }))
    const target = 0.5 * (SOURCE_HEIGHT - VIEWPORT_HEIGHT)
    pane('left').scrollTop = target
    fireEvent.scroll(pane('left'))
    expect(pane('right').scrollTop).toBeCloseTo(target, 0)

    // Session B keeps its own state: no selection, default filter, own offset.
    fireEvent.click(within(sessionTabs()).getByRole('tab', { name: /b\.left\.json/ }))
    await screen.findByText('/x')
    expect(document.querySelectorAll('[data-change-row][aria-selected="true"]')).toHaveLength(0)
    expect(screen.getByRole('tab', { name: '全部' }).getAttribute('aria-selected')).toBe('true')
    pane('left').scrollTop = 0.25 * (SOURCE_HEIGHT - VIEWPORT_HEIGHT)
    fireEvent.scroll(pane('left'))
    const secondOffset = pane('right').scrollTop

    // Returning to A restores the filter, the selected row and both offsets.
    fireEvent.click(within(sessionTabs()).getByRole('tab', { name: /a\.left\.json/ }))
    await screen.findByText('/b')
    await waitFor(() =>
      expect(changeRow('/b').getAttribute('aria-selected')).toBe('true')
    )
    expect(screen.getByRole('tab', { name: '新增' }).getAttribute('aria-selected')).toBe('true')
    expect(pane('left').scrollTop).toBeCloseTo(target, 0)
    expect(pane('right').scrollTop).toBeCloseTo(target, 0)

    // And B is still where it was, untouched by A's jump.
    fireEvent.click(within(sessionTabs()).getByRole('tab', { name: /b\.left\.json/ }))
    await screen.findByText('/x')
    expect(pane('left').scrollTop).toBeCloseTo(secondOffset, 0)
  })
})
