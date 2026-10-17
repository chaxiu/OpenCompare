import type { JSX } from 'react'
import type { CsvSceneFixture } from '@shared/fixtures'
import { Panel } from '@renderer/components/Panel'
import { SplitPane } from '@renderer/components/SplitPane'
import { cx } from '@renderer/components/utils'
import type { CsvTables } from '@renderer/workbench/loadSampleSessions'

function CsvTable({
  header,
  rows,
  keyColumns
}: {
  readonly header: readonly string[]
  readonly rows: readonly (readonly string[])[]
  readonly keyColumns: readonly string[]
}): JSX.Element {
  return (
    <table className="min-w-max border-collapse font-mono text-xs">
      <thead className="sticky top-0 z-10 bg-surface-overlay">
        <tr>
          <th className="w-11 border-r border-b border-line-subtle px-2 py-1 text-right text-2xs font-normal text-content-muted">
            #
          </th>
          {header.map((name) => (
            <th
              key={name}
              className={cx(
                'border-r border-b border-line-subtle px-2 py-1 text-left text-2xs font-medium whitespace-nowrap',
                keyColumns.includes(name) ? 'text-accent' : 'text-content-secondary'
              )}
            >
              {name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index} className="hover:bg-surface-hover">
            <td className="tabular border-r border-b border-line-subtle px-2 py-0.5 text-right text-2xs text-content-muted">
              {index + 1}
            </td>
            {header.map((name, cell) => (
              <td
                key={name}
                className={cx(
                  'border-r border-b border-line-subtle px-2 py-0.5 whitespace-nowrap',
                  keyColumns.includes(name) ? 'text-content-primary' : 'text-content-secondary'
                )}
              >
                {row[cell] ?? ''}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * Scene C — the two reconciliation sides as raw tables. The declared key
 * column is tinted; no diff highlighting happens in this phase.
 */
export function CsvView({
  fixture,
  tables
}: {
  readonly fixture: CsvSceneFixture
  readonly tables: CsvTables
}): JSX.Element {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 gap-2 p-2">
      <SplitPane
        panes={[
          <Panel
            key="left"
            title={fixture.left.path}
            subtitle={`${tables.left.rows.length.toLocaleString('en-US')} 行 · ${fixture.left.delimiter === '\t' ? 'TSV' : 'CSV'}`}
          >
            <CsvTable
              header={tables.left.header}
              rows={tables.left.rows}
              keyColumns={fixture.keyColumns}
            />
          </Panel>,
          <Panel
            key="right"
            title={fixture.right.path}
            subtitle={`${tables.right.rows.length.toLocaleString('en-US')} 行 · ${fixture.right.delimiter === '\t' ? 'TSV' : 'CSV'}`}
          >
            <CsvTable
              header={tables.right.header}
              rows={tables.right.rows}
              keyColumns={fixture.keyColumns}
            />
          </Panel>
        ]}
      />
    </div>
  )
}
