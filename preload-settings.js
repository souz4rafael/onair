'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tpSettings', {
  getConfig:         ()        => ipcRenderer.invoke('get-config'),
  saveConfig:        (cfg)     => ipcRenderer.invoke('save-config', cfg),
  testConnection:    (args)    => ipcRenderer.invoke('test-connection', args),
  previewAppearance: (partial) => ipcRenderer.send('preview-appearance', partial),
});
