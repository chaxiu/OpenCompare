/**
 * Measurement-mode renderer. Rendered instead of the workbench only when the
 * harness window is loaded with `?perf=1`; it asks the main process for the
 * validated config, runs the rounds through the workbench comparison path and
 * reports every boundary back to the sampler.
 */
import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { PlatformPort } from '@shared/platform/types'
import type { PerfHarnessConfig } from '@shared/perf/types'
import type { WorkbenchSession } from '../workbench/session'
import { runPerfRounds } from '../perf/runRounds'

export function PerfRunner({ platform }: { readonly platform: PlatformPort }): JSX.Element {
  const [status, setStatus] = useState('正在读取测量配置…')
  const [error, setError] = useState<string | null>(
    platform.perf === undefined ? '当前运行时没有 perf 测量通道。' : null
  )
  const started = useRef(false)
  const [session, setSession] = useState<WorkbenchSession | null>(null)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const perf = platform.perf
    if (perf === undefined) return

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
        setStatus(`正在对比 ${config.left} ↔ ${config.right}`)

        const reports = await runPerfRounds(
          platform,
          config,
          {
            onRoundStart: async (round) => {
              setStatus(`第 ${round}/${config.rounds} 轮：采样轮次边界`)
              await perf.event({ type: 'round-start', round })
            },
            onSession: (next) => setSession(next),
            onRoundEnd: async (report) => {
              setStatus(
                `第 ${report.index}/${config.rounds} 轮完成（${Math.round(report.wallMs / 100) / 10}s，` +
                  `实际哈希 ${report.counts.hashedFiles} 个文件）`
              )
              await perf.event({ type: 'round-end', report })
            },
            onProgress: (progress) => {
              setStatus(
                `第 ${progress.phase === 'scan' ? '扫描' : '哈希'}阶段：${progress.files} 个文件 / ${progress.bytes} 字节`
              )
            }
          }
        )
        await perf.event({ type: 'complete' })
        setStatus(`测量完成：${reports.length} 轮，主进程正在写出证据。`)
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause)
        setError(message)
        // The main process still writes partial evidence with verdict.ok=false.
        await perf.event({ type: 'failed', message }).catch(() => undefined)
      }
    })()
  }, [platform])

  return (
    <main className="flex h-screen flex-col items-center justify-center gap-3 bg-surface-base px-8 text-center text-content-primary">
      <h1 className="text-lg font-medium">OpenCompare · 大目录内存测量</h1>
      <p className="max-w-2xl text-sm text-content-secondary">{status}</p>
      {error !== null && (
        <p role="alert" className="max-w-2xl text-sm text-diff-removed">
          {error}
        </p>
      )}
      {session !== null && (
        <p className="text-xs text-content-muted">
          最近一轮会话：{session.id}
        </p>
      )}
    </main>
  )
}
