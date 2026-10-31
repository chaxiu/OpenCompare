// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DIRECTORY_SAMPLE_PATHS } from '@shared/fixtures'
import type { SnapshotDocument } from '@shared/snapshot'
import { SNAPSHOT_SCHEMA } from '@shared/snapshot'
import type { PlatformPort, SaveFileOptions } from '@shared/platform/types'
import { createComparisonCache } from '@core/directory/compare'
import { serializeSnapshot } from '@core/directory/snapshot'
import { sha256Hex } from '@core/directory/hash'
import { App } from './App'
import { renderWithI18n } from './i18n/testing'
import { en, zh } from './i18n/messages'
import { createWebPlatformPort } from './platform/web-platform'
import { Workbench } from './workbench/Workbench'
import {
  compareSides,
  exportSideSnapshot,
  parseSnapshotText,
  remoteSnapshotSides
} from './workbench/snapshotOps'

const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:mock')
const revokeObjectURL = vi.fn<(url: string) => void>(() => undefined)

beforeEach(() => {
  localStorage.setItem('opencompare.userSettings', JSON.stringify({ language: 'zh' }))
  URL.createObjectURL = createObjectURL
  URL.revokeObjectURL = revokeObjectURL
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
})

/**
 * jsdom reports zero-sized elements, which would give the virtualised tree no
 * viewport at all. A fixed 1200×640 client box stands in for the real panel.
 */
const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 1200
  })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 640
  })
})

afterAll(() => {
  if (originalWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalWidth)
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
  if (originalHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalHeight)
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight')
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
})

/** Opens one settings sample entry in the language the renderer is using. */
function startSample(id: string): void {
  fireEvent.click(screen.getByRole('button', { name: /^(Open settings|打开设置)$/ }))
  const panel = screen.getByRole('dialog', { name: /^(Settings|设置)$/ })
  const entry = panel.querySelector(`[data-sample-entry="${id}"]`)
  if (!(entry instanceof HTMLElement)) throw new Error(`missing sample entry: ${id}`)
  fireEvent.click(entry)
}

/** Opens the built-in directory scene and waits for its session. */
async function loadWorkbench(): Promise<void> {
  render(<App />)
  await screen.findByRole('button', { name: /^(Open settings|打开设置)$/ })
  startSample('directory')
  await screen.findByRole('tab', { name: /baseline ↔ candidate/ }, { timeout: 4000 })
}

function selectedFileInto(label: string, file: File): void {
  fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } })
}

