'use strict';
const { app, BrowserWindow, globalShortcut, ipcMain, dialog, Tray, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path  = require('path');
const fs    = require('fs');
const https = require('https');

// Tell Windows this is "onAIr", not generic Electron — helps with taskbar grouping & tray identity
app.setAppUserModelId('com.onair.app');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

// ── State ─────────────────────────────────────────────────────────────────────

let win            = null;
let settingsWin    = null;
let tray           = null;
let moveModeActive = false;
let protected_     = true;   // overlay content-protection on by default
let protectedCtrl  = false;  // Controller window not protected by default (visible when sharing)

// ── Config ────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  provider: 'azure', // 'azure' | 'openai' | 'groq' | 'anthropic' | 'gemini' | 'mistral'
  transcriptionProvider: 'openai', // used when main provider lacks Whisper
  azure: {
    endpoint:          '',
    key:               '',
    whisperDeployment: '',
    chatDeployment:    '',
  },
  openai: {
    key:          '',
    whisperModel: 'whisper-1',
    chatModel:    'gpt-4o',
  },
  groq: {
    key:          '',
    whisperModel: 'whisper-large-v3',
    chatModel:    'llama-3.3-70b-versatile',
  },
  anthropic: {
    key:       '',
    chatModel: 'claude-3-5-haiku-20241022',
  },
  gemini: {
    key:       '',
    chatModel: 'gemini-2.0-flash',
  },
  mistral: {
    key:       '',
    chatModel: 'mistral-small-latest',
  },
  appearance: {
    opacity:    75,
    fontSize:   22,
    fontColor:  '#f0f0f0',
    scrollStep: 120,
    scrollSpeed: 50,
    voiceRmsThreshold: 15,
  },
  audioDeviceId: '',
  audioOutputDeviceId: '',
  audioRecordingSource: 'microphone',  // 'microphone' | 'system' | 'both'
  systemPrompt: 'You are a helpful assistant supporting a sales or technical presentation. The presenter received a question from a client and needs a concise answer they can read aloud. Respond in the same language as the question. Keep your answer clear and under 4 sentences.',
  presentationContext: '',
  quickLinks: [
    { label: '🔍 Google',        url: 'https://www.google.com' },
    { label: '🔎 Bing',          url: 'https://www.bing.com' },
    { label: '📊 Google Slides', url: 'https://slides.google.com' },
    { label: '☁️ OneDrive',      url: 'https://onedrive.live.com' },
    { label: '📖 Wikipedia',     url: 'https://www.wikipedia.org' },
  ],
};

let config     = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
let configPath = null;

