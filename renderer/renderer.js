'use strict';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const appEl      = document.getElementById('app');
const contentEl  = document.getElementById('content');
const viewportEl = document.getElementById('viewport');
const filenameEl = document.getElementById('filename');
const slOpacity  = document.getElementById('sl-opacity');
const slFont     = document.getElementById('sl-font');
const pkColor    = document.getElementById('pk-color');
const btnMove     = document.getElementById('btn-move');
const btnOpen     = document.getElementById('btn-open');
const btnClose    = document.getElementById('btn-close');
const btnMinimize = document.getElementById('btn-minimize');
const btnSettings = document.getElementById('btn-settings');
const btnRecord   = document.getElementById('btn-record');
const btnProtect  = document.getElementById('btn-protect');
const progFill    = document.getElementById('progress-fill');

// Q&A DOM refs
const qaPanel     = document.getElementById('qa-panel');
const qaStatusMsg = document.getElementById('qa-status-msg');
const qaBody      = document.getElementById('qa-body');
const qaQuestion  = document.getElementById('qa-question');
const qaAnswer    = document.getElementById('qa-answer');
const recLabel    = document.getElementById('rec-label');

// ── State ─────────────────────────────────────────────────────────────────────
let scrollY      = 0;
let maxScroll    = 0;
let uiVisible    = false;
let moveMode     = false;
let isRecording  = false;
let currentMode  = 'script'; // 'script' | 'qa'
let mediaRecorder = null;
let audioChunks   = [];
let savedAudioDeviceId = ''; // set via apply-config when settings are saved

// ── Move Mode ─────────────────────────────────────────────────────────────────
// Ctrl+Alt+Home (or 🔓 button) toggles interactive/click-through.
// In Move Mode: window is fully interactive, user can drag the title bar area
// and resize from edges. Blue border gives visual confirmation.

window.tp.onMoveMode((active) => {
  moveMode = active;
  appEl.classList.toggle('move-mode', active);
  btnMove.textContent = active ? '🔒' : '🔓';
  btnMove.title       = active
    ? 'Lock (click-through mode) — Ctrl+Alt+Home'
    : 'Move/Resize Mode — Ctrl+Alt+Home';

  // In move mode control bar stays visible without hover
  if (active) {
    appEl.classList.add('ui-visible');
  } else if (!uiVisible) {
    appEl.classList.remove('ui-visible');
  }
});

btnMove.addEventListener('click', () => window.tp.toggleMoveMode());

// ── Mouse tracking ────────────────────────────────────────────────────────────
// With setIgnoreMouseEvents(true, { forward: true }), the renderer still
// receives mousemove events. We use Y-position to toggle the control bar.
// This only affects the BUTTONS (not drag — drag requires Move Mode).

const CTRL_ZONE = 70;

document.addEventListener('mousemove', (e) => {
  if (moveMode) return; // move mode manages interaction itself
  const inZone = e.clientY < CTRL_ZONE;
  if (inZone === uiVisible) return;
  uiVisible = inZone;
  appEl.classList.toggle('ui-visible', uiVisible);
  window.tp.setIgnoreMouse(!uiVisible);
});

document.addEventListener('mouseleave', () => {
  if (moveMode) return;
  uiVisible = false;
  appEl.classList.remove('ui-visible');
  window.tp.setIgnoreMouse(true);
});

// ── Hotkey status ─────────────────────────────────────────────────────────────
window.tp.onHotkeyStatus(({ registered, failed }) => {
  if (registered.length) console.log('✅ Hotkeys:', registered.join(', '));
  if (failed.length)     console.warn('❌ Failed:', failed.join(', '));
});

// ── Script loading ────────────────────────────────────────────────────────────
window.tp.onLoadScript(({ text, filePath }) => {
  contentEl.textContent = text;
  scrollY = 0;
  applyScroll();

  const name = filePath.replace(/\\/g, '/').split('/').pop();
  filenameEl.textContent = name;

  requestAnimationFrame(recalcMaxScroll);
});

// ── Scrolling ─────────────────────────────────────────────────────────────────
window.tp.onScroll((delta) => {
  recalcMaxScroll();
  scrollY = Math.max(0, Math.min(maxScroll, scrollY + delta));
  applyScroll();
  updateProgress();
});

function applyScroll() {
  contentEl.style.transform = `translateY(${-scrollY}px)`;
}

function recalcMaxScroll() {
  maxScroll = Math.max(0, contentEl.scrollHeight - viewportEl.clientHeight);
}

function updateProgress() {
  const pct = maxScroll > 0 ? (scrollY / maxScroll) * 100 : 0;
  progFill.style.width = `${pct.toFixed(1)}%`;
}

// ── Mode tabs ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.mode-tab').forEach(btn => {
  btn.addEventListener('click', () => setMode(btn.dataset.mode));
});

function setMode(mode) {
  currentMode = mode;
  appEl.classList.toggle('qa-mode', mode === 'qa');
  document.querySelectorAll('.mode-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.mode === mode)
  );
}

// ── Recording (MediaRecorder → Whisper → GPT) ─────────────────────────────────
// Press R to start, press R again to stop → audio sent to Whisper → GPT answers.

