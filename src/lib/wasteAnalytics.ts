import { db } from './db'
import type { WasteLogEntry } from './types'

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function isoDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function daysAgo(n: number): Date {
  const d = startOfDay(new Date())
  d.setDate(d.getDate() - n)
  return d
}

// ─── Waste in a date range ───────────────────────────────────────────────────

async function wasteInRange(from: Date, to: Date): Promise<WasteLogEntry[]> {
  return db.wasteLog
    .where('loggedAt')
    .between(from, to, true, true)
    .toArray()
}

// ─── Daily Summary ───────────────────────────────────────────────────────────

export interface WasteDailySummary {
  date: string
  totalItems: number
  totalCost: number
  totalSell: number
  byDepartment: Record<string, { count: number; cost: number }>
  byReason: Record<string, { count: number; cost: number }>
}

export async function getWasteDailySummary(date: string): Promise<WasteDailySummary> {
  const dayStart = new Date(date + 'T00:00:00')
  const dayEnd = new Date(date + 'T23:59:59.999')
  const entries = await wasteInRange(dayStart, dayEnd)

  const byDepartment: Record<string, { count: number; cost: number }> = {}
  const byReason: Record<string, { count: number; cost: number }> = {}
  let totalItems = 0, totalCost = 0, totalSell = 0

  for (const e of entries) {
    const cost = e.qty * e.costPrice
    const sell = e.qty * e.sellPrice
    totalItems += e.qty
    totalCost += cost
    totalSell += sell

    if (!byDepartment[e.department]) byDepartment[e.department] = { count: 0, cost: 0 }
    byDepartment[e.department].count += e.qty
    byDepartment[e.department].cost += cost

    if (!byReason[e.reason]) byReason[e.reason] = { count: 0, cost: 0 }
    byReason[e.reason].count += e.qty
    byReason[e.reason].cost += cost
  }

  return { date, totalItems, totalCost, totalSell, byDepartment, byReason }
}

// ─── Weekly Summary ──────────────────────────────────────────────────────────

export async function getWasteWeeklySummary(weekStartDate: string): Promise<WasteDailySummary> {
  const start = new Date(weekStartDate + 'T00:00:00')
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  const entries = await wasteInRange(start, end)

  const byDepartment: Record<string, { count: number; cost: number }> = {}
  const byReason: Record<string, { count: number; cost: number }> = {}
  let totalItems = 0, totalCost = 0, totalSell = 0

  for (const e of entries) {
    const cost = e.qty * e.costPrice
    const sell = e.qty * e.sellPrice
    totalItems += e.qty
    totalCost += cost
    totalSell += sell

    if (!byDepartment[e.department]) byDepartment[e.department] = { count: 0, cost: 0 }
    byDepartment[e.department].count += e.qty
    byDepartment[e.department].cost += cost

    if (!byReason[e.reason]) byReason[e.reason] = { count: 0, cost: 0 }
    byReason[e.reason].count += e.qty
    byReason[e.reason].cost += cost
  }

  return { date: weekStartDate, totalItems, totalCost, totalSell, byDepartment, byReason }
}

// ─── Waste Trend (daily data points) ─────────────────────────────────────────

export interface WasteTrendPoint {
  date: string
  costValue: number
  sellValue: number
  count: number
}

export async function getWasteTrend(days: number): Promise<WasteTrendPoint[]> {
  const from = daysAgo(days - 1)
  const to = new Date()
  to.setHours(23, 59, 59, 999)
  const entries = await wasteInRange(from, to)

  const byDate: Record<string, { costValue: number; sellValue: number; count: number }> = {}
  for (let i = 0; i < days; i++) {
    const d = new Date(from)
    d.setDate(d.getDate() + i)
    byDate[isoDate(d)] = { costValue: 0, sellValue: 0, count: 0 }
  }

  for (const e of entries) {
    const key = isoDate(e.loggedAt)
    if (byDate[key]) {
      byDate[key].costValue += e.qty * e.costPrice
      byDate[key].sellValue += e.qty * e.sellPrice
      byDate[key].count += e.qty
    }
  }

  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }))
}

