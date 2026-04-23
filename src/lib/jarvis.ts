// ═══════════════════════════════════════════════
// JARVISmart API Client — Grocery Manager
// Connects to the Smart Retail bridge
// All requests authenticated with X-API-Key header
// ═══════════════════════════════════════════════

const DEFAULT_URL = 'https://api.jarvismart196410.uk'
const DEFAULT_KEY = 'jmart_sk_7f3a9c2e1b4d8f6a0e5c3b9d'


function safeGetItem(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function getBaseUrl(): string {
  return safeGetItem('grocery-manager-jarvis-url') || (import.meta.env.VITE_JARVIS_URL as string) || DEFAULT_URL
}
function getApiKey(): string {
  return safeGetItem('grocery-manager-jarvis-key') || (import.meta.env.VITE_JARVIS_API_KEY as string) || DEFAULT_KEY
}

const FETCH_TIMEOUT = 15_000

export { getBaseUrl, getApiKey }

async function jarvisFetch<T>(path: string): Promise<T> {
  const url = `${getBaseUrl()}${path}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        'X-API-Key': getApiKey(),
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error(`Request to ${getBaseUrl()} timed out after ${FETCH_TIMEOUT / 1000}s`)
    }
    const base = getBaseUrl()
    // Diagnose common issues
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && base.startsWith('http:')) {
      throw new Error(`Mixed content blocked: cannot call HTTP API (${base}) from HTTPS page. Use Settings to set an HTTPS URL, or open this app via HTTP.`)
    }
    throw new Error(`Network error reaching ${base} — check the URL in Settings and ensure JARVISmart is reachable. (${(err as Error).message})`)
  } finally {
    clearTimeout(timeout)
  }
  if (!res.ok) throw new Error(`JARVISmart ${res.status}: ${res.statusText}`)
  return res.json() as Promise<T>
}

async function jarvisMutate<T>(path: string, method: 'POST' | 'PUT', body: unknown): Promise<T> {
  const url = `${getBaseUrl()}${path}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: {
        'X-API-Key': getApiKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error(`Request to ${getBaseUrl()} timed out after ${FETCH_TIMEOUT / 1000}s`)
    }
    const base = getBaseUrl()
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && base.startsWith('http:')) {
      throw new Error(`Mixed content blocked: cannot call HTTP API (${base}) from HTTPS page.`)
    }
    throw new Error(`Network error reaching ${base} — ${(err as Error).message}`)
  } finally {
    clearTimeout(timeout)
  }
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`JARVISmart ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

// ── Raw API shapes ──────────────────────────────────────────────────────────

interface RawPromoItem {
  itemCode: string
  description: string
  department: string
  promoSellPrice: number
  normalSellPrice: number
  discountPercent: number
  marginAtPromoPrice: number
  promoCtnCost: number
  normalCtnCost: number
  promoUnitCost: number | null
  normalUnitCost: number
  ctnQty: number
  costSavingPercent: number | null
  startDate: string
  endDate: string
  daysLeft: number
}

interface RawSalesSummary {
  period: string
  dateFrom: string
  dateTo: string
  totalRevenue: number
  totalCost: number
  grossProfit: number
  grossMarginPercent: number
  totalTransactions: number
  avgBasketSize: number
  normalSales: number
  promotionSales: number
  // Margin overhaul (2026-04-14) — ISH-sourced transaction-accurate totals
  basis?: 'ish_incl_manager_special' | 'ish_excl_manager_special'
  managerSpecialSales?: number
  managerSpecialCost?: number
  managerSpecialGP?: number
  totalQty?: number
}

interface RawDepartment {
  code: number
  name: string
  totalSales: number
  totalCost: number
  grossProfit: number
  marginPercent: number | null
  transactions: number
  normalSales: number
  promotionSales: number
  managerSpecialSales?: number
  managerSpecialCost?: number
  managerSpecialGP?: number
  totalQty?: number
}

interface RawTopSeller {
  rank: number
  itemCode: string
  description: string
  department: string
  qtySold: number
  revenue: number
  cost: number
}

interface RawStockItem {
  ItemCode: string
  ItemDescription: string
  QOH: number
  MinOH: number
  RegSellPrice: number
  AvgCost: number
  DepartmentName: string
  DepartmentCode: number
  OnOrder: number
  IsOnReorder: boolean
  AvgDayQty: number
  AvgWeekQty: number
  barcode: string | null
  Active?: boolean
  active?: boolean
  IsActive?: boolean
}

// ── Public types ─────────────────────────────────────────────────────────────

export interface ConnectionStatus {
  connected: boolean
  reason?: string
  [key: string]: unknown
}

export type MarginBasis = 'ish_incl_manager_special' | 'ish_excl_manager_special'

export interface SalesSummary {
  period: string
  totalRevenue: number
  totalTransactions: number
  totalCost: number
  grossProfit: number
  grossMarginPercent: number
  avgBasketSize: number
  normalSales: number
  promotionSales: number
  basis?: MarginBasis
  managerSpecialSales?: number
  managerSpecialCost?: number
  managerSpecialGP?: number
  totalQty?: number
}

export interface DepartmentBreakdown {
  code: number
  department: string
  sales: number
  cost: number
  grossProfit: number
  marginPercent: number | null
  transactions: number
  normalSales: number
  promotionSales: number
  managerSpecialSales?: number
  managerSpecialCost?: number
  managerSpecialGP?: number
  totalQty?: number
}

export interface DepartmentBreakdownResponse {
  period: string
  basis?: MarginBasis
  departments: DepartmentBreakdown[]
}

export interface TopSeller {
  rank: number
  itemCode: string
  description: string
  department: string
  quantitySold: number
  revenue: number
  cost: number
}

export interface StockItem {
  itemCode: string
  barcode: string | null
  description: string
  department: string
  departmentCode: number
  onHand: number
  reorderLevel: number
  sellPrice: number
  avgCost: number
  onOrder: number
  isOnReorder: boolean
  avgDayQty: number | null
  avgWeekQty: number | null
  active?: boolean
}

export interface LivePromotion {
  itemCode: string
  description: string
  department: string
  promoPrice: number
  normalPrice: number
  discountPercent: number
  marginPercent: number
  promoUnitCost: number | null
  normalUnitCost: number
  ctnQty: number
  costSavingPercent: number | null
  startDate: string
  endDate: string
  daysLeft: number
}

export interface SearchResult {
  items: StockItem[]
  total: number
  [key: string]: unknown
}

export interface StockFilters {
  department?: string
  itemCode?: string
  lowStock?: boolean
  limit?: number
}

// ── Price tracking types ────────────────────────────────────────────────────

/**
 * Response shape for GET /api/pos/price/:itemCode
 *
 * ⚠️  Margin overhaul (2026-04-14): always read `marginPercent` / `unitCostInc`
 * from this response. DO NOT compute margin as (RegSellPrice - AvgCost)/RegSellPrice.
 * `AvgCost` is retained for backward compatibility but drifts unpredictably with
 * stocktake adjustments — display `unitCostInc` instead, labelled "Unit cost (inc GST)".
 */
export interface PriceCheck {
  ItemCode: string
  ItemDescription: string
  barcode: string | null
  barcodes?: string[]
  DepartmentName: string
  DepartmentCode: number
  RegSellPrice: number
  PrevSellPrice: number
  /** @deprecated drifts with stocktake; use `unitCostInc` */
  AvgCost: number
  QOH: number
  GSTCode?: string
  GSTRate?: number
  AvgDayQty?: number
  AvgWeekQty?: number
  MinOH?: number
  IsWeigh?: boolean
  // Canonical margin fields — use these
  effectiveSellInc: number
  unitCostInc: number
  unitCostSource: 'primary' | 'store_supplier' | 'aligned_promo' | 'cost_deal'
  marginBasis: 'normal' | 'aligned_promo' | 'cost_deal'
  marginDollar: number
  marginPercent: number
  targetGP: number | null
  normalGP: number | null
  supplier: string | null
  supplierCtnCost: number | null
  supplierCtnQty: number | null
  promoEndsOn: string | null
  [key: string]: unknown
}

export interface PriceHistoryEntry {
  date: string
  oldPrice: number
  newPrice: number
  changedBy: string
  [key: string]: unknown
}

export interface DailySale {
  date: string
  qty: number
  revenue: number
  cost: number
  gp: number
}

export interface ItemSalesData {
  itemCode: string
  barcode: string
  description: string
  department: string
  currentSellPrice: number
  prevSellPrice: number
  avgCost: number
  period: string
  summary: {
    totalQty: number
    totalRevenue: number
    daysWithSales: number
    avgDailyQty: number
    avgDailyRevenue: number
  }
  dailySales: DailySale[]
}

export interface PriceChangeRequest {
  newPrice: number
  reason?: string
}

export interface PriceChangeResponse {
  success: boolean
  itemCode: string
  oldPrice: number
  newPrice: number
  message?: string
}

export interface RecentPriceChange {
  itemCode: string
  barcode: string | null
  description: string
  department: string
  oldPrice: number
  newPrice: number
  changeDate: string
  changedBy: string
}

// ── API Functions ─────────────────────────────────────────────────────────────

export async function checkConnection(): Promise<ConnectionStatus> {
  try {
    const data = await jarvisFetch<Omit<ConnectionStatus, 'connected'>>('/api/pos/health')
    return { connected: true, ...data }
  } catch (err) {
    return { connected: false, reason: (err as Error).message }
  }
}

export async function getSalesSummary(
  period: 'today' | 'week' | 'month' | string = 'today',
  opts: { includeManagerSpecial?: boolean } = {},
): Promise<SalesSummary> {
  const qs = new URLSearchParams({ period })
  if (opts.includeManagerSpecial !== undefined) {
    qs.set('includeManagerSpecial', opts.includeManagerSpecial ? '1' : '0')
  }
  const raw = await jarvisFetch<RawSalesSummary>(`/api/pos/sales?${qs}`)
  return {
    period:              raw.period,
    totalRevenue:        raw.totalRevenue,
    totalTransactions:   raw.totalTransactions,
    totalCost:           raw.totalCost,
    grossProfit:         raw.grossProfit,
    grossMarginPercent:  raw.grossMarginPercent,
    avgBasketSize:       raw.avgBasketSize,
    normalSales:         raw.normalSales,
    promotionSales:      raw.promotionSales,
    basis:               raw.basis,
    managerSpecialSales: raw.managerSpecialSales,
    managerSpecialCost:  raw.managerSpecialCost,
    managerSpecialGP:    raw.managerSpecialGP,
    totalQty:            raw.totalQty,
  }
}

export async function getDepartmentBreakdown(
  period: 'today' | 'week' | 'month' | string = 'today',
  opts: { includeManagerSpecial?: boolean } = {},
): Promise<DepartmentBreakdown[]> {
  const res = await getDepartmentBreakdownEnvelope(period, opts)
  return res.departments
}

export async function getDepartmentBreakdownEnvelope(
  period: 'today' | 'week' | 'month' | string = 'today',
  opts: { includeManagerSpecial?: boolean } = {},
): Promise<DepartmentBreakdownResponse> {
  const qs = new URLSearchParams({ period })
  if (opts.includeManagerSpecial !== undefined) {
    qs.set('includeManagerSpecial', opts.includeManagerSpecial ? '1' : '0')
  }
  const raw = await jarvisFetch<{ period: string; basis?: MarginBasis; departments: RawDepartment[] }>(
    `/api/pos/departments?${qs}`
  )
  return {
    period: raw.period,
    basis: raw.basis,
    departments: raw.departments.map(d => ({
      code:                d.code,
      department:          d.name,
      sales:               d.totalSales,
      cost:                d.totalCost,
      grossProfit:         d.grossProfit,
      marginPercent:       d.marginPercent,
      transactions:        d.transactions,
      normalSales:         d.normalSales,
      promotionSales:      d.promotionSales,
      managerSpecialSales: d.managerSpecialSales,
      managerSpecialCost:  d.managerSpecialCost,
      managerSpecialGP:    d.managerSpecialGP,
      totalQty:            d.totalQty,
    })),
  }
}

export async function getTopSellers(days = 7, limit = 20): Promise<TopSeller[]> {
  const raw = await jarvisFetch<{ period: string; items: RawTopSeller[] }>(
    `/api/pos/top-sellers?days=${days}&limit=${limit}`
  )
  return raw.items
    .map(t => ({
      rank:          t.rank,
      itemCode:      t.itemCode,
      description:   t.description,
      department:    t.department,
      quantitySold:  t.qtySold,
      revenue:       t.revenue,
      cost:          t.cost,
    }))
}

export async function getStockLevels(filters: StockFilters = {}): Promise<StockItem[]> {
  const params = new URLSearchParams()
  if (filters.department)              params.set('department', filters.department)
  if (filters.itemCode)                params.set('itemCode', filters.itemCode)
  if (filters.lowStock !== undefined)  params.set('lowStock', String(filters.lowStock))
  if (filters.limit !== undefined)     params.set('limit', String(filters.limit))
  const qs = params.toString()
  const raw = await jarvisFetch<{ items: RawStockItem[]; count: number }>(
    `/api/pos/stock${qs ? '?' + qs : ''}`
  )
  return raw.items
    .map(s => ({
      itemCode:       s.ItemCode,
      barcode:        s.barcode ?? null,
      description:    s.ItemDescription.trim(),
      department:     s.DepartmentName,
      departmentCode: s.DepartmentCode,
      onHand:         s.QOH,
      reorderLevel:   s.MinOH,
      sellPrice:      s.RegSellPrice,
      avgCost:        s.AvgCost,
      onOrder:        s.OnOrder,
      isOnReorder:    s.IsOnReorder,
      avgDayQty:      s.AvgDayQty,
      avgWeekQty:     s.AvgWeekQty,
      active:         s.Active ?? s.active ?? s.IsActive,
    }))
}

export async function searchItems(query: string, limit = 20): Promise<SearchResult> {
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  const raw = await jarvisFetch<{ items: RawStockItem[]; count: number }>(`/api/pos/search?${params}`)
  return {
    items: (raw.items || [])
      .map(s => ({
        itemCode:       s.ItemCode,
        barcode:        s.barcode ?? (s as unknown as Record<string, string>).BarCode ?? null,
        description:    s.ItemDescription?.trim() ?? '',
        department:     s.DepartmentName ?? '',
        departmentCode: s.DepartmentCode ?? 0,
        onHand:         s.QOH ?? 0,
        reorderLevel:   s.MinOH ?? 0,
        sellPrice:      s.RegSellPrice ?? 0,
        avgCost:        s.AvgCost ?? 0,
        onOrder:        s.OnOrder ?? 0,
        isOnReorder:    s.IsOnReorder ?? false,
        avgDayQty:      s.AvgDayQty ?? null,
        avgWeekQty:     s.AvgWeekQty ?? null,
        active:         s.Active ?? s.active ?? s.IsActive,
      })),
    total: raw.count ?? 0,
  }
}

// ── Smart search: handles 6-digit ordercodes and 12-13 digit barcodes ──────
// Tries the raw query, then UPC-A/EAN-13 variants (strip / pad leading zero)
// for digit-only inputs. Results are merged and deduped by itemCode.

export function barcodeVariants(code: string): string[] {
  const variants = [code]
  const digits = code.replace(/\D/g, '')
  if (digits && digits !== code) variants.push(digits)
  const stripped = digits.replace(/^0+/, '')
  if (stripped && stripped !== digits) variants.push(stripped)
  const padded = '0' + digits
  if (digits && padded !== digits) variants.push(padded)
  return [...new Set(variants)]
}

export async function searchItemsSmart(query: string, limit = 20): Promise<SearchResult> {
  const trimmed = query.trim()
  if (!trimmed) return { items: [], total: 0 }

  // Always run the raw query first
  const primary = await searchItems(trimmed, limit).catch(() => ({ items: [], total: 0 } as SearchResult))

  // If primary already has good matches, or query isn't digit-only, return it
  const isDigits = /^\d+$/.test(trimmed)
  if (primary.items.length > 0 || !isDigits) return primary

  // Digit-only with zero hits → try barcode variants (skip the raw query we already tried)
  const variants = barcodeVariants(trimmed).filter(v => v !== trimmed)
  const seen = new Set<string>()
  const merged: SearchResult['items'] = []
  for (const v of variants) {
    try {
      const res = await searchItems(v, limit)
      for (const it of res.items) {
        if (!seen.has(it.itemCode)) { seen.add(it.itemCode); merged.push(it) }
      }
      if (merged.length >= limit) break
    } catch { /* try next variant */ }
  }
  return { items: merged.slice(0, limit), total: merged.length }
}

// ── Produce-specific search ───────────────────────────────────────────────
// Hits /api/pos/produce/search which returns only actively-used produce SKUs,
// filtering out stale items that clutter the local DB.

export async function searchProduceItems(query: string, limit = 20, days = 7): Promise<SearchResult> {
  const params = new URLSearchParams({ q: query, limit: String(limit), days: String(days) })
  const raw = await jarvisFetch<{ items: RawStockItem[]; count: number }>(`/api/pos/produce/search?${params}`)
  return {
    items: (raw.items || [])
      .map(s => ({
        itemCode:       s.ItemCode,
        barcode:        s.barcode ?? (s as unknown as Record<string, string>).BarCode ?? null,
        description:    s.ItemDescription?.trim() ?? '',
        department:     s.DepartmentName ?? '',
        departmentCode: s.DepartmentCode ?? 0,
        onHand:         s.QOH ?? 0,
        reorderLevel:   s.MinOH ?? 0,
        sellPrice:      s.RegSellPrice ?? 0,
        avgCost:        s.AvgCost ?? 0,
        onOrder:        s.OnOrder ?? 0,
        isOnReorder:    s.IsOnReorder ?? false,
        avgDayQty:      s.AvgDayQty ?? null,
        avgWeekQty:     s.AvgWeekQty ?? null,
        active:         s.Active ?? s.active ?? s.IsActive,
      })),
    total: raw.count ?? 0,
  }
}

export async function searchWithProducePriority(query: string, limit = 20): Promise<SearchResult> {
  const [produce, generic] = await Promise.allSettled([
    searchProduceItems(query, limit),
    searchItems(query, limit),
  ])
  if (produce.status === 'fulfilled' && produce.value.items.length > 0) return produce.value
  if (generic.status === 'fulfilled') return generic.value
  return { items: [], total: 0 }
}

// ── Order / Supplier info ──────────────────────────────────────────────────

export interface SupplierInfo {
  supplierName: string
  supplierId: number
  orderCode: string | null
  orderCodeRaw: string | null
  supplierRef: string | null
  ctnCost: number
  ctnQty: number
  unitCost: number
  minOrderQty: number
  isPrimary: boolean
  lastOrdered: string | null
  lastReceived: string | null
  lastReceivedCost: number | null
}

export interface OrderInfo {
  itemCode: string
  description: string
  barcode: string
  sellPrice: number
  qoh: number
  suppliers: SupplierInfo[]
}

export async function getOrderInfo(itemCode: string): Promise<OrderInfo | null> {
  try {
    return await jarvisFetch<OrderInfo>(`/api/pos/order-info/${encodeURIComponent(itemCode)}`)
  } catch { return null }
}

export async function getItemPrice(itemCode: string): Promise<PriceCheck> {
  return jarvisFetch<PriceCheck>(`/api/pos/price/${encodeURIComponent(itemCode)}`)
}

export async function getPriceHistory(itemCode: string, months = 6): Promise<PriceHistoryEntry[]> {
  const raw = await jarvisFetch<{ history: PriceHistoryEntry[] } | PriceHistoryEntry[]>(
    `/api/pos/price-history/${encodeURIComponent(itemCode)}?months=${months}`
  )
  return Array.isArray(raw) ? raw : raw.history
}

export async function getItemSales(itemCode: string, days = 90): Promise<ItemSalesData> {
  return jarvisFetch<ItemSalesData>(`/api/pos/item-sales/${encodeURIComponent(itemCode)}?days=${days}`)
}

export async function getRecentPriceChanges(since: string, excludeHost = true): Promise<RecentPriceChange[]> {
  const params = new URLSearchParams({ since })
  if (excludeHost) params.set('excludeHost', 'true')

  interface RawPriceChangeItem {
    itemCode: string; barcode: string | null; description: string; department: string
    date: string; changedBy: string; source: string
    prevSellPrice: number; currentRegSellPrice: number; sellChanged: boolean
    [key: string]: unknown
  }

  const raw = await jarvisFetch<{ items: RawPriceChangeItem[] } | { changes: RecentPriceChange[] } | RecentPriceChange[]>(
    `/api/pos/recent-price-changes?${params}`
  )

  if (Array.isArray(raw)) return raw
  if ('changes' in raw) return raw.changes

  const mapped = raw.items
    .filter(item => {
      const priceChanged = item.sellChanged || Math.abs(item.prevSellPrice - item.currentRegSellPrice) > 0.001
      const sourceOk = excludeHost ? item.source === 'manual' : true
      return priceChanged && sourceOk
    })
    .map(item => ({
      itemCode: item.itemCode,
      barcode: item.barcode,
      description: item.description,
      department: item.department,
      oldPrice: item.prevSellPrice,
      newPrice: item.currentRegSellPrice,
      changeDate: item.date,
      changedBy: item.changedBy,
    }))

  const seen = new Map<string, RecentPriceChange>()
  for (const item of mapped) {
    if (!seen.has(item.itemCode) || new Date(item.changeDate) > new Date(seen.get(item.itemCode)!.changeDate)) {
      seen.set(item.itemCode, item)
    }
  }
  return Array.from(seen.values())
}

// ── PUT Price Change (legacy — prefer changeAndSend) ─────────────────────────

/** @deprecated Use changeAndSend() which also pushes to POS registers */
export async function putPrice(
  itemCode: string,
  body: PriceChangeRequest,
): Promise<PriceChangeResponse> {
  return jarvisMutate<PriceChangeResponse>(
    `/api/pos/price/${encodeURIComponent(itemCode)}`,
    'PUT',
    body,
  )
}

// ── Promotions (all departments) ────────────────────────────────────────────

const ALL_DEPT_NAMES = [
  'GROCERY', 'DAIRY', 'FROZEN', 'FRESH PRODUCE', 'MEAT', 'DELI', 'BAKERY',
  'HEALTH & BEAUTY', 'HOUSEHOLD', 'PET', 'BABY', 'GENERAL MERCHANDISE', 'TOBACCO',
]

export async function getPromotions(): Promise<{ items: LivePromotion[]; count: number; expiringSoonCount: number }> {
  const results = await Promise.all(
    ALL_DEPT_NAMES.map(dept =>
      jarvisFetch<{ active: boolean; items: RawPromoItem[]; count: number; expiringSoonCount: number }>(
        `/api/pos/promotions?department=${encodeURIComponent(dept)}&limit=1000`
      ).catch(() => ({ active: false, items: [] as RawPromoItem[], count: 0, expiringSoonCount: 0 }))
    )
  )

  const allItems: LivePromotion[] = []
  let expiringSoonCount = 0

  for (const raw of results) {
    expiringSoonCount += raw.expiringSoonCount
    for (const p of raw.items) {
      allItems.push({
        itemCode:         p.itemCode,
        description:      p.description.trim(),
        department:       p.department,
        promoPrice:       p.promoSellPrice,
        normalPrice:      p.normalSellPrice,
        discountPercent:  p.discountPercent,
        marginPercent:    p.marginAtPromoPrice,
        promoUnitCost:    p.promoUnitCost,
        normalUnitCost:   p.normalUnitCost,
        ctnQty:           p.ctnQty,
        costSavingPercent: p.costSavingPercent,
        startDate:        p.startDate,
        endDate:          p.endDate,
        daysLeft:         p.daysLeft,
      })
    }
  }

  // Deduplicate by itemCode (same item may appear in multiple dept queries)
  const seen = new Map<string, LivePromotion>()
  for (const item of allItems) {
    if (!seen.has(item.itemCode)) seen.set(item.itemCode, item)
  }

  const deduped = Array.from(seen.values())
  return { items: deduped, count: deduped.length, expiringSoonCount }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── POS ACTION Endpoints (WRITE) ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// ── Change & Send (price change + push to registers) ─────────────────────────

export interface ChangeAndSendRequest {
  barcode: string
  newPrice: number
  reason?: string
}

export interface ChangeAndSendResponse {
  success: boolean
  barcode: string
  itemCode?: string
  oldPrice?: number
  newPrice: number
  sentToPos?: boolean
  message?: string
}

export async function changeAndSend(
  barcode: string,
  newPrice: number,
  reason?: string,
): Promise<ChangeAndSendResponse> {
  return jarvisMutate<ChangeAndSendResponse>(
    '/api/pos-actions/change-and-send',
    'POST',
    { barcode, newPrice, reason },
  )
}

// ── Send to POS (push items to registers via file) ───────────────────────────

export interface SendToPosRequest {
  items: { barcode: string }[]
}

export interface SendToPosResponse {
  success: boolean
  itemCount: number
  message?: string
}

export async function sendToPos(items: { barcode: string }[]): Promise<SendToPosResponse> {
  return jarvisMutate<SendToPosResponse>(
    '/api/pos-actions/send-to-pos',
    'POST',
    { items },
  )
}

// ── Update Back-Office Price (no POS push) ───────────────────────────────────

export interface UpdatePriceResponse {
  success: boolean
  barcode: string
  oldPrice?: number
  newPrice: number
  message?: string
}

export async function updateBackOfficePrice(
  barcode: string,
  newPrice: number,
): Promise<UpdatePriceResponse> {
  return jarvisMutate<UpdatePriceResponse>(
    `/api/pos-actions/price/${encodeURIComponent(barcode)}`,
    'PUT',
    { newPrice },
  )
}

// ── Create Item ──────────────────────────────────────────────────────────────

export interface CreateItemRequest {
  barcode: string
  description: string
  departmentCode: number
  sellPrice: number
  costPrice?: number
  isGstFree?: boolean
  ctnQty?: number
  minStockLevel?: number
}

export interface CreateItemResponse {
  success: boolean
  barcode: string
  itemCode?: string
  sentToPos?: boolean
  message?: string
}

export async function createItem(item: CreateItemRequest): Promise<CreateItemResponse> {
  return jarvisMutate<CreateItemResponse>(
    '/api/pos-actions/create-item',
    'POST',
    item,
  )
}

// ── Create Promo ─────────────────────────────────────────────────────────────

export interface CreatePromoRequest {
  barcode: string
  promoPrice: number
  startDate: string
  endDate: string
  description?: string
  promoType?: string
}

export interface CreatePromoResponse {
  success: boolean
  barcode: string
  sentToPos?: boolean
  message?: string
}

export async function createPromo(promo: CreatePromoRequest): Promise<CreatePromoResponse> {
  return jarvisMutate<CreatePromoResponse>(
    '/api/pos-actions/create-promo',
    'POST',
    promo,
  )
}

// ── Print Talkers ────────────────────────────────────────────────────────────

export interface PrintTalkersResponse {
  ok: boolean
  promoType: string
  slot?: number
  created: number
  failed: string[]
  total: number
  message?: string
}

export async function printTalkers(promoType: string): Promise<PrintTalkersResponse> {
  return jarvisMutate<PrintTalkersResponse>(
    '/api/pos-actions/print-talker',
    'POST',
    { promoType },
  )
}

// ── Print Label ──────────────────────────────────────────────────────────────

export interface PrintLabelResponse {
  ok: boolean
  barcode: string
  description?: string
  price?: number
  labelCount?: number
  printerId?: number
  styleId?: number
  message?: string
  batchId?: string
  error?: string
}

/** Step 1: Queue labels via SmartRetail API (POST /smartservice/shelflabel) */
export async function printLabel(barcode: string, qty = 1, printerId?: number, styleId?: number): Promise<PrintLabelResponse> {
  const body: Record<string, unknown> = { barcode, qty }
  if (printerId != null) body.printerId = printerId
  if (styleId != null) body.styleId = styleId
  return jarvisMutate<PrintLabelResponse>(
    '/api/pos-actions/print-label',
    'POST',
    body,
  )
}

export interface GenerateLabelResponse {
  ok: boolean
  generated: number
  printed: boolean
  message?: string
  error?: string
}

/** Step 2: Generate rendered labels and send to printer via Playwright browser session */
export async function generateAndPrintLabels(printerId: number, styleId?: number): Promise<GenerateLabelResponse> {
  const body: Record<string, unknown> = { type: 'label', printerId }
  if (styleId != null) body.styleId = styleId
  return jarvisMutate<GenerateLabelResponse>(
    '/api/pos/label-queue/generate',
    'POST',
    body,
  )
}

// ── Label Queue Management ──────────────────────────────────────────────────

export interface LabelQueueItem {
  barcode: string
  itemCode: string
  description: string
  sellPrice: number
  normalPrice: number
  count: number
  printerId: number
  batchId: string
  createdBy: string
  createdAt: string
}

export interface LabelQueueResponse {
  type: string
  pending: number
  items: LabelQueueItem[]
}

export async function getLabelQueue(type: 'label' | 'talker' = 'label', printerId?: number): Promise<LabelQueueResponse> {
  const params = new URLSearchParams({ type })
  if (printerId != null) params.set('printerId', String(printerId))
  return jarvisFetch<LabelQueueResponse>(`/api/pos/label-queue?${params}`)
}

export async function removeFromLabelQueue(barcodes: string[]): Promise<{ ok: boolean }> {
  return jarvisMutate<{ ok: boolean }>('/api/pos/label-queue/remove', 'POST', { barcodes })
}

export async function markLabelsPrinted(barcodes: string[]): Promise<{ ok: boolean }> {
  return jarvisMutate<{ ok: boolean }>('/api/pos/label-queue/mark-printed', 'POST', { barcodes })
}

// ── Printers, Stationery & Label Styles ─────────────────────────────────────

export interface PrinterInfo {
  id: number
  name: string
  networkPath: string
  isLabel: boolean
  isReport: boolean
  queueId: string
  queueRunning: boolean
  defaultStyleId: number | null
}

export interface StationeryInfo {
  id: number
  name: string
  labelsPerPage: number
  paperSize: string
}

export interface LabelStyle {
  id: number
  name: string
  printerId: number
}

export async function getPrinters(): Promise<PrinterInfo[]> {
  return jarvisFetch<PrinterInfo[]>('/api/pos/printers')
}

export async function getStationery(): Promise<StationeryInfo[]> {
  return jarvisFetch<StationeryInfo[]>('/api/pos/stationery')
}

export async function getLabelStyles(): Promise<LabelStyle[]> {
  return jarvisFetch<LabelStyle[]>('/api/pos/label-styles')
}

// ── Print Status ─────────────────────────────────────────────────────────────

export interface PrintQueueLabels {
  pending: number
  printed: number
  total: number
  latestQueued: string | null
  latestPrinted: string | null
}

export interface PrintQueueStatus {
  queueId: string
  name: string
  printerId: number
  status: string
  lastJobId: string | null
  lastError: string | null
  labels: PrintQueueLabels
}

export interface PrintStatusResponse {
  printers: PrintQueueStatus[]
  talkers: { pending: number; printed: number; total: number }
  unassigned: { pending: number; total: number }
}

export async function getPrintStatus(): Promise<PrintStatusResponse> {
  return jarvisFetch<PrintStatusResponse>('/api/pos/print-status')
}

// ── Price Lock ───────────────────────────────────────────────────────────────

export interface PriceLockResponse {
  success: boolean
  barcode: string
  locked: boolean
  message?: string
}

export async function setPriceLock(barcode: string, locked: boolean): Promise<PriceLockResponse> {
  return jarvisMutate<PriceLockResponse>(
    `/api/pos/price-lock/${encodeURIComponent(barcode)}`,
    'PUT',
    { locked },
  )
}

export interface PriceLockItem {
  barcode: string
  itemCode: string
  description: string
  department: string
  sellPrice: number
  lockedAt: string
}

export interface PriceLocksListResponse {
  items: PriceLockItem[]
  total: number
}

export async function getPriceLocks(): Promise<PriceLocksListResponse> {
  return jarvisFetch<PriceLocksListResponse>('/api/pos/price-locks')
}

// ── Adjust Stock ─────────────────────────────────────────────────────────────

export interface AdjustStockRequest {
  barcode: string
  qty: number
  reason: string
}

export interface AdjustStockResponse {
  success: boolean
  barcode: string
  previousQoh?: number
  newQoh?: number
  message?: string
}

export async function adjustStock(
  barcode: string,
  qty: number,
  reason: string,
): Promise<AdjustStockResponse> {
  return jarvisMutate<AdjustStockResponse>(
    '/api/pos-actions/adjust-stock',
    'POST',
    { barcode, qty, reason },
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── READ Endpoints (new) ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// ── Item Performance ─────────────────────────────────────────────────────────

export interface ItemPerformanceEntry {
  itemCode: string
  barcode: string | null
  description: string
  department: string
  revenue: number
  cost: number
  grossProfit: number
  marginPercent: number
  qtySold: number
  velocity: number
  grade?: string
  rank?: number
  [key: string]: unknown
}

export async function getItemPerformance(params?: {
  department?: string
  days?: number
  limit?: number
  sortBy?: 'revenue' | 'margin' | 'velocity' | 'profit'
}): Promise<{ items: ItemPerformanceEntry[]; count: number }> {
  const qs = new URLSearchParams()
  if (params?.department) qs.set('department', params.department)
  if (params?.days) qs.set('days', String(params.days))
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.sortBy) qs.set('sortBy', params.sortBy)
  const q = qs.toString()
  return jarvisFetch(`/api/pos/item-performance${q ? '?' + q : ''}`)
}

// ── Financials ───────────────────────────────────────────────────────────────

export interface FinancialSummary {
  period: string
  terminals: Array<{
    terminal: string
    cash: number
    eftpos: number
    voids: number
    refunds: number
    discounts: number
    [key: string]: unknown
  }>
  totals: {
    cash: number
    eftpos: number
    voids: number
    refunds: number
    discounts: number
    [key: string]: unknown
  }
  [key: string]: unknown
}

export async function getFinancials(
  period: 'today' | 'week' | 'month' | string = 'today',
): Promise<FinancialSummary> {
  return jarvisFetch(`/api/pos/financials?period=${encodeURIComponent(period)}`)
}

// ── Hourly Sales ─────────────────────────────────────────────────────────────

export interface HourlySalesEntry {
  hour: number
  revenue: number
  transactions: number
  department?: string
  [key: string]: unknown
}

export async function getHourlySales(
  period: 'today' | 'week' | string = 'today',
): Promise<{ period: string; hours: HourlySalesEntry[] }> {
  return jarvisFetch(`/api/pos/hourly-sales?period=${encodeURIComponent(period)}`)
}

// ── Trends ───────────────────────────────────────────────────────────────────

export interface TrendEntry {
  date: string
  revenue: number
  cost: number
  grossProfit: number
  transactions: number
  promoSalesPercent?: number
  normalSales?: number
  promoSales?: number
  managerSpecialSales?: number
  managerSpecialCost?: number
  [key: string]: unknown
}

export async function getTrends(
  range: 'daily' | 'weekly' | 'monthly' | string = 'daily',
  days = 30,
  opts: { includeManagerSpecial?: boolean } = {},
): Promise<{ range: string; basis?: MarginBasis; entries: TrendEntry[] }> {
  const qs = new URLSearchParams({ range, days: String(days) })
  if (opts.includeManagerSpecial !== undefined) {
    qs.set('includeManagerSpecial', opts.includeManagerSpecial ? '1' : '0')
  }
  return jarvisFetch(`/api/pos/trends?${qs}`)
}

// ── Loss Items (new, 2026-04-14) ─────────────────────────────────────────────

export type LossItemBasis = 'normal' | 'shelf_promo' | 'markdown' | 'offer'

export interface LossItem {
  barCode: string
  itemCode: string
  description: string
  department: string
  departmentCode: number
  wkQty: number
  sellInc: number
  costInc: number
  wkBleed: number
  unitBleed: number
  gpPct: number
  basis: LossItemBasis
}

export interface LossItemsResponse {
  period: string
  basis: MarginBasis
  totalLossItems: number
  totalBleedInc: number
  byDepartment: Record<string, LossItem[]>
  items: LossItem[]
}

export async function getLossItems(opts: {
  days?: number
  limit?: number
  minBleed?: number
  includeManagerSpecial?: boolean
  department?: string
} = {}): Promise<LossItemsResponse> {
  const qs = new URLSearchParams()
  if (opts.days !== undefined) qs.set('days', String(opts.days))
  if (opts.limit !== undefined) qs.set('limit', String(opts.limit))
  if (opts.minBleed !== undefined) qs.set('minBleed', String(opts.minBleed))
  if (opts.includeManagerSpecial !== undefined) {
    qs.set('includeManagerSpecial', opts.includeManagerSpecial ? '1' : '0')
  }
  if (opts.department) qs.set('department', opts.department)
  const q = qs.toString()
  return jarvisFetch<LossItemsResponse>(`/api/pos/loss-items${q ? '?' + q : ''}`)
}

// ── Top by Department (new, 2026-04-14) ──────────────────────────────────────

export type TopByDeptSort = 'margin' | 'velocity' | 'revenue' | 'gp_dollars'

export interface TopByDeptEntry {
  rank: number
  barCode: string
  itemCode: string
  description: string
  revenue: number
  cost: number
  grossProfit: number
  gpPct: number
  qtySold: number
  avgDailyVelocity: number
  qoh: number
  sellPrice: number
}

export interface TopByDeptBucket {
  top: TopByDeptEntry[]
  bottom: TopByDeptEntry[]
}

export interface TopByDepartmentResponse {
  period: string
  sort: TopByDeptSort
  perDept: number
  minRevenue: number
  basis: MarginBasis
  byDepartment: Record<string, TopByDeptBucket>
}

export async function getTopByDepartment(opts: {
  days?: number
  perDept?: number
  sort?: TopByDeptSort
  departments?: string[]
  minRevenue?: number
  includeManagerSpecial?: boolean
} = {}): Promise<TopByDepartmentResponse> {
  const qs = new URLSearchParams()
  if (opts.days !== undefined) qs.set('days', String(opts.days))
  if (opts.perDept !== undefined) qs.set('perDept', String(opts.perDept))
  if (opts.sort) qs.set('sort', opts.sort)
  if (opts.departments?.length) qs.set('departments', opts.departments.join(','))
  if (opts.minRevenue !== undefined) qs.set('minRevenue', String(opts.minRevenue))
  if (opts.includeManagerSpecial !== undefined) {
    qs.set('includeManagerSpecial', opts.includeManagerSpecial ? '1' : '0')
  }
  const q = qs.toString()
  return jarvisFetch<TopByDepartmentResponse>(`/api/pos/top-by-department${q ? '?' + q : ''}`)
}

// ── Expense Trends ───────────────────────────────────────────────────────────

export interface ExpenseTrendEntry {
  month: string
  category: string
  amount: number
  [key: string]: unknown
}

export async function getExpenseTrends(
  months = 6,
): Promise<{ entries: ExpenseTrendEntry[] }> {
  return jarvisFetch(`/api/pos/expense-trends?months=${months}`)
}

// ── Stock Suggestions ────────────────────────────────────────────────────────

export interface StockSuggestion {
  itemCode: string
  barcode: string | null
  description: string
  department: string
  currentQoh: number
  avgDailyQty: number
  suggestedOrderQty: number
  daysUntilStockout: number | null
  reorderLevel: number
  [key: string]: unknown
}

export async function getStockSuggestions(): Promise<{ items: StockSuggestion[]; count: number }> {
  return jarvisFetch('/api/pos/stock-suggestions')
}

// ── Orders ───────────────────────────────────────────────────────────────────

export interface PurchaseOrder {
  orderId: string
  supplier?: string
  status: string
  orderDate: string
  totalItems: number
  totalCost: number
  lines?: Array<{
    itemCode: string
    description: string
    qty: number
    cost: number
    [key: string]: unknown
  }>
  [key: string]: unknown
}

export async function getOrders(
  status?: string,
): Promise<{ orders: PurchaseOrder[]; count: number }> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : ''
  return jarvisFetch(`/api/pos/orders${qs}`)
}

// ── Order Summary ────────────────────────────────────────────────────────────

export interface OrderSummaryEntry {
  month: string
  orderCount: number
  totalCost: number
  totalItems: number
  [key: string]: unknown
}

export async function getOrderSummary(): Promise<{ months: OrderSummaryEntry[] }> {
  return jarvisFetch('/api/pos/order-summary')
}

// ── Online Prices (Competitive) ──────────────────────────────────────────────

export interface OnlinePrice {
  source: string
  name: string
  price: number
  url?: string
  size?: string
  [key: string]: unknown
}

export async function getOnlinePrices(
  query: string,
): Promise<{ query: string; results: OnlinePrice[] }> {
  return jarvisFetch(`/api/pos/online-prices?q=${encodeURIComponent(query)}`)
}

// ── Department List ──────────────────────────────────────────────────────────

export interface DepartmentListEntry {
  code: number
  name: string
  [key: string]: unknown
}

export async function getDepartmentList(): Promise<{ departments: DepartmentListEntry[] }> {
  return jarvisFetch('/api/pos/department-list')
}

// ── Put Image ────────────────────────────────────────────────────────────────

export async function putImage(
  itemCode: string,
  imageUrl: string,
): Promise<{ success: boolean }> {
  return jarvisMutate('/api/pos/image/' + encodeURIComponent(itemCode), 'PUT', { imageUrl })
}

// ── AI Product Identification ───────────────────────────────────────────────

export async function identifyProduct(imageBase64: string): Promise<{
  suggestions: { description: string; confidence: number; barcode?: string }[]
}> {
  return jarvisMutate('/api/pos/identify-product', 'POST', { image: imageBase64 })
}

// ── Invoice Parsing ─────────────────────────────────────────────────────────

export interface ParsedInvoiceLine {
  description: string
  unitCost: number
  sellPrice: number
  qty?: number
  barcode?: string | null
  orderCode?: string
  matchedItem?: string
}

export interface ParseInvoiceResponse {
  supplier?: string
  invoiceNumber?: string
  lines: ParsedInvoiceLine[]
}

// Raw server response shape
interface RawParseResponse {
  ok?: boolean
  invoice?: { number?: string; date?: string; supplier?: string }
  items?: Array<{
    invoiceDescription?: string
    description?: string
    orderCode?: string
    barcode?: string | null
    quantity?: number
    cartonQty?: number
    cartonCost?: number
    unitCost?: number
    sellPrice?: number
    gstCode?: string
    matchedItem?: string
    [key: string]: unknown
  }>
  // Legacy flat format
  supplier?: string
  invoiceNumber?: string
  lines?: ParsedInvoiceLine[]
}

export async function parseInvoice(imageBase64: string): Promise<ParseInvoiceResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const res = await fetch(`${getBaseUrl()}/api/pos/parse-invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': getApiKey() },
      body: JSON.stringify({ images: [imageBase64] }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`Parse failed: ${res.status}${detail ? ' — ' + detail : ''}`)
    }
    const raw: RawParseResponse = await res.json()

    // Map server response to our normalized format
    const supplier = raw.invoice?.supplier || raw.supplier || ''
    const invoiceNumber = raw.invoice?.number || raw.invoiceNumber || ''

    let lines: ParsedInvoiceLine[] = []
    if (raw.items && raw.items.length > 0) {
      // Server returns items[] with invoiceDescription, unitCost, etc.
      lines = raw.items.map(item => ({
        description: item.invoiceDescription || item.description || '',
        unitCost: item.unitCost ?? item.cartonCost ?? 0,
        sellPrice: item.sellPrice ?? 0,
        qty: item.quantity ?? item.cartonQty ?? 1,
        barcode: item.barcode,
        orderCode: item.orderCode,
        matchedItem: item.matchedItem,
      }))
    } else if (raw.lines && raw.lines.length > 0) {
      lines = raw.lines
    }

    return { supplier, invoiceNumber, lines }
  } finally {
    clearTimeout(timeout)
  }
}

