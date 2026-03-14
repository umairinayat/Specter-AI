# CLAUDE.md — OpenCluely: Open-Source AI Screen & Meeting Copilot

> **Project Codename:** `OpenCluely` (working name — rename as desired)
> **Goal:** A free, open-source, privacy-first alternative to Cluely using OpenRouter as the AI backend, built as a cross-platform desktop app.

---

## 🧠 What Are We Building?

A **desktop app** that:

1. Captures your screen (via OCR) and microphone (via Whisper-style transcription)
2. Sends that context + your query to an **OpenRouter** model of your choice
3. Shows the AI response in an **always-on-top, transparent overlay** that is **invisible to screen capture / screen share**
4. Runs fully locally except the AI API call
5. Is fully open-source and free (BYOK — Bring Your Own OpenRouter API key)

---

## 🏗️ Tech Stack Decision

### Framework: **Electron + React + TypeScript**

Why Electron:
- Cluely itself is built with Electron (confirmed via reverse engineering)
- Provides `transparent: true` and `alwaysOnTop: true` BrowserWindow — the core of the invisible overlay
- Native OS APIs via Node.js (screen capture, audio, global hotkeys)
- Cross-platform: macOS, Windows, Linux from one codebase
- Large ecosystem, easy packaging

### Full Stack:

| Layer | Technology |
|---|---|
| Desktop Shell | Electron 28+ |
| UI Framework | React 18 + TypeScript |
| Styling | Tailwind CSS |
| Screen Capture / OCR | `screenshot-desktop` + `Tesseract.js` |
| Audio Capture | Node.js `mic` / `node-audiorecorder` |
| Speech-to-Text | OpenAI Whisper API (via OpenRouter) or `whisper.cpp` locally |
| AI Backend | OpenRouter API (OpenAI-compatible) |
| Global Hotkeys | `iohook` or `electron-globalshortcut` |
| State Management | Zustand |
| Packaging | `electron-builder` |
| Build Tool | Vite + `electron-vite` |

---

## 📁 Project Structure

```
opencluely/
├── CLAUDE.md                    ← You are here
├── package.json
├── electron.vite.config.ts
├── tsconfig.json
├── .env.example
│
├── src/
│   ├── main/                    ← Electron main process
│   │   ├── index.ts             ← App entry, window management
│   │   ├── overlay-window.ts    ← Invisible overlay BrowserWindow
│   │   ├── dashboard-window.ts  ← Settings/dashboard BrowserWindow
│   │   ├── screen-capture.ts    ← Screenshot + OCR pipeline
│   │   ├── audio-capture.ts     ← Mic recording + transcription
│   │   ├── hotkey-manager.ts    ← Global keyboard shortcuts
│   │   ├── tray.ts              ← System tray icon/menu
│   │   └── ipc-handlers.ts      ← IPC bridge main↔renderer
│   │
│   ├── renderer/                ← Electron renderer (React)
│   │   ├── overlay/             ← The invisible overlay UI
│   │   │   ├── App.tsx
│   │   │   ├── ResponseCard.tsx
│   │   │   ├── TranscriptBar.tsx
│   │   │   └── index.html
│   │   └── dashboard/           ← Settings/config UI
│   │       ├── App.tsx
│   │       ├── pages/
│   │       │   ├── Settings.tsx
│   │       │   ├── Models.tsx
│   │       │   ├── Playbooks.tsx
│   │       │   └── History.tsx
│   │       └── index.html
│   │
│   ├── shared/                  ← Shared types/utils
│   │   ├── types.ts
│   │   ├── constants.ts
│   │   └── ipc-channels.ts
│   │
│   └── services/                ← Core service modules
│       ├── openrouter.ts        ← OpenRouter API client
│       ├── ocr.ts               ← Tesseract OCR wrapper
│       ├── transcription.ts     ← Whisper / STT
│       ├── context-builder.ts   ← Combine screen+audio→prompt
│       └── store.ts             ← Persistent settings (electron-store)
│
├── assets/
│   ├── icon.png
│   └── tray-icon.png
│
└── build/                       ← electron-builder output
```

---

## 🔑 Core Concepts to Implement

### 1. The Invisible Overlay Window

This is the most critical feature. Electron's `BrowserWindow` with these flags makes it invisible to screen share:

