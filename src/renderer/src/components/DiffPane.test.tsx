// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { JSX } from 'react'
import type { DiffBlock, DiffRow } from '@core/text/diff'
import type { DiffStatus } from '@shared/fixtures'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { CodeView } from '@renderer/views/CodeView'
import { DIFF_ROW_HEIGHT, DiffPane } from './DiffPane'

/**
 * jsdom has no layout: the virtualizer needs a real viewport height to size its
 * row window, so a fixed 1200×600 box stands in for the panel.
 */
const VIEWPORT_HEIGHT = 600
const VIEWPORT_ROWS = Math.ceil(VIEWPORT_HEIGHT / DIFF_ROW_HEIGHT)
/** Mirrors the pane's own overscan; the rendered rows stay inside this bound. */
const OVERSCAN = 10
const ROW_LIMIT = VIEWPORT_ROWS + 2 * OVERSCAN

const LARGE_ROW_COUNT = 350_000
const SMALL_ROW_COUNT = 46
const MODIFIED_EVERY = 97

const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 1200
  })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => VIEWPORT_HEIGHT
  })
})

afterAll(() => {
  if (originalWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalWidth)
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
  if (originalHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalHeight)
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight')
})

afterEach(cleanup)

/* ------------------------------------------------------------------ */
/* Synthetic row models                                                */
/* ------------------------------------------------------------------ */

/**
 * A large aligned row model built once: every row is a real 1:1 line, every
 * `MODIFIED_EVERY`-th row carries inline changed segments. Generating it
 * directly keeps the 350k case off the diff engine.
 */
function buildRows(count: number): DiffRow[] {
  const rows = new Array<DiffRow>(count)
  for (let index = 0; index < count; index += 1) {
    const line = index + 1
    const modified = index % MODIFIED_EVERY === 0
    rows[index] = {
      status: modified ? 'modified' : 'same',
      leftLine: line,
      rightLine: line,
      leftText: `left ${line}`,
      rightText: modified ? `right ${line}` : `left ${line}`,
      leftIndex: index,
      rightIndex: index,
      leftSegments: modified
        ? [
            { text: 'left ', changed: false },
            { text: `${line}`, changed: true }
          ]
        : undefined,
      rightSegments: modified
        ? [
            { text: 'right ', changed: false },
            { text: `${line}`, changed: true }
          ]
        : undefined
    }
  }
  return rows
}

function smallRows(): DiffRow[] {
  const make = (
    status: DiffStatus,
    leftLine: number | null,
    rightLine: number | null,
    leftText: string | null,
    rightText: string | null
  ): Omit<DiffRow, 'leftIndex' | 'rightIndex'> => ({
    status,
    leftLine,
    rightLine,
    leftText,
    rightText
  })

  const sample = [
    make('same', 1, 1, 'alpha', 'alpha'),
    make('added', null, 2, null, 'right-only'),
    make('removed', 2, null, 'left-only', null),
    {
      ...make('modified', 3, 3, 'color: red', 'color: RED'),
      leftSegments: [
        { text: 'color: ', changed: false },
        { text: 'red', changed: true }
      ],
      rightSegments: [
        { text: 'color: ', changed: false },
        { text: 'RED', changed: true }
      ]
    },
    make('conflict', 4, 4, '<<<<<<< ours', '>>>>>>> theirs'),
    ...Array.from({ length: SMALL_ROW_COUNT - 5 }, (_, offset) =>
      make('same', offset + 5, offset + 5, `line ${offset + 5}`, `line ${offset + 5}`)
    )
  ]

  return sample.map((row, index) => ({ ...row, leftIndex: index, rightIndex: index }))
}

/** A windowed-size model carrying every status, a filler row and a long line. */
function mixedRows(count: number): DiffRow[] {
  const rows = buildRows(count)
  rows[1] = {
    ...rows[1],
    status: 'added',
    leftLine: null,
    leftText: null,
    leftSegments: undefined
  }
  rows[2] = {
    ...rows[2],
    status: 'removed',
    rightLine: null,
    rightText: null,
    rightSegments: undefined
  }
  rows[3] = {
    ...rows[3],
    status: 'modified',
    leftSegments: [
      { text: 'left ', changed: false },
      { text: '4', changed: true }
    ],
    rightSegments: [
      { text: 'right ', changed: false },
      { text: '4', changed: true }
    ]
  }
  rows[4] = { ...rows[4], status: 'conflict' }
  return rows
}

const LONG_LINE = `long-${'x'.repeat(5_000)}`

