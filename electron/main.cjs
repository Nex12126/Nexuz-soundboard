const { app, BrowserWindow, dialog, ipcMain, session, shell } = require('electron')
const { LoopbackCapture } = require('loopback-capture')
const { pathToFileURL } = require('node:url')
const path = require('node:path')

let activeProcessCapture = null

const stopProcessCapture = () => {
  if (!activeProcessCapture) return
  const capture = activeProcessCapture
  activeProcessCapture = null
  capture.stop()
}

const createWindow = () => {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 820,
    minHeight: 620,
    backgroundColor: '#191d1b',
    title: 'Nexuz Soundboard',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (app.isPackaged) {
    window.loadFile(path.join(__dirname, '../dist/index.html'))
  } else {
    window.loadURL('http://127.0.0.1:5173')
  }
  window.on('closed', stopProcessCapture)
}

ipcMain.handle('soundboard:pick-files', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{
      name: 'Audiodateien',
      extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'mp4', 'webm'],
    }],
  })

  return result.canceled ? [] : result.filePaths.map((filePath) => pathToFileURL(filePath).href)
})

ipcMain.handle('soundboard:open-sound-archive', () => {
  return shell.openExternal('https://soundbuttonsfun.com/sound-archive/')
})

ipcMain.handle('soundboard:list-audio-sources', async () => {
  const { default: getProcesses } = await import('ps-list')
  const processes = await getProcesses()
  return processes
    .filter(({ pid, name }) => pid !== process.pid && name)
    .map(({ pid, name }) => ({ id: String(pid), name }))
    .sort((left, right) => left.name.localeCompare(right.name))
})

ipcMain.handle('soundboard:start-process-audio', (event, processId) => {
  stopProcessCapture()
  const pid = Number(processId)
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('Invalid process ID')

  const capture = new LoopbackCapture()
  const sender = event.sender
  activeProcessCapture = capture
  capture.start(pid, (chunk) => {
    if (activeProcessCapture !== capture || sender.isDestroyed()) return
    sender.send('soundboard:process-audio-data', Uint8Array.from(chunk))
  })
  return true
})

ipcMain.handle('soundboard:stop-process-audio', stopProcessCapture)

app.whenReady().then(() => {
  app.setAppUserModelId('de.nexuz.soundboard')
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    callback(permission === 'media' && details?.mediaTypes?.includes('audio') === true && !details.mediaTypes.includes('video'))
  })
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopProcessCapture()
  if (process.platform !== 'darwin') app.quit()
})