```typescript
// src/main/overlay-window.ts
import { BrowserWindow, screen } from 'electron'

export function createOverlayWindow(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  const overlay = new BrowserWindow({
    width: 420,
    height: 600,
    x: width - 440,
    y: 20,
    transparent: true,          // ← transparent background
    frame: false,                // ← no window chrome
    alwaysOnTop: true,           // ← always on top of everything
    skipTaskbar: true,           // ← hidden from taskbar
    resizable: false,
    focusable: false,            // ← doesn't steal focus
    hasShadow: false,
    // The magic flag that makes it invisible to screen share:
    type: 'panel',               // macOS: excluded from screen capture
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  // macOS: set window level above screen saver, excluded from capture
  overlay.setAlwaysOnTop(true, 'screen-saver')
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // Windows: use SetWindowDisplayAffinity to exclude from capture
  // This requires a native module or electron-overlay-window package
  if (process.platform === 'win32') {
    // overlay.setContentProtection(true) — this hides from ALL capture
    // For selective hiding (visible to user, not to screen share), use:
    // native WDA_EXCLUDEFROMCAPTURE via node-ffi or robot.js
  }

  return overlay
}
```

> **macOS Notes:** Using `setAlwaysOnTop(true, 'screen-saver')` + `type: 'panel'` excludes the window from Zoom/Meet screen share on macOS 12.3+.

> **Windows Notes:** `WDA_EXCLUDEFROMCAPTURE` via `SetWindowDisplayAffinity` achieves the same. Use the `electron-overlay-window` npm package or `node-ffi-napi` to call this Win32 API.

---

### 2. Screen Capture + OCR Pipeline

```typescript
// src/main/screen-capture.ts
import screenshot from 'screenshot-desktop'
import Tesseract from 'tesseract.js'

export async function captureScreenText(): Promise<string> {
  // Capture the primary display (excluding our overlay via OS)
  const imgBuffer = await screenshot({ format: 'png' })
  
  const result = await Tesseract.recognize(imgBuffer, 'eng', {
    logger: () => {},  // silence progress logs
  })
  
  return result.data.text.trim()
}

// For faster performance: capture only active window region
export async function captureActiveWindowText(): Promise<string> {
  // Use 'active-win' package to get active window bounds
  // Then pass crop coords to screenshot-desktop
  const imgBuffer = await screenshot({ format: 'png' })
  return (await Tesseract.recognize(imgBuffer, 'eng')).data.text
}
```

---

### 3. Audio Capture + Transcription

```typescript
// src/services/transcription.ts
// Option A: Use OpenRouter's Whisper endpoint (or direct Whisper API)
// Option B: whisper.cpp locally via node bindings (fully offline)

import fs from 'fs'
import path from 'path'
import mic from 'mic'

export class AudioTranscriber {
  private micInstance: any
  private audioChunks: Buffer[] = []
  private isRecording = false

  startRecording() {
    this.micInstance = mic({
      rate: '16000',
      channels: '1',
      fileType: 'wav',
    })
    
    const micStream = this.micInstance.getAudioStream()
    micStream.on('data', (chunk: Buffer) => {
      this.audioChunks.push(chunk)
    })
    
    this.micInstance.start()
    this.isRecording = true
  }

  stopRecording(): Buffer {
    this.micInstance.stop()
    this.isRecording = false
    return Buffer.concat(this.audioChunks)
  }

  async transcribeBuffer(audioBuffer: Buffer): Promise<string> {
    // Save temp file
    const tmpPath = path.join(app.getPath('temp'), 'opencluely-audio.wav')
    fs.writeFileSync(tmpPath, audioBuffer)
    
    // Send to Whisper via OpenRouter or direct Whisper API
    const formData = new FormData()
    formData.append('file', new Blob([audioBuffer]), 'audio.wav')
    formData.append('model', 'openai/whisper-1')

    const response = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getApiKey()}` },
      body: formData,
    })

    const data = await response.json()
    return data.text || ''
  }
}
```

---

### 4. OpenRouter API Client

```typescript
// src/services/openrouter.ts

interface OpenRouterConfig {
  apiKey: string
  model: string          // e.g. "google/gemini-flash-1.5" or "anthropic/claude-3-haiku"
  maxTokens?: number
}

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
}

