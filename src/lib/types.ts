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
