// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CODE_SCENE, DIRECTORY_SAMPLE_PATHS } from '@shared/fixtures'
import type { PlatformPort } from '@shared/platform/types'
import { diffLineTexts } from '@core/text/diff'
import type { DiffBlock } from '@core/text/diff'
import { DIFF_ROW_HEIGHT } from '@renderer/components/DiffPane'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { Workbench } from '@renderer/workbench/Workbench'

/**
 * jsdom reports zero-sized elements, which would give the virtualised directory
 * tree and the ruler no viewport at all. Fixed boxes stand in for the panels.
 */
const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1200 })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 640 })
})

afterAll(() => {
  if (originalWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalWidth)
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
  if (originalHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalHeight)
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight')
})

beforeEach(() => {
  localStorage.setItem('opencompare.userSettings', JSON.stringify({ language: 'zh' }))
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

/** The seven platform channels the ruler guards must never touch. */
const IO_CHANNELS = [
  'readTextFile',
  'selectFile',
  'selectDirectory',
  'listDirectory',
  'listDirectories',
  'digestFiles',
  'realpath'
] as const

type IoChannel = (typeof IO_CHANNELS)[number]

interface CountingPort {
  readonly port: PlatformPort
  /** Wrapped memory port, readable by the test without touching the counters. */
  readonly base: PlatformPort
  readonly calls: Record<IoChannel, number>
}

/** Memory PlatformPort with scripted pickers and per-channel call counters. */
function countingPort(script: {
  readonly files?: readonly string[]
  readonly directories?: readonly string[]
}): CountingPort {
  const base = createWebPlatformPort()
  const files = [...(script.files ?? [])]
  const directories = [...(script.directories ?? [])]
  const calls = Object.fromEntries(IO_CHANNELS.map((channel) => [channel, 0])) as Record<
    IoChannel,
    number
  >

  const port: PlatformPort = {
    ...base,
    selectFile: async () => {
      calls.selectFile += 1
      return files.shift() ?? null
    },
    selectDirectory: async () => {
      calls.selectDirectory += 1
      return directories.shift() ?? null
    },
    readTextFile: async (path) => {
      calls.readTextFile += 1
      return base.readTextFile(path)
    },
    listDirectory: async (path) => {
      calls.listDirectory += 1
      return base.listDirectory(path)
    },
    listDirectories: async (paths) => {
      calls.listDirectories += 1
      return base.listDirectories(paths)
    },
    digestFiles: async (paths, options) => {
      calls.digestFiles += 1
      return base.digestFiles(paths, options)
    },
    realpath: async (paths) => {
      calls.realpath += 1
      return base.realpath(paths)
    }
  }

  return { port, base, calls }
}

const SUMMARY_LEFT = CODE_SCENE.diff.left.path
const SUMMARY_RIGHT = CODE_SCENE.diff.right.path
const LEFT_ENGINE = `${DIRECTORY_SAMPLE_PATHS.left}/src/core/engine.ts`
const RIGHT_ENGINE = `${DIRECTORY_SAMPLE_PATHS.right}/src/core/engine.ts`
const SAMPLE_DIRECTORY_ID = `directory:${DIRECTORY_SAMPLE_PATHS.left} ↔ ${DIRECTORY_SAMPLE_PATHS.right}`
const DRILLDOWN_ID = `file:${SAMPLE_DIRECTORY_ID}::src/core/engine.ts`

function sessionTabs(): HTMLElement[] {
  return within(screen.getByRole('tablist', { name: '会话' })).getAllByRole('tab')
}

async function waitForTabCount(count: number): Promise<void> {
  await waitFor(() => expect(sessionTabs()).toHaveLength(count), { timeout: 4000 })
}

/** The picker is disabled while a comparison is loading; wait for it to settle. */
async function clickWhenReady(name: '打开文件' | '打开文件夹'): Promise<void> {
  const button = (): HTMLButtonElement =>
    screen.getByRole('button', { name }) as HTMLButtonElement
  await waitFor(() => expect(button().disabled).toBe(false))
  fireEvent.click(button())
}

/** Opens one file pair through the picker; the port answers in script order. */
async function openFilePair(expectedTabs: number): Promise<void> {
  await clickWhenReady('打开文件')
  await waitForTabCount(expectedTabs)
}

async function openDirectory(expectedTabs: number): Promise<void> {
  await clickWhenReady('打开文件夹')
  await waitForTabCount(expectedTabs)
}

/** Marker interval sequence of the active ruler — the isolation fingerprint. */
function markerRanges(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-diff-status]')).map(
    (marker) => `${marker.dataset.diffStatus}:${marker.dataset.startRow}-${marker.dataset.endRow}`
  )
}

