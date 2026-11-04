// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { FileDiffStatus } from '@core/directory/compare'
import { en, zh } from '@renderer/i18n/messages'
import { renderWithI18n } from '@renderer/i18n/testing'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { DIRECTORY_STATUS_LABEL_KEYS } from '@renderer/views/directoryCopy'
import { Workbench } from './Workbench'

const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')

beforeAll(() => {
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
  if (originalWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalWidth)
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
  if (originalHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalHeight)
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight')
})

afterEach(cleanup)

const LEGEND_STATUSES = ['same', 'added', 'removed', 'modified'] as const
type Dictionary = typeof en | typeof zh

/** The single four-cell legend of the directory shell. */
function directoryLegends(dictionary: Dictionary): HTMLElement[] {
  const labels = LEGEND_STATUSES.map((status) => dictionary[DIRECTORY_STATUS_LABEL_KEYS[status]])
  return Array.from(document.querySelectorAll<HTMLElement>('span')).filter((span) => {
    const cells = Array.from(span.children)
    return (
      cells.length === labels.length &&
      labels.every((label, index) => cells[index]?.textContent?.includes(label) === true)
    )
  })
}

function legendCounts(legend: HTMLElement, dictionary: Dictionary): Record<FileDiffStatus, number> {
  const counts: Record<FileDiffStatus, number> = { same: 0, added: 0, removed: 0, modified: 0 }
  for (const cell of Array.from(legend.children)) {
    const text = cell.textContent ?? ''
    const status = LEGEND_STATUSES.find((candidate) =>
      text.includes(dictionary[DIRECTORY_STATUS_LABEL_KEYS[candidate]])
    )
    if (!status) throw new Error(`legend cell has no directory status label: ${text}`)
    counts[status] = Number(cell.querySelector('.tabular')?.textContent)
  }
  return counts
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
async function openRightOnlySession(dictionary: Dictionary): Promise<HTMLElement> {
  await screen.findAllByRole('tree', {}, { timeout: 30_000 })
  let legends: HTMLElement[] = []
  await expect
    .poll(() => {
      legends = directoryLegends(dictionary)
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
    const legend = await openRightOnlySession(dictionary)

    const statusBar = document.querySelector<HTMLElement>('footer[data-shell-level="status"]')
    expect(statusBar).not.toBeNull()
    const filterRow = document.querySelector<HTMLElement>(
      '[data-shell-level="view-toolbar"] [data-shell-entry="filter"]'
    )
    expect(filterRow).not.toBeNull()

    // Exactly one legend exists, it sits in the directory filter row, and the
    // status bar no longer repeats it.
    expect(document.querySelectorAll('[data-shell-legend]')).toHaveLength(1)
    expect(legend.getAttribute('data-shell-legend')).not.toBeNull()
    expect(filterRow?.parentElement?.contains(legend)).toBe(true)
    expect(statusBar?.querySelector('[data-shell-legend]')).toBeNull()
    expect(statusBar?.contains(legend)).toBe(false)

    const counts = legendCounts(legend, dictionary)
    expect(counts).toEqual({ same: 1, added: 1, removed: 0, modified: 0 })
    expect(legend.textContent).not.toMatch(textDiffWords)

    // Every legend cell keeps its dot, count and label in view.
    for (const status of LEGEND_STATUSES) {
      const cell = Array.from(legend.children).find((child) =>
        (child.textContent ?? '').includes(dictionary[DIRECTORY_STATUS_LABEL_KEYS[status]])
      )
      expect(cell).toBeDefined()
      expect(legend.contains(cell as Element)).toBe(true)
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
