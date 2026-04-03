import { useState, useMemo, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Search, ScanBarcode, AlertTriangle, Clock, Trash2, ShoppingCart, CalendarPlus, X, Check, Printer } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { db } from '../lib/db'
import { getExpiryUrgency, daysUntilExpiry, markAsWaste, markAsSold, extendExpiry, addExpiryBatch, type ExpiryUrgency } from '../lib/expiry'
import { adjustStock, printLabel } from '../lib/jarvis'
import type { ExpiryBatch, WasteLogEntry } from '../lib/types'
import BarcodeScanner from './BarcodeScanner'
import { DEPARTMENT_COLORS } from '../lib/constants'
import { DEPARTMENT_LABELS, DEPARTMENT_ORDER } from '../lib/constants'

// ─── Sub-tab type ────────────────────────────────────────────────────────────
type SubTab = 'upcoming' | 'all' | 'waste' | 'claims'

// ─── Inline action type ──────────────────────────────────────────────────────
type InlineAction = { batchId: number; action: 'sold' | 'waste' | 'extend' } | null

// ─── Urgency badge component ─────────────────────────────────────────────────
function UrgencyBadge({ urgency, days }: { urgency: ExpiryUrgency; days: number }) {
  const styles: Record<ExpiryUrgency, string> = {
    expired: 'bg-red-700 text-white',
    red:     'bg-red-100 text-red-700',
    amber:   'bg-amber-100 text-amber-700',
    green:   'bg-green-100 text-green-700',
  }
  const label = urgency === 'expired'
    ? 'EXPIRED'
    : `${Math.abs(days)} DAY${Math.abs(days) !== 1 ? 'S' : ''}`
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${styles[urgency]}`}>
      {label}
    </span>
  )
}

// ─── Status badge for All tab ────────────────────────────────────────────────
function StatusBadge({ status }: { status: ExpiryBatch['status'] }) {
  const map: Record<ExpiryBatch['status'], string> = {
    active:   'bg-emerald-100 text-emerald-700',
    sold:     'bg-blue-100 text-blue-700',
    wasted:   'bg-red-100 text-red-700',
    claimed:  'bg-violet-100 text-violet-700',
    extended: 'bg-amber-100 text-amber-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${map[status]}`}>
      {status}
    </span>
  )
}

// ─── Claim status badge ──────────────────────────────────────────────────────
function ClaimStatusBadge({ status }: { status: WasteLogEntry['claimStatus'] }) {
  const map: Record<WasteLogEntry['claimStatus'], string> = {
    none:      'bg-gray-100 text-gray-500',
    pending:   'bg-amber-100 text-amber-700',
    submitted: 'bg-blue-100 text-blue-700',
    approved:  'bg-green-100 text-green-700',
    rejected:  'bg-red-100 text-red-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${map[status]}`}>
      {status}
    </span>
  )
}

