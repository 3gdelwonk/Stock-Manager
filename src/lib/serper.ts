// ═══════════════════════════════════════════════
// Server-Side Search API — via JARVISmart proxy
// Images: /api/pos/serper-images (Serper.dev) — unlimited, no budget cap
// Shopping: /api/pos/serpapi/shopping (SerpApi) — budget-gated
// Research: /api/pos/serpapi/research (SerpApi) — budget-gated
// Budget tracking applies to SerpApi only
// ═══════════════════════════════════════════════

// ── Types ──────────────────────────────────────────────────────────────────

export type SerperQueryType = 'images' | 'shopping' | 'other'

export interface SerperUsage {
  month: string   // 'YYYY-MM'
  images: number
  shopping: number
  other: number
}

export interface SerperBudget {
  monthlyLimit: number   // applies to SerpApi (shopping + other) only
  shopping: number
  other: number
}

// Response types from JARVISmart server endpoints
export interface ServerImageResult {
  title: string; imageUrl: string; thumbnailUrl: string; width: number; height: number; source: string
}

export interface ShoppingResult {
  title: string
  price: number
  priceText: string
  source: string
  link: string
  thumbnail: string
  rating: number | null
  reviews: number
  delivery: string
}

export interface ResearchResult {
  query: string
  knowledgeGraph: { see_results_about?: Array<{ name: string; link: string; image: string }> } | null
  peopleAlsoAsk: Array<{ question: string; snippet: string; link: string }>
  relatedSearches: string[]
  organicResults: Array<{ title: string; link: string; snippet: string; source: string }>
}

// ── Config helpers ────────────────────────────────────────────────────────

function getJarvisBaseUrl(): string {
  return localStorage.getItem('grocery-manager-jarvis-url') || (import.meta.env.VITE_JARVIS_URL as string) || 'https://api.jarvismart196410.uk'
}
function getJarvisApiKey(): string {
  return localStorage.getItem('grocery-manager-jarvis-key') || (import.meta.env.VITE_JARVIS_API_KEY as string) || 'jmart_sk_7f3a9c2e1b4d8f6a0e5c3b9d'
}

// ── Placeholder filter ───────────────────────────────────────────────────

const PLACEHOLDER_RE = /placeholder|no-?image|default[-_]image|spacer|1x1\.|pixel\.gif/i
const STOCK_PHOTO_RE = /shutterstock|istockphoto|gettyimages|depositphotos/i

export function isPlaceholderUrl(url: string): boolean {
  return PLACEHOLDER_RE.test(url) || STOCK_PHOTO_RE.test(url)
}

// ── Budget Management (client-side tracking) ──────────────────────────────

const DEFAULT_BUDGET: SerperBudget = { monthlyLimit: 4000, shopping: 3500, other: 500 }

function getCurrentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function getSerperUsage(): SerperUsage {
  const raw = localStorage.getItem('grocery-manager-serper-usage')
  if (raw) {
    try {
      const usage: SerperUsage = JSON.parse(raw)
      if (usage.month === getCurrentMonth()) return usage
    } catch { /* corrupted, reset */ }
  }
  const fresh: SerperUsage = { month: getCurrentMonth(), images: 0, shopping: 0, other: 0 }
  localStorage.setItem('grocery-manager-serper-usage', JSON.stringify(fresh))
  return fresh
}

export function getSerperBudget(): SerperBudget {
  const raw = localStorage.getItem('grocery-manager-serper-budget')
  if (raw) {
    try { return JSON.parse(raw) as SerperBudget } catch { /* use defaults */ }
  }
  return { ...DEFAULT_BUDGET }
}

export function setSerperBudget(budget: SerperBudget): void {
  localStorage.setItem('grocery-manager-serper-budget', JSON.stringify(budget))
}

export function trackSerperQuery(type: SerperQueryType): void {
  const usage = getSerperUsage()
  usage[type]++
  localStorage.setItem('grocery-manager-serper-usage', JSON.stringify(usage))
}

/** Images (Serper.dev) are unlimited. SerpApi (shopping + other) is budget-gated. */
export function canUseSerper(type: SerperQueryType): boolean {
  if (type === 'images') return true
  const usage = getSerperUsage()
  const budget = getSerperBudget()
  const serpApiUsed = usage.shopping + usage.other
  return usage[type] < budget[type] && serpApiUsed < budget.monthlyLimit
}

