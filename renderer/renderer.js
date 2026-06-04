'use strict';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const appEl      = document.getElementById('app');
const contentEl  = document.getElementById('content');
const viewportEl = document.getElementById('viewport');
const filenameEl = document.getElementById('filename');
const btnMove     = document.getElementById('btn-move');
const btnOpen     = document.getElementById('btn-open');
const btnClose    = document.getElementById('btn-close');
const btnMinimize = document.getElementById('btn-minimize');
const btnSettings = document.getElementById('btn-settings');
const btnRecord   = document.getElementById('btn-record');
const btnProtect  = document.getElementById('btn-protect');
const progFill    = document.getElementById('progress-fill');

// Scroll mode pill tab refs are querySelectorAll('.scroll-tab') — handled in setScrollMode

// Q&A DOM refs
const qaPanel     = document.getElementById('qa-panel');
const qaStatusMsg = document.getElementById('qa-status-msg');
const qaBody      = document.getElementById('qa-body');
const qaQuestion  = document.getElementById('qa-question');
const qaAnswer    = document.getElementById('qa-answer');
const recLabel    = document.getElementById('rec-label');

// Browser DOM refs
const browserPanel = document.getElementById('browser-panel');
const browserView  = document.getElementById('browser-view');

// ── State ─────────────────────────────────────────────────────────────────────
let scrollY      = 0;
let maxScroll    = 0;
let uiVisible    = false;
let moveMode     = true;   // match main.js default: start in move mode
let isRecording  = false;
let currentMode  = 'script'; // 'script' | 'qa' | 'browser'
let mediaRecorder = null;
let audioChunks   = [];
let savedAudioDeviceId    = ''; // set via apply-config when settings are saved
let savedRecordingSource  = 'microphone'; // 'microphone' | 'system' | 'both'

// Scroll mode state
const SCROLL_MODES  = ['manual', 'auto', 'voice']; // 'track' disabled — code preserved below
const SCROLL_ICONS  = { manual: '⏸', auto: '▶', voice: '🎙' };
let scrollMode      = 'manual';
let scrollSpeed     = 50;     // px per second
let autoScrollRaf   = null;
let lastRafTime     = null;
let isSpeaking      = false;

// Voice monitor
let voiceAudioCtx  = null;
let voiceAnalyser  = null;
let voiceStream    = null;
let voiceTimerId   = null;
let voiceRmsThreshold = 0.015; // updated from config (settings value / 1000)

// Word tracking (Whisper-based loop)
let wordSpans          = [];
let trackWordIdx       = 0;
let trackMediaRecorder = null;
let trackStream        = null;

// ── Move Mode ─────────────────────────────────────────────────────────────────
// Ctrl+Alt+Home (or 🔓 button) toggles interactive/click-through.
// In Move Mode: window is fully interactive, user can drag the title bar area
// and resize from edges. Blue border gives visual confirmation.

// Apply initial move-mode state immediately (no IPC wait needed)
appEl.classList.add('move-mode', 'ui-visible');
btnMove.textContent = '🔒';
btnMove.title = 'Lock (click-through mode) — Ctrl+Alt+Home';

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
  tokenizeScript(text);
  scrollY = 0;
  applyScroll();
  updateProgress();

  // Reset word tracking cursor on new script
  trackWordIdx = 0;

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
  appEl.classList.toggle('qa-mode',      mode === 'qa');
  appEl.classList.toggle('browser-mode', mode === 'browser');
  document.querySelectorAll('.mode-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.mode === mode)
  );
}

