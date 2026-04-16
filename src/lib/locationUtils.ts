import type { StoreLocation, ItemLocation } from './jarvis'

// ── Type ID constants (not sequential by depth) ─────────────────────────────
export const TYPE_IDS = { ZONE: 4, AISLE: 1, BAY: 2, ROW: 3 } as const
export const LEVEL_ORDER = [TYPE_IDS.ZONE, TYPE_IDS.AISLE, TYPE_IDS.BAY, TYPE_IDS.ROW] as const

export const TYPE_LABELS: Record<number, string> = {
  [TYPE_IDS.ZONE]: 'Zone',
  [TYPE_IDS.AISLE]: 'Aisle',
  [TYPE_IDS.BAY]: 'Bay',
  [TYPE_IDS.ROW]: 'Row',
}

export function getTypeLabel(typeId: number, typeName?: string): string {
  return typeName || TYPE_LABELS[typeId] || 'Location'
}

// ── Flat location with breadcrumb path ──────────────────────────────────────

export interface FlatLocation {
  id: number
  name: string
  shortCode: string
  typeId: number
  typeName?: string
  path: string
  parentId: number | null
}

// ── Breadcrumb cell ─────────────────────────────────────────────────────────

export interface BreadcrumbCell {
  id: number | null
  name: string | null
  shortCode: string | null
}

// ── Cascade level state ─────────────────────────────────────────────────────

export interface CascadeLevel {
  id: number | ''
  typeId: number
}

// ── Picker option ───────────────────────────────────────────────────────────

export interface LevelOption {
  id: number
  name: string
  shortCode: string
  path: string
}

// ── Flatten tree to flat array with breadcrumb paths ────────────────────────

export function flattenLocations(locations: StoreLocation[], parentPath = ''): FlatLocation[] {
  const result: FlatLocation[] = []
  for (const loc of locations) {
    if (loc.active === false) continue
    const path = parentPath ? `${parentPath} > ${loc.name}` : loc.name
    result.push({
      id: loc.id,
      name: loc.name,
      shortCode: loc.shortCode,
      typeId: loc.typeId,
      typeName: loc.typeName,
      path,
      parentId: loc.parentId,
    })
    if (loc.children?.length) {
      result.push(...flattenLocations(loc.children, path))
    }
  }
  return result
}

// ── Build tree from flat list ───────────────────────────────────────────────