function withLongLine(rows: DiffRow[], index: number): DiffRow[] {
  const next = [...rows]
  next[index] = { ...next[index], leftText: LONG_LINE, rightText: LONG_LINE }
  return next
}

const LARGE_ROWS = buildRows(LARGE_ROW_COUNT)
const SMALL_ROWS = withLongLine(smallRows(), SMALL_ROW_COUNT - 1)

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

function TwoPanes({
  rows,
  activeBlock
}: {
  readonly rows: readonly DiffRow[]
  readonly activeBlock?: DiffBlock | null
}): JSX.Element {
  return (
    <div>
      <DiffPane rows={rows} side="left" activeBlock={activeBlock} />
      <DiffPane rows={rows} side="right" activeBlock={activeBlock} />
    </div>
  )
}

function paneElements(container: HTMLElement): [HTMLDivElement, HTMLDivElement] {
  const panes = Array.from(
    container.querySelectorAll<HTMLDivElement>('div.h-full.overflow-auto')
  )
  if (panes.length !== 2) throw new Error(`expected 2 diff panes, found ${panes.length}`)
  return [panes[0], panes[1]]
}

function contentOf(pane: HTMLElement): HTMLElement {
  const content = pane.firstElementChild
  if (!(content instanceof HTMLElement)) throw new Error('pane has no content box')
  return content
}

function renderedRows(pane: HTMLElement): HTMLElement[] {
  return Array.from(pane.querySelectorAll<HTMLElement>('[data-diff-row]'))
}

function renderedIndices(pane: HTMLElement): number[] {
  return renderedRows(pane).map((row) => Number(row.dataset.diffRow))
}

function rowAt(pane: HTMLElement, index: number): HTMLElement {
  const row = pane.querySelector<HTMLElement>(`[data-diff-row="${index}"]`)
  if (!row) throw new Error(`row ${index} is not rendered`)
  return row
}

function scrollTo(pane: HTMLElement, scrollTop: number): void {
  pane.scrollTop = scrollTop
  fireEvent.scroll(pane)
}

/* ------------------------------------------------------------------ */
/* Bounded window over the 350k-row model                              */
/* ------------------------------------------------------------------ */

