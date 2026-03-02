// Playbooks page — upload and manage context documents for RAG injection
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  BookOpen, Plus, Trash2, FileText, ToggleLeft, ToggleRight,
  Upload, X, Save, Loader2, AlertCircle
} from 'lucide-react'

interface Playbook {
  id: string
  name: string
  content: string
  isActive: boolean
  createdAt: number
}

export default function Playbooks() {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [showEditor, setShowEditor] = useState(false)
  const [editingPlaybook, setEditingPlaybook] = useState<Playbook | null>(null)
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadPlaybooks()
  }, [])

  const loadPlaybooks = async () => {
    try {
      const saved = await window.specterAPI.getSetting<Playbook[]>('playbooks')
      setPlaybooks(saved || [])
    } catch (err) {
      console.error('Failed to load playbooks:', err)
    }
  }

  const savePlaybooks = useCallback(async (updated: Playbook[]) => {
    await window.specterAPI.setSetting('playbooks', updated)
    setPlaybooks(updated)
  }, [])

  const handleCreate = useCallback(async () => {
    if (!name.trim() || !content.trim()) return
    setSaving(true)
    try {
      const newPlaybook: Playbook = {
        id: `pb-${Date.now()}`,
        name: name.trim(),
        content: content.trim(),
        isActive: true,
        createdAt: Date.now()
      }

      if (editingPlaybook) {
        const updated = playbooks.map((p) =>
          p.id === editingPlaybook.id ? { ...p, name: name.trim(), content: content.trim() } : p
        )
        await savePlaybooks(updated)
      } else {
        await savePlaybooks([...playbooks, newPlaybook])
      }

      setShowEditor(false)
      setEditingPlaybook(null)
      setName('')
      setContent('')
    } catch (err) {
      console.error('Failed to save playbook:', err)
    } finally {
      setSaving(false)
    }
  }, [name, content, playbooks, editingPlaybook, savePlaybooks])

  const handleDelete = useCallback(async (id: string) => {
    const updated = playbooks.filter((p) => p.id !== id)
    await savePlaybooks(updated)
  }, [playbooks, savePlaybooks])

  const handleToggle = useCallback(async (id: string) => {
    const updated = playbooks.map((p) =>
      p.id === id ? { ...p, isActive: !p.isActive } : p
    )
    await savePlaybooks(updated)
  }, [playbooks, savePlaybooks])

  const handleEdit = useCallback((playbook: Playbook) => {
    setEditingPlaybook(playbook)
    setName(playbook.name)
    setContent(playbook.content)
    setShowEditor(true)
  }, [])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      setContent(text)
      if (!name) {
        setName(file.name.replace(/\.[^/.]+$/, ''))
      }
    }
    reader.readAsText(file)
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [name])

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white/90">Playbooks</h2>
          <p className="text-sm text-white/40 mt-1">
            Add context documents that get injected into AI queries
          </p>
        </div>
        <button
          onClick={() => {
            setShowEditor(true)
            setEditingPlaybook(null)
            setName('')
            setContent('')
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500/20 text-violet-300
                     text-sm hover:bg-violet-500/30 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Playbook
        </button>
      </div>

      {/* Editor */}
      {showEditor && (
        <div className="space-y-4 p-5 rounded-2xl bg-white/[0.03] border border-white/10">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-white/70">
              {editingPlaybook ? 'Edit Playbook' : 'New Playbook'}
            </h3>
            <button
              onClick={() => {
                setShowEditor(false)
                setEditingPlaybook(null)
              }}
              className="p-1 rounded-lg hover:bg-white/10 text-white/30 hover:text-white/60"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Playbook name..."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm
                       text-white/90 placeholder-white/20 focus:border-violet-500/40
                       focus:outline-none transition-colors"
          />

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste your context document here, or upload a file..."
            rows={8}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm
                       text-white/90 placeholder-white/20 focus:border-violet-500/40
                       focus:outline-none resize-y min-h-[120px] transition-colors font-mono"
          />

          <div className="flex items-center gap-3">
            <button
              onClick={handleCreate}
              disabled={saving || !name.trim() || !content.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500 text-white
                         text-sm hover:bg-violet-600 disabled:opacity-30 disabled:cursor-not-allowed
                         transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editingPlaybook ? 'Update' : 'Save'}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.pdf,.csv,.json"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 text-white/50
                         text-sm hover:bg-white/10 hover:text-white/70 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload File
            </button>
          </div>
        </div>
      )}

      {/* Playbook list */}
      {playbooks.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen className="w-10 h-10 text-white/10 mx-auto mb-3" />
          <p className="text-white/30 text-sm mb-1">No playbooks yet</p>
          <p className="text-white/15 text-xs">
            Playbooks provide extra context to the AI. Add your meeting notes, company docs, etc.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {playbooks.map((playbook) => (
            <div
              key={playbook.id}
              className="flex items-start gap-4 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/5
                         hover:bg-white/[0.04] transition-colors group"
            >
              <FileText className={`w-5 h-5 mt-0.5 shrink-0 ${
                playbook.isActive ? 'text-violet-400' : 'text-white/15'
              }`} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className={`text-sm font-medium truncate ${
                    playbook.isActive ? 'text-white/70' : 'text-white/30'
                  }`}>
                    {playbook.name}
                  </h4>
                  {!playbook.isActive && (
                    <span className="text-[10px] text-white/20 px-1.5 py-0.5 rounded bg-white/5">
                      Disabled
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/20 mt-0.5 line-clamp-1 font-mono">
                  {playbook.content.slice(0, 100)}...
                </p>
                <p className="text-[10px] text-white/10 mt-1">
                  {new Date(playbook.createdAt).toLocaleDateString()} &middot;{' '}
                  {(playbook.content.length / 1024).toFixed(1)}KB
                </p>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleToggle(playbook.id)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-white/60"
                  title={playbook.isActive ? 'Disable' : 'Enable'}
                >
                  {playbook.isActive ? (
                    <ToggleRight className="w-4 h-4 text-violet-400" />
                  ) : (
                    <ToggleLeft className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={() => handleEdit(playbook)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-white/60"
                  title="Edit"
                >
                  <FileText className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(playbook.id)}
                  className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/30 hover:text-red-400"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-violet-500/5 border border-violet-500/10">
        <AlertCircle className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
        <div className="text-xs text-white/30 leading-relaxed">
          <p>Active playbooks are injected as additional context when you query the AI.</p>
          <p className="mt-1">
            Supported formats: .txt, .md, .csv, .json. PDFs will be added in a future update.
          </p>
        </div>
      </div>
    </div>
  )
}
