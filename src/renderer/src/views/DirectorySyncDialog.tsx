import { useMemo, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { UI_ICON_ACTIONS } from '@renderer/assets/icons'
import { ToolbarButton } from '@renderer/components/Button'
import { Dialog } from '@renderer/components/Dialog'
import { Icon } from '@renderer/components/Icon'
import { formatBytes } from '@renderer/components/utils'
import { useI18n } from '@renderer/i18n/context'
import { syncPreviewAction } from '@renderer/workbench/directoryOps'
import type { SyncPreview } from '@renderer/workbench/directoryOps'
import { SYNC_DIRECTION_KEYS, SYNC_MODE_KEYS, countKey } from './directoryCopy'

function GroupHeader({
  title,
  tone,
  count,
  bytes,
  selectedCount,
  actions
}: {
  readonly title: string
  readonly tone: string
  readonly count: number
  readonly bytes: number
  /** Opt-in group only: how many of the planned items the user checked. */
  readonly selectedCount?: number
  readonly actions?: ReactNode
}): JSX.Element {
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-2">
      <span className={tone}>{title}</span>
      <span className="tabular font-mono text-2xs text-content-muted">
        {t(countKey('directory.sync.groupCount.one', 'directory.sync.groupCount.other', count), {
          count,
          size: formatBytes(bytes)
        })}
        {selectedCount === undefined
          ? null
          : t('directory.sync.groupCountSelected', { selected: selectedCount })}
      </span>
      {actions ? <div className="ml-auto flex items-center gap-1">{actions}</div> : null}
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
  /** Stops the running sync; the footer cancel action calls this while busy. */
  readonly onAbort: () => void
  readonly onConfirm: (deletePaths: readonly string[]) => void
}

/**
 * Dry-run preview of one sync direction: what will be copied, overwritten and
 * (in mirror mode) deleted, with byte totals. Cancel writes nothing; mirror
 * deletions start unchecked and are opt-in, one by one or all at once. While a
 * run is in flight the same action stops it, which rolls the target back.
 */
export function DirectorySyncDialog({
  preview,
  busy,
  onCancel,
  onAbort,
  onConfirm
}: DirectorySyncDialogProps): JSX.Element {
  const { t } = useI18n()
  const { plan, materializeTarget } = preview
  const alignments = preview.linkAlignments
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())

  const deletePaths = useMemo(
    () =>
      plan.delete.items
        .filter((item) => selected.has(item.relativePath))
        .map((item) => item.relativePath),
    [plan, selected]
  )

  function toggle(relativePath: string): void {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(relativePath)) next.delete(relativePath)
      else next.add(relativePath)
      return next
    })
  }

  // Summary counts, Apply state and body copy are one reading of the shared
  // predicate (also asserted by the real-disk gate), so they cannot disagree.
  const action = syncPreviewAction(preview, deletePaths)
  const empty = action.guidance === 'empty'
  const blockedByDeletes = action.guidance === 'noExecutable'

  return (
    <Dialog
      title={t('directory.sync.title', {
        direction: t(SYNC_DIRECTION_KEYS[plan.direction]),
        mode: t(SYNC_MODE_KEYS[plan.mode])
      })}
      description={
        <>
          {t('directory.sync.targetRoot')}
          <span className="font-mono">{plan.targetRoot}</span>
          {materializeTarget ? t('directory.sync.materialize') : ''}
          {t(countKey('directory.sync.total.one', 'directory.sync.total.other', action.planned), {
            count: action.planned,
            size: formatBytes(plan.totalBytes)
          })}
        </>
      }
      onClose={busy ? () => undefined : onCancel}
      footer={
        <>
          <ToolbarButton variant="ghost" onClick={busy ? onAbort : onCancel}>
            {t('common.cancel')}
          </ToolbarButton>
          <ToolbarButton
            variant="primary"
            onClick={() => onConfirm(deletePaths)}
            disabled={busy || !action.executable}
          >
            {busy ? <Icon name={UI_ICON_ACTIONS.loading} className="animate-spin" /> : null}
            {busy ? t('directory.sync.syncing') : t('directory.sync.apply')}
          </ToolbarButton>
        </>
      }
    >
      {empty ? (
        <p className="p-3 text-2xs text-content-muted">{t('directory.sync.empty')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <section>
            <GroupHeader
              title={t('directory.sync.group.copy')}
              tone="text-diff-added"
              count={action.copy}
              bytes={plan.copy.bytes}
            />
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
              <p className="px-2 py-1 text-2xs text-content-muted">{t('directory.none')}</p>
            )}
          </section>

          <section>
            <GroupHeader
              title={t('directory.sync.group.update')}
              tone="text-diff-modified"
              count={action.update}
              bytes={plan.update.bytes}
            />
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
              <p className="px-2 py-1 text-2xs text-content-muted">{t('directory.none')}</p>
            )}
          </section>

          {plan.mode === 'mirror' ? (
            <section>
              <GroupHeader
                title={t('directory.sync.group.delete')}
                tone="text-diff-removed"
                count={plan.delete.count}
                selectedCount={action.delete}
                bytes={plan.delete.bytes}
                actions={
                  plan.delete.items.length > 0 ? (
                    <>
                      <ToolbarButton
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setSelected(new Set(plan.delete.items.map((item) => item.relativePath)))}
                      >
                        {t('directory.sync.selectAll')}
                      </ToolbarButton>
                      <ToolbarButton
                        size="sm"
                        variant="ghost"
                        disabled={busy || action.delete === 0}
                        onClick={() => setSelected(new Set())}
                      >
                        {t('directory.sync.clearSelection')}
                      </ToolbarButton>
                    </>
                  ) : undefined
                }
              />
              {plan.delete.items.length > 0 ? (
                <ul className="mt-1 rounded-sm border border-line-subtle">
                  {plan.delete.items.map((item) => (
                    <li
                      key={item.relativePath}
                      className="flex items-center gap-2 px-2 py-1 odd:bg-surface-sunken/40"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(item.relativePath)}
                        onChange={() => toggle(item.relativePath)}
                        disabled={busy}
                        aria-label={t('directory.sync.deleteItem', {
                          path: item.relativePath
                        })}
                        className="size-4 shrink-0 accent-danger"
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
                <p className="px-2 py-1 text-2xs text-content-muted">{t('directory.none')}</p>
              )}
            </section>
          ) : null}

          {action.align > 0 ? (
            <section>
              <GroupHeader
                title={t('directory.sync.group.align')}
                tone="text-content-secondary"
                count={action.align}
                bytes={0}
              />
              <ul className="mt-1 rounded-sm border border-line-subtle">
                {alignments.map((alignment) => (
                  <li
                    key={alignment.relativePath}
                    className="flex items-center gap-2 px-2 py-1 odd:bg-surface-sunken/40"
                  >
                    <span className="truncate font-mono text-xs text-content-secondary">
                      {alignment.relativePath}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="flex flex-col gap-1 border-t border-line-subtle pt-2">
            <p className="text-2xs text-content-secondary" aria-live="polite">
              {t('directory.sync.summary', {
                copy: action.copy,
                update: action.update,
                delete: action.delete,
                align: action.align
              })}
            </p>
            {blockedByDeletes ? (
              <p className="text-2xs text-danger">{t('directory.sync.noExecutable')}</p>
            ) : null}
          </div>
        </div>
      )}
    </Dialog>
  )
}
