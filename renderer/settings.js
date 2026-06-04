'use strict';

// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ── Show/hide password ────────────────────────────────────────────────────────
document.querySelectorAll('.eye-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.for);
    input.type  = input.type === 'password' ? 'text' : 'password';
    btn.textContent = input.type === 'password' ? '👁' : '🙈';
  });
});

// ── Provider config ───────────────────────────────────────────────────────────
const PROVIDER_META = {
  azure:     { name: 'Azure OpenAI',       hint: 'Needs a Whisper deployment and a GPT deployment. Get credentials in the Azure portal.',
    fields: [
      { id: 'endpoint',          label: 'Endpoint URL',        type: 'text',     placeholder: 'https://my-resource.openai.azure.com' },
      { id: 'key',               label: 'API Key',             type: 'password', placeholder: '••••••••••••••••' },
      { id: 'whisperDeployment', label: 'Whisper Deployment',  type: 'text',     placeholder: 'whisper',  hint: 'e.g. whisper' },
      { id: 'chatDeployment',    label: 'Chat Deployment',     type: 'text',     placeholder: 'gpt-4o',   hint: 'e.g. gpt-4o' },
    ]},
  openai:    { name: 'OpenAI',             hint: 'Direct OpenAI API — get your key at platform.openai.com.',
    fields: [
      { id: 'key',          label: 'API Key',       type: 'password', placeholder: 'sk-••••••••••••' },
      { id: 'whisperModel', label: 'Whisper model', type: 'text',     placeholder: 'whisper-1',  defaultVal: 'whisper-1' },
      { id: 'chatModel',    label: 'Chat model',    type: 'text',     placeholder: 'gpt-4o',     defaultVal: 'gpt-4o' },
    ]},
  groq:      { name: 'Groq',               hint: 'Free tier available — get your key at console.groq.com → API Keys.',
    fields: [
      { id: 'key',          label: 'API Key',       type: 'password', placeholder: 'gsk-••••••••' },
      { id: 'whisperModel', label: 'Whisper model', type: 'text',     placeholder: 'whisper-large-v3',      defaultVal: 'whisper-large-v3' },
      { id: 'chatModel',    label: 'Chat model',    type: 'text',     placeholder: 'llama-3.3-70b-versatile', defaultVal: 'llama-3.3-70b-versatile' },
    ]},
  anthropic: { name: 'Anthropic Claude',   hint: 'Chat only — get your key at console.anthropic.com. Transcription will use the Whisper provider.',
    fields: [
      { id: 'key',       label: 'API Key',    type: 'password', placeholder: 'sk-ant-••••••••' },
      { id: 'chatModel', label: 'Chat model', type: 'select',
        options: [
          { value: 'claude-3-5-haiku-20241022',  label: 'claude-3-5-haiku (fast)' },
          { value: 'claude-3-5-sonnet-20241022', label: 'claude-3-5-sonnet (balanced)' },
          { value: 'claude-opus-4-5',            label: 'claude-opus-4 (powerful)' },
        ], defaultVal: 'claude-3-5-haiku-20241022' },
    ]},
  gemini:    { name: 'Google Gemini',      hint: 'Chat only — get your key at aistudio.google.com. Transcription will use the Whisper provider.',
    fields: [
      { id: 'key',       label: 'API Key',    type: 'password', placeholder: 'AIza••••••••' },
      { id: 'chatModel', label: 'Chat model', type: 'select',
        options: [
          { value: 'gemini-2.0-flash', label: 'gemini-2.0-flash (fast)' },
          { value: 'gemini-1.5-flash', label: 'gemini-1.5-flash' },
          { value: 'gemini-1.5-pro',   label: 'gemini-1.5-pro (powerful)' },
        ], defaultVal: 'gemini-2.0-flash' },
    ]},
  mistral:   { name: 'Mistral',            hint: 'Chat only — get your key at console.mistral.ai. Transcription will use the Whisper provider.',
    fields: [
      { id: 'key',       label: 'API Key',    type: 'password', placeholder: '••••••••' },
      { id: 'chatModel', label: 'Chat model', type: 'select',
        options: [
          { value: 'mistral-small-latest', label: 'mistral-small (fast)' },
          { value: 'mistral-large-latest', label: 'mistral-large (powerful)' },
          { value: 'codestral-latest',     label: 'codestral (code-focused)' },
        ], defaultVal: 'mistral-small-latest' },
    ]},
};