// ── Browser URL from Controller ───────────────────────────────────────────────
window.tp.onLoadBrowserUrl((url) => {
  setMode('browser'); // show panel first so webview is visible before load
  requestAnimationFrame(() => {
    if (browserView) {
      try { browserView.loadURL(url); } catch { browserView.src = url; }
    }
  });
});

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
    let stream;
    const source = savedRecordingSource || 'microphone';

    if (source === 'microphone') {
      const audioConstraints = savedAudioDeviceId
        ? { deviceId: { exact: savedAudioDeviceId } } : true;
      stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });

    } else if (source === 'system') {
      // Capture system audio via screen-share API (user selects window + checks "share audio")
      const display = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
      display.getVideoTracks().forEach(t => t.stop()); // drop video immediately
      stream = display;

    } else if (source === 'both') {
      const audioConstraints = savedAudioDeviceId
        ? { deviceId: { exact: savedAudioDeviceId } } : true;
      const [micStream, displayStream] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false }),
        navigator.mediaDevices.getDisplayMedia({ audio: true, video: true }),
      ]);
      displayStream.getVideoTracks().forEach(t => t.stop());

      // Mix both streams with AudioContext
      const ctx  = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      ctx.createMediaStreamSource(micStream).connect(dest);
      if (displayStream.getAudioTracks().length)
        ctx.createMediaStreamSource(displayStream).connect(dest);
      stream = dest.stream;
      // Tag for cleanup on stop
      stream._extraTracks = [...micStream.getTracks(), ...displayStream.getTracks()];
      stream._audioCtx    = ctx;
    }

    audioChunks   = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus' : 'audio/webm';
    mediaRecorder  = new MediaRecorder(stream, { mimeType });
    mediaRecorder.addEventListener('dataavailable', e => {
      if (e.data.size > 0) audioChunks.push(e.data);
    });
    mediaRecorder.addEventListener('stop', onRecordingStopped);
    mediaRecorder.start(500);

    setRecordingUI(true);
    const sourceLabel = { microphone: '🎤', system: '🔊', both: '🎤+🔊' }[source] || '🎤';
    showQAStatus(`${sourceLabel} Recording… press R again to stop`);
    setMode('qa');
  } catch (e) {
    showQAStatus(`❌ Audio error: ${e.message}`);
    setMode('qa');
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    const stream = mediaRecorder.stream;
    mediaRecorder.stop();
    // Clean up mixed stream resources
    if (stream._extraTracks) stream._extraTracks.forEach(t => t.stop());
    if (stream._audioCtx)    stream._audioCtx.close().catch(() => {});
    stream.getTracks().forEach(t => t.stop());
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

// ── Apply config from main (on startup or after Settings save/preview) ────────
window.tp.onApplyConfig((a) => {
  if (a.opacity   != null) document.documentElement.style.setProperty('--bg-opacity', a.opacity / 100);
  if (a.fontSize  != null) { document.documentElement.style.setProperty('--font-size', `${a.fontSize}px`); requestAnimationFrame(recalcMaxScroll); }
  if (a.fontColor != null) document.documentElement.style.setProperty('--font-color', a.fontColor);
  if (a.audioDeviceId    != null) savedAudioDeviceId   = a.audioDeviceId;
  if (a.audioRecordingSource != null) savedRecordingSource = a.audioRecordingSource;
  if (a.scrollSpeed   != null) scrollSpeed = a.scrollSpeed;
  if (a.voiceRmsThreshold != null) voiceRmsThreshold = a.voiceRmsThreshold / 1000;
});

// ── Controls ──────────────────────────────────────────────────────────────────

btnOpen.addEventListener('click',     () => window.tp.openFile());
btnSettings.addEventListener('click', () => window.tp.openSettings());
btnClose.addEventListener('click',    () => window.tp.quit());
btnMinimize.addEventListener('click', () => window.tp.minimize());

// ── Resize observer ───────────────────────────────────────────────────────────
new ResizeObserver(() => recalcMaxScroll()).observe(viewportEl);

// ── Scroll mode pill tabs ─────────────────────────────────────────────────────

document.querySelectorAll('.scroll-tab').forEach(btn => {
  btn.addEventListener('click', () => setScrollMode(btn.dataset.mode));
});

// Remote scroll-by from Controller window
window.tp.onScrollBy(delta => {
  recalcMaxScroll();
  scrollY = Math.max(0, Math.min(maxScroll, scrollY + delta));
  applyScroll();
  updateProgress();
});

// Remote mode change from Controller window
window.tp.onSetScrollMode(mode => {
  if (SCROLL_MODES.includes(mode)) setScrollMode(mode);
});

function setScrollMode(mode) {
  // Tear down previous mode
  stopAutoScroll();
  stopVoiceMonitor();
  stopWordTracking();
  wordSpans.forEach(s => s.classList.remove('word-current', 'word-spoken'));

  scrollMode = mode;
  // Update pill tab active state
  document.querySelectorAll('.scroll-tab').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.mode === mode)
  );
  appEl.dataset.scrollMode = mode;

  if (mode === 'auto')  { startAutoScroll(); }
  if (mode === 'voice') { startVoiceMonitor(); startAutoScroll(); }
  // 'track' disabled — startWordTracking() available but not wired to UI
}

