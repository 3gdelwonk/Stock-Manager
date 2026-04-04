import { Menu, Settings } from 'lucide-react'

interface SITopbarProps {
  title: string
  onMenuToggle: () => void
}

export default function SITopbar({ title, onMenuToggle }: SITopbarProps) {
  return (
    <header className="h-[50px] flex items-center px-4 bg-white border-b border-gray-200 shrink-0">
      {/* Mobile hamburger */}
      <button
        onClick={onMenuToggle}
        className="md:hidden p-1.5 -ml-1.5 mr-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
      >
        <Menu size={20} />
      </button>

      <h1 className="text-[15px] font-semibold text-gray-900">{title}</h1>

      <div className="flex-1" />

      <button className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
        <Settings size={18} />
      </button>
    </header>
  )
}
