import { useState, useEffect, useCallback } from 'react'
import { Search, ScanBarcode, X, Printer, Loader2, Check, Trash2, Plus, Minus, AlertCircle, ChevronDown } from 'lucide-react'
import { db } from '../lib/db'
import { searchItems, printLabel, getPrinters, getLabelStyles, type PrinterInfo, type LabelStyle } from '../lib/jarvis'
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

interface BulkPrintSheetProps {
  open: boolean
  onClose: () => void
}

export default function BulkPrintSheet({ open, onClose }: BulkPrintSheetProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PrintItem[]>([])
  const [loading, setLoading] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [queue, setQueue] = useState<PrintItem[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [printResults, setPrintResults] = useState<PrintResult[]>([])
  const [done, setDone] = useState(false)

  // Printer & label style state
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [labelStyles, setLabelStyles] = useState<LabelStyle[]>([])
  const [selectedPrinter, setSelectedPrinter] = useState<number | null>(null)
  const [selectedStyle, setSelectedStyle] = useState<number | null>(null)
  const [configLoading, setConfigLoading] = useState(false)
  const [configError, setConfigError] = useState<string | null>(null)

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

        if (printerList.length === 0 && styleList.length === 0) {
          setConfigError('Could not load printers')
          return
        }

        // Default to first label printer
        const labelPrinter = printerList.find(p => p.isLabel) || printerList[0]
        if (labelPrinter) {
          setSelectedPrinter(labelPrinter.id)
          // Auto-select the printer's default style
          if (labelPrinter.defaultStyleId) {
            setSelectedStyle(labelPrinter.defaultStyleId)
          } else {
            const printerStyle = styleList.find(s => s.printerId === labelPrinter.id)
            if (printerStyle) setSelectedStyle(printerStyle.id)
          }
        }
      })
      .finally(() => { if (!cancelled) setConfigLoading(false) })
    return () => { cancelled = true }
  }, [open])

  // When printer changes, auto-select matching style
  function handlePrinterChange(printerId: number) {
    setSelectedPrinter(printerId)
    const printer = printers.find(p => p.id === printerId)
    if (printer?.defaultStyleId) {
      setSelectedStyle(printer.defaultStyleId)
    } else {
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
      for (const p of local) {
        merged.set(p.itemCode || p.barcode, { barcode: p.barcode, itemCode: p.itemCode, name: p.name, department: p.department, qty: 1 })
      }
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
    if (!open) return
    const t = setTimeout(() => doSearch(query), 300)
    return () => clearTimeout(t)
  }, [query, open, doSearch])

  useEffect(() => {
    if (!open) {
      setQuery(''); setResults([]); setQueue([]); setPrintResults([]); setDone(false)
      setSelectedPrinter(null); setSelectedStyle(null); setPrinters([]); setLabelStyles([]); setConfigError(null)
    }
  }, [open])

  function addToQueue(item: PrintItem) {
    setQueue(prev => {
      const exists = prev.find(p => p.barcode === item.barcode)
      if (exists) return prev.map(p => p.barcode === item.barcode ? { ...p, qty: p.qty + 1 } : p)
      return [...prev, { ...item, qty: 1 }]
    })
    setQuery('')
    setResults([])
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

  async function handleSubmit() {
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
    setDone(true)
  }

  if (!open) return null

  const totalLabels = queue.reduce((s, i) => s + i.qty, 0)
  const successCount = printResults.filter(r => r.success).length
  const totalPrinted = printResults.filter(r => r.success).reduce((s, r) => s + r.qty, 0)
  const totalFailed = printResults.filter(r => !r.success).reduce((s, r) => s + r.qty, 0)
  const selectedPrinterName = printers.find(p => p.id === selectedPrinter)?.name || ''
  const selectedStyleName = labelStyles.find(s => s.id === selectedStyle)?.name || ''

  // Label styles filtered to selected printer
  const filteredStyles = selectedPrinter != null
    ? labelStyles.filter(s => s.printerId === selectedPrinter)
    : labelStyles

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col animate-slide-up">
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <Printer size={18} className="text-rose-600" />
            <h2 className="text-base font-semibold text-gray-900">Bulk Print Labels</h2>
          </div>
          <div className="flex items-center gap-2">
            {queue.length > 0 && !done && (
              <span className="text-xs font-medium text-gray-400">{queue.length} items, {totalLabels} labels</span>
            )}
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={20} /></button>
          </div>
        </div>

        {done ? (
          /* ── Job Summary ── */
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            <div className="flex flex-col items-center py-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${successCount === queue.length ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                {successCount === queue.length ? <Check size={24} className="text-emerald-600" /> : <AlertCircle size={24} className="text-amber-600" />}
              </div>
              <p className="text-sm font-semibold text-gray-900">
                {successCount === queue.length ? 'All labels sent to printer' : `${successCount}/${queue.length} items sent`}
              </p>
            </div>

            {/* Summary card */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Print Job Summary</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-gray-400">Products</p>
                  <p className="text-sm font-bold text-gray-900">{queue.length}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400">Labels Printed</p>
                  <p className="text-sm font-bold text-emerald-600">{totalPrinted}</p>
                </div>
                {totalFailed > 0 && (
                  <div>
                    <p className="text-[10px] text-gray-400">Labels Failed</p>
                    <p className="text-sm font-bold text-red-600">{totalFailed}</p>
                  </div>
                )}
                {selectedPrinterName && (
                  <div>
                    <p className="text-[10px] text-gray-400">Printer</p>
                    <p className="text-sm font-medium text-gray-900 truncate">{selectedPrinterName}</p>
                  </div>
                )}
                {selectedStyleName && (
                  <div>
                    <p className="text-[10px] text-gray-400">Label Style</p>
                    <p className="text-sm font-medium text-gray-900 truncate">{selectedStyleName}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Per-item results */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Items</p>
              {printResults.map(r => (
                <div key={r.barcode} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${r.success ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <div className="min-w-0 flex-1">
                    <span className={`truncate ${r.success ? 'text-emerald-700' : 'text-red-700'}`}>{r.name}</span>
                  </div>
                  <span className={`text-xs font-medium shrink-0 ml-2 ${r.success ? 'text-emerald-600' : 'text-red-600'}`}>
                    {r.success ? `${r.qty} label${r.qty > 1 ? 's' : ''} sent` : r.error}
                  </span>
                </div>
              ))}
            </div>

            <button onClick={onClose} className="w-full py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg mt-2">Done</button>
          </div>
        ) : (
          <>
            {/* Search bar */}
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

            {/* Queue */}
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

            {/* Printer & Style selection + Submit */}
            {queue.length > 0 && (
              <div className="px-4 py-3 border-t border-gray-100 shrink-0 space-y-3">
                {configLoading ? (
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Loader2 size={12} className="animate-spin" />
                    Loading printers...
                  </div>
                ) : configError ? (
                  <div className="flex items-center gap-2 text-xs text-amber-600">
                    <AlertCircle size={12} />
                    <span>{configError} — will use default</span>
                  </div>
                ) : (printers.length > 0 || labelStyles.length > 0) ? (
                  <div className="grid grid-cols-2 gap-2">
                    {printers.length > 0 && (
                      <div>
                        <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Printer</label>
                        <div className="relative mt-0.5">
                          <select
                            value={selectedPrinter ?? ''}
                            onChange={e => handlePrinterChange(Number(e.target.value))}
                            className="w-full appearance-none border border-gray-200 rounded-lg px-2.5 py-1.5 pr-7 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
                          >
                            {printers.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name}{!p.queueRunning ? ' (offline)' : ''}
                              </option>
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
                          <select
                            value={selectedStyle ?? ''}
                            onChange={e => setSelectedStyle(Number(e.target.value))}
                            className="w-full appearance-none border border-gray-200 rounded-lg px-2.5 py-1.5 pr-7 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
                          >
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

                <button onClick={handleSubmit} disabled={submitting}
                  className="w-full py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting ? <><Loader2 size={16} className="animate-spin" /> Printing {totalLabels} labels...</> : <><Printer size={16} /> Print {totalLabels} Labels</>}
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
