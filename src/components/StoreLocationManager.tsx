import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  X, Plus, MapPin, Trash2, Pencil, Check, Loader2, ChevronRight,
  Package, Search, AlertCircle,
} from 'lucide-react'
import {
  getLocationTypes, getLocations, createLocation, updateLocation, deleteLocation,
  getLocationItems, assignItemToLocation, removeItemFromLocation,
  bulkAssignItems, assignDepartmentToLocation, moveItemToLocation, bulkMoveItems,
  searchItems,
  type LocationType, type StoreLocation, type LocationItem,
} from '../lib/jarvis'
import { TYPE_IDS, TYPE_LABELS, groupByPrefix } from '../lib/locationUtils'
import { useCascadeState } from './LocationCascade'

// Resolve any user-entered code (barcode or itemCode) to a confirmed itemCode
// using the same JARVISmart search endpoint as the product search bar.
// Resolution priority:
//   1. Exact itemCode match — user typed a known itemCode directly
//   2. Exact barcode match (leading-zero tolerant) — full barcode scan/entry
//   3. Single result returned — server matched unambiguously; trust it even if
//      the barcode field is null in the response (server matched in SQL)
//   4. Multiple ambiguous results with no exact match — pass through unchanged
//   5. No results / search error — pass through unchanged, let server handle
async function resolveToItemCode(code: string): Promise<string> {
  const trimmed = code.trim()
  if (!trimmed) return trimmed
  try {
    const result = await searchItems(trimmed, 5)
    if (result.items.length === 0) return trimmed

    const norm = (s: string) => s.replace(/^0+/, '')

    // 1. Exact itemCode match
    const byItemCode = result.items.find(i => i.itemCode === trimmed)
    if (byItemCode) return byItemCode.itemCode

    // 2. Exact barcode match (with leading-zero normalisation)
    const byBarcode = result.items.find(
      i => i.barcode === trimmed || (i.barcode && norm(i.barcode) === norm(trimmed))
    )
    if (byBarcode) return byBarcode.itemCode

    // 3. Single unambiguous result — JARVISmart already matched it server-side
    if (result.items.length === 1) return result.items[0].itemCode

    // 4. Multiple results, no exact match — pass through unchanged
    return trimmed
  } catch {
    // Search failed — pass through, let the server accept or reject
    return trimmed
  }
}

// Resolve all codes and deduplicate — prevents the same itemCode appearing
// twice when different barcodes map to the same product.
async function resolveCodes(codes: string[]): Promise<string[]> {
  const resolved = await Promise.all(codes.map(resolveToItemCode))
  return [...new Set(resolved)]
}

interface Props {
  open: boolean
  onClose: () => void
}

// Colour scheme per level — indigo (Zone) → emerald (Aisle) → amber (Bay) → rose (Row)
const LEVEL_COLORS: Record<number, { chipBg: string; chipText: string; chipBorder: string; chipSelected: string; accent: string; pillBg: string }> = {
  [TYPE_IDS.ZONE]:  { chipBg: 'bg-indigo-50',  chipText: 'text-indigo-700',  chipBorder: 'border-indigo-100',  chipSelected: 'bg-indigo-600 text-white border-indigo-600 shadow-sm',  accent: 'text-indigo-600',  pillBg: 'bg-indigo-50' },
  [TYPE_IDS.AISLE]: { chipBg: 'bg-emerald-50', chipText: 'text-emerald-700', chipBorder: 'border-emerald-100', chipSelected: 'bg-emerald-600 text-white border-emerald-600 shadow-sm', accent: 'text-emerald-600', pillBg: 'bg-emerald-50' },
  [TYPE_IDS.BAY]:   { chipBg: 'bg-amber-50',   chipText: 'text-amber-700',   chipBorder: 'border-amber-100',   chipSelected: 'bg-amber-600 text-white border-amber-600 shadow-sm',   accent: 'text-amber-600',   pillBg: 'bg-amber-50' },
  [TYPE_IDS.ROW]:   { chipBg: 'bg-rose-50',    chipText: 'text-rose-700',    chipBorder: 'border-rose-100',    chipSelected: 'bg-rose-600 text-white border-rose-600 shadow-sm',    accent: 'text-rose-600',    pillBg: 'bg-rose-50' },
}

const DEFAULT_COLORS = { chipBg: 'bg-gray-50', chipText: 'text-gray-700', chipBorder: 'border-gray-200', chipSelected: 'bg-gray-600 text-white border-gray-600', accent: 'text-gray-600', pillBg: 'bg-gray-50' }

