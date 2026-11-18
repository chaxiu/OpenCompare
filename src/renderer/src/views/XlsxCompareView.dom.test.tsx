// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { XlsxTableMeta } from '@core/xlsx/parse'
import { installJsdomViewport } from '../../../test/jsdomViewport'
import { mountWorkbench, scriptedPort, dropPaths, sessionTabCount } from '../../../test/sharedHarness'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import type { PlatformPort } from '@shared/platform/types'
import { renderWithI18n } from '@renderer/i18n/testing'
import type { XlsxSessionView } from '@renderer/workbench/session'
import { XlsxCompareView } from './XlsxCompareView'

installJsdomViewport()
afterEach(cleanup)

function meta(over: Partial<XlsxTableMeta> = {}): XlsxTableMeta {
  return {
    sheetName: 'Main',
    sheetNames: ['Main'],
    headerRow: 1,
    date1904: false,
    uncachedFormulaCells: 0,
    hiddenRows: [],
    hiddenColumns: [],
    hiddenColumnIndexes: [],
    mergedRanges: [],
    warnings: [],
    ...over
  }
}

function view(): XlsxSessionView {
  return {
    budget: { tabCount: 1, mode: 'dense' },
    leftOnly: ['OnlyLeft'],
    rightOnly: ['Extra'],
    sheets: [
      {
        name: 'Main',
        left: {
          table: { header: ['id', 'v', 'note'], rows: [['k1', 'a', 'x'], ['k2', 'b', 'y']] },
          meta: meta({ uncachedFormulaCells: 2, hiddenRows: [3], hiddenColumns: ['C'], hiddenColumnIndexes: [2] })
        },
        right: { table: { header: ['id', 'v', 'note'], rows: [['k1', 'a', 'x'], ['k2', 'B', 'y']] }, meta: meta({ hiddenRows: [3], hiddenColumns: ['C'], hiddenColumnIndexes: [2] }) }
      },
      {
        name: 'Data',
        left: { table: { header: ['id'], rows: [['a']] }, meta: meta({ sheetName: 'Data' }) },
        right: { table: { header: ['id'], rows: [['a'], ['b']] }, meta: meta({ sheetName: 'Data' }) }
      }
    ]
  }
}

describe('XlsxCompareView parse summary', () => {
  it('reports uncached formulas, hidden counts and recomputes on the switch without rereading', () => {
    renderWithI18n(<XlsxCompareView sessionId="s1" xlsx={view()} leftPath="/l.xlsx" rightPath="/r.xlsx" />)

    expect(screen.getByText('2 个公式无缓存值，按空比较')).toBeTruthy()
    expect(screen.getByText('隐藏行 2 · 隐藏列 2（默认参与比较）')).toBeTruthy()
    expect(screen.getByText('相同 1 · 新增 0 · 删除 0 · 修改 1')).toBeTruthy()
    expect(screen.getByText('仅左有：OnlyLeft')).toBeTruthy()
    expect(screen.getByText('仅右有：Extra')).toBeTruthy()
    expect(screen.getByText('b → B')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '忽略隐藏行列' }))
    expect(screen.getByText('相同 1 · 新增 0 · 删除 0 · 修改 0')).toBeTruthy()
  })

  it('renders one independent result per selected sheet and never merges them', () => {
    renderWithI18n(<XlsxCompareView sessionId="s1" xlsx={view()} leftPath="/l.xlsx" rightPath="/r.xlsx" />)

    fireEvent.click(screen.getByRole('button', { name: 'Data' }))

    expect(screen.getByText(/^Main · /)).toBeTruthy()
    expect(screen.getByText(/^Data · /)).toBeTruthy()
    // Data has an added row of its own; Main keeps its modified row.
    expect(screen.getByText('相同 1 · 新增 1 · 删除 0 · 修改 0')).toBeTruthy()
    expect(screen.getByText('相同 1 · 新增 0 · 删除 0 · 修改 1')).toBeTruthy()
  })
})

/** Zip whose central directory declares one entry above the single-entry cap. */
function oversizeWorkbook(): Uint8Array {
  const name = Buffer.from('xl/worksheets/sheet1.xml')
  const payload = Buffer.alloc(1024)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt32LE(payload.length, 18)
  local.writeUInt32LE(257 * 1024 * 1024, 22)
  local.writeUInt16LE(name.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt32LE(payload.length, 20)
  central.writeUInt32LE(257 * 1024 * 1024, 24)
  central.writeUInt16LE(name.length, 28)
  const centralBytes = Buffer.concat([central, name])
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(1, 8)
  eocd.writeUInt16LE(1, 10)
  eocd.writeUInt32LE(centralBytes.length, 12)
  eocd.writeUInt32LE(local.length + name.length + payload.length, 16)
  return new Uint8Array(Buffer.concat([local, name, payload, centralBytes, eocd]))
}

describe('xlsx rejection reaches the UI', () => {
  it('shows the readable limit copy, creates no tab and keeps the open session', async () => {
    const base = createWebPlatformPort()
    await base.writeTextFile('/a.csv', 'id,v\n1,x\n')
    await base.writeTextFile('/b.csv', 'id,v\n1,x\n')
    const port = { ...base, resolveDroppedPath: async (file: File) => `/${file.name}`, readFileBytes: async () => oversizeWorkbook() } as PlatformPort
    mountWorkbench(scriptedPort({ files: ['/a.csv', '/b.csv'], dropped: ['/x.xlsx', '/y.xlsx'] }, port))

    fireEvent.click(screen.getAllByRole('button', { name: '打开文件' })[0])
    await screen.findByRole('tab', { name: /a\.csv/ })
    expect(sessionTabCount()).toBe(1)

    dropPaths(screen.getByRole('main'), ['/x.xlsx', '/y.xlsx'])

    const alert = await screen.findByRole('alert')
    expect(alert.textContent ?? '').toContain('文件超出对比上限：')
    await waitFor(() => expect(sessionTabCount()).toBe(1))
    expect(screen.getByRole('tab', { name: /a\.csv/ })).toBeTruthy()
  })
})
