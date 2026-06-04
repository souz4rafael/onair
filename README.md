# onAIr

**onAIr** is a transparent, always-on-top teleprompter overlay for Windows — built with Electron.  
Load a presentation script, keep it floating above your screen share, and use AI to capture and answer client questions in real time.

![onAIr overlay](assets/app-icon.png)

---

## Features

### Overlay
- **Transparent overlay** — floats above any app; invisible during screen share by default
- **Click-through** — keyboard and mouse pass to the window underneath; toggle Move Mode to drag/resize
- **Starts in Move Mode** — position and resize the overlay immediately on launch; press `Ctrl+Alt+Home` to lock
- **Three viewing modes** — Script (teleprompter), Q&A (AI answers), Browser (embedded web page)
- **Right-click `.txt`** → *Open with onAIr* file association

### Script / Teleprompter
- **Manual scroll** — `Ctrl+Alt+PgUp / PgDn` shortcuts (global, even when Teams has focus)
- **Auto-scroll** — continuous smooth scroll at configurable speed
- **Voice-activated scroll** — microphone RMS detection pauses/advances the script when you speak
- **Word highlighting** — text tokenised for word-by-word tracking *(disabled by default, code preserved)*

### AI Q&A
- **Record a client question** — `Ctrl+Alt+R` to capture audio, auto-transcribed via Whisper
- **Instant suggested answer** — transcription sent to your chosen LLM; answer shown in overlay
- **Customisable system prompt** — control tone, length, language, persona
- **Presentation context** — inject a brief description of your session for more relevant answers
- **6 AI providers** — Azure OpenAI, OpenAI, Groq, Anthropic Claude, Google Gemini, Mistral
- **Split transcription/chat providers** — use Groq for Whisper and Anthropic for chat, for example

### Browser overlay
- **Embedded browser** — load any URL directly inside the overlay
- **Editable quick links** — up to 10 custom bookmarks, saved with your config
- **Load from Controller** — type a URL in the Controller → overlay switches to Browser mode

### Controller window
- **Dedicated control panel** — open on a secondary screen or tablet for live adjustments
- **Opens automatically** on launch alongside the overlay
- **Virtual scroll controls** — large ▲▼ touch-friendly buttons
- **Load Script** — file picker from the Controller; filename syncs to overlay
- **Screen-share visibility toggle** — hide/show the Controller window during screen share
- **Resizable** — drag the edges to the width that works for your setup

---

## Quick start (development)

### Prerequisites
- [Node.js 18+](https://nodejs.org)
- Windows 10/11

### Install & run

```bash
git clone https://github.com/souz4rafael/onair.git
cd onair
npm install
.\start.cmd        # always use start.cmd, never electron . directly
```

> **Important:** `start.cmd` clears `ELECTRON_RUN_AS_NODE` before launching — required for Electron to start correctly in this environment.

---

## AI setup

Open the **Controller** (`Ctrl+Alt+,` or 🎛️ button) → **AI tab** → choose a provider and click **⚙ Configure**.

### Chat providers (Q&A answers)

| Provider | Where to get a key | Cost |
|---|---|---|
| **Azure OpenAI** | Azure Portal → your resource → Keys and Endpoint | Pay-per-use |
| **OpenAI** | [platform.openai.com](https://platform.openai.com) → API Keys | Pay-per-use |
| **Groq** | [console.groq.com](https://console.groq.com) → API Keys | **Free tier** |
| **Anthropic Claude** | [console.anthropic.com](https://console.anthropic.com) | Pay-per-use |
| **Google Gemini** | [aistudio.google.com](https://aistudio.google.com) | Free tier |
| **Mistral** | [console.mistral.ai](https://console.mistral.ai) | Pay-per-use |

### Transcription providers (Whisper / speech-to-text)

Only **Azure OpenAI**, **OpenAI** and **Groq** support the Whisper API.  
If you use Anthropic, Gemini or Mistral for chat, set a separate transcription provider in the AI tab.

### Groq — recommended for getting started

1. Create a free account at [console.groq.com](https://console.groq.com)
2. **API Keys** → create a new key
3. Controller → AI tab → select **Groq** → click **⚙ Configure** → paste key → Save
4. Defaults: `whisper-large-v3` (transcription) + `llama-3.3-70b-versatile` (Q&A)

Config is stored at `%APPDATA%\onAIr\config.json` — **never committed to the repo**.

---

## Keyboard shortcuts

All shortcuts are **global** — they work even when another window (Teams, Edge, PowerPoint) has focus.

| Shortcut | Action |
|---|---|
| `Ctrl+Alt+PgUp` | Scroll script up |
| `Ctrl+Alt+PgDn` | Scroll script down |
| `Ctrl+Alt+O` | Open a script file (`.txt`) |
| `Ctrl+Alt+Home` | Toggle Move / Resize mode |
| `Ctrl+Alt+,` | Open Controller |
| `Ctrl+Alt+R` | Start / stop Q&A recording |
| `Ctrl+Alt+M` | Switch Script ↔ Q&A mode |

> `Ctrl+Alt+↑` and `Ctrl+Alt+↓` were removed in v1.2.0 to avoid conflicts with Windows and Teams shortcuts.

---

## Building a Windows installer

```bash
npm run build
```

Outputs `dist/onAIr Setup <version>.exe` (NSIS installer, x64, no code-signing).

> **First build:** electron-builder may download Electron binaries (~80 MB). Subsequent builds are fast.

---

## Project structure

```
onair/
├── main.js               # Electron main process — windows, hotkeys, IPC, AI calls
├── preload.js            # IPC bridge for the overlay window
├── preload-settings.js   # IPC bridge for the Controller window
├── renderer/
│   ├── index.html        # Overlay UI (control bar, viewport, mode bar)
│   ├── renderer.js       # Overlay logic (scroll, recording, Q&A, browser mode)
│   ├── style.css         # Overlay styles
│   ├── settings.html     # Controller UI (tabs: Scroll, Appearance, Audio, AI, Browser, Shortcuts, About)
│   ├── settings.js       # Controller logic
│   └── settings.css      # Controller styles
├── assets/
│   ├── app-icon.png      # App icon (256×256 PNG)
│   ├── app-icon.ico      # Multi-size ICO for installer
│   └── tray-icon.png     # System tray icon (32×32)
├── start.cmd             # Dev launcher — clears ELECTRON_RUN_AS_NODE
└── package.json
```

---

## Architecture notes

- **IPC model**: renderer → preload → main (one-way sends and invoke/handle pairs). Controller and overlay communicate via main as relay.
- **Whisper**: audio recorded as WebM via MediaRecorder; sent to main process via IPC as `ArrayBuffer`; forwarded to provider HTTP endpoint.
- **Transparent window**: `transparent: true`, `frame: false`, `alwaysOnTop: true`. Click-through via `setIgnoreMouseEvents(true, { forward: true })`; Move Mode calls `setIgnoreMouseEvents(false)`.
- **Browser overlay**: `<webview>` tag inside the overlay; requires `webviewTag: true` in BrowserWindow webPreferences.

---

## Contributing

PRs welcome. Each contributor uses their own AI API key — no shared credentials are stored in the repo.

---

## License

MIT — see [LICENSE](LICENSE).