// ── Store Locations ─────────────────────────────────────────────────────────

export interface LocationType {
  id: number
  name: string
  [key: string]: unknown
}

export interface StoreLocation {
  id: number
  name: string
  shortCode: string
  typeId: number
  typeName?: string
  parentId: number | null
  active?: boolean
  children?: StoreLocation[]
  itemCount?: number
  [key: string]: unknown
}

export interface LocationItem {
  itemCode: string
  description?: string
  barcode?: string
  department?: string
  [key: string]: unknown
}

export interface ItemLocation {
  locationId: number
  name: string
  shortCode: string
  typeName?: string
  path?: string
  [key: string]: unknown
}

// ── Location functions ───────────────────────────────────────────────────────

export async function getLocationTypes(): Promise<LocationType[]> {
  return jarvisFetch<LocationType[]>('/api/pos/location-types')
}

export async function getLocations(): Promise<StoreLocation[]> {
  return jarvisFetch<StoreLocation[]>('/api/pos/locations')
}

export async function createLocation(body: {
  name: string; shortCode: string; typeId: number; parentId?: number | null
}): Promise<StoreLocation> {
  return jarvisMutate<StoreLocation>('/api/pos/locations', 'POST', body)
}

export async function updateLocation(id: number, body: {
  name?: string; shortCode?: string; typeId?: number; parentId?: number | null
}): Promise<StoreLocation> {
  return jarvisMutate<StoreLocation>(`/api/pos/locations/${id}`, 'PUT', body)
}

