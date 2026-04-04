import { Lightbulb, TrendingUp, AlertTriangle, DollarSign } from 'lucide-react'

const MOCK_INSIGHTS = [
  { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50', title: 'Dairy waste spike detected', body: 'Dairy department waste up 23% vs last month — milk & yoghurt overstock likely.' },
  { icon: TrendingUp, color: 'text-blue-500', bg: 'bg-blue-50', title: 'Frozen meals trending', body: 'Frozen ready meals velocity up 18% — consider increasing facings and min stock.' },
  { icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-50', title: 'Promo ROI opportunity', body: '3 promotions ending this week have negative ROI — consider not reordering promo stock.' },
]

export default function InsightsPlaceholder() {
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-200/50 rounded-xl p-6 text-center">
        <Lightbulb size={32} className="mx-auto text-indigo-500 mb-3" />
        <h2 className="text-lg font-semibold text-gray-900 mb-1">AI Insights — Coming in Phase 2</h2>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          Automated intelligence from your stock data: waste patterns, trend detection, promo ROI analysis, and actionable recommendations.
        </p>
      </div>

      <div className="space-y-3 opacity-60">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Preview</p>
        {MOCK_INSIGHTS.map((ins, i) => {
          const Icon = ins.icon
          return (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 flex gap-4 items-start">
              <div className={`w-9 h-9 rounded-lg ${ins.bg} flex items-center justify-center shrink-0`}>
                <Icon size={18} className={ins.color} />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{ins.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{ins.body}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
