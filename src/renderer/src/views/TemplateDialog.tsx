import type { JSX } from 'react'
import { LoaderCircle } from 'lucide-react'
import { ToolbarButton } from '@renderer/components/Button'
import { Dialog } from '@renderer/components/Dialog'
import { formatBytes } from '@renderer/components/utils'
import type { TemplatePreview } from '@renderer/workbench/directoryOps'

function SectionTitle({
  title,
  count,
  tone
}: {
  readonly title: string
  readonly count: number
  readonly tone: string
}): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className={tone}>{title}</span>
      <span className="tabular font-mono text-2xs text-content-muted">{count} 个</span>
    </div>
  )
}

export interface TemplateDialogProps {
  readonly preview: TemplatePreview
  readonly busy: boolean
  readonly onCancel: () => void
  readonly onConfirm: () => void
}

/**
 * Placement preview: where each incoming file lands under the template A
 * structure, plus the slots that stay missing, the ambiguous / mismatched
 * conflicts and the incoming files no slot consumes. Nothing is written until
 * the user confirms.
 */
export function TemplateDialog({
  preview,
  busy,
  onCancel,
  onConfirm
}: TemplateDialogProps): JSX.Element {
  const { result, templateRoot, incomingRoot, targetRoot } = preview

  return (
    <Dialog
      title="模板归位映射预览"
      description={
        <>
          模板 A：<span className="font-mono">{templateRoot}</span> · 散乱树 B：
          <span className="font-mono">{incomingRoot}</span> · 输出根：
          <span className="font-mono">{targetRoot}</span>
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
            onClick={onConfirm}
            disabled={busy || result.matched.length === 0}
          >
            {busy ? <LoaderCircle aria-hidden className="size-3.5 animate-spin" /> : null}
            {busy ? '正在归位…' : '确认提取归位'}
          </ToolbarButton>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <section>
          <SectionTitle title="已匹配" count={result.matched.length} tone="text-diff-added" />
          {result.matched.length > 0 ? (
            <ul className="mt-1 rounded-sm border border-line-subtle">
              {result.matched.map((item) => (
                <li
                  key={item.relativePath}
                  className="flex items-center gap-2 px-2 py-1 odd:bg-surface-sunken/40"
                >
                  <span
                    className="truncate font-mono text-xs text-content-secondary"
                    title={item.relativePath}
                  >
                    {item.relativePath}
                  </span>
                  <span className="shrink-0 text-2xs text-content-muted">←</span>
                  <span
                    className="truncate font-mono text-2xs text-content-muted"
                    title={item.sourcePath}
                  >
                    {item.sourcePath}
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

        <section>
          <SectionTitle title="缺失槽位" count={result.missing.length} tone="text-diff-removed" />
          {result.missing.length > 0 ? (
            <ul className="mt-1 rounded-sm border border-line-subtle">
              {result.missing.map((item) => (
                <li
                  key={item.relativePath}
                  className="truncate px-2 py-1 font-mono text-xs text-content-muted odd:bg-surface-sunken/40"
                >
                  {item.relativePath}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2 py-1 text-2xs text-content-muted">无</p>
          )}
        </section>

        <section>
          <SectionTitle title="冲突项" count={result.conflicts.length} tone="text-diff-conflict" />
          {result.conflicts.length > 0 ? (
            <ul className="mt-1 rounded-sm border border-line-subtle">
              {result.conflicts.map((item) => (
                <li key={item.relativePath} className="px-2 py-1 odd:bg-surface-sunken/40">
                  <span className="font-mono text-xs text-content-secondary">
                    {item.relativePath}
                  </span>
                  <span className="ml-2 text-2xs text-content-muted">
                    {item.reason === 'ambiguous' ? '同名多候选' : '同名内容不同'}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-2xs text-content-muted">
                    {item.candidates.map((candidate) => candidate.path).join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2 py-1 text-2xs text-content-muted">无</p>
          )}
        </section>

        <section>
          <SectionTitle title="B 未使用文件" count={result.unused.length} tone="text-content-muted" />
          {result.unused.length > 0 ? (
            <ul className="mt-1 rounded-sm border border-line-subtle">
              {result.unused.map((item) => (
                <li
                  key={item.relativePath}
                  className="truncate px-2 py-1 font-mono text-xs text-content-muted odd:bg-surface-sunken/40"
                >
                  {item.relativePath}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2 py-1 text-2xs text-content-muted">无</p>
          )}
        </section>
      </div>
    </Dialog>
  )
}
