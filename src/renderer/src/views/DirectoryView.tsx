import { useState } from 'react'
import type { JSX } from 'react'
import { ChevronDown } from 'lucide-react'
import type { DirectorySceneFixture } from '@shared/fixtures'
import { IconButton } from '@renderer/components/Button'
import { Panel } from '@renderer/components/Panel'
import { SplitPane } from '@renderer/components/SplitPane'
import { TreeView } from '@renderer/components/TreeView'
import { cx } from '@renderer/components/utils'

/**
 * Scene A — the two nested trees side by side, plus the level-shuffled copy B
 * in a collapsible strip below. Badges are the sample's authored answer key.
 */
export function DirectoryView({
  fixture
}: {
  readonly fixture: DirectorySceneFixture
}): JSX.Element {
  const [scatteredOpen, setScatteredOpen] = useState(true)

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-2">
      <SplitPane
        panes={[
          <Panel key="left" title={fixture.left.name} subtitle="源目录">
            <TreeView root={fixture.left} />
          </Panel>,
          <Panel key="right" title={fixture.right.name} subtitle="目标目录">
            <TreeView root={fixture.right} />
          </Panel>
        ]}
      />

      <div className={cx('shrink-0', scatteredOpen ? 'h-44' : 'h-8')}>
        <Panel
          title={fixture.scattered.name}
          subtitle="跨层级散乱目录树 B"
          actions={
            <IconButton
              label={scatteredOpen ? '折叠散乱目录树' : '展开散乱目录树'}
              icon={
                <ChevronDown
                  aria-hidden
                  className={cx('transition-fast size-3.5', scatteredOpen ? undefined : '-rotate-90')}
                />
              }
              onClick={() => setScatteredOpen((value) => !value)}
            />
          }
        >
          {scatteredOpen ? <TreeView root={fixture.scattered} /> : null}
        </Panel>
      </div>
    </div>
  )
}
