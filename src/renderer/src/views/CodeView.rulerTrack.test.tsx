// @vitest-environment jsdom
import { useRef } from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiffBlock, DiffRow, LineDiffResult } from '@core/text/diff'
import { buildRulerBands, nearestBlockIndex, resolveJumpTargetAtRatio } from '@core/text/ruler'
import { DIFF_ROW_HEIGHT } from '@renderer/components/DiffPane'
import { DiffRuler } from '@renderer/components/DiffRuler'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { CodeView } from './CodeView'

// The 350k model is pre-built; the view must never run the real diff engine.
const diffModel = vi.hoisted(() => ({ current: null as LineDiffResult | null }))

vi.mock('@core/text/diff', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@core/text/diff')>()
  return { ...actual, diffLineTexts: vi.fn(() => diffModel.current ?? { rows: [], blocks: [] }) }
})

// Pass-through spy: the projection must run once per measured track height.
vi.mock('@core/text/ruler', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@core/text/ruler')>()
  return { ...actual, buildRulerBands: vi.fn(actual.buildRulerBands) }
})

const projections = vi.mocked(buildRulerBands)

/** The L3 fail geometry: 350,000 rows, a 608px ruler track, 4px bands. */
const ROW_COUNT = 350_000
const TRACK_HEIGHT = 608
const BAND_HEIGHT = 4
/** jsdom has no layout, so the track reports its own rect and the panes a box. */
const TRACK_TOP = 120
const TRACK_WIDTH = 36
const PANE_HEIGHT = 400
const VIEWPORT_ROWS = Math.ceil(PANE_HEIGHT / DIFF_ROW_HEIGHT)
const OVERSCAN = 10
const ROW_LIMIT = VIEWPORT_ROWS + 2 * OVERSCAN
/** At most one marker per status per bucket. */
const MARKER_LIMIT = 3 * Math.floor(TRACK_HEIGHT / BAND_HEIGHT)
/** Marker height floor rendered by `DiffRuler`. */
const MARKER_MIN_HEIGHT = 2

const RUN_STRIDE = 2_400
const RUN_LENGTH = 20

const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')

function readClientHeight(this: HTMLElement): number {
  return this.dataset.diffRuler === 'true' ? TRACK_HEIGHT : PANE_HEIGHT
}

let model: LineDiffResult

/** 350k rows with a 20-row modified block every 2,400 rows: 146 navigation blocks. */
function buildModel(): LineDiffResult {
  const rows = new Array<DiffRow>(ROW_COUNT)
  const blocks: DiffBlock[] = []

  for (let startRow = 0; startRow < ROW_COUNT; startRow += RUN_STRIDE) {
    const endRow = Math.min(ROW_COUNT - 1, startRow + RUN_LENGTH - 1)
    blocks.push({
      index: blocks.length,
      status: 'modified',
      startRow,
      endRow,
      leftStart: startRow,
      leftCount: endRow - startRow + 1,
      rightStart: startRow,
      rightCount: endRow - startRow + 1
    })
  }

  for (let index = 0; index < ROW_COUNT; index += 1) {
    const modified = index % RUN_STRIDE < RUN_LENGTH
    const line = index + 1
    rows[index] = {
      status: modified ? 'modified' : 'same',
      leftLine: line,
      rightLine: line,
      leftText: `left ${line}`,
      rightText: modified ? `right ${line}` : `left ${line}`,
      leftIndex: index,
      rightIndex: index
    }
  }

  return { rows, blocks }
}

beforeAll(() => {
  model = buildModel()
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: readClientHeight
  })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 1200
  })
})

afterAll(() => {
  if (originalClientHeight) {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight)
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight')
  }
  if (originalClientWidth) {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth)
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
  }
})

beforeEach(() => {
  diffModel.current = model
  projections.mockClear()
})

afterEach(cleanup)

