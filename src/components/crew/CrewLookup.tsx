import { useState, useCallback } from 'react'
import { Search, ScanBarcode, Package, X } from 'lucide-react'
import { searchItems, type StockItem, getStockLevels } from '../../lib/jarvis'
import BarcodeScanner from '../BarcodeScanner'
import ProductImage from '../ProductImage'

interface LookupResult {
  itemCode: string
  barcode: string | null
  description: string
  department: string
  sellPrice: number
  onHand: number
  reorderLevel: number
  isOnReorder: boolean
}

export default function CrewLookup() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LookupResult[]>([])
  const [loading, setLoading] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [selected, setSelected] = useState<LookupResult | null>(null)
  const [searched, setSearched] = useState(false)

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) { setResults([]); setSearched(false); return }

    setLoading(true)
    setSearched(true)
    setSelected(null)
    try {
      // Search via JARVISmart API
      const result = await searchItems(trimmed, 15)
      const mapped: LookupResult[] = result.items.map(item => ({
        itemCode: item.itemCode,
        barcode: item.barcode || null,
        description: item.description,
        department: item.department,
        sellPrice: item.sellPrice,
        onHand: 0,
        reorderLevel: 0,
        isOnReorder: false,
      }))

      // Try to enrich with stock levels for the first few results
      if (mapped.length > 0) {
        try {
          const stockData = await getStockLevels({ limit: 50000 })
          const stockMap = new Map<string, StockItem>()
          for (const s of stockData) stockMap.set(s.itemCode, s)
          for (const r of mapped) {
            const s = stockMap.get(r.itemCode)
            if (s) {
              r.onHand = s.onHand
              r.reorderLevel = s.reorderLevel
              r.isOnReorder = s.isOnReorder
              r.sellPrice = s.sellPrice // use live price
            }
          }
        } catch { /* stock data unavailable, continue with search results */ }
      }

      setResults(mapped)

      // Auto-select if single result (e.g., barcode scan)
      if (mapped.length === 1) setSelected(mapped[0])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  function handleScan(code: string) {
    setScannerOpen(false)
    setQuery(code)
    doSearch(code)
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    doSearch(query)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <form onSubmit={handleSearchSubmit} className="px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Scan or search product..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="px-3 py-2 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
          >
            <ScanBarcode size={20} className="text-emerald-600" />
          </button>
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setResults([]); setSelected(null); setSearched(false) }}
              className="px-2 py-2 text-gray-400 hover:text-gray-600"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </form>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <p className="text-sm text-gray-400 text-center py-8 animate-pulse">Searching...</p>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="text-center py-8">
            <Package size={32} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-400">No products found</p>
          </div>
        )}

        {/* Selected product detail */}
        {selected && (
          <div className="p-4 space-y-4">
            <div className="flex items-start gap-3">
              <ProductImage
                itemCode={selected.itemCode}
                description={selected.description}
                department={selected.department}
                barcode={selected.barcode}
                size={80}
                className="rounded-xl shadow-sm"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 leading-tight">{selected.description}</p>
                <span className="inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                  {selected.department}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-emerald-500 uppercase font-medium">Sell Price</p>
                <p className="text-xl font-bold text-emerald-700">${selected.sellPrice.toFixed(2)}</p>
              </div>
              <div className={`rounded-xl p-3 text-center ${selected.onHand <= 0 ? 'bg-red-50' : selected.onHand <= selected.reorderLevel ? 'bg-amber-50' : 'bg-green-50'}`}>
                <p className={`text-[10px] uppercase font-medium ${selected.onHand <= 0 ? 'text-red-500' : selected.onHand <= selected.reorderLevel ? 'text-amber-500' : 'text-green-500'}`}>In Stock</p>
                <p className={`text-xl font-bold ${selected.onHand <= 0 ? 'text-red-700' : selected.onHand <= selected.reorderLevel ? 'text-amber-700' : 'text-green-700'}`}>{selected.onHand}</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl px-3 py-2 space-y-1 text-xs text-gray-500">
              <div className="flex justify-between">
                <span>Item Code</span>
                <span className="font-mono font-medium text-gray-700">{selected.itemCode}</span>
              </div>
              {selected.barcode && (
                <div className="flex justify-between">
                  <span>Barcode</span>
                  <span className="font-mono font-medium text-gray-700">{selected.barcode}</span>
                </div>
              )}
              {selected.isOnReorder && (
                <div className="flex justify-between">
                  <span>Status</span>
                  <span className="font-medium text-emerald-600">On Reorder</span>
                </div>
              )}
            </div>

            <button
              onClick={() => setSelected(null)}
              className="w-full text-xs text-emerald-600 font-medium py-2"
            >
              Back to results
            </button>
          </div>
        )}

        {/* Results list (when no detail selected) */}
        {!selected && !loading && results.length > 0 && (
          <div className="divide-y divide-gray-50">
            {results.map((r, idx) => (
              <button
                key={`${r.itemCode}-${idx}`}
                onClick={() => setSelected(r)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3"
              >
                <ProductImage
                  itemCode={r.itemCode}
                  description={r.description}
                  department={r.department}
                  barcode={r.barcode}
                  size={40}
                  className="rounded-lg"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{r.description}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{r.department} · QOH {r.onHand}</p>
                </div>
                <p className="text-sm font-bold text-emerald-600 shrink-0">${r.sellPrice.toFixed(2)}</p>
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !searched && (
          <div className="text-center py-12">
            <ScanBarcode size={40} className="mx-auto text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">Scan a barcode or search to look up a product</p>
          </div>
        )}
      </div>

      <BarcodeScanner open={scannerOpen} onScan={handleScan} onClose={() => setScannerOpen(false)} />
    </div>
  )
}
