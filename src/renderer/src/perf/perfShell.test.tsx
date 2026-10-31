// @vitest-environment jsdom
/**
 * Component-level proof that the production view key is what releases the
 * previous comparison tree and its row models at commit time.
 *
 * The walk is deterministic (fiber props identity), not GC-dependent: a keyed
 * remount detaches the old subtree, while the pre-fix "no key" render keeps the
 * previous comparison and row models reachable through the fiber alternate.
 * That second half is the red control that stops this test from being a green
 * formality.
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import type { JSX } from 'react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { DirectoryComparison, DirectoryDiffNode } from '@core/directory/compare'
import type { DirectoryRowModel } from '@core/directory/rows'
import { SessionTabs } from '@renderer/components/SessionTabs'
import { DirectoryView } from '@renderer/views/DirectoryView'
import { createDirectorySession, directoryViewKey } from '@renderer/workbench/directoryCompare'
import type { WorkbenchSession } from '@renderer/workbench/session'
import { directorySides } from '@renderer/workbench/snapshotOps'

/** Every row model the view builds, in build order. */
const built = vi.hoisted(() => ({ rowModels: [] as DirectoryRowModel[] }))
vi.mock('@core/directory/rows', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@core/directory/rows')>()
  return {
    ...actual,
    buildDirectoryRowModel: (...args: Parameters<typeof actual.buildDirectoryRowModel>) => {
      const model = actual.buildDirectoryRowModel(...args)
      built.rowModels.push(model)
      return model
    }
  }
})

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

afterEach(() => {
  cleanup()
  built.rowModels = []
})

/* ------------------------------------------------------------------ */
/* Minimal but real comparison trees                                  */
/* ------------------------------------------------------------------ */

function fileNode(relativePath: string, status: DirectoryDiffNode['status']): DirectoryDiffNode {
  return {
    name: relativePath.slice(relativePath.lastIndexOf('.') + 1),
    relativePath,
    kind: 'file',
    status,
    children: [],
    counts: {
      same: status === 'same' ? 1 : 0,
      added: status === 'added' ? 1 : 0,
      removed: status === 'removed' ? 1 : 0,
      modified: status === 'modified' ? 1 : 0
    },
    leftPath: `/left/${relativePath}`,
    rightPath: `/right/${relativePath}`
  }
}

function comparisonOf(leftRoot: string, rightRoot: string): DirectoryComparison {
  const children = [fileNode('a.txt', 'same'), fileNode('b.txt', 'modified')]
  const counts = { same: 1, added: 0, removed: 0, modified: 1 }
  return {
    leftRoot,
    rightRoot,
    leftName: leftRoot.slice(leftRoot.lastIndexOf('/') + 1),
    rightName: rightRoot.slice(rightRoot.lastIndexOf('/') + 1),
    root: {
      name: '',
      relativePath: '',
      kind: 'directory',
      status: 'modified',
      children,
      counts,
      leftPath: leftRoot,
      rightPath: rightRoot
    },
    counts,
    fileCount: 2,
    leftSkipped: 0,
    rightSkipped: 0,
    skipped: 0
  }
}

function sessionOf(leftRoot: string, rightRoot: string): WorkbenchSession {
  return createDirectorySession(
    comparisonOf(leftRoot, rightRoot),
    directorySides(leftRoot, rightRoot)
  )
}

/* ------------------------------------------------------------------ */
/* Render shells                                                      */
/* ------------------------------------------------------------------ */

const EMPTY: readonly string[] = []
const ZERO = { left: 0, right: 0 } as const
const noop = (): void => undefined

function viewProps(session: WorkbenchSession) {
  const comparison = session.directory as DirectoryComparison
  return {
    sessionId: session.id,
    comparison,
    filter: 'all' as const,
    onFilterChange: noop,
    collapsedPaths: EMPTY,
    onTogglePath: noop,
    selectedPath: null,
    onSelectPath: noop,
    scrollTops: ZERO,
    onScrollTopChange: noop,
    visibleCounts: { ...comparison.counts, conflict: 0 },
    pickerAvailable: false,
    busy: false,
    onPick: noop,
    onOpenFile: noop,
    leftIsSnapshot: false,
    rightIsSnapshot: false,
    onExportSnapshot: noop,
    onImportSnapshot: noop,
    hideLocalPaths: true,
    onHideLocalPathsChange: noop,
    onExportReport: noop,
    onPreviewSync: noop,
    onPreviewTemplate: noop,
    syncPreview: null,
    templatePreview: null,
    onCancelSync: noop,
    onConfirmSync: noop,
    onCancelTemplate: noop,
    onConfirmTemplate: noop
  }
}

function Shell({
  session,
  keyed
}: {
  readonly session: WorkbenchSession
  readonly keyed: boolean
}): JSX.Element {
  return (
    <DirectoryView
      key={keyed ? directoryViewKey(session) : undefined}
      {...viewProps(session)}
    />
  )
}