export function buildLocationTree(flat: StoreLocation[]): StoreLocation[] {
  const map = new Map<number, StoreLocation>()
  const roots: StoreLocation[] = []
  for (const loc of flat) {
    map.set(loc.id, { ...loc, children: [] })
  }
  for (const loc of flat) {
    const node = map.get(loc.id)!
    if (loc.parentId && map.has(loc.parentId)) {
      map.get(loc.parentId)!.children!.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

// ── Build 4-level breadcrumb for an item location ───────────────────────────

type LevelKey = typeof TYPE_IDS[keyof typeof TYPE_IDS]

export function buildItemBreadcrumb(
  loc: ItemLocation,
  flat: FlatLocation[],
): Record<LevelKey, BreadcrumbCell> {
  const empty = (): BreadcrumbCell => ({ id: null, name: null, shortCode: null })
  const result: Record<number, BreadcrumbCell> = {
    [TYPE_IDS.ZONE]: empty(),
    [TYPE_IDS.AISLE]: empty(),
    [TYPE_IDS.BAY]: empty(),
    [TYPE_IDS.ROW]: empty(),
  }

  // Normalise location ID from varied response shapes
  const locId = loc.locationId
    ?? (loc as Record<string, unknown>).locationID as number | undefined
    ?? (loc as Record<string, unknown>).location_id as number | undefined
    ?? (loc as Record<string, unknown>).id as number | undefined

  // Try to find leaf in flat list and walk ancestors
  const leaf = locId != null ? flat.find(f => f.id === locId) : null
  if (leaf) {
    let current: FlatLocation | undefined = leaf
    while (current) {
      result[current.typeId] = { id: current.id, name: current.name, shortCode: current.shortCode }
      current = current.parentId != null ? flat.find(f => f.id === current!.parentId) : undefined
    }
    return result as Record<LevelKey, BreadcrumbCell>
  }

  // Fallback: split path string positionally
  const path = loc.path
    ?? (loc as Record<string, unknown>).fullPath as string | undefined
    ?? (loc as Record<string, unknown>).breadcrumb as string | undefined
  if (path) {
    const parts = path.split('>').map(s => s.trim()).filter(Boolean)
    for (let i = 0; i < parts.length && i < LEVEL_ORDER.length; i++) {
      result[LEVEL_ORDER[i]] = { id: null, name: parts[i], shortCode: null }
    }
    return result as Record<LevelKey, BreadcrumbCell>
  }

  // Last resort: drop name into deepest slot
  const name = loc.name
    ?? (loc as Record<string, unknown>).locationName as string | undefined
    ?? (loc as Record<string, unknown>).displayName as string | undefined
  if (name) {
    result[TYPE_IDS.ROW] = { id: null, name, shortCode: loc.shortCode ?? null }
  }

  return result as Record<LevelKey, BreadcrumbCell>
}

// ── Compact single-line formatter for an item's assigned location ──────────
// Example: "ZONE-A · AISLE 3 · BAY B1 · ROW 2"
// Falls back to `loc.path`, then `loc.name`, then the raw id. Used in
// bulk-location queue rows and result rows to surface existing allocations.

export function formatLocPath(loc: ItemLocation, flat: FlatLocation[]): string {
  const crumbs = buildItemBreadcrumb(loc, flat)
  const parts: string[] = []
  for (const tid of LEVEL_ORDER) {
    const cell = crumbs[tid]
    const label = cell.shortCode || cell.name
    if (label) parts.push(label)
  }
  if (parts.length > 0) return parts.join(' · ')

  const fallback = loc.path
    ?? (loc as Record<string, unknown>).fullPath as string | undefined
    ?? loc.name
    ?? (loc as Record<string, unknown>).locationName as string | undefined
  if (fallback) return fallback
  return `#${loc.locationId ?? ''}`
}

// ── Parse hierarchy from a location ID ──────────────────────────────────────

export function parseLocationHierarchy(
  locationId: number,
  flat: FlatLocation[],
): Record<LevelKey, FlatLocation | null> {
  const result: Record<number, FlatLocation | null> = {
    [TYPE_IDS.ZONE]: null,
    [TYPE_IDS.AISLE]: null,
    [TYPE_IDS.BAY]: null,
    [TYPE_IDS.ROW]: null,
  }
  let current = flat.find(f => f.id === locationId)
  while (current) {
    result[current.typeId] = current
    current = current.parentId != null ? flat.find(f => f.id === current!.parentId) : undefined
  }
  return result as Record<LevelKey, FlatLocation | null>
}

// ── Resolve deepest picked level ────────────────────────────────────────────

export function resolveTargetLocation(levels: CascadeLevel[]): number | null {
  let finalId: number | null = null
  for (const level of levels) {
    if (level.id !== '' && level.id > 0) {
      finalId = level.id
    }
  }
  return finalId
}

export function hasAnyCascadeInput(levels: CascadeLevel[]): boolean {
  return levels.some(l => l.id !== '' && l.id > 0)
}

// ── Bay grouping by shortCode prefix ────────────────────────────────────────

export function getShortCodePrefix(shortCode: string): string {
  const match = shortCode.match(/^[A-Za-z]+/)
  return match ? match[0].toUpperCase() : ''
}

export function groupByPrefix<T extends { shortCode: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const prefix = getShortCodePrefix(item.shortCode)
    const key = prefix || '—'
    const list = groups.get(key)
    if (list) list.push(item)
    else groups.set(key, [item])
  }
  return groups
}