// ─── Waste Velocity ──────────────────────────────────────────────────────────

export interface WasteVelocity {
  avgCostPerDay: number
  avgItemsPerDay: number
  currentPeriodCost: number
  previousPeriodCost: number
  trendPercent: number
  trendDirection: 'up' | 'down' | 'flat'
  wasteOfSalesPercent: number | null
}

export async function getWasteVelocity(windowDays: number): Promise<WasteVelocity> {
  const now = new Date()
  now.setHours(23, 59, 59, 999)

  const currentStart = daysAgo(windowDays - 1)
  const prevStart = daysAgo(windowDays * 2 - 1)

  const current = await wasteInRange(currentStart, now)
  const previous = await wasteInRange(prevStart, new Date(currentStart.getTime() - 1))

  const currentCost = current.reduce((s, e) => s + e.qty * e.costPrice, 0)
  const previousCost = previous.reduce((s, e) => s + e.qty * e.costPrice, 0)
  const currentItems = current.reduce((s, e) => s + e.qty, 0)

  const trendPercent = previousCost > 0
    ? ((currentCost - previousCost) / previousCost) * 100
    : currentCost > 0 ? 100 : 0

  let wasteOfSalesPercent: number | null = null
  try {
    const salesFrom = currentStart.toISOString().split('T')[0]
    const salesTo = isoDate(now)
    const sales = await db.salesRecords
      .where('date').between(salesFrom, salesTo, true, true)
      .toArray()
    const totalSalesValue = sales.reduce((s, r) => s + r.salesValue, 0)
    if (totalSalesValue > 0) {
      wasteOfSalesPercent = (currentCost / totalSalesValue) * 100
    }
  } catch { /* sales data may not exist */ }

  return {
    avgCostPerDay: windowDays > 0 ? currentCost / windowDays : 0,
    avgItemsPerDay: windowDays > 0 ? currentItems / windowDays : 0,
    currentPeriodCost: currentCost,
    previousPeriodCost: previousCost,
    trendPercent,
    trendDirection: Math.abs(trendPercent) < 5 ? 'flat' : trendPercent > 0 ? 'up' : 'down',
    wasteOfSalesPercent,
  }
}

// ─── Top Wasted Products ─────────────────────────────────────────────────────

export interface TopWastedProduct {
  barcode: string
  productName: string
  department: string
  totalQty: number
  totalCost: number
  occurrences: number
}

export async function getTopWastedProducts(days: number, limit = 10): Promise<TopWastedProduct[]> {
  const entries = await wasteInRange(daysAgo(days - 1), new Date())

  const map: Record<string, TopWastedProduct> = {}
  for (const e of entries) {
    const key = e.barcode || e.productName
    if (!map[key]) {
      map[key] = { barcode: e.barcode, productName: e.productName, department: e.department, totalQty: 0, totalCost: 0, occurrences: 0 }
    }
    map[key].totalQty += e.qty
    map[key].totalCost += e.qty * e.costPrice
    map[key].occurrences++
  }

  return Object.values(map)
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, limit)
}

// ─── Waste by Reason ─────────────────────────────────────────────────────────

export async function getWasteByReason(days: number): Promise<{ reason: string; count: number; cost: number }[]> {
  const entries = await wasteInRange(daysAgo(days - 1), new Date())

  const map: Record<string, { count: number; cost: number }> = {}
  for (const e of entries) {
    if (!map[e.reason]) map[e.reason] = { count: 0, cost: 0 }
    map[e.reason].count += e.qty
    map[e.reason].cost += e.qty * e.costPrice
  }

  return Object.entries(map)
    .map(([reason, v]) => ({ reason, ...v }))
    .sort((a, b) => b.cost - a.cost)
}

// ─── Waste entries for a period ──────────────────────────────────────────────

export async function getWasteEntries(days: number): Promise<WasteLogEntry[]> {
  const from = daysAgo(days - 1)
  return db.wasteLog
    .where('loggedAt')
    .aboveOrEqual(from)
    .reverse()
    .sortBy('loggedAt')
}
