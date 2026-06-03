# Contributing to onAIr

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Git](https://git-scm.com/)
- Windows 10/11 x64

## Development setup

```bash
git clone https://github.com/rafasouza_microsoft/onair.git
cd onair
npm install
```

**Important — Clawpilot environment only:**  
Clawpilot sets `ELECTRON_RUN_AS_NODE=1` which breaks Electron. Always launch via:

```bash
start.cmd
```

On a standard terminal (outside Clawpilot) `npm start` works fine.

## Running locally

```bash
# Launch the app (dev mode — runs from source, no build needed)
start.cmd        # or: npm start
```

Changing any file in `renderer/` or `main.js` takes effect on the next app launch.  
No rebuild or reinstall needed during development.

## Building the Windows installer

### One-time setup — winCodeSign cache fix

electron-builder downloads `winCodeSign` (a code-signing toolchain) even when signing is
disabled. The archive contains macOS symlinks that Windows cannot extract without
**Developer Mode** or admin privileges, causing the build to fail with:

```
ERROR: Cannot create symbolic link : A required privilege is not held by the client.
```

**Fix (run once, no admin required):**

```powershell
# 1. Attempt the build — it will fail, but it partially extracts winCodeSign
npm run build

# 2. Find the partial extraction directory (a random number folder)
$cacheDir = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
$partial = Get-ChildItem $cacheDir -Directory | Select-Object -First 1

# 3. Remove everything else and rename the good extraction to the expected name
Get-ChildItem $cacheDir | Where-Object { $_.Name -ne $partial.Name } | Remove-Item -Recurse -Force
Rename-Item "$cacheDir\$($partial.Name)" "$cacheDir\winCodeSign-2.6.0"
```

> **Why this works:** The macOS symlinks are the *only* files that fail — everything
> electron-builder actually needs for a Windows build (signtool.exe, NSIS, etc.) is
> extracted successfully. The directory just needs to be renamed to the expected cache
> name so electron-builder skips the re-download.

### Running the build

```bash
npm run build          # → dist/onAIr Setup x.x.x.exe  (NSIS installer)
npm run build:portable # → dist/onAIr x.x.x.exe        (no install needed)
```

Output goes to `dist/`. The `dist/` folder is gitignored.

## Releasing a new version

1. Make and test your changes locally
2. Bump the version in `package.json`
3. Commit, tag, and push:

```bash
git add -A
git commit -m "chore: bump to v1.x.x"
git tag v1.x.x
git push origin master --tags
```

4. GitHub Actions (`.github/workflows/build.yml`) automatically:
   - Runs `npm ci` and `electron-builder --win` on `windows-latest`
   - Attaches the `.exe` to a new GitHub Release

> **Or build locally** and upload manually:
> ```bash
> npm run build
> gh release create v1.x.x "dist\onAIr Setup 1.x.x.exe" --title "onAIr v1.x.x" --generate-notes
> ```

## Project structure

```
onair/
├── main.js                  # Electron main process (windows, hotkeys, IPC, AI calls)
├── preload.js               # IPC bridge for the overlay window
├── preload-settings.js      # IPC bridge for the Settings window
├── start.cmd                # Dev launcher (clears ELECTRON_RUN_AS_NODE)
├── assets/
│   └── app-icon.ico         # App icon
└── renderer/
    ├── index.html           # Overlay UI
    ├── renderer.js          # Overlay logic (recording, scrolling, Q&A display)
    ├── style.css            # Overlay styles
    ├── settings.html        # Settings window UI
    ├── settings.js          # Settings logic (provider config, audio devices)
    └── settings.css         # Settings styles
```

## AI provider configuration

Settings are stored in `%APPDATA%\onAIr\config.json` (never committed).

| Provider | What you need |
|----------|--------------|
| **Groq** | Free API key at [console.groq.com](https://console.groq.com) → API Keys |
| **OpenAI** | API key at [platform.openai.com](https://platform.openai.com) → API keys |
| **Azure OpenAI** | Endpoint + key from Azure Portal → your Azure OpenAI resource → Keys and Endpoint |

## Known issues

| Issue | Status | Workaround |
|-------|--------|------------|
| winCodeSign symlink error on first build | Persistent (electron-builder bug on Windows without Developer Mode) | See one-time setup above |
| System tray shows Electron icon when launched via desktop shortcut | Open (Phase 4) | Pin the onAIr tray icon instead |
