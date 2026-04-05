import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react'
import {
  RefreshCw, WifiOff, Search, X, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Tag, AlertTriangle, Clock, DollarSign,
  Printer, PackageMinus, BarChart3, Warehouse, ImageIcon,
  MapPin, Pencil, Check,
} from 'lucide-react'
import {
  checkConnection, getStockLevels, getPromotions, getTopSellers,
  printLabel, getOrderInfo,
  type StockItem, type LivePromotion, type TopSeller, type OrderInfo,
} from '../../lib/jarvis'
import { getAliasesForItem, setPrimaryBarcode } from '../../lib/barcodeResolver'
import { db, type BarcodeAlias } from '../../lib/db'
import { useProductExpiry, type ExpiryInfo } from '../../lib/useProductExpiry'
import { prefetchImages, type PrefetchProgress } from '../../lib/images'
import { computeImagePriority } from '../../lib/serper'
import ProductImage from '../ProductImage'
import BarcodeStripe from '../BarcodeStripe'
import PriceChangeModal from '../PriceChangeModal'
import CompetitivePriceSheet from '../CompetitivePriceSheet'
import AddBatchSheet from '../AddBatchSheet'
import StockAdjustModal from '../StockAdjustModal'

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
}

function deptBadgeClass(dept: string): string {
  return DEPT_BADGE_COLORS[dept.toUpperCase()] ?? 'bg-gray-100 text-gray-600'
}

type SortKey = 'margin' | 'revenue' | 'name' | 'qoh' | 'velocity'

