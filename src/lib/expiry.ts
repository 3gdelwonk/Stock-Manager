import { db } from './db'
import type { ExpiryBatch, WasteLogEntry } from './types'
import { EXPIRY_RED_DAYS, EXPIRY_AMBER_DAYS } from './constants'

// ─── Expiry Status Helpers ────────────────────────────────────────────────────

export type ExpiryUrgency = 'expired' | 'red' | 'amber' | 'green'

export function getExpiryUrgency(expiryDate: string): ExpiryUrgency {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(expiryDate + 'T00:00:00')
  const diffMs = expiry.getTime() - today.getTime()
  const daysLeft = Math.ceil(diffMs / 86400000)
  if (daysLeft < 0) return 'expired'
  if (daysLeft <= EXPIRY_RED_DAYS) return 'red'
  if (daysLeft <= EXPIRY_AMBER_DAYS) return 'amber'
  return 'green'
}

export function daysUntilExpiry(expiryDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(expiryDate + 'T00:00:00')
  return Math.ceil((expiry.getTime() - today.getTime()) / 86400000)
}

// ─── FIFO Query ───────────────────────────────────────────────────────────

export async function getActiveBatchesFIFO(
  filters?: { barcode?: string; department?: string },
): Promise<ExpiryBatch[]> {
  const batches = await db.expiryBatches.where('status').equals('active').toArray()

  let filtered = batches
  if (filters?.barcode) {
    filtered = filtered.filter(b => b.barcode === filters.barcode)
  }
  if (filters?.department) {
    filtered = filtered.filter(b => b.department === filters.department)
  }

  return filtered.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
}

// ─── Add Batch ────────────────────────────────────────────────────────────

export async function addExpiryBatch(
  batch: Omit<ExpiryBatch, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<number> {
  const now = new Date()
  return db.expiryBatches.add({
    ...batch,
    createdAt: now,
    updatedAt: now,
  } as ExpiryBatch) as Promise<number>
}

// ─── Mark as Waste ────────────────────────────────────────────────────────

export async function markAsWaste(
  batchId: number,
  qty: number,
  reason: WasteLogEntry['reason'],
  costPrice: number,
  sellPrice: number,
  claimable: boolean,
  notes?: string,
): Promise<void> {
  await db.transaction('rw', [db.expiryBatches, db.wasteLog], async () => {
    const batch = await db.expiryBatches.get(batchId)
    if (!batch) throw new Error('Batch not found')

    const newRemaining = batch.qtyRemaining - qty
    await db.expiryBatches.update(batchId, {
      qtyRemaining: Math.max(0, newRemaining),
      status: newRemaining <= 0 ? 'wasted' : 'active',
      updatedAt: new Date(),
    })

    await db.wasteLog.add({
      batchId,
      barcode: batch.barcode,
      itemCode: batch.itemCode,
      productName: batch.productName,
      department: batch.department,
      qty,
      costPrice,
      sellPrice,
      reason,
      claimable,
      claimStatus: claimable ? 'pending' : 'none',
      loggedAt: new Date(),
      notes,
    } as WasteLogEntry)
  })
}

// ─── Mark as Sold ─────────────────────────────────────────────────────────

export async function markAsSold(batchId: number, qty: number): Promise<void> {
  const batch = await db.expiryBatches.get(batchId)
  if (!batch) throw new Error('Batch not found')
  const newRemaining = batch.qtyRemaining - qty
  await db.expiryBatches.update(batchId, {
    qtyRemaining: Math.max(0, newRemaining),
    status: newRemaining <= 0 ? 'sold' : 'active',
    updatedAt: new Date(),
  })
}

// ─── Mark as Claimed ──────────────────────────────────────────────────────

export async function markAsClaimed(batchId: number): Promise<void> {
  const batch = await db.expiryBatches.get(batchId)
  if (!batch) throw new Error('Batch not found')
  await db.expiryBatches.update(batchId, {
    status: 'claimed',
    updatedAt: new Date(),
  })
  // Update any pending waste log entries for this batch to submitted
  const wasteEntries = await db.wasteLog.where('batchId').equals(batchId).toArray()
  for (const entry of wasteEntries) {
    if (entry.claimStatus === 'pending' && entry.id) {
      await db.wasteLog.update(entry.id, { claimStatus: 'submitted' })
    }
  }
}

// ─── Extend Expiry ────────────────────────────────────────────────────────

export async function extendExpiry(batchId: number, newDate: string): Promise<void> {
  await db.expiryBatches.update(batchId, {
    expiryDate: newDate,
    updatedAt: new Date(),
  })
}

// ─── Dashboard Summary ────────────────────────────────────────────────────

export interface ExpirySummary {
  expiredCount: number
  redCount: number
  amberCount: number
  greenCount: number
  totalActiveBatches: number
  wasteValueThisMonth: number
}

export async function getExpirySummary(): Promise<ExpirySummary> {
  const active = await db.expiryBatches.where('status').equals('active').toArray()
  let expired = 0, red = 0, amber = 0, green = 0
  for (const b of active) {
    const u = getExpiryUrgency(b.expiryDate)
    if (u === 'expired') expired++
    else if (u === 'red') red++
    else if (u === 'amber') amber++
    else green++
  }

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const wasteThisMonth = await db.wasteLog
    .where('loggedAt').aboveOrEqual(monthStart).toArray()
  const wasteValue = wasteThisMonth.reduce((s, w) => s + w.qty * w.costPrice, 0)

  return {
    expiredCount: expired,
    redCount: red,
    amberCount: amber,
    greenCount: green,
    totalActiveBatches: active.length,
    wasteValueThisMonth: wasteValue,
  }
}
