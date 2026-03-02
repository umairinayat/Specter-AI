<p align="center">
  <img src="https://img.shields.io/badge/Specter_AI-7C3AED?style=for-the-badge&logoColor=white" alt="Specter AI" height="40" />
</p>

<h1 align="center">Specter AI</h1>

<p align="center">
  <strong>The AI copilot no one else can see.</strong>
</p>

<p align="center">
  Open-source, privacy-first AI screen & meeting copilot.<br>
  Invisible overlay powered by <a href="https://openrouter.ai">OpenRouter</a>. Bring your own API key.
</p>

<p align="center">
  <a href="#features">Features</a> &bull;
  <a href="#installation">Installation</a> &bull;
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#architecture">Architecture</a> &bull;
  <a href="#contributing">Contributing</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/github/license/specter-ai/specter-ai?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/electron-33+-47848F?style=flat-square&logo=electron" alt="Electron" />
  <img src="https://img.shields.io/badge/react-18-61DAFB?style=flat-square&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/typescript-5-3178C6?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/openrouter-500%2B_models-7C3AED?style=flat-square" alt="OpenRouter" />
</p>

---

## What is Specter AI?

Specter AI is a desktop application that overlays AI-powered assistance on your screen during meetings, interviews, and work sessions. The overlay is **invisible to screen-sharing software** (Zoom, Google Meet, Teams), so only you can see it.

- Reads your screen via OCR and transcribes meeting audio in real time
- Sends context to any AI model on OpenRouter (500+ models including GPT-4, Claude, Gemini, Llama, DeepSeek)
- Streams responses into a translucent overlay that stays on top of all windows
- Runs locally -- no data leaves your machine except the AI API call

Think of it as a free, open-source, privacy-first alternative to Cluely.

---

## Features

### Invisible Overlay
- Transparent, always-on-top window with glass morphism styling
- Invisible to screen share on macOS (`type: 'panel'` + screen-saver level) and Windows (`setContentProtection`)
- Draggable, collapsible to a small pill when not in use

### Screen Reading (OCR)
- Captures your screen on demand via global hotkey
- Extracts text using Tesseract.js OCR in a worker thread (non-blocking)
- Smart context: sends screen text as part of your AI prompt

### Live Audio Transcription
- Records microphone audio in real time via `mic` package
- Transcribes every 10 seconds using OpenAI Whisper API
- Rolling transcript buffer (last ~60s of conversation) fed into AI context

