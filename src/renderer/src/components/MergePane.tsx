import type { JSX, Ref } from 'react'
import type { MergeRange } from '@core/text/merge'
import type { DiffStatus } from '@shared/fixtures'
import { cx } from './utils'

const GUTTER_CLASS =
  'tabular sticky left-0 z-10 w-11 shrink-0 border-r border-line-subtle pr-2 text-right text-2xs leading-5 text-content-muted select-none'

const TONE_CLASS: Record<DiffStatus, string> = {
  same: '',
  added: 'bg-diff-added-soft text-diff-added',
  removed: 'bg-diff-removed-soft text-diff-removed',
  modified: 'bg-diff-modified-soft text-diff-modified',
  conflict: 'bg-diff-conflict-soft text-diff-conflict'
}

export interface MergeLineView {
  readonly text: string
  readonly tone?: DiffStatus
}

export interface MergePaneProps {
  readonly lines: readonly MergeLineView[]
  /** 1-based line number of the first entry. */
  readonly startLine?: number
  /** Range highlighted as the current conflict on this side. */
  readonly activeRange?: MergeRange | null
  readonly scrollRef?: Ref<HTMLDivElement>
}

/** Read-only monospace pane with per-line tone and a current-conflict band. */
export function MergePane({
  lines,
  startLine = 1,
  activeRange,
  scrollRef
}: MergePaneProps): JSX.Element {
  return (
    <div ref={scrollRef} className="h-full overflow-auto">
      <div className="min-w-max font-mono text-xs">
        {lines.map((line, index) => {
          const active =
            activeRange !== undefined &&
            activeRange !== null &&
            index >= activeRange.start &&
            index < activeRange.start + activeRange.count
          const tone = line.tone ?? 'same'

          return (
            <div
              key={index}
              className={cx(
                'flex h-5 border-l-2',
                active ? 'border-accent bg-accent-soft/40' : 'border-transparent'
              )}
            >
              <span aria-hidden className={cx(GUTTER_CLASS, 'bg-surface-raised')}>
                {startLine + index}
              </span>
              <span
                className={cx(
                  'min-w-0 flex-1 pl-3 whitespace-pre',
                  TONE_CLASS[tone],
                  tone === 'same' ? 'text-content-secondary' : ''
                )}
              >
                {line.text.length > 0 ? line.text : '\u00a0'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
