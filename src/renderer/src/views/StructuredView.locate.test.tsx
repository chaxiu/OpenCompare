// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { STRUCTURED_SCENE } from '@shared/fixtures'
import { renderWithI18n } from '@renderer/i18n/testing'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { StructuredView } from './StructuredView'

afterEach(cleanup)

const platform = createWebPlatformPort()

/**
 * jsdom has no layout: fixed viewport and per-pane content boxes stand in for
 * the real panels, so both the row windows and the scroll ratios are real.
 */
const VIEWPORT_HEIGHT = 600
const SOURCE_ROW_HEIGHT = 20
const CHANGE_ROW_HEIGHT = 24
const SOURCE_OVERSCAN = 10
const CHANGE_OVERSCAN = 10
const SOURCE_LIMIT = Math.ceil(VIEWPORT_HEIGHT / SOURCE_ROW_HEIGHT) + 2 * SOURCE_OVERSCAN
const CHANGE_LIMIT = Math.ceil(VIEWPORT_HEIGHT / CHANGE_ROW_HEIGHT) + 2 * CHANGE_OVERSCAN

const heights = { left: 2000, right: 2000 }

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
      const side = this.getAttribute('data-source-pane')
      if (side === 'left') return heights.left
      if (side === 'right') return heights.right
      return 0
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
  heights.left = 2000
  heights.right = 2000
})

/** Left: /a/b is modified; right additionally has /a/c (added on that side). */
const PAIR = {
  left: {
    path: 'locate.left.json',
    text: ['{', '  "a": {', '    "b": 1', '  },', '  "same": 1', '}'].join('\n')
  },
  right: {
    path: 'locate.right.json',
    text: [
      '{',
      '  "a": {',
      '    "b": 2,',
      '    "c": {',
      '      "d": 3',
      '    }',
      '  },',
      '  "same": 1',
      '}'
    ].join('\n')
  }
}

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

function selectChange(path: string): void {
  fireEvent.click(changeRow(path))
}

function highlighted(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-highlight-status]'))
}

function scrollPane(side: 'left' | 'right', scrollTop: number): void {
  const element = pane(side)
  element.scrollTop = scrollTop
  fireEvent.scroll(element)
}

function renderPair(): void {
  render(<StructuredView pair={PAIR} format="json" platform={platform} />)
}

async function renderPairReady(): Promise<void> {
  renderPair()
  await screen.findByText('/a/c')
}

describe('change row → original panes', () => {
  it('scrolls each pane to its own range start and highlights only the range', async () => {
    await renderPairReady()
    selectChange('/a/b')

    expect(pane('left').scrollTop).toBeCloseTo((3 - 1) * SOURCE_ROW_HEIGHT, 0)
    expect(pane('right').scrollTop).toBeCloseTo((3 - 1) * SOURCE_ROW_HEIGHT, 0)

    for (const side of ['left', 'right'] as const) {
      const rows = Array.from(
        pane(side).querySelectorAll<HTMLElement>('[data-source-row]')
      )
      const marked = rows.filter((row) => row.dataset.highlightStatus === 'modified')
      expect(marked.map((row) => row.dataset.sourceLine)).toEqual(['3'])
      expect(marked[0].className).toContain('bg-diff-modified-soft')
    }
    expect(pane('left').querySelector('[data-source-line="2"]')?.getAttribute('data-highlight-status')).toBeNull()
  })

  it('activates a change row with Enter and Space as well as a click', async () => {
    await renderPairReady()

    fireEvent.keyDown(changeRow('/a/c'), { key: 'Enter' })
    expect(changeRow('/a/c').getAttribute('aria-selected')).toBe('true')
    expect(changeRow('/a/b').getAttribute('aria-selected')).toBe('false')

    fireEvent.keyDown(changeRow('/a/b'), { key: ' ' })
    expect(changeRow('/a/b').getAttribute('aria-selected')).toBe('true')
    expect(changeRow('/a/c').getAttribute('aria-selected')).toBe('false')
  })

  it('marks the missing side with the fallback ancestor line and no highlight', async () => {
    await renderPairReady()
    selectChange('/a/c')

    // The right side owns /a/c: exact lines 4–6 are marked as added.
    const rightMarked = Array.from(
      pane('right').querySelectorAll<HTMLElement>('[data-highlight-status="added"]')
    ).map((row) => row.dataset.sourceLine)
    expect(rightMarked).toEqual(['4', '5', '6'])
    expect(pane('right').scrollTop).toBeCloseTo((4 - 1) * SOURCE_ROW_HEIGHT, 0)

    // The left side falls back to /a (lines 2–4): no row pretends to exist.
    expect(pane('left').scrollTop).toBeCloseTo((2 - 1) * SOURCE_ROW_HEIGHT, 0)
    expect(pane('left').querySelectorAll('[data-highlight-status]')).toHaveLength(0)
    expect(pane('left').querySelector('[data-missing-marker="left"]')).toBeNull()
    const marker = document.querySelector<HTMLElement>('[data-missing-marker="left"]')
    expect(marker?.textContent).toBe('此侧不存在')
  })

  it('selects the added change again when the missing-side marker is clicked', async () => {
    await renderPairReady()
    selectChange('/a/c')
    const marker = document.querySelector<HTMLElement>('[data-missing-marker="left"]')
    if (!marker) throw new Error('no missing-side marker')

    fireEvent.click(marker)

    expect(changeRow('/a/c').getAttribute('aria-selected')).toBe('true')
    expect(changeRow('/a/b').getAttribute('aria-selected')).toBe('false')
  })
})