export async function deleteLocation(id: number): Promise<{ success: boolean }> {
  const res = await fetch(`${getBaseUrl()}/api/pos/locations/${id}`, {
    method: 'DELETE',
    headers: { 'X-API-Key': getApiKey() },
  })
  if (!res.ok) throw new Error(`JARVISmart ${res.status}: ${res.statusText}`)
  return res.json()
}

export async function getItemLocations(itemCode: string): Promise<ItemLocation[]> {
  // Backend has historically varied the ID key name & type across releases
  // (`locationId`, `locationID`, `location_id`, `id`, and occasionally
  // stringified numbers). Downstream code compares against a known numeric
  // targetId, so any one mismatch silently flips an assignment from
  // "success" to "failed" in the UI while the row is sitting in the DB.
  // Normalise here so every consumer (verify loop, "already at target"
  // chip, StockView, CrewLookup) sees a canonical numeric `locationId`.
  const raw = await jarvisFetch<Array<Record<string, unknown>>>(
    `/api/pos/locations/item/${encodeURIComponent(itemCode)}`,
  )
  return raw.map(r => {
    const rawId = r.locationId ?? r.locationID ?? r.location_id ?? r.id
    const num = typeof rawId === 'string' ? parseInt(rawId, 10) : (rawId as number)
    return {
      ...r,
      locationId: Number.isFinite(num) ? num : 0,
      name:      String(r.name ?? r.locationName ?? r.displayName ?? ''),
      shortCode: String(r.shortCode ?? r.short_code ?? ''),
    } as ItemLocation
  })
}

