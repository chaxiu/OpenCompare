/**
 * Windowing + row shells of the structured source panes and change list.
 *
 * Both lists reuse the diff pane's fixed-row-height window (`WINDOW_THRESHOLD`,
 * `ROW_OVERSCAN`, `useVirtualizer` with a `scrollTop` fold-back), so a 5 MB file
 * keeps the same handful of row elements as a small one. The scroll element
 * stays authoritative: a programmatic jump that lands without a scroll event is
 * folded back into the window on the next render.
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { JSX, KeyboardEvent, ReactNode, RefObject, UIEvent } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { StructuredChange, StructuredStatus } from '@core/structured/diff'
import { ROW_OVERSCAN, WINDOW_THRESHOLD } from '@renderer/components/DiffPane'
import { DIFF_BADGE_CLASSES } from '@renderer/components/diffSemantics'
import { Icon } from '@renderer/components/Icon'
import { UI_ICON_ACTIONS } from '@renderer/assets/icons'
import { useI18n } from '@renderer/i18n/context'
import { cx } from '@renderer/components/utils'
import {
  ANCESTOR_CLASSES,
  CHANGE_ROW_HEIGHT,
  HIGHLIGHT_CLASSES,
  SOURCE_ROW_HEIGHT,
  STATUS_LABELS,
  STATUS_TONES,
  VALUE_CLASSES
} from './structuredStatus'
import type { HighlightStatus } from './structuredStatus'


/** The window state a fixed-row list renders from. */
interface RowWindow {
  readonly windowed: boolean
  readonly items: readonly { readonly index: number; readonly start: number; readonly end: number }[]
  readonly contentHeight: number
  readonly windowStart: number
  readonly windowEnd: number
  readonly firstVisible: number
}

function useRowWindow(
  count: number,
  rowHeight: number,
  scrollElement: RefObject<HTMLDivElement | null>
): RowWindow {
  const windowed = count > WINDOW_THRESHOLD
  const [, syncWindow] = useState(0)

  // TanStack Virtual's returned functions are intentionally not memoizable.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: windowed ? count : 0,
    getScrollElement: () => scrollElement.current,
    estimateSize: () => rowHeight,
    overscan: ROW_OVERSCAN
  })

  // The element's offset can change without a scroll event (selection jump,
  // session restore), so this checks after every render; the guard stops it
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
    virtualizer.scrollOffset = offset
    syncWindow((token) => token + 1)
  })

  const contentHeight = count * rowHeight
  const items = windowed ? virtualizer.getVirtualItems() : []
  const windowStart = windowed ? (items[0]?.start ?? 0) : 0
  const windowEnd =
    items.length > 0 ? (items[items.length - 1]?.end ?? contentHeight) : contentHeight
  // First row whose band reaches into the viewport (overscan rows excluded).
  const firstVisible = items.find((item) => item.end > (virtualizer.scrollOffset ?? 0))?.index ?? 0

  return { windowed, items, contentHeight, windowStart, windowEnd, firstVisible }
}

function StatusBadge({ status }: { readonly status: StructuredStatus }): JSX.Element {
  const { t } = useI18n()
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center rounded-xs border px-1 text-2xs leading-4',
        DIFF_BADGE_CLASSES[STATUS_TONES[status]]
      )}
    >
      {t(STATUS_LABELS[status])}
    </span>
  )
}

/** One node of the change list: status, JSON Pointer path and old → new value. */
function ChangeRow({
  change,
  index,
  selected,
  onSelect
}: {
  readonly change: StructuredChange
  readonly index: number
  readonly selected: boolean
  readonly onSelect: (path: string) => void
}): JSX.Element {
  const valueClass = VALUE_CLASSES[change.status]

  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={0}
      data-change-row={index}
      data-change-path={change.path}
      onClick={() => onSelect(change.path)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onSelect(change.path)
      }}
      style={{ height: CHANGE_ROW_HEIGHT }}
      className={cx(
        'flex cursor-pointer items-center gap-2 overflow-hidden border-b border-line-subtle px-2',
        selected ? 'bg-accent-soft' : 'hover:bg-surface-overlay'
      )}
    >
      <StatusBadge status={change.status} />
      <span
        className="min-w-0 flex-1 truncate font-mono text-xs text-content-secondary"
        title={change.path}
      >
        {change.path === '' ? '/' : change.path}
      </span>
      <span className="flex shrink-0 items-center gap-1 font-mono text-xs">
        <span
          className={cx(
            'max-w-40 truncate',
            change.left === undefined ? 'text-content-muted' : valueClass
          )}
          title={change.left}
        >
          {change.left ?? '—'}
        </span>
        <Icon name={UI_ICON_ACTIONS.changeArrow} className="text-content-muted" />
        <span
          className={cx(
            'max-w-40 truncate',
            change.right === undefined ? 'text-content-muted' : valueClass
          )}
          title={change.right}
        >
          {change.right ?? '—'}
        </span>
      </span>
    </div>
  )
}

export interface StructuredChangeListProps {
  readonly changes: readonly StructuredChange[]
  readonly selectedPath: string | null
  readonly onSelect: (path: string) => void
}

