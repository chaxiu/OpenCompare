/**
 * Measurement-mode renderer. Rendered instead of the workbench only when the
 * harness window is loaded with `?perf=1`; it asks the main process for the
 * validated config, renders the *real* directory views the rounds commit (tabs,
 * trees, virtualisers and row models included) and reports every boundary back
 * to the sampler.
 *
 * It intentionally never clears the session list between rounds: the holding
 * path measured here is exactly the one `Workbench` has after a re-compare.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { flushSync } from 'react-dom'
import type { PlatformPort } from '@shared/platform/types'
import type { PerfBridge, PerfHarnessConfig } from '@shared/perf/types'
import { livenessCounts, setLivenessEnabled } from '@shared/perf/liveness'
import { SessionTabs } from '../components/SessionTabs'
import { DirectoryView } from '../views/DirectoryView'
import type { WorkbenchSession } from '../workbench/session'
import { directoryViewKey } from '../workbench/directoryCompare'
import { runPerfRounds } from '../perf/runRounds'

const EMPTY_COLLAPSED: readonly string[] = []
const ZERO_SCROLL = { left: 0, right: 0 } as const

const ignoreFilter = (): void => undefined
const ignorePath = (): void => undefined
const ignoreSide = (): void => undefined
const ignoreSideScroll = (): void => undefined
const ignoreImport = (): void => undefined

/** Resolves after the browser has painted the committed tree at least once. */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setTimeout(resolve, 0))
      })
      return
    }
    setTimeout(() => setTimeout(resolve, 0), 0)
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Runs two forced collections with a task boundary in between, so weak refs to
 * objects nobody holds any more are actually cleared before they are counted.
 * Returns false when the runtime never got `--expose-gc` (a red measurement,
 * never a silent pass).
 */
async function forceGc(): Promise<boolean> {
  const gc = (globalThis as { gc?: () => void }).gc
  if (typeof gc !== 'function') return false
  gc()
  await delay(30)
  gc()
  return true
}