describe('DiffPane windowing', () => {
  it('bounds the rendered rows of a 350k-row pane and keeps both columns equal', () => {
    const { container } = render(<TwoPanes rows={LARGE_ROWS} />)
    const [left, right] = paneElements(container)

    scrollTo(left, 175_000 * DIFF_ROW_HEIGHT)
    scrollTo(right, 175_000 * DIFF_ROW_HEIGHT)

    const leftRows = renderedRows(left)
    const rightRows = renderedRows(right)
    // Measured: 30 visible rows + 10 overscan rows above and below.
    expect(leftRows).toHaveLength(ROW_LIMIT)
    expect(leftRows).toHaveLength(50)
    expect(Math.abs(leftRows.length - rightRows.length)).toBeLessThanOrEqual(2 * OVERSCAN)
    // The rendered range stays inside the visible band plus overscan.
    expect(renderedIndices(left)[0]).toBe(175_000 - OVERSCAN)
    expect(renderedIndices(left).at(-1)).toBe(175_000 + VIEWPORT_ROWS - 1 + OVERSCAN)
  })

  it('renders the same number of rows whatever the total is', () => {
    const smaller = buildRows(5_000)
    const first = render(<TwoPanes rows={smaller} />)
    const [smallLeft, smallRight] = paneElements(first.container)
    scrollTo(smallLeft, 100 * DIFF_ROW_HEIGHT)
    scrollTo(smallRight, 100 * DIFF_ROW_HEIGHT)
    const smallCount = renderedRows(smallLeft).length
    cleanup()

    const second = render(<TwoPanes rows={LARGE_ROWS} />)
    const [largeLeft, largeRight] = paneElements(second.container)
    scrollTo(largeLeft, 100 * DIFF_ROW_HEIGHT)
    scrollTo(largeRight, 100 * DIFF_ROW_HEIGHT)
    const largeCount = renderedRows(largeLeft).length

    expect(smallCount).toBe(ROW_LIMIT)
    expect(largeCount).toBe(smallCount)
  })

  it('keeps the content height strictly at rows × DIFF_ROW_HEIGHT in both columns', () => {
    const { container } = render(<TwoPanes rows={LARGE_ROWS} />)
    const [left, right] = paneElements(container)

    expect(DIFF_ROW_HEIGHT).toBe(20)
    expect(contentOf(left).style.height).toBe('7000000px')
    expect(contentOf(left).dataset.diffContentHeight).toBe('7000000')
    expect(contentOf(right).style.height).toBe(contentOf(left).style.height)
    expect(contentOf(right).dataset.diffContentHeight).toBe(
      contentOf(left).dataset.diffContentHeight
    )
  })

  it('follows the scroll offset to the middle and the end with the right row content', () => {
    const { container } = render(<TwoPanes rows={LARGE_ROWS} />)
    const [left] = paneElements(container)

    const middle = 174_988 // a multiple of MODIFIED_EVERY, so it renders inline segments
    scrollTo(left, middle * DIFF_ROW_HEIGHT)

    expect(contentOf(left).dataset.diffWindowStart).toBe(String(middle))
    const middleRow = rowAt(left, middle)
    // Same 20px row shell and sticky gutter as the full-render path.
    expect(middleRow.className).toContain('flex h-5 border-l-2')
    expect(middleRow.firstElementChild?.className).toContain('sticky left-0')
    expect(middleRow.querySelectorAll('.bg-diff-modified\\/40')).toHaveLength(1)
    expect(middleRow.textContent).toContain('174989')
    expect(middleRow.textContent).toContain('left 174989')

    const end = LARGE_ROW_COUNT - VIEWPORT_ROWS
    scrollTo(left, end * DIFF_ROW_HEIGHT)

    expect(contentOf(left).dataset.diffWindowStart).toBe(String(end))
    expect(renderedIndices(left)).toContain(LARGE_ROW_COUNT - 1)
    const last = rowAt(left, LARGE_ROW_COUNT - 1)
    expect(last.textContent).toContain(String(LARGE_ROW_COUNT))
    expect(last.textContent).toContain(`left ${LARGE_ROW_COUNT}`)
    // The visible band is never blank.
    expect(renderedRows(left).length).toBeGreaterThanOrEqual(VIEWPORT_ROWS)
  })

  it('follows a programmatic scrollTop write on the next render without a scroll event', () => {
    const { container, rerender } = render(<TwoPanes rows={LARGE_ROWS} />)
    const [left, right] = paneElements(container)
    const target = 200_000

    left.scrollTop = target * DIFF_ROW_HEIGHT
    right.scrollTop = target * DIFF_ROW_HEIGHT
    rerender(<TwoPanes rows={LARGE_ROWS} />)

    expect(contentOf(left).dataset.diffWindowStart).toBe(String(target))
    expect(contentOf(right).dataset.diffWindowStart).toBe(String(target))
    expect(left.scrollTop).toBe(target * DIFF_ROW_HEIGHT)
    expect(right.scrollTop).toBe(left.scrollTop)
    expect(renderedIndices(left)).toContain(target)
    expect(rowAt(left, target).textContent).toContain(`left ${target + 1}`)
  })

  it('outlines exactly the active block rows inside the window', () => {
    const activeBlock: DiffBlock = {
      index: 0,
      status: 'modified',
      startRow: 200_000,
      endRow: 200_009,
      leftStart: 200_000,
      leftCount: 10,
      rightStart: 200_000,
      rightCount: 10
    }
    const { container } = render(<TwoPanes rows={LARGE_ROWS} activeBlock={activeBlock} />)
    const [left, right] = paneElements(container)

    scrollTo(left, activeBlock.startRow * DIFF_ROW_HEIGHT)
    scrollTo(right, activeBlock.startRow * DIFF_ROW_HEIGHT)

    expect(left.querySelectorAll('.border-accent')).toHaveLength(10)
    expect(right.querySelectorAll('.border-accent')).toHaveLength(10)
    // The row just outside the block stays transparent.
    expect(rowAt(left, activeBlock.endRow + 1).className).toContain('border-transparent')
  })

  it('never wraps long lines and keeps the horizontal content width unclipped', () => {
    const rows = withLongLine(buildRows(1_200), 1_100)
    const { container } = render(<TwoPanes rows={rows} />)
    const [left] = paneElements(container)

    scrollTo(left, 1_100 * DIFF_ROW_HEIGHT)
    const row = rowAt(left, 1_100)
    const cell = row.lastElementChild as HTMLElement
    expect(cell.className).toContain('whitespace-pre')
    expect(cell.textContent).toBe(LONG_LINE)
    expect(contentOf(left).className).toContain('min-w-max')
  })

  it('keeps filler rows, status tones and highlights inside the window', () => {
    const rows = mixedRows(1_200)
    const { container } = render(<TwoPanes rows={rows} />)
    const [left, right] = paneElements(container)

    const filler = rowAt(left, 1)
    const fillerGutter = filler.firstElementChild as HTMLElement
    expect(fillerGutter.textContent).toBe('')
    expect(fillerGutter.className).toContain('bg-surface-sunken')
    expect(filler.lastElementChild?.className).toContain('bg-surface-sunken/60')

    expect(rowAt(right, 1).lastElementChild?.className).toContain('bg-diff-added-soft')
    expect(rowAt(left, 2).lastElementChild?.className).toContain('bg-diff-removed-soft')
    expect(rowAt(left, 3).lastElementChild?.className).toContain('bg-diff-modified-soft')
    expect(rowAt(left, 3).querySelector('.bg-diff-modified\\/40')?.textContent).toBe('4')
    expect(rowAt(left, 4).lastElementChild?.className).toContain('bg-diff-conflict-soft')
  })

  it('keeps the pane scroller as the only h-full overflow-auto element', () => {
    const { container } = render(<TwoPanes rows={LARGE_ROWS} />)
    expect(container.querySelectorAll('div.h-full.overflow-auto')).toHaveLength(2)
    const [left] = paneElements(container)
    expect(contentOf(left).className).not.toContain('h-full')
    expect(contentOf(left).className).not.toContain('overflow-auto')
  })
})

