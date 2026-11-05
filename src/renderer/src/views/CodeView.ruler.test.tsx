// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CodeSceneFixture } from '@shared/fixtures'
import type { PlatformPort } from '@shared/platform/types'
import { diffLineTexts } from '@core/text/diff'
import type { DiffBlock } from '@core/text/diff'
import { DIFF_ROW_HEIGHT } from '@renderer/components/DiffPane'
import { renderWithI18n } from '@renderer/i18n/testing'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { CodeView } from './CodeView'
import { centeredScrollTop, maxScrollTop } from './codeViewScroll'

// Pass-through spy: the projection must not re-run while scrolling or selecting.
vi.mock('@core/text/diff', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@core/text/diff')>()
  return { ...actual, diffLineTexts: vi.fn(actual.diffLineTexts) }
})

const diffCalls = vi.mocked(diffLineTexts)

/** Ruler track height and diff pane height stubbed for jsdom (it measures 0). */
const TRACK_HEIGHT = 400
const PANE_HEIGHT = 100

const clientHeightDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'clientHeight'
)

function readClientHeight(this: HTMLElement): number {
  return this.dataset.diffRuler === 'true' ? TRACK_HEIGHT : PANE_HEIGHT
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: readClientHeight
  })
  URL.createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:mock')
  URL.revokeObjectURL = vi.fn<(url: string) => void>(() => undefined)
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  if (clientHeightDescriptor) {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeightDescriptor)
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight')
  }
})

const FIXTURE: CodeSceneFixture = {
  scene: 'code',
  composition: { same: 0, added: 0, removed: 0, modified: 0, conflict: 2 },
  diff: {
    left: { path: '/samples/left.ts', text: 'alpha\n  color: red\nbeta\n' },
    right: { path: '/samples/right.ts', text: 'alpha\n  color: RED\nbeta\ngamma\n' }
  },
  merge: {
    base: { path: '/samples/base.ts', text: 'head\nbase-1\nmid\nbase-2\ntail\n' },
    ours: { path: '/samples/ours.ts', text: 'head\nours-1\nmid\nours-2\ntail\n' },
    theirs: { path: '/samples/theirs.ts', text: 'head\ntheirs-1\nmid\ntheirs-2\ntail\n' }
  }
}

function range(from: number, to: number): string[] {
  return Array.from({ length: to - from }, (_, index) => `line-${from + index}`)
}

/**
 * A long pair with four distinct difference blocks: a modified line paired with
 * extra added lines, a modified line paired with extra removed lines, a pure
 * insertion and a pure deletion.
 */
const LONG_LEFT = [
  ...range(0, 5),
  'alpha-5',
  ...range(6, 12),
  'alpha-12',
  'beta-12',
  'gamma-12',
  ...range(13, 20),
  ...range(20, 30),
  'left-30',
  ...range(31, 45)
].join('\n')

const LONG_RIGHT = [
  ...range(0, 5),
  'beta-5',
  'gamma-5',
  'delta-5',
  ...range(6, 12),
  'delta-12',
  ...range(13, 20),
  'added-20a',
  'added-20b',
  ...range(20, 30),
  ...range(31, 45)
].join('\n')

const LONG_PAIR = {
  left: { path: '/memory/long-left.ts', text: LONG_LEFT },
  right: { path: '/memory/long-right.ts', text: LONG_RIGHT }
}

const longDiff = diffLineTexts(LONG_LEFT, LONG_RIGHT)

/** One authoritative target for every jump assertion. */
function jumpScrollTop(block: DiffBlock): number {
  return centeredScrollTop({
    startRow: block.startRow,
    endRow: block.endRow,
    rowCount: longDiff.rows.length,
    viewportHeight: PANE_HEIGHT
  })
}

function rulerOf(container: HTMLElement): HTMLElement {
  const ruler = container.querySelector<HTMLElement>('[data-diff-ruler="true"]')
  if (!ruler) throw new Error('no diff ruler was rendered')
  return ruler
}

function markerElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-diff-status]'))
}

function markersOfBlock(container: HTMLElement, block: DiffBlock): HTMLElement[] {
  return markerElements(container).filter((marker) => {
    const start = Number(marker.dataset.startRow)
    const end = Number(marker.dataset.endRow)
    return start <= block.endRow && end >= block.startRow
  })
}