// ── Auto-scroll (RAF loop) ────────────────────────────────────────────────────

function startAutoScroll() {
  lastRafTime = null;
  function tick(ts) {
    if (autoScrollRaf === null) return; // was stopped
    if (!lastRafTime) lastRafTime = ts;
    const dtSec = Math.min((ts - lastRafTime) / 1000, 0.1); // cap at 100ms
    lastRafTime = ts;

    const active = scrollMode === 'auto' || (scrollMode === 'voice' && isSpeaking);
    if (active && scrollY < maxScroll) {
      recalcMaxScroll();
      scrollY = Math.min(maxScroll, scrollY + scrollSpeed * dtSec);
      applyScroll();
      updateProgress();
    }
    autoScrollRaf = requestAnimationFrame(tick);
  }
  autoScrollRaf = requestAnimationFrame(tick);
}

function stopAutoScroll() {
  if (autoScrollRaf !== null) { cancelAnimationFrame(autoScrollRaf); autoScrollRaf = null; }
  lastRafTime = null;
}

// ── Voice-activated scroll (AudioContext RMS) ─────────────────────────────────

async function startVoiceMonitor() {
  try {
    const constraints = savedAudioDeviceId
      ? { audio: { deviceId: { exact: savedAudioDeviceId } }, video: false }
      : { audio: true, video: false };
    voiceStream   = await navigator.mediaDevices.getUserMedia(constraints);
    voiceAudioCtx = new AudioContext();
    voiceAnalyser = voiceAudioCtx.createAnalyser();
    voiceAnalyser.fftSize = 512;
    voiceAudioCtx.createMediaStreamSource(voiceStream).connect(voiceAnalyser);

    const buf = new Float32Array(voiceAnalyser.fftSize);
    function checkVolume() {
      if (scrollMode !== 'voice') return;
      voiceAnalyser.getFloatTimeDomainData(buf);
      const rms  = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
      isSpeaking = rms > voiceRmsThreshold;
      voiceTimerId = setTimeout(checkVolume, 50); // 20 checks/sec
    }
    checkVolume();
  } catch (e) {
    console.warn('[voice-scroll] Mic error:', e.message);
  }
}

function stopVoiceMonitor() {
  if (voiceTimerId)  { clearTimeout(voiceTimerId);  voiceTimerId  = null; }
  if (voiceStream)   { voiceStream.getTracks().forEach(t => t.stop()); voiceStream = null; }
  if (voiceAudioCtx) { voiceAudioCtx.close().catch(() => {}); voiceAudioCtx = null; }
  voiceAnalyser = null;
  isSpeaking    = false;
}

// ── Word tokenizer ────────────────────────────────────────────────────────────

function tokenizeScript(text) {
  contentEl.innerHTML = '';
  wordSpans    = [];
  trackWordIdx = 0;

  // Split on whitespace, keeping the whitespace tokens for layout
  const parts = text.split(/(\s+)/);
  let idx = 0;
  for (const part of parts) {
    if (/^\s+$/.test(part)) {
      // Preserve newlines as actual line breaks
      const lines = part.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (i > 0) contentEl.appendChild(document.createElement('br'));
        if (lines[i]) contentEl.appendChild(document.createTextNode(lines[i]));
      }
    } else if (part.length > 0) {
      const span = document.createElement('span');
      span.className = 'word';
      span.dataset.wordIndex = idx;
      span.textContent = part;
      contentEl.appendChild(span);
      wordSpans.push(span);
      idx++;
    }
  }
}

