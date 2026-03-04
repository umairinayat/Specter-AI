// Overlay App — main overlay UI component for Specter AI
import { useState, useEffect, useRef, useCallback } from 'react'
import ResponseCard from './ResponseCard'
import TranscriptBar from './TranscriptBar'
import { Send, Mic, MicOff, Monitor, Settings, GripVertical, Minimize2, Maximize2, X } from 'lucide-react'
import type { StreamDoneData } from '../../preload/index'

declare global {
  interface Window {
    specterAPI: import('../../preload/index').SpecterAPI
  }
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  tokenCount?: number
  cost?: number
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

  // Keep refs in sync with state
  queryRef.current = query
  isStreamingRef.current = isStreaming
  isRecordingRef.current = isRecording
  includeScreenRef.current = includeScreen

  // Pending cost data for the current stream
  const pendingCostRef = useRef<StreamDoneData | null>(null)

  // MediaRecorder refs — managed imperatively to avoid re-render issues
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioStreamRef = useRef<MediaStream | null>(null)
  const transcriptionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mimeTypeRef = useRef<string>('')

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

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
      model: '', // will be filled by the main process later if needed
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

    recorder.onerror = () => {
      console.error('[Specter] MediaRecorder error')
    }

    return recorder
  }, [sendBlobForTranscription])

  /**
   * Start recording audio via Web Audio API (MediaRecorder).
   * No external dependencies required — uses browser's built-in audio capture.
   *
   * First checks if Whisper is configured. If not, shows an error immediately
   * instead of waiting 10 seconds for the first transcription attempt to fail.
   *
   * Strategy: every 10 seconds, stop the current recorder (producing a complete valid
   * audio file) and immediately start a fresh recorder on the same stream. This ensures
   * each file sent to Whisper has proper container headers (WebM EBML header, etc).
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

      // Every 10 seconds: stop current recorder (fires ondataavailable with complete file),
      // then create and start a new recorder on the same stream
      transcriptionTimerRef.current = setInterval(() => {
        const currentRecorder = mediaRecorderRef.current
        if (currentRecorder && currentRecorder.state === 'recording' && audioStreamRef.current) {
          currentRecorder.stop() // triggers ondataavailable → sendBlobForTranscription
          const newRecorder = createRecorder(audioStreamRef.current)
          newRecorder.start()
          mediaRecorderRef.current = newRecorder
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
   * Stop recording. The final recorder.stop() fires ondataavailable with the
   * remaining audio, which is automatically sent for transcription.
   */
  const stopRecording = useCallback(() => {
    // Stop the MediaRecorder — this triggers ondataavailable with the final chunk
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    mediaRecorderRef.current = null

    // Stop all audio tracks (releases the microphone)
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop())
      audioStreamRef.current = null
    }

    // Clear the rotation timer
    if (transcriptionTimerRef.current) {
      clearInterval(transcriptionTimerRef.current)
      transcriptionTimerRef.current = null
    }

    setIsRecording(false)
  }, [])

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

  // Submit handler — uses refs for hotkey compatibility
  const doSubmit = useCallback((withScreen = false) => {
    const q = queryRef.current.trim()
    if (!q && !withScreen && !isRecordingRef.current) return
    if (isStreamingRef.current) return

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: q || '(Context-based query)',
      timestamp: Date.now()
    }

    setMessages((prev) => [...prev, userMessage])
    setQuery('')
    setError(null)
    setIsStreaming(true)
    setStreamingContent('')
    pendingCostRef.current = null

    window.specterAPI?.queryAI(q, withScreen || includeScreenRef.current, isRecordingRef.current)
  }, [])

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

  // Set up IPC listeners — stable callbacks via refs, no stale closures
  useEffect(() => {
    const api = window.specterAPI
    if (!api) return

    const unsubChunk = api.onStreamChunk((chunk) => {
      setStreamingContent((prev) => prev + chunk)
    })

    const unsubDone = api.onStreamDone((data: StreamDoneData) => {
      pendingCostRef.current = data
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

    const unsubError = api.onStreamError((err) => {
      setError(err)
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

    return () => {
      unsubChunk()
      unsubDone()
      unsubError()
      unsubHotkeyAsk()
      unsubHotkeyScreenshot()
      unsubHotkeyAudio()
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
                     bg-specter-dark/90 backdrop-blur-xl border border-violet-500/30
                     hover:border-violet-500/60 transition-all duration-300 shadow-2xl shadow-violet-500/20"
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
      className="h-screen w-full flex flex-col rounded-2xl overflow-hidden
                 bg-specter-dark/85 backdrop-blur-2xl border border-white/10
                 shadow-2xl shadow-black/50"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {/* Title bar — draggable */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b border-white/5
                   cursor-move select-none"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
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

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-thin scrollbar-thumb-white/10">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-12 h-12 rounded-2xl bg-violet-500/20 flex items-center justify-center mb-4">
              <div className="w-5 h-5 rounded-full bg-violet-500/60 animate-pulse" />
            </div>
            <h3 className="text-white/70 text-sm font-medium mb-2">Ready to assist</h3>
            <p className="text-white/30 text-xs leading-relaxed">
              Ask anything or use{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/50 text-[10px] font-mono">
                Ctrl+Enter
              </kbd>{' '}
              to query with screen context
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

        {error && (
          <div className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="text-red-400 text-xs">{error}</p>
          </div>
        )}

        {audioError && (
          <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <p className="text-amber-400 text-xs">{audioError}</p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Transcript bar */}
      {isRecording && <TranscriptBar transcript={transcript} isRecording={isRecording} />}

      {/* Input area */}
      <div className="px-3 pb-3 pt-1">
        <div className="flex items-end gap-2 bg-white/5 rounded-xl border border-white/10 px-3 py-2
                        focus-within:border-violet-500/40 transition-colors">
          {/* Context toggles */}
          <div className="flex items-center gap-1 pb-0.5">
            <button
              onClick={() => setIncludeScreen(!includeScreen)}
              className={`p-1.5 rounded-lg transition-colors ${
                includeScreen
                  ? 'bg-violet-500/20 text-violet-400'
                  : 'text-white/30 hover:text-white/50 hover:bg-white/5'
              }`}
              title="Include screen context"
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
            placeholder="Ask Specter anything..."
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
              disabled={!query.trim() && !includeScreen}
              className="p-2 rounded-xl bg-violet-500/20 text-violet-400 hover:bg-violet-500/30
                         disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
              title="Send (Enter)"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
