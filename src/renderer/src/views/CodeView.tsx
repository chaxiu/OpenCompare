import { useState } from 'react'
import type { JSX } from 'react'
import type { CodeSceneFixture } from '@shared/fixtures'
import type { FilePair } from '@renderer/workbench/session'
import { CodeBlock } from '@renderer/components/CodeBlock'
import { Panel } from '@renderer/components/Panel'
import { SegmentedControl } from '@renderer/components/SegmentedControl'
import { SplitPane } from '@renderer/components/SplitPane'

export type CodeMode = 'diff' | 'merge'

const MODE_OPTIONS = [
  { value: 'diff', label: '双栏 Diff' },
  { value: 'merge', label: '三向合并 base · ours · theirs' }
] as const

/**
 * Scene B — raw code panes for the diff pair and the three-way merge set.
 * A drilldown `pair` renders the two-column diff only.
 */
export function CodeView({
  fixture,
  defaultMode = 'merge',
  pair
}: {
  readonly fixture?: CodeSceneFixture
  /** Three-column merge is the default for a session declared with three panes. */
  readonly defaultMode?: CodeMode
  /** Ad-hoc left/right bodies coming from a directory-tree drilldown. */
  readonly pair?: FilePair
}): JSX.Element {
  const [mode, setMode] = useState<CodeMode>(defaultMode)
  const adhoc = pair !== undefined
  const effectiveMode: CodeMode = adhoc ? 'diff' : mode
  const diffPair = pair ?? fixture?.diff

  const panes =
    effectiveMode === 'diff' && diffPair
      ? [
          <Panel key="left" title={diffPair.left.path} subtitle="左">
            <CodeBlock text={diffPair.left.text} />
          </Panel>,
          <Panel key="right" title={diffPair.right.path} subtitle="右">
            <CodeBlock text={diffPair.right.text} />
          </Panel>
        ]
      : fixture
        ? [
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
        : []

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-2">
      <div className="flex shrink-0 items-center gap-2">
        {adhoc ? (
          <span className="text-2xs text-content-muted">
            来自目录对比下钻 · 只读呈现左右原文（行内 Diff 留给后续子项）
          </span>
        ) : (
          <>
            <SegmentedControl
              label="代码视图"
              options={MODE_OPTIONS}
              value={mode}
              onChange={setMode}
            />
            <span className="hidden text-2xs text-content-muted md:inline">
              只读呈现样本原文 · 合并算法留给后续子项
            </span>
          </>
        )}
      </div>
      <SplitPane panes={panes} />
    </div>
  )
}
