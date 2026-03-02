// TranscriptBar — shows live audio transcript in the overlay
import { memo } from 'react'
import { Mic, Radio } from 'lucide-react'

interface TranscriptBarProps {
  transcript: string
  isRecording: boolean
}

function TranscriptBar({ transcript, isRecording }: TranscriptBarProps) {
  if (!isRecording) return null

  return (
    <div className="mx-3 mb-2 px-3 py-2 rounded-xl bg-red-500/5 border border-red-500/15">
      <div className="flex items-center gap-2 mb-1">
        <div className="flex items-center gap-1.5">
          <Radio className="w-3 h-3 text-red-400 animate-pulse" />
          <span className="text-red-400/80 text-[10px] font-medium uppercase tracking-wider">
            Recording
          </span>
        </div>
        <div className="flex-1 h-px bg-red-500/10" />
        <Mic className="w-3 h-3 text-red-400/50" />
      </div>
      {transcript ? (
        <p className="text-white/50 text-xs leading-relaxed line-clamp-3">
          {transcript.slice(-200)}
        </p>
      ) : (
        <p className="text-white/20 text-xs italic">Listening...</p>
      )}
    </div>
  )
}

export default memo(TranscriptBar)