/* ------------------------------------------------------------------ */
/* Small files keep the full render                                    */
/* ------------------------------------------------------------------ */

describe('DiffPane small-file path', () => {
  it('keeps every row in the DOM below the window threshold', () => {
    const { container } = render(<TwoPanes rows={SMALL_ROWS} />)
    const [left, right] = paneElements(container)

    expect(renderedRows(left)).toHaveLength(SMALL_ROW_COUNT)
    expect(renderedRows(right)).toHaveLength(SMALL_ROW_COUNT)
    expect(renderedIndices(left)).toEqual(SMALL_ROWS.map((_, index) => index))
    // No virtual content box, no spacer rows: the rows themselves size the pane.
    expect(contentOf(left).dataset.diffContentHeight).toBeUndefined()
    expect(contentOf(left).style.height).toBe('')
  })

  it('keeps the row structure, status tones, filler gutters and inline highlights', () => {
    const { container } = render(<TwoPanes rows={SMALL_ROWS} />)
    const [left, right] = paneElements(container)

    const same = rowAt(left, 0)
    expect(same.className).toContain('flex h-5 border-l-2')
    const gutter = same.firstElementChild as HTMLElement
    expect(gutter.className).toContain('sticky left-0')
    expect(gutter.className).toContain('bg-surface-raised')
    expect(gutter.textContent).toBe('1')

    // An `added` row is a filler on the left: empty gutter on sunken surface.
    const filler = rowAt(left, 1)
    const fillerGutter = filler.firstElementChild as HTMLElement
    expect(fillerGutter.textContent).toBe('')
    expect(fillerGutter.className).toContain('bg-surface-sunken')
    expect(filler.lastElementChild?.className).toContain('bg-surface-sunken/60')

    expect(rowAt(right, 1).lastElementChild?.className).toContain('bg-diff-added-soft')
    expect(rowAt(left, 2).lastElementChild?.className).toContain('bg-diff-removed-soft')
    expect(rowAt(left, 3).lastElementChild?.className).toContain('bg-diff-modified-soft')
    expect(rowAt(left, 4).lastElementChild?.className).toContain('bg-diff-conflict-soft')

    // The changed fragment stays its own highlighted span.
    const highlight = rowAt(left, 3).querySelector('.bg-diff-modified\\/40')
    expect(highlight?.textContent).toBe('red')

    // Long lines keep the same no-wrap horizontal behaviour without a window.
    const longCell = rowAt(left, SMALL_ROW_COUNT - 1).lastElementChild as HTMLElement
    expect(longCell.className).toContain('whitespace-pre')
    expect(longCell.textContent).toBe(LONG_LINE)
    expect(contentOf(left).className).toContain('min-w-max')
  })

  it('keeps full rendering at the 1,000-row boundary and windows just above it', () => {
    const atLimit = buildRows(1_000)
    const full = render(<TwoPanes rows={atLimit} />)
    const [fullLeft] = paneElements(full.container)
    expect(renderedRows(fullLeft)).toHaveLength(1_000)
    cleanup()

    const aboveLimit = buildRows(1_001)
    const windowed = render(<TwoPanes rows={aboveLimit} />)
    const [windowedLeft] = paneElements(windowed.container)
    const count = renderedRows(windowedLeft).length
    expect(count).toBeLessThan(1_001)
    expect(count).toBeLessThanOrEqual(ROW_LIMIT)
  })

  it('outlines the active block across both panes', () => {
    const activeBlock: DiffBlock = {
      index: 0,
      status: 'modified',
      startRow: 3,
      endRow: 3,
      leftStart: 3,
      leftCount: 1,
      rightStart: 3,
      rightCount: 1
    }
    const { container } = render(<TwoPanes rows={SMALL_ROWS} activeBlock={activeBlock} />)

    expect(container.querySelectorAll('.border-accent')).toHaveLength(2)
  })
})

