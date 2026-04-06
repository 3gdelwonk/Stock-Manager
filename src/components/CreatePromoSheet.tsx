import { useState } from 'react'
import { X, Search, ScanBarcode, Tag, CheckCircle2, Lock, Plus, Trash2, Loader2, ArrowRight } from 'lucide-react'
import { searchItems, createPromo, setPriceLock, getPromotions, type SearchResult, type StockItem, type LivePromotion } from '../lib/jarvis'
import { db } from '../lib/db'
import BarcodeScanner from './BarcodeScanner'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

const PROMO_TYPES = [
  { id: 'iga_rewards', label: 'IGA Rewards', color: 'bg-red-50 text-red-700 border-red-200' },
  { id: 'manager_special', label: 'Manager Special', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { id: 'weekly_special', label: 'Weekly Special', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'clearance', label: 'Clearance', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  { id: 'multibuy', label: 'Multi-Buy', color: 'bg-blue-50 text-blue-700 border-blue-200' },
]

type Step = 'build' | 'review' | 'applying' | 'done'

interface QueueItem {
  barcode: string
  itemCode: string
  description: string
  department: string
  sellPrice: number
  avgCost: number
  promoPrice: string
  existingPromo: LivePromotion | null
}

interface PromoResult {
  barcode: string
  description: string
  success: boolean
  sentToPos?: boolean
  message?: string
}

export default function CreatePromoSheet({ open, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>('build')

  // Shared settings
  const [promoType, setPromoType] = useState('iga_rewards')
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState('')
  const [doLockPrice, setDoLockPrice] = useState(false)

  // Search
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult['items']>([])
  const [searching, setSearching] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)

  // Queue
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [livePromos, setLivePromos] = useState<LivePromotion[]>([])
  const [promosLoaded, setPromosLoaded] = useState(false)

  // Apply
  const [applyProgress, setApplyProgress] = useState(0)
  const [promoResults, setPromoResults] = useState<PromoResult[]>([])
  const [error, setError] = useState<string | null>(null)

  // ── Helpers ─────────────────────────────────────────────────────────────
  function findExistingPromo(itemCode: string): LivePromotion | null {
    return livePromos.find(p => p.itemCode === itemCode) ?? null
  }

  async function ensurePromosLoaded() {
    if (promosLoaded) return
    try {
      const res = await getPromotions()
      setLivePromos(res.items)
    } catch { /* non-fatal */ }
    setPromosLoaded(true)
  }

  function reset() {
    setStep('build')
    setQuery('')
    setResults([])
    setQueue([])
    setPromoType('iga_rewards')
    setStartDate(new Date().toISOString().slice(0, 10))
    setEndDate('')
    setDoLockPrice(false)

    setApplyProgress(0)
    setPromoResults([])
    setError(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  // ── Search ──────────────────────────────────────────────────────────────
  async function handleSearch() {
    if (!query.trim()) return
    setSearching(true)
    await ensurePromosLoaded()
    try {
      const res = await searchItems(query.trim(), 10)
      setResults(res.items)
    } catch { setResults([]) }
    setSearching(false)
  }

  function addToQueue(item: StockItem) {
    if (queue.some(q => q.barcode === (item.barcode ?? item.itemCode))) return
    const existing = findExistingPromo(item.itemCode)
    setQueue(prev => [...prev, {
      barcode: item.barcode ?? item.itemCode,
      itemCode: item.itemCode,
      description: item.description,
      department: item.department,
      sellPrice: item.sellPrice,
      avgCost: item.avgCost,
      promoPrice: '',
      existingPromo: existing,
    }])
    setQuery('')
    setResults([])
  }

  function removeFromQueue(barcode: string) {
    setQueue(prev => prev.filter(q => q.barcode !== barcode))
  }

  function updatePromoPrice(barcode: string, price: string) {
    setQueue(prev => prev.map(q => q.barcode === barcode ? { ...q, promoPrice: price } : q))
  }

  function handleScan(barcode: string) {
    setScannerOpen(false)
    setQuery(barcode)
    setSearching(true)
    ensurePromosLoaded()
    searchItems(barcode, 5).then(res => {
      setResults(res.items)
      if (res.items.length === 1) addToQueue(res.items[0])
    }).finally(() => setSearching(false))
  }

  // ── Validation ──────────────────────────────────────────────────────────
  function canProceedToReview(): boolean {
    if (queue.length === 0) return false
    if (!endDate) return false
    if (endDate <= startDate) return false
    return queue.every(q => {
      const p = parseFloat(q.promoPrice)
      return !isNaN(p) && p > 0
    })
  }

  // ── Apply ───────────────────────────────────────────────────────────────
  async function handleApply() {
    if (!canProceedToReview()) return
    setStep('applying')

    setApplyProgress(0)

    const results: PromoResult[] = []
    const typeLabel = PROMO_TYPES.find(t => t.id === promoType)?.label || promoType

    for (const item of queue) {
      const price = parseFloat(item.promoPrice)
      try {
        const res = await createPromo({
          barcode: item.barcode,
          promoPrice: price,
          startDate,
          endDate,
          description: typeLabel,
          promoType,
        })

        if (res.success && doLockPrice) {
          try { await setPriceLock(item.barcode, true) } catch { /* non-fatal */ }
        }

        results.push({
          barcode: item.barcode,
          description: item.description,
          success: res.success,
          sentToPos: res.sentToPos,
          message: res.message,
        })

        await db.quickActionLog.add({
          actionType: 'promo-create',
          barcode: item.barcode,
          productName: item.description,
          details: { promoPrice: price, startDate, endDate, promoType, sentToPos: res.sentToPos },
          syncStatus: res.success ? 'synced' : 'failed',
          performedAt: new Date().toISOString(),
        }).catch(() => {})
      } catch (e) {
        results.push({
          barcode: item.barcode,
          description: item.description,
          success: false,
          message: (e as Error).message,
        })
      }
      setApplyProgress(prev => prev + 1)
    }

    setPromoResults(results)

    setStep('done')
    if (results.some(r => r.success)) onSuccess?.()
  }

  // ── Computed ─────────────────────────────────────────────────────────────
  const successCount = promoResults.filter(r => r.success).length
  const failCount = promoResults.filter(r => !r.success).length
  const activeType = PROMO_TYPES.find(t => t.id === promoType)

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={handleClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col">
        {/* Handle + header */}
        <div className="flex justify-center pt-3 pb-1 shrink-0"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
        <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <Tag size={16} className="text-amber-600" />
            <h2 className="text-base font-semibold text-gray-900">Create Promotions</h2>
          </div>
          <button onClick={handleClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
          {/* ── Step: Build Queue ── */}
          {step === 'build' && (
            <>
              {/* Promo Type Selector */}
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1.5 block">Promotion Type</label>
                <div className="flex flex-wrap gap-1.5">
                  {PROMO_TYPES.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setPromoType(t.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        promoType === t.id ? t.color : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date Range */}
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

              {/* Search + Scan */}
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
                  <Search size={14} className="text-gray-400" />
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    placeholder="Search product name or barcode"
                    className="flex-1 bg-transparent text-sm outline-none"
                  />
                </div>
                <button onClick={() => setScannerOpen(true)} className="p-2 bg-emerald-600 text-white rounded-lg shrink-0">
                  <ScanBarcode size={18} />
                </button>
                <button onClick={handleSearch} disabled={searching || !query.trim()}
                  className="px-3 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 shrink-0">
                  {searching ? '...' : 'Go'}
                </button>
              </div>

              {/* Search Results */}
              {results.length > 0 && (
                <div className="space-y-1">
                  {results.map(item => {
                    const inQueue = queue.some(q => q.barcode === (item.barcode ?? item.itemCode))
                    const existing = findExistingPromo(item.itemCode)
                    return (
                      <button key={item.itemCode} onClick={() => addToQueue(item)} disabled={inQueue}
                        className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${inQueue ? 'border-emerald-200 bg-emerald-50 opacity-60' : 'border-gray-100 hover:bg-gray-50'}`}>
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-900 line-clamp-1 flex-1">{item.description}</p>
                          {!inQueue && <Plus size={14} className="text-emerald-600 shrink-0 ml-2" />}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                          <span className="font-mono">{item.barcode ?? item.itemCode}</span>
                          <span className="font-bold text-gray-800">${item.sellPrice.toFixed(2)}</span>
                          <span className="text-gray-400">Cost: ${item.avgCost.toFixed(2)}</span>
                          <span className="text-[10px] px-1 py-0.5 bg-gray-100 rounded">{item.department}</span>
                        </div>
                        {existing && (
                          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-amber-600">
                            <Tag size={9} />
                            On promo: ${existing.promoPrice.toFixed(2)} ({existing.discountPercent.toFixed(0)}% off) — {existing.daysLeft}d left
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Queue */}
              {queue.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-500 uppercase">Queue ({queue.length})</p>
                  </div>
                  {queue.map(item => {
                    const price = parseFloat(item.promoPrice)
                    const validPrice = !isNaN(price) && price > 0
                    const margin = validPrice ? ((price - item.avgCost) / price * 100) : null
                    return (
                      <div key={item.barcode} className="rounded-lg border border-gray-200 px-3 py-2.5 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 line-clamp-1">{item.description}</p>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                              <span className="text-[10px] px-1 py-0.5 bg-gray-100 rounded">{item.department}</span>
                              <span>Sell: <span className="font-bold text-gray-800">${item.sellPrice.toFixed(2)}</span></span>
                              <span>Cost: <span className="font-medium">${item.avgCost.toFixed(2)}</span></span>
                            </div>
                          </div>
                          <button onClick={() => removeFromQueue(item.barcode)} className="p-1 text-gray-300 hover:text-red-500 shrink-0">
                            <Trash2 size={14} />
                          </button>
                        </div>

                        {/* Existing promo warning */}
                        {item.existingPromo && (
                          <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 rounded text-[10px] text-amber-700">
                            <Tag size={9} />
                            Already on promo: ${item.existingPromo.promoPrice.toFixed(2)} ({item.existingPromo.discountPercent.toFixed(0)}% off) until {new Date(item.existingPromo.endDate).toLocaleDateString()}
                          </div>
                        )}

                        {/* Promo price input */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">${item.sellPrice.toFixed(2)}</span>
                          <ArrowRight size={12} className="text-gray-400" />
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            value={item.promoPrice}
                            onChange={e => updatePromoPrice(item.barcode, e.target.value)}
                            placeholder="Promo price"
                            className="w-24 border border-gray-200 rounded px-2 py-1.5 text-sm font-bold text-center focus:ring-2 focus:ring-amber-400 outline-none"
                          />
                          {validPrice && (
                            <>
                              <span className="text-xs text-amber-600 font-medium">
                                {((1 - price / item.sellPrice) * 100).toFixed(0)}% off
                              </span>
                              {margin !== null && (
                                <span className={`text-[10px] font-medium ${margin < 10 ? 'text-red-600' : margin < 20 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                  {margin.toFixed(1)}% margin
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Options + Submit */}
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={doLockPrice} onChange={e => setDoLockPrice(e.target.checked)}
                  className="rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                <Lock size={14} className="text-gray-400" />
                Lock promo prices against host updates
              </label>

              {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

              <button
                onClick={() => {
                  if (!endDate) { setError('Select an end date'); return }
                  if (endDate <= startDate) { setError('End date must be after start date'); return }
                  const invalid = queue.find(q => { const p = parseFloat(q.promoPrice); return isNaN(p) || p <= 0 })
                  if (invalid) { setError(`Enter a valid promo price for ${invalid.description}`); return }
                  setError(null)
                  setStep('review')
                }}
                disabled={queue.length === 0}
                className="w-full py-2.5 bg-amber-500 text-white text-sm font-bold rounded-lg disabled:opacity-50"
              >
                Review {queue.length} Promotion{queue.length !== 1 ? 's' : ''}
              </button>
            </>
          )}

          {/* ── Step: Review ── */}
          {step === 'review' && (
            <>
              <div className="bg-amber-50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium border ${activeType?.color || ''}`}>
                    {activeType?.label}
                  </span>
                  <span className="text-xs text-gray-500">{startDate} — {endDate}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                {queue.map(item => {
                  const price = parseFloat(item.promoPrice)
                  return (
                    <div key={item.barcode} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 line-clamp-1">{item.description}</p>
                        <span className="text-[10px] text-gray-400">{item.department}</span>
                      </div>
                      <div className="text-xs text-right shrink-0 ml-2">
                        <span className="text-gray-500">${item.sellPrice.toFixed(2)}</span>
                        <span className="mx-1 text-gray-400">&rarr;</span>
                        <span className="font-bold text-amber-700">${price.toFixed(2)}</span>
                        <span className="ml-1 text-amber-600">({((1 - price / item.sellPrice) * 100).toFixed(0)}%)</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {doLockPrice && (
                <p className="text-[10px] text-indigo-600 flex items-center gap-1"><Lock size={10} /> Prices will be locked after creation</p>
              )}

              <div className="flex gap-2">
                <button onClick={() => setStep('build')}
                  className="flex-1 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg">Back</button>
                <button onClick={handleApply}
                  className="flex-[2] py-2.5 bg-amber-500 text-white text-sm font-bold rounded-lg">
                  Create & Send to POS
                </button>
              </div>
            </>
          )}

          {/* ── Step: Applying ── */}
          {step === 'applying' && (
            <div className="flex flex-col items-center gap-4 py-12">
              <Loader2 size={32} className="text-amber-500 animate-spin" />
              <p className="text-sm text-gray-600">Creating promotions...</p>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-amber-500 h-2 rounded-full transition-all"
                  style={{ width: `${queue.length > 0 ? (applyProgress / queue.length) * 100 : 0}%` }} />
              </div>
              <p className="text-xs text-gray-400">{applyProgress} of {queue.length}</p>
            </div>
          )}

          {/* ── Step: Done ── */}
          {step === 'done' && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 py-6">
                <CheckCircle2 size={48} className="text-emerald-500" />
                <p className="text-sm font-semibold text-emerald-700">Promotions Created</p>
                <div className="flex items-center gap-3 text-xs">
                  <span className="px-2 py-1 bg-emerald-50 rounded-full text-emerald-700">{successCount} created</span>
                  {failCount > 0 && (
                    <span className="px-2 py-1 bg-red-50 rounded-full text-red-700">{failCount} failed</span>
                  )}
                </div>
              </div>

              {promoResults.length > 0 && (
                <div className="space-y-1">
                  {promoResults.map((r, i) => (
                    <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg ${r.success ? 'bg-emerald-50' : 'bg-red-50'}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 line-clamp-1">{r.description}</p>
                        {r.success && r.sentToPos && <p className="text-[10px] text-emerald-600">Sent to POS</p>}
                        {r.success && r.sentToPos === false && <p className="text-[10px] text-amber-600">Created — manual sync needed</p>}
                        {!r.success && r.message && <p className="text-[10px] text-red-600">{r.message}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={handleClose}
                className="w-full py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg">
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
