import { Clock, Lightbulb, Zap, Calendar, Mail, Activity } from 'lucide-react'

export type SIView = 'expiry' | 'insights' | 'quickstock' | 'calendar' | 'gmail'

interface SISidebarProps {
  activeView: SIView
  onNavigate: (view: SIView) => void
}

const NAV_SECTIONS: { label: string; items: { id: SIView; label: string; icon: typeof Clock; badge?: string }[] }[] = [
  {
    label: 'MONITOR',
    items: [
      { id: 'expiry', label: 'Expiry Watch', icon: Clock },
      { id: 'insights', label: 'Insights', icon: Lightbulb, badge: 'P2' },
    ],
  },
  {
    label: 'ACTIONS',
    items: [
      { id: 'quickstock', label: 'Quick Stock', icon: Zap },
    ],
  },
  {
    label: 'PLANNING',
    items: [
      { id: 'calendar', label: 'Calendar', icon: Calendar },
      { id: 'gmail', label: 'Gmail Scout', icon: Mail, badge: 'P3' },
    ],
  },
]

export default function SISidebar({ activeView, onNavigate }: SISidebarProps) {
  return (
    <>
      {/* Full sidebar (lg+) */}
      <aside className="hidden lg:flex flex-col w-[210px] bg-slate-900 text-white shrink-0 h-full">
        {/* Brand */}
        <div className="px-4 py-4 border-b border-slate-700/50">
          <p className="text-[13px] font-bold tracking-tight">Stock Intelligence</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Strategic Management</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {NAV_SECTIONS.map(section => (
            <div key={section.label}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-2 mb-1.5">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map(item => {
                  const Icon = item.icon
                  const active = activeView === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => onNavigate(item.id)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-[450] transition-colors ${
                        active
                          ? 'bg-emerald-500/15 text-emerald-400 border-l-2 border-emerald-400'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white border-l-2 border-transparent'
                      }`}
                    >
                      <Icon size={16} className={active ? 'text-emerald-400' : 'text-slate-400'} />
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.badge && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-400">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-700/50">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <Activity size={12} className="text-emerald-400" />
            <span>Connected</span>
          </div>
        </div>
      </aside>

      {/* Icon rail (md to lg) */}
      <aside className="hidden md:flex lg:hidden flex-col items-center w-[50px] bg-slate-900 shrink-0 h-full py-3 gap-1">
        {NAV_SECTIONS.flatMap(s => s.items).map(item => {
          const Icon = item.icon
          const active = activeView === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={item.label}
              className={`p-2.5 rounded-lg transition-colors ${
                active ? 'bg-emerald-500/15 text-emerald-400' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon size={18} />
            </button>
          )
        })}
      </aside>
    </>
  )
}
