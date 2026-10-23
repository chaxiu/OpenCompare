// @vitest-environment jsdom
import { useState } from 'react'
import type { JSX } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { DirectoryDiffNode, FileDiffStatus } from '@core/directory/compare'
import {
  DIRECTORY_MAX_TREE_HEIGHT,
  DIRECTORY_ROW_HEIGHT,
  buildDirectoryRowModel,
  createDirectoryScrollMap
} from '@core/directory/rows'
import type { DirectoryRowModel } from '@core/directory/rows'
import {
  LARGE_FILES_PER_DIRECTORY,
  LARGE_ROW_COUNT,
  LARGE_SIDE_FILES_PER_DIRECTORY,
  createLargeDirectoryComparison
} from '../../../test/largeDirectory'
import { DIFF_LABEL_KEYS } from './diffSemantics'
import { zh } from '@renderer/i18n/messages'
import { TreeView } from './TreeView'

/**
 * jsdom has no layout, so every element reports a zero client box. The tree
 * only needs a viewport height to size its row window; a fixed 640px pane
 * stands in for the real panel.
 */
const VIEWPORT = 640
const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => VIEWPORT
  })
})

afterAll(() => {
  if (originalHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalHeight)
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight')
})

afterEach(cleanup)

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

function TreeHarness({
  rows,
  initialScrollTop,
  selectedPath
}: {
  readonly rows: DirectoryRowModel
  readonly initialScrollTop: number
  readonly selectedPath: string | null
}): JSX.Element {
  const [body, setBody] = useState<HTMLDivElement | null>(null)
  // Mirrors the panel body: the element already carries the restored offset
  // when the tree mounts, exactly like DirectoryView's layout effect.
  function attachBody(element: HTMLDivElement | null): void {
    if (element) element.scrollTop = initialScrollTop
    setBody(element)
  }

  return (
    <div ref={attachBody} data-testid="tree-scroller" className="overflow-auto">
      {body ? (
        <TreeView
          label="big-root"
          rows={rows}
          scrollElement={body}
          initialScrollTop={initialScrollTop}
          selectedPath={selectedPath}
          onTogglePath={() => {}}
          onSelectPath={() => {}}
        />
      ) : null}
    </div>
  )
}

function treeElement(): HTMLElement {
  return screen.getByRole('tree')
}

function scroller(): HTMLElement {
  return screen.getByTestId('tree-scroller')
}

function renderedRows(): HTMLElement[] {
  return Array.from(treeElement().querySelectorAll<HTMLElement>('[role="treeitem"]'))
}

function renderedTitles(): string[] {
  return renderedRows().map((row) => row.getAttribute('title') ?? '')
}

/** The root row renders its name (it has no relative path); the rest render paths. */
function titleOf(node: DirectoryDiffNode | undefined): string {
  if (!node) return ''
  return node.relativePath === '' ? node.name : node.relativePath
}

function scrollTreeTo(offset: number): void {
  const element = scroller()
  element.scrollTop = offset
  fireEvent.scroll(element)
}

/* ------------------------------------------------------------------ */
/* Lazy 1,516,096-row model                                            */
/* ------------------------------------------------------------------ */

const STATUSES: readonly FileDiffStatus[] = ['same', 'added', 'removed', 'modified']

function countsFor(status: FileDiffStatus): Readonly<Record<FileDiffStatus, number>> {
  return {
    same: status === 'same' ? 1 : 0,
    added: status === 'added' ? 1 : 0,
    removed: status === 'removed' ? 1 : 0,
    modified: status === 'modified' ? 1 : 0
  }
}

/**
 * A row model of the acceptance size whose nodes are generated on demand: the
 * renderer only ever asks for the rows inside its window, and `at()` returns
 * distinct paths so titles can be matched back to indices. The semantic row
 * model itself is covered by `rows.test.ts` on a real 700k-row tree.
 */
