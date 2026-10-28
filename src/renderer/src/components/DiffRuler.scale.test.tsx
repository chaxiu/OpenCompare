// @vitest-environment jsdom
import { useRef } from 'react'
import { act, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { INLINE_CHAR_LIMIT, diffLineTexts } from '@core/text/diff'
import type { DiffBlock, DiffRow } from '@core/text/diff'
import { buildRulerBands } from '@core/text/ruler'
import { renderWithI18n } from '@renderer/i18n/testing'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import type { PlatformPort } from '@shared/platform/types'
import { CodeView } from '@renderer/views/CodeView'
import { DiffRuler } from './DiffRuler'

// Pass-through spies: the projection must run once per geometry and never re-diff.
vi.mock('@core/text/ruler', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@core/text/ruler')>()
  return { ...actual, buildRulerBands: vi.fn(actual.buildRulerBands) }
})
vi.mock('@core/text/diff', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@core/text/diff')>()
  return { ...actual, diffLineTexts: vi.fn(actual.diffLineTexts) }
})

const projections = vi.mocked(buildRulerBands)
const diffCalls = vi.mocked(diffLineTexts)

const ROW_COUNT = 358_000
/** Track geometry used by the scale guards (bandHeight follows RULER_BAND_HEIGHT). */
const TRACK_HEIGHT = 800
const SHRUNK_TRACK_HEIGHT = 640
const BAND_HEIGHT = 4
/** At most one marker per status per bucket: 3 * buckets is the painted ceiling. */
const MAX_MARKERS = 3 * Math.floor(TRACK_HEIGHT / BAND_HEIGHT)
/** jsdom reports zero-sized elements, so panes get a fixed viewport instead. */
const PANE_HEIGHT = 100

/* ------------------------------------------------------------------ */
/* Synthetic row models — built directly, never through `diffLineTexts` */
/* ------------------------------------------------------------------ */

function row(status: DiffRow['status'], index: number, text?: string): DiffRow {
  const body = text ?? `${status}-${index}`
  return {
    status,
    leftLine: status === 'added' ? null : index + 1,
    rightLine: status === 'removed' ? null : index + 1,
    leftText: status === 'added' ? null : body,
    rightText: status === 'removed' ? null : body,
    leftIndex: index,
    rightIndex: index
  }
}

/** Repeats a handful of shared row objects, so 358k rows hold no per-row strings. */
function cyclicRows(cycle: readonly DiffRow[], rowCount = ROW_COUNT): DiffRow[] {
  const rows = new Array<DiffRow>(rowCount)
  for (let index = 0; index < rowCount; index += 1) rows[index] = cycle[index % cycle.length]
  return rows
}

const ALTERNATING_CYCLE: readonly DiffRow[] = [
  row('added', 0),
  row('removed', 0),
  row('modified', 0),
  row('same', 0)
]
const SAME_CYCLE: readonly DiffRow[] = [row('same', 0)]
const REMOVED_CYCLE: readonly DiffRow[] = [row('same', 0), row('same', 0), row('removed', 0)]
const ADDED_CYCLE: readonly DiffRow[] = [row('same', 0), row('same', 0), row('added', 0)]

/**
 * A coarse block list: the ruler only needs a block index per band, and a
 * per-row block model would make `nearestBlockIndex` quadratic in this test.
 */
function sampledBlocks(rowCount: number, stride = 1000): DiffBlock[] {
  const blocks: DiffBlock[] = []
  for (let startRow = 0; startRow < rowCount; startRow += stride) {
    const endRow = Math.min(rowCount - 1, startRow + 3)
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
  return blocks
}

/* ------------------------------------------------------------------ */
/* jsdom geometry: track height stub + a triggerable ResizeObserver     */
/* ------------------------------------------------------------------ */

let trackHeight = TRACK_HEIGHT

function readClientHeight(this: HTMLElement): number {
  return this.dataset.diffRuler === 'true' ? trackHeight : PANE_HEIGHT
}

const resizeObservers: { fire: () => void }[] = []

class StubResizeObserver {
  private readonly callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    resizeObservers.push({ fire: () => this.callback([], this as unknown as ResizeObserver) })
  }

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const originalClientHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'clientHeight'
)

beforeEach(() => {
  trackHeight = TRACK_HEIGHT
  resizeObservers.length = 0
  projections.mockClear()
  diffCalls.mockClear()
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: readClientHeight
  })
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = StubResizeObserver
})

