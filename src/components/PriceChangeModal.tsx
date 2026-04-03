import { useState } from 'react'
import { X, Check, AlertCircle } from 'lucide-react'
import { putPrice } from '../lib/jarvis'
import { db } from '../lib/db'
import { PRICE_CHANGE_REASONS } from '../lib/constants'
import type { TrackedItem } from '../lib/types'

interface PriceChangeModalProps {
  open: boolean
  itemCode: string
  barcode: string | null
  description: string
  department: string
  currentPrice: number
  onClose: () => void
  onSuccess?: () => void
}

export default function PriceChangeModal({
  open,
  itemCode,
  barcode,
  description,
  department,
  currentPrice,
  onClose,
  onSuccess,
}: PriceChangeModalProps) {
  const [newPrice, setNewPrice] = useState('')
  const [reason, setReason] = useState<TrackedItem['reason']>('other')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<'success' | 'error' | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  if (!open) return null

  async function handleConfirm() {
    const price = parseFloat(newPrice)
    if (isNaN(price) || price <= 0) return

    setSubmitting(true)
    setResult(null)
    setErrorMsg('')

    // 1. Create TrackedItem with syncStatus: 'syncing'
    const now = new Date()
    const trackedId = await db.trackedItems.add({
      itemCode,
      barcode,
      description,
      department,
      originalPrice: currentPrice,
      newPrice: price,
      changeDate: now.toISOString().slice(0, 10),
      reason,
      notes,
      status: 'pending',
      syncStatus: 'syncing',
      currentPrice: null,
      revertedAt: null,
      createdAt: now,
    })

    try {
      // 2. Call putPrice
      await putPrice(itemCode, { newPrice: price, reason })

      // 3. On success: update TrackedItem
      await db.trackedItems.update(trackedId, {
        syncStatus: 'synced',
        status: 'confirmed',
        currentPrice: price,
      })

      setResult('success')

      // 6. Close after 1 second on success
      setTimeout(() => {
        setNewPrice('')
        setNotes('')
        setReason('other')
        setResult(null)
        onSuccess?.()
        onClose()
      }, 1000)
    } catch (err) {
      // 4. On failure: update TrackedItem
      const msg = err instanceof Error ? err.message : 'Unknown error'
      await db.trackedItems.update(trackedId, {
        syncStatus: 'error',
        status: 'failed',
        syncError: msg,
      })

      setResult('error')
      setErrorMsg(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl p-6 space-y-4 pb-safe max-h-[85vh] overflow-y-auto">
        {/* 1. Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Change Price</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* 2. Product name + department badge */}
        <div>
          <p className="text-sm font-medium text-gray-900">{description}</p>
          <span className="inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
            {department}
          </span>
        </div>

        {/* 3. Current Price (read-only) */}
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Current Price</label>
          <div className="bg-gray-100 rounded-lg px-3 py-2 text-sm font-mono text-gray-600">
            ${currentPrice.toFixed(2)}
          </div>
        </div>

        {/* 4. New Price input */}
        <div className="space-y-1">
          <label className="text-xs text-gray-500">New Price</label>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            autoFocus
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            placeholder="0.00"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-300"
          />
        </div>

        {/* 5. Reason dropdown */}
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Reason</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as TrackedItem['reason'])}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
          >
            {PRICE_CHANGE_REASONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        {/* 6. Notes input */}
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add a note..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
          />
        </div>

        {/* 5. Success/error inline message */}
        {result === 'success' && (
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-sm">
            <Check size={16} />
            <span>Price updated successfully</span>
          </div>
        )}
        {result === 'error' && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-700 rounded-lg text-sm">
            <AlertCircle size={16} />
            <span>{errorMsg || 'Failed to update price'}</span>
          </div>
        )}

        {/* 7. Confirm button */}
        <button
          onClick={handleConfirm}
          disabled={submitting || !newPrice || parseFloat(newPrice) <= 0 || result === 'success'}
          className="w-full py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors hover:bg-emerald-700"
        >
          {submitting ? 'Updating...' : 'Confirm Price Change'}
        </button>

        {/* 8. Disclaimer */}
        <p className="text-[11px] text-gray-400 text-center">
          This will update the POS sell price via JARVISmart
        </p>
      </div>
    </div>
  )
}
