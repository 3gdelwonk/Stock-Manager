import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  Search, ChevronDown, ChevronUp, ScanBarcode, DollarSign, Loader2,
  Printer, BarChart3, PackageMinus, TrendingUp, TrendingDown, Plus,
} from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import BarcodeScanner from './BarcodeScanner'
import BarcodeStripe from './BarcodeStripe'
import ProductImage from './ProductImage'
import PriceChangeModal from './PriceChangeModal'
import CompetitivePriceSheet from './CompetitivePriceSheet'
import CreateProductSheet from './CreateProductSheet'
import { useProductCodeLookup } from '../lib/useProductCodes'
import { db } from '../lib/db'
import {
  getLatestQoh, classifyABC, classifyXYZ, computePerformance, needsReplenishment,
} from '../lib/analytics'
import {
  checkConnection, getStockLevels, adjustStock, printLabel,
  type StockItem,
} from '../lib/jarvis'
import { useTrackedItemCodes } from '../lib/useTrackedItems'
import { DEPARTMENT_LABELS, DEPARTMENT_COLORS, DEPARTMENT_ORDER, LEAD_TIME_DEFAULT } from '../lib/constants'
import type { Product, GroceryDepartment, StockPerformance, StockSnapshot, SalesRecord } from '../lib/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

type SortKey = 'name' | 'qoh' | 'velocity' | 'department' | 'margin' | 'abc'

const ABC_BADGE: Record<string, string> = {
  A: 'bg-green-100 text-green-700',
  B: 'bg-blue-100 text-blue-700',
  C: 'bg-amber-100 text-amber-700',
  D: 'bg-gray-100 text-gray-500',
}
const XYZ_BADGE: Record<string, string> = {
  X: 'bg-green-100 text-green-700',
  Y: 'bg-yellow-100 text-yellow-700',
  Z: 'bg-red-100 text-red-700',
}

function statusLabel(qoh: number | undefined, min: number, max: number | undefined): string {
  if (qoh === undefined) return 'Unknown'
  if (qoh <= 0) return 'Out'
  if (qoh < min) return 'Low'
  if (max && qoh > max) return 'Over'
  return 'Good'
}

