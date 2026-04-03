// ═══════════════════════════════════════════════
// Product Image Service — Grocery Manager
// Priority: local IndexedDB cache → JARVISmart server → DDG (bulk) → Serper (manual picker fallback)
// ═══════════════════════════════════════════════

import { db } from './db'

const DEFAULT_SERPER_KEY = '75b23242598b5ef681209b443ae89c9a04e09ca6379e4c32768a56600be80d2d'
// ── Config helpers ──────────────────────────────────────────────────────────

function getJarvisBaseUrl(): string {
  return localStorage.getItem('grocery-manager-jarvis-url') || (import.meta.env.VITE_JARVIS_URL as string) || 'https://api.jarvismart196410.uk'
}
function getJarvisApiKey(): string {
  return localStorage.getItem('grocery-manager-jarvis-key') || (import.meta.env.VITE_JARVIS_API_KEY as string) || 'jmart_sk_7f3a9c2e1b4d8f6a0e5c3b9d'
}
function getSerperApiKey(): string {
  return localStorage.getItem('grocery-manager-serper-api-key') || (import.meta.env.VITE_SERPER_API_KEY as string) || DEFAULT_SERPER_KEY
}

export function isImageSearchConfigured(): boolean {
  return !!getJarvisBaseUrl() || !!getSerperApiKey()
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

// ── Query building ──────────────────────────────────────────────────────────

function cleanDescription(desc: string): string {
  let clean = desc.replace(/\d+[*xX]?\d*\s*ML/gi, '').replace(/\d+\s*L\b/gi, '')
  clean = clean.replace(/\b\d+\s*(S|PK|X)\b/gi, '')
  clean = clean.replace(/\b\d+\s*(GM|KG|G)\b/gi, '')
  clean = clean.replace(/[*#&]/g, '').replace(/\s+/g, ' ').trim()
  return clean
}

function buildSearchQuery(description: string, _department: string, barcode?: string | null): string {
  if (barcode) return `${barcode} product`
  const cleaned = cleanDescription(description)
  return `${cleaned} product`
}

// ── DDG image search (via JARVISmart server — no CORS issues) ───────────────

interface DdgImageResult { title: string; imageUrl: string; thumbnailUrl: string; width: number; height: number; source: string }
interface DdgResponse { results?: DdgImageResult[]; error?: string }

async function ddgImageSearch(query: string): Promise<string | null | 'error'> {
  try {
    const res = await fetch(`${getJarvisBaseUrl()}/api/pos/ddg-images?q=${encodeURIComponent(query)}&num=5`, {
      headers: { 'X-API-Key': getJarvisApiKey() },
    })
    if (!res.ok) return 'error'
    const data: DdgResponse = await res.json()
    if (data.error || !data.results || data.results.length === 0) return null
    const img = data.results.find(i => i.width >= 100 && i.height >= 100)
    return img?.imageUrl ?? data.results[0]?.imageUrl ?? null
  } catch { return 'error' }
}

// ── Serper image search (fallback / manual picker) ──────────────────────────

interface SerperImageResult { title: string; imageUrl: string; imageWidth: number; imageHeight: number; source: string; domain: string }
interface SerperResponse { images?: SerperImageResult[]; message?: string }

async function serperImageSearch(query: string): Promise<string | null | 'error'> {
  const apiKey = getSerperApiKey()
  if (!apiKey) return 'error'
  try {
    const res = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num: 5 }),
    })
    if (!res.ok) return 'error'
    const data: SerperResponse = await res.json()
    if (!data.images || data.images.length === 0) return null
    const img = data.images.find(i => i.imageWidth >= 100 && i.imageHeight >= 100)
    return img?.imageUrl ?? data.images[0]?.imageUrl ?? null
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

// ── Fetch & cache (used by bulk prefetch) ───────────────────────────────────
// Flow: local cache → JARVISmart → DDG Worker → Serper fallback

export async function fetchAndCacheImage(
  itemCode: string, description: string, department: string, barcode?: string | null,
): Promise<string | null> {
  try {
    const cached = await getCachedImageUrl(itemCode)
    if (cached !== null) return cached || null

    // 1. Check JARVISmart server
    const jarvisUrl = await getJarvisImage(itemCode)
    if (jarvisUrl) {
      await db.imageCache.put({ itemCode, imageUrl: jarvisUrl, fetchedAt: new Date() })
      return jarvisUrl
    }

    // 2. DDG via JARVISmart server (primary — free & unlimited)
    const descQuery = buildSearchQuery(description, department)
    let imageUrl = await ddgImageSearch(descQuery)
    if (imageUrl === null && barcode) {
      imageUrl = await ddgImageSearch(buildSearchQuery(description, department, barcode))
    }

    // 3. Serper fallback if DDG fails
    if (imageUrl === 'error' || imageUrl === null) {
      const serperResult = await serperImageSearch(descQuery)
      if (serperResult !== 'error' && serperResult !== null) {
        imageUrl = serperResult
      } else if (serperResult === null && barcode) {
        const barcodeResult = await serperImageSearch(buildSearchQuery(description, department, barcode))
        if (barcodeResult !== 'error') imageUrl = barcodeResult
      }
    }

    // Don't cache if both sources errored (allow retry later)
    if (imageUrl === 'error') return null

    await db.imageCache.put({ itemCode, imageUrl: imageUrl ?? '', fetchedAt: new Date() })
    if (imageUrl) pushImageToJarvis(itemCode, imageUrl)
    return imageUrl
  } catch {
    return null // never throw — caller handles null gracefully
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
  items: { itemCode: string; description: string; department: string; barcode?: string | null }[],
  onProgress?: (p: PrefetchProgress) => void,
  signal?: AbortSignal,
): Promise<{ fetched: number; found: number }> {
  // First pass: filter out already-cached items
  const uncached: typeof items = []
  let skipped = 0
  try {
    for (const item of items) {
      if (signal?.aborted) break
      const existing = await db.imageCache.get(item.itemCode)
      if (existing) { skipped++; continue }
      uncached.push(item)
    }
  } catch {
    // IndexedDB error — proceed with what we have
  }

  if (uncached.length === 0) {
    onProgress?.({ total: 0, done: 0, found: 0, errors: 0, skipped, current: '' })
    return { fetched: 0, found: 0 }
  }

  let done = 0, found = 0, errors = 0, consecutiveErrors = 0
  onProgress?.({ total: uncached.length, done, found, errors, skipped, current: uncached[0]?.description ?? '' })

  for (const item of uncached) {
    if (signal?.aborted) break
    try {
      const url = await fetchAndCacheImage(item.itemCode, item.description, item.department, item.barcode)
      done++
      if (url) {
        found++
        consecutiveErrors = 0
      } else {
        consecutiveErrors++
        errors++
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

// ── Manual image picker (uses Serper for quality) ───────────────────────────

export interface ImageOption { imageUrl: string; title: string; source: string; width: number; height: number }

export async function searchProductImages(
  _itemCode: string, description: string, department: string, barcode?: string | null,
): Promise<ImageOption[]> {
  const seen = new Set<string>()
  const results: ImageOption[] = []

  // Try Serper first (better quality for manual selection)
  const apiKey = getSerperApiKey()
  if (apiKey) {
    const queries = [buildSearchQuery(description, department), ...(barcode ? [buildSearchQuery(description, department, barcode)] : [])]
    for (const query of queries) {
      try {
        const res = await fetch('https://google.serper.dev/images', {
          method: 'POST',
          headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: query, num: 10 }),
        })
        if (!res.ok) continue
        const data: SerperResponse = await res.json()
        if (!data.images) continue
        for (const img of data.images) {
          if (img.imageWidth >= 80 && img.imageHeight >= 80 && !seen.has(img.imageUrl)) {
            seen.add(img.imageUrl)
            results.push({ imageUrl: img.imageUrl, title: img.title, source: img.domain, width: img.imageWidth, height: img.imageHeight })
          }
        }
      } catch { /* skip */ }
    }
  }

  // Also try DDG via JARVISmart for more options
  const ddgQueries = [buildSearchQuery(description, department), ...(barcode ? [buildSearchQuery(description, department, barcode)] : [])]
  for (const query of ddgQueries) {
    try {
      const res = await fetch(`${getJarvisBaseUrl()}/api/pos/ddg-images?q=${encodeURIComponent(query)}&num=10`, {
        headers: { 'X-API-Key': getJarvisApiKey() },
      })
      if (!res.ok) continue
      const data: DdgResponse = await res.json()
      if (!data.results) continue
      for (const img of data.results) {
        if (img.width >= 80 && img.height >= 80 && !seen.has(img.imageUrl)) {
          seen.add(img.imageUrl)
          results.push({ imageUrl: img.imageUrl, title: img.title, source: img.source, width: img.width, height: img.height })
        }
      }
    } catch { /* skip */ }
  }

  return results
}

export async function saveSelectedImage(itemCode: string, imageUrl: string): Promise<void> {
  await db.imageCache.put({ itemCode, imageUrl, fetchedAt: new Date() })
  pushImageToJarvis(itemCode, imageUrl)
}

export { cleanDescription, buildSearchQuery }
