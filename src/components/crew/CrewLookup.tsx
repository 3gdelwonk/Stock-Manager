import { useState, useEffect, useCallback } from 'react'
import { Search, ScanBarcode, Package, X, Plus, Pencil, Trash2, MapPin } from 'lucide-react'
import {
  searchItems, type StockItem, getStockLevels,
  getLocations, getItemLocations, assignItemToLocation, removeItemFromLocation,
  type ItemLocation,
} from '../../lib/jarvis'
import { flattenLocations, buildItemBreadcrumb, LEVEL_ORDER, TYPE_LABELS } from '../../lib/locationUtils'
import type { FlatLocation } from '../../lib/locationUtils'
import LocationCascade, { useCascadeState } from '../LocationCascade'
import BarcodeScanner from '../BarcodeScanner'
import ProductImage from '../ProductImage'

interface LookupResult {
  itemCode: string
  barcode: string | null
  description: string
  department: string
  sellPrice: number
  onHand: number
  reorderLevel: number
  isOnReorder: boolean
}

export default function CrewLookup() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LookupResult[]>([])
  const [loading, setLoading] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [selected, setSelected] = useState<LookupResult | null>(null)
  const [searched, setSearched] = useState(false)

  // ── Per-product location state ──
  const [serverLocs, setServerLocs] = useState<ItemLocation[]>([])
  const [flatLocs, setFlatLocs] = useState<FlatLocation[]>([])
  const [locBusy, setLocBusy] = useState(false)
  const [locPickerOpen, setLocPickerOpen] = useState(false)
  const [editingLocId, setEditingLocId] = useState<number | null>(null)
  const [locMsg, setLocMsg] = useState<string | null>(null)
  const cascade = useCascadeState()

  // Load server locations + flat tree whenever a product is selected
  useEffect(() => {
    if (!selected) {
      setServerLocs([])
      setLocPickerOpen(false)
      setEditingLocId(null)
      cascade.reset()
      setLocMsg(null)
      return
    }
    getItemLocations(selected.itemCode).then(setServerLocs).catch(() => setServerLocs([]))
    if (flatLocs.length === 0) {
      getLocations().then(tree => setFlatLocs(flattenLocations(tree))).catch(() => {})
    }
  }, [selected?.itemCode])

  // Auto-dismiss transient messages
  useEffect(() => {
    if (!locMsg) return
    const id = setTimeout(() => setLocMsg(null), 2000)
    return () => clearTimeout(id)
  }, [locMsg])

  async function handleAssignLocation() {
    if (!selected) return
    const targetId = cascade.resolveTarget()
    if (!targetId) return
    setLocBusy(true)
    try {
      if (editingLocId) {
        await removeItemFromLocation(editingLocId, selected.itemCode)
      }
      await assignItemToLocation(targetId, selected.itemCode)
      const updated = await getItemLocations(selected.itemCode)
      setServerLocs(updated)
      cascade.reset()
      setLocPickerOpen(false)
      setEditingLocId(null)
      setLocMsg(editingLocId ? 'Location changed' : 'Location assigned')
    } catch (err) {
      setLocMsg(`Failed: ${(err as Error).message}`)
      if (editingLocId) {
        getItemLocations(selected.itemCode).then(setServerLocs).catch(() => {})
      }
    } finally {
      setLocBusy(false)
    }
  }

  async function handleRemoveLocation(locId: number) {
    if (!selected) return
    setLocBusy(true)
    try {
      await removeItemFromLocation(locId, selected.itemCode)
      const updated = await getItemLocations(selected.itemCode)
      setServerLocs(updated)
      setLocMsg('Location removed')
    } catch (err) {
      setLocMsg(`Remove failed: ${(err as Error).message}`)
    } finally {
      setLocBusy(false)
    }
  }

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) { setResults([]); setSearched(false); return }

    setLoading(true)
    setSearched(true)
    setSelected(null)
    try {
      // Search via JARVISmart API
      const result = await searchItems(trimmed, 15)
      const mapped: LookupResult[] = result.items.map(item => ({
        itemCode: item.itemCode,
        barcode: item.barcode || null,
        description: item.description,
        department: item.department,
        sellPrice: item.sellPrice,
        onHand: 0,
        reorderLevel: 0,
        isOnReorder: false,
      }))

      // Try to enrich with stock levels for the first few results
      if (mapped.length > 0) {
        try {
          const stockData = await getStockLevels({ limit: 50000 })
          const stockMap = new Map<string, StockItem>()
          for (const s of stockData) stockMap.set(s.itemCode, s)
          for (const r of mapped) {
            const s = stockMap.get(r.itemCode)
            if (s) {
              r.onHand = s.onHand
              r.reorderLevel = s.reorderLevel
              r.isOnReorder = s.isOnReorder
              r.sellPrice = s.sellPrice // use live price
            }
          }
        } catch { /* stock data unavailable, continue with search results */ }
      }

      setResults(mapped)

      // Auto-select if single result (e.g., barcode scan)
      if (mapped.length === 1) setSelected(mapped[0])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  function handleScan(code: string) {
    setScannerOpen(false)
    setQuery(code)
    doSearch(code)
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    doSearch(query)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <form onSubmit={handleSearchSubmit} className="px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Scan or search product..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="px-3 py-2 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
          >
            <ScanBarcode size={20} className="text-emerald-600" />
          </button>
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setResults([]); setSelected(null); setSearched(false) }}
              className="px-2 py-2 text-gray-400 hover:text-gray-600"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </form>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <p className="text-sm text-gray-400 text-center py-8 animate-pulse">Searching...</p>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="text-center py-8">
            <Package size={32} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-400">No products found</p>
          </div>
        )}

        {/* Selected product detail */}
        {selected && (
          <div className="p-4 space-y-4">
            <div className="flex items-start gap-3">
              <ProductImage
                itemCode={selected.itemCode}
                description={selected.description}
                department={selected.department}
                barcode={selected.barcode}
                size={80}
                className="rounded-xl shadow-sm"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 leading-tight">{selected.description}</p>
                <span className="inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                  {selected.department}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-emerald-500 uppercase font-medium">Sell Price</p>
                <p className="text-xl font-bold text-emerald-700">${selected.sellPrice.toFixed(2)}</p>
              </div>
              <div className={`rounded-xl p-3 text-center ${selected.onHand <= 0 ? 'bg-red-50' : selected.onHand <= selected.reorderLevel ? 'bg-amber-50' : 'bg-green-50'}`}>
                <p className={`text-[10px] uppercase font-medium ${selected.onHand <= 0 ? 'text-red-500' : selected.onHand <= selected.reorderLevel ? 'text-amber-500' : 'text-green-500'}`}>In Stock</p>
                <p className={`text-xl font-bold ${selected.onHand <= 0 ? 'text-red-700' : selected.onHand <= selected.reorderLevel ? 'text-amber-700' : 'text-green-700'}`}>{selected.onHand}</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl px-3 py-2 space-y-1 text-xs text-gray-500">
              <div className="flex justify-between">
                <span>Item Code</span>
                <span className="font-mono font-medium text-gray-700">{selected.itemCode}</span>
              </div>
              {selected.barcode && (
                <div className="flex justify-between">
                  <span>Barcode</span>
                  <span className="font-mono font-medium text-gray-700">{selected.barcode}</span>
                </div>
              )}
              {selected.isOnReorder && (
                <div className="flex justify-between">
                  <span>Status</span>
                  <span className="font-medium text-emerald-600">On Reorder</span>
                </div>
              )}
            </div>

            {/* ── Store Locations ── */}
            <div className="bg-indigo-50/40 rounded-xl p-3 space-y-2 border border-indigo-100">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider flex items-center gap-1">
                  <MapPin size={11} /> Store Locations
                </p>
                {!locPickerOpen && (
                  <button
                    onClick={() => { setLocPickerOpen(true); setEditingLocId(null); cascade.reset() }}
                    className="flex items-center gap-0.5 text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    <Plus size={12} /> Add Location
                  </button>
                )}
              </div>

              {/* Current assignments */}
              {serverLocs.length > 0 ? (
                <div className="space-y-1.5">
                  {serverLocs.map((sl, i) => {
                    const crumbs = buildItemBreadcrumb(sl, flatLocs)
                    return (
                      <div key={i} className="flex items-center gap-1.5 bg-white rounded-lg px-2 py-1.5 border border-indigo-50">
                        <div className="flex-1 grid grid-cols-4 gap-1 text-[10px]">
                          {LEVEL_ORDER.map(tid => {
                            const cell = crumbs[tid]
                            return (
                              <div key={tid} className="text-center">
                                <span className="text-[8px] text-gray-400 block">{TYPE_LABELS[tid]}</span>
                                <span className={`font-medium ${cell.shortCode ? 'text-gray-700' : 'text-gray-300'}`}>
                                  {cell.shortCode || cell.name || '—'}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                        <button
                          onClick={() => {
                            setEditingLocId(sl.locationId)
                            cascade.reset()
                            setLocPickerOpen(true)
                          }}
                          className="p-1 text-gray-400 hover:text-indigo-600"
                          title="Change location"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => handleRemoveLocation(sl.locationId)}
                          disabled={locBusy}
                          className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-50"
                          title="Remove location"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-gray-400 text-center py-1">No store locations assigned</p>
              )}

              {/* Cascade picker */}
              {locPickerOpen && (
                <div className="border-t border-indigo-100 pt-2 space-y-2">
                  <p className="text-[11px] font-medium text-gray-600">
                    {editingLocId ? 'Change to:' : 'Assign to:'}
                  </p>
                  <LocationCascade
                    flatLocations={flatLocs}
                    busy={locBusy}
                    zoneId={cascade.zoneId}
                    aisleId={cascade.aisleId}
                    bayId={cascade.bayId}
                    rowId={cascade.rowId}
                    onZoneChange={cascade.setZoneId}
                    onAisleChange={cascade.setAisleId}
                    onBayChange={cascade.setBayId}
                    onRowChange={cascade.setRowId}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleAssignLocation}
                      disabled={!cascade.hasInput || locBusy}
                      className="flex-1 bg-indigo-600 text-white text-xs font-medium py-2 rounded-lg disabled:opacity-50 hover:bg-indigo-700"
                    >
                      {locBusy ? 'Saving...' : editingLocId ? 'Change' : 'Assign'}
                    </button>
                    <button
                      onClick={() => { setLocPickerOpen(false); setEditingLocId(null); cascade.reset() }}
                      className="px-3 bg-gray-200 text-gray-700 text-xs font-medium py-2 rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {locMsg && (
                <p className="text-[10px] text-indigo-600 text-center">{locMsg}</p>
              )}
            </div>

            <button
              onClick={() => setSelected(null)}
              className="w-full text-xs text-emerald-600 font-medium py-2"
            >
              Back to results
            </button>
          </div>
        )}

        {/* Results list (when no detail selected) */}
        {!selected && !loading && results.length > 0 && (
          <div className="divide-y divide-gray-50">
            {results.map((r, idx) => (
              <button
                key={`${r.itemCode}-${idx}`}
                onClick={() => setSelected(r)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3"
              >
                <ProductImage
                  itemCode={r.itemCode}
                  description={r.description}
                  department={r.department}
                  barcode={r.barcode}
                  size={40}
                  className="rounded-lg"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{r.description}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{r.department} · QOH {r.onHand}</p>
                </div>
                <p className="text-sm font-bold text-emerald-600 shrink-0">${r.sellPrice.toFixed(2)}</p>
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !searched && (
          <div className="text-center py-12">
            <ScanBarcode size={40} className="mx-auto text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">Scan a barcode or search to look up a product</p>
          </div>
        )}
      </div>

      <BarcodeScanner open={scannerOpen} onScan={handleScan} onClose={() => setScannerOpen(false)} />
    </div>
  )
}
