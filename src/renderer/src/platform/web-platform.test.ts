import { describe, expect, it } from 'vitest'
import { CSV_SCENE } from '@shared/fixtures'
import { createWebPlatformPort } from './web-platform'

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