afterEach(() => {
  cleanup()
  delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
  if (originalClientHeight) {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight)
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight')
  }
})

/* ------------------------------------------------------------------ */
/* Harness: the ruler plus the two scroll containers it listens to      */
/* ------------------------------------------------------------------ */

function RulerHarness({
  rows,
  blocks,
  onSelectBlock
}: {
  readonly rows: readonly DiffRow[]
  readonly blocks: readonly DiffBlock[]
  readonly onSelectBlock?: (index: number) => void
}) {
  const leftScroll = useRef<HTMLDivElement>(null)
  const rightScroll = useRef<HTMLDivElement>(null)
  return (
    <div>
      <div ref={leftScroll} data-testid="left-pane" />
      <div ref={rightScroll} data-testid="right-pane" />
      <DiffRuler
        rows={rows}
        blocks={blocks}
        activeBlock={null}
        leftScroll={leftScroll}
        rightScroll={rightScroll}
        onSelectBlock={onSelectBlock ?? (() => undefined)}
        onStepBlock={() => undefined}
        onJumpActive={() => undefined}
      />
    </div>
  )
}

function rulerOf(container: HTMLElement): HTMLElement {
  const ruler = container.querySelector<HTMLElement>('[data-diff-ruler="true"]')
  if (!ruler) throw new Error('no diff ruler was rendered')
  return ruler
}

function markerElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-diff-status]'))
}

function paneElements(container: HTMLElement): [HTMLDivElement, HTMLDivElement] {
  const left = container.querySelector<HTMLDivElement>('[data-testid="left-pane"]')
  const right = container.querySelector<HTMLDivElement>('[data-testid="right-pane"]')
  if (!left || !right) throw new Error('the harness panes are missing')
  return [left, right]
}

function markerBox(marker: HTMLElement): { top: number; height: number } {
  return { top: Number.parseFloat(marker.style.top), height: Number.parseFloat(marker.style.height) }
}

function windowBox(ruler: HTMLElement): { top: number; height: number } {
  const element = ruler.querySelector<HTMLElement>('[data-window-top]')
  if (!element) throw new Error('the viewport window is missing')
  return {
    top: Number(element.getAttribute('data-window-top')),
    height: Number(element.getAttribute('data-window-height'))
  }
}

/** Projections that received a measured track (the 0-height pre-measure pass is degenerate). */
function measuredProjections(height: number): Parameters<typeof buildRulerBands>[] {
  return projections.mock.calls.filter(([, geometry]) => geometry.trackHeight === height)
}

function rangesOf(container: HTMLElement): string[] {
  return markerElements(container).map(
    (marker) =>
      `${marker.dataset.diffStatus}:${marker.dataset.startRow}-${marker.dataset.endRow}`
  )
}

/* ------------------------------------------------------------------ */
/* ac-scale-single-pass                                                */
/* ------------------------------------------------------------------ */

