// @vitest-environment jsdom
import { fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { CSV_SCENE } from '@shared/fixtures'
import { sha256Hex } from '@core/directory/hash'
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

  it('lists several directories in one input-ordered batch, sample mount included', async () => {
    const platform = createWebPlatformPort()
    const directory = '/samples/directory/baseline'
    const missing = '/samples/missing-directory'

    const listings = await platform.listDirectories([directory, missing, '/samples/csv'])

    expect(listings.map((listing) => listing.path)).toEqual([
      directory,
      missing,
      '/samples/csv'
    ])
    expect(listings.map((listing) => listing.ok)).toEqual([true, false, true])

    const [sampleSlot, missingSlot] = listings
    if (!sampleSlot.ok) throw new Error('expected the sample directory to list')
    expect(sampleSlot.entries).toEqual(await platform.listDirectory(directory))

    expect(missingSlot.ok).toBe(false)
    if (!missingSlot.ok) {
      expect(missingSlot.reason).toContain('无法读取目录')
      expect(missingSlot.reason).toContain(missing)
    }
  })

  it('keeps user writes inside the memory sandbox', async () => {
    const platform = createWebPlatformPort()

    await platform.writeTextFile('/memory/note.txt', 'hello')

    expect(await platform.readTextFile('/memory/note.txt')).toBe('hello')
  })
})

describe('web byte digest', () => {
  it('digests sample text with the same sha256 the main process produces', async () => {
    const platform = createWebPlatformPort()
    const sample = CSV_SCENE.left
    const encoder = new TextEncoder()

    const digests = await platform.digestFiles([
      sample.path,
      '/samples/missing.txt',
      '/samples/csv'
    ])

    // One result per path, in input order.
    expect(digests).toHaveLength(3)
    expect(digests[0]).toMatchObject({
      path: sample.path,
      ok: true,
      sha256: sha256Hex(sample.text),
      bytes: encoder.encode(sample.text).length
    })
    expect(digests[0].ok && digests[0].sha256).toBe(
      createHash('sha256').update(sample.text, 'utf8').digest('hex')
    )
    for (const digest of digests.slice(1)) {
      expect(digest.ok).toBe(false)
      if (!digest.ok) expect(digest.reason).toContain('无法读取文件')
    }
  })

  it('hashes BOM and multibyte text by its UTF-8 bytes', async () => {
    const platform = createWebPlatformPort()
    const encoder = new TextEncoder()
    const samples = ['中文🙂', '\ufeffbom', 'abc', '']

    for (const [index, text] of samples.entries()) {
      const path = `/memory/digest-${index}.txt`
      await platform.writeTextFile(path, text)
      const [digest] = await platform.digestFiles([path])
      expect(digest).toMatchObject({
        ok: true,
        sha256: sha256Hex(text),
        bytes: encoder.encode(text).length
      })
    }
  })
})

describe('web path probe', () => {
  it('exposes fixed home and working directories inside the sandbox', async () => {
    const platform = createWebPlatformPort()

    await expect(platform.homeDirectory()).resolves.toBe('/memory')
    await expect(platform.workingDirectory()).resolves.toBe('/memory')
  })

  it('reports the same file/directory/missing semantics as the Electron port', async () => {
    const platform = createWebPlatformPort()

    expect(await platform.statPath('/samples')).toBe('directory')
    expect(await platform.statPath('/samples/csv/orders.left.csv')).toBe('file')
    expect(await platform.statPath('/samples/does-not-exist.txt')).toBe('missing')

    await platform.writeTextFile('/memory/probe.txt', 'hello')
    expect(await platform.statPath('/memory/probe.txt')).toBe('file')
    expect(await platform.statPath('/memory/absent.txt')).toBe('missing')
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

  it('materialises a dropped file into the memory file system', async () => {
    const platform = createWebPlatformPort()

    const path = await platform.resolveDroppedPath(new File(['dropped'], 'note.txt'))

    expect(path).toBe('/memory/note.txt')
    expect(await platform.readTextFile('/memory/note.txt')).toBe('dropped')
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

describe('web launch request parity', () => {
  it('exposes the same inert stream the Electron bridge exposes', async () => {
    const platform = createWebPlatformPort()
    const listener = vi.fn()

    const unsubscribe = platform.onCompareRequest?.(listener)
    expect(typeof unsubscribe).toBe('function')
    expect(() => unsubscribe?.()).not.toThrow()
    expect(listener).not.toHaveBeenCalled()

    await expect(platform.compareRequestsReady?.()).resolves.toBeUndefined()
  })
})
