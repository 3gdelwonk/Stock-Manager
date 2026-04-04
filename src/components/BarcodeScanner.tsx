import { useEffect, useRef, useState, useCallback } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { X, AlertTriangle, ZoomIn, ZoomOut } from 'lucide-react'

interface BarcodeScannerProps {
  open: boolean
  onScan: (code: string) => void
  onClose: () => void
}

export default function BarcodeScanner({ open, onScan, onClose }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const onScanRef = useRef(onScan)
  const onCloseRef = useRef(onClose)
  onScanRef.current = onScan
  onCloseRef.current = onClose
  const activeRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number } | null>(null)
  const trackRef = useRef<MediaStreamTrack | null>(null)

  const applyZoom = useCallback((newZoom: number) => {
    const track = trackRef.current
    if (!track) return
    try {
      const caps = track.getCapabilities?.() as Record<string, unknown> | undefined
      const zoomCap = caps?.zoom as { min?: number; max?: number } | undefined
      if (zoomCap?.max) {
        const clamped = Math.max(zoomCap.min ?? 1, Math.min(newZoom, zoomCap.max))
        track.applyConstraints({ advanced: [{ zoom: clamped } as MediaTrackConstraintSet] } as MediaTrackConstraints)
        setZoom(clamped)
      }
    } catch { /* zoom not supported — ignore */ }
  }, [])

  useEffect(() => {
    if (!open) return

    setError(null)
    setZoom(1)
    setZoomRange(null)
    trackRef.current = null
    activeRef.current = true

    const scanner = new Html5Qrcode('barcode-reader')
    scannerRef.current = scanner

    scanner
      .start(
        { facingMode: 'environment' },
        {
          fps: 15,
          qrbox: { width: 300, height: 250 },
          aspectRatio: 1.0,
          disableFlip: false,
        },
        (decodedText) => {
          if (!activeRef.current) return
          activeRef.current = false
          scannerRef.current = null
          trackRef.current = null
          scanner.stop()
            .then(() => { try { scanner.clear() } catch {} })
            .catch(() => { try { scanner.clear() } catch {} })
          onScanRef.current(decodedText)
        },
        () => {},
      )
      .then(() => {
        // After start, try to access the camera track for zoom
        try {
          const state = scanner.getRunningTrackSettings?.()
          const videoEl = document.querySelector('#barcode-reader video') as HTMLVideoElement | null
          const track = videoEl?.srcObject instanceof MediaStream
            ? videoEl.srcObject.getVideoTracks()[0]
            : null
          if (track) {
            trackRef.current = track
            const caps = track.getCapabilities?.() as Record<string, unknown> | undefined
            const zoomCap = caps?.zoom as { min?: number; max?: number; step?: number } | undefined
            if (zoomCap?.max && zoomCap.max > 1) {
              setZoomRange({ min: zoomCap.min ?? 1, max: zoomCap.max })
              // Apply a gentle default zoom (1.5x or min+25% of range) for better distance reading
              const defaultZoom = Math.min(
                (zoomCap.min ?? 1) + ((zoomCap.max - (zoomCap.min ?? 1)) * 0.15),
                zoomCap.max,
              )
              if (defaultZoom > 1) {
                track.applyConstraints({ advanced: [{ zoom: defaultZoom } as MediaTrackConstraintSet] } as MediaTrackConstraints)
                setZoom(defaultZoom)
              }
            }
            // Try to request higher resolution for better distance detection
            if (state) {
              track.applyConstraints({
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                ...(caps?.focusMode ? { focusMode: 'continuous' as unknown } : {}),
              } as MediaTrackConstraints).catch(() => {})
            }
          }
        } catch { /* older browser — no zoom support */ }
      })
      .catch((err) => {
        setError(typeof err === 'string' ? err : (err as Error).message ?? 'Camera not available')
      })

    return () => {
      activeRef.current = false
      trackRef.current = null
      const s = scannerRef.current
      scannerRef.current = null
      if (s) {
        s.stop()
          .then(() => { try { s.clear() } catch {} })
          .catch(() => { try { s.clear() } catch {} })
      }
    }
  }, [open])

  function handleClose() {
    activeRef.current = false
    trackRef.current = null
    const s = scannerRef.current
    scannerRef.current = null
    if (s) {
      s.stop()
        .then(() => { try { s.clear() } catch {} })
        .catch(() => { try { s.clear() } catch {} })
    }
    onCloseRef.current()
  }

  function handleZoomIn() {
    if (!zoomRange) return
    const step = (zoomRange.max - zoomRange.min) * 0.1
    applyZoom(zoom + step)
  }

  function handleZoomOut() {
    if (!zoomRange) return
    const step = (zoomRange.max - zoomRange.min) * 0.1
    applyZoom(zoom - step)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <p className="text-sm font-medium text-white">Scan Barcode</p>
        <button onClick={handleClose} className="text-white/70 hover:text-white p-1">
          <X size={20} />
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div id="barcode-reader" className="w-full max-w-md" />
      </div>
      {/* Zoom controls — only show if camera supports zoom */}
      {zoomRange && (
        <div className="flex items-center justify-center gap-4 pb-2">
          <button
            onClick={handleZoomOut}
            disabled={zoom <= zoomRange.min}
            className="p-2.5 rounded-full bg-white/10 text-white disabled:opacity-30 active:bg-white/20"
          >
            <ZoomOut size={20} />
          </button>
          <span className="text-xs text-white/60 w-12 text-center font-mono">
            {zoom.toFixed(1)}x
          </span>
          <button
            onClick={handleZoomIn}
            disabled={zoom >= zoomRange.max}
            className="p-2.5 rounded-full bg-white/10 text-white disabled:opacity-30 active:bg-white/20"
          >
            <ZoomIn size={20} />
          </button>
        </div>
      )}
      {error ? (
        <div className="px-6 pb-6 text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-red-400">
            <AlertTriangle size={16} />
            <p className="text-sm">{error}</p>
          </div>
          <button onClick={handleClose} className="text-sm text-white/70 underline">Close and try again</button>
        </div>
      ) : (
        <p className="text-center text-xs text-white/50 pb-6">Point camera at barcode — use zoom for distance</p>
      )}
    </div>
  )
}
