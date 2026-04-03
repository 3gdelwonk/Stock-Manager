import { useState, useEffect, useCallback, useMemo } from 'react'
import { RefreshCw, WifiOff, Tag, Search, ScanBarcode, X, AlertTriangle, Calendar } from 'lucide-react'
import { checkConnection, getPromotions, getStockLevels, type LivePromotion } from '../lib/jarvis'
import { useTrackedItemCodes } from '../lib/useTrackedItems'
import { useProductCodeLookup } from '../lib/useProductCodes'
import BarcodeScanner from './BarcodeScanner'
import BarcodeStripe from './BarcodeStripe'
import ProductImage from './ProductImage'

// ── Constants ──────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL = 5 * 60 * 1000 // 5 minutes

const DEPT_BADGE_COLORS: Record<string, string> = {
  GROCERY:              'bg-emerald-100 text-emerald-700',
  DAIRY:                'bg-blue-100 text-blue-700',
  FROZEN:               'bg-indigo-100 text-indigo-700',
  'FRESH PRODUCE':      'bg-green-100 text-green-700',
  MEAT:                 'bg-red-100 text-red-700',
  DELI:                 'bg-orange-100 text-orange-700',
  BAKERY:               'bg-amber-100 text-amber-700',
  'HEALTH & BEAUTY':    'bg-pink-100 text-pink-700',
  HOUSEHOLD:            'bg-violet-100 text-violet-700',
  PET:                  'bg-teal-100 text-teal-700',
  BABY:                 'bg-rose-100 text-rose-700',
  TOBACCO:              'bg-stone-100 text-stone-700',
  'GENERAL MERCHANDISE':'bg-slate-100 text-slate-700',
  LIQUEURS:             'bg-purple-100 text-purple-700',
  WINE:                 'bg-fuchsia-100 text-fuchsia-700',
  SPIRITS:              'bg-cyan-100 text-cyan-700',
  BEER:                 'bg-yellow-100 text-yellow-700',
  'LIQUOR/MISC':        'bg-lime-100 text-lime-700',
}

function deptBadgeClass(dept: string): string {
  return DEPT_BADGE_COLORS[dept.toUpperCase()] ?? 'bg-gray-100 text-gray-600'
}