describe('original line → change row', () => {
  it('selects the change whose exact range covers the clicked line', async () => {
    await renderPairReady()

    fireEvent.click(pane('left').querySelector<HTMLElement>('[data-source-line="3"]')!)
    expect(changeRow('/a/b').getAttribute('aria-selected')).toBe('true')

    // Line 5 is the unchanged `same` node: the selection must not move.
    fireEvent.click(pane('left').querySelector<HTMLElement>('[data-source-line="5"]')!)
    expect(changeRow('/a/b').getAttribute('aria-selected')).toBe('true')
    expect(changeRow('/a/c').getAttribute('aria-selected')).toBe('false')
  })

  it('ignores an ancestor fallback range on the side that lacks the node', async () => {
    await renderPairReady()

    // /a/c falls back to /a on the left; clicking line 2 must not select it.
    fireEvent.click(pane('left').querySelector<HTMLElement>('[data-source-line="2"]')!)
    expect(document.querySelectorAll('[data-change-row][aria-selected="true"]')).toHaveLength(0)

    // The owning side still resolves its exact range.
    fireEvent.click(pane('right').querySelector<HTMLElement>('[data-source-line="5"]')!)
    expect(changeRow('/a/c').getAttribute('aria-selected')).toBe('true')
  })
})

describe('highlight tokens', () => {
  const cases = [
    {
      status: 'added',
      left: '{"a":1}',
      right: '{"a":1,"b":2}',
      path: '/b',
      side: 'right',
      expected: 'added',
      className: 'bg-diff-added-soft'
    },
    {
      status: 'removed',
      left: '{"a":1,"b":2}',
      right: '{"a":1}',
      path: '/b',
      side: 'left',
      expected: 'removed',
      className: 'bg-diff-removed-soft'
    },
    {
      status: 'modified',
      left: '{"a":1}',
      right: '{"a":2}',
      path: '/a',
      side: 'left',
      expected: 'modified',
      className: 'bg-diff-modified-soft'
    },
    {
      status: 'typeChanged',
      left: '{"a":1}',
      right: '{"a":"1"}',
      path: '/a',
      side: 'right',
      expected: 'conflict',
      className: 'bg-diff-conflict-soft'
    }
  ] as const

  for (const item of cases) {
    it(`paints ${item.status} with the soft ${item.expected} token only`, async () => {
      const { container } = render(
        <StructuredView
          pair={{
            left: { path: 'token.left.json', text: item.left },
            right: { path: 'token.right.json', text: item.right }
          }}
          format="json"
          platform={platform}
        />
      )
      await screen.findByText(item.path)
      selectChange(item.path)

      const marked = Array.from(container.querySelectorAll<HTMLElement>('[data-highlight-status]'))
      expect(marked.length).toBeGreaterThan(0)
      for (const element of marked) {
        expect(element.dataset.highlightStatus).toBe(item.expected)
        const tones = element.className
          .split(/\s+/)
          .filter((token) => token.startsWith('bg-diff-'))
        expect(tones).toEqual([item.className])
      }
      if (item.status === 'added' || item.status === 'removed') {
        // The missing side of a one-sided node paints nothing at all.
        const missingSide = item.side === 'left' ? 'right' : 'left'
        expect(
          pane(missingSide).querySelectorAll('[data-highlight-status]')
        ).toHaveLength(0)
      }
    })
  }
})

