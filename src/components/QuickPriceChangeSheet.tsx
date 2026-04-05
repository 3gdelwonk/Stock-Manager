import { useState, useEffect, useCallback } from 'react'
import { Search, ScanBarcode, X, DollarSign, Loader2, Check, Trash2, Send, Tag, AlertCircle, Lock } from 'lucide-react'
import { db } from '../lib/db'
import { searchItems, changeAndSend, printLabel, setPriceLock } from '../lib/jarvis'
import BarcodeScanner from './BarcodeScanner'
import { DEPARTMENT_LABELS } from '../lib/constants'

interface ProductResult {
  itemCode: string
  barcode: string
  name: string
  department: string
  sellPrice: number
}

interface QueueItem extends ProductResult {
  newPrice: string
}

interface ChangeResult {
  barcode: string
  name: string
  success: boolean
  error?: string
}

interface QuickPriceChangeSheetProps {
  open: boolean
  onClose: () => void
  onSelectProduct: (product: ProductResult) => void
}

export default function QuickPriceChangeSheet({ open, onClose }: QuickPriceChangeSheetProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductResult[]>([])
  const [loading, setLoading] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)

  // Queue for bulk price changes
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [doPrintLabels, setDoPrintLabels] = useState(false)
  const [doLockPrices, setDoLockPrices] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [changeResults, setChangeResults] = useState<ChangeResult[]>([])
  const [done, setDone] = useState(false)

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) { setResults([]); return }
    setLoading(true)
    try {
      const merged = new Map<string, ProductResult>()
      const localProducts = await db.products
        .filter(p => p.name.toLowerCase().includes(trimmed.toLowerCase()) || p.barcode.includes(trimmed) || p.itemCode.includes(trimmed))
        .limit(10).toArray()
      for (const p of localProducts) {
        merged.set(p.itemCode || p.barcode, { itemCode: p.itemCode, barcode: p.barcode, name: p.name, department: p.department, sellPrice: p.sellPrice })
      }
      try {
        const jarvisResult = await searchItems(trimmed, 10)
        for (const item of jarvisResult.items) {
          const key = item.itemCode || item.barcode || ''
          if (!merged.has(key)) merged.set(key, { itemCode: item.itemCode, barcode: item.barcode || '', name: item.description, department: item.department, sellPrice: item.sellPrice })
        }
      } catch { /* offline */ }
      setResults(Array.from(merged.values()).slice(0, 10))
    } catch { setResults([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => doSearch(query), 300)
    return () => clearTimeout(timer)
  }, [query, open, doSearch])

  useEffect(() => {
    if (!open) { setQuery(''); setResults([]); setQueue([]); setChangeResults([]); setDone(false); setDoPrintLabels(false); setDoLockPrices(false) }
  }, [open])

  function handleScan(code: string) {
    setScannerOpen(false)
    setQuery(code)
  }

  function addToQueue(product: ProductResult) {
    if (queue.some(q => q.barcode === product.barcode)) return
    setQueue(prev => [...prev, { ...product, newPrice: '' }])
    setQuery('')
    setResults([])
  }

  function updatePrice(barcode: string, newPrice: string) {
    setQueue(prev => prev.map(q => q.barcode === barcode ? { ...q, newPrice } : q))
  }

  function removeFromQueue(barcode: string) {
    setQueue(prev => prev.filter(q => q.barcode !== barcode))
  }

  async function handleSubmitAll() {
    setSubmitting(true)
    setChangeResults([])
    const results: ChangeResult[] = []
    for (const item of queue) {
      const price = parseFloat(item.newPrice)
      if (isNaN(price) || price <= 0) {
        results.push({ barcode: item.barcode, name: item.name, success: false, error: 'Invalid price' })
        continue
      }
      try {
        const effectiveBarcode = item.barcode || item.itemCode
        await changeAndSend(effectiveBarcode, price)

        // Track in local DB
        const now = new Date()
        await db.trackedItems.add({
          itemCode: item.itemCode, barcode: item.barcode, description: item.name,
          department: item.department, originalPrice: item.sellPrice, newPrice: price,
          changeDate: now.toISOString().slice(0, 10), reason: 'other', notes: 'Bulk price change',
          status: 'confirmed', syncStatus: 'synced', currentPrice: price,
          revertedAt: null, createdAt: now,
        })

        if (doPrintLabels) {
          try { await printLabel(effectiveBarcode) } catch { /* non-fatal */ }
        }

        if (doLockPrices) {
          try { await setPriceLock(effectiveBarcode, true) } catch { /* non-fatal */ }
        }

        results.push({ barcode: item.barcode, name: item.name, success: true })
      } catch (err) {
        results.push({ barcode: item.barcode, name: item.name, success: false, error: err instanceof Error ? err.message : 'Failed' })
      }
    }
    setChangeResults(results)
    setSubmitting(false)
    setDone(true)
  }

  if (!open) return null

  const validCount = queue.filter(q => { const p = parseFloat(q.newPrice); return !isNaN(p) && p > 0 }).length
  const successCount = changeResults.filter(r => r.success).length

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col animate-slide-up">
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <DollarSign size={18} className="text-amber-600" />
            <h2 className="text-base font-semibold text-gray-900">Change Prices</h2>
          </div>
          <div className="flex items-center gap-2">
            {queue.length > 0 && !done && (
              <span className="text-xs font-medium text-gray-400">{queue.length} items</span>
            )}
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={20} /></button>
          </div>
        </div>

        {done ? (
          /* Results */
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            <div className="flex flex-col items-center py-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${successCount === queue.length ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                {successCount === queue.length ? <Check size={24} className="text-emerald-600" /> : <AlertCircle size={24} className="text-amber-600" />}
              </div>
              <p className="text-sm font-semibold text-gray-900">
                {successCount === queue.length ? 'All prices updated & sent to POS' : `${successCount}/${queue.length} prices updated`}
              </p>
              {doPrintLabels && successCount > 0 && (
                <p className="text-xs text-gray-500 mt-1">Labels sent to printer</p>
              )}
              {doLockPrices && successCount > 0 && (
                <p className="text-xs text-gray-500 mt-0.5">Prices locked against host updates</p>
              )}
            </div>
            {changeResults.map(r => (
              <div key={r.barcode} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${r.success ? 'bg-emerald-50' : 'bg-red-50'}`}>
                <span className={`truncate ${r.success ? 'text-emerald-700' : 'text-red-700'}`}>{r.name}</span>
                <span className={`text-xs font-medium shrink-0 ml-2 ${r.success ? 'text-emerald-600' : 'text-red-600'}`}>
                  {r.success ? 'Sent to POS' : r.error}
                </span>
              </div>
            ))}
            <button onClick={onClose} className="w-full py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg mt-2">Done</button>
          </div>
        ) : (
          <>
            {/* Search */}
            <div className="px-4 py-3 shrink-0">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" placeholder="Search product to add..." value={query} onChange={e => setQuery(e.target.value)} autoFocus
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <button onClick={() => setScannerOpen(true)} className="px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                  <ScanBarcode size={18} className="text-gray-600" />
                </button>
              </div>
            </div>

            {/* Search results dropdown */}
            {results.length > 0 && (
              <div className="px-4 pb-2 max-h-[180px] overflow-y-auto border-b border-gray-100">
                {loading && <p className="text-xs text-gray-400 text-center py-2 animate-pulse">Searching...</p>}
                {results.map((product, idx) => {
                  const inQueue = queue.some(q => q.barcode === product.barcode)
                  return (
                    <button key={`${product.itemCode}-${idx}`} onClick={() => !inQueue && addToQueue(product)} disabled={inQueue}
                      className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between ${inQueue ? 'opacity-40' : 'hover:bg-gray-50'}`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                        <p className="text-xs text-gray-500">
                          {DEPARTMENT_LABELS[product.department as keyof typeof DEPARTMENT_LABELS] || product.department} · ${product.sellPrice.toFixed(2)}
                        </p>
                      </div>
                      {inQueue ? <Check size={14} className="text-emerald-500 shrink-0 ml-2" /> : <DollarSign size={14} className="text-amber-500 shrink-0 ml-2" />}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Queue */}
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
              {queue.length === 0 ? (
                <div className="py-8 text-center">
                  <DollarSign size={24} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Search or scan products to change prices</p>
                  <p className="text-xs text-gray-300 mt-1">Add multiple items for bulk price change</p>
                </div>
              ) : (
                queue.map(item => (
                  <div key={item.barcode} className="bg-gray-50 rounded-lg px-3 py-2.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                        <p className="text-[10px] text-gray-400">{item.department} · {item.barcode}</p>
                      </div>
                      <button onClick={() => removeFromQueue(item.barcode)} className="p-1 text-red-400 hover:text-red-600 shrink-0"><Trash2 size={14} /></button>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <span className="text-[10px] text-gray-400">Current</span>
                        <p className="text-sm font-mono text-gray-500">${item.sellPrice.toFixed(2)}</p>
                      </div>
                      <div className="text-gray-300">→</div>
                      <div className="flex-1">
                        <span className="text-[10px] text-gray-400">New Price</span>
                        <input type="number" inputMode="decimal" step="0.01" min="0" value={item.newPrice}
                          onChange={e => updatePrice(item.barcode, e.target.value)} placeholder="0.00"
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Submit */}
            {queue.length > 0 && (
              <div className="px-4 py-3 border-t border-gray-100 shrink-0 space-y-2">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={doPrintLabels} onChange={e => setDoPrintLabels(e.target.checked)}
                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                  <Tag size={14} className="text-gray-400" />
                  Print shelf labels after update
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={doLockPrices} onChange={e => setDoLockPrices(e.target.checked)}
                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                  <Lock size={14} className="text-gray-400" />
                  Lock prices against host updates
                </label>
                <button onClick={handleSubmitAll} disabled={submitting || validCount === 0}
                  className="w-full py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting ? <><Loader2 size={16} className="animate-spin" /> Updating prices...</>
                    : <><Send size={16} /> Update {validCount} Prices & Send to POS</>}
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <BarcodeScanner open={scannerOpen} onScan={handleScan} onClose={() => setScannerOpen(false)} />
    </>
  )
}
