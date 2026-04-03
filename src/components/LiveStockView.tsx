import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  RefreshCw, WifiOff, Search, ScanBarcode, Loader2, Database,
} from 'lucide-react'
import { useEnrichedProducts } from '../lib/useEnrichedProducts'
import { useProductExpiry } from '../lib/useProductExpiry'
import { ProductRow, type EnrichedProduct } from './ProductRow'
import BarcodeScanner from './BarcodeScanner'
import PriceChangeModal from './PriceChangeModal'
import CompetitivePriceSheet from './CompetitivePriceSheet'
import AddBatchSheet from './AddBatchSheet'
import { useProductCodeLookup } from '../lib/useProductCodes'
import { DEPARTMENT_LABELS, DEPARTMENT_COLORS, DEPARTMENT_ORDER } from '../lib/constants'
import type { Product, GroceryDepartment } from '../lib/types'

// ── Sort modes ───────────────────────────────────────────────────────────────

type SortKey = 'name' | 'qoh' | 'velocity' | 'department' | 'margin' | 'abc'

// ── Component ────────────────────────────────────────────────────────────────

interface LiveStockViewProps {
  initialAction?: 'scan' | 'search' | null
  onActionConsumed?: () => void
}

export default function LiveStockView({ initialAction, onActionConsumed }: LiveStockViewProps = {}) {
  const { products, enriched, liveConnected, liveLoading, refreshLiveStock } = useEnrichedProducts()
  const expiryMap = useProductExpiry()

  // ── Merge expiry info into enriched products ──
  const enrichedWithExpiry = useMemo(() => {
    return enriched.map(ep => {
      const info = expiryMap.get(ep.product.barcode)
      if (!info) return ep
      return {
        ...ep,
        expiryInfo: {
          totalItems: info.totalItems,
          nearestExpiry: info.nearestExpiry,
          urgency: info.urgency,
        },
      }
    })
  }, [enriched, expiryMap])

  // ── UI state ──
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState<GroceryDepartment | 'all'>('all')
  const [sort, setSort] = useState<SortKey>('department')
  const [scannerOpen, setScannerOpen] = useState(false)
  const { resolveCode } = useProductCodeLookup()
  const searchInputRef = useRef<HTMLInputElement>(null)

  // ── Modals ──
  const [priceModalProduct, setPriceModalProduct] = useState<Product | null>(null)
  const [compareProduct, setCompareProduct] = useState<Product | null>(null)
  const [addBatchProduct, setAddBatchProduct] = useState<Product | null>(null)

  // ── Dashboard action handler ──
  useEffect(() => {
    if (!initialAction) return
    if (initialAction === 'scan') setScannerOpen(true)
    else if (initialAction === 'search') setTimeout(() => searchInputRef.current?.focus(), 100)
    onActionConsumed?.()
  }, [initialAction, onActionConsumed])

  const handlePriceChange = useCallback((p: Product) => setPriceModalProduct(p), [])
  const handleCompare = useCallback((p: Product) => setCompareProduct(p), [])
  const handleAddExpiry = useCallback((p: Product) => setAddBatchProduct(p), [])
  const handleScan = useCallback((code: string) => { setScannerOpen(false); setSearch(resolveCode(code)) }, [resolveCode])

  // ── Filter + sort ──
  const filtered = useMemo((): EnrichedProduct[] => {
    let list = enrichedWithExpiry

    // Search
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(ep => {
        const p = ep.product
        return p.name.toLowerCase().includes(q) || p.barcode.includes(search) ||
          p.itemCode.toLowerCase().includes(q) || p.aisle.toLowerCase().includes(q) ||
          p.section.toLowerCase().includes(q)
      })
    }

    // Category filter
    if (catFilter !== 'all') list = list.filter(ep => ep.product.department === catFilter)

    // Sort
    list = [...list]
    list.sort((a, b) => {
      const ap = a.product, bp = b.product
      const aq = a.liveQoh ?? a.localQoh ?? -1, bq = b.liveQoh ?? b.localQoh ?? -1
      switch (sort) {
        case 'name': return ap.name.localeCompare(bp.name)
        case 'qoh': return aq - bq
        case 'velocity': return (b.perf?.velocity ?? 0) - (a.perf?.velocity ?? 0)
        case 'margin': {
          const am = ap.sellPrice > 0 ? (ap.sellPrice - ap.costPrice) / ap.sellPrice : 0
          const bm = bp.sellPrice > 0 ? (bp.sellPrice - bp.costPrice) / bp.sellPrice : 0
          return bm - am
        }
        case 'abc': return (a.perf?.abcClass ?? 'Z').localeCompare(b.perf?.abcClass ?? 'Z')
        case 'department':
        default: return (DEPARTMENT_ORDER.indexOf(ap.department) - DEPARTMENT_ORDER.indexOf(bp.department)) || ap.name.localeCompare(bp.name)
      }
    })

    return list
  }, [enrichedWithExpiry, search, catFilter, sort])

  // ── Group by department ──
  const byDept = useMemo(() => {
    if (sort !== 'department') return null
    const groups = new Map<GroceryDepartment, EnrichedProduct[]>()
    for (const ep of filtered) {
      const arr = groups.get(ep.product.department) ?? []
      arr.push(ep)
      groups.set(ep.product.department, arr)
    }
    return groups
  }, [filtered, sort])

  // ── Loading state ──
  if (!products) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
    </div>
  )

  if (!products.length && !liveLoading) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
      {liveConnected === false ? (
        <>
          <WifiOff size={40} className="text-red-200" />
          <p className="text-sm font-medium text-red-600">Cannot reach JARVISmart</p>
          <p className="text-xs text-gray-400">Import stock data via Settings to view offline.</p>
          <button onClick={refreshLiveStock} className="text-sm text-emerald-600 font-medium underline">Retry</button>
        </>
      ) : (
        <p className="text-sm text-gray-500">No products. Import Item Maintenance to populate.</p>
      )}
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1 border-b border-gray-100 bg-white shrink-0">
        <div className="flex items-center gap-2 text-xs">
          {liveConnected ? (
            <><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /><span className="text-emerald-600 font-medium">Live</span></>
          ) : liveConnected === false ? (
            <><Database size={12} className="text-amber-500" /><span className="text-amber-600 font-medium">Offline · local data</span></>
          ) : null}
          <span className="text-gray-400">{filtered.length} of {enrichedWithExpiry.length} products</span>
          {liveLoading && <Loader2 size={12} className="text-emerald-600 animate-spin" />}
        </div>
        <button onClick={refreshLiveStock} disabled={liveLoading} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 disabled:opacity-40" aria-label="Refresh">
          <RefreshCw size={14} className={liveLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Sticky search + filters */}
      <div className="sticky top-0 bg-white z-10 border-b border-gray-100 px-4 pt-2 pb-2 space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input ref={searchInputRef} value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name, barcode, item code, aisle..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300" />
          </div>
          <button onClick={() => setScannerOpen(true)} className="px-3 py-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50" title="Scan barcode">
            <ScanBarcode size={18} />
          </button>
        </div>
        {/* Department chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          <button onClick={() => setCatFilter('all')}
            className={`shrink-0 text-xs px-3 py-1 rounded-full font-medium transition-colors ${catFilter === 'all' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
            All ({enrichedWithExpiry.length})
          </button>
          {DEPARTMENT_ORDER.map(dept => {
            const count = enrichedWithExpiry.filter(ep => ep.product.department === dept).length
            if (count === 0) return null
            return (
              <button key={dept} onClick={() => setCatFilter(dept)}
                className={`shrink-0 text-xs px-3 py-1 rounded-full font-medium transition-colors ${catFilter === dept ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                {DEPARTMENT_LABELS[dept]} ({count})
              </button>
            )
          })}
        </div>
        {/* Sort options */}
        <div className="flex gap-1.5">
          {([
            ['department', 'Department'], ['name', 'Name'], ['qoh', 'QOH'],
            ['velocity', 'Velocity'], ['margin', 'Margin'], ['abc', 'ABC'],
          ] as [SortKey, string][]).map(([s, label]) => (
            <button key={s} onClick={() => setSort(s)}
              className={`text-[10px] px-2 py-1 rounded font-medium transition-colors ${sort === s ? 'bg-emerald-100 text-emerald-700' : 'text-gray-400 hover:text-gray-600'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Product list */}
      <div className="flex-1 overflow-auto px-4">
        {byDept ? (
          DEPARTMENT_ORDER.filter(dept => byDept.has(dept)).map(dept => (
            <div key={dept}>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider pt-4 pb-1 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: DEPARTMENT_COLORS[dept] }} />
                {DEPARTMENT_LABELS[dept]}
                <span className="text-gray-300 font-normal">({byDept.get(dept)!.length})</span>
              </h3>
              {byDept.get(dept)!.map(ep => (
                <ProductRow key={ep.product.id} ep={ep} onPriceChange={handlePriceChange} onCompare={handleCompare} onAddExpiry={handleAddExpiry} />
              ))}
            </div>
          ))
        ) : (
          filtered.map(ep => (
            <ProductRow key={ep.product.id} ep={ep} onPriceChange={handlePriceChange} onCompare={handleCompare} onAddExpiry={handleAddExpiry} />
          ))
        )}
        {filtered.length === 0 && <p className="text-center text-sm text-gray-400 py-8">No products match filters</p>}
        <div className="h-20" />
      </div>

      {/* Modals */}
      <BarcodeScanner open={scannerOpen} onScan={handleScan} onClose={() => setScannerOpen(false)} />

      <PriceChangeModal
        open={!!priceModalProduct}
        itemCode={priceModalProduct?.itemCode ?? ''}
        barcode={priceModalProduct?.barcode ?? null}
        description={priceModalProduct?.name ?? ''}
        department={priceModalProduct ? DEPARTMENT_LABELS[priceModalProduct.department] : ''}
        currentPrice={priceModalProduct?.sellPrice ?? 0}
        onClose={() => setPriceModalProduct(null)}
        onSuccess={() => setPriceModalProduct(null)}
      />

      <CompetitivePriceSheet
        open={!!compareProduct}
        description={compareProduct?.name ?? ''}
        barcode={compareProduct?.barcode ?? ''}
        ourPrice={compareProduct?.sellPrice ?? 0}
        onClose={() => setCompareProduct(null)}
        onMatchPrice={(price, source) => {
          if (compareProduct) {
            setPriceModalProduct(compareProduct)
            setCompareProduct(null)
            void price; void source
          }
        }}
      />

      <AddBatchSheet
        open={!!addBatchProduct}
        onClose={() => setAddBatchProduct(null)}
        initialBarcode={addBatchProduct?.barcode}
        initialProductName={addBatchProduct?.name}
        initialDepartment={addBatchProduct?.department}
      />
    </div>
  )
}
