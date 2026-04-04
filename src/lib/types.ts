// ─── Department Types ─────────���───────────────────────────────────────────
export type GroceryDepartment =
  | 'grocery' | 'dairy' | 'frozen' | 'fresh_produce' | 'meat'
  | 'deli' | 'bakery' | 'health_beauty' | 'household' | 'pet'
  | 'baby' | 'tobacco' | 'general_merch' | 'other'

// ─── Product ───────────────────────────────────���──────────────────────────
export interface Product {
  id?: number
  barcode: string
  itemCode: string
  name: string
  smartRetailName?: string
  department: GroceryDepartment
  departmentCode: number
  active: boolean
  // Pricing
  sellPrice: number
  costPrice: number
  isGstFree: boolean
  // Stock levels
  minStockLevel: number
  maxStockLevel?: number
  // Location
  aisle: string
  bay: string
  shelf: string
  section: string
  // Metadata
  notes?: string
  createdAt: Date
  updatedAt: Date
}

// ─── Stock Snapshot ────────────��──────────────────────────────────────────
export interface StockSnapshot {
  id?: number
  productId: number
  barcode: string
  qoh: number
  importedAt: Date
  source: 'item_maintenance' | 'item_stock_report' | 'jarvis_sync'
  importBatchId: string
}

// ─── Sales Record ─────────��───────────────────────────���───────────────────
export interface SalesRecord {
  id?: number
  productId?: number
  barcode: string
  date: string
  qtySold: number
  salesValue: number
  cogs: number
  department?: string
  importBatchId: string
  importedAt: Date
}

// ─── Promotion ──────────���─────────────────────────────────���───────────────
export interface Promotion {
  id?: number
  productId?: number
  barcode: string
  productName: string
  startDate: string
  endDate: string
  promoPrice: number
  normalPrice: number
  promoType: 'price_reduction' | 'multibuy' | 'special' | 'host' | 'tpr'
  multibuyQty?: number
  multibuyPrice?: number
  notes?: string
  createdAt: Date
}

// ─── Expiry Batch ────���────────────────────────────���───────────────────────
export interface ExpiryBatch {
  id?: number
  barcode: string
  itemCode: string
  productName: string
  department: string
  expiryDate: string
  qtyReceived: number
  qtyRemaining: number
  status: 'active' | 'sold' | 'wasted' | 'claimed' | 'extended'
  location?: string
  receivedDate: string
  notes?: string
  createdAt: Date
  updatedAt: Date
}

// ─── Waste Log ──────────��────────────────────────────────��────────────────
export interface WasteLogEntry {
  id?: number
  batchId: number
  barcode: string
  itemCode: string
  productName: string
  department: string
  qty: number
  costPrice: number
  sellPrice: number
  reason: 'expired' | 'damaged' | 'quality' | 'recall' | 'other'
  claimable: boolean
  claimStatus: 'none' | 'pending' | 'submitted' | 'approved' | 'rejected'
  claimAmount?: number
  loggedAt: Date
  notes?: string
}

// ─── Tracked Item (Price Changes) ─────────────────────────────────────────
export interface TrackedItem {
  id?: number
  itemCode: string
  barcode: string | null
  description: string
  department: string
  originalPrice: number
  newPrice: number
  changeDate: string
  reason: 'promo' | 'markdown' | 'cost_increase' | 'competitor_match' | 'error_correction' | 'other'
  notes: string
  tags?: string[]
  status: 'pending' | 'confirmed' | 'failed' | 'reverted'
  syncStatus: 'local' | 'syncing' | 'synced' | 'error'
  syncError?: string
  currentPrice: number | null
  revertedAt: string | null
  sortOrder?: number
  createdAt: Date
}

// ─── Tracked Promo ────────���───────────────────────────────────────��───────
export interface TrackedPromo {
  id?: number
  itemCode: string
  barcode: string | null
  description: string
  department: string
  normalPrice: number
  promoPrice: number
  promoUnitCost: number | null
  normalUnitCost: number
  ctnQty: number
  discountPercent: number
  marginPercent: number
  costSavingPercent: number | null
  startDate: string
  endDate: string
  daysLeft: number
  notes: string
  tags?: string[]
  source: 'system' | 'manual'
  status: 'active' | 'ended' | 'completed'
  sortOrder?: number
  createdAt: Date
}

