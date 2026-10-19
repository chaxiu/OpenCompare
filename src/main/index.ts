import { join } from 'node:path'
import { app, BrowserWindow, Menu, shell } from 'electron'
import { BRAND_NAME, buildAboutPanelOptions, resolveBrandIconPath } from '../shared/brand'
import { createMenuTemplate } from './menu'
import { registerPlatformIpc } from './platform/electron-platform'

function brandIconPath(): string {
  return resolveBrandIconPath({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath()
  })
}

function createWindow(iconPath: string): void {
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
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(() => {
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

  registerPlatformIpc()
  createWindow(iconPath)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(iconPath)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
