const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  minimize: () => ipcRenderer.send('minimize-window'),
  maximize: () => ipcRenderer.send('maximize-window'),
  close: () => ipcRenderer.send('close-window'),
  platform: process.platform,
  providers: {
    getAll: () => ipcRenderer.invoke('providers:getAll'),
    save: (data) => ipcRenderer.invoke('providers:save', data),
  },
  history: {
    list: () => ipcRenderer.invoke('history:list'),
    get: (chatId) => ipcRenderer.invoke('history:get', chatId),
    save: (chatId, data) => ipcRenderer.invoke('history:save', chatId, data),
    delete: (chatId) => ipcRenderer.invoke('history:delete', chatId),
  },
  tools: {
    list: () => ipcRenderer.invoke('tool:list'),
    execute: (name, input) => ipcRenderer.invoke('tool:execute', { name, input }),
  },
  getSystemPrompt: () => ipcRenderer.invoke('get-system-prompt'),
});
