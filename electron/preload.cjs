const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('soundboard', {
  pickAudioFiles: () => ipcRenderer.invoke('soundboard:pick-files'),
  openSoundArchive: () => ipcRenderer.invoke('soundboard:open-sound-archive'),
  listAudioSources: () => ipcRenderer.invoke('soundboard:list-audio-sources'),
  startProcessAudio: (processId) => ipcRenderer.invoke('soundboard:start-process-audio', processId),
  stopProcessAudio: () => ipcRenderer.invoke('soundboard:stop-process-audio'),
  onProcessAudioData: (callback) => {
    const listener = (_event, chunk) => callback(chunk)
    ipcRenderer.on('soundboard:process-audio-data', listener)
    return () => ipcRenderer.removeListener('soundboard:process-audio-data', listener)
  },
})