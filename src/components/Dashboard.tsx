import { useState, useEffect, useCallback, useMemo } from 'react'
import { RefreshCw, WifiOff, TrendingUp, TrendingDown, AlertTriangle, ScanBarcode, Search, Clock, Tag, Package, ChevronDown, Zap } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { checkConnection, getSalesSummary, getDepartmentBreakdown, getTopSellers, getTopByDepartment, type SalesSummary, type DepartmentBreakdown, type TopSeller, type TopByDeptEntry } from '../lib/jarvis'
import { getExpirySummary, type ExpirySummary } from '../lib/expiry'
import { DEPARTMENT_COLORS, DEPARTMENT_LABELS } from '../lib/constants'
import { DEPT_NAME_MAP } from '../lib/constants'
import type { GroceryDepartment } from '../lib/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AUD = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })
const AUD_COMPACT = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })

function fmtMoney(v: number, compact = false): string {
  return compact ? AUD_COMPACT.format(v) : AUD.format(v)
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return '—'
  return `${v.toFixed(1)}%`
}

function fmtTime(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
}

function resolveDept(rawName: string): GroceryDepartment {
  const upper = rawName.toUpperCase().trim()
  if (DEPT_NAME_MAP[upper]) return DEPT_NAME_MAP[upper]
  for (const [key, dept] of Object.entries(DEPT_NAME_MAP)) {
    if (upper.includes(key) || key.includes(upper)) return dept
  }
  return 'other'
}

function deptColor(rawName: string): string {
  return DEPARTMENT_COLORS[resolveDept(rawName)] || '#9ca3af'
}

function deptLabel(rawName: string): string {
  return DEPARTMENT_LABELS[resolveDept(rawName)] || rawName
}

const REFRESH_INTERVAL = 5 * 60 * 1000

// ─── Component ────────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'stock' | 'expiry' | 'insights' | 'track'

interface DashboardProps {
  onNavigate?: (tab: Tab, action?: 'scan' | 'search') => void
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  // ── State ────────────────────
  const [connected, setConnected] = useState<boolean | null>(null)
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [sales, setSales] = useState<SalesSummary | null>(null)
  const [yesterdaySales, setYesterdaySales] = useState<SalesSummary | null>(null)
  const [departments, setDepartments] = useState<DepartmentBreakdown[]>([])
  const [topSellers, setTopSellers] = useState<TopSeller[]>([])
  const [expiry, setExpiry] = useState<ExpirySummary | null>(null)

  // Department drill-down — one fetch for ALL depts, picked client-side on tap
  const [expandedDept, setExpandedDept] = useState<string | null>(null)
  const [deptTopMap, setDeptTopMap] = useState<Record<string, TopByDeptEntry[]> | null>(null)
  const [deptTopLoading, setDeptTopLoading] = useState(false)
  const [deptTopError, setDeptTopError] = useState<string | null>(null)

