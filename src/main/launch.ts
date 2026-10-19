/**
 * Launch-source orchestration for the main process.
 *
 * Every runtime capability (single-instance lock, protocol client, window
 * creation / focus, IPC, queue delivery) is injected, so the rules in this file
 * are plain functions that vitest can exercise in the node environment. Parsing
 * and validation are delegated to the shared compare-request contract; there is
 * deliberately no second URI decoder or path normaliser here.
 */
import {
  parseCompareArgv,
  parseCompareUrl,
  resolveCompareRequest
} from '../shared/compareRequest'
import type {
  ComparePaths,
  CompareRequestPayload,
  PathProbe
} from '../shared/compareRequest'

export const COMPARE_PROTOCOL = 'opencompare'

const URL_PREFIX = `${COMPARE_PROTOCOL}://`

/** The window surface the focus rule needs; `BrowserWindow` satisfies it. */
export interface LaunchWindow {
  isMinimized(): boolean
  restore(): void
  show(): void
  focus(): void
}

export interface LaunchBindings {
  /** Raw `process.argv` of this process. */
  readonly argv: readonly string[]
  readonly execPath: string
  /** App entry, present (and stripped) only in a dev run. */
  readonly appPath?: string
  /** Raw second argv element of a dev run; `appPath` when it is already exact. */
  readonly appEntry?: string
  readonly defaultApp: boolean
  /** Cold-start base directory for relative paths. */
  readonly cwd: string
  readonly homeDir: string
  readonly isPackaged: boolean
  readonly probe: PathProbe
  readonly requestSingleInstanceLock: () => boolean
  readonly setProtocolClient: (scheme: string, execPath?: string, args?: string[]) => boolean
  /** Registers the IPC handlers; called with the renderer-ready callback. */
  readonly registerIpc: (onRendererReady: () => void) => void
  readonly quit: () => void
  /** False until `whenReady`: a window cannot be created before that. */
  readonly isReady: () => boolean
  readonly getWindow: () => LaunchWindow | null
  readonly createWindow: () => void
  readonly send: (payload: CompareRequestPayload) => void
}

export interface LaunchController {
  /** Resolves after the cold-start argv has been parsed and queued or dropped. */
  readonly coldStart: Promise<void>
  /** `whenReady`: create the first window when the app has none yet. */
  onAppReady(): void
  /** A second launch (or a re-open on Windows / Linux) takes over this instance. */
  onSecondInstance(argv: readonly string[], workingDirectory: string): Promise<void>
  /** macOS delivers an `opencompare://` link here, possibly before `whenReady`. */
  onOpenUrl(url: string): Promise<void>
  /** The renderer subscribed and announced it; deliver queued requests in order. */
  onRendererReady(): void
  /** An externally created window replaced the old renderer. */
  notifyWindowCreated(): void
  /** Requests waiting for a listening renderer. */
  pendingCount(): number
}

/**
 * Drops the runtime prefix `process.argv` carries: the executable, then the app
 * entry when electron is running the project directly (`defaultApp`).
 */
export function stripLauncherPrefix(
  argv: readonly string[],
  bindings: Pick<LaunchBindings, 'execPath' | 'appPath' | 'appEntry' | 'defaultApp'>
): readonly string[] {
  let start = 0
  if (argv[0] === bindings.execPath) start = 1
  const entry = bindings.appEntry ?? bindings.appPath
  if (start === 1 && bindings.defaultApp && entry !== undefined && argv[start] === entry) {
    start += 1
  }
  return argv.slice(start)
}

function hasSideFlag(argv: readonly string[]): boolean {
  return argv.some(
    (argument) =>
      argument === '--left' ||
      argument === '--right' ||
      argument.startsWith('--left=') ||
      argument.startsWith('--right=')
  )
}

/** No side flag and fewer than two positionals: the user asked for no comparison. */
function hasNoRequest(argv: readonly string[]): boolean {
  if (hasSideFlag(argv)) return false
  return argv.filter((argument) => !argument.startsWith('-')).length < 2
}

interface IntakeContext {
  readonly homeDir: string
  readonly baseDir: string
  readonly probe: PathProbe
}