function rulerElements(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('[data-diff-ruler]'))
}

function paneElements(container: HTMLElement): [HTMLDivElement, HTMLDivElement] {
  const panes = Array.from(container.querySelectorAll<HTMLDivElement>('div.h-full.overflow-auto'))
  if (panes.length !== 2) throw new Error(`expected 2 diff panes, found ${panes.length}`)
  return [panes[0], panes[1]]
}

/** Row titles of both directory panes, in render order. */
function treeRowTitles(): string[] {
  return screen
    .getAllByRole('tree')
    .flatMap((tree) =>
      within(tree)
        .getAllByRole('treeitem')
        .map((row) => row.getAttribute('title') ?? '')
    )
}

/** Block owning (or nearest to) a row — independent of the production projection. */
function nearestBlock(blocks: readonly DiffBlock[], row: number): DiffBlock {
  let best = blocks[0]
  let bestDistance = Number.POSITIVE_INFINITY
  for (const block of blocks) {
    const distance =
      row < block.startRow ? block.startRow - row : row > block.endRow ? row - block.endRow : 0
    if (distance === 0) return block
    if (distance < bestDistance) {
      bestDistance = distance
      best = block
    }
  }
  return best
}

describe('session tabs keep their own diff ruler', () => {
  /** Two different file pairs plus one directory session: 3 resident tabs. */
  async function openThreeSessions(): Promise<{
    container: HTMLElement
    counter: CountingPort
  }> {
    const counter = countingPort({
      files: [SUMMARY_LEFT, SUMMARY_RIGHT, LEFT_ENGINE, RIGHT_ENGINE],
      directories: [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right]
    })
    const { container } = render(<Workbench platform={counter.port} />)

    await openFilePair(1)
    await openFilePair(2)
    await openDirectory(3)
    await waitFor(() => expect(screen.getAllByRole('tree')).toHaveLength(2))

    return { container, counter }
  }

  /** Session tabs are addressed by position: 0 and 1 are diff pairs, 2 a tree. */
  async function activate(index: number): Promise<void> {
    const tab = sessionTabs()[index]
    fireEvent.click(tab)
    await waitFor(() => expect(tab.getAttribute('aria-selected')).toBe('true'))
  }

  it('switches two rounds across 3 tabs with zero platform IO and no progress state', async () => {
    const { counter } = await openThreeSessions()
    expect(sessionTabs()).toHaveLength(3)
    const before = { ...counter.calls }
    expect(before.readTextFile).toBeGreaterThan(0)
    expect(before.listDirectories).toBeGreaterThan(0)

    for (let round = 0; round < 2; round += 1) {
      for (const index of [0, 1, 2]) await activate(index)
    }

    expect(counter.calls).toEqual(before)
    expect(screen.queryByText('正在扫描目录')).toBeNull()
    expect(screen.queryByText('正在校验内容')).toBeNull()
  })

  it('keeps each tab ruler isolated and drops the ruler on a directory tab', async () => {
    const { container, counter } = await openThreeSessions()

    await activate(0)
    const firstCode = markerRanges(container)
    expect(rulerElements(container)).toHaveLength(1)
    expect(firstCode.length).toBeGreaterThan(0)

    await activate(1)
    const secondCode = markerRanges(container)
    expect(rulerElements(container)).toHaveLength(1)
    expect(secondCode.length).toBeGreaterThan(0)
    // Different file pairs paint different intervals.
    expect(secondCode).not.toEqual(firstCode)

    const before = { ...counter.calls }
    for (let round = 0; round < 2; round += 1) {
      await activate(0)
      expect(markerRanges(container)).toEqual(firstCode)
      await activate(1)
      expect(markerRanges(container)).toEqual(secondCode)
    }

    // The directory tab owns no ruler at all.
    await activate(2)
    expect(rulerElements(container)).toHaveLength(0)

    await activate(0)
    expect(rulerElements(container)).toHaveLength(1)
    expect(markerRanges(container)).toEqual(firstCode)
    expect(counter.calls).toEqual(before)
  })
})

