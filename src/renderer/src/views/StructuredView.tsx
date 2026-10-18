import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import { AlertTriangle, ArrowRight, Braces } from 'lucide-react'
import { STRUCTURED_STATUSES, diffStructured, filterStructuredChanges } from '@core/structured/diff'
import type {
  StructuredChange,
  StructuredDiffResult,
  StructuredFilter,
  StructuredStatus
} from '@core/structured/diff'
import type { StructuredFormat } from '@core/structured/parse'
import type { DiffStatus, StructuredSceneFixture } from '@shared/fixtures'
import { CodeBlock } from '@renderer/components/CodeBlock'
import { DiffDot } from '@renderer/components/DiffBadge'
import { DIFF_BADGE_CLASSES } from '@renderer/components/diffSemantics'
import { Panel } from '@renderer/components/Panel'
import { SegmentedControl } from '@renderer/components/SegmentedControl'
import { SplitPane } from '@renderer/components/SplitPane'
import { StateView } from '@renderer/components/StateView'
import { cx } from '@renderer/components/utils'
import type { FilePair } from '@renderer/workbench/session'

const FORMAT_OPTIONS = [
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' }
] as const

const FILTER_OPTIONS: readonly { readonly value: StructuredFilter; readonly label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'added', label: '新增' },
  { value: 'removed', label: '删除' },
  { value: 'modified', label: '修改' },
  { value: 'typeChanged', label: '类型变更' },
  { value: 'same', label: '相同' }
]

const STATUS_LABELS: Record<StructuredStatus, string> = {
  added: '新增',
  removed: '删除',
  modified: '修改',
  typeChanged: '类型变更',
  same: '相同'
}

/**
 * Structured statuses borrow the diff-semantic vocabulary; a type change is
 * rendered with the conflict tone so it never reads as a plain value edit.
 */
const STATUS_TONES: Record<StructuredStatus, DiffStatus> = {
  added: 'added',
  removed: 'removed',
  modified: 'modified',
  typeChanged: 'conflict',
  same: 'same'
}

const VALUE_CLASSES: Record<StructuredStatus, string> = {
  added: 'text-diff-added',
  removed: 'text-diff-removed',
  modified: 'text-diff-modified',
  typeChanged: 'text-diff-conflict',
  same: 'text-content-secondary'
}

function StatusBadge({ status }: { readonly status: StructuredStatus }): JSX.Element {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center rounded-xs border px-1 text-2xs leading-4',
        DIFF_BADGE_CLASSES[STATUS_TONES[status]]
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}

/** Runtime counts of the full comparison; filtering never changes them. */
function StatusCounts({
  counts
}: {
  readonly counts: Readonly<Record<StructuredStatus, number>>
}): JSX.Element {
  return (
    <span role="group" aria-label="结构化计数" className="flex flex-wrap items-center gap-3">
      {STRUCTURED_STATUSES.map((status) => (
        <span key={status} className="flex shrink-0 items-center gap-1 whitespace-nowrap text-2xs">
          <DiffDot status={STATUS_TONES[status]} />
          <span className="tabular font-mono text-content-secondary">{counts[status]}</span>
          <span className="text-content-muted">{STATUS_LABELS[status]}</span>
        </span>
      ))}
    </span>
  )
}

/** One node of the change list: status, JSON Pointer path and old → new value. */
function ChangeRow({ change }: { readonly change: StructuredChange }): JSX.Element {
  const valueClass = VALUE_CLASSES[change.status]

  return (
    <div className="flex items-center gap-2 border-b border-line-subtle px-2 py-1">
      <StatusBadge status={change.status} />
      <span
        className="min-w-0 flex-1 truncate font-mono text-xs text-content-secondary"
        title={change.path}
      >
        {change.path === '' ? '/' : change.path}
      </span>
      <span className="flex shrink-0 items-center gap-1 font-mono text-xs">
        <span
          className={cx(
            'max-w-40 truncate',
            change.left === undefined ? 'text-content-muted' : valueClass
          )}
          title={change.left}
        >
          {change.left ?? '—'}
        </span>
        <ArrowRight aria-hidden className="size-3 shrink-0 text-content-muted" />
        <span
          className={cx(
            'max-w-40 truncate',
            change.right === undefined ? 'text-content-muted' : valueClass
          )}
          title={change.right}
        >
          {change.right ?? '—'}
        </span>
      </span>
    </div>
  )
}

