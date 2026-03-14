// ResponseCard — displays a single message in the overlay with markdown support
import { memo, useState, useCallback, useMemo } from 'react'
import { User, Bot, Copy, Check } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import type { Message } from '../../shared/types'

interface ResponseCardProps {
  message: Message
  isStreaming?: boolean
}

function ResponseCard({ message, isStreaming = false }: ResponseCardProps) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard may not be available
    }
  }, [message.content])

  // Memoize markdown rendering for assistant messages
  const renderedContent = useMemo(() => {
    if (isUser) {
      return <span className="whitespace-pre-wrap break-words">{message.content}</span>
    }

    return (
      <ReactMarkdown
        rehypePlugins={[rehypeSanitize]}
        components={{
          // Headings
          h1: ({ children }) => <h1 className="text-base font-bold text-white/90 mt-3 mb-1">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-bold text-white/85 mt-2.5 mb-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold text-white/80 mt-2 mb-0.5">{children}</h3>,

          // Paragraphs
          p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,

          // Lists
          ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="text-white/80">{children}</li>,

          // Inline code
          code: ({ className, children, ...props }) => {
            const isBlock = className?.includes('language-')
            if (isBlock) {
              const lang = className?.replace('language-', '') || ''
              return (
                <div className="my-2 rounded-lg overflow-hidden">
                  {lang && (
                    <div className="px-3 py-1 bg-white/5 text-[10px] text-white/30 font-mono uppercase tracking-wider">
                      {lang}
                    </div>
                  )}
                  <pre className="px-3 py-2 bg-black/30 text-xs font-mono text-emerald-300/80 overflow-x-auto">
                    <code {...props}>{children}</code>
                  </pre>
                </div>
              )
            }
            return (
              <code className="px-1.5 py-0.5 rounded bg-white/10 text-violet-300/90 text-xs font-mono" {...props}>
                {children}
              </code>
            )
          },

          // Pre (code blocks)
          pre: ({ children }) => <>{children}</>,

          // Blockquote
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-violet-500/30 pl-3 my-2 text-white/60 italic">
              {children}
            </blockquote>
          ),

          // Strong / Em
          strong: ({ children }) => <strong className="font-semibold text-white/95">{children}</strong>,
          em: ({ children }) => <em className="italic text-white/70">{children}</em>,

          // Horizontal rule
          hr: () => <hr className="border-white/10 my-3" />,

          // Links — open in external browser
          a: ({ children, href }) => (
            <a
              href={href}
              className="text-violet-400/80 underline underline-offset-2 cursor-pointer hover:text-violet-300 transition-colors"
              title={href}
              onClick={(e) => {
                e.preventDefault()
                if (href) window.specterAPI?.openExternal(href)
              }}
            >
              {children}
            </a>
          ),

          // Tables
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="min-w-full text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="border-b border-white/10">{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr className="border-b border-white/5">{children}</tr>,
          th: ({ children }) => <th className="px-2 py-1.5 text-left text-white/60 font-medium">{children}</th>,
          td: ({ children }) => <td className="px-2 py-1.5 text-white/50">{children}</td>
        }}
      >
        {message.content}
      </ReactMarkdown>
    )
  }, [message.content, isUser])

  return (
    <div
      className={`group relative flex gap-2.5 animate-fade-in ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      <div
        className={`shrink-0 w-6 h-6 rounded-lg flex items-center justify-center mt-0.5 ${
          isUser
            ? 'bg-violet-500/20 text-violet-400'
            : 'bg-emerald-500/20 text-emerald-400'
        }`}
      >
        {isUser ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
      </div>

      {/* Message bubble */}
      <div
        className={`relative max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
          isUser
            ? 'bg-violet-500/15 text-white/90 rounded-tr-sm'
            : 'bg-white/5 text-white/85 rounded-tl-sm'
        }`}
      >
        {/* Rendered content */}
        <div className="break-words overflow-hidden">
          {renderedContent}
        </div>

        {/* Streaming cursor */}
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 bg-violet-400 animate-pulse ml-0.5 align-middle rounded-full" />
        )}

        {/* Cost indicator */}
        {message.tokenCount && message.cost !== undefined && (
          <div className="mt-1.5 pt-1.5 border-t border-white/5 flex items-center gap-2 text-[10px] text-white/20">
            <span>{message.tokenCount} tokens</span>
            <span>&middot;</span>
            <span>${message.cost.toFixed(6)}</span>
          </div>
        )}

        {/* Copy button — shown on hover for assistant messages */}
        {!isUser && !isStreaming && message.content && (
          <button
            onClick={handleCopy}
            className="absolute -bottom-1 -right-1 p-1 rounded-lg bg-specter-dark/90 border border-white/10
                       opacity-0 group-hover:opacity-100 transition-opacity"
            title="Copy response"
          >
            {copied ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Copy className="w-3 h-3 text-white/40" />
            )}
          </button>
        )}
      </div>
    </div>
  )
}

export default memo(ResponseCard)