function paneElements(container: HTMLElement): [HTMLDivElement, HTMLDivElement] {
  const panes = Array.from(
    container.querySelectorAll<HTMLDivElement>('div.h-full.overflow-auto')
  )
  if (panes.length !== 2) throw new Error(`expected 2 diff panes, found ${panes.length}`)
  return [panes[0], panes[1]]
}

/** The code view's single overflow trigger. */
function moreTrigger(): HTMLElement {
  const trigger = document.querySelector<HTMLElement>('[data-shell-entry="more"]')
  if (trigger === null) throw new Error('missing more trigger')
  return trigger
}

/** Runs one secondary action through the overflow menu. */
function clickMore(label: string): void {
  const trigger = moreTrigger()
  if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger)
  const menu = screen.queryByRole('menu')
  if (menu === null) throw new Error('more menu did not open')
  fireEvent.click(
    within(menu).getByRole('menuitem', { name: (name: string) => name.includes(label) })
  )
}

/** Drives the web runtime's hidden file picker with a chosen local file. */
function chooseFile(name: string, text: string): void {
  const input = document.querySelector<HTMLInputElement>('input[data-opencompare-picker="file"]')
  if (!input) throw new Error('no open-file input was created')
  fireEvent.change(input, { target: { files: [new File([text], name, { type: 'text/plain' })] } })
}

describe('diff ruler persistence', () => {
  it('is mounted for the built-in sample and the drilldown pair, outside the split panes', () => {
    const sample = render(<CodeView fixture={FIXTURE} defaultMode="diff" platform={createWebPlatformPort()} />)
    const sampleRuler = rulerOf(sample.container)
    const separators = screen.getAllByRole('separator')
    expect(separators).toHaveLength(1)
    // The ruler is a sibling of SplitPane, never one of its panes.
    expect(separators[0].parentElement?.contains(sampleRuler)).toBe(false)
    expect(sampleRuler.parentElement).toBe(separators[0].parentElement?.parentElement)

    cleanup()

    const pair = render(<CodeView pair={LONG_PAIR} platform={createWebPlatformPort()} />)
    const pairRuler = rulerOf(pair.container)
    expect(pairRuler).toBeDefined()

    // The track stays 2px wide with its viewport rectangle and hover line range.
    const track = pairRuler.querySelector<HTMLElement>('[data-ruler-track="true"]')
    expect(track).not.toBeNull()
    expect(track?.style.width).toBe('2px')
    expect(track?.className).toContain('w-0.5')
    expect(track?.querySelector('[data-window-top]')).not.toBeNull()
    expect(track?.querySelector('[data-window-height]')).not.toBeNull()
    expect(pairRuler.className).toContain('pr-1.5')

    const marker = pair.container.querySelector<HTMLElement>('[data-diff-status]')
    expect(marker).not.toBeNull()
    expect(marker?.getAttribute('title')).toMatch(/^.+ · 第 \d+–\d+ 行$/)
  })

  it('is absent in merge mode and survives overwrite, reset and opening a file', async () => {
    const merge = render(
      <CodeView fixture={FIXTURE} defaultMode="merge" platform={createWebPlatformPort()} />
    )
    expect(merge.container.querySelector('[data-diff-ruler]')).toBeNull()
    cleanup()

    const { container } = render(
      <CodeView fixture={FIXTURE} defaultMode="diff" platform={createWebPlatformPort()} />
    )
    expect(rulerOf(container)).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: '覆写到右' }))
    expect(rulerOf(container)).toBeDefined()
    clickMore('重置')
    expect(rulerOf(container)).toBeDefined()
    clickMore('打开左文件')
    chooseFile('left.ts', FIXTURE.diff.right.text)
    await screen.findByText(/已打开 \/memory\/left\.ts/)
    expect(rulerOf(container)).toBeDefined()
    expect(markerElements(container)).toHaveLength(0)
  })
})