function MultiShell({
  sessions,
  activeId
}: {
  readonly sessions: readonly WorkbenchSession[]
  readonly activeId: string
}): JSX.Element {
  const active = sessions.find((session) => session.id === activeId) as WorkbenchSession
  return (
    <div>
      <SessionTabs
        tabs={sessions.map((session) => ({ id: session.id, title: session.title }))}
        activeId={activeId}
        onSelect={noop}
      />
      <DirectoryView key={directoryViewKey(active)} {...viewProps(active)} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Fiber props reachability                                           */
/* ------------------------------------------------------------------ */

interface FiberLike {
  readonly type?: unknown
  readonly memoizedProps?: unknown
  readonly pendingProps?: unknown
  readonly child?: FiberLike | null
  readonly sibling?: FiberLike | null
  readonly alternate?: FiberLike | null
}

/** Host root fiber React attaches to the rendered container. */
function rootFiber(container: HTMLElement): FiberLike | null {
  const record = container as unknown as Record<string, FiberLike>
  const key = Object.keys(record).find((name) => name.startsWith('__reactContainer$'))
  if (key !== undefined) return record[key]
  const fiberKey = Object.keys(record).find((name) => name.startsWith('__reactFiber$'))
  return fiberKey === undefined ? null : record[fiberKey]
}

function* walk(start: FiberLike): Generator<FiberLike> {
  const stack = [start]
  const seen = new Set<FiberLike>()
  while (stack.length > 0) {
    const fiber = stack.pop() as FiberLike
    if (seen.has(fiber)) continue
    seen.add(fiber)
    yield fiber
    if (fiber.child) stack.push(fiber.child)
    if (fiber.sibling) stack.push(fiber.sibling)
    if (fiber.alternate) stack.push(fiber.alternate)
  }
}

function propsReach(fiber: FiberLike, target: object): boolean {
  for (const props of [fiber.memoizedProps, fiber.pendingProps]) {
    if (typeof props !== 'object' || props === null) continue
    for (const value of Object.values(props as Record<string, unknown>)) {
      if (value === target) return true
    }
  }
  return false
}

function reachable(container: HTMLElement, target: object | undefined): boolean {
  if (target === undefined) return false
  const root = rootFiber(container)
  if (root === null) throw new Error('找不到 React 根 fiber，无法做可达性走查。')
  for (const fiber of walk(root)) {
    if (propsReach(fiber, target)) return true
  }
  return false
}

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

describe('directory view key', () => {
  it('drops the previous comparison and row models on every re-compare', () => {
    const first = sessionOf('/left', '/right')
    const second = sessionOf('/left', '/right')
    const third = sessionOf('/left', '/right')

    const { container, rerender } = render(<Shell session={first} keyed />)
    const firstModels = [...built.rowModels]
    expect(firstModels.length).toBeGreaterThanOrEqual(2)

    rerender(<Shell session={second} keyed />)
    rerender(<Shell session={third} keyed />)

    const root = rootFiber(container)
    expect(root).not.toBeNull()
    // The live tree is reachable; nothing from the two replaced trees is.
    expect(reachable(container, third.directory)).toBe(true)
    expect(reachable(container, second.directory)).toBe(false)
    expect(reachable(container, first.directory)).toBe(false)
    for (const model of firstModels) {
      expect(reachable(container, model)).toBe(false)
    }
  })

  it('keeps the old comparison reachable without the key (the pre-fix behaviour)', () => {
    const first = sessionOf('/left', '/right')
    const second = sessionOf('/left', '/right')

    const { container, rerender } = render(<Shell session={first} keyed={false} />)
    const firstModels = [...built.rowModels]
    expect(firstModels.length).toBeGreaterThanOrEqual(2)

    rerender(<Shell session={second} keyed={false} />)

    // Red control: React reuses the fiber, so the previous props (including the
    // old comparison) and the previous TreeView `rows` survive on the alternate.
    expect(reachable(container, first.directory)).toBe(true)
    expect(firstModels.some((model) => reachable(container, model))).toBe(true)
    expect(reachable(container, second.directory)).toBe(true)
  })
})

describe('multisession shell', () => {
  it('renders one tab per session and only the active tab tree', () => {
    const first = sessionOf('/alpha', '/beta')
    const second = sessionOf('/gamma', '/delta')
    const third = sessionOf('/epsilon', '/zeta')

    const { rerender } = render(<MultiShell sessions={[first]} activeId={first.id} />)
    const tabCount = (): number =>
      within(screen.getByRole('tablist', { name: '会话' })).getAllByRole('tab').length
    const treeLabels = (): string[] =>
      screen.getAllByRole('tree').map((tree) => tree.getAttribute('aria-label') ?? '')

    expect(tabCount()).toBe(1)
    expect(treeLabels()).toEqual(['alpha', 'beta'])

    rerender(<MultiShell sessions={[first, second]} activeId={second.id} />)
    expect(tabCount()).toBe(2)
    expect(treeLabels()).toEqual(['gamma', 'delta'])

    rerender(<MultiShell sessions={[first, second, third]} activeId={third.id} />)
    expect(tabCount()).toBe(3)
    expect(treeLabels()).toEqual(['epsilon', 'zeta'])

    // Switching back re-renders the first comparison only.
    rerender(<MultiShell sessions={[first, second, third]} activeId={first.id} />)
    expect(treeLabels()).toEqual(['alpha', 'beta'])
  })
})