export async function* streamCompletion(
  messages: Message[],
  config: OpenRouterConfig
): AsyncGenerator<string> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/yourusername/opencluely',
      'X-Title': 'OpenCluely',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: config.maxTokens || 500,
      stream: true,
    }),
  })

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value)
    const lines = chunk.split('\n').filter(l => l.startsWith('data: '))

    for (const line of lines) {
      const data = line.replace('data: ', '')
      if (data === '[DONE]') return

      try {
        const parsed = JSON.parse(data)
        const content = parsed.choices?.[0]?.delta?.content
        if (content) yield content
      } catch {}
    }
  }
}

export async function fetchAvailableModels(apiKey: string) {
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  })
  const data = await res.json()
  return data.data as Array<{
    id: string
    name: string
    pricing: { prompt: string; completion: string }
    context_length: number
  }>
}
```

---

### 5. Context Builder

```typescript
// src/services/context-builder.ts
// Combines screen OCR text + audio transcript + user query into a prompt

interface ContextSnapshot {
  screenText: string
  transcript: string
  userQuery?: string
}

export function buildSystemPrompt(): string {
  return `You are a real-time AI assistant helping the user during meetings, interviews, and work sessions.
You have access to what's on their screen and what's being said.
Give concise, immediately actionable responses.
Format responses for quick reading: use short paragraphs and bullet points.
Never reveal that you are an AI assistant unless directly asked.`
}

export function buildUserMessage(ctx: ContextSnapshot): string {
  const parts: string[] = []

  if (ctx.screenText) {
    parts.push(`[SCREEN CONTENT]\n${ctx.screenText.slice(0, 2000)}`)
  }

  if (ctx.transcript) {
    parts.push(`[RECENT CONVERSATION TRANSCRIPT]\n${ctx.transcript.slice(0, 1500)}`)
  }

  if (ctx.userQuery) {
    parts.push(`[MY QUESTION]\n${ctx.userQuery}`)
  } else {
    parts.push(`[TASK]\nBased on the screen and conversation above, what should I say or do next?`)
  }

  return parts.join('\n\n')
}
```

---

### 6. Global Hotkeys

```typescript
// src/main/hotkey-manager.ts
import { globalShortcut, ipcMain } from 'electron'

export function registerHotkeys(overlayWindow: BrowserWindow) {
  // CMD/CTRL + Enter: Ask AI based on current context
  globalShortcut.register('CommandOrControl+Return', () => {
    overlayWindow.webContents.send('hotkey:ask-ai')
  })

  // CMD/CTRL + Shift + Enter: Ask AI with screenshot
  globalShortcut.register('CommandOrControl+Shift+Return', () => {
    overlayWindow.webContents.send('hotkey:ask-with-screenshot')
  })

  // CMD/CTRL + \: Toggle overlay visibility
  globalShortcut.register('CommandOrControl+\\', () => {
    if (overlayWindow.isVisible()) {
      overlayWindow.hide()
    } else {
      overlayWindow.show()
    }
  })

  // CMD/CTRL + Shift + Space: Push-to-talk toggle
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    overlayWindow.webContents.send('hotkey:toggle-audio')
  })
}
```

---

## 📦 Phase-by-Phase Build Plan

### Phase 1: Foundation (Week 1)
- [ ] Set up `electron-vite` project with TypeScript + React
- [ ] Create transparent, always-on-top overlay window
- [ ] Implement `setWindowDisplayAffinity` / `type: panel` for screen-capture exclusion
- [ ] Basic settings/dashboard window
- [ ] System tray with show/hide controls
- [ ] `electron-store` for persisting API key + settings

### Phase 2: AI Integration (Week 2)
- [ ] OpenRouter API client with streaming support
- [ ] Model selector UI (fetch available models from OpenRouter)
- [ ] API key input and validation in settings
- [ ] Basic text query → streaming response in overlay
- [ ] Cost estimator display (tokens used)

### Phase 3: Screen Context (Week 2-3)
- [ ] `screenshot-desktop` integration
- [ ] `Tesseract.js` OCR pipeline (runs in worker thread)
- [ ] Auto-capture on hotkey press
- [ ] Smart cropping: capture active window only
- [ ] Screenshot preview in overlay before sending

### Phase 4: Audio / Transcription (Week 3-4)
- [ ] Microphone capture via `node-audiorecorder`
- [ ] Rolling transcript buffer (last 60s of conversation)
- [ ] Whisper transcription (cloud via OpenRouter or local via `whisper.cpp`)
- [ ] Real-time transcript display in overlay
- [ ] Toggle audio on/off

### Phase 5: UX Polish (Week 4)
- [ ] Draggable overlay
- [ ] Streaming response animation (typewriter effect)
- [ ] Conversation history sidebar
- [ ] Playbooks: upload PDFs → RAG context injection
- [ ] Dark mode overlay with opacity slider
- [ ] Auto-hide overlay after N seconds

### Phase 6: Open Source Release
- [ ] README with demo GIF
- [ ] GitHub Actions CI/CD (build for macOS, Windows, Linux)
- [ ] `electron-builder` distribution targets:
  - macOS: `.dmg`
  - Windows: `.exe` (NSIS installer)
  - Linux: `.AppImage` + `.deb`
- [ ] License: MIT or Apache 2.0
- [ ] Contribution guidelines

---

## 🔧 Initial Setup Commands

```bash
# 1. Initialize project
npm create @quick-start/electron opencluely -- --template react-ts
cd opencluely