// Per-provider credential store (loaded from config, updated when modal saves)
let providerConfigs = {};

function isConfigured(provider) {
  const c = providerConfigs[provider] || {};
  return provider === 'azure' ? !!(c.endpoint && c.key) : !!c.key;
}

function updateProviderBadge(badgeId, provider) {
  const el = document.getElementById(badgeId);
  if (!el) return;
  el.textContent = isConfigured(provider) ? '✅' : '';
  el.title       = isConfigured(provider) ? `${PROVIDER_META[provider].name} configured` : '';
}

// ── Provider selectors ────────────────────────────────────────────────────────
const providerSel      = document.getElementById('ai-provider');
const transcriptionSel = document.getElementById('transcription-provider');

providerSel.addEventListener('change',      () => updateProviderBadge('badge-chat',         providerSel.value));
transcriptionSel.addEventListener('change', () => updateProviderBadge('badge-transcription', transcriptionSel.value));

document.getElementById('btn-configure-chat').addEventListener('click',         () => openProviderModal(providerSel.value));
document.getElementById('btn-configure-transcription').addEventListener('click', () => openProviderModal(transcriptionSel.value));

// ── Provider config modal ─────────────────────────────────────────────────────
const providerModal   = document.getElementById('provider-modal');
const modalTitle      = document.getElementById('modal-title');
const modalHint       = document.getElementById('modal-hint');
const modalFields     = document.getElementById('modal-fields');
const modalTestBtn    = document.getElementById('btn-modal-test');
const modalTestResult = document.getElementById('modal-test-result');
let   currentModalProvider = null;

function openProviderModal(provider) {
  const meta = PROVIDER_META[provider];
  if (!meta) return;
  currentModalProvider = provider;

  modalTitle.textContent = `Configure — ${meta.name}`;
  modalHint.textContent  = meta.hint;
  modalTestResult.textContent = '';
  modalTestResult.className   = 'test-result';
  modalFields.innerHTML = '';

  const saved = providerConfigs[provider] || {};

  for (const f of meta.fields) {
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'field';

    const lbl = document.createElement('label');
    lbl.htmlFor    = `mf-${f.id}`;
    lbl.textContent = f.label;
    if (f.hint) {
      const ex = document.createElement('span');
      ex.className   = 'ex';
      ex.textContent = ' ' + f.hint;
      lbl.appendChild(ex);
    }
    fieldDiv.appendChild(lbl);

    if (f.type === 'select') {
      const sel = document.createElement('select');
      sel.id = `mf-${f.id}`;
      sel.dataset.fieldId = f.id;
      for (const opt of f.options) {
        const o = document.createElement('option');
        o.value = opt.value; o.textContent = opt.label;
        sel.appendChild(o);
      }
      sel.value = saved[f.id] || f.defaultVal || f.options[0].value;
      fieldDiv.appendChild(sel);
    } else {
      const wrap = document.createElement('div');
      wrap.className = 'secret-wrap';
      const inp = document.createElement('input');
      inp.type        = f.type;
      inp.id          = `mf-${f.id}`;
      inp.dataset.fieldId = f.id;
      inp.placeholder = f.placeholder || '';
      inp.value       = saved[f.id] || f.defaultVal || '';
      inp.autocomplete = 'off';
      wrap.appendChild(inp);
      if (f.type === 'password') {
        const eye = document.createElement('button');
        eye.className   = 'eye-btn';
        eye.textContent = '👁';
        eye.title       = 'Show/hide';
        eye.addEventListener('click', () => {
          inp.type = inp.type === 'password' ? 'text' : 'password';
          eye.textContent = inp.type === 'password' ? '👁' : '🙈';
        });
        wrap.appendChild(eye);
      }
      fieldDiv.appendChild(wrap);
    }

    modalFields.appendChild(fieldDiv);
  }

  providerModal.classList.add('open');
}

