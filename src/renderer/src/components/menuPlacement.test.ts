import { describe, expect, it } from 'vitest'
import {
  MENU_GAP_PX,
  MENU_VIEWPORT_MARGIN_PX,
  placeDropdownMenu
} from './menuPlacement'

const VIEWPORT = { width: 1024, height: 800 } as const
const TRIGGER = { top: 100, bottom: 132, left: 800, right: 856 } as const

describe('dropdown menu placement', () => {
  it('opens below the trigger when the menu fits under it', () => {
    const placement = placeDropdownMenu({
      trigger: TRIGGER,
      menu: { width: 288, height: 400 },
      viewport: VIEWPORT
    })
    expect(placement.placement).toBe('below')
    expect(placement.top).toBe(TRIGGER.bottom + MENU_GAP_PX)
    expect(placement.top + 400).toBeLessThanOrEqual(VIEWPORT.height - MENU_VIEWPORT_MARGIN_PX)
    expect(placement.left).toBe(TRIGGER.right - 288)
    expect(placement.maxHeight).toBeGreaterThanOrEqual(400)
  })

  it('flips above the trigger when only the space above holds the menu', () => {
    const placement = placeDropdownMenu({
      trigger: { top: 700, bottom: 732, left: 100, right: 156 },
      menu: { width: 288, height: 300 },
      viewport: VIEWPORT
    })
    expect(placement.placement).toBe('above')
    expect(placement.top).toBe(700 - MENU_GAP_PX - 300)
    expect(placement.top).toBeGreaterThanOrEqual(MENU_VIEWPORT_MARGIN_PX)
    expect(placement.top + 300).toBeLessThanOrEqual(VIEWPORT.height)
  })

  it('clamps inside the viewport when neither side fits', () => {
    const height = 700
    const placement = placeDropdownMenu({
      trigger: { top: 400, bottom: 432, left: 100, right: 156 },
      menu: { width: 288, height },
      viewport: VIEWPORT
    })
    expect(placement.placement).toBe('clamped')
    expect(placement.maxHeight).toBe(VIEWPORT.height - MENU_VIEWPORT_MARGIN_PX * 2)
    expect(placement.top).toBeGreaterThanOrEqual(MENU_VIEWPORT_MARGIN_PX)
    expect(placement.top + Math.min(height, placement.maxHeight)).toBeLessThanOrEqual(
      VIEWPORT.height - MENU_VIEWPORT_MARGIN_PX
    )
  })

  it('keeps the menu inside the horizontal margins at both edges', () => {
    const leftEdge = placeDropdownMenu({
      trigger: { top: 100, bottom: 132, left: 4, right: 20 },
      menu: { width: 288, height: 200 },
      viewport: VIEWPORT
    })
    expect(leftEdge.left).toBe(MENU_VIEWPORT_MARGIN_PX)

    const narrow = placeDropdownMenu({
      trigger: { top: 100, bottom: 132, left: 4, right: 20 },
      menu: { width: 288, height: 200 },
      viewport: { width: 300, height: 800 }
    })
    expect(narrow.width).toBe(300 - MENU_VIEWPORT_MARGIN_PX * 2)
    expect(narrow.left).toBe(MENU_VIEWPORT_MARGIN_PX)
  })

  it('keeps a nine-entry menu fully visible at an 800px-high viewport', () => {
    const placement = placeDropdownMenu({
      trigger: { top: 60, bottom: 132, left: 900, right: 956 },
      menu: { width: 288, height: 650 },
      viewport: VIEWPORT
    })
    expect(placement.placement).toBe('below')
    expect(placement.maxHeight).toBeGreaterThanOrEqual(650)
    expect(placement.top).toBe(TRIGGER.bottom + MENU_GAP_PX)
    expect(placement.top + 650).toBeLessThan(VIEWPORT.height)
  })
})