describe('directory drilldown ruler roundtrip', () => {
  it('drills, jumps from a marker, returns to the same tree and re-drills the same markers', async () => {
    const counter = countingPort({
      directories: [DIRECTORY_SAMPLE_PATHS.left, DIRECTORY_SAMPLE_PATHS.right]
    })
    // Computed before the measured interaction window, through the bare port.
    const drilled = diffLineTexts(
      await counter.base.readTextFile(LEFT_ENGINE),
      await counter.base.readTextFile(RIGHT_ENGINE)
    )
    const { container } = render(<Workbench platform={counter.port} />)

    await openDirectory(1)
    await waitFor(() => expect(screen.getAllByRole('tree')).toHaveLength(2))

    // Put real view state on the source directory session.
    fireEvent.click(screen.getByRole('tab', { name: '仅差异' }))
    fireEvent.click(screen.getAllByRole('button', { name: '折叠 config' })[0])
    const titlesBefore = treeRowTitles()
    const sourceBody = screen.getAllByRole('tree')[0].parentElement as HTMLElement
    sourceBody.scrollTop = 96
    fireEvent.scroll(sourceBody)

    fireEvent.doubleClick(within(screen.getAllByRole('tree')[0]).getAllByText('engine.ts')[0])
    await screen.findByText(DRILLDOWN_ID, {}, { timeout: 4000 })

    // Exactly one ruler with at least one marker, painted from the drilled diff.
    expect(rulerElements(container)).toHaveLength(1)
    const firstRanges = markerRanges(container)
    expect(drilled.blocks.length).toBeGreaterThanOrEqual(2)
    expect(firstRanges.length).toBeGreaterThanOrEqual(drilled.blocks.length)

    const marker = container.querySelector<HTMLElement>('[data-diff-status]')
    if (!marker) throw new Error('the drilldown ruler painted no marker')
    const target = nearestBlock(drilled.blocks, Number(marker.dataset.startRow))
    // The first difference sits below the file head, so the jump is not a no-op.
    expect(target.startRow).toBeGreaterThan(0)
    const [left, right] = paneElements(container)

    fireEvent.click(marker)
    expect(left.scrollTop).toBe(target.startRow * DIFF_ROW_HEIGHT)
    expect(right.scrollTop).toBe(left.scrollTop)
    expect(screen.getByText(`${target.index + 1}/${drilled.blocks.length}`)).toBeDefined()

    // Returning to the tree reads, scans and hashes nothing.
    const ioBefore = { ...counter.calls }
    fireEvent.click(screen.getByRole('button', { name: '返回上级目录视图' }))
    await waitFor(() => expect(screen.getAllByRole('tree')).toHaveLength(2))

    expect(rulerElements(container)).toHaveLength(0)
    expect(treeRowTitles()).toEqual(titlesBefore)
    expect(screen.getByRole('tab', { name: '仅差异' }).getAttribute('aria-selected')).toBe('true')
    expect(within(screen.getAllByRole('tree')[0]).queryAllByText('deploy.yaml')).toHaveLength(0)
    expect((screen.getAllByRole('tree')[0].parentElement as HTMLElement).scrollTop).toBe(96)
    expect(counter.calls).toEqual(ioBefore)

    // A second drilldown of the same pair paints the same intervals.
    fireEvent.doubleClick(within(screen.getAllByRole('tree')[0]).getAllByText('engine.ts')[0])
    await screen.findByText(DRILLDOWN_ID, {}, { timeout: 4000 })
    expect(markerRanges(container)).toEqual(firstRanges)
  })
})
