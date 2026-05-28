const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('loidnet', {
  getBackendPort: () => ipcRenderer.invoke('get-backend-port'),
  saveProject: (data) => ipcRenderer.invoke('save-project', data),
  openProject: () => ipcRenderer.invoke('open-project'),
  exportWav: (buffer) => ipcRenderer.invoke('export-wav', buffer),
});
