import { useState, useRef } from 'react'
import { clearAllData } from '../lib/db'
import { getStockLevels } from '../lib/jarvis'
import { prefetchImages, isImageSearchConfigured, clearImageCache, type PrefetchProgress } from '../lib/images'
import ImportView from './ImportView'

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
  const [serperApiKey, setSerperApiKey] = useState(
    () => localStorage.getItem('grocery-manager-serper-api-key') ?? (import.meta.env.VITE_SERPER_API_KEY as string) ?? ''
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
  const abortRef = useRef<AbortController | null>(null)

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

  function saveSerper() {
    if (serperApiKey.trim()) {
      localStorage.setItem('grocery-manager-serper-api-key', serperApiKey.trim())
    } else {
      localStorage.removeItem('grocery-manager-serper-api-key')
    }
  }

  function saveExpiryRed() {
    localStorage.setItem('grocery-manager-expiry-red', String(expiryRed))
  }

  function saveExpiryAmber() {
    localStorage.setItem('grocery-manager-expiry-amber', String(expiryAmber))
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
      const stock = await getStockLevels({ limit: 5000 })
      // Fetch ALL stock (not department-filtered), sort by avg daily qty descending (high velocity first)
      const allItems = stock
        .sort((a, b) => (b.avgDayQty ?? 0) - (a.avgDayQty ?? 0))
        .map(s => ({ itemCode: s.itemCode, description: s.description, department: s.department, barcode: s.barcode }))
      await prefetchImages(allItems, setPrefetchProgress, controller.signal)
    } catch { /* aborted or error */ }
    setPrefetching(false)
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
          <label className="text-sm font-medium text-gray-700">Serper.dev API Key</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={serperApiKey}
              onChange={(e) => setSerperApiKey(e.target.value)}
              placeholder="Serper API Key (optional — default included)"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
            />
            <button onClick={saveSerper} className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg">Save</button>
          </div>
          <p className="text-xs text-gray-400">For product images via Google Images. Default key included (2,500 free queries).</p>
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
          <button
            onClick={async () => { const n = await clearImageCache(); alert(`Cleared ${n} cached entries. Images will be re-fetched.`) }}
            className="w-full py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-500 hover:bg-gray-200"
          >
            Clear Image Cache
          </button>
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