function loadConfig() {
  configPath = path.join(app.getPath('userData'), 'config.json');
  try {
    const raw  = fs.readFileSync(configPath, 'utf-8');
    const disk = JSON.parse(raw);
    // Migrate old azure.openai structure → flat azure
    const legacyOAI = disk.azure?.openai;
    const diskAzure = (disk.azure && disk.azure.endpoint !== undefined) ? disk.azure
      : { endpoint: legacyOAI?.endpoint || '', key: legacyOAI?.key || '',
          whisperDeployment: legacyOAI?.whisperDeployment || '',
          chatDeployment: legacyOAI?.deployment || '' };
    config = {
      provider:              disk.provider      || DEFAULT_CONFIG.provider,
      transcriptionProvider: disk.transcriptionProvider || DEFAULT_CONFIG.transcriptionProvider,
      azure:         { ...DEFAULT_CONFIG.azure,      ...diskAzure },
      openai:        { ...DEFAULT_CONFIG.openai,     ...(disk.openai     || {}) },
      groq:          { ...DEFAULT_CONFIG.groq,       ...(disk.groq       || {}) },
      anthropic:     { ...DEFAULT_CONFIG.anthropic,  ...(disk.anthropic  || {}) },
      gemini:        { ...DEFAULT_CONFIG.gemini,     ...(disk.gemini     || {}) },
      mistral:       { ...DEFAULT_CONFIG.mistral,    ...(disk.mistral    || {}) },
      appearance:    { ...DEFAULT_CONFIG.appearance, ...(disk.appearance || {}) },
      audioDeviceId:        disk.audioDeviceId        || '',
      audioOutputDeviceId:  disk.audioOutputDeviceId  || '',
      audioRecordingSource: disk.audioRecordingSource || 'microphone',
      systemPrompt:        disk.systemPrompt        ?? DEFAULT_CONFIG.systemPrompt,
      presentationContext: disk.presentationContext || '',
      quickLinks:          Array.isArray(disk.quickLinks) ? disk.quickLinks : DEFAULT_CONFIG.quickLinks,
    };
  } catch {
    config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
}

function saveConfig() {
  if (!configPath) return;
  try {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (e) {
    console.error('Could not save config:', e.message);
  }
}

// ── Provider helpers ──────────────────────────────────────────────────────────

// Returns { hostname, authHeader } for the active or a given provider config.
function providerHttp(p) {
  if (p === 'groq')   return { host: 'api.groq.com',   auth: `Bearer ${config.groq.key}` };
  if (p === 'openai') return { host: 'api.openai.com', auth: `Bearer ${config.openai.key}` };
  return null; // azure uses custom endpoint
}

// ── Connection test ───────────────────────────────────────────────────────────

function testProviderConnection(provider, cfg) {
  return new Promise((resolve) => {
    try {
      let hostname, path_, headers;
      if (provider === 'azure') {
        if (!cfg.endpoint || !cfg.key) return resolve({ ok: false, error: 'Endpoint and API key are required.' });
        const url = new URL(`${cfg.endpoint.replace(/\/$/, '')}/openai/deployments?api-version=2024-02-01`);
        hostname = url.hostname; path_ = url.pathname + url.search;
        headers  = { 'api-key': cfg.key };
      } else if (provider === 'anthropic') {
        if (!cfg.key) return resolve({ ok: false, error: 'API key is required.' });
        hostname = 'api.anthropic.com';
        path_    = '/v1/models';
        headers  = { 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' };
      } else if (provider === 'gemini') {
        if (!cfg.key) return resolve({ ok: false, error: 'API key is required.' });
        hostname = 'generativelanguage.googleapis.com';
        path_    = '/v1beta/openai/models';
        headers  = { 'Authorization': `Bearer ${cfg.key}` };
      } else {
        if (!cfg.key) return resolve({ ok: false, error: 'API key is required.' });
        hostname = provider === 'groq' ? 'api.groq.com'
                 : provider === 'mistral' ? 'api.mistral.ai'
                 : 'api.openai.com';
        path_    = '/openai/v1/models';
        headers  = { 'Authorization': `Bearer ${cfg.key}` };
      }
      const req = https.request({ hostname, path: path_, method: 'GET', headers }, (res) => {
        resolve({ ok: res.statusCode === 200, error: res.statusCode !== 200 ? `HTTP ${res.statusCode} — check key` : null });
      });
      req.on('error', e => resolve({ ok: false, error: e.message }));
      req.setTimeout(8000, () => { req.destroy(); resolve({ ok: false, error: 'Timeout (8s)' }); });
      req.end();
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findTxtArg(argv) {
  const start = app.isPackaged ? 1 : 2;
  return argv.slice(start).find(a => /\.txt$/i.test(a) && fs.existsSync(a)) || null;
}

function sendScript(filePath) {
  if (!win) return;
  try {
    const text = fs.readFileSync(filePath, 'utf-8');
    win.webContents.send('load-script', { text, filePath });
    // Notify Controller of the loaded filename
    const name = filePath.replace(/\\/g, '/').split('/').pop();
    settingsWin?.webContents.send('ctrl-script-loaded', name);
  } catch (e) {
    console.error('Could not read file:', e.message);
  }
}

async function openFilePicker() {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Load Script',
    filters: [{ name: 'Text Files', extensions: ['txt'] }],
    properties: ['openFile'],
  });
  if (!canceled && filePaths[0]) sendScript(filePaths[0]);
}

function toggleMoveMode() {
  moveModeActive = !moveModeActive;
  win?.setIgnoreMouseEvents(!moveModeActive, { forward: true });
  win?.webContents.send('move-mode', moveModeActive);
}

// ── Main overlay window ───────────────────────────────────────────────────────

function createWindow() {
  win = new BrowserWindow({
    width: 720,
    height: 300,
    x: 80,
    y: 40,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: true,
    minWidth: 320,
    minHeight: 120,
    icon: path.join(__dirname, 'assets', 'app-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      webviewTag: true,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setContentProtection(true);

  // Allow microphone access from renderer
  win.webContents.session.setPermissionRequestHandler((_, permission, callback) => {
    callback(permission === 'media');
  });
  protected_ = true;
  moveModeActive = true;           // start in move mode — user can drag/resize immediately
  win.setIgnoreMouseEvents(true, { forward: true }); // click-through during load
  win.setAlwaysOnTop(true, 'screen-saver');

  win.webContents.on('did-finish-load', () => {
    win.webContents.send('apply-config', {
      ...config.appearance,
      audioDeviceId:        config.audioDeviceId,
      audioOutputDeviceId:  config.audioOutputDeviceId,
      audioRecordingSource: config.audioRecordingSource,
    });
    win.setIgnoreMouseEvents(false); // make interactive now that page is ready
    win.webContents.send('move-mode', true); // confirm move mode to renderer
    const file = findTxtArg(process.argv);
    if (file) sendScript(file);
  });

  // Closing the overlay = quit the app
  win.on('close', () => app.quit());
}

// ── Settings window ───────────────────────────────────────────────────────────

function createSettingsWindow() {
  if (settingsWin) { settingsWin.focus(); return; }

  settingsWin = new BrowserWindow({
    width: 520,
    height: 640,
    minWidth: 400,
    minHeight: 500,
    title: 'onAIr — Controller',
    resizable: true,
    maximizable: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    icon: path.join(__dirname, 'assets', 'app-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload-settings.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWin.setMenuBarVisibility(false);
  settingsWin.on('closed', () => { settingsWin = null; });

  // Send current controller protect state once loaded
  settingsWin.webContents.on('did-finish-load', () => {
    settingsWin.webContents.send('controller-protect-state', protectedCtrl);
  });
}

// ── Tray ──────────────────────────────────────────────────────────────────────

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  tray = new Tray(iconPath);
  tray.setToolTip('onAIr');

  const menu = Menu.buildFromTemplate([
    { label: 'onAIr', enabled: false },
    { type: 'separator' },
    { label: 'Load Script…',      click: () => openFilePicker() },
    { label: 'Controller…',       click: () => createSettingsWindow() },
    { type: 'separator' },
    { label: 'Toggle Move Mode',  click: () => toggleMoveMode() },
    { type: 'separator' },
    { label: 'Check for Updates…', click: () => checkForUpdates(false) },
    { type: 'separator' },
    { label: 'Quit',              click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.on('double-click', () => win?.show());
}

// ── Hotkeys ───────────────────────────────────────────────────────────────────

function registerHotkeys() {
  const logLines = [];

  const toRegister = [
    { keys: ['CommandOrControl+Alt+PageUp'],
      label: 'scroll-up',
      handler: () => win?.webContents.send('scroll', -config.appearance.scrollStep) },

    { keys: ['CommandOrControl+Alt+PageDown'],
      label: 'scroll-down',
      handler: () => win?.webContents.send('scroll', config.appearance.scrollStep) },

    { keys: ['CommandOrControl+Alt+O'],
      label: 'open-file',
      handler: () => openFilePicker() },

    { keys: ['CommandOrControl+Alt+Home', 'CommandOrControl+Alt+Insert'],
      label: 'move-mode',
      handler: () => toggleMoveMode() },

    { keys: ['CommandOrControl+Alt+,'],
      label: 'settings',
      handler: () => createSettingsWindow() },

    { keys: ['CommandOrControl+Alt+R'],
      label: 'record',
      handler: () => win?.webContents.send('toggle-recording') },

    { keys: ['CommandOrControl+Alt+M'],
      label: 'mode-switch',
      handler: () => win?.webContents.send('switch-mode') },
  ];

  const registered = [];
  const failed     = [];

  for (const entry of toRegister) {
    let ok = false;
    for (const key of entry.keys) {
      try {
        const success = globalShortcut.register(key, entry.handler);
        logLines.push(`${success ? '✅' : '❌'} ${key} (${entry.label})`);
        if (success) { registered.push(`${entry.label}: ${key}`); ok = true; break; }
      } catch (e) {
        logLines.push(`💥 ${key} (${entry.label}): ${e.message}`);
      }
    }
    if (!ok) failed.push(entry.label);
  }

  const logPath = path.join(__dirname, 'hotkey-log.txt');
  fs.writeFileSync(logPath, logLines.join('\n') + '\n');

  win?.webContents.on('did-finish-load', () => {
    win?.webContents.send('hotkey-status', { registered, failed });
  });
}

// ── Whisper transcription (provider-aware) ────────────────────────────────────

// Providers that natively support Whisper via OpenAI-compatible transcription endpoint
const WHISPER_CAPABLE = ['azure', 'openai', 'groq'];

function getTranscriptionProvider() {
  const main = config.provider || 'azure';
  return WHISPER_CAPABLE.includes(main) ? main : (config.transcriptionProvider || 'openai');
}

function transcribeWithWhisper(audioBuffer) {
  const p = getTranscriptionProvider();

  // Build multipart body — Azure doesn't need a model field; others do.
  const boundary = '----OnAIrWhisper' + Date.now().toString(36);
  const crlf     = '\r\n';
  const parts    = [];

  if (p !== 'azure') {
    const modelName = p === 'groq' ? config.groq.whisperModel : config.openai.whisperModel;
    parts.push(Buffer.from(
      `--${boundary}${crlf}Content-Disposition: form-data; name="model"${crlf}${crlf}${modelName}${crlf}`
    ));
  }
  parts.push(Buffer.from(
    `--${boundary}${crlf}` +
    `Content-Disposition: form-data; name="file"; filename="audio.webm"${crlf}` +
    `Content-Type: audio/webm${crlf}${crlf}`
  ));
  parts.push(audioBuffer);
  parts.push(Buffer.from(`${crlf}--${boundary}--${crlf}`));
  const body = Buffer.concat(parts);

  let hostname, reqPath, authHeader;
  try {
    if (p === 'azure') {
      const { endpoint, key, whisperDeployment } = config.azure;
      if (!endpoint || !key || !whisperDeployment)
        return Promise.resolve({ ok: false, error: 'Azure: endpoint, key and Whisper Deployment are required.' });
      authHeader = key; // used as 'api-key'
      const url  = new URL(`${endpoint.replace(/\/$/, '')}/openai/deployments/${encodeURIComponent(whisperDeployment)}/audio/transcriptions?api-version=2024-06-01`);
      hostname = url.hostname; reqPath = url.pathname + url.search;
    } else {
      const cfg = p === 'groq' ? config.groq : config.openai;
      if (!cfg.key) return Promise.resolve({ ok: false, error: `${p}: API key is required.` });
      hostname   = p === 'groq' ? 'api.groq.com' : 'api.openai.com';
      reqPath    = '/openai/v1/audio/transcriptions';
      authHeader = `Bearer ${cfg.key}`;
    }
  } catch (e) {
    return Promise.resolve({ ok: false, error: 'Config error: ' + e.message });
  }

  return new Promise((resolve) => {
    const headers = {
      'Content-Type':   `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length,
    };
    if (p === 'azure') headers['api-key']       = authHeader;
    else               headers['Authorization'] = authHeader;

    const req = https.request({ hostname, path: reqPath, method: 'POST', headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode === 200 && json.text)
            resolve({ ok: true, text: json.text.trim() });
          else
            resolve({ ok: false, error: json.error?.message || `HTTP ${res.statusCode}: ${data.slice(0, 200)}` });
        } catch (e) { resolve({ ok: false, error: 'Parse error: ' + e.message }); }
      });
    });
    req.on('error', e => resolve({ ok: false, error: 'Network: ' + e.message }));
    req.setTimeout(60000, () => { req.destroy(); resolve({ ok: false, error: 'Whisper timeout (60s)' }); });
    req.write(body);
    req.end();
  });
}

// ── Chat completion (provider-aware) ─────────────────────────────────────────

function getAIResponse(question) {
  const p = config.provider || 'azure';
  const systemPrompt = config.systemPrompt ||
    'You are a helpful assistant supporting a sales or technical presentation. The presenter received a question from a client and needs a concise answer they can read aloud. Respond in the same language as the question. Keep your answer clear and under 4 sentences.';

  const contextSuffix = config.presentationContext?.trim()
    ? `\n\nPresentation context:\n${config.presentationContext.trim()}` : '';

  // OpenAI-compatible messages array (used by azure / openai / groq / gemini / mistral)
  const messages = [{ role: 'system', content: systemPrompt }];
  if (config.presentationContext?.trim()) {
    messages.push({ role: 'system', content: `Presentation context:\n${config.presentationContext.trim()}` });
  }
  messages.push({ role: 'user', content: question });

  // ── Anthropic — different API format ────────────────────────────────────────
  if (p === 'anthropic') {
    const { key, chatModel } = config.anthropic || {};
    if (!key) return Promise.resolve({ ok: false, error: 'Anthropic: API key is required.' });
    const bodyStr = JSON.stringify({
      model:      chatModel || 'claude-3-5-haiku-20241022',
      max_tokens: 400,
      system:     systemPrompt + contextSuffix,
      messages:   [{ role: 'user', content: question }],
    });
    return new Promise((resolve) => {
      const headers = {
        'Content-Type':      'application/json',
        'Content-Length':    Buffer.byteLength(bodyStr),
        'x-api-key':         key,
        'anthropic-version': '2023-06-01',
      };
      const req = https.request(
        { hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST', headers },
        (res) => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              const text = json.content?.[0]?.text?.trim();
              if (text) resolve({ ok: true, text });
              else resolve({ ok: false, error: json.error?.message || `HTTP ${res.statusCode}: no content` });
            } catch (e) { resolve({ ok: false, error: 'Parse error: ' + e.message }); }
          });
        }
      );
      req.on('error', e => resolve({ ok: false, error: 'Network: ' + e.message }));
      req.setTimeout(30000, () => { req.destroy(); resolve({ ok: false, error: 'Timeout (30s)' }); });
      req.write(bodyStr);
      req.end();
    });
  }

  // ── All other providers: OpenAI-compatible /chat/completions ─────────────────
  let hostname, reqPath, authHeader, bodyObj;
  try {
    if (p === 'azure') {
      const { endpoint, key, chatDeployment } = config.azure;
      if (!endpoint || !key || !chatDeployment)
        return Promise.resolve({ ok: false, error: 'Azure: endpoint, key and Chat Deployment are required.' });
      const url = new URL(`${endpoint.replace(/\/$/, '')}/openai/deployments/${encodeURIComponent(chatDeployment)}/chat/completions?api-version=2024-05-01-preview`);
      hostname = url.hostname; reqPath = url.pathname + url.search;
      authHeader = null;
      bodyObj = { messages, max_tokens: 400, temperature: 0.7 };
    } else if (p === 'gemini') {
      const { key, chatModel } = config.gemini || {};
      if (!key) return Promise.resolve({ ok: false, error: 'Gemini: API key is required.' });
      hostname   = 'generativelanguage.googleapis.com';
      reqPath    = '/v1beta/openai/chat/completions';
      authHeader = `Bearer ${key}`;
      bodyObj    = { model: chatModel || 'gemini-2.0-flash', messages, max_tokens: 400, temperature: 0.7 };
    } else if (p === 'mistral') {
      const { key, chatModel } = config.mistral || {};
      if (!key) return Promise.resolve({ ok: false, error: 'Mistral: API key is required.' });
      hostname   = 'api.mistral.ai';
      reqPath    = '/v1/chat/completions';
      authHeader = `Bearer ${key}`;
      bodyObj    = { model: chatModel || 'mistral-small-latest', messages, max_tokens: 400, temperature: 0.7 };
    } else {
      // openai or groq
      const cfg = p === 'groq' ? config.groq : config.openai;
      if (!cfg.key) return Promise.resolve({ ok: false, error: `${p}: API key is required.` });
      hostname   = p === 'groq' ? 'api.groq.com' : 'api.openai.com';
      reqPath    = '/openai/v1/chat/completions';
      authHeader = `Bearer ${cfg.key}`;
      bodyObj = { model: cfg.chatModel, messages, max_tokens: 400, temperature: 0.7 };
    }
  } catch (e) {
    return Promise.resolve({ ok: false, error: 'Config error: ' + e.message });
  }

  const body = JSON.stringify(bodyObj);
  return new Promise((resolve) => {
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) };
    if (p === 'azure') headers['api-key']       = config.azure.key;
    else               headers['Authorization'] = authHeader;

    const req = https.request({ hostname, path: reqPath, method: 'POST', headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const text = json.choices?.[0]?.message?.content?.trim();
          if (text) resolve({ ok: true, text });
          else resolve({ ok: false, error: json.error?.message || 'No response' });
        } catch (e) { resolve({ ok: false, error: 'Parse error: ' + e.message }); }
      });
    });
    req.on('error', e => resolve({ ok: false, error: 'Network: ' + e.message }));
    req.setTimeout(30000, () => { req.destroy(); resolve({ ok: false, error: 'Timeout (30s)' }); });
    req.write(body);
    req.end();
  });
}

// ── Auto-updater ──────────────────────────────────────────────────────────────

function setupAutoUpdater() {
  // Silent in dev mode (running from source, not installed)
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // Private repo needs a GitHub token. Accept from env var (set by installer
  // or by the user in their system environment variables).
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
  if (token) autoUpdater.setFeedURL({ provider: 'github', owner: 'rafasouza_microsoft', repo: 'onair', private: true, token });

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: `onAIr ${info.version} is available`,
      detail: `You are running ${app.getVersion()}.\n\nDo you want to download and install the update now?`,
      buttons: ['Download & Install', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.downloadUpdate();
    });
  });

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded',
      detail: 'The update will be installed when you quit onAIr. Restart now?',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (err) => {
    // Log silently — don't bother user with update errors
    console.error('[updater]', err.message);
  });
}

function checkForUpdates(silent = false) {
  if (!app.isPackaged) {
    if (!silent) dialog.showMessageBox({ type: 'info', title: 'Dev Mode', message: 'Auto-update not available in development mode.\n\nRun the installed app to check for updates.' });
    return;
  }
  if (!silent) {
    autoUpdater.once('update-not-available', () => {
      dialog.showMessageBox({ type: 'info', title: 'Up to date', message: `onAIr ${app.getVersion()} is the latest version.` });
    });
  }
  autoUpdater.checkForUpdates().catch(err => {
    if (!silent) dialog.showMessageBox({ type: 'warning', title: 'Update Check Failed', message: err.message + '\n\nMake sure GH_TOKEN is set in your environment variables, or check for updates manually at github.com/rafasouza_microsoft/onair/releases' });
  });
}



app.on('second-instance', (_, argv) => {
  const file = findTxtArg(argv);
  if (file) sendScript(file);
});

app.whenReady().then(() => {
  loadConfig();
  createWindow();
  registerHotkeys();
  createTray();
  setupAutoUpdater();
  // Open Controller window automatically on launch
  createSettingsWindow();
  // Check for updates 10s after launch — quiet, only prompts if update found
  setTimeout(() => checkForUpdates(true), 10_000);
});

app.on('will-quit', () => globalShortcut.unregisterAll());
// No-op: let win.on('close') handle quit so closing settings alone doesn't exit
app.on('window-all-closed', () => {});

// ── IPC: overlay ─────────────────────────────────────────────────────────────

// Whisper transcription: renderer sends audio buffer, main calls Azure OpenAI Whisper
ipcMain.handle('transcribe-audio', async (_, audioData) => {
  const buf = Buffer.isBuffer(audioData)
    ? audioData
    : Buffer.from(audioData instanceof ArrayBuffer ? audioData : new Uint8Array(audioData));
  return transcribeWithWhisper(buf);
});

// AI response: renderer sends recognised text, main calls OpenAI GPT
ipcMain.handle('get-ai-response', async (_, question) => getAIResponse(question));

ipcMain.handle('toggle-protect', () => {
  protected_ = !protected_;
  win?.setContentProtection(protected_);
  win?.webContents.send('protect-state', protected_);
  settingsWin?.webContents.send('protect-state', protected_);
  return protected_;
});

ipcMain.handle('toggle-controller-protect', () => {
  protectedCtrl = !protectedCtrl;
  settingsWin?.setContentProtection(protectedCtrl);
  settingsWin?.webContents.send('controller-protect-state', protectedCtrl);
  return protectedCtrl;
});

ipcMain.handle('open-file',        () => openFilePicker());
ipcMain.handle('quit',             () => app.quit());
ipcMain.handle('minimize',         () => win?.minimize());
ipcMain.handle('toggle-move-mode', () => toggleMoveMode());
ipcMain.handle('open-settings',    () => createSettingsWindow());

ipcMain.on('set-ignore-mouse', (_, ignore) => {
  if (moveModeActive) return;
  win?.setIgnoreMouseEvents(ignore, { forward: true });
});

// Control-bar slider changes — keep in-memory in sync (not persisted until Settings saves)
ipcMain.on('update-appearance', (_, partial) => {
  config.appearance = { ...config.appearance, ...partial };
});

// Live preview from Controller window — applies to overlay without saving
ipcMain.on('preview-appearance', (_, partial) => {
  win?.webContents.send('apply-config', partial);
});

// Controller → overlay: virtual scroll, mode change, and browser URL
ipcMain.on('scroll-by',        (_, delta) => { win?.webContents.send('scroll-by',       delta); });
ipcMain.on('set-scroll-mode',  (_, mode)  => { win?.webContents.send('set-scroll-mode',  mode);  });
ipcMain.on('load-browser-url', (_, url)   => { win?.webContents.send('load-browser-url', url);   });

// ── IPC: settings window ──────────────────────────────────────────────────────

ipcMain.handle('check-for-updates', () => checkForUpdates(false));

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('get-config',  () => ({ ...config, __protected: protected_, __controllerProtected: protectedCtrl }));

ipcMain.handle('save-config', (_, newConfig) => {
  config = newConfig;
  saveConfig();
  win?.webContents.send('apply-config', {
    ...config.appearance,
    audioDeviceId:        config.audioDeviceId,
    audioOutputDeviceId:  config.audioOutputDeviceId,
    audioRecordingSource: config.audioRecordingSource,
  });
  return { ok: true };
});

ipcMain.handle('test-connection', async (_, { provider, cfg }) => {
  return await testProviderConnection(provider, cfg);
});
