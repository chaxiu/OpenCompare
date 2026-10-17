import { useState } from 'react'
import type { JSX } from 'react'
import type { CodeSceneFixture } from '@shared/fixtures'
import { CodeBlock } from '@renderer/components/CodeBlock'
import { Panel } from '@renderer/components/Panel'
import { SegmentedControl } from '@renderer/components/SegmentedControl'
import { SplitPane } from '@renderer/components/SplitPane'

export type CodeMode = 'diff' | 'merge'

const MODE_OPTIONS = [
  { value: 'diff', label: '双栏 Diff' },
  { value: 'merge', label: '三向合并 base · ours · theirs' }
] as const

/** Scene B — raw code panes for the diff pair and the three-way merge set. */
export function CodeView({
  fixture,
  defaultMode = 'merge'
}: {
  readonly fixture: CodeSceneFixture
  /** Three-column merge is the default for a session declared with three panes. */
  readonly defaultMode?: CodeMode
}): JSX.Element {
  const [mode, setMode] = useState<CodeMode>(defaultMode)

  const panes =
    mode === 'diff'
      ? [
          <Panel key="left" title={fixture.diff.left.path} subtitle="左">
            <CodeBlock text={fixture.diff.left.text} />
          </Panel>,
          <Panel key="right" title={fixture.diff.right.path} subtitle="右">
            <CodeBlock text={fixture.diff.right.text} />
          </Panel>
        ]
      : [
          <Panel key="base" title={fixture.merge.base.path} subtitle="base">
            <CodeBlock text={fixture.merge.base.text} />
          </Panel>,
          <Panel key="ours" title={fixture.merge.ours.path} subtitle="ours">
            <CodeBlock text={fixture.merge.ours.text} />
          </Panel>,
          <Panel key="theirs" title={fixture.merge.theirs.path} subtitle="theirs">
            <CodeBlock text={fixture.merge.theirs.text} />
          </Panel>
        ]

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-2">
      <div className="flex shrink-0 items-center gap-2">
        <SegmentedControl label="代码视图" options={MODE_OPTIONS} value={mode} onChange={setMode} />
        <span className="hidden text-2xs text-content-muted md:inline">
          只读呈现样本原文 · 合并算法留给后续子项
        </span>
      </div>
      <SplitPane panes={panes} />
    </div>
  )
}
