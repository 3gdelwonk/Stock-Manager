import { useEffect, useRef, useState, useCallback } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { X, AlertTriangle, ZoomIn, ZoomOut, Zap, ZapOff } from 'lucide-react'

interface BarcodeScannerProps {
  open: boolean
  onScan: (code: string) => void
  onClose: () => void
}

// Restrict to formats actually found in grocery retail.
// Fewer formats = more decode time per format per frame = better at weak barcodes.
const GROCERY_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,   // standard retail (most products)
  Html5QrcodeSupportedFormats.EAN_8,    // small-pack products
  Html5QrcodeSupportedFormats.UPC_A,    // US imports
  Html5QrcodeSupportedFormats.UPC_E,    // compact UPC
  Html5QrcodeSupportedFormats.CODE_128, // supplier/logistics labels
  Html5QrcodeSupportedFormats.CODE_39,  // some internal labels
  Html5QrcodeSupportedFormats.ITF,      // outer carton barcodes
  Html5QrcodeSupportedFormats.QR_CODE,  // QR labels / shelf tags
]

export default function BarcodeScanner({ open, onScan, onClose }: BarcodeScannerProps) {
  const scannerRef   = useRef<Html5Qrcode | null>(null)
  const onScanRef    = useRef(onScan)
  const onCloseRef   = useRef(onClose)
  onScanRef.current  = onScan
  onCloseRef.current = onClose
  const activeRef    = useRef(false)
  const trackRef     = useRef<MediaStreamTrack | null>(null)

  const [error, setError]               = useState<string | null>(null)
  const [zoom, setZoom]                 = useState(1)
  const [zoomRange, setZoomRange]       = useState<{ min: number; max: number } | null>(null)
  const [torch, setTorch]               = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  // Diagnostic: surface the camera's actual label so if the wrong one is
  // picked we can see WHICH camera was selected instead of guessing.
  const [cameraLabel, setCameraLabel]   = useState<string>('')

  const applyZoom = useCallback((newZoom: number) => {
    const track = trackRef.current
    if (!track) return
    try {
      const caps    = track.getCapabilities?.() as Record<string, unknown> | undefined
      const zoomCap = caps?.zoom as { min?: number; max?: number } | undefined
      if (zoomCap?.max) {
        const clamped = Math.max(zoomCap.min ?? 1, Math.min(newZoom, zoomCap.max))
        track.applyConstraints({ advanced: [{ zoom: clamped } as MediaTrackConstraintSet] } as MediaTrackConstraints)
        setZoom(clamped)
      }
    } catch { /* zoom not supported */ }
  }, [])

  async function handleTorch() {
    const track = trackRef.current
    if (!track) return
    const next = !torch
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] } as MediaTrackConstraints)
      setTorch(next)
    } catch { /* torch not supported */ }
  }

  useEffect(() => {
    if (!open) return

    setError(null)
    setZoom(1)
    setZoomRange(null)
    setTorch(false)
    setTorchSupported(false)
    setCameraLabel('')
    trackRef.current  = null
    activeRef.current = true

    // experimentalFeatures.useBarCodeDetectorIfSupported — on Chrome/Android this
    // delegates to the native BarcodeDetector API (ML Kit on Android, OS API on
    // desktop).  The native detector handles damaged, low-contrast, and
    // far-away barcodes far better than the JS ZXing fallback because it runs
    // at the OS/GPU level with sub-pixel processing.
    const scanner = new Html5Qrcode('barcode-reader', {
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      formatsToSupport: GROCERY_FORMATS,
      verbose: false,
    })
    scannerRef.current = scanner

    // Pin the rear camera. Previous attempts using `facingMode: 'environment'`
    // (hard or soft) AND passing a string deviceId into html5-qrcode both
    // silently landed on the front camera on some devices. Root causes:
    //
    //   • Some browsers honour `{ exact: 'environment' }` as a SOFT pref —
    //     getUserMedia resolves with the front cam anyway.
    //   • Labels on enumerateDevices() can be blank pre-permission, so
    //     "pick by label" heuristics pick the wrong id.
    //   • html5-qrcode merges our `videoConstraints` into the request and
    //     can override a deviceId constraint in surprising ways.
    //
    // This picker is paranoid: it resolves a full MediaTrackConstraints
    // object ourselves (bypassing html5-qrcode's own merge) and VERIFIES
    // the winning camera is actually back-facing by inspecting the track's
    // getSettings().facingMode AND its label — discarding the stream and
    // trying the next candidate if either check fails. The selected
    // camera's label is published to `cameraLabel` state so the overlay
    // can show the user which one was chosen.
    const looksBackFacing = (track: MediaStreamTrack): boolean => {
      const s = (track.getSettings?.() ?? {}) as Record<string, unknown>
      const fm = typeof s.facingMode === 'string' ? s.facingMode : ''
      if (fm === 'environment') return true
      if (fm === 'user')        return false
      // facingMode absent — fall back to label heuristic.
      const lbl = track.label ?? ''
      if (/back|rear|environment|world/i.test(lbl)) return true
      if (/front|user|selfie|face/i.test(lbl))      return false
      return false  // unknown — don't trust it
    }

    const baseConstraints = {
      width:     { min: 640, ideal: 1920 },
      height:    { min: 480, ideal: 1080 },
      frameRate: { ideal: 30, max: 60 },
    }

    const resolveBackCamConstraints = async (): Promise<MediaTrackConstraints> => {
      // STEP 1 — exact environment probe. If it resolves AND the resulting
      // track is verifiably back-facing, capture its deviceId so subsequent
      // scanner.start is pinned to the same device.
      try {
        const probe = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: 'environment' } },
        })
        const track = probe.getVideoTracks()[0]
        if (track) {
          const verified = looksBackFacing(track)
          const dId      = track.getSettings?.()?.deviceId
          const label    = track.label ?? ''
          probe.getTracks().forEach(t => t.stop())
          if (verified) {
            setCameraLabel(label || 'Back camera')
            return dId
              ? { deviceId: { exact: dId }, ...baseConstraints }
              : { facingMode: { exact: 'environment' }, ...baseConstraints }
          }
          // Probe resolved with the WRONG camera — don't trust facingMode.
          // Fall through to explicit enumeration.
        }
      } catch { /* probe rejected — enumerate */ }

      // STEP 2 — enumerate and VERIFY each camera by opening it. Open each
      // videoinput in turn, inspect the resulting track, stop it, and
      // remember the first one that verifies as back-facing. Slower than
      // guessing but reliable even with blank labels.
      try {
        // Ensure we have camera permission so enumerateDevices returns labels.
        try {
          const s = await navigator.mediaDevices.getUserMedia({ video: true })
          s.getTracks().forEach(t => t.stop())
        } catch { /* permission may still be valid from probe above */ }

        const devices = await navigator.mediaDevices.enumerateDevices()
        const inputs  = devices.filter(d => d.kind === 'videoinput')

        // Fast path — any device whose label clearly says back/rear.
        const byLabel = inputs.find(d => /back|rear|environment|world/i.test(d.label))
        if (byLabel) {
          setCameraLabel(byLabel.label || 'Back camera')
          return { deviceId: { exact: byLabel.deviceId }, ...baseConstraints }
        }

        // Verify path — try each device, pick the first that looks back-facing.
        for (const d of inputs) {
          try {
            const s     = await navigator.mediaDevices.getUserMedia({
              video: { deviceId: { exact: d.deviceId } },
            })
            const t     = s.getVideoTracks()[0]
            const isBack = t ? looksBackFacing(t) : false
            const label  = t?.label ?? d.label ?? ''
            s.getTracks().forEach(x => x.stop())
            if (isBack) {
              setCameraLabel(label || 'Back camera')
              return { deviceId: { exact: d.deviceId }, ...baseConstraints }
            }
          } catch { /* try next */ }
        }

        // Nothing verified — fall back to "not obviously front" label heuristic.
        const notFront = inputs.find(d => d.label && !/front|user|selfie|face/i.test(d.label))
        if (notFront) {
          setCameraLabel(`${notFront.label} (unverified)`)
          return { deviceId: { exact: notFront.deviceId }, ...baseConstraints }
        }
      } catch { /* enumeration unavailable */ }

      // STEP 3 — last resort. Let the browser pick by facingMode; at least
      // we asked for exact:environment so it'll fail loudly on devices that
      // can't honour it, rather than silently opening the user-facing cam.
      setCameraLabel('facingMode fallback')
      return { facingMode: { exact: 'environment' }, ...baseConstraints } as MediaTrackConstraints
    }

    resolveBackCamConstraints().then(constraints => scanner
      .start(
        // Passing MediaTrackConstraints (not a string) so html5-qrcode uses
        // it verbatim as the `video: ...` object without merging a separate
        // videoConstraints and potentially stomping our deviceId.
        constraints,
        {
          fps: 20,
          // Wide, short box matches the 3.5:1 aspect of EAN-13 / UPC-A.
          // More horizontal pixels captured → better bar resolution at distance.
          qrbox: { width: 340, height: 160 },
          aspectRatio: 1.7778,    // 16:9 widescreen → full horizontal resolution
          disableFlip: true,       // 1D barcodes don't need mirror check; saves CPU
        },
        (decodedText) => {
          if (!activeRef.current) return
          activeRef.current  = false
          scannerRef.current = null
          trackRef.current   = null
          scanner.stop()
            .then(() => { try { scanner.clear() } catch {} })
            .catch(() => { try { scanner.clear() } catch {} })
          onScanRef.current(decodedText)
        },
        () => {},
      )
      .then(() => {
        try {
          const videoEl = document.querySelector('#barcode-reader video') as HTMLVideoElement | null
          const track   = videoEl?.srcObject instanceof MediaStream
            ? videoEl.srcObject.getVideoTracks()[0]
            : null
          if (!track) return
          trackRef.current = track

          // Refresh the diagnostic with the LIVE track — catches cases where
          // html5-qrcode re-negotiated to a different camera than what we
          // resolved. A " (user-facing!)" suffix highlights when the live
          // camera disagrees with what we asked for.
          {
            const liveLabel = track.label ?? ''
            const fm        = (track.getSettings?.() as Record<string, unknown> | undefined)?.facingMode
            const wrong     = fm === 'user' || /front|user|selfie|face/i.test(liveLabel)
            if (liveLabel) {
              setCameraLabel(wrong ? `${liveLabel} (user-facing!)` : liveLabel)
            }
          }

          const caps = track.getCapabilities?.() as Record<string, unknown> | undefined

          // ── Zoom ────────────────────────────────────────────────────────────
          const zoomCap = caps?.zoom as { min?: number; max?: number; step?: number } | undefined
          if (zoomCap?.max && zoomCap.max > 1) {
            const min = zoomCap.min ?? 1
            const max = zoomCap.max
            setZoomRange({ min, max })
            // Start at 20% of zoom range — enough extra reach for shelf labels
            // without sacrificing the wide field of view for close scanning.
            const defaultZoom = Math.min(min + (max - min) * 0.20, max)
            if (defaultZoom > 1) {
              track.applyConstraints({ advanced: [{ zoom: defaultZoom } as MediaTrackConstraintSet] } as MediaTrackConstraints)
              setZoom(defaultZoom)
            }
          }

          // ── Torch ───────────────────────────────────────────────────────────
          if ((caps as Record<string, unknown> | undefined)?.torch) {
            setTorchSupported(true)
          }

          // ── Continuous autofocus ────────────────────────────────────────────
          // Ensures the camera re-focuses as distance to the barcode changes.
          const focusModes = (caps as Record<string, unknown> | undefined)?.focusMode as string[] | undefined
          if (focusModes?.includes('continuous')) {
            track.applyConstraints({
              advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
            } as MediaTrackConstraints).catch(() => {})
          }
        } catch { /* older browser — no extended camera API */ }
      })
      .catch((err) => {
        setError(typeof err === 'string' ? err : (err as Error).message ?? 'Camera not available')
      }))

    return () => {
      activeRef.current  = false
      trackRef.current   = null
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
    activeRef.current  = false
    trackRef.current   = null
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
    applyZoom(zoom + (zoomRange.max - zoomRange.min) * 0.1)
  }

  function handleZoomOut() {
    if (!zoomRange) return
    applyZoom(zoom - (zoomRange.max - zoomRange.min) * 0.1)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 z-10">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">Scan Barcode</p>
          {cameraLabel && (
            <p className={`text-[10px] truncate ${
              /user-facing!|front|user|selfie/i.test(cameraLabel)
                ? 'text-red-300'
                : 'text-white/40'
            }`}>
              {cameraLabel}
            </p>
          )}
        </div>
        <button onClick={handleClose} className="text-white/70 hover:text-white p-1">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center relative">
        <div id="barcode-reader" className="w-full max-w-md" />
        {!error && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {/* Viewfinder sized to match qrbox — wide and short for 1D barcodes */}
            <div className="relative" style={{ width: 340, height: 160 }}>
              <div className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-emerald-400 rounded-tl-md" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-emerald-400 rounded-tr-md" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-emerald-400 rounded-bl-md" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-emerald-400 rounded-br-md" />
              <div className="absolute left-2 right-2 h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-scanner-line" />
            </div>
          </div>
        )}
      </div>

      {/* Controls — zoom (if supported) + torch (if supported) */}
      {(zoomRange || torchSupported) && (
        <div className="flex items-center justify-center gap-3 pb-2">
          {zoomRange && (
            <>
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
            </>
          )}
          {torchSupported && (
            <button
              onClick={handleTorch}
              className={`p-2.5 rounded-full text-white active:bg-white/20 transition-colors ${
                torch ? 'bg-yellow-500/50' : 'bg-white/10'
              }`}
              title={torch ? 'Turn off torch' : 'Turn on torch'}
            >
              {torch
                ? <Zap size={20} className="text-yellow-300" />
                : <ZapOff size={20} />
              }
            </button>
          )}
        </div>
      )}

      {error ? (
        <div className="px-6 pb-6 text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-red-400">
            <AlertTriangle size={16} />
            <p className="text-sm">{error}</p>
          </div>
          <button onClick={handleClose} className="text-sm text-white/70 underline">
            Close and try again
          </button>
        </div>
      ) : (
        <p className="text-center text-xs text-white/50 pb-6">
          {torchSupported
            ? 'Align barcode in frame — tap ⚡ for low light'
            : 'Align barcode in frame — use zoom for distance'}
        </p>
      )}
    </div>
  )
}