describe('snapshot workbench integration', () => {
  it('loads the remote snapshot sample with a snapshot-labelled right pane and four statuses', async () => {
    await loadWorkbench()

    startSample('remote-snapshot')

    expect(await screen.findByText('/snapshots/right/remote-prod')).toBeDefined()
    expect(screen.getAllByText('remote-prod').length).toBeGreaterThan(0)
    expect(screen.getAllByText('快照').length).toBeGreaterThan(0)

    const comparison = await compareSides(
      createWebPlatformPort(),
      remoteSnapshotSides(),
      createComparisonCache()
    )
    for (const status of ['same', 'added', 'removed', 'modified'] as const) {
      expect(comparison.counts[status]).toBeGreaterThan(0)
    }

    const statusBar = screen.getByRole('contentinfo').textContent ?? ''
    expect(statusBar).toContain(
      `${comparison.counts.same}相同${comparison.counts.added}新增${comparison.counts.removed}删除${comparison.counts.modified}修改`
    )
  })

  it('filters a snapshot comparison by status', async () => {
    await loadWorkbench()
    startSample('remote-snapshot')
    await screen.findByText('/snapshots/right/remote-prod')

    fireEvent.click(screen.getByRole('tab', { name: '仅差异' }))
    expect(screen.queryByText('parser.ts')).toBeNull()
    expect(screen.getAllByText('engine.ts').length).toBe(2)

    fireEvent.click(screen.getByRole('tab', { name: '右独有' }))
    expect(screen.getAllByText('worker.ts').length).toBe(1)
    expect(screen.queryByText('engine.ts')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: '相同' }))
    expect(screen.getAllByText('parser.ts').length).toBe(2)
    expect(screen.queryByText('engine.ts')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: '全部' }))
    expect(screen.getAllByText('engine.ts').length).toBe(2)
  })

  it('drills snapshot files into code, CSV and structured views pointing at the mount', async () => {
    await loadWorkbench()
    startSample('remote-snapshot')
    await screen.findByText('/snapshots/right/remote-prod')
    fireEvent.click(screen.getByRole('tab', { name: '仅差异' }))

    fireEvent.doubleClick(screen.getAllByText('engine.ts')[0])
    expect(
      await screen.findByRole('tab', {
        name: /\/snapshots\/right\/remote-prod\/src\/core\/engine\.ts/
      })
    ).toBeDefined()
    expect(screen.getByText(/本地文件 · 双栏字符级 Diff/)).toBeDefined()

    fireEvent.click(
      within(screen.getByRole('tablist', { name: '会话' })).getByRole('tab', {
        name: /baseline ↔ remote-prod/
      })
    )
    // The snapshot tab kept its tree while inactive; switching back remounts it.
    await waitFor(() => expect(screen.getAllByText('report.csv').length).toBeGreaterThan(0))
    fireEvent.doubleClick(screen.getAllByText('report.csv')[0])
    expect(
      await screen.findByRole('tab', {
        name: /\/snapshots\/right\/remote-prod\/src\/data\/report\.csv/
      })
    ).toBeDefined()

    fireEvent.click(
      within(screen.getByRole('tablist', { name: '会话' })).getByRole('tab', {
        name: /baseline ↔ remote-prod/
      })
    )
    await waitFor(() => expect(screen.getAllByText('deploy.yaml').length).toBeGreaterThan(0))
    fireEvent.doubleClick(screen.getAllByText('deploy.yaml')[0])
    expect(
      await screen.findByRole('tab', {
        name: /\/snapshots\/right\/remote-prod\/config\/deploy\.yaml/
      })
    ).toBeDefined()
    expect(screen.getByText(/YAML 原文/)).toBeDefined()
  })

  it('exports the left directory side as an .ocsnap.json file through the save dialog', async () => {
    const base = createWebPlatformPort()
    const saved: SaveFileOptions[] = []
    const port: PlatformPort = {
      ...base,
      saveFile: async (options) => {
        saved.push(options)
        return base.saveFile(options)
      }
    }

    render(<Workbench platform={port} />)
    startSample('directory')
    await screen.findByRole('tab', { name: /baseline ↔ candidate/ }, { timeout: 4000 })

    fireEvent.click(screen.getByRole('button', { name: '导出左侧快照' }))

    expect(
      await screen.findByText(/已导出到 \/memory\/baseline\.ocsnap\.json（15 个文件）/)
    ).toBeDefined()
    expect(saved[0].defaultPath).toBe('baseline.ocsnap.json')
    expect(saved[0].filters?.[0]?.extensions).toContain('ocsnap.json')

    // The saved artifact round-trips: the dialog wrote the canonical snapshot text.
    const snapshot = parseSnapshotText(await base.readTextFile('/memory/baseline.ocsnap.json'))
    expect(snapshot.name).toBe('baseline')
    expect(snapshot.entries).toHaveLength(15)
    expect(snapshot.entries.find((entry) => entry.path === 'src/core/engine.ts')?.content).toBeDefined()
    expect(snapshot.entries.find((entry) => entry.path === 'assets/logo.png')?.content).toBeUndefined()
  })

  it('keeps the comparison untouched when the snapshot save dialog is cancelled', async () => {
    const base = createWebPlatformPort()
    const port: PlatformPort = { ...base, saveFile: async () => null }

    render(<Workbench platform={port} />)
    startSample('directory')
    await screen.findByRole('tab', { name: /baseline ↔ candidate/ }, { timeout: 4000 })
    const before = screen.getByRole('contentinfo').textContent

    fireEvent.click(screen.getByRole('button', { name: '导出左侧快照' }))

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.getByRole('contentinfo').textContent).toBe(before)
    await expect(base.exists('/memory/baseline.ocsnap.json')).resolves.toBe(false)
  })

  it('mounts an imported snapshot on the right and reaches an all-same comparison', async () => {
    const exported = await exportSideSnapshot(createWebPlatformPort(), {
      kind: 'directory',
      path: DIRECTORY_SAMPLE_PATHS.left
    })

    await loadWorkbench()
    selectedFileInto(
      '选择右侧快照文件',
      new File([exported.text], 'baseline.ocsnap.json', { type: 'application/json' })
    )

    expect(await screen.findByText('/snapshots/right/baseline')).toBeDefined()
    expect(await screen.findByText(/已挂载快照 baseline/)).toBeDefined()
    expect(screen.getByRole('contentinfo').textContent).toContain('15相同0新增0删除0修改')

    fireEvent.click(screen.getByRole('tab', { name: '仅差异' }))
    expect(screen.getAllByText(/当前过滤下/).length).toBe(2)
  })

  it('rejects a non-snapshot file and keeps the current comparison', async () => {
    await loadWorkbench()
    startSample('remote-snapshot')
    await screen.findByText('/snapshots/right/remote-prod')
    const before = screen.getByRole('contentinfo').textContent ?? ''

    selectedFileInto(
      '选择左侧快照文件',
      new File(['{"a":1}'], 'broken.json', { type: 'application/json' })
    )

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('快照导入失败')
    expect(screen.getByText('/samples/directory/baseline')).toBeDefined()
    expect(screen.getByText('/snapshots/right/remote-prod')).toBeDefined()
    expect(screen.getByRole('contentinfo').textContent).toBe(before)
  })

  it('hints when a snapshot did not inline the file content', async () => {
    const document: SnapshotDocument = {
      schema: SNAPSHOT_SCHEMA,
      name: 'meta-only',
      exportedAt: '2026-10-17T00:00:00.000Z',
      entries: [{ path: 'src/notes.ts', size: 3, modifiedMs: 0, sha256: sha256Hex('abc') }]
    }

    await loadWorkbench()
    selectedFileInto(
      '选择右侧快照文件',
      new File([serializeSnapshot(document)], 'meta-only.ocsnap.json', { type: 'application/json' })
    )
    await screen.findByText('/snapshots/right/meta-only')

    fireEvent.doubleClick(screen.getAllByText('notes.ts')[0])

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('未内联')
    })
    // No empty drilldown session replaced the comparison.
    expect(screen.getByRole('contentinfo').textContent).toContain('/snapshots/right/meta-only')
  })
})