describe('vertical scroll sync', () => {
  it('maps the relative position onto the other pane', async () => {
    await renderPairReady()
    // Different content heights: the ratio, not the raw offset, is shared.
    heights.right = 3000

    scrollPane('left', 0.5 * (heights.left - VIEWPORT_HEIGHT))
    expect(pane('right').scrollTop).toBeCloseTo(0.5 * (heights.right - VIEWPORT_HEIGHT), 0)

    scrollPane('right', 0.25 * (heights.right - VIEWPORT_HEIGHT))
    expect(pane('left').scrollTop).toBeCloseTo(0.25 * (heights.left - VIEWPORT_HEIGHT), 0)
  })

  it('does not loop on the echo of a synchronized write', async () => {
    await renderPairReady()

    scrollPane('left', 0.5 * (heights.left - VIEWPORT_HEIGHT))
    const mirrored = pane('right').scrollTop
    expect(mirrored).toBeCloseTo(0.5 * (heights.right - VIEWPORT_HEIGHT), 0)

    // The echo carries an unchanged offset: it must not move the left pane.
    fireEvent.scroll(pane('right'))
    expect(pane('left').scrollTop).toBeCloseTo(0.5 * (heights.left - VIEWPORT_HEIGHT), 0)

    for (let round = 0; round < 3; round += 1) {
      fireEvent.scroll(pane('left'))
      fireEvent.scroll(pane('right'))
    }
    expect(pane('left').scrollTop).toBeCloseTo(0.5 * (heights.left - VIEWPORT_HEIGHT), 0)
    expect(pane('right').scrollTop).toBeCloseTo(mirrored, 0)
  })

  it('keeps the programmatic jump offsets and ignores its own scroll echoes', async () => {
    await renderPairReady()
    heights.left = 4000
    heights.right = 6000

    selectChange('/a/b')
    // Each side lands on its own row offset, never a ratio copy of the other.
    expect(pane('left').scrollTop).toBeCloseTo((3 - 1) * SOURCE_ROW_HEIGHT, 0)
    expect(pane('right').scrollTop).toBeCloseTo((3 - 1) * SOURCE_ROW_HEIGHT, 0)

    fireEvent.scroll(pane('left'))
    fireEvent.scroll(pane('right'))
    expect(pane('left').scrollTop).toBeCloseTo((3 - 1) * SOURCE_ROW_HEIGHT, 0)
    expect(pane('right').scrollTop).toBeCloseTo((3 - 1) * SOURCE_ROW_HEIGHT, 0)
  })

  it('moves one row per Arrow key, one viewport per Page key and follows on the other pane', async () => {
    await renderPairReady()
    const left = pane('left')
    expect(left.getAttribute('tabindex')).toBe('0')

    fireEvent.keyDown(left, { key: 'ArrowDown' })
    expect(left.scrollTop).toBeCloseTo(SOURCE_ROW_HEIGHT, 0)
    expect(pane('right').scrollTop).toBeCloseTo(
      (SOURCE_ROW_HEIGHT / (heights.left - VIEWPORT_HEIGHT)) *
        (heights.right - VIEWPORT_HEIGHT),
      0
    )

    fireEvent.keyDown(left, { key: 'PageDown' })
    expect(left.scrollTop).toBeCloseTo(SOURCE_ROW_HEIGHT + VIEWPORT_HEIGHT, 0)
    expect(pane('right').scrollTop).toBeCloseTo(
      ((SOURCE_ROW_HEIGHT + VIEWPORT_HEIGHT) / (heights.left - VIEWPORT_HEIGHT)) *
        (heights.right - VIEWPORT_HEIGHT),
      0
    )

    fireEvent.keyDown(left, { key: 'ArrowUp' })
    expect(left.scrollTop).toBeCloseTo(VIEWPORT_HEIGHT, 0)

    fireEvent.keyDown(left, { key: 'Home' })
    expect(left.scrollTop).toBe(0)
    expect(pane('right').scrollTop).toBe(0)

    fireEvent.keyDown(left, { key: 'End' })
    expect(left.scrollTop).toBeCloseTo(heights.left - VIEWPORT_HEIGHT, 0)
    expect(pane('right').scrollTop).toBeCloseTo(heights.right - VIEWPORT_HEIGHT, 0)
  })
})

describe('filter keeps the navigation state', () => {
  it('keeps the highlight and offsets while the selected row is filtered out', async () => {
    await renderPairReady()
    selectChange('/a/b')
    const leftTop = pane('left').scrollTop
    const rightTop = pane('right').scrollTop

    fireEvent.click(screen.getByRole('tab', { name: '新增' }))
    expect(document.querySelector('[data-change-path="/a/b"]')).toBeNull()
    expect(highlighted()).not.toHaveLength(0)
    expect(pane('left').scrollTop).toBeCloseTo(leftTop, 0)
    expect(pane('right').scrollTop).toBeCloseTo(rightTop, 0)

    fireEvent.click(screen.getByRole('tab', { name: '全部' }))
    expect(changeRow('/a/b').getAttribute('aria-selected')).toBe('true')
  })

  it('clears selection and both offsets when the compared source changes', async () => {
    render(<StructuredView fixture={STRUCTURED_SCENE} platform={platform} />)
    await screen.findByText('/service/features/limits/maxBytes')
    selectChange('/service/features/limits/maxBytes')
    expect(highlighted()).not.toHaveLength(0)

    fireEvent.click(screen.getByRole('tab', { name: 'YAML' }))
    await screen.findByText('/service/health')

    expect(document.querySelectorAll('[data-change-row][aria-selected="true"]')).toHaveLength(0)
    expect(highlighted()).toHaveLength(0)
    expect(pane('left').scrollTop).toBe(0)
    expect(pane('right').scrollTop).toBe(0)
  })
})

