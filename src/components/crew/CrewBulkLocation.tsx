import { useState, useEffect, useRef } from 'react'
import {
  Search, ScanBarcode, Loader2, Check, Trash2, MapPin,
  AlertCircle, ChevronRight, Package,
} from 'lucide-react'
import {
  searchItemsSmart, barcodeVariants, searchItems,
  getLocations, getItemLocations, getLocationItems,
  bulkAssignItems, assignItemToLocation,
  type ItemLocation,
} from '../../lib/jarvis'
import { flattenLocations, formatLocPath } from '../../lib/locationUtils'
import type { FlatLocation } from '../../lib/locationUtils'
import LocationCascade, { useCascadeState } from '../LocationCascade'
import BarcodeScanner from '../BarcodeScanner'

// ── Types ───────────────────────────────────────────────────────────────────

interface QueueItem {
  itemCode: string
  barcode: string | null
  name: string
  department: string
  existingLocs?: ItemLocation[]    // undefined = not loaded yet
}

type ResultStatus = 'new' | 'already' | 'failed'

interface AssignResult {
  itemCode: string
  name: string
  status: ResultStatus
}

type Step = 'build' | 'assign' | 'done'

// ── Component ───────────────────────────────────────────────────────────────

export default function CrewBulkLocation() {
  const [step, setStep] = useState<Step>('build')

  // Build step
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchSeq = useRef(0)
  const locCache = useRef(new Map<string, ItemLocation[]>())

  // Location picker
  const [flatLocs, setFlatLocs] = useState<FlatLocation[]>([])
  const [locsLoading, setLocsLoading] = useState(false)
  const cascade = useCascadeState()

  // Assign step
  const [assignResults, setAssignResults] = useState<AssignResult[]>([])
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  // Load location tree on mount
  useEffect(() => {
    setLocsLoading(true)
    getLocations()
      .then(tree => setFlatLocs(flattenLocations(tree)))
      .catch(() => {})
      .finally(() => setLocsLoading(false))
  }, [])

  // Fetch + cache existing locations for a single item code.
  async function fetchLocs(code: string): Promise<ItemLocation[]> {
    const cached = locCache.current.get(code)
    if (cached) return cached
    try {
      const locs = await getItemLocations(code)
      locCache.current.set(code, locs)
      return locs
    } catch {
      return []
    }
  }

  // Enrich any array of items with existing-location info in parallel.
  // Only updates state rows whose itemCode matches; safe to race with re-searches.
  async function enrichWithLocations(
    items: QueueItem[],
    setter: (updater: (prev: QueueItem[]) => QueueItem[]) => void,
    seq?: number,
  ) {
    await Promise.all(items.map(async item => {
      const locs = await fetchLocs(item.itemCode)
      if (seq !== undefined && seq !== searchSeq.current) return  // stale
      setter(prev => prev.map(r =>
        r.itemCode === item.itemCode && r.existingLocs === undefined
          ? { ...r, existingLocs: locs }
          : r
      ))
    }))
  }

  // Search with debounce — smart search tries barcode variants for digit-only input
  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      const seq = ++searchSeq.current
      setLoading(true)
      try {
        const res = await searchItemsSmart(query.trim(), 8)
        if (seq !== searchSeq.current) return  // stale
        const mapped: QueueItem[] = res.items.map(i => ({
          itemCode: i.itemCode,
          barcode: i.barcode,
          name: i.description,
          department: i.department,
          existingLocs: locCache.current.get(i.itemCode),
        }))
        setResults(mapped)
        // Fire-and-forget enrichment for rows not yet cached
        const toFetch = mapped.filter(m => m.existingLocs === undefined)
        if (toFetch.length > 0) enrichWithLocations(toFetch, setResults, seq)
      } catch { setResults([]) }
      setLoading(false)
    }, 300)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [query])

  // Pressing Enter treats the input like a barcode scan — try variants,
  // auto-queue the best match. Useful for typed 6-digit ordercodes and
  // 12-13 digit barcodes without forcing a full live-search pass.
  async function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return

    // Prefer an exact itemCode/barcode hit from current live results
    const hit =
      results.find(r => r.itemCode === trimmed) ||
      results.find(r => r.barcode === trimmed) ||
      (results.length === 1 ? results[0] : null)
    if (hit) { addToQueue(hit); return }

    // Otherwise fall back to variant-based resolution (barcode semantics)
    const variants = /^\d+$/.test(trimmed) ? barcodeVariants(trimmed) : [trimmed]
    setLoading(true)
    try {
      for (const v of variants) {
        const res = await searchItems(v, 3).catch(() => null)
        if (res && res.items.length > 0) {
          const item = res.items[0]
          addToQueue({
            itemCode: item.itemCode,
            barcode: item.barcode,
            name: item.description,
            department: item.department,
          })
          return
        }
      }
    } finally {
      setLoading(false)
    }
  }

  function addToQueue(item: QueueItem) {
    if (queue.some(q => q.itemCode === item.itemCode)) return
    const next: QueueItem = { ...item, existingLocs: item.existingLocs ?? locCache.current.get(item.itemCode) }
    setQueue(prev => [...prev, next])
    setQuery('')
    setResults([])
    if (next.existingLocs === undefined) {
      // Enrich this queue row in the background
      fetchLocs(next.itemCode).then(locs => {
        setQueue(prev => prev.map(q =>
          q.itemCode === next.itemCode && q.existingLocs === undefined
            ? { ...q, existingLocs: locs }
            : q
        ))
      })
    }
  }

  function removeFromQueue(itemCode: string) {
    setQueue(prev => prev.filter(q => q.itemCode !== itemCode))
  }

  async function handleBarcodeScan(barcode: string) {
    setScannerOpen(false)
    const variants = barcodeVariants(barcode)
    for (const v of variants) {
      try {
        const res = await searchItems(v, 3)
        if (res.items.length > 0) {
          const item = res.items[0]
          addToQueue({
            itemCode: item.itemCode,
            barcode: item.barcode,
            name: item.description,
            department: item.department,
          })
          return
        }
      } catch { /* try next variant */ }
    }
    // Fallback: add raw barcode
    addToQueue({ itemCode: barcode, barcode, name: barcode, department: '' })
  }

  async function handleAssign() {
    const targetId = cascade.resolveTarget()
    if (!targetId || queue.length === 0) return

    setStep('assign')
    const allCodes = queue.map(q => q.itemCode)
    setProgress({ done: 0, total: allCodes.length })

    // Verify via getLocationItems(targetId) — the items-AT-location endpoint.
    // Earlier attempts used getItemLocations(itemCode) and compared numeric
    // locationId fields, which silently broke when the backend returned the
    // ID under a different key (locationID, location_id, id) or as a string.
    // getLocationItems keys by itemCode (a string), sidestepping all of that.
    const readAtTarget = async (): Promise<Set<string>> => {
      try {
        const items = await getLocationItems(targetId)
        return new Set(items.map(i => i.itemCode))
      } catch { return new Set() }
    }

    // Snapshot pre-assign state once — distinguishes 'new' vs 'already'.
    const preAtTarget = await readAtTarget()

    // Bulk assign
    try {
      await bulkAssignItems(targetId, allCodes)
    } catch { /* continue to verify — individual retry handles failures */ }

    // Read post-state with a single retry to absorb POS read-after-write lag.
    let postAtTarget = await readAtTarget()
    const missing = allCodes.filter(c => !postAtTarget.has(c))
    if (missing.length > 0) {
      await new Promise(r => setTimeout(r, 500))
      postAtTarget = await readAtTarget()
    }

    const results: AssignResult[] = []
    const failedCodes: string[] = []

    for (const item of queue) {
      // Refresh per-item location cache so the UI chip on the Done step
      // reflects the new state next time the item is searched.
      getItemLocations(item.itemCode).then(locs =>
        locCache.current.set(item.itemCode, locs),
      ).catch(() => {})

      if (postAtTarget.has(item.itemCode)) {
        results.push({
          itemCode: item.itemCode, name: item.name,
          status: preAtTarget.has(item.itemCode) ? 'already' : 'new',
        })
      } else {
        failedCodes.push(item.itemCode)
      }
      setProgress(prev => ({ ...prev, done: prev.done + 1 }))
    }

    // Retry pass: individual assign for failed items.
    if (failedCodes.length > 0) {
      for (const code of failedCodes) {
        try { await assignItemToLocation(targetId, code) } catch { /* keep going */ }
      }
      // Re-read once more after individual retries.
      await new Promise(r => setTimeout(r, 300))
      const finalAtTarget = await readAtTarget()
      for (const code of failedCodes) {
        const item = queue.find(q => q.itemCode === code)!
        results.push({
          itemCode: code, name: item.name,
          status: finalAtTarget.has(code) ? 'new' : 'failed',
        })
      }
    }

    setAssignResults(results)
    setStep('done')
  }

  function handleAssignAnother() {
    setQueue([])
    setAssignResults([])
    setStep('build')
    // Keep cascade selection
  }

  function handleStartOver() {
    setQueue([])
    setAssignResults([])
    cascade.reset()
    setStep('build')
  }

  const targetId = cascade.resolveTarget()
  const targetLoc = targetId ? flatLocs.find(f => f.id === targetId) : null

  const newCount = assignResults.filter(r => r.status === 'new').length
  const alreadyCount = assignResults.filter(r => r.status === 'already').length
  const failedCount = assignResults.filter(r => r.status === 'failed').length

  // Render location summary line for a queue/result row
  function renderLocLine(item: QueueItem) {
    if (item.existingLocs === undefined) {
      return <span className="text-[10px] text-gray-300">Checking location...</span>
    }
    if (item.existingLocs.length === 0) {
      return <span className="text-[10px] text-gray-400 italic">Not yet assigned</span>
    }
    const atTarget = targetId != null && item.existingLocs.some(l => l.locationId === targetId)
    const first = formatLocPath(item.existingLocs[0], flatLocs)
    const more = item.existingLocs.length - 1
    const title = item.existingLocs.map(l => formatLocPath(l, flatLocs)).join(' | ')
    return (
      <span className="text-[10px] flex items-center gap-1 min-w-0" title={title}>
        <MapPin size={9} className="text-indigo-500 shrink-0" />
        <span className="text-indigo-700 font-medium truncate">{first}</span>
        {more > 0 && <span className="text-gray-400">+{more}</span>}
        {atTarget && (
          <span className="ml-1 px-1 py-[1px] rounded bg-amber-100 text-amber-700 text-[9px] font-semibold shrink-0">
            Already at target
          </span>
        )}
      </span>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Summary strip */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 shrink-0">
        <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center shrink-0">
          <MapPin size={18} className="text-indigo-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-400">
            {step === 'build' ? `${queue.length} item${queue.length !== 1 ? 's' : ''} queued` :
             step === 'assign' ? `Assigning ${progress.done}/${progress.total}...` :
             `${newCount} assigned, ${alreadyCount} existing, ${failedCount} failed`}
          </p>
          {targetLoc && step === 'build' && (
            <p className="text-[11px] font-medium text-indigo-700 truncate">{targetLoc.path}</p>
          )}
        </div>
      </div>

      {/* ═══════════════ BUILD STEP ═══════════════ */}
      {step === 'build' && (
        <div className="flex-1 overflow-y-auto">
          {/* 1. Target Location (cascade) ── pick destination first */}
          <div className="px-4 pt-3 pb-3 border-b border-gray-100">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Target Location
            </p>
            {locsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 size={16} className="text-gray-400 animate-spin" />
                <span className="text-xs text-gray-400 ml-2">Loading locations...</span>
              </div>
            ) : (
              <LocationCascade
                flatLocations={flatLocs}
                busy={false}
                zoneId={cascade.zoneId}
                aisleId={cascade.aisleId}
                bayId={cascade.bayId}
                rowId={cascade.rowId}
                onZoneChange={cascade.setZoneId}
                onAisleChange={cascade.setAisleId}
                onBayChange={cascade.setBayId}
                onRowChange={cascade.setRowId}
              />
            )}
            {targetLoc && (
              <div className="mt-2 flex items-center gap-1.5 px-2 py-1.5 bg-indigo-50 rounded-lg">
                <MapPin size={12} className="text-indigo-600 shrink-0" />
                <span className="text-xs font-medium text-indigo-700 truncate">{targetLoc.path}</span>
              </div>
            )}
          </div>

          {/* 2. Sticky search + scan ── always reachable while scrolling */}
          <div className="sticky top-0 z-10 bg-white px-4 pt-3 pb-2 border-b border-gray-100 space-y-2">
            <form onSubmit={handleSearchSubmit} className="flex gap-2">
              <div className="flex-1 relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  inputMode="search"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Scan, type barcode or ordercode..."
                  className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="px-3 py-2 bg-indigo-600 text-white rounded-lg flex items-center gap-1 font-medium text-xs hover:bg-indigo-700"
              >
                <ScanBarcode size={16} />
                <span>Scan</span>
              </button>
            </form>

            {/* Live search results — show name + department + existing location */}
            {loading && <p className="text-xs text-gray-400 text-center py-1 animate-pulse">Searching...</p>}
            {!loading && results.length > 0 && (
              <div className="max-h-[240px] overflow-y-auto border border-indigo-100 bg-white rounded-lg shadow-sm">
                {results.map((item, i) => {
                  const inQueue = queue.some(q => q.itemCode === item.itemCode)
                  return (
                    <button
                      key={`${item.itemCode}-${i}`}
                      type="button"
                      onClick={() => addToQueue(item)}
                      disabled={inQueue}
                      className="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-indigo-50/50 border-b border-gray-50 last:border-0 disabled:opacity-50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-gray-800 truncate">{item.name}</p>
                        <p className="text-[10px] text-gray-400 truncate">{item.department} · #{item.itemCode}</p>
                        <div className="mt-0.5">{renderLocLine(item)}</div>
                      </div>
                      {inQueue ? (
                        <Check size={14} className="text-emerald-600 shrink-0 ml-2" />
                      ) : (
                        <ChevronRight size={14} className="text-gray-300 shrink-0 ml-2" />
                      )}
                    </button>
                  )
                })}
              </div>
            )}
            {!loading && query.trim() && results.length === 0 && (
              <p className="text-[11px] text-gray-400 text-center py-1">No items found</p>
            )}
          </div>

          {/* 3. Queue */}
          <div className="px-4 pt-3 pb-2">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Items to assign ({queue.length})
            </p>
            {queue.length === 0 ? (
              <div className="py-6 text-center">
                <Package size={24} className="text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-400">Scan or search items above to queue them</p>
              </div>
            ) : (
              <div className="space-y-1">
                {queue.map(item => (
                  <div key={item.itemCode} className="flex items-center justify-between bg-gray-50 rounded-lg px-2.5 py-1.5 gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-800 truncate">{item.name}</p>
                      <p className="text-[10px] text-gray-400">#{item.itemCode}</p>
                      <div className="mt-0.5">{renderLocLine(item)}</div>
                    </div>
                    <button
                      onClick={() => removeFromQueue(item.itemCode)}
                      className="p-1 text-gray-400 hover:text-red-600 shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 4. Assign button */}
          <div className="px-4 pb-4 pt-2 border-t border-gray-100">
            <button
              onClick={handleAssign}
              disabled={queue.length === 0 || !targetId}
              className="w-full bg-indigo-600 text-white text-sm font-semibold py-3 rounded-xl disabled:opacity-40 hover:bg-indigo-700 transition-colors"
            >
              Assign {queue.length} item{queue.length !== 1 ? 's' : ''} to location
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════ ASSIGN STEP ═══════════════ */}
      {step === 'assign' && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
          <Loader2 size={32} className="text-indigo-600 animate-spin mb-4" />
          <p className="text-sm font-medium text-gray-800">Assigning items...</p>
          <p className="text-xs text-gray-400 mt-1">{progress.done} of {progress.total} verified</p>
          <div className="w-48 h-1.5 bg-gray-200 rounded-full mt-3 overflow-hidden">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all duration-300"
              style={{ width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {/* ═══════════════ DONE STEP ═══════════════ */}
      {step === 'done' && (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {/* Summary */}
          <div className="flex flex-col items-center py-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${failedCount === 0 ? 'bg-emerald-100' : 'bg-amber-100'}`}>
              {failedCount === 0 ? <Check size={24} className="text-emerald-600" /> : <AlertCircle size={24} className="text-amber-600" />}
            </div>
            <p className="text-sm font-semibold text-gray-800">
              {failedCount === 0 ? 'All items assigned!' : 'Assignment complete'}
            </p>
            {targetLoc && (
              <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                <MapPin size={10} /> {targetLoc.path}
              </p>
            )}
          </div>

          {/* Counts */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-emerald-50 rounded-lg p-2 text-center">
              <p className="text-lg font-bold text-emerald-700">{newCount}</p>
              <p className="text-[10px] text-emerald-600">Newly Assigned</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-2 text-center">
              <p className="text-lg font-bold text-blue-700">{alreadyCount}</p>
              <p className="text-[10px] text-blue-600">Already There</p>
            </div>
            <div className="bg-red-50 rounded-lg p-2 text-center">
              <p className="text-lg font-bold text-red-700">{failedCount}</p>
              <p className="text-[10px] text-red-600">Failed</p>
            </div>
          </div>

          {/* Result list */}
          <div className="space-y-1">
            {assignResults.map(r => (
              <div key={r.itemCode} className="flex items-center justify-between bg-gray-50 rounded-lg px-2.5 py-1.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{r.name}</p>
                  <p className="text-[10px] text-gray-400">#{r.itemCode}</p>
                </div>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                  r.status === 'new' ? 'bg-emerald-100 text-emerald-700' :
                  r.status === 'already' ? 'bg-blue-100 text-blue-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {r.status === 'new' ? 'Assigned' : r.status === 'already' ? 'Existing' : 'Failed'}
                </span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleAssignAnother}
              className="flex-1 bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-indigo-700"
            >
              Assign Another Batch
            </button>
            <button
              onClick={handleStartOver}
              className="flex-1 bg-gray-100 text-gray-700 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-200"
            >
              Start Over
            </button>
          </div>
        </div>
      )}

      {/* Barcode scanner */}
      {scannerOpen && (
        <BarcodeScanner
          open={scannerOpen}
          onScan={handleBarcodeScan}
          onClose={() => setScannerOpen(false)}
        />
      )}
    </div>
  )
}