function lazyRows(rowCount: number): DirectoryRowModel {
  const workspaceIndex = Math.floor(rowCount / 2)
  const directory: DirectoryDiffNode = {
    name: 'source-code',
    relativePath: 'source-code',
    kind: 'directory',
    status: 'modified',
    children: [],
    counts: { same: 0, added: 0, removed: 0, modified: 0 },
    leftPath: '/left/source-code',
    rightPath: '/right/source-code'
  }

  function nodeAt(index: number): DirectoryDiffNode {
    if (index === 0) {
      return {
        ...directory,
        name: 'big-root',
        relativePath: '',
        leftPath: '/left',
        rightPath: '/right'
      }
    }
    if (index === 1) return directory
    if (index === workspaceIndex) {
      return {
        ...directory,
        name: 'workspace',
        relativePath: 'workspace',
        leftPath: '/left/workspace',
        rightPath: '/right/workspace'
      }
    }
    const parent = index < workspaceIndex ? 'source-code' : 'workspace'
    const status = STATUSES[index % STATUSES.length]
    return {
      name: `file-${index}.ts`,
      relativePath: `${parent}/file-${index}.ts`,
      kind: 'file',
      status,
      children: [],
      counts: countsFor(status),
      leftPath: `/left/${parent}/file-${index}.ts`,
      rightPath: `/right/${parent}/file-${index}.ts`
    }
  }

  function depthAt(index: number): number {
    return index === 0 ? 0 : index === 1 || index === workspaceIndex ? 1 : 2
  }

  return {
    length: rowCount,
    at(index: number) {
      if (index < 0 || index >= rowCount) return undefined
      return { node: nodeAt(index), depth: depthAt(index), open: true }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Suite                                                               */
/* ------------------------------------------------------------------ */

describe('TreeView beyond the browser height cap', () => {
  it('caps 1,516,096 rows below 2^24 and keeps smaller trees pixel-exact', () => {
    const big = render(
      <TreeHarness rows={lazyRows(1_516_096)} initialScrollTop={0} selectedPath={null} />
    )
    const height = Number.parseFloat(treeElement().style.height)
    expect(height).toBe(DIRECTORY_MAX_TREE_HEIGHT)
    expect(height).toBeLessThan(2 ** 24)
    big.unmount()

    for (const rowCount of [5_000, 699_050]) {
      const small = render(
        <TreeHarness rows={lazyRows(rowCount)} initialScrollTop={0} selectedPath={null} />
      )
      expect(treeElement().style.height).toBe(`${rowCount * DIRECTORY_ROW_HEIGHT}px`)
      small.unmount()
    }
  })

  it('renders the final row at the maximum scroll offset', () => {
    const rowCount = 1_516_096
    const rows = lazyRows(rowCount)
    const map = createDirectoryScrollMap(rowCount, VIEWPORT)
    render(
      <TreeHarness rows={rows} initialScrollTop={map.maxScrollOffset} selectedPath={null} />
    )
    expect(Math.abs(scroller().scrollTop - map.maxScrollOffset)).toBeLessThanOrEqual(1)

    const last = rows.at(rowCount - 1)
    expect(last).toBeDefined()
    const row = renderedRows().find(
      (element) => element.getAttribute('title') === titleOf(last?.node)
    )
    expect(row).toBeDefined()
    expect(row?.getAttribute('aria-level')).toBe(String((last?.depth ?? 0) + 1))
    expect(row?.textContent).toContain(last?.node.name)
    expect(row?.textContent).toContain(zh[DIFF_LABEL_KEYS[last?.node.status ?? 'same']])
  })

  it('reaches every sampled row through its mapped offset', () => {
    const rowCount = 1_516_096
    const rows = lazyRows(rowCount)
    const map = createDirectoryScrollMap(rowCount, VIEWPORT)
    render(<TreeHarness rows={rows} initialScrollTop={0} selectedPath={null} />)

    const targets = [
      0,
      1,
      Math.floor(rowCount / 4),
      Math.floor(rowCount / 2),
      Math.floor((rowCount * 3) / 4),
      rowCount - 2,
      rowCount - 1
    ]
    let previousOffset = -1
    for (const index of targets) {
      const offset = map.offsetForIndex(index)
      expect(offset).toBeGreaterThan(previousOffset)
      previousOffset = offset
      scrollTreeTo(offset)

      const expected = rows.at(index)
      const rendered = renderedRows().find(
        (element) => element.getAttribute('title') === titleOf(expected?.node)
      )
      expect(rendered, `row ${index} is not in the window`).toBeDefined()
      expect(Number(rendered?.getAttribute('aria-level')) - 1).toBe(expected?.depth)
      expect(rendered?.textContent).toContain(expected?.node.name)
      expect(rendered?.textContent).toContain(zh[DIFF_LABEL_KEYS[expected?.node.status ?? 'same']])
    }

    expect(map.offsetForIndex(rowCount - 1)).toBeLessThanOrEqual(map.maxScrollOffset)

    // Tail directories are ordinary rows of the model, reachable like any other.
    for (const index of [1, Math.floor(rowCount / 2)]) {
      scrollTreeTo(map.offsetForIndex(index))
      const expected = rows.at(index)
      expect(renderedTitles()).toContain(titleOf(expected?.node))
    }
  })

  it('keeps the rendered window bounded regardless of position and row count', () => {
    const bigRows = lazyRows(1_516_096)
    const bigMap = createDirectoryScrollMap(1_516_096, VIEWPORT)
    const big = render(<TreeHarness rows={bigRows} initialScrollTop={0} selectedPath={null} />)

    for (const fraction of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      scrollTreeTo(bigMap.maxScrollOffset * fraction)
      const count = renderedRows().length
      expect(count).toBeGreaterThan(0)
      expect(count).toBeLessThanOrEqual(80)
    }
    // Same relative position as the 5,000-row tree below.
    scrollTreeTo(bigMap.maxScrollOffset / 2)
    const bigElements = document.querySelectorAll('*').length
    expect(renderedRows().length).toBeLessThanOrEqual(80)
    big.unmount()

    const smallMap = createDirectoryScrollMap(5_000, VIEWPORT)
    render(
      <TreeHarness
        rows={lazyRows(5_000)}
        initialScrollTop={smallMap.maxScrollOffset / 2}
        selectedPath={null}
      />
    )
    const smallElements = document.querySelectorAll('*').length
    expect(renderedRows().length).toBeLessThanOrEqual(80)
    expect(
      Math.abs(bigElements - smallElements) / Math.max(bigElements, smallElements)
    ).toBeLessThanOrEqual(0.1)
  })

  it('restores a tail row and its selection after a remount', () => {
    const rowCount = 1_516_096
    const rows = lazyRows(rowCount)
    const map = createDirectoryScrollMap(rowCount, VIEWPORT)
    const index = Math.floor(rowCount * 0.93)
    const target = rows.at(index)
    if (!target) throw new Error(`lazy model is missing row ${index}`)
    const offset = map.offsetForIndex(index)

    const first = render(
      <TreeHarness rows={rows} initialScrollTop={offset} selectedPath={target.node.relativePath} />
    )
    expect(Math.abs(scroller().scrollTop - offset)).toBeLessThanOrEqual(1)
    const selected = renderedRows().filter(
      (row) => row.getAttribute('aria-selected') === 'true'
    )
    expect(selected).toHaveLength(1)
    expect(selected[0].getAttribute('title')).toBe(target.node.relativePath)
    first.unmount()

    // The shell re-mounts with the offset it saved before the drilldown.
    render(
      <TreeHarness rows={rows} initialScrollTop={offset} selectedPath={target.node.relativePath} />
    )
    expect(Math.abs(scroller().scrollTop - offset)).toBeLessThanOrEqual(1)
    const restored = renderedRows().filter(
      (row) => row.getAttribute('aria-selected') === 'true'
    )
    expect(restored).toHaveLength(1)
    expect(restored[0].getAttribute('title')).toBe(target.node.relativePath)
    expect(restored[0].getAttribute('aria-level')).toBe(String(target.depth + 1))
  })

  it('reaches the last child of a re-expanded 87,500-file directory', () => {
    const comparison = createLargeDirectoryComparison()
    const collapsedModel = buildDirectoryRowModel(comparison.root, 'all', 'left', ['dir-3'])
    const expandedModel = buildDirectoryRowModel(comparison.root, 'all', 'left', [])
    expect(collapsedModel.length).toBe(LARGE_ROW_COUNT - LARGE_SIDE_FILES_PER_DIRECTORY)
    expect(expandedModel.length).toBe(LARGE_ROW_COUNT)

    // Pre-order: root, then each directory row followed by its visible files.
    const directoryIndex = 1 + 3 * (1 + LARGE_SIDE_FILES_PER_DIRECTORY)
    const collapsedMap = createDirectoryScrollMap(collapsedModel.length, VIEWPORT)
    const expandedMap = createDirectoryScrollMap(expandedModel.length, VIEWPORT)

    const view = render(
      <TreeHarness rows={collapsedModel} initialScrollTop={0} selectedPath={null} />
    )
    scrollTreeTo(collapsedMap.offsetForIndex(directoryIndex))
    const collapsedDirectory = renderedRows().find(
      (row) => row.getAttribute('title') === 'dir-3'
    )
    expect(collapsedDirectory?.getAttribute('aria-expanded')).toBe('false')
    expect(renderedTitles()).not.toContain(`dir-3/file-${LARGE_FILES_PER_DIRECTORY - 1}.ts`)

    // Expanding swaps in the row model with the 87,500-entry subtree.
    view.rerender(
      <TreeHarness rows={expandedModel} initialScrollTop={0} selectedPath={null} />
    )
    const lastChild = directoryIndex + LARGE_SIDE_FILES_PER_DIRECTORY
    scrollTreeTo(expandedMap.offsetForIndex(lastChild))
    expect(renderedTitles()).toContain(`dir-3/file-${LARGE_FILES_PER_DIRECTORY - 1}.ts`)
    expect(renderedRows().length).toBeLessThanOrEqual(80)
  }, 30_000)
})
