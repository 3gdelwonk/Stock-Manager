import { useState, useEffect, useMemo } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import KpiCard from './KpiCard'
import {
  getWasteTrend,
  getWasteVelocity,
  getTopWastedProducts,
  getWasteByReason,
  getWasteEntries,
  type WasteTrendPoint,
  type WasteVelocity,
  type TopWastedProduct,
} from '../../lib/wasteAnalytics'
import type { WasteLogEntry } from '../../lib/types'
import { DEPARTMENT_LABELS, DEPARTMENT_COLORS } from '../../lib/constants'
import type { GroceryDepartment } from '../../lib/types'

type Period = 1 | 7 | 30 | 90

const PERIOD_LABELS: Record<Period, string> = {
  1: 'Today',
  7: 'This Week',
  30: 'This Month',
  90: 'Last 90 Days',
}

const REASON_LABELS: Record<string, string> = {
  expired: 'Expired',
  damaged: 'Damaged',
  quality: 'Quality',
  recall: 'Recall',
  overstock: 'Overstock',
  short_dated: 'Short Dated',
  other: 'Other',
}

const REASON_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#8b5cf6', '#3b82f6', '#14b8a6', '#6b7280']

export default function WasteAnalytics() {
  const [period, setPeriod] = useState<Period>(7)
  const [trend, setTrend] = useState<WasteTrendPoint[]>([])
  const [velocity, setVelocity] = useState<WasteVelocity | null>(null)
  const [topProducts, setTopProducts] = useState<TopWastedProduct[]>([])
  const [byReason, setByReason] = useState<{ reason: string; count: number; cost: number }[]>([])
  const [entries, setEntries] = useState<WasteLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    Promise.all([
      getWasteTrend(period),
      getWasteVelocity(period),
      getTopWastedProducts(period, 10),
      getWasteByReason(period),
      getWasteEntries(period),
    ]).then(([t, v, tp, br, e]) => {
      if (cancelled) return
      setTrend(t)
      setVelocity(v)
      setTopProducts(tp)
      setByReason(br)
      setEntries(e)
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [period])

  const totalCost = useMemo(() => entries.reduce((s, e) => s + e.qty * e.costPrice, 0), [entries])
  const totalItems = useMemo(() => entries.reduce((s, e) => s + e.qty, 0), [entries])

  const byDeptChart = useMemo(() => {
    const map: Record<string, number> = {}
    for (const e of entries) {
      map[e.department] = (map[e.department] || 0) + e.qty * e.costPrice
    }
    return Object.entries(map)
      .map(([dept, cost]) => ({
        dept,
        label: DEPARTMENT_LABELS[dept as GroceryDepartment] || dept,
        cost: Math.round(cost * 100) / 100,
        fill: DEPARTMENT_COLORS[dept as GroceryDepartment] || '#9ca3af',
      }))
      .sort((a, b) => b.cost - a.cost)
  }, [entries])

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading waste analytics...</div>
  }

  return (
    <div className="space-y-5">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total Waste" value={`$${totalCost.toFixed(0)}`} accentColor="#ef4444" valueColor="text-red-600" />
        <KpiCard label="Items Wasted" value={totalItems} accentColor="#f97316" />
        <KpiCard
          label="Velocity ($/day)"
          value={`$${(velocity?.avgCostPerDay ?? 0).toFixed(1)}`}
          accentColor="#8b5cf6"
        />
        <KpiCard
          label="Trend"
          value={`${(velocity?.trendPercent ?? 0) >= 0 ? '+' : ''}${(velocity?.trendPercent ?? 0).toFixed(1)}%`}
          accentColor={velocity?.trendDirection === 'up' ? '#ef4444' : velocity?.trendDirection === 'down' ? '#10b981' : '#6b7280'}
          valueColor={velocity?.trendDirection === 'up' ? 'text-red-600' : velocity?.trendDirection === 'down' ? 'text-emerald-600' : 'text-gray-600'}
          delta={velocity?.trendDirection === 'up' ? 'vs prior period' : velocity?.trendDirection === 'down' ? 'vs prior period' : 'stable'}
          deltaType={velocity?.trendDirection === 'up' ? 'up' : velocity?.trendDirection === 'down' ? 'down' : 'neutral'}
        />
        <KpiCard
          label="Waste/Sales %"
          value={velocity?.wasteOfSalesPercent != null ? `${velocity.wasteOfSalesPercent.toFixed(2)}%` : 'N/A'}
          accentColor="#3b82f6"
        />
        <KpiCard
          label="Avg Items/Day"
          value={(velocity?.avgItemsPerDay ?? 0).toFixed(1)}
          accentColor="#14b8a6"
        />
      </div>

      {/* Period selector */}
      <div className="flex gap-2">
        {([1, 7, 30, 90] as Period[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              period === p ? 'bg-red-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Charts row */}
      <div className="flex flex-col lg:flex-row gap-5">
        {/* Trend chart (left 60%) */}
        <div className="lg:w-[60%] bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Waste Trend (Cost)</h3>
          {trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={d => {
                    const dt = new Date(d + 'T00:00:00')
                    return `${dt.getDate()}/${dt.getMonth() + 1}`
                  }}
                />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} />
                <Tooltip
                  formatter={(val: number) => [`$${val.toFixed(2)}`, 'Cost']}
                  labelFormatter={d => new Date(d + 'T00:00:00').toLocaleDateString()}
                />
                <Line type="monotone" dataKey="costValue" stroke="#ef4444" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex items-center justify-center text-gray-400 text-sm">No data for this period</div>
          )}
        </div>

        {/* Right panel (40%) */}
        <div className="lg:w-[40%] space-y-4">
          {/* Waste by Reason */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">By Reason</h3>
            {byReason.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={byReason.map((r, i) => ({ ...r, name: REASON_LABELS[r.reason] || r.reason, fill: REASON_COLORS[i % REASON_COLORS.length] }))}
                    dataKey="cost"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={60}
                    paddingAngle={2}
                  >
                    {byReason.map((_, i) => (
                      <Cell key={i} fill={REASON_COLORS[i % REASON_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: number) => `$${val.toFixed(2)}`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-gray-400 text-center py-4">No data</p>
            )}
            <div className="flex flex-wrap gap-2 mt-2">
              {byReason.map((r, i) => (
                <span key={r.reason} className="flex items-center gap-1 text-[10px] text-gray-600">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: REASON_COLORS[i % REASON_COLORS.length] }} />
                  {REASON_LABELS[r.reason] || r.reason}: ${r.cost.toFixed(0)}
                </span>
              ))}
            </div>
          </div>

          {/* Waste by Department */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">By Department</h3>
            {byDeptChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={byDeptChart} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} />
                  <YAxis dataKey="label" type="category" tick={{ fontSize: 10 }} width={80} />
                  <Tooltip formatter={(val: number) => `$${val.toFixed(2)}`} />
                  <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                    {byDeptChart.map((d, i) => (
                      <Cell key={i} fill={d.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-gray-400 text-center py-4">No data</p>
            )}
          </div>
        </div>
      </div>

      {/* Bottom row: Top products + Recent entries */}
      <div className="flex flex-col lg:flex-row gap-5">
        {/* Top wasted products */}
        <div className="lg:w-[40%] bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Top Wasted Products</h3>
          {topProducts.length > 0 ? (
            <div className="space-y-2">
              {topProducts.map((p, i) => (
                <div key={p.barcode || i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-900 truncate">{p.productName}</p>
                    <p className="text-[10px] text-gray-500">{DEPARTMENT_LABELS[p.department as GroceryDepartment] || p.department} · {p.occurrences}x logged · {p.totalQty} units</p>
                  </div>
                  <span className="text-xs font-bold text-red-600 shrink-0 ml-2">${p.totalCost.toFixed(2)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 text-center py-4">No waste data for this period</p>
          )}
        </div>

        {/* Recent waste entries */}
        <div className="lg:w-[60%] bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Entries ({entries.length})</h3>
          {entries.length > 0 ? (
            <div className="max-h-[300px] overflow-y-auto space-y-1">
              {entries.slice(0, 50).map(e => (
                <div key={e.id} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium text-gray-900 truncate">{e.productName}</p>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                        e.reason === 'expired' ? 'bg-red-100 text-red-700' :
                        e.reason === 'damaged' ? 'bg-orange-100 text-orange-700' :
                        e.reason === 'quality' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {REASON_LABELS[e.reason] || e.reason}
                      </span>
                      {e.claimable && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Claimable</span>}
                    </div>
                    <p className="text-[10px] text-gray-500">
                      {e.unitType === 'kg' ? `${e.weightKg}kg` : `x${e.qty}`}
                      {' · '}{DEPARTMENT_LABELS[e.department as GroceryDepartment] || e.department}
                      {' · '}{new Date(e.loggedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-red-600 shrink-0">${(e.qty * e.costPrice).toFixed(2)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 text-center py-4">No waste entries in this period</p>
          )}
        </div>
      </div>
    </div>
  )
}
