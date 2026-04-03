import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  RefreshCw, WifiOff, Search, ScanBarcode, X, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Tag, AlertTriangle, Clock, DollarSign,
  Printer, PackageMinus, BarChart3, Warehouse, ImageIcon,
} from 'lucide-react'
import {
  checkConnection, getStockLevels, getPromotions, getTopSellers,
  adjustStock, printLabel, type StockItem, type LivePromotion, type TopSeller,
} from '../lib/jarvis'
import { useProductCodeLookup } from '../lib/useProductCodes'
import { useProductExpiry, type ExpiryInfo } from '../lib/useProductExpiry'
import { prefetchImages, type PrefetchProgress } from '../lib/images'
import { computeImagePriority, getSerperTierSize, canUseSerper } from '../lib/serper'
import BarcodeScanner from './BarcodeScanner'
import BarcodeStripe from './BarcodeStripe'
import ProductImage from './ProductImage'
import PriceChangeModal from './PriceChangeModal'
import CompetitivePriceSheet from './CompetitivePriceSheet'
import AddBatchSheet from './AddBatchSheet'

// ── Constants ─────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL = 5 * 60 * 1000

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

type SortKey = 'margin' | 'revenue'

function fmtMoney(n: number): string {
  return n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Enriched stock item (merges stock + promo + performance data) ────────────

interface EnrichedStockItem {
  stock: StockItem
  promo: LivePromotion | null
  topSeller: boolean
  slowMover: boolean
  margin: number
  revenue: number
  expiryInfo: ExpiryInfo | null
  orderCode: string | null
}

// ── Stock Card ────────────────────────────────────────────────────────────────

function StockCard({
  item,
  onPriceChange,
  onCompare,
  onAddExpiry,
}: {
  item: EnrichedStockItem
  onPriceChange: (item: StockItem) => void
  onCompare: (item: StockItem) => void
  onAddExpiry: (item: StockItem) => void
}) {
  const { stock, promo, topSeller, slowMover, margin, expiryInfo, orderCode } = item
  const [expanded, setExpanded] = useState(false)
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  const lowStock = stock.onHand > 0 && stock.onHand <= stock.reorderLevel
  const outOfStock = stock.onHand <= 0
  const velocity = stock.avgDayQty ?? 0
  const daysOfStock = velocity > 0 ? stock.onHand / velocity : null

  async function handleAdjustStock() {
    const input = prompt('Adjust stock quantity (negative to reduce):')
    if (!input) return
    const qty = parseInt(input, 10)
    if (isNaN(qty)) return
    try {
      await adjustStock(stock.barcode || stock.itemCode, qty, 'manual_adjustment')
      setActionMsg('Stock adjusted')
      setTimeout(() => setActionMsg(null), 2000)
    } catch { setActionMsg('Failed') }
  }

  async function handlePrintLabel() {
    try {
      await printLabel(stock.barcode || stock.itemCode)
      setActionMsg('Label queued')
      setTimeout(() => setActionMsg(null), 2000)
    } catch { setActionMsg('Failed') }
  }

  return (
    <div className={`bg-white rounded-xl border ${promo ? 'border-amber-300 ring-1 ring-amber-100' : outOfStock ? 'border-red-200' : 'border-gray-200'} p-3 space-y-2`}>
      {/* ── Collapsed view ── */}
      <button className="w-full text-left" onClick={() => setExpanded(e => !e)}>
        {/* Header: image + name + dept */}
        <div className="flex items-start gap-2.5">
          <ProductImage
            itemCode={stock.itemCode}
            description={stock.description}
            department={stock.department}
            barcode={stock.barcode}
            size={48}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 leading-tight line-clamp-2">
              {stock.description}
            </p>
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${deptBadgeClass(stock.department)}`}>
                {stock.department}
              </span>
              {promo && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                  PROMO {promo.discountPercent.toFixed(0)}% OFF
                </span>
              )}
              {topSeller && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full flex items-center gap-0.5">
                  <TrendingUp size={8} /> BEST SELLER
                </span>
              )}
              {slowMover && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full flex items-center gap-0.5">
                  <TrendingDown size={8} /> SLOW
                </span>
              )}
              {outOfStock && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full">OUT</span>
              )}
              {lowStock && !outOfStock && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-red-50 text-red-600 rounded-full">LOW</span>
              )}
              {stock.isOnReorder && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full">REORDER</span>
              )}
            </div>
          </div>
          <div className="text-gray-400 shrink-0 mt-1">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </div>

        {/* SELL row */}
        <div className="flex items-baseline justify-between mt-2">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Sell</span>
            <span className="text-base font-bold text-emerald-600">${fmtMoney(stock.sellPrice)}</span>
            {promo && (
              <span className="text-xs text-gray-400 line-through">${fmtMoney(promo.normalPrice)}</span>
            )}
          </div>
          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
            margin < 20 ? 'bg-red-50 text-red-600' :
            margin < 30 ? 'bg-amber-50 text-amber-600' :
            'bg-emerald-50 text-emerald-700'
          }`}>
            {margin.toFixed(1)}% margin
          </span>
        </div>

        {/* Expiry + velocity summary */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {expiryInfo && expiryInfo.nearestExpiry && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
                expiryInfo.urgency === 'expired' ? 'bg-red-100 text-red-700' :
                expiryInfo.urgency === 'red' ? 'bg-red-50 text-red-600' :
                expiryInfo.urgency === 'amber' ? 'bg-amber-50 text-amber-600' :
                'bg-green-50 text-green-600'
              }`}>
                <Clock size={9} />
                EXP {expiryInfo.totalItems} | {expiryInfo.nearestExpiry}
              </span>
            )}
            <span className="text-[10px] text-gray-400">
              QOH <span className={`font-semibold ${outOfStock ? 'text-red-600' : lowStock ? 'text-red-500' : 'text-gray-700'}`}>
                {stock.onHand}
              </span>
            </span>
          </div>
          <span className="text-[10px] text-gray-400">
            {velocity.toFixed(1)}/day
          </span>
        </div>
      </button>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div className="space-y-3 pt-2 border-t border-gray-100">
          {/* Larger product image — long-press to change */}
          <div className="flex justify-center">
            <div className="relative">
              <ProductImage
                itemCode={stock.itemCode}
                description={stock.description}
                department={stock.department}
                barcode={stock.barcode}
                size={120}
                className="rounded-xl shadow-sm"
              />
              <p className="text-[9px] text-gray-400 text-center mt-1">Hold image to change</p>
            </div>
          </div>

          {/* Codes + barcode */}
          <div className="bg-gray-50 rounded-lg px-3 py-2 space-y-2">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              <div><span className="text-gray-400">Item Code:</span> <span className="font-mono font-medium">{stock.itemCode}</span></div>
              {orderCode && (
                <div><span className="text-gray-400">Order Code:</span> <span className="font-mono font-medium">{orderCode}</span></div>
              )}
              {stock.barcode && (
                <div><span className="text-gray-400">Barcode:</span> <span className="font-mono font-medium">{stock.barcode}</span></div>
              )}
              <div><span className="text-gray-400">Dept Code:</span> <span className="font-mono">{stock.departmentCode}</span></div>
            </div>
            {stock.barcode && (
              <div className="flex justify-center">
                <BarcodeStripe value={stock.barcode} height={40} showText />
              </div>
            )}
          </div>

          {/* Pricing detail */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <p className="text-[10px] text-gray-400 uppercase">Cost</p>
              <p className="text-sm font-bold text-gray-800">${fmtMoney(stock.avgCost)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <p className="text-[10px] text-gray-400 uppercase">Margin</p>
              <p className={`text-sm font-bold ${margin < 20 ? 'text-red-600' : margin < 30 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {margin.toFixed(1)}%
              </p>
            </div>
            {promo && (
              <div className="bg-amber-50 rounded-lg p-2 text-center">
                <p className="text-[10px] text-amber-600 uppercase">Carton</p>
                <p className="text-sm font-bold text-amber-700">{promo.ctnQty}</p>
              </div>
            )}
            {!promo && (
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <p className="text-[10px] text-gray-400 uppercase">Sell</p>
                <p className="text-sm font-bold text-emerald-600">${fmtMoney(stock.sellPrice)}</p>
              </div>
            )}
          </div>

          {/* Stock + velocity metrics */}
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <p className="text-[10px] text-gray-400 uppercase">QOH</p>
              <p className={`text-sm font-bold ${outOfStock ? 'text-red-600' : lowStock ? 'text-red-500' : 'text-gray-800'}`}>
                {stock.onHand}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <p className="text-[10px] text-gray-400 uppercase">Avg/Day</p>
              <p className="text-sm font-bold text-gray-800">{velocity.toFixed(1)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <p className="text-[10px] text-gray-400 uppercase">Avg/Week</p>
              <p className="text-sm font-bold text-gray-800">{(stock.avgWeekQty ?? 0).toFixed(1)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <p className="text-[10px] text-gray-400 uppercase">Days Stock</p>
              <p className={`text-sm font-bold ${daysOfStock !== null && daysOfStock <= 3 ? 'text-red-600' : daysOfStock !== null && daysOfStock <= 7 ? 'text-amber-600' : 'text-gray-800'}`}>
                {daysOfStock?.toFixed(0) ?? '—'}
              </p>
            </div>
          </div>

          {/* Reorder + on order info */}
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>Min: <span className="font-semibold text-gray-700">{stock.reorderLevel}</span></span>
            {stock.onOrder > 0 && (
              <span className="text-blue-600 font-medium">+{stock.onOrder} on order</span>
            )}
            {stock.isOnReorder && (
              <span className="text-blue-600 font-medium">On reorder</span>
            )}
          </div>

          {/* Promo detail if applicable */}
          {promo && (
            <div className="bg-amber-50 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-1.5">
                <Tag size={12} className="text-amber-600" />
                <span className="text-xs font-semibold text-amber-700">Active Promotion</span>
              </div>
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-amber-600">
                  ${fmtMoney(promo.promoPrice)} <span className="line-through text-amber-400">${fmtMoney(promo.normalPrice)}</span>
                </span>
                <span className="font-semibold text-amber-700">{promo.discountPercent.toFixed(0)}% off</span>
              </div>
              {promo.promoUnitCost !== null && (
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-gray-500">
                    Cost ${fmtMoney(promo.promoUnitCost)} <span className="line-through text-gray-400">${fmtMoney(promo.normalUnitCost)}</span>
                  </span>
                  <span className="text-xs text-gray-500">CTN: {promo.ctnQty}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-[10px] text-amber-600">
                <span>{promo.startDate.slice(0, 10)} — {promo.endDate.slice(0, 10)}</span>
                <span className="font-semibold">{promo.daysLeft}d left</span>
              </div>
            </div>
          )}

          {/* Expiry batches detail */}
          {expiryInfo && expiryInfo.batches.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-1.5">
                <Clock size={12} className="text-gray-600" />
                <span className="text-xs font-semibold text-gray-700">Expiry Batches ({expiryInfo.totalItems} items)</span>
              </div>
              {expiryInfo.batches.map((b, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-gray-500">
                  <span>{b.date}</span>
                  <span className="font-medium">{b.qty} units</span>
                </div>
              ))}
            </div>
          )}

          {/* Action message */}
          {actionMsg && (
            <p className="text-xs text-emerald-600 font-medium text-center">{actionMsg}</p>
          )}

          {/* Action buttons */}
          <div className="grid grid-cols-5 gap-1.5">
            <button onClick={e => { e.stopPropagation(); onPriceChange(stock) }}
              className="flex flex-col items-center gap-0.5 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-[10px] font-medium hover:bg-emerald-100 transition-colors">
              <DollarSign size={16} /> Price
            </button>
            <button onClick={handleAdjustStock}
              className="flex flex-col items-center gap-0.5 py-2 rounded-lg bg-blue-50 text-blue-700 text-[10px] font-medium hover:bg-blue-100 transition-colors">
              <PackageMinus size={16} /> Adjust
            </button>
            <button onClick={handlePrintLabel}
              className="flex flex-col items-center gap-0.5 py-2 rounded-lg bg-gray-50 text-gray-700 text-[10px] font-medium hover:bg-gray-100 transition-colors">
              <Printer size={16} /> Label
            </button>
            <button onClick={e => { e.stopPropagation(); onCompare(stock) }}
              className="flex flex-col items-center gap-0.5 py-2 rounded-lg bg-purple-50 text-purple-700 text-[10px] font-medium hover:bg-purple-100 transition-colors">
              <BarChart3 size={16} /> Compare
            </button>
            <button onClick={e => { e.stopPropagation(); onAddExpiry(stock) }}
              className="flex flex-col items-center gap-0.5 py-2 rounded-lg bg-amber-50 text-amber-700 text-[10px] font-medium hover:bg-amber-100 transition-colors">
              <Clock size={16} /> Expiry
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

interface StockViewProps {
  initialAction?: 'scan' | 'search' | null
  onActionConsumed?: () => void
}

export default function StockView({ initialAction, onActionConsumed }: StockViewProps = {}) {
  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [promos, setPromos] = useState<LivePromotion[]>([])
  const [topSellers, setTopSellers] = useState<TopSeller[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [online, setOnline] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('All')
  const [sortKey, setSortKey] = useState<SortKey>('revenue')
  const [scannerOpen, setScannerOpen] = useState(false)

  // ── Image auto-prefetch ──
  const [imgProgress, setImgProgress] = useState<PrefetchProgress | null>(null)
  const [imgDone, setImgDone] = useState(false)
  const imgAbortRef = useRef<AbortController | null>(null)

  // ── Modals ──
  const [priceTarget, setPriceTarget] = useState<StockItem | null>(null)
  const [compareTarget, setCompareTarget] = useState<StockItem | null>(null)
  const [expiryTarget, setExpiryTarget] = useState<StockItem | null>(null)

  // ── Hooks for enrichment ──
  const productCodes = useProductCodeLookup()
  const expiryMap = useProductExpiry()

  // ── Initial action from dashboard ──
  useEffect(() => {
    if (!initialAction) return
    if (initialAction === 'scan') setScannerOpen(true)
    else if (initialAction === 'search') {
      setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>('input[placeholder*="Search"]')
        input?.focus()
      }, 100)
    }
    onActionConsumed?.()
  }, [initialAction, onActionConsumed])

  // ── Fetch data ──
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    setError(null)

    try {
      const conn = await checkConnection()
      setOnline(conn.connected)
      if (!conn.connected) {
        setError('Cannot reach JARVISmart — check connection')
        return
      }

      const [stockData, promoData, topData] = await Promise.allSettled([
        getStockLevels({ limit: 50000 }),
        getPromotions(),
        getTopSellers(7, 50),
      ])

      if (stockData.status === 'fulfilled') setStockItems(stockData.value ?? [])
      if (promoData.status === 'fulfilled') setPromos(promoData.value?.items ?? [])
      if (topData.status === 'fulfilled') setTopSellers(topData.value ?? [])

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

  // ── Auto-prefetch images once per mount ──
  const imgStartedRef = useRef(false)
  useEffect(() => {
    if (stockItems.length === 0 || imgStartedRef.current) return
    imgStartedRef.current = true

    const tierSize = getSerperTierSize()
    const serperAvailable = canUseSerper('images')
    const items = [...stockItems]
      .map(s => ({ ...s, _priority: computeImagePriority({ avgDayQty: s.avgDayQty, sellPrice: s.sellPrice, avgCost: s.avgCost }) }))
      .sort((a, b) => b._priority - a._priority)
      .map((s, i) => ({
        itemCode: s.itemCode, description: s.description, department: s.department,
        barcode: s.barcode ?? undefined,
        searchTier: (serperAvailable && i < tierSize ? 'serper' : 'ddg') as 'serper' | 'ddg',
      }))

    const controller = new AbortController()
    imgAbortRef.current = controller
    setImgDone(false)

    prefetchImages(items, (p) => {
      setImgProgress(p)
      if (p.creditsExhausted) setImgDone(true)
    }, controller.signal)
      .then(() => {
        setImgDone(true)
        setTimeout(() => {
          setImgProgress(prev => prev?.creditsExhausted ? prev : null)
        }, 5000)
      })
      .catch(() => { /* aborted or error — silently stop */ })

    return () => { controller.abort() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockItems.length > 0]) // only fires once: false → true

  // ── Build lookup maps ──
  const promoMap = useMemo(() => {
    const map = new Map<string, LivePromotion>()
    for (const p of promos) map.set(p.itemCode, p)
    return map
  }, [promos])

  const topSellerCodes = useMemo(() => {
    const set = new Set<string>()
    if (topSellers.length === 0) return set
    // Top 20% by revenue are "best sellers"
    const sorted = [...topSellers].sort((a, b) => b.revenue - a.revenue)
    const cutoff = Math.max(1, Math.floor(sorted.length * 0.2))
    for (let i = 0; i < cutoff; i++) set.add(sorted[i].itemCode)
    return set
  }, [topSellers])

  const slowMoverCodes = useMemo(() => {
    const set = new Set<string>()
    for (const item of stockItems) {
      if (item.onHand > 10 && (item.avgDayQty ?? 0) < 0.1 && item.sellPrice > 0) {
        set.add(item.itemCode)
      }
    }
    return set
  }, [stockItems])

  // ── Revenue lookup from top sellers ──
  const revenueMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of topSellers) map.set(t.itemCode, t.revenue)
    return map
  }, [topSellers])

  // ── Barcode scan ──
  const handleBarcodeScan = useCallback((code: string) => {
    setScannerOpen(false)
    // Try resolving via local product codes, fall back to raw scanned code
    const resolved = productCodes.resolveCode(code)
    // Use the normalized barcode (strip non-numeric) for matching against API stock data
    const normalized = code.trim().replace(/[^0-9]/g, '')
    setSearch(resolved !== code ? resolved : normalized || code)
    setDeptFilter('All')
  }, [productCodes])

  // ── Enrich stock items ──
  const enrichedItems = useMemo((): EnrichedStockItem[] => {
    return stockItems.map(stock => {
      const margin = stock.sellPrice > 0 ? ((stock.sellPrice - stock.avgCost) / stock.sellPrice) * 100 : 0
      return {
        stock,
        promo: promoMap.get(stock.itemCode) ?? null,
        topSeller: topSellerCodes.has(stock.itemCode),
        slowMover: slowMoverCodes.has(stock.itemCode),
        margin,
        revenue: revenueMap.get(stock.itemCode) ?? 0,
        expiryInfo: stock.barcode ? (expiryMap.get(stock.barcode) ?? null) : null,
        orderCode: productCodes.getOrderCode(stock.barcode),
      }
    })
  }, [stockItems, promoMap, topSellerCodes, slowMoverCodes, revenueMap, expiryMap, productCodes])

  // ── Department list ──
  const departments = useMemo(() => {
    const depts = new Set<string>()
    for (const item of enrichedItems) depts.add(item.stock.department)
    return ['All', ...Array.from(depts).sort()]
  }, [enrichedItems])

  // ── Filter + sort ──
  const filteredItems = useMemo(() => {
    const q = search.toLowerCase().trim()
    let filtered = enrichedItems

    // Department filter
    if (deptFilter !== 'All') {
      filtered = filtered.filter(e => e.stock.department === deptFilter)
    }

    // Search (supports name, barcode, POS item code, and 8-digit order code)
    if (q) {
      filtered = filtered.filter(e => {
        const s = e.stock
        return s.description.toLowerCase().includes(q) ||
          s.itemCode.toLowerCase().includes(q) ||
          (s.barcode && s.barcode.includes(search)) ||
          (e.orderCode && e.orderCode.toLowerCase().includes(q))
      })
    }

    // Sort
    const sorted = [...filtered]
    sorted.sort((a, b) => {
      switch (sortKey) {
        case 'margin': return b.margin - a.margin
        case 'revenue': return b.revenue - a.revenue
        default: return 0
      }
    })
    return sorted
  }, [enrichedItems, search, deptFilter, sortKey])

  // ── Loading ──
  if (loading && stockItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
        <RefreshCw size={24} className="text-emerald-600 animate-spin" />
        <p className="text-sm text-gray-500">Loading stock...</p>
      </div>
    )
  }

  // ── Offline ──
  if (!online && stockItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
        <WifiOff size={24} className="text-gray-400" />
        <p className="text-sm text-gray-500">Offline — cannot load stock</p>
        <button onClick={() => fetchData()} className="text-sm text-emerald-600 font-medium underline">Retry</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Summary bar ── */}
      <div className="flex items-center justify-between px-4 py-2 bg-emerald-50 border-b border-emerald-100 shrink-0">
        <div className="flex items-center gap-2">
          <Warehouse size={14} className="text-emerald-600" />
          <span className="text-xs font-medium text-emerald-800">
            {stockItems.length} products
          </span>
          {promos.length > 0 && (
            <span className="flex items-center gap-0.5 text-xs font-medium text-amber-600">
              <Tag size={12} />
              {promos.length} on promo
            </span>
          )}
          {enrichedItems.filter(e => e.stock.onHand <= 0).length > 0 && (
            <span className="flex items-center gap-0.5 text-xs font-medium text-red-600">
              <AlertTriangle size={12} />
              {enrichedItems.filter(e => e.stock.onHand <= 0).length} out
            </span>
          )}
        </div>
        <button onClick={() => fetchData(true)} disabled={refreshing} className="p-1 text-emerald-600 hover:text-emerald-700 disabled:opacity-50" aria-label="Refresh">
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Image prefetch banner ── */}
      {imgProgress && (imgProgress.total > 0 || imgProgress.creditsExhausted) && (
        <div className={`flex items-center gap-2 px-4 py-1.5 border-b shrink-0 ${
          imgProgress.creditsExhausted ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-100'
        }`}>
          <ImageIcon size={12} className={imgProgress.creditsExhausted ? 'text-amber-600 shrink-0' : 'text-blue-600 shrink-0'} />
          <div className="flex-1 min-w-0">
            <div className={`flex items-center justify-between text-xs ${
              imgProgress.creditsExhausted ? 'text-amber-700' : 'text-blue-700'
            }`}>
              <span className="truncate">
                {imgProgress.creditsExhausted
                  ? `Image search unavailable — ${imgProgress.total - imgProgress.done} products remaining. Check JARVISmart connection.`
                  : imgDone
                    ? `Done — ${imgProgress.found} new images saved${imgProgress.skipped ? `, ${imgProgress.skipped} already cached` : ''}`
                    : `Fetching images: ${imgProgress.done}/${imgProgress.total} (${imgProgress.found} found)`}
              </span>
              {!imgProgress.creditsExhausted && !imgDone && (
                <span className="shrink-0 ml-2">{Math.round((imgProgress.done / Math.max(1, imgProgress.total)) * 100)}%</span>
              )}
            </div>
            {!imgProgress.creditsExhausted && !imgDone && (
              <div className="h-1 mt-0.5 bg-blue-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${(imgProgress.done / Math.max(1, imgProgress.total)) * 100}%` }}
                />
              </div>
            )}
          </div>
          <button
            onClick={() => { imgAbortRef.current?.abort(); setImgProgress(null) }}
            className={`shrink-0 p-0.5 ${imgProgress.creditsExhausted ? 'text-amber-400 hover:text-amber-600' : 'text-blue-400 hover:text-blue-600'}`}
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Error banner ── */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 text-xs border-b border-red-100 shrink-0">
          <AlertTriangle size={12} />
          {error}
        </div>
      )}

      {/* ── Search bar ── */}
      <div className="flex items-center gap-2 px-4 py-2 shrink-0">
        <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-1.5">
          <Search size={14} className="text-gray-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, barcode, 8-digit order code..."
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

      {/* ── Department filter chips ── */}
      <div className="flex gap-1.5 px-4 pb-2 overflow-x-auto no-scrollbar shrink-0">
        {departments.map(dept => (
          <button
            key={dept}
            onClick={() => setDeptFilter(dept)}
            className={`whitespace-nowrap text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors shrink-0 ${
              deptFilter === dept
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {dept === 'All' ? `All (${enrichedItems.length})` : `${dept} (${enrichedItems.filter(e => e.stock.department === dept).length})`}
          </button>
        ))}
      </div>

      {/* ── Sort selector ── */}
      <div className="flex items-center gap-1.5 px-4 pb-2 shrink-0">
        <span className="text-[10px] text-gray-400 uppercase tracking-wider">Sort</span>
        {([
          { key: 'revenue' as SortKey, label: 'Revenue' },
          { key: 'margin' as SortKey, label: 'Margin' },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSortKey(key)}
            className={`text-[11px] font-medium px-2 py-0.5 rounded transition-colors ${
              sortKey === key ? 'bg-emerald-100 text-emerald-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Stock cards ── */}
      <div className="flex-1 overflow-auto px-4 pb-4 space-y-3">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Warehouse size={24} className="text-gray-300" />
            <p className="text-sm text-gray-400">
              {search ? 'No matching products' : 'No stock data available'}
            </p>
          </div>
        ) : (
          filteredItems.map(item => (
            <StockCard
              key={item.stock.itemCode}
              item={item}
              onPriceChange={setPriceTarget}
              onCompare={setCompareTarget}
              onAddExpiry={setExpiryTarget}
            />
          ))
        )}

        {/* Last refresh timestamp */}
        {lastRefresh && (
          <p className="text-center text-[10px] text-gray-300 pt-2">
            Updated {lastRefresh.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      {/* ── Modals ── */}
      <BarcodeScanner open={scannerOpen} onScan={handleBarcodeScan} onClose={() => setScannerOpen(false)} />

      <PriceChangeModal
        open={!!priceTarget}
        itemCode={priceTarget?.itemCode ?? ''}
        barcode={priceTarget?.barcode ?? null}
        description={priceTarget?.description ?? ''}
        department={priceTarget?.department ?? ''}
        currentPrice={priceTarget?.sellPrice ?? 0}
        onClose={() => setPriceTarget(null)}
        onSuccess={() => { setPriceTarget(null); fetchData(true) }}
      />

      <CompetitivePriceSheet
        open={!!compareTarget}
        description={compareTarget?.description ?? ''}
        barcode={compareTarget?.barcode ?? ''}
        ourPrice={compareTarget?.sellPrice ?? 0}
        onClose={() => setCompareTarget(null)}
        onMatchPrice={(price, source) => {
          if (compareTarget) {
            setPriceTarget(compareTarget)
            setCompareTarget(null)
            void price; void source
          }
        }}
      />

      <AddBatchSheet
        open={!!expiryTarget}
        onClose={() => setExpiryTarget(null)}
        initialBarcode={expiryTarget?.barcode ?? undefined}
        initialProductName={expiryTarget?.description}
        initialDepartment={expiryTarget?.department}
      />
    </div>
  )
}
