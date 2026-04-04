import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Activity } from 'lucide-react'
import { db } from '../../lib/db'
import { daysUntilExpiry } from '../../lib/expiry'
import { DEPARTMENT_LABELS, DEPARTMENT_COLORS } from '../../lib/constants'
import type { ExpiryBatch, GroceryDepartment } from '../../lib/types'

interface ExpiryRiskPanelProps {
  batches: ExpiryBatch[]
}

export default function ExpiryRiskPanel({ batches }: ExpiryRiskPanelProps) {
  const wasteLog = useLiveQuery(() => db.wasteLog.toArray(), [])
  const salesRecords = useLiveQuery(() => db.salesRecords.toArray(), [])

  // Waste by department chart data
  const wasteByDept = useMemo(() => {
    if (!wasteLog) return []
    const map = new Map<string, number>()
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    for (const w of wasteLog) {
      if (w.loggedAt >= monthStart) {
        const dept = w.department || 'other'
        map.set(dept, (map.get(dept) || 0) + w.qty * w.costPrice)
      }
    }
    return Array.from(map.entries())
      .map(([dept, value]) => ({
        dept,
        label: DEPARTMENT_LABELS[dept as GroceryDepartment] || dept,
        value: Math.round(value),
        color: DEPARTMENT_COLORS[dept as GroceryDepartment] || '#9ca3af',
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [wasteLog])

  // Velocity vs Expiry Risk: items where daysOfStock > daysUntilExpiry
  // (meaning stock won't sell before it expires)
  const velocityRisk = useMemo(() => {
    if (!salesRecords) return []

    // Compute velocity per barcode from last 30 days of sales
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const cutoff = thirtyDaysAgo.toISOString().slice(0, 10)

    const velocityMap = new Map<string, number>()
    for (const r of salesRecords) {
      if (r.date >= cutoff) {
        velocityMap.set(r.barcode, (velocityMap.get(r.barcode) || 0) + r.qtySold)
      }
    }
    // Convert to daily velocity
    for (const [k, v] of velocityMap) {
      velocityMap.set(k, v / 30)
    }

    return batches
      .map(b => {
        const days = daysUntilExpiry(b.expiryDate)
        const dailyVelocity = velocityMap.get(b.barcode) || 0
        const daysToSell = dailyVelocity > 0 ? b.qtyRemaining / dailyVelocity : Infinity
        const atRisk = daysToSell > days && days >= 0
        return { ...b, days, dailyVelocity, daysToSell: Math.round(daysToSell), atRisk }
      })
      .filter(b => b.atRisk && b.days <= 14)
      .sort((a, b) => (a.days - a.daysToSell) - (b.days - b.daysToSell))
      .slice(0, 8)
  }, [batches, salesRecords])

  // Simple high-risk fallback (no sales data)
  const riskItems = useMemo(() => {
    if (velocityRisk.length > 0) return []
    return batches
      .map(b => ({ ...b, days: daysUntilExpiry(b.expiryDate) }))
      .filter(b => b.days <= 7 && b.days >= 0 && b.qtyRemaining > 3)
      .sort((a, b) => a.days - b.days || b.qtyRemaining - a.qtyRemaining)
      .slice(0, 6)
  }, [batches, velocityRisk])

  return (
    <div className="space-y-4">
      {/* Velocity vs Expiry Risk */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={14} className="text-amber-500" />
          <h3 className="text-[13px] font-semibold text-gray-900">Velocity vs Expiry Risk</h3>
        </div>
        <p className="text-[10px] text-gray-400 mb-2">Items that won't sell before expiry at current rate</p>
        {velocityRisk.length > 0 ? (
          <div className="space-y-2">
            {velocityRisk.map(item => (
              <div key={item.id} className="flex items-center gap-2 text-xs">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.days <= 3 ? 'bg-red-500' : item.days <= 7 ? 'bg-amber-500' : 'bg-blue-500'}`} />
                <span className="flex-1 truncate text-gray-700">{item.productName}</span>
                <span className="text-gray-400 shrink-0" title="Qty remaining">×{item.qtyRemaining}</span>
                <span className="text-[10px] text-gray-400 shrink-0" title="Days to sell at current velocity">{item.daysToSell === Infinity ? '∞' : `${item.daysToSell}d`} sell</span>
                <span className={`font-semibold shrink-0 ${item.days <= 3 ? 'text-red-500' : 'text-amber-500'}`}>{item.days}d exp</span>
              </div>
            ))}
          </div>
        ) : riskItems.length > 0 ? (
          <div className="space-y-2">
            {riskItems.map(item => (
              <div key={item.id} className="flex items-center gap-2 text-xs">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.days <= 1 ? 'bg-red-500' : item.days <= 3 ? 'bg-amber-500' : 'bg-blue-500'}`} />
                <span className="flex-1 truncate text-gray-700">{item.productName}</span>
                <span className="text-gray-400 shrink-0">×{item.qtyRemaining}</span>
                <span className={`font-semibold shrink-0 ${item.days <= 1 ? 'text-red-500' : 'text-amber-500'}`}>{item.days}d</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400 text-center py-4">No high-risk items</p>
        )}
      </div>

      {/* Waste by Department chart */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <h3 className="text-[13px] font-semibold text-gray-900 mb-3">Waste by Department (MTD)</h3>
        {wasteByDept.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">No waste data this month</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={wasteByDept} layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={80} />
              <Tooltip formatter={(v: number) => `$${v}`} contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
                {wasteByDept.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
