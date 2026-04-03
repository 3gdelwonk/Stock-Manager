import { useState } from 'react'
import { X, Check, AlertCircle, Send, Tag } from 'lucide-react'
import { changeAndSend, updateBackOfficePrice, printLabel } from '../lib/jarvis'
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
  prefillPrice?: number
  prefillReason?: TrackedItem['reason']
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
  prefillPrice,
  prefillReason,
  onClose,
  onSuccess,
}: PriceChangeModalProps) {
  const [newPrice, setNewPrice] = useState(prefillPrice ? prefillPrice.toFixed(2) : '')
  const [reason, setReason] = useState<TrackedItem['reason']>(prefillReason ?? 'other')
  const [notes, setNotes] = useState('')
  const [sendToPos, setSendToPos] = useState(true)
  const [doPrintLabel, setDoPrintLabel] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<'success' | 'error' | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

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
      // 2. Call changeAndSend (pushes to registers) or updateBackOfficePrice (back-office only)
      const effectiveBarcode = barcode || itemCode
      if (sendToPos) {
        await changeAndSend(effectiveBarcode, price, reason)
      } else {
        await updateBackOfficePrice(effectiveBarcode, price)
      }

      // 2b. Print label if requested
      if (doPrintLabel) {
        try {
          await printLabel(effectiveBarcode)
        } catch {
          // Non-fatal — price change succeeded, label print is best-effort
        }
      }

      // 3. On success: update TrackedItem
      await db.trackedItems.update(trackedId, {
        syncStatus: 'synced',
        status: 'confirmed',
        currentPrice: price,
      })

      const msg = sendToPos
        ? 'Price updated + sent to registers'
        : 'Price updated (back-office only)'
      setSuccessMsg(doPrintLabel ? `${msg} · Label queued` : msg)
      setResult('success')

      // 6. Close after 1.5 seconds on success
      setTimeout(() => {
        setNewPrice('')
        setNotes('')
        setReason('other')
        setResult(null)
        setSuccessMsg('')
        onSuccess?.()
        onClose()
      }, 1500)
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

        {/* POS & Label toggles */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={sendToPos}
              onChange={(e) => setSendToPos(e.target.checked)}
              className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            <Send size={14} className="text-gray-400" />
            Send to POS registers
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={doPrintLabel}
              onChange={(e) => setDoPrintLabel(e.target.checked)}
              className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            <Tag size={14} className="text-gray-400" />
            Print shelf label
          </label>
        </div>

        {/* 5. Success/error inline message */}
        {result === 'success' && (
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-sm">
            <Check size={16} />
            <span>{successMsg}</span>
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
          {sendToPos
            ? 'This will update the sell price and push to all registers'
            : 'This will update the back-office price only'}
        </p>
      </div>
    </div>
  )
}
