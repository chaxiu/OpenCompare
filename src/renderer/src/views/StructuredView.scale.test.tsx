// @vitest-environment jsdom
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createStructuredLocator } from '@core/structured/locate'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { createStructuredCompareClient } from '@renderer/structured/compareClient'
import type { StructuredCompareClient } from '@renderer/structured/compareClient'
import { StructuredView } from './StructuredView'

const platform = createWebPlatformPort()
const ROW_HEIGHT = 20
const VIEWPORT_HEIGHT = 600
const MAX_SCROLL = 10_000_000
const ITEM_COUNT = 7_600
const DEPTH = 8
/** The first item differs at this leaf, so the row is a known modified change. */
const KNOWN_PATH = `/items/0/deep/${Array.from({ length: DEPTH }, (_, index) => `level${index + 1}`).join('/')}/value`

const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
const originalScrollHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollHeight'
)

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => VIEWPORT_HEIGHT
  })
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.hasAttribute('data-source-pane') ? MAX_SCROLL : 0
    }
  })
})

afterAll(() => {
  if (originalHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalHeight)
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight')
  if (originalScrollHeight) {
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', originalScrollHeight)
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight')
  }
})

afterEach(cleanup)

/** An 8-level nested node; the value is what the two sides disagree on. */
function nested(value: number): unknown {
  let node: unknown = { value }
  for (let level = DEPTH; level >= 1; level -= 1) {
    node = { [`level${level}`]: node, note: `n${level}` }
  }
  return node
}

function sideText(side: 'left' | 'right'): string {
  const items = Array.from({ length: ITEM_COUNT }, (_, index) => ({
    id: index,
    deep: nested(side === 'right' && index % 5 === 0 ? index + 1 : index),
    value: side === 'right' && index % 97 === 0 ? String(index) : index,
    ...(side === 'left' ? { onlyLeft: `left-${index}` } : { onlyRight: `right-${index}` })
  }))
  return JSON.stringify({ items }, null, 2)
}

/**
 * Wraps the shipped client so the test can count `dispose` calls while the
 * comparison itself still runs through the real fallback path.
 */
function trackRealClient(): {
  readonly client: StructuredCompareClient
  readonly dispose: ReturnType<typeof vi.fn>
} {
  const real = createStructuredCompareClient()
  const dispose = vi.fn((): void => {
    real.dispose()
  })
  return {
    client: {
      compare: (request) => real.compare(request),
      cancel: () => real.cancel(),
      dispose
    },
    dispose
  }
}