function fmtMoney(n: number): string {
  return n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Enriched stock item ───────────────────────────────────────────────────────

interface EnrichedStockItem {
  stock: StockItem
  promo: LivePromotion | null
  topSeller: boolean
  slowMover: boolean
  margin: number
  revenue: number
  expiryInfo: ExpiryInfo | null
}

// ── Desktop Stock Row (expanded detail) ──────────────────────────────────────

const StockRowDetail = memo(function StockRowDetail({
  item,
  onPriceChange,
  onCompare,
  onAddExpiry,
  onAdjustStock,
}: {
  item: EnrichedStockItem
  onPriceChange: (item: StockItem) => void
  onCompare: (item: StockItem) => void
  onAddExpiry: (item: StockItem) => void
  onAdjustStock: (item: StockItem) => void
}) {
  const { stock, promo, margin, expiryInfo } = item
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const actionMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null)
  const [orderLoading, setOrderLoading] = useState(true)
  const [aliases, setAliases] = useState<BarcodeAlias[]>([])

  // Location state
  const [locEdit, setLocEdit] = useState(false)
  const [loc, setLoc] = useState({ aisle: '', bay: '', shelf: '', section: '' })

  function showActionMsg(msg: string) {
    setActionMsg(msg)
    if (actionMsgTimer.current) clearTimeout(actionMsgTimer.current)
    actionMsgTimer.current = setTimeout(() => setActionMsg(null), 2000)
  }

  useEffect(() => {
    return () => { if (actionMsgTimer.current) clearTimeout(actionMsgTimer.current) }
  }, [])

  // Fetch order info + aliases + location on mount
  useEffect(() => {
    getOrderInfo(stock.itemCode).then(setOrderInfo).catch(() => {}).finally(() => setOrderLoading(false))
    getAliasesForItem(stock.itemCode).then(setAliases)
    const bc = stock.barcode || stock.itemCode
    db.products.where('barcode').equals(bc).first().then(p => {
      if (p) setLoc({ aisle: p.aisle || '', bay: p.bay || '', shelf: p.shelf || '', section: p.section || '' })
    })
  }, [stock.itemCode, stock.barcode])

  async function saveLoc() {
    const bc = stock.barcode || stock.itemCode
    const p = await db.products.where('barcode').equals(bc).first()
    if (p?.id) {
      await db.products.update(p.id, { aisle: loc.aisle, bay: loc.bay, shelf: loc.shelf, section: loc.section, updatedAt: new Date() })
    }
    setLocEdit(false)
    showActionMsg('Location saved')
  }

  async function handleSetPrimary(newPrimary: string) {
    await setPrimaryBarcode(stock.itemCode, newPrimary)
    const updated = await getAliasesForItem(stock.itemCode)
    setAliases(updated)
    showActionMsg(`Primary barcode set to ${newPrimary}`)
  }

  async function handlePrintLabel() {
    try {
      await printLabel(stock.barcode || stock.itemCode)
      showActionMsg('Label queued')
    } catch { showActionMsg('Print failed') }
  }

  const lowStock = stock.onHand > 0 && stock.onHand <= stock.reorderLevel
  const outOfStock = stock.onHand <= 0
  const velocity = stock.avgDayQty ?? 0
  const daysOfStock = velocity > 0 ? stock.onHand / velocity : null
  const primarySupplier = orderInfo?.suppliers?.find(s => s.isPrimary) ?? orderInfo?.suppliers?.[0] ?? null

  return (
    <tr>
      <td colSpan={8} className="px-4 py-4 bg-gray-50/50">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left: image + codes + barcodes */}
          <div className="space-y-4">
            <div className="flex gap-4">
              <ProductImage
                itemCode={stock.itemCode}
                description={stock.description}
                department={stock.department}
                barcode={stock.barcode}
                size={100}
                className="rounded-xl shadow-sm shrink-0"
              />
              <div className="space-y-1.5 text-sm text-gray-600 min-w-0">
                <div><span className="text-gray-400 text-xs">Item Code:</span> <span className="font-mono font-medium">{stock.itemCode}</span></div>
                {primarySupplier?.orderCode && (
                  <div><span className="text-gray-400 text-xs">Order Code:</span> <span className="font-mono font-medium">{primarySupplier.orderCode}</span></div>
                )}
                {stock.barcode && (
                  <div><span className="text-gray-400 text-xs">Barcode:</span> <span className="font-mono font-medium">{stock.barcode}</span></div>
                )}
                <div><span className="text-gray-400 text-xs">Dept Code:</span> <span className="font-mono">{stock.departmentCode}</span></div>
              </div>
            </div>

            {stock.barcode && (
              <div className="flex justify-center">
                <BarcodeStripe value={stock.barcode} height={40} showText />
              </div>
            )}

            {/* Aliases */}
            {aliases.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-100 p-3 space-y-1.5">
                <p className="text-xs text-gray-400 uppercase font-semibold">Alternate Barcodes</p>
                {aliases.map(a => (
                  <div key={a.barcode} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-gray-600">{a.barcode}</span>
                    {a.primaryBarcode === a.barcode ? (
                      <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-semibold">PRIMARY</span>
                    ) : (
                      <button onClick={() => handleSetPrimary(a.barcode)}
                        className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded hover:bg-emerald-100 hover:text-emerald-700 transition-colors">
                        Set Primary
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Supplier info */}
            {orderLoading && <p className="text-xs text-gray-400 animate-pulse">Loading supplier info...</p>}
            {orderInfo && orderInfo.suppliers.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-100 p-3 space-y-2">
                <p className="text-xs text-gray-400 uppercase font-semibold">Suppliers</p>
                {orderInfo.suppliers.map((sup, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`font-medium truncate ${sup.isPrimary ? 'text-gray-900' : 'text-gray-500'}`}>
                        {sup.supplierName}
                      </span>
                      {sup.isPrimary && <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-semibold shrink-0">PRIMARY</span>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-gray-500 text-sm">
                      <span>${sup.unitCost.toFixed(2)}/ea</span>
                      <span className="text-gray-300">|</span>
                      <span>${sup.ctnCost.toFixed(2)}/{sup.ctnQty}pk</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Middle: metrics + location */}
          <div className="space-y-4">
            {/* Pricing */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-lg border border-gray-100 p-3 text-center">
                <p className="text-xs text-gray-400 uppercase">Cost</p>
                <p className="text-base font-bold text-gray-800">${fmtMoney(stock.avgCost)}</p>
              </div>
              <div className="bg-white rounded-lg border border-gray-100 p-3 text-center">
                <p className="text-xs text-gray-400 uppercase">Sell</p>
                <p className="text-base font-bold text-emerald-600">${fmtMoney(stock.sellPrice)}</p>
              </div>
              <div className="bg-white rounded-lg border border-gray-100 p-3 text-center">
                <p className="text-xs text-gray-400 uppercase">Margin</p>
                <p className={`text-base font-bold ${margin < 20 ? 'text-red-600' : margin < 30 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {margin.toFixed(1)}%
                </p>
              </div>
            </div>

            {/* Stock metrics */}
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-white rounded-lg border border-gray-100 p-3 text-center">
                <p className="text-xs text-gray-400 uppercase">QOH</p>
                <p className={`text-base font-bold ${outOfStock ? 'text-red-600' : lowStock ? 'text-red-500' : 'text-gray-800'}`}>
                  {stock.onHand}
                </p>
              </div>
              <div className="bg-white rounded-lg border border-gray-100 p-3 text-center">
                <p className="text-xs text-gray-400 uppercase">Avg/Day</p>
                <p className="text-base font-bold text-gray-800">{velocity.toFixed(1)}</p>
              </div>
              <div className="bg-white rounded-lg border border-gray-100 p-3 text-center">
                <p className="text-xs text-gray-400 uppercase">Avg/Week</p>
                <p className="text-base font-bold text-gray-800">{(stock.avgWeekQty ?? 0).toFixed(1)}</p>
              </div>
              <div className="bg-white rounded-lg border border-gray-100 p-3 text-center">
                <p className="text-xs text-gray-400 uppercase">Days Stock</p>
                <p className={`text-base font-bold ${daysOfStock !== null && daysOfStock <= 3 ? 'text-red-600' : daysOfStock !== null && daysOfStock <= 7 ? 'text-amber-600' : 'text-gray-800'}`}>
                  {daysOfStock?.toFixed(0) ?? '—'}
                </p>
              </div>
            </div>

            {/* Reorder info */}
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span>Min: <span className="font-semibold text-gray-700">{stock.reorderLevel}</span></span>
              {stock.onOrder > 0 && <span className="text-blue-600 font-medium">+{stock.onOrder} on order</span>}
              {stock.isOnReorder && <span className="text-blue-600 font-medium">On reorder</span>}
            </div>

            {/* Location */}
            <div className="bg-white rounded-lg border border-gray-100 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase">
                  <MapPin size={12} /> Location
                </div>
                {locEdit ? (
                  <button onClick={saveLoc} className="text-emerald-600 hover:text-emerald-700"><Check size={16} /></button>
                ) : (
                  <button onClick={() => setLocEdit(true)} className="text-gray-400 hover:text-gray-600"><Pencil size={14} /></button>
                )}
              </div>
              {locEdit ? (
                <div className="grid grid-cols-4 gap-2">
                  {(['aisle', 'bay', 'shelf', 'section'] as const).map(f => (
                    <div key={f}>
                      <label className="text-xs text-gray-400 capitalize">{f}</label>
                      <input value={loc[f]} onChange={e => setLoc({ ...loc, [f]: e.target.value })}
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-center focus:ring-1 focus:ring-emerald-400 outline-none" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2 text-sm text-gray-600">
                  {(['aisle', 'bay', 'shelf', 'section'] as const).map(f => (
                    <div key={f} className="text-center">
                      <span className="text-xs text-gray-400 capitalize block">{f}</span>
                      <span className="font-medium">{loc[f] || '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: promo + expiry + actions */}
          <div className="space-y-4">
            {/* Promo */}
            {promo && (
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-4 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Tag size={14} className="text-amber-600" />
                  <span className="text-sm font-semibold text-amber-700">Active Promotion</span>
                </div>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-amber-600">
                    ${fmtMoney(promo.promoPrice)} <span className="line-through text-amber-400">${fmtMoney(promo.normalPrice)}</span>
                  </span>
                  <span className="font-semibold text-amber-700">{promo.discountPercent.toFixed(0)}% off</span>
                </div>
                {promo.promoUnitCost !== null && (
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-gray-500">
                      Cost ${fmtMoney(promo.promoUnitCost)} <span className="line-through text-gray-400">${fmtMoney(promo.normalUnitCost)}</span>
                    </span>
                    <span className="text-gray-500">CTN: {promo.ctnQty}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-amber-600">
                  <span>{promo.startDate.slice(0, 10)} — {promo.endDate.slice(0, 10)}</span>
                  <span className="font-semibold">{promo.daysLeft}d left</span>
                </div>
              </div>
            )}

            {/* Expiry batches */}
            {expiryInfo && expiryInfo.batches.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-100 p-4 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Clock size={14} className="text-gray-600" />
                  <span className="text-sm font-semibold text-gray-700">Expiry Batches ({expiryInfo.totalItems} items)</span>
                </div>
                {expiryInfo.batches.map((b, i) => (
                  <div key={i} className="flex items-center justify-between text-sm text-gray-500">
                    <span>{b.date}</span>
                    <span className="font-medium">{b.qty} units</span>
                  </div>
                ))}
              </div>
            )}

            {/* Action message */}
            {actionMsg && (
              <p className="text-sm text-emerald-600 font-medium text-center py-1">{actionMsg}</p>
            )}

            {/* Action buttons — desktop-sized */}
            <div className="grid grid-cols-5 gap-2">
              <button onClick={() => onPriceChange(stock)}
                className="flex flex-col items-center gap-1 py-3 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition-colors border border-emerald-100">
                <DollarSign size={18} /> Price
              </button>
              <button onClick={() => onAdjustStock(stock)}
                className="flex flex-col items-center gap-1 py-3 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition-colors border border-blue-100">
                <PackageMinus size={18} /> Adjust
              </button>
              <button onClick={handlePrintLabel}
                className="flex flex-col items-center gap-1 py-3 rounded-lg bg-gray-50 text-gray-700 text-xs font-medium hover:bg-gray-100 transition-colors border border-gray-100">
                <Printer size={18} /> Label
              </button>
              <button onClick={() => onCompare(stock)}
                className="flex flex-col items-center gap-1 py-3 rounded-lg bg-purple-50 text-purple-700 text-xs font-medium hover:bg-purple-100 transition-colors border border-purple-100">
                <BarChart3 size={18} /> Compare
              </button>
              <button onClick={() => onAddExpiry(stock)}
                className="flex flex-col items-center gap-1 py-3 rounded-lg bg-amber-50 text-amber-700 text-xs font-medium hover:bg-amber-100 transition-colors border border-amber-100">
                <Clock size={18} /> Expiry
              </button>
            </div>
          </div>
        </div>
      </td>
    </tr>
  )
})

// ── Main SIStockView ─────────────────────────────────────────────────────────

export default function SIStockView() {
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
  const [sortAsc, setSortAsc] = useState(false)
  const [displayLimit, setDisplayLimit] = useState(100)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  // Order code search
  const [orderCodeItemCode, setOrderCodeItemCode] = useState<string | null>(null)
  const orderCodeSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [aliasItemCode, setAliasItemCode] = useState<string | null>(null)
  const aliasSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Image auto-prefetch
  const [imgProgress, setImgProgress] = useState<PrefetchProgress | null>(null)
  const [imgDone, setImgDone] = useState(false)
  const imgAbortRef = useRef<AbortController | null>(null)

  // Modals
  const [priceTarget, setPriceTarget] = useState<StockItem | null>(null)
  const [compareTarget, setCompareTarget] = useState<StockItem | null>(null)
  const [expiryTarget, setExpiryTarget] = useState<StockItem | null>(null)
  const [adjustTarget, setAdjustTarget] = useState<StockItem | null>(null)

  const expiryMap = useProductExpiry()

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

  // ── Auto-prefetch images ──
  const imgStartedRef = useRef(false)
  useEffect(() => {
    if (stockItems.length === 0 || imgStartedRef.current) return
    imgStartedRef.current = true

    const items = [...stockItems]
      .map(s => ({ ...s, _priority: computeImagePriority({ avgDayQty: s.avgDayQty, sellPrice: s.sellPrice, avgCost: s.avgCost }) }))
      .sort((a, b) => b._priority - a._priority)
      .map(s => ({
        itemCode: s.itemCode, description: s.description, department: s.department,
        barcode: s.barcode ?? undefined,
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
      .catch(e => { if (e?.name !== 'AbortError') console.warn('Image prefetch error:', e) })

    return () => { controller.abort() }
  }, [stockItems])

  // ── Build lookup maps ──
  const promoMap = useMemo(() => {
    const map = new Map<string, LivePromotion>()
    for (const p of promos) map.set(p.itemCode, p)
    return map
  }, [promos])

  const topSellerCodes = useMemo(() => {
    const set = new Set<string>()
    if (topSellers.length === 0) return set
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

  const revenueMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of topSellers) map.set(t.itemCode, t.revenue)
    return map
  }, [topSellers])

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
      }
    })
  }, [stockItems, promoMap, topSellerCodes, slowMoverCodes, revenueMap, expiryMap])

  // ── Department list + counts ──
  const { departments, deptCounts } = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of enrichedItems) {
      const d = item.stock.department
      counts.set(d, (counts.get(d) ?? 0) + 1)
    }
    return {
      departments: ['All', ...Array.from(counts.keys()).sort()],
      deptCounts: counts,
    }
  }, [enrichedItems])

  const outOfStockCount = useMemo(
    () => enrichedItems.filter(e => e.stock.onHand <= 0).length,
    [enrichedItems]
  )

  // ── Order code server lookup (debounced) ──
  useEffect(() => {
    if (orderCodeSearchRef.current) clearTimeout(orderCodeSearchRef.current)
    setOrderCodeItemCode(null)
    const q = search.trim()
    if (!/^\d{4,8}$/.test(q) || stockItems.length === 0) return
    const hasLocalMatch = stockItems.some(s =>
      s.barcode === q || s.itemCode.toLowerCase() === q.toLowerCase() ||
      s.description.toLowerCase().includes(q.toLowerCase())
    )
    if (hasLocalMatch) return
    orderCodeSearchRef.current = setTimeout(async () => {
      const BATCH_SIZE = 10
      const candidates = stockItems.slice(0, 200)
      for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
        const batch = candidates.slice(i, i + BATCH_SIZE)
        const results = await Promise.allSettled(
          batch.map(item => getOrderInfo(item.itemCode))
        )
        for (let j = 0; j < results.length; j++) {
          const r = results[j]
          if (r.status === 'fulfilled' && r.value?.suppliers?.some(
            s => s.orderCode === q || s.orderCodeRaw?.includes(q)
          )) {
            setOrderCodeItemCode(batch[j].itemCode)
            return
          }
        }
      }
    }, 500)
    return () => { if (orderCodeSearchRef.current) clearTimeout(orderCodeSearchRef.current) }
  }, [search, stockItems])

  // ── Barcode alias lookup (debounced) ──
  useEffect(() => {
    if (aliasSearchRef.current) clearTimeout(aliasSearchRef.current)
    setAliasItemCode(null)
    const q = search.trim()
    if (!/^\d{8,}$/.test(q) || stockItems.length === 0) return
    const hasLocalMatch = stockItems.some(s => s.barcode === q)
    if (hasLocalMatch) return
    aliasSearchRef.current = setTimeout(async () => {
      const { resolveBarcode } = await import('../../lib/barcodeResolver')
      const resolved = await resolveBarcode(q, stockItems)
      if (resolved) setAliasItemCode(resolved.itemCode)
    }, 300)
    return () => { if (aliasSearchRef.current) clearTimeout(aliasSearchRef.current) }
  }, [search, stockItems])

  // Reset display limit when filters change
  useEffect(() => { setDisplayLimit(100) }, [search, deptFilter, sortKey])

  // ── Filter + sort ──
  const filteredItems = useMemo(() => {
    const q = search.toLowerCase().trim()
    let filtered = enrichedItems

    if (deptFilter !== 'All') {
      filtered = filtered.filter(e => e.stock.department === deptFilter)
    }

    if (q) {
      filtered = filtered.filter(e => {
        const s = e.stock
        if (orderCodeItemCode && s.itemCode === orderCodeItemCode) return true
        if (aliasItemCode && s.itemCode === aliasItemCode) return true
        return s.description.toLowerCase().includes(q) ||
          s.itemCode.toLowerCase().includes(q) ||
          (s.barcode && s.barcode.includes(search))
      })
    }

    const sorted = [...filtered]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'margin': cmp = a.margin - b.margin; break
        case 'revenue': cmp = a.revenue - b.revenue; break
        case 'name': cmp = a.stock.description.localeCompare(b.stock.description); break
        case 'qoh': cmp = a.stock.onHand - b.stock.onHand; break
        case 'velocity': cmp = (a.stock.avgDayQty ?? 0) - (b.stock.avgDayQty ?? 0); break
        default: cmp = 0
      }
      return sortAsc ? cmp : -cmp
    })
    return sorted
  }, [enrichedItems, search, deptFilter, sortKey, sortAsc, orderCodeItemCode, aliasItemCode])

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(false) }
  }

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return null
    return sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />
  }

  // ── Loading ──
  if (loading && stockItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <RefreshCw size={28} className="text-emerald-600 animate-spin" />
        <p className="text-sm text-gray-500">Loading stock...</p>
      </div>
    )
  }

  if (!online && stockItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <WifiOff size={28} className="text-gray-400" />
        <p className="text-sm text-gray-500">Offline — cannot load stock</p>
        <button onClick={() => fetchData()} className="text-sm text-emerald-600 font-medium underline">Retry</button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Summary bar ── */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-5 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Warehouse size={16} className="text-emerald-600" />
            <span className="text-sm font-semibold text-gray-800">{stockItems.length.toLocaleString()} products</span>
          </div>
          {promos.length > 0 && (
            <span className="flex items-center gap-1 text-sm font-medium text-amber-600">
              <Tag size={14} /> {promos.length} on promo
            </span>
          )}
          {outOfStockCount > 0 && (
            <span className="flex items-center gap-1 text-sm font-medium text-red-600">
              <AlertTriangle size={14} /> {outOfStockCount} out of stock
            </span>
          )}
          {lastRefresh && (
            <span className="text-xs text-gray-400">
              Updated {lastRefresh.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <button onClick={() => fetchData(true)} disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50">
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* ── Image prefetch banner ── */}
      {imgProgress && (imgProgress.total > 0 || imgProgress.creditsExhausted) && (
        <div className={`flex items-center gap-3 px-5 py-2.5 rounded-xl border ${
          imgProgress.creditsExhausted ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-100'
        }`}>
          <ImageIcon size={14} className={imgProgress.creditsExhausted ? 'text-amber-600 shrink-0' : 'text-blue-600 shrink-0'} />
          <div className="flex-1 min-w-0">
            <div className={`flex items-center justify-between text-sm ${imgProgress.creditsExhausted ? 'text-amber-700' : 'text-blue-700'}`}>
              <span className="truncate">
                {imgProgress.creditsExhausted
                  ? `Image search unavailable — ${imgProgress.total - imgProgress.done} products remaining`
                  : imgDone
                    ? `Done — ${imgProgress.found} new images saved${imgProgress.skipped ? `, ${imgProgress.skipped} already cached` : ''}`
                    : `Fetching images: ${imgProgress.done}/${imgProgress.total} (${imgProgress.found} found)`}
              </span>
              {!imgProgress.creditsExhausted && !imgDone && (
                <span className="shrink-0 ml-3">{Math.round((imgProgress.done / Math.max(1, imgProgress.total)) * 100)}%</span>
              )}
            </div>
            {!imgProgress.creditsExhausted && !imgDone && (
              <div className="h-1.5 mt-1 bg-blue-200 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${(imgProgress.done / Math.max(1, imgProgress.total)) * 100}%` }} />
              </div>
            )}
          </div>
          <button onClick={() => { imgAbortRef.current?.abort(); setImgProgress(null) }}
            className={`shrink-0 p-1 rounded ${imgProgress.creditsExhausted ? 'text-amber-400 hover:text-amber-600' : 'text-blue-400 hover:text-blue-600'}`}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Error banner ── */}
      {error && (
        <div className="flex items-center gap-2 px-5 py-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* ── Search + department filters ── */}
      <div className="flex items-start gap-4">
        {/* Search */}
        <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-200 px-4 py-2.5 w-full max-w-md">
          <Search size={16} className="text-gray-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, barcode, order code..."
            className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          )}
        </div>

        {/* Department dropdown */}
        <select
          value={deptFilter}
          onChange={e => setDeptFilter(e.target.value)}
          className="bg-white rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-emerald-300 cursor-pointer"
        >
          {departments.map(dept => (
            <option key={dept} value={dept}>
              {dept === 'All' ? `All Departments (${enrichedItems.length})` : `${dept} (${deptCounts.get(dept) ?? 0})`}
            </option>
          ))}
        </select>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left">
                <th className="pl-4 pr-2 py-3 w-12"></th>
                <th className="px-3 py-3">
                  <button onClick={() => handleSort('name')} className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700">
                    Product {sortIcon('name')}
                  </button>
                </th>
                <th className="px-3 py-3">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Department</span>
                </th>
                <th className="px-3 py-3 text-right">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sell</span>
                </th>
                <th className="px-3 py-3 text-right">
                  <button onClick={() => handleSort('margin')} className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700 ml-auto">
                    Margin {sortIcon('margin')}
                  </button>
                </th>
                <th className="px-3 py-3 text-right">
                  <button onClick={() => handleSort('qoh')} className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700 ml-auto">
                    QOH {sortIcon('qoh')}
                  </button>
                </th>
                <th className="px-3 py-3 text-right">
                  <button onClick={() => handleSort('velocity')} className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700 ml-auto">
                    Avg/Day {sortIcon('velocity')}
                  </button>
                </th>
                <th className="px-3 py-3 text-right">
                  <button onClick={() => handleSort('revenue')} className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700 ml-auto">
                    Revenue {sortIcon('revenue')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-gray-400">
                    <Warehouse size={28} className="mx-auto mb-2 text-gray-300" />
                    {search ? 'No matching products' : 'No stock data available'}
                  </td>
                </tr>
              ) : (
                filteredItems.slice(0, displayLimit).map(item => {
                  const s = item.stock
                  const isExpanded = expandedRow === s.itemCode
                  const outOfStock = s.onHand <= 0
                  const lowStock = s.onHand > 0 && s.onHand <= s.reorderLevel

                  return (
                    <React.Fragment key={s.itemCode}>
                      <tr
                        onClick={() => setExpandedRow(isExpanded ? null : s.itemCode)}
                        className={`cursor-pointer transition-colors ${isExpanded ? 'bg-emerald-50/30' : 'hover:bg-gray-50'}`}
                      >
                        <td className="pl-4 pr-2 py-2.5">
                          <ProductImage
                            itemCode={s.itemCode}
                            description={s.description}
                            department={s.department}
                            barcode={s.barcode}
                            size={36}
                            className="rounded-lg"
                          />
                        </td>
                        <td className="px-3 py-2.5 max-w-[280px]">
                          <p className="font-medium text-gray-900 truncate">{s.description}</p>
                          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                            {item.promo && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                                PROMO {item.promo.discountPercent.toFixed(0)}%
                              </span>
                            )}
                            {item.topSeller && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full flex items-center gap-0.5">
                                <TrendingUp size={9} /> TOP
                              </span>
                            )}
                            {item.slowMover && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full flex items-center gap-0.5">
                                <TrendingDown size={9} /> SLOW
                              </span>
                            )}
                            {item.expiryInfo?.nearestExpiry && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ${
                                item.expiryInfo.urgency === 'expired' ? 'bg-red-100 text-red-700' :
                                item.expiryInfo.urgency === 'red' ? 'bg-red-50 text-red-600' :
                                item.expiryInfo.urgency === 'amber' ? 'bg-amber-50 text-amber-600' :
                                'bg-green-50 text-green-600'
                              }`}>
                                <Clock size={9} /> {item.expiryInfo.nearestExpiry}
                              </span>
                            )}
                            {s.isOnReorder && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full">REORDER</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${deptBadgeClass(s.department)}`}>
                            {s.department}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="font-semibold text-emerald-600">${fmtMoney(s.sellPrice)}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`font-semibold ${
                            item.margin < 20 ? 'text-red-600' : item.margin < 30 ? 'text-amber-600' : 'text-emerald-600'
                          }`}>
                            {item.margin.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`font-semibold ${outOfStock ? 'text-red-600' : lowStock ? 'text-red-500' : 'text-gray-800'}`}>
                            {s.onHand}
                          </span>
                          {outOfStock && <span className="text-[9px] ml-1 font-bold text-red-600">OUT</span>}
                          {lowStock && !outOfStock && <span className="text-[9px] ml-1 font-bold text-red-500">LOW</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-600">
                          {(s.avgDayQty ?? 0).toFixed(1)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-600">
                          {item.revenue > 0 ? `$${fmtMoney(item.revenue)}` : '—'}
                        </td>
                      </tr>
                      {isExpanded && (
                        <StockRowDetail
                          item={item}
                          onPriceChange={setPriceTarget}
                          onCompare={setCompareTarget}
                          onAddExpiry={setExpiryTarget}
                          onAdjustStock={setAdjustTarget}
                        />
                      )}
                    </React.Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Show more */}
        {filteredItems.length > displayLimit && (
          <div className="border-t border-gray-100 px-5 py-3">
            <button
              onClick={() => setDisplayLimit(prev => prev + 100)}
              className="text-sm text-emerald-600 font-medium hover:underline"
            >
              Show more ({(filteredItems.length - displayLimit).toLocaleString()} remaining)
            </button>
          </div>
        )}

        {/* Count footer */}
        <div className="border-t border-gray-100 px-5 py-2.5 bg-gray-50 text-xs text-gray-400">
          Showing {Math.min(displayLimit, filteredItems.length).toLocaleString()} of {filteredItems.length.toLocaleString()} items
        </div>
      </div>

      {/* ── Modals ── */}
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

      {adjustTarget && (
        <StockAdjustModal
          target={{
            barcode: adjustTarget.barcode || adjustTarget.itemCode,
            description: adjustTarget.description,
            currentQoh: adjustTarget.onHand,
          }}
          onClose={() => setAdjustTarget(null)}
          onSuccess={() => { setAdjustTarget(null); fetchData(true) }}
        />
      )}
    </div>
  )
}
