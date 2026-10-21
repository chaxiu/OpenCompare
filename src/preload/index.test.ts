// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { CompareRequestPayload } from '@shared/compareRequest'
import { PLATFORM_CHANNELS } from '@shared/platform/channels'
import type { PlatformPort } from '@shared/platform/types'

const { exposures, on, removeListener, invoke } = vi.hoisted(() => ({
  exposures: [] as Array<{ key: string; value: unknown }>,
  on: vi.fn(),
  removeListener: vi.fn(),
  invoke: vi.fn(async () => undefined)
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, value: unknown) => {
      exposures.push({ key, value })
      ;(window as unknown as Record<string, unknown>)[key] = value
    }
  },
  ipcRenderer: { on, removeListener, invoke },
  webUtils: { getPathForFile: () => '' }
}))

// Imported after the Electron mock is in place: the preload script runs once.
import './index'

const platform = window.openComparePlatform as PlatformPort

describe('preload bridge', () => {
  it('exposes the platform port under the single whitelisted world key', () => {
    expect(exposures).toHaveLength(1)
    expect(exposures[0]?.key).toBe('openComparePlatform')
    expect(exposures[0]?.value).toBe(platform)
  })

  it('carries the PlatformPort surface plus the two launch capabilities', () => {
    expect(Object.keys(platform).sort()).toEqual(
      [
        'kind',
        'homeDirectory',
        'workingDirectory',
        'selectDirectory',
        'selectFile',
        'resolveDroppedPath',
        'saveFile',
        'listDirectory',
        'listDirectories',
        'readTextFile',
        'digestFiles',
        'cancelOperation',
        'writeTextFile',
        'exists',
        'statPath',
        'ensureDirectory',
        'deleteFile',
        'temporaryDirectory',
        'onCompareRequest',
        'compareRequestsReady'
      ].sort()
    )
  })

  it('forwards metric and cancellation capabilities over their whitelisted channels', async () => {
    await platform.digestFiles(['/tmp/a.bin'], { operationId: 'directory-1' })
    expect(invoke).toHaveBeenLastCalledWith(PLATFORM_CHANNELS.digestFiles, ['/tmp/a.bin'], {
      operationId: 'directory-1'
    })

    await platform.cancelOperation('directory-1')
    expect(invoke).toHaveBeenLastCalledWith(PLATFORM_CHANNELS.cancelOperation, 'directory-1')
    expect(PLATFORM_CHANNELS.cancelOperation).toBe('platform:cancel-operation')
  })

  it('keeps the renderer on PlatformPort instead of Electron or Node I/O', () => {
    function collect(directory: string): string[] {
      return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) return collect(path)
        if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) return []
        return [path]
      })
    }

    for (const file of collect(join(process.cwd(), 'src/renderer'))) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).not.toMatch(/from ['"]electron['"]/)
      expect(source, file).not.toMatch(/from ['"]node:(fs|crypto)['"]/)
    }
  })

  it('never leaks Node or the raw ipcRenderer onto the window', () => {
    expect('ipcRenderer' in window).toBe(false)
    expect('require' in window).toBe(false)
    expect(Object.keys(platform)).not.toContain('process')

    // jsdom injects a node `process` of its own; the real window has none
    // because the renderer keeps node integration off inside the sandbox.
    const mainSource = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')
    expect(mainSource).toMatch(/contextIsolation:\s*true/)
    expect(mainSource).toMatch(/nodeIntegration:\s*false/)
    expect(mainSource).toMatch(/sandbox:\s*true/)
  })
})

describe('launch request stream', () => {
  it('forwards payloads only after subscribing and releases the listener', () => {
    const listener = vi.fn<(payload: CompareRequestPayload) => void>()
    const unsubscribe = platform.onCompareRequest?.(listener)

    expect(on).toHaveBeenCalledWith(PLATFORM_CHANNELS.compareRequest, expect.any(Function))
    const forward = on.mock.calls[0]?.[1] as (
      event: unknown,
      payload: CompareRequestPayload
    ) => void
    expect(listener).not.toHaveBeenCalled()

    const payload: CompareRequestPayload = { ok: false, message: '右侧路径不存在：/nope' }
    forward({}, payload)
    expect(listener).toHaveBeenCalledWith(payload)

    unsubscribe?.()
    expect(removeListener).toHaveBeenCalledWith(PLATFORM_CHANNELS.compareRequest, forward)
  })

  it('signals readiness over the whitelisted invoke channel', async () => {
    await platform.compareRequestsReady?.()

    expect(invoke).toHaveBeenCalledWith(PLATFORM_CHANNELS.compareRequestsReady)
  })
})
