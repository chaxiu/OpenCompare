import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import type { CompareRequestPayload, PathProbe } from '../shared/compareRequest'
import { parseCompareArgv, parseCompareUrl, resolveCompareRequest } from '../shared/compareRequest'
import { startLaunch, stripLauncherPrefix } from './launch'
import type { LaunchBindings, LaunchWindow } from './launch'

// The single parsing entry point is asserted with spies below.
vi.mock('../shared/compareRequest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shared/compareRequest')>()
  return {
    ...actual,
    parseCompareArgv: vi.fn(actual.parseCompareArgv),
    parseCompareUrl: vi.fn(actual.parseCompareUrl),
    resolveCompareRequest: vi.fn(actual.resolveCompareRequest)
  }
})

const EXEC = '/opt/OpenCompare.app/Contents/MacOS/OpenCompare'
const APP_PATH = '/repo/opencompare'

interface WindowStub extends LaunchWindow {
  readonly calls: string[]
}

function windowStub(minimized = false): WindowStub {
  const calls: string[] = []
  return {
    calls,
    isMinimized: () => {
      calls.push('isMinimized')
      return minimized
    },
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    focus: () => calls.push('focus')
  }
}

function probeOf(entries: Record<string, 'file' | 'directory'> = {}): PathProbe {
  return { statPath: async (path) => entries[path] ?? 'missing' }
}

interface HarnessOptions {
  readonly argv?: readonly string[]
  readonly window?: LaunchWindow | null
  readonly minimized?: boolean
  readonly probe?: PathProbe
  readonly cwd?: string
  readonly lock?: boolean
  readonly isPackaged?: boolean
  readonly defaultApp?: boolean
  readonly appReady?: boolean
}

function harness(options: HarnessOptions = {}) {
  const sent: CompareRequestPayload[] = []
  const created = windowStub()
  const state: { window: LaunchWindow | null } = {
    window: options.window === undefined ? windowStub(options.minimized) : options.window
  }
  const bindings = {
    argv: options.argv ?? [],
    execPath: EXEC,
    appPath: APP_PATH,
    defaultApp: options.defaultApp ?? false,
    cwd: options.cwd ?? '/work',
    homeDir: '/home/tester',
    isPackaged: options.isPackaged ?? true,
    probe: options.probe ?? probeOf(),
    requestSingleInstanceLock: vi.fn(() => options.lock ?? true),
    setProtocolClient: vi.fn(() => true),
    registerIpc: vi.fn(),
    quit: vi.fn(),
    isReady: () => options.appReady ?? true,
    getWindow: () => state.window,
    createWindow: vi.fn(() => {
      state.window = created
    }),
    send: vi.fn((payload: CompareRequestPayload) => {
      sent.push(payload)
    })
  } satisfies LaunchBindings

  return { bindings, sent, state, created }
}

const FILE_PAIR = probeOf({ '/tmp/a.txt': 'file', '/tmp/b.txt': 'file' })

function expectRequest(payload: CompareRequestPayload | undefined): void {
  expect(payload?.ok).toBe(true)
  if (payload?.ok === true) {
    expect(payload.request).toEqual({ left: '/tmp/a.txt', right: '/tmp/b.txt', kind: 'file' })
  }
}

describe('single-instance rule', () => {
  it('quits without IPC or a window when another instance owns the lock', () => {
    const h = harness({ lock: false, window: null })

    expect(startLaunch(h.bindings)).toBeNull()
    expect(h.bindings.quit).toHaveBeenCalledTimes(1)
    expect(h.bindings.registerIpc).not.toHaveBeenCalled()
    expect(h.bindings.createWindow).not.toHaveBeenCalled()
    expect(h.bindings.setProtocolClient).not.toHaveBeenCalled()
  })

  it('registers IPC and creates the first window only once the lock is held', async () => {
    const h = harness({ window: null })

    const controller = startLaunch(h.bindings)
    expect(controller).not.toBeNull()
    expect(h.bindings.registerIpc).toHaveBeenCalledTimes(1)

    controller?.onAppReady()
    expect(h.bindings.createWindow).toHaveBeenCalledTimes(1)
    expect(h.state.window).toBe(h.created)
    await controller?.coldStart
  })
})