### AI Integration
- Powered by [OpenRouter](https://openrouter.ai) -- access 500+ AI models with one API key
- Streaming responses with real-time token count and cost display
- Configurable system prompt and model selection

### Playbooks
- Upload context documents (meeting prep, job descriptions, notes)
- Active playbooks are automatically injected into every AI prompt
- Create, edit, toggle, and delete playbooks from the dashboard

### Dashboard
- Settings: API key, overlay opacity, hotkeys, system prompt
- Models: browse and select from default or fetched OpenRouter models
- Playbooks: manage your context documents
- History: browse and revisit past conversations

### Global Hotkeys
| Shortcut | Action |
|---|---|
| `Ctrl+Enter` / `Cmd+Enter` | Ask AI with current context |
| `Ctrl+Shift+Enter` / `Cmd+Shift+Enter` | Ask AI with screenshot |
| `Ctrl+\` / `Cmd+\` | Toggle overlay visibility |
| `Ctrl+Shift+Space` / `Cmd+Shift+Space` | Toggle audio recording |

---

## Installation

### Download Pre-Built Binaries

Download the latest release for your platform from the [Releases](https://github.com/specter-ai/specter-ai/releases) page:

| Platform | Format |
|---|---|
| Windows | `.exe` (NSIS installer) or portable `.exe` |
| macOS | `.dmg` (Intel & Apple Silicon) |
| Linux | `.AppImage` or `.deb` |

### Build from Source

**Prerequisites:** Node.js 18+ and npm

```bash
# Clone the repository
git clone https://github.com/specter-ai/specter-ai.git
cd specter-ai

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for your platform
npm run build:win     # Windows
npm run build:mac     # macOS
npm run build:linux   # Linux
```

---

## Quick Start

1. **Launch Specter AI** -- the overlay appears in the top-right corner of your screen
2. **Open Settings** (right-click the system tray icon > Settings, or use the dashboard)
3. **Enter your OpenRouter API key** -- get one free at [openrouter.ai/keys](https://openrouter.ai/keys)
4. **Select a model** -- `google/gemini-flash-1.5` is recommended for speed; `meta-llama/llama-3.1-8b-instruct:free` for free testing
5. **Use it:**
   - Type a question in the overlay and press Enter
   - Press `Ctrl+Enter` to ask with screen context
   - Press `Ctrl+Shift+Enter` to include a screenshot
   - Press `Ctrl+Shift+Space` to start/stop audio transcription

---

## Architecture

```
specter-ai/
  src/
    main/                     Electron main process
      index.ts                App entry, window management
      overlay-window.ts       Invisible overlay BrowserWindow
      dashboard-window.ts     Settings dashboard window
      screen-capture.ts       Screenshot + OCR dispatch
      ocr-worker.ts           Tesseract OCR in worker thread
      audio-capture.ts        Mic recording + Whisper transcription
      hotkey-manager.ts       Global keyboard shortcuts
      tray.ts                 System tray menu
      ipc-handlers.ts         IPC bridge (main <-> renderer)

    preload/
      index.ts                Context-isolated IPC bridge

    renderer/
      overlay/                Transparent overlay UI (React)
        App.tsx               Main overlay logic
        ResponseCard.tsx      AI response rendering (markdown)
        TranscriptBar.tsx     Live transcript display

      dashboard/              Settings dashboard UI (React)
        App.tsx               Dashboard shell with sidebar
        pages/
          Settings.tsx        API key, opacity, hotkeys
          Models.tsx          Model browser/selector
          Playbooks.tsx       Context document manager
          History.tsx         Conversation history

    services/
      openrouter.ts           OpenRouter API client (streaming)
      context-builder.ts      Prompt assembly (screen + audio + query)
      store.ts                Persistent settings (electron-store)

    shared/
      types.ts                TypeScript interfaces
      constants.ts            App constants and defaults
      ipc-channels.ts         IPC channel name registry
```

### Data Flow

```
Screen -> screenshot-desktop -> Tesseract.js (worker thread) -> OCR text -\
                                                                           |-> context-builder -> OpenRouter API -> streaming response -> overlay
Microphone -> mic package -> Whisper API -> transcript text --------------/
```

### Privacy Model

- **All processing is local** except the AI API call to OpenRouter
- OCR text and transcript are sent to OpenRouter only when the user triggers a query
- No telemetry, no analytics, no data collection
- API key is stored locally in `electron-store` with obfuscation
- Raw audio and screenshots are never sent anywhere -- only extracted text

---

## Recommended Models

| Model | Speed | Quality | Cost |
|---|---|---|---|
| `google/gemini-flash-1.5` | Very fast | Good | ~$0.075/$0.30 per 1M tokens |
| `anthropic/claude-3-haiku` | Fast | High | ~$0.80/$4 per 1M tokens |
| `deepseek/deepseek-chat` | Fast | High | ~$0.14/$0.28 per 1M tokens |
| `meta-llama/llama-3.1-8b-instruct:free` | Medium | Decent | Free |

Browse all 500+ models at [openrouter.ai/models](https://openrouter.ai/models).

---

## Platform Notes

### macOS
- Overlay is excluded from screen share via `setAlwaysOnTop(true, 'screen-saver')` + `type: 'panel'`
- Requires Screen Recording permission (System Settings > Privacy > Screen Recording)
- Requires Microphone permission for audio transcription
- Works on both Intel and Apple Silicon

### Windows
- Overlay uses `setContentProtection(true)` to hide from screen capture
- Note: this hides the overlay from **all** screen capture including your own screenshots
- No special permissions required

### Linux
- Screen capture exclusion is limited and depends on your compositor
- Wayland support varies; X11 works more reliably
- AppImage is recommended for widest compatibility

---

## Comparison with Cluely

| Feature | Cluely | Specter AI |
|---|---|---|
| Price | $20-49/month | **Free** |
| Source code | Closed | **Open source (MIT)** |
| AI backend | Proprietary | **OpenRouter (500+ models)** |
| Data privacy | Cloud-dependent | **Local-first** |
| Model choice | Fixed | **Any model on OpenRouter** |
| Customization | Limited | **Full system prompt control** |
| Playbooks | Paid feature | **Built-in, free** |
| Self-hosting | No | **Yes** |

---

## Development

```bash
# Start in development mode with hot reload
npm run dev

# Type check
npm run typecheck

# Build renderer + main process
npm run build

# Build distributable for current platform
npm run build:win     # or build:mac / build:linux

# Build unpacked directory (for testing)
npm run build:unpack
```

### Environment Variables

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

The app stores the API key in its Settings UI via `electron-store`, so `.env` is optional and only needed if you want to set it at build time.

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**Quick overview:**
1. Fork the repo
2. Create a branch (`feat/my-feature`)
3. Make your changes
4. Run `npm run typecheck && npm run build` to verify
5. Open a Pull Request

---

## Known Limitations

- **Whisper transcription** uses the OpenAI Whisper API directly (`api.openai.com`), which requires an OpenAI API key. This may not work with OpenRouter-only keys.
- **Windows screen protection** hides the overlay from all capture, including the user's own screenshots.
- **Linux screen share exclusion** is unreliable on Wayland compositors.
- **`zustand` is installed but unused** -- state is currently managed via React hooks + `electron-store`. Future refactor may adopt Zustand.
- **Store encryption key is hardcoded** -- provides obfuscation, not true security. API keys should be treated as stored in plaintext.

---

## License

[MIT](LICENSE) -- free for personal and commercial use.

---

<p align="center">
  Built with Electron, React, TypeScript, and a healthy disregard for subscription fees.
</p>