interface ComparisonState {
  readonly diff: StructuredDiffResult | null
  readonly error: string | null
}

/**
 * Scene D — JSON / YAML semantic comparison.
 *
 * Both sides are parsed and compared by node path, so shuffled keys, comments
 * and indentation produce no differences at all. A drilldown `pair` renders its
 * fixed format without the format switch; both sources share one engine.
 */
export function StructuredView({
  fixture,
  pair,
  format
}: {
  readonly fixture?: StructuredSceneFixture
  /** Ad-hoc left/right bodies coming from a directory-tree drilldown. */
  readonly pair?: FilePair
  readonly format?: StructuredFormat
}): JSX.Element {
  const [selected, setSelected] = useState<StructuredFormat>('json')
  const [filter, setFilter] = useState<StructuredFilter>('all')
  const adhoc = pair !== undefined
  const effective: StructuredFormat = adhoc ? (format ?? 'json') : selected
  const source = pair ?? (fixture ? (effective === 'json' ? fixture.json : fixture.yaml) : null)

  const comparison = useMemo<ComparisonState>(() => {
    if (!source) return { diff: null, error: null }
    try {
      return { diff: diffStructured(source.left.text, source.right.text, effective), error: null }
    } catch (cause) {
      return { diff: null, error: cause instanceof Error ? cause.message : String(cause) }
    }
  }, [source, effective])

  const visible = useMemo(
    () => (comparison.diff ? filterStructuredChanges(comparison.diff.entries, filter) : []),
    [comparison, filter]
  )

  if (!source) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col p-2">
        <StateView
          icon={<Braces aria-hidden className="size-5" />}
          title="无可对比的结构化数据"
          description="请从样本库载入 JSON / YAML 场景，或从目录对比下钻一个 JSON / YAML 文件。"
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-2">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {adhoc ? (
          <span className="text-2xs text-content-muted">
            来自目录对比下钻 · {effective.toUpperCase()} 原文 · 语义归一化对比
          </span>
        ) : (
          <>
            <SegmentedControl
              label="结构化格式"
              options={FORMAT_OPTIONS}
              value={selected}
              onChange={setSelected}
            />
            <span className="hidden text-2xs text-content-muted md:inline">
              键序与注释 / 缩进噪音已忽略 · 按 JSON Pointer 节点路径比对
            </span>
          </>
        )}
        <span aria-hidden className="h-3 w-px shrink-0 bg-line-subtle" />
        <SegmentedControl
          label="状态过滤"
          options={FILTER_OPTIONS}
          value={filter}
          onChange={setFilter}
        />
      </div>

      {comparison.diff ? (
        <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-md border border-line-subtle bg-surface-sunken px-2 py-1">
          <StatusCounts counts={comparison.diff.counts} />
          <span className="ml-auto text-2xs text-content-muted">
            共 {comparison.diff.entries.length} 个节点 · 计数为运行时对比结果
          </span>
        </div>
      ) : null}

      <SplitPane
        panes={[
          <Panel
            key="changes"
            title="节点路径变更"
            subtitle={
              comparison.error
                ? '解析失败'
                : `显示 ${visible.length} / ${comparison.diff?.entries.length ?? 0}`
            }
          >
            {comparison.error ? (
              <div className="flex h-full min-h-0 flex-col">
                <StateView
                  tone="danger"
                  icon={<AlertTriangle aria-hidden className="size-5" />}
                  title="结构化解析失败"
                  description={comparison.error}
                  hint="仅本会话受影响：可修正输入后重新下钻，或切换到其他会话。"
                />
              </div>
            ) : visible.length === 0 ? (
              <p className="p-3 text-2xs text-content-muted">
                当前过滤条件下没有节点。切回「全部」可查看完整变更列表。
              </p>
            ) : (
              <div className="min-w-max">
                {visible.map((change) => (
                  <ChangeRow key={change.path} change={change} />
                ))}
              </div>
            )}
          </Panel>,
          <Panel key="left" title={source.left.path} subtitle="左原文">
            <CodeBlock text={source.left.text} />
          </Panel>,
          <Panel key="right" title={source.right.path} subtitle="右原文">
            <CodeBlock text={source.right.text} />
          </Panel>
        ]}
      />
    </div>
  )
}
