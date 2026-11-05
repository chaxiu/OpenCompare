import { join } from 'node:path'
import { app, BrowserWindow, Menu, nativeTheme, shell } from 'electron'
import { BRAND_NAME, buildAboutPanelOptions, resolveBrandIconPath } from '../shared/brand'
import { isPerfHarnessActive } from '../shared/perf/args'
import { PLATFORM_CHANNELS } from '../shared/platform/channels'
import { DEFAULT_THEME, isTheme } from '../shared/platform/settings'
import type { ResolvedTheme } from '../shared/platform/types'
import { resolveWindowBackdrop } from '../shared/platform/windowTheme'
import { startLaunch } from './launch'
import { createMenuTemplate } from './menu'
import { runPerfHarness } from './perf/harness'
import { readUserSettings, registerPlatformIpc, statPath } from './platform/electron-platform'

function brandIconPath(): string {
  return resolveBrandIconPath({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath()
  })
}

function currentWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null
}

/** The concrete theme the native chrome is currently using. */
function resolvedNativeTheme(): ResolvedTheme {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

/** Repaints every open window from the same token-backed backdrop map. */
function applyWindowBackdrop(): void {
  const backdrop = resolveWindowBackdrop(resolvedNativeTheme())
  for (const window of BrowserWindow.getAllWindows()) window.setBackgroundColor(backdrop)
}

function createWindow(iconPath: string, perf = false): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: resolveWindowBackdrop(resolvedNativeTheme()),
    title: BRAND_NAME,
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl)
  } else {
    // Only the measurement window carries `?perf=1`; every normal launch keeps
    // the workbench as its root view.
    void mainWindow.loadFile(
      join(__dirname, '../renderer/index.html'),
      perf ? { query: { perf: '1' } } : undefined
    )
  }
  return mainWindow
}

/**
 * Normal application launch: single-instance lock, protocol registration and
 * launch intake. Must run before any window or IPC handler exists.
 */
function startNormalApp(): void {
  const launch = startLaunch({
    argv: process.argv,
    execPath: process.execPath,
    appPath: app.getAppPath(),
    appEntry: process.defaultApp === true ? process.argv[1] : undefined,
    defaultApp: process.defaultApp === true,
    cwd: process.cwd(),
    homeDir: app.getPath('home'),
    isPackaged: app.isPackaged,
    probe: { statPath },
    requestSingleInstanceLock: () => app.requestSingleInstanceLock(),
    setProtocolClient: (scheme, execPath, args) =>
      execPath === undefined
        ? app.setAsDefaultProtocolClient(scheme)
        : app.setAsDefaultProtocolClient(scheme, execPath, args),
    registerIpc: (onRendererReady) =>
      registerPlatformIpc({
        onCompareRequestsReady: onRendererReady,
        onNativeThemeChanged: applyWindowBackdrop
      }),
    quit: () => app.quit(),
    isReady: () => app.isReady(),
    getWindow: currentWindow,
    createWindow: () => createWindow(brandIconPath()),
    send: (payload) => {
      currentWindow()?.webContents.send(PLATFORM_CHANNELS.compareRequest, payload)
    }
  })

  if (launch !== null) {
    // A second launch is redirected into this instance. Listening starts right
    // after the lock is held; macOS `open-url` events may precede `whenReady`.
    app.on('second-instance', (_event, argv, workingDirectory) => {
      void launch.onSecondInstance(argv, workingDirectory)
    })
    app.on('open-url', (event, url) => {
      event.preventDefault()
      void launch.onOpenUrl(url)
    })
  }

  void app.whenReady().then(async () => {
    // The instance without the lock is quitting; it never builds a window.
    if (launch === null) return

    // Restore the persisted mode before the first window exists, through the
    // single settings reader; a missing or corrupt file falls back to dark.
    const settings = await readUserSettings()
    nativeTheme.themeSource = isTheme(settings?.theme) ? settings.theme : DEFAULT_THEME
    // One listener for the normal launch: an OS scheme flip in `system` mode
    // repaints the native chrome and every window backdrop without a reload.
    nativeTheme.on('updated', applyWindowBackdrop)

    const iconPath = brandIconPath()

    // Native About panel: same brand icon and name as the window, version from
    // the running app (which comes from the packaged app metadata).
    app.setAboutPanelOptions(
      buildAboutPanelOptions({ version: app.getVersion(), iconPath })
    )
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(createMenuTemplate({ isMac: process.platform === 'darwin' }))
    )

    if (process.platform === 'darwin') {
      app.dock?.setIcon(iconPath)
    }

    launch.onAppReady()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(iconPath)
        launch.notifyWindowCreated()
      }
    })
  })
}

// Measurement mode needs both the explicit flag and OPENCOMPARE_PERF=1, so a
// normal `--left/--right` launch can never enter it.
const perfHarnessActive = isPerfHarnessActive(process.argv, process.env)
if (perfHarnessActive) {
  // The harness asserts post-GC live object counts; only measurement runs get
  // `globalThis.gc`, and the switch has to be installed before app ready so the
  // renderer processes inherit it. A normal launch never exposes it.
  app.commandLine.appendSwitch('js-flags', '--expose-gc')
  void app.whenReady().then(() =>
    runPerfHarness({
      argv: process.argv,
      cwd: process.cwd(),
      createWindow: () => createWindow(brandIconPath(), true)
    })
  )
} else {
  startNormalApp()
}

app.on('window-all-closed', () => {
  // The harness writes its evidence asynchronously after the window closes; it
  // owns the exit code and must not be cut short by the default quit rule.
  if (perfHarnessActive) return
  if (process.platform !== 'darwin') app.quit()
})
