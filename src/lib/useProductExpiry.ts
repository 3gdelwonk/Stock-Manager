import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { getExpiryUrgency } from './expiry'

export interface ExpiryInfo {
  totalItems: number
  batches: { date: string; qty: number }[]
  nearestExpiry: string | null
  urgency: 'expired' | 'red' | 'amber' | 'green' | null
}

export function useProductExpiry(): Map<string, ExpiryInfo> {
  const activeBatches = useLiveQuery(
    () => db.expiryBatches.where('status').equals('active').filter(b => b.department !== 'liquor').toArray(),
    [],
  )

  return useMemo(() => {
    const map = new Map<string, ExpiryInfo>()
    if (!activeBatches) return map

    // Group batches by barcode
    const grouped = new Map<string, typeof activeBatches>()
    for (const batch of activeBatches) {
      const existing = grouped.get(batch.barcode)
      if (existing) {
        existing.push(batch)
      } else {
        grouped.set(batch.barcode, [batch])
      }
    }

    for (const [barcode, batches] of grouped) {
      const totalItems = batches.reduce((sum, b) => sum + b.qtyRemaining, 0)

      const batchList = batches
        .map(b => ({ date: b.expiryDate, qty: b.qtyRemaining }))
        .sort((a, b) => a.date.localeCompare(b.date))

      // Find nearest (earliest) expiry date
      let nearestExpiry: string | null = null
      for (const b of batches) {
        if (nearestExpiry === null || b.expiryDate < nearestExpiry) {
          nearestExpiry = b.expiryDate
        }
      }

      const urgency = nearestExpiry ? getExpiryUrgency(nearestExpiry) : null

      map.set(barcode, {
        totalItems,
        batches: batchList,
        nearestExpiry,
        urgency,
      })
    }

    return map
  }, [activeBatches])
}
