// @vitest-environment jsdom
import { mkdir, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { DirectoryComparison, DirectoryDiffNode, FileDiffStatus } from '@core/directory/compare'
import { compareDirectories, createComparisonCache } from '@core/directory/compare'
import {
  DIRECTORY_FILTERS,
  countTreeFiles,
  filterDirectoryTree,
  projectDirectoryTree
} from '@core/directory/filter'
import type { DirectoryFilter } from '@core/directory/filter'
import {
  DIRECTORY_ROW_HEIGHT,
  buildDirectoryRowModel,
  visibleDirectoryCounts
} from '@core/directory/rows'
import type { DirectoryRowModel } from '@core/directory/rows'
import type { DirectoryEntry } from '@shared/platform/types'
import { DIFF_LABELS } from '@renderer/components/diffSemantics'
import { DirectoryView } from './DirectoryView'

vi.mock('@core/directory/filter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@core/directory/filter')>()
  return {
    ...actual,
    filterDirectoryTree: vi.fn(actual.filterDirectoryTree),
    projectDirectoryTree: vi.fn(actual.projectDirectoryTree)
  }
})

/**
 * jsdom reports zero-sized elements, which would give the virtualiser no
 * viewport at all. A fixed 1200×640 client box stands in for the real panel.
 */
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

/* ------------------------------------------------------------------ */
/* Real 50k-entry fixture                                              */
/* ------------------------------------------------------------------ */

const FIXED_MTIME = new Date('2026-01-02T03:04:05.000Z')
const BIG_SAME = 10_000
const BIG_MODIFIED = 10_000
const BIG_COUNT = BIG_SAME + BIG_MODIFIED
const SAME_FILES = 3_500
const MODIFIED_FILES = 1_000
const REMOVED_FILES = 1_500
const ADDED_FILES = 1_500
const LEAF_DIR_COUNT = 500
const OTHER_FILES = SAME_FILES + MODIFIED_FILES + REMOVED_FILES + ADDED_FILES

interface Fixture {
  readonly root: string
  readonly comparison: DirectoryComparison
}

/** `g{g}/s{s}/t{t}`: three directory levels below the root. */
function leafDirectory(index: number): string {
  const group = Math.floor(index / 100)
  const sub = Math.floor((index % 100) / 10)
  const leaf = index % 10
  return `g${group}/s${sub}/t${leaf}`
}

async function listDirectory(directory: string): Promise<readonly DirectoryEntry[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  return Promise.all(
    entries.map(async (entry) => {
      const full = path.join(directory, entry.name)
      const info = await stat(full)
      return {
        name: entry.name,
        path: full,
        isDirectory: entry.isDirectory(),
        size: info.size,
        modifiedMs: info.mtimeMs
      }
    })
  )
}

/**
 * Two real trees with 26,000 files each (plus 557 directories), one `big`
 * directory holding 20,000 direct children, and at least 1,000 files of each
 * of the four statuses. `same` pairs share content and a pinned mtime so the
 * engine settles them by hash.
 */
