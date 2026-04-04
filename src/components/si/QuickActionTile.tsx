import type { LucideIcon } from 'lucide-react'

interface QuickActionTileProps {
  icon: LucideIcon
  title: string
  subtitle: string
  bgColor: string
  onClick: () => void
}

export default function QuickActionTile({ icon: Icon, title, subtitle, bgColor, onClick }: QuickActionTileProps) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-100 p-5 flex flex-col items-center gap-3 hover:shadow-md hover:border-gray-200 transition-all text-center group"
    >
      <div className={`w-12 h-12 rounded-xl ${bgColor} flex items-center justify-center group-hover:scale-105 transition-transform`}>
        <Icon size={22} className="text-gray-700" />
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>
      </div>
    </button>
  )
}