describe('second-instance takeover', () => {
  it('restores, shows and focuses the existing window instead of opening one', async () => {
    const h = harness({ probe: FILE_PAIR, minimized: true })
    const controller = startLaunch(h.bindings)

    await controller?.onSecondInstance(
      [EXEC, '--left', '/tmp/a.txt', '--right', '/tmp/b.txt'],
      '/elsewhere'
    )

    expect(h.bindings.createWindow).not.toHaveBeenCalled()
    expect((h.state.window as WindowStub).calls).toEqual([
      'isMinimized',
      'restore',
      'show',
      'focus'
    ])
  })

  it('shows and focuses a window that is not minimized', async () => {
    const h = harness({ probe: FILE_PAIR })
    const controller = startLaunch(h.bindings)

    await controller?.onSecondInstance([EXEC, '/tmp/a.txt', '/tmp/b.txt'], '/work')

    expect((h.state.window as WindowStub).calls).toEqual(['isMinimized', 'show', 'focus'])
  })

  it('resolves relative paths against the second launch working directory', async () => {
    const h = harness({
      probe: probeOf({
        '/second/cwd/rel/a.txt': 'file',
        '/second/cwd/rel/b.txt': 'file'
      })
    })
    const controller = startLaunch(h.bindings)

    await controller?.onSecondInstance([EXEC, 'rel/a.txt', 'rel/b.txt'], '/second/cwd')
    controller?.onRendererReady()

    expect(h.sent).toEqual([
      {
        ok: true,
        request: {
          left: '/second/cwd/rel/a.txt',
          right: '/second/cwd/rel/b.txt',
          kind: 'file'
        }
      }
    ])
  })

  it('creates a window when all were closed, then delivers after it is ready', async () => {
    const h = harness({ probe: FILE_PAIR })
    const controller = startLaunch(h.bindings)
    controller?.onRendererReady()
    const hadWindow = h.state.window
    expect(hadWindow).not.toBeNull()

    // macOS: the last window was closed but the app is still running.
    h.state.window = null
    await controller?.onSecondInstance([EXEC, '/tmp/a.txt', '/tmp/b.txt'], '/work')

    expect(h.bindings.createWindow).toHaveBeenCalledTimes(1)
    expect(h.bindings.send).not.toHaveBeenCalled()
    expect(controller?.pendingCount()).toBe(1)

    controller?.onRendererReady()
    expect(h.bindings.send).toHaveBeenCalledTimes(1)
    expectRequest(h.sent[0])
  })
})

describe('argv intake', () => {
  it('strips the runtime prefix and keeps the bare pair intact', async () => {
    expect(
      stripLauncherPrefix([EXEC, '/tmp/a.txt', '/tmp/b.txt'], {
        execPath: EXEC,
        appPath: APP_PATH,
        defaultApp: false
      })
    ).toEqual(['/tmp/a.txt', '/tmp/b.txt'])

    expect(
      stripLauncherPrefix([EXEC, APP_PATH, '/tmp/a.txt', '/tmp/b.txt'], {
        execPath: EXEC,
        appPath: APP_PATH,
        defaultApp: true
      })
    ).toEqual(['/tmp/a.txt', '/tmp/b.txt'])

    // electron-vite dev starts the app with the project directory as argv[1].
    expect(
      stripLauncherPrefix([EXEC, '.', '/tmp/a.txt', '/tmp/b.txt'], {
        execPath: EXEC,
        appEntry: '.',
        defaultApp: true
      })
    ).toEqual(['/tmp/a.txt', '/tmp/b.txt'])

    const h = harness({
      argv: [EXEC, APP_PATH, '/tmp/a.txt', '/tmp/b.txt'],
      defaultApp: true,
      probe: FILE_PAIR
    })
    const controller = startLaunch(h.bindings)
    await controller?.coldStart
    controller?.onRendererReady()

    expectRequest(h.sent[0])
  })

  it('prefers a URL inside argv over side flags, last URL wins', async () => {
    const h = harness({
      argv: [
        EXEC,
        '--left',
        '/tmp/flag-left.txt',
        '--right',
        '/tmp/flag-right.txt',
        'opencompare://compare?left=%2Ftmp%2Ffirst.txt&right=%2Ftmp%2Ffirst2.txt',
        'opencompare://compare?left=%2Ftmp%2F%E4%B8%AD%20a.txt&right=%2Ftmp%2F%E5%8F%B3%20b.txt'
      ],
      probe: probeOf({
        '/tmp/flag-left.txt': 'file',
        '/tmp/flag-right.txt': 'file',
        '/tmp/first.txt': 'file',
        '/tmp/first2.txt': 'file',
        '/tmp/中 a.txt': 'file',
        '/tmp/右 b.txt': 'file'
      })
    })
    const controller = startLaunch(h.bindings)
    await controller?.coldStart
    controller?.onRendererReady()

    expect(h.sent).toEqual([
      {
        ok: true,
        request: { left: '/tmp/中 a.txt', right: '/tmp/右 b.txt', kind: 'file' }
      }
    ])
  })

  it('injects nothing when no side flag, URL or positional pair is present', async () => {
    const h = harness({ argv: [EXEC, '--inspect=9229'], window: null })
    const controller = startLaunch(h.bindings)

    await controller?.coldStart
    controller?.onRendererReady()
    controller?.onAppReady()

    expect(h.bindings.send).not.toHaveBeenCalled()
    expect(controller?.pendingCount()).toBe(0)
    expect(h.bindings.createWindow).toHaveBeenCalledTimes(1)
  })

  it('reports an incomplete side flag pair without producing a request', async () => {
    const h = harness({ argv: [EXEC, '--left=/tmp/a.txt'], probe: probeOf({ '/tmp/a.txt': 'file' }) })
    const controller = startLaunch(h.bindings)

    await controller?.coldStart
    controller?.onRendererReady()

    expect(h.sent).toHaveLength(1)
    const payload = h.sent[0]
    expect(payload.ok).toBe(false)
    if (payload.ok) return
    expect(payload.message).toContain('右侧')
    expect(payload).not.toHaveProperty('request')
  })
})

