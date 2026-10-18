import { useCallback, useState } from 'react'
import type { JSX } from 'react'
import {
  AlertTriangle,
  Braces,
  FileCode2,
  FolderTree,
  GitCompare,
  Layers,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  Table2
} from 'lucide-react'
import { CODE_SCENE, CSV_SCENE, DIRECTORY_SCENE, STRUCTURED_SCENE } from '@shared/fixtures'
import type { SceneId } from '@shared/fixtures'
import type { PlatformPort } from '@shared/platform/types'
import { ToolbarButton } from '@renderer/components/Button'
import { DropdownMenu } from '@renderer/components/DropdownMenu'
import type { DropdownItem } from '@renderer/components/DropdownMenu'
import { SegmentedControl } from '@renderer/components/SegmentedControl'
import { SessionTabs } from '@renderer/components/SessionTabs'
import { StateView } from '@renderer/components/StateView'
import { CompositionLegend, StatusBar, StatusEntry } from '@renderer/components/StatusBar'
import { CodeView } from '@renderer/views/CodeView'
import type { CodeMergeState } from '@renderer/views/CodeView'
import { CsvView } from '@renderer/views/CsvView'
import { DirectoryView } from '@renderer/views/DirectoryView'
import { StructuredView } from '@renderer/views/StructuredView'
import { loadSampleSessions } from './loadSampleSessions'
import type { LoadedSession } from './loadSampleSessions'

type WorkbenchStatus = 'empty' | 'loading' | 'ready' | 'error'

const VIEW_OPTIONS: readonly { value: SceneId; label: string; icon: JSX.Element }[] = [
  { value: 'directory', label: '目录对比', icon: <FolderTree aria-hidden className="size-3.5" /> },
  {
    value: 'code',
    label: '代码 Diff & 3-Way',
    icon: <FileCode2 aria-hidden className="size-3.5" />
  },
  { value: 'csv', label: 'CSV 主键对比', icon: <Table2 aria-hidden className="size-3.5" /> },
  { value: 'structured', label: 'JSON / YAML', icon: <Braces aria-hidden className="size-3.5" /> }
]

const MENU_SCENES: Record<string, SceneId> = {
  'load-directory': 'directory',
  'load-code': 'code',
  'load-csv': 'csv',
  'load-structured': 'structured'
}

/**
 * The persistent dropdown next to the primary load button: per-scene loads plus
 * the baseline-only error-state exercise.
 */
const SAMPLE_MENU: readonly DropdownItem[] = [
  {
    id: 'load-all',
    label: '加载全部样本',
    description: '一次打开四个场景会话',
    icon: <Sparkles aria-hidden className="size-3.5" />
  },
  {
    id: 'load-directory',
    label: '目录对比',
    description: '嵌入双目录树 + 跨层级散乱树 B'
  },
  { id: 'load-code', label: '代码 Diff & 3-Way Merge', description: '双栏 Diff + 多冲突块' },
  { id: 'load-csv', label: 'CSV 主键对比', description: '1,240 行乱序主键对账' },
  { id: 'load-structured', label: 'JSON / YAML 语义对比', description: '键序打乱 + 深层变更' },
  {
    id: 'simulate-failure',
    label: '演示：样本读取失败',
    description: '基线自检用：查看错误态与重试',
    danger: true
  }
]

