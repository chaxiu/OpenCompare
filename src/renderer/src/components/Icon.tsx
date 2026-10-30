import type { JSX } from 'react'
import { ICON_PATHS, strokeWidthFor } from '@renderer/assets/icons'
import type { IconName, IconSize } from '@renderer/assets/icons'
import { cx } from './utils'

export interface IconProps {
  readonly name: IconName
  readonly size?: IconSize
  readonly className?: string
}

/**
 * The only place the renderer emits an `<svg>`: geometry comes from the
 * vendored icon table, every presentation attribute is decided here.
 *
 * Always `aria-hidden` — an icon never carries the accessible name; the
 * surrounding button does (`IconButton.label`).
 */
export function Icon({ name, size = 16, className }: IconProps): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidthFor(size)}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-icon={name}
      className={cx('shrink-0', className)}
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  )
}
