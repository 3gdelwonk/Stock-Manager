// ═══════════════════════════════════════════════
// Product Image Service — Grocery Manager
// Priority: local IndexedDB cache → JARVISmart server DB → Serper via JARVISmart proxy
// ═══════════════════════════════════════════════

import { db } from './db'
import { serverImageSearchBest, serverImageSearchMulti, canUseSerper, markSerperSearched } from './serper'

// ── Config helpers ──────────────────────────────────────────────────────────

function getJarvisBaseUrl(): string {
  return localStorage.getItem('grocery-manager-jarvis-url') || (import.meta.env.VITE_JARVIS_URL as string) || 'https://api.jarvismart196410.uk'
}
function getJarvisApiKey(): string {
  return localStorage.getItem('grocery-manager-jarvis-key') || (import.meta.env.VITE_JARVIS_API_KEY as string) || 'jmart_sk_7f3a9c2e1b4d8f6a0e5c3b9d'
}

export function isImageSearchConfigured(): boolean {
  return !!getJarvisBaseUrl()
}

// ── JARVISmart image endpoints ──────────────────────────────────────────────

async function getJarvisImage(itemCode: string): Promise<string | null> {
  try {
    const res = await fetch(`${getJarvisBaseUrl()}/api/pos/image/${encodeURIComponent(itemCode)}`, {
      headers: { 'X-API-Key': getJarvisApiKey() },
    })
    if (!res.ok) return null
    const data: { imageUrl?: string } = await res.json()
    return data.imageUrl || null
  } catch { return null }
}

async function pushImageToJarvis(itemCode: string, imageUrl: string): Promise<void> {
  try {
    await fetch(`${getJarvisBaseUrl()}/api/pos/image/${encodeURIComponent(itemCode)}`, {
      method: 'PUT',
      headers: { 'X-API-Key': getJarvisApiKey(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl }),
    })
  } catch { /* best-effort */ }
}

// ── Query building ────────────────────────────────────────────────────────

