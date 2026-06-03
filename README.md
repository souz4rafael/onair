# onAIr

**onAIr** is a transparent, always-on-top teleprompter overlay for Windows — built with Electron. Load a presentation script, keep it on screen while you share your window in Teams or Zoom, and use AI to capture and answer client questions in real time.

![onAIr overlay](assets/app-icon.png)

---

## Features

- **Transparent overlay** — floats above any app; invisible during screen share
- **Click-through** — keyboard and mouse pass to the window underneath
- **Script scrolling** — `Ctrl+Alt+PgUp / PgDn` to scroll without switching focus
- **AI Q&A** — press `Ctrl+Alt+R` to record a client question, get a suggested answer via Whisper + LLM
- **Multi-provider AI** — choose between **Groq** (free), **OpenAI**, or **Azure OpenAI**
- **Audio input selector** — pick your microphone in Settings
- **Right-click `.txt`** → *Open with onAIr* file association

---

## Quick start (development)

### Prerequisites
- [Node.js 18+](https://nodejs.org)
- Windows 10/11

### Install & run

```bash
git clone https://github.com/rafasouza_microsoft/onair.git
cd onair
npm install
start.cmd          # or: npm start
```

> **Important:** `start.cmd` clears `ELECTRON_RUN_AS_NODE` before launching — always use it instead of running `electron .` directly.

---

## Configuration

On first launch, open **Settings** (`Ctrl+Alt+,` or ⚙️ button) and choose your AI provider:

| Provider | Where to get a key | Cost |
|---|---|---|
| **Groq** | [console.groq.com](https://console.groq.com) → API Keys | Free tier |
| **OpenAI** | [platform.openai.com](https://platform.openai.com) → API Keys | Pay-per-use |
| **Azure OpenAI** | Azure Portal → your resource → Keys and Endpoint | Pay-per-use |

Config is stored at `%APPDATA%\onAIr\config.json` — **never committed to the repo**.

### Groq (recommended for getting started)

1. Create a free account at [console.groq.com](https://console.groq.com)
2. Go to **API Keys** → create a key
3. In onAIr Settings → select **Groq** → paste the key → Save
4. Default models: `whisper-large-v3` (transcription) + `llama-3.3-70b-versatile` (Q&A)

---

## Keyboard shortcuts

All shortcuts are **global** — they work even when focus is on another window (Teams, Edge, PowerPoint, etc.).

### Scrolling

| Shortcut | Action |
|---|---|
| `Ctrl+Alt+Page Up` | Scroll script up |
| `Ctrl+Alt+↑` | Scroll script up (alternative) |
| `Ctrl+Alt+Page Down` | Scroll script down |
| `Ctrl+Alt+↓` | Scroll script down (alternative) |

### AI Q&A

| Shortcut | Action |
|---|---|
| `Ctrl+Alt+R` | Start recording client question |
| `Ctrl+Alt+R` *(again)* | Stop recording → transcribe → get AI answer |
| `Ctrl+Alt+M` | Switch between Script view and Q&A answer view |

### App control

| Shortcut | Action |
|---|---|
| `Ctrl+Alt+O` | Open a script file (`.txt`) |
| `Ctrl+Alt+Home` | Toggle Move/Resize mode (drag the overlay around) |
| `Ctrl+Alt+Insert` | Toggle Move/Resize mode (alternative) |
| `Ctrl+Alt+,` | Open Settings |

> **Tip:** Scroll step size is configurable in Settings → Appearance.

---

## Building a Windows installer

```bash
npm run build
```

Outputs `dist/onAIr-Setup-1.0.0.exe` (NSIS installer, x64).

> Requires `electron-builder` (already in devDependencies).

---

## Project structure

```
onair/
├── main.js               # Electron main process — windows, hotkeys, IPC, AI calls
├── preload.js            # IPC bridge for overlay window
├── preload-settings.js   # IPC bridge for settings window
├── renderer/
│   ├── index.html        # Overlay UI
│   ├── renderer.js       # Overlay logic
│   ├── style.css         # Overlay styles
│   ├── settings.html     # Settings window UI
│   ├── settings.js       # Settings logic
│   └── settings.css      # Settings styles
├── assets/
│   ├── app-icon.png      # App icon (256×256)
│   ├── app-icon.ico      # Multi-size ICO for installer
│   └── tray-icon.png     # System tray icon (32×32)
├── start.cmd             # Launch script (clears ELECTRON_RUN_AS_NODE)
└── package.json
```

---

## Contributing

PRs welcome. Each contributor uses their own AI API key — no shared credentials.

---

## License

MIT — see [LICENSE](LICENSE).
