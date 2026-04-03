import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Lightbulb, Calendar, BarChart3, TrendingUp, TrendingDown, ShieldAlert,
  MessageSquare, RefreshCw, Loader2, Plus, Trash2,
  AlertTriangle, Clock, DollarSign, Users, Zap, WifiOff, Search,
  CheckCircle2, ChevronRight,
} from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import {
  checkConnection, getTrends, getHourlySales, getTopSellers, getOnlinePrices,
  type TrendEntry, type HourlySalesEntry, type TopSeller, type OnlinePrice,
} from '../lib/jarvis'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'

// ─── Constants ───────────────────────────────────────────────────────────────

const AUD = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })

interface AUHoliday {
  date: string
  name: string
  impact: 'Closed' | 'Reduced hours' | 'Peak trading'
}

const AU_HOLIDAYS_2026: AUHoliday[] = [
  { date: '2026-01-01', name: "New Year's Day",  impact: 'Closed' },
  { date: '2026-01-26', name: 'Australia Day',   impact: 'Reduced hours' },
  { date: '2026-04-03', name: 'Good Friday',     impact: 'Closed' },
  { date: '2026-04-04', name: 'Easter Saturday',  impact: 'Reduced hours' },
  { date: '2026-04-06', name: 'Easter Monday',    impact: 'Reduced hours' },
  { date: '2026-04-25', name: 'Anzac Day',        impact: 'Reduced hours' },
  { date: '2026-06-08', name: "Queen's Birthday", impact: 'Peak trading' },
  { date: '2026-12-25', name: 'Christmas Day',    impact: 'Closed' },
  { date: '2026-12-26', name: 'Boxing Day',       impact: 'Peak trading' },
]