describe('diff ruler aggregation', () => {
  it('paints one homogeneous band per maximal non-same run, in row order', () => {
    const { container } = render(<CodeView pair={LONG_PAIR} platform={createWebPlatformPort()} />)
    const markers = markerElements(container)
    expect(markers.length).toBeGreaterThan(0)

    const starts = markers.map((marker) => Number(marker.dataset.startRow))
    expect(starts).toEqual([...starts].sort((left, right) => left - right))

    // Every marker spans only rows of its own status, so no band is collapsed
    // to a block-level summary status.
    for (const marker of markers) {
      const status = marker.dataset.diffStatus
      const start = Number(marker.dataset.startRow)
      const end = Number(marker.dataset.endRow)
      expect(start).toBeGreaterThanOrEqual(0)
      expect(end).toBeLessThan(longDiff.rows.length)
      for (let row = start; row <= end; row += 1) {
        expect(longDiff.rows[row].status).toBe(status)
      }
    }

    // Every non-same row is covered by a marker of exactly its own status.
    longDiff.rows.forEach((row, index) => {
      if (row.status === 'same') return
      const covered = markers.some((marker) => {
        const start = Number(marker.dataset.startRow)
        const end = Number(marker.dataset.endRow)
        return marker.dataset.diffStatus === row.status && start <= index && index <= end
      })
      expect(covered).toBe(true)
    })

    // A single block mixing modified and added rows keeps both statuses.
    const mixed = longDiff.blocks[0]
    expect(mixed.status).toBe('modified')
    const mixedStatuses = new Set(
      markersOfBlock(container, mixed).map((marker) => marker.dataset.diffStatus)
    )
    expect(mixedStatuses).toEqual(new Set(['modified', 'added']))

    // The mirrored case (modified + removed) is preserved too.
    const removal = longDiff.blocks[1]
    expect(removal.status).toBe('modified')
    const removalStatuses = new Set(
      markersOfBlock(container, removal).map((marker) => marker.dataset.diffStatus)
    )
    expect(removalStatuses).toEqual(new Set(['modified', 'removed']))
  })
})

describe('diff ruler viewport window', () => {
  it('follows either pane, keeps both panes in sync and never rebuilds the bands', () => {
    const { container } = render(<CodeView pair={LONG_PAIR} platform={createWebPlatformPort()} />)
    const ruler = rulerOf(container)
    const [left, right] = paneElements(container)
    const markersBefore = markerElements(container)
    const rangesBefore = markersBefore.map((marker) => [
      marker.dataset.startRow,
      marker.dataset.endRow
    ])

    const windowHeight = Number(ruler.querySelector('[data-window-top]')?.getAttribute('data-window-height'))
    expect(windowHeight).toBeGreaterThan(0)
    expect(Number(ruler.querySelector('[data-window-top]')?.getAttribute('data-window-top'))).toBe(0)

    const contentHeight = longDiff.rows.length * DIFF_ROW_HEIGHT
    const expectedTop = (scrollTop: number): number => {
      const maxScroll = Math.max(0, contentHeight - PANE_HEIGHT)
      const scroll = Math.min(maxScroll, Math.max(0, scrollTop))
      return Math.round((TRACK_HEIGHT * scroll) / contentHeight)
    }

    left.scrollTop = 500
    fireEvent.scroll(left)
    expect(right.scrollTop).toBe(500)
    expect(
      Number(ruler.querySelector('[data-window-top]')?.getAttribute('data-window-top'))
    ).toBe(expectedTop(500))

    right.scrollTop = 200
    fireEvent.scroll(right)
    expect(left.scrollTop).toBe(200)
    expect(
      Number(ruler.querySelector('[data-window-top]')?.getAttribute('data-window-top'))
    ).toBe(expectedTop(200))

    // Extreme scroll stays clamped inside the track.
    right.scrollTop = 1_000_000
    fireEvent.scroll(right)
    const top = Number(ruler.querySelector('[data-window-top]')?.getAttribute('data-window-top'))
    const height = Number(
      ruler.querySelector('[data-window-top]')?.getAttribute('data-window-height')
    )
    expect(top).toBeGreaterThanOrEqual(0)
    expect(height).toBeGreaterThanOrEqual(0)
    expect(top + height).toBeLessThanOrEqual(TRACK_HEIGHT + 1)

    const markersAfter = markerElements(container)
    expect(markersAfter).toHaveLength(markersBefore.length)
    expect(markersAfter.map((marker) => [marker.dataset.startRow, marker.dataset.endRow])).toEqual(
      rangesBefore
    )
    // The same DOM nodes survive, so scrolling never rebuilt the bands.
    markersAfter.forEach((marker, index) => expect(marker).toBe(markersBefore[index]))
  })
})