describe('diff ruler at 358k rows', () => {
  it('projects once per measured track height and keeps the caller row array', () => {
    const rows = cyclicRows(ALTERNATING_CYCLE)
    const blocks = sampledBlocks(rows.length)

    renderWithI18n(<RulerHarness rows={rows} blocks={blocks} />)

    const measured = measuredProjections(TRACK_HEIGHT)
    expect(measured).toHaveLength(1)
    // Strict identity: the projection consumed the live row model, no copy.
    expect(measured[0][0]).toBe(rows)
    for (const [projectedRows] of projections.mock.calls) expect(projectedRows).toBe(rows)
  })

  /* ---------------------------------------------------------------- */
  /* ac-scale-marker-bound                                             */
  /* ---------------------------------------------------------------- */

  it('paints a marker count bounded by the track geometry, never per row', () => {
    const rows = cyclicRows(ALTERNATING_CYCLE)
    const blocks = sampledBlocks(rows.length)

    const { container } = renderWithI18n(<RulerHarness rows={rows} blocks={blocks} />)
    const markers = markerElements(container)

    expect(markers.length).toBeGreaterThan(0)
    expect(markers.length).toBeLessThanOrEqual(MAX_MARKERS)
    expect(markers.length).toBeLessThan(rows.length / 100)

    for (const marker of markers) {
      const { top, height } = markerBox(marker)
      expect(top).toBeGreaterThanOrEqual(0)
      expect(height).toBeGreaterThanOrEqual(0)
      expect(top + height).toBeLessThanOrEqual(TRACK_HEIGHT + 1e-6)
      expect(['added', 'removed', 'modified']).toContain(marker.dataset.diffStatus)
    }

    // No per-row text: the ruler is a colour track, not a thumbnail.
    expect(rulerOf(container).textContent?.trim()).toBe('')
  })

  /* ---------------------------------------------------------------- */
  /* ac-scale-row-coverage                                             */
  /* ---------------------------------------------------------------- */

  // Explicit per-test timeout instead of the 5000ms default: CI attempt1 measured
  // 6,816ms for this case ("Error: Test timed out in 5000ms."), while the same
  // tree runs the full local suite in 27.42s (69 files / 1104 passed). The 30s
  // cap keeps ~4.4x headroom; the 358k scale and the row-by-row coverage
  // assertions below are unchanged.
  it('covers every non-same row with a same-status marker in one synchronised pass', () => {
    const rows = cyclicRows(ALTERNATING_CYCLE)
    const blocks = sampledBlocks(rows.length)

    const { container } = renderWithI18n(<RulerHarness rows={rows} blocks={blocks} />)
    const markers = markerElements(container)

    // Markers are painted in ascending start row order, so same-status ranges
    // only ever move forward: one pointer per status keeps this O(rows + markers).
    const byStatus: Record<string, { startRow: number; endRow: number }[]> = {
      added: [],
      removed: [],
      modified: []
    }
    for (const marker of markers) {
      const status = marker.dataset.diffStatus as string
      byStatus[status].push({
        startRow: Number(marker.dataset.startRow),
        endRow: Number(marker.dataset.endRow)
      })
    }
    const cursors: Record<string, number> = { added: 0, removed: 0, modified: 0 }

    rows.forEach((model, index) => {
      if (model.status === 'same') return
      const list = byStatus[model.status]
      let cursor = cursors[model.status]
      while (cursor < list.length && list[cursor].endRow < index) cursor += 1
      cursors[model.status] = cursor

      const marker = list[cursor]
      expect(marker, `row ${index} (${model.status}) must be covered`).toBeDefined()
      expect(marker.startRow).toBeLessThanOrEqual(index)
      expect(marker.endRow).toBeGreaterThanOrEqual(index)
    })
  }, 30_000)

  /* ---------------------------------------------------------------- */
  /* ac-scale-no-reproject (+ the ruler never re-runs the diff)        */
  /* ---------------------------------------------------------------- */

  it('never re-projects or re-diffs while scrolling, selecting or resizing', () => {
    const rows = cyclicRows(ALTERNATING_CYCLE)
    const blocks = sampledBlocks(rows.length)
    const onSelectBlock = vi.fn()

    const { container } = renderWithI18n(
      <RulerHarness rows={rows} blocks={blocks} onSelectBlock={onSelectBlock} />
    )
    const [left, right] = paneElements(container)
    const markersBefore = markerElements(container)
    const atMount = projections.mock.calls.length
    // Mount costs one degenerate pre-layout paint (the track is not measured yet)
    // plus the measured first paint; only the measured pass is counted below.
    expect(projections.mock.calls.filter(([, geometry]) => geometry.trackHeight === 0)).toHaveLength(1)
    expect(measuredProjections(TRACK_HEIGHT)).toHaveLength(1)

    for (const offset of [1000, 2000, 3000]) {
      left.scrollTop = offset
      fireEvent.scroll(left)
    }
    for (const offset of [500, 1500, 2500]) {
      right.scrollTop = offset
      fireEvent.scroll(right)
    }
    for (const index of [0, Math.floor(markersBefore.length / 2), markersBefore.length - 1]) {
      fireEvent.click(markersBefore[index])
    }

    // Scrolling repaints the viewport window only; bands and DOM nodes survive.
    expect(onSelectBlock).toHaveBeenCalledTimes(3)
    expect(projections.mock.calls.length).toBe(atMount)
    expect(diffCalls).not.toHaveBeenCalled()
    expect(markerElements(container)).toHaveLength(markersBefore.length)
    markerElements(container).forEach((marker, index) => expect(marker).toBe(markersBefore[index]))

    // One track-height change (stubbed ResizeObserver) re-projects exactly once:
    // first paint + this resize, i.e. two measured projections in total.
    trackHeight = SHRUNK_TRACK_HEIGHT
    act(() => {
      for (const observer of resizeObservers) observer.fire()
    })

    expect(measuredProjections(SHRUNK_TRACK_HEIGHT)).toHaveLength(1)
    expect(measuredProjections(TRACK_HEIGHT)).toHaveLength(1)
    expect(projections.mock.calls.length).toBe(atMount + 1)
    // First paint + one resize is the whole budget; the degenerate pass never repeats.
    expect(projections.mock.calls.filter(([, geometry]) => geometry.trackHeight === 0)).toHaveLength(1)
    expect(diffCalls).not.toHaveBeenCalled()
    for (const marker of markerElements(container)) {
      const { top, height } = markerBox(marker)
      expect(top + height).toBeLessThanOrEqual(SHRUNK_TRACK_HEIGHT + 1e-6)
    }
  })

  /* ---------------------------------------------------------------- */
  /* ac-scale-large-edges                                              */
  /* ---------------------------------------------------------------- */

  it('keeps empty, all-same, one-sided and ultra-long-line models bounded', () => {
    // One oversized line on an otherwise identical 358k model: the geometry
    // never looks at the text, only at the row position.
    const ultraLongRows = cyclicRows(SAME_CYCLE)
    ultraLongRows[1000] = row('modified', 1000, 'x'.repeat(INLINE_CHAR_LIMIT + 1))

    const cases: { readonly name: string; readonly rows: DiffRow[]; readonly statuses: string[] }[] = [
      { name: 'empty', rows: [], statuses: [] },
      { name: 'all-same', rows: cyclicRows(SAME_CYCLE), statuses: [] },
      { name: 'left-only', rows: cyclicRows(REMOVED_CYCLE), statuses: ['removed'] },
      { name: 'right-only', rows: cyclicRows(ADDED_CYCLE), statuses: ['added'] },
      { name: 'ultra-long-line', rows: ultraLongRows, statuses: ['modified'] }
    ]

    for (const sample of cases) {
      const blocks = sampledBlocks(Math.max(sample.rows.length, 1))
      const { container } = renderWithI18n(<RulerHarness rows={sample.rows} blocks={blocks} />)
      const ruler = rulerOf(container)
      const markers = markerElements(container)

      expect(markers.length).toBeLessThanOrEqual(MAX_MARKERS)
      const painted = [...new Set(markers.map((marker) => marker.dataset.diffStatus as string))]
      expect(painted.sort()).toEqual([...sample.statuses].sort())

      if (sample.name === 'ultra-long-line') {
        expect(rangesOf(container)).toEqual(['modified:1000-1000'])
        expect(ruler.textContent?.trim()).toBe('')
      }

      // The track stays mounted with a window inside it, empty diffs included.
      const viewport = windowBox(ruler)
      expect(viewport.top).toBeGreaterThanOrEqual(0)
      expect(viewport.height).toBeGreaterThanOrEqual(0)
      expect(viewport.top + viewport.height).toBeLessThanOrEqual(TRACK_HEIGHT)
      cleanup()
    }
  })
})