function closeProviderModal() {
  providerModal.classList.remove('open');
  currentModalProvider = null;
}

function getModalValues() {
  const values = {};
  modalFields.querySelectorAll('[data-field-id]').forEach(el => {
    values[el.dataset.fieldId] = el.value.trim();
  });
  return values;
}

document.getElementById('btn-modal-close').addEventListener('click',  closeProviderModal);
document.getElementById('btn-modal-cancel').addEventListener('click', closeProviderModal);

document.getElementById('btn-modal-save').addEventListener('click', () => {
  if (!currentModalProvider) return;
  providerConfigs[currentModalProvider] = {
    ...(providerConfigs[currentModalProvider] || {}),
    ...getModalValues(),
  };
  updateProviderBadge('badge-chat',         providerSel.value);
  updateProviderBadge('badge-transcription', transcriptionSel.value);
  closeProviderModal();
});

modalTestBtn.addEventListener('click', async () => {
  if (!currentModalProvider) return;
  const vals   = getModalValues();
  modalTestBtn.disabled       = true;
  modalTestResult.textContent = '⏳ Testing…';
  modalTestResult.className   = 'test-result';
  try {
    const r = await window.tpSettings.testConnection({ provider: currentModalProvider, cfg: vals });
    modalTestResult.textContent = r.ok ? '✅ Connected!' : `❌ ${r.error || 'Failed'}`;
    modalTestResult.className   = r.ok ? 'test-result ok' : 'test-result err';
  } catch (e) {
    modalTestResult.textContent = `❌ ${e.message}`;
    modalTestResult.className   = 'test-result err';
  } finally {
    modalTestBtn.disabled = false;
  }
});

// Close modal on backdrop click
providerModal.addEventListener('click', e => {
  if (e.target === providerModal) closeProviderModal();
});

// ── DOM refs — AI (Q&A prompt only — provider fields are in modal) ─────────────
const systemPromptEl    = document.getElementById('system-prompt');
const presentationCtxEl = document.getElementById('presentation-context');
const btnResetPrompt    = document.getElementById('btn-reset-prompt');

// ── DOM refs — Audio ──────────────────────────────────────────────────────────
const audioDeviceSel  = document.getElementById('audio-device');
const audioOutputSel  = document.getElementById('audio-output-device');
const audioPemHint    = document.getElementById('audio-perm-hint');
const recSourceInputs = document.querySelectorAll('input[name="rec-source"]');

// ── DOM refs — Appearance ─────────────────────────────────────────────────────
const slOpacity  = document.getElementById('sl-opacity');
const slFont     = document.getElementById('sl-font');
const pkColor    = document.getElementById('pk-color');
const valOpacity = document.getElementById('val-opacity');
const valFont    = document.getElementById('val-font');
const colorHex   = document.getElementById('color-hex');

// ── DOM refs — Scroll ─────────────────────────────────────────────────────────
const slScroll   = document.getElementById('sl-scroll');
const slSpeed    = document.getElementById('sl-speed');
const slRms      = document.getElementById('sl-rms');
const valScroll  = document.getElementById('val-scroll');
const valSpeed   = document.getElementById('val-speed');
const valRms     = document.getElementById('val-rms');

// ── DOM refs — Footer ─────────────────────────────────────────────────────────
const btnSave    = document.getElementById('btn-save');
const btnCancel  = document.getElementById('btn-cancel');
const saveStatus = document.getElementById('save-status');

// ── Protect toggle — controls THIS Controller window's screen-share visibility ──
const btnProtectCtrl = document.getElementById('btn-protect-ctrl');

function updateProtectButton(isProtected) {
  btnProtectCtrl.textContent = isProtected ? '🙈 Hidden' : '👁 Visible';
  btnProtectCtrl.title       = isProtected
    ? 'Controller is hidden from screen-share — click to make visible'
    : 'Controller is visible when screen-sharing — click to hide';
  btnProtectCtrl.classList.toggle('protect-hidden', isProtected);
}

btnProtectCtrl.addEventListener('click', async () => {
  const result = await window.tpSettings.toggleControllerProtect();
  if (result !== undefined) updateProtectButton(result);
});