/* ------------------------------------------------------------------ */
/* Scroll plumbing through the real CodeView                           */
/* ------------------------------------------------------------------ */

describe('windowed diff scroll sync', () => {
  it('mirrors scrollTop 1:1 through CodeView above the window threshold', () => {
    const text = (side: string): string =>
      Array.from({ length: 1_300 }, (_, index) => `${side}-${index}`).join('\n')
    const { container } = render(
      <CodeView
        pair={{
          left: { path: '/memory/large-left.ts', text: text('left') },
          right: { path: '/memory/large-right.ts', text: text('right') }
        }}
        platform={createWebPlatformPort()}
      />
    )
    const [left, right] = paneElements(container)
    // Windowed: only the viewport plus overscan rows reach the DOM.
    expect(renderedRows(left).length).toBeLessThan(1_000)

    left.scrollTop = 1_234 * DIFF_ROW_HEIGHT
    fireEvent.scroll(left)
    expect(right.scrollTop).toBe(1_234 * DIFF_ROW_HEIGHT)

    right.scrollTop = 42 * DIFF_ROW_HEIGHT
    fireEvent.scroll(right)
    expect(left.scrollTop).toBe(42 * DIFF_ROW_HEIGHT)
  })

  it('mirrors scrollTop 1:1 on the full-render path below the window threshold', () => {
    const text = (side: string): string =>
      Array.from({ length: 900 }, (_, index) => `${side}-${index}`).join('\n')
    const { container } = render(
      <CodeView
        pair={{
          left: { path: '/memory/small-left.ts', text: text('left') },
          right: { path: '/memory/small-right.ts', text: text('right') }
        }}
        platform={createWebPlatformPort()}
      />
    )
    const [left, right] = paneElements(container)

    // Below the threshold both panes keep every aligned row in the DOM and have
    // no virtual content box at all.
    expect(renderedRows(left)).toHaveLength(900)
    expect(renderedRows(right)).toHaveLength(renderedRows(left).length)
    expect(contentOf(left).dataset.diffContentHeight).toBeUndefined()
    expect(contentOf(right).dataset.diffContentHeight).toBeUndefined()

    scrollTo(left, 123 * DIFF_ROW_HEIGHT)
    expect(right.scrollTop).toBe(123 * DIFF_ROW_HEIGHT)

    scrollTo(right, 42 * DIFF_ROW_HEIGHT)
    expect(left.scrollTop).toBe(42 * DIFF_ROW_HEIGHT)
  })

  it('follows a ruler jump to a distant block in the windowed path', () => {
    const lines = (dirty: readonly number[]): string =>
      Array.from({ length: 1_500 }, (_, index) =>
        dirty.includes(index) ? `changed-${index}` : `line-${index}`
      ).join('\n')
    const { container } = render(
      <CodeView
        pair={{
          left: { path: '/memory/jump-left.ts', text: lines([]) },
          right: { path: '/memory/jump-right.ts', text: lines([100, 900]) }
        }}
        platform={createWebPlatformPort()}
      />
    )
    const [left, right] = paneElements(container)
    expect(renderedRows(left).length).toBeLessThan(1_000)

    const marker = container.querySelector<HTMLElement>('[data-start-row="900"]')
    if (!marker) throw new Error('no ruler marker for the distant block')
    fireEvent.click(marker)

    // CodeView's jump effect written `scrollTop` on both panes; a browser
    // follows a programmatic scroll with a scroll event, which is what the
    // window state is refreshed from.
    expect(left.scrollTop).toBe(900 * DIFF_ROW_HEIGHT)
    expect(right.scrollTop).toBe(900 * DIFF_ROW_HEIGHT)
    fireEvent.scroll(left)
    fireEvent.scroll(right)

    expect(contentOf(left).dataset.diffWindowStart).toBe('900')
    expect(contentOf(right).dataset.diffWindowStart).toBe('900')
    expect(rowAt(left, 900).textContent).toContain('line-900')
    expect(rowAt(right, 900).textContent).toContain('changed-900')
    expect(left.scrollTop).toBe(right.scrollTop)
  })
})
