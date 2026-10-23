import { Fragment, useRef, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { useI18n } from '@renderer/i18n/context'
import { cx } from './utils'

/** Smallest share of the container a single pane may keep while dragging. */
const MIN_RATIO = 0.12
const KEYBOARD_STEP = 0.02

function defaultRatios(count: number): number[] {
  return Array.from({ length: count }, () => 1 / count)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Moves boundary `index` to `boundary`, keeping the two adjacent panes balanced. */
function moveBoundary(ratios: readonly number[], index: number, boundary: number): number[] {
  const before = ratios.slice(0, index).reduce((total, ratio) => total + ratio, 0)
  const span = ratios[index] + ratios[index + 1]
  const min = Math.min(MIN_RATIO, span / 2)
  const next = clamp(boundary - before, min, span - min)

  return ratios.map((ratio, position) => {
    if (position === index) return next
    if (position === index + 1) return span - next
    return ratio
  })
}

export interface SplitPaneProps {
  /** Two panes for a two-column layout, three for a three-way merge. */
  readonly panes: readonly ReactNode[]
  readonly className?: string
}

/**
 * Two- or three-column workbench area with draggable (or keyboard-movable)
 * dividers. Ratios fall back to an even split whenever the pane count changes.
 */
export function SplitPane({ panes, className }: SplitPaneProps): JSX.Element {
  const { t } = useI18n()
  const container = useRef<HTMLDivElement>(null)
  const dragging = useRef<number | null>(null)
  const [ratios, setRatios] = useState<number[]>(() => defaultRatios(panes.length))
  const effective = ratios.length === panes.length ? ratios : defaultRatios(panes.length)

  function boundaryRatio(clientX: number): number | null {
    const element = container.current
    if (!element) return null
    const rect = element.getBoundingClientRect()
    if (rect.width === 0) return null
    return (clientX - rect.left) / rect.width
  }

  function applyBoundary(index: number, clientX: number): void {
    const boundary = boundaryRatio(clientX)
    if (boundary === null) return
    setRatios(moveBoundary(effective, index, boundary))
  }

  function nudgeBoundary(index: number, direction: number): void {
    const before = effective.slice(0, index).reduce((total, ratio) => total + ratio, 0)
    const boundary = before + effective[index] + direction * KEYBOARD_STEP
    setRatios(moveBoundary(effective, index, boundary))
  }

  return (
    <div ref={container} className={cx('flex min-h-0 min-w-0 flex-1', className)}>
      {panes.map((pane, index) => {
        const boundary = index - 1
        return (
          <Fragment key={index}>
            {index > 0 ? (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label={t('common.splitPane.divider')}
                tabIndex={0}
                onPointerDown={(event) => {
                  dragging.current = boundary
                  event.currentTarget.setPointerCapture(event.pointerId)
                }}
                onPointerMove={(event) => {
                  if (dragging.current === boundary) applyBoundary(boundary, event.clientX)
                }}
                onPointerUp={(event) => {
                  dragging.current = null
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId)
                  }
                }}
                onDoubleClick={() => setRatios(defaultRatios(panes.length))}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowLeft') nudgeBoundary(boundary, -1)
                  if (event.key === 'ArrowRight') nudgeBoundary(boundary, 1)
                }}
                className="focus-ring group relative w-px shrink-0 cursor-col-resize bg-line-subtle before:absolute before:-left-1 before:inset-y-0 before:w-3 before:content-[''] hover:bg-accent"
              />
            ) : null}
            <div
              className="flex min-h-0 min-w-0 flex-col"
              style={{ flexGrow: effective[index], flexBasis: 0 }}
            >
              {pane}
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}
