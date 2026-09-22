// Interview page — JD + CV profile for grounded voice answers (Parakeet-style)
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Briefcase, Building2, FileText, Upload, X, Save, Loader2,
  ToggleRight, ToggleLeft, Mic, Sparkles, Trash2, AlertCircle, CheckCircle
} from 'lucide-react'

interface InterviewState {
  interviewCompany: string
  interviewRole: string
  jobDescription: string
  resumeText: string
  interviewMode: boolean
  autoAnswer: boolean
}

const DEFAULT_STATE: InterviewState = {
  interviewCompany: '',
  interviewRole: '',
  jobDescription: '',
  resumeText: '',
  interviewMode: false,
  autoAnswer: false
}

/** Extract keywords (words 5+ chars, lowercased, de-duped) for JD↔CV match preview */
function extractKeywords(text: string, limit = 40): string[] {
  const stop = new Set(['about', 'with', 'from', 'that', 'this', 'will', 'have', 'has', 'and', 'the', 'for', 'are', 'was', 'were', 'been', 'being', 'their', 'there', 'which', 'while', 'where', 'when', 'would', 'should', 'could', 'these', 'those', 'your', 'you', 'our', 'they', 'them', 'then', 'than', 'into', 'over', 'under', 'between', 'through', 'during', 'such', 'each', 'other', 'more', 'most', 'some', 'many', 'much', 'very', 'also', 'just', 'like', 'well'])
  const words = text.toLowerCase().match(/[a-z][a-z0-9+#.-]{4,}/g) || []
  const seen = new Set<string>()
  const out: string[] = []
  for (const w of words) {
    const clean = w.replace(/^[.#-]+|[.#-]+$/g, '')
    if (clean.length < 5 || stop.has(clean) || seen.has(clean)) continue
    seen.add(clean)
    out.push(clean)
    if (out.length >= limit) break
  }
  return out
}

export default function Interview() {
  const [state, setState] = useState<InterviewState>(DEFAULT_STATE)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadInterview()
  }, [])

  const loadInterview = async () => {
    try {
      const api = window.specterAPI
      const [company, role, jd, resume, mode, auto] = await Promise.all([
        api.getSetting<string>('interviewCompany').catch(() => ''),
        api.getSetting<string>('interviewRole').catch(() => ''),
        api.getSetting<string>('jobDescription').catch(() => ''),
        api.getSetting<string>('resumeText').catch(() => ''),
        api.getSetting<boolean>('interviewMode').catch(() => false),
        api.getSetting<boolean>('autoAnswer').catch(() => false)
      ])
      setState({
        interviewCompany: company || '',
        interviewRole: role || '',
        jobDescription: jd || '',
        resumeText: resume || '',
        interviewMode: !!mode,
        autoAnswer: !!auto
      })
    } catch (err) {
      console.error('Failed to load interview profile:', err)
    }
  }

  const update = <K extends keyof InterviewState>(key: K, value: InterviewState[K]) => {
    setState(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const api = window.specterAPI
      await api.setSetting('interviewCompany', state.interviewCompany.slice(0, 500))
      await api.setSetting('interviewRole', state.interviewRole.slice(0, 500))
      await api.setSetting('jobDescription', state.jobDescription.slice(0, 20000))
      await api.setSetting('resumeText', state.resumeText.slice(0, 20000))
      await api.setSetting('interviewMode', state.interviewMode)
      await api.setSetting('autoAnswer', state.autoAnswer)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save interview profile')
    } finally {
      setSaving(false)
    }
  }, [state])

  const handleClear = useCallback(async () => {
    setState(DEFAULT_STATE)
    try {
      const api = window.specterAPI
      await api.setSetting('interviewCompany', '')
      await api.setSetting('interviewRole', '')
      await api.setSetting('jobDescription', '')
      await api.setSetting('resumeText', '')
      await api.setSetting('interviewMode', false)
      await api.setSetting('autoAnswer', false)
    } catch (err) {
      console.error('Failed to clear interview profile:', err)
    }
  }, [])

  const extractPdfText = useCallback(async (file: File): Promise<string> => {
    const pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc = ''
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({
      data: arrayBuffer,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true
    }).promise
    const pageTexts: string[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = textContent.items
        .map((item) => ('str' in item ? (item as { str: string }).str : ''))
        .join(' ')
      if (pageText.trim()) pageTexts.push(pageText.trim())
    }
    return pageTexts.join('\n\n')
  }, [])

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'
    if (isPdf) {
      setUploading(true)
      try {
        const text = await extractPdfText(file)
        if (!text.trim()) {
          setUploadError('Could not extract text from this PDF. It may be scanned/image-based.')
          return
        }
        update('resumeText', text.slice(0, 20000))
      } catch (err) {
        console.error('CV PDF extraction failed:', err)
        setUploadError('Failed to read PDF. The file may be corrupted or password-protected.')
      } finally {
        setUploading(false)
      }
    } else {
      const reader = new FileReader()
      reader.onload = (event) => {
        const text = event.target?.result as string
        update('resumeText', (text || '').slice(0, 20000))
      }
      reader.onerror = () => setUploadError('Failed to read file.')
      reader.readAsText(file)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [extractPdfText])

  // JD ↔ CV keyword match preview — proves answers will be grounded
  const match = useMemo(() => {
    if (!state.jobDescription.trim() || !state.resumeText.trim()) return null
    const jdKeys = extractKeywords(state.jobDescription)
    const resumeLower = state.resumeText.toLowerCase()
    const covered = jdKeys.filter(k => resumeLower.includes(k))
    const missing = jdKeys.filter(k => !resumeLower.includes(k))
    const pct = jdKeys.length ? Math.round((covered.length / jdKeys.length) * 100) : 0
    return { covered, missing, pct, total: jdKeys.length }
  }, [state.jobDescription, state.resumeText])

  const hasProfile = !!(state.jobDescription.trim() || state.resumeText.trim())

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white/90">Interview Profile</h2>
          <p className="text-sm text-white/40 mt-1">
            Paste the job description + your CV. Voice and screen questions are answered in your voice, using your experience.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => update('interviewMode', !state.interviewMode)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors"
            style={state.interviewMode
              ? { background: 'rgba(124,58,237,0.2)', color: '#c4b5fd', border: '1px solid rgba(124,58,237,0.3)' }
              : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)' }}
            title="When on, every AI answer is grounded in your JD + CV"
          >
            {state.interviewMode ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            Interview Mode {state.interviewMode ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* Company + Role */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm text-white/50 flex items-center gap-1.5 mb-2">
            <Building2 className="w-3.5 h-3.5 text-violet-400" /> Company
          </label>
          <input
            type="text"
            value={state.interviewCompany}
            onChange={(e) => update('interviewCompany', e.target.value)}
            placeholder="e.g. Stripe"
            maxLength={500}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm
                       text-white/90 placeholder-white/20 focus:border-violet-500/40
                       focus:outline-none transition-colors"
          />
        </div>
        <div>
          <label className="text-sm text-white/50 flex items-center gap-1.5 mb-2">
            <Briefcase className="w-3.5 h-3.5 text-violet-400" /> Role
          </label>
          <input
            type="text"
            value={state.interviewRole}
            onChange={(e) => update('interviewRole', e.target.value)}
            placeholder="e.g. Backend Engineer"
            maxLength={500}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm
                       text-white/90 placeholder-white/20 focus:border-violet-500/40
                       focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* Job Description */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm text-white/50 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-violet-400" /> Job Description
          </label>
          <span className="text-[10px] text-white/20 font-mono">{state.jobDescription.length}/20000</span>
        </div>
        <textarea
          value={state.jobDescription}
          onChange={(e) => update('jobDescription', e.target.value.slice(0, 20000))}
          placeholder="Paste the full job posting here — requirements, skills, responsibilities..."
          rows={7}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm
                     text-white/90 placeholder-white/20 focus:border-violet-500/40
                     focus:outline-none resize-y min-h-[140px] transition-colors"
        />
      </div>

      {/* Resume / CV */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm text-white/50 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-violet-400" /> Your CV / Resume
          </label>
          <span className="text-[10px] text-white/20 font-mono">{state.resumeText.length}/20000</span>
        </div>
        <textarea
          value={state.resumeText}
          onChange={(e) => update('resumeText', e.target.value.slice(0, 20000))}
          placeholder="Paste your CV as text, or upload a PDF/TXT below..."
          rows={7}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono
                     text-white/90 placeholder-white/20 focus:border-violet-500/40
                     focus:outline-none resize-y min-h-[140px] transition-colors"
        />
        <div className="flex items-center gap-2 mt-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.pdf"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 text-white/50
                       text-xs hover:bg-white/10 hover:text-white/70 disabled:opacity-30
                       disabled:cursor-not-allowed transition-colors"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {uploading ? 'Reading file...' : 'Upload CV (PDF/TXT)'}
          </button>
          {state.resumeText && (
            <button
              onClick={() => update('resumeText', '')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-white/30 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear CV
            </button>
          )}
        </div>
        {uploadError && (
          <div className="flex items-start gap-2 mt-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-400">{uploadError}</p>
            <button onClick={() => setUploadError(null)} className="ml-auto p-0.5 text-red-400/50 hover:text-red-400">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* JD ↔ CV match preview */}
      {match && (
        <div className="p-4 rounded-2xl bg-violet-500/5 border border-violet-500/15 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-medium text-white/70">
              JD ↔ CV match: {match.pct}% ({match.covered.length}/{match.total} keywords)
            </h3>
          </div>
          <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-violet-500 transition-all"
              style={{ width: `${match.pct}%` }}
            />
          </div>
          {match.covered.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {match.covered.slice(0, 20).map(k => (
                <span key={k} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">{k}</span>
              ))}
            </div>
          )}
          {match.missing.length > 0 && (
            <p className="text-[11px] text-white/30">
              Missing from CV: {match.missing.slice(0, 12).join(', ')}{match.missing.length > 12 ? '…' : ''} — answers will bridge these generically, never invent experience.
            </p>
          )}
        </div>
      )}

      {/* Auto-answer toggle */}
      <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.02] border border-white/5">
        <div className="flex items-start gap-2.5">
          <Mic className="w-4 h-4 text-violet-400 mt-0.5" />
          <div>
            <p className="text-sm text-white/70">Voice auto-answer</p>
            <p className="text-xs text-white/30 mt-0.5">
              While recording, detected questions are answered automatically using your JD + CV. Turn off for manual control.
            </p>
          </div>
        </div>
        <button
          onClick={() => update('autoAnswer', !state.autoAnswer)}
          className="p-1 text-white/30 hover:text-white/60 shrink-0"
          title={state.autoAnswer ? 'Disable auto-answer' : 'Enable auto-answer'}
        >
          {state.autoAnswer ? <ToggleRight className="w-6 h-6 text-violet-400" /> : <ToggleLeft className="w-6 h-6" />}
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-500 text-white
                     text-sm font-medium hover:bg-violet-600 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? 'Saved!' : 'Save Profile'}
        </button>
        {hasProfile && (
          <button
            onClick={handleClear}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 text-white/40
                       text-sm hover:bg-white/10 hover:text-white/60 transition-colors"
          >
            <Trash2 className="w-4 h-4" /> Clear
          </button>
        )}
        {error && <p className="text-red-400 text-xs ml-auto">{error}</p>}
      </div>

      {!hasProfile && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/5">
          <AlertCircle className="w-4 h-4 text-white/20 mt-0.5 shrink-0" />
          <p className="text-xs text-white/30 leading-relaxed">
            No profile yet. Paste a job description and your CV, turn Interview Mode ON, and save.
            Then use the overlay mic — questions you hear will be answered in first person from your experience.
          </p>
        </div>
      )}
    </div>
  )
}
