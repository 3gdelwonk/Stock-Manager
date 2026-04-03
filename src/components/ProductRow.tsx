import { useState } from 'react'
import {
  ChevronDown, ChevronUp, DollarSign, Printer,
  BarChart3, PackageMinus, TrendingUp, TrendingDown, Clock,
} from 'lucide-react'
import type { Product, StockPerformance } from '../lib/types'
import { adjustStock, printLabel } from '../lib/jarvis'
import { db } from '../lib/db'
import ProductImage from './ProductImage'
import BarcodeStripe from './BarcodeStripe'
import { DEPARTMENT_LABELS, DEPARTMENT_COLORS } from '../lib/constants'

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

const EXPIRY_URGENCY_COLORS: Record<string, string> = {
  expired: 'bg-red-100 text-red-700',
  red: 'bg-red-50 text-red-600',
  amber: 'bg-amber-100 text-amber-700',
  green: 'bg-green-100 text-green-700',
}

// ─── QOH Gauge ───────────────────────────────────────────────────────────────

export function QohGauge({ qoh, min, max }: { qoh: number; min: number; max: number | undefined }) {
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

export interface EnrichedProduct {
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
  expiryInfo?: {
    totalItems: number
    nearestExpiry: string | null
    urgency: 'expired' | 'red' | 'amber' | 'green' | null
  }
}

// ─── ProductRow ──────────────────────────────────────────────────────────────

interface ProductRowProps {
  ep: EnrichedProduct
  onPriceChange: (p: Product) => void
  onCompare: (p: Product) => void
  onAddExpiry?: (p: Product) => void
}

export function ProductRow({ ep, onPriceChange, onCompare, onAddExpiry }: ProductRowProps) {
  const { product, localQoh, liveQoh, liveVelocity, onOrder, perf, activePromo, isTracked, reorder, expiryInfo } = ep
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

  // Format expiry badge text
  function expiryBadgeText(): string | null {
    if (!expiryInfo || expiryInfo.totalItems <= 0) return null
    if (!expiryInfo.nearestExpiry) return `EXP ${expiryInfo.totalItems}`
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const expiry = new Date(expiryInfo.nearestExpiry + 'T00:00:00')
    const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / 86400000)
    return `EXP ${expiryInfo.totalItems} | ${daysLeft}d`
  }

  const expBadge = expiryBadgeText()
  const expUrgencyClass = expiryInfo?.urgency ? EXPIRY_URGENCY_COLORS[expiryInfo.urgency] : ''

  return (
    <div className="border-b border-gray-100 last:border-0">
      {/* Collapsed card */}
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
              {expBadge && (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${expUrgencyClass}`}>
                  {expBadge}
                </span>
              )}
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

      {/* Expanded detail */}
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
              <p className="text-[10px] text-gray-400 uppercase">Margin</p>
              <p className="text-sm font-bold text-emerald-600">{margin.toFixed(1)}%</p>
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

          {/* Action buttons — 5-button grid */}
          <div className="grid grid-cols-5 gap-1.5">
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
            <button onClick={e => { e.stopPropagation(); onAddExpiry?.(product) }}
              className="flex flex-col items-center gap-0.5 py-2 rounded-lg bg-amber-50 text-amber-700 text-[10px] font-medium hover:bg-amber-100 transition-colors">
              <Clock size={16} /> Expiry
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
