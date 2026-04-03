// ═══════════════════════════════════════════════
// Product Image Service — Grocery Manager
// Priority: local IndexedDB cache → JARVISmart server cache → Serper.dev fetch
// ═══════════════════════════════════════════════

import { db } from './db'

const DEFAULT_SERPER_KEY = '189a40fd7365625bd484571377c563e96c88820c'

function getJarvisBaseUrl(): string {
  return localStorage.getItem('grocery-manager-jarvis-url') || (import.meta.env.VITE_JARVIS_URL as string) || 'https://api.jarvismart196410.uk'
}
function getJarvisApiKey(): string {
  return localStorage.getItem('grocery-manager-jarvis-key') || (import.meta.env.VITE_JARVIS_API_KEY as string) || 'jmart_sk_7f3a9c2e1b4d8f6a0e5c3b9d'
}

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
  return `${cleaned} product grocery`
}

function getSerperApiKey(): string {
  return localStorage.getItem('grocery-manager-serper-api-key') || (import.meta.env.VITE_SERPER_API_KEY as string) || DEFAULT_SERPER_KEY
}

export function isImageSearchConfigured(): boolean {
  return !!getSerperApiKey()
}

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

export async function getCachedImageUrl(itemCode: string): Promise<string | null> {
  const entry = await db.imageCache.get(itemCode)
  return entry?.imageUrl ?? null
}

export async function deleteCachedImage(itemCode: string): Promise<void> {
  await db.imageCache.delete(itemCode)
}

export async function fetchAndCacheImage(
  itemCode: string, description: string, department: string, barcode?: string | null,
): Promise<string | null> {
  const cached = await getCachedImageUrl(itemCode)
  if (cached !== null) return cached || null

  const jarvisUrl = await getJarvisImage(itemCode)
  if (jarvisUrl) {
    await db.imageCache.put({ itemCode, imageUrl: jarvisUrl, fetchedAt: new Date() })
    return jarvisUrl
  }

  let imageUrl = await serperImageSearch(buildSearchQuery(description, department, barcode))
  if (imageUrl === null && barcode) {
    imageUrl = await serperImageSearch(buildSearchQuery(description, department))
  }
  if (imageUrl === 'error') return null

  await db.imageCache.put({ itemCode, imageUrl: imageUrl ?? '', fetchedAt: new Date() })
  if (imageUrl) pushImageToJarvis(itemCode, imageUrl)
  return imageUrl
}

export interface PrefetchProgress { total: number; done: number; found: number; errors: number; current: string }

export async function prefetchImages(
  items: { itemCode: string; description: string; department: string; barcode?: string | null }[],
  onProgress?: (p: PrefetchProgress) => void,
  signal?: AbortSignal,
): Promise<{ fetched: number; found: number }> {
  let done = 0, found = 0, errors = 0
  for (const item of items) {
    if (signal?.aborted) break
    const existing = await db.imageCache.get(item.itemCode)
    if (existing) {
      done++
      if (existing.imageUrl) found++
      onProgress?.({ total: items.length, done, found, errors, current: item.description })
      continue
    }
    const url = await fetchAndCacheImage(item.itemCode, item.description, item.department, item.barcode)
    done++
    if (url) found++
    else {
      const entry = await db.imageCache.get(item.itemCode)
      if (!entry) errors++
    }
    onProgress?.({ total: items.length, done, found, errors, current: item.description })
    await new Promise(r => setTimeout(r, 1100))
  }
  return { fetched: done, found }
}

export async function clearImageCache(): Promise<number> {
  const count = await db.imageCache.count()
  await db.imageCache.clear()
  return count
}

export interface ImageOption { imageUrl: string; title: string; source: string; width: number; height: number }

export async function searchProductImages(
  _itemCode: string, description: string, department: string, barcode?: string | null,
): Promise<ImageOption[]> {
  const apiKey = getSerperApiKey()
  if (!apiKey) return []
  const queries = [buildSearchQuery(description, department), ...(barcode ? [buildSearchQuery(description, department, barcode)] : [])]
  const seen = new Set<string>()
  const results: ImageOption[] = []
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
  return results
}

export async function saveSelectedImage(itemCode: string, imageUrl: string): Promise<void> {
  await db.imageCache.put({ itemCode, imageUrl, fetchedAt: new Date() })
  pushImageToJarvis(itemCode, imageUrl)
}

export { cleanDescription, buildSearchQuery }