describe('diff ruler jump', () => {
  it('scrolls both panes to the clicked block and keeps counts and badges in sync', () => {
    const { container } = render(<CodeView pair={LONG_PAIR} platform={createWebPlatformPort()} />)
    const [left, right] = paneElements(container)
    const blocks = longDiff.blocks
    expect(blocks.length).toBeGreaterThanOrEqual(4)

    const target = blocks[2]
    fireEvent.click(markersOfBlock(container, target)[0])
    expect(left.scrollTop).toBe(jumpScrollTop(target))
    expect(right.scrollTop).toBe(jumpScrollTop(target))
    expect(screen.getByText(`${target.index + 1}/${blocks.length}`)).toBeDefined()
    expect(screen.getByText('新增')).toBeDefined()
    expect(container.querySelectorAll('.border-accent')).toHaveLength(
      2 * (target.endRow - target.startRow + 1)
    )

    // Consecutive selection moves up again.
    const first = blocks[0]
    fireEvent.click(markersOfBlock(container, first)[0])
    expect(left.scrollTop).toBe(jumpScrollTop(first))
    expect(right.scrollTop).toBe(jumpScrollTop(first))
    expect(screen.getByText(`1/${blocks.length}`)).toBeDefined()

    // Re-clicking the already active band re-targets its block start.
    left.scrollTop = 0
    right.scrollTop = 0
    fireEvent.click(markersOfBlock(container, first)[0])
    expect(left.scrollTop).toBe(jumpScrollTop(first))
    expect(right.scrollTop).toBe(jumpScrollTop(first))
  })
})

describe('diff ruler centred jump', () => {
  it('centres the next block and keeps context above and below both panes', () => {
    const { container } = render(<CodeView pair={LONG_PAIR} platform={createWebPlatformPort()} />)
    const [left, right] = paneElements(container)
    const target = longDiff.blocks[1]
    const blockTop = target.startRow * DIFF_ROW_HEIGHT

    fireEvent.click(screen.getByRole('button', { name: '下一个差异块' }))

    const expected = jumpScrollTop(target)
    expect(left.scrollTop).toBe(expected)
    expect(right.scrollTop).toBe(expected)
    // Centred means the block start sits below the viewport top and the block
    // end sits above the viewport bottom.
    expect(expected).toBeGreaterThanOrEqual(0)
    expect(expected).toBeLessThan(blockTop)
    expect(expected + PANE_HEIGHT).toBeGreaterThan((target.endRow + 1) * DIFF_ROW_HEIGHT)
  })

  it('clamps the first and last blocks into the legal scroll range', () => {
    const pair = {
      left: { path: '/memory/clamp-left.ts', text: 'a\nb\nc\nd\ne\n' },
      right: { path: '/memory/clamp-right.ts', text: 'A\nb\nc\nd\nE\n' }
    }
    const clampDiff = diffLineTexts(pair.left.text, pair.right.text)
    expect(clampDiff.blocks.length).toBe(2)
    const { container } = render(<CodeView pair={pair} platform={createWebPlatformPort()} />)
    const [left, right] = paneElements(container)
    const maxScroll = maxScrollTop(clampDiff.rows.length, PANE_HEIGHT)

    // Initial block 0 -> next moves to the last block, which clamps to max scroll.
    fireEvent.click(screen.getByRole('button', { name: '下一个差异块' }))
    expect(left.scrollTop).toBe(maxScroll)
    expect(right.scrollTop).toBe(maxScroll)

    fireEvent.click(screen.getByRole('button', { name: '上一个差异块' }))
    expect(left.scrollTop).toBe(0)
    expect(right.scrollTop).toBe(0)
  })

  it('pins a short document to the top', () => {
    const pair = {
      left: { path: '/memory/short-left.ts', text: 'a\nb\n' },
      right: { path: '/memory/short-right.ts', text: 'A\nb\n' }
    }
    const shortDiff = diffLineTexts(pair.left.text, pair.right.text)
    expect(maxScrollTop(shortDiff.rows.length, PANE_HEIGHT)).toBe(0)
    const { container } = render(<CodeView pair={pair} platform={createWebPlatformPort()} />)
    const [left, right] = paneElements(container)

    fireEvent.click(screen.getByRole('button', { name: '下一个差异块' }))
    expect(left.scrollTop).toBe(0)
    expect(right.scrollTop).toBe(0)
  })

  it('falls back to the block top when the viewport height is unknown', () => {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return this.dataset.diffRuler === 'true' ? TRACK_HEIGHT : 0
      }
    })
    const { container } = render(<CodeView pair={LONG_PAIR} platform={createWebPlatformPort()} />)
    const [left, right] = paneElements(container)
    const target = longDiff.blocks[2]

    fireEvent.click(markersOfBlock(container, target)[0])
    expect(left.scrollTop).toBe(target.startRow * DIFF_ROW_HEIGHT)
    expect(right.scrollTop).toBe(target.startRow * DIFF_ROW_HEIGHT)
    expect(Number.isFinite(left.scrollTop)).toBe(true)
  })

  it('falls back to the block top when the block is taller than the viewport', () => {
    const pair = {
      left: { path: '/memory/tall-left.ts', text: 'a\nb\nc\n' },
      right: { path: '/memory/tall-right.ts', text: 'a\nx1\nx2\nx3\nx4\nx5\nx6\nb\nc\n' }
    }
    const tallDiff = diffLineTexts(pair.left.text, pair.right.text)
    const block = tallDiff.blocks[0]
    expect((block.endRow - block.startRow + 1) * DIFF_ROW_HEIGHT).toBeGreaterThanOrEqual(PANE_HEIGHT)
    const { container } = render(<CodeView pair={pair} platform={createWebPlatformPort()} />)
    const [left, right] = paneElements(container)

    fireEvent.click(markersOfBlock(container, block)[0])
    expect(left.scrollTop).toBe(block.startRow * DIFF_ROW_HEIGHT)
    expect(right.scrollTop).toBe(block.startRow * DIFF_ROW_HEIGHT)
  })

  it('is stable on a repeated jump and after a sync scroll event', () => {
    const { container } = render(<CodeView pair={LONG_PAIR} platform={createWebPlatformPort()} />)
    const [left, right] = paneElements(container)
    const target = longDiff.blocks[2]

    fireEvent.click(markersOfBlock(container, target)[0])
    const first = left.scrollTop
    fireEvent.click(markersOfBlock(container, target)[0])
    expect(left.scrollTop).toBe(first)
    expect(right.scrollTop).toBe(first)

    fireEvent.scroll(left)
    expect(right.scrollTop).toBe(left.scrollTop)
  })
})

