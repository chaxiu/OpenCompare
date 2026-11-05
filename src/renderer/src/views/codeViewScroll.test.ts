import { describe, expect, it } from 'vitest'
import { DIFF_ROW_HEIGHT } from '@renderer/components/DiffPane'
import { centeredScrollTop, clampScrollTop, maxScrollTop } from './codeViewScroll'

const VIEWPORT = 220

describe('centeredScrollTop', () => {
  it('centres a middle block and leaves context on both sides', () => {
    const target = centeredScrollTop({
      startRow: 100,
      endRow: 102,
      rowCount: 1000,
      viewportHeight: VIEWPORT
    })
    const blockTop = 100 * DIFF_ROW_HEIGHT
    const blockHeight = 3 * DIFF_ROW_HEIGHT
    expect(target).toBe(Math.round(blockTop + blockHeight / 2 - VIEWPORT / 2))
    expect(target).toBeGreaterThan(0)
    expect(target).toBeLessThan(maxScrollTop(1000, VIEWPORT))
  })

  it('clamps the first block to 0', () => {
    expect(
      centeredScrollTop({ startRow: 0, endRow: 1, rowCount: 1000, viewportHeight: VIEWPORT })
    ).toBe(0)
  })

  it('clamps the last block to max scroll', () => {
    const maxScroll = maxScrollTop(1000, VIEWPORT)
    expect(
      centeredScrollTop({ startRow: 998, endRow: 999, rowCount: 1000, viewportHeight: VIEWPORT })
    ).toBe(maxScroll)
  })

  it('pins a short document to 0 even in the middle', () => {
    const rowCount = 5
    expect(maxScrollTop(rowCount, VIEWPORT)).toBe(0)
    expect(
      centeredScrollTop({ startRow: 2, endRow: 3, rowCount, viewportHeight: VIEWPORT })
    ).toBe(0)
  })

  it.each([
    ['zero', 0],
    ['negative', -40],
    ['unknown', Number.NaN],
    ['infinite', Number.POSITIVE_INFINITY]
  ])('falls back to the clamped block top when the viewport is %s', (_label, viewportHeight) => {
    const target = centeredScrollTop({
      startRow: 50,
      endRow: 52,
      rowCount: 100,
      viewportHeight
    })
    expect(target).toBe(50 * DIFF_ROW_HEIGHT)
    expect(Number.isFinite(target)).toBe(true)
    expect(target).toBeGreaterThanOrEqual(0)
    expect(target).toBeLessThanOrEqual(maxScrollTop(100, viewportHeight))
  })

  it('falls back to the clamped block top when the block is taller than the viewport', () => {
    const target = centeredScrollTop({
      startRow: 10,
      endRow: 30,
      rowCount: 100,
      viewportHeight: VIEWPORT
    })
    expect(target).toBe(10 * DIFF_ROW_HEIGHT)
  })

  it('always returns a finite value inside the scroll range', () => {
    const cases = [
      { input: { startRow: 0, endRow: 0, rowCount: 1000, viewportHeight: 0 }, viewportHeight: 0 },
      { input: { startRow: 999, endRow: 999, rowCount: 1000, viewportHeight: 1 }, viewportHeight: 1 },
      {
        input: {
          startRow: Number.NaN,
          endRow: Number.POSITIVE_INFINITY,
          rowCount: 1000,
          viewportHeight: VIEWPORT
        },
        viewportHeight: VIEWPORT
      }
    ]
    for (const { input, viewportHeight } of cases) {
      const target = centeredScrollTop(input)
      expect(Number.isFinite(target)).toBe(true)
      expect(target).toBeGreaterThanOrEqual(0)
      expect(target).toBeLessThanOrEqual(maxScrollTop(1000, viewportHeight))
    }
  })

  it('is idempotent for the same block and viewport', () => {
    const input = { startRow: 300, endRow: 302, rowCount: 1000, viewportHeight: VIEWPORT }
    expect(centeredScrollTop(input)).toBe(centeredScrollTop(input))
  })
})

describe('clampScrollTop', () => {
  it('keeps values inside the range and degrades non-finite values to 0', () => {
    expect(clampScrollTop(-5, 100)).toBe(0)
    expect(clampScrollTop(50, 100)).toBe(50)
    expect(clampScrollTop(500, 100)).toBe(100)
    expect(clampScrollTop(Number.NaN, 100)).toBe(0)
    expect(clampScrollTop(10, Number.NaN)).toBe(0)
  })
})