window.tpSettings.onControllerProtectState(state => updateProtectButton(state));

// ── Virtual scroll controls ───────────────────────────────────────────────────
document.getElementById('btn-vscroll-up').addEventListener('click', () => {
  window.tpSettings.scrollBy(-parseInt(slScroll.value, 10));
});
document.getElementById('btn-vscroll-down').addEventListener('click', () => {
  window.tpSettings.scrollBy(+parseInt(slScroll.value, 10));
});

document.querySelectorAll('.ctrl-mode-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.ctrl-mode-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    window.tpSettings.setScrollMode(btn.dataset.mode);
    updateScrollSettings(btn.dataset.mode);
  });
});

function updateScrollSettings(mode) {
  const showAuto  = mode === 'auto' || mode === 'voice';
  const showVoice = mode === 'voice';
  document.getElementById('scroll-settings-auto').style.display  = showAuto  ? '' : 'none';
  document.getElementById('scroll-settings-voice').style.display = showVoice ? '' : 'none';
}

// ── Slider live labels + live preview ────────────────────────────────────────
slOpacity.addEventListener('input', () => {
  valOpacity.textContent = `${slOpacity.value}%`;
  window.tpSettings.previewAppearance({ opacity: parseInt(slOpacity.value, 10) });
});
slFont.addEventListener('input', () => {
  valFont.textContent = `${slFont.value}px`;
  window.tpSettings.previewAppearance({ fontSize: parseInt(slFont.value, 10) });
});
slScroll.addEventListener('input', () => { valScroll.textContent = `${slScroll.value}px`; });
slSpeed.addEventListener('input',  () => {
  valSpeed.textContent = `${slSpeed.value}px/s`;
  window.tpSettings.previewAppearance({ scrollSpeed: parseInt(slSpeed.value, 10) });
});
slRms.addEventListener('input',    () => { valRms.textContent = slRms.value; });
pkColor.addEventListener('input',  () => {
  colorHex.textContent = pkColor.value;
  syncPresetHighlight();
  window.tpSettings.previewAppearance({ fontColor: pkColor.value });
});

document.querySelectorAll('.preset').forEach(btn => {
  btn.addEventListener('click', () => {
    pkColor.value        = btn.dataset.color;
    colorHex.textContent = btn.dataset.color;
    syncPresetHighlight();
    window.tpSettings.previewAppearance({ fontColor: btn.dataset.color });
  });
});

function syncPresetHighlight() {
  document.querySelectorAll('.preset').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.color.toLowerCase() === pkColor.value.toLowerCase())
  );
}

// ── Reset prompt ──────────────────────────────────────────────────────────────
const DEFAULT_SYSTEM_PROMPT = 'You are a helpful assistant supporting a sales or technical presentation. The presenter received a question from a client and needs a concise answer they can read aloud. Respond in the same language as the question. Keep your answer clear and under 4 sentences.';

btnResetPrompt.addEventListener('click', () => {
  systemPromptEl.value = DEFAULT_SYSTEM_PROMPT;
});

// ── Browser tab ───────────────────────────────────────────────────────────────
const browserUrlInput   = document.getElementById('browser-url');
const btnLoadUrl        = document.getElementById('btn-load-url');
const quickLinksList    = document.getElementById('quick-links-list');
const quickLinksCount   = document.getElementById('quick-links-count');
const quickLinksFull    = document.getElementById('quick-links-full');
const addLinkForm       = document.getElementById('add-link-form');
const newLinkLabel      = document.getElementById('new-link-label');
const newLinkUrl        = document.getElementById('new-link-url');
const btnAddLink        = document.getElementById('btn-add-link');
const QUICK_LINKS_MAX   = 10;

let quickLinks = [];

