// ═══════════════════════════════════════════════
// JARVISmart API Client — Grocery Manager
// Connects to the Smart Retail bridge
// All requests authenticated with X-API-Key header
// ═══════════════════════════════════════════════

const DEFAULT_URL = 'https://api.jarvismart196410.uk'
const DEFAULT_KEY = 'jmart_sk_7f3a9c2e1b4d8f6a0e5c3b9d'

/** Liquor department names excluded from the entire app */
const EXCLUDED_DEPTS = new Set(['LIQUEURS', 'WINE', 'SPIRITS', 'LIQUOR/MISC', 'BEER'])
function isLiquor(dept: string): boolean {
  return EXCLUDED_DEPTS.has(dept.toUpperCase().trim())
}

function getBaseUrl(): string {
  return localStorage.getItem('grocery-manager-jarvis-url') || (import.meta.env.VITE_JARVIS_URL as string) || DEFAULT_URL
}
function getApiKey(): string {
  return localStorage.getItem('grocery-manager-jarvis-key') || (import.meta.env.VITE_JARVIS_API_KEY as string) || DEFAULT_KEY
}

export { getBaseUrl, getApiKey }

async function jarvisFetch<T>(path: string): Promise<T> {
  const url = `${getBaseUrl()}${path}`
  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        'X-API-Key': getApiKey(),
        'Content-Type': 'application/json',
      },
    })
  } catch (err) {
    const base = getBaseUrl()
    // Diagnose common issues
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && base.startsWith('http:')) {
      throw new Error(`Mixed content blocked: cannot call HTTP API (${base}) from HTTPS page. Use Settings to set an HTTPS URL, or open this app via HTTP.`)
    }
    throw new Error(`Network error reaching ${base} — check the URL in Settings and ensure JARVISmart is reachable. (${(err as Error).message})`)
  }
  if (!res.ok) throw new Error(`JARVISmart ${res.status}: ${res.statusText}`)
  return res.json() as Promise<T>
}

async function jarvisMutate<T>(path: string, method: 'POST' | 'PUT', body: unknown): Promise<T> {
  const url = `${getBaseUrl()}${path}`
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: {
        'X-API-Key': getApiKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    const base = getBaseUrl()
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && base.startsWith('http:')) {
      throw new Error(`Mixed content blocked: cannot call HTTP API (${base}) from HTTPS page.`)
    }
    throw new Error(`Network error reaching ${base} — ${(err as Error).message}`)
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
}

// ── Public types ─────────────────────────────────────────────────────────────

export interface ConnectionStatus {
  connected: boolean
  reason?: string
  [key: string]: unknown
}

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

export interface PriceCheck {
  RegSellPrice: number
  PrevSellPrice: number
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

export async function getSalesSummary(period: 'today' | 'week' | 'month' | string = 'today'): Promise<SalesSummary> {
  const raw = await jarvisFetch<RawSalesSummary>(`/api/pos/sales?period=${encodeURIComponent(period)}`)
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
  }
}

export async function getDepartmentBreakdown(period: 'today' | 'week' | 'month' | string = 'today'): Promise<DepartmentBreakdown[]> {
  const raw = await jarvisFetch<{ period: string; departments: RawDepartment[] }>(
    `/api/pos/departments?period=${encodeURIComponent(period)}`
  )
  return raw.departments
    .filter(d => !isLiquor(d.name))
    .map(d => ({
      code:            d.code,
      department:      d.name,
      sales:           d.totalSales,
      cost:            d.totalCost,
      grossProfit:     d.grossProfit,
      marginPercent:   d.marginPercent,
      transactions:    d.transactions,
      normalSales:     d.normalSales,
      promotionSales:  d.promotionSales,
    }))
}

export async function getTopSellers(days = 7, limit = 20): Promise<TopSeller[]> {
  const raw = await jarvisFetch<{ period: string; items: RawTopSeller[] }>(
    `/api/pos/top-sellers?days=${days}&limit=${limit}`
  )
  return raw.items
    .filter(t => !isLiquor(t.department))
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
    .filter(s => !isLiquor(s.DepartmentName))
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
    }))
}

export async function searchItems(query: string, limit = 20): Promise<SearchResult> {
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  const raw = await jarvisFetch<{ items: RawStockItem[]; count: number }>(`/api/pos/search?${params}`)
  return {
    items: (raw.items || []).map(s => ({
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
    })),
    total: raw.count ?? 0,
  }
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

// ── Print Label ──────────────────────────────────────────────────────────────

export interface PrintLabelResponse {
  success: boolean
  barcode: string
  queued?: boolean
  message?: string
}

export async function printLabel(barcode: string, qty = 1): Promise<PrintLabelResponse> {
  return jarvisMutate<PrintLabelResponse>(
    '/api/pos-actions/print-label',
    'POST',
    { barcode, qty },
  )
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
  [key: string]: unknown
}

export async function getTrends(
  range: 'daily' | 'weekly' | 'monthly' | string = 'daily',
  days = 30,
): Promise<{ range: string; entries: TrendEntry[] }> {
  return jarvisFetch(`/api/pos/trends?range=${encodeURIComponent(range)}&days=${days}`)
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
