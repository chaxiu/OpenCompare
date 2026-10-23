import type { JSX } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronRight, FileCode2, FileText, Folder, FolderOpen } from 'lucide-react'
import type { DirectoryDiffNode, FileDiffStatus } from '@core/directory/compare'
import type { DirectoryRowModel } from '@core/directory/rows'
import { DIRECTORY_ROW_HEIGHT, createDirectoryScrollMap } from '@core/directory/rows'
import { useI18n } from '@renderer/i18n/context'
import { DiffBadge } from './DiffBadge'
import { cx } from './utils'

const CODE_FILE = /\.(tsx?|jsx?|mjs|cjs|md|css|html|py|go|rs|java|json|ya?ml)$/i

/** Extra rows above and below the viewport so fast scrolling never shows gaps. */
const ROW_OVERSCAN = 10

function CountSummary({
  counts
}: {
  readonly counts: Readonly<Record<FileDiffStatus, number>>
}): JSX.Element | null {
  const diffs = [
    { status: 'added', className: 'text-diff-added', prefix: '+' },
    { status: 'removed', className: 'text-diff-removed', prefix: '−' },
    { status: 'modified', className: 'text-diff-modified', prefix: '~' }
  ] as const
  const visible = diffs.filter((entry) => counts[entry.status] > 0)
  if (visible.length === 0) return null

  return (
    <span
      className="tabular flex shrink-0 items-center gap-1 font-mono text-2xs"
      title={visible
        .map((entry) => `${entry.prefix}${counts[entry.status]}`)
        .join(' ')}
    >
      {visible.map((entry) => (
        <span key={entry.status} className={entry.className}>
          {entry.prefix}
          {counts[entry.status]}
        </span>
      ))}
    </span>
  )
}

function TreeRow({
  node,
  depth,
  open,
  selected,
  onToggle,
  onSelect,
  onOpenFile
}: {
  readonly node: DirectoryDiffNode
  readonly depth: number
  readonly open: boolean
  readonly selected: boolean
  readonly onToggle: () => void
  readonly onSelect: () => void
  readonly onOpenFile?: (node: DirectoryDiffNode) => void
}): JSX.Element {
  const { t } = useI18n()
  const isDirectory = node.kind === 'directory'
  const Icon = isDirectory
    ? open
      ? FolderOpen
      : Folder
    : CODE_FILE.test(node.name)
      ? FileCode2
      : FileText

  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={selected}
      aria-expanded={isDirectory ? open : undefined}
      title={node.relativePath === '' ? node.name : node.relativePath}
      onClick={onSelect}
      onDoubleClick={isDirectory ? undefined : () => onOpenFile?.(node)}
      className={cx(
        'flex items-center gap-1.5 pr-2',
        selected ? 'bg-accent-soft' : 'hover:bg-surface-hover',
        !isDirectory && onOpenFile ? 'cursor-pointer' : undefined
      )}
      style={{
        height: DIRECTORY_ROW_HEIGHT,
        paddingInlineStart: `calc(var(--spacing) * ${depth * 3 + 1})`
      }}
    >
      {isDirectory ? (
        <button
          type="button"
          aria-label={t(open ? 'directory.tree.collapse' : 'directory.tree.expand', {
            name: node.name
          })}
          aria-expanded={open}
          onClick={(event) => {
            // Expanding is its own action; it must not also move the selection.
            event.stopPropagation()
            onToggle()
          }}
          className="focus-ring transition-fast -ml-1 flex size-4 shrink-0 items-center justify-center rounded-xs text-content-muted hover:text-content-primary"
        >
          <ChevronRight aria-hidden className={cx('size-3.5 transition-fast', open && 'rotate-90')} />
        </button>
      ) : (
        <span aria-hidden className="size-4 shrink-0" />
      )}
      <Icon
        aria-hidden
        className={cx('size-3.5 shrink-0', isDirectory ? 'text-content-muted' : 'text-content-secondary')}
      />
      <span className="truncate font-mono text-xs text-content-secondary">{node.name}</span>
      <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">
        {/* Directory rows summarise the engine's own subtree counts. */}
        {isDirectory ? <CountSummary counts={node.counts} /> : null}
        <DiffBadge status={node.status} />
      </span>
    </div>
  )
}

/**
 * Read-only comparison tree over a virtual row window: only the rows inside
 * the panel viewport (plus a small overscan) reach the DOM, so a five-figure
 * directory stays as cheap to render as a small one. Expansion, the selected
 * row and the scroll offset are controlled by the caller, so a remount
 * (drilldown roundtrip) restores the same window instead of jumping to the top.
 */
export function TreeView({
  label,
  rows,
  scrollElement,
  initialScrollTop,
  selectedPath,
  onTogglePath,
  onSelectPath,
  onOpenFile
}: {
  /** Accessible name of the tree, normally the compared root's name. */
  readonly label: string
  readonly rows: DirectoryRowModel
  /** The panel body is the scroll container the virtualiser measures. */
  readonly scrollElement: HTMLDivElement | null
  /** Scroll offset to start from on mount (drilldown return). */
  readonly initialScrollTop: number
  readonly selectedPath: string | null
  readonly onTogglePath: (path: string) => void
  readonly onSelectPath: (path: string) => void
  readonly onOpenFile?: (node: DirectoryDiffNode) => void
}): JSX.Element {
  // The virtualiser is used for what it observes (the panel's scroll offset
  // and viewport height); the row window itself comes from the pure scroll map
  // below, which caps the container height at the browser layout limit.
  // TanStack Virtual's returned functions are intentionally not memoizable.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => DIRECTORY_ROW_HEIGHT,
    overscan: ROW_OVERSCAN,
    initialOffset: initialScrollTop
  })

  const offset = virtualizer.scrollOffset ?? initialScrollTop
  const viewportHeight = virtualizer.scrollRect?.height ?? 0
  const scrollMap = createDirectoryScrollMap(rows.length, viewportHeight)
  const range = scrollMap.visibleRange(offset, ROW_OVERSCAN)
  const windowedRows: { readonly index: number; readonly top: number }[] = []
  for (let index = range.start; index <= range.end; index += 1) {
    windowedRows.push({ index, top: scrollMap.rowTop(index, offset) })
  }

  return (
    <div
      role="tree"
      aria-label={label}
      // `overflow-clip` keeps the overscan rows from extending the panel's
      // scrollable area now that row tops are mapped rather than stacked.
      className="relative min-w-max overflow-clip"
      style={{ height: scrollMap.contentHeight }}
    >
      {windowedRows.map(({ index, top }) => {
        const row = rows.at(index)
        if (!row) return null
        return (
          <div
            key={row.node.relativePath}
            role="none"
            className="absolute top-0 left-0 min-w-full"
            style={{ height: DIRECTORY_ROW_HEIGHT, transform: `translateY(${top}px)` }}
          >
            <TreeRow
              node={row.node}
              depth={row.depth}
              open={row.open}
              selected={selectedPath === row.node.relativePath}
              onToggle={() => onTogglePath(row.node.relativePath)}
              onSelect={() => onSelectPath(row.node.relativePath)}
              onOpenFile={onOpenFile}
            />
          </div>
        )
      })}
    </div>
  )
}