describe('snapshot failure copy', () => {
  it('renders every known import failure in English', async () => {
    renderWithI18n(<Workbench platform={createWebPlatformPort()} />, 'en')
    startSample('directory')
    await screen.findByRole('tablist', { name: 'Sessions' }, { timeout: 4000 })

    const hash = 'a'.repeat(64)
    const base = {
      schema: SNAPSHOT_SCHEMA,
      name: 'broken',
      exportedAt: '2026-10-17T00:00:00.000Z'
    }
    const entry = (path: string, sha256 = hash) => ({ path, size: 0, modifiedMs: 0, sha256 })
    const cases = [
      { file: 'not-json.json', text: 'nope', copy: en['shell.snapshot.error.invalid-json'] },
      { file: 'schema.json', text: '{"a":1}', copy: en['shell.snapshot.error.invalid-schema'] },
      {
        file: 'metadata.json',
        text: JSON.stringify({ schema: SNAPSHOT_SCHEMA, entries: [] }),
        copy: en['shell.snapshot.error.invalid-metadata']
      },
      {
        file: 'entry.json',
        text: JSON.stringify({ ...base, entries: {} }),
        copy: en['shell.snapshot.error.invalid-entry']
      },
      {
        file: 'path.json',
        text: JSON.stringify({ ...base, entries: [entry('/abs')] }),
        copy: en['shell.snapshot.error.invalid-pathWithPath'].replace('{path}', '/abs')
      },
      {
        file: 'duplicate.json',
        text: JSON.stringify({ ...base, entries: [entry('a.txt'), entry('a.txt')] }),
        copy: en['shell.snapshot.error.duplicate-path'].replace('{path}', 'a.txt')
      },
      {
        file: 'hash.json',
        text: JSON.stringify({ ...base, entries: [entry('a.txt', 'bad')] }),
        copy: en['shell.snapshot.error.invalid-hash'].replace('{path}', 'a.txt')
      }
    ]

    for (const testCase of cases) {
      selectedFileInto('Choose left snapshot file', new File([testCase.text], testCase.file))
      await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(testCase.copy))
      expect(screen.getByRole('alert').textContent ?? '').not.toMatch(/\p{Script=Han}/u)
    }
  })

  it('localizes a snapshot body that was not inlined in English', async () => {
    const document: SnapshotDocument = {
      schema: SNAPSHOT_SCHEMA,
      name: 'meta-only',
      exportedAt: '2026-10-17T00:00:00.000Z',
      entries: [{ path: 'src/notes.ts', size: 3, modifiedMs: 0, sha256: sha256Hex('abc') }]
    }

    renderWithI18n(<Workbench platform={createWebPlatformPort()} />, 'en')
    startSample('directory')
    await screen.findByRole('tablist', { name: 'Sessions' }, { timeout: 4000 })
    selectedFileInto(
      'Choose right snapshot file',
      new File([serializeSnapshot(document)], 'meta-only.ocsnap.json')
    )
    await screen.findByText('/snapshots/right/meta-only')

    fireEvent.doubleClick(screen.getAllByText('notes.ts')[0])
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        en['shell.snapshot.error.content-not-inlined'].replace('{path}', 'src/notes.ts')
      )
    )
  })

  it('re-translates an on-screen import failure when the language switches', async () => {
    renderWithI18n(<Workbench platform={createWebPlatformPort()} />, 'zh')
    startSample('directory')
    await screen.findByRole('tablist', { name: '会话' }, { timeout: 4000 })

    selectedFileInto('选择左侧快照文件', new File(['{"a":1}'], 'broken.json'))
    expect((await screen.findByRole('alert')).textContent).toBe(
      zh['shell.snapshot.error.invalid-schema']
    )

    fireEvent.click(screen.getByRole('button', { name: '打开设置' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('tab', { name: 'English' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        en['shell.snapshot.error.invalid-schema']
      )
    )
  })
})
