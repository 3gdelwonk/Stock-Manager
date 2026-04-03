import { useState, useEffect, useCallback, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { checkConnection, getStockLevels, type StockItem } from './jarvis'
import { getLatestQoh, classifyABC, classifyXYZ, computePerformance, needsReplenishment } from './analytics'
import { LEAD_TIME_DEFAULT } from './constants'
import type { Product, StockPerformance, StockSnapshot, SalesRecord } from './types'
import type { EnrichedProduct } from '../components/ProductRow'
import { useTrackedItemCodes } from './useTrackedItems'

export function useEnrichedProducts(): {
  products: Product[] | undefined
  enriched: EnrichedProduct[]
  liveConnected: boolean | null
  liveLoading: boolean
  refreshLiveStock: () => void
} {
  // ── Dexie data ──
  const products = useLiveQuery(() => db.products.toArray(), [])
  const snapshots = useLiveQuery(() => db.stockSnapshots.toArray(), [])
  const salesRecords = useLiveQuery(() => db.salesRecords.toArray(), [])
  const promotions = useLiveQuery(() => db.promotions.toArray(), [])

  // ── Live stock from API ──
  const [liveStock, setLiveStock] = useState<StockItem[] | null>(null)
  const [liveConnected, setLiveConnected] = useState<boolean | null>(null)
  const [liveLoading, setLiveLoading] = useState(false)

  const fetchLiveStock = useCallback(async () => {
    setLiveLoading(true)
    try {
      const conn = await checkConnection()
      setLiveConnected(conn.connected)
      if (conn.connected) {
        const stock = await getStockLevels({ limit: 5000 })
        setLiveStock(stock)
      }
    } catch {
      setLiveConnected(false)
    } finally {
      setLiveLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLiveStock()
    const id = setInterval(fetchLiveStock, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [fetchLiveStock])

  // ── Build live stock lookup ──
  const liveStockMap = useMemo(() => {
    const map = new Map<string, StockItem>()
    if (liveStock) {
      for (const item of liveStock) map.set(item.itemCode, item)
    }
    return map
  }, [liveStock])

  // ── Tracked item codes ──
  const trackedItemCodes = useTrackedItemCodes()

  // ── Compute performance ──
  const perfData = useMemo(() => {
    if (!products || !snapshots || !salesRecords) return null
    const latestQoh = getLatestQoh(snapshots as StockSnapshot[])
    const abcMap = classifyABC(products, salesRecords as SalesRecord[])
    const xyzMap = classifyXYZ(products, salesRecords as SalesRecord[])
    const perfMap = new Map<number, StockPerformance>()
    for (const p of products) {
      if (p.id === undefined) continue
      perfMap.set(p.id, computePerformance(p, {
        snapshots: snapshots as StockSnapshot[],
        salesRecords: salesRecords as SalesRecord[],
        abcClass: abcMap.get(p.id) ?? 'D',
        xyzClass: xyzMap.get(p.id) ?? 'Z',
      }))
    }
    return { latestQoh, abcMap, xyzMap, perfMap }
  }, [products, snapshots, salesRecords])

  // ── Active promos ──
  const activePromoIds = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const ids = new Set<number>()
    if (promotions) {
      for (const p of promotions) {
        if (p.startDate <= today && p.endDate >= today && p.productId) ids.add(p.productId)
      }
    }
    return ids
  }, [promotions])

  // ── Enrich all products (no search/filter/sort) ──
  const enriched = useMemo((): EnrichedProduct[] => {
    if (!products) return []
    const latestQoh = perfData?.latestQoh ?? new Map<number, number>()
    const perfMap = perfData?.perfMap ?? new Map<number, StockPerformance>()

    return products.map((product): EnrichedProduct => {
      const live = liveStockMap.get(product.itemCode)
      const perf = product.id ? perfMap.get(product.id) ?? null : null
      const localQoh = product.id ? latestQoh.get(product.id) : undefined
      const liveQoh = live?.onHand
      const effectiveQoh = liveQoh ?? localQoh
      const vel = (live?.avgDayQty ?? null) !== null ? live!.avgDayQty! : (perf?.velocity ?? 0)

      return {
        product,
        localQoh,
        liveQoh,
        liveVelocity: live?.avgDayQty ?? 0,
        onOrder: live?.onOrder ?? 0,
        reorderLevel: live?.reorderLevel ?? product.minStockLevel,
        perf,
        activePromo: !!product.id && activePromoIds.has(product.id),
        isTracked: trackedItemCodes.has(product.itemCode),
        reorder: needsReplenishment(effectiveQoh ?? null, vel, LEAD_TIME_DEFAULT),
        // expiryInfo left undefined — filled in by consumer via useProductExpiry
      }
    })
  }, [products, perfData, liveStockMap, activePromoIds, trackedItemCodes])

  return {
    products,
    enriched,
    liveConnected,
    liveLoading,
    refreshLiveStock: fetchLiveStock,
  }
}