describe('diff ruler keyboard', () => {
  it('is focusable, wraps with arrows and re-targets with Enter', () => {
    const { container } = render(<CodeView pair={LONG_PAIR} platform={createWebPlatformPort()} />)
    const ruler = rulerOf(container)
    const [left, right] = paneElements(container)
    const blocks = longDiff.blocks

    expect(ruler.getAttribute('aria-label')).toBe('差异指示条')
    expect(ruler.className).toContain('focus-ring')
    expect(ruler.tabIndex).toBe(0)

    ruler.focus()
    fireEvent.keyDown(ruler, { key: 'ArrowDown' })
    expect(screen.getByText(`2/${blocks.length}`)).toBeDefined()
    expect(left.scrollTop).toBe(jumpScrollTop(blocks[1]))
    expect(right.scrollTop).toBe(jumpScrollTop(blocks[1]))

    fireEvent.keyDown(ruler, { key: 'ArrowUp' })
    expect(left.scrollTop).toBe(jumpScrollTop(blocks[0]))

    // ArrowUp on the first block wraps to the last one.
    fireEvent.keyDown(ruler, { key: 'ArrowUp' })
    const last = blocks[blocks.length - 1]
    expect(left.scrollTop).toBe(jumpScrollTop(last))
    expect(screen.getByText(`${blocks.length}/${blocks.length}`)).toBeDefined()

    // ArrowDown on the last block wraps back to the first.
    fireEvent.keyDown(ruler, { key: 'ArrowDown' })
    expect(left.scrollTop).toBe(jumpScrollTop(blocks[0]))

    left.scrollTop = 0
    right.scrollTop = 0
    fireEvent.keyDown(ruler, { key: 'Enter' })
    expect(left.scrollTop).toBe(jumpScrollTop(blocks[0]))
    expect(right.scrollTop).toBe(jumpScrollTop(blocks[0]))
  })

  it('names every marker with its status and row range, in zh and en', () => {
    const zh = render(<CodeView pair={LONG_PAIR} platform={createWebPlatformPort()} />)
    const marker = markerElements(zh.container)[0]
    const status = marker.dataset.diffStatus
    const start = Number(marker.dataset.startRow) + 1
    const end = Number(marker.dataset.endRow) + 1
    const statusLabels: Record<string, string> = {
      added: '新增',
      removed: '删除',
      modified: '修改'
    }
    expect(marker.getAttribute('aria-label')).toBe(
      `${statusLabels[status as string]} · 第 ${start}–${end} 行`
    )
    cleanup()

    const en = renderWithI18n(<CodeView pair={LONG_PAIR} platform={createWebPlatformPort()} />, 'en')
    const enRuler = rulerOf(en.container)
    expect(enRuler.getAttribute('aria-label')).toBe('Difference ruler')
    expect(markerElements(en.container)[0].getAttribute('aria-label')).toMatch(
      /^(Added|Removed|Modified) · lines \d+–\d+$/
    )
    expect(en.container.textContent).not.toMatch(/\p{Script=Han}/u)
  })
})