/* ------------------------------------------------------------------ */
/* ac-scale-zero-io — the wired two-pane view never reaches the platform */
/*                                                                     */
/* DiffRuler holds no PlatformPort at all, so the 358k projection guard  */
/* runs on the component directly while this guard proves the wired      */
/* CodeView path keeps every channel untouched across the same gestures. */
/* ------------------------------------------------------------------ */

const IO_CHANNELS = [
  'readTextFile',
  'selectFile',
  'selectDirectory',
  'listDirectory',
  'listDirectories',
  'digestFiles',
  'realpath'
] as const

type IoChannel = (typeof IO_CHANNELS)[number]

/** Memory PlatformPort that counts every channel the scale guard forbids. */
function countingPlatform(): { port: PlatformPort; calls: Record<IoChannel, number> } {
  const base = createWebPlatformPort()
  const calls = Object.fromEntries(IO_CHANNELS.map((channel) => [channel, 0])) as Record<
    IoChannel,
    number
  >
  const port: PlatformPort = {
    ...base,
    readTextFile: async (path) => {
      calls.readTextFile += 1
      return base.readTextFile(path)
    },
    selectFile: async (options) => {
      calls.selectFile += 1
      return base.selectFile(options)
    },
    selectDirectory: async () => {
      calls.selectDirectory += 1
      return base.selectDirectory()
    },
    listDirectory: async (path) => {
      calls.listDirectory += 1
      return base.listDirectory(path)
    },
    listDirectories: async (paths) => {
      calls.listDirectories += 1
      return base.listDirectories(paths)
    },
    digestFiles: async (paths, options) => {
      calls.digestFiles += 1
      return base.digestFiles(paths, options)
    },
    realpath: async (paths) => {
      calls.realpath += 1
      return base.realpath(paths)
    }
  }
  return { port, calls }
}

