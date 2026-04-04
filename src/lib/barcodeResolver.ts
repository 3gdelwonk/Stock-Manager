import { db, type BarcodeAlias } from './db'
import { searchItems, type StockItem } from './jarvis'

export interface ResolvedBarcode {
  itemCode: string
  primaryBarcode: string
  description: string
  scannedBarcode: string
  isAlias: boolean
}

/**
 * Resolve a scanned barcode to its item, checking aliases first,
 * then falling back to API search and caching the result.
 */
export async function resolveBarcode(
  scannedBarcode: string,
  stockItems?: StockItem[],
): Promise<ResolvedBarcode | null> {
  const code = scannedBarcode.trim().replace(/[^0-9]/g, '')
  if (!code) return null

  // 1. Check if it's already a known primary barcode in stock data
  if (stockItems) {
    const direct = stockItems.find(s => s.barcode === code || s.barcode === scannedBarcode.trim())
    if (direct) {
      return {
        itemCode: direct.itemCode,
        primaryBarcode: direct.barcode || code,
        description: direct.description,
        scannedBarcode: code,
        isAlias: false,
      }
    }
  }

  // 2. Check barcode aliases table
  const alias = await db.barcodeAliases.get(code)
  if (alias) {
    return {
      itemCode: alias.itemCode,
      primaryBarcode: alias.primaryBarcode,
      description: alias.description,
      scannedBarcode: code,
      isAlias: true,
    }
  }

  // 3. Fall back to API search
  try {
    const result = await searchItems(code, 1)
    if (result.items && result.items.length > 0) {
      const item = result.items[0]
      const primaryBarcode = item.barcode || code

      // If the scanned barcode differs from what the API considers primary,
      // save it as an alias
      if (primaryBarcode !== code) {
        await saveAlias(code, item.itemCode, primaryBarcode, item.description)
      }

      return {
        itemCode: item.itemCode,
        primaryBarcode,
        description: item.description,
        scannedBarcode: code,
        isAlias: primaryBarcode !== code,
      }
    }
  } catch { /* API unavailable */ }

  return null
}

/** Save a barcode alias mapping */
export async function saveAlias(
  barcode: string,
  itemCode: string,
  primaryBarcode: string,
  description: string,
): Promise<void> {
  await db.barcodeAliases.put({
    barcode,
    itemCode,
    primaryBarcode,
    description,
    createdAt: new Date(),
  })
}

/** Get all aliases for an item */
export async function getAliasesForItem(itemCode: string): Promise<BarcodeAlias[]> {
  return db.barcodeAliases.where('itemCode').equals(itemCode).toArray()
}

/** Change which barcode is primary for an item. Updates all aliases. */
export async function setPrimaryBarcode(
  itemCode: string,
  newPrimary: string,
): Promise<void> {
  const aliases = await db.barcodeAliases.where('itemCode').equals(itemCode).toArray()

  await db.transaction('rw', db.barcodeAliases, async () => {
    for (const alias of aliases) {
      await db.barcodeAliases.update(alias.barcode, { primaryBarcode: newPrimary })
    }

    // If the new primary isn't in the aliases table yet, no need to add it
    // (it's the stock endpoint's barcode). But if the old primary was in aliases,
    // make sure it points to the new one too.
  })
}
