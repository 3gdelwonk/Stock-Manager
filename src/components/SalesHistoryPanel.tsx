import { useState, useEffect, useRef } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, ShoppingCart } from 'lucide-react'
import { getItemSales, type ItemSalesData, type DailySale } from '../lib/jarvis'

function fmtMoney(n: number): string {
  return n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function formatDateShort(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()}/${d.getMonth() + 1}`
}

interface Props {
  itemCode: string
  days?: number
  compact?: boolean
}

export default function SalesHistoryPanel({ itemCode, days = 28, compact = false }: Props) {
  const [data, setData] = useState<ItemSalesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fetched = useRef(false)

  useEffect(() => {
    if (fetched.current) return
    fetched.current = true
    setLoading(true)
    getItemSales(itemCode, days)
      .then(setData)
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false))
  }, [itemCode, days])

  if (loading) {
    return (
      <div className={`${compact ? 'bg-gray-50 rounded-lg p-3' : 'bg-white rounded-lg border border-gray-100 p-4'}`}>
        <div className="flex items-center gap-1.5">
          <ShoppingCart size={compact ? 12 : 14} className="text-gray-400" />
          <span className={`${compact ? 'text-xs' : 'text-sm'} text-gray-400 animate-pulse`}>Loading sales history...</span>
        </div>
      </div>
    )
  }

  if (error || !data || data.dailySales.length === 0) {
    return (
      <div className={`${compact ? 'bg-gray-50 rounded-lg p-3' : 'bg-white rounded-lg border border-gray-100 p-4'}`}>
        <div className="flex items-center gap-1.5">
          <ShoppingCart size={compact ? 12 : 14} className="text-gray-400" />
          <span className={`${compact ? 'text-xs' : 'text-sm'} text-gray-400`}>
            {error ? 'Sales data unavailable' : 'No sales in this period'}
          </span>
        </div>
      </div>
    )
  }

  const { summary, dailySales } = data
  const chartData = dailySales.map((d: DailySale) => ({
    date: formatDateShort(d.date),
    fullDate: formatDate(d.date),
    qty: d.qty,
    revenue: d.revenue,
  }))

  const trend = dailySales.length >= 14
    ? (() => {
        const half = Math.floor(dailySales.length / 2)
        const first = dailySales.slice(0, half).reduce((s, d) => s + d.qty, 0) / half
        const second = dailySales.slice(half).reduce((s, d) => s + d.qty, 0) / (dailySales.length - half)
        if (first === 0) return null
        return ((second - first) / first) * 100
      })()
    : null

  return (
    <div className={`${compact ? 'bg-gray-50 rounded-lg p-3' : 'bg-white rounded-lg border border-gray-100 p-4'} space-y-2`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ShoppingCart size={compact ? 12 : 14} className="text-indigo-600" />
          <span className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-gray-700`}>
            Sales History ({days}d)
          </span>
        </div>
        {trend !== null && (
          <span className={`flex items-center gap-0.5 ${compact ? 'text-[10px]' : 'text-xs'} font-medium ${
            trend > 5 ? 'text-emerald-600' : trend < -5 ? 'text-red-600' : 'text-gray-500'
          }`}>
            <TrendingUp size={compact ? 9 : 11} className={trend < -5 ? 'rotate-180' : ''} />
            {trend > 0 ? '+' : ''}{trend.toFixed(0)}%
          </span>
        )}
      </div>

      {/* Summary stats */}
      <div className={`grid ${compact ? 'grid-cols-4 gap-1.5' : 'grid-cols-4 gap-3'}`}>
        <div className="text-center">
          <p className={`${compact ? 'text-[9px]' : 'text-xs'} text-gray-400 uppercase`}>Total Sold</p>
          <p className={`${compact ? 'text-sm' : 'text-base'} font-bold text-gray-800`}>{summary.totalQty}</p>
        </div>
        <div className="text-center">
          <p className={`${compact ? 'text-[9px]' : 'text-xs'} text-gray-400 uppercase`}>Avg/Day</p>
          <p className={`${compact ? 'text-sm' : 'text-base'} font-bold text-gray-800`}>{summary.avgDailyQty.toFixed(1)}</p>
        </div>
        <div className="text-center">
          <p className={`${compact ? 'text-[9px]' : 'text-xs'} text-gray-400 uppercase`}>Revenue</p>
          <p className={`${compact ? 'text-sm' : 'text-base'} font-bold text-emerald-600`}>${fmtMoney(summary.totalRevenue)}</p>
        </div>
        <div className="text-center">
          <p className={`${compact ? 'text-[9px]' : 'text-xs'} text-gray-400 uppercase`}>Active Days</p>
          <p className={`${compact ? 'text-sm' : 'text-base'} font-bold text-gray-800`}>
            {summary.daysWithSales}<span className="text-gray-400 font-normal">/{days}</span>
          </p>
        </div>
      </div>

      {/* Bar chart */}
      <div className={compact ? 'h-24' : 'h-32'}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 2, right: 0, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: compact ? 8 : 10, fill: '#9ca3af' }}
              interval={Math.max(0, Math.floor(chartData.length / 7) - 1)}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: compact ? 8 : 10, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload
                return (
                  <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-2.5 py-1.5 text-xs">
                    <p className="font-medium text-gray-700">{d.fullDate}</p>
                    <p className="text-indigo-600">{d.qty} sold &middot; ${fmtMoney(d.revenue)}</p>
                  </div>
                )
              }}
            />
            <Bar dataKey="qty" fill="#818cf8" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