describe('windowing', () => {
  function lines(text: string): number {
    return text.replace(/\n$/, '').split('\n').length
  }

  function largeJson(values: readonly number[]): string {
    return JSON.stringify({ items: values }, null, 2)
  }

  it('renders every source row below the threshold', async () => {
    await renderPairReady()
    expect(pane('left').querySelectorAll('[data-source-row]')).toHaveLength(
      lines(PAIR.left.text)
    )
    expect(pane('right').querySelectorAll('[data-source-row]')).toHaveLength(
      lines(PAIR.right.text)
    )
    expect(pane('left').querySelector('[data-source-window-start]')).toBeNull()
  })

  it('bounds the source rows of a 1,200-line file and follows scrollTop', async () => {
    const text = largeJson(Array.from({ length: 1200 }, (_, index) => index))
    render(
      <StructuredView
        pair={{
          left: { path: 'big.left.json', text },
          right: { path: 'big.right.json', text }
        }}
        format="json"
        platform={platform}
      />
    )

    await waitFor(() =>
      expect(pane('left').querySelector('[data-source-window-start]')).not.toBeNull()
    )
    expect(lines(text)).toBeGreaterThan(1000)
    expect(pane('left').querySelectorAll('[data-source-row]').length).toBeLessThanOrEqual(
      SOURCE_LIMIT
    )
    expect(pane('right').querySelectorAll('[data-source-row]').length).toBeLessThanOrEqual(
      SOURCE_LIMIT
    )

    scrollPane('left', 100 * SOURCE_ROW_HEIGHT)
    await waitFor(() =>
      expect(
        pane('left')
          .querySelector('[data-source-window-start]')
          ?.getAttribute('data-source-window-start')
      ).toBe('100')
    )
  })

  it('bounds the change list of more than 1,000 changes and moves its window with scrollTop', async () => {
    const left = largeJson(Array.from({ length: 1200 }, (_, index) => index))
    const right = largeJson(Array.from({ length: 1200 }, (_, index) => index + 1))
    const { container } = render(
      <StructuredView
        pair={{
          left: { path: 'many.left.json', text: left },
          right: { path: 'many.right.json', text: right }
        }}
        format="json"
        platform={platform}
      />
    )

    const list = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('[role="listbox"]')
      if (!element) throw new Error('no change list yet')
      return element
    })
    expect(list.querySelectorAll('[data-change-row]').length).toBeLessThanOrEqual(CHANGE_LIMIT)
    expect(list.querySelector('.min-w-max')?.getAttribute('data-change-window-start')).not.toBeNull()

    list.scrollTop = 100 * CHANGE_ROW_HEIGHT
    fireEvent.scroll(list)
    await waitFor(() =>
      expect(
        list.querySelector('[data-change-window-start]')?.getAttribute('data-change-window-start')
      ).toBe('100')
    )
    expect(list.querySelectorAll('[data-change-row]').length).toBeLessThanOrEqual(CHANGE_LIMIT)
  })
})

describe('missing-side copy', () => {
  const pair = {
    left: { path: 'i18n.left.json', text: '{"a":1}' },
    right: { path: 'i18n.right.json', text: '{"a":1,"b":2}' }
  }

  it('localizes「此侧不存在」in English without leaking Han text', async () => {
    const { container } = renderWithI18n(
      <StructuredView pair={pair} format="json" platform={platform} />,
      'en'
    )
    await screen.findByText('/b')
    selectChange('/b')

    expect(screen.getByText('Not on this side')).toBeDefined()
    expect(container.textContent).not.toMatch(/\p{Script=Han}/u)
  })

  it('keeps the Chinese marker copy in the zh dictionary', async () => {
    render(<StructuredView pair={pair} format="json" platform={platform} />)
    await screen.findByText('/b')
    selectChange('/b')

    expect(screen.getByText('此侧不存在')).toBeDefined()
    expect(document.querySelector('[data-missing-marker="left"]')).not.toBeNull()
  })
})
