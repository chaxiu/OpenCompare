/**
 * Zero-DOM placement model for a trigger-anchored dropdown menu.
 *
 * The menu prefers the space below the trigger, flips above when the space
 * below cannot hold it, and otherwise clamps inside the viewport so no entry
 * is pushed out of view. The viewport margin is kept free on both axes.
 */

export interface MenuRect {
  readonly top: number
  readonly bottom: number
  readonly left: number
  readonly right: number
  readonly width: number
  readonly height: number
}

export interface MenuPlacementInput {
  readonly trigger: Pick<MenuRect, 'top' | 'bottom' | 'left' | 'right'>
  readonly menu: Pick<MenuRect, 'width' | 'height'>
  readonly viewport: { readonly width: number; readonly height: number }
  /** Distance kept between the trigger and the menu. */
  readonly gap?: number
  /** Distance kept between the menu and the viewport edge. */
  readonly margin?: number
}

export type MenuSide = 'below' | 'above' | 'clamped'

export interface MenuPlacement {
  readonly placement: MenuSide
  /** Fixed-position top, in viewport coordinates. */
  readonly top: number
  /** Fixed-position left, in viewport coordinates. */
  readonly left: number
  /** Height cap; the natural height whenever the menu fits one side. */
  readonly maxHeight: number
  /** Rendered width after the viewport clamp. */
  readonly width: number
}

export const MENU_GAP_PX = 4
export const MENU_VIEWPORT_MARGIN_PX = 8
export const MENU_WIDTH_PX = 288

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Resolve the menu box. `below` / `above` keep the full natural height;
 * `clamped` caps the height to the viewport minus both margins and pins the
 * box inside the same margins, so the menu never leaves the viewport.
 */
export function placeDropdownMenu(input: MenuPlacementInput): MenuPlacement {
  const gap = input.gap ?? MENU_GAP_PX
  const margin = input.margin ?? MENU_VIEWPORT_MARGIN_PX
  const viewportWidth = Math.max(1, input.viewport.width)
  const viewportHeight = Math.max(1, input.viewport.height)
  const width = Math.min(input.menu.width, Math.max(1, viewportWidth - margin * 2))
  const height = Math.max(0, input.menu.height)

  const left = clamp(input.trigger.right - width, margin, viewportWidth - margin - width)
  const belowTop = input.trigger.bottom + gap
  const aboveTop = input.trigger.top - gap - height
  const spaceBelow = viewportHeight - margin - belowTop
  const spaceAbove = input.trigger.top - gap - margin
  const maxHeight = Math.max(1, viewportHeight - margin * 2)

  if (height <= spaceBelow) {
    return { placement: 'below', top: belowTop, left, maxHeight, width }
  }
  if (height <= spaceAbove) {
    return { placement: 'above', top: aboveTop, left, maxHeight, width }
  }

  // Neither side holds the menu: clamp it inside the viewport on the roomier
  // side instead of pushing entries out of view.
  const top =
    spaceBelow >= spaceAbove ? belowTop : input.trigger.top - gap - Math.min(height, maxHeight)
  return {
    placement: 'clamped',
    top: clamp(top, margin, viewportHeight - margin - Math.min(height, maxHeight)),
    left,
    maxHeight,
    width
  }
}
