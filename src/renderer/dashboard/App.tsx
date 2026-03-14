// Dashboard App — Settings and configuration UI for Specter AI
import { useState, useEffect } from 'react'
import { Settings as SettingsIcon, Cpu, BookOpen, MessageSquare, Ghost, Zap } from 'lucide-react'
import SettingsPage from './pages/Settings'
import ModelsPage from './pages/Models'
import PlaybooksPage from './pages/Playbooks'
import HistoryPage from './pages/History'

declare global {
  interface Window {
    specterAPI: import('../../preload/index').SpecterAPI
  }
}

type Page = 'settings' | 'models' | 'playbooks' | 'history'

const NAV_ITEMS: Array<{ id: Page; label: string; icon: typeof SettingsIcon }> = [
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
  { id: 'models', label: 'Models', icon: Cpu },
  { id: 'playbooks', label: 'Playbooks', icon: BookOpen },
  { id: 'history', label: 'History', icon: MessageSquare }
]

export default function App() {
  const [activePage, setActivePage] = useState<Page>('settings')

  // Load and apply theme from settings
  useEffect(() => {
    window.specterAPI?.getSetting<'dark' | 'light' | 'glass'>('theme').then((t) => {
      document.documentElement.setAttribute('data-theme', t || 'dark')
    })
  }, [])

  return (
    <div className="flex h-screen" style={{ background: 'var(--specter-bg-deeper)', color: 'var(--specter-text)' }}>
      {/* Sidebar */}
      <nav className="dashboard-sidebar w-56 flex flex-col shrink-0">
        {/* Logo area */}
        <div className="px-5 py-5 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <Ghost className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white/90">Specter AI</h1>
              <p className="text-[10px] text-white/30">Settings & Config</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = activePage === item.id
            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm
                           transition-all duration-200 ${
                             isActive
                               ? 'bg-violet-500/15 text-violet-300 shadow-lg shadow-violet-500/5'
                               : 'text-white/40 hover:text-white/60 hover:bg-white/5'
                           }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-violet-400' : ''}`} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/5">
          <div className="flex items-center gap-2 text-white/20 text-xs">
            <Zap className="w-3 h-3" />
            <span>v1.0.0</span>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="dashboard-content flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-8">
          {activePage === 'settings' && <SettingsPage />}
          {activePage === 'models' && <ModelsPage />}
          {activePage === 'playbooks' && <PlaybooksPage />}
          {activePage === 'history' && <HistoryPage />}
        </div>
      </main>
    </div>
  )
}
