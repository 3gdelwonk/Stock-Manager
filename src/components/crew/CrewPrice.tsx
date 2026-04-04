import { useState, useCallback } from 'react'
import { ScanBarcode, Check, AlertCircle, Send, Tag } from 'lucide-react'
import { searchItems, changeAndSend, updateBackOfficePrice, printLabel } from '../../lib/jarvis'
import { db } from '../../lib/db'
import { PRICE_CHANGE_REASONS } from '../../lib/constants'
import type { TrackedItem } from '../../lib/types'
import BarcodeScanner from '../BarcodeScanner'
import ProductImage from '../ProductImage'

interface PriceProduct {
  itemCode: string
  barcode: string
  description: string
  department: string
  sellPrice: number
}

export default function CrewPrice() {
  const [scannerOpen, setScannerOpen] = useState(false)
  const [product, setProduct] = useState<PriceProduct | null>(null)
  const [newPrice, setNewPrice] = useState('')
  const [reason, setReason] = useState<TrackedItem['reason']>('other')
  const [notes, setNotes] = useState('')
  const [sendToPos, setSendToPos] = useState(true)
  const [doPrintLabel, setDoPrintLabel] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)

  const lookupBarcode = useCallback(async (code: string) => {
    const trimmed = code.trim()
    if (!trimmed) return
    setLoading(true)
    setResult(null)
    setProduct(null)
    setNewPrice('')
    setNotes('')
    try {
      const res = await searchItems(trimmed, 1)
      if (res.items?.length > 0) {
        const item = res.items[0]
        setProduct({
          itemCode: item.itemCode,
          barcode: item.barcode || trimmed,
          description: item.description,
          department: item.department,
          sellPrice: item.sellPrice,
        })
      } else {
        setResult({ kind: 'error', msg: 'Product not found' })
      }
    } catch {
      setResult({ kind: 'error', msg: 'Search failed — check connection' })
    } finally {
      setLoading(false)
    }
  }, [])

  function handleScan(code: string) {
    setScannerOpen(false)
    lookupBarcode(code)
  }

  async function handleConfirm() {
    if (!product) return
    const price = parseFloat(newPrice)
    if (isNaN(price) || price <= 0) return

    setSubmitting(true)
    setResult(null)

    // Track in DB
    const now = new Date()
    const trackedId = await db.trackedItems.add({
      itemCode: product.itemCode,
      barcode: product.barcode,
      description: product.description,
      department: product.department,
      originalPrice: product.sellPrice,
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
      const effectiveBarcode = product.barcode || product.itemCode
      if (sendToPos) {
        await changeAndSend(effectiveBarcode, price, reason)
      } else {
        await updateBackOfficePrice(effectiveBarcode, price)
      }

      if (doPrintLabel) {
        try { await printLabel(effectiveBarcode) } catch { /* best-effort */ }
      }

      await db.trackedItems.update(trackedId, {
        syncStatus: 'synced',
        status: 'confirmed',
        currentPrice: price,
      })

      const msg = sendToPos
        ? 'Price updated + sent to registers'
        : 'Price updated (back-office only)'
      setResult({ kind: 'success', msg: doPrintLabel ? `${msg} · Label queued` : msg })
      setTimeout(() => { setProduct(null); setResult(null) }, 2500)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      await db.trackedItems.update(trackedId, {
        syncStatus: 'error',
        status: 'failed',
        syncError: msg,
      })
      setResult({ kind: 'error', msg })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {/* Scan prompt */}
        {!product && !loading && (
          <div className="text-center space-y-4 pt-8">
            <button
              onClick={() => setScannerOpen(true)}
              className="mx-auto w-24 h-24 rounded-2xl bg-emerald-50 flex items-center justify-center hover:bg-emerald-100 transition-colors"
            >
              <ScanBarcode size={40} className="text-emerald-500" />
            </button>
            <div>
              <p className="text-sm font-medium text-gray-700">Scan barcode to change price</p>
              <p className="text-xs text-gray-400 mt-1">Point camera at product barcode</p>
            </div>
          </div>
        )}

        {loading && (
          <p className="text-sm text-gray-400 text-center py-8 animate-pulse">Looking up product...</p>
        )}

        {/* Product + price form */}
        {product && (
          <div className="space-y-4">
            {/* Product header */}
            <div className="flex items-start gap-3">
              <ProductImage
                itemCode={product.itemCode}
                description={product.description}
                department={product.department}
                barcode={product.barcode}
                size={56}
                className="rounded-xl"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 leading-tight">{product.description}</p>
                <span className="inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                  {product.department}
                </span>
              </div>
            </div>

            {/* Current price */}
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Current Price</label>
              <div className="bg-gray-100 rounded-lg px-3 py-2 text-sm font-mono text-gray-600">
                ${product.sellPrice.toFixed(2)}
              </div>
            </div>

            {/* New price */}
            <div className="space-y-1">
              <label className="text-xs text-gray-500">New Price</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                autoFocus
                value={newPrice}
                onChange={e => setNewPrice(e.target.value)}
                placeholder="0.00"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
            </div>

            {/* Reason */}
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Reason</label>
              <select
                value={reason}
                onChange={e => setReason(e.target.value as TrackedItem['reason'])}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
              >
                {PRICE_CHANGE_REASONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Notes (optional)</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Add a note..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
            </div>

            {/* Toggles */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendToPos}
                  onChange={e => setSendToPos(e.target.checked)}
                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <Send size={14} className="text-gray-400" />
                Send to POS registers
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={doPrintLabel}
                  onChange={e => setDoPrintLabel(e.target.checked)}
                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <Tag size={14} className="text-gray-400" />
                Print shelf label
              </label>
            </div>

            {/* Confirm */}
            <button
              onClick={handleConfirm}
              disabled={submitting || !newPrice || parseFloat(newPrice) <= 0}
              className="w-full py-3 bg-emerald-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors hover:bg-emerald-700"
            >
              {submitting ? 'Updating...' : 'Confirm Price Change'}
            </button>

            <p className="text-[11px] text-gray-400 text-center">
              {sendToPos ? 'Updates sell price and pushes to all registers' : 'Updates back-office price only'}
            </p>

            {/* Scan another */}
            <button
              onClick={() => { setProduct(null); setResult(null); setScannerOpen(true) }}
              className="w-full text-xs text-emerald-600 font-medium py-1"
            >
              Scan another product
            </button>
          </div>
        )}

        {/* Result message */}
        {result && (
          <div className={`mt-4 flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
            result.kind === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {result.kind === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
            <span>{result.msg}</span>
          </div>
        )}
      </div>

      <BarcodeScanner open={scannerOpen} onScan={handleScan} onClose={() => setScannerOpen(false)} />
    </div>
  )
}
