import { useState, useEffect, useMemo, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CheckCircle, Trash2, ShoppingCart, Shield, Tag } from 'lucide-react'
import { db } from '../../lib/db'
import { getActiveBatchesFIFO, daysUntilExpiry, getExpiryUrgency, markAsWaste, markAsSold, markAsClaimed } from '../../lib/expiry'
import type { ExpiryBatch } from '../../lib/types'
import KpiCard from './KpiCard'
import ExpiryRiskPanel from './ExpiryRiskPanel'

type FilterTab = 'critical' | 'warning' | 'all'

export default function ExpiryWatch() {
  const [batches, setBatches] = useState<ExpiryBatch[]>([])
  const [filter, setFilter] = useState<FilterTab>('critical')
  const [loading, setLoading] = useState(true)

  const loadBatches = useCallback(async () => {
    const data = await getActiveBatchesFIFO()
    setBatches(data.filter(b => b.department !== 'liquor'))
    setLoading(false)
  }, [])

  useEffect(() => { loadBatches() }, [loadBatches])

  // KPI data
  const wasteLog = useLiveQuery(() => db.wasteLog.toArray(), [])
  const claimableValue = useMemo(() => {
    if (!wasteLog) return 0
    return wasteLog
      .filter(w => w.claimStatus === 'pending')
      .reduce((s, w) => s + w.qty * w.costPrice, 0)
  }, [wasteLog])

  const wasteMTD = useMemo(() => {
    if (!wasteLog) return 0
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    return wasteLog
      .filter(w => w.loggedAt >= monthStart)
      .reduce((s, w) => s + w.qty * w.costPrice, 0)
  }, [wasteLog])

  // Counts by urgency
  const counts = useMemo(() => {
    let expired = 0, red = 0, amber = 0
    for (const b of batches) {
      const u = getExpiryUrgency(b.expiryDate)
      if (u === 'expired') expired++
      else if (u === 'red') red++
      else if (u === 'amber') amber++
    }
    return { expired, red, amber }
  }, [batches])

  // Filtered list
  const filtered = useMemo(() => {
    if (filter === 'critical') return batches.filter(b => { const u = getExpiryUrgency(b.expiryDate); return u === 'expired' || u === 'red' })
    if (filter === 'warning') return batches.filter(b => getExpiryUrgency(b.expiryDate) === 'amber')
    return batches
  }, [batches, filter])

  const handleWaste = async (batch: ExpiryBatch) => {
    if (!batch.id) return
    await markAsWaste(batch.id, batch.qtyRemaining, 'expired', 0, 0, true)
    await loadBatches()
  }

  const handleSold = async (batch: ExpiryBatch) => {
    if (!batch.id) return
    await markAsSold(batch.id, batch.qtyRemaining)
    await loadBatches()
  }

  const handleClaim = async (batch: ExpiryBatch) => {
    if (!batch.id) return
    // First log as waste (claimable), then mark as claimed
    await markAsWaste(batch.id, batch.qtyRemaining, 'expired', 0, 0, true)
    await markAsClaimed(batch.id)
    await loadBatches()
  }

  const handleMarkdown = async (batch: ExpiryBatch, percent: number) => {
    if (!batch.id) return
    // Markdown is informational — user applies in POS. Log to quickActionLog for tracking.
    await db.quickActionLog.add({
      actionType: 'price-change',
      barcode: batch.barcode,
      productName: batch.productName,
      details: { markdownPercent: percent, reason: 'expiry_markdown', expiryDate: batch.expiryDate },
      syncStatus: 'pending',
      performedAt: new Date().toISOString(),
    })
  }

  const urgencyBar = (expiryDate: string) => {
    const u = getExpiryUrgency(expiryDate)
    const colors = { expired: 'bg-red-500', red: 'bg-red-400', amber: 'bg-amber-400', green: 'bg-emerald-400' }
    return colors[u]
  }

  const daysLabel = (expiryDate: string) => {
    const d = daysUntilExpiry(expiryDate)
    if (d < 0) return <span className="text-red-600 font-bold text-xs">EXPIRED {Math.abs(d)}d ago</span>
    if (d === 0) return <span className="text-red-600 font-bold text-xs">EXPIRES TODAY</span>
    return <span className={`font-semibold text-xs ${d <= 3 ? 'text-red-500' : d <= 7 ? 'text-amber-500' : 'text-gray-500'}`}>{d}d left</span>
  }

  const markdownSuggestion = (expiryDate: string) => {
    const d = daysUntilExpiry(expiryDate)
    if (d <= 1) return '50%'
    if (d <= 2) return '30%'
    if (d <= 3) return '20%'
    return null
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading expiry data...</div>
  }

  return (
    <div className="space-y-5">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard label="Expired Now" value={counts.expired} accentColor="#ef4444" valueColor="text-red-600" />
        <KpiCard label="< 3 Days" value={counts.red} accentColor="#f59e0b" valueColor="text-amber-600" />
        <KpiCard label="3-7 Days" value={counts.amber} accentColor="#3b82f6" valueColor="text-blue-600" />
        <KpiCard label="Claimable Value" value={`$${claimableValue.toFixed(0)}`} accentColor="#10b981" valueColor="text-emerald-600" />
        <KpiCard label="Waste MTD" value={`$${wasteMTD.toFixed(0)}`} accentColor="#6b7280" />
      </div>

      {/* Main content: batch list + risk panel */}
      <div className="flex flex-col lg:flex-row gap-5">
        {/* Batch list (70%) */}
        <div className="lg:w-[70%] space-y-3">
          {/* Filter tabs */}
          <div className="flex gap-2">
            {([['critical', `Critical (${counts.expired + counts.red})`], ['warning', `Warning (${counts.amber})`], ['all', `All (${batches.length})`]] as [FilterTab, string][]).map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filter === tab ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Batch rows */}
          <div className="space-y-2">
            {filtered.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
                <CheckCircle size={32} className="mx-auto mb-2 text-emerald-400" />
                No batches in this category
              </div>
            )}
            {filtered.map(batch => {
              const md = markdownSuggestion(batch.expiryDate)
              return (
                <div key={batch.id} className="bg-white rounded-xl border border-gray-100 flex items-stretch overflow-hidden hover:shadow-sm transition-shadow">
                  {/* Urgency bar */}
                  <div className={`w-2 shrink-0 ${urgencyBar(batch.expiryDate)}`} />

                  {/* Info */}
                  <div className="flex-1 px-4 py-3 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 truncate">{batch.productName}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">{batch.department}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500">
                      <span>{batch.barcode}</span>
                      <span>Qty: {batch.qtyRemaining}/{batch.qtyReceived}</span>
                      <span>Exp: {batch.expiryDate}</span>
                    </div>
                  </div>

                  {/* Days + actions */}
                  <div className="flex items-center gap-2 px-4 shrink-0">
                    {daysLabel(batch.expiryDate)}
                    {md && (
                      <button
                        onClick={() => handleMarkdown(batch, parseInt(md))}
                        title={`Markdown ${md}`}
                        className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold hover:bg-amber-200 transition-colors"
                      >
                        <Tag size={10} className="inline mr-0.5" />{md}
                      </button>
                    )}
                    <button onClick={() => handleWaste(batch)} title="Log Waste" className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 size={15} />
                    </button>
                    <button onClick={() => handleSold(batch)} title="Mark Sold" className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-50 hover:text-emerald-600">
                      <ShoppingCart size={15} />
                    </button>
                    <button onClick={() => handleClaim(batch)} title="Claim" className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-50 hover:text-blue-600">
                      <Shield size={15} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Risk panel (30%) */}
        <div className="lg:w-[30%]">
          <ExpiryRiskPanel batches={batches} />
        </div>
      </div>
    </div>
  )
}
