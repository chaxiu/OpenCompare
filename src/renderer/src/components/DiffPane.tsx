import type { JSX, Ref, ReactNode, UIEvent } from 'react'
import type { DiffBlock, DiffRow } from '@core/text/diff'
import type { DiffStatus } from '@shared/fixtures'
import { cx } from './utils'

/** Fixed row height (px) both diff panes share, so scroll maps 1:1 by row. */
export const DIFF_ROW_HEIGHT = 20

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
 */
export function DiffPane({
  rows,
  side,
  activeBlock,
  scrollRef,
  onScroll
}: DiffPaneProps): JSX.Element {
  return (
    <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-auto">
      <div className="min-w-max font-mono text-xs">
        {rows.map((row, index) => {
          const line = side === 'left' ? row.leftLine : row.rightLine
          const filler = line === null
          const active =
            activeBlock !== undefined &&
            activeBlock !== null &&
            index >= activeBlock.startRow &&
            index <= activeBlock.endRow

          return (
            <div
              key={index}
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
        })}
      </div>
    </div>
  )
}
