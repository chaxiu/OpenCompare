import { useState } from 'react'
import type { JSX } from 'react'
import type { StructuredSceneFixture } from '@shared/fixtures'
import { CodeBlock } from '@renderer/components/CodeBlock'
import { Panel } from '@renderer/components/Panel'
import { SegmentedControl } from '@renderer/components/SegmentedControl'
import { SplitPane } from '@renderer/components/SplitPane'

type StructuredFormat = 'json' | 'yaml'

const FORMAT_OPTIONS = [
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' }
] as const

/** Scene D — raw JSON / YAML pairs with shuffled key order and deep changes. */
export function StructuredView({
  fixture
}: {
  readonly fixture: StructuredSceneFixture
}): JSX.Element {
  const [format, setFormat] = useState<StructuredFormat>('json')
  const pair = format === 'json' ? fixture.json : fixture.yaml

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-2">
      <div className="flex shrink-0 items-center gap-2">
        <SegmentedControl
          label="结构化格式"
          options={FORMAT_OPTIONS}
          value={format}
          onChange={setFormat}
        />
        <span className="hidden text-2xs text-content-muted md:inline">
          键序已打乱 · 语义归一化对比留给后续子项
        </span>
      </div>
      <SplitPane
        panes={[
          <Panel key="left" title={pair.left.path} subtitle="左">
            <CodeBlock text={pair.left.text} />
          </Panel>,
          <Panel key="right" title={pair.right.path} subtitle="右">
            <CodeBlock text={pair.right.text} />
          </Panel>
        ]}
      />
    </div>
  )
}
