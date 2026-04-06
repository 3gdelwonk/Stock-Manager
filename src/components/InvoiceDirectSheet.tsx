import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Camera, Upload, Loader2, AlertCircle, CheckCircle2, ArrowRight, Search, FileText, ChevronDown, ChevronUp } from 'lucide-react'
import { parseInvoice, searchItems, changeAndSend, type StockItem, type ParsedInvoiceLine, type ChangeAndSendResponse } from '../lib/jarvis'
import { db } from '../lib/db'

interface Props {
  open: boolean
  onClose: () => void
}

type Step = 'capture' | 'parsing' | 'matching' | 'review' | 'applying' | 'done'

interface MatchedLine {
  parsed: ParsedInvoiceLine
  match: StockItem | null
  newSellPrice: number
  included: boolean
  manualSearchOpen?: boolean
  manualSearchQuery?: string
  manualSearchResults?: StockItem[]
  manualSearching?: boolean
}

interface ApplyResult {
  description: string
  barcode: string
  oldPrice: number
  newPrice: number
  success: boolean
  message?: string
}

export default function InvoiceDirectSheet({ open, onClose }: Props) {
  const [step, setStep] = useState<Step>('capture')
  const [imageData, setImageData] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Parse results
  const [supplier, setSupplier] = useState<string>('')
  const [invoiceNumber, setInvoiceNumber] = useState<string>('')
  const [lines, setLines] = useState<MatchedLine[]>([])

  // Apply results
  const [applyProgress, setApplyProgress] = useState(0)
  const [applyTotal, setApplyTotal] = useState(0)
  const [results, setResults] = useState<ApplyResult[]>([])

  // Camera refs
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Reset ───────────────────────────────────────────────────────────────
  function reset() {
    setStep('capture')
    setImageData(null)
    setError(null)
    setSupplier('')
    setInvoiceNumber('')
    setLines([])
    setApplyProgress(0)
    setApplyTotal(0)
    setResults([])
    stopCamera()
  }

  function handleClose() {
    reset()
    onClose()
  }

  // ── Camera ──────────────────────────────────────────────────────────────
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setCameraActive(false)
    setCameraReady(false)
  }

  async function startCamera() {
    setError(null)
    setCameraActive(true)   // render the <video> element first
    setCameraReady(false)
  }

  // Attach stream once the video element exists (cameraActive triggers render)
  useEffect(() => {
    if (!cameraActive || imageData) return
    let cancelled = false

    // Small delay to ensure the video element is mounted
    const id = setTimeout(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        })
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          // Wait for video to actually start playing
          videoRef.current.onloadedmetadata = () => {
            if (!cancelled) setCameraReady(true)
          }
        }
      } catch (err) {
        if (!cancelled) {
          setCameraActive(false)
          setError('Camera not available — check permissions or try Upload instead')
          console.warn('Camera error:', err)
        }
      }
    }, 50)

    return () => {
      cancelled = true
      clearTimeout(id)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
    }
  }, [cameraActive, imageData])

  // Stop camera on unmount / close
  useEffect(() => {
    if (!open) stopCamera()
    return () => stopCamera()
  }, [open])

  function capturePhoto() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    // Ensure we have actual video dimensions
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setError('Camera not ready yet — wait a moment and try again')
      return
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)

    const base64 = canvas.toDataURL('image/jpeg', 0.85)
    setImageData(base64)
    stopCamera()
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setImageData(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  // ── Parse & Match ───────────────────────────────────────────────────────
  async function handleParse() {
    if (!imageData) return
    setError(null)
    setStep('parsing')

    try {
      const result = await parseInvoice(imageData)
      setSupplier(result.supplier || '')
      setInvoiceNumber(result.invoiceNumber || '')

      if (!result.lines || result.lines.length === 0) {
        setError('No items found in invoice. Try retaking the photo with better lighting.')
        setStep('capture')
        return
      }

      // Auto-match
      setStep('matching')
      const matched: MatchedLine[] = []

      for (const line of result.lines) {
        let bestMatch: StockItem | null = null
        try {
          const res = await searchItems(line.description, 5)
          if (res.items.length > 0) {
            bestMatch = res.items[0]
          }
        } catch { /* search failed, leave unmatched */ }

        matched.push({
          parsed: line,
          match: bestMatch,
          newSellPrice: line.sellPrice,
          included: bestMatch !== null,
        })

        // Small delay to avoid hammering API
        await new Promise(r => setTimeout(r, 100))
      }

      setLines(matched)
      setStep('review')
    } catch (e) {
      setError((e as Error).message)
      setStep('capture')
    }
  }

  // ── Manual re-match ─────────────────────────────────────────────────────
  function toggleManualSearch(index: number) {
    setLines(prev => prev.map((l, i) => i === index
      ? { ...l, manualSearchOpen: !l.manualSearchOpen, manualSearchQuery: l.manualSearchQuery || l.parsed.description }
      : l
    ))
  }

  async function doManualSearch(index: number) {
    const line = lines[index]
    if (!line.manualSearchQuery?.trim()) return

    setLines(prev => prev.map((l, i) => i === index ? { ...l, manualSearching: true } : l))

    try {
      const res = await searchItems(line.manualSearchQuery!.trim(), 8)
      setLines(prev => prev.map((l, i) => i === index
        ? { ...l, manualSearchResults: res.items, manualSearching: false }
        : l
      ))
    } catch {
      setLines(prev => prev.map((l, i) => i === index ? { ...l, manualSearching: false } : l))
    }
  }

  function selectManualMatch(lineIndex: number, item: StockItem) {
    setLines(prev => prev.map((l, i) => i === lineIndex
      ? { ...l, match: item, included: true, manualSearchOpen: false, manualSearchResults: undefined }
      : l
    ))
  }

  // ── Apply price changes ─────────────────────────────────────────────────
  async function handleApply() {
    const toApply = lines.filter(l => l.included && l.match)
    if (toApply.length === 0) return

    setStep('applying')
    setApplyTotal(toApply.length)
    setApplyProgress(0)

    const applyResults: ApplyResult[] = []

    for (const line of toApply) {
      const barcode = line.match!.barcode ?? line.match!.itemCode
      const oldPrice = line.match!.sellPrice
      try {
        const res: ChangeAndSendResponse = await changeAndSend(barcode, line.newSellPrice, 'Invoice direct')
        applyResults.push({
          description: line.match!.description,
          barcode,
          oldPrice,
          newPrice: line.newSellPrice,
          success: res.success,
          message: res.message,
        })

        // Log to quick action log
        await db.quickActionLog.add({
          actionType: 'price-change',
          barcode,
          productName: line.match!.description,
          details: { oldPrice, newPrice: line.newSellPrice, reason: 'Invoice direct', sentToPos: res.sentToPos },
          syncStatus: res.success ? 'synced' : 'failed',
          performedAt: new Date().toISOString(),
        }).catch(() => {})
      } catch (e) {
        applyResults.push({
          description: line.match!.description,
          barcode,
          oldPrice,
          newPrice: line.newSellPrice,
          success: false,
          message: (e as Error).message,
        })
      }
      setApplyProgress(prev => prev + 1)
    }

    setResults(applyResults)
    setStep('done')
  }

  // ── Computed ─────────────────────────────────────────────────────────────
  const matchedCount = lines.filter(l => l.match).length
  const unmatchedCount = lines.filter(l => !l.match).length
  const includedCount = lines.filter(l => l.included && l.match).length
  const successCount = results.filter(r => r.success).length
  const failCount = results.filter(r => !r.success).length

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={handleClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col">
        {/* Handle + header */}
        <div className="flex justify-center pt-3 pb-1 shrink-0"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
        <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-indigo-600" />
            <h2 className="text-base font-semibold text-gray-900">Invoice Directs</h2>
          </div>
          <button onClick={handleClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
          {/* ── Step: Capture ── */}
          {step === 'capture' && (
            <>
              {error && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-lg">
                  <AlertCircle size={14} className="text-red-500 shrink-0" />
                  <p className="text-xs text-red-600">{error}</p>
                </div>
              )}

              {/* Image preview */}
              {imageData && (
                <div className="relative">
                  <img src={imageData} alt="Invoice" className="w-full rounded-lg border border-gray-200 max-h-48 object-contain bg-gray-50" />
                  <button
                    onClick={() => setImageData(null)}
                    className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Hidden canvas — always mounted for capture */}
              <canvas ref={canvasRef} className="hidden" />

              {/* Camera view */}
              {cameraActive && !imageData && (
                <div className="relative">
                  <video
                    ref={videoRef}
                    autoPlay playsInline muted
                    className="w-full rounded-lg border border-gray-200 max-h-64 object-cover bg-black"
                  />
                  {/* Loading overlay while camera initializes */}
                  {!cameraReady && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 rounded-lg">
                      <Loader2 size={24} className="text-indigo-400 animate-spin" />
                      <p className="text-xs text-gray-400 mt-2">Starting camera...</p>
                    </div>
                  )}
                  {/* Capture button — only when camera is ready */}
                  {cameraReady && (
                    <button
                      onClick={capturePhoto}
                      className="absolute bottom-3 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full bg-white border-4 border-indigo-600 shadow-lg active:scale-95 transition-transform"
                      aria-label="Take photo"
                    />
                  )}
                  {/* Cancel camera */}
                  <button
                    onClick={stopCamera}
                    className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full text-white hover:bg-black/70"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Capture buttons */}
              {!imageData && !cameraActive && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500 text-center">Capture or upload a photo of the direct invoice</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={startCamera}
                      className="flex flex-col items-center gap-2 p-4 bg-indigo-50 rounded-xl border border-indigo-100 hover:bg-indigo-100 transition-colors"
                    >
                      <Camera size={24} className="text-indigo-600" />
                      <span className="text-sm font-medium text-indigo-700">Camera</span>
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex flex-col items-center gap-2 p-4 bg-gray-50 rounded-xl border border-gray-200 hover:bg-gray-100 transition-colors"
                    >
                      <Upload size={24} className="text-gray-600" />
                      <span className="text-sm font-medium text-gray-700">Upload</span>
                    </button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
              )}

              {/* Parse + Retake buttons */}
              {imageData && (
                <div className="flex gap-2">
                  <button
                    onClick={() => { setImageData(null); setError(null) }}
                    className="flex-1 py-3 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Retake
                  </button>
                  <button
                    onClick={handleParse}
                    className="flex-[2] py-3 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <FileText size={16} />
                    Parse Invoice
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── Step: Parsing ── */}
          {step === 'parsing' && (
            <div className="flex flex-col items-center gap-3 py-12">
              <Loader2 size={32} className="text-indigo-600 animate-spin" />
              <p className="text-sm text-gray-600">Parsing invoice...</p>
              <p className="text-xs text-gray-400">AI is reading the invoice details</p>
            </div>
          )}

          {/* ── Step: Matching ── */}
          {step === 'matching' && (
            <div className="flex flex-col items-center gap-3 py-12">
              <Loader2 size={32} className="text-indigo-600 animate-spin" />
              <p className="text-sm text-gray-600">Matching products...</p>
              <p className="text-xs text-gray-400">Finding POS products for each invoice line</p>
            </div>
          )}

          {/* ── Step: Review ── */}
          {step === 'review' && (
            <>
              {/* Header info */}
              {(supplier || invoiceNumber) && (
                <div className="bg-indigo-50 rounded-lg px-3 py-2">
                  {supplier && <p className="text-sm font-medium text-indigo-900">{supplier}</p>}
                  {invoiceNumber && <p className="text-xs text-indigo-600">Invoice #{invoiceNumber}</p>}
                </div>
              )}

              {/* Summary */}
              <div className="flex items-center gap-3 text-xs">
                <span className="px-2 py-1 bg-gray-100 rounded-full text-gray-600">{lines.length} parsed</span>
                <span className="px-2 py-1 bg-emerald-50 rounded-full text-emerald-700">{matchedCount} matched</span>
                {unmatchedCount > 0 && (
                  <span className="px-2 py-1 bg-amber-50 rounded-full text-amber-700">{unmatchedCount} unmatched</span>
                )}
              </div>

              {/* Matched items */}
              <div className="space-y-2">
                {lines.map((line, i) => (
                  <div key={i} className={`rounded-lg border ${line.match ? 'border-gray-200' : 'border-amber-200 bg-amber-50/50'} overflow-hidden`}>
                    <div className="px-3 py-2.5">
                      {/* Row header */}
                      <div className="flex items-start gap-2">
                        {line.match && (
                          <input
                            type="checkbox"
                            checked={line.included}
                            onChange={e => setLines(prev => prev.map((l, j) => j === i ? { ...l, included: e.target.checked } : l))}
                            className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 line-clamp-1">
                            {line.match?.description || line.parsed.description}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                            {line.match && (
                              <span className="text-[10px] px-1 py-0.5 bg-gray-100 rounded">{line.match.department}</span>
                            )}
                            <span className="text-gray-400">Cost: ${line.parsed.unitCost.toFixed(2)}</span>
                            {line.match && line.newSellPrice > 0 && (
                              <span className={`font-medium ${
                                ((line.newSellPrice - line.parsed.unitCost) / line.newSellPrice * 100) < 15
                                  ? 'text-red-600' : 'text-emerald-600'
                              }`}>
                                {((line.newSellPrice - line.parsed.unitCost) / line.newSellPrice * 100).toFixed(1)}% margin
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Price row */}
                      {line.match && (
                        <div className="flex items-center gap-2 mt-2 ml-6">
                          <span className="text-xs text-gray-500">${line.match.sellPrice.toFixed(2)}</span>
                          <ArrowRight size={12} className="text-gray-400" />
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            value={line.newSellPrice}
                            onChange={e => {
                              const val = parseFloat(e.target.value)
                              setLines(prev => prev.map((l, j) => j === i ? { ...l, newSellPrice: isNaN(val) ? 0 : val } : l))
                            }}
                            className="w-20 border border-gray-200 rounded px-2 py-1 text-sm font-bold text-center focus:ring-2 focus:ring-indigo-400 outline-none"
                          />
                          {line.newSellPrice !== line.match.sellPrice && (
                            <span className={`text-xs font-medium ${line.newSellPrice > line.match.sellPrice ? 'text-red-600' : 'text-emerald-600'}`}>
                              {line.newSellPrice > line.match.sellPrice ? '+' : ''}{((line.newSellPrice - line.match.sellPrice) / line.match.sellPrice * 100).toFixed(1)}%
                            </span>
                          )}
                        </div>
                      )}

                      {/* Unmatched: show search button */}
                      {!line.match && (
                        <button
                          onClick={() => toggleManualSearch(i)}
                          className="mt-2 flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
                        >
                          <Search size={12} />
                          {line.manualSearchOpen ? 'Hide search' : 'Search to match'}
                          {line.manualSearchOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                      )}
                    </div>

                    {/* Manual search panel */}
                    {line.manualSearchOpen && (
                      <div className="px-3 pb-3 border-t border-gray-100 pt-2 bg-gray-50/50 space-y-2">
                        <div className="flex gap-2">
                          <input
                            value={line.manualSearchQuery || ''}
                            onChange={e => setLines(prev => prev.map((l, j) => j === i ? { ...l, manualSearchQuery: e.target.value } : l))}
                            onKeyDown={e => e.key === 'Enter' && doManualSearch(i)}
                            placeholder="Search product..."
                            className="flex-1 text-xs bg-white border border-gray-200 rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-400"
                          />
                          <button
                            onClick={() => doManualSearch(i)}
                            disabled={line.manualSearching}
                            className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded disabled:opacity-50"
                          >
                            {line.manualSearching ? '...' : 'Go'}
                          </button>
                        </div>
                        {line.manualSearchResults && line.manualSearchResults.length > 0 && (
                          <div className="space-y-1 max-h-32 overflow-auto">
                            {line.manualSearchResults.map(item => (
                              <button
                                key={item.itemCode}
                                onClick={() => selectManualMatch(i, item)}
                                className="w-full text-left px-2 py-1.5 rounded bg-white hover:bg-indigo-50 border border-gray-100 text-xs"
                              >
                                <p className="font-medium text-gray-900 line-clamp-1">{item.description}</p>
                                <span className="text-gray-500">${item.sellPrice.toFixed(2)} &middot; {item.department}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {line.manualSearchResults && line.manualSearchResults.length === 0 && (
                          <p className="text-xs text-gray-400">No results found</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Apply button */}
              <button
                onClick={handleApply}
                disabled={includedCount === 0}
                className="w-full py-3 bg-indigo-600 text-white text-sm font-bold rounded-lg disabled:opacity-50 hover:bg-indigo-700 transition-colors"
              >
                Apply {includedCount} Price Change{includedCount !== 1 ? 's' : ''}
              </button>
            </>
          )}

          {/* ── Step: Applying ── */}
          {step === 'applying' && (
            <div className="flex flex-col items-center gap-4 py-12">
              <Loader2 size={32} className="text-indigo-600 animate-spin" />
              <p className="text-sm text-gray-600">Applying price changes...</p>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-indigo-600 h-2 rounded-full transition-all"
                  style={{ width: `${applyTotal > 0 ? (applyProgress / applyTotal) * 100 : 0}%` }}
                />
              </div>
              <p className="text-xs text-gray-400">{applyProgress} of {applyTotal}</p>
            </div>
          )}

          {/* ── Step: Done ── */}
          {step === 'done' && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 py-6">
                <CheckCircle2 size={48} className="text-emerald-500" />
                <p className="text-sm font-semibold text-emerald-700">Price Changes Applied</p>
                <div className="flex items-center gap-3 text-xs">
                  <span className="px-2 py-1 bg-emerald-50 rounded-full text-emerald-700">{successCount} updated</span>
                  {failCount > 0 && (
                    <span className="px-2 py-1 bg-red-50 rounded-full text-red-700">{failCount} failed</span>
                  )}
                </div>
              </div>

              {/* Results list */}
              {results.length > 0 && (
                <div className="space-y-1">
                  {results.map((r, i) => (
                    <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg ${r.success ? 'bg-emerald-50' : 'bg-red-50'}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 line-clamp-1">{r.description}</p>
                        {!r.success && r.message && <p className="text-[10px] text-red-600 mt-0.5">{r.message}</p>}
                      </div>
                      <div className="text-xs text-right shrink-0 ml-2">
                        <span className="text-gray-500">${r.oldPrice.toFixed(2)}</span>
                        <span className="mx-1 text-gray-400">&rarr;</span>
                        <span className="font-bold text-gray-900">${r.newPrice.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={handleClose}
                className="w-full py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
