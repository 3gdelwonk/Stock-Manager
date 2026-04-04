import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface KpiCardProps {
  label: string
  value: string | number
  delta?: string
  deltaType?: 'up' | 'down' | 'neutral'
  accentColor: string
  valueColor?: string
}

export default function KpiCard({ label, value, delta, deltaType = 'neutral', accentColor, valueColor }: KpiCardProps) {
  const DeltaIcon = deltaType === 'up' ? TrendingUp : deltaType === 'down' ? TrendingDown : Minus
  const deltaColor = deltaType === 'up' ? 'text-red-500' : deltaType === 'down' ? 'text-emerald-500' : 'text-gray-400'

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-col" style={{ borderLeft: `3px solid ${accentColor}` }}>
      <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${valueColor || 'text-gray-900'}`}>{value}</p>
      {delta && (
        <div className={`flex items-center gap-1 mt-1.5 text-[11px] font-medium ${deltaColor}`}>
          <DeltaIcon size={12} />
          <span>{delta}</span>
        </div>
      )}
    </div>
  )
}
