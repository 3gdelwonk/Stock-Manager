import { useState, useCallback, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ScanBarcode, Search, Check, Trash2, Scale, Package, ChevronDown, ChevronUp } from 'lucide-react'
import { db } from '../../lib/db'
import { logDailyWaste, findMatchingBatches } from '../../lib/expiry'
import { searchItems, adjustStock } from '../../lib/jarvis'
import { resolveBarcode } from '../../lib/barcodeResolver'
import BarcodeScanner from '../BarcodeScanner'
import { DEPARTMENT_ORDER, DEPARTMENT_LABELS } from '../../lib/constants'
import type { ExpiryBatch, WasteLogEntry } from '../../lib/types'

const REASONS: { value: WasteLogEntry['reason']; label: string }[] = [
  { value: 'expired', label: 'Expired' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'quality', label: 'Quality Issue' },
  { value: 'recall', label: 'Recall' },
  { value: 'overstock', label: 'Overstock' },
  { value: 'short_dated', label: 'Short Dated' },
  { value: 'other', label: 'Other' },
]

export default function CrewWaste() {
  const [scannerOpen, setScannerOpen] = useState(false)
  const [barcodeInput, setBarcodeInput] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchResults, setSearchResults] = useState<{ itemCode: string; barcode: string | null; description: string; department: string; avgCost: number; sellPrice: number }[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [productName, setProductName] = useState('')
  const [itemCode, setItemCode] = useState('')
  const [department, setDepartment] = useState('')
  const [costPrice, setCostPrice] = useState('')
  const [sellPrice, setSellPrice] = useState('')
  const [qty, setQty] = useState('1')
  const [weightKg, setWeightKg] = useState('')
  const [isWeighItem, setIsWeighItem] = useState(false)
  const [reason, setReason] = useState<WasteLogEntry['reason']>('expired')
  const [claimable, setClaimable] = useState(false)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [matchingBatches, setMatchingBatches] = useState<ExpiryBatch[]>([])
  const [selectedBatchId, setSelectedBatchId] = useState<number | undefined>()
  const [todayOpen, setTodayOpen] = useState(true)
  const [lookupDone, setLookupDone] = useState(false)

  const todayStart = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const todayEntries = useLiveQuery(
    () => db.wasteLog.where('loggedAt').aboveOrEqual(todayStart).toArray(),
    [todayStart],
  )

  const todayTotal = useMemo(() => {
    if (!todayEntries) return 0
    return todayEntries.reduce((s, e) => s + e.qty * e.costPrice, 0)
  }, [todayEntries])

  const fillFromProduct = useCallback(async (barcode: string, name: string, dept: string, cost: number, sell: number, code: string) => {
    setProductName(name)
    setDepartment(dept)
    setCostPrice(cost > 0 ? cost.toFixed(2) : '')
    setSellPrice(sell > 0 ? sell.toFixed(2) : '')
    setItemCode(code)
    setIsWeighItem(dept === 'fresh_produce' || dept === 'meat')
    setLookupDone(true)

    if (barcode) {
      const batches = await findMatchingBatches(barcode)
      setMatchingBatches(batches)
      setSelectedBatchId(undefined)
    }
  }, [])

  const lookupProduct = useCallback(async (barcode: string) => {
    const trimmed = barcode.trim()
    if (!trimmed) return
    setBarcodeInput(trimmed)
    const normalized = trimmed.replace(/[^0-9]/g, '')

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
      await fillFromProduct(product.barcode, product.name, product.department, product.costPrice, product.sellPrice, product.itemCode)
      return
    }

    try {
      const resolved = await resolveBarcode(trimmed)
      if (resolved) {
        setProductName(resolved.description)
        setBarcodeInput(resolved.primaryBarcode || trimmed)
        setItemCode(resolved.itemCode)
        setLookupDone(true)
        return
      }
    } catch { /* resolver unavailable */ }

    try {
      const result = await searchItems(trimmed, 1)
      if (result.items?.length > 0) {
        const item = result.items[0]
        await fillFromProduct(item.barcode || trimmed, item.description, item.department, item.avgCost, item.sellPrice, item.itemCode)
        return
      }
    } catch { /* fall through */ }

    setLookupDone(true)
  }, [fillFromProduct])

  const handleProductSearch = useCallback(async () => {
    const q = searchInput.trim()
    if (!q) return
    try {
      const result = await searchItems(q, 10)
      setSearchResults(result.items || [])
      setSearchOpen(true)
    } catch {
      setSearchResults([])
    }
  }, [searchInput])

  const selectSearchResult = useCallback(async (item: typeof searchResults[0]) => {
    const bc = item.barcode || ''
    setBarcodeInput(bc)
    setSearchInput('')
    setSearchOpen(false)
    setSearchResults([])
    await fillFromProduct(bc, item.description, item.department, item.avgCost, item.sellPrice, item.itemCode)
  }, [fillFromProduct])

  function handleScan(code: string) {
    setScannerOpen(false)
    lookupProduct(code)
  }

  function resetForm() {
    setBarcodeInput('')
    setSearchInput('')
    setProductName('')
    setItemCode('')
    setDepartment('')
    setCostPrice('')
    setSellPrice('')
    setQty('1')
    setWeightKg('')
    setIsWeighItem(false)
    setReason('expired')
    setClaimable(false)
    setNotes('')
    setMatchingBatches([])
    setSelectedBatchId(undefined)
    setLookupDone(false)
  }

  const canSubmit = productName.trim() && (isWeighItem ? parseFloat(weightKg) > 0 : parseInt(qty) >= 1) && parseFloat(costPrice) >= 0

  async function handleSubmit() {
    if (!canSubmit) return
    setSaving(true)
    try {
      const qtyVal = isWeighItem ? 1 : Math.max(1, parseInt(qty) || 1)
      const weightVal = isWeighItem ? parseFloat(weightKg) || 0 : undefined
      const costVal = parseFloat(costPrice) || 0
      const sellVal = parseFloat(sellPrice) || 0

      await logDailyWaste({
        barcode: barcodeInput.trim(),
        itemCode: itemCode,
        productName: productName.trim(),
        department: department || 'other',
        qty: qtyVal,
        weightKg: weightVal,
        unitType: isWeighItem ? 'kg' : 'each',
        costPrice: costVal,
        sellPrice: sellVal,
        reason,
        claimable,
        notes: notes.trim() || undefined,
        batchId: selectedBatchId,
      })

      if (barcodeInput.trim()) {
        adjustStock(barcodeInput.trim(), -qtyVal, 'waste').catch(() => {})
      }

      await db.quickActionLog.add({
        actionType: 'waste-log',
        barcode: barcodeInput.trim(),
        productName: productName.trim(),
        details: { qty: qtyVal, weightKg: weightVal, reason, costPrice: costVal, claimable },
        syncStatus: 'pending',
        performedAt: new Date().toISOString(),
      })

      const label = isWeighItem ? `${weightVal}kg of ${productName.trim()}` : `${qtyVal}x ${productName.trim()}`
      setSuccessMsg(`Logged: ${label}`)
      setTimeout(() => { setSuccessMsg(null); resetForm() }, 2000)
    } catch (e) {
      console.error('Failed to log waste:', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {successMsg && (
        <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2 bg-green-50 text-green-700 rounded-lg text-sm">
          <Check size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Barcode scan */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Barcode</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Scan or type barcode..."
              value={barcodeInput}
              onChange={e => setBarcodeInput(e.target.value)}
              onBlur={() => lookupProduct(barcodeInput)}
              onKeyDown={e => e.key === 'Enter' && lookupProduct(barcodeInput)}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            <button onClick={() => setScannerOpen(true)} className="px-3 py-2 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
              <ScanBarcode size={18} className="text-red-600" />
            </button>
          </div>
          {lookupDone && !productName && (
            <p className="text-xs text-amber-600 mt-1">Not found — search by name or enter manually.</p>
          )}
        </div>

        {/* Product name search */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Search by Name</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search product name..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleProductSearch()}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            <button onClick={handleProductSearch} className="px-3 py-2 bg-red-100 rounded-lg hover:bg-red-200 transition-colors">
              <Search size={18} className="text-red-700" />
            </button>
          </div>
          {searchOpen && searchResults.length > 0 && (
            <div className="mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {searchResults.map((item, i) => (
                <button
                  key={i}
                  onClick={() => selectSearchResult(item)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                >
                  <p className="text-sm font-medium text-gray-900 truncate">{item.description}</p>
                  <p className="text-[10px] text-gray-500">{item.barcode} · {item.department} · ${item.sellPrice?.toFixed(2)}</p>
                </button>
              ))}
            </div>
          )}
          {searchOpen && searchResults.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">No results found.</p>
          )}
        </div>

        {/* Product name (manual) */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Product Name</label>
          <input
            type="text"
            placeholder="Product name"
            value={productName}
            onChange={e => setProductName(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400"
          />
        </div>

        {/* Department */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Department</label>
          <select
            value={department}
            onChange={e => {
              setDepartment(e.target.value)
              setIsWeighItem(e.target.value === 'fresh_produce' || e.target.value === 'meat')
            }}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 bg-white"
          >
            <option value="">Select department</option>
            {DEPARTMENT_ORDER.map(d => (
              <option key={d} value={d}>{DEPARTMENT_LABELS[d]}</option>
            ))}
          </select>
        </div>

        {/* Unit type toggle + Qty / Weight */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-700">
              {isWeighItem ? 'Weight (kg)' : 'Quantity'}
            </label>
            <button
              onClick={() => setIsWeighItem(!isWeighItem)}
              className="flex items-center gap-1 text-[10px] font-medium text-red-600 hover:text-red-700"
            >
              {isWeighItem ? <Package size={12} /> : <Scale size={12} />}
              Switch to {isWeighItem ? 'count' : 'weight'}
            </button>
          </div>
          {isWeighItem ? (
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={weightKg}
                onChange={e => setWeightKg(e.target.value)}
                className="w-full px-3 py-2 pr-10 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">kg</span>
            </div>
          ) : (
            <input
              type="number"
              min={1}
              value={qty}
              onChange={e => setQty(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 text-center"
            />
          )}
        </div>

        {/* Cost / Sell price */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Cost Price</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={costPrice}
              onChange={e => setCostPrice(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Sell Price</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={sellPrice}
              onChange={e => setSellPrice(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>
        </div>

        {/* Reason */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Reason</label>
          <select
            value={reason}
            onChange={e => setReason(e.target.value as WasteLogEntry['reason'])}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 bg-white"
          >
            {REASONS.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        {/* Matching batches */}
        {matchingBatches.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Link to Expiry Batch (optional)</label>
            <select
              value={selectedBatchId ?? ''}
              onChange={e => setSelectedBatchId(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 bg-white"
            >
              <option value="">None — standalone waste</option>
              {matchingBatches.map(b => (
                <option key={b.id} value={b.id}>
                  Exp: {b.expiryDate} · Qty: {b.qtyRemaining}/{b.qtyReceived}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Claimable */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={claimable}
            onChange={e => setClaimable(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-400"
          />
          <span className="text-sm text-gray-700">Claimable from supplier</span>
        </label>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
          <textarea
            placeholder="Optional notes..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
          />
        </div>

        {/* Today's log */}
        {todayEntries && todayEntries.length > 0 && (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setTodayOpen(!todayOpen)}
              className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 text-sm font-medium text-gray-700"
            >
              <span>Today's Waste ({todayEntries.length} items · ${todayTotal.toFixed(2)})</span>
              {todayOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {todayOpen && (
              <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
                {todayEntries.map(e => (
                  <div key={e.id} className="px-3 py-2 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-900 truncate">{e.productName}</p>
                      <p className="text-[10px] text-gray-500">
                        {e.unitType === 'kg' ? `${e.weightKg}kg` : `x${e.qty}`} · {e.reason}
                        {e.claimable && ' · claimable'}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-red-600 shrink-0">
                      ${(e.qty * e.costPrice).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="px-4 py-4 border-t border-gray-100 shrink-0">
        <button
          onClick={handleSubmit}
          disabled={saving || !canSubmit}
          className="w-full py-3 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {saving ? (
            <span className="animate-pulse">Logging...</span>
          ) : (
            <>
              <Trash2 size={16} /> Log Waste
            </>
          )}
        </button>
      </div>

      <BarcodeScanner open={scannerOpen} onScan={handleScan} onClose={() => setScannerOpen(false)} />
    </div>
  )
}
