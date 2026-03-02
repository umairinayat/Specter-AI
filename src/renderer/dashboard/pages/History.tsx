// History page — view and manage conversation history
import { useState, useEffect, useCallback } from 'react'
import {
  MessageSquare, Trash2, Clock, ChevronRight, Search,
  Bot, User, X
} from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

interface Conversation {
  id: string
  title: string
  messages: Message[]
  model: string
  createdAt: number
  updatedAt: number
}

export default function History() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadConversations()
  }, [])

  const loadConversations = async () => {
    try {
      const saved = await window.specterAPI.listConversations()
      setConversations((saved || []) as Conversation[])
    } catch (err) {
      console.error('Failed to load conversations:', err)
    }
  }

  const handleDelete = useCallback(async (id: string) => {
    window.specterAPI.deleteConversation(id)
    const updated = conversations.filter((c) => c.id !== id)
    setConversations(updated)
    if (selectedConversation?.id === id) {
      setSelectedConversation(null)
    }
  }, [conversations, selectedConversation])

  const handleClearAll = useCallback(async () => {
    window.specterAPI.clearConversations()
    setConversations([])
    setSelectedConversation(null)
  }, [])

  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      c.title.toLowerCase().includes(q) ||
      c.messages.some((m) => m.content.toLowerCase().includes(q))
    )
  })

  const sortedConversations = [...filteredConversations].sort(
    (a, b) => b.updatedAt - a.updatedAt
  )

  const formatDate = (ts: number): string => {
    const d = new Date(ts)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(hours / 24)

    if (hours < 1) return 'Just now'
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return d.toLocaleDateString()
  }

  // Detail view
  if (selectedConversation) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedConversation(null)}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/70"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-white/90 truncate">
              {selectedConversation.title}
            </h2>
            <p className="text-xs text-white/30">
              {selectedConversation.model} &middot;{' '}
              {new Date(selectedConversation.createdAt).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {selectedConversation.messages
            .filter((m) => m.role !== 'system')
            .map((msg) => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div
                  className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${
                    msg.role === 'user'
                      ? 'bg-violet-500/20 text-violet-400'
                      : 'bg-emerald-500/20 text-emerald-400'
                  }`}
                >
                  {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                </div>
                <div
                  className={`max-w-[80%] px-4 py-3 rounded-xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-violet-500/10 text-white/80'
                      : 'bg-white/5 text-white/70'
                  }`}
                >
                  <pre className="whitespace-pre-wrap break-words font-sans">{msg.content}</pre>
                  <p className="text-[10px] text-white/20 mt-2">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white/90">Conversation History</h2>
          <p className="text-sm text-white/40 mt-1">
            Browse and search your past AI conversations
          </p>
        </div>
        {conversations.length > 0 && (
          <button
            onClick={handleClearAll}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm
                       text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear All
          </button>
        )}
      </div>

      {/* Search */}
      {conversations.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5
                       text-sm text-white/90 placeholder-white/20 focus:border-violet-500/40
                       focus:outline-none transition-colors"
          />
        </div>
      )}

      {/* Conversation list */}
      {sortedConversations.length === 0 ? (
        <div className="text-center py-12">
          <MessageSquare className="w-10 h-10 text-white/10 mx-auto mb-3" />
          <p className="text-white/30 text-sm mb-1">
            {searchQuery ? 'No conversations match your search' : 'No conversations yet'}
          </p>
          <p className="text-white/15 text-xs">
            Your AI conversation history will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedConversations.map((conv) => {
            const lastMessage = conv.messages[conv.messages.length - 1]
            return (
              <button
                key={conv.id}
                onClick={() => setSelectedConversation(conv)}
                className="w-full text-left flex items-start gap-3 px-4 py-3 rounded-xl
                           bg-white/[0.02] border border-white/5 hover:bg-white/5
                           hover:border-white/10 transition-all group"
              >
                <MessageSquare className="w-5 h-5 text-white/15 mt-0.5 shrink-0
                                         group-hover:text-violet-400/50 transition-colors" />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-white/60 truncate group-hover:text-white/80">
                      {conv.title}
                    </h4>
                    <span className="text-[10px] text-white/15 shrink-0 font-mono">
                      {conv.model.split('/').pop()}
                    </span>
                  </div>
                  {lastMessage && (
                    <p className="text-xs text-white/20 mt-0.5 truncate">
                      {lastMessage.content.slice(0, 100)}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-white/15">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(conv.updatedAt)}
                    </span>
                    <span>{conv.messages.filter((m) => m.role !== 'system').length} messages</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(conv.id)
                    }}
                    className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100
                               hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-all"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <ChevronRight className="w-4 h-4 text-white/10 group-hover:text-white/30" />
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
