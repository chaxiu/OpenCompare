import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { JSX, Ref, ReactNode, UIEvent } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { overlayLine } from '@core/syntax'
import type { SyntaxTokenClass, SyntaxView } from '@core/syntax'
import type { DiffBlock, DiffRow } from '@core/text/diff'
import type { DiffStatus } from '@shared/fixtures'
import { cx } from './utils'

/** Fixed row height (px) both diff panes share, so scroll maps 1:1 by row. */
export const DIFF_ROW_HEIGHT = 22

/** Extra rows above and below the viewport so fast scrolling never shows gaps. */
export const ROW_OVERSCAN = 10

/** Up to this many rows a pane keeps every row in the DOM, as it always has. */
export const WINDOW_THRESHOLD = 1_000

const GUTTER_CLASS =
  'tabular sticky left-0 z-10 w-11 shrink-0 border-r border-line-subtle pr-2 text-right text-xs select-none'

/**
 * Inline word-level highlights: a <=15% soft wash plus a 1px underline, never
 * a saturated solid fill, so the segment stays readable over the row tone in
 * both themes while keeping the semantic status hue.
 */
const INLINE_CHANGED_CLASSES: Record<DiffStatus, string> = {
  same: 'rounded-xs bg-diff-modified/12 text-diff-modified underline decoration-diff-modified decoration-1 underline-offset-2',
  added:
    'rounded-xs bg-diff-added/12 text-diff-added underline decoration-diff-added decoration-1 underline-offset-2',
  removed:
    'rounded-xs bg-diff-removed/12 text-diff-removed underline decoration-diff-removed decoration-1 underline-offset-2',
  modified:
    'rounded-xs bg-diff-modified/12 text-diff-modified underline decoration-diff-modified decoration-1 underline-offset-2',
  conflict:
    'rounded-xs bg-diff-conflict/12 text-diff-conflict underline decoration-diff-conflict decoration-1 underline-offset-2'
}

const ROW_TONE: Record<DiffStatus, string> = {
  same: '',
  added: 'bg-diff-added-soft',
  removed: 'bg-diff-removed-soft',
  modified: 'bg-diff-modified-soft',
  conflict: 'bg-diff-conflict-soft'
}

/**
 * Foreground-only classes for the four V1 syntax semantics. Kept as literal
 * strings so Tailwind's scanner emits every utility; no dynamic class names.
 */
const SYNTAX_FOREGROUND: Record<SyntaxTokenClass, string> = {
  keyword: 'text-syntax-keyword',
  string: 'text-syntax-string',
  number: 'text-syntax-number',
  comment: 'text-syntax-comment'
}

/**
 * Character-level change marks while syntax colouring is active: the same soft
 * wash and underline as the plain path, but never a `text-*` colour, so the
 * token foreground stays in charge.
 */
const INLINE_CHANGED_BACKGROUND: Record<DiffStatus, string> = {
  same: 'rounded-xs bg-diff-modified/12 underline decoration-diff-modified decoration-1 underline-offset-2',
  added:
    'rounded-xs bg-diff-added/12 underline decoration-diff-added decoration-1 underline-offset-2',
  removed:
    'rounded-xs bg-diff-removed/12 underline decoration-diff-removed decoration-1 underline-offset-2',
  modified:
    'rounded-xs bg-diff-modified/12 underline decoration-diff-modified decoration-1 underline-offset-2',
  conflict:
    'rounded-xs bg-diff-conflict/12 underline decoration-diff-conflict decoration-1 underline-offset-2'
}

function inlineContent(row: DiffRow, side: 'left' | 'right'): ReactNode {
  const text = side === 'left' ? row.leftText : row.rightText
  const segments = side === 'left' ? row.leftSegments : row.rightSegments
  if (text === null) return '\u00a0'
  if (!segments) return text.length > 0 ? text : '\u00a0'

  return segments.map((segment, index) =>
    segment.changed ? (
      <span key={index} className={INLINE_CHANGED_CLASSES[row.status]}>
        {segment.text}
      </span>
    ) : (
      <span key={index}>{segment.text}</span>
    )
  )
}

/**
 * Syntax path: overlay whole-document tokens with the row's inline runs, then
 * paint the token as a foreground span and any change as an outer background /
 * underline span. The row cell keeps its own status tone, so neither layer eats
 * the other and red still belongs only to `removed` rows.
 */
function syntaxContent(
  row: DiffRow,
  side: 'left' | 'right',
  view: SyntaxView
): ReactNode {
  const text = side === 'left' ? row.leftText : row.rightText
  if (text === null) return '\u00a0'
  const lineIndex = side === 'left' ? row.leftIndex : row.rightIndex
  const lineStart = view.lineStarts[lineIndex] ?? 0
  const segments = overlayLine(
    text,
    lineStart,
    view.tokens,
    side === 'left' ? row.leftSegments : row.rightSegments
  )
  if (segments.length === 0) return text.length > 0 ? text : '\u00a0'

  return segments.map((segment, index) => {
    const token = segment.token
    const foreground =
      token === null ? (
        segment.text
      ) : (
        <span key="syntax" data-syntax={token} className={SYNTAX_FOREGROUND[token]}>
          {segment.text}
        </span>
      )
    return (
      <span
        key={index}
        className={segment.changed ? INLINE_CHANGED_BACKGROUND[row.status] : undefined}
      >
        {foreground}
      </span>
    )
  })
}

/** One aligned {@link DIFF_ROW_HEIGHT}px line: sticky gutter plus inline text cell. */
function DiffRowView({
  row,
  side,
  index,
  active,
  syntaxView
}: {
  readonly row: DiffRow
  readonly side: 'left' | 'right'
  readonly index: number
  readonly active: boolean
  readonly syntaxView?: SyntaxView | null
}): JSX.Element {
  const line = side === 'left' ? row.leftLine : row.rightLine
  const filler = line === null

  return (
    <div
      data-diff-row={index}
      style={{ height: DIFF_ROW_HEIGHT, lineHeight: `${DIFF_ROW_HEIGHT}px` }}
      className={cx('flex border-l-2', active ? 'border-accent' : 'border-transparent')}
    >
      <span
        aria-hidden
        style={{ lineHeight: `${DIFF_ROW_HEIGHT}px` }}
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
        {syntaxView !== undefined && syntaxView !== null
          ? syntaxContent(row, side, syntaxView)
          : inlineContent(row, side)}
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
  /**
   * Pre-resolved highlight for this side from `resolveSyntaxView`. Omitted or
   * `null` keeps the historical plain-text rendering untouched.
   */
  readonly syntaxView?: SyntaxView | null
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
  onScroll,
  syntaxView
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
  // First row whose 22px band reaches into the viewport (overscan rows excluded).
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
                  syntaxView={syntaxView}
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
                syntaxView={syntaxView}
              />
            ))}
      </div>
    </div>
  )
}