function cleanDescription(desc: string): string {
  let clean = desc
  clean = clean.replace(/\d+[*xX]?\d*\s*ML\b/gi, '').replace(/\d+\s*L\b/gi, '')
  clean = clean.replace(/\d+\s*(S|PK|X)\b/gi, '')
  clean = clean.replace(/\d+\s*(GM|KG|G)\b/gi, '')
  clean = clean.replace(/[*#&]/g, '').replace(/\s+/g, ' ').trim()
  return clean
}

function buildSearchQuery(description: string, _department: string, barcode?: string | null): string {
  if (barcode) return `${barcode} product`
  return `${cleanDescription(description)} product`
}

// ── Cache helpers ───────────────────────────────────────────────────────────

export async function getCachedImageUrl(itemCode: string): Promise<string | null> {
  const entry = await db.imageCache.get(itemCode)
  return entry?.imageUrl ?? null
}

export async function deleteCachedImage(itemCode: string): Promise<void> {
  await db.imageCache.delete(itemCode)
}

// ── Fetch & cache (used by single refetch + manual picker) ───────────────
// Server-side Serper via JARVISmart proxy. No client-side API keys.

export async function fetchAndCacheImage(
  itemCode: string, description: string, department: string,
  barcode?: string | null,
): Promise<{ url: string | null; allErrored: boolean }> {
  try {
    const cached = await getCachedImageUrl(itemCode)
    if (cached !== null) return { url: cached || null, allErrored: false }

    // 1. Check JARVISmart server DB (pre-populated images)
    const jarvisUrl = await getJarvisImage(itemCode)
    if (jarvisUrl) {
      await db.imageCache.put({ itemCode, imageUrl: jarvisUrl, fetchedAt: new Date() })
      window.dispatchEvent(new CustomEvent('image-cached', { detail: { itemCode, imageUrl: jarvisUrl } }))
      return { url: jarvisUrl, allErrored: false }
    }

    // 2. Serper image search via JARVISmart proxy (budget-gated)
    if (!canUseSerper('images')) {
      return { url: null, allErrored: true }
    }

    let imageUrl: string | null = null
    let anySearchWorked = false

    const r = await serverImageSearchBest(buildSearchQuery(description, department))
    if (r !== 'error') { anySearchWorked = true; if (r) imageUrl = r }

    // Barcode retry if first attempt found nothing
    if (!imageUrl && barcode) {
      const r2 = await serverImageSearchBest(buildSearchQuery(description, department, barcode))
      if (r2 !== 'error') { anySearchWorked = true; if (r2) imageUrl = r2 }
    }

    // Mark as Serper-searched regardless of result
    await markSerperSearched(itemCode)

    if (imageUrl) {
      await db.imageCache.put({ itemCode, imageUrl, fetchedAt: new Date() })
      pushImageToJarvis(itemCode, imageUrl)
      window.dispatchEvent(new CustomEvent('image-cached', { detail: { itemCode, imageUrl } }))
      return { url: imageUrl, allErrored: false }
    }

    if (anySearchWorked) {
      await db.imageCache.put({ itemCode, imageUrl: '', fetchedAt: new Date() })
      return { url: null, allErrored: false }
    }

    return { url: null, allErrored: true }
  } catch {
    return { url: null, allErrored: true }
  }
}

// ── Bulk prefetch ───────────────────────────────────────────────────────────
// Two-pass strategy:
//   Pass 1 (fast): Batch-fetch from JARVISmart DB in parallel — no rate limit needed
//   Pass 2 (slow): Serper image search for remaining — 1.1s delay per item

export interface PrefetchProgress {
  total: number
  done: number
  found: number
  errors: number
  skipped: number
  current: string
  creditsExhausted?: boolean
  phase?: 'jarvis' | 'serper'
}

const JARVIS_BATCH_SIZE = 20

export async function prefetchImages(
  items: { itemCode: string; description: string; department: string; barcode?: string | null }[],
  onProgress?: (p: PrefetchProgress) => void,
  signal?: AbortSignal,
): Promise<{ fetched: number; found: number }> {
  // Filter out items already in local IndexedDB cache
  const uncached: typeof items = []
  let skipped = 0
  try {
    for (const item of items) {
      if (signal?.aborted) break
      const existing = await db.imageCache.get(item.itemCode)
      if (existing) { skipped++; continue }
      uncached.push(item)
    }
  } catch { /* IndexedDB error */ }

  if (uncached.length === 0) {
    onProgress?.({ total: 0, done: 0, found: 0, errors: 0, skipped, current: '', phase: 'jarvis' })
    return { fetched: 0, found: 0 }
  }

  let done = 0, found = 0, errors = 0
  const total = uncached.length

  onProgress?.({ total, done, found, errors, skipped, current: 'Checking JARVISmart database...', phase: 'jarvis' })

  // ── Pass 1: Batch-fetch from JARVISmart DB (fast, parallel) ──
  const needsSerper: typeof items = []

  for (let i = 0; i < uncached.length; i += JARVIS_BATCH_SIZE) {
    if (signal?.aborted) break
    const batch = uncached.slice(i, i + JARVIS_BATCH_SIZE)

    const results = await Promise.allSettled(
      batch.map(item => getJarvisImage(item.itemCode))
    )

    for (let j = 0; j < batch.length; j++) {
      const item = batch[j]
      const result = results[j]
      const imageUrl = result.status === 'fulfilled' ? result.value : null

      if (imageUrl) {
        // Found in JARVISmart DB — cache locally
        await db.imageCache.put({ itemCode: item.itemCode, imageUrl, fetchedAt: new Date() })
        window.dispatchEvent(new CustomEvent('image-cached', { detail: { itemCode: item.itemCode, imageUrl } }))
        found++
      } else {
        // Not in JARVISmart — needs Serper search
        needsSerper.push(item)
      }
      done++
    }

    onProgress?.({ total, done, found, errors, skipped, current: batch[batch.length - 1]?.description ?? '', phase: 'jarvis' })
  }

  // ── Pass 2: Serper image search for remaining (slow, rate-limited) ──
  if (needsSerper.length > 0 && !signal?.aborted) {
    onProgress?.({ total, done, found, errors, skipped, current: 'Searching for remaining images...', phase: 'serper' })

    let consecutiveErrors = 0

    for (const item of needsSerper) {
      if (signal?.aborted) break

      if (!canUseSerper('images')) {
        onProgress?.({ total, done, found, errors, skipped, current: item.description, creditsExhausted: true, phase: 'serper' })
        break
      }

      try {
        let imageUrl: string | null = null
        let anySearchWorked = false

        const r = await serverImageSearchBest(buildSearchQuery(item.description, item.department))
        if (r !== 'error') { anySearchWorked = true; if (r) imageUrl = r }

        if (!imageUrl && item.barcode) {
          const r2 = await serverImageSearchBest(buildSearchQuery(item.description, item.department, item.barcode))
          if (r2 !== 'error') { anySearchWorked = true; if (r2) imageUrl = r2 }
        }

        await markSerperSearched(item.itemCode)

        if (imageUrl) {
          await db.imageCache.put({ itemCode: item.itemCode, imageUrl, fetchedAt: new Date() })
          pushImageToJarvis(item.itemCode, imageUrl)
          window.dispatchEvent(new CustomEvent('image-cached', { detail: { itemCode: item.itemCode, imageUrl } }))
          found++
          consecutiveErrors = 0
        } else if (anySearchWorked) {
          await db.imageCache.put({ itemCode: item.itemCode, imageUrl: '', fetchedAt: new Date() })
          consecutiveErrors = 0
        } else {
          errors++
          consecutiveErrors++
        }
      } catch {
        errors++
        consecutiveErrors++
      }

      done++
      const exhausted = consecutiveErrors >= 5
      onProgress?.({ total, done, found, errors, skipped, current: item.description, creditsExhausted: exhausted, phase: 'serper' })
      if (exhausted) break

      // Rate limit only for Serper requests
      await new Promise(r => setTimeout(r, 1100))
    }
  }

  return { fetched: done, found }
}

// ── Cache management ────────────────────────────────────────────────────────

export async function clearImageCache(): Promise<number> {
  const count = await db.imageCache.count()
  await db.imageCache.clear()
  return count
}

export async function clearFailedImageCache(): Promise<number> {
  const failed = await db.imageCache.filter(e => e.imageUrl === '').primaryKeys()
  await db.imageCache.bulkDelete(failed)
  return failed.length
}

export async function getImageCacheStats(): Promise<{ total: number; found: number; failed: number }> {
  const all = await db.imageCache.toArray()
  const found = all.filter(e => e.imageUrl !== '').length
  return { total: all.length, found, failed: all.length - found }
}

// ── Manual image picker (Serper via JARVISmart proxy) ─────────────────────

export interface ImageOption { imageUrl: string; title: string; source: string; width: number; height: number }

export async function searchProductImages(
  _itemCode: string, description: string, department: string, barcode?: string | null,
): Promise<ImageOption[]> {
  const seen = new Set<string>()
  const results: ImageOption[] = []

  if (!canUseSerper('images')) return results

  const queries = [buildSearchQuery(description, department), ...(barcode ? [buildSearchQuery(description, department, barcode)] : [])]
  for (const query of queries) {
    const imgs = await serverImageSearchMulti(query, 10)
    for (const img of imgs) {
      if (!seen.has(img.imageUrl)) {
        seen.add(img.imageUrl)
        results.push(img)
      }
    }
  }

  return results
}

export async function saveSelectedImage(itemCode: string, imageUrl: string): Promise<void> {
  await db.imageCache.put({ itemCode, imageUrl, fetchedAt: new Date() })
  pushImageToJarvis(itemCode, imageUrl)
  window.dispatchEvent(new CustomEvent('image-cached', { detail: { itemCode, imageUrl } }))
}

export { cleanDescription, buildSearchQuery }
