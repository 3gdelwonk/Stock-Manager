import { useState, useEffect, useCallback } from 'react'
import {
  X, Plus, ChevronRight, ChevronDown, MapPin, Trash2, Pencil, Check, Loader2,
  Building2, LayoutGrid, Columns3, Rows3, Package, Search, AlertCircle,
} from 'lucide-react'
import {
  getLocationTypes, getLocations, createLocation, updateLocation, deleteLocation,
  getLocationItems, assignItemToLocation, removeItemFromLocation,
  bulkAssignItems, assignDepartmentToLocation, moveItemToLocation, bulkMoveItems,
  searchItems,
  type LocationType, type StoreLocation, type LocationItem,
} from '../lib/jarvis'

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

const TYPE_ICONS: Record<number, typeof Building2> = {
  4: Building2,  // Zone
  1: Columns3,   // Aisle
  2: LayoutGrid, // Bay
  3: Rows3,      // Row
}

const TYPE_COLORS: Record<number, { text: string; bg: string; border: string }> = {
  4: { text: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200' },
  1: { text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  2: { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  3: { text: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200' },
}

const DEFAULT_COLORS = { text: 'text-gray-700', bg: 'bg-gray-50', border: 'border-gray-200' }

// Build a tree from flat list
function buildTree(locations: StoreLocation[]): StoreLocation[] {
  const map = new Map<number, StoreLocation>()
  const roots: StoreLocation[] = []
  for (const loc of locations) {
    map.set(loc.id, { ...loc, children: [] })
  }
  for (const loc of locations) {
    const node = map.get(loc.id)!
    if (loc.parentId && map.has(loc.parentId)) {
      map.get(loc.parentId)!.children!.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

export default function StoreLocationManager({ open, onClose }: Props) {
  const [types, setTypes] = useState<LocationType[]>([])
  const [locations, setLocations] = useState<StoreLocation[]>([])
  const [tree, setTree] = useState<StoreLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Expanded nodes
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  // Selected node for detail panel
  const [selected, setSelected] = useState<StoreLocation | null>(null)
  const [selectedItems, setSelectedItems] = useState<LocationItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)

  // Create / edit form
  const [showCreate, setShowCreate] = useState(false)
  const [createParentId, setCreateParentId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formName, setFormName] = useState('')
  const [formShortCode, setFormShortCode] = useState('')
  const [formTypeId, setFormTypeId] = useState<number>(4)
  const [saving, setSaving] = useState(false)

  // Assign items
  const [assignMode, setAssignMode] = useState<'item' | 'bulk' | 'dept' | 'move' | null>(null)
  const [assignQuery, setAssignQuery] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [assignResult, setAssignResult] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [t, l] = await Promise.all([getLocationTypes(), getLocations()])
      setTypes(t)
      setLocations(l)
      setTree(buildTree(l))
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

  function toggleExpand(id: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSelect(loc: StoreLocation) {
    setSelected(loc)
    setAssignMode(null)
    setItemsLoading(true)
    try {
      const items = await getLocationItems(loc.id)
      setSelectedItems(items)
    } catch {
      setSelectedItems([])
    }
    setItemsLoading(false)
  }

  // ── Create / Edit ──────────────────────────────────────────────────────
  function openCreate(parentId: number | null) {
    setShowCreate(true)
    setEditingId(null)
    setCreateParentId(parentId)
    setFormName('')
    setFormShortCode('')
    // Suggest type based on parent depth
    if (parentId) {
      const parent = locations.find(l => l.id === parentId)
      if (parent) {
        // Zone → Aisle, Aisle → Bay, Bay → Row
        const childType: Record<number, number> = { 4: 1, 1: 2, 2: 3 }
        setFormTypeId(childType[parent.typeId] || 3)
      }
    } else {
      setFormTypeId(4) // Zone by default for root
    }
  }

  function openEdit(loc: StoreLocation) {
    setShowCreate(true)
    setEditingId(loc.id)
    setCreateParentId(loc.parentId ?? null)
    setFormName(loc.name)
    setFormShortCode(loc.shortCode)
    setFormTypeId(loc.typeId)
  }

  async function handleSaveLocation() {
    if (!formName.trim() || !formShortCode.trim()) return
    setSaving(true)
    try {
      if (editingId) {
        await updateLocation(editingId, { name: formName.trim(), shortCode: formShortCode.trim(), typeId: formTypeId })
      } else {
        await createLocation({
          name: formName.trim(),
          shortCode: formShortCode.trim(),
          typeId: formTypeId,
          parentId: createParentId,
        })
      }
      setShowCreate(false)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    }
    setSaving(false)
  }

  async function handleDelete(id: number) {
    try {
      await deleteLocation(id)
      if (selected?.id === id) { setSelected(null); setSelectedItems([]) }
      await refresh()
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

  // ── Tree node renderer ─────────────────────────────────────────────────
  function renderNode(node: StoreLocation, depth: number) {
    const isExpanded = expanded.has(node.id)
    const hasChildren = node.children && node.children.length > 0
    const isSelected = selected?.id === node.id
    const colors = TYPE_COLORS[node.typeId] || DEFAULT_COLORS
    const Icon = TYPE_ICONS[node.typeId] || MapPin

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
            isSelected ? `${colors.bg} ${colors.border} border` : 'hover:bg-gray-50'
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {/* Expand toggle */}
          <button
            onClick={() => hasChildren && toggleExpand(node.id)}
            className={`w-5 h-5 flex items-center justify-center shrink-0 ${hasChildren ? 'text-gray-400' : 'text-transparent'}`}
          >
            {hasChildren && (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
          </button>

          {/* Node content */}
          <button
            onClick={() => handleSelect(node)}
            className="flex-1 flex items-center gap-2 min-w-0 text-left"
          >
            <Icon size={14} className={colors.text} />
            <span className={`text-sm font-medium truncate ${colors.text}`}>{node.name}</span>
            <span className="text-[10px] text-gray-400 font-mono shrink-0">{node.shortCode}</span>
          </button>

          {/* Actions */}
          <button
            onClick={() => openCreate(node.id)}
            className="p-1 text-gray-300 hover:text-emerald-600 shrink-0"
            title="Add child"
          >
            <Plus size={12} />
          </button>
        </div>

        {/* Children */}
        {isExpanded && hasChildren && node.children!.map(child => renderNode(child, depth + 1))}
      </div>
    )
  }

  if (!open) return null

  const typeMap = new Map(types.map(t => [t.id, t.name]))

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
              {/* ── Location Tree ── */}
              <div className="px-3 py-3 space-y-0.5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Hierarchy</p>
                  <button
                    onClick={() => openCreate(null)}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100"
                  >
                    <Plus size={12} /> Add Zone
                  </button>
                </div>

                {tree.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-6">No locations yet. Create a Zone to get started.</p>
                )}

                {tree.map(node => renderNode(node, 0))}
              </div>

              {/* ── Create / Edit Form ── */}
              {showCreate && (
                <div className="mx-3 mb-3 p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-700">
                      {editingId ? 'Edit Location' : 'New Location'}
                      {createParentId && !editingId && (
                        <span className="text-gray-400 font-normal"> in {locations.find(l => l.id === createParentId)?.name}</span>
                      )}
                    </p>
                    <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-500">Name</label>
                      <input
                        value={formName}
                        onChange={e => setFormName(e.target.value)}
                        placeholder="e.g. Grocery"
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-1 focus:ring-indigo-400 outline-none"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500">Short Code</label>
                      <input
                        value={formShortCode}
                        onChange={e => setFormShortCode(e.target.value)}
                        placeholder="e.g. GRO"
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-mono focus:ring-1 focus:ring-indigo-400 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-500">Type</label>
                    <div className="flex gap-1.5 mt-1">
                      {types.map(t => {
                        const c = TYPE_COLORS[t.id] || DEFAULT_COLORS
                        return (
                          <button
                            key={t.id}
                            onClick={() => setFormTypeId(t.id)}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                              formTypeId === t.id
                                ? `${c.bg} ${c.text} ${c.border}`
                                : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                            }`}
                          >
                            {t.name}
                          </button>
                        )
                      })}
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

              {/* ── Selected Location Detail ── */}
              {selected && (
                <div className="border-t border-gray-200 px-4 py-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{selected.name}</p>
                      <p className="text-xs text-gray-500">
                        {typeMap.get(selected.typeId) || 'Location'} &middot; <span className="font-mono">{selected.shortCode}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(selected)} className="p-1.5 text-gray-400 hover:text-indigo-600 rounded">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDelete(selected.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
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
