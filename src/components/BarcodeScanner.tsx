import { useEffect, useRef, useState, useCallback } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { X, AlertTriangle, ZoomIn, ZoomOut, Zap, ZapOff, RotateCcw } from 'lucide-react'

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

// Candidate in the ordered start-and-verify queue. Either a specific device
// (preferred — we inspect the live track after start() and reject if front)
// or a bare facingMode selector as a final browser-picks-for-us net.
type Candidate =
  | { kind: 'device'; deviceId: string; label: string }
  | { kind: 'facingMode' }

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
  // Bumping this re-runs the effect — used by the Retry button to re-attempt
  // the whole candidate queue after an exhaust/error without forcing the user
  // to close and reopen the sheet.
  const [retryToken, setRetryToken]     = useState(0)

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

    const configuration = {
      fps: 20,
      // Wide, short box matches the 3.5:1 aspect of EAN-13 / UPC-A.
      // More horizontal pixels captured → better bar resolution at distance.
      qrbox: { width: 340, height: 160 },
      aspectRatio: 1.7778,     // 16:9 widescreen → full horizontal resolution
      disableFlip: true,        // 1D barcodes don't need mirror check; saves CPU
      videoConstraints: {
        width:     { min: 640, ideal: 1920 },
        height:    { min: 480, ideal: 1080 },
        frameRate: { ideal: 30, max: 60 },
      } as MediaTrackConstraints,
    }

    const onDecode = (decodedText: string) => {
      if (!activeRef.current) return
      activeRef.current  = false
      scannerRef.current = null
      trackRef.current   = null
      scanner.stop()
        .then(() => { try { scanner.clear() } catch {} })
        .catch(() => { try { scanner.clear() } catch {} })
      onScanRef.current(decodedText)
    }

    const readLiveTrack = (): MediaStreamTrack | null => {
      const videoEl = document.querySelector('#barcode-reader video') as HTMLVideoElement | null
      return videoEl?.srcObject instanceof MediaStream
        ? (videoEl.srcObject.getVideoTracks()[0] ?? null)
        : null
    }

    // Wire up zoom / torch / continuous-autofocus once we've committed to a
    // verified back-facing track. Called only on a successful (non-rejected)
    // start so we don't reset state across retry iterations.
    const attachZoomTorchFocus = (track: MediaStreamTrack) => {
      try {
        trackRef.current = track
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
    }

    // Build the ordered candidate queue. Previous pickers tried to pre-verify
    // the back cam via getUserMedia probes, then committed to a single
    // scanner.start() call; if any browser-quirk resolved that call to the
    // front cam (happens on iOS Safari / some Android Chromes even with
    // { exact: 'environment' }), we had no recovery path. Now we treat the
    // LIVE track post-start as the source of truth and retry from the queue.
    const buildCandidateQueue = async (): Promise<Candidate[]> => {
      const out: Candidate[] = []

      // Prime permissions so enumerateDevices() returns non-empty labels.
      // Uses 'ideal' (not 'exact') so desktops with only a front cam still
      // resolve rather than throw — the probe is just for label visibility.
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        })
        s.getTracks().forEach(t => t.stop())
      } catch { /* permission may still be valid; continue */ }

      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const inputs  = devices.filter(d => d.kind === 'videoinput')

        // Score: obvious-back (0) before unknown (1) before obvious-front (2).
        // We keep obvious-front in the queue so a single-cam laptop still
        // scans (with a visible red diagnostic label), rather than failing
        // entirely.
        const scored = inputs
          .map(d => ({
            d,
            score: /back|rear|environment|world/i.test(d.label) ? 0
                 : /front|user|selfie|face/i.test(d.label) ? 2
                 : 1,
          }))
          .sort((a, b) => a.score - b.score)

        for (const { d } of scored) {
          out.push({ kind: 'device', deviceId: d.deviceId, label: d.label })
        }
      } catch { /* enumeration unavailable */ }

      // Final net for devices that refuse enumerate() — let the browser pick
      // via facingMode. `exact` so a browser that can't honour environment
      // rejects cleanly (the loop's catch ignores it and ends the queue).
      out.push({ kind: 'facingMode' })
      return out
    }

    // Start scanner.start() against each candidate in turn. After each start,
    // read the LIVE video track's facingMode + label. If clearly user-facing,
    // stop and advance to the next candidate. If ambiguous (empty label, no
    // facingMode reported) accept it — better than rejecting a valid back cam.
    const tryStartPinned = async (): Promise<void> => {
      const queue = await buildCandidateQueue()

      for (const cand of queue) {
        if (!activeRef.current) return  // unmounted mid-loop

        const selector: MediaTrackConstraints = cand.kind === 'device'
          ? { deviceId: { exact: cand.deviceId } }
          : { facingMode: { exact: 'environment' } }

        try {
          // First arg MUST be exactly 1 key (html5-qrcode validates this).
          // Additional constraints live in configuration.videoConstraints.
          await scanner.start(
            selector as unknown as MediaTrackConstraints,
            configuration,
            onDecode,
            () => {},
          )
        } catch {
          // OverconstrainedError, NotFoundError, etc. — next candidate.
          continue
        }

        if (!activeRef.current) {
          // Sheet closed while we were starting — tear down and bail.
          try { await scanner.stop() } catch {}
          try { scanner.clear() } catch {}
          return
        }

        const liveTrack = readLiveTrack()
        if (!liveTrack) {
          // Scanner running but we can't inspect the track. Trust it.
          setCameraLabel(cand.kind === 'device' ? (cand.label || 'Camera active') : 'Camera active')
          return
        }

        const settings = (liveTrack.getSettings?.() as Record<string, unknown> | undefined) ?? {}
        const fm       = typeof settings.facingMode === 'string' ? settings.facingMode : ''
        const label    = liveTrack.label ?? ''
        const isFront  = fm === 'user' || /front|user|selfie|face/i.test(label)

        if (!isFront) {
          setCameraLabel(label || 'Back camera')
          attachZoomTorchFocus(liveTrack)
          return
        }

        // Clearly front — stop and try the next candidate.
        setCameraLabel(`Rejected: ${label || 'user-facing'} — trying next…`)
        try { await scanner.stop() } catch {}
      }

      // Queue exhausted — no non-front cam on this device. Show error + Retry.
      if (activeRef.current) {
        setError('No back-facing camera detected on this device.')
      }
    }

    tryStartPinned().catch((err) => {
      if (!activeRef.current) return
      setError(typeof err === 'string' ? err : (err as Error).message ?? 'Camera not available')
    })

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
  }, [open, retryToken])

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

  function handleRetry() {
    // Tear down current scanner then bump retryToken so the effect re-runs
    // from scratch with a fresh candidate queue.
    const s = scannerRef.current
    scannerRef.current = null
    trackRef.current   = null
    activeRef.current  = false
    if (s) {
      s.stop()
        .then(() => { try { s.clear() } catch {} })
        .catch(() => { try { s.clear() } catch {} })
    }
    setError(null)
    setCameraLabel('')
    setRetryToken(t => t + 1)
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
              /rejected|user-facing!|front|user|selfie/i.test(cameraLabel)
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
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleRetry}
              className="inline-flex items-center gap-1.5 text-sm text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg"
            >
              <RotateCcw size={14} /> Retry
            </button>
            <button onClick={handleClose} className="text-sm text-white/70 underline">
              Close
            </button>
          </div>
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