# 2. Install core dependencies
npm install screenshot-desktop tesseract.js mic node-audiorecorder
npm install zustand electron-store @types/node

# 3. Install OpenRouter / AI deps
npm install openai  # OpenAI SDK works with OpenRouter (just change baseURL)

# 4. Install UI deps
npm install tailwindcss @headlessui/react lucide-react
npx tailwindcss init

# 5. Dev tools
npm install -D electron-builder @electron-toolkit/preload
```

---

## 🌐 OpenRouter Integration Notes

OpenRouter uses the **OpenAI-compatible API**. You just change the base URL:

```typescript
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'https://github.com/yourusername/opencluely',
    'X-Title': 'OpenCluely',
  },
})
```

### Recommended Models for This Use Case:

| Model | Use Case | Price (per 1M tokens) |
|---|---|---|
| `google/gemini-flash-1.5` | Fast real-time responses | ~$0.075 in / $0.30 out |
| `anthropic/claude-haiku-4` | Balanced quality + speed | ~$0.80 in / $4 out |
| `deepseek/deepseek-chat` | Cost-effective, high quality | ~$0.14 in / $0.28 out |
| `meta-llama/llama-3.1-8b-instruct:free` | Free tier testing | Free |
| `microsoft/phi-3-mini-128k-instruct:free` | Free, small, fast | Free |

---

## 🔐 Privacy Architecture

**All processing is local except:**
- OCR text + transcript sent to OpenRouter (only when user triggers)
- No persistent storage on any server
- API key stored encrypted in `electron-store`
- No telemetry, no analytics, no data collection

```typescript
// User data flow:
// Screen → OCR (local) → text only → OpenRouter → response → overlay
// Mic → Whisper (local or API) → transcript → OpenRouter → response
// Never: raw audio/screenshots sent anywhere
```

---

## 🖥️ Platform-Specific: Making Overlay Invisible

### macOS (most reliable)
```typescript
win.setAlwaysOnTop(true, 'screen-saver', 1)
win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
// Also set in Info.plist: NSWindowSharingType = NSWindowSharingNone
```

### Windows
```typescript
// Use WDA_EXCLUDEFROMCAPTURE = 0x00000011
// Via electron's built-in (Electron 18+):
win.setContentProtection(true)
// Note: setContentProtection makes it invisible to ALL capture including user's own
// For "invisible to others but visible to user" use native WDA_EXCLUDEFROMCAPTURE
```

### Linux
Screen capture exclusion on Linux is limited. Wayland compositor support varies. X11 works better. Note limitations in README.

---

## 🎨 Overlay UI Design Principles

- **Translucent dark card** — 80% opacity dark background, blur backdrop
- **Max width 400px** — never covers more than 1/3 of screen
- **Draggable** — user can move anywhere
- **Collapse to icon** — minimize to a small pill when not in use
- **Streaming text** — words appear as they stream from API
- **No close button** — use hotkey or tray to hide
- **Accent color** customizable per user preference

---

## 📋 Settings to Expose to User

```typescript
interface UserSettings {
  openrouterApiKey: string
  selectedModel: string           // OpenRouter model ID
  overlayOpacity: number          // 0.6 - 1.0
  overlayPosition: { x: number; y: number }
  hotkeys: {
    askAI: string                 // default: 'CommandOrControl+Return'
    toggleOverlay: string         // default: 'CommandOrControl+\\'
    toggleAudio: string           // default: 'CommandOrControl+Shift+Space'
    screenshotAsk: string         // default: 'CommandOrControl+Shift+Return'
  }
  autoCapture: boolean            // auto-capture screen every N seconds
  autoCaptureInterval: number     // seconds
  maxTranscriptLength: number     // chars to keep in rolling buffer
  systemPrompt: string            // custom system prompt override
  language: string                // transcription language
  theme: 'dark' | 'light' | 'glass'
}
```

---

## 🚀 Differentiators vs Cluely

| Feature | Cluely | OpenCluely |
|---|---|---|
| Price | $20-49/month | **Free** |
| Source code | Closed | **Open source** |
| API | Proprietary | **OpenRouter (500+ models)** |
| Data privacy | Cloud-dependent | **Local-first** |
| Customization | Limited | **Full system prompt control** |
| Model choice | Fixed (GPT-4) | **Any model on OpenRouter** |
| Self-hosting | No | **Yes** |
| Playbooks | Paid feature | **Built-in, free** |

---

## 📌 Key npm Packages Reference

```json
{
  "dependencies": {
    "electron": "^28.0.0",
    "react": "^18.0.0",
    "typescript": "^5.0.0",
    "openai": "^4.0.0",
    "screenshot-desktop": "^1.12.7",
    "tesseract.js": "^5.0.4",
    "electron-store": "^8.1.0",
    "mic": "^2.1.2",
    "zustand": "^4.4.0",
    "tailwindcss": "^3.4.0",
    "lucide-react": "^0.263.0"
  },
  "devDependencies": {
    "electron-builder": "^24.0.0",
    "electron-vite": "^2.0.0",
    "vite": "^5.0.0"
  }
}
```

---

## ⚡ Quick Start: First Working Prototype

To get a working transparent overlay with AI response in the shortest time:

1. `npm create @quick-start/electron opencluely -- --template react-ts`
2. Replace `src/main/index.ts` with overlay window code (transparent + alwaysOnTop)
3. Add a basic React component with a text input and submit button
4. Wire up the OpenRouter streaming call with the OpenAI SDK
5. Style with Tailwind dark glass morphism
6. Add one global hotkey to show/hide

This gives you a working AI overlay in ~2 hours. Build features iteratively from there.

---

## 📝 Notes for Future Claude Sessions

When continuing this project in a new chat, paste this summary:

> "I'm building **OpenCluely** — an open-source Cluely alternative desktop app using **Electron + React + TypeScript**. Backend is **OpenRouter API** (OpenAI-compatible, user brings their own key). The app has: (1) transparent always-on-top overlay invisible to screen share, (2) screen OCR via Tesseract.js, (3) audio transcription via Whisper, (4) streaming AI responses. Currently on Phase [X]. Today I need help with [specific task]."

---

*Generated: 2026-03-01 | For open-source release under MIT License*

---

## gstack

This project uses [gstack](https://github.com/garrytan/gstack) for browser automation, code review, shipping, and QA workflows.

**Web browsing:** Always use the `/browse` skill from gstack for all web browsing tasks. NEVER use `mcp__claude-in-chrome__*` tools — they are slow, unreliable, and not what this project uses.

### Available skills

| Skill | Description |
|---|---|
| `/browse` | Headless browser automation (web browsing, screenshots, interaction) |
| `/plan-ceo-review` | CEO-level review of project plans |
| `/plan-eng-review` | Engineering review of project plans |
| `/review` | Code review workflow |
| `/ship` | Ship/deploy workflow |
| `/qa` | QA and testing workflow |
| `/setup-browser-cookies` | Set up browser cookies for authenticated browsing |
| `/retro` | Retrospective workflow |

### Troubleshooting

If gstack skills aren't working, rebuild the binary and re-register skills:

```bash
cd .claude/skills/gstack && ./setup
```
