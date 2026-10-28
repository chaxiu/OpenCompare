import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { JSX, RefObject } from 'react'
import type { DiffBlock, DiffRow } from '@core/text/diff'
import { buildRulerBands, computeViewportWindow, nearestBlockIndex } from '@core/text/ruler'
import { useI18n } from '@renderer/i18n/context'
import { DIFF_ROW_HEIGHT } from './DiffPane'
import { DIFF_DOT_CLASSES, DIFF_LABEL_KEYS } from './diffSemantics'
import { cx } from './utils'

/** Preferred band height (px); it only sets the track's row-bucket resolution. */
const RULER_BAND_HEIGHT = 4

export interface DiffRulerProps {
  /** Aligned rows from the live `diffLineTexts` result; only `status` is read. */
  readonly rows: readonly DiffRow[]
  /** Difference blocks in navigation order, shared with the toolbar state. */
  readonly blocks: readonly DiffBlock[]
  /** The currently selected block, outlined on the track. */
  readonly activeBlock: DiffBlock | null
  /** Left diff pane, which mirrors the scroll position onto the right pane. */
  readonly leftScroll: RefObject<HTMLDivElement | null>
  /** Right diff pane; scrolling it also moves the viewport window. */
  readonly rightScroll: RefObject<HTMLDivElement | null>
  /** Selects the block that owns a clicked band (index into `blocks`). */
  readonly onSelectBlock: (index: number) => void
  /** Moves the active block by `delta`, wrapping like the toolbar buttons. */
  readonly onStepBlock: (delta: number) => void
  /** Re-targets the active block even when the index does not change. */
  readonly onJumpActive: () => void
}

/**
 * Narrow overview bar for the two-column diff: painted bands for every
 * non-`same` run, an outline around the active block and a translucent window
 * showing where the panes are scrolled.
 *
 * Geometry comes from `@core/text/ruler`; this component only measures its own
 * track and dispatches selection, so scrolling never re-projects the bands.
 */
export function DiffRuler({
  rows,
  blocks,
  activeBlock,
  leftScroll,
  rightScroll,
  onSelectBlock,
  onStepBlock,
  onJumpActive
}: DiffRulerProps): JSX.Element {
  const { t } = useI18n()
  const track = useRef<HTMLDivElement>(null)
  const [trackHeight, setTrackHeight] = useState(0)
  const [viewport, setViewport] = useState({ scrollTop: 0, viewportHeight: 0 })

  useLayoutEffect(() => {
    const element = track.current
    if (!element) return
    const measureViewport = (): void => {
      const pane = leftScroll.current ?? rightScroll.current
      const scrollTop = pane?.scrollTop ?? 0
      const viewportHeight = pane?.clientHeight ?? 0
      setViewport((current) =>
        current.scrollTop === scrollTop && current.viewportHeight === viewportHeight
          ? current
          : { scrollTop, viewportHeight }
      )
    }
    const measure = (): void => {
      setTrackHeight(element.clientHeight)
      measureViewport()
    }
    measure()
    // jsdom has no ResizeObserver; a single measurement still paints the bands.
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    if (leftScroll.current) observer.observe(leftScroll.current)
    if (rightScroll.current) observer.observe(rightScroll.current)
    return () => observer.disconnect()
  }, [leftScroll, rightScroll])

  useEffect(() => {
    const panes = [leftScroll.current, rightScroll.current].filter(
      (pane): pane is HTMLDivElement => pane !== null
    )
    const handleScroll = (event: Event): void => {
      const pane = event.currentTarget as HTMLDivElement
      setViewport((current) =>
        current.scrollTop === pane.scrollTop && current.viewportHeight === pane.clientHeight
          ? current
          : { scrollTop: pane.scrollTop, viewportHeight: pane.clientHeight }
      )
    }
    for (const pane of panes) pane.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      for (const pane of panes) pane.removeEventListener('scroll', handleScroll)
    }
  }, [leftScroll, rightScroll])

  const bands = useMemo(
    () => buildRulerBands(rows, { trackHeight, bandHeight: RULER_BAND_HEIGHT }),
    [rows, trackHeight]
  )

  // Band → block hit is part of the projection, not of the scroll repaint.
  const markers = useMemo(
    () => bands.map((band) => ({ band, blockIndex: nearestBlockIndex(blocks, band.startRow) })),
    [bands, blocks]
  )

  const viewportWindow = useMemo(
    () =>
      computeViewportWindow({
        scrollTop: viewport.scrollTop,
        viewportHeight: viewport.viewportHeight,
        rowHeight: DIFF_ROW_HEIGHT,
        rowCount: rows.length,
        trackHeight
      }),
    [viewport, rows.length, trackHeight]
  )

  return (
    <div
      ref={track}
      data-diff-ruler="true"
      role="listbox"
      aria-orientation="vertical"
      aria-label={t('files.code.ruler.label')}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          onStepBlock(1)
        } else if (event.key === 'ArrowUp') {
          event.preventDefault()
          onStepBlock(-1)
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onJumpActive()
        }
      }}
      className="focus-ring relative w-9 shrink-0 overflow-hidden rounded-sm border border-line-subtle bg-surface-sunken"
    >
      {markers.map(({ band, blockIndex }) => {
        const active =
          activeBlock !== null &&
          band.startRow <= activeBlock.endRow &&
          band.endRow >= activeBlock.startRow

        return (
          <div
            key={`${band.status}-${band.startRow}`}
            role="option"
            aria-selected={active}
            aria-label={t('files.code.ruler.marker', {
              status: t(DIFF_LABEL_KEYS[band.status]),
              start: band.startRow + 1,
              end: band.endRow + 1
            })}
            data-diff-status={band.status}
            data-start-row={band.startRow}
            data-end-row={band.endRow}
            onClick={() => {
              if (blockIndex >= 0) onSelectBlock(blockIndex)
            }}
            style={{ top: band.top, height: band.height }}
            className={cx(
              'absolute inset-x-1 cursor-pointer',
              DIFF_DOT_CLASSES[band.status],
              active ? 'z-10 outline outline-1 outline-accent' : ''
            )}
          />
        )
      })}
      <div
        aria-hidden
        data-window-top={Math.round(viewportWindow.top)}
        data-window-height={Math.round(viewportWindow.height)}
        style={{ top: viewportWindow.top, height: viewportWindow.height }}
        className="pointer-events-none absolute inset-x-0 border-y border-accent/40 bg-surface-raised/20"
      />
    </div>
  )
}
