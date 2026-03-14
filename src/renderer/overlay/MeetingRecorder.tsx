// MeetingRecorder — captures microphone audio during meetings/interviews,
// transcribes via Whisper (Groq), and sends transcript to AI for an answer.
// Uses getUserMedia (microphone) which reliably captures the user's voice
// and picks up meeting audio from speakers.

import { useState, useRef, useCallback, useEffect } from 'react'
import { Radio, Square, Loader2 } from 'lucide-react'

/** MIME type preference for MediaRecorder */
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
  return ''
}

type RecorderState = 'idle' | 'recording' | 'transcribing'

/** Minimum recording duration in seconds to get usable transcription */
const MIN_RECORDING_SECONDS = 3

interface MeetingRecorderProps {
  /** Called when transcription is ready — parent submits it to AI */
  onTranscriptReady: (transcript: string) => void
  disabled?: boolean
  /** Compact variant for the quick-actions row */
  compact?: boolean
}

export default function MeetingRecorder({ onTranscriptReady, disabled, compact }: MeetingRecorderProps) {
  const [state, setState] = useState<RecorderState>('idle')
  const [elapsed, setElapsed] = useState(0) // seconds
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mimeTypeRef = useRef<string>('')

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  /** Format seconds as MM:SS */
  const formatTime = (s: number): string => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  /** Start recording audio via microphone (getUserMedia) */
  const startRecording = useCallback(async () => {
    setError(null)

    // Check whisper config first
    try {
      const config = await window.specterAPI?.checkAudioConfig()
      if (config && !config.configured) {
        setError(config.error || 'Audio transcription not configured. Add a Whisper API key in Settings.')
        return
      }
    } catch {
      // Proceed anyway — will fail with clear error at transcription time
    }

    try {
      // Use microphone — reliably captures the user's voice and picks up
      // meeting audio from speakers in the room
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        }
      })

      mediaStreamRef.current = stream
      chunksRef.current = []
      mimeTypeRef.current = getPreferredMimeType()

      const recorder = new MediaRecorder(stream, {
        ...(mimeTypeRef.current ? { mimeType: mimeTypeRef.current } : {})
      })

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onerror = () => {
        setError('Recording error. Please try again.')
        cleanup()
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      setState('recording')
      setElapsed(0)

      // Start elapsed timer
      timerRef.current = setInterval(() => {
        setElapsed(prev => prev + 1)
      }, 1000)

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to access microphone'
      if (msg.includes('Permission') || msg.includes('NotAllowed') || msg.includes('denied')) {
        setError('Microphone access denied. Allow microphone access in your system settings.')
      } else {
        setError(`Microphone error: ${msg}`)
      }
    }
  }, [])

  /** Stop all tracks and timers */
  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop())
      mediaStreamRef.current = null
    }
    mediaRecorderRef.current = null
  }, [])

  /** Stop recording, transcribe, and send to AI */
  const stopRecording = useCallback(async () => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      cleanup()
      setState('idle')
      return
    }

    // Enforce minimum recording duration — too-short clips produce garbage transcription
    if (elapsed < MIN_RECORDING_SECONDS) {
      setError(`Record for at least ${MIN_RECORDING_SECONDS} seconds to get usable transcription.`)
      // Don't stop — let them keep recording
      return
    }

    // Stop the recorder — this triggers ondataavailable with remaining data
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
      recorder.stop()
    })

    cleanup()

    // Build final blob from all chunks
    const blob = new Blob(chunksRef.current, {
      type: mimeTypeRef.current || 'audio/webm'
    })
    chunksRef.current = []

    // Skip very small recordings (< 1KB — likely empty/silence)
    if (blob.size < 1024) {
      setError('Recording too short or empty. Try recording for longer.')
      setState('idle')
      return
    }

    // Transcribe
    setState('transcribing')
    try {
      const arrayBuffer = await blob.arrayBuffer()
      const text = await window.specterAPI?.sendAudioForTranscription(
        arrayBuffer,
        mimeTypeRef.current || 'audio/webm'
      )

      if (text && text.trim()) {
        const trimmed = text.trim()
        // Heuristic: detect likely garbage transcriptions
        // Whisper sometimes returns a single nonsense word for silence/noise (e.g. "Monachötis")
        const wordCount = trimmed.split(/\s+/).length
        const hasCommonEnglish = /\b(the|is|are|was|were|have|has|do|does|what|how|why|when|where|which|who|can|could|would|should|will|shall|may|might|this|that|it|he|she|they|we|you|i|a|an|and|or|but|not|no|yes|for|to|of|in|on|at|with|from|by|about|thank|thanks|please|hello|hi|okay|ok|so|well|right|let|just|like|know|think|want|need|see|look|go|come|get|make|take|tell|say|said|ask|answer|question|code|function|return|class|if|else|while|for|int|string|array|list)\b/i.test(trimmed)

        if (wordCount <= 2 && !hasCommonEnglish && trimmed.length < 20) {
          // Likely garbage — warn user but still allow them to retry
          setError(`Unclear audio: "${trimmed}". Try recording longer or check that meeting audio is playing.`)
          setState('idle')
          return
        }

        onTranscriptReady(trimmed)
        setState('idle')
      } else {
        setError('No speech detected in the recording. Speak clearly near the microphone.')
        setState('idle')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transcription failed'
      setError(msg)
      setState('idle')
    }
  }, [cleanup, onTranscriptReady, elapsed])

  // Compact variant for quick-actions row
  if (compact) {
    return (
      <>
        {state === 'idle' && (
          <button
            onClick={startRecording}
            disabled={disabled}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px]
                       bg-red-500/10 text-red-400 border border-red-500/20
                       hover:bg-red-500/20 hover:border-red-500/30
                       disabled:opacity-40 disabled:cursor-not-allowed
                       transition-all duration-200 font-medium"
          >
            <Radio className="w-3 h-3" />
            Record Meeting
          </button>
        )}
        {state === 'recording' && (
          <button
            onClick={stopRecording}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px]
                       bg-red-500/20 text-red-300 border border-red-500/30
                       hover:bg-red-500/30 hover:border-red-500/40
                       transition-all duration-200 font-medium animate-pulse"
          >
            <Square className="w-3 h-3 fill-current" />
            Done ({formatTime(elapsed)})
          </button>
        )}
        {state === 'transcribing' && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px]
                          bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">
            <Loader2 className="w-3 h-3 animate-spin" />
            Transcribing...
          </div>
        )}
      </>
    )
  }

  // Full variant for the empty-state area
  return (
    <div className="flex flex-col items-center gap-2">
      {state === 'idle' && (
        <button
          onClick={startRecording}
          disabled={disabled}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl
                     bg-red-500/15 text-red-300 border border-red-500/25
                     hover:bg-red-500/25 hover:border-red-500/40
                     disabled:opacity-40 disabled:cursor-not-allowed
                     transition-all duration-200 text-sm font-medium"
        >
          <Radio className="w-4 h-4" />
          Record Meeting
        </button>
      )}

      {state === 'recording' && (
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Recording Meeting
          </div>
          <span className="text-white/50 text-xs font-mono">{formatTime(elapsed)}</span>
          <button
            onClick={stopRecording}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl
                       bg-red-500/20 text-red-300 border border-red-500/30
                       hover:bg-red-500/30 hover:border-red-500/40
                       transition-all duration-200 text-sm font-medium"
          >
            <Square className="w-4 h-4 fill-current" />
            Done
          </button>
        </div>
      )}

      {state === 'transcribing' && (
        <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl
                        bg-violet-500/10 text-violet-400 border border-violet-500/20 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Transcribing meeting audio...
        </div>
      )}

      {error && (
        <div className="max-w-[300px] px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-red-400/80 text-[11px] text-center">{error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-1 text-[10px] text-red-400/40 hover:text-red-400/70 transition-colors w-full text-center"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