// ─── Reason badge ────────────────────────────────────────────────────────────
function ReasonBadge({ reason }: { reason: WasteLogEntry['reason'] }) {
  const map: Record<WasteLogEntry['reason'], string> = {
    expired:  'bg-red-100 text-red-700',
    damaged:  'bg-orange-100 text-orange-700',
    quality:  'bg-amber-100 text-amber-700',
    recall:   'bg-purple-100 text-purple-700',
    other:    'bg-gray-100 text-gray-600',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${map[reason]}`}>
      {reason}
    </span>
  )
}

// ─── Format currency ─────────────────────────────────────────────────────────
function fmt(n: number) {
  return `$${n.toFixed(2)}`
}

// ─── Format date ─────────────────────────────────────────────────────────────
function fmtDate(d: string | Date) {
  const date = typeof d === 'string' ? new Date(d + (typeof d === 'string' && !d.includes('T') ? 'T00:00:00' : '')) : d
  return date.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function ExpiryView() {
  const [subTab, setSubTab] = useState<SubTab>('upcoming')
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState<string | null>(null)
  const [inlineAction, setInlineAction] = useState<InlineAction>(null)
  const [showAddSheet, setShowAddSheet] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)

  // ─── Reactive queries ────────────────────────────────────────────────────
  const allBatches = useLiveQuery(() => db.expiryBatches.toArray(), [])
  const wasteLog = useLiveQuery(() => db.wasteLog.orderBy('loggedAt').reverse().toArray(), [])

  // ─── Filtered batches for Upcoming tab ───────────────────────────────────
  const upcomingBatches = useMemo(() => {
    if (!allBatches) return []
    let list = allBatches.filter(b => b.status === 'active')
    if (deptFilter) list = list.filter(b => b.department === deptFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(b =>
        b.productName.toLowerCase().includes(q) || b.barcode.includes(q),
      )
    }
    return list.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
  }, [allBatches, deptFilter, search])

  // ─── All batches (filtered) ──────────────────────────────────────────────
  const filteredAll = useMemo(() => {
    if (!allBatches) return []
    let list = [...allBatches]
    if (deptFilter) list = list.filter(b => b.department === deptFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(b =>
        b.productName.toLowerCase().includes(q) || b.barcode.includes(q),
      )
    }
    return list.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
  }, [allBatches, deptFilter, search])

  // ─── Claimable entries ───────────────────────────────────────────────────
  const claimableEntries = useMemo(() => {
    if (!wasteLog) return []
    return wasteLog.filter(w => w.claimable)
  }, [wasteLog])

  // ─── Departments present ─────────────────────────────────────────────────
  const departments = useMemo(() => {
    if (!allBatches) return []
    const set = new Set(allBatches.map(b => b.department))
    return DEPARTMENT_ORDER.filter(d => set.has(d))
  }, [allBatches])

  // ─── Toggle inline action ───────────────────────────────────────────────
  const toggleAction = useCallback((batchId: number, action: 'sold' | 'waste' | 'extend') => {
    setInlineAction(prev =>
      prev && prev.batchId === batchId && prev.action === action ? null : { batchId, action },
    )
  }, [])

  // ─── Sub-tab bar ─────────────────────────────────────────────────────────
  const tabs: { key: SubTab; label: string }[] = [
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'all', label: 'All' },
    { key: 'waste', label: 'Waste' },
    { key: 'claims', label: 'Claims' },
  ]

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Sub-tab bar */}
      <div className="flex border-b border-gray-200 bg-white shrink-0">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              subTab === t.key
                ? 'text-emerald-600 border-b-2 border-emerald-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search + department filter (Upcoming & All tabs) */}
      {(subTab === 'upcoming' || subTab === 'all') && (
        <div className="bg-white px-4 pt-3 pb-2 space-y-2 border-b border-gray-100 shrink-0">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search product name or barcode..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>
          {departments.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
              <button
                onClick={() => setDeptFilter(null)}
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  !deptFilter ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              {departments.map(d => (
                <button
                  key={d}
                  onClick={() => setDeptFilter(deptFilter === d ? null : d)}
                  className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    deptFilter === d ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {DEPARTMENT_LABELS[d] ?? d}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-y-auto pb-20">
        {subTab === 'upcoming' && <UpcomingList batches={upcomingBatches} inlineAction={inlineAction} toggleAction={toggleAction} />}
        {subTab === 'all' && <AllList batches={filteredAll} inlineAction={inlineAction} toggleAction={toggleAction} />}
        {subTab === 'waste' && <WasteTab entries={wasteLog ?? []} />}
        {subTab === 'claims' && <ClaimsTab entries={claimableEntries} />}
      </div>

      {/* FAB - Add Batch */}
      <button
        onClick={() => setShowAddSheet(true)}
        className="fixed bottom-20 right-4 z-30 w-14 h-14 rounded-full bg-emerald-600 text-white shadow-lg flex items-center justify-center hover:bg-emerald-700 active:scale-95 transition-all"
      >
        <Plus size={24} />
      </button>

      {/* Add Batch bottom sheet */}
      {showAddSheet && <AddBatchSheet onClose={() => setShowAddSheet(false)} />}

      {/* Barcode scanner */}
      <BarcodeScanner open={scannerOpen} onScan={() => {}} onClose={() => setScannerOpen(false)} />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Upcoming List ───────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function UpcomingList({
  batches,
  inlineAction,
  toggleAction,
}: {
  batches: ExpiryBatch[]
  inlineAction: InlineAction
  toggleAction: (id: number, action: 'sold' | 'waste' | 'extend') => void
}) {
  if (batches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Clock size={48} strokeWidth={1.5} />
        <p className="mt-3 text-sm">No upcoming expiry batches</p>
        <p className="text-xs mt-1">Tap + to add one</p>
      </div>
    )
  }
  return (
    <div className="p-4 space-y-3">
      {batches.map(b => (
        <BatchCard
          key={b.id}
          batch={b}
          showStatus={false}
          inlineAction={inlineAction}
          toggleAction={toggleAction}
        />
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── All List ────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function AllList({
  batches,
  inlineAction,
  toggleAction,
}: {
  batches: ExpiryBatch[]
  inlineAction: InlineAction
  toggleAction: (id: number, action: 'sold' | 'waste' | 'extend') => void
}) {
  if (batches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <AlertTriangle size={48} strokeWidth={1.5} />
        <p className="mt-3 text-sm">No batches found</p>
      </div>
    )
  }
  return (
    <div className="p-4 space-y-3">
      {batches.map(b => (
        <BatchCard
          key={b.id}
          batch={b}
          showStatus={true}
          inlineAction={inlineAction}
          toggleAction={toggleAction}
        />
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Batch Card ──────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function BatchCard({
  batch,
  showStatus,
  inlineAction,
  toggleAction,
}: {
  batch: ExpiryBatch
  showStatus: boolean
  inlineAction: InlineAction
  toggleAction: (id: number, action: 'sold' | 'waste' | 'extend') => void
}) {
  const urgency = getExpiryUrgency(batch.expiryDate)
  const days = daysUntilExpiry(batch.expiryDate)
  const isActive = batch.status === 'active'
  const expanded = inlineAction && inlineAction.batchId === batch.id ? inlineAction : null

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-4">
        {/* Top row: urgency + expiry label */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <UrgencyBadge urgency={urgency} days={days} />
            {showStatus && <StatusBadge status={batch.status} />}
          </div>
          <span className="text-xs text-gray-500">
            {urgency === 'expired'
              ? `Expired ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} ago`
              : `Expires in ${days} day${days !== 1 ? 's' : ''}`}
          </span>
        </div>

        {/* Product name */}
        <h3 className="font-semibold text-gray-900 text-sm leading-snug">{batch.productName}</h3>

        {/* Department + location */}
        <p className="text-xs text-gray-500 mt-0.5">
          {DEPARTMENT_LABELS[batch.department as keyof typeof DEPARTMENT_LABELS] ?? batch.department}
          {batch.location && <> &middot; {batch.location}</>}
        </p>

        {/* Remaining / received */}
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-gray-600">
            Remaining: <span className="font-semibold">{batch.qtyRemaining}</span> of {batch.qtyReceived}
          </p>
          <p className="text-xs text-gray-500">Expiry: {fmtDate(batch.expiryDate)}</p>
        </div>

        {/* Progress bar */}
        <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, (batch.qtyRemaining / Math.max(1, batch.qtyReceived)) * 100)}%`,
              backgroundColor: urgency === 'expired' || urgency === 'red' ? '#dc2626' : urgency === 'amber' ? '#d97706' : '#059669',
            }}
          />
        </div>

        {/* Action buttons */}
        {isActive && (
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => toggleAction(batch.id!, 'sold')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                expanded?.action === 'sold'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <ShoppingCart size={13} /> Sold
            </button>
            <button
              onClick={() => toggleAction(batch.id!, 'waste')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                expanded?.action === 'waste'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Trash2 size={13} /> Waste
            </button>
            <button
              onClick={() => toggleAction(batch.id!, 'extend')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                expanded?.action === 'extend'
                  ? 'bg-amber-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <CalendarPlus size={13} /> Extend
            </button>
            <button
              onClick={() => printLabel(batch.barcode).catch(() => {})}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              <Printer size={13} /> Label
            </button>
          </div>
        )}
      </div>

      {/* Inline action forms */}
      {expanded?.action === 'sold' && <SoldForm batchId={batch.id!} maxQty={batch.qtyRemaining} onDone={() => toggleAction(batch.id!, 'sold')} />}
      {expanded?.action === 'waste' && <WasteForm batch={batch} onDone={() => toggleAction(batch.id!, 'waste')} />}
      {expanded?.action === 'extend' && <ExtendForm batchId={batch.id!} currentDate={batch.expiryDate} onDone={() => toggleAction(batch.id!, 'extend')} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Inline: Sold Form ───────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function SoldForm({ batchId, maxQty, onDone }: { batchId: number; maxQty: number; onDone: () => void }) {
  const [qty, setQty] = useState(1)
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (qty < 1 || qty > maxQty) return
    setSaving(true)
    try {
      await markAsSold(batchId, qty)
      onDone()
    } catch (e) {
      console.error('Failed to mark sold:', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 pb-4 pt-2 bg-emerald-50 border-t border-emerald-100">
      <p className="text-xs font-medium text-emerald-800 mb-2">Mark as Sold</p>
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-600">Qty:</label>
        <input
          type="number"
          min={1}
          max={maxQty}
          value={qty}
          onChange={e => setQty(Math.max(1, Math.min(maxQty, parseInt(e.target.value) || 1)))}
          className="w-20 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <span className="text-xs text-gray-400">of {maxQty}</span>
        <div className="flex-1" />
        <button
          onClick={onDone}
          className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1"
        >
          <Check size={13} /> Confirm
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Inline: Waste Form ──────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function WasteForm({ batch, onDone }: { batch: ExpiryBatch; onDone: () => void }) {
  const [qty, setQty] = useState(batch.qtyRemaining)
  const [reason, setReason] = useState<WasteLogEntry['reason']>('expired')
  const [claimable, setClaimable] = useState(false)
  const [saving, setSaving] = useState(false)

  // Look up product costPrice/sellPrice from db
  const product = useLiveQuery(
    () => db.products.where('barcode').equals(batch.barcode).first(),
    [batch.barcode],
  )

  async function handleSubmit() {
    if (qty < 1 || qty > batch.qtyRemaining) return
    setSaving(true)
    try {
      const costPrice = product?.costPrice ?? 0
      const sellPrice = product?.sellPrice ?? 0
      await markAsWaste(batch.id!, qty, reason, costPrice, sellPrice, claimable)
      // Also adjust POS stock (best-effort, don't block on failure)
      adjustStock(batch.barcode, -qty, 'waste').catch(() => {})
      onDone()
    } catch (e) {
      console.error('Failed to mark waste:', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 pb-4 pt-2 bg-red-50 border-t border-red-100">
      <p className="text-xs font-medium text-red-800 mb-2">Mark as Waste</p>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600 w-14">Qty:</label>
          <input
            type="number"
            min={1}
            max={batch.qtyRemaining}
            value={qty}
            onChange={e => setQty(Math.max(1, Math.min(batch.qtyRemaining, parseInt(e.target.value) || 1)))}
            className="w-20 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <span className="text-xs text-gray-400">of {batch.qtyRemaining}</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600 w-14">Reason:</label>
          <select
            value={reason}
            onChange={e => setReason(e.target.value as WasteLogEntry['reason'])}
            className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
          >
            <option value="expired">Expired</option>
            <option value="damaged">Damaged</option>
            <option value="quality">Quality Issue</option>
            <option value="recall">Recall</option>
            <option value="other">Other</option>
          </select>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={claimable}
            onChange={e => setClaimable(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-xs text-gray-700">Claimable (supplier credit)</span>
        </label>
        <div className="flex items-center gap-2 pt-1">
          <div className="flex-1" />
          <button
            onClick={onDone}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
          >
            <Trash2 size={13} /> Log Waste
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Inline: Extend Form ─────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function ExtendForm({ batchId, currentDate, onDone }: { batchId: number; currentDate: string; onDone: () => void }) {
  const [newDate, setNewDate] = useState(currentDate)
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (!newDate || newDate <= currentDate) return
    setSaving(true)
    try {
      await extendExpiry(batchId, newDate)
      onDone()
    } catch (e) {
      console.error('Failed to extend expiry:', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 pb-4 pt-2 bg-amber-50 border-t border-amber-100">
      <p className="text-xs font-medium text-amber-800 mb-2">Extend Expiry Date</p>
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-600">New date:</label>
        <input
          type="date"
          value={newDate}
          min={currentDate}
          onChange={e => setNewDate(e.target.value)}
          className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
        <div className="flex-1" />
        <button
          onClick={onDone}
          className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving || !newDate || newDate <= currentDate}
          className="px-3 py-1.5 text-xs font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1"
        >
          <CalendarPlus size={13} /> Extend
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Waste Tab ───────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function WasteTab({ entries }: { entries: WasteLogEntry[] }) {
  // Monthly summary data for chart
  const { chartData, totalItems, totalCost, claimableAmount } = useMemo(() => {
    const byDept: Record<string, number> = {}
    let items = 0
    let cost = 0
    let claim = 0

    for (const e of entries) {
      const val = e.qty * e.costPrice
      const label = DEPARTMENT_LABELS[e.department as keyof typeof DEPARTMENT_LABELS] ?? e.department
      byDept[label] = (byDept[label] || 0) + val
      items += e.qty
      cost += val
      if (e.claimable) claim += val
    }

    const chartData = Object.entries(byDept)
      .map(([dept, value]) => ({
        dept,
        value: parseFloat(value.toFixed(2)),
        fill: DEPARTMENT_COLORS[
          Object.entries(DEPARTMENT_LABELS).find(([, v]) => v === dept)?.[0] as keyof typeof DEPARTMENT_COLORS
        ] ?? '#6b7280',
      }))
      .sort((a, b) => b.value - a.value)

    return { chartData, totalItems: items, totalCost: cost, claimableAmount: claim }
  }, [entries])

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Trash2 size={48} strokeWidth={1.5} />
        <p className="mt-3 text-sm">No waste recorded yet</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
          <p className="text-xs text-gray-500">Total Items</p>
          <p className="text-lg font-bold text-gray-900">{totalItems}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
          <p className="text-xs text-gray-500">Total Cost</p>
          <p className="text-lg font-bold text-red-600">{fmt(totalCost)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
          <p className="text-xs text-gray-500">Claimable</p>
          <p className="text-lg font-bold text-emerald-600">{fmt(claimableAmount)}</p>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Waste by Department</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 16 }}>
              <XAxis type="number" tickFormatter={v => `$${v}`} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="dept" width={90} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, i) => (
                  <rect key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Waste entries list */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-800">Waste Log</h3>
        {entries.map(e => (
          <div key={e.id} className="bg-white rounded-xl border border-gray-200 p-3">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{e.productName}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Qty: {e.qty} &middot; Cost: {fmt(e.qty * e.costPrice)}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <ReasonBadge reason={e.reason} />
                {e.claimable && <ClaimStatusBadge status={e.claimStatus} />}
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {e.loggedAt instanceof Date ? fmtDate(e.loggedAt.toISOString().split('T')[0]) : fmtDate(String(e.loggedAt))}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Claims Tab ──────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function ClaimsTab({ entries }: { entries: WasteLogEntry[] }) {
  const totalClaimable = useMemo(
    () => entries.reduce((s, e) => s + e.qty * e.costPrice, 0),
    [entries],
  )

  const toggleClaimStatus = useCallback(async (entry: WasteLogEntry) => {
    if (!entry.id) return
    const order: WasteLogEntry['claimStatus'][] = ['pending', 'submitted', 'approved', 'rejected']
    const idx = order.indexOf(entry.claimStatus)
    const next = order[(idx + 1) % order.length]
    await db.wasteLog.update(entry.id, { claimStatus: next })
  }, [])

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <AlertTriangle size={48} strokeWidth={1.5} />
        <p className="mt-3 text-sm">No claimable waste entries</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Total claimable */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
        <p className="text-xs text-emerald-700 font-medium">Total Claimable Amount</p>
        <p className="text-2xl font-bold text-emerald-700 mt-1">{fmt(totalClaimable)}</p>
        <p className="text-xs text-emerald-600 mt-0.5">{entries.length} claimable {entries.length === 1 ? 'entry' : 'entries'}</p>
      </div>

      {/* Entries */}
      <div className="space-y-2">
        {entries.map(e => (
          <button
            key={e.id}
            onClick={() => toggleClaimStatus(e)}
            className="w-full bg-white rounded-xl border border-gray-200 p-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{e.productName}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Qty: {e.qty} &middot; Value: {fmt(e.qty * e.costPrice)}
                </p>
              </div>
              <div className="shrink-0 ml-2">
                <ClaimStatusBadge status={e.claimStatus} />
              </div>
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-xs text-gray-400">
                {e.loggedAt instanceof Date ? fmtDate(e.loggedAt.toISOString().split('T')[0]) : fmtDate(String(e.loggedAt))}
              </p>
              <p className="text-xs text-gray-400">Tap to change status</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Add Batch Bottom Sheet ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function AddBatchSheet({ onClose }: { onClose: () => void }) {
  const [scannerOpen, setScannerOpen] = useState(false)
  const [barcodeInput, setBarcodeInput] = useState('')
  const [productName, setProductName] = useState('')
  const [department, setDepartment] = useState('')
  const [location, setLocation] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [qtyReceived, setQtyReceived] = useState(1)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [lookupDone, setLookupDone] = useState(false)

  const lookupProduct = useCallback(async (barcode: string) => {
    const trimmed = barcode.trim()
    if (!trimmed) return
    setBarcodeInput(trimmed)
    const product = await db.products.where('barcode').equals(trimmed).first()
    if (product) {
      setProductName(product.name)
      setDepartment(product.department)
      const locParts = [product.aisle, product.bay, product.shelf].filter(Boolean)
      setLocation(locParts.join(' / '))
    }
    setLookupDone(true)
  }, [])

  function handleScan(code: string) {
    setScannerOpen(false)
    lookupProduct(code)
  }

  async function handleAdd() {
    if (!productName.trim() || !expiryDate || qtyReceived < 1) return
    setSaving(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      await addExpiryBatch({
        barcode: barcodeInput.trim(),
        itemCode: '',
        productName: productName.trim(),
        department: department || 'other',
        expiryDate,
        qtyReceived,
        qtyRemaining: qtyReceived,
        status: 'active',
        location: location.trim() || undefined,
        receivedDate: today,
        notes: notes.trim() || undefined,
      })
      onClose()
    } catch (e) {
      console.error('Failed to add batch:', e)
    } finally {
      setSaving(false)
    }
  }

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
          <h2 className="text-base font-semibold text-gray-900">Add Expiry Batch</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Barcode lookup */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Barcode</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Scan or type barcode..."
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                onBlur={() => lookupProduct(barcodeInput)}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                onClick={() => setScannerOpen(true)}
                className="px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <ScanBarcode size={18} className="text-gray-600" />
              </button>
              <button
                onClick={() => lookupProduct(barcodeInput)}
                className="px-3 py-2 bg-emerald-100 rounded-lg hover:bg-emerald-200 transition-colors"
              >
                <Search size={18} className="text-emerald-700" />
              </button>
            </div>
            {lookupDone && !productName && (
              <p className="text-xs text-amber-600 mt-1">Product not found in database. Enter details manually.</p>
            )}
          </div>

          {/* Product name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Product Name</label>
            <input
              type="text"
              placeholder="Product name"
              value={productName}
              onChange={e => setProductName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Department */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Department</label>
            <select
              value={department}
              onChange={e => setDepartment(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              <option value="">Select department</option>
              {DEPARTMENT_ORDER.map(d => (
                <option key={d} value={d}>{DEPARTMENT_LABELS[d]}</option>
              ))}
            </select>
          </div>

          {/* Expiry date */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Expiry Date</label>
            <input
              type="date"
              value={expiryDate}
              onChange={e => setExpiryDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Quantity received */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Quantity Received</label>
            <input
              type="number"
              min={1}
              value={qtyReceived}
              onChange={e => setQtyReceived(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Location (auto-filled or manual) */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Location</label>
            <input
              type="text"
              placeholder="Aisle / Bay / Shelf"
              value={location}
              onChange={e => setLocation(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea
              placeholder="Optional notes..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>
        </div>

        {/* Submit button */}
        <div className="px-4 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={handleAdd}
            disabled={saving || !productName.trim() || !expiryDate || qtyReceived < 1}
            className="w-full py-3 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {saving ? (
              <span className="animate-pulse">Adding...</span>
            ) : (
              <>
                <Plus size={16} /> Add Batch
              </>
            )}
          </button>
        </div>
      </div>

      {/* Barcode scanner */}
      <BarcodeScanner open={scannerOpen} onScan={handleScan} onClose={() => setScannerOpen(false)} />
    </>
  )
}
