// ═══════════════════════════════════════════════
// Product Image Service — Grocery Manager
// Priority: local IndexedDB cache → JARVISmart server → DDG/Serper (two-tier)
// ═══════════════════════════════════════════════

import { db } from './db'
import { serperImageSearch, serperImageSearchMulti, canUseSerper } from './serper'

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

// ── Placeholder / stock photo filter ───────────────────────────────────────

const PLACEHOLDER_RE = /placeholder|no-?image|default[-_]image|spacer|1x1\.|pixel\.gif/i
const STOCK_PHOTO_RE = /shutterstock|istockphoto|gettyimages|depositphotos/i

function isPlaceholderUrl(url: string): boolean {
  return PLACEHOLDER_RE.test(url) || STOCK_PHOTO_RE.test(url)
}

// ── Search priority config (for manual picker / single refetch) ────────────

function getSearchPriority(): 'ddg' | 'serper' {
  return (localStorage.getItem('grocery-manager-search-priority') as 'ddg' | 'serper') || 'ddg'
}

// ── Query building (simple fallback for Serper manual picker) ──────────────

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

// ── DDG image search (via JARVISmart server — no CORS issues) ───────────────

interface DdgImageResult { title: string; imageUrl: string; thumbnailUrl: string; width: number; height: number; source: string }
interface DdgResponse { results?: DdgImageResult[]; error?: string }

async function ddgImageSearch(description: string, department: string, barcode?: string | null): Promise<string | null | 'error'> {
  try {
    const params = new URLSearchParams({ description, department, num: '15' })
    if (barcode) params.set('barcode', barcode)
    const res = await fetch(`${getJarvisBaseUrl()}/api/pos/ddg-images?${params}`, {
      headers: { 'X-API-Key': getJarvisApiKey() },
    })
    if (!res.ok) return 'error'
    const data: DdgResponse = await res.json()
    if (data.error || !data.results || data.results.length === 0) return null
    const acceptable = data.results.filter(i =>
      (i.width === 0 || i.width >= 100) && (i.height === 0 || i.height >= 100) && !isPlaceholderUrl(i.imageUrl)
    )
    return acceptable[0]?.imageUrl ?? null
  } catch { return 'error' }
}

// ── Cache helpers ───────────────────────────────────────────────────────────

export async function getCachedImageUrl(itemCode: string): Promise<string | null> {
  const entry = await db.imageCache.get(itemCode)
  return entry?.imageUrl ?? null
}

export async function deleteCachedImage(itemCode: string): Promise<void> {
  await db.imageCache.delete(itemCode)
}

// ── Fetch & cache (used by bulk prefetch + single refetch) ─────────────────
// searchTier controls which engine to use during prefetch:
//   'serper' → Serper first (budget-gated), DDG fallback
//   'ddg'    → DDG only, skip Serper
//   undefined → use manual search priority toggle (for picker/refetch)