async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'opencompare-directory-view-'))
  const left = path.join(root, 'left')
  const right = path.join(root, 'right')
  await mkdir(path.join(left, 'big'), { recursive: true })
  await mkdir(path.join(right, 'big'), { recursive: true })

  const samePairs: { readonly left: string; readonly right: string }[] = []

  for (let index = 0; index < BIG_COUNT; index += 1) {
    const name = `big-${String(index).padStart(5, '0')}.txt`
    const leftPath = path.join(left, 'big', name)
    const rightPath = path.join(right, 'big', name)
    if (index < BIG_SAME) {
      const content = `big same ${index}`
      await writeFile(leftPath, content)
      await writeFile(rightPath, content)
      samePairs.push({ left: leftPath, right: rightPath })
    } else {
      await writeFile(leftPath, `big modified ${index}`)
      await writeFile(rightPath, `big modified ${index} with more bytes`)
    }
  }

  for (let index = 0; index < LEAF_DIR_COUNT; index += 1) {
    const relative = leafDirectory(index)
    await mkdir(path.join(left, relative), { recursive: true })
    await mkdir(path.join(right, relative), { recursive: true })
  }

  for (let index = 0; index < OTHER_FILES; index += 1) {
    const relative = leafDirectory(index % LEAF_DIR_COUNT)
    const name = `leaf-${String(index).padStart(5, '0')}.txt`
    const leftPath = path.join(left, relative, name)
    const rightPath = path.join(right, relative, name)
    if (index < SAME_FILES) {
      const content = `leaf same ${index}`
      await writeFile(leftPath, content)
      await writeFile(rightPath, content)
      samePairs.push({ left: leftPath, right: rightPath })
    } else if (index < SAME_FILES + MODIFIED_FILES) {
      await writeFile(leftPath, `leaf modified ${index}`)
      await writeFile(rightPath, `leaf modified ${index} with more bytes`)
    } else if (index < SAME_FILES + MODIFIED_FILES + REMOVED_FILES) {
      await writeFile(leftPath, `leaf removed ${index}`)
    } else {
      await writeFile(rightPath, `leaf added ${index}`)
    }
  }

  await Promise.all(
    samePairs.map(async (pair) => {
      await utimes(pair.left, FIXED_MTIME, FIXED_MTIME)
      await utimes(pair.right, FIXED_MTIME, FIXED_MTIME)
    })
  )

  const comparison = await compareDirectories(
    left,
    right,
    listDirectory,
    (file) => readFile(file, 'utf8'),
    createComparisonCache(),
    undefined,
    { concurrency: 32 }
  )
  return { root, comparison }
}

/** Synthetic 5,000-row comparison shaped like the real window's first rows. */
function syntheticComparison(fileCount: number): DirectoryComparison {
  const counts: Record<FileDiffStatus, number> = { same: 0, added: 0, removed: 0, modified: 0 }
  const files: DirectoryDiffNode[] = []
  for (let index = 0; index < fileCount; index += 1) {
    const status: FileDiffStatus = index % 2 === 0 ? 'same' : 'modified'
    const name = `big-${String(index).padStart(5, '0')}.txt`
    counts[status] += 1
    files.push({
      name,
      relativePath: `big/${name}`,
      kind: 'file',
      status,
      children: [],
      counts: { same: status === 'same' ? 1 : 0, added: 0, removed: 0, modified: status === 'modified' ? 1 : 0 },
      leftPath: `/left/big/${name}`,
      rightPath: `/right/big/${name}`
    })
  }
  const big: DirectoryDiffNode = {
    name: 'big',
    relativePath: 'big',
    kind: 'directory',
    status: 'modified',
    children: files,
    counts,
    leftPath: '/left/big',
    rightPath: '/right/big'
  }
  const root: DirectoryDiffNode = {
    name: 'left',
    relativePath: '',
    kind: 'directory',
    status: 'modified',
    children: [big],
    counts,
    leftPath: '/left',
    rightPath: '/right'
  }
  return {
    leftRoot: '/left',
    rightRoot: '/right',
    leftName: 'left',
    rightName: 'right',
    root,
    counts,
    fileCount,
    skipped: 0
  }
}

/* ------------------------------------------------------------------ */
/* View harness (mirrors the workbench shell's controlled state)       */
/* ------------------------------------------------------------------ */

type Side = 'left' | 'right'

interface SavedState {
  readonly filter: DirectoryFilter
  readonly collapsed: readonly string[]
  readonly selectedPath: string | null
  readonly left: number
  readonly right: number
}

const INITIAL_STATE: SavedState = {
  filter: 'all',
  collapsed: [],
  selectedPath: null,
  left: 0,
  right: 0
}

