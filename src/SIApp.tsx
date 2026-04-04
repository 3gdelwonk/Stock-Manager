import { useState, useEffect, Component, type ReactNode } from 'react'
import SISidebar, { type SIView } from './components/si/SISidebar'
import SITopbar from './components/si/SITopbar'
import SIMobileMenu from './components/si/SIMobileMenu'
import ExpiryWatch from './components/si/ExpiryWatch'
import QuickStock from './components/si/QuickStock'
import CalendarView from './components/si/CalendarView'
import InsightsPlaceholder from './components/si/InsightsPlaceholder'
import GmailScoutPlaceholder from './components/si/GmailScoutPlaceholder'

const STORAGE_KEY = 'si-app-last-view'

const VIEW_TITLES: Record<SIView, string> = {
  expiry: 'Expiry Watch',
  insights: 'Insights',
  quickstock: 'Quick Stock',
  calendar: 'Calendar',
  gmail: 'Gmail Scout',
}

function getView(): SIView {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && stored in VIEW_TITLES) return stored as SIView
  return 'expiry'
}

// Error boundary
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center h-full p-8">
          <div className="text-center max-w-md">
            <p className="text-red-600 font-semibold text-lg mb-2">Something went wrong</p>
            <p className="text-sm text-gray-600 mb-4">{this.state.error.message}</p>
            <button onClick={() => this.setState({ error: null })} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">
              Try Again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function SIApp() {
  const [activeView, setActiveView] = useState<SIView>(getView)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, activeView)
  }, [activeView])

  const navigate = (view: SIView) => {
    setActiveView(view)
    setMobileMenuOpen(false)
  }

  const content = (() => {
    switch (activeView) {
      case 'expiry': return <ExpiryWatch />
      case 'insights': return <InsightsPlaceholder />
      case 'quickstock': return <QuickStock />
      case 'calendar': return <CalendarView />
      case 'gmail': return <GmailScoutPlaceholder />
    }
  })()

  return (
    <div className="flex h-screen bg-[#f8faf9] overflow-hidden">
      <SISidebar activeView={activeView} onNavigate={navigate} />

      <div className="flex-1 flex flex-col min-w-0">
        <SITopbar
          title={VIEW_TITLES[activeView]}
          onMenuToggle={() => setMobileMenuOpen(true)}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <ErrorBoundary>{content}</ErrorBoundary>
        </main>
      </div>

      <SIMobileMenu
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        activeView={activeView}
        onNavigate={navigate}
      />
    </div>
  )
}
