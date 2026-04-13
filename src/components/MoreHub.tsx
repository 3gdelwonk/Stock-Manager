import { Milk, type LucideIcon } from 'lucide-react'

interface Tile {
  key: string
  label: string
  sublabel: string
  icon: LucideIcon
  color: string
  bg: string
  onClick: () => void
}

const TILES: Tile[] = [
  {
    key: 'milkorder',
    label: 'Milk Order',
    sublabel: 'IGA Camberwell · Lactalis',
    icon: Milk,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    onClick: () => { window.location.href = './milkorder/' },
  },
]

export default function MoreHub() {
  return (
    <div className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Apps</p>
      <div className="grid grid-cols-2 gap-3">
        {TILES.map((tile) => {
          const Icon = tile.icon
          return (
            <button
              key={tile.key}
              onClick={tile.onClick}
              className="flex flex-col items-start gap-2 p-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 active:scale-[0.98] transition-all text-left"
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${tile.bg}`}>
                <Icon size={22} className={tile.color} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{tile.label}</p>
                <p className="text-[11px] text-gray-500 leading-tight">{tile.sublabel}</p>
              </div>
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-gray-400 mt-6 leading-snug">
        Milk Order runs as a separate app with its own database and settings. Tapping the tile opens it in a full-screen shell — use the back arrow to return here.
      </p>
    </div>
  )
}
