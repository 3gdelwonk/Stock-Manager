import { Mail, Truck, AlertTriangle, Calendar } from 'lucide-react'

const MOCK_EXTRACTIONS = [
  { icon: Truck, color: 'text-blue-500', bg: 'bg-blue-50', from: 'deliveries@metcash.com', subject: 'Delivery Confirmation — Order #MC-4521', type: 'Delivery' },
  { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50', from: 'logistics@coca-cola.com.au', subject: 'Short Delivery Notice — 3 items shorted', type: 'Short Delivery' },
  { icon: Calendar, color: 'text-amber-500', bg: 'bg-amber-50', from: 'orders@petersicecream.com.au', subject: 'Order Cutoff Reminder — Due Thu 2pm', type: 'Cutoff' },
]

export default function GmailScoutPlaceholder() {
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-red-500/10 to-pink-500/10 border border-red-200/50 rounded-xl p-6 text-center">
        <Mail size={32} className="mx-auto text-red-500 mb-3" />
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Gmail Scout — Coming in Phase 3</h2>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          Automatically scan supplier emails for delivery confirmations, short deliveries, order cutoffs, and short-dated stock alerts.
        </p>
      </div>

      <div className="space-y-3 opacity-60">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Preview</p>
        {MOCK_EXTRACTIONS.map((ext, i) => {
          const Icon = ext.icon
          return (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 flex gap-4 items-start">
              <div className={`w-9 h-9 rounded-lg ${ext.bg} flex items-center justify-center shrink-0`}>
                <Icon size={18} className={ext.color} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{ext.subject}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{ext.from}</p>
                <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{ext.type}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