// ── Word tracking (Web Speech API) ───────────────────────────────────────────

// ── Word tracking (Whisper stop-restart loop) ─────────────────────────────────
// The key issue with MediaRecorder timeslice mode: only the first chunk has the
// WebM container header — subsequent chunks are naked fragments that Whisper
// cannot parse. Fix: stop + restart a fresh recorder every CHUNK_MS so every
// blob is a self-contained, decodable WebM file.
//
// To eliminate the recording gap while Whisper processes, the next recording
// starts immediately on stop — transcription of the previous chunk happens in
// parallel. Only one Whisper call is in-flight at a time; out-of-order results
// are harmless because matchWordInScript only advances forward.

const TRACK_CHUNK_MS = 3500; // ms per recording slice

async function startWordTracking() {
  if (!wordSpans.length) {
    console.warn('[word-track] no word spans — load a script first');
    return;
  }
  try {
    const audioConstraints = savedAudioDeviceId
      ? { deviceId: { exact: savedAudioDeviceId } } : true;
    trackStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
  } catch (e) {
    console.warn('[word-track] mic error:', e.message);
    return;
  }
  recordTrackChunk();
}

async function recordTrackChunk() {
  if (scrollMode !== 'track' || !trackStream) return;

  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus' : 'audio/webm';
  const chunks = [];
  const mr     = new MediaRecorder(trackStream, { mimeType });
  trackMediaRecorder = mr;

  await new Promise(resolve => {
    mr.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    mr.onstop          = resolve;
    mr.start();
    setTimeout(() => { if (mr.state === 'recording') { mr.requestData(); mr.stop(); } }, TRACK_CHUNK_MS);
  });

  // Start next recording immediately — no gap in audio capture
  recordTrackChunk();

  // Transcribe this chunk in parallel (matches advance even if slightly delayed)
  const blob = new Blob(chunks, { type: mimeType });
  if (blob.size < 1000 || scrollMode !== 'track') return;
  try {
    const buf    = await blob.arrayBuffer();
    const result = await window.tp.transcribeAudio(buf);
    if (!result.ok || !result.text || scrollMode !== 'track') return;
    const words  = result.text.trim().split(/\s+/).filter(Boolean);
    for (const word of words) {
      const match = matchWordInScript(word, trackWordIdx);
      if (match !== -1) {
        advanceWordHighlight(match);
        trackWordIdx = match + 1;
      }
    }
  } catch (err) {
    console.warn('[word-track] transcription error:', err.message);
  }
}

function stopWordTracking() {
  if (trackMediaRecorder && trackMediaRecorder.state !== 'inactive') {
    try { trackMediaRecorder.stop(); } catch {}
  }
  if (trackStream) {
    trackStream.getTracks().forEach(t => t.stop());
    trackStream = null;
  }
  trackMediaRecorder = null;
  trackWordIdx = 0;
}

function normalizeWord(w) {
  // Strip punctuation, lowercase — supports accented characters
  return w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function matchWordInScript(spoken, fromIdx) {
  const norm  = normalizeWord(spoken);
  if (!norm) return -1;
  const limit = Math.min(fromIdx + 30, wordSpans.length); // look-ahead window
  for (let i = fromIdx; i < limit; i++) {
    const sw = normalizeWord(wordSpans[i].textContent);
    if (sw === norm || sw.startsWith(norm) || norm.startsWith(sw)) return i;
  }
  return -1;
}

function advanceWordHighlight(idx) {
  // Mark previous word as spoken
  for (let i = 0; i < idx; i++) {
    wordSpans[i].classList.remove('word-current');
    wordSpans[i].classList.add('word-spoken');
  }
  // Highlight current word
  wordSpans[idx].classList.remove('word-spoken');
  wordSpans[idx].classList.add('word-current');

  // Scroll to keep current word at ~35% from top of viewport
  recalcMaxScroll();
  const wordTop = wordSpans[idx].offsetTop;
  const target  = Math.max(0, wordTop - viewportEl.clientHeight * 0.35);
  scrollY = Math.min(maxScroll, target);
  applyScroll();
  updateProgress();
}
