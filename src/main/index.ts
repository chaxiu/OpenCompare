import { join } from 'node:path'
import { app, BrowserWindow, Menu, shell } from 'electron'
import { BRAND_NAME, buildAboutPanelOptions, resolveBrandIconPath } from '../shared/brand'
import { isPerfHarnessActive } from '../shared/perf/args'
import { PLATFORM_CHANNELS } from '../shared/platform/channels'
import { startLaunch } from './launch'
import { createMenuTemplate } from './menu'
import { runPerfHarness } from './perf/harness'
import { registerPlatformIpc, statPath } from './platform/electron-platform'

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

function createWindow(iconPath: string, perf = false): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#0b0d12',
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
      registerPlatformIpc({ onCompareRequestsReady: onRendererReady }),
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

  void app.whenReady().then(() => {
    // The instance without the lock is quitting; it never builds a window.
    if (launch === null) return

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
