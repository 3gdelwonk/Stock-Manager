import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, ScanBarcode, X, Printer, Loader2, Check, Trash2, Plus, Minus, AlertCircle, ChevronDown, RefreshCw, Eye, SkipForward, Megaphone } from 'lucide-react'
import { db } from '../lib/db'
import {
  searchItems, printLabel, generateAndPrintLabels,
  getPrinters, getLabelStyles, getPrintStatus, getLabelQueue, removeFromLabelQueue, markLabelsPrinted,
  printTalkers,
  type PrinterInfo, type LabelStyle, type PrintQueueStatus, type LabelQueueItem,
} from '../lib/jarvis'
import BarcodeScanner from './BarcodeScanner'

interface PrintItem {
  barcode: string
  itemCode: string
  name: string
  department: string
  qty: number
}

interface PrintResult {
  barcode: string
  name: string
  qty: number
  success: boolean
  error?: string
}

type Step = 'build' | 'review' | 'done'
type PrintMode = 'labels' | 'talkers'

const PROMO_TYPES = [
  { id: 'iga_rewards', label: 'IGA Rewards' },
  { id: 'weekly_special', label: 'Weekly Special' },
  { id: 'clearance', label: 'Clearance' },
  { id: 'multibuy', label: 'Multi-Buy' },
]

interface BulkPrintSheetProps {
  open: boolean
  onClose: () => void
}

