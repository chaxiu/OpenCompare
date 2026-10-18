import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import { LoaderCircle } from 'lucide-react'
import type { SyncPlanGroup } from '@core/directory/sync'
import { ToolbarButton } from '@renderer/components/Button'
import { Dialog } from '@renderer/components/Dialog'
import { formatBytes } from '@renderer/components/utils'
import type { SyncPreview } from '@renderer/workbench/directoryOps'

const DIRECTION_LABELS = {
  'left-to-right': '左 → 右',
  'right-to-left': '右 → 左'
} as const

const MODE_LABELS = {
  incremental: '增量',
  mirror: '镜像'
} as const

function GroupHeader({
  title,
  tone,
  group
}: {
  readonly title: string
  readonly tone: string
  readonly group: SyncPlanGroup
}): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className={tone}>{title}</span>
      <span className="tabular font-mono text-2xs text-content-muted">
        {group.count} 个 · {formatBytes(group.bytes)}
      </span>
    </div>
  )
}

function ItemRow({
  label,
  detail,
  size
}: {
  readonly label: string
  readonly detail?: string
  readonly size: number
}): JSX.Element {
  return (
    <li className="flex items-center gap-2 px-2 py-1 odd:bg-surface-sunken/40">
      <span className="truncate font-mono text-xs text-content-secondary" title={label}>
        {label}
      </span>
      {detail ? (
        <span className="truncate font-mono text-2xs text-content-muted" title={detail}>
          {detail}
        </span>
      ) : null}
      <span className="tabular ml-auto shrink-0 font-mono text-2xs text-content-muted">
        {formatBytes(size)}
      </span>
    </li>
  )
}

export interface DirectorySyncDialogProps {
  readonly preview: SyncPreview
  readonly busy: boolean
  readonly onCancel: () => void
  readonly onConfirm: (deletePaths: readonly string[]) => void
}

/**
 * Dry-run preview of one sync direction: what will be copied, overwritten and
 * (in mirror mode) deleted, with byte totals. Cancel writes nothing; mirror
 * deletions can be individually unchecked.
 */
export function DirectorySyncDialog({
  preview,
  busy,
  onCancel,
  onConfirm
}: DirectorySyncDialogProps): JSX.Element {
  const { plan, materializeTarget } = preview
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set())

  const deletePaths = useMemo(
    () => plan.delete.items.filter((item) => !excluded.has(item.relativePath)).map((item) => item.relativePath),
    [plan, excluded]
  )

  function toggle(relativePath: string): void {
    setExcluded((current) => {
      const next = new Set(current)
      if (next.has(relativePath)) next.delete(relativePath)
      else next.add(relativePath)
      return next
    })
  }

  const empty = plan.totalCount === 0

  return (
    <Dialog
      title={`${DIRECTION_LABELS[plan.direction]} · ${MODE_LABELS[plan.mode]}同步预览`}
      description={
        <>
          目标根：<span className="font-mono">{plan.targetRoot}</span>
          {materializeTarget ? '（只读样本树将于确认后复制到可写区）' : ''}
          {` · 合计 ${plan.totalCount} 项 / ${formatBytes(plan.totalBytes)}`}
        </>
      }
      onClose={busy ? () => undefined : onCancel}
      footer={
        <>
          <ToolbarButton variant="ghost" onClick={onCancel} disabled={busy}>
            取消
          </ToolbarButton>
          <ToolbarButton
            variant="primary"
            onClick={() => onConfirm(deletePaths)}
            disabled={busy || empty}
          >
            {busy ? <LoaderCircle aria-hidden className="size-3.5 animate-spin" /> : null}
            {busy ? '正在同步…' : '确认执行'}
          </ToolbarButton>
        </>
      }
    >
      {empty ? (
        <p className="p-3 text-2xs text-content-muted">该方向没有需要同步的变更，目标侧已与源侧一致。</p>
      ) : (
        <div className="flex flex-col gap-3">
          <section>
            <GroupHeader title="待新增拷贝" tone="text-diff-added" group={plan.copy} />
            {plan.copy.items.length > 0 ? (
              <ul className="mt-1 rounded-sm border border-line-subtle">
                {plan.copy.items.map((item) => (
                  <ItemRow
                    key={item.relativePath}
                    label={item.relativePath}
                    detail={item.sourcePath ?? undefined}
                    size={item.size}
                  />
                ))}
              </ul>
            ) : (
              <p className="px-2 py-1 text-2xs text-content-muted">无</p>
            )}
          </section>

          <section>
            <GroupHeader title="待覆盖修改" tone="text-diff-modified" group={plan.update} />
            {plan.update.items.length > 0 ? (
              <ul className="mt-1 rounded-sm border border-line-subtle">
                {plan.update.items.map((item) => (
                  <ItemRow
                    key={item.relativePath}
                    label={item.relativePath}
                    detail={item.sourcePath ?? undefined}
                    size={item.size}
                  />
                ))}
              </ul>
            ) : (
              <p className="px-2 py-1 text-2xs text-content-muted">无</p>
            )}
          </section>

          {plan.mode === 'mirror' ? (
            <section>
              <GroupHeader title="待删除（镜像）" tone="text-diff-removed" group={plan.delete} />
              {plan.delete.items.length > 0 ? (
                <ul className="mt-1 rounded-sm border border-line-subtle">
                  {plan.delete.items.map((item) => (
                    <li
                      key={item.relativePath}
                      className="flex items-center gap-2 px-2 py-1 odd:bg-surface-sunken/40"
                    >
                      <input
                        type="checkbox"
                        checked={!excluded.has(item.relativePath)}
                        onChange={() => toggle(item.relativePath)}
                        aria-label={`删除 ${item.relativePath}`}
                        className="size-3.5 shrink-0 accent-danger"
                      />
                      <span className="truncate font-mono text-xs text-content-secondary">
                        {item.relativePath}
                      </span>
                      <span className="tabular ml-auto shrink-0 font-mono text-2xs text-content-muted">
                        {formatBytes(item.size)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-2 py-1 text-2xs text-content-muted">无</p>
              )}
            </section>
          ) : null}
        </div>
      )}
    </Dialog>
  )
}
