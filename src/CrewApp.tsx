import { Component, useState, type ReactNode } from 'react'
import { Search, Clock, Printer, DollarSign } from 'lucide-react'
import CrewLookup from './components/crew/CrewLookup'
import CrewExpiry from './components/crew/CrewExpiry'
import CrewPrint from './components/crew/CrewPrint'
import CrewPrice from './components/crew/CrewPrice'

// ─── Error boundary ───────────────────────────────────────────────────────────

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; message: string }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, message: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
          <p className="text-sm font-medium text-red-600">Something went wrong</p>
          <p className="text-xs text-gray-400">{this.state.message}</p>
          <button onClick={() => window.location.reload()} className="text-sm text-blue-600 underline">Reload</button>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── App ──────────────────────────────────────────────────────────────────────

type Tab = 'lookup' | 'expiry' | 'print' | 'price'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'lookup', label: 'Lookup',  icon: <Search size={16} /> },
  { id: 'expiry', label: 'Expiry',  icon: <Clock size={16} /> },
  { id: 'print',  label: 'Print',   icon: <Printer size={16} /> },
  { id: 'price',  label: 'Price',   icon: <DollarSign size={16} /> },
]

const TAB_TITLES: Record<Tab, string> = {
  lookup: 'Product Lookup',
  expiry: 'Add Expiry',
  print:  'Print Label',
  price:  'Price Change',
}

const LAST_TAB_KEY = 'crew-app-last-tab'

export default function CrewApp() {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const saved = localStorage.getItem(LAST_TAB_KEY) as Tab | null
    return saved && TABS.some(t => t.id === saved) ? saved : 'lookup'
  })

  function handleTabChange(tab: Tab) {
    setActiveTab(tab)
    localStorage.setItem(LAST_TAB_KEY, tab)
  }

  const renderTab = () => {
    switch (activeTab) {
      case 'lookup': return <CrewLookup />
      case 'expiry': return <CrewExpiry />
      case 'print':  return <CrewPrint />
      case 'price':  return <CrewPrice />
    }
  }

  return (
    <div className="flex flex-col h-screen-safe max-w-[480px] mx-auto bg-white relative">
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-white shrink-0">
        <h1 className="text-base font-semibold text-gray-900">{TAB_TITLES[activeTab]}</h1>
        <span className="text-[10px] font-semibold px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">CREW</span>
      </header>

      <main className="flex-1 overflow-auto relative">
        <ErrorBoundary>{renderTab()}</ErrorBoundary>
      </main>

      <nav className="flex border-t border-gray-200 bg-white pb-safe shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`flex-1 flex flex-col items-center py-1.5 gap-0.5 text-[10px] font-medium transition-colors ${activeTab === tab.id ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
