// Overlay App — main overlay UI component for Specter AI
import { useState, useEffect, useRef, useCallback } from 'react'
import ResponseCard from './ResponseCard'
import TranscriptBar from './TranscriptBar'
import { Send, Mic, MicOff, Monitor, Settings, GripVertical, Minimize2, Maximize2, X, ScanSearch, Paperclip, Trash2, Clock, ChevronLeft, MessageSquare } from 'lucide-react'
import type { StreamDoneData } from '../../preload/index'
import type { Message, Conversation } from '../../shared/types'

declare global {
  interface Window {
    specterAPI: import('../../preload/index').SpecterAPI
  }
}

// Preferred MIME type for MediaRecorder (webm/opus is widely supported and Whisper accepts it)
function getPreferredMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4'
  ]
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime
  }
  return '' // fallback — let MediaRecorder pick
}

const TRANSCRIPTION_INTERVAL_MS = 10_000 // send audio for transcription every 10 seconds

export default function App() {
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [includeScreen, setIncludeScreen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [attachedScreenshot, setAttachedScreenshot] = useState<string | null>(null) // base64
  const [theme, setTheme] = useState<'dark' | 'light' | 'glass'>('dark')
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [autoHideDelay, setAutoHideDelay] = useState<number>(0) // seconds, 0 = disabled
  const [showHistory, setShowHistory] = useState(false)
  const [historyList, setHistoryList] = useState<Conversation[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Current conversation ID — generated when first message is sent
  const conversationIdRef = useRef<string>(`conv-${Date.now()}`)

  // Refs to avoid stale closures in IPC hotkey handlers
  const queryRef = useRef(query)
  const isStreamingRef = useRef(isStreaming)
  const isRecordingRef = useRef(isRecording)
  const includeScreenRef = useRef(includeScreen)
  const messagesRef = useRef(messages)
  const selectedModelRef = useRef(selectedModel)

  // Keep refs in sync with state
  queryRef.current = query
  isStreamingRef.current = isStreaming
  isRecordingRef.current = isRecording
  includeScreenRef.current = includeScreen
  messagesRef.current = messages
  selectedModelRef.current = selectedModel

  // Pending cost data for the current stream
  const pendingCostRef = useRef<StreamDoneData | null>(null)

  // MediaRecorder refs — managed imperatively to avoid re-render issues
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioStreamRef = useRef<MediaStream | null>(null)
  const transcriptionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mimeTypeRef = useRef<string>('')

  // Auto-capture: latest screen text from main process timer
  const autoCaptureTextRef = useRef<string>('')

  // Ref for stopRecording to avoid stale closure in setInterval
  const stopRecordingRef = useRef<() => void>(() => {})

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // Load theme and selected model from settings
  useEffect(() => {
    window.specterAPI?.getSetting<'dark' | 'light' | 'glass'>('theme').then((t) => {
      const resolved = t || 'dark'
      setTheme(resolved)
      document.documentElement.setAttribute('data-theme', resolved)
    })
    window.specterAPI?.getSetting<string>('selectedModel').then((m) => {
      if (m) setSelectedModel(m)
    })
    window.specterAPI?.getSetting<number>('autoHideDelay').then((d) => {
      if (typeof d === 'number' && d >= 0) setAutoHideDelay(d)
    })
  }, [])

  // Keep data-theme in sync when theme changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // --- CSS-based opacity (replaces native win.setOpacity) ---
  // Native BrowserWindow opacity adds WS_EX_LAYERED on Windows, which causes
  // SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE) to be silently ignored.
  // Instead, the main process sends opacity values via IPC and we apply them via CSS.
  useEffect(() => {
    const api = window.specterAPI
    if (!api?.onOpacityChange) return

    const unsub = api.onOpacityChange((opacity) => {
      document.documentElement.style.opacity = String(opacity)
    })

    return unsub
  }, [])

  // --- Click-through is NOT needed ---
  // With transparent: true + frame: false, Electron natively passes clicks through
  // fully transparent regions. The previous setIgnoreMouseEvents approach was
  // actively breaking -webkit-app-region: drag (window dragging).

  // Auto-hide overlay after N seconds of inactivity
  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (autoHideDelay <= 0 || isMinimized) return

    const resetTimer = () => {
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current)
      autoHideTimerRef.current = setTimeout(() => {
        setIsMinimized(true)
      }, autoHideDelay * 1000)
    }

    // Reset timer on user activity
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart']
    activityEvents.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }))

    // Start the timer initially
    resetTimer()

    return () => {
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current)
      activityEvents.forEach((evt) => window.removeEventListener(evt, resetTimer))
    }
  }, [autoHideDelay, isMinimized])

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingContent, scrollToBottom])

  // Auto-save conversation when messages change (after assistant replies)
  useEffect(() => {
    if (messages.length < 2) return // need at least one exchange
    const lastMsg = messages[messages.length - 1]
    if (lastMsg.role !== 'assistant') return // only save after assistant replies

    const firstUserMsg = messages.find(m => m.role === 'user')
    const title = firstUserMsg?.content.slice(0, 80) || 'Untitled conversation'

    window.specterAPI?.saveConversation({
      id: conversationIdRef.current,
      title,
      messages: messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        tokenCount: m.tokenCount,
        cost: m.cost
      })),
      model: selectedModelRef.current || 'unknown', // use latest model from stream or settings
      createdAt: messages[0]?.timestamp || Date.now(),
      updatedAt: Date.now()
    })
  }, [messages])

  /**
   * Send a complete audio Blob to the main process for Whisper transcription.
   * Each blob must be a self-contained valid media file (has proper headers).
   */
  const sendBlobForTranscription = useCallback(async (blob: Blob) => {
    // Skip very small blobs (< 1KB — likely silence/empty)
    if (blob.size < 1024) return

    try {
      const arrayBuffer = await blob.arrayBuffer()
      const text = await window.specterAPI?.sendAudioForTranscription(
        arrayBuffer,
        mimeTypeRef.current || 'audio/webm'
      )
      if (text) {
        setTranscript(prev => {
          const updated = (prev + ' ' + text).trim()
          // Keep rolling buffer within 5000 chars
          return updated.length > 5000 ? updated.slice(-5000) : updated
        })
        // Clear any previous audio error on success
        setAudioError(null)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transcription failed'
      console.warn('[Specter] Transcription error:', msg)
      // Show ALL transcription errors to the user
      setAudioError(msg)
    }
  }, [])

  /**
   * Create a fresh MediaRecorder on the given stream.
   * When the recorder is stopped, its ondataavailable fires with a complete valid media file
   * which is then sent for transcription.
   * Includes error recovery: if the recorder errors out, attempt to restart.
   */
  const createRecorder = useCallback((stream: MediaStream): MediaRecorder => {
    const mimeType = mimeTypeRef.current
    const recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {})
    })

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        sendBlobForTranscription(event.data)
      }
    }

    recorder.onerror = (event) => {
      console.error('[Specter] MediaRecorder error:', event)
      // Attempt to recover by creating a new recorder if stream is still active
      if (audioStreamRef.current && audioStreamRef.current.active) {
        try {
          const newRecorder = createRecorder(audioStreamRef.current)
          newRecorder.start()
          mediaRecorderRef.current = newRecorder
          console.log('[Specter] MediaRecorder recovered after error')
        } catch {
          console.error('[Specter] MediaRecorder recovery failed, stopping')
          setAudioError('Microphone recording error. Try stopping and restarting.')
          // Manually clean up instead of calling stopRecording (avoids circular ref)
          if (audioStreamRef.current) {
            audioStreamRef.current.getTracks().forEach(track => track.stop())
            audioStreamRef.current = null
          }
          if (transcriptionTimerRef.current) {
            clearInterval(transcriptionTimerRef.current)
            transcriptionTimerRef.current = null
          }
          mediaRecorderRef.current = null
          setIsRecording(false)
        }
      }
    }

    return recorder
  }, [sendBlobForTranscription])

  /**
   * Start recording audio via Web Audio API (MediaRecorder).
   */
  const startRecording = useCallback(async () => {
    setAudioError(null)

    // Check whisper config before starting — give immediate feedback
    try {
      const config = await window.specterAPI?.checkAudioConfig()
      if (config && !config.configured) {
        setAudioError(config.error || 'Audio transcription not configured. Add a Whisper API key in Settings.')
        return
      }
    } catch {
      // If the check fails, proceed anyway — transcription will fail with a clear error later
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        }
      })

      audioStreamRef.current = stream
      mimeTypeRef.current = getPreferredMimeType()

      // Start the first recorder
      const recorder = createRecorder(stream)
      recorder.start()
      mediaRecorderRef.current = recorder

      setIsRecording(true)

      // Every 10 seconds: stop current recorder, start a new one
      // Also detect if stream died and stop recording gracefully
      transcriptionTimerRef.current = setInterval(() => {
        // Check if the audio stream is still active
        if (!audioStreamRef.current || !audioStreamRef.current.active) {
          console.warn('[Specter] Audio stream lost, stopping recording')
          setAudioError('Microphone disconnected. Recording stopped.')
          stopRecordingRef.current()
          return
        }

        const currentRecorder = mediaRecorderRef.current
        if (currentRecorder && currentRecorder.state === 'recording') {
          try {
            currentRecorder.stop()
            const newRecorder = createRecorder(audioStreamRef.current)
            newRecorder.start()
            mediaRecorderRef.current = newRecorder
          } catch (err) {
            console.error('[Specter] Failed to cycle MediaRecorder:', err)
            setAudioError('Recording error. Restarting...')
            stopRecordingRef.current()
          }
        }
      }, TRANSCRIPTION_INTERVAL_MS)

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to access microphone'
      console.error('[Specter] Mic access error:', msg)
      setAudioError(
        msg.includes('NotAllowed') || msg.includes('Permission')
          ? 'Microphone access denied. Allow microphone access in your system settings.'
          : `Microphone error: ${msg}`
      )
    }
  }, [createRecorder])

  /**
   * Stop recording.
   */
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    mediaRecorderRef.current = null

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop())
      audioStreamRef.current = null
    }

    if (transcriptionTimerRef.current) {
      clearInterval(transcriptionTimerRef.current)
      transcriptionTimerRef.current = null
    }

    setIsRecording(false)
  }, [])

  // Keep ref in sync so interval callbacks always have the latest stopRecording
  stopRecordingRef.current = stopRecording

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop())
      }
      if (transcriptionTimerRef.current) clearInterval(transcriptionTimerRef.current)
    }
  }, [])

  /**
   * Build message history for the AI — sends recent conversation for context.
   */
  const getMessageHistory = useCallback(() => {
    return messagesRef.current.map(m => ({ role: m.role, content: m.content }))
  }, [])

  /**
   * Submit handler — uses refs for hotkey compatibility.
   * Sends conversation history so the AI has context of prior exchanges.
   */
  const doSubmit = useCallback((withScreen = false) => {
    const q = queryRef.current.trim()
    if (!q && !withScreen && !isRecordingRef.current) return
    if (isStreamingRef.current) return

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: q || '(Analyze my screen)',
      timestamp: Date.now()
    }

    const history = getMessageHistory()

    setMessages((prev) => [...prev, userMessage])
    setQuery('')
    setError(null)
    setIsStreaming(true)
    setStreamingContent('')
    pendingCostRef.current = null

    // Send with conversation history for context
    window.specterAPI?.queryAI(
      q,
      withScreen || includeScreenRef.current,
      isRecordingRef.current,
      history
    )

    // Clear attached screenshot after sending
    setAttachedScreenshot(null)
  }, [getMessageHistory])

  /**
   * One-click "Analyze Screen" — captures screen + sends to AI automatically.
   * No text input needed. Just click and get AI analysis of what's on screen.
   */
  const analyzeScreen = useCallback(() => {
    if (isStreamingRef.current) return
    if (isCapturing) return

    setIsCapturing(true)

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: queryRef.current.trim() || 'Analyze what is on my screen and help me with it.',
      timestamp: Date.now()
    }

    const history = getMessageHistory()

    setMessages((prev) => [...prev, userMessage])
    setQuery('')
    setError(null)
    setIsStreaming(true)
    setStreamingContent('')
    pendingCostRef.current = null

    // Always include screen for analyze
    window.specterAPI?.queryAI(
      userMessage.content,
      true, // always include screen
      isRecordingRef.current,
      history
    )

    setIsCapturing(false)
    setAttachedScreenshot(null)
  }, [isCapturing, getMessageHistory])

  /**
   * Attach a screenshot to the next message (preview it first).
   */
  const attachScreenshot = useCallback(async () => {
    if (isCapturing) return
    setIsCapturing(true)
    try {
      const result = await window.specterAPI?.captureScreenPreview()
      if (result?.screenshot) {
        setAttachedScreenshot(result.screenshot)
        setIncludeScreen(true) // auto-enable screen context
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Screenshot failed'
      setError(`Screenshot failed: ${msg}`)
    } finally {
      setIsCapturing(false)
    }
  }, [isCapturing])

  const toggleRecording = useCallback(() => {
    if (isRecordingRef.current) {
      stopRecording()
    } else {
      startRecording()
    }
  }, [startRecording, stopRecording])

  const cancelStream = useCallback(() => {
    window.specterAPI?.cancelAI()
    setIsStreaming(false)
    setStreamingContent('')
    pendingCostRef.current = null
  }, [])

  const clearChat = useCallback(() => {
    setMessages([])
    setStreamingContent('')
    setError(null)
    setAudioError(null)
    conversationIdRef.current = `conv-${Date.now()}`
  }, [])

  /**
   * Open the history drawer and load conversations from storage.
   */
  const openHistory = useCallback(async () => {
    setShowHistory(true)
    setHistoryLoading(true)
    try {
      const saved = await window.specterAPI?.listConversations()
      // Sort by most recent first
      const sorted = (saved || [])
        .sort((a: { updatedAt: number }, b: { updatedAt: number }) => b.updatedAt - a.updatedAt) as Conversation[]
      setHistoryList(sorted)
    } catch (err) {
      console.error('[Specter] Failed to load conversations:', err)
      setHistoryList([])
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  /**
   * Load a conversation from history into the current chat.
   */
  const loadConversation = useCallback((conv: Conversation) => {
    // Set the current conversation to the selected one
    conversationIdRef.current = conv.id
    setMessages(conv.messages.map(m => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      content: m.content,
      timestamp: m.timestamp,
      tokenCount: m.tokenCount,
      cost: m.cost
    })))
    if (conv.model) setSelectedModel(conv.model)
    setStreamingContent('')
    setError(null)
    setAudioError(null)
    setShowHistory(false)
  }, [])

  /**
   * Delete a conversation from history.
   */
  const deleteFromHistory = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    window.specterAPI?.deleteConversation(id)
    setHistoryList(prev => prev.filter(c => c.id !== id))
  }, [])

  /**
   * Format a timestamp for display in the history list.
   */
  const formatHistoryDate = useCallback((ts: number): string => {
    const d = new Date(ts)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(hours / 24)

    if (hours < 1) return 'Just now'
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return d.toLocaleDateString()
  }, [])

  // Set up IPC listeners — stable callbacks via refs, no stale closures
  useEffect(() => {
    const api = window.specterAPI
    if (!api) return

    const unsubChunk = api.onStreamChunk((chunk) => {
      setStreamingContent((prev) => prev + chunk)
    })

    const unsubDone = api.onStreamDone((data: StreamDoneData) => {
      pendingCostRef.current = data
      // Update selectedModel from the response if available
      if (data.model) setSelectedModel(data.model)
      setStreamingContent((prev) => {
        if (prev) {
          const costData = pendingCostRef.current
          setMessages((msgs) => [
            ...msgs,
            {
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              content: prev,
              timestamp: Date.now(),
              tokenCount: costData?.totalTokens,
              cost: costData?.totalCost
            }
          ])
        }
        return ''
      })
      setIsStreaming(false)
      pendingCostRef.current = null
    })

    const unsubError = api.onStreamError((errMsg) => {
      // Parse and show user-friendly error messages
      let displayError = errMsg
      if (errMsg.includes('401') || errMsg.includes('Unauthorized') || errMsg.includes('invalid_api_key')) {
        displayError = 'Invalid API key. Check your OpenRouter API key in Settings.'
      } else if (errMsg.includes('402') || errMsg.includes('Payment') || errMsg.includes('insufficient')) {
        displayError = 'Insufficient credits on OpenRouter. Add credits at openrouter.ai/credits'
      } else if (errMsg.includes('404') || errMsg.includes('not found') || errMsg.includes('does not exist')) {
        displayError = 'Model not found. The selected model may be unavailable. Try a different model in Settings.'
      } else if (errMsg.includes('429') || errMsg.includes('rate limit') || errMsg.includes('Rate limit')) {
        displayError = 'Rate limited. Too many requests — wait a moment and try again.'
      } else if (errMsg.includes('500') || errMsg.includes('502') || errMsg.includes('503')) {
        displayError = 'AI service temporarily unavailable. Try again in a few seconds.'
      } else if (errMsg.includes('ENOTFOUND') || errMsg.includes('ECONNREFUSED') || errMsg.includes('network') || errMsg.includes('fetch')) {
        displayError = 'Network error. Check your internet connection.'
      } else if (errMsg.includes('timeout') || errMsg.includes('Timeout')) {
        displayError = 'Request timed out. The AI took too long to respond — try again.'
      }
      setError(displayError)
      setIsStreaming(false)
      setStreamingContent('')
    })

    // Hotkey handlers use refs so they always see current state
    const unsubHotkeyAsk = api.onHotkeyAskAI(() => {
      doSubmit()
    })

    const unsubHotkeyScreenshot = api.onHotkeyScreenshot(() => {
      doSubmit(true)
    })

    const unsubHotkeyAudio = api.onHotkeyToggleAudio(() => {
      toggleRecording()
    })

    const unsubAutoCapture = api.onAutoCaptureUpdate((data) => {
      autoCaptureTextRef.current = data.text
    })

    return () => {
      unsubChunk()
      unsubDone()
      unsubError()
      unsubHotkeyAsk()
      unsubHotkeyScreenshot()
      unsubHotkeyAudio()
      unsubAutoCapture()
    }
  }, [doSubmit, toggleRecording])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      doSubmit()
    }
  }

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={() => setIsMinimized(false)}
          className="specter-pill group flex items-center gap-2 px-4 py-2 rounded-full
                     bg-specter-dark/90 border border-violet-500/30
                     hover:border-violet-500/60 transition-all duration-300"
        >
          <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
          <span className="text-white/80 text-sm font-medium">Specter</span>
          <Maximize2 className="w-3 h-3 text-white/50 group-hover:text-white/80 transition-colors" />
        </button>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="h-screen w-full flex flex-col rounded-2xl overflow-hidden"
      style={{
        WebkitAppRegion: 'no-drag',
        background: 'var(--specter-surface)',
        borderColor: 'var(--specter-border)',
        borderWidth: '1px',
        borderStyle: 'solid'
      } as React.CSSProperties}
    >
      {/* Title bar — draggable */}
      <div
        className="flex items-center justify-between px-4 py-2 cursor-move select-none"
        style={{ WebkitAppRegion: 'drag', borderBottom: '1px solid var(--specter-border)' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2">
          <GripVertical className="w-3.5 h-3.5 text-white/30" />
          <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
          <span className="text-white/60 text-xs font-medium tracking-wider uppercase">
            Specter AI
          </span>
        </div>
        <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={openHistory}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title="Conversation history"
          >
            <Clock className="w-3.5 h-3.5 text-white/40 hover:text-white/70" />
          </button>
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              title="New conversation"
            >
              <Trash2 className="w-3.5 h-3.5 text-white/40 hover:text-white/70" />
            </button>
          )}
          <button
            onClick={() => window.specterAPI?.openDashboard()}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title="Settings"
          >
            <Settings className="w-3.5 h-3.5 text-white/40 hover:text-white/70" />
          </button>
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title="Minimize to pill"
          >
            <Minimize2 className="w-3.5 h-3.5 text-white/40 hover:text-white/70" />
          </button>
        </div>
      </div>

      {/* History drawer — slides over the messages area */}
      {showHistory && (
        <div className="flex-1 overflow-y-auto flex flex-col" style={{ background: 'var(--specter-surface)' }}>
          {/* History header */}
          <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid var(--specter-border)' }}>
            <button
              onClick={() => setShowHistory(false)}
              className="p-1 rounded-lg hover:bg-white/10 transition-colors"
              title="Back"
            >
              <ChevronLeft className="w-4 h-4 text-white/50" />
            </button>
            <span className="text-white/70 text-xs font-medium tracking-wider uppercase flex-1">
              History
            </span>
            <span className="text-white/20 text-[10px]">
              {historyList.length} conversations
            </span>
          </div>

          {/* History list */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 scrollbar-thin scrollbar-thumb-white/10">
            {historyLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            ) : historyList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <MessageSquare className="w-8 h-8 text-white/10 mb-2" />
                <p className="text-white/30 text-xs">No conversations yet</p>
              </div>
            ) : (
              historyList.map((conv) => {
                const lastMsg = conv.messages[conv.messages.length - 1]
                const msgCount = conv.messages.length
                const isCurrentConv = conv.id === conversationIdRef.current
                return (
                  <button
                    key={conv.id}
                    onClick={() => loadConversation(conv)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl transition-all group
                      ${isCurrentConv
                        ? 'bg-violet-500/15 border border-violet-500/25'
                        : 'bg-white/[0.02] border border-transparent hover:bg-white/5 hover:border-white/10'
                      }`}
                  >
                    <div className="flex items-start gap-2">
                      <MessageSquare className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                        isCurrentConv ? 'text-violet-400' : 'text-white/15 group-hover:text-white/30'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <h4 className={`text-xs font-medium truncate ${
                          isCurrentConv ? 'text-violet-300' : 'text-white/60 group-hover:text-white/80'
                        }`}>
                          {conv.title}
                        </h4>
                        {lastMsg && (
                          <p className="text-[10px] text-white/20 mt-0.5 truncate">
                            {lastMsg.content.slice(0, 80)}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-white/15">
                          <span>{formatHistoryDate(conv.updatedAt)}</span>
                          <span>&middot;</span>
                          <span>{msgCount} msgs</span>
                          {conv.model && (
                            <>
                              <span>&middot;</span>
                              <span className="font-mono truncate">{conv.model.split('/').pop()}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => deleteFromHistory(conv.id, e)}
                        className="p-1 rounded-lg opacity-0 group-hover:opacity-100
                                   hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-all shrink-0"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {/* New conversation button */}
          <div className="px-3 pb-3 pt-1" style={{ borderTop: '1px solid var(--specter-border)' }}>
            <button
              onClick={() => { clearChat(); setShowHistory(false) }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl
                         bg-violet-500/10 text-violet-400 border border-violet-500/20
                         hover:bg-violet-500/20 hover:border-violet-500/30
                         transition-all text-xs font-medium"
            >
              <Trash2 className="w-3 h-3" />
              New Conversation
            </button>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className={`flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-thin scrollbar-thumb-white/10 ${showHistory ? 'hidden' : ''}`}>
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-12 h-12 rounded-2xl bg-violet-500/20 flex items-center justify-center mb-4">
              <div className="w-5 h-5 rounded-full bg-violet-500/60 animate-pulse" />
            </div>
            <h3 className="text-white/70 text-sm font-medium mb-3">Ready to assist</h3>

            {/* Analyze Screen — primary action button */}
            <button
              onClick={analyzeScreen}
              disabled={isStreaming || isCapturing}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl
                         bg-violet-500/20 text-violet-300 border border-violet-500/30
                         hover:bg-violet-500/30 hover:border-violet-500/50
                         disabled:opacity-40 disabled:cursor-not-allowed
                         transition-all duration-200 mb-3 text-sm font-medium"
            >
              <ScanSearch className="w-4 h-4" />
              {isCapturing ? 'Capturing...' : 'Analyze Screen'}
            </button>

            <p className="text-white/30 text-xs leading-relaxed">
              Click above to analyze your screen, or type a question below.
              <br />
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/50 text-[10px] font-mono">
                Ctrl+Shift+Enter
              </kbd>{' '}
              for screen + AI &nbsp;
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/50 text-[10px] font-mono">
                Ctrl+Enter
              </kbd>{' '}
              to send
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <ResponseCard key={msg.id} message={msg} />
        ))}

        {isStreaming && streamingContent && (
          <ResponseCard
            message={{
              id: 'streaming',
              role: 'assistant',
              content: streamingContent,
              timestamp: Date.now()
            }}
            isStreaming
          />
        )}

        {/* Loading indicator when streaming starts but no content yet */}
        {isStreaming && !streamingContent && (
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-white/30 text-xs">
              {includeScreen || isCapturing ? 'Capturing screen & thinking...' : 'Thinking...'}
            </span>
          </div>
        )}

        {error && (
          <div className="px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="text-red-400 text-xs font-medium mb-1">Error</p>
            <p className="text-red-400/80 text-xs">{error}</p>
            <button
              onClick={() => setError(null)}
              className="mt-1.5 text-[10px] text-red-400/50 hover:text-red-400/80 transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {audioError && (
          <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <p className="text-amber-400 text-xs">{audioError}</p>
            <button
              onClick={() => setAudioError(null)}
              className="mt-1 text-[10px] text-amber-400/50 hover:text-amber-400/80 transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Transcript bar */}
      {isRecording && !showHistory && <TranscriptBar transcript={transcript} isRecording={isRecording} />}

      {/* Attached screenshot preview */}
      {attachedScreenshot && !showHistory && (
        <div className="px-3 py-1.5 border-t border-white/5">
          <div className="flex items-center gap-2 bg-violet-500/10 rounded-lg px-2.5 py-1.5 border border-violet-500/20">
            <Monitor className="w-3.5 h-3.5 text-violet-400 shrink-0" />
            <span className="text-violet-300 text-[11px] flex-1 truncate">Screenshot attached</span>
            <button
              onClick={() => { setAttachedScreenshot(null); setIncludeScreen(false) }}
              className="p-0.5 rounded hover:bg-white/10 transition-colors"
              title="Remove screenshot"
            >
              <X className="w-3 h-3 text-violet-400/60" />
            </button>
          </div>
        </div>
      )}

      {/* Input area */}
      {!showHistory && (
      <div className="px-3 pb-3 pt-1">
        {/* Quick actions row — visible when there are messages */}
        {messages.length > 0 && !isStreaming && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <button
              onClick={analyzeScreen}
              disabled={isStreaming || isCapturing}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px]
                         bg-violet-500/10 text-violet-400 border border-violet-500/20
                         hover:bg-violet-500/20 hover:border-violet-500/30
                         disabled:opacity-40 disabled:cursor-not-allowed
                         transition-all duration-200 font-medium"
            >
              <ScanSearch className="w-3 h-3" />
              Analyze Screen
            </button>
          </div>
        )}

        <div className="flex items-end gap-2 bg-white/5 rounded-xl border border-white/10 px-3 py-2
                        focus-within:border-violet-500/40 transition-colors">
          {/* Context toggles */}
          <div className="flex items-center gap-1 pb-0.5">
            <button
              onClick={attachScreenshot}
              disabled={isCapturing}
              className={`p-1.5 rounded-lg transition-colors ${
                attachedScreenshot || includeScreen
                  ? 'bg-violet-500/20 text-violet-400'
                  : 'text-white/30 hover:text-white/50 hover:bg-white/5'
              }`}
              title={attachedScreenshot ? 'Screenshot attached (click to capture new)' : 'Attach screenshot'}
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIncludeScreen(!includeScreen)}
              className={`p-1.5 rounded-lg transition-colors ${
                includeScreen
                  ? 'bg-violet-500/20 text-violet-400'
                  : 'text-white/30 hover:text-white/50 hover:bg-white/5'
              }`}
              title={includeScreen ? 'Screen context ON (live capture on send)' : 'Include screen context'}
            >
              <Monitor className="w-4 h-4" />
            </button>
            <button
              onClick={toggleRecording}
              className={`p-1.5 rounded-lg transition-colors ${
                isRecording
                  ? 'bg-red-500/20 text-red-400 animate-pulse'
                  : 'text-white/30 hover:text-white/50 hover:bg-white/5'
              }`}
              title={isRecording ? 'Stop recording' : 'Start recording'}
            >
              {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          </div>

          {/* Text input */}
          <textarea
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={includeScreen ? 'Ask about your screen...' : 'Ask Specter anything...'}
            rows={1}
            className="flex-1 bg-transparent text-white/90 text-sm placeholder-white/20
                       resize-none outline-none min-h-[28px] max-h-[120px] py-1
                       scrollbar-thin scrollbar-thumb-white/10"
            style={{ height: 'auto', overflow: 'hidden' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement
              target.style.height = 'auto'
              target.style.height = Math.min(target.scrollHeight, 120) + 'px'
            }}
          />

          {/* Submit / Cancel */}
          {isStreaming ? (
            <button
              onClick={cancelStream}
              className="p-2 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30
                         transition-colors shrink-0"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => doSubmit()}
              disabled={!query.trim() && !includeScreen && !attachedScreenshot}
              className="p-2 rounded-xl bg-violet-500/20 text-violet-400 hover:bg-violet-500/30
                         disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
              title="Send (Enter)"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      )}
    </div>
  )
}