  // ── Fetch All ────────────────
  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)

    try {
      const conn = await checkConnection()
      setConnected(conn.connected)

      if (!conn.connected) {
        // Still load local expiry data when offline
        try {
          const exp = await getExpirySummary()
          setExpiry(exp)
        } catch { /* ignore */ }
        setLoading(false)
        setRefreshing(false)
        return
      }

      const [todaySales, yestSales, depts, sellers, exp] = await Promise.all([
        getSalesSummary('today'),
        getSalesSummary('yesterday').catch(() => null),
        getDepartmentBreakdown('today'),
        getTopSellers(7, 10),
        getExpirySummary().catch(() => null),
      ])

      setSales(todaySales)
      setYesterdaySales(yestSales)
      setDepartments(depts)
      setTopSellers(sellers)
      setExpiry(exp)
      setLastFetch(new Date())
    } catch (err) {
      setError((err as Error).message || 'Failed to fetch data')
      setConnected(false)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // ── Auto-refresh ─────────────
  useEffect(() => {
    fetchAll()
    const id = setInterval(() => fetchAll(true), REFRESH_INTERVAL)
    return () => clearInterval(id)
  }, [fetchAll])

  // ── Department drill-down: fetch ALL depts once, normalize keys ──
  const loadDeptTopMap = useCallback(async () => {
    setDeptTopLoading(true)
    setDeptTopError(null)
    try {
      const res = await getTopByDepartment({ sort: 'velocity', perDept: 5, days: 7 })
      const map: Record<string, TopByDeptEntry[]> = {}
      for (const [key, bucket] of Object.entries(res.byDepartment || {})) {
        const norm = key.toUpperCase().trim()
        map[norm] = bucket?.top ?? []
      }
      console.log('[dashboard] dept velocity map loaded', {
        keys: Object.keys(map),
        counts: Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v.length])),
      })
      setDeptTopMap(map)
    } catch (err) {
      setDeptTopError((err as Error).message || 'Failed to load')
    } finally {
      setDeptTopLoading(false)
    }
  }, [])

  const handleDeptClick = useCallback((rawName: string) => {
    if (expandedDept === rawName) {
      setExpandedDept(null)
      return
    }
    setExpandedDept(rawName)
    if (!deptTopMap && !deptTopLoading) {
      loadDeptTopMap()
    }
  }, [expandedDept, deptTopMap, deptTopLoading, loadDeptTopMap])

  // ── Derived: sorted departments ──
  // Show ALL departments the server returned (not just ones with sales today),
  // so hidden/zero-sales depts are visible. Sort by sales desc, then name.
  const sortedDepts = useMemo(
    () => [...departments].sort((a, b) => {
      if (b.sales !== a.sales) return b.sales - a.sales
      return a.department.localeCompare(b.department)
    }),
    [departments],
  )

  // ── Derived: chart data (only non-zero sales — zero bars are noise) ──
  const chartData = useMemo(
    () => sortedDepts.filter(d => d.sales > 0).slice(0, 8).map(d => ({
      name: deptLabel(d.department),
      revenue: Math.round(d.sales),
      color: deptColor(d.department),
    })),
    [sortedDepts],
  )

  // ── Derived: top profit products ──
  const topProfit = useMemo(
    () => [...topSellers].sort((a, b) => (b.revenue - b.cost) - (a.revenue - a.cost)).slice(0, 10),
    [topSellers],
  )

  // ── Revenue comparison ──
  const revenueChange = sales && yesterdaySales
    ? ((sales.totalRevenue - yesterdaySales.totalRevenue) / (yesterdaySales.totalRevenue || 1)) * 100
    : null

  // ─── Loading State ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
        <p className="text-sm text-gray-500">Loading dashboard...</p>
      </div>
    )
  }

  // ─── Offline-only State ─────────────────────────────────────────────────────

  if (connected === false && !sales) {
    return (
      <div className="space-y-4 p-4">
        {/* Offline banner */}
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
          <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="text-sm text-amber-800 font-medium">Offline — showing local data only</span>
        </div>
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <span className="text-sm text-red-700 font-medium">Connection failed</span>
            </div>
            <p className="text-xs text-red-600 mt-1">{error}</p>
          </div>
        )}
        {/* Expiry section still works offline */}
        {expiry && <ExpiryCard expiry={expiry} />}
        <QuickActions onNavigate={onNavigate} />
        <button
          onClick={() => fetchAll(true)}
          disabled={refreshing}
          className="w-full py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium active:bg-emerald-700 disabled:opacity-50"
        >
          {refreshing ? 'Retrying...' : 'Retry Connection'}
        </button>
        <p className="text-xs text-gray-400 text-center">
          Check JARVISmart URL in Settings. If using HTTPS, ensure your API also uses HTTPS.
        </p>
      </div>
    )
  }

  // ─── Main Dashboard ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 p-4 pb-24">
      {/* 1. Status Banner */}
      <div className="flex items-center justify-between rounded-lg bg-white border border-gray-200 px-3 py-2 shadow-sm">
        <div className="flex items-center gap-2">
          {connected ? (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-sm font-medium text-emerald-700">Live</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-medium text-amber-600">Offline</span>
            </>
          )}
          {lastFetch && (
            <span className="text-xs text-gray-400 ml-1">
              <Clock className="w-3 h-3 inline mr-0.5 -mt-0.5" />
              {fmtTime(lastFetch)}
            </span>
          )}
        </div>
        <button
          onClick={() => fetchAll(true)}
          disabled={refreshing}
          className="p-1.5 rounded-md hover:bg-gray-100 active:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 text-gray-500 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <span className="text-sm text-red-700 font-medium">Error</span>
          </div>
          <p className="text-xs text-red-600 mt-1">{error}</p>
        </div>
      )}

      {/* 2. Daily KPI Strip */}
      {sales && (
        <div className="grid grid-cols-2 gap-3">
          {/* Revenue */}
          <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 p-3 shadow-sm">
            <p className="text-xs text-emerald-600 font-medium mb-1">Revenue</p>
            <p className="text-xl font-bold text-gray-900">{fmtMoney(sales.totalRevenue, true)}</p>
            {revenueChange !== null && (
              <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${revenueChange >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {revenueChange >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {revenueChange >= 0 ? '+' : ''}{revenueChange.toFixed(1)}% vs yesterday
              </div>
            )}
          </div>
          {/* Gross Profit */}
          <div className="rounded-xl bg-gradient-to-br from-green-50 to-white border border-green-100 p-3 shadow-sm">
            <p className="text-xs text-green-600 font-medium mb-1">Gross Profit</p>
            <p className="text-xl font-bold text-gray-900">{fmtMoney(sales.grossProfit, true)}</p>
            <p className="text-xs text-gray-400 mt-1">{fmtPct(sales.grossMarginPercent)} margin</p>
          </div>
        </div>
      )}

      {/* 3. Secondary KPIs */}
      {sales && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-white border border-gray-200 p-2.5 text-center shadow-sm">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Margin</p>
            <p className="text-lg font-bold text-gray-900 mt-0.5">{fmtPct(sales.grossMarginPercent)}</p>
          </div>
          <div className="rounded-lg bg-white border border-gray-200 p-2.5 text-center shadow-sm">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Trans</p>
            <p className="text-lg font-bold text-gray-900 mt-0.5">{sales.totalTransactions.toLocaleString('en-AU')}</p>
          </div>
          <div className="rounded-lg bg-white border border-gray-200 p-2.5 text-center shadow-sm">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Avg Basket</p>
            <p className="text-lg font-bold text-gray-900 mt-0.5">{fmtMoney(sales.avgBasketSize)}</p>
          </div>
        </div>
      )}

      {/* Department Bar Chart */}
      {chartData.length > 0 && (
        <div className="rounded-xl bg-white border border-gray-200 p-3 shadow-sm">
          <p className="text-xs font-semibold text-gray-700 mb-2">Revenue by Department</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
              <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-30} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 9 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(value: number) => [fmtMoney(value), 'Revenue']}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 4. Department Tiles — tap to see top-velocity products */}
      {sortedDepts.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2">Departments Today</p>
          <div className="grid grid-cols-2 gap-2">
            {sortedDepts.map(d => {
              const color = deptColor(d.department)
              const isExpanded = expandedDept === d.department
              const label = deptLabel(d.department)
              const showRaw = label.toUpperCase() !== d.department.toUpperCase()
              return (
                <button
                  key={d.code}
                  type="button"
                  onClick={() => handleDeptClick(d.department)}
                  aria-expanded={isExpanded}
                  className={`rounded-lg bg-white border p-2.5 shadow-sm text-left transition-all active:scale-[0.98] ${
                    isExpanded ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-gray-200 hover:border-gray-300'
                  }`}
                  style={{ borderLeftWidth: 4, borderLeftColor: color }}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-gray-800 truncate">{label}</p>
                      {showRaw && (
                        <p className="text-[9px] text-gray-400 uppercase tracking-wide truncate">{d.department}</p>
                      )}
                    </div>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </div>
                  <p className="text-sm font-bold text-gray-900 mt-0.5">{fmtMoney(d.sales, true)}</p>
                  <p className="text-[10px] text-gray-400">{fmtPct(d.marginPercent)} margin</p>
                </button>
              )
            })}
          </div>

          {/* Expanded drill-down panel — top-velocity products for the tapped dept */}
          {expandedDept && (() => {
            const dept = sortedDepts.find(d => d.department === expandedDept)
            if (!dept) return null
            const color = deptColor(dept.department)
            const items = deptTopMap?.[expandedDept.toUpperCase().trim()] ?? []
            const hasLoadedMap = deptTopMap !== null
            return (
              <div
                className="mt-2 rounded-lg bg-white border border-gray-200 shadow-sm overflow-hidden"
                style={{ borderLeftWidth: 4, borderLeftColor: color }}
              >
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Zap className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <p className="text-xs font-semibold text-gray-700 truncate">
                      Fastest moving · {deptLabel(dept.department)}
                      {deptLabel(dept.department).toUpperCase() !== dept.department.toUpperCase() && (
                        <span className="ml-1 text-[10px] text-gray-400 font-normal">({dept.department})</span>
                      )}
                    </p>
                  </div>
                  <span className="text-[10px] text-gray-400 shrink-0">Last 7 days</span>
                </div>

                {deptTopLoading && !hasLoadedMap ? (
                  <div className="flex items-center justify-center py-6">
                    <RefreshCw className="w-4 h-4 text-emerald-600 animate-spin" />
                  </div>
                ) : deptTopError && !hasLoadedMap ? (
                  <div className="px-3 py-4 text-center">
                    <p className="text-xs text-red-600">{deptTopError}</p>
                    <button
                      onClick={() => loadDeptTopMap()}
                      className="text-[11px] text-emerald-600 underline mt-1"
                    >
                      Retry
                    </button>
                  </div>
                ) : items.length === 0 ? (
                  <div className="px-3 py-4 text-center">
                    <p className="text-xs text-gray-400">No velocity data for this department.</p>
                    {hasLoadedMap && deptTopMap && (
                      <p className="text-[10px] text-gray-300 mt-1 break-all">
                        Server keys: {Object.keys(deptTopMap).join(', ') || '(empty)'}
                      </p>
                    )}
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {items.map((item, i) => (
                      <li key={item.itemCode || i} className="px-3 py-2">
                        <div className="flex items-start gap-2">
                          <span className="text-xs font-bold text-gray-400 w-5 text-right shrink-0 mt-0.5">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-900 truncate leading-tight">{item.description.trim() || item.itemCode}</p>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[10px]">
                              <span className="text-gray-500">
                                <span className="font-semibold text-gray-700">{item.qtySold.toLocaleString('en-AU')}</span> sold
                              </span>
                              <span className="text-gray-300">·</span>
                              <span className="text-gray-500">
                                <span className="font-semibold text-gray-700">{fmtMoney(item.revenue, true)}</span> rev
                              </span>
                              <span className="text-gray-300">·</span>
                              <span className={`font-semibold ${item.gpPct < 0 ? 'text-red-600' : item.gpPct < 10 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                {fmtPct(item.gpPct)} GP
                              </span>
                              <span className="text-gray-300">·</span>
                              <span className="text-gray-400">QOH {item.qoh}</span>
                            </div>
                          </div>
                          <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200">
                            {item.avgDailyVelocity.toFixed(1)}/day
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* 5. Top 10 Velocity Products */}
      {topSellers.length > 0 && (
        <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-3 pt-3 pb-1.5 flex items-center gap-1.5">
            <Package className="w-4 h-4 text-emerald-600" />
            <p className="text-xs font-semibold text-gray-700">Top 10 Velocity (7 days)</p>
          </div>
          <div className="divide-y divide-gray-100">
            {topSellers
              .sort((a, b) => b.quantitySold - a.quantitySold)
              .slice(0, 10)
              .map((item, i) => (
                <div key={item.itemCode} className="flex items-center gap-2 px-3 py-2">
                  <span className="text-xs font-bold text-gray-400 w-5 text-right shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 truncate leading-tight">{item.description}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className="inline-block text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full text-white leading-none"
                        style={{ backgroundColor: deptColor(item.department) }}
                      >
                        {deptLabel(item.department)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold text-gray-900">{item.quantitySold.toLocaleString('en-AU')} u</p>
                    <p className="text-[10px] text-gray-400">{fmtMoney(item.revenue)}</p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 6. Top 10 Profit Products */}
      {topProfit.length > 0 && (
        <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-3 pt-3 pb-1.5 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <p className="text-xs font-semibold text-gray-700">Top 10 Profit (7 days)</p>
          </div>
          <div className="divide-y divide-gray-100">
            {topProfit.map((item, i) => {
              const gp = item.revenue - item.cost
              const margin = item.revenue > 0 ? (gp / item.revenue) * 100 : 0
              return (
                <div key={item.itemCode} className="flex items-center gap-2 px-3 py-2">
                  <span className="text-xs font-bold text-gray-400 w-5 text-right shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 truncate leading-tight">{item.description}</p>
                    <span
                      className="inline-block text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full text-white leading-none mt-0.5"
                      style={{ backgroundColor: deptColor(item.department) }}
                    >
                      {deptLabel(item.department)}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold text-emerald-700">{fmtMoney(gp)}</p>
                    <p className="text-[10px] text-gray-400">{fmtPct(margin)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 7. Expiry Alerts */}
      {expiry && <ExpiryCard expiry={expiry} />}

      {/* 8. Quick Actions */}
      <QuickActions onNavigate={onNavigate} />
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ExpiryCard({ expiry }: { expiry: ExpirySummary }) {
  return (
    <div className="rounded-xl bg-white border border-gray-200 p-3 shadow-sm">
      <div className="flex items-center gap-1.5 mb-2">
        <AlertTriangle className="w-4 h-4 text-emerald-600" />
        <p className="text-xs font-semibold text-gray-700">Expiry Alerts</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-2">
        {expiry.expiredCount > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            {expiry.expiredCount} expired
          </span>
        )}
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-50 text-red-600 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          {expiry.redCount} red
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 text-amber-600 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          {expiry.amberCount} amber
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-50 text-green-600 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          {expiry.greenCount} green
        </span>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{expiry.totalActiveBatches} active batches</span>
        <span>Waste this month: <span className="font-semibold text-red-600">{fmtMoney(expiry.wasteValueThisMonth)}</span></span>
      </div>
    </div>
  )
}

function QuickActions({ onNavigate }: { onNavigate?: DashboardProps['onNavigate'] }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <button
        onClick={() => onNavigate?.('stock', 'scan')}
        className="flex flex-col items-center gap-1.5 rounded-xl bg-emerald-600 text-white py-3 shadow-sm active:bg-emerald-700 transition-colors"
      >
        <ScanBarcode className="w-5 h-5" />
        <span className="text-xs font-semibold">Scan</span>
      </button>
      <button
        onClick={() => onNavigate?.('stock', 'search')}
        className="flex flex-col items-center gap-1.5 rounded-xl bg-white border border-gray-200 text-gray-700 py-3 shadow-sm active:bg-gray-50 transition-colors"
      >
        <Search className="w-5 h-5" />
        <span className="text-xs font-semibold">Search</span>
      </button>
      <button
        onClick={() => onNavigate?.('expiry')}
        className="flex flex-col items-center gap-1.5 rounded-xl bg-white border border-gray-200 text-gray-700 py-3 shadow-sm active:bg-gray-50 transition-colors"
      >
        <Tag className="w-5 h-5" />
        <span className="text-xs font-semibold">Import</span>
      </button>
    </div>
  )
}