window.tp.onToggleRecording(() => toggleRecording());
btnRecord.addEventListener('click', () => toggleRecording());

async function toggleRecording() {
  if (isRecording) stopRecording();
  else             await startRecording();
}

async function startRecording() {
  try {
    const audioConstraints = savedAudioDeviceId
      ? { deviceId: { exact: savedAudioDeviceId } }
      : true;
    const stream   = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
    audioChunks    = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus' : 'audio/webm';
    mediaRecorder  = new MediaRecorder(stream, { mimeType });
    mediaRecorder.addEventListener('dataavailable', e => {
      if (e.data.size > 0) audioChunks.push(e.data);
    });
    mediaRecorder.addEventListener('stop', onRecordingStopped);
    mediaRecorder.start(500);

    setRecordingUI(true);
    showQAStatus('🎤 Recording… press R again to stop');
    setMode('qa');
  } catch (e) {
    showQAStatus(`❌ Microphone error: ${e.message}`);
    setMode('qa');
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
  }
  setRecordingUI(false);
  recLabel.textContent = '⏳';
}

async function onRecordingStopped() {
  const mimeType = mediaRecorder?.mimeType || 'audio/webm';
  const blob     = new Blob(audioChunks, { type: mimeType });
  audioChunks    = [];

  showQAStatus('⏳ Transcribing with Whisper…');
  try {
    const arrayBuffer   = await blob.arrayBuffer();
    const transcription = await window.tp.transcribeAudio(arrayBuffer);
    if (!transcription.ok) {
      showQAStatus(`❌ ${transcription.error}`);
      recLabel.textContent = 'REC';
      return;
    }
    const question = transcription.text;
    showQAStatus('🤖 Getting AI response…');
    const ai = await window.tp.getAIResponse(question);
    recLabel.textContent = 'REC';
    if (!ai.ok) {
      showQAStatus(`❌ ${ai.error}`);
    } else {
      qaStatusMsg.textContent = '';
      qaQuestion.textContent  = question;
      qaAnswer.textContent    = ai.text;
    }
  } catch (e) {
    showQAStatus(`❌ ${e.message}`);
    recLabel.textContent = 'REC';
  }
}

function setRecordingUI(active) {
  isRecording = active;
  appEl.classList.toggle('recording', active);
  btnRecord.classList.toggle('recording', active);
  btnRecord.title      = active ? 'Stop recording (Ctrl+Alt+R)' : 'Start recording (Ctrl+Alt+R)';
  recLabel.textContent = 'REC';
}

window.tp.onSwitchMode(() => setMode(currentMode === 'script' ? 'qa' : 'script'));

function showQAStatus(msg) {
  qaStatusMsg.textContent = msg;
  qaQuestion.textContent  = '';
  qaAnswer.textContent    = '';
}

// ── Screen-share protection toggle ───────────────────────────────────────────────────
function applyProtectState(isProtected) {
  if (isProtected) {
    btnProtect.textContent = '🙈';
    btnProtect.title       = 'Hidden in screen share — click to show';
    btnProtect.style.color = '';
  } else {
    btnProtect.textContent = '👁️';
    btnProtect.title       = 'Visible in screen share — click to hide';
    btnProtect.style.color = '#ff6b6b';
  }
}

window.tp.onProtectState((isProtected) => applyProtectState(isProtected));
btnProtect.addEventListener('click', () => window.tp.toggleProtect());

// ── Apply config from main (on startup or after Settings save) ────────────────
window.tp.onApplyConfig((a) => {
  if (a.opacity    != null) { slOpacity.value = a.opacity;   document.documentElement.style.setProperty('--bg-opacity', a.opacity / 100); }
  if (a.fontSize   != null) { slFont.value    = a.fontSize;  document.documentElement.style.setProperty('--font-size',  `${a.fontSize}px`); requestAnimationFrame(recalcMaxScroll); }
  if (a.fontColor  != null) { pkColor.value   = a.fontColor; document.documentElement.style.setProperty('--font-color', a.fontColor); }
  if (a.audioDeviceId != null) savedAudioDeviceId = a.audioDeviceId;
});

// ── Controls ──────────────────────────────────────────────────────────────────
slOpacity.addEventListener('input', () => {
  document.documentElement.style.setProperty('--bg-opacity', slOpacity.value / 100);
  window.tp.updateAppearance({ opacity: parseInt(slOpacity.value, 10) });
});

slFont.addEventListener('input', () => {
  document.documentElement.style.setProperty('--font-size', `${slFont.value}px`);
  window.tp.updateAppearance({ fontSize: parseInt(slFont.value, 10) });
  requestAnimationFrame(recalcMaxScroll);
});

pkColor.addEventListener('input', () => {
  document.documentElement.style.setProperty('--font-color', pkColor.value);
  window.tp.updateAppearance({ fontColor: pkColor.value });
});

btnOpen.addEventListener('click',     () => window.tp.openFile());
btnSettings.addEventListener('click', () => window.tp.openSettings());
btnClose.addEventListener('click',    () => window.tp.quit());
btnMinimize.addEventListener('click', () => window.tp.minimize());

// ── Resize observer ───────────────────────────────────────────────────────────
new ResizeObserver(() => recalcMaxScroll()).observe(viewportEl);
