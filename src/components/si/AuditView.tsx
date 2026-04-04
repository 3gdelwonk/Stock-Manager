import { useState, useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  DollarSign, Package, Trash2, Search, Download, RefreshCw,
} from 'lucide-react'
import { getRecentPriceChanges, type RecentPriceChange } from '../../lib/jarvis'
import { db } from '../../lib/db'
import type { WasteLogEntry, QuickActionLogEntry } from '../../lib/types'

// ── Unified audit entry ─────────────────────────────────────────────────────

type AuditType = 'price' | 'stock' | 'waste'

interface AuditEntry {
  id: string
  type: AuditType
  timestamp: Date
  product: string
  barcode: string
  detail: string
  user?: string
}

const TYPE_CONFIG: Record<AuditType, { label: string; color: string; bg: string; Icon: typeof DollarSign }> = {
  price: { label: 'Price', color: 'text-amber-700', bg: 'bg-amber-100', Icon: DollarSign },
  stock: { label: 'Stock', color: 'text-blue-700', bg: 'bg-blue-100', Icon: Package },
  waste: { label: 'Waste', color: 'text-red-700', bg: 'bg-red-100', Icon: Trash2 },
}

type DateRange = '1' | '7' | '30'
type FilterType = 'all' | AuditType

function fmtMoney(n: number) { return n.toFixed(2) }

export default function AuditView() {
  const [range, setRange] = useState<DateRange>('7')
  const [filter, setFilter] = useState<FilterType>('all')
  const [search, setSearch] = useState('')
  const [priceChanges, setPriceChanges] = useState<RecentPriceChange[]>([])
  const [loading, setLoading] = useState(false)

  const sinceDate = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - parseInt(range))
    return d
  }, [range])

  // Fetch remote price changes
  useEffect(() => {
    setLoading(true)
    getRecentPriceChanges(sinceDate.toISOString(), false)
      .then(setPriceChanges)
      .catch(() => setPriceChanges([]))
      .finally(() => setLoading(false))
  }, [sinceDate])

  // Local data
  const stockAdjustments = useLiveQuery(
    () => db.quickActionLog
      .where('actionType').equals('stock-adjust')
      .toArray()
      .then(items => items.filter(i => new Date(i.performedAt) >= sinceDate)),
    [sinceDate],
  )

  const wasteEntries = useLiveQuery(
    () => db.wasteLog
      .toArray()
      .then(items => items.filter(i => i.loggedAt >= sinceDate)),
    [sinceDate],
  )

  // Merge into unified list
  const allEntries = useMemo(() => {
    const entries: AuditEntry[] = []

    // Price changes from API
    for (const pc of priceChanges) {
      entries.push({
        id: `price-${pc.itemCode}-${pc.changeDate}`,
        type: 'price',
        timestamp: new Date(pc.changeDate),
        product: pc.description,
        barcode: pc.barcode || pc.itemCode,
        detail: `$${fmtMoney(pc.oldPrice)} → $${fmtMoney(pc.newPrice)}`,
        user: pc.changedBy,
      })
    }

    // Stock adjustments from local log
    for (const sa of stockAdjustments ?? []) {
      const d = sa.details as Record<string, unknown>
      entries.push({
        id: `stock-${sa.id}`,
        type: 'stock',
        timestamp: new Date(sa.performedAt),
        product: sa.productName,
        barcode: sa.barcode,
        detail: `Qty: ${d.newQoh ?? d.qty ?? '?'} — ${d.reason ?? 'adjustment'}`,
        user: sa.performedBy,
      })
    }

    // Waste from local log
    for (const w of wasteEntries ?? []) {
      entries.push({
        id: `waste-${w.id}`,
        type: 'waste',
        timestamp: w.loggedAt,
        product: w.productName,
        barcode: w.barcode,
        detail: `${w.qty} × $${fmtMoney(w.sellPrice)} — ${w.reason}${w.claimable ? ' (claimable)' : ''}`,
      })
    }

    entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    return entries
  }, [priceChanges, stockAdjustments, wasteEntries])

  // Filter + search
  const filtered = useMemo(() => {
    let list = allEntries
    if (filter !== 'all') list = list.filter(e => e.type === filter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(e => e.product.toLowerCase().includes(q) || e.barcode.toLowerCase().includes(q))
    }
    return list
  }, [allEntries, filter, search])

  // Stats
  const stats = useMemo(() => ({
    total: allEntries.length,
    prices: allEntries.filter(e => e.type === 'price').length,
    stocks: allEntries.filter(e => e.type === 'stock').length,
    wastes: allEntries.filter(e => e.type === 'waste').length,
    wasteValue: (wasteEntries ?? []).reduce((sum, w) => sum + w.qty * w.sellPrice, 0),
  }), [allEntries, wasteEntries])

  function exportCsv() {
    const headers = ['Timestamp', 'Type', 'Product', 'Barcode', 'Detail', 'User']
    const rows = filtered.map(e => [
      e.timestamp.toISOString(),
      e.type,
      `"${e.product}"`,
      e.barcode,
      `"${e.detail}"`,
      e.user ?? '',
    ])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-${range}d-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-[10px] text-gray-400 uppercase">Total Changes</p>
          <p className="text-xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-[10px] text-gray-400 uppercase">Price Changes</p>
          <p className="text-xl font-bold text-amber-600">{stats.prices}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-[10px] text-gray-400 uppercase">Stock Adjustments</p>
          <p className="text-xl font-bold text-blue-600">{stats.stocks}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-[10px] text-gray-400 uppercase">Waste Value</p>
          <p className="text-xl font-bold text-red-600">${fmtMoney(stats.wasteValue)}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Date range */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {([['1', 'Today'], ['7', '7 Days'], ['30', '30 Days']] as [DateRange, string][]).map(([val, label]) => (
            <button key={val} onClick={() => setRange(val)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${range === val ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {([['all', 'All'], ['price', 'Price'], ['stock', 'Stock'], ['waste', 'Waste']] as [FilterType, string][]).map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${filter === val ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-1.5">
          <Search size={14} className="text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search product or barcode" className="flex-1 bg-transparent text-sm outline-none" />
        </div>

        {/* Actions */}
        <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
          <Download size={14} /> Export CSV
        </button>
        {loading && <RefreshCw size={14} className="text-gray-400 animate-spin" />}
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            {loading ? 'Loading audit data...' : 'No audit entries found'}
          </div>
        ) : (
          filtered.slice(0, 200).map(entry => {
            const cfg = TYPE_CONFIG[entry.type]
            const Icon = cfg.Icon
            return (
              <div key={entry.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${cfg.bg}`}>
                  <Icon size={14} className={cfg.color} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{entry.product}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="font-mono">{entry.barcode}</span>
                    <span>{entry.detail}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-gray-400">
                    {entry.timestamp.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {entry.timestamp.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {entry.user && <p className="text-[9px] text-gray-300 mt-0.5">{entry.user}</p>}
                </div>
              </div>
            )
          })
        )}
      </div>
      {filtered.length > 200 && (
        <p className="text-xs text-gray-400 text-center">Showing first 200 of {filtered.length} entries</p>
      )}
    </div>
  )
}
