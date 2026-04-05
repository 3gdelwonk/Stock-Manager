import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Printer, Loader2, Check, Trash2, AlertCircle, ChevronDown, RefreshCw, SkipForward, Megaphone } from 'lucide-react'
import {
  printTalkers, generateAndPrintLabels, getPrinters, getLabelQueue,
  removeFromLabelQueue, markLabelsPrinted, getPrintStatus,
  type PrinterInfo, type LabelQueueItem, type PrintQueueStatus,
} from '../lib/jarvis'

type Step = 'config' | 'review' | 'done'

interface TalkerPrintSheetProps {
  open: boolean
  onClose: () => void
}

const PROMO_TYPES = [
  { id: 'iga_rewards', label: 'IGA Rewards' },
  { id: 'weekly_special', label: 'Weekly Special' },
  { id: 'clearance', label: 'Clearance' },
  { id: 'multibuy', label: 'Multi-Buy' },
]

export default function TalkerPrintSheet({ open, onClose }: TalkerPrintSheetProps) {
  const [step, setStep] = useState<Step>('config')

  // Config
  const [promoType, setPromoType] = useState('iga_rewards')
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [selectedPrinter, setSelectedPrinter] = useState<number | null>(null)
  const [configLoading, setConfigLoading] = useState(false)
  const [queuing, setQueuing] = useState(false)
  const [queueResult, setQueueResult] = useState<{ ok: boolean; created: number; failed: string[]; message?: string } | null>(null)

  // Review
  const [pendingTalkers, setPendingTalkers] = useState<LabelQueueItem[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [removing, setRemoving] = useState<Set<string>>(new Set())

  // Done
  const [generating, setGenerating] = useState(false)
  const [generateResult, setGenerateResult] = useState<{ ok: boolean; generated: number; printed: boolean; message?: string } | null>(null)
  const [printStatus, setPrintStatus] = useState<PrintQueueStatus[]>([])
  const [statusLoading, setStatusLoading] = useState(false)
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load printers
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setConfigLoading(true)
    getPrinters()
      .then(data => {
        if (cancelled) return
        const list = Array.isArray(data) ? data : []
        setPrinters(list)
        // Default to the report/A4 printer (typically EPSON for talkers)
        const reportPrinter = list.find(p => p.isReport && p.queueRunning) || list.find(p => p.queueRunning) || list[0]
        if (reportPrinter) setSelectedPrinter(reportPrinter.id)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setConfigLoading(false) })
    return () => { cancelled = true }
  }, [open])

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
      statusTimerRef.current = setTimeout(async () => { await fetchPrintStatus(); poll() }, 5000)
    }
    poll()
    return () => { if (statusTimerRef.current) clearTimeout(statusTimerRef.current) }
  }, [step, fetchPrintStatus])

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep('config'); setPromoType('iga_rewards'); setQueueResult(null)
      setPendingTalkers([]); setRemoving(new Set())
      setGenerateResult(null); setPrintStatus([])
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
    }
  }, [open])

  async function handleQueueTalkers() {
    setQueuing(true)
    setQueueResult(null)
    try {
      const res = await printTalkers(promoType)
      setQueueResult({ ok: res.ok, created: res.created, failed: res.failed, message: res.message })
      if (res.ok && res.created > 0) {
        await loadPendingTalkers()
        setStep('review')
      }
    } catch (err) {
      setQueueResult({ ok: false, created: 0, failed: [], message: err instanceof Error ? err.message : 'Failed to queue talkers' })
    }
    setQueuing(false)
  }

  async function loadPendingTalkers() {
    setPendingLoading(true)
    try {
      const res = await getLabelQueue('talker')
      if (Array.isArray(res?.items)) setPendingTalkers(res.items)
      else setPendingTalkers([])
    } catch { setPendingTalkers([]) }
    setPendingLoading(false)
  }

  async function handleRemove(barcode: string) {
    setRemoving(prev => new Set(prev).add(barcode))
    try {
      await removeFromLabelQueue([barcode])
      setPendingTalkers(prev => prev.filter(t => t.barcode !== barcode))
    } catch { /* keep */ }
    setRemoving(prev => { const n = new Set(prev); n.delete(barcode); return n })
  }

  async function handleSkip(barcode: string) {
    setRemoving(prev => new Set(prev).add(barcode))
    try {
      await markLabelsPrinted([barcode])
      setPendingTalkers(prev => prev.filter(t => t.barcode !== barcode))
    } catch { /* keep */ }
    setRemoving(prev => { const n = new Set(prev); n.delete(barcode); return n })
  }

  async function handleGenerateAndPrint() {
    if (selectedPrinter == null) return
    setGenerating(true)
    setGenerateResult(null)
    try {
      const res = await generateAndPrintLabels(selectedPrinter)
      setGenerateResult({ ok: res.ok, generated: res.generated, printed: res.printed, message: res.message })
    } catch (err) {
      setGenerateResult({ ok: false, generated: 0, printed: false, message: err instanceof Error ? err.message : 'Failed' })
    }
    setGenerating(false)
    setStep('done')
  }

  if (!open) return null

  const selectedPrinterName = printers.find(p => p.id === selectedPrinter)?.name || ''

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col animate-slide-up">
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <Megaphone size={18} className="text-amber-600" />
            <h2 className="text-base font-semibold text-gray-900">
              {step === 'config' ? 'Print Talkers' : step === 'review' ? 'Review Talker Queue' : 'Talkers Printed'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {step === 'review' && <span className="text-xs font-medium text-gray-400">{pendingTalkers.length} pending</span>}
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={20} /></button>
          </div>
        </div>

        {/* ═══ CONFIG ═══ */}
        {step === 'config' && (
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            <div className="py-4 text-center">
              <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Megaphone size={32} className="text-amber-600" />
              </div>
              <p className="text-sm font-medium text-gray-700">Queue all promotion talkers for printing</p>
              <p className="text-xs text-gray-400 mt-1">Review and remove items before sending to printer</p>
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
            {queueResult && !queueResult.ok && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-700 rounded-lg text-sm">
                <AlertCircle size={14} /><span>{queueResult.message}</span>
              </div>
            )}
            {queueResult?.ok && queueResult.created === 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 text-amber-700 rounded-lg text-sm">
                <AlertCircle size={14} /><span>No talkers to queue for this promotion type</span>
              </div>
            )}

            <button onClick={handleQueueTalkers} disabled={queuing || !selectedPrinter}
              className="w-full py-2.5 bg-amber-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
              {queuing ? <><Loader2 size={16} className="animate-spin" /> Queuing talkers...</>
                : <><Megaphone size={16} /> Queue Talkers & Review</>}
            </button>
          </div>
        )}

        {/* ═══ REVIEW ═══ */}
        {step === 'review' && (
          <>
            {/* Queue summary */}
            {queueResult && queueResult.ok && (
              <div className="px-4 pt-3 shrink-0">
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg text-xs text-emerald-700">
                  <Check size={12} />
                  <span>{queueResult.created} talker{queueResult.created !== 1 ? 's' : ''} queued</span>
                  {queueResult.failed.length > 0 && (
                    <span className="text-amber-600 ml-1">({queueResult.failed.length} failed)</span>
                  )}
                </div>
              </div>
            )}

            {/* Pending talkers list */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Talkers to Print ({pendingTalkers.length})
                </p>
                <button onClick={loadPendingTalkers} disabled={pendingLoading}
                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50">
                  <RefreshCw size={12} className={pendingLoading ? 'animate-spin' : ''} />
                </button>
              </div>

              {pendingLoading && pendingTalkers.length === 0 && (
                <div className="py-6 text-center">
                  <Loader2 size={20} className="text-gray-300 mx-auto mb-2 animate-spin" />
                  <p className="text-xs text-gray-400">Loading talker queue...</p>
                </div>
              )}

              {!pendingLoading && pendingTalkers.length === 0 && (
                <div className="py-6 text-center">
                  <Check size={20} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">No pending talkers</p>
                </div>
              )}

              {pendingTalkers.map(talker => {
                const discount = talker.normalPrice > 0
                  ? Math.round((1 - talker.sellPrice / talker.normalPrice) * 100)
                  : 0
                return (
                  <div key={talker.barcode} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{talker.description}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-gray-400 font-mono">{talker.barcode}</span>
                        <span className="text-[10px] font-bold text-amber-600">${talker.sellPrice.toFixed(2)}</span>
                        {talker.normalPrice > talker.sellPrice && (
                          <>
                            <span className="text-[10px] text-gray-400 line-through">${talker.normalPrice.toFixed(2)}</span>
                            <span className="text-[10px] font-bold text-emerald-600">{discount}% off</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => handleSkip(talker.barcode)} disabled={removing.has(talker.barcode)}
                        title="Skip" className="p-1.5 text-gray-400 hover:text-amber-600 disabled:opacity-50 rounded">
                        <SkipForward size={13} />
                      </button>
                      <button onClick={() => handleRemove(talker.barcode)} disabled={removing.has(talker.barcode)}
                        title="Remove" className="p-1.5 text-red-400 hover:text-red-600 disabled:opacity-50 rounded">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Print button */}
            <div className="px-4 py-3 border-t border-gray-100 shrink-0 space-y-2">
              {selectedPrinterName && (
                <p className="text-[10px] text-gray-500">Printer: <span className="font-medium text-gray-700">{selectedPrinterName}</span></p>
              )}
              <div className="flex gap-2">
                <button onClick={() => setStep('config')}
                  className="flex-1 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg">Back</button>
                <button onClick={handleGenerateAndPrint} disabled={generating || pendingTalkers.length === 0}
                  className="flex-[2] py-2.5 bg-amber-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                  {generating ? <><Loader2 size={16} className="animate-spin" /> Printing...</>
                    : <><Printer size={16} /> Print {pendingTalkers.length} Talkers</>}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ═══ DONE ═══ */}
        {step === 'done' && (
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            <div className="flex flex-col items-center py-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${generateResult?.ok ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                {generateResult?.ok ? <Check size={24} className="text-emerald-600" /> : <AlertCircle size={24} className="text-amber-600" />}
              </div>
              <p className="text-sm font-semibold text-gray-900">
                {generateResult?.ok
                  ? `${generateResult.generated} talker${generateResult.generated !== 1 ? 's' : ''} generated${generateResult.printed ? ' & printed' : ''}`
                  : 'Print completed with issues'}
              </p>
              {generateResult?.message && <p className="text-xs text-gray-500 mt-1">{generateResult.message}</p>}
            </div>

            {/* Summary */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Summary</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-gray-400">Queued</p>
                  <p className="text-sm font-bold text-gray-900">{queueResult?.created ?? 0}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400">Generated</p>
                  <p className="text-sm font-bold text-emerald-600">{generateResult?.generated ?? 0}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400">Promo Type</p>
                  <p className="text-sm font-medium text-gray-900">{PROMO_TYPES.find(p => p.id === promoType)?.label ?? promoType}</p>
                </div>
                {selectedPrinterName && (
                  <div>
                    <p className="text-[10px] text-gray-400">Printer</p>
                    <p className="text-sm font-medium text-gray-900 truncate">{selectedPrinterName}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Printer queue status */}
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
                    </div>
                  )
                })}
              </div>
            )}

            <button onClick={onClose} className="w-full py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg mt-2">Done</button>
          </div>
        )}
      </div>
    </>
  )
}
