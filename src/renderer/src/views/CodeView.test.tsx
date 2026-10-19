// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CodeSceneFixture } from '@shared/fixtures'
import type { PlatformPort } from '@shared/platform/types'
import { createWebPlatformPort } from '@renderer/platform/web-platform'
import { CodeView } from './CodeView'
import type { CodeMergeState } from './CodeView'

// Saving also triggers a browser download; jsdom must not try to navigate.
beforeEach(() => {
  URL.createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:mock')
  URL.revokeObjectURL = vi.fn<(url: string) => void>(() => undefined)
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const platform = createWebPlatformPort()

/** Drives the web runtime's hidden file picker with a chosen local file. */
function chooseFile(name: string, text: string): void {
  const input = document.querySelector<HTMLInputElement>('input[data-opencompare-picker="file"]')
  if (!input) throw new Error('no open-file input was created')
  fireEvent.change(input, { target: { files: [new File([text], name, { type: 'text/plain' })] } })
}

const FIXTURE: CodeSceneFixture = {
  scene: 'code',
  composition: { same: 0, added: 0, removed: 0, modified: 0, conflict: 2 },
  diff: {
    left: { path: '/samples/left.ts', text: 'alpha\n  color: red\nbeta\n' },
    right: { path: '/samples/right.ts', text: 'alpha\n  color: RED\nbeta\ngamma\n' }
  },
  merge: {
    base: { path: '/samples/base.ts', text: 'head\nbase-1\nmid\nbase-2\ntail\n' },
    ours: { path: '/samples/ours.ts', text: 'head\nours-1\nmid\nours-2\ntail\n' },
    theirs: { path: '/samples/theirs.ts', text: 'head\ntheirs-1\nmid\ntheirs-2\ntail\n' }
  }
}

describe('two-column diff', () => {
  it('highlights inline characters, navigates blocks and overwrites one side', () => {
    render(<CodeView fixture={FIXTURE} defaultMode="diff" platform={platform} />)

    expect(screen.getByText('1/2')).toBeDefined()
    // only the changed fragment is coloured, not the whole line
    expect(screen.getByText('red')).toBeDefined()
    expect(screen.getByText('RED')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: '下一个差异块' }))
    expect(screen.getByText('2/2')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '下一个差异块' }))
    expect(screen.getByText('1/2')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: '覆写到右' }))
    expect(screen.getByText('1/1')).toBeDefined()
    expect(screen.queryByText('red')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '重置' }))
    expect(screen.getByText('1/2')).toBeDefined()
    expect(screen.getByText('red')).toBeDefined()
  })
})