describe('pending request queue', () => {
  it('holds the cold-start request until the renderer is ready', async () => {
    const h = harness({ argv: [EXEC, '/tmp/a.txt', '/tmp/b.txt'], probe: FILE_PAIR })
    const controller = startLaunch(h.bindings)

    await controller?.coldStart
    expect(h.bindings.send).not.toHaveBeenCalled()
    expect(controller?.pendingCount()).toBe(1)

    controller?.onRendererReady()
    expect(h.bindings.send).toHaveBeenCalledTimes(1)
    expectRequest(h.sent[0])
  })

  it('delivers queued requests in order exactly once', async () => {
    const h = harness({
      probe: probeOf({
        '/tmp/a.txt': 'file',
        '/tmp/b.txt': 'file',
        '/tmp/c.txt': 'file',
        '/tmp/d.txt': 'file'
      })
    })
    const controller = startLaunch(h.bindings)

    await controller?.onSecondInstance([EXEC, '/tmp/a.txt', '/tmp/b.txt'], '/work')
    await controller?.onOpenUrl('opencompare://compare?left=%2Ftmp%2Fc.txt&right=%2Ftmp%2Fd.txt')
    expect(controller?.pendingCount()).toBe(2)
    expect(h.bindings.send).not.toHaveBeenCalled()

    controller?.onRendererReady()
    expect(controller?.pendingCount()).toBe(0)
    expect(h.sent).toHaveLength(2)
    const [first, second] = h.sent
    expect(first.ok && first.request.left).toBe('/tmp/a.txt')
    expect(second.ok && second.request.left).toBe('/tmp/c.txt')

    controller?.onRendererReady()
    expect(h.bindings.send).toHaveBeenCalledTimes(2)
  })
})