describe('diff ruler empty and edge cases', () => {
  it('stays mounted with zero markers for an empty diff', () => {
    const port = createWebPlatformPort()
    const { container } = render(
      <CodeView pair={{ left: { path: '/e/l', text: '' }, right: { path: '/e/r', text: '' } }} platform={port} />
    )

    expect(rulerOf(container)).toBeDefined()
    expect(markerElements(container)).toHaveLength(0)
    expect(screen.getByText('0/0')).toBeDefined()
    expect(screen.getByRole('button', { name: '上一个差异块' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: '下一个差异块' }).hasAttribute('disabled')).toBe(true)
  })

  it('keeps an empty ruler for identical files while the window still tracks scrolling', () => {
    const text = range(0, 30).join('\n')
    const { container } = render(
      <CodeView
        pair={{ left: { path: '/same/l', text }, right: { path: '/same/r', text } }}
        platform={createWebPlatformPort()}
      />
    )
    const ruler = rulerOf(container)
    const [left] = paneElements(container)

    expect(markerElements(container)).toHaveLength(0)
    expect(
      Number(ruler.querySelector('[data-window-top]')?.getAttribute('data-window-height'))
    ).toBeGreaterThan(0)
    expect(
      Number(ruler.querySelector('[data-window-top]')?.getAttribute('data-window-top'))
    ).toBe(0)

    left.scrollTop = 300
    fireEvent.scroll(left)
    expect(
      Number(ruler.querySelector('[data-window-top]')?.getAttribute('data-window-top'))
    ).toBeGreaterThan(0)
  })

  it('paints only the real side for one-sided diffs and never overflows the rows', () => {
    const cases = [
      { left: 'a\nb\nc\n', right: 'a\nc\n' },
      { left: 'a\nc\n', right: 'a\nb\nc\n' },
      { left: 'a\nb\n', right: 'a\nb\nc\n' },
      { left: 'only', right: 'changed' },
      { left: 'a\r\nb\r\n', right: 'a\r\nc\r\n' },
      { left: 'a\nb', right: 'a\nb\nc' }
    ] as const

    for (const sample of cases) {
      const { container } = render(
        <CodeView
          pair={{
            left: { path: '/edge/l', text: sample.left },
            right: { path: '/edge/r', text: sample.right }
          }}
          platform={createWebPlatformPort()}
        />
      )
      const rows = diffLineTexts(sample.left, sample.right).rows
      const markers = markerElements(container)
      expect(markers.length).toBeGreaterThan(0)
      for (const marker of markers) {
        const status = marker.dataset.diffStatus
        const start = Number(marker.dataset.startRow)
        const end = Number(marker.dataset.endRow)
        expect(start).toBeGreaterThanOrEqual(0)
        expect(end).toBeLessThan(rows.length)
        expect(start).toBeLessThanOrEqual(end)
        for (let row = start; row <= end; row += 1) {
          expect(rows[row].status).toBe(status)
        }
      }
      // One-sided samples never paint a status the row model does not carry.
      const rowStatuses = new Set(rows.map((row) => row.status))
      for (const marker of markers) {
        expect(rowStatuses.has(marker.dataset.diffStatus as typeof rows[number]['status'])).toBe(
          true
        )
      }
      cleanup()
    }
  })

  it('does not re-diff or touch the platform while scrolling and selecting', () => {
    const base = createWebPlatformPort()
    const readTextFile = vi.fn(base.readTextFile)
    const selectFile = vi.fn(base.selectFile)
    const port: PlatformPort = { ...base, readTextFile, selectFile }
    const { container } = render(<CodeView pair={LONG_PAIR} platform={port} />)
    const [left] = paneElements(container)
    const ruler = rulerOf(container)
    diffCalls.mockClear()

    left.scrollTop = 300
    fireEvent.scroll(left)
    fireEvent.click(markersOfBlock(container, longDiff.blocks[0])[0])
    fireEvent.keyDown(ruler, { key: 'ArrowDown' })

    expect(diffCalls).not.toHaveBeenCalled()
    expect(readTextFile).not.toHaveBeenCalled()
    expect(selectFile).not.toHaveBeenCalled()
  })
})
