// @vitest-environment jsdom
import { fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CSV_SCENE } from '@shared/fixtures'
import { createWebPlatformPort } from './web-platform'

/** The hidden `<input type="file">` the web picker appends while it is open. */
function pickerInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[data-opencompare-picker="file"]')
  if (!input) throw new Error('no picker input was created')
  return input
}

// Saving triggers a real browser download; jsdom would try to navigate to the
// blob URL, so the blob plumbing is stubbed while the click is still recorded.
const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:mock')
const revokeObjectURL = vi.fn<(url: string) => void>(() => undefined)

beforeEach(() => {
  URL.createObjectURL = createObjectURL
  URL.revokeObjectURL = revokeObjectURL
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
})

describe('web PlatformPort', () => {
  it('serves the built-in sample library from the in-memory file system', async () => {
    const platform = createWebPlatformPort()

    expect(await platform.exists(CSV_SCENE.left.path)).toBe(true)
    expect(await platform.readTextFile(CSV_SCENE.left.path)).toBe(CSV_SCENE.left.text)

    const entries = await platform.listDirectory('/samples/csv')
    expect(entries.map((entry) => entry.name).sort()).toEqual([
      'orders.left.csv',
      'orders.right.tsv'
    ])
    expect(entries.every((entry) => entry.isDirectory === false)).toBe(true)
  })

  it('mirrors nested sample directories', async () => {
    const platform = createWebPlatformPort()

    const core = await platform.listDirectory('/samples/directory/baseline/src/core')
    expect(core.map((entry) => entry.name)).toContain('engine.ts')
    expect(await platform.readTextFile('/samples/directory/baseline/src/core/engine.ts')).toContain(
      'createEngine'
    )
  })

  it('keeps user writes inside the memory sandbox', async () => {
    const platform = createWebPlatformPort()

    await platform.writeTextFile('/memory/note.txt', 'hello')

    expect(await platform.readTextFile('/memory/note.txt')).toBe('hello')
  })
})

describe('web file dialogs', () => {
  it('materialises a picked file into the memory file system', async () => {
    const platform = createWebPlatformPort()
    const selected = platform.selectFile({
      title: '打开本地文件',
      filters: [{ name: '文本', extensions: ['txt'] }]
    })

    const input = pickerInput()
    expect(input.accept).toBe('.txt')
    fireEvent.change(input, {
      target: { files: [new File(['hello'], 'note.txt', { type: 'text/plain' })] }
    })

    await expect(selected).resolves.toBe('/memory/note.txt')
    expect(await platform.readTextFile('/memory/note.txt')).toBe('hello')
  })

  it('resolves null when the picker is dismissed', async () => {
    const platform = createWebPlatformPort()
    const selected = platform.selectFile({ title: '打开本地文件' })

    pickerInput().dispatchEvent(new Event('cancel'))

    await expect(selected).resolves.toBeNull()
  })

  it('writes a saved body into the memory file system and rejects the read-only mount', async () => {
    const platform = createWebPlatformPort()

    await expect(
      platform.saveFile({ title: '保存', defaultPath: 'merged.txt', content: 'merged\n' })
    ).resolves.toBe('/memory/merged.txt')
    expect(await platform.readTextFile('/memory/merged.txt')).toBe('merged\n')
    // The browser preview also offers the body as a real download.
    expect(createObjectURL).toHaveBeenCalled()

    await expect(
      platform.saveFile({ defaultPath: '/samples/out.txt', content: 'nope' })
    ).rejects.toThrow(/只读/)
  })
})