describe('open-url intake', () => {
  it('queues a link that arrives before ready and decodes it verbatim', async () => {
    const h = harness({
      probe: probeOf({ '/tmp/中文 a.txt': 'file', '/tmp/中文 b.txt': 'file' })
    })
    const controller = startLaunch(h.bindings)

    await controller?.onOpenUrl(
      'opencompare://compare?left=%2Ftmp%2F%E4%B8%AD%E6%96%87%20a.txt&right=%2Ftmp%2F%E4%B8%AD%E6%96%87%20b.txt'
    )

    expect(h.bindings.send).not.toHaveBeenCalled()
    expect(controller?.pendingCount()).toBe(1)

    controller?.onRendererReady()
    expect(h.sent).toEqual([
      {
        ok: true,
        request: { left: '/tmp/中文 a.txt', right: '/tmp/中文 b.txt', kind: 'file' }
      }
    ])
  })

  it('holds a cold-start link that arrives before the app is ready', async () => {
    const h = harness({
      window: null,
      appReady: false,
      probe: probeOf({ '/tmp/a.txt': 'file', '/tmp/b.txt': 'file' })
    })
    const controller = startLaunch(h.bindings)

    await controller?.onOpenUrl(
      'opencompare://compare?left=%2Ftmp%2Fa.txt&right=%2Ftmp%2Fb.txt'
    )

    // A window cannot be created before `whenReady`; the request just waits.
    expect(h.bindings.createWindow).not.toHaveBeenCalled()
    expect(controller?.pendingCount()).toBe(1)

    controller?.onAppReady()
    expect(h.bindings.createWindow).toHaveBeenCalledTimes(1)
    expect(h.bindings.send).not.toHaveBeenCalled()

    controller?.onRendererReady()
    expectRequest(h.sent[0])
  })

  it('reports a missing side and still focuses the window', async () => {    const h = harness({ probe: probeOf({ '/tmp/a.txt': 'file' }) })
    const controller = startLaunch(h.bindings)

    await controller?.onOpenUrl(
      'opencompare://compare?left=%2Ftmp%2Fa.txt&right=%2Ftmp%2Fmissing.txt'
    )
    controller?.onRendererReady()

    expect((h.state.window as WindowStub).calls).toEqual(['isMinimized', 'show', 'focus'])
    expect(h.sent).toHaveLength(1)
    const payload = h.sent[0]
    expect(payload.ok).toBe(false)
    if (payload.ok) return
    expect(payload.message).toContain('不存在')
    expect(payload.message).toContain('/tmp/missing.txt')
    expect(payload).not.toHaveProperty('request')
  })

  it('reports a file / directory mismatch without producing a request', async () => {
    const h = harness({
      probe: probeOf({ '/tmp/a.txt': 'file', '/tmp/right-dir': 'directory' })
    })
    const controller = startLaunch(h.bindings)

    await controller?.onOpenUrl(
      'opencompare://compare?left=%2Ftmp%2Fa.txt&right=%2Ftmp%2Fright-dir'
    )
    controller?.onRendererReady()

    const payload = h.sent[0]
    expect(payload.ok).toBe(false)
    if (payload.ok) return
    expect(payload.message).toContain('类型不一致')
    expect(payload).not.toHaveProperty('request')
  })
})

describe('protocol client registration', () => {
  it('registers the bare scheme for a packaged bundle', () => {
    const h = harness({ isPackaged: true })

    startLaunch(h.bindings)

    expect(h.bindings.setProtocolClient).toHaveBeenCalledWith('opencompare')
  })

  it('names the runtime and app entry for a dev run', () => {
    const h = harness({ isPackaged: false, defaultApp: true })

    startLaunch(h.bindings)

    expect(h.bindings.setProtocolClient).toHaveBeenCalledWith('opencompare', EXEC, [APP_PATH])
  })
})

describe('single parsing entry point', () => {
  it('delegates every launch source to the shared compare-request contract', async () => {
    vi.mocked(parseCompareArgv).mockClear()
    vi.mocked(parseCompareUrl).mockClear()
    vi.mocked(resolveCompareRequest).mockClear()

    const h = harness({ argv: [EXEC, '/tmp/a.txt', '/tmp/b.txt'], probe: FILE_PAIR })
    const controller = startLaunch(h.bindings)

    await controller?.coldStart
    expect(parseCompareArgv).toHaveBeenCalledTimes(1)
    expect(resolveCompareRequest).toHaveBeenCalledTimes(1)

    await controller?.onOpenUrl('opencompare://compare?left=%2Ftmp%2Fa.txt&right=%2Ftmp%2Fb.txt')
    expect(parseCompareUrl).toHaveBeenCalledTimes(1)
    expect(resolveCompareRequest).toHaveBeenCalledTimes(2)
  })

  it('keeps a second decoder or path normaliser out of the main process', () => {
    const source = readFileSync(fileURLToPath(new URL('./launch.ts', import.meta.url)), 'utf8')

    expect(source).not.toContain('decodeURIComponent')
    expect(source).not.toContain('node:path')
    expect(source).not.toContain('homedir')
    expect(source).not.toContain('expandHome')
    expect(source).not.toContain('process.env')
  })
})