export async function fetchAndCacheImage(
  itemCode: string, description: string, department: string,
  barcode?: string | null,
  searchTier?: 'serper' | 'ddg',
): Promise<{ url: string | null; allErrored: boolean }> {
  try {
    const cached = await getCachedImageUrl(itemCode)
    if (cached !== null) return { url: cached || null, allErrored: false }

    // 1. Check JARVISmart server
    const jarvisUrl = await getJarvisImage(itemCode)
    if (jarvisUrl) {
      await db.imageCache.put({ itemCode, imageUrl: jarvisUrl, fetchedAt: new Date() })
      window.dispatchEvent(new CustomEvent('image-cached', { detail: { itemCode, imageUrl: jarvisUrl } }))
      return { url: jarvisUrl, allErrored: false }
    }

    let imageUrl: string | null = null
    let anySearchWorked = false

    const tryDdg = async () => {
      const r = await ddgImageSearch(description, department, barcode)
      if (r !== 'error') { anySearchWorked = true; if (r) imageUrl = r }
    }
    const trySerper = async () => {
      const r = await serperImageSearch(buildSearchQuery(description, department))
      if (r !== 'error') { anySearchWorked = true; if (r) imageUrl = r }
      // Barcode retry only for manual picker (no searchTier), not bulk prefetch
      if (!imageUrl && barcode && !searchTier) {
        const r2 = await serperImageSearch(buildSearchQuery(description, department, barcode))
        if (r2 !== 'error') { anySearchWorked = true; if (r2) imageUrl = r2 }
      }
    }

    // 2 & 3. Search based on tier or manual priority
    if (searchTier === 'serper') {
      // Two-tier prefetch: Serper first (if budget allows), DDG fallback
      if (canUseSerper('images')) await trySerper()
      if (!imageUrl) await tryDdg()
    } else if (searchTier === 'ddg') {
      // DDG only — skip Serper to save budget
      await tryDdg()
    } else {
      // Manual picker / refetch — use priority toggle
      const [primary, fallback] = getSearchPriority() === 'serper' ? [trySerper, tryDdg] : [tryDdg, trySerper]
      await primary()
      if (!imageUrl) await fallback()
    }

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

export interface PrefetchProgress {
  total: number
  done: number
  found: number
  errors: number
  skipped: number
  current: string
  creditsExhausted?: boolean
}

export async function prefetchImages(
  items: { itemCode: string; description: string; department: string; barcode?: string | null; searchTier?: 'serper' | 'ddg' }[],
  onProgress?: (p: PrefetchProgress) => void,
  signal?: AbortSignal,
): Promise<{ fetched: number; found: number }> {
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
    onProgress?.({ total: 0, done: 0, found: 0, errors: 0, skipped, current: '' })
    return { fetched: 0, found: 0 }
  }

  let done = 0, found = 0, errors = 0, consecutiveErrors = 0
  onProgress?.({ total: uncached.length, done, found, errors, skipped, current: uncached[0]?.description ?? '' })

  for (const item of uncached) {
    if (signal?.aborted) break
    try {
      const result = await fetchAndCacheImage(item.itemCode, item.description, item.department, item.barcode, item.searchTier)
      done++
      if (result.url) {
        found++
        consecutiveErrors = 0
      } else if (result.allErrored) {
        errors++
        consecutiveErrors++
      } else {
        consecutiveErrors = 0
      }
    } catch {
      done++
      errors++
      consecutiveErrors++
    }

    const exhausted = consecutiveErrors >= 5
    onProgress?.({ total: uncached.length, done, found, errors, skipped, current: item.description, creditsExhausted: exhausted })
    if (exhausted) break
    await new Promise(r => setTimeout(r, 1100))
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

// ── Manual image picker (uses Serper + DDG) ────────────────────────────────

export interface ImageOption { imageUrl: string; title: string; source: string; width: number; height: number }

export async function searchProductImages(
  _itemCode: string, description: string, department: string, barcode?: string | null,
): Promise<ImageOption[]> {
  const seen = new Set<string>()
  const results: ImageOption[] = []

  // Try Serper first (better quality for manual selection, budget-gated)
  if (canUseSerper('images')) {
    const queries = [buildSearchQuery(description, department), ...(barcode ? [buildSearchQuery(description, department, barcode)] : [])]
    for (const query of queries) {
      const imgs = await serperImageSearchMulti(query, 10)
      for (const img of imgs) {
        if (!seen.has(img.imageUrl)) {
          seen.add(img.imageUrl)
          results.push(img)
        }
      }
    }
  }

  // Also try DDG via JARVISmart for more options
  try {
    const ddgParams = new URLSearchParams({ description, department, num: '10' })
    if (barcode) ddgParams.set('barcode', barcode)
    const res = await fetch(`${getJarvisBaseUrl()}/api/pos/ddg-images?${ddgParams}`, {
      headers: { 'X-API-Key': getJarvisApiKey() },
    })
    if (res.ok) {
      const data: DdgResponse = await res.json()
      if (data.results) {
        for (const img of data.results) {
          if ((img.width === 0 || img.width >= 80) && (img.height === 0 || img.height >= 80) && !seen.has(img.imageUrl)) {
            seen.add(img.imageUrl)
            results.push({ imageUrl: img.imageUrl, title: img.title, source: img.source, width: img.width, height: img.height })
          }
        }
      }
    }
  } catch { /* skip */ }

  return results
}

export async function saveSelectedImage(itemCode: string, imageUrl: string): Promise<void> {
  await db.imageCache.put({ itemCode, imageUrl, fetchedAt: new Date() })
  pushImageToJarvis(itemCode, imageUrl)
  window.dispatchEvent(new CustomEvent('image-cached', { detail: { itemCode, imageUrl } }))
}

export { cleanDescription, buildSearchQuery }
