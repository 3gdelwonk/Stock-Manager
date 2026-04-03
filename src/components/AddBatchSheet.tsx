import { useState, useEffect, useCallback } from 'react'
import { ScanBarcode, Search, Plus, X } from 'lucide-react'
import { db } from '../lib/db'
import { addExpiryBatch } from '../lib/expiry'
import BarcodeScanner from './BarcodeScanner'
import { DEPARTMENT_ORDER, DEPARTMENT_LABELS } from '../lib/constants'

interface AddBatchSheetProps {
  open: boolean
  onClose: () => void
  initialBarcode?: string
  initialProductName?: string
  initialDepartment?: string
}

export default function AddBatchSheet({ open, onClose, initialBarcode, initialProductName, initialDepartment }: AddBatchSheetProps) {
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

  // Pre-fill from initial props
  useEffect(() => {
    if (initialBarcode !== undefined) setBarcodeInput(initialBarcode)
  }, [initialBarcode])

  useEffect(() => {
    if (initialProductName !== undefined) setProductName(initialProductName)
  }, [initialProductName])

  useEffect(() => {
    if (initialDepartment !== undefined) setDepartment(initialDepartment)
  }, [initialDepartment])

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

  if (!open) return null

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
