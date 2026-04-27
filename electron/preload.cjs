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
    setPinned: (chatId, pinned) => ipcRenderer.invoke('history:setPinned', chatId, pinned),
  },
  tools: {
    list: () => ipcRenderer.invoke('tool:list'),
    execute: (name, input, meta) => ipcRenderer.invoke('tool:execute', { name, input, meta }),
  },
  todos: {
    get: (chatId) => ipcRenderer.invoke('todos:get', chatId),
    set: (chatId, items) => ipcRenderer.invoke('todos:set', chatId, items),
    clear: (chatId) => ipcRenderer.invoke('todos:clear', chatId),
  },
  getSystemPrompt: (chatId, yoloMode) => ipcRenderer.invoke('get-system-prompt', chatId, yoloMode),
});