function parentTypeId(typeId: number): number | null {
  if (typeId === TYPE_IDS.AISLE) return TYPE_IDS.ZONE
  if (typeId === TYPE_IDS.BAY) return TYPE_IDS.AISLE
  if (typeId === TYPE_IDS.ROW) return TYPE_IDS.BAY
  return null
}

export default function StoreLocationManager({ open, onClose }: Props) {
  const [types, setTypes] = useState<LocationType[]>([])
  const [locations, setLocations] = useState<StoreLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Cascade state (reused from LocationCascade)
  const cascade = useCascadeState()

  // Create / edit form state
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [createTypeId, setCreateTypeId] = useState<number | null>(null)
  const [createParentId, setCreateParentId] = useState<number | null>(null)
  const [formName, setFormName] = useState('')
  const [formShortCode, setFormShortCode] = useState('')
  const [saving, setSaving] = useState(false)

  // Items panel state
  const [selectedItems, setSelectedItems] = useState<LocationItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [assignMode, setAssignMode] = useState<'item' | 'bulk' | 'dept' | 'move' | null>(null)
  const [assignQuery, setAssignQuery] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [assignResult, setAssignResult] = useState<string | null>(null)

  // Flatten tree to flat list (works whether getLocations returns nested or flat)
  const flatList = useMemo<StoreLocation[]>(() => {
    const out: StoreLocation[] = []
    const walk = (items: StoreLocation[]) => {
      for (const l of items) {
        out.push(l)
        if (l.children?.length) walk(l.children)
      }
    }
    walk(locations)
    return out
  }, [locations])

  // Level collections, filtered by the picked parent
  const zones = useMemo(
    () => flatList.filter(l => l.typeId === TYPE_IDS.ZONE && l.active !== false).sort((a, b) => a.id - b.id),
    [flatList],
  )
  const aisles = useMemo(
    () => cascade.zoneId === ''
      ? []
      : flatList.filter(l => l.typeId === TYPE_IDS.AISLE && l.parentId === cascade.zoneId && l.active !== false).sort((a, b) => a.id - b.id),
    [flatList, cascade.zoneId],
  )
  const bays = useMemo(
    () => cascade.aisleId === ''
      ? []
      : flatList.filter(l => l.typeId === TYPE_IDS.BAY && l.parentId === cascade.aisleId && l.active !== false).sort((a, b) => a.id - b.id),
    [flatList, cascade.aisleId],
  )
  const rowItems = useMemo(
    () => cascade.bayId === ''
      ? []
      : flatList.filter(l => l.typeId === TYPE_IDS.ROW && l.parentId === cascade.bayId && l.active !== false).sort((a, b) => a.id - b.id),
    [flatList, cascade.bayId],
  )

  // Currently focused node (deepest picked level)
  const selected = useMemo<StoreLocation | null>(() => {
    const id = cascade.resolveTarget()
    if (id == null) return null
    return flatList.find(l => l.id === id) ?? null
  }, [flatList, cascade])

  // Breadcrumb cells for the strip
  const zoneLoc  = useMemo(() => flatList.find(l => l.id === cascade.zoneId)  ?? null, [flatList, cascade.zoneId])
  const aisleLoc = useMemo(() => flatList.find(l => l.id === cascade.aisleId) ?? null, [flatList, cascade.aisleId])
  const bayLoc   = useMemo(() => flatList.find(l => l.id === cascade.bayId)   ?? null, [flatList, cascade.bayId])
  const rowLoc   = useMemo(() => flatList.find(l => l.id === cascade.rowId)   ?? null, [flatList, cascade.rowId])

  const refresh = useCallback(async () => {
    try {
      const [t, l] = await Promise.all([getLocationTypes(), getLocations()])
      setTypes(t)
      setLocations(l)
    } catch (e) {
      setError((e as Error).message)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (open) {
      setLoading(true)
      setError(null)
      refresh()
    }
  }, [open, refresh])

  // When focused target changes, load its items
  const selectedId = selected?.id ?? null
  useEffect(() => {
    if (selectedId == null) { setSelectedItems([]); setAssignMode(null); return }
    setItemsLoading(true)
    getLocationItems(selectedId)
      .then(setSelectedItems)
      .catch(() => setSelectedItems([]))
      .finally(() => setItemsLoading(false))
  }, [selectedId])

  // ── Cascade helpers ────────────────────────────────────────────────────
  function setIdForType(typeId: number, id: number | '') {
    if (typeId === TYPE_IDS.ZONE) cascade.setZoneId(id)
    else if (typeId === TYPE_IDS.AISLE) cascade.setAisleId(id)
    else if (typeId === TYPE_IDS.BAY) cascade.setBayId(id)
    else if (typeId === TYPE_IDS.ROW) cascade.setRowId(id)
  }
  function getIdForType(typeId: number): number | '' {
    if (typeId === TYPE_IDS.ZONE) return cascade.zoneId
    if (typeId === TYPE_IDS.AISLE) return cascade.aisleId
    if (typeId === TYPE_IDS.BAY) return cascade.bayId
    if (typeId === TYPE_IDS.ROW) return cascade.rowId
    return ''
  }

  // ── Create / Edit ──────────────────────────────────────────────────────
  function openCreate(typeId: number, parentId: number | null) {
    setShowCreate(true)
    setEditingId(null)
    setCreateTypeId(typeId)
    setCreateParentId(parentId)
    setFormName('')
    setFormShortCode('')
  }

  function openEdit(loc: StoreLocation) {
    setShowCreate(true)
    setEditingId(loc.id)
    setCreateTypeId(loc.typeId)
    setCreateParentId(loc.parentId ?? null)
    setFormName(loc.name)
    setFormShortCode(loc.shortCode)
  }

  function closeForm() {
    setShowCreate(false)
    setEditingId(null)
    setCreateTypeId(null)
    setCreateParentId(null)
    setFormName('')
    setFormShortCode('')
  }

  async function handleSaveLocation() {
    const name = formName.trim()
    const shortCode = formShortCode.trim()
    if (!name || !shortCode) return
    if (!editingId && createTypeId == null) return
    setSaving(true)
    try {
      if (editingId) {
        await updateLocation(editingId, { name, shortCode })
        setLocations(prev => prev.map(l => l.id === editingId ? { ...l, name, shortCode } : l))
      } else {
        const newTypeId = createTypeId as number
        const created = await createLocation({
          name,
          shortCode,
          typeId: newTypeId,
          parentId: createParentId,
        })
        // Optimistic local merge — server GET can be stale right after POST
        setLocations(prev => {
          if (prev.some(l => l.id === created.id)) return prev
          return [...prev, { ...created, typeId: newTypeId, parentId: createParentId }]
        })
        // Auto-select the new node so its child row opens
        setIdForType(newTypeId, created.id)
      }
      closeForm()
      // Background reconcile
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
    setSaving(false)
  }

  async function handleDelete(loc: StoreLocation) {
    const childCount = flatList.filter(l => l.parentId === loc.id).length
    const prompt = childCount > 0
      ? `Delete "${loc.name}" and its ${childCount} child location${childCount !== 1 ? 's' : ''}?`
      : `Delete "${loc.name}"?`
    if (!window.confirm(prompt)) return
    try {
      await deleteLocation(loc.id)
      setLocations(prev => prev.filter(l => l.id !== loc.id))
      // Clear this level in cascade — useCascadeState auto-clears descendants
      setIdForType(loc.typeId, '')
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  // ── Assign items ──────────────────────────────────────────────────────
  async function handleAssignItem() {
    if (!selected || !assignQuery.trim()) return
    setAssigning(true)
    setAssignResult(null)
    try {
      const itemCode = await resolveToItemCode(assignQuery.trim())
      await assignItemToLocation(selected.id, itemCode)
      const items = await getLocationItems(selected.id)
      setSelectedItems(items)
      setAssignQuery('')
      setAssignResult('Item assigned')
    } catch (e) {
      setError((e as Error).message)
    }
    setAssigning(false)
  }

  async function handleBulkAssign() {
    if (!selected || !assignQuery.trim()) return
    const raw = assignQuery.split(/[,\s]+/).map(c => c.trim()).filter(Boolean)
    if (raw.length === 0) return
    setAssigning(true)
    setAssignResult(null)
    try {
      const codes = await resolveCodes(raw)
      const res = await bulkAssignItems(selected.id, codes)
      const items = await getLocationItems(selected.id)
      setSelectedItems(items)
      setAssignQuery('')
      const assigned = res.assigned ?? codes.length
      const skipped = codes.length - assigned
      setAssignResult(skipped > 0 ? `${assigned} assigned (${skipped} already there)` : `${assigned} items assigned`)
    } catch (e) {
      setError((e as Error).message)
    }
    setAssigning(false)
  }

  async function handleAssignDept() {
    if (!selected || !assignQuery.trim()) return
    setAssigning(true)
    setAssignResult(null)
    try {
      const res = await assignDepartmentToLocation(selected.id, assignQuery.trim())
      const items = await getLocationItems(selected.id)
      setSelectedItems(items)
      setAssignQuery('')
      const deptAssigned = res.assigned ?? 0
      setAssignResult(deptAssigned === 0 ? `All items already in this location` : `${deptAssigned} items from ${assignQuery.trim()} assigned`)
    } catch (e) {
      setError((e as Error).message)
    }
    setAssigning(false)
  }

  async function handleMoveItems() {
    if (!selected || !assignQuery.trim()) return
    const raw = assignQuery.split(/[,\s]+/).map(c => c.trim()).filter(Boolean)
    if (raw.length === 0) return
    setAssigning(true)
    setAssignResult(null)
    try {
      const codes = await resolveCodes(raw)
      if (codes.length === 1) {
        await moveItemToLocation(selected.id, codes[0])
      } else {
        await bulkMoveItems(selected.id, codes)
      }
      const items = await getLocationItems(selected.id)
      setSelectedItems(items)
      setAssignQuery('')
      setAssignResult(`${codes.length} item${codes.length !== 1 ? 's' : ''} moved here`)
    } catch (e) {
      setError((e as Error).message)
    }
    setAssigning(false)
  }

  async function handleRemoveItem(itemCode: string) {
    if (!selected) return
    try {
      await removeItemFromLocation(selected.id, itemCode)
      setSelectedItems(prev => prev.filter(i => i.itemCode !== itemCode))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (!open) return null

  const typeMap = new Map(types.map(t => [t.id, t.name]))

  // ── Chip renderer (shared across levels) ────────────────────────────────
  function renderChip(loc: StoreLocation) {
    const typeId = loc.typeId
    const colors = LEVEL_COLORS[typeId] || DEFAULT_COLORS
    const isSelected = getIdForType(typeId) === loc.id
    return (
      <button
        key={loc.id}
        onClick={() => setIdForType(typeId, isSelected ? '' : loc.id)}
        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all whitespace-nowrap ${
          isSelected
            ? colors.chipSelected
            : `${colors.chipBg} ${colors.chipText} ${colors.chipBorder} hover:brightness-95 active:scale-95`
        }`}
      >
        <span className="font-mono">{loc.shortCode}</span>
        <span className={`font-normal ${isSelected ? 'text-white/80' : 'text-gray-500'}`}>{loc.name}</span>
      </button>
    )
  }

  // ── Level row renderer ──────────────────────────────────────────────────
  function renderLevel(
    typeId: number,
    items: StoreLocation[],
    parentName: string | null,
    parentId: number | null,
    grouped = false,
  ) {
    const label = TYPE_LABELS[typeId]
    const parentLabelId = parentTypeId(typeId)
    const parentLabel = parentLabelId != null ? TYPE_LABELS[parentLabelId].toLowerCase() : null
    const colors = LEVEL_COLORS[typeId] || DEFAULT_COLORS

    return (
      <div key={`level-${typeId}`} className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            <span className={colors.accent}>{label}</span>
            {parentName && <span className="text-gray-400 normal-case font-medium"> · in {parentName}</span>}
          </p>
          <button
            onClick={() => openCreate(typeId, parentId)}
            className={`flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-semibold ${colors.accent} hover:bg-gray-50 rounded`}
          >
            <Plus size={11} /> New {label}{parentName ? ` in ${parentName}` : ''}
          </button>
        </div>

        {items.length === 0 ? (
          <p className="text-[11px] text-gray-400 italic pl-0.5">
            {parentLabel
              ? `No ${label.toLowerCase()}s in this ${parentLabel} yet.`
              : `No ${label.toLowerCase()}s yet.`}
          </p>
        ) : grouped ? (
          <div className="space-y-1.5">
            {Array.from(groupByPrefix(items).entries()).map(([prefix, list], gi) => (
              <div key={prefix}>
                {gi > 0 && <div className="border-t border-gray-100 my-1" />}
                <p className="text-[9px] font-bold text-gray-400 uppercase mb-0.5">{prefix}</p>
                <div className="flex flex-wrap gap-1.5">{list.map(renderChip)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">{items.map(renderChip)}</div>
        )}

        {/* Inline create / edit form, anchored to this level */}
        {showCreate && createTypeId === typeId && (
          <div className={`mt-2 p-3 rounded-xl border border-gray-200 ${colors.pillBg} space-y-2.5`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${colors.chipSelected}`}>
                  {label}
                </span>
                <p className="text-xs font-semibold text-gray-700 truncate">
                  {editingId ? 'Edit' : 'New'} {label}
                  {!editingId && parentName && (
                    <span className="text-gray-400 font-normal"> in {parentName}</span>
                  )}
                </p>
              </div>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-600 shrink-0">
                <X size={14} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-500">Name</label>
                <input
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder={`e.g. ${label === 'Zone' ? 'Grocery' : label === 'Aisle' ? 'Aisle 3' : label === 'Bay' ? 'Bay B2' : 'Row 1'}`}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-1 focus:ring-indigo-400 outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500">Short Code</label>
                <input
                  value={formShortCode}
                  onChange={e => setFormShortCode(e.target.value)}
                  placeholder={`e.g. ${label === 'Zone' ? 'GRO' : label === 'Aisle' ? 'A3' : label === 'Bay' ? 'B2' : 'R1'}`}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-mono focus:ring-1 focus:ring-indigo-400 outline-none"
                />
              </div>
            </div>

            <button
              onClick={handleSaveLocation}
              disabled={saving || !formName.trim() || !formShortCode.trim()}
              className="w-full py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 hover:bg-indigo-700"
            >
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Breadcrumb segment renderer ─────────────────────────────────────────
  function renderCrumb(typeId: number, loc: StoreLocation | null, onClick: () => void) {
    const colors = LEVEL_COLORS[typeId] || DEFAULT_COLORS
    if (!loc) {
      return <span className="text-[11px] text-gray-300 font-medium">{TYPE_LABELS[typeId]}</span>
    }
    return (
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold ${colors.accent} hover:bg-gray-50`}
      >
        <span className="font-mono">{loc.shortCode}</span>
        <span className="text-gray-500 font-normal">{loc.name}</span>
      </button>
    )
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col">
        {/* Handle + header */}
        <div className="flex justify-center pt-3 pb-1 shrink-0"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
        <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-indigo-600" />
            <h2 className="text-base font-semibold text-gray-900">Store Locations</h2>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {error && (
          <div className="flex items-center gap-2 mx-4 mt-3 px-3 py-2 bg-red-50 rounded-lg">
            <AlertCircle size={14} className="text-red-500 shrink-0" />
            <p className="text-xs text-red-600 flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X size={12} /></button>
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="text-indigo-600 animate-spin" />
            </div>
          ) : (
            <div className="flex flex-col">
              {/* ── Breadcrumb strip ── */}
              {(zoneLoc || aisleLoc || bayLoc || rowLoc) && (
                <div className="flex items-center gap-1 flex-wrap px-4 pt-3 pb-2 border-b border-gray-100">
                  {renderCrumb(TYPE_IDS.ZONE, zoneLoc, () => cascade.setZoneId(cascade.zoneId))}
                  <ChevronRight size={11} className="text-gray-300" />
                  {renderCrumb(TYPE_IDS.AISLE, aisleLoc, () => cascade.setAisleId(cascade.aisleId))}
                  <ChevronRight size={11} className="text-gray-300" />
                  {renderCrumb(TYPE_IDS.BAY, bayLoc, () => cascade.setBayId(cascade.bayId))}
                  <ChevronRight size={11} className="text-gray-300" />
                  {renderCrumb(TYPE_IDS.ROW, rowLoc, () => { /* deepest — nothing to narrow */ })}
                  <button
                    onClick={cascade.reset}
                    className="ml-auto text-[10px] font-medium text-gray-400 hover:text-gray-600"
                  >
                    Clear
                  </button>
                </div>
              )}

              {/* ── Cascade levels ── */}
              <div className="px-4 py-3 space-y-3">
                {renderLevel(TYPE_IDS.ZONE, zones, null, null, false)}

                {cascade.zoneId !== '' && renderLevel(
                  TYPE_IDS.AISLE, aisles, zoneLoc?.name ?? null, cascade.zoneId, false,
                )}

                {cascade.aisleId !== '' && renderLevel(
                  TYPE_IDS.BAY, bays, aisleLoc?.name ?? null, cascade.aisleId, true,
                )}

                {cascade.bayId !== '' && renderLevel(
                  TYPE_IDS.ROW, rowItems, bayLoc?.name ?? null, cascade.bayId, false,
                )}
              </div>

              {/* ── Focused node card + items panel ── */}
              {selected && (
                <div className="border-t border-gray-200 px-4 py-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{selected.name}</p>
                      <p className="text-xs text-gray-500">
                        {typeMap.get(selected.typeId) || TYPE_LABELS[selected.typeId] || 'Location'} &middot;{' '}
                        <span className="font-mono">{selected.shortCode}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(selected)}
                        className="p-1.5 text-gray-400 hover:text-indigo-600 rounded"
                        title="Rename"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(selected)}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Items in location */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1">
                        <Package size={10} /> Items ({selectedItems.length})
                      </p>
                      <div className="flex gap-1 flex-wrap">
                        {([
                          { mode: 'item' as const, label: '+ Item', active: 'bg-indigo-100 text-indigo-700' },
                          { mode: 'bulk' as const, label: '+ Bulk', active: 'bg-blue-100 text-blue-700' },
                          { mode: 'dept' as const, label: '+ Dept', active: 'bg-amber-100 text-amber-700' },
                          { mode: 'move' as const, label: 'Move', active: 'bg-emerald-100 text-emerald-700' },
                        ]).map(({ mode, label, active }) => (
                          <button
                            key={mode}
                            onClick={() => { setAssignMode(assignMode === mode ? null : mode); setAssignQuery(''); setAssignResult(null) }}
                            className={`px-2 py-0.5 text-[10px] font-medium rounded ${assignMode === mode ? active : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Assign form */}
                    {assignMode && (
                      <div className="mb-2 space-y-1.5">
                        <div className="flex gap-2">
                          <div className="flex-1 flex items-center gap-1.5 bg-gray-100 rounded-lg px-2.5 py-1.5">
                            <Search size={12} className="text-gray-400 shrink-0" />
                            <input
                              value={assignQuery}
                              onChange={e => setAssignQuery(e.target.value)}
                              onKeyDown={e => {
                                if (e.key !== 'Enter') return
                                if (assignMode === 'item') handleAssignItem()
                                else if (assignMode === 'bulk') handleBulkAssign()
                                else if (assignMode === 'dept') handleAssignDept()
                                else if (assignMode === 'move') handleMoveItems()
                              }}
                              placeholder={
                                assignMode === 'item' ? 'Item code...' :
                                assignMode === 'bulk' ? 'Item codes (comma or space separated)...' :
                                assignMode === 'dept' ? 'Department name (e.g. GROCERY)...' :
                                'Item codes to move here...'
                              }
                              className="flex-1 bg-transparent text-xs outline-none"
                              autoFocus
                            />
                          </div>
                          <button
                            onClick={
                              assignMode === 'item' ? handleAssignItem :
                              assignMode === 'bulk' ? handleBulkAssign :
                              assignMode === 'dept' ? handleAssignDept :
                              handleMoveItems
                            }
                            disabled={assigning || !assignQuery.trim()}
                            className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg disabled:opacity-50"
                          >
                            {assigning ? '...' :
                              assignMode === 'item' ? 'Assign' :
                              assignMode === 'bulk' ? 'Assign All' :
                              assignMode === 'dept' ? 'Assign Dept' :
                              'Move'}
                          </button>
                        </div>
                        {assignResult && (
                          <p className="text-[10px] text-emerald-600 flex items-center gap-1"><Check size={10} /> {assignResult}</p>
                        )}
                        <p className="text-[9px] text-gray-400">
                          {assignMode === 'item' && 'Assign a single item by its item code'}
                          {assignMode === 'bulk' && 'Paste or type multiple item codes separated by commas or spaces'}
                          {assignMode === 'dept' && 'Assign all items from a department to this location'}
                          {assignMode === 'move' && 'Move items from their current location to this one'}
                        </p>
                      </div>
                    )}

                    {itemsLoading ? (
                      <div className="flex justify-center py-4"><Loader2 size={16} className="text-gray-400 animate-spin" /></div>
                    ) : selectedItems.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-3">No items assigned</p>
                    ) : (
                      <div className="space-y-0.5 max-h-48 overflow-auto">
                        {selectedItems.map(item => (
                          <div key={item.itemCode + '|' + (item.barcode ?? '')} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-gray-50 group">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-gray-800 truncate">{item.description || item.itemCode}</p>
                              <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                <span className="font-mono">{item.itemCode}</span>
                                {item.department && <span>{item.department}</span>}
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveItem(item.itemCode)}
                              className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
