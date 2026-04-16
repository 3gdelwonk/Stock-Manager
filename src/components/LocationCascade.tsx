import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Loader2, Settings2 } from 'lucide-react'
import type { FlatLocation, LevelOption } from '../lib/locationUtils'
import { TYPE_IDS, groupByPrefix } from '../lib/locationUtils'

// ── Level column chip component ─────────────────────────────────────────────

function LevelChip({
  option,
  selected,
  onSelect,
  busy,
}: {
  option: LevelOption
  selected: boolean
  onSelect: (id: number | '') => void
  busy: boolean
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null)
  const chipRef = useRef<HTMLButtonElement>(null)

  const showTooltip = useCallback(() => {
    if (!chipRef.current) return
    const rect = chipRef.current.getBoundingClientRect()
    const x = Math.max(8, Math.min(rect.left + rect.width / 2, window.innerWidth - 8))
    const y = rect.top - 6
    setTooltip({ x, y })
  }, [])

  const hideTooltip = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    setTooltip(null)
  }, [])

  const handlePointerDown = useCallback(() => {
    timerRef.current = setTimeout(showTooltip, 450)
  }, [showTooltip])

  const handlePointerUp = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }, [])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    showTooltip()
  }, [showTooltip])

  // Dismiss tooltip on scroll/resize
  useEffect(() => {
    if (!tooltip) return
    const dismiss = () => setTooltip(null)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [tooltip])

  return (
    <>
      <button
        ref={chipRef}
        disabled={busy}
        onClick={() => onSelect(selected ? '' : option.id)}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onContextMenu={handleContextMenu}
        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
          selected
            ? 'bg-emerald-600 text-white shadow-sm'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-95'
        } ${busy ? 'opacity-50' : ''}`}
      >
        {option.shortCode}
      </button>

      {/* Long-press tooltip */}
      {tooltip && (
        <div
          className="fixed z-[100] pointer-events-none"
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
            transform: 'translate(-50%, -100%)',
          }}
          onClick={hideTooltip}
        >
          <div className="bg-gray-900 text-white text-[11px] px-3 py-2 rounded-lg shadow-xl max-w-[220px]">
            <p className="font-semibold">{option.name}</p>
            {option.path && option.path !== option.name && (
              <p className="text-gray-400 text-[10px] mt-0.5">{option.path}</p>
            )}
          </div>
          <div className="w-2 h-2 bg-gray-900 rotate-45 mx-auto -mt-1" />
        </div>
      )}
    </>
  )
}

// ── Single level column ─────────────────────────────────────────────────────

function LocationLevelColumn({
  label,
  options,
  selectedId,
  onSelectId,
  busy,
  groupByPfx,
}: {
  label: string
  options: LevelOption[]
  selectedId: number | ''
  onSelectId: (id: number | '') => void
  busy: boolean
  groupByPfx?: boolean
}) {
  if (options.length === 0) return null

  if (groupByPfx) {
    const groups = groupByPrefix(options)
    return (
      <div className="space-y-1">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
        {Array.from(groups.entries()).map(([prefix, items], gi) => (
          <div key={prefix}>
            {gi > 0 && <div className="border-t border-gray-100 my-1" />}
            <p className="text-[9px] font-bold text-gray-400 uppercase mb-0.5">{prefix}</p>
            <div className="flex flex-wrap gap-1.5">
              {items.map(opt => (
                <LevelChip key={opt.id} option={opt} selected={selectedId === opt.id} onSelect={onSelectId} busy={busy} />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => (
          <LevelChip key={opt.id} option={opt} selected={selectedId === opt.id} onSelect={onSelectId} busy={busy} />
        ))}
      </div>
    </div>
  )
}

// ── Main cascade picker ─────────────────────────────────────────────────────

interface LocationCascadeProps {
  flatLocations: FlatLocation[]
  busy: boolean
  zoneId: number | ''
  aisleId: number | ''
  bayId: number | ''
  rowId: number | ''
  onZoneChange: (id: number | '') => void
  onAisleChange: (id: number | '') => void
  onBayChange: (id: number | '') => void
  onRowChange: (id: number | '') => void
  onManage?: () => void
}

function toOption(f: FlatLocation): LevelOption {
  return { id: f.id, name: f.name, shortCode: f.shortCode, path: f.path }
}

export default function LocationCascade({
  flatLocations,
  busy,
  zoneId,
  aisleId,
  bayId,
  rowId,
  onZoneChange,
  onAisleChange,
  onBayChange,
  onRowChange,
  onManage,
}: LocationCascadeProps) {
  const zones = useMemo(
    () => flatLocations.filter(l => l.typeId === TYPE_IDS.ZONE).sort((a, b) => a.id - b.id).map(toOption),
    [flatLocations],
  )

  const aisles = useMemo(() => {
    if (zoneId === '') return []
    return flatLocations.filter(l => l.typeId === TYPE_IDS.AISLE && l.parentId === zoneId).sort((a, b) => a.id - b.id).map(toOption)
  }, [flatLocations, zoneId])

  const bays = useMemo(() => {
    if (aisleId === '') return []
    return flatLocations.filter(l => l.typeId === TYPE_IDS.BAY && l.parentId === aisleId).sort((a, b) => a.id - b.id).map(toOption)
  }, [flatLocations, aisleId])

  const rows = useMemo(() => {
    if (bayId === '') return []
    return flatLocations.filter(l => l.typeId === TYPE_IDS.ROW && l.parentId === bayId).sort((a, b) => a.id - b.id).map(toOption)
  }, [flatLocations, bayId])

  if (flatLocations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-4 gap-2">
        <div className="flex items-center">
          <Loader2 size={16} className="text-gray-400 animate-spin" />
          <span className="text-xs text-gray-400 ml-2">Loading locations...</span>
        </div>
        {onManage && (
          <button
            onClick={onManage}
            className="flex items-center gap-1 text-[10px] font-medium text-indigo-600 hover:text-indigo-700"
          >
            <Settings2 size={10} /> Manage Locations
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      {onManage && (
        <div className="flex justify-end">
          <button
            onClick={onManage}
            className="flex items-center gap-1 text-[10px] font-medium text-indigo-600 hover:text-indigo-700 px-1.5 py-0.5 rounded hover:bg-indigo-50"
          >
            <Settings2 size={10} /> Manage
          </button>
        </div>
      )}
      <LocationLevelColumn label="Zone" options={zones} selectedId={zoneId} onSelectId={onZoneChange} busy={busy} />

      {zoneId !== '' && (
        <LocationLevelColumn label="Aisle" options={aisles} selectedId={aisleId} onSelectId={onAisleChange} busy={busy} />
      )}

      {aisleId !== '' && (
        <LocationLevelColumn label="Bay" options={bays} selectedId={bayId} onSelectId={onBayChange} busy={busy} groupByPfx />
      )}

      {bayId !== '' && (
        <LocationLevelColumn label="Row" options={rows} selectedId={rowId} onSelectId={onRowChange} busy={busy} />
      )}
    </div>
  )
}

// ── Hook: cascade state with clearing logic ─────────────────────────────────

export function useCascadeState(initialState?: { zoneId?: number | ''; aisleId?: number | ''; bayId?: number | ''; rowId?: number | '' }) {
  const [zoneId, _setZoneId] = useState<number | ''>(initialState?.zoneId ?? '')
  const [aisleId, _setAisleId] = useState<number | ''>(initialState?.aisleId ?? '')
  const [bayId, _setBayId] = useState<number | ''>(initialState?.bayId ?? '')
  const [rowId, _setRowId] = useState<number | ''>(initialState?.rowId ?? '')

  const setRowId = useCallback((id: number | '') => { _setRowId(id) }, [])
  const setBayId = useCallback((id: number | '') => { _setBayId(id); _setRowId('') }, [])
  const setAisleId = useCallback((id: number | '') => { _setAisleId(id); _setBayId(''); _setRowId('') }, [])
  const setZoneId = useCallback((id: number | '') => { _setZoneId(id); _setAisleId(''); _setBayId(''); _setRowId('') }, [])

  const reset = useCallback(() => { _setZoneId(''); _setAisleId(''); _setBayId(''); _setRowId('') }, [])

  const resolveTarget = useCallback((): number | null => {
    if (rowId !== '') return rowId
    if (bayId !== '') return bayId
    if (aisleId !== '') return aisleId
    if (zoneId !== '') return zoneId
    return null
  }, [zoneId, aisleId, bayId, rowId])

  const hasInput = zoneId !== ''

  return {
    zoneId, aisleId, bayId, rowId,
    setZoneId, setAisleId, setBayId, setRowId,
    reset, resolveTarget, hasInput,
  }
}

// ── Hook: pre-fill cascade from an existing location ────────────────────────

export function useCascadePrefill(
  flatLocations: FlatLocation[],
  locationId: number | null,
  cascade: ReturnType<typeof useCascadeState>,
) {
  const prefilled = useRef(false)
  useEffect(() => {
    if (prefilled.current || !locationId || flatLocations.length === 0) return
    prefilled.current = true

    // Walk ancestors to fill each level
    let current = flatLocations.find(f => f.id === locationId)
    const hierarchy: Partial<Record<number, number>> = {}
    while (current) {
      hierarchy[current.typeId] = current.id
      current = current.parentId != null ? flatLocations.find(f => f.id === current!.parentId) : undefined
    }

    if (hierarchy[TYPE_IDS.ZONE]) cascade.setZoneId(hierarchy[TYPE_IDS.ZONE]!)
    // Need to set these without cascade clearing — use a timeout to sequence
    setTimeout(() => {
      if (hierarchy[TYPE_IDS.AISLE]) {
        cascade.setAisleId(hierarchy[TYPE_IDS.AISLE]!)
        setTimeout(() => {
          if (hierarchy[TYPE_IDS.BAY]) {
            cascade.setBayId(hierarchy[TYPE_IDS.BAY]!)
            setTimeout(() => {
              if (hierarchy[TYPE_IDS.ROW]) cascade.setRowId(hierarchy[TYPE_IDS.ROW]!)
            }, 0)
          }
        }, 0)
      }
    }, 0)
  }, [flatLocations, locationId, cascade])
}