// ─── Import Log ─────────────────────────────────────���─────────────────────
export interface ImportLogEntry {
  id?: number
  importedAt: Date
  type: 'item_maintenance' | 'stock_report' | 'sales' | 'expiry_batches'
  fileName: string
  recordCount: number
  anomalyCount: number
}

// ─── Insight (AI-generated intelligence) ─────────────────────────────────
export type InsightType = 'waste' | 'competitor' | 'opportunity' | 'lifecycle' | 'forecast' | 'anomaly' | 'price' | 'trend'

export interface Insight {
  id?: number
  type: InsightType
  title: string
  body: string
  source: 'ai' | 'serper' | 'gmail' | 'system'
  estimatedImpact?: number
  status: 'unread' | 'read' | 'actioned' | 'dismissed'
  actions: { label: string; variant: 'primary' | 'secondary'; handler: string }[]
  relatedProducts?: string[]
  createdAt: string
  expiresAt?: string
}

// ─── Calendar Event ──────────────────────────────────────────────────────
export type CalendarEventType = 'delivery-direct' | 'delivery-alm' | 'order-cutoff' | 'holiday' | 'forecast' | 'custom'

export interface CalendarEvent {
  id?: number
  date: string
  time?: string
  endTime?: string
  title: string
  description?: string
  type: CalendarEventType
  supplier?: string
  source: 'manual' | 'gmail' | 'system' | 'recurring'
  recurrence?: { frequency: 'weekly' | 'fortnightly'; dayOfWeek: number }
  metadata?: { lineCount?: number; dollarTotal?: number; unitCount?: number; forecastRevenue?: number }
  createdAt: string
}

// ─── Gmail Extraction ────────────────────────────────────────────────────
export interface GmailExtraction {
  id?: number
  gmailMessageId: string
  from: string
  subject: string
  receivedAt: string
  supplier: string
  extractionType: 'delivery' | 'order-confirmation' | 'short-delivery' | 'short-date' | 'cutoff-reminder' | 'general'
  extractedData: {
    deliveryDate?: string
    itemCount?: number
    dollarTotal?: number
    shortItems?: { productName: string; barcode?: string; orderedQty: number; deliveredQty: number; reason?: string }[]
    shortDatedItems?: { productName: string; barcode?: string; expectedExpiry: string; actualExpiry: string; daysShort: number }[]
    orderCutoff?: string
    orderNumber?: string
  }
  status: 'auto-detected' | 'confirmed' | 'dismissed'
  calendarEventId?: number
  createdAt: string
}

// ─── Supplier ────────────────────────────────────────────────────────────
export interface Supplier {
  id?: number
  name: string
  type: 'direct' | 'alm' | 'metcash'
  emailPatterns: string[]
  deliveryDays: number[]
  orderCutoff?: { dayOfWeek: number; time: string; leadTimeDays: number }
  color: string
  active: boolean
  createdAt: string
}

// ─── Quick Action Log ────────────────────────────────────────────────────
export interface QuickActionLogEntry {
  id?: number
  actionType: 'price-change' | 'stock-adjust' | 'expiry-batch' | 'waste-log' | 'label-print' | 'price-check'
  barcode: string
  productName: string
  details: Record<string, unknown>
  syncStatus: 'pending' | 'synced' | 'failed'
  performedBy?: string
  performedAt: string
}

// ─── Stock Performance ────────────��───────────────────────────────────────
export interface StockPerformance {
  productId: number
  velocity: number
  daysOfStock: number | null
  gmroi: number | null
  trend: number
  abcClass: 'A' | 'B' | 'C' | 'D'
  xyzClass: 'X' | 'Y' | 'Z'
  shrinkage: number
}

// ─── Promo ROI Cache ──────────────────────────────────────────────────────
export interface PromoROICacheEntry {
  id?: number
  itemCode: string
  promoStart: string
  promoEnd: string
  result: import('./promoROI').PromoROIResult
  computedAt: Date
}
