import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'

export function useProductCodeLookup() {
  const products = useLiveQuery(() => db.products.toArray(), [])

  return useMemo(() => {
    const byBarcode = new Map<string, { orderCode: string; barcode: string }>()
    const codeToBarcode = new Map<string, string>()

    if (products) {
      for (const p of products) {
        const orderCode = p.itemCode || ''
        byBarcode.set(p.barcode, { orderCode, barcode: p.barcode })
        if (p.itemCode) codeToBarcode.set(p.itemCode.toLowerCase(), p.barcode)
      }
    }

    return {
      getOrderCode(barcode: string | null | undefined): string | null {
        if (!barcode) return null
        return byBarcode.get(barcode)?.orderCode || null
      },

      resolveCode(code: string): string {
        if (byBarcode.has(code)) return code
        const bc = codeToBarcode.get(code.toLowerCase())
        return bc || code
      },

      ready: !!products,
    }
  }, [products])
}
