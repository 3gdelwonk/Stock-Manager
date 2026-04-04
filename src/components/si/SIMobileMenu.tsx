import { X, Clock, Lightbulb, Zap, Calendar, Mail } from 'lucide-react'
import type { SIView } from './SISidebar'

interface SIMobileMenuProps {
  open: boolean
  onClose: () => void
  activeView: SIView
  onNavigate: (view: SIView) => void
}

const ITEMS: { id: SIView; label: string; icon: typeof Clock }[] = [
  { id: 'expiry', label: 'Expiry Watch', icon: Clock },
  { id: 'insights', label: 'Insights', icon: Lightbulb },
  { id: 'quickstock', label: 'Quick Stock', icon: Zap },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'gmail', label: 'Gmail Scout', icon: Mail },
]

export default function SIMobileMenu({ open, onClose, activeView, onNavigate }: SIMobileMenuProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Drawer */}
      <div className="absolute left-0 top-0 bottom-0 w-64 bg-slate-900 text-white flex flex-col">
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-700/50">
          <div>
            <p className="text-[13px] font-bold tracking-tight">Stock Intelligence</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Strategic Management</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
          {ITEMS.map(item => {
            const Icon = item.icon
            const active = activeView === item.id
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-[450] transition-colors ${
                  active
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon size={18} className={active ? 'text-emerald-400' : 'text-slate-400'} />
                {item.label}
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
