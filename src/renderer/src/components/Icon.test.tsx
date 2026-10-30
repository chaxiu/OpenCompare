// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ICON_NAMES, ICON_SIZES, strokeWidthFor } from '@renderer/assets/icons'
import { Icon } from './Icon'

afterEach(cleanup)

describe('Icon', () => {
  it.each(ICON_SIZES)('renders the shared contract at %ipx', (size) => {
    const { container } = render(<Icon name="git-compare" size={size} />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()

    expect(svg!.getAttribute('stroke')).toBe('currentColor')
    expect(svg!.getAttribute('fill')).toBe('none')
    expect(svg!.getAttribute('stroke-linecap')).toBe('round')
    expect(svg!.getAttribute('stroke-linejoin')).toBe('round')
    expect(svg!.getAttribute('aria-hidden')).toBe('true')
    expect(svg!.getAttribute('data-icon')).toBe('git-compare')
    expect(svg!.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(svg!.getAttribute('width')).toBe(String(size))
    expect(svg!.getAttribute('height')).toBe(String(size))
    expect(Number(svg!.getAttribute('stroke-width'))).toBe(strokeWidthFor(size))

    // No colour of its own: it inherits `color` from the surrounding control.
    expect(svg!.getAttribute('style')).toBeNull()
    expect(svg!.outerHTML).not.toContain('stroke="#')
    expect(svg!.outerHTML).not.toContain('fill="#')

    // Geometry came from the vendored table.
    expect(svg!.querySelector('path, circle, rect, line, polyline, polygon')).not.toBeNull()
  })

  it('defaults to the smallest step and accepts the caller class', () => {
    const { container } = render(<Icon name="settings" className="text-content-muted" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('16')
    expect(svg.getAttribute('height')).toBe('16')
    expect(svg.getAttribute('class')).toContain('text-content-muted')
  })

  it('draws every vendored icon', () => {
    for (const name of ICON_NAMES) {
      const { container } = render(<Icon name={name} />)
      const svg = container.querySelector('svg')!
      expect(svg.getAttribute('data-icon')).toBe(name)
      expect((svg.innerHTML ?? '').trim().length).toBeGreaterThan(0)
      cleanup()
    }
  })
})