export async function getLocationItems(locationId: number): Promise<LocationItem[]> {
  return jarvisFetch<LocationItem[]>(`/api/pos/locations/${locationId}/items`)
}

export async function assignItemToLocation(locationId: number, itemCode: string): Promise<{ success: boolean }> {
  return jarvisMutate<{ success: boolean }>(`/api/pos/locations/${locationId}/items`, 'POST', { itemCode })
}

export async function removeItemFromLocation(locationId: number, itemCode: string): Promise<{ success: boolean }> {
  const res = await fetch(`${getBaseUrl()}/api/pos/locations/${locationId}/items/${encodeURIComponent(itemCode)}`, {
    method: 'DELETE',
    headers: { 'X-API-Key': getApiKey() },
  })
  if (!res.ok) throw new Error(`JARVISmart ${res.status}: ${res.statusText}`)
  return res.json()
}

export async function bulkAssignItems(locationId: number, itemCodes: string[]): Promise<{ success: boolean; assigned?: number }> {
  return jarvisMutate(`/api/pos/locations/${locationId}/bulk-assign`, 'POST', { itemCodes })
}

export async function assignDepartmentToLocation(locationId: number, department: string): Promise<{ success: boolean; assigned?: number }> {
  return jarvisMutate(`/api/pos/locations/${locationId}/assign-department`, 'POST', { department })
}

