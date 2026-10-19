import type { JSX } from 'react'
import { ChevronRight, FileCode2, FileText, Folder, FolderOpen } from 'lucide-react'
import type { DirectoryDiffNode, FileDiffStatus } from '@core/directory/compare'
import { DiffBadge } from './DiffBadge'
import { cx } from './utils'

const CODE_FILE = /\.(tsx?|jsx?|mjs|cjs|md|css|html|py|go|rs|java|json|ya?ml)$/i

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
      aria-selected={selected}
      aria-expanded={isDirectory ? open : undefined}
      title={node.relativePath === '' ? node.name : node.relativePath}
      onClick={onSelect}
      onDoubleClick={isDirectory ? undefined : () => onOpenFile?.(node)}
      className={cx(
        'flex h-6 items-center gap-1.5 pr-2',
        selected ? 'bg-accent-soft' : 'hover:bg-surface-hover',
        !isDirectory && onOpenFile ? 'cursor-pointer' : undefined
      )}
      style={{ paddingInlineStart: `calc(var(--spacing) * ${depth * 3 + 1})` }}
    >
      {isDirectory ? (
        <button
          type="button"
          aria-label={open ? `折叠 ${node.name}` : `展开 ${node.name}`}
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

function TreeNode({
  node,
  depth,
  collapsed,
  selectedPath,
  onTogglePath,
  onSelectPath,
  onOpenFile
}: {
  readonly node: DirectoryDiffNode
  readonly depth: number
  readonly collapsed: ReadonlySet<string>
  readonly selectedPath: string | null
  readonly onTogglePath: (path: string) => void
  readonly onSelectPath: (path: string) => void
  readonly onOpenFile?: (node: DirectoryDiffNode) => void
}): JSX.Element {
  const open = !collapsed.has(node.relativePath)

  return (
    <div role="none">
      <TreeRow
        node={node}
        depth={depth}
        open={open}
        selected={selectedPath === node.relativePath}
        onToggle={() => onTogglePath(node.relativePath)}
        onSelect={() => onSelectPath(node.relativePath)}
        onOpenFile={onOpenFile}
      />
      {node.kind === 'directory' && open ? (
        <div role="group">
          {node.children.map((child) => (
            <TreeNode
              key={child.relativePath}
              node={child}
              depth={depth + 1}
              collapsed={collapsed}
              selectedPath={selectedPath}
              onTogglePath={onTogglePath}
              onSelectPath={onSelectPath}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Read-only comparison tree: every row carries its diff-semantic badge,
 * directories show their aggregate diff counts, and double-clicking a file row
 * drills into the matching file view. Expansion and the selected row are
 * controlled by the caller, so a remount (drilldown roundtrip) cannot reset them.
 */
export function TreeView({
  root,
  collapsedPaths,
  onTogglePath,
  selectedPath,
  onSelectPath,
  onOpenFile
}: {
  readonly root: DirectoryDiffNode
  /** Relative paths of collapsed directories; everything else renders open. */
  readonly collapsedPaths: ReadonlySet<string>
  readonly onTogglePath: (path: string) => void
  readonly selectedPath: string | null
  readonly onSelectPath: (path: string) => void
  readonly onOpenFile?: (node: DirectoryDiffNode) => void
}): JSX.Element {
  return (
    <div role="tree" aria-label={root.name} className="min-w-max py-1">
      <TreeNode
        node={root}
        depth={0}
        collapsed={collapsedPaths}
        selectedPath={selectedPath}
        onTogglePath={onTogglePath}
        onSelectPath={onSelectPath}
        onOpenFile={onOpenFile}
      />
    </div>
  )
}
