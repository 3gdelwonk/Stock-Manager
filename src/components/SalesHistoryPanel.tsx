import { useState, useEffect, useRef } from 'react'
import { ShoppingCart } from 'lucide-react'
import { getItemSales, type ItemSalesData } from '../lib/jarvis'

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
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

  const wrapper = compact ? 'bg-gray-50 rounded-lg p-3' : 'bg-white rounded-lg border border-gray-100 p-4'
  const iconSize = compact ? 12 : 14
  const labelSize = compact ? 'text-xs' : 'text-sm'

  if (loading) {
    return (
      <div className={wrapper}>
        <div className="flex items-center gap-1.5">
          <ShoppingCart size={iconSize} className="text-gray-400" />
          <span className={`${labelSize} text-gray-400 animate-pulse`}>Loading sales history...</span>
        </div>
      </div>
    )
  }

  if (error || !data || data.dailySales.length === 0) {
    return (
      <div className={wrapper}>
        <div className="flex items-center gap-1.5">
          <ShoppingCart size={iconSize} className="text-gray-400" />
          <span className={`${labelSize} text-gray-400`}>
            {error ? 'Sales data unavailable' : 'No sales in this period'}
          </span>
        </div>
      </div>
    )
  }

  const activeDays = data.dailySales
    .filter(d => d.qty > 0)
    .sort((a, b) => b.date.localeCompare(a.date))

  if (activeDays.length === 0) {
    return (
      <div className={wrapper}>
        <div className="flex items-center gap-1.5">
          <ShoppingCart size={iconSize} className="text-gray-400" />
          <span className={`${labelSize} text-gray-400`}>No sales in this period</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`${wrapper} space-y-1`}>
      <div className="flex items-center gap-1.5">
        <ShoppingCart size={iconSize} className="text-indigo-600" />
        <span className={`${labelSize} font-semibold text-gray-700`}>
          Recent Sales ({data.summary.totalQty} sold in {days}d)
        </span>
      </div>
      {activeDays.map(d => (
        <div key={d.date} className={`flex items-center justify-between ${compact ? 'text-xs' : 'text-sm'} text-gray-500`}>
          <span>{formatDate(d.date)}</span>
          <span className="font-medium text-gray-700">{d.qty}</span>
        </div>
      ))}
    </div>
  )
}
