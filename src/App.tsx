/// <reference types="vite-plugin-pwa/react" />
import { Component, useState, type ReactNode } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { LayoutDashboard, Warehouse, Package, Clock, Tag, BarChart2, Lightbulb, Settings } from 'lucide-react'
import Dashboard from './components/Dashboard'
import LiveStockView from './components/LiveStockView'
import ProductsView from './components/ProductsView'
import ExpiryView from './components/ExpiryView'
import PromotionsView from './components/PromotionsView'
import PerformanceView from './components/PerformanceView'
import InsightView from './components/InsightView'
import SettingsSheet from './components/SettingsSheet'

// ─── Update banner ────────────────────────────────────────────────────────────

function UpdateBanner() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW()
  if (!needRefresh) return null
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-emerald-600 text-white shrink-0 gap-3">
      <p className="text-sm">Update available — new version ready.</p>
      <div className="flex items-center gap-3 shrink-0">
        <button onClick={() => updateServiceWorker(true)} className="text-sm font-semibold underline whitespace-nowrap">Refresh now</button>
        <button onClick={() => setNeedRefresh(false)} className="text-white/70 text-lg leading-none" aria-label="Dismiss">✕</button>
      </div>
    </div>
  )
}

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
          <button onClick={() => window.location.reload()} className="text-sm text-emerald-600 underline">Reload app</button>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── App ──────────────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'stock' | 'products' | 'expiry' | 'promos' | 'performance' | 'insights'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard',   label: 'Home',       icon: <LayoutDashboard size={16} /> },
  { id: 'products',    label: 'Products',   icon: <Package size={16} /> },
  { id: 'stock',       label: 'Stock',      icon: <Warehouse size={16} /> },
  { id: 'expiry',      label: 'Expiry',     icon: <Clock size={16} /> },
  { id: 'promos',      label: 'Promos',     icon: <Tag size={16} /> },
  { id: 'insights',    label: 'Insights',   icon: <Lightbulb size={16} /> },
  { id: 'performance', label: 'Perform',    icon: <BarChart2 size={16} /> },
]

const TAB_TITLES: Record<Tab, string> = {
  dashboard:   'Dashboard',
  stock:       'Live Stock',
  products:    'Products',
  expiry:      'Expiry Management',
  promos:      'Promotions',
  insights:    'AI Insights',
  performance: 'Performance',
}

const LAST_TAB_KEY = 'grocery-manager-last-tab'

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const saved = localStorage.getItem(LAST_TAB_KEY) as Tab | null
    return saved && TABS.some(t => t.id === saved) ? saved : 'dashboard'
  })
  const [showSettings, setShowSettings] = useState(false)
  const [productsAction, setProductsAction] = useState<'scan' | 'search' | null>(null)

  function handleTabChange(tab: Tab) {
    setActiveTab(tab)
    localStorage.setItem(LAST_TAB_KEY, tab)
    setShowSettings(false)
  }

  function handleNavigate(tab: Tab, action?: 'scan' | 'search') {
    if (tab === 'products' && action) {
      setProductsAction(action)
    }
    handleTabChange(tab)
  }

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard':   return <Dashboard onNavigate={handleNavigate} />
      case 'stock':       return <LiveStockView />
      case 'products':    return <ProductsView initialAction={productsAction} onActionConsumed={() => setProductsAction(null)} />
      case 'expiry':      return <ExpiryView />
      case 'promos':      return <PromotionsView />
      case 'insights':    return <InsightView />
      case 'performance': return <PerformanceView />
    }
  }

  return (
    <div className="flex flex-col h-screen-safe max-w-[480px] mx-auto bg-white relative">
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-white shrink-0">
        <h1 className="text-base font-semibold text-gray-900">{TAB_TITLES[activeTab]}</h1>
        <button onClick={() => setShowSettings(true)} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500" aria-label="Settings">
          <Settings size={18} />
        </button>
      </header>

      <UpdateBanner />

      <main className="flex-1 overflow-auto relative">
        <ErrorBoundary>{renderTab()}</ErrorBoundary>
      </main>

      <nav className="flex border-t border-gray-200 bg-white pb-safe shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`flex-1 flex flex-col items-center py-1.5 gap-0.5 text-[10px] font-medium transition-colors ${activeTab === tab.id ? 'text-emerald-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </nav>

      {showSettings && <SettingsSheet onClose={() => setShowSettings(false)} />}
    </div>
  )
}
