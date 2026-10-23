import type { JSX } from 'react'
import { LoaderCircle } from 'lucide-react'
import { ToolbarButton } from '@renderer/components/Button'
import { Dialog } from '@renderer/components/Dialog'
import { formatBytes } from '@renderer/components/utils'
import { useI18n } from '@renderer/i18n/context'
import type { TemplatePreview } from '@renderer/workbench/directoryOps'
import { countKey } from './directoryCopy'

function SectionTitle({
  title,
  count,
  tone
}: {
  readonly title: string
  readonly count: number
  readonly tone: string
}): JSX.Element {
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-2">
      <span className={tone}>{title}</span>
      <span className="tabular font-mono text-2xs text-content-muted">
        {t(countKey('directory.template.count.one', 'directory.template.count.other', count), {
          count
        })}
      </span>
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
  const { t } = useI18n()
  const { result, templateRoot, incomingRoot, targetRoot } = preview

  return (
    <Dialog
      title={t('directory.template.title')}
      description={
        <>
          {t('directory.template.label.template')}
          <span className="font-mono">{templateRoot}</span> · {t('directory.template.label.incoming')}
          <span className="font-mono">{incomingRoot}</span> · {t('directory.template.label.output')}
          <span className="font-mono">{targetRoot}</span>
        </>
      }
      onClose={busy ? () => undefined : onCancel}
      footer={
        <>
          <ToolbarButton variant="ghost" onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </ToolbarButton>
          <ToolbarButton
            variant="primary"
            onClick={onConfirm}
            disabled={busy || result.matched.length === 0}
          >
            {busy ? <LoaderCircle aria-hidden className="size-3.5 animate-spin" /> : null}
            {busy ? t('directory.template.placing') : t('directory.template.place')}
          </ToolbarButton>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <section>
          <SectionTitle
            title={t('directory.template.section.matched')}
            count={result.matched.length}
            tone="text-diff-added"
          />
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
            <p className="px-2 py-1 text-2xs text-content-muted">{t('directory.none')}</p>
          )}
        </section>

        <section>
          <SectionTitle
            title={t('directory.template.section.missing')}
            count={result.missing.length}
            tone="text-diff-removed"
          />
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
            <p className="px-2 py-1 text-2xs text-content-muted">{t('directory.none')}</p>
          )}
        </section>

        <section>
          <SectionTitle
            title={t('directory.template.section.conflicts')}
            count={result.conflicts.length}
            tone="text-diff-conflict"
          />
          {result.conflicts.length > 0 ? (
            <ul className="mt-1 rounded-sm border border-line-subtle">
              {result.conflicts.map((item) => (
                <li key={item.relativePath} className="px-2 py-1 odd:bg-surface-sunken/40">
                  <span className="font-mono text-xs text-content-secondary">
                    {item.relativePath}
                  </span>
                  <span className="ml-2 text-2xs text-content-muted">
                    {t(
                      item.reason === 'ambiguous'
                        ? 'directory.template.reason.ambiguous'
                        : 'directory.template.reason.contentMismatch'
                    )}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-2xs text-content-muted">
                    {item.candidates.map((candidate) => candidate.path).join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2 py-1 text-2xs text-content-muted">{t('directory.none')}</p>
          )}
        </section>

        <section>
          <SectionTitle
            title={t('directory.template.section.unused')}
            count={result.unused.length}
            tone="text-content-muted"
          />
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
            <p className="px-2 py-1 text-2xs text-content-muted">{t('directory.none')}</p>
          )}
        </section>
      </div>
    </Dialog>
  )
}
