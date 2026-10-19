import { useRef, useState } from 'react'
import type { FormEvent, JSX, KeyboardEvent } from 'react'
import { FileCode2, FolderOpen, GitCompare } from 'lucide-react'
import { parseManualPaths, resolveCompareRequest } from '@shared/compareRequest'
import type { CompareRequest } from '@shared/compareRequest'
import type { PlatformPort } from '@shared/platform/types'
import { ToolbarButton } from '@renderer/components/Button'
import { Dialog } from '@renderer/components/Dialog'

/**
 * Result of one dialog action that builds a session itself. `ok` closes the
 * dialog; a failed action stays open, with the reason shown in place when the
 * platform handed one back (`null` means the user simply cancelled a picker).
 */
export type CompareOpenOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string | null }

const INPUT_CLASSES =
  'focus-ring h-7 w-full rounded-sm border border-line-subtle bg-surface-base px-2 font-mono text-xs text-content-primary placeholder:text-content-muted'

/**
 * 「新建对比」: the manual, dialog-free entry point. The two typed paths are
 * normalised and validated by the shared compare-request contract, then handed
 * to the workbench's existing session builders. Every failure stays inside this
 * dialog, so no empty tab is ever created.
 */
export function NewCompareDialog({
  platform,
  onClose,
  openRequest,
  onPickFiles,
  onPickDirectories
}: {
  readonly platform: PlatformPort
  readonly onClose: () => void
  /** Builds the session; resolves `false` when the build failed. */
  readonly openRequest: (
    request: CompareRequest,
    onError: (message: string) => void
  ) => Promise<boolean>
  readonly onPickFiles: () => Promise<CompareOpenOutcome>
  readonly onPickDirectories: () => Promise<CompareOpenOutcome>
}): JSX.Element {
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const leftInput = useRef<HTMLInputElement>(null)

  function describe(cause: unknown): string {
    return cause instanceof Error ? cause.message : String(cause)
  }

  async function submit(): Promise<void> {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const context = {
        homeDir: await platform.homeDirectory(),
        baseDir: await platform.workingDirectory()
      }
      const parsed = parseManualPaths(left, right, context)
      if (!parsed.ok) {
        setError(parsed.error.message)
        return
      }

      const resolved = await resolveCompareRequest(parsed.paths, {
        ...context,
        probe: { statPath: (path) => platform.statPath(path) }
      })
      if (!resolved.ok) {
        setError(resolved.error.message)
        return
      }

      const feedback = { message: null as string | null }
      const built = await openRequest(resolved.request, (message) => {
        feedback.message = message
      })
      if (built) {
        onClose()
        return
      }
      if (feedback.message !== null) setError(feedback.message)
    } catch (cause) {
      setError(describe(cause))
    } finally {
      setSubmitting(false)
    }
  }

  async function pick(action: () => Promise<CompareOpenOutcome>): Promise<void> {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const outcome = await action()
      if (outcome.ok) {
        onClose()
        return
      }
      if (outcome.error !== null) setError(outcome.error)
    } catch (cause) {
      setError(describe(cause))
    } finally {
      setSubmitting(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    void submit()
  }

  function submitOnEnter(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== 'Enter') return
    event.preventDefault()
    void submit()
  }

  return (
    <Dialog
      title="新建对比"
      description="直接输入或粘贴左右两个真实路径，按 Enter 建立对比；也可以继续使用系统选择器。"
      onClose={onClose}
      initialFocusRef={leftInput}
      footer={
        <>
          <ToolbarButton onClick={onClose} disabled={submitting}>
            取消
          </ToolbarButton>
          <ToolbarButton
            variant="primary"
            icon={<GitCompare aria-hidden className="size-3.5" />}
            onClick={() => void submit()}
            disabled={submitting}
          >
            建立对比
          </ToolbarButton>
        </>
      }
    >
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-1">
          <label htmlFor="new-compare-left" className="text-2xs text-content-secondary">
            左侧路径
          </label>
          <input
            id="new-compare-left"
            ref={leftInput}
            type="text"
            className={INPUT_CLASSES}
            value={left}
            spellCheck={false}
            autoComplete="off"
            placeholder="/Users/you/左 a.txt 或 ~/项目/a.txt"
            onChange={(event) => setLeft(event.target.value)}
            onKeyDown={submitOnEnter}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="new-compare-right" className="text-2xs text-content-secondary">
            右侧路径
          </label>
          <input
            id="new-compare-right"
            type="text"
            className={INPUT_CLASSES}
            value={right}
            spellCheck={false}
            autoComplete="off"
            placeholder="/Users/you/右 b.txt 或 a.txt"
            onChange={(event) => setRight(event.target.value)}
            onKeyDown={submitOnEnter}
          />
        </div>

        {error ? (
          <p role="alert" className="text-2xs text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <ToolbarButton
            icon={<FileCode2 aria-hidden className="size-3.5" />}
            onClick={() => void pick(onPickFiles)}
            disabled={submitting}
            title="依次选择左右两个真实文件"
          >
            打开文件
          </ToolbarButton>
          <ToolbarButton
            icon={<FolderOpen aria-hidden className="size-3.5" />}
            onClick={() => void pick(onPickDirectories)}
            disabled={submitting}
            title="依次选择左右两个真实文件夹"
          >
            打开文件夹
          </ToolbarButton>
          <span className="ml-auto text-2xs text-content-muted">Enter 提交 · Esc 关闭</span>
        </div>
      </form>
    </Dialog>
  )
}