async function toPayload(
  paths: ComparePaths,
  context: IntakeContext
): Promise<CompareRequestPayload> {
  const resolved = await resolveCompareRequest(paths, context)
  return resolved.ok
    ? { ok: true, request: resolved.request }
    : { ok: false, message: resolved.error.message }
}

/**
 * Turns launch arguments into a payload, or `null` when they carry no request.
 * A URL always wins over side flags; of several URLs the last one counts.
 */
async function requestFromArgv(
  argv: readonly string[],
  context: IntakeContext
): Promise<CompareRequestPayload | null> {
  const urls = argv.filter((argument) => argument.startsWith(URL_PREFIX))
  if (urls.length > 0) {
    const parsed = parseCompareUrl(urls[urls.length - 1], context)
    return parsed.ok
      ? toPayload(parsed.paths, context)
      : { ok: false, message: parsed.error.message }
  }
  if (hasNoRequest(argv)) return null
  const parsed = parseCompareArgv(argv, context)
  return parsed.ok ? toPayload(parsed.paths, context) : { ok: false, message: parsed.error.message }
}

/**
 * Applies the single-instance rule and wires the three launch sources.
 *
 * Returns `null` when another instance already owns the lock; that instance has
 * already asked this process to quit, so nothing is created or registered here.
 */
export function startLaunch(bindings: LaunchBindings): LaunchController | null {
  if (!bindings.requestSingleInstanceLock()) {
    bindings.quit()
    return null
  }

  // A packaged bundle registers itself; a dev run must name the runtime plus the
  // app entry it has to relaunch.
  if (bindings.isPackaged) {
    bindings.setProtocolClient(COMPARE_PROTOCOL)
  } else {
    bindings.setProtocolClient(
      COMPARE_PROTOCOL,
      bindings.execPath,
      bindings.appPath === undefined ? [] : [bindings.appPath]
    )
  }

  const pending: CompareRequestPayload[] = []
  let ready = false

  const context = (baseDir: string): IntakeContext => ({
    homeDir: bindings.homeDir,
    baseDir,
    probe: bindings.probe
  })

  /** Delivers at once when the renderer listens, otherwise holds the request. */
  function enqueue(payload: CompareRequestPayload): void {
    if (ready) bindings.send(payload)
    else pending.push(payload)
  }

  /** One main window at a time: focus it, or create it when it was closed. */
  function focusOrCreate(): void {
    const window = bindings.getWindow()
    if (window === null) {
      // A cold-start link can arrive before `whenReady`; the first window is
      // then created by `onAppReady`, and the request simply waits in the queue.
      if (!bindings.isReady()) return
      bindings.createWindow()
      // The fresh renderer has to announce itself before anything is delivered.
      ready = false
      return
    }
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  }

  const controller: LaunchController = {
    coldStart: requestFromArgv(
      stripLauncherPrefix(bindings.argv, bindings),
      context(bindings.cwd)
    ).then((payload) => {
      if (payload !== null) enqueue(payload)
    }),
    onAppReady() {
      if (bindings.getWindow() !== null) return
      bindings.createWindow()
      ready = false
    },
    async onSecondInstance(argv, workingDirectory) {
      focusOrCreate()
      const payload = await requestFromArgv(
        stripLauncherPrefix(argv, bindings),
        // The second launch resolves its relative paths against its own cwd.
        context(workingDirectory)
      )
      if (payload !== null) enqueue(payload)
    },
    async onOpenUrl(url) {
      focusOrCreate()
      const baseDir = bindings.cwd
      const parsed = parseCompareUrl(url, context(baseDir))
      enqueue(
        parsed.ok
          ? await toPayload(parsed.paths, context(baseDir))
          : { ok: false, message: parsed.error.message }
      )
    },
    onRendererReady() {
      ready = true
      const queued = pending.splice(0)
      for (const payload of queued) bindings.send(payload)
    },
    notifyWindowCreated() {
      ready = false
    },
    pendingCount: () => pending.length
  }

  bindings.registerIpc(() => controller.onRendererReady())
  return controller
}