/** Multi-session workbench shell: toolbar, split work area and status bar. */
export function Workbench({ platform }: { readonly platform: PlatformPort }): JSX.Element {
  const [status, setStatus] = useState<WorkbenchStatus>('empty')
  const [sessions, setSessions] = useState<readonly LoadedSession[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [codeMerge, setCodeMerge] = useState<CodeMergeState | null>(null)

  const handleMergeState = useCallback((state: CodeMergeState) => setCodeMerge(state), [])

  const active = sessions.find((session) => session.id === activeId) ?? null
  const baseComposition = active
    ? { directory: DIRECTORY_SCENE, code: CODE_SCENE, csv: CSV_SCENE, structured: STRUCTURED_SCENE }[
        active.scene
      ].composition
    : null
  // The code session's conflict count is computed at runtime from the merge
  // model, not read from the sample answer key.
  const composition =
    baseComposition && active?.scene === 'code' && codeMerge
      ? { ...baseComposition, conflict: codeMerge.unresolved }
      : baseComposition

  async function load(options?: {
    readonly scene?: SceneId
    readonly simulateFailure?: boolean
  }): Promise<void> {
    setStatus('loading')
    setError(null)
    try {
      const loaded = await loadSampleSessions(options)
      setSessions(loaded)
      setActiveId((current) =>
        current !== null && loaded.some((session) => session.id === current)
          ? current
          : (loaded[0]?.id ?? null)
      )
      setStatus('ready')
    } catch (cause) {
      setSessions([])
      setActiveId(null)
      setError(cause instanceof Error ? cause.message : String(cause))
      setStatus('error')
    }
  }

  function selectScene(scene: SceneId): void {
    const target = sessions.find((session) => session.scene === scene)
    if (target) setActiveId(target.id)
  }

  function handleMenuSelect(id: string): void {
    if (id === 'simulate-failure') {
      void load({ simulateFailure: true })
      return
    }
    if (id === 'load-all') {
      void load()
      return
    }
    const scene = MENU_SCENES[id]
    if (scene) void load({ scene })
  }

  function renderScene(session: LoadedSession): JSX.Element | null {
    switch (session.scene) {
      case 'directory':
        return <DirectoryView fixture={DIRECTORY_SCENE} />
      case 'code':
        return (
          <CodeView
            fixture={CODE_SCENE}
            defaultMode={session.columns === 3 ? 'merge' : 'diff'}
            onMergeStateChange={handleMergeState}
          />
        )
      case 'csv':
        return session.tables ? <CsvView fixture={CSV_SCENE} tables={session.tables} /> : null
      case 'structured':
        return <StructuredView fixture={STRUCTURED_SCENE} />
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-base text-content-primary">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line-subtle bg-surface-sunken px-3">
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-sm bg-accent-soft text-accent">
            <GitCompare aria-hidden className="size-4" />
          </span>
          <div className="leading-tight">
            <h1 className="text-sm font-semibold tracking-tight">OpenCompare</h1>
            <p className="text-2xs text-content-muted">对比与三向合并工作台</p>
          </div>
        </div>

        <SegmentedControl
          label="视图切换"
          options={VIEW_OPTIONS.map((option) => ({
            ...option,
            disabled: sessions.length === 0
          }))}
          value={active?.scene ?? 'directory'}
          onChange={selectScene}
        />

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ToolbarButton
            variant="primary"
            icon={<Sparkles aria-hidden className="size-3.5" />}
            onClick={() => void load()}
            disabled={status === 'loading'}
          >
            Load Sample Fixtures
          </ToolbarButton>
          <DropdownMenu
            label="样本"
            menuLabel="样本库"
            icon={<Layers aria-hidden className="size-3.5" />}
            items={SAMPLE_MENU}
            onSelect={handleMenuSelect}
          />
        </div>
      </header>

      {status === 'ready' && sessions.length > 0 ? (
        <div className="flex h-9 shrink-0 items-center border-b border-line-subtle bg-surface-base pr-2">
          <SessionTabs
            tabs={sessions.map((session) => ({
              id: session.id,
              title: session.title,
              subtitle: session.subtitle,
              icon: VIEW_OPTIONS.find((option) => option.value === session.scene)?.icon
            }))}
            activeId={activeId}
            onSelect={setActiveId}
          />
        </div>
      ) : null}

      <main className="flex min-h-0 flex-1 flex-col">
        {status === 'empty' ? (
          <StateView
            icon={<FolderTree aria-hidden className="size-5" />}
            title="尚未载入样本"
            description="OpenCompare 内置四大标准对比场景：嵌套目录树、代码 Diff 与 3-Way Merge、1,200+ 行乱序主键 CSV、乱序深层 JSON / YAML。一键载入后即可在会话间切换。"
            action={
              <ToolbarButton
                variant="primary"
                icon={<Sparkles aria-hidden className="size-3.5" />}
                onClick={() => void load()}
              >
                Load Sample Fixtures
              </ToolbarButton>
            }
            hint="目录 · 代码 · CSV 主键 · JSON / YAML"
          />
        ) : null}

        {status === 'loading' ? (
          <StateView
            icon={<LoaderCircle aria-hidden className="size-5 animate-spin" />}
            title="正在载入样本…"
            description="读取内置样本库并解析 CSV / TSV 表格。"
          />
        ) : null}

        {status === 'error' ? (
          <StateView
            tone="danger"
            icon={<AlertTriangle aria-hidden className="size-5" />}
            title="样本库读取失败"
            description={error ?? '读取内置样本时发生未知错误。'}
            action={
              <ToolbarButton
                variant="danger"
                icon={<RefreshCw aria-hidden className="size-3.5" />}
                onClick={() => void load()}
              >
                重试
              </ToolbarButton>
            }
            hint="样本库随应用内置，可直接重试。"
          />
        ) : null}

        {status === 'ready' && active ? renderScene(active) : null}
      </main>

      <StatusBar>
        <StatusEntry label="会话" value={active ? active.id : '—'} />
        <span aria-hidden className="h-3 w-px shrink-0 bg-line-subtle" />
        <StatusEntry label="运行平台" value={platform.kind} />
        {composition ? (
          <>
            <span aria-hidden className="h-3 w-px shrink-0 bg-line-subtle" />
            <CompositionLegend composition={composition} />
          </>
        ) : null}
        {active ? (
          <span className="ml-auto flex shrink-0 items-center gap-3">
            {active.stats.map((stat) => (
              <StatusEntry
                key={stat.label}
                label={stat.label}
                value={
                  active.scene === 'code' && stat.label === '冲突块' && codeMerge
                    ? codeMerge.unresolved
                    : stat.value
                }
                tone={stat.tone}
              />
            ))}
          </span>
        ) : null}
      </StatusBar>
    </div>
  )
}
