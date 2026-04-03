import { useState, useEffect, useCallback } from 'react'
import { Search, ScanBarcode, X, DollarSign } from 'lucide-react'
import { db } from '../lib/db'
import { searchItems } from '../lib/jarvis'
import BarcodeScanner from './BarcodeScanner'
import { DEPARTMENT_LABELS } from '../lib/constants'

interface ProductResult {
  itemCode: string
  barcode: string
  name: string
  department: string
  sellPrice: number
}

interface QuickPriceChangeSheetProps {
  open: boolean
  onClose: () => void
  onSelectProduct: (product: ProductResult) => void
}

export default function QuickPriceChangeSheet({ open, onClose, onSelectProduct }: QuickPriceChangeSheetProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductResult[]>([])
  const [loading, setLoading] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) {
      setResults([])
      return
    }

    setLoading(true)
    try {
      const merged = new Map<string, ProductResult>()

      // Search local Dexie DB
      const localProducts = await db.products
        .filter(p =>
          p.name.toLowerCase().includes(trimmed.toLowerCase()) ||
          p.barcode.includes(trimmed) ||
          p.itemCode.includes(trimmed)
        )
        .limit(10)
        .toArray()

      for (const p of localProducts) {
        const key = p.itemCode || p.barcode
        merged.set(key, {
          itemCode: p.itemCode,
          barcode: p.barcode,
          name: p.name,
          department: p.department,
          sellPrice: p.sellPrice,
        })
      }

      // Search JARVIS API
      try {
        const jarvisResult = await searchItems(trimmed, 10)
        for (const item of jarvisResult.items) {
          const key = item.itemCode || item.barcode || ''
          if (!merged.has(key)) {
            merged.set(key, {
              itemCode: item.itemCode,
              barcode: item.barcode || '',
              name: item.description,
              department: item.department,
              sellPrice: item.sellPrice,
            })
          }
        }
      } catch {
        // JARVIS unavailable, use local results only
      }

      setResults(Array.from(merged.values()).slice(0, 10))
    } catch (e) {
      console.error('Search failed:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounced search
  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => doSearch(query), 300)
    return () => clearTimeout(timer)
  }, [query, open, doSearch])

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
    }
  }, [open])

  function handleScan(code: string) {
    setScannerOpen(false)
    setQuery(code)
  }

  function handleSelect(product: ProductResult) {
    onSelectProduct(product)
    onClose()
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col animate-slide-up">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <DollarSign size={18} className="text-emerald-600" />
            <h2 className="text-base font-semibold text-gray-900">Change Price</h2>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-4 py-3 shrink-0">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, barcode, or item code..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoFocus
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <button
              onClick={() => setScannerOpen(true)}
              className="px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <ScanBarcode size={18} className="text-gray-600" />
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {loading && (
            <p className="text-xs text-gray-400 text-center py-4 animate-pulse">Searching...</p>
          )}

          {!loading && query.trim() && results.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">No products found</p>
          )}

          {results.map((product, idx) => (
            <button
              key={`${product.itemCode}-${product.barcode}-${idx}`}
              onClick={() => handleSelect(product)}
              className="w-full text-left px-3 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors rounded-lg"
            >
              <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-gray-500">
                  {DEPARTMENT_LABELS[product.department as keyof typeof DEPARTMENT_LABELS] || product.department}
                  {product.itemCode ? ` \u00B7 ${product.itemCode}` : ''}
                </p>
                <p className="text-sm font-semibold text-emerald-600">
                  ${product.sellPrice.toFixed(2)}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Barcode scanner */}
      <BarcodeScanner open={scannerOpen} onScan={handleScan} onClose={() => setScannerOpen(false)} />
    </>
  )
}
