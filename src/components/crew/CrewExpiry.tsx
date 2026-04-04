import { useState, useCallback } from 'react'
import { ScanBarcode, Search, Plus, Check, X, Clock } from 'lucide-react'
import { db } from '../../lib/db'
import { addExpiryBatch } from '../../lib/expiry'
import { searchItems } from '../../lib/jarvis'
import { resolveBarcode } from '../../lib/barcodeResolver'
import BarcodeScanner from '../BarcodeScanner'
import { DEPARTMENT_ORDER, DEPARTMENT_LABELS } from '../../lib/constants'

export default function CrewExpiry() {
  const [scannerOpen, setScannerOpen] = useState(false)
  const [barcodeInput, setBarcodeInput] = useState('')
  const [productName, setProductName] = useState('')
  const [department, setDepartment] = useState('')
  const [location, setLocation] = useState('')
  const [entries, setEntries] = useState<{ date: string; qty: number }[]>([{ date: '', qty: 1 }])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [lookupDone, setLookupDone] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const lookupProduct = useCallback(async (barcode: string) => {
    const trimmed = barcode.trim()
    if (!trimmed) return
    setBarcodeInput(trimmed)
    const normalized = trimmed.replace(/[^0-9]/g, '')

    // 1. Try local Dexie DB
    let product = await db.products.where('barcode').equals(trimmed).first()
    if (!product && normalized !== trimmed) {
      product = await db.products.where('barcode').equals(normalized).first()
    }
    if (!product) {
      product = await db.products.where('itemCode').equals(trimmed).first()
      if (!product && normalized !== trimmed) {
        product = await db.products.where('itemCode').equals(normalized).first()
      }
    }

    if (product) {
      setProductName(product.name)
      setDepartment(product.department)
      const locParts = [product.aisle, product.bay, product.shelf].filter(Boolean)
      setLocation(locParts.join(' / '))
      setLookupDone(true)
      return
    }

    // 2. Try barcode alias resolver
    try {
      const resolved = await resolveBarcode(trimmed)
      if (resolved) {
        setProductName(resolved.description)
        setBarcodeInput(resolved.primaryBarcode || trimmed)
        setLookupDone(true)
        return
      }
    } catch { /* resolver unavailable */ }

    // 3. Direct API search fallback
    try {
      const result = await searchItems(trimmed, 1)
      if (result.items?.length > 0) {
        const item = result.items[0]
        setProductName(item.description)
        setDepartment(item.department)
        setBarcodeInput(item.barcode || trimmed)
        setLookupDone(true)
        return
      }
    } catch { /* fall through */ }

    setLookupDone(true)
  }, [])

  function handleScan(code: string) {
    setScannerOpen(false)
    lookupProduct(code)
  }

  function updateEntry(idx: number, field: 'date' | 'qty', value: string | number) {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e))
  }

  function addEntry() {
    if (entries.length < 2) setEntries(prev => [...prev, { date: '', qty: 1 }])
  }

  function removeEntry(idx: number) {
    if (entries.length > 1) setEntries(prev => prev.filter((_, i) => i !== idx))
  }

  const validEntries = entries.filter(e => e.date && e.qty >= 1)

  function resetForm() {
    setBarcodeInput('')
    setProductName('')
    setDepartment('')
    setLocation('')
    setEntries([{ date: '', qty: 1 }])
    setNotes('')
    setLookupDone(false)
  }

  async function handleAdd() {
    if (!productName.trim() || validEntries.length === 0) return
    setSaving(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      for (const entry of validEntries) {
        await addExpiryBatch({
          barcode: barcodeInput.trim(),
          itemCode: '',
          productName: productName.trim(),
          department: department || 'other',
          expiryDate: entry.date,
          qtyReceived: entry.qty,
          qtyRemaining: entry.qty,
          status: 'active',
          location: location.trim() || undefined,
          receivedDate: today,
          notes: notes.trim() || undefined,
        })
      }
      setSuccessMsg(`Added ${validEntries.length} batch${validEntries.length > 1 ? 'es' : ''}`)
      setTimeout(() => { setSuccessMsg(null); resetForm() }, 2000)
    } catch (e) {
      console.error('Failed to add batch:', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Success toast */}
      {successMsg && (
        <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2 bg-green-50 text-green-700 rounded-lg text-sm">
          <Check size={16} />
          <span>{successMsg}</span>
        </div>
      )}

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
              className="px-3 py-2 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
            >
              <ScanBarcode size={18} className="text-emerald-600" />
            </button>
            <button
              onClick={() => lookupProduct(barcodeInput)}
              className="px-3 py-2 bg-emerald-100 rounded-lg hover:bg-emerald-200 transition-colors"
            >
              <Search size={18} className="text-emerald-700" />
            </button>
          </div>
          {lookupDone && !productName && (
            <p className="text-xs text-amber-600 mt-1">Product not found — enter details manually.</p>
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

        {/* Expiry entries */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Expiry Date & Quantity</label>
          <div className="space-y-2">
            {entries.map((entry, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="date"
                  value={entry.date}
                  onChange={e => updateEntry(idx, 'date', e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <input
                  type="number"
                  min={1}
                  value={entry.qty}
                  onChange={e => updateEntry(idx, 'qty', Math.max(1, parseInt(e.target.value) || 1))}
                  placeholder="Qty"
                  className="w-20 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-center"
                />
                {entries.length > 1 && (
                  <button onClick={() => removeEntry(idx)} className="p-1.5 text-gray-400 hover:text-red-500">
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {entries.length < 2 && (
            <button
              onClick={addEntry}
              className="mt-2 text-xs font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
            >
              <Plus size={14} /> Add another expiry date
            </button>
          )}
        </div>

        {/* Location */}
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
          disabled={saving || !productName.trim() || validEntries.length === 0}
          className="w-full py-3 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {saving ? (
            <span className="animate-pulse">Adding...</span>
          ) : (
            <>
              <Clock size={16} /> Add {validEntries.length > 1 ? `${validEntries.length} Batches` : 'Batch'}
            </>
          )}
        </button>
      </div>

      <BarcodeScanner open={scannerOpen} onScan={handleScan} onClose={() => setScannerOpen(false)} />
    </div>
  )
}
