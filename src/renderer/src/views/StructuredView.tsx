import { useState } from 'react'
import type { JSX } from 'react'
import type { StructuredSceneFixture } from '@shared/fixtures'
import type { FilePair } from '@renderer/workbench/session'
import { CodeBlock } from '@renderer/components/CodeBlock'
import { Panel } from '@renderer/components/Panel'
import { SegmentedControl } from '@renderer/components/SegmentedControl'
import { SplitPane } from '@renderer/components/SplitPane'

type StructuredFormat = 'json' | 'yaml'

const FORMAT_OPTIONS = [
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' }
] as const

/**
 * Scene D — raw JSON / YAML pairs with shuffled key order and deep changes.
 * A drilldown `pair` renders one fixed format without the format switch.
 */
export function StructuredView({
  fixture,
  pair,
  format
}: {
  readonly fixture?: StructuredSceneFixture
  /** Ad-hoc left/right bodies coming from a directory-tree drilldown. */
  readonly pair?: FilePair
  readonly format?: StructuredFormat
}): JSX.Element {
  const [selected, setSelected] = useState<StructuredFormat>('json')
  const adhoc = pair !== undefined
  const effective: StructuredFormat = adhoc ? (format ?? 'json') : selected
  const current = pair ?? (fixture ? (effective === 'json' ? fixture.json : fixture.yaml) : null)

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-2">
      <div className="flex shrink-0 items-center gap-2">
        {adhoc ? (
          <span className="text-2xs text-content-muted">
            来自目录对比下钻 · {effective.toUpperCase()} 原文（语义归一化对比留给后续子项）
          </span>
        ) : (
          <>
            <SegmentedControl
              label="结构化格式"
              options={FORMAT_OPTIONS}
              value={selected}
              onChange={setSelected}
            />
            <span className="hidden text-2xs text-content-muted md:inline">
              键序已打乱 · 语义归一化对比留给后续子项
            </span>
          </>
        )}
      </div>
      <SplitPane
        panes={
          current
            ? [
                <Panel key="left" title={current.left.path} subtitle="左">
                  <CodeBlock text={current.left.text} />
                </Panel>,
                <Panel key="right" title={current.right.path} subtitle="右">
                  <CodeBlock text={current.right.text} />
                </Panel>
              ]
            : []
        }
      />
    </div>
  )
}
