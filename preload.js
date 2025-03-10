const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'api', {
    downloadVideo: (options) => ipcRenderer.invoke('download-video', options),
    onDownloadProgress: (callback) => {
      ipcRenderer.on('download-progress', (event, progress) => callback(progress));
    },
    removeDownloadProgressListener: () => {
      ipcRenderer.removeAllListeners('download-progress');
    }
  }
);