function Harness({
  comparison,
  initial,
  onSaved
}: {
  readonly comparison: DirectoryComparison
  readonly initial: SavedState
  readonly onSaved?: (state: SavedState) => void
}): JSX.Element {
  const [filter, setFilter] = useState<DirectoryFilter>(initial.filter)
  const [collapsed, setCollapsed] = useState<readonly string[]>(initial.collapsed)
  const [selectedPath, setSelectedPath] = useState<string | null>(initial.selectedPath)
  const [scrollTops, setScrollTops] = useState({ left: initial.left, right: initial.right })

  useEffect(() => {
    onSaved?.({
      filter,
      collapsed,
      selectedPath,
      left: scrollTops.left,
      right: scrollTops.right
    })
  }, [onSaved, filter, collapsed, selectedPath, scrollTops])

  function togglePath(target: string): void {
    setCollapsed((current) =>
      current.includes(target) ? current.filter((item) => item !== target) : [...current, target]
    )
  }

  return (
    <DirectoryView
      sessionId="directory-test"
      comparison={comparison}
      filter={filter}
      onFilterChange={setFilter}
      collapsedPaths={collapsed}
      onTogglePath={togglePath}
      selectedPath={selectedPath}
      onSelectPath={setSelectedPath}
      scrollTops={scrollTops}
      onScrollTopChange={(side, scrollTop) =>
        setScrollTops((current) =>
          current[side] === scrollTop ? current : { ...current, [side]: scrollTop }
        )
      }
      visibleCounts={{ ...comparison.counts, conflict: 0 }}
      pickerAvailable={false}
      busy={false}
      onPick={() => {}}
      onLoadSample={() => {}}
      onOpenFile={() => {}}
      leftIsSnapshot={false}
      rightIsSnapshot={false}
      onExportSnapshot={() => {}}
      onImportSnapshot={() => {}}
      onLoadRemoteSnapshotSample={() => {}}
      onPreviewSync={() => {}}
      onPreviewTemplate={() => {}}
      syncPreview={null}
      templatePreview={null}
      onCancelSync={() => {}}
      onConfirmSync={() => {}}
      onCancelTemplate={() => {}}
      onConfirmTemplate={() => {}}
    />
  )
}

/* ------------------------------------------------------------------ */
/* DOM helpers                                                         */
/* ------------------------------------------------------------------ */

function trees(): readonly [HTMLElement, HTMLElement] {
  const [left, right] = screen.getAllByRole('tree')
  return [left, right]
}

function scrollerOf(tree: HTMLElement): HTMLElement {
  const element = tree.closest('.overflow-auto')
  if (!(element instanceof HTMLElement)) throw new Error('tree has no scroll container')
  return element
}

function scrollTo(tree: HTMLElement, scrollTop: number): HTMLElement {
  const element = scrollerOf(tree)
  element.scrollTop = scrollTop
  fireEvent.scroll(element)
  return element
}

function renderedRows(tree: HTMLElement): HTMLElement[] {
  return Array.from(tree.querySelectorAll<HTMLElement>('[role="treeitem"]'))
}

/** TreeRow titles are the relative path, except for the root which shows its name. */
function renderedPaths(tree: HTMLElement, rootName: string): string[] {
  return renderedRows(tree).map((row) => {
    const title = row.getAttribute('title') ?? ''
    return title === rootName ? '' : title
  })
}

function modelPaths(model: DirectoryRowModel): string[] {
  const paths: string[] = []
  for (let index = 0; index < model.length; index += 1) {
    const row = model.at(index)
    if (!row) throw new Error(`row model is missing index ${index}`)
    paths.push(row.node.relativePath)
  }
  return paths
}

function oraclePaths(
  root: DirectoryDiffNode,
  filter: DirectoryFilter,
  side: Side,
  collapsed: readonly string[] = []
): string[] {
  const filtered = filterDirectoryTree(root, filter)
  const projected = filtered ? projectDirectoryTree(filtered, side) : null
  const collapsedSet = new Set(collapsed)
  const paths: string[] = []
  if (!projected) return paths

  function walk(node: DirectoryDiffNode): void {
    paths.push(node.relativePath)
    if (node.kind === 'directory' && !collapsedSet.has(node.relativePath)) {
      for (const child of node.children) walk(child)
    }
  }

  walk(projected)
  return paths
}

function elementCount(): number {
  return document.querySelectorAll('*').length
}

