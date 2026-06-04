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

// ── Provider selector ─────────────────────────────────────────────────────────
const providerSel = document.getElementById('ai-provider');

function showProviderSection(p) {
  ['azure', 'openai', 'groq'].forEach(id => {
    document.getElementById(`section-${id}`).style.display = id === p ? '' : 'none';
  });
}

providerSel.addEventListener('change', () => showProviderSection(providerSel.value));

// ── DOM refs — AI ─────────────────────────────────────────────────────────────
// Azure
const azEndpoint    = document.getElementById('az-endpoint');
const azKey         = document.getElementById('az-key');
const azWhisper     = document.getElementById('az-whisper');
const azChat        = document.getElementById('az-chat');
// OpenAI
const oaiKey        = document.getElementById('oai-key');
const oaiWhisperMod = document.getElementById('oai-whisper-model');
const oaiChatMod    = document.getElementById('oai-chat-model');
// Groq
const groqKey       = document.getElementById('groq-key');
const groqWhisperMod = document.getElementById('groq-whisper-model');
const groqChatMod   = document.getElementById('groq-chat-model');
// Q&A prompt
const systemPromptEl       = document.getElementById('system-prompt');
const presentationCtxEl    = document.getElementById('presentation-context');
const btnResetPrompt       = document.getElementById('btn-reset-prompt');

// ── DOM refs — Audio ──────────────────────────────────────────────────────────
const audioDeviceSel    = document.getElementById('audio-device');
const audioOutputSel    = document.getElementById('audio-output-device');
const audioPemHint      = document.getElementById('audio-perm-hint');
const recSourceInputs   = document.querySelectorAll('input[name="rec-source"]');

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
  });
});

// ── Slider live labels + live preview ────────────────────────────────────────
slOpacity.addEventListener('input', () => {
  valOpacity.textContent = `${slOpacity.value}%`;
  window.tpSettings.previewAppearance({ opacity: parseInt(slOpacity.value, 10) });
});
slFont.addEventListener('input', () => {
  valFont.textContent = `${slFont.value}px`;
  window.tpSettings.previewAppearance({ fontSize: parseInt(slFont.value, 10) });
});
slScroll.addEventListener('input',  () => { valScroll.textContent = `${slScroll.value}px`; });
slSpeed.addEventListener('input',   () => {
  valSpeed.textContent = `${slSpeed.value}px/s`;
  window.tpSettings.previewAppearance({ scrollSpeed: parseInt(slSpeed.value, 10) });
});
slRms.addEventListener('input',     () => { valRms.textContent = slRms.value; });
pkColor.addEventListener('input',   () => {
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

// ── Load / populate / build config ───────────────────────────────────────────
let originalConfig = null;

async function loadConfig() {
  const cfg = await window.tpSettings.getConfig();
  originalConfig = JSON.parse(JSON.stringify(cfg));
  populate(cfg);
}

async function populate(cfg) {
  // Provider
  providerSel.value = cfg.provider || 'azure';
  showProviderSection(providerSel.value);

  // Azure
  const az = cfg.azure || {};
  azEndpoint.value = az.endpoint          || '';
  azKey.value      = az.key               || '';
  azWhisper.value  = az.whisperDeployment || '';
  azChat.value     = az.chatDeployment    || '';

  // OpenAI
  const oai = cfg.openai || {};
  oaiKey.value        = oai.key          || '';
  oaiWhisperMod.value = oai.whisperModel || 'whisper-1';
  oaiChatMod.value    = oai.chatModel    || 'gpt-4o';

  // Groq
  const groq = cfg.groq || {};
  groqKey.value        = groq.key          || '';
  groqWhisperMod.value = groq.whisperModel || 'whisper-large-v3';
  groqChatMod.value    = groq.chatModel    || 'llama-3.3-70b-versatile';

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

  // Audio
  const recSource = cfg.audioRecordingSource || 'microphone';
  recSourceInputs.forEach(r => { r.checked = r.value === recSource; });
  await populateAudioDevices(cfg.audioDeviceId || '');
  await populateOutputDevices(cfg.audioOutputDeviceId || '');
}

function buildConfig() {
  return {
    provider: providerSel.value,
    azure: {
      endpoint:          azEndpoint.value.trim(),
      key:               azKey.value.trim(),
      whisperDeployment: azWhisper.value.trim(),
      chatDeployment:    azChat.value.trim(),
    },
    openai: {
      key:          oaiKey.value.trim(),
      whisperModel: oaiWhisperMod.value.trim() || 'whisper-1',
      chatModel:    oaiChatMod.value.trim()    || 'gpt-4o',
    },
    groq: {
      key:          groqKey.value.trim(),
      whisperModel: groqWhisperMod.value.trim() || 'whisper-large-v3',
      chatModel:    groqChatMod.value.trim()    || 'llama-3.3-70b-versatile',
    },
    appearance: {
      opacity:             parseInt(slOpacity.value, 10),
      fontSize:            parseInt(slFont.value, 10),
      fontColor:           pkColor.value,
      scrollStep:          parseInt(slScroll.value, 10),
      scrollSpeed:         parseInt(slSpeed.value, 10),
      voiceRmsThreshold:   parseInt(slRms.value, 10),
    },
    audioDeviceId:       audioDeviceSel.value || '',
    audioOutputDeviceId: audioOutputSel.value || '',
    audioRecordingSource: [...recSourceInputs].find(r => r.checked)?.value || 'microphone',
    systemPrompt:         systemPromptEl.value.trim(),
    presentationContext:  presentationCtxEl.value.trim(),
  };
}

// ── Test connections ──────────────────────────────────────────────────────────
async function runTest(btnEl, resultEl, provider, cfg) {
  btnEl.disabled       = true;
  resultEl.textContent = '⏳ Testing…';
  resultEl.className   = 'test-result';
  try {
    const r = await window.tpSettings.testConnection({ provider, cfg });
    resultEl.textContent = r.ok ? '✅ Connected!' : `❌ ${r.error || 'Failed'}`;
    resultEl.className   = r.ok ? 'test-result ok' : 'test-result err';
  } catch (e) {
    resultEl.textContent = `❌ ${e.message}`;
    resultEl.className   = 'test-result err';
  } finally {
    btnEl.disabled = false;
  }
}

document.getElementById('test-azure').addEventListener('click', () =>
  runTest(document.getElementById('test-azure'), document.getElementById('res-azure'),
    'azure', { endpoint: azEndpoint.value.trim(), key: azKey.value.trim() })
);
document.getElementById('test-openai').addEventListener('click', () =>
  runTest(document.getElementById('test-openai'), document.getElementById('res-openai'),
    'openai', { key: oaiKey.value.trim() })
);
document.getElementById('test-groq').addEventListener('click', () =>
  runTest(document.getElementById('test-groq'), document.getElementById('res-groq'),
    'groq', { key: groqKey.value.trim() })
);

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
  const devices  = await navigator.mediaDevices.enumerateDevices();
  const outputs  = devices.filter(d => d.kind === 'audiooutput');
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

document.getElementById('btn-refresh-output').addEventListener('click', () =>
  populateOutputDevices(audioOutputSel.value)
);

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
