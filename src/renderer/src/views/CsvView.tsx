import type { JSX } from 'react'
import type { CsvSample } from '@shared/fixtures'
import type { CsvTable, CsvTables } from '@renderer/workbench/session'
import { Panel } from '@renderer/components/Panel'
import { SplitPane } from '@renderer/components/SplitPane'
import { cx } from '@renderer/components/utils'

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
 * column is tinted; no diff highlighting happens in this phase. Drilldown
 * sessions feed ad-hoc left/right samples through the same component.
 */
export function CsvView({
  left,
  right,
  keyColumns,
  tables
}: {
  readonly left: CsvSample
  readonly right: CsvSample
  readonly keyColumns: readonly string[]
  readonly tables: CsvTables
}): JSX.Element {
  const label = (sample: CsvSample, table: CsvTable): string =>
    `${table.rows.length.toLocaleString('en-US')} 行 · ${sample.delimiter === '\t' ? 'TSV' : 'CSV'}`

  return (
    <div className="flex min-h-0 min-w-0 flex-1 gap-2 p-2">
      <SplitPane
        panes={[
          <Panel key="left" title={left.path} subtitle={label(left, tables.left)}>
            <CsvTable header={tables.left.header} rows={tables.left.rows} keyColumns={keyColumns} />
          </Panel>,
          <Panel key="right" title={right.path} subtitle={label(right, tables.right)}>
            <CsvTable
              header={tables.right.header}
              rows={tables.right.rows}
              keyColumns={keyColumns}
            />
          </Panel>
        ]}
      />
    </div>
  )
}