/** Virtualized, keyboard-activatable change list. */
export function StructuredChangeList({
  changes,
  selectedPath,
  onSelect
}: StructuredChangeListProps): JSX.Element {
  const { t } = useI18n()
  const scrollElement = useRef<HTMLDivElement | null>(null)
  const window = useRowWindow(changes.length, CHANGE_ROW_HEIGHT, scrollElement)

  const renderRow = (index: number): ReactNode => {
    const change = changes[index]
    if (!change) return null
    return (
      <ChangeRow
        key={change.path}
        change={change}
        index={index}
        selected={change.path === selectedPath}
        onSelect={onSelect}
      />
    )
  }

  return (
    <div
      ref={scrollElement}
      role="listbox"
      aria-label={t('files.structured.changeList')}
      className="h-full overflow-auto"
    >
      <div
        className="min-w-max"
        style={
          window.windowed
            ? {
                height: window.contentHeight,
                paddingTop: window.windowStart,
                paddingBottom: Math.max(0, window.contentHeight - window.windowEnd)
              }
            : undefined
        }
        data-change-window-start={window.windowed ? window.firstVisible : undefined}
      >
        {window.windowed
          ? window.items.map((item) => renderRow(item.index))
          : changes.map((_, index) => renderRow(index))}
      </div>
    </div>
  )
}

export interface StructuredHighlight {
  readonly status: HighlightStatus
  /** `exact` marks the node itself; `ancestor` marks a fallback span, weaker. */
  readonly tone: 'exact' | 'ancestor'
  readonly startLine: number
  readonly endLine: number
}

export interface StructuredSourcePaneProps {
  readonly side: 'left' | 'right'
  readonly text: string
  /** Exact range of the selected change, a fallback ancestor range, or `null`. */
  readonly highlight: StructuredHighlight | null
  /** Offset restored on mount (session switch / first paint). */
  readonly initialScrollTop: number
  readonly scrollRef?: (element: HTMLDivElement | null) => void
  readonly onScroll?: (element: HTMLDivElement) => void
  readonly onKeyDown?: (event: KeyboardEvent<HTMLDivElement>, element: HTMLDivElement) => void
  readonly onLineClick?: (side: 'left' | 'right', line: number) => void
}

/**
 * One original pane: fixed-height source lines, a sticky line gutter, range
 * highlighting (exact or fallback ancestor) and windowed rendering above the
 * shared threshold.
 */
export function StructuredSourcePane({
  side,
  text,
  highlight,
  initialScrollTop,
  scrollRef,
  onScroll,
  onKeyDown,
  onLineClick
}: StructuredSourcePaneProps): JSX.Element {
  const { t } = useI18n()
  const lines = useMemo(() => text.replace(/\n$/, '').split('\n'), [text])
  const scrollElement = useRef<HTMLDivElement | null>(null)
  const [, refreshWindow] = useState(0)
  const window = useRowWindow(lines.length, SOURCE_ROW_HEIGHT, scrollElement)

  const attachScroll = useCallback(
    (element: HTMLDivElement | null) => {
      scrollElement.current = element
      scrollRef?.(element)
    },
    [scrollRef]
  )

  // Restore the session's offset once per mount, then leave the element
  // authoritative: later prop updates come from this pane's own scrolling.
  const restored = useRef(false)
  useLayoutEffect(() => {
    if (restored.current) return
    restored.current = true
    const element = scrollElement.current
    if (!element) return
    element.scrollTop = initialScrollTop
    refreshWindow((token) => token + 1)
  }, [initialScrollTop])

  const renderRow = (index: number): ReactNode => {
    const line = index + 1
    const marked =
      highlight !== null && line >= highlight.startLine && line <= highlight.endLine
    const status = marked ? highlight.status : null
    const tone = marked ? highlight.tone : null
    return (
      <div
        key={index}
        data-source-row={index}
        data-source-line={line}
        // Exact hits keep the status hook; a fallback ancestor uses its own one
        // so the four-state assertions never see a row the node does not own.
        data-highlight-status={tone === 'exact' ? (status ?? undefined) : undefined}
        data-highlight-tone={tone === 'ancestor' ? 'ancestor' : undefined}
        onClick={() => onLineClick?.(side, line)}
        className={cx(
          'flex h-5 cursor-text',
          status === null
            ? undefined
            : tone === 'ancestor'
              ? ANCESTOR_CLASSES[status]
              : HIGHLIGHT_CLASSES[status]
        )}
      >
        <span
          aria-hidden
          className="tabular sticky left-0 z-10 w-11 shrink-0 border-r border-line-subtle bg-surface-raised pr-2 text-right text-2xs leading-5 text-content-muted select-none"
        >
          {line}
        </span>
        <span
          className={cx(
            'pl-3 whitespace-pre',
            status === null ? 'text-content-secondary' : 'text-content-primary'
          )}
        >
          {lines[index] && lines[index].length > 0 ? lines[index] : '\u00a0'}
        </span>
      </div>
    )
  }

  return (
    <div
      ref={attachScroll}
      data-source-pane={side}
      tabIndex={0}
      aria-label={t(side === 'left' ? 'files.structured.sourceLeft' : 'files.structured.sourceRight')}
      onScroll={(event: UIEvent<HTMLDivElement>) => onScroll?.(event.currentTarget)}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => onKeyDown?.(event, event.currentTarget)}
      className="focus-ring h-full overflow-auto"
    >
      <div
        className="min-w-max font-mono text-xs"
        style={
          window.windowed
            ? {
                height: window.contentHeight,
                paddingTop: window.windowStart,
                paddingBottom: Math.max(0, window.contentHeight - window.windowEnd)
              }
            : undefined
        }
        data-source-window-start={window.windowed ? window.firstVisible : undefined}
      >
        {window.windowed
          ? window.items.map((item) => renderRow(item.index))
          : lines.map((_, index) => renderRow(index))}
      </div>
    </div>
  )
}