function renderQuickLinks() {
  quickLinksList.innerHTML = '';
  const count = quickLinks.length;
  quickLinksCount.textContent = `(${count}/10)`;
  const full = count >= QUICK_LINKS_MAX;
  quickLinksFull.style.display = full ? '' : 'none';
  addLinkForm.style.display    = full ? 'none' : '';

  quickLinks.forEach((link, idx) => {
    const row = document.createElement('div');
    row.className = 'quick-link-row';

    const btn = document.createElement('button');
    btn.className    = 'quick-url-btn';
    btn.textContent  = link.label;
    btn.title        = link.url;
    btn.addEventListener('click', () => {
      browserUrlInput.value = link.url;
      loadBrowserUrl();
    });

    const del = document.createElement('button');
    del.className   = 'quick-link-delete';
    del.textContent = '×';
    del.title       = 'Remove this link';
    del.addEventListener('click', () => {
      quickLinks.splice(idx, 1);
      renderQuickLinks();
    });

    row.appendChild(btn);
    row.appendChild(del);
    quickLinksList.appendChild(row);
  });
}

btnAddLink.addEventListener('click', () => {
  const label = newLinkLabel.value.trim();
  let   url   = newLinkUrl.value.trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  if (quickLinks.length >= QUICK_LINKS_MAX) return;
  quickLinks.push({ label: label || url, url });
  newLinkLabel.value = '';
  newLinkUrl.value   = '';
  renderQuickLinks();
});

newLinkUrl.addEventListener('keydown', e => {
  if (e.key === 'Enter') btnAddLink.click();
});

function loadBrowserUrl() {
  let url = browserUrlInput.value.trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  window.tpSettings.loadBrowserUrl(url);
}

btnLoadUrl.addEventListener('click', loadBrowserUrl);
browserUrlInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') loadBrowserUrl();
});

// ── Load / populate / build config ───────────────────────────────────────────
let originalConfig = null;

async function loadConfig() {
  const cfg = await window.tpSettings.getConfig();
  originalConfig = JSON.parse(JSON.stringify(cfg));
  // Init Controller protect button state
  updateProtectButton(cfg.__controllerProtected ?? false);
  await populate(cfg);
}

async function populate(cfg) {
  // Provider selectors
  providerSel.value      = cfg.provider              || 'azure';
  transcriptionSel.value = cfg.transcriptionProvider || 'openai';

  // Load all provider credentials into providerConfigs store
  providerConfigs = {
    azure:     { ...(cfg.azure     || {}) },
    openai:    { ...(cfg.openai    || {}) },
    groq:      { ...(cfg.groq      || {}) },
    anthropic: { ...(cfg.anthropic || {}) },
    gemini:    { ...(cfg.gemini    || {}) },
    mistral:   { ...(cfg.mistral   || {}) },
  };
  updateProviderBadge('badge-chat',          providerSel.value);
  updateProviderBadge('badge-transcription', transcriptionSel.value);

  // Q&A prompt
  systemPromptEl.value    = cfg.systemPrompt       || '';
  presentationCtxEl.value = cfg.presentationContext || '';

  // Appearance
  const a = cfg.appearance || {};
  slOpacity.value        = a.opacity    ?? 75;
  slFont.value           = a.fontSize   ?? 22;
  pkColor.value          = a.fontColor  || '#f0f0f0';
  slScroll.value         = a.scrollStep ?? 120;
  slSpeed.value          = a.scrollSpeed ?? 50;
  slRms.value            = a.voiceRmsThreshold ?? 15;
  valOpacity.textContent = `${slOpacity.value}%`;
  valFont.textContent    = `${slFont.value}px`;
  valScroll.textContent  = `${slScroll.value}px`;
  valSpeed.textContent   = `${slSpeed.value}px/s`;
  valRms.textContent     = slRms.value;
  colorHex.textContent   = pkColor.value;
  syncPresetHighlight();

  updateScrollSettings('manual');

  // Browser quick links
  quickLinks = Array.isArray(cfg.quickLinks) ? [...cfg.quickLinks] : [];
  renderQuickLinks();

  // Audio
  const recSource = cfg.audioRecordingSource || 'microphone';
  recSourceInputs.forEach(r => { r.checked = r.value === recSource; });
  await populateAudioDevices(cfg.audioDeviceId || '');
  await populateOutputDevices(cfg.audioOutputDeviceId || '');
}