describe('three-way merge', () => {
  it('counts conflicts, resolves block by block and unlocks export', () => {
    render(<CodeView fixture={FIXTURE} defaultMode="merge" platform={platform} />)

    expect(screen.getByText('2/2')).toBeDefined()
    expect(screen.getAllByText('<<<<<<< ours')).toHaveLength(2)
    expect((screen.getByRole('button', { name: /导出合并文本/ }) as HTMLButtonElement).disabled).toBe(
      true
    )

    // Accept Both on the first conflict
    fireEvent.click(screen.getAllByRole('button', { name: 'Accept Both' })[0])
    expect(screen.getByText('1/2')).toBeDefined()
    expect(screen.getByText('已采纳 ours + theirs')).toBeDefined()

    // Navigate to the second conflict and resolve it to ours
    fireEvent.click(screen.getByRole('button', { name: '下一个冲突块' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Accept Ours' })[0])
    expect(screen.getByText('0/2')).toBeDefined()
    expect(screen.getByText('已采纳 ours')).toBeDefined()
    expect(screen.queryAllByText('<<<<<<< ours')).toHaveLength(0)
    expect(
      (screen.getByRole('button', { name: /导出合并文本/ }) as HTMLButtonElement).disabled
    ).toBe(false)
  })

  it('reports the runtime conflict count to the workbench', () => {
    const states: CodeMergeState[] = []
    render(
      <CodeView
        fixture={FIXTURE}
        defaultMode="merge"
        platform={platform}
        onMergeStateChange={(state) => states.push(state)}
      />
    )

    expect(states.at(-1)).toEqual({ unresolved: 2, total: 2 })
    fireEvent.click(screen.getAllByRole('button', { name: 'Accept Ours' })[0])
    expect(states.at(-1)).toEqual({ unresolved: 1, total: 2 })
  })
})

describe('local file entry points', () => {
  it('opens a local file on one diff side and re-runs the comparison', async () => {
    render(<CodeView fixture={FIXTURE} defaultMode="diff" platform={platform} />)
    expect(screen.getByText('1/2')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: '打开左文件' }))
    chooseFile('left.ts', FIXTURE.diff.right.text)

    // Identical bodies: the difference blocks collapse and the panel follows the path.
    await waitFor(() => expect(screen.getByText('0/0')).toBeDefined())
    expect(screen.getByText('/memory/left.ts')).toBeDefined()
    expect(await screen.findByText(/已打开 \/memory\/left\.ts/)).toBeDefined()
  })

  it('opens a local file into a merge side and rebuilds the conflict list', async () => {
    render(<CodeView fixture={FIXTURE} defaultMode="merge" platform={platform} />)
    expect(screen.getByText('2/2')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: '打开 ours' }))
    chooseFile('ours.ts', FIXTURE.merge.base.text)

    // ours now matches base, so only theirs changes and nothing stays in conflict.
    await waitFor(() => expect(screen.getByText('0/0')).toBeDefined())
    expect(screen.getByText('/memory/ours.ts')).toBeDefined()
    expect(await screen.findByText('无冲突块。')).toBeDefined()
  })

  it('saves the resolved merge result through the platform file dialog', async () => {
    render(<CodeView fixture={FIXTURE} defaultMode="merge" platform={platform} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Accept Both' })[0])
    fireEvent.click(screen.getByRole('button', { name: '下一个冲突块' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Accept Ours' })[0])

    const exportButton = screen.getByRole('button', { name: /导出合并文本/ }) as HTMLButtonElement
    expect(exportButton.disabled).toBe(false)
    fireEvent.click(exportButton)

    expect(await screen.findByText(/已保存到 \/memory\/merged\.txt/)).toBeDefined()
    expect(await platform.readTextFile('/memory/merged.txt')).toContain('ours-1')
  })
})

describe('in-place save and dirty marker', () => {
  const PAIR = {
    left: { path: '/memory/left.ts', text: 'alpha\nbeta\n' },
    right: { path: '/memory/right.ts', text: 'alpha\ngamma\n' }
  }

  it('marks the overwritten side dirty and clears it on reset', () => {
    render(<CodeView pair={PAIR} platform={createWebPlatformPort()} />)

    expect(screen.queryByText('已修改（未保存）')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '覆写到右' }))

    expect(screen.getByText('未保存：右')).toBeDefined()
    expect(screen.getAllByText('已修改（未保存）')).toHaveLength(1)
    expect(screen.getByRole('button', { name: '保存右文件' }).hasAttribute('disabled')).toBe(false)
    expect(screen.getByRole('button', { name: '保存左文件' }).hasAttribute('disabled')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '重置' }))
    expect(screen.queryByText('未保存：右')).toBeNull()
    expect(screen.queryByText('已修改（未保存）')).toBeNull()
  })

  it('writes a modified side back in place without opening a save dialog', async () => {
    const base = createWebPlatformPort()
    const writes: { path: string; content: string }[] = []
    const saveFile = vi.fn(async () => '/should/not/be/used.txt')
    const port: PlatformPort = {
      ...base,
      saveFile,
      writeTextFile: async (path, content, modifiedMs) => {
        writes.push({ path, content })
        await base.writeTextFile(path, content, modifiedMs)
      }
    }
    render(<CodeView pair={PAIR} platform={port} />)

    fireEvent.click(screen.getByRole('button', { name: '覆写到右' }))
    fireEvent.click(screen.getByRole('button', { name: '保存右文件' }))

    expect(await screen.findByText(/已写回 \/memory\/right\.ts/)).toBeDefined()
    expect(writes).toEqual([{ path: '/memory/right.ts', content: 'alpha\nbeta\n' }])
    expect(saveFile).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByText('已修改（未保存）')).toBeNull())
    // Disk now holds exactly the modified working text at the loaded path.
    expect(await base.readTextFile('/memory/right.ts')).toBe('alpha\nbeta\n')
    expect(screen.getAllByText('/memory/right.ts').length).toBeGreaterThan(0)
  })

  it('writes the left side back to its loaded path', async () => {
    const base = createWebPlatformPort()
    const writes: { path: string; content: string }[] = []
    const saveFile = vi.fn(async () => '/should/not/be/used.txt')
    const port: PlatformPort = {
      ...base,
      saveFile,
      writeTextFile: async (path, content, modifiedMs) => {
        writes.push({ path, content })
        await base.writeTextFile(path, content, modifiedMs)
      }
    }
    render(<CodeView pair={PAIR} platform={port} />)

    fireEvent.click(screen.getByRole('button', { name: '覆写到左' }))
    fireEvent.click(screen.getByRole('button', { name: '保存左文件' }))

    expect(await screen.findByText(/已写回 \/memory\/left\.ts/)).toBeDefined()
    expect(writes).toEqual([{ path: '/memory/left.ts', content: 'alpha\ngamma\n' }])
    expect(saveFile).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByText('已修改（未保存）')).toBeNull())
    expect(await base.readTextFile('/memory/left.ts')).toBe('alpha\ngamma\n')
    expect(screen.getAllByText('/memory/left.ts').length).toBeGreaterThan(0)
  })

  it('reports a rejected write to a read-only sample path and keeps the dirty flag', async () => {
    const saveFile = vi.fn(async () => '/should/not/be/used.txt')
    render(
      <CodeView
        fixture={FIXTURE}
        defaultMode="diff"
        platform={{ ...createWebPlatformPort(), saveFile }}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '覆写到右' }))
    fireEvent.click(screen.getByRole('button', { name: '保存右文件' }))

    expect(await screen.findByText(/不能写入/)).toBeDefined()
    expect(screen.getByText('未保存：右')).toBeDefined()
    expect(saveFile).not.toHaveBeenCalled()
  })
})

