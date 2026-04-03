import { useState, useEffect, useCallback } from 'react'
import { X, ExternalLink, Loader2, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { getOnlinePrices, type OnlinePrice } from '../lib/jarvis'
import { serverShoppingSearch } from '../lib/serper'

interface CompetitivePriceSheetProps {
  open: boolean
  description: string
  barcode: string
  ourPrice: number
  onClose: () => void
  onMatchPrice?: (competitorPrice: number, source: string) => void
}

export default function CompetitivePriceSheet({
  open,
  description,
  barcode,
  ourPrice,
  onClose,
  onMatchPrice,
}: CompetitivePriceSheetProps) {
  const [results, setResults] = useState<OnlinePrice[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPrices = useCallback(async () => {
    setLoading(true)
    setError(null)
    setResults([])
    try {
      // SerpApi Shopping (via JARVISmart) + JARVISmart online prices in parallel
      const [shopResults, jarvisData] = await Promise.all([
        serverShoppingSearch(description).catch(() => []),
        getOnlinePrices(description).catch(() => ({ results: [] as OnlinePrice[] })),
      ])
      const seen = new Set<string>()
      const merged: OnlinePrice[] = []
      // SerpApi results first (fresher, structured)
      for (const s of shopResults) {
        const key = `${s.source}|${s.title}`.toLowerCase()
        if (!seen.has(key) && s.price > 0) {
          seen.add(key)
          merged.push({ source: s.source, name: s.title, price: s.price, url: s.link, size: '' })
        }
      }
      // Then JARVISmart results
      for (const r of jarvisData.results) {
        const key = `${r.source}|${r.name}`.toLowerCase()
        if (!seen.has(key)) { seen.add(key); merged.push(r) }
      }
      setResults(merged)
    } catch (err) {
      setError((err as Error).message || 'Failed to fetch competitor prices')
    } finally {
      setLoading(false)
    }
  }, [description])

  useEffect(() => {
    if (open && description) {
      fetchPrices()
    }
    if (!open) {
      setResults([])
      setError(null)
    }
  }, [open, description, fetchPrices])

  if (!open) return null

  function getDelta(competitorPrice: number) {
    const diff = competitorPrice - ourPrice
    const pct = ourPrice > 0 ? (diff / ourPrice) * 100 : 0
    return { diff, pct }
  }

  function getDeltaColor(pct: number): { text: string; bg: string; icon: React.ReactNode } {
    if (pct < -5) {
      // competitor is cheaper — we're more expensive (red)
      return { text: 'text-red-600', bg: 'bg-red-50', icon: <TrendingDown className="w-3.5 h-3.5" /> }
    }
    if (pct > 5) {
      // competitor is more expensive — we're cheaper (green)
      return { text: 'text-emerald-600', bg: 'bg-emerald-50', icon: <TrendingUp className="w-3.5 h-3.5" /> }
    }
    // within 5%
    return { text: 'text-amber-600', bg: 'bg-amber-50', icon: <Minus className="w-3.5 h-3.5" /> }
  }

  function handleMatch(price: number, source: string) {
    onMatchPrice?.(price, source)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Sheet */}
      <div className="relative bg-white rounded-t-2xl max-h-[85vh] flex flex-col animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between p-4 pb-2 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900 truncate">Competitor Prices</h2>
            <p className="text-xs text-gray-500 truncate mt-0.5">{description}</p>
            {barcode && (
              <p className="text-xs text-gray-400 mt-0.5">Barcode: {barcode}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-3 p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Our price banner */}
        <div className="px-4 py-2.5 bg-emerald-50 border-b border-emerald-100">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-700">Our Price</span>
            <span className="text-sm font-bold text-emerald-700">${ourPrice.toFixed(2)}</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mb-2" />
              <p className="text-sm">Searching competitors...</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <p className="text-sm text-red-500 text-center">{error}</p>
              <button
                onClick={fetchPrices}
                className="mt-3 px-4 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <p className="text-sm">No competitor prices found</p>
              <p className="text-xs mt-1">Try a different product</p>
            </div>
          )}

          {!loading && !error && results.map((item, i) => {
            const { diff, pct } = getDelta(item.price)
            const color = getDeltaColor(pct)

            return (
              <div
                key={`${item.source}-${i}`}
                className="border border-gray-200 rounded-xl p-3 space-y-2"
              >
                {/* Source + Price row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{item.source}</p>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{item.name}</p>
                    {item.size && (
                      <p className="text-xs text-gray-400 mt-0.5">{item.size}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-gray-900">${item.price.toFixed(2)}</p>
                    <div className={`inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium ${color.bg} ${color.text}`}>
                      {color.icon}
                      <span>{diff >= 0 ? '+' : ''}{diff.toFixed(2)}</span>
                      <span>({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)</span>
                    </div>
                  </div>
                </div>

                {/* Actions row */}
                <div className="flex items-center gap-2 pt-1">
                  {onMatchPrice && (
                    <button
                      onClick={() => handleMatch(item.price, item.source)}
                      className="flex-1 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                    >
                      Match Price (${item.price.toFixed(2)})
                    </button>
                  )}
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-emerald-600 hover:border-emerald-200 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
