// ═══════════════════════════════════════════════
// Serper API — Budget Tracking & Query Management
// Tracks usage by type (images/shopping/other) with monthly auto-reset
// ═══════════════════════════════════════════════

const DEFAULT_SERPER_KEY = '75b23242598b5ef681209b443ae89c9a04e09ca6379e4c32768a56600be80d2d'

// ── Types ──────────────────────────────────────────────────────────────────

export type SerperQueryType = 'images' | 'shopping' | 'other'

export interface SerperUsage {
  month: string   // 'YYYY-MM'
  images: number
  shopping: number
  other: number
}

export interface SerperBudget {
  monthlyLimit: number
  images: number
  shopping: number
  other: number
}

export interface SerperShoppingResult {
  title: string
  source: string
  price: number
  link: string
  rating?: number
  delivery?: string
  imageUrl?: string
}

interface SerperImageResult {
  title: string; imageUrl: string; imageWidth: number; imageHeight: number; source: string; domain: string
}
interface SerperImageResponse { images?: SerperImageResult[]; message?: string }
interface SerperShoppingResponse { shopping?: Array<{ title: string; source: string; price: string; link: string; rating?: number; delivery?: string; imageUrl?: string }>; message?: string }

// ── Placeholder filter (shared with images.ts) ────────────────────────────

const PLACEHOLDER_RE = /placeholder|no-?image|default[-_]image|spacer|1x1\.|pixel\.gif/i
const STOCK_PHOTO_RE = /shutterstock|istockphoto|gettyimages|depositphotos/i

function isPlaceholderUrl(url: string): boolean {
  return PLACEHOLDER_RE.test(url) || STOCK_PHOTO_RE.test(url)
}

// ── Config ─────────────────────────────────────────────────────────────────

export function getSerperApiKey(): string {
  return localStorage.getItem('grocery-manager-serper-api-key') || (import.meta.env.VITE_SERPER_API_KEY as string) || DEFAULT_SERPER_KEY
}

const DEFAULT_BUDGET: SerperBudget = { monthlyLimit: 5000, images: 1000, shopping: 3500, other: 500 }

// ── Budget Management ──────────────────────────────────────────────────────

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
  // New month or no data — reset
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

export function canUseSerper(type: SerperQueryType): boolean {
  const usage = getSerperUsage()
  const budget = getSerperBudget()
  const totalUsed = usage.images + usage.shopping + usage.other
  return usage[type] < budget[type] && totalUsed < budget.monthlyLimit
}

export function getSerperRemaining(type: SerperQueryType): number {
  const usage = getSerperUsage()
  const budget = getSerperBudget()
  return Math.max(0, budget[type] - usage[type])
}

export function getSerperTotalRemaining(): number {
  const usage = getSerperUsage()
  const budget = getSerperBudget()
  const totalUsed = usage.images + usage.shopping + usage.other
  return Math.max(0, budget.monthlyLimit - totalUsed)
}

export function resetSerperUsage(): void {
  const fresh: SerperUsage = { month: getCurrentMonth(), images: 0, shopping: 0, other: 0 }
  localStorage.setItem('grocery-manager-serper-usage', JSON.stringify(fresh))
}

// ── Queue-Based Serper Tracking (IndexedDB) ───────────────────────────────
// Products are searched with Serper once in priority order, then marked "done"
// so they're never re-searched. This makes the backfill self-terminating.

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

// ── Serper Image Search ────────────────────────────────────────────────────

export async function serperImageSearch(query: string): Promise<string | null | 'error'> {
  const apiKey = getSerperApiKey()
  if (!apiKey) return 'error'
  if (!canUseSerper('images')) return 'error'
  try {
    const res = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num: 10 }),
    })
    if (!res.ok) return 'error'
    trackSerperQuery('images')
    const data: SerperImageResponse = await res.json()
    if (!data.images || data.images.length === 0) return null
    const img = data.images.find(i => i.imageWidth >= 100 && i.imageHeight >= 100 && !isPlaceholderUrl(i.imageUrl))
    return img?.imageUrl ?? data.images[0]?.imageUrl ?? null
  } catch { return 'error' }
}

// ── Serper Image Search (multi-result for manual picker) ───────────────────

export interface SerperImageOption {
  imageUrl: string; title: string; source: string; width: number; height: number
}

export async function serperImageSearchMulti(query: string, num = 10): Promise<SerperImageOption[]> {
  const apiKey = getSerperApiKey()
  if (!apiKey || !canUseSerper('images')) return []
  try {
    const res = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num }),
    })
    if (!res.ok) return []
    trackSerperQuery('images')
    const data: SerperImageResponse = await res.json()
    if (!data.images) return []
    return data.images
      .filter(i => i.imageWidth >= 80 && i.imageHeight >= 80 && !isPlaceholderUrl(i.imageUrl))
      .map(i => ({ imageUrl: i.imageUrl, title: i.title, source: i.domain, width: i.imageWidth, height: i.imageHeight }))
  } catch { return [] }
}

// ── Serper Shopping Search ─────────────────────────────────────────────────

export async function serperShoppingSearch(query: string, num = 10): Promise<SerperShoppingResult[]> {
  const apiKey = getSerperApiKey()
  if (!apiKey || !canUseSerper('shopping')) return []
  try {
    const res = await fetch('https://google.serper.dev/shopping', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num, gl: 'au' }),
    })
    if (!res.ok) return []
    trackSerperQuery('shopping')
    const data: SerperShoppingResponse = await res.json()
    if (!data.shopping) return []
    return data.shopping.map(s => ({
      title: s.title,
      source: s.source,
      price: parseFloat(String(s.price).replace(/[^0-9.]/g, '')) || 0,
      link: s.link,
      rating: s.rating,
      delivery: s.delivery,
      imageUrl: s.imageUrl,
    }))
  } catch { return [] }
}
