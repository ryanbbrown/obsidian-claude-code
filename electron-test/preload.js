const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('claude', {
  query: (prompt) => ipcRenderer.invoke('claude-query', prompt)
});
