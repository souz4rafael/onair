const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tp', {
  onLoadScript:   (cb) => ipcRenderer.on('load-script',   (_, data)   => cb(data)),
  onScroll:       (cb) => ipcRenderer.on('scroll',        (_, delta)  => cb(delta)),
  onMoveMode:     (cb) => ipcRenderer.on('move-mode',     (_, active) => cb(active)),
  onHotkeyStatus: (cb) => ipcRenderer.on('hotkey-status', (_, s)      => cb(s)),
  onApplyConfig:  (cb) => ipcRenderer.on('apply-config',  (_, a)      => cb(a)),
  onProtectState: (cb) => ipcRenderer.on('protect-state', (_, s)      => cb(s)),
  onToggleRecording: (cb) => ipcRenderer.on('toggle-recording', () => cb()),
  onQAStatus:        (cb) => ipcRenderer.on('qa-status',        (_, s) => cb(s)),
  onQAResult:        (cb) => ipcRenderer.on('qa-result',        (_, r) => cb(r)),
  onSwitchMode:      (cb) => ipcRenderer.on('switch-mode',      ()     => cb()),
  openFile:          ()        => ipcRenderer.invoke('open-file'),
  quit:              ()        => ipcRenderer.invoke('quit'),
  minimize:          ()        => ipcRenderer.invoke('minimize'),
  toggleMoveMode:    ()        => ipcRenderer.invoke('toggle-move-mode'),
  openSettings:      ()        => ipcRenderer.invoke('open-settings'),
  setIgnoreMouse:    (ignore)  => ipcRenderer.send('set-ignore-mouse', ignore),
  updateAppearance:  (partial) => ipcRenderer.send('update-appearance', partial),
  toggleProtect:     ()        => ipcRenderer.invoke('toggle-protect'),
  transcribeAudio:   (buf)     => ipcRenderer.invoke('transcribe-audio', buf),
  getAIResponse:     (q)       => ipcRenderer.invoke('get-ai-response', q),
});

