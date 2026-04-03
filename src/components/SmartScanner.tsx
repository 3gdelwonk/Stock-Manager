import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Camera, ScanBarcode, Loader2, AlertCircle } from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'
import { db } from '../lib/db'
import { searchItems, identifyProduct } from '../lib/jarvis'

interface SmartScannerProps {
  open: boolean
  onClose: () => void
  onProductFound: (product: {
    itemCode: string
    barcode: string
    name: string
    department: string
    sellPrice: number
  }) => void
  onProductNotFound: (query: string) => void
}

type Mode = 'barcode' | 'photo'

type Status =
  | { kind: 'idle' }
  | { kind: 'loading'; message: string }
  | { kind: 'error'; message: string }

export default function SmartScanner({
  open,
  onClose,
  onProductFound,
  onProductNotFound,
}: SmartScannerProps) {
  const [mode, setMode] = useState<Mode>('barcode')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [capturedImage, setCapturedImage] = useState<string | null>(null)

  // Stable refs for callbacks so scanner doesn't re-init on every render
  const onProductFoundRef = useRef(onProductFound)
  const onProductNotFoundRef = useRef(onProductNotFound)
  const onCloseRef = useRef(onClose)
  onProductFoundRef.current = onProductFound
  onProductNotFoundRef.current = onProductNotFound
  onCloseRef.current = onClose

  // ── Barcode scanner ──────────────────────────────────────────────────────
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const activeRef = useRef(false)

  const handleBarcodeDecode = useCallback(async (code: string) => {
    setStatus({ kind: 'loading', message: 'Looking up product...' })
    const normalized = code.trim().replace(/[^0-9]/g, '')

    try {
      // 1. Search local Dexie by barcode (exact then normalized)
      let product = await db.products.where('barcode').equals(code).first()
      if (!product && normalized !== code) {
        product = await db.products.where('barcode').equals(normalized).first()
      }

      // 2. Try itemCode if barcode not found
      if (!product) {
        product = await db.products.where('itemCode').equals(code).first()
        if (!product && normalized !== code) {
          product = await db.products.where('itemCode').equals(normalized).first()
        }
      }

      // 3. Found locally
      if (product) {
        onProductFoundRef.current({
          itemCode: product.itemCode,
          barcode: product.barcode,
          name: product.name,
          department: product.department,
          sellPrice: product.sellPrice,
        })
        return
      }

      // 4. Try jarvis API search
      const result = await searchItems(code)
      if (result.items && result.items.length > 0) {
        const item = result.items[0]
        onProductFoundRef.current({
          itemCode: item.itemCode,
          barcode: item.barcode ?? code,
          name: item.description,
          department: item.department,
          sellPrice: item.sellPrice,
        })
        return
      }

      // 5. Nothing found
      onProductNotFoundRef.current(code)
    } catch {
      // If API fails, still report not found
      onProductNotFoundRef.current(code)
    } finally {
      setStatus({ kind: 'idle' })
    }
  }, [])

  // Start / stop barcode scanner
  useEffect(() => {
    if (!open || mode !== 'barcode') return

    setStatus({ kind: 'idle' })
    activeRef.current = true

    const scanner = new Html5Qrcode('smart-barcode-reader')
    scannerRef.current = scanner

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 200 } },
        (decodedText) => {
          if (!activeRef.current) return
          activeRef.current = false
          scannerRef.current = null
          scanner
            .stop()
            .then(() => { try { scanner.clear() } catch { /* ignore */ } })
            .catch(() => { try { scanner.clear() } catch { /* ignore */ } })
          handleBarcodeDecode(decodedText)
        },
        () => {},
      )
      .catch((err) => {
        setStatus({
          kind: 'error',
          message: typeof err === 'string' ? err : (err as Error).message ?? 'Camera not available',
        })
      })

    return () => {
      activeRef.current = false
      const s = scannerRef.current
      scannerRef.current = null
      if (s) {
        s.stop()
          .then(() => { try { s.clear() } catch { /* ignore */ } })
          .catch(() => { try { s.clear() } catch { /* ignore */ } })
      }
    }
  }, [open, mode, handleBarcodeDecode])

  // ── Photo / camera ───────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Start / stop camera for photo mode
  useEffect(() => {
    if (!open || mode !== 'photo') return

    setStatus({ kind: 'idle' })
    setCapturedImage(null)
    let cancelled = false

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus({ kind: 'error', message: 'Camera not available' })
        }
      })

    return () => {
      cancelled = true
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
    }
  }, [open, mode])

  const handleCapture = useCallback(async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    // Draw frame to canvas
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)

    const base64 = canvas.toDataURL('image/jpeg', 0.8)
    setCapturedImage(base64)
    setStatus({ kind: 'loading', message: 'Analyzing...' })

    // Stop the camera stream while analyzing
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }

    try {
      const result = await identifyProduct(base64)

      if (result.suggestions && result.suggestions.length > 0) {
        // Search each suggestion in local DB
        for (const suggestion of result.suggestions) {
          // Try barcode first if provided
          if (suggestion.barcode) {
            const product = await db.products.where('barcode').equals(suggestion.barcode).first()
            if (product) {
              onProductFoundRef.current({
                itemCode: product.itemCode,
                barcode: product.barcode,
                name: product.name,
                department: product.department,
                sellPrice: product.sellPrice,
              })
              return
            }
          }

          // Search by description in local DB
          const desc = suggestion.description.toLowerCase()
          const localMatch = await db.products
            .filter((p) => p.name.toLowerCase().includes(desc) || desc.includes(p.name.toLowerCase()))
            .first()

          if (localMatch) {
            onProductFoundRef.current({
              itemCode: localMatch.itemCode,
              barcode: localMatch.barcode,
              name: localMatch.name,
              department: localMatch.department,
              sellPrice: localMatch.sellPrice,
            })
            return
          }
        }

        // No local match — report best suggestion description
        onProductNotFoundRef.current(result.suggestions[0].description)
      } else {
        onProductNotFoundRef.current('Unidentified product')
      }
    } catch {
      setStatus({ kind: 'error', message: 'AI identification unavailable. Try barcode mode instead.' })
    }
  }, [])

  // ── Mode switching ───────────────────────────────────────────────────────
  const switchMode = useCallback((newMode: Mode) => {
    // Clean up current mode resources
    if (mode === 'barcode') {
      activeRef.current = false
      const s = scannerRef.current
      scannerRef.current = null
      if (s) {
        s.stop()
          .then(() => { try { s.clear() } catch { /* ignore */ } })
          .catch(() => { try { s.clear() } catch { /* ignore */ } })
      }
    }
    if (mode === 'photo' && streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }

    setCapturedImage(null)
    setStatus({ kind: 'idle' })
    setMode(newMode)
  }, [mode])

  // ── Close handler ────────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    activeRef.current = false
    const s = scannerRef.current
    scannerRef.current = null
    if (s) {
      s.stop()
        .then(() => { try { s.clear() } catch { /* ignore */ } })
        .catch(() => { try { s.clear() } catch { /* ignore */ } })
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setCapturedImage(null)
    setStatus({ kind: 'idle' })
    setMode('barcode')
    onCloseRef.current()
  }, [])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <p className="text-sm font-medium text-white">Smart Scan</p>
        <button onClick={handleClose} className="text-white/70 hover:text-white p-1">
          <X size={20} />
        </button>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 px-4 pb-3 bg-black/80">
        <button
          onClick={() => switchMode('barcode')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'barcode'
              ? 'bg-emerald-600 text-white'
              : 'bg-white/10 text-white/60 hover:bg-white/20'
          }`}
        >
          <ScanBarcode size={16} />
          Barcode
        </button>
        <button
          onClick={() => switchMode('photo')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'photo'
              ? 'bg-emerald-600 text-white'
              : 'bg-white/10 text-white/60 hover:bg-white/20'
          }`}
        >
          <Camera size={16} />
          Photo
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center relative">
        {/* Barcode mode */}
        {mode === 'barcode' && (
          <div id="smart-barcode-reader" className="w-full max-w-sm" />
        )}

        {/* Photo mode */}
        {mode === 'photo' && (
          <>
            {capturedImage ? (
              <img
                src={capturedImage}
                alt="Captured"
                className="w-full max-w-sm rounded-lg object-contain"
              />
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full max-w-sm rounded-lg object-cover"
              />
            )}
            <canvas ref={canvasRef} className="hidden" />
          </>
        )}

        {/* Loading overlay */}
        {status.kind === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
            <Loader2 size={32} className="text-emerald-400 animate-spin" />
            <p className="mt-3 text-sm text-white">{status.message}</p>
          </div>
        )}
      </div>

      {/* Bottom area */}
      <div className="px-6 pb-6 space-y-3">
        {status.kind === 'error' && (
          <div className="flex items-center justify-center gap-2 text-red-400">
            <AlertCircle size={16} />
            <p className="text-sm">{status.message}</p>
          </div>
        )}

        {mode === 'photo' && !capturedImage && status.kind === 'idle' && (
          <button
            onClick={handleCapture}
            className="w-full py-3 rounded-xl bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
          >
            <Camera size={18} />
            Capture
          </button>
        )}

        {mode === 'photo' && capturedImage && status.kind !== 'loading' && (
          <button
            onClick={() => {
              setCapturedImage(null)
              setStatus({ kind: 'idle' })
              // Restart camera — switching mode to photo again will trigger useEffect
              setMode('barcode')
              setTimeout(() => setMode('photo'), 0)
            }}
            className="w-full py-3 rounded-xl bg-white/10 text-white font-medium text-sm hover:bg-white/20 transition-colors"
          >
            Retake
          </button>
        )}

        <p className="text-center text-xs text-white/50">
          {mode === 'barcode'
            ? 'Point camera at barcode, QR code, or any label'
            : 'Take a photo of the product for AI identification'}
        </p>
      </div>
    </div>
  )
}
