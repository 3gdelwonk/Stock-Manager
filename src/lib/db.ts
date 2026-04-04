import Dexie, { type EntityTable } from 'dexie'
import type {
  Product, StockSnapshot, SalesRecord, Promotion,
  ExpiryBatch, WasteLogEntry, TrackedItem, TrackedPromo, ImportLogEntry,
  PromoROICacheEntry, Insight, CalendarEvent, GmailExtraction, Supplier,
  QuickActionLogEntry,
} from './types'

export interface ImageCacheEntry {
  itemCode: string
  imageUrl: string
  fetchedAt: Date
}

export interface SerperSearchedEntry {
  itemCode: string
}

class GroceryManagerDB extends Dexie {
  products!: EntityTable<Product, 'id'>
  stockSnapshots!: EntityTable<StockSnapshot, 'id'>
  salesRecords!: EntityTable<SalesRecord, 'id'>
  promotions!: EntityTable<Promotion, 'id'>
  expiryBatches!: EntityTable<ExpiryBatch, 'id'>
  wasteLog!: EntityTable<WasteLogEntry, 'id'>
  trackedItems!: EntityTable<TrackedItem, 'id'>
  trackedPromos!: EntityTable<TrackedPromo, 'id'>
  importLog!: EntityTable<ImportLogEntry, 'id'>
  imageCache!: EntityTable<ImageCacheEntry, 'itemCode'>
  promoROICache!: EntityTable<PromoROICacheEntry, 'id'>
  serperSearched!: EntityTable<SerperSearchedEntry, 'itemCode'>
  insights!: EntityTable<Insight, 'id'>
  calendarEvents!: EntityTable<CalendarEvent, 'id'>
  gmailExtractions!: EntityTable<GmailExtraction, 'id'>
  suppliers!: EntityTable<Supplier, 'id'>
  quickActionLog!: EntityTable<QuickActionLogEntry, 'id'>

  constructor() {
    super('GroceryManagerDB')
    this.version(1).stores({
      products:       '++id, barcode, itemCode, department, departmentCode, active, aisle, section',
      stockSnapshots: '++id, [productId+importedAt], barcode, importBatchId',
      salesRecords:   '++id, barcode, date, [barcode+date], productId, importBatchId',
      promotions:     '++id, productId, barcode, startDate, endDate',
      expiryBatches:  '++id, barcode, itemCode, expiryDate, status, department, [status+expiryDate]',
      wasteLog:       '++id, batchId, barcode, loggedAt, claimStatus, department',
      trackedItems:   '++id, itemCode, status, changeDate, syncStatus',
      trackedPromos:  '++id, itemCode, status, startDate, endDate, source',
      importLog:      '++id, importedAt, type',
      imageCache:     'itemCode, fetchedAt',
    })
    this.version(2).stores({
      promoROICache:  '++id, itemCode, [itemCode+promoStart]',
    })
    this.version(3).stores({
      serperSearched: 'itemCode',
    })
    this.version(4).stores({
      insights:          '++id, type, status, createdAt',
      calendarEvents:    '++id, date, type, supplier, source',
      gmailExtractions:  '++id, gmailMessageId, supplier, extractionType, status, receivedAt',
      suppliers:         '++id, name, type',
      quickActionLog:    '++id, actionType, barcode, performedAt, syncStatus',
    })
  }
}

export const db = new GroceryManagerDB()

export async function clearAllData(): Promise<void> {
  await db.transaction('rw', [
    db.products, db.stockSnapshots, db.salesRecords, db.promotions,
    db.expiryBatches, db.wasteLog, db.trackedItems, db.trackedPromos,
    db.importLog, db.imageCache, db.promoROICache, db.serperSearched,
    db.insights, db.calendarEvents, db.gmailExtractions, db.suppliers, db.quickActionLog,
  ], async () => {
    await Promise.all([
      db.products.clear(), db.stockSnapshots.clear(), db.salesRecords.clear(),
      db.promotions.clear(), db.expiryBatches.clear(), db.wasteLog.clear(),
      db.trackedItems.clear(), db.trackedPromos.clear(), db.importLog.clear(),
      db.imageCache.clear(), db.promoROICache.clear(), db.serperSearched.clear(),
      db.insights.clear(), db.calendarEvents.clear(), db.gmailExtractions.clear(),
      db.suppliers.clear(), db.quickActionLog.clear(),
    ])
  })
}