function buildConfig() {
  return {
    provider:              providerSel.value,
    transcriptionProvider: transcriptionSel.value,
    azure:     { ...providerConfigs.azure     },
    openai:    { ...providerConfigs.openai    },
    groq:      { ...providerConfigs.groq      },
    anthropic: { ...providerConfigs.anthropic },
    gemini:    { ...providerConfigs.gemini    },
    mistral:   { ...providerConfigs.mistral   },
    appearance: {
      opacity:           parseInt(slOpacity.value, 10),
      fontSize:          parseInt(slFont.value, 10),
      fontColor:         pkColor.value,
      scrollStep:        parseInt(slScroll.value, 10),
      scrollSpeed:       parseInt(slSpeed.value, 10),
      voiceRmsThreshold: parseInt(slRms.value, 10),
    },
    audioDeviceId:        audioDeviceSel.value || '',
    audioOutputDeviceId:  audioOutputSel.value || '',
    audioRecordingSource: [...recSourceInputs].find(r => r.checked)?.value || 'microphone',
    systemPrompt:         systemPromptEl.value.trim(),
    presentationContext:  presentationCtxEl.value.trim(),
    quickLinks:           quickLinks.slice(),
  };
}

// ── Audio device enumeration ───────────────────────────────────────────────────
async function populateAudioDevices(savedId = '') {
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    probe.getTracks().forEach(t => t.stop());
    audioPemHint.style.display = 'none';
  } catch {
    audioPemHint.style.display = '';
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs  = devices.filter(d => d.kind === 'audioinput');
  audioDeviceSel.innerHTML = '<option value="">System default</option>';
  for (const d of inputs) {
    const opt       = document.createElement('option');
    opt.value       = d.deviceId;
    opt.textContent = d.label || `Microphone (${d.deviceId.slice(0, 8)}…)`;
    audioDeviceSel.appendChild(opt);
  }
  const target = savedId || audioDeviceSel.value;
  if (target && [...audioDeviceSel.options].some(o => o.value === target))
    audioDeviceSel.value = target;
}

async function populateOutputDevices(savedId = '') {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const outputs = devices.filter(d => d.kind === 'audiooutput');
  audioOutputSel.innerHTML = '<option value="">System default</option>';
  for (const d of outputs) {
    const opt       = document.createElement('option');
    opt.value       = d.deviceId;
    opt.textContent = d.label || `Speaker (${d.deviceId.slice(0, 8)}…)`;
    audioOutputSel.appendChild(opt);
  }
  const target = savedId || audioOutputSel.value;
  if (target && [...audioOutputSel.options].some(o => o.value === target))
    audioOutputSel.value = target;
}

document.getElementById('btn-refresh-audio').addEventListener('click', () =>
  populateAudioDevices(audioDeviceSel.value)
);
// btn-refresh-output may not exist (section hidden), guard it
const btnRefreshOutput = document.getElementById('btn-refresh-output');
if (btnRefreshOutput) {
  btnRefreshOutput.addEventListener('click', () => populateOutputDevices(audioOutputSel.value));
}

// ── Save / Cancel ─────────────────────────────────────────────────────────────
btnSave.addEventListener('click', async () => {
  btnSave.disabled       = true;
  saveStatus.textContent = 'Saving…';
  saveStatus.className   = '';
  try {
    const r = await window.tpSettings.saveConfig(buildConfig());
    if (r.ok) {
      saveStatus.textContent = '✅ Saved!';
      saveStatus.className   = 'ok';
      originalConfig = buildConfig();
      setTimeout(() => { saveStatus.textContent = ''; saveStatus.className = ''; }, 3000);
    } else {
      saveStatus.textContent = '❌ Save failed';
      saveStatus.className   = 'err';
    }
  } catch (e) {
    saveStatus.textContent = `❌ ${e.message}`;
    saveStatus.className   = 'err';
  } finally {
    btnSave.disabled = false;
  }
});

btnCancel.addEventListener('click', () => {
  if (originalConfig) populate(originalConfig);
  saveStatus.textContent = '';
  saveStatus.className   = '';
});

// ── Boot ──────────────────────────────────────────────────────────────────────
loadConfig();