function statusColor(status: string): string {
  if (status === 'Out') return 'text-red-700 bg-red-100'
  if (status === 'Low') return 'text-red-600 bg-red-50'
  if (status === 'Over') return 'text-amber-600 bg-amber-50'
  if (status === 'Good') return 'text-green-600 bg-green-50'
  return 'text-gray-500 bg-gray-50'
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ─── QOH Gauge ───────────────────────────────────────────────────────────────

function QohGauge({ qoh, min, max }: { qoh: number; min: number; max: number | undefined }) {
  const effectiveMax = (max ?? (min * 3)) || 10
  const pct = Math.min(100, Math.max(0, (qoh / effectiveMax) * 100))
  const minPct = Math.min(100, (min / effectiveMax) * 100)
  const color = qoh <= 0 ? '#dc2626' : qoh < min ? '#ef4444' : max && qoh > max ? '#f59e0b' : '#10b981'
  return (
    <div className="relative h-1.5 bg-gray-100 rounded-full">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      {min > 0 && <div className="absolute top-0 bottom-0 w-0.5 bg-gray-400 rounded" style={{ left: `${minPct}%` }} />}
    </div>
  )
}

// ─── Enriched Product Type ───────────────────────────────────────────────────

interface EnrichedProduct {
  product: Product
  localQoh: number | undefined
  liveQoh: number | undefined
  liveVelocity: number
  onOrder: number
  reorderLevel: number
  perf: StockPerformance | null
  activePromo: boolean
  isTracked: boolean
  reorder: boolean
}

// ─── ProductRow ──────────────────────────────────────────────────────────────

interface ProductRowProps {
  ep: EnrichedProduct
  onPriceChange: (p: Product) => void
  onCompare: (p: Product) => void
}

function ProductRow({ ep, onPriceChange, onCompare }: ProductRowProps) {
  const { product, localQoh, liveQoh, liveVelocity, onOrder, perf, activePromo, isTracked, reorder } = ep
  const [expanded, setExpanded] = useState(false)
  const [edit, setEdit] = useState({ ...product })
  const [saving, setSaving] = useState(false)
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  const qoh = liveQoh ?? localQoh
  const velocity = liveVelocity > 0 ? liveVelocity : (perf?.velocity ?? 0)
  const trend = perf?.trend ?? 0
  const margin = product.sellPrice > 0 ? ((product.sellPrice - product.costPrice) / product.sellPrice) * 100 : 0
  const status = statusLabel(qoh, product.minStockLevel, product.maxStockLevel)
  const daysOfStock = perf?.daysOfStock

  async function save() {
    setSaving(true)
    try {
      await db.products.update(product.id!, {
        aisle: edit.aisle || '', bay: edit.bay || '', shelf: edit.shelf || '', section: edit.section || '',
        minStockLevel: Number(edit.minStockLevel),
        maxStockLevel: edit.maxStockLevel ? Number(edit.maxStockLevel) : undefined,
        notes: edit.notes || undefined, updatedAt: new Date(),
      })
      setExpanded(false)
    } finally { setSaving(false) }
  }

  async function handleAdjustStock() {
    const input = prompt('Adjust stock quantity (negative to reduce):')
    if (!input) return
    const qty = parseInt(input, 10)
    if (isNaN(qty)) return
    try {
      await adjustStock(product.barcode || product.itemCode, qty, 'manual_adjustment')
      setActionMsg('Stock adjusted')
      setTimeout(() => setActionMsg(null), 2000)
    } catch { setActionMsg('Failed') }
  }

  async function handlePrintLabel() {
    try {
      await printLabel(product.barcode || product.itemCode)
      setActionMsg('Label queued')
      setTimeout(() => setActionMsg(null), 2000)
    } catch { setActionMsg('Failed') }
  }

  return (
    <div className="border-b border-gray-100 last:border-0">
      {/* ── Collapsed card ── */}
      <button className="w-full text-left py-2.5 px-0" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-start gap-2.5">
          <ProductImage
            itemCode={product.itemCode}
            description={product.name}
            department={DEPARTMENT_LABELS[product.department]}
            barcode={product.barcode}
            size={44}
          />
          <div className="flex-1 min-w-0">
            {/* Row 1: Name + badges */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-sm font-medium text-gray-900 truncate">{product.name}</span>
              {activePromo && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full">PROMO</span>}
              {isTracked && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-cyan-100 text-cyan-700 rounded-full">TRACKING</span>}
              {reorder && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full">REORDER</span>}
            </div>
            {/* Row 2: Dept + ABC/XYZ + codes */}
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: DEPARTMENT_COLORS[product.department] + '22', color: DEPARTMENT_COLORS[product.department] }}>
                {DEPARTMENT_LABELS[product.department]}
              </span>
              {perf && <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${ABC_BADGE[perf.abcClass]}`}>{perf.abcClass}</span>}
              {perf && <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${XYZ_BADGE[perf.xyzClass]}`}>{perf.xyzClass}</span>}
              <span className="text-[9px] text-gray-400 font-mono">#{product.itemCode}</span>
            </div>
            {/* Row 3: Key metrics */}
            <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500">
              <span className="font-semibold text-gray-700">${fmtMoney(product.sellPrice)}</span>
              <span>{margin.toFixed(0)}% margin</span>
              <span className="flex items-center gap-0.5">
                {velocity.toFixed(1)}/d
              </span>
              {trend !== 0 && (
                <span className={`flex items-center gap-0.5 font-medium ${trend > 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {trend > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                  {trend > 0 ? '+' : ''}{trend.toFixed(0)}%
                </span>
              )}
              {daysOfStock !== null && daysOfStock !== undefined && (
                <span className={daysOfStock <= 3 ? 'text-red-600 font-medium' : daysOfStock <= 7 ? 'text-amber-600' : ''}>
                  {daysOfStock.toFixed(0)}d
                </span>
              )}
              {onOrder > 0 && <span className="text-blue-600">+{onOrder} ordered</span>}
            </div>
            {/* QOH gauge */}
            {qoh !== undefined && (
              <div className="mt-1.5">
                <QohGauge qoh={qoh} min={product.minStockLevel} max={product.maxStockLevel} />
              </div>
            )}
          </div>
          {/* Right: QOH + status */}
          <div className="text-right shrink-0">
            <p className={`text-sm font-bold ${qoh !== undefined && qoh <= 0 ? 'text-red-600' : status === 'Low' ? 'text-red-500' : 'text-gray-800'}`}>
              {qoh ?? '?'}
            </p>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${statusColor(status)}`}>{status}</span>
            {perf?.gmroi !== null && perf?.gmroi !== undefined && (
              <p className="text-[9px] text-gray-400 mt-0.5">GMROI {perf.gmroi.toFixed(1)}</p>
            )}
          </div>
          <div className="text-gray-400 shrink-0 mt-2">{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</div>
        </div>
      </button>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div className="pb-3 space-y-3">
          {/* Barcode + item codes */}
          <div className="bg-gray-50 rounded-lg px-3 py-2 space-y-2">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              <div><span className="text-gray-400">Item Code:</span> <span className="font-mono font-medium">{product.itemCode}</span></div>
              <div><span className="text-gray-400">Dept Code:</span> <span className="font-mono">{product.departmentCode}</span></div>
              <div><span className="text-gray-400">Barcode:</span> <span className="font-mono">{product.barcode}</span></div>
              {product.isGstFree && <span className="text-emerald-600 font-medium">GST FREE</span>}
            </div>
            <div className="flex justify-center">
              <BarcodeStripe value={product.barcode} height={40} />
            </div>
          </div>

          {/* Performance metrics grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <p className="text-[10px] text-gray-400 uppercase">Velocity</p>
              <p className="text-sm font-bold text-gray-800">{velocity.toFixed(2)}/d</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <p className="text-[10px] text-gray-400 uppercase">Trend</p>
              <p className={`text-sm font-bold ${trend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {trend >= 0 ? '+' : ''}{trend.toFixed(0)}%
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <p className="text-[10px] text-gray-400 uppercase">Days Stock</p>
              <p className={`text-sm font-bold ${daysOfStock !== null && daysOfStock !== undefined && daysOfStock <= 3 ? 'text-red-600' : 'text-gray-800'}`}>
                {daysOfStock?.toFixed(1) ?? '—'}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <p className="text-[10px] text-gray-400 uppercase">GMROI</p>
              <p className="text-sm font-bold text-gray-800">{perf?.gmroi?.toFixed(2) ?? '—'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <p className="text-[10px] text-gray-400 uppercase">Reorder Lv</p>
              <p className="text-sm font-bold text-gray-800">{ep.reorderLevel || product.minStockLevel}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <p className="text-[10px] text-gray-400 uppercase">On Order</p>
              <p className="text-sm font-bold text-blue-600">{onOrder}</p>
            </div>
          </div>

          {/* Location fields */}
          <div className="grid grid-cols-4 gap-2">
            {(['aisle', 'bay', 'shelf', 'section'] as const).map(key => (
              <label key={key} className="flex flex-col gap-0.5">
                <span className="text-[10px] text-gray-400 capitalize">{key}</span>
                <input
                  type="text"
                  value={(edit as Record<string, unknown>)[key] as string ?? ''}
                  onChange={e => setEdit(prev => ({ ...prev, [key]: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-300"
                />
              </label>
            ))}
          </div>

          {/* Price + cost */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-gray-400">Sell Price</span>
              <button
                onClick={e => { e.stopPropagation(); onPriceChange(product) }}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-left font-mono text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
              >
                ${product.sellPrice.toFixed(2)}
              </button>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-gray-400">Cost Price</span>
              <div className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-mono text-gray-600 bg-gray-50">
                ${product.costPrice.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Stock levels */}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] text-gray-400">Min Stock</span>
              <input type="number" value={edit.minStockLevel ?? ''} onChange={e => setEdit(prev => ({ ...prev, minStockLevel: Number(e.target.value) }))}
                className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-300" />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] text-gray-400">Max Stock</span>
              <input type="number" value={edit.maxStockLevel ?? ''} onChange={e => setEdit(prev => ({ ...prev, maxStockLevel: e.target.value ? Number(e.target.value) : undefined }))}
                className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-300" />
            </label>
          </div>

          {/* Notes */}
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] text-gray-400">Notes</span>
            <textarea value={edit.notes ?? ''} onChange={e => setEdit(prev => ({ ...prev, notes: e.target.value }))} rows={2}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-300 resize-none" />
          </label>

          {/* Action message */}
          {actionMsg && (
            <p className="text-xs text-emerald-600 font-medium text-center">{actionMsg}</p>
          )}

          {/* Action buttons */}
          <div className="grid grid-cols-4 gap-1.5">
            <button onClick={e => { e.stopPropagation(); onPriceChange(product) }}
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
            <button onClick={e => { e.stopPropagation(); onCompare(product) }}
              className="flex flex-col items-center gap-0.5 py-2 rounded-lg bg-purple-50 text-purple-700 text-[10px] font-medium hover:bg-purple-100 transition-colors">
              <BarChart3 size={16} /> Compare
            </button>
          </div>

          {/* Save / Cancel */}
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="flex-1 bg-emerald-600 text-white text-sm font-medium py-2 rounded-lg disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => { setEdit({ ...product }); setExpanded(false) }} className="flex-1 bg-gray-100 text-gray-700 text-sm font-medium py-2 rounded-lg">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main: ProductsView ──────────────────────────────────────────────────────

interface ProductsViewProps {
  initialAction?: 'scan' | 'search' | null
  onActionConsumed?: () => void
}

export default function ProductsView({ initialAction, onActionConsumed }: ProductsViewProps = {}) {
  // ── Dexie data ──
  const products = useLiveQuery(() => db.products.toArray(), [])
  const snapshots = useLiveQuery(() => db.stockSnapshots.toArray(), [])
  const salesRecords = useLiveQuery(() => db.salesRecords.toArray(), [])
  const promotions = useLiveQuery(() => db.promotions.toArray(), [])

  // ── Live stock from API ──
  const [liveStock, setLiveStock] = useState<StockItem[] | null>(null)
  const [liveConnected, setLiveConnected] = useState<boolean | null>(null)
  const [liveLoading, setLiveLoading] = useState(false)

  const fetchLiveStock = useCallback(async () => {
    setLiveLoading(true)
    try {
      const conn = await checkConnection()
      setLiveConnected(conn.connected)
      if (conn.connected) {
        const stock = await getStockLevels({ limit: 5000 })
        setLiveStock(stock)
      }
    } catch {
      setLiveConnected(false)
    } finally {
      setLiveLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLiveStock()
    const id = setInterval(fetchLiveStock, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [fetchLiveStock])

  // ── Build live stock lookup ──
  const liveStockMap = useMemo(() => {
    const map = new Map<string, StockItem>()
    if (liveStock) {
      for (const item of liveStock) map.set(item.itemCode, item)
    }
    return map
  }, [liveStock])

  // ── UI state ──
  const trackedItemCodes = useTrackedItemCodes()
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState<GroceryDepartment | 'all'>('all')
  const [sort, setSort] = useState<SortKey>('department')
  const [scannerOpen, setScannerOpen] = useState(false)
  const { resolveCode } = useProductCodeLookup()
  const searchInputRef = useRef<HTMLInputElement>(null)

  // ── Modals ──
  const [priceModalProduct, setPriceModalProduct] = useState<Product | null>(null)
  const [compareProduct, setCompareProduct] = useState<Product | null>(null)
  const [createSheetOpen, setCreateSheetOpen] = useState(false)

  // ── Dashboard action handler ──
  useEffect(() => {
    if (!initialAction) return
    if (initialAction === 'scan') setScannerOpen(true)
    else if (initialAction === 'search') setTimeout(() => searchInputRef.current?.focus(), 100)
    onActionConsumed?.()
  }, [initialAction, onActionConsumed])

  const handlePriceChange = useCallback((p: Product) => setPriceModalProduct(p), [])
  const handleCompare = useCallback((p: Product) => setCompareProduct(p), [])
  const handleScan = useCallback((code: string) => { setScannerOpen(false); setSearch(resolveCode(code)) }, [resolveCode])

  // ── Compute performance ──
  const perfData = useMemo(() => {
    if (!products || !snapshots || !salesRecords) return null
    const latestQoh = getLatestQoh(snapshots as StockSnapshot[])
    const abcMap = classifyABC(products, salesRecords as SalesRecord[])
    const xyzMap = classifyXYZ(products, salesRecords as SalesRecord[])
    const perfMap = new Map<number, StockPerformance>()
    for (const p of products) {
      if (p.id === undefined) continue
      perfMap.set(p.id, computePerformance(p, {
        snapshots: snapshots as StockSnapshot[],
        salesRecords: salesRecords as SalesRecord[],
        abcClass: abcMap.get(p.id) ?? 'D',
        xyzClass: xyzMap.get(p.id) ?? 'Z',
      }))
    }
    return { latestQoh, abcMap, xyzMap, perfMap }
  }, [products, snapshots, salesRecords])

  // ── Active promos ──
  const activePromoIds = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const ids = new Set<number>()
    if (promotions) {
      for (const p of promotions) {
        if (p.startDate <= today && p.endDate >= today && p.productId) ids.add(p.productId)
      }
    }
    return ids
  }, [promotions])

  // ── Enrich + filter + sort ──
  const enriched = useMemo((): EnrichedProduct[] => {
    if (!products) return []
    const latestQoh = perfData?.latestQoh ?? new Map<number, number>()
    const perfMap = perfData?.perfMap ?? new Map<number, StockPerformance>()

    let list = products.map((product): EnrichedProduct => {
      const live = liveStockMap.get(product.itemCode)
      const perf = product.id ? perfMap.get(product.id) ?? null : null
      const localQoh = product.id ? latestQoh.get(product.id) : undefined
      const liveQoh = live?.onHand
      const effectiveQoh = liveQoh ?? localQoh
      const vel = live?.avgDayQty ?? perf?.velocity ?? 0

      return {
        product,
        localQoh,
        liveQoh,
        liveVelocity: live?.avgDayQty ?? 0,
        onOrder: live?.onOrder ?? 0,
        reorderLevel: live?.reorderLevel ?? product.minStockLevel,
        perf,
        activePromo: !!product.id && activePromoIds.has(product.id),
        isTracked: trackedItemCodes.has(product.itemCode),
        reorder: needsReplenishment(effectiveQoh ?? null, vel, LEAD_TIME_DEFAULT),
      }
    })

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
  }, [products, perfData, liveStockMap, activePromoIds, trackedItemCodes, search, catFilter, sort])

  // ── Group by department ──
  const byDept = useMemo(() => {
    if (sort !== 'department') return null
    const groups = new Map<GroceryDepartment, EnrichedProduct[]>()
    for (const ep of enriched) {
      const arr = groups.get(ep.product.department) ?? []
      arr.push(ep)
      groups.set(ep.product.department, arr)
    }
    return groups
  }, [enriched, sort])

  // ── Loading state ──
  if (!products) return <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 text-emerald-600 animate-spin" /></div>
  if (!products.length) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
      <p className="text-sm text-gray-500">No products. Import Item Maintenance to populate.</p>
    </div>
  )

  // ── Render ──
  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1 border-b border-gray-100 bg-white shrink-0">
        <div className="flex items-center gap-2 text-xs">
          {liveConnected ? (
            <><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /><span className="text-emerald-600 font-medium">Live</span></>
          ) : liveConnected === false ? (
            <span className="text-amber-600 font-medium">Offline · local data</span>
          ) : null}
          <span className="text-gray-400">{enriched.length} products</span>
          {liveLoading && <Loader2 size={12} className="text-emerald-600 animate-spin" />}
        </div>
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
            All
          </button>
          {DEPARTMENT_ORDER.map(dept => (
            <button key={dept} onClick={() => setCatFilter(dept)}
              className={`shrink-0 text-xs px-3 py-1 rounded-full font-medium transition-colors ${catFilter === dept ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {DEPARTMENT_LABELS[dept]}
            </button>
          ))}
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
                <ProductRow key={ep.product.id} ep={ep} onPriceChange={handlePriceChange} onCompare={handleCompare} />
              ))}
            </div>
          ))
        ) : (
          enriched.map(ep => (
            <ProductRow key={ep.product.id} ep={ep} onPriceChange={handlePriceChange} onCompare={handleCompare} />
          ))
        )}
        {enriched.length === 0 && <p className="text-center text-sm text-gray-400 py-8">No products match filters</p>}
        <div className="h-20" />
      </div>

      {/* FAB: Create new product */}
      <button
        onClick={() => setCreateSheetOpen(true)}
        className="fixed bottom-20 right-4 w-12 h-12 bg-emerald-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-emerald-700 transition-colors z-20"
        aria-label="Create product"
      >
        <Plus size={24} />
      </button>

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
            // The PriceChangeModal will open with the current price; user can enter the competitor price
            void price; void source
          }
        }}
      />

      <CreateProductSheet
        open={createSheetOpen}
        onClose={() => setCreateSheetOpen(false)}
        onSuccess={() => setCreateSheetOpen(false)}
      />
    </div>
  )
}