describe('5 MB structured comparison', () => {
  it(
    'stays interactive with bounded DOM rows and jumps to a known change',
    async () => {
      const unhandled: unknown[] = []
      const onUnhandled = (reason: unknown): void => {
        unhandled.push(reason)
      }
      process.on('unhandledRejection', onUnhandled)

      const directory = mkdtempSync(join(tmpdir(), 'opencompare-structured-scale-'))
      const leftPath = join(directory, 'scale.left.json')
      const rightPath = join(directory, 'scale.right.json')
      try {
        const leftText = sideText('left')
        const rightText = sideText('right')
        writeFileSync(leftPath, leftText)
        writeFileSync(rightPath, rightText)

        const left = readFileSync(leftPath, 'utf8')
        const right = readFileSync(rightPath, 'utf8')
        expect(Buffer.byteLength(left)).toBeGreaterThanOrEqual(5 * 1024 * 1024)
        expect(Buffer.byteLength(right)).toBeGreaterThanOrEqual(5 * 1024 * 1024)
        expect(left.split('\n').length).toBeGreaterThan(1000)
        expect(right.split('\n').length).toBeGreaterThan(1000)

        const { container } = render(
          <StructuredView
            pair={{
              left: { path: leftPath, text: left },
              right: { path: rightPath, text: right }
            }}
            format="json"
            platform={platform}
          />
        )

        const known = await waitFor(
          () => {
            const row = container.querySelector<HTMLElement>(
              `[data-change-path="${KNOWN_PATH}"]`
            )
            if (!row) throw new Error('the known change row is not rendered yet')
            return row
          },
          { timeout: 30_000 }
        )

        // Both originals are windowed: the DOM holds one viewport plus overscan,
        // no matter how many lines the file has.
        const leftRows = container.querySelectorAll('[data-source-pane="left"] [data-source-row]')
        const rightRows = container.querySelectorAll('[data-source-pane="right"] [data-source-row]')
        const limit = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + 2 * 10
        expect(leftRows.length).toBeGreaterThan(0)
        expect(leftRows.length).toBeLessThanOrEqual(limit)
        expect(rightRows.length).toBeLessThanOrEqual(limit)

        const expectedLine = createStructuredLocator(right, 'json').locate(KNOWN_PATH).startLine
        const expectedTop = Math.min(
          (expectedLine - 1) * ROW_HEIGHT,
          MAX_SCROLL - VIEWPORT_HEIGHT
        )

        fireEvent.click(known)
        const leftPane = container.querySelector<HTMLElement>('[data-source-pane="left"]')
        const rightPane = container.querySelector<HTMLElement>('[data-source-pane="right"]')
        if (!leftPane || !rightPane) throw new Error('source panes are missing')
        expect(rightPane.scrollTop).toBeCloseTo(expectedTop, 0)
        expect(leftPane.scrollTop).toBeCloseTo(expectedTop, 0)

        // The two counts survive the windowing: the list is windowed too.
        expect(
          container.querySelectorAll('[data-change-row]').length
        ).toBeLessThanOrEqual(Math.ceil(VIEWPORT_HEIGHT / 24) + 2 * 10)

        expect(unhandled).toEqual([])
      } finally {
        rmSync(directory, { recursive: true, force: true })
        process.off('unhandledRejection', onUnhandled)
      }
    },
    60_000
  )

  it(
    'disposes the real client exactly once after the 5 MB result lands',
    async () => {
      const unhandled: unknown[] = []
      const onUnhandled = (reason: unknown): void => {
        unhandled.push(reason)
      }
      process.on('unhandledRejection', onUnhandled)
      const reactErrors: unknown[][] = []
      const consoleError = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
        reactErrors.push(args)
      })

      const directory = mkdtempSync(join(tmpdir(), 'opencompare-structured-dispose-'))
      const leftPath = join(directory, 'dispose.left.json')
      const rightPath = join(directory, 'dispose.right.json')
      try {
        writeFileSync(leftPath, sideText('left'))
        writeFileSync(rightPath, sideText('right'))
        const left = readFileSync(leftPath, 'utf8')
        const right = readFileSync(rightPath, 'utf8')
        expect(Buffer.byteLength(left)).toBeGreaterThanOrEqual(5 * 1024 * 1024)
        expect(Buffer.byteLength(right)).toBeGreaterThanOrEqual(5 * 1024 * 1024)

        const { client, dispose } = trackRealClient()
        const { container, unmount } = render(
          <StructuredView
            pair={{
              left: { path: leftPath, text: left },
              right: { path: rightPath, text: right }
            }}
            format="json"
            platform={platform}
            createClient={() => client}
          />
        )

        await waitFor(
          () => {
            const row = container.querySelector<HTMLElement>(
              `[data-change-path="${KNOWN_PATH}"]`
            )
            if (!row) throw new Error('the known change row is not rendered yet')
          },
          { timeout: 30_000 }
        )

        unmount()
        expect(dispose).toHaveBeenCalledTimes(1)

        await new Promise((resolve) => setTimeout(resolve, 20))
        expect(dispose).toHaveBeenCalledTimes(1)
        expect(unhandled).toEqual([])
        expect(
          reactErrors.filter((args) => /unmounted|not wrapped in act/.test(String(args[0])))
        ).toEqual([])
      } finally {
        rmSync(directory, { recursive: true, force: true })
        process.off('unhandledRejection', onUnhandled)
        consoleError.mockRestore()
      }
    },
    60_000
  )

  it(
    'disposes the real client exactly once when unmounted before the 5 MB result lands',
    async () => {
      const unhandled: unknown[] = []
      const onUnhandled = (reason: unknown): void => {
        unhandled.push(reason)
      }
      process.on('unhandledRejection', onUnhandled)
      const reactErrors: unknown[][] = []
      const consoleError = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
        reactErrors.push(args)
      })

      const directory = mkdtempSync(join(tmpdir(), 'opencompare-structured-inflight-'))
      const leftPath = join(directory, 'inflight.left.json')
      const rightPath = join(directory, 'inflight.right.json')
      try {
        writeFileSync(leftPath, sideText('left'))
        writeFileSync(rightPath, sideText('right'))
        const left = readFileSync(leftPath, 'utf8')
        const right = readFileSync(rightPath, 'utf8')

        const { client, dispose } = trackRealClient()
        const { container, unmount } = render(
          <StructuredView
            pair={{
              left: { path: leftPath, text: left },
              right: { path: rightPath, text: right }
            }}
            format="json"
            platform={platform}
            createClient={() => client}
          />
        )
        // The macrotask fallback has not run yet, so the result is still in flight.
        expect(container.textContent).toContain('对比中')

        unmount()
        expect(dispose).toHaveBeenCalledTimes(1)

        await new Promise((resolve) => setTimeout(resolve, 50))
        expect(dispose).toHaveBeenCalledTimes(1)
        expect(unhandled).toEqual([])
        expect(
          reactErrors.filter((args) => /unmounted|not wrapped in act/.test(String(args[0])))
        ).toEqual([])
      } finally {
        rmSync(directory, { recursive: true, force: true })
        process.off('unhandledRejection', onUnhandled)
        consoleError.mockRestore()
      }
    },
    60_000
  )
})