export async function moveItemToLocation(locationId: number, itemCode: string): Promise<{ success: boolean }> {
  return jarvisMutate(`/api/pos/locations/${locationId}/move`, 'PUT', { itemCode })
}

export async function bulkMoveItems(locationId: number, itemCodes: string[]): Promise<{ success: boolean; moved?: number }> {
  return jarvisMutate(`/api/pos/locations/${locationId}/bulk-move`, 'PUT', { itemCodes })
}

// ── Customer Accounts ────────────────────────────────────────────────────────

export interface CustomerAccount {
  accountNumber: string
  name: string
  balance: number
  creditLimit: number
  phone?: string
  email?: string
  active: boolean
}

export interface CustomerTransaction {
  id: string
  date: string
  type: string
  amount: number
  description: string
  reference?: string
  balance: number
}

export async function getAccounts(): Promise<CustomerAccount[]> {
  const data = await jarvisFetch<{ accounts: CustomerAccount[] } | CustomerAccount[]>(
    '/api/pos/accounts'
  )
  return Array.isArray(data) ? data : data.accounts
}

export async function getAccountTransactions(accountNumber: string): Promise<CustomerTransaction[]> {
  const data = await jarvisFetch<{ transactions: CustomerTransaction[] } | CustomerTransaction[]>(
    `/api/pos/accounts/${encodeURIComponent(accountNumber)}/transactions`
  )
  return Array.isArray(data) ? data : data.transactions
}