export function getSerperRemaining(type: SerperQueryType): number {
  if (type === 'images') return Infinity
  const usage = getSerperUsage()
  const budget = getSerperBudget()
  return Math.max(0, budget[type] - usage[type])
}

export function getSerperTotalRemaining(): number {
  const usage = getSerperUsage()
  const budget = getSerperBudget()
  const serpApiUsed = usage.shopping + usage.other
  return Math.max(0, budget.monthlyLimit - serpApiUsed)
}

export function resetSerperUsage(): void {
  const fresh: SerperUsage = { month: getCurrentMonth(), images: 0, shopping: 0, other: 0 }
  localStorage.setItem('grocery-manager-serper-usage', JSON.stringify(fresh))
}

// ── Queue-Based Serper Tracking (IndexedDB) ───────────────────────────────

import { db } from './db'

export async function isSerperSearched(itemCode: string): Promise<boolean> {
  const entry = await db.serperSearched.get(itemCode)
  return !!entry
}

export async function markSerperSearched(itemCode: string): Promise<void> {
  await db.serperSearched.put({ itemCode })
}

export async function getSerperSearchedCount(): Promise<number> {
  return db.serperSearched.count()
}

export async function clearSerperSearched(): Promise<void> {
  await db.serperSearched.clear()
}

// ── Priority Scoring ───────────────────────────────────────────────────────

export function computeImagePriority(item: { avgDayQty: number | null; sellPrice: number; avgCost: number }): number {
  return (item.avgDayQty ?? 0) * Math.max(0, item.sellPrice - item.avgCost)
}

// ── Server-Side Image Search (via JARVISmart → Serper.dev) ────────────────

export async function serverImageSearch(query: string, num = 10): Promise<ServerImageResult[]> {
  try {
    const params = new URLSearchParams({ q: query, num: String(num) })
    const res = await fetch(`${getJarvisBaseUrl()}/api/pos/serper-images?${params}`, {
      headers: { 'X-API-Key': getJarvisApiKey() },
    })
    if (!res.ok) return []
    trackSerperQuery('images')
    const data: { results: ServerImageResult[] } = await res.json()
    return data.results ?? []
  } catch { return [] }
}

/** Single best image from server-side Serper search */
export async function serverImageSearchBest(query: string): Promise<string | null | 'error'> {
  if (!canUseSerper('images')) return 'error'
  try {
    const results = await serverImageSearch(query, 10)
    if (results.length === 0) return null
    const img = results.find(i => i.width >= 100 && i.height >= 100 && !isPlaceholderUrl(i.imageUrl))
    return img?.imageUrl ?? results[0]?.imageUrl ?? null
  } catch { return 'error' }
}

/** Multi-result for manual image picker */
export interface ServerImageOption {
  imageUrl: string; title: string; source: string; width: number; height: number
}

export async function serverImageSearchMulti(query: string, num = 10): Promise<ServerImageOption[]> {
  if (!canUseSerper('images')) return []
  const results = await serverImageSearch(query, num)
  return results
    .filter(i => i.width >= 80 && i.height >= 80 && !isPlaceholderUrl(i.imageUrl))
    .map(i => ({ imageUrl: i.imageUrl, title: i.title, source: i.source, width: i.width, height: i.height }))
}

// ── Server-Side Shopping Search (via JARVISmart → SerpApi) ────────────────

export async function serverShoppingSearch(query: string): Promise<ShoppingResult[]> {
  try {
    const params = new URLSearchParams({ q: query })
    const res = await fetch(`${getJarvisBaseUrl()}/api/pos/serpapi/shopping?${params}`, {
      headers: { 'X-API-Key': getJarvisApiKey() },
    })
    if (!res.ok) return []
    trackSerperQuery('shopping')
    const data: { query: string; results: ShoppingResult[] } = await res.json()
    return data.results ?? []
  } catch { return [] }
}

// ── Server-Side Research Search (via JARVISmart → SerpApi) ────────────────

export async function serverResearchSearch(query: string): Promise<ResearchResult | null> {
  try {
    const params = new URLSearchParams({ q: query })
    const res = await fetch(`${getJarvisBaseUrl()}/api/pos/serpapi/research?${params}`, {
      headers: { 'X-API-Key': getJarvisApiKey() },
    })
    if (!res.ok) return null
    trackSerperQuery('other')
    return await res.json() as ResearchResult
  } catch { return null }
}
