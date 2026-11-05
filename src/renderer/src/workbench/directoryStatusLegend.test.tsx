// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { FileDiffStatus } from '@core/directory/compare'
import { en, zh } from '@renderer/i18n/messages'
import { renderWithI18n } from '@renderer/i18n/testing'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { DIRECTORY_STATUS_LABEL_KEYS } from '@renderer/views/directoryCopy'
import {
  FOUR_STATE_EXPRESSION,
  FOUR_STATE_LEGEND_SELECTOR,
  readFourStateLegend
} from '../../../../scripts/four-state-legend.mjs'
import { Workbench } from './Workbench'

const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
const originalInnerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth')

beforeAll(() => {
  // The legend keeps its status words on the wide reference row; keep this
  // suite independent of the narrow-window collapse ladder.
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1920 })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 1200
  })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 640
  })
})

afterAll(() => {
  if (originalInnerWidth) Object.defineProperty(window, 'innerWidth', originalInnerWidth)
  if (originalWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalWidth)
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
  if (originalHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalHeight)
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight')
})

afterEach(cleanup)

const LEGEND_STATUSES = ['same', 'added', 'removed', 'modified'] as const
type Dictionary = typeof en | typeof zh

/** The legends of the directory shell, located by their own marker. */
function directoryLegends(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(FOUR_STATE_LEGEND_SELECTOR))
}

function legendCounts(): Record<FileDiffStatus, number> {
  const reading = readFourStateLegend(document)
  if (!reading.ok) throw new Error(`four-state legend unreadable: ${reading.reason}`)
  return reading.counts
}

async function openDirectoryPair(
  left: string,
  right: string,
  dictionary: Dictionary
): Promise<void> {
  fireEvent.click(
    screen.getAllByRole('button', { name: dictionary['shell.toolbar.newCompare'] })[0]
  )
  const panel = await screen.findByRole('dialog')
  fireEvent.change(within(panel).getByLabelText(dictionary['shell.compare.leftPath']), {
    target: { value: left }
  })
  fireEvent.change(within(panel).getByLabelText(dictionary['shell.compare.rightPath']), {
    target: { value: right }
  })
  fireEvent.click(within(panel).getByRole('button', { name: dictionary['shell.compare.submit'] }))
}

/** Opens a right-only directory pair and waits for the toolbar legend to mount. */
async function openRightOnlySession(): Promise<HTMLElement> {
  await screen.findAllByRole('tree', {}, { timeout: 30_000 })
  let legends: HTMLElement[] = []
  await expect
    .poll(() => {
      legends = directoryLegends()
      return legends.length
    })
    .toBe(1)
  return legends[0]
}