/* ------------------------------------------------------------------ */
/* Suite                                                               */
/* ------------------------------------------------------------------ */

let fixture: Fixture

beforeAll(async () => {
  fixture = await createFixture()
  expect(fixture.comparison.counts).toEqual({
    same: BIG_SAME + SAME_FILES,
    added: ADDED_FILES,
    removed: REMOVED_FILES,
    modified: BIG_MODIFIED + MODIFIED_FILES
  })
}, 120_000)

afterAll(async () => {
  if (fixture) await rm(fixture.root, { recursive: true, force: true })
})

describe('DirectoryView windowed tree', () => {
  it('keeps both panes bounded while scrolling through a 50k-entry comparison', () => {
    render(<Harness comparison={fixture.comparison} initial={INITIAL_STATE} />)
    const leftModel = buildDirectoryRowModel(fixture.comparison.root, 'all', 'left', [])
    const rightModel = buildDirectoryRowModel(fixture.comparison.root, 'all', 'right', [])
    const totalHeight = Math.max(leftModel.length, rightModel.length) * DIRECTORY_ROW_HEIGHT

    const [left, right] = trees()
    expect(leftModel.length).toBeGreaterThanOrEqual(26_000)
    expect(renderedRows(left).length).toBeLessThanOrEqual(80)
    expect(renderedRows(right).length).toBeLessThanOrEqual(80)
    expect(elementCount()).toBeLessThanOrEqual(5000)

    const rowCounts: number[] = []
    const elementCounts: number[] = []
    for (let iteration = 0; iteration < 20; iteration += 1) {
      const target =
        iteration % 2 === 0 ? Math.floor(totalHeight / 2) : Math.max(0, totalHeight - 640)
      scrollTo(left, target)
      scrollTo(right, target)
      const [currentLeft, currentRight] = trees()
      const leftRows = renderedRows(currentLeft).length
      const rightRows = renderedRows(currentRight).length
      expect(leftRows).toBeLessThanOrEqual(80)
      expect(rightRows).toBeLessThanOrEqual(80)
      rowCounts.push(leftRows)
      elementCounts.push(elementCount())
    }
    expect(elementCounts.every((count) => count <= 5000)).toBe(true)
    // The window is stable: the same two offsets always yield the same amount of
    // DOM, so repeated scrolling never accumulates rows.
    expect(Math.max(...rowCounts)).toBeLessThanOrEqual(80)
    expect(new Set(rowCounts).size).toBeLessThanOrEqual(2)
    expect(new Set(elementCounts).size).toBeLessThanOrEqual(2)
  })

  it('renders the same window for 5,000 rows and 50k rows', () => {
    const big = render(<Harness comparison={fixture.comparison} initial={INITIAL_STATE} />)
    const [bigLeft, bigRight] = trees()
    const bigRows = renderedRows(bigLeft).length + renderedRows(bigRight).length
    const bigElements = elementCount()
    big.unmount()

    const small = render(
      <Harness comparison={syntheticComparison(4_999)} initial={INITIAL_STATE} />
    )
    const [smallLeft, smallRight] = trees()
    const smallRows = renderedRows(smallLeft).length + renderedRows(smallRight).length
    const smallElements = elementCount()

    expect(Math.abs(bigRows - smallRows)).toBeLessThanOrEqual(2)
    expect(Math.abs(bigElements - smallElements) / Math.max(bigElements, smallElements)).toBeLessThanOrEqual(0.1)
    small.unmount()

    // Same relative scroll position: still the same amount of DOM.
    const fixtureScroll = Math.floor(
      (buildDirectoryRowModel(fixture.comparison.root, 'all', 'left', []).length *
        DIRECTORY_ROW_HEIGHT -
        640) /
        2
    )
    const rebuiltBig = render(
      <Harness comparison={fixture.comparison} initial={{ ...INITIAL_STATE, left: fixtureScroll, right: fixtureScroll }} />
    )
    const [scrolledBigLeft, scrolledBigRight] = trees()
    const scrolledBigRows =
      renderedRows(scrolledBigLeft).length + renderedRows(scrolledBigRight).length
    const scrolledBigElements = elementCount()
    rebuiltBig.unmount()

    const smallScroll = Math.floor((5_001 * DIRECTORY_ROW_HEIGHT - 640) / 2)
    render(
      <Harness
        comparison={syntheticComparison(4_999)}
        initial={{ ...INITIAL_STATE, left: smallScroll, right: smallScroll }}
      />
    )
    const [scrolledSmallLeft, scrolledSmallRight] = trees()
    const scrolledSmallRows =
      renderedRows(scrolledSmallLeft).length + renderedRows(scrolledSmallRight).length
    const scrolledSmallElements = elementCount()

    expect(Math.abs(scrolledBigRows - scrolledSmallRows)).toBeLessThanOrEqual(2)
    expect(
      Math.abs(scrolledBigElements - scrolledSmallElements) /
        Math.max(scrolledBigElements, scrolledSmallElements)
    ).toBeLessThanOrEqual(0.1)
  })

  it('expands a 20,000-child folder without materialising it', () => {
    render(
      <Harness
        comparison={fixture.comparison}
        initial={{ ...INITIAL_STATE, collapsed: ['big'] }}
      />
    )
    const [collapsedLeft] = trees()
    expect(renderedPaths(collapsedLeft, fixture.comparison.root.name)).not.toContain(
      'big/big-00000.txt'
    )

    fireEvent.click(within(collapsedLeft).getByRole('button', { name: '展开 big' }))

    const [left, right] = trees()
    expect(renderedRows(left).length).toBeLessThanOrEqual(80)
    expect(renderedRows(right).length).toBeLessThanOrEqual(80)

    const model = buildDirectoryRowModel(fixture.comparison.root, 'all', 'left', [])
    const lastChild = modelPaths(model).indexOf('big/big-19999.txt')
    expect(lastChild).toBeGreaterThan(19_999)
    scrollTo(left, (lastChild + 1) * DIRECTORY_ROW_HEIGHT - 640)
    expect(renderedPaths(left, fixture.comparison.root.name)).toContain('big/big-19999.txt')
  })

  it('renders the rows the model names after scrolling far down', () => {
    render(<Harness comparison={fixture.comparison} initial={INITIAL_STATE} />)
    const [left] = trees()
    const model = buildDirectoryRowModel(fixture.comparison.root, 'all', 'left', [])
    const title = fixture.comparison.root.name
    const indexByPath = new Map(modelPaths(model).map((value, index) => [value, index]))
    const scrollTop = model.length * DIRECTORY_ROW_HEIGHT - 640 - 37
    const element = scrollTo(left, scrollTop)

    expect(left.style.height).toBe(`${model.length * DIRECTORY_ROW_HEIGHT}px`)
    const firstIndex = Math.floor(scrollTop / DIRECTORY_ROW_HEIGHT)
    const lastIndex = Math.floor((scrollTop + element.clientHeight - 1) / DIRECTORY_ROW_HEIGHT)

    const indices: number[] = []
    for (const row of renderedRows(left)) {
      const titleAttr = row.getAttribute('title') ?? ''
      const relativePath = titleAttr === title ? '' : titleAttr
      const index = indexByPath.get(relativePath)
      expect(index).toBeDefined()
      const modelRow = model.at(index ?? -1)
      expect(modelRow).toBeDefined()
      indices.push(index ?? -1)
      expect(row.textContent).toContain(modelRow?.node.name)
      expect(row.textContent).toContain(DIFF_LABELS[modelRow?.node.status ?? 'same'])
      expect(Number(row.getAttribute('aria-level')) - 1).toBe(modelRow?.depth)
    }

    expect(indices.length).toBeGreaterThan(0)
    for (let cursor = 1; cursor < indices.length; cursor += 1) {
      expect(indices[cursor]).toBeGreaterThan(indices[cursor - 1])
    }
    expect(new Set(indices).size).toBe(indices.length)
    expect(indices).toContain(firstIndex)
    expect(indices).toContain(lastIndex)
  })

  it('switches the five filters onto their own row prefix', () => {
    render(<Harness comparison={fixture.comparison} initial={INITIAL_STATE} />)
    const labels: Record<DirectoryFilter, string> = {
      all: '全部',
      differences: '仅差异',
      'left-only': '左独有',
      'right-only': '右独有',
      same: '相同'
    }

    for (const filter of DIRECTORY_FILTERS) {
      const [left, right] = trees()
      scrollTo(left, 0)
      scrollTo(right, 0)
      fireEvent.click(screen.getByRole('tab', { name: labels[filter] }))

      const leftModel = buildDirectoryRowModel(fixture.comparison.root, filter, 'left', [])
      const rightModel = buildDirectoryRowModel(fixture.comparison.root, filter, 'right', [])
      const leftPaths = renderedPaths(left, fixture.comparison.root.name)
      const rightPaths = renderedPaths(right, fixture.comparison.root.name)

      expect(leftPaths).toEqual(modelPaths(leftModel).slice(0, leftPaths.length))
      expect(rightPaths).toEqual(modelPaths(rightModel).slice(0, rightPaths.length))
      expect(leftPaths[0]).toBe('')
      expect(rightPaths[0]).toBe('')
      expect(leftPaths.length).toBeLessThanOrEqual(80)
      expect(rightPaths.length).toBeLessThanOrEqual(80)
      expect(visibleDirectoryCounts(fixture.comparison.root, filter)).toEqual(
        countTreeFiles(filterDirectoryTree(fixture.comparison.root, filter))
      )
    }
  })

  it('shows the existing empty-filter copy and no rows when a filter matches nothing', () => {
    const modifiedOnly: DirectoryComparison = (() => {
      const file: DirectoryDiffNode = {
        name: 'a.txt',
        relativePath: 'a.txt',
        kind: 'file',
        status: 'modified',
        children: [],
        counts: { same: 0, added: 0, removed: 0, modified: 1 },
        leftPath: '/left/a.txt',
        rightPath: '/right/a.txt'
      }
      const counts = { same: 0, added: 0, removed: 0, modified: 1 }
      const root: DirectoryDiffNode = {
        name: 'left',
        relativePath: '',
        kind: 'directory',
        status: 'modified',
        children: [file],
        counts,
        leftPath: '/left',
        rightPath: '/right'
      }
      return {
        leftRoot: '/left',
        rightRoot: '/right',
        leftName: 'left',
        rightName: 'right',
        root,
        counts,
        fileCount: 1,
        skipped: 0
      }
    })()

    render(
      <Harness comparison={modifiedOnly} initial={{ ...INITIAL_STATE, filter: 'same' }} />
    )
    expect(screen.queryAllByRole('tree')).toHaveLength(0)
    expect(screen.getByText('当前过滤下左目录没有条目。')).toBeDefined()
    expect(screen.getByText('当前过滤下右目录没有条目。')).toBeDefined()
  })

  it('restores filter, collapse, selection and scroll after a drilldown remount', () => {
    const collapsed = ['g0']
    const model = buildDirectoryRowModel(
      fixture.comparison.root,
      'differences',
      'left',
      collapsed
    )
    const selectedRow = model.at(206)
    if (!selectedRow) throw new Error('fixture is missing row 206')
    const initial: SavedState = {
      filter: 'differences',
      collapsed,
      selectedPath: selectedRow.node.relativePath,
      left: 4800,
      right: 4800
    }
    let saved: SavedState = initial

    const first = render(
      <Harness comparison={fixture.comparison} initial={initial} onSaved={(next) => {
        saved = next
      }} />
    )

    const [left, right] = trees()
    expect(Math.abs(scrollerOf(left).scrollTop - 4800)).toBeLessThanOrEqual(1)
    expect(Math.abs(scrollerOf(right).scrollTop - 4800)).toBeLessThanOrEqual(1)
    const selected = screen
      .getAllByRole('treeitem')
      .filter((row) => row.getAttribute('aria-selected') === 'true')
    expect(selected.length).toBeGreaterThan(0)
    const selectedPath = selected[0].getAttribute('title')
    const selectedIndex = modelPaths(model).indexOf(selectedPath ?? '')
    expect(selectedIndex).toBeGreaterThanOrEqual(190)
    expect(selectedIndex).toBeLessThanOrEqual(226)
    expect(renderedPaths(left, fixture.comparison.root.name)).not.toContain('g0/s0')
    first.unmount()

    // The shell re-mounts with exactly what it saved before the drilldown.
    expect(saved.filter).toBe('differences')
    expect(saved.selectedPath).toBe(initial.selectedPath)
    render(<Harness comparison={fixture.comparison} initial={saved} />)

    const [restoredLeft, restoredRight] = trees()
    expect(Math.abs(scrollerOf(restoredLeft).scrollTop - 4800)).toBeLessThanOrEqual(1)
    expect(Math.abs(scrollerOf(restoredRight).scrollTop - 4800)).toBeLessThanOrEqual(1)
    expect(screen.getByRole('tab', { name: '仅差异' }).getAttribute('aria-selected')).toBe('true')
    const restoredSelected = screen
      .getAllByRole('treeitem')
      .filter((row) => row.getAttribute('aria-selected') === 'true')
    expect(restoredSelected.length).toBeGreaterThan(0)
    const restoredPaths = modelPaths(
      buildDirectoryRowModel(fixture.comparison.root, saved.filter, 'left', saved.collapsed)
    )
    expect(restoredPaths.slice(0, 1)).toEqual([''])
    expect(renderedPaths(restoredLeft, fixture.comparison.root.name)).not.toContain('g0/s0')
    expect(restoredSelected[0].getAttribute('title')).toBe(initial.selectedPath)
  })

  it('never filters or projects the whole tree while rendering and interacting', () => {
    vi.mocked(filterDirectoryTree).mockClear()
    vi.mocked(projectDirectoryTree).mockClear()

    render(
      <Harness
        comparison={fixture.comparison}
        initial={{ ...INITIAL_STATE, collapsed: ['big', 'g0'] }}
      />
    )
    fireEvent.click(within(trees()[0]).getByRole('button', { name: '展开 g0' }))
    fireEvent.click(within(trees()[0]).getByRole('button', { name: '展开 big' }))
    scrollTo(trees()[0], 20_000)
    fireEvent.click(screen.getByRole('tab', { name: '仅差异' }))
    scrollTo(trees()[0], 0)
    fireEvent.click(screen.getByRole('tab', { name: '左独有' }))
    fireEvent.click(within(trees()[0]).getAllByRole('treeitem')[0])

    expect(vi.mocked(filterDirectoryTree)).not.toHaveBeenCalled()
    expect(vi.mocked(projectDirectoryTree)).not.toHaveBeenCalled()
  })

  it('matches the filtered/projected oracle on the 50k fixture and keeps node identity', () => {
    const originals = new Map<string, DirectoryDiffNode>()
    const walk = (node: DirectoryDiffNode): void => {
      originals.set(node.relativePath, node)
      for (const child of node.children) walk(child)
    }
    walk(fixture.comparison.root)

    for (const filter of DIRECTORY_FILTERS) {
      for (const side of ['left', 'right'] as const) {
        const model = buildDirectoryRowModel(fixture.comparison.root, filter, side, [])
        expect(modelPaths(model)).toEqual(oraclePaths(fixture.comparison.root, filter, side))
        for (let index = 0; index < model.length; index += 997) {
          const row = model.at(index)
          expect(row?.node).toBe(originals.get(row?.node.relativePath ?? ''))
        }
      }
    }

    const collapsed = ['big', 'g0/s0']
    for (const filter of DIRECTORY_FILTERS) {
      for (const side of ['left', 'right'] as const) {
        const model = buildDirectoryRowModel(fixture.comparison.root, filter, side, collapsed)
        expect(modelPaths(model)).toEqual(
          oraclePaths(fixture.comparison.root, filter, side, collapsed)
        )
      }
    }
  })
})