const SEVERITY_STYLES: Record<InsightSeverity, { bg: string; border: string; icon: string; badge: string }> = {
  critical: { bg: 'bg-red-50',    border: 'border-red-200',    icon: 'text-red-600',    badge: 'bg-red-100 text-red-700' },
  warning:  { bg: 'bg-amber-50',  border: 'border-amber-200',  icon: 'text-amber-600',  badge: 'bg-amber-100 text-amber-700' },
  info:     { bg: 'bg-blue-50',   border: 'border-blue-200',   icon: 'text-blue-600',   badge: 'bg-blue-100 text-blue-700' },
  success:  { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
}

const IMPACT_STYLES: Record<string, string> = {
  Closed:          'bg-red-100 text-red-700',
  'Reduced hours': 'bg-amber-100 text-amber-700',
  'Peak trading':  'bg-emerald-100 text-emerald-700',
}

// ─── Types ───────────────────────────────────────────────────────────────────

type InsightSeverity = 'critical' | 'warning' | 'info' | 'success'

interface InsightCard {
  id: string
  severity: InsightSeverity
  title: string
  description: string
  icon: React.ReactNode
}

interface CompetitorResult {
  product: TopSeller
  ourPrice: number
  bestPrice: number | null
  bestSource: string | null
  delta: number | null
  results: OnlinePrice[]
}

interface IntelNote {
  id: string
  text: string
  createdAt: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadNotes(): IntelNote[] {
  try {
    const raw = localStorage.getItem('insight-notes')
    return raw ? (JSON.parse(raw) as IntelNote[]) : []
  } catch {
    return []
  }
}

function saveNotes(notes: IntelNote[]) {
  localStorage.setItem('insight-notes', JSON.stringify(notes))
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00')
  const b = new Date(to + 'T00:00:00')
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

function hourLabel(h: number): string {
  if (h === 0) return '12am'
  if (h < 12) return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function InsightView() {
  // ── Connection state ──
  const [connected, setConnected] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Data state ──
  const [trends, setTrends] = useState<TrendEntry[]>([])
  const [hourlyData, setHourlyData] = useState<HourlySalesEntry[]>([])
  const [topSellers7d, setTopSellers7d] = useState<TopSeller[]>([])
  const [topSellers30d, setTopSellers30d] = useState<TopSeller[]>([])

  // ── Competitor scan state ──
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [scanTotal, setScanTotal] = useState(0)
  const [competitorResults, setCompetitorResults] = useState<CompetitorResult[]>([])

  // ── Notes state ──
  const [notes, setNotes] = useState<IntelNote[]>(loadNotes)
  const [newNote, setNewNote] = useState('')

  // ── Dexie products for stock alerts ──
  const products = useLiveQuery(() => db.products.toArray(), [])

  // ── Fetch core data ──
  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)

    try {
      const conn = await checkConnection()
      setConnected(conn.connected)

      if (!conn.connected) {
        setLoading(false)
        setRefreshing(false)
        return
      }

      const [trendsResult, hourlyResult, top7Result, top30Result] = await Promise.allSettled([
        getTrends('daily', 30),
        getHourlySales('week'),
        getTopSellers(7, 10),
        getTopSellers(30, 10),
      ])

      if (trendsResult.status === 'fulfilled') setTrends(trendsResult.value.entries)
      if (hourlyResult.status === 'fulfilled') setHourlyData(hourlyResult.value.hours)
      if (top7Result.status === 'fulfilled') setTopSellers7d(top7Result.value)
      if (top30Result.status === 'fulfilled') setTopSellers30d(top30Result.value)
    } catch (err) {
      setError((err as Error).message || 'Failed to load insights')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Generate insight cards ──
  const insights: InsightCard[] = useMemo(() => {
    const cards: InsightCard[] = []

    // Stock alerts — products with low QOH
    if (products && products.length > 0) {
      const lowStock = products.filter(p => p.active && p.sellPrice > 0 && p.minStockLevel > 0)
      // We don't have live QOH in products table, but flag items with minStockLevel set
      // as a reminder. For real low stock, we'd cross-reference stockSnapshots.
      if (lowStock.length > 0) {
        const count = lowStock.length
        cards.push({
          id: 'stock-watch',
          severity: 'info',
          title: `${count} product${count !== 1 ? 's' : ''} with reorder levels set`,
          description: 'Products are configured with minimum stock levels. Check Live Stock view for current levels.',
          icon: <ShieldAlert className="w-5 h-5" />,
        })
      }
    }

    // Velocity insights — compare 7d vs 30d top sellers
    if (topSellers7d.length > 0 && topSellers30d.length > 0) {
      const revenueMap30 = new Map(topSellers30d.map(s => [s.itemCode, s.revenue / 30]))
      const risers: string[] = []
      const fallers: string[] = []

      for (const item of topSellers7d) {
        const dailyRev7d = item.revenue / 7
        const dailyRev30d = revenueMap30.get(item.itemCode)
        if (dailyRev30d && dailyRev30d > 0) {
          const change = ((dailyRev7d - dailyRev30d) / dailyRev30d) * 100
          if (change > 30) risers.push(item.description)
          if (change < -30) fallers.push(item.description)
        }
      }

      if (risers.length > 0) {
        cards.push({
          id: 'velocity-up',
          severity: 'success',
          title: `${risers.length} product${risers.length !== 1 ? 's' : ''} trending up`,
          description: `Strong momentum this week: ${risers.slice(0, 3).join(', ')}${risers.length > 3 ? ` +${risers.length - 3} more` : ''}`,
          icon: <TrendingUp className="w-5 h-5" />,
        })
      }
      if (fallers.length > 0) {
        cards.push({
          id: 'velocity-down',
          severity: 'warning',
          title: `${fallers.length} product${fallers.length !== 1 ? 's' : ''} slowing down`,
          description: `Declining velocity this week: ${fallers.slice(0, 3).join(', ')}${fallers.length > 3 ? ` +${fallers.length - 3} more` : ''}`,
          icon: <TrendingDown className="w-5 h-5" />,
        })
      }
    }

    // Hourly trading pattern insights
    if (hourlyData.length > 0) {
      const sorted = [...hourlyData].sort((a, b) => b.revenue - a.revenue)
      const peak = sorted[0]
      if (peak && peak.revenue > 0) {
        const peakHour = peak.hour
        const peakEnd = Math.min(peakHour + 2, 22)
        cards.push({
          id: 'peak-hours',
          severity: 'info',
          title: `Peak trading at ${hourLabel(peakHour)}-${hourLabel(peakEnd)}`,
          description: `Highest revenue of ${AUD.format(peak.revenue)} in this window. Consider extra staff during peak hours.`,
          icon: <Clock className="w-5 h-5" />,
        })
      }

      const lowHours = sorted.filter(h => h.hour >= 6 && h.hour <= 20 && h.revenue > 0)
      if (lowHours.length > 3) {
        const quietest = lowHours[lowHours.length - 1]
        cards.push({
          id: 'quiet-hours',
          severity: 'info',
          title: `Quietest trading at ${hourLabel(quietest.hour)}`,
          description: `Only ${AUD.format(quietest.revenue)} revenue. Good time for restocking and merchandising.`,
          icon: <Users className="w-5 h-5" />,
        })
      }
    }

    // Revenue trend insight
    if (trends.length >= 7) {
      const last7 = trends.slice(-7)
      const prev7 = trends.slice(-14, -7)
      if (prev7.length === 7) {
        const recentAvg = last7.reduce((s, t) => s + t.revenue, 0) / 7
        const prevAvg = prev7.reduce((s, t) => s + t.revenue, 0) / 7
        if (prevAvg > 0) {
          const pctChange = ((recentAvg - prevAvg) / prevAvg) * 100
          if (Math.abs(pctChange) > 5) {
            cards.push({
              id: 'revenue-trend',
              severity: pctChange > 0 ? 'success' : 'warning',
              title: `Revenue ${pctChange > 0 ? 'up' : 'down'} ${Math.abs(pctChange).toFixed(1)}% week-on-week`,
              description: `Average daily revenue: ${AUD.format(recentAvg)} (prev: ${AUD.format(prevAvg)})`,
              icon: <DollarSign className="w-5 h-5" />,
            })
          }
        }
      }
    }

    // Competitor scan results insight
    if (competitorResults.length > 0) {
      const overpriced = competitorResults.filter(r => r.delta !== null && r.delta > 0)
      if (overpriced.length > 0) {
        cards.unshift({
          id: 'competitor-alert',
          severity: overpriced.length >= 3 ? 'critical' : 'warning',
          title: `${overpriced.length} product${overpriced.length !== 1 ? 's' : ''} priced above competitors`,
          description: `Potential lost sales. Review the Competitor Price Watch section below for details.`,
          icon: <AlertTriangle className="w-5 h-5" />,
        })
      } else {
        cards.unshift({
          id: 'competitor-ok',
          severity: 'success',
          title: 'Prices competitive across scanned products',
          description: 'All scanned products are at or below competitor pricing.',
          icon: <CheckCircle2 className="w-5 h-5" />,
        })
      }
    }

    // Holiday awareness
    const today = todayStr()
    const todayHoliday = AU_HOLIDAYS_2026.find(h => h.date === today)
    if (todayHoliday) {
      cards.unshift({
        id: 'holiday-today',
        severity: todayHoliday.impact === 'Closed' ? 'critical' : 'warning',
        title: `Today is ${todayHoliday.name}`,
        description: `Expected impact: ${todayHoliday.impact}. Plan staffing and stock accordingly.`,
        icon: <Calendar className="w-5 h-5" />,
      })
    }

    return cards
  }, [products, topSellers7d, topSellers30d, hourlyData, trends, competitorResults])

  // ── Competitor scan ──
  const runCompetitorScan = useCallback(async () => {
    if (topSellers7d.length === 0) return
    setScanning(true)
    setCompetitorResults([])
    const top5 = [...topSellers7d].sort((a, b) => b.revenue - a.revenue).slice(0, 5)
    setScanTotal(top5.length)
    setScanProgress(0)

    const results: CompetitorResult[] = []
    for (const seller of top5) {
      try {
        const data = await getOnlinePrices(seller.description)
        const priceResults = data.results
        const best = priceResults.length > 0
          ? priceResults.reduce((min, r) => r.price < min.price ? r : min, priceResults[0])
          : null

        // Try to find our sell price from db products
        const dbProduct = products?.find(p => p.itemCode === seller.itemCode)
        const ourPrice = dbProduct?.sellPrice ?? (seller.revenue / Math.max(seller.quantitySold, 1))

        results.push({
          product: seller,
          ourPrice,
          bestPrice: best ? best.price : null,
          bestSource: best ? best.source : null,
          delta: best ? +(ourPrice - best.price).toFixed(2) : null,
          results: priceResults,
        })
      } catch {
        results.push({
          product: seller,
          ourPrice: seller.revenue / Math.max(seller.quantitySold, 1),
          bestPrice: null,
          bestSource: null,
          delta: null,
          results: [],
        })
      }
      setScanProgress(prev => prev + 1)
    }
    setCompetitorResults(results)
    setScanning(false)
  }, [topSellers7d, products])

  // ── Notes management ──
  const addNote = useCallback(() => {
    const text = newNote.trim()
    if (!text) return
    const note: IntelNote = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text,
      createdAt: new Date().toISOString(),
    }
    const updated = [note, ...notes]
    setNotes(updated)
    saveNotes(updated)
    setNewNote('')
  }, [newNote, notes])

  const deleteNote = useCallback((id: string) => {
    const updated = notes.filter(n => n.id !== id)
    setNotes(updated)
    saveNotes(updated)
  }, [notes])

  // ── Upcoming holidays ──
  const upcomingHolidays = useMemo(() => {
    const today = todayStr()
    return AU_HOLIDAYS_2026
      .map(h => ({ ...h, daysUntil: daysBetween(today, h.date) }))
      .filter(h => h.daysUntil >= 0 && h.daysUntil <= 60)
  }, [])

  // ── Hourly data for chart (6am-10pm) ──
  const hourlyChartData = useMemo(() => {
    const filtered = hourlyData
      .filter(h => h.hour >= 6 && h.hour <= 22)
      .sort((a, b) => a.hour - b.hour)
    const maxRev = Math.max(...filtered.map(h => h.revenue), 1)
    return filtered.map(h => ({
      ...h,
      label: hourLabel(h.hour),
      intensity: h.revenue / maxRev,
    }))
  }, [hourlyData])

  // ── Trend chart data ──
  const trendChartData = useMemo(() => {
    return trends.map(t => ({
      date: t.date.slice(5), // MM-DD
      revenue: t.revenue,
    }))
  }, [trends])

  // ─── Offline state ───
  if (connected === false && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
        <WifiOff className="w-12 h-12" />
        <p className="text-sm font-medium">Connect to JARVISmart for live insights</p>
        <button
          onClick={() => fetchAll()}
          className="mt-2 text-xs text-emerald-600 flex items-center gap-1 hover:underline"
        >
          <RefreshCw className="w-3 h-3" /> Retry connection
        </button>
      </div>
    )
  }

  // ─── Loading state ───
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        <p className="text-sm">Generating insights...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-6">
      {/* ── Header + Refresh ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-gray-900">AI Insights</h2>
        </div>
        <button
          onClick={() => fetchAll(true)}
          disabled={refreshing}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-emerald-600 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* ═══ Section 1: Insight Cards ═══ */}
      {insights.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" /> Actionable Insights
          </h3>
          <div className="space-y-2">
            {insights.map(card => {
              const style = SEVERITY_STYLES[card.severity]
              return (
                <div
                  key={card.id}
                  className={`rounded-xl border ${style.border} ${style.bg} p-3 flex items-start gap-3`}
                >
                  <div className={`mt-0.5 ${style.icon} flex-shrink-0`}>
                    {card.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">{card.title}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${style.badge}`}>
                        {card.severity}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">{card.description}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ═══ Section 2: Trading Calendar ═══ */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-semibold text-gray-900">Trading Calendar</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {upcomingHolidays.length === 0 ? (
            <p className="px-4 py-6 text-xs text-gray-400 text-center">No public holidays in the next 60 days</p>
          ) : (
            upcomingHolidays.map(h => (
              <div
                key={h.date}
                className={`px-4 py-2.5 flex items-center gap-3 ${h.daysUntil === 0 ? 'bg-emerald-50' : ''}`}
              >
                <div className="text-center flex-shrink-0 w-12">
                  <p className="text-xs font-bold text-gray-900">
                    {new Date(h.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric' })}
                  </p>
                  <p className="text-[10px] text-gray-500 uppercase">
                    {new Date(h.date + 'T00:00:00').toLocaleDateString('en-AU', { month: 'short' })}
                  </p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{h.name}</p>
                  <p className="text-[10px] text-gray-500">
                    {h.daysUntil === 0 ? 'Today' : h.daysUntil === 1 ? 'Tomorrow' : `${h.daysUntil} days away`}
                  </p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${IMPACT_STYLES[h.impact] || 'bg-gray-100 text-gray-600'}`}>
                  {h.impact}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ═══ Section 3: Competitor Price Watch ═══ */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-gray-900">Competitor Price Watch</h3>
          </div>
          <button
            onClick={runCompetitorScan}
            disabled={scanning || topSellers7d.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {scanning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Scanning {scanProgress}/{scanTotal}...
              </>
            ) : (
              <>
                <BarChart3 className="w-3.5 h-3.5" />
                Scan Market
              </>
            )}
          </button>
        </div>
        <div className="p-4">
          {competitorResults.length === 0 && !scanning ? (
            <p className="text-xs text-gray-400 text-center py-4">
              Press "Scan Market" to compare your top 5 products against competitor prices
            </p>
          ) : scanning && competitorResults.length === 0 ? (
            <div className="flex flex-col items-center py-6 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              <p className="text-xs text-gray-500">Scanning product {scanProgress} of {scanTotal}...</p>
              <div className="w-48 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                  style={{ width: `${scanTotal > 0 ? (scanProgress / scanTotal) * 100 : 0}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left font-medium text-gray-500 px-4 py-2">Product</th>
                    <th className="text-right font-medium text-gray-500 px-2 py-2">Our Price</th>
                    <th className="text-right font-medium text-gray-500 px-2 py-2">Best Comp.</th>
                    <th className="text-right font-medium text-gray-500 px-2 py-2">Delta</th>
                    <th className="text-right font-medium text-gray-500 px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {competitorResults.map(r => (
                    <tr key={r.product.itemCode} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 max-w-[160px]">
                        <p className="font-medium text-gray-900 truncate">{r.product.description}</p>
                        <p className="text-[10px] text-gray-400">{r.bestSource || 'No data'}</p>
                      </td>
                      <td className="text-right px-2 py-2.5 font-medium text-gray-900">
                        {AUD.format(r.ourPrice)}
                      </td>
                      <td className="text-right px-2 py-2.5 text-gray-600">
                        {r.bestPrice !== null ? AUD.format(r.bestPrice) : '—'}
                      </td>
                      <td className="text-right px-2 py-2.5">
                        {r.delta !== null ? (
                          <span className={`font-medium ${r.delta > 0 ? 'text-red-600' : r.delta < 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                            {r.delta > 0 ? '+' : ''}{AUD.format(r.delta)}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="text-right px-4 py-2.5">
                        {r.delta !== null && r.delta > 0 && (
                          <button className="text-[10px] font-medium text-emerald-600 hover:text-emerald-700 hover:underline whitespace-nowrap">
                            Match Price
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Section 4: Revenue Trends ═══ */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-semibold text-gray-900">Revenue Trends</h3>
          <span className="text-[10px] text-gray-400 ml-auto">Last 30 days</span>
        </div>
        <div className="p-4">
          {trendChartData.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">No trend data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={trendChartData}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e5e7eb' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                  width={45}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                  formatter={(value: number) => [AUD.format(value), 'Revenue']}
                  labelStyle={{ fontSize: 11, color: '#6b7280' }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#059669"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#059669' }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ═══ Section 5: Hourly Heatmap ═══ */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-semibold text-gray-900">Hourly Revenue Heatmap</h3>
          <span className="text-[10px] text-gray-400 ml-auto">Weekly avg</span>
        </div>
        <div className="p-4">
          {hourlyChartData.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">No hourly data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(hourlyChartData.length * 28, 120)}>
              <BarChart data={hourlyChartData} layout="vertical" barCategoryGap={4}>
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e5e7eb' }}
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                  tickLine={false}
                  axisLine={false}
                  width={45}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                  formatter={(value: number) => [AUD.format(value), 'Revenue']}
                  labelStyle={{ fontSize: 11, color: '#6b7280' }}
                />
                <Bar dataKey="revenue" radius={[0, 4, 4, 0]} maxBarSize={20}>
                  {hourlyChartData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={`rgba(5, 150, 105, ${0.2 + entry.intensity * 0.8})`}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ═══ Section 6: Intel Notes ═══ */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-semibold text-gray-900">Intel Notes</h3>
          <span className="text-[10px] text-gray-400 ml-auto">{notes.length} note{notes.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="p-4 space-y-3">
          {/* Add form */}
          <form
            onSubmit={e => { e.preventDefault(); addNote() }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              placeholder="Add local intel (e.g. competitor closed, new estate nearby)..."
              className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder:text-gray-400"
            />
            <button
              type="submit"
              disabled={!newNote.trim()}
              className="flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </form>

          {/* Notes list */}
          {notes.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3">
              No notes yet. Add local market intelligence above.
            </p>
          ) : (
            <div className="space-y-2">
              {notes.map(note => (
                <div
                  key={note.id}
                  className="flex items-start gap-2 p-2.5 rounded-lg bg-gray-50 border border-gray-100 group"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-700">{note.text}</p>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {new Date(note.createdAt).toLocaleDateString('en-AU', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteNote(note.id)}
                    className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                    title="Delete note"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
