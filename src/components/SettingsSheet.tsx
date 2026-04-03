import { useState, useRef, useEffect } from 'react'
import { clearAllData } from '../lib/db'
import { getStockLevels } from '../lib/jarvis'
import { prefetchImages, isImageSearchConfigured, clearImageCache, clearFailedImageCache, getImageCacheStats, type PrefetchProgress } from '../lib/images'
import {
  getSerperUsage, getSerperBudget, setSerperBudget, resetSerperUsage,
  computeImagePriority, getSerperSearchedCount, clearSerperSearched,
  type SerperUsage, type SerperBudget,
} from '../lib/serper'
import ImportView from './ImportView'

function UsageBar({ used, total, color }: { used: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-400 w-8 text-right">{Math.round(pct)}%</span>
    </div>
  )
}

export default function SettingsSheet({ onClose }: { onClose: () => void }) {
  const [leadTime, setLeadTime] = useState(() => {
    return parseInt(localStorage.getItem('grocery-manager-lead-time') ?? '2', 10)
  })
  const [jarvisUrl, setJarvisUrl] = useState(
    () => localStorage.getItem('grocery-manager-jarvis-url') ?? (import.meta.env.VITE_JARVIS_URL as string) ?? ''
  )
  const [jarvisKey, setJarvisKey] = useState(
    () => localStorage.getItem('grocery-manager-jarvis-key') ?? (import.meta.env.VITE_JARVIS_API_KEY as string) ?? ''
  )
  const [expiryRed, setExpiryRed] = useState(() => {
    return parseInt(localStorage.getItem('grocery-manager-expiry-red') ?? '3', 10)
  })
  const [expiryAmber, setExpiryAmber] = useState(() => {
    return parseInt(localStorage.getItem('grocery-manager-expiry-amber') ?? '7', 10)
  })
  const [clearing, setClearing] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [prefetching, setPrefetching] = useState(false)
  const [prefetchProgress, setPrefetchProgress] = useState<PrefetchProgress | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [cacheStats, setCacheStats] = useState<{ total: number; found: number; failed: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Serper budget state
  const [usage, setUsage] = useState<SerperUsage>(() => getSerperUsage())
  const [budget, setBudget] = useState<SerperBudget>(() => getSerperBudget())
  const [serperSearchedCount, setSerperSearchedCount] = useState(0)

  useEffect(() => {
    getImageCacheStats().then(setCacheStats)
    getSerperSearchedCount().then(setSerperSearchedCount)
  }, [])

  function saveLead() {
    localStorage.setItem('grocery-manager-lead-time', String(leadTime))
  }

  function saveJarvis() {
    if (jarvisUrl.trim()) {
      localStorage.setItem('grocery-manager-jarvis-url', jarvisUrl.trim())
      localStorage.setItem('grocery-manager-jarvis-key', jarvisKey.trim())
    } else {
      localStorage.removeItem('grocery-manager-jarvis-url')
      localStorage.removeItem('grocery-manager-jarvis-key')
    }
  }

  function saveExpiryRed() {
    localStorage.setItem('grocery-manager-expiry-red', String(expiryRed))
  }

  function saveExpiryAmber() {
    localStorage.setItem('grocery-manager-expiry-amber', String(expiryAmber))
  }

  function saveBudget(updates: Partial<SerperBudget>) {
    const next = { ...budget, ...updates }
    setBudget(next)
    setSerperBudget(next)
  }

  async function handlePrefetch() {
    if (prefetching) {
      abortRef.current?.abort()
      setPrefetching(false)
      return
    }
    setPrefetching(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const stock = await getStockLevels({ limit: 50000 })
      const allItems = stock
        .map(s => ({ ...s, _priority: computeImagePriority({ avgDayQty: s.avgDayQty, sellPrice: s.sellPrice, avgCost: s.avgCost }) }))
        .sort((a, b) => b._priority - a._priority)
        .map(s => ({
          itemCode: s.itemCode, description: s.description, department: s.department, barcode: s.barcode,
        }))
      await prefetchImages(allItems, (p) => {
        setPrefetchProgress(p)
        setUsage(getSerperUsage())
        getSerperSearchedCount().then(setSerperSearchedCount)
      }, controller.signal)
    } catch { /* aborted or error */ }
    setPrefetching(false)
    setUsage(getSerperUsage())
    getSerperSearchedCount().then(setSerperSearchedCount)
  }

  async function handleClear() {
    if (!confirm) { setConfirm(true); return }
    setClearing(true)
    await clearAllData()
    setClearing(false)
    setConfirm(false)
    onClose()
  }

  if (showImport) {
    return (
      <div className="fixed inset-0 z-50 bg-white">
        <ImportView onClose={() => setShowImport(false)} />
      </div>
    )
  }

  const totalUsed = usage.images + usage.shopping + usage.other
  const budgetSum = budget.images + budget.shopping + budget.other
  const budgetValid = budgetSum <= budget.monthlyLimit

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl p-6 space-y-5 pb-safe max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Settings</h2>
          <button onClick={onClose} className="text-gray-400 text-lg leading-none">✕</button>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Lead Time (days)</label>
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              max={30}
              value={leadTime}
              onChange={(e) => setLeadTime(Number(e.target.value))}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
            />
            <button onClick={saveLead} className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg">Save</button>
          </div>
          <p className="text-xs text-gray-400">Used for replenishment signals in Performance view</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">JARVISmart URL</label>
          <div className="flex gap-2">
            <input
              type="url"
              value={jarvisUrl}
              onChange={(e) => setJarvisUrl(e.target.value)}
              placeholder="http://192.168.20.100:3100"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
            />
            <button onClick={saveJarvis} className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg">Save</button>
          </div>
          <label className="text-sm font-medium text-gray-700">JARVISmart API Key</label>
          <input
            type="text"
            value={jarvisKey}
            onChange={(e) => setJarvisKey(e.target.value)}
            placeholder="API key (optional on LAN)"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Search API Usage</label>
          <p className="text-xs text-gray-400">Images &amp; shopping powered by JARVISmart server (Serper + SerpApi)</p>

          {/* ── Budget & Usage ── */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-3 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-700">
                  {new Date().toLocaleString('en-AU', { month: 'long', year: 'numeric' })} — Serper Usage
                </span>
                <span className="text-[10px] text-gray-400">{totalUsed} / {budget.monthlyLimit}</span>
              </div>

              <div className="space-y-1.5">
                <div>
                  <div className="flex justify-between text-[10px] text-gray-500">
                    <span>Images</span><span>{usage.images} / {budget.images}</span>
                  </div>
                  <UsageBar used={usage.images} total={budget.images} color="bg-blue-500" />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-gray-500">
                    <span>Shopping</span><span>{usage.shopping} / {budget.shopping}</span>
                  </div>
                  <UsageBar used={usage.shopping} total={budget.shopping} color="bg-purple-500" />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-gray-500">
                    <span>Other</span><span>{usage.other} / {budget.other}</span>
                  </div>
                  <UsageBar used={usage.other} total={budget.other} color="bg-gray-400" />
                </div>
                <div className="pt-1 border-t border-gray-200">
                  <div className="flex justify-between text-[10px] font-medium text-gray-600">
                    <span>Total</span><span>{totalUsed} / {budget.monthlyLimit}</span>
                  </div>
                  <UsageBar used={totalUsed} total={budget.monthlyLimit} color="bg-emerald-500" />
                </div>
              </div>

              {/* Budget allocation */}
              <div className="space-y-1.5 pt-2 border-t border-gray-200">
                <span className="text-[10px] font-semibold text-gray-600">Budget Allocation</span>
                <div className="grid grid-cols-4 gap-1.5">
                  <div>
                    <label className="text-[9px] text-gray-400">Plan Limit</label>
                    <input type="number" min={100} value={budget.monthlyLimit}
                      onChange={e => saveBudget({ monthlyLimit: Number(e.target.value) || 5000 })}
                      className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs text-center" />
                  </div>
                  <div>
                    <label className="text-[9px] text-gray-400">Images</label>
                    <input type="number" min={0} value={budget.images}
                      onChange={e => saveBudget({ images: Number(e.target.value) || 0 })}
                      className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs text-center" />
                  </div>
                  <div>
                    <label className="text-[9px] text-gray-400">Shopping</label>
                    <input type="number" min={0} value={budget.shopping}
                      onChange={e => saveBudget({ shopping: Number(e.target.value) || 0 })}
                      className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs text-center" />
                  </div>
                  <div>
                    <label className="text-[9px] text-gray-400">Other</label>
                    <input type="number" min={0} value={budget.other}
                      onChange={e => saveBudget({ other: Number(e.target.value) || 0 })}
                      className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs text-center" />
                  </div>
                </div>
                {!budgetValid && (
                  <p className="text-[10px] text-red-500 font-medium">
                    Budget sum ({budgetSum}) exceeds plan limit ({budget.monthlyLimit})
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-medium text-gray-600">Serper Searched</span>
                    <p className="text-[9px] text-gray-400">{serperSearchedCount.toLocaleString()} products done</p>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={async () => { await clearSerperSearched(); setSerperSearchedCount(0) }}
                      className="px-2 py-1 text-[10px] text-gray-400 hover:text-amber-600 transition-colors"
                    >
                      Reset Queue
                    </button>
                    <button
                      onClick={() => { resetSerperUsage(); setUsage(getSerperUsage()) }}
                      className="px-2 py-1 text-[10px] text-gray-400 hover:text-red-500 transition-colors"
                    >
                      Reset Usage
                    </button>
                  </div>
                </div>
                <p className="text-[9px] text-gray-400">
                  Products are Serper-searched in priority order (margin × velocity). Each product is searched once then marked done.
                </p>
              </div>
            </div>

          {isImageSearchConfigured() && (
            <div className="mt-2">
              <button
                onClick={handlePrefetch}
                className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
                  prefetching ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-600'
                }`}
              >
                {prefetching
                  ? `${prefetchProgress ? `${prefetchProgress.done}/${prefetchProgress.total} (${prefetchProgress.found} found${prefetchProgress.errors ? `, ${prefetchProgress.errors} errors` : ''})` : 'Starting...'} — tap to stop`
                  : 'Fetch Product Images'}
              </button>
              {prefetching && prefetchProgress && (
                <p className="text-xs text-gray-400 mt-1 truncate">
                  {prefetchProgress.current}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Expiry Red Alert (days)</label>
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              max={30}
              value={expiryRed}
              onChange={(e) => setExpiryRed(Number(e.target.value))}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
            />
            <button onClick={saveExpiryRed} className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg">Save</button>
          </div>
          <p className="text-xs text-gray-400">Items expiring within this many days show red alert</p>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Expiry Amber Alert (days)</label>
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              max={60}
              value={expiryAmber}
              onChange={(e) => setExpiryAmber(Number(e.target.value))}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
            />
            <button onClick={saveExpiryAmber} className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg">Save</button>
          </div>
          <p className="text-xs text-gray-400">Items expiring within this many days show amber warning</p>
        </div>

        <div className="space-y-2 border-t border-gray-100 pt-4">
          <button
            onClick={() => setShowImport(true)}
            className="w-full py-2.5 rounded-lg text-sm font-medium bg-emerald-50 text-emerald-600 transition-colors hover:bg-emerald-100"
          >
            Import Data
          </button>
          {cacheStats && (
            <p className="text-xs text-gray-500">
              Image cache: {cacheStats.found} images saved, {cacheStats.failed} not found, {cacheStats.total} total
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={async () => { const n = await clearFailedImageCache(); setCacheStats(await getImageCacheStats()); alert(`Cleared ${n} not-found entries. They will be re-searched next time.`) }}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-600 hover:bg-amber-100"
            >
              Retry Not-Found{cacheStats ? ` (${cacheStats.failed})` : ''}
            </button>
            <button
              onClick={async () => { const n = await clearImageCache(); setCacheStats({ total: 0, found: 0, failed: 0 }); alert(`Cleared local cache (${n} entries). JARVISmart images are safe — they will be re-downloaded on next fetch.`) }}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-500 hover:bg-gray-200"
            >
              Clear All Local{cacheStats ? ` (${cacheStats.total})` : ''}
            </button>
          </div>
          <p className="text-[10px] text-gray-400">Local cache only — JARVISmart server images are never deleted.</p>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <button
            onClick={handleClear}
            disabled={clearing}
            className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${confirm ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600'}`}
          >
            {clearing ? 'Clearing...' : confirm ? 'Tap again to confirm — this cannot be undone' : 'Clear All Data'}
          </button>
        </div>
      </div>
    </div>
  )
}