describe('diff ruler platform isolation', () => {
  it('keeps every platform channel at zero while scrolling, selecting and resizing', () => {
    const { port, calls } = countingPlatform()
    const leftText = Array.from({ length: 40 }, (_, index) =>
      index % 7 === 3 ? `edited-${index}` : `line-${index}`
    ).join('\n')
    const rightText = Array.from({ length: 40 }, (_, index) =>
      index % 7 === 3 ? `changed-${index}` : index % 11 === 5 ? '' : `line-${index}`
    ).join('\n')

    const { container } = renderWithI18n(
      <CodeView pair={{ left: { path: '/iso/left.ts', text: leftText }, right: { path: '/iso/right.ts', text: rightText } }} platform={port} />
    )
    const ruler = rulerOf(container)
    const panes = Array.from(container.querySelectorAll<HTMLDivElement>('div.h-full.overflow-auto'))
    expect(panes).toHaveLength(2)
    const markers = markerElements(container)
    expect(markers.length).toBeGreaterThan(0)
    const diffAtMount = diffCalls.mock.calls.length

    for (const offset of [120, 260, 40]) {
      panes[0].scrollTop = offset
      fireEvent.scroll(panes[0])
      panes[1].scrollTop = offset
      fireEvent.scroll(panes[1])
    }
    fireEvent.click(markers[0])
    fireEvent.click(markers[markers.length - 1])

    trackHeight = SHRUNK_TRACK_HEIGHT
    act(() => {
      for (const observer of resizeObservers) observer.fire()
    })

    for (const channel of IO_CHANNELS) expect(calls[channel], channel).toBe(0)
    expect(diffCalls.mock.calls.length).toBe(diffAtMount)
    expect(measuredProjections(TRACK_HEIGHT)).toHaveLength(1)
    expect(measuredProjections(SHRUNK_TRACK_HEIGHT)).toHaveLength(1)
    const viewport = windowBox(ruler)
    expect(viewport.top + viewport.height).toBeLessThanOrEqual(SHRUNK_TRACK_HEIGHT + 1)
  })
})

/* ------------------------------------------------------------------ */
/* ac-evidence-anchors — the product-qa selector contract               */
/* ------------------------------------------------------------------ */

describe('diff ruler evidence anchors', () => {
  const rows: DiffRow[] = [
    row('same', 0),
    row('added', 1),
    row('removed', 2),
    row('modified', 3),
    row('modified', 4),
    row('same', 5)
  ]
  const blocks = sampledBlocks(rows.length, 100)

  it('pins the zh track, marker and viewport-window attributes', () => {
    const { container } = renderWithI18n(<RulerHarness rows={rows} blocks={blocks} />, 'zh')
    const ruler = rulerOf(container)

    expect(ruler.dataset.diffRuler).toBe('true')
    expect(ruler.getAttribute('role')).toBe('listbox')
    expect(ruler.getAttribute('aria-label')).toBe('差异指示条')

    const markers = markerElements(container)
    expect(markers.length).toBeGreaterThan(0)
    for (const marker of markers) {
      expect(marker.getAttribute('role')).toBe('option')
      expect(['added', 'removed', 'modified']).toContain(marker.dataset.diffStatus)
      const start = Number(marker.dataset.startRow)
      const end = Number(marker.dataset.endRow)
      expect(Number.isInteger(start)).toBe(true)
      expect(Number.isInteger(end)).toBe(true)
      expect(start).toBeLessThanOrEqual(end)
      expect(marker.getAttribute('aria-label')).toMatch(/^(新增|删除|修改) · 第 \d+–\d+ 行$/)
    }

    const viewport = windowBox(ruler)
    expect(Number.isFinite(viewport.top)).toBe(true)
    expect(Number.isFinite(viewport.height)).toBe(true)
  })

  it('pins the en track and marker names', () => {
    const { container } = renderWithI18n(<RulerHarness rows={rows} blocks={blocks} />, 'en')
    const ruler = rulerOf(container)

    expect(ruler.getAttribute('aria-label')).toBe('Difference ruler')
    const markers = markerElements(container)
    expect(markers.length).toBeGreaterThan(0)
    for (const marker of markers) {
      expect(marker.getAttribute('aria-label')).toMatch(
        /^(Added|Removed|Modified) · lines \d+–\d+$/
      )
    }
    expect(container.textContent).not.toMatch(/\p{Script=Han}/u)
  })
})
