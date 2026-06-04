'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tpSettings', {
  getConfig:                ()        => ipcRenderer.invoke('get-config'),
  saveConfig:               (cfg)     => ipcRenderer.invoke('save-config', cfg),
  testConnection:           (args)    => ipcRenderer.invoke('test-connection', args),
  previewAppearance:        (partial) => ipcRenderer.send('preview-appearance', partial),
  scrollBy:                 (delta)   => ipcRenderer.send('scroll-by', delta),
  setScrollMode:            (mode)    => ipcRenderer.send('set-scroll-mode', mode),
  toggleProtect:            ()        => ipcRenderer.invoke('toggle-protect'),
  onProtectState:           (cb)      => ipcRenderer.on('protect-state',            (_, s) => cb(s)),
  toggleControllerProtect:  ()        => ipcRenderer.invoke('toggle-controller-protect'),
  onControllerProtectState: (cb)      => ipcRenderer.on('controller-protect-state', (_, s) => cb(s)),
  loadBrowserUrl:           (url)     => ipcRenderer.send('load-browser-url', url),
});