const PAIR = {
  left: { path: '/memory/left.ts', text: 'left' },
  right: { path: '/memory/right.ts', text: 'right' }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function renderDiff(): {
  container: HTMLElement
  ruler: HTMLElement
  panes: [HTMLDivElement, HTMLDivElement]
} {
  const { container } = render(<CodeView pair={PAIR} platform={createWebPlatformPort()} />)
  const ruler = container.querySelector<HTMLElement>('[data-diff-ruler="true"]')
  if (!ruler) throw new Error('no diff ruler was rendered')
  // A real browser gives the track a laid-out rect; jsdom's is all zeros.
  ruler.getBoundingClientRect = () =>
    ({
      x: 0,
      y: TRACK_TOP,
      top: TRACK_TOP,
      left: 0,
      right: TRACK_WIDTH,
      bottom: TRACK_TOP + TRACK_HEIGHT,
      width: TRACK_WIDTH,
      height: TRACK_HEIGHT,
      toJSON: () => ({})
    }) as DOMRect

  const panes = Array.from(container.querySelectorAll<HTMLDivElement>('div.h-full.overflow-auto'))
  if (panes.length !== 2) throw new Error(`expected 2 diff panes, found ${panes.length}`)
  return { container, ruler, panes: [panes[0], panes[1]] }
}

function contentOf(pane: HTMLElement): HTMLElement {
  const content = pane.firstElementChild
  if (!(content instanceof HTMLElement)) throw new Error('pane has no content box')
  return content
}

/** The toolbar's `index+1/total` readout, parsed into a 0-based index. */
function selectedCount(container: HTMLElement): { index: number; total: number } {
  const readout = Array.from(container.querySelectorAll('span')).find((element) =>
    /^\d+\/\d+$/.test(element.textContent?.trim() ?? '')
  )
  const match = /^(\d+)\/(\d+)$/.exec(readout?.textContent?.trim() ?? '')
  if (!match) throw new Error('no block count was rendered')
  return { index: Number(match[1]) - 1, total: Number(match[2]) }
}

function clickTrack(ruler: HTMLElement, offset: number): void {
  fireEvent.click(ruler, { clientY: TRACK_TOP + offset })
}

/* ------------------------------------------------------------------ */
/* Track-level hit                                                     */
/* ------------------------------------------------------------------ */

describe('diff ruler track hit at 350k rows', () => {
  it('selects the ratio-resolved block when the track itself is clicked', () => {
    const { container, ruler, panes } = renderDiff()
    const expected = resolveJumpTargetAtRatio(
      model.blocks,
      304 / TRACK_HEIGHT,
      ROW_COUNT,
      DIFF_ROW_HEIGHT
    )
    expect(expected.blockIndex).toBeGreaterThan(0)

    clickTrack(ruler, 304)

    expect(selectedCount(container)).toEqual({
      index: expected.blockIndex,
      total: model.blocks.length
    })
    expect(panes[0].scrollTop).toBe(expected.startRow * DIFF_ROW_HEIGHT)
    expect(panes[1].scrollTop).toBe(panes[0].scrollTop)
  })

  it('maps the track top, middle and end onto monotonic blocks', () => {
    const { container, ruler } = renderDiff()
    const offsets = [0, 304, 607]
    const selected = offsets.map((offset) => {
      const expected = resolveJumpTargetAtRatio(
        model.blocks,
        offset / TRACK_HEIGHT,
        ROW_COUNT,
        DIFF_ROW_HEIGHT
      )
      clickTrack(ruler, offset)
      expect(selectedCount(container).index).toBe(expected.blockIndex)
      return expected.blockIndex
    })

    expect(selected[1]).toBeGreaterThanOrEqual(selected[0])
    expect(selected[2]).toBeGreaterThanOrEqual(selected[1])
    expect(new Set(selected).size).toBeGreaterThanOrEqual(2)
  })

  it('has no dead zone: every track position hits its ratio block and syncs both panes', () => {
    const { container, ruler, panes } = renderDiff()
    const offsets = Array.from({ length: 25 }, (_, step) => Math.round((step * 607) / 24))
    let changes = 0

    for (const offset of offsets) {
      const before = selectedCount(container).index
      const expected = resolveJumpTargetAtRatio(
        model.blocks,
        offset / TRACK_HEIGHT,
        ROW_COUNT,
        DIFF_ROW_HEIGHT
      )
      expect(expected.blockIndex).toBeGreaterThanOrEqual(0)

      clickTrack(ruler, offset)

      expect(selectedCount(container).index).toBe(expected.blockIndex)
      expect(panes[0].scrollTop).toBe(expected.startRow * DIFF_ROW_HEIGHT)
      expect(panes[1].scrollTop).toBe(panes[0].scrollTop)
      if (expected.blockIndex !== before) changes += 1
    }

    expect(changes).toBeGreaterThanOrEqual(10)
  })

  it('keeps a marker click on its own block without a second track selection', () => {
    const { container, ruler, panes } = renderDiff()
    const markers = Array.from(ruler.querySelectorAll<HTMLElement>('[data-diff-status]'))
    const marker = markers[Math.floor(markers.length / 2)]
    const expected = nearestBlockIndex(model.blocks, Number(marker.dataset.startRow))
    expect(expected).toBeGreaterThan(0)

    fireEvent.click(marker)

    // A bubbling track hit would have picked the top of the track instead.
    expect(selectedCount(container).index).toBe(expected)
    expect(panes[0].scrollTop).toBe(model.blocks[expected].startRow * DIFF_ROW_HEIGHT)
    expect(panes[1].scrollTop).toBe(panes[0].scrollTop)
  })

  it('calls onSelectBlock exactly once for a marker click', () => {
    const onSelectBlock = vi.fn()
    const { container } = render(
      <RulerHarness rows={model.rows} blocks={model.blocks} onSelectBlock={onSelectBlock} />
    )
    const ruler = container.querySelector<HTMLElement>('[data-diff-ruler="true"]')
    if (!ruler) throw new Error('no diff ruler was rendered')
    ruler.getBoundingClientRect = () => ({ top: TRACK_TOP, height: TRACK_HEIGHT }) as DOMRect

    const markers = Array.from(ruler.querySelectorAll<HTMLElement>('[data-diff-status]'))
    const marker = markers[Math.floor(markers.length / 2)]
    fireEvent.click(marker)

    expect(onSelectBlock).toHaveBeenCalledTimes(1)
    expect(onSelectBlock).toHaveBeenCalledWith(
      nearestBlockIndex(model.blocks, Number(marker.dataset.startRow))
    )
  })
})

function RulerHarness({
  rows,
  blocks,
  onSelectBlock
}: {
  readonly rows: readonly DiffRow[]
  readonly blocks: readonly DiffBlock[]
  readonly onSelectBlock: (index: number) => void
}): React.JSX.Element {
  const leftScroll = useRef<HTMLDivElement>(null)
  const rightScroll = useRef<HTMLDivElement>(null)
  return (
    <div>
      <div ref={leftScroll} />
      <div ref={rightScroll} />
      <DiffRuler
        rows={rows}
        blocks={blocks}
        activeBlock={null}
        leftScroll={leftScroll}
        rightScroll={rightScroll}
        onSelectBlock={onSelectBlock}
        onStepBlock={() => undefined}
        onJumpActive={() => undefined}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Marker geometry and projection budget                               */
/* ------------------------------------------------------------------ */

describe('diff ruler marker floor at 350k rows', () => {
  it('paints every marker at the clickable floor without leaving the track', () => {
    const { ruler } = renderDiff()
    const bands = buildRulerBands(model.rows, {
      trackHeight: TRACK_HEIGHT,
      bandHeight: BAND_HEIGHT
    })
    const markers = Array.from(ruler.querySelectorAll<HTMLElement>('[data-diff-status]'))

    expect(markers).toHaveLength(bands.length)
    expect(bands.some((band) => band.height < MARKER_MIN_HEIGHT)).toBe(true)

    markers.forEach((marker, index) => {
      const band = bands[index]
      const top = Number.parseFloat(marker.style.top)
      const height = Number.parseFloat(marker.style.height)

      expect(height).toBeGreaterThanOrEqual(MARKER_MIN_HEIGHT)
      expect(top).toBeGreaterThanOrEqual(0)
      expect(top + height).toBeLessThanOrEqual(TRACK_HEIGHT + 1e-6)
      // The floor is visual only: the projected row range is unchanged.
      expect(marker.dataset.startRow).toBe(String(band.startRow))
      expect(marker.dataset.endRow).toBe(String(band.endRow))
      expect(marker.dataset.diffStatus).toBe(band.status)
    })
  })

  it('projects once per measured track and never per row or per click', () => {
    const { ruler, panes } = renderDiff()
    expect(
      projections.mock.calls.filter(([, geometry]) => geometry.trackHeight === TRACK_HEIGHT)
    ).toHaveLength(1)
    const atMount = projections.mock.calls.length

    const markers = ruler.querySelectorAll('[data-diff-status]')
    expect(markers.length).toBeLessThanOrEqual(MARKER_LIMIT)
    expect(ruler.textContent?.trim()).toBe('')

    clickTrack(ruler, 304)
    clickTrack(ruler, 100)
    panes[0].scrollTop = 1_000
    fireEvent.scroll(panes[0])

    expect(projections.mock.calls.length).toBe(atMount)
    expect(ruler.querySelectorAll('[data-diff-status]')).toHaveLength(markers.length)
  })
})

/* ------------------------------------------------------------------ */
/* Windowed panes under a track hit                                    */
/* ------------------------------------------------------------------ */

describe('windowed panes after a track hit', () => {
  it('follows a track click into the rendered window without any scroll event', () => {
    const { ruler, panes } = renderDiff()
    const offset = 400
    const expected = resolveJumpTargetAtRatio(
      model.blocks,
      offset / TRACK_HEIGHT,
      ROW_COUNT,
      DIFF_ROW_HEIGHT
    )
    expect(expected.startRow).toBeGreaterThan(0)

    clickTrack(ruler, offset)

    expect(panes[0].scrollTop).toBe(expected.startRow * DIFF_ROW_HEIGHT)
    expect(panes[1].scrollTop).toBe(panes[0].scrollTop)
    for (const pane of panes) {
      expect(contentOf(pane).dataset.diffWindowStart).toBe(String(expected.startRow))
    }

    const leftRow = panes[0].querySelector<HTMLElement>(`[data-diff-row="${expected.startRow}"]`)
    expect(leftRow).not.toBeNull()
    expect(leftRow?.textContent).toContain(`left ${expected.startRow + 1}`)
    const rightRow = panes[1].querySelector<HTMLElement>(`[data-diff-row="${expected.startRow}"]`)
    expect(rightRow).not.toBeNull()
    // The block's first row is a modified line, so the right side differs.
    expect(rightRow?.textContent).toContain(`right ${expected.startRow + 1}`)
  })

  it('keeps both panes windowed with the exact rows × 20 content height', () => {
    const { ruler, panes } = renderDiff()
    const contentHeight = ROW_COUNT * DIFF_ROW_HEIGHT

    for (const pane of panes) {
      expect(pane.querySelectorAll('[data-diff-row]').length).toBeLessThanOrEqual(ROW_LIMIT)
      expect(contentOf(pane).dataset.diffContentHeight).toBe(String(contentHeight))
      expect(contentOf(pane).style.height).toBe(`${contentHeight}px`)
    }
    expect(panes[0].querySelectorAll('[data-diff-row]').length).toBe(
      panes[1].querySelectorAll('[data-diff-row]').length
    )
    expect(ruler.querySelectorAll('[data-diff-row]')).toHaveLength(0)
  })

  it('does not jump or throw when the model has no difference blocks', () => {
    const sameRows = Array.from({ length: 1_200 }, (_, index) => ({
      status: 'same' as const,
      leftLine: index + 1,
      rightLine: index + 1,
      leftText: `left ${index + 1}`,
      rightText: `left ${index + 1}`,
      leftIndex: index,
      rightIndex: index
    }))

    for (const empty of [{ rows: sameRows, blocks: [] }, { rows: [], blocks: [] }]) {
      diffModel.current = empty
      const { container } = render(<CodeView pair={PAIR} platform={createWebPlatformPort()} />)
      const ruler = container.querySelector<HTMLElement>('[data-diff-ruler="true"]')
      if (!ruler) throw new Error('no diff ruler was rendered')
      ruler.getBoundingClientRect = () =>
        ({ top: TRACK_TOP, height: TRACK_HEIGHT }) as DOMRect

      const panes = Array.from(container.querySelectorAll<HTMLDivElement>('div.h-full.overflow-auto'))
      panes[0].scrollTop = 200
      panes[1].scrollTop = 200

      for (const offset of [0, 304, 607]) clickTrack(ruler, offset)

      expect(panes[0].scrollTop).toBe(200)
      expect(panes[1].scrollTop).toBe(200)
      expect(selectedCount(container)).toEqual({ index: -1, total: 0 })
      expect(ruler.querySelector('[data-window-top]')).not.toBeNull()
      cleanup()
    }
  })
})