describe.each([
  ['zh', zh, /新增|删除/],
  ['en', en, /Added|Removed/]
] as const)('directory status legend (%s)', (language, dictionary, textDiffWords) => {
  it('renders the directory vocabulary once in the filter row and never in the status bar', async () => {
    const port = createWebPlatformPort()
    await port.writeTextFile('/memory/legend-left/same.txt', 'same\n')
    await port.writeTextFile('/memory/legend-right/same.txt', 'same\n')
    await port.writeTextFile('/memory/legend-right/right-only.txt', 'right only\n')

    renderWithI18n(<Workbench platform={port} />, language)
    await openDirectoryPair('/memory/legend-left', '/memory/legend-right', dictionary)
    const legend = await openRightOnlySession()

    const statusBar = document.querySelector<HTMLElement>('footer[data-shell-level="status"]')
    expect(statusBar).not.toBeNull()
    const filterRow = document.querySelector<HTMLElement>(
      '[data-shell-level="view-toolbar"] [data-shell-entry="filter"]'
    )
    expect(filterRow).not.toBeNull()

    // Exactly one legend exists, it sits in the directory filter row, and the
    // status bar no longer repeats it.
    expect(
      document.querySelectorAll(FOUR_STATE_LEGEND_SELECTOR),
      '应用外壳图例应恰好 1 个；若渲染位置或标记变化，同时改 scripts/verify-release.mjs 的选择器'
    ).toHaveLength(1)
    expect(legend.getAttribute('data-shell-legend')).not.toBeNull()
    expect(
      filterRow?.parentElement?.contains(legend),
      '图例应位于目录过滤行；若移动图例，同时改 scripts/verify-release.mjs 的选择器'
    ).toBe(true)
    expect(
      statusBar?.querySelector('[data-shell-legend]'),
      '图例不得回到 status footer；若移动图例，同时改 scripts/verify-release.mjs 的选择器'
    ).toBeNull()
    expect(
      statusBar?.contains(legend),
      '图例不得位于 status footer 内；若移动图例，同时改 scripts/verify-release.mjs 的选择器'
    ).toBe(false)

    const counts = legendCounts()
    expect(counts).toEqual({ same: 1, added: 1, removed: 0, modified: 0 })
    expect(legend.textContent).not.toMatch(textDiffWords)

    // The shared reader and the serialized CDP expression read the same DOM,
    // and both equal the rendered cells and this pair's real four-state.
    const reading = readFourStateLegend(document)
    expect(reading).toEqual({ ok: true, counts })
    for (const status of LEGEND_STATUSES) {
      expect(reading.ok && reading.counts[status]).toBe(
        Number(legend.querySelector(`[data-legend-status="${status}"] .tabular`)?.textContent)
      )
    }
    expect(new Function('document', `return ${FOUR_STATE_EXPRESSION}`)(document)).toEqual(reading)

    // Every legend cell keeps its dot, count and label in view.
    for (const status of LEGEND_STATUSES) {
      const cell = legend.querySelector(`[data-legend-status="${status}"]`)
      expect(cell).not.toBeNull()
      expect(legend.contains(cell as Element)).toBe(true)
      expect(cell?.textContent).toContain(dictionary[DIRECTORY_STATUS_LABEL_KEYS[status]])
      expect(cell?.querySelector('.tabular')?.textContent).toMatch(/^\d+$/)
    }

    // The status bar keeps its single-row layout and its metric readouts.
    const footer = statusBar as HTMLElement
    const footerClasses = (footer.getAttribute('class') ?? '').split(/\s+/)
    expect(footerClasses).toContain('flex-wrap')
    expect(footerClasses.some((token) => token.startsWith('overflow-x'))).toBe(false)
    for (const key of [
      'shell.stat.sourceFiles',
      'shell.stat.targetFiles',
      'shell.stat.differences'
    ] as const) {
      const entry = Array.from(footer.querySelectorAll('span')).find(
        (span) => span.firstElementChild?.textContent === dictionary[key]
      )
      expect(entry).toBeDefined()
      expect(footer.contains(entry as Element)).toBe(true)
      expect(entry?.querySelector('.tabular')?.textContent).toMatch(/^\d+$/)
    }
  }, 60_000)
})

describe('four-state legend fail-closed reading', () => {
  it('returns distinguishable reasons for a missing, duplicated or non-numeric legend', async () => {
    const port = createWebPlatformPort()
    await port.writeTextFile('/memory/legend-negative-left/same.txt', 'same\n')
    await port.writeTextFile('/memory/legend-negative-right/same.txt', 'same\n')
    await port.writeTextFile('/memory/legend-negative-right/right-only.txt', 'right only\n')

    renderWithI18n(<Workbench platform={port} />, 'zh')
    await openDirectoryPair('/memory/legend-negative-left', '/memory/legend-negative-right', zh)
    const legend = await openRightOnlySession()
    const baseline = readFourStateLegend(document)
    expect(baseline).toEqual({ ok: true, counts: { same: 1, added: 1, removed: 0, modified: 0 } })

    // Missing: zero legends is never treated as zero counts.
    const parent = legend.parentNode
    const next = legend.nextSibling
    legend.remove()
    expect(readFourStateLegend(document)).toMatchObject({
      ok: false,
      reason: 'legend-missing',
      detail: { selector: FOUR_STATE_LEGEND_SELECTOR }
    })
    parent?.insertBefore(legend, next)
    expect(readFourStateLegend(document)).toEqual(baseline)

    // Duplicate: more than one legend reports how many were found.
    const clone = legend.cloneNode(true) as HTMLElement
    legend.after(clone)
    expect(readFourStateLegend(document)).toMatchObject({
      ok: false,
      reason: 'legend-duplicate',
      detail: { count: 2 }
    })
    clone.remove()
    expect(readFourStateLegend(document)).toEqual(baseline)

    // Non-finite: the reason carries the offending status and its raw text.
    const countNode = legend.querySelector('[data-legend-status="same"] .tabular')
    expect(countNode).not.toBeNull()
    const originalText = countNode?.textContent ?? ''
    if (countNode !== null) countNode.textContent = 'n/a'
    expect(readFourStateLegend(document)).toMatchObject({
      ok: false,
      reason: 'count-non-finite',
      detail: { status: 'same', text: 'n/a' }
    })
    if (countNode !== null) countNode.textContent = originalText
    expect(readFourStateLegend(document)).toEqual(baseline)
  }, 60_000)
})