export function PerfRunner({ platform }: { readonly platform: PlatformPort }): JSX.Element {
  const [status, setStatus] = useState('正在读取测量配置…')
  const [error, setError] = useState<string | null>(
    platform.perf === undefined ? '当前运行时没有 perf 测量通道。' : null
  )
  const [sessions, setSessions] = useState<readonly WorkbenchSession[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const started = useRef(false)
  /** Latest committed list; the async round loop must not read stale state. */
  const sessionsRef = useRef<readonly WorkbenchSession[]>([])

  const commit = useCallback(async (next: readonly WorkbenchSession[], id: string | null) => {
    // Force the commit so the post-round sample and the liveness reading both
    // observe the new tree, not a pending update.
    flushSync(() => {
      sessionsRef.current = next
      setSessions(next)
      setActiveId(id)
    })
    await nextPaint()
  }, [])

  useEffect(() => {
    setLivenessEnabled(true)
    return () => setLivenessEnabled(false)
  }, [])

  useEffect(() => {
    if (started.current) return
    started.current = true
    const perf = platform.perf
    if (perf === undefined) return

    /** Publishes one post-GC liveness reading to the sampler. */
    async function publishHold(bridge: PerfBridge, label: string): Promise<void> {
      const gc = await forceGc()
      const counts = livenessCounts()
      await bridge.event({
        type: 'hold',
        label,
        tabs: sessionsRef.current.length,
        comparisons: counts.comparisons,
        rowModels: counts.rowModels,
        gc
      })
    }

    void (async () => {
      let config: PerfHarnessConfig
      try {
        const loaded = await perf.config()
        if (loaded === null) {
          setError('主进程未处于测量模式。')
          return
        }
        config = loaded
        await perf.event({ type: 'ready' })
        setStatus(
          `测量模式 ${config.mode}：${config.pairs.length} 对目录，第 1/${config.rounds} 轮准备中`
        )

        const reports = await runPerfRounds(platform, config, {
          onRoundStart: async (round) => {
            setStatus(`第 ${round}/${config.rounds} 轮：采样轮次边界`)
            await perf.event({ type: 'round-start', round })
          },
          onCommit: commit,
          onRoundEnd: async (report) => {
            setStatus(
              `第 ${report.index}/${config.rounds} 轮完成（${Math.round(report.wallMs / 100) / 10}s，` +
                `实际哈希 ${report.counts.hashedFiles} 个文件，${report.tabs} 个标签）`
            )
            await perf.event({ type: 'round-end', report })
            await publishHold(perf, `round-${report.index}`)
          },
          onProgress: (progress) => {
            setStatus(
              `第 ${progress.phase === 'scan' ? '扫描' : '哈希'}阶段：${progress.files} 个文件 / ${progress.bytes} 字节`
            )
          },
          onSettleStage: async (label, tabs) => {
            setStatus(`静置 ${Math.round(config.settleMs / 1000)}s 后采样 ${label}…`)
            await publishHold(perf, label)
            await perf.event({ type: 'settle-stage', label, tabs })
          },
          onReclaim: async (tabs) => {
            setStatus(`关闭活动标签后采样回收（${tabs} 个标签）…`)
            await publishHold(perf, 'reclaim')
            await perf.event({ type: 'reclaim', tabs })
          }
        })

        if (config.mode !== 'retained') {
          setStatus(`等待 ${Math.round(config.settleMs / 1000)}s 静置后采样…`)
          await delay(config.settleMs)
          await publishHold(perf, 'settle')
          await perf.event({ type: 'settle' })
        }
        await perf.event({ type: 'complete' })
        setStatus(`测量完成：${reports.length} 轮，主进程正在写出证据。`)
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause)
        setError(message)
        // The main process still writes partial evidence with verdict.ok=false.
        await perf.event({ type: 'failed', message }).catch(() => undefined)
      }
    })()
  }, [platform, commit])

  const active = sessions.find((session) => session.id === activeId) ?? null
  const comparison = active?.directory
  const sides = active?.sides
  const tabs = sessions.map((session) => ({ id: session.id, title: session.title }))

  return (
    <main className="flex h-screen flex-col gap-2 bg-surface-base px-3 py-2 text-content-primary">
      <header className="flex shrink-0 flex-col gap-1">
        <h1 className="text-sm font-medium">OpenCompare · 大目录内存测量</h1>
        <p className="text-2xs text-content-secondary">{status}</p>
        {error !== null && (
          <p role="alert" className="text-2xs text-diff-removed">
            {error}
          </p>
        )}
      </header>
      <SessionTabs tabs={tabs} activeId={activeId} onSelect={setActiveId} />
      <div className="flex min-h-0 flex-1 flex-col">
        {active !== null && comparison !== undefined && sides !== undefined ? (
          <DirectoryView
            key={directoryViewKey(active)}
            sessionId={active.id}
            comparison={comparison}
            filter="all"
            onFilterChange={ignoreFilter}
            collapsedPaths={EMPTY_COLLAPSED}
            onTogglePath={ignorePath}
            selectedPath={null}
            onSelectPath={ignorePath}
            scrollTops={ZERO_SCROLL}
            onScrollTopChange={ignoreSideScroll}
            visibleCounts={{ ...comparison.counts, conflict: 0 }}
            pickerAvailable={false}
            busy={false}
            onPick={ignoreSide}
            onLoadSample={ignorePath}
            onOpenFile={ignorePath}
            leftIsSnapshot={sides.left.kind === 'snapshot'}
            rightIsSnapshot={sides.right.kind === 'snapshot'}
            onExportSnapshot={ignoreSide}
            onImportSnapshot={ignoreImport}
            onLoadRemoteSnapshotSample={ignorePath}
            onPreviewSync={ignorePath}
            onPreviewTemplate={ignorePath}
            syncPreview={null}
            templatePreview={null}
            onCancelSync={ignorePath}
            onConfirmSync={ignorePath}
            onCancelTemplate={ignorePath}
            onConfirmTemplate={ignorePath}
          />
        ) : (
          <p className="p-3 text-2xs text-content-muted">第 1 轮对比结果就绪后在此渲染真实目录视图。</p>
        )}
      </div>
    </main>
  )
}
