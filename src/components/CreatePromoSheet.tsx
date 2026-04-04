import { useState } from 'react'
import { X, Search, ScanBarcode, Tag, CheckCircle2, AlertCircle } from 'lucide-react'
import { searchItems, createPromo, type SearchResult } from '../lib/jarvis'
import { db } from '../lib/db'
import BarcodeScanner from './BarcodeScanner'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

type Step = 'search' | 'form' | 'result'

interface SelectedItem {
  barcode: string
  itemCode: string
  description: string
  sellPrice: number
  department: string
}

export default function CreatePromoSheet({ open, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult['items']>([])
  const [searching, setSearching] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [selected, setSelected] = useState<SelectedItem | null>(null)

  // Form fields
  const [promoPrice, setPromoPrice] = useState('')
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState('')
  const [description, setDescription] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultMsg, setResultMsg] = useState<{ success: boolean; sentToPos?: boolean; message?: string } | null>(null)

  function reset() {
    setStep('search')
    setQuery('')
    setResults([])
    setSelected(null)
    setPromoPrice('')
    setStartDate(new Date().toISOString().slice(0, 10))
    setEndDate('')
    setDescription('')
    setError(null)
    setResultMsg(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSearch() {
    if (!query.trim()) return
    setSearching(true)
    try {
      const res = await searchItems(query.trim(), 10)
      setResults(res.items)
    } catch { setResults([]) }
    setSearching(false)
  }

  function handleSelect(item: SearchResult['items'][0]) {
    setSelected({
      barcode: item.barcode ?? item.itemCode,
      itemCode: item.itemCode,
      description: item.description,
      sellPrice: item.sellPrice,
      department: item.department,
    })
    setStep('form')
  }

  function handleScan(barcode: string) {
    setScannerOpen(false)
    setQuery(barcode)
    // Auto search
    setSearching(true)
    searchItems(barcode, 5).then(res => {
      setResults(res.items)
      if (res.items.length === 1) handleSelect(res.items[0])
    }).finally(() => setSearching(false))
  }

  async function handleSubmit() {
    if (!selected) return
    const price = parseFloat(promoPrice)
    if (isNaN(price) || price <= 0) { setError('Enter a valid promo price'); return }
    if (price >= selected.sellPrice) { setError('Promo price must be less than current sell price'); return }
    if (!endDate) { setError('Select an end date'); return }
    if (endDate <= startDate) { setError('End date must be after start date'); return }
    setError(null)
    setSaving(true)
    try {
      const res = await createPromo({
        barcode: selected.barcode,
        promoPrice: price,
        startDate,
        endDate,
        description: description || undefined,
      })
      setResultMsg({ success: res.success, sentToPos: res.sentToPos, message: res.message })
      setStep('result')

      // Log to quick action log
      await db.quickActionLog.add({
        actionType: 'promo-create',
        barcode: selected.barcode,
        productName: selected.description,
        details: { promoPrice: price, startDate, endDate, description, sentToPos: res.sentToPos },
        syncStatus: res.success ? 'synced' : 'failed',
        performedAt: new Date().toISOString(),
      })

      if (res.success) onSuccess?.()
    } catch (e) {
      setError((e as Error).message)
    }
    setSaving(false)
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={handleClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Handle + header */}
        <div className="flex justify-center pt-3 pb-1 shrink-0"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
        <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <Tag size={16} className="text-amber-600" />
            <h2 className="text-base font-semibold text-gray-900">Create Promotion</h2>
          </div>
          <button onClick={handleClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
          {/* ── Step 1: Search ── */}
          {step === 'search' && (
            <>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
                  <Search size={14} className="text-gray-400" />
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    placeholder="Search product name or barcode"
                    className="flex-1 bg-transparent text-sm outline-none"
                    autoFocus
                  />
                </div>
                <button onClick={() => setScannerOpen(true)} className="p-2 bg-emerald-600 text-white rounded-lg">
                  <ScanBarcode size={18} />
                </button>
              </div>
              <button onClick={handleSearch} disabled={searching || !query.trim()}
                className="w-full py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg disabled:opacity-50">
                {searching ? 'Searching...' : 'Search'}
              </button>
              {results.length > 0 && (
                <div className="space-y-1">
                  {results.map(item => (
                    <button key={item.itemCode} onClick={() => handleSelect(item)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 border border-gray-100">
                      <p className="text-sm font-medium text-gray-900 line-clamp-1">{item.description}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                        <span className="font-mono">{item.barcode ?? item.itemCode}</span>
                        <span>${item.sellPrice.toFixed(2)}</span>
                        <span className="text-[10px] px-1 py-0.5 bg-gray-100 rounded">{item.department}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Step 2: Promo form ── */}
          {step === 'form' && selected && (
            <>
              <div className="bg-gray-50 rounded-lg px-3 py-2">
                <p className="text-sm font-medium text-gray-900 line-clamp-2">{selected.description}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                  <span className="font-mono">{selected.barcode}</span>
                  <span>Current: <span className="font-bold text-gray-800">${selected.sellPrice.toFixed(2)}</span></span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-700">Promo Price</label>
                  <input type="number" inputMode="decimal" step="0.01" min="0" value={promoPrice}
                    onChange={e => setPromoPrice(e.target.value)}
                    placeholder="0.00" autoFocus
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-lg font-bold text-center focus:ring-2 focus:ring-amber-400 outline-none" />
                  {promoPrice && !isNaN(parseFloat(promoPrice)) && parseFloat(promoPrice) < selected.sellPrice && (
                    <p className="text-xs text-amber-600 mt-1 text-center">
                      {((1 - parseFloat(promoPrice) / selected.sellPrice) * 100).toFixed(0)}% off
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-700">Start Date</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 outline-none" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700">End Date</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                      min={startDate}
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 outline-none" />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-700">Description (optional)</label>
                  <input type="text" value={description} onChange={e => setDescription(e.target.value)}
                    placeholder="e.g. Weekly special"
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 outline-none" />
                </div>
              </div>

              {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

              <div className="flex gap-2">
                <button onClick={() => { setStep('search'); setSelected(null) }}
                  className="flex-1 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg">Back</button>
                <button onClick={handleSubmit} disabled={saving}
                  className="flex-1 py-2.5 bg-amber-500 text-white text-sm font-bold rounded-lg disabled:opacity-50">
                  {saving ? 'Creating...' : 'Create & Send to POS'}
                </button>
              </div>
            </>
          )}

          {/* ── Step 3: Result ── */}
          {step === 'result' && resultMsg && (
            <div className="flex flex-col items-center gap-3 py-8">
              {resultMsg.success ? (
                <>
                  <CheckCircle2 size={48} className="text-emerald-500" />
                  <p className="text-sm font-semibold text-emerald-700">Promotion Created</p>
                  {resultMsg.sentToPos && <p className="text-xs text-emerald-600">Sent to POS terminals</p>}
                  {resultMsg.sentToPos === false && <p className="text-xs text-amber-600">Created but not sent to POS — manual sync needed</p>}
                </>
              ) : (
                <>
                  <AlertCircle size={48} className="text-red-500" />
                  <p className="text-sm font-semibold text-red-700">Failed</p>
                  <p className="text-xs text-red-600">{resultMsg.message}</p>
                </>
              )}
              <button onClick={handleClose} className="mt-4 px-6 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg">
                Done
              </button>
            </div>
          )}
        </div>
      </div>

      <BarcodeScanner open={scannerOpen} onScan={handleScan} onClose={() => setScannerOpen(false)} />
    </>
  )
}
