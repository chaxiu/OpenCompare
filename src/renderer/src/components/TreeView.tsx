import { useState } from 'react'
import type { JSX } from 'react'
import { ChevronRight, FileCode2, FileText, Folder, FolderOpen } from 'lucide-react'
import type { DirectoryNode } from '@shared/fixtures'
import { DiffBadge } from './DiffBadge'
import { cx } from './utils'

const CODE_FILE = /\.(tsx?|jsx?|mjs|cjs)$/i

function TreeRow({
  node,
  depth,
  open,
  onToggle
}: {
  readonly node: DirectoryNode
  readonly depth: number
  readonly open: boolean
  readonly onToggle: () => void
}): JSX.Element {
  const isDirectory = node.kind === 'directory'
  const Icon = isDirectory ? (open ? FolderOpen : Folder) : CODE_FILE.test(node.name) ? FileCode2 : FileText

  return (
    <div
      className="flex h-6 items-center gap-1.5 pr-2 hover:bg-surface-hover"
      style={{ paddingInlineStart: `calc(var(--spacing) * ${depth * 3 + 1})` }}
    >
      {isDirectory ? (
        <button
          type="button"
          aria-label={open ? `折叠 ${node.name}` : `展开 ${node.name}`}
          aria-expanded={open}
          onClick={onToggle}
          className="focus-ring transition-fast -ml-1 flex size-4 shrink-0 items-center justify-center rounded-xs text-content-muted hover:text-content-primary"
        >
          <ChevronRight aria-hidden className={cx('size-3.5 transition-fast', open && 'rotate-90')} />
        </button>
      ) : (
        <span aria-hidden className="size-4 shrink-0" />
      )}
      <Icon aria-hidden className={cx('size-3.5 shrink-0', isDirectory ? 'text-content-muted' : 'text-content-secondary')} />
      <span className="truncate font-mono text-xs text-content-secondary">{node.name}</span>
      {node.status === 'same' ? null : <DiffBadge status={node.status} className="ml-auto" />}
    </div>
  )
}

function TreeNode({ node, depth }: { readonly node: DirectoryNode; readonly depth: number }): JSX.Element {
  const [open, setOpen] = useState(true)

  return (
    <div role="treeitem" aria-expanded={node.kind === 'directory' ? open : undefined}>
      <TreeRow node={node} depth={depth} open={open} onToggle={() => setOpen((value) => !value)} />
      {node.kind === 'directory' && open ? (
        <div role="group">
          {(node.children ?? []).map((child) => (
            <TreeNode key={child.name} node={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Read-only directory tree. Badges come from the sample's authored answer key. */
export function TreeView({ root }: { readonly root: DirectoryNode }): JSX.Element {
  return (
    <div role="tree" aria-label={root.name} className="min-w-max py-1">
      <TreeNode node={root} depth={0} />
    </div>
  )
}