type SortKey = 'discount' | 'daysLeft' | 'margin'
type Segment = 'active' | 'upcoming'

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function formatDateFull(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function daysLeftLabel(days: number): string {
  if (days < 0) return 'Ended'
  if (days === 0) return 'Last day'
  if (days === 1) return '1 day left'
  return `${days} days left`
}

function daysLeftColor(days: number): string {
  if (days <= 2) return 'text-red-600'
  if (days <= 5) return 'text-amber-600'
  return 'text-gray-500'
}

// ── Promo Card ─────────────────────────────────────────────────────────────────

function PromoCard({
  promo,
  barcode,
  tracked,
}: {
  promo: LivePromotion
  barcode: string | null
  tracked: boolean
}) {
  const saving = promo.normalPrice - promo.promoPrice
  const ctnSaving =
    promo.promoUnitCost !== null
      ? (promo.normalUnitCost - promo.promoUnitCost) * promo.ctnQty
      : null

  return (
    <div className={`bg-white rounded-xl border ${tracked ? 'border-emerald-300 ring-1 ring-emerald-100' : 'border-gray-200'} p-3 space-y-2`}>
      {/* Header: image + name + dept */}
      <div className="flex items-start gap-2.5">
        <ProductImage
          itemCode={promo.itemCode}
          description={promo.description}
          department={promo.department}
          barcode={barcode}
          size={48}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 leading-tight line-clamp-2">
            {promo.description}
          </p>
          <span className={`inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${deptBadgeClass(promo.department)}`}>
            {promo.department}
          </span>
        </div>
      </div>

      {/* SELL row */}
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs text-gray-400 uppercase tracking-wide">Sell</span>
          <span className="text-base font-bold text-emerald-600">${promo.promoPrice.toFixed(2)}</span>
          <span className="text-xs text-gray-400 line-through">${promo.normalPrice.toFixed(2)}</span>
        </div>
        <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
          {promo.discountPercent.toFixed(0)}% off
        </span>
      </div>

      {/* COST row (if available) */}
      {promo.promoUnitCost !== null && (
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Cost</span>
            <span className="text-sm font-medium text-gray-700">${promo.promoUnitCost.toFixed(2)}</span>
            <span className="text-xs text-gray-400 line-through">${promo.normalUnitCost.toFixed(2)}</span>
          </div>
          {ctnSaving !== null && ctnSaving > 0 && (
            <span className="text-[10px] text-blue-600 font-medium">
              CTN save ${ctnSaving.toFixed(2)}
            </span>
          )}
        </div>
      )}

      {/* Margin + days left row */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            Margin <span className={`font-semibold ${promo.marginPercent < 20 ? 'text-red-600' : promo.marginPercent < 30 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {promo.marginPercent.toFixed(1)}%
            </span>
          </span>
          {saving > 0 && (
            <span className="text-[10px] text-gray-400">
              save ${saving.toFixed(2)}
            </span>
          )}
        </div>
        <span className={`text-xs font-medium ${daysLeftColor(promo.daysLeft)}`}>
          {daysLeftLabel(promo.daysLeft)}
        </span>
      </div>

      {/* Date range */}
      <div className="flex items-center gap-1 text-[10px] text-gray-400">
        <Calendar size={10} />
        <span>{formatDate(promo.startDate)} &ndash; {formatDate(promo.endDate)}</span>
      </div>

      {/* Barcode */}
      {barcode && (
        <div className="flex justify-center pt-1">
          <BarcodeStripe value={barcode} height={32} showText className="max-w-full" />
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function PromotionsView() {
  const [promos, setPromos] = useState<LivePromotion[]>([])
  const [barcodeMap, setBarcodeMap] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [online, setOnline] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const [segment, setSegment] = useState<Segment>('active')
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('All')
  const [sortKey, setSortKey] = useState<SortKey>('discount')
  const [scannerOpen, setScannerOpen] = useState(false)

  const [expiringSoonCount, setExpiringSoonCount] = useState(0)

  const trackedCodes = useTrackedItemCodes()
  const productCodes = useProductCodeLookup()

  // ── Fetch data ────────────────────────────────────────────────────────────

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    setError(null)

    try {
      const conn = await checkConnection()
      setOnline(conn.connected)
      if (!conn.connected) {
        setError('Cannot reach JARVIS — check connection')
        return
      }

      const [promoData, stockData] = await Promise.all([
        getPromotions(),
        getStockLevels({ limit: 10000 }),
      ])

      setPromos(promoData.items)
      setExpiringSoonCount(promoData.expiringSoonCount)

      // Build barcode lookup from stock data
      const bcMap = new Map<string, string>()
      for (const s of stockData) {
        if (s.barcode) bcMap.set(s.itemCode, s.barcode)
      }
      setBarcodeMap(bcMap)

      setLastRefresh(new Date())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(() => fetchData(true), REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchData])

  // ── Barcode scan handler ──────────────────────────────────────────────────

  const handleBarcodeScan = useCallback(
    (code: string) => {
      setScannerOpen(false)
      const resolved = productCodes.resolveCode(code)
      setSearch(resolved)
      setDeptFilter('All')
    },
    [productCodes],
  )

  // ── Resolve barcode for item ──────────────────────────────────────────────

  function resolveBarcode(itemCode: string): string | null {
    return barcodeMap.get(itemCode) ?? null
  }

  // ── Split active / upcoming ───────────────────────────────────────────────

  const now = new Date()

  const { activePromos, upcomingPromos } = useMemo(() => {
    const active: LivePromotion[] = []
    const upcoming: LivePromotion[] = []

    for (const p of promos) {
      const start = new Date(p.startDate)
      if (start > now) {
        upcoming.push(p)
      } else {
        active.push(p)
      }
    }

    return { activePromos: active, upcomingPromos: upcoming }
  }, [promos])

  // ── Department list (dynamic) ─────────────────────────────────────────────

  const departments = useMemo(() => {
    const currentList = segment === 'active' ? activePromos : upcomingPromos
    const depts = new Set<string>()
    for (const p of currentList) depts.add(p.department)
    return ['All', ...Array.from(depts).sort()]
  }, [segment, activePromos, upcomingPromos])

  // ── Filter + sort ─────────────────────────────────────────────────────────

  const filteredPromos = useMemo(() => {
    const source = segment === 'active' ? activePromos : upcomingPromos
    const q = search.toLowerCase().trim()

    let filtered = source.filter((p) => {
      if (deptFilter !== 'All' && p.department !== deptFilter) return false
      if (q) {
        const bc = resolveBarcode(p.itemCode) ?? ''
        const matchesSearch =
          p.description.toLowerCase().includes(q) ||
          p.itemCode.toLowerCase().includes(q) ||
          bc.includes(q)
        if (!matchesSearch) return false
      }
      return true
    })

    // Sort
    filtered.sort((a, b) => {
      switch (sortKey) {
        case 'discount':
          return b.discountPercent - a.discountPercent
        case 'daysLeft':
          return a.daysLeft - b.daysLeft
        case 'margin':
          return b.marginPercent - a.marginPercent
        default:
          return 0
      }
    })

    return filtered
  }, [segment, activePromos, upcomingPromos, search, deptFilter, sortKey, barcodeMap])

  // ── Upcoming grouped by start date ────────────────────────────────────────

  const upcomingGrouped = useMemo(() => {
    if (segment !== 'upcoming') return []
    const groups = new Map<string, LivePromotion[]>()
    for (const p of filteredPromos) {
      const key = p.startDate.slice(0, 10)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(p)
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [segment, filteredPromos])

  // ── Reset dept filter when switching segment ──────────────────────────────

  useEffect(() => {
    setDeptFilter('All')
  }, [segment])

  // ── Render ────────────────────────────────────────────────────────────────

  // Loading state
  if (loading && promos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
        <RefreshCw size={24} className="text-emerald-600 animate-spin" />
        <p className="text-sm text-gray-500">Loading promotions...</p>
      </div>
    )
  }

  // Offline state
  if (!online && promos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
        <WifiOff size={24} className="text-gray-400" />
        <p className="text-sm text-gray-500">Offline &mdash; cannot load promotions</p>
        <button
          onClick={() => fetchData()}
          className="text-sm text-emerald-600 font-medium underline"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Summary bar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 bg-emerald-50 border-b border-emerald-100 shrink-0">
        <div className="flex items-center gap-2">
          <Tag size={14} className="text-emerald-600" />
          <span className="text-xs font-medium text-emerald-800">
            {promos.length} store promos
          </span>
          {expiringSoonCount > 0 && (
            <span className="flex items-center gap-0.5 text-xs font-medium text-amber-600">
              <AlertTriangle size={12} />
              {expiringSoonCount} expiring soon
            </span>
          )}
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="p-1 text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
          aria-label="Refresh"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Error banner ────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 text-xs border-b border-red-100 shrink-0">
          <AlertTriangle size={12} />
          {error}
        </div>
      )}

      {/* ── Segment tabs ────────────────────────────────────────────── */}
      <div className="flex px-4 pt-3 pb-1 gap-1 shrink-0">
        {(['active', 'upcoming'] as Segment[]).map((seg) => {
          const count = seg === 'active' ? activePromos.length : upcomingPromos.length
          return (
            <button
              key={seg}
              onClick={() => setSegment(seg)}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                segment === seg
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {seg === 'active' ? 'Active' : 'Upcoming'} ({count})
            </button>
          )
        })}
      </div>

      {/* ── Search bar ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 shrink-0">
        <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-1.5">
          <Search size={14} className="text-gray-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, code, or barcode..."
            className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>
        <button
          onClick={() => setScannerOpen(true)}
          className="p-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shrink-0"
          aria-label="Scan barcode"
        >
          <ScanBarcode size={16} />
        </button>
      </div>

      {/* ── Department filter chips ─────────────────────────────────── */}
      <div className="flex gap-1.5 px-4 pb-2 overflow-x-auto no-scrollbar shrink-0">
        {departments.map((dept) => (
          <button
            key={dept}
            onClick={() => setDeptFilter(dept)}
            className={`whitespace-nowrap text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors shrink-0 ${
              deptFilter === dept
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {dept}
          </button>
        ))}
      </div>

      {/* ── Sort selector ───────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-4 pb-2 shrink-0">
        <span className="text-[10px] text-gray-400 uppercase tracking-wider">Sort</span>
        {([
          { key: 'discount' as SortKey, label: 'Discount %' },
          { key: 'daysLeft' as SortKey, label: 'Days Left' },
          { key: 'margin' as SortKey, label: 'Margin %' },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSortKey(key)}
            className={`text-[11px] font-medium px-2 py-0.5 rounded transition-colors ${
              sortKey === key
                ? 'bg-emerald-100 text-emerald-700'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── List ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-4 pb-4 space-y-3">
        {filteredPromos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Tag size={24} className="text-gray-300" />
            <p className="text-sm text-gray-400">
              {search ? 'No matching promotions' : 'No promotions found'}
            </p>
          </div>
        ) : segment === 'active' ? (
          filteredPromos.map((p) => (
            <PromoCard
              key={p.itemCode}
              promo={p}
              barcode={resolveBarcode(p.itemCode)}
              tracked={trackedCodes.has(p.itemCode)}
            />
          ))
        ) : (
          upcomingGrouped.map(([dateKey, items]) => (
            <div key={dateKey}>
              <div className="sticky top-0 z-10 flex items-center gap-1.5 py-1.5 mb-2 bg-white/95 backdrop-blur-sm">
                <Calendar size={12} className="text-emerald-600" />
                <span className="text-xs font-semibold text-emerald-700">
                  Starts {formatDateFull(dateKey)}
                </span>
                <span className="text-[10px] text-gray-400">({items.length})</span>
              </div>
              <div className="space-y-3">
                {items.map((p) => (
                  <PromoCard
                    key={p.itemCode}
                    promo={p}
                    barcode={resolveBarcode(p.itemCode)}
                    tracked={trackedCodes.has(p.itemCode)}
                  />
                ))}
              </div>
            </div>
          ))
        )}

        {/* Last refresh timestamp */}
        {lastRefresh && (
          <p className="text-center text-[10px] text-gray-300 pt-2">
            Updated {lastRefresh.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      {/* ── Barcode scanner overlay ─────────────────────────────────── */}
      <BarcodeScanner
        open={scannerOpen}
        onScan={handleBarcodeScan}
        onClose={() => setScannerOpen(false)}
      />
    </div>
  )
}
