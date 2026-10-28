import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { JSX, Ref, ReactNode, UIEvent } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { DiffBlock, DiffRow } from '@core/text/diff'
import type { DiffStatus } from '@shared/fixtures'
import { cx } from './utils'

/** Fixed row height (px) both diff panes share, so scroll maps 1:1 by row. */
export const DIFF_ROW_HEIGHT = 20

/** Extra rows above and below the viewport so fast scrolling never shows gaps. */
const ROW_OVERSCAN = 10

/** Up to this many rows a pane keeps every row in the DOM, as it always has. */
const WINDOW_THRESHOLD = 1_000

const GUTTER_CLASS =
  'tabular sticky left-0 z-10 w-11 shrink-0 border-r border-line-subtle pr-2 text-right text-2xs leading-5 select-none'

const ROW_TONE: Record<DiffStatus, string> = {
  same: '',
  added: 'bg-diff-added-soft',
  removed: 'bg-diff-removed-soft',
  modified: 'bg-diff-modified-soft',
  conflict: 'bg-diff-conflict-soft'
}

function inlineContent(row: DiffRow, side: 'left' | 'right'): ReactNode {
  const text = side === 'left' ? row.leftText : row.rightText
  const segments = side === 'left' ? row.leftSegments : row.rightSegments
  if (text === null) return '\u00a0'
  if (!segments) return text.length > 0 ? text : '\u00a0'

  return segments.map((segment, index) =>
    segment.changed ? (
      <span key={index} className="rounded-xs bg-diff-modified/40 text-diff-modified">
        {segment.text}
      </span>
    ) : (
      <span key={index}>{segment.text}</span>
    )
  )
}

/** One aligned 20px line: sticky line-number gutter plus the inline text cell. */
function DiffRowView({
  row,
  side,
  index,
  active
}: {
  readonly row: DiffRow
  readonly side: 'left' | 'right'
  readonly index: number
  readonly active: boolean
}): JSX.Element {
  const line = side === 'left' ? row.leftLine : row.rightLine
  const filler = line === null

  return (
    <div
      data-diff-row={index}
      className={cx('flex h-5 border-l-2', active ? 'border-accent' : 'border-transparent')}
    >
      <span
        aria-hidden
        className={cx(
          GUTTER_CLASS,
          filler ? 'bg-surface-sunken text-content-muted/50' : 'bg-surface-raised'
        )}
      >
        {line ?? ''}
      </span>
      <span
        className={cx(
          'min-w-0 flex-1 pl-3 whitespace-pre',
          filler ? 'bg-surface-sunken/60' : ROW_TONE[row.status],
          row.status === 'same' || filler ? 'text-content-secondary' : 'text-content-primary'
        )}
      >
        {inlineContent(row, side)}
      </span>
    </div>
  )
}

export interface DiffPaneProps {
  readonly rows: readonly DiffRow[]
  readonly side: 'left' | 'right'
  /** Diff block to outline as the current navigation target. */
  readonly activeBlock?: DiffBlock | null
  readonly scrollRef?: Ref<HTMLDivElement>
  readonly onScroll?: (event: UIEvent<HTMLDivElement>) => void
}

/**
 * One column of the aligned two-column diff: a real line number for its own
 * lines and a filler row wherever the other side is longer, so both panes stay
 * visually flush and scroll in lockstep.
 *
 * Large diffs render only the rows inside the viewport (plus a small overscan)
 * over a content box whose height is exactly `rows.length × DIFF_ROW_HEIGHT`, so
 * a 350k-row model keeps the same handful of row elements as a small one. The
 * element's own `scrollTop` stays authoritative: a programmatic jump that lands
 * without a scroll event is folded back into the window on the next render.
 */
export function DiffPane({
  rows,
  side,
  activeBlock,
  scrollRef,
  onScroll
}: DiffPaneProps): JSX.Element {
  const windowed = rows.length > WINDOW_THRESHOLD
  const scrollElement = useRef<HTMLDivElement | null>(null)
  const [, syncWindow] = useState(0)

  const attachScroll = useCallback(
    (element: HTMLDivElement | null) => {
      scrollElement.current = element
      if (typeof scrollRef === 'function') scrollRef(element)
      else if (scrollRef) (scrollRef as { current: HTMLDivElement | null }).current = element
    },
    [scrollRef]
  )

  // TanStack Virtual's returned functions are intentionally not memoizable.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: windowed ? rows.length : 0,
    getScrollElement: () => scrollElement.current,
    estimateSize: () => DIFF_ROW_HEIGHT,
    overscan: ROW_OVERSCAN
  })

  // The element's offset can change without a scroll event (ruler jump,
  // drilldown restore), so this checks after every render; the guard stops it
  // from looping once the virtualizer agrees with the element.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!windowed) return
    const element = scrollElement.current
    if (!element) return
    const offset = element.scrollTop
    if (virtualizer.scrollOffset !== null && Math.abs(virtualizer.scrollOffset - offset) < 1) {
      return
    }
    // The scroll element is the source of truth: ruler jumps and drilldown
    // restores write `scrollTop` directly, and jsdom never fires for them.
    virtualizer.scrollOffset = offset
    syncWindow((token) => token + 1)
  })

  const contentHeight = rows.length * DIFF_ROW_HEIGHT
  const items = windowed ? virtualizer.getVirtualItems() : []
  const windowStart = windowed ? (items[0]?.start ?? 0) : 0
  const windowEnd =
    items.length > 0 ? (items[items.length - 1]?.end ?? contentHeight) : contentHeight
  // First row whose 20px band reaches into the viewport (overscan rows excluded).
  const firstVisible = items.find((item) => item.end > (virtualizer.scrollOffset ?? 0))?.index ?? 0

  return (
    <div ref={attachScroll} onScroll={onScroll} className="h-full overflow-auto">
      <div
        className="min-w-max font-mono text-xs"
        style={
          windowed
            ? {
                height: contentHeight,
                paddingTop: windowStart,
                paddingBottom: Math.max(0, contentHeight - windowEnd)
              }
            : undefined
        }
        data-diff-content-height={windowed ? contentHeight : undefined}
        data-diff-window-start={windowed ? firstVisible : undefined}
      >
        {windowed
          ? items.map((item) => {
              const row = rows[item.index]
              if (!row) return null
              const active =
                activeBlock !== undefined &&
                activeBlock !== null &&
                item.index >= activeBlock.startRow &&
                item.index <= activeBlock.endRow
              return (
                <DiffRowView
                  key={item.index}
                  row={row}
                  side={side}
                  index={item.index}
                  active={active}
                />
              )
            })
          : rows.map((row, index) => (
              <DiffRowView
                key={index}
                row={row}
                side={side}
                index={index}
                active={
                  activeBlock !== undefined &&
                  activeBlock !== null &&
                  index >= activeBlock.startRow &&
                  index <= activeBlock.endRow
                }
              />
            ))}
      </div>
    </div>
  )
}