export default function BulkPrintSheet({ open, onClose }: BulkPrintSheetProps) {
  const [mode, setMode] = useState<PrintMode>('labels')
  const [step, setStep] = useState<Step>('build')

  // Build step — labels
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PrintItem[]>([])
  const [loading, setLoading] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [queue, setQueue] = useState<PrintItem[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [printResults, setPrintResults] = useState<PrintResult[]>([])

  // Build step — talkers
  const [promoType, setPromoType] = useState('iga_rewards')
  const [talkerQueuing, setTalkerQueuing] = useState(false)
  const [talkerQueueResult, setTalkerQueueResult] = useState<{ ok: boolean; created: number; failed: string[]; message?: string } | null>(null)

  // Printer & label style
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [labelStyles, setLabelStyles] = useState<LabelStyle[]>([])
  const [selectedPrinter, setSelectedPrinter] = useState<number | null>(null)
  const [selectedStyle, setSelectedStyle] = useState<number | null>(null)
  const [configLoading, setConfigLoading] = useState(false)
  const [configError, setConfigError] = useState<string | null>(null)

  // Review step — pending queue from server
  const [pendingItems, setPendingItems] = useState<LabelQueueItem[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [removing, setRemoving] = useState<Set<string>>(new Set())

  // Done step
  const [generateResult, setGenerateResult] = useState<{ ok: boolean; generated: number; printed: boolean; message?: string } | null>(null)
  const [printStatus, setPrintStatus] = useState<PrintQueueStatus[]>([])
  const [statusLoading, setStatusLoading] = useState(false)
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load printers and label styles when sheet opens
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setConfigLoading(true)
    setConfigError(null)
    Promise.allSettled([getPrinters(), getLabelStyles()])
      .then(([printersRes, stylesRes]) => {
        if (cancelled) return
        const printerList = printersRes.status === 'fulfilled' && Array.isArray(printersRes.value) ? printersRes.value : []
        const styleList = stylesRes.status === 'fulfilled' && Array.isArray(stylesRes.value) ? stylesRes.value : []
        setPrinters(printerList)
        setLabelStyles(styleList)
        if (printerList.length === 0 && styleList.length === 0) { setConfigError('Could not load printers'); return }
        const labelPrinter = printerList.find(p => p.isLabel) || printerList[0]
        if (labelPrinter) {
          setSelectedPrinter(labelPrinter.id)
          if (labelPrinter.defaultStyleId) setSelectedStyle(labelPrinter.defaultStyleId)
          else {
            const s = styleList.find(s => s.printerId === labelPrinter.id)
            if (s) setSelectedStyle(s.id)
          }
        }
      })
      .finally(() => { if (!cancelled) setConfigLoading(false) })
    return () => { cancelled = true }
  }, [open])

  // Auto-select appropriate printer when mode changes
  useEffect(() => {
    if (printers.length === 0) return
    if (mode === 'talkers') {
      const reportPrinter = printers.find(p => p.isReport && p.queueRunning) || printers.find(p => p.queueRunning) || printers[0]
      if (reportPrinter) setSelectedPrinter(reportPrinter.id)
    } else {
      const labelPrinter = printers.find(p => p.isLabel) || printers[0]
      if (labelPrinter) {
        setSelectedPrinter(labelPrinter.id)
        if (labelPrinter.defaultStyleId) setSelectedStyle(labelPrinter.defaultStyleId)
        else {
          const s = labelStyles.find(s => s.printerId === labelPrinter.id)
          if (s) setSelectedStyle(s.id)
        }
      }
    }
  }, [mode, printers, labelStyles])

  // Poll print status when done
  const fetchPrintStatus = useCallback(async () => {
    setStatusLoading(true)
    try {
      const res = await getPrintStatus()
      if (Array.isArray(res?.printers)) setPrintStatus(res.printers)
    } catch { /* non-fatal */ }
    setStatusLoading(false)
  }, [])

  useEffect(() => {
    if (step !== 'done') {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
      setPrintStatus([])
      return
    }
    fetchPrintStatus()
    function poll() {
      statusTimerRef.current = setTimeout(async () => {
        await fetchPrintStatus()
        poll()
      }, 5000)
    }
    poll()
    return () => { if (statusTimerRef.current) clearTimeout(statusTimerRef.current) }
  }, [step, fetchPrintStatus])

  function handlePrinterChange(printerId: number) {
    setSelectedPrinter(printerId)
    const printer = printers.find(p => p.id === printerId)
    if (printer?.defaultStyleId) setSelectedStyle(printer.defaultStyleId)
    else {
      const match = labelStyles.find(s => s.printerId === printerId)
      setSelectedStyle(match?.id ?? null)
    }
  }

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) { setResults([]); return }
    setLoading(true)
    try {
      const merged = new Map<string, PrintItem>()
      const local = await db.products
        .filter(p => p.name.toLowerCase().includes(trimmed.toLowerCase()) || p.barcode.includes(trimmed) || p.itemCode.includes(trimmed))
        .limit(10).toArray()
      for (const p of local) merged.set(p.itemCode || p.barcode, { barcode: p.barcode, itemCode: p.itemCode, name: p.name, department: p.department, qty: 1 })
      try {
        const jar = await searchItems(trimmed, 10)
        for (const i of jar.items) {
          const key = i.itemCode || i.barcode || ''
          if (!merged.has(key)) merged.set(key, { barcode: i.barcode || '', itemCode: i.itemCode, name: i.description, department: i.department, qty: 1 })
        }
      } catch { /* offline */ }
      setResults(Array.from(merged.values()).slice(0, 10))
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (!open || step !== 'build' || mode !== 'labels') return
    const t = setTimeout(() => doSearch(query), 300)
    return () => clearTimeout(t)
  }, [query, open, doSearch, step, mode])

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep('build'); setMode('labels'); setQuery(''); setResults([]); setQueue([]); setPrintResults([])
      setSelectedPrinter(null); setSelectedStyle(null); setPrinters([]); setLabelStyles([]); setConfigError(null)
      setPendingItems([]); setRemoving(new Set())
      setPrintStatus([]); setGenerateResult(null)
      setPromoType('iga_rewards'); setTalkerQueuing(false); setTalkerQueueResult(null)
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
    }
  }, [open])

  // ── Label queue functions ──
  function addToQueue(item: PrintItem) {
    setQueue(prev => {
      const exists = prev.find(p => p.barcode === item.barcode)
      if (exists) return prev.map(p => p.barcode === item.barcode ? { ...p, qty: p.qty + 1 } : p)
      return [...prev, { ...item, qty: 1 }]
    })
    setQuery(''); setResults([])
  }

  function updateQty(barcode: string, delta: number) {
    setQueue(prev => prev.map(p => p.barcode === barcode ? { ...p, qty: Math.max(1, p.qty + delta) } : p))
  }

  function removeFromQueue(barcode: string) {
    setQueue(prev => prev.filter(p => p.barcode !== barcode))
  }

  function handleScan(code: string) {
    setScannerOpen(false)
    setQuery(code)
  }

  async function handleQueueLabels() {
    setSubmitting(true)
    setPrintResults([])
    const results: PrintResult[] = []
    for (const item of queue) {
      try {
        await printLabel(item.barcode, item.qty, selectedPrinter ?? undefined, selectedStyle ?? undefined)
        results.push({ barcode: item.barcode, name: item.name, qty: item.qty, success: true })
      } catch (err) {
        results.push({ barcode: item.barcode, name: item.name, qty: item.qty, success: false, error: err instanceof Error ? err.message : 'Failed' })
      }
    }
    setPrintResults(results)
    setSubmitting(false)
    if (results.some(r => r.success)) {
      await loadPendingQueue()
      setStep('review')
    }
  }

  // ── Talker queue functions ──
  async function handleQueueTalkers() {
    setTalkerQueuing(true)
    setTalkerQueueResult(null)
    try {
      const res = await printTalkers(promoType)
      setTalkerQueueResult({ ok: res.ok, created: res.created, failed: res.failed, message: res.message })
      if (res.ok && res.created > 0) {
        await loadPendingQueue()
        setStep('review')
      }
    } catch (err) {
      setTalkerQueueResult({ ok: false, created: 0, failed: [], message: err instanceof Error ? err.message : 'Failed to queue talkers' })
    }
    setTalkerQueuing(false)
  }

  // ── Shared review/done functions ──
  async function loadPendingQueue() {
    setPendingLoading(true)
    try {
      const queueType = mode === 'talkers' ? 'talker' : 'label'
      const res = await getLabelQueue(queueType, selectedPrinter ?? undefined)
      if (Array.isArray(res?.items)) setPendingItems(res.items)
      else setPendingItems([])
    } catch { setPendingItems([]) }
    setPendingLoading(false)
  }

  async function handleRemoveFromPending(barcode: string) {
    setRemoving(prev => new Set(prev).add(barcode))
    try {
      await removeFromLabelQueue([barcode])
      setPendingItems(prev => prev.filter(l => l.barcode !== barcode))
    } catch { /* keep in list */ }
    setRemoving(prev => { const n = new Set(prev); n.delete(barcode); return n })
  }

  async function handleSkipItem(barcode: string) {
    setRemoving(prev => new Set(prev).add(barcode))
    try {
      await markLabelsPrinted([barcode])
      setPendingItems(prev => prev.filter(l => l.barcode !== barcode))
    } catch { /* keep in list */ }
    setRemoving(prev => { const n = new Set(prev); n.delete(barcode); return n })
  }

  async function handleGenerateAndPrint() {
    setSubmitting(true)
    setGenerateResult(null)
    try {
      const genRes = await generateAndPrintLabels(selectedPrinter!, selectedStyle ?? undefined)
      setGenerateResult({ ok: genRes.ok, generated: genRes.generated, printed: genRes.printed, message: genRes.message })
    } catch (err) {
      setGenerateResult({ ok: false, generated: 0, printed: false, message: err instanceof Error ? err.message : 'Generate failed' })
    }
    setSubmitting(false)
    setStep('done')
  }

  if (!open) return null

  const isLabels = mode === 'labels'
  const totalLabels = queue.reduce((s, i) => s + i.qty, 0)
  const successCount = printResults.filter(r => r.success).length
  const totalPrinted = printResults.filter(r => r.success).reduce((s, r) => s + r.qty, 0)
  const totalFailed = printResults.filter(r => !r.success).reduce((s, r) => s + r.qty, 0)
  const selectedPrinterName = printers.find(p => p.id === selectedPrinter)?.name || ''
  const selectedStyleName = labelStyles.find(s => s.id === selectedStyle)?.name || ''
  const filteredStyles = selectedPrinter != null ? labelStyles.filter(s => s.printerId === selectedPrinter) : labelStyles
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[90vh] flex flex-col animate-slide-up">
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-2 shrink-0">
          <div className="flex items-center gap-2">
            {isLabels ? <Printer size={18} className="text-rose-600" /> : <Megaphone size={18} className="text-amber-600" />}
            <h2 className="text-base font-semibold text-gray-900">
              {step === 'build' ? 'Bulk Print' : step === 'review' ? 'Review Queue' : 'Print Complete'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {step === 'build' && isLabels && queue.length > 0 && (
              <span className="text-xs font-medium text-gray-400">{queue.length} items, {totalLabels} labels</span>
            )}
            {step === 'review' && (
              <span className="text-xs font-medium text-gray-400">{pendingItems.length} pending</span>
            )}
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={20} /></button>
          </div>
        </div>

        {/* Mode toggle — only in build step */}
        {step === 'build' && (
          <div className="flex mx-4 mb-3 bg-gray-100 rounded-lg p-0.5 shrink-0">
            <button
              onClick={() => setMode('labels')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold transition-colors ${
                isLabels ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              <Printer size={14} /> Labels
            </button>
            <button
              onClick={() => setMode('talkers')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold transition-colors ${
                !isLabels ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              <Megaphone size={14} /> Talkers
            </button>
          </div>
        )}

        {/* ═══════════════ STEP: BUILD — LABELS ═══════════════ */}
        {step === 'build' && isLabels && (
          <>
            {/* Search bar */}
            <div className="px-4 py-2 shrink-0">
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

            {/* Search results */}
            {results.length > 0 && (
              <div className="px-4 pb-2 max-h-[200px] overflow-y-auto border-b border-gray-100">
                {loading && <p className="text-xs text-gray-400 text-center py-2 animate-pulse">Searching...</p>}
                {results.map((item, idx) => (
                  <button key={`${item.itemCode}-${idx}`} onClick={() => addToQueue(item)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded-lg flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                      <p className="text-xs text-gray-500">{item.department} · {item.barcode}</p>
                    </div>
                    <Plus size={16} className="text-emerald-600 shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            )}

            {/* Local queue */}
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
              {queue.length === 0 ? (
                <div className="py-8 text-center">
                  <Printer size={24} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Search or scan products to add to print queue</p>
                </div>
              ) : (
                queue.map(item => (
                  <div key={item.barcode} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                      <p className="text-[10px] text-gray-400 font-mono">{item.barcode}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => updateQty(item.barcode, -1)} className="p-1 text-gray-400 hover:text-gray-600"><Minus size={14} /></button>
                      <span className="text-sm font-bold text-gray-900 w-6 text-center">{item.qty}</span>
                      <button onClick={() => updateQty(item.barcode, 1)} className="p-1 text-gray-400 hover:text-gray-600"><Plus size={14} /></button>
                    </div>
                    <button onClick={() => removeFromQueue(item.barcode)} className="p-1 text-red-400 hover:text-red-600 shrink-0"><Trash2 size={14} /></button>
                  </div>
                ))
              )}
            </div>

            {/* Printer & Style + Queue button */}
            {queue.length > 0 && (
              <div className="px-4 py-3 border-t border-gray-100 shrink-0 space-y-3">
                {configLoading ? (
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Loader2 size={12} className="animate-spin" /> Loading printers...
                  </div>
                ) : configError ? (
                  <div className="flex items-center gap-2 text-xs text-amber-600">
                    <AlertCircle size={12} /><span>{configError} — will use default</span>
                  </div>
                ) : (printers.length > 0 || labelStyles.length > 0) ? (
                  <div className="grid grid-cols-2 gap-2">
                    {printers.length > 0 && (
                      <div>
                        <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Printer</label>
                        <div className="relative mt-0.5">
                          <select value={selectedPrinter ?? ''} onChange={e => handlePrinterChange(Number(e.target.value))}
                            className="w-full appearance-none border border-gray-200 rounded-lg px-2.5 py-1.5 pr-7 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400">
                            {printers.map(p => (
                              <option key={p.id} value={p.id}>{p.name}{!p.queueRunning ? ' (offline)' : ''}</option>
                            ))}
                          </select>
                          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        </div>
                      </div>
                    )}
                    {filteredStyles.length > 0 && (
                      <div>
                        <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Label Style</label>
                        <div className="relative mt-0.5">
                          <select value={selectedStyle ?? ''} onChange={e => setSelectedStyle(Number(e.target.value))}
                            className="w-full appearance-none border border-gray-200 rounded-lg px-2.5 py-1.5 pr-7 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400">
                            {filteredStyles.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}

                <button onClick={handleQueueLabels} disabled={submitting}
                  className="w-full py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting ? <><Loader2 size={16} className="animate-spin" /> Queuing {totalLabels} labels...</>
                    : <><Eye size={16} /> Queue {totalLabels} Labels & Review</>}
                </button>
              </div>
            )}
          </>
        )}

        {/* ═══════════════ STEP: BUILD — TALKERS ═══════════════ */}
        {step === 'build' && !isLabels && (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            <div className="py-3 text-center">
              <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-2">
                <Megaphone size={28} className="text-amber-600" />
              </div>
              <p className="text-sm font-medium text-gray-700">Queue promotion talkers for printing</p>
              <p className="text-xs text-gray-400 mt-0.5">Review items before sending to printer</p>
            </div>

            {/* Promo type */}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Promotion Type</label>
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                {PROMO_TYPES.map(pt => (
                  <button key={pt.id} onClick={() => setPromoType(pt.id)}
                    className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                      promoType === pt.id
                        ? 'border-amber-500 bg-amber-50 text-amber-700'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}>
                    {pt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Printer */}
            {configLoading ? (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Loader2 size={12} className="animate-spin" /> Loading printers...
              </div>
            ) : printers.length > 0 ? (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Printer</label>
                <div className="relative mt-1">
                  <select value={selectedPrinter ?? ''} onChange={e => setSelectedPrinter(Number(e.target.value))}
                    className="w-full appearance-none border border-gray-200 rounded-lg px-3 py-2 pr-8 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-amber-400">
                    {printers.map(p => (
                      <option key={p.id} value={p.id}>{p.name}{!p.queueRunning ? ' (offline)' : ''}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
            ) : null}

            {/* Queue result error */}
            {talkerQueueResult && !talkerQueueResult.ok && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-700 rounded-lg text-sm">
                <AlertCircle size={14} /><span>{talkerQueueResult.message}</span>
              </div>
            )}
            {talkerQueueResult?.ok && talkerQueueResult.created === 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 text-amber-700 rounded-lg text-sm">
                <AlertCircle size={14} /><span>No talkers to queue for this promotion type</span>
              </div>
            )}

            <button onClick={handleQueueTalkers} disabled={talkerQueuing || !selectedPrinter}
              className="w-full py-2.5 bg-amber-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
              {talkerQueuing ? <><Loader2 size={16} className="animate-spin" /> Queuing talkers...</>
                : <><Megaphone size={16} /> Queue Talkers & Review</>}
            </button>
          </div>
        )}

        {/* ═══════════════ STEP: REVIEW ═══════════════ */}
        {step === 'review' && (
          <>
            {/* Label queue results from step 1 */}
            {isLabels && printResults.some(r => !r.success) && (
              <div className="px-4 pt-3 shrink-0">
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg text-xs text-amber-700">
                  <AlertCircle size={12} />
                  <span>{totalFailed} label{totalFailed !== 1 ? 's' : ''} failed to queue — {successCount} queued successfully</span>
                </div>
              </div>
            )}

            {/* Talker queue results */}
            {!isLabels && talkerQueueResult?.ok && (
              <div className="px-4 pt-3 shrink-0">
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg text-xs text-emerald-700">
                  <Check size={12} />
                  <span>{talkerQueueResult.created} talker{talkerQueueResult.created !== 1 ? 's' : ''} queued</span>
                  {talkerQueueResult.failed.length > 0 && (
                    <span className="text-amber-600 ml-1">({talkerQueueResult.failed.length} failed)</span>
                  )}
                </div>
              </div>
            )}

            {/* Pending items from server */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {isLabels ? 'Pending Labels' : `Talkers to Print (${pendingItems.length})`}
                </p>
                <button onClick={loadPendingQueue} disabled={pendingLoading}
                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50">
                  <RefreshCw size={12} className={pendingLoading ? 'animate-spin' : ''} />
                </button>
              </div>

              {pendingLoading && pendingItems.length === 0 && (
                <div className="py-6 text-center">
                  <Loader2 size={20} className="text-gray-300 mx-auto mb-2 animate-spin" />
                  <p className="text-xs text-gray-400">Loading queue...</p>
                </div>
              )}

              {!pendingLoading && pendingItems.length === 0 && (
                <div className="py-6 text-center">
                  <Check size={20} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">No pending items in queue</p>
                </div>
              )}

              {pendingItems.map(item => {
                const discount = !isLabels && item.normalPrice > 0
                  ? Math.round((1 - item.sellPrice / item.normalPrice) * 100)
                  : 0
                return (
                  <div key={item.barcode} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.description}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-gray-400 font-mono">{item.barcode}</span>
                        {isLabels && <span className="text-[10px] text-gray-400">×{item.count}</span>}
                        <span className={`text-[10px] font-medium ${!isLabels ? 'font-bold text-amber-600' : 'text-gray-600'}`}>${item.sellPrice.toFixed(2)}</span>
                        {!isLabels && item.normalPrice > item.sellPrice && (
                          <>
                            <span className="text-[10px] text-gray-400 line-through">${item.normalPrice.toFixed(2)}</span>
                            <span className="text-[10px] font-bold text-emerald-600">{discount}% off</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => handleSkipItem(item.barcode)} disabled={removing.has(item.barcode)}
                        title="Skip (mark as printed)" className="p-1.5 text-gray-400 hover:text-amber-600 disabled:opacity-50 rounded">
                        <SkipForward size={13} />
                      </button>
                      <button onClick={() => handleRemoveFromPending(item.barcode)} disabled={removing.has(item.barcode)}
                        title="Remove from queue" className="p-1.5 text-red-400 hover:text-red-600 disabled:opacity-50 rounded">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Generate & Print button */}
            <div className="px-4 py-3 border-t border-gray-100 shrink-0 space-y-2">
              {selectedPrinterName && (
                <div className="flex items-center gap-3 text-[10px] text-gray-500">
                  <span>Printer: <span className="font-medium text-gray-700">{selectedPrinterName}</span></span>
                  {isLabels && selectedStyleName && <span>Style: <span className="font-medium text-gray-700">{selectedStyleName}</span></span>}
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => setStep('build')}
                  className="flex-1 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg">
                  Back
                </button>
                <button onClick={handleGenerateAndPrint} disabled={submitting || pendingItems.length === 0}
                  className={`flex-[2] py-2.5 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 ${
                    isLabels ? 'bg-emerald-600' : 'bg-amber-500'
                  }`}>
                  {submitting ? <><Loader2 size={16} className="animate-spin" /> Generating &amp; Printing...</>
                    : <><Printer size={16} /> Print {pendingItems.length} {isLabels ? 'Labels' : 'Talkers'}</>}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ═══════════════ STEP: DONE ═══════════════ */}
        {step === 'done' && (
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            <div className="flex flex-col items-center py-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${generateResult?.ok ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                {generateResult?.ok ? <Check size={24} className="text-emerald-600" /> : <AlertCircle size={24} className="text-amber-600" />}
              </div>
              <p className="text-sm font-semibold text-gray-900">
                {generateResult?.ok
                  ? `${generateResult.generated} ${isLabels ? 'label' : 'talker'}${generateResult.generated !== 1 ? 's' : ''} generated${generateResult.printed ? ' & printed' : ''}`
                  : 'Print job completed with issues'}
              </p>
              {generateResult?.message && (
                <p className="text-xs text-gray-500 mt-1">{generateResult.message}</p>
              )}
            </div>

            {/* Summary card */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Print Job Summary</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-gray-400">Queued</p>
                  <p className="text-sm font-bold text-gray-900">
                    {isLabels ? `${totalPrinted} labels` : `${talkerQueueResult?.created ?? 0} talkers`}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400">Generated</p>
                  <p className="text-sm font-bold text-emerald-600">{generateResult?.generated ?? 0}</p>
                </div>
                {isLabels && totalFailed > 0 && (
                  <div>
                    <p className="text-[10px] text-gray-400">Queue Failures</p>
                    <p className="text-sm font-bold text-red-600">{totalFailed}</p>
                  </div>
                )}
                {!isLabels && (
                  <div>
                    <p className="text-[10px] text-gray-400">Promo Type</p>
                    <p className="text-sm font-medium text-gray-900">{PROMO_TYPES.find(p => p.id === promoType)?.label ?? promoType}</p>
                  </div>
                )}
                {selectedPrinterName && (
                  <div>
                    <p className="text-[10px] text-gray-400">Printer</p>
                    <p className="text-sm font-medium text-gray-900 truncate">{selectedPrinterName}</p>
                  </div>
                )}
                {isLabels && selectedStyleName && (
                  <div>
                    <p className="text-[10px] text-gray-400">Label Style</p>
                    <p className="text-sm font-medium text-gray-900 truncate">{selectedStyleName}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Per-item queue results (labels only) */}
            {isLabels && printResults.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Queued Items</p>
                {printResults.map(r => (
                  <div key={r.barcode} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${r.success ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    <div className="min-w-0 flex-1">
                      <span className={`truncate ${r.success ? 'text-emerald-700' : 'text-red-700'}`}>{r.name}</span>
                    </div>
                    <span className={`text-xs font-medium shrink-0 ml-2 ${r.success ? 'text-emerald-600' : 'text-red-600'}`}>
                      {r.success ? `×${r.qty} queued` : r.error}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Live printer queue status */}
            {printStatus.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Printer Queues</p>
                  {statusLoading ? <Loader2 size={10} className="animate-spin text-gray-400" />
                    : <button onClick={fetchPrintStatus} className="p-0.5 text-gray-400 hover:text-gray-600"><RefreshCw size={10} /></button>}
                </div>
                {printStatus.map(pq => {
                  const progress = pq.labels.total > 0 ? Math.round((pq.labels.printed / pq.labels.total) * 100) : 0
                  const hasPending = pq.labels.pending > 0
                  return (
                    <div key={pq.queueId} className="bg-gray-50 rounded-lg px-3 py-2.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${pq.status === 'running' ? 'bg-emerald-500' : 'bg-red-400'}`} />
                          <span className="text-xs font-medium text-gray-900">{pq.name.replace(/^Print:\s*/, '')}</span>
                        </div>
                        <span className="text-[10px] text-gray-400">{pq.status}</span>
                      </div>
                      {pq.labels.total > 0 && (
                        <>
                          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-500 ${hasPending ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              style={{ width: `${progress}%` }} />
                          </div>
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-gray-500">{pq.labels.printed}/{pq.labels.total} printed</span>
                            {hasPending && <span className="text-amber-600 font-medium">{pq.labels.pending} pending</span>}
                          </div>
                        </>
                      )}
                      {pq.lastError && (
                        <p className="text-[10px] text-red-500 truncate">Last error: {new Date(pq.lastError).toLocaleTimeString()}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <button onClick={onClose} className="w-full py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg mt-2">Done</button>
          </div>
        )}
      </div>
      <BarcodeScanner open={scannerOpen} onScan={handleScan} onClose={() => setScannerOpen(false)} />
    </>
  )
